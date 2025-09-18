from __future__ import annotations

import argparse

from common import WorkflowContext, reset_step


def main() -> None:
    parser = argparse.ArgumentParser(description='Reset a workflow step to pending')
    parser.add_argument('--video-id', required=True)
    parser.add_argument('--step', required=True)
    parser.add_argument('--requested-by')
    args = parser.parse_args()

    ctx = WorkflowContext(args.video_id)
    video = ctx.video
    reset_step(video, args.step)
    if args.requested_by:
        video.setdefault('history', [])[-1]['actor'] = args.requested_by
    ctx.save()


if __name__ == '__main__':
    main()
