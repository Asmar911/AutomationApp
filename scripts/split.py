from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import List

import requests

from common import DATA_DIR, WorkflowContext, append_history, mark_step


class Cue:
    def __init__(self, index: int, start: float, end: float, text: str) -> None:
        self.index = index
        self.start = start
        self.end = end
        self.text = text


def parse_srt(path: Path) -> List[Cue]:
    content = path.read_text(encoding='utf-8')
    blocks = [block.strip() for block in content.replace('\r', '').split('\n\n') if block.strip()]
    cues: List[Cue] = []
    for block in blocks:
        lines = block.split('\n')
        if len(lines) < 3:
            continue
        try:
            index = int(lines[0])
        except ValueError:
            index = len(cues) + 1
        start_raw, end_raw = [item.strip() for item in lines[1].split(' --> ')]
        text = '\n'.join(lines[2:])
        cues.append(Cue(index, parse_timestamp(start_raw), parse_timestamp(end_raw), text))
    return cues


def parse_timestamp(value: str) -> float:
    time_part, ms = value.split(',')
    hours, minutes, seconds = [int(part) for part in time_part.split(':')]
    return hours * 3600 + minutes * 60 + seconds + int(ms) / 1000


def format_timestamp(seconds: float) -> str:
    hrs = int(seconds // 3600)
    mins = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    ms = int(round((seconds - int(seconds)) * 1000))
    return f"{hrs:02d}:{mins:02d}:{secs:02d},{ms:03d}"


def write_srt(cues: List[Cue], path: Path) -> None:
    lines = []
    for i, cue in enumerate(cues, start=1):
        lines.append(str(i))
        lines.append(f"{format_timestamp(cue.start)} --> {format_timestamp(cue.end)}")
        lines.append(cue.text)
        lines.append('')
    path.write_text('\n'.join(lines).strip() + '\n', encoding='utf-8')


def chunk_cues(cues: List[Cue], max_duration: float = 420.0, max_lines: int = 60) -> List[List[Cue]]:
    if not cues:
        return []
    batches: List[List[Cue]] = []
    current: List[Cue] = []
    block_start = cues[0].start
    for cue in cues:
        current.append(cue)
        if (
            cue.end - block_start >= max_duration
            or len(current) >= max_lines
            or (current and cue.text.endswith(('?', '!', '.')) and cue.end - block_start >= max_duration * 0.75)
        ):
            batches.append(current)
            current = []
            block_start = cue.end
    if current:
        batches.append(current)
    return batches


def build_summary(text: str, language: str = 'en') -> str:
    sentences = [sentence.strip() for sentence in text.replace('\n', ' ').split('.') if sentence.strip()]
    summary = '. '.join(sentences[:2])
    if not summary:
        summary = text[:140]
    if language != 'en':
        return summary
    return summary + ('...' if not summary.endswith('.') else '')


def refine_summary(summary: str, transcript: str, language: str) -> str:
    api_key = os.environ.get('OPENROUTER_API_KEY')
    model = os.environ.get('OPENROUTER_MODEL', 'openrouter/anthropic/claude-3-haiku')
    if not api_key:
        return summary
    prompt = (
        'You are a helpful assistant that creates concise call summaries. '
        'Summarise the following transcript chunk into one sentence focusing on the key decision or topic.'
    )
    payload = {
        'model': model,
        'messages': [
            {'role': 'system', 'content': prompt},
            {'role': 'user', 'content': f'Transcript:\n{transcript}\nSummary language: {language}\n'}
        ],
        'max_tokens': 120,
        'temperature': 0.3
    }
    response = requests.post(
        'https://openrouter.ai/api/v1/chat/completions',
        headers={
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json'
        },
        json=payload,
        timeout=120
    )
    if response.status_code >= 400:
        return summary
    data = response.json()
    try:
        message = data['choices'][0]['message']['content']
        if message:
            return message.strip()
    except (KeyError, IndexError):
        return summary
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description='Split a transcript into logical parts')
    parser.add_argument('--video-id', required=True)
    parser.add_argument('--srt-path')
    parser.add_argument('--language', default='en')
    parser.add_argument('--max-duration', type=float, default=420.0)
    parser.add_argument('--requested-by')
    args = parser.parse_args()

    ctx = WorkflowContext(args.video_id)
    video = ctx.video
    srt_path = Path(args.srt_path or video.get('transcription', {}).get('srtPath', ''))
    if not srt_path.exists():
        raise FileNotFoundError(f'Transcript not found: {srt_path}')

    parts_dir = DATA_DIR / args.video_id / 'parts'
    parts_dir.mkdir(parents=True, exist_ok=True)
    calls_path = parts_dir / 'calls.jsonl'

    try:
        cues = parse_srt(srt_path)
        batches = chunk_cues(cues, max_duration=args.max_duration)
        parts = []
        with calls_path.open('w', encoding='utf-8') as handle:
            for index, batch in enumerate(batches, start=1):
                part_id = f'part-{index}'
                part_path = parts_dir / f'{part_id}.srt'
                write_srt(batch, part_path)
                raw_text = ' '.join(cue.text for cue in batch)
                summary = refine_summary(build_summary(raw_text, args.language), raw_text, args.language)
                record = {
                    'id': part_id,
                    'label': summary[:120],
                    'start': batch[0].start,
                    'end': batch[-1].end,
                    'srtPath': str(part_path)
                }
                parts.append(record)
                handle.write(json.dumps({**record, 'summary': summary}, ensure_ascii=False) + '\n')
        mark_step(
            video,
            'split',
            'completed',
            parts=parts,
            callsPath=str(calls_path),
            notes=f'{len(parts)} parts created'
        )
        append_history(video, 'split', 'completed', workflow='split.yml', notes=f'{len(parts)} segments')
        if args.requested_by:
            video.setdefault('history', [])[-1]['actor'] = args.requested_by
    except Exception as exc:  # pylint: disable=broad-except
        mark_step(video, 'split', 'failed', notes=str(exc))
        append_history(video, 'split', 'failed', notes=str(exc))
        raise
    finally:
        ctx.save()


if __name__ == '__main__':
    main()
