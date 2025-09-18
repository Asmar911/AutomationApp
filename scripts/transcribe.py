from __future__ import annotations

import argparse
import os
import subprocess
from pathlib import Path

import requests

from common import DATA_DIR, WorkflowContext, append_history, mark_step


def transcribe_via_api(audio_path: Path, output_path: Path, api_url: str, api_key: str) -> None:
    endpoint = api_url.rstrip('/') + '/transcribe'
    with audio_path.open('rb') as handle:
        response = requests.post(
            endpoint,
            headers={'Authorization': f'Bearer {api_key}'},
            files={'file': (audio_path.name, handle, 'audio/mpeg')},
            data={'format': 'srt'},
            timeout=600
        )
    response.raise_for_status()
    payload = response.json()
    if 'srt' in payload:
        output_path.write_text(payload['srt'], encoding='utf-8')
        return
    if 'srt_url' in payload:
        download = requests.get(payload['srt_url'], timeout=120)
        download.raise_for_status()
        output_path.write_text(download.text, encoding='utf-8')
        return
    raise RuntimeError(f'Unexpected response from Parakeet API: {payload}')


def transcribe_locally(audio_path: Path, output_path: Path, model: str) -> None:
    commands = [
        ['parakeet-transcribe', '--model', model, '--format', 'srt', '--output', str(output_path), str(audio_path)],
        ['python', '-m', 'parakeet_tdt.transcribe', '--model', model, '--format', 'srt', '--output', str(output_path), str(audio_path)]
    ]
    for command in commands:
        try:
            subprocess.run(command, check=True)
            if output_path.exists():
                return
        except FileNotFoundError:
            continue
    raise RuntimeError('Parakeet transcription tools were not found on the runner')


def main() -> None:
    parser = argparse.ArgumentParser(description='Transcribe audio using Parakeet-TDT')
    parser.add_argument('--video-id', required=True)
    parser.add_argument('--audio-path', help='Override audio path')
    parser.add_argument('--model', default='parakeet-tdt-large-v1')
    parser.add_argument('--language', default='en')
    parser.add_argument('--requested-by')
    args = parser.parse_args()

    ctx = WorkflowContext(args.video_id)
    video = ctx.video
    audio_path = Path(args.audio_path or video.get('download', {}).get('path', ''))
    if not audio_path.exists():
        raise FileNotFoundError(f'Audio file not found: {audio_path}')

    target_dir = DATA_DIR / args.video_id
    target_dir.mkdir(parents=True, exist_ok=True)
    srt_path = target_dir / f'{args.video_id}.srt'

    if video.get('transcription', {}).get('status') == 'completed':
        append_history(video, 'transcription', 'skipped', notes='Transcription already exists')
        ctx.save()
        return

    api_url = os.environ.get('PARAKEET_API_URL')
    api_key = os.environ.get('PARAKEET_API_KEY')

    try:
        if api_url and api_key:
            transcribe_via_api(audio_path, srt_path, api_url, api_key)
            engine = 'parakeet-api'
        else:
            transcribe_locally(audio_path, srt_path, args.model)
            engine = args.model
        mark_step(
            video,
            'transcription',
            'completed',
            srtPath=str(srt_path),
            engine=engine,
            notes=f'Model {engine}'
        )
        append_history(video, 'transcription', 'completed', workflow='transcribe.yml')
        if args.requested_by:
            video.setdefault('history', [])[-1]['actor'] = args.requested_by
    except Exception as exc:  # pylint: disable=broad-except
        mark_step(video, 'transcription', 'failed', notes=str(exc))
        append_history(video, 'transcription', 'failed', notes=str(exc))
        raise
    finally:
        ctx.save()


if __name__ == '__main__':
    main()
