from __future__ import annotations

import argparse
import shutil

from common import DATA_DIR, load_db, save_db, append_history


def main() -> None:
    parser = argparse.ArgumentParser(description='Delete all artefacts for a video')
    parser.add_argument('--video-id', required=True)
    parser.add_argument('--requested-by')
    args = parser.parse_args()

    db = load_db()
    videos = db.get('videos', [])
    video = next((item for item in videos if item['id'] == args.video_id), None)
    if not video:
        return

    target_dir = DATA_DIR / args.video_id
    if target_dir.exists():
        shutil.rmtree(target_dir)

    video['download'] = {'status': 'pending'}
    video['transcription'] = {'status': 'pending'}
    video['split'] = {'status': 'pending', 'parts': []}
    video['translations'] = {}
    video['metrics'] = {'storageBytes': 0, 'runtimeSeconds': video.get('durationSeconds', 0), 'parts': 0}
    append_history(video, 'delete', 'completed', notes='Assets removed', workflow='delete.yml')
    if args.requested_by:
        video.setdefault('history', [])[-1]['actor'] = args.requested_by

    save_db(db)


if __name__ == '__main__':
    main()
