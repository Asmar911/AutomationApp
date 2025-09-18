from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

from common import DATA_DIR, WorkflowContext, append_history, mark_step


def run_yt_dlp(args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(['yt-dlp', *args], check=True, capture_output=True, text=True)


def fetch_metadata(url: str) -> dict:
    result = run_yt_dlp(['--dump-single-json', url])
    return json.loads(result.stdout)


def download_audio(url: str, target_dir: Path) -> Path:
    target_dir.mkdir(parents=True, exist_ok=True)
    for existing in target_dir.glob('audio.*'):
        existing.unlink()
    output_template = str(target_dir / 'audio.%(ext)s')
    subprocess.run(
        [
            'yt-dlp',
            '-x',
            '--audio-format', 'mp3',
            '--audio-quality', '0',
            '--no-playlist',
            '-o', output_template,
            url
        ],
        check=True
    )
    candidates = list(target_dir.glob('audio.*'))
    if not candidates:
        raise RuntimeError('Audio file not created by yt-dlp')
    candidate = candidates[0]
    target = target_dir / 'audio.mp3'
    candidate.rename(target)
    return target


def main() -> None:
    parser = argparse.ArgumentParser(description='Download audio for a YouTube video')
    parser.add_argument('--url', required=True, help='YouTube video URL or ID')
    parser.add_argument('--video-id', help='Override video id')
    parser.add_argument('--channel-id', help='YouTube channel id if known')
    parser.add_argument('--force', action='store_true', help='Re-download even if already present')
    parser.add_argument('--requested-by', help='GitHub login that triggered the workflow')
    args = parser.parse_args()

    metadata = fetch_metadata(args.url)
    video_id = args.video_id or metadata.get('id')
    if not video_id:
        raise RuntimeError('Unable to determine video id from metadata')

    ctx = WorkflowContext(video_id)
    video = ctx.video

    if video.get('download', {}).get('status') == 'completed' and not args.force:
        append_history(video, 'download', 'skipped', notes='Download already completed')
        ctx.save()
        return

    try:
        audio_dir = DATA_DIR / video_id / 'audio'
        audio_path = download_audio(metadata.get('webpage_url', args.url), audio_dir)
        filesize = audio_path.stat().st_size
        video['title'] = metadata.get('title') or video.get('title') or video_id
        video['channelId'] = args.channel_id or metadata.get('channel_id')
        video['channelTitle'] = metadata.get('channel')
        video['sourceUrl'] = metadata.get('webpage_url', args.url)
        video['durationSeconds'] = metadata.get('duration')
        video.setdefault('metrics', {})['storageBytes'] = filesize
        video.setdefault('metrics', {})['runtimeSeconds'] = metadata.get('duration') or 0
        mark_step(
            video,
            'download',
            'completed',
            path=str(audio_path),
            sizeBytes=filesize,
            notes='Audio downloaded via yt-dlp'
        )
        append_history(video, 'download', 'completed', notes='Audio download finished', workflow='download.yml')
        if args.requested_by:
            video.setdefault('history', [])[-1]['actor'] = args.requested_by
    except Exception as exc:  # pylint: disable=broad-except
        mark_step(video, 'download', 'failed', notes=str(exc))
        append_history(video, 'download', 'failed', notes=str(exc))
        raise
    finally:
        ctx.save()


if __name__ == '__main__':
    main()
