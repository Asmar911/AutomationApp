from __future__ import annotations

import argparse
import os
from pathlib import Path
from typing import Tuple

import requests

from common import DATA_DIR, WorkflowContext, append_history, utcnow


LANGUAGE_NAMES = {'ar': 'Arabic', 'tr': 'Turkish'}


def call_openrouter(prompt: str, api_key: str, model: str) -> Tuple[str, dict]:
    response = requests.post(
        'https://openrouter.ai/api/v1/chat/completions',
        headers={
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json'
        },
        json={
            'model': model,
            'messages': [
                {
                    'role': 'system',
                    'content': 'You translate SRT subtitles while keeping timecodes intact.'
                },
                {
                    'role': 'user',
                    'content': prompt
                }
            ],
            'max_tokens': 4096,
            'temperature': 0.3
        },
        timeout=240
    )
    response.raise_for_status()
    payload = response.json()
    text = payload['choices'][0]['message']['content']
    usage = payload.get('usage', {})
    return text, usage


def translate_text(text: str, language: str, api_key: str, model: str) -> Tuple[str, dict]:
    prompt = (
        f"Translate the following SRT subtitles into {LANGUAGE_NAMES.get(language, language)}. "
        "Preserve the subtitle numbering and timestamps. Only return the translated SRT text.\n\n" + text
    )
    return call_openrouter(prompt, api_key, model)


def main() -> None:
    parser = argparse.ArgumentParser(description='Translate subtitles via OpenRouter')
    parser.add_argument('--video-id', required=True)
    parser.add_argument('--language', required=True, choices=['ar', 'tr'])
    parser.add_argument('--mode', choices=['auto', 'full', 'parts'], default='auto')
    parser.add_argument('--model', default='openrouter/anthropic/claude-3-haiku')
    parser.add_argument('--requested-by')
    args = parser.parse_args()

    api_key = os.environ.get('OPENROUTER_API_KEY')
    if not api_key:
        raise EnvironmentError('OPENROUTER_API_KEY is not configured')

    ctx = WorkflowContext(args.video_id)
    video = ctx.video
    language = args.language

    translations = video.setdefault('translations', {})
    existing = translations.get(language)
    if existing and existing.get('status') == 'completed':
        append_history(video, f'translate-{language}', 'skipped', notes='Translation already exists')
        ctx.save()
        return

    transcript_path = Path(video.get('transcription', {}).get('srtPath', ''))
    if not transcript_path.exists():
        raise FileNotFoundError('Base transcript missing; run transcription first')

    parts_dir = DATA_DIR / args.video_id / 'parts'
    translations_dir = DATA_DIR / args.video_id / 'translations'
    translations_dir.mkdir(parents=True, exist_ok=True)

    mode = args.mode
    if mode == 'auto':
        mode = 'parts' if video.get('split', {}).get('status') == 'completed' and video['split'].get('parts') else 'full'

    usage_totals = {'prompt_tokens': 0, 'completion_tokens': 0}

    try:
        target_path = translations_dir / f'{language}.srt'
        if mode == 'full':
            text = transcript_path.read_text(encoding='utf-8')
            translated, usage = translate_text(text, language, api_key, args.model)
            target_path.write_text(translated, encoding='utf-8')
            usage_totals['prompt_tokens'] += usage.get('prompt_tokens', 0)
            usage_totals['completion_tokens'] += usage.get('completion_tokens', 0)
        else:
            combined_segments = []
            for part in video.get('split', {}).get('parts', []):
                part_path = Path(part['srtPath'])
                if not part_path.exists():
                    continue
                text = part_path.read_text(encoding='utf-8')
                translated, usage = translate_text(text, language, api_key, args.model)
                segment_path = parts_dir / f"{Path(part['srtPath']).stem}.{language}.srt"
                segment_path.write_text(translated, encoding='utf-8')
                combined_segments.append(translated)
                usage_totals['prompt_tokens'] += usage.get('prompt_tokens', 0)
                usage_totals['completion_tokens'] += usage.get('completion_tokens', 0)
            if combined_segments:
                target_path.write_text('\n\n'.join(combined_segments), encoding='utf-8')
        translations[language] = {
            'status': 'completed',
            'updatedAt': utcnow(),
            'srtPath': str(target_path),
            'language': language,
            'notes': f'Translated via {args.model}',
            'tokenUsage': {
                'promptTokens': usage_totals['prompt_tokens'],
                'completionTokens': usage_totals['completion_tokens']
            }
        }
        append_history(video, f'translate-{language}', 'completed', workflow='translate.yml')
        if args.requested_by:
            video.setdefault('history', [])[-1]['actor'] = args.requested_by
    except Exception as exc:  # pylint: disable=broad-except
        translations[language] = {
            'status': 'failed',
            'language': language,
            'updatedAt': utcnow(),
            'notes': str(exc)
        }
        append_history(video, f'translate-{language}', 'failed', notes=str(exc))
        raise
    finally:
        ctx.save()


if __name__ == '__main__':
    main()
