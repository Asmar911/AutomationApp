from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

DB_PATH = Path('db/index.json')
DATA_DIR = Path('data')

ISO_FORMAT = '%Y-%m-%dT%H:%M:%SZ'

logging.basicConfig(level=logging.INFO, format='[%(levelname)s] %(message)s')


def utcnow() -> str:
    return datetime.now(timezone.utc).strftime(ISO_FORMAT)


def load_db() -> Dict:
    if not DB_PATH.exists():
        logging.warning('db/index.json not found, creating a fresh database')
        return {
            'version': 1,
            'updatedAt': utcnow(),
            'videos': [],
            'analytics': {
                'totals': {
                    'videos': 0,
                    'downloaded': 0,
                    'transcribed': 0,
                    'split': 0,
                    'translatedAr': 0,
                    'translatedTr': 0,
                    'runtimeSeconds': 0,
                    'storageBytes': 0
                },
                'jobs': {},
                'activeJobs': []
            }
        }
    with DB_PATH.open('r', encoding='utf-8') as handle:
        return json.load(handle)


def save_db(db: Dict) -> None:
    db['updatedAt'] = utcnow()
    db['analytics'] = compute_analytics(db['videos'])
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with DB_PATH.open('w', encoding='utf-8') as handle:
        json.dump(db, handle, indent=2, ensure_ascii=False)
        handle.write('\n')


def compute_analytics(videos: List[Dict]) -> Dict:
    totals = {
        'videos': len(videos),
        'downloaded': 0,
        'transcribed': 0,
        'split': 0,
        'translatedAr': 0,
        'translatedTr': 0,
        'runtimeSeconds': 0,
        'storageBytes': 0
    }
    jobs: Dict[str, Dict] = {
        'download': default_job_stat(),
        'transcribe': default_job_stat(),
        'split': default_job_stat(),
        'translate-ar': default_job_stat(),
        'translate-tr': default_job_stat(),
        'delete': default_job_stat()
    }

    for video in videos:
        if video.get('download', {}).get('status') == 'completed':
            totals['downloaded'] += 1
            update_job_from_step(jobs['download'], video['download'])
        if video.get('transcription', {}).get('status') == 'completed':
            totals['transcribed'] += 1
            update_job_from_step(jobs['transcribe'], video['transcription'])
        if video.get('split', {}).get('status') == 'completed':
            totals['split'] += 1
            update_job_from_step(jobs['split'], video['split'])
        translations = video.get('translations', {})
        if translations.get('ar', {}).get('status') == 'completed':
            totals['translatedAr'] += 1
            update_job_from_step(jobs['translate-ar'], translations['ar'])
        if translations.get('tr', {}).get('status') == 'completed':
            totals['translatedTr'] += 1
            update_job_from_step(jobs['translate-tr'], translations['tr'])
        metrics = video.get('metrics', {})
        totals['runtimeSeconds'] += metrics.get('runtimeSeconds', 0) or 0
        totals['storageBytes'] += metrics.get('storageBytes', 0) or 0

    return {
        'totals': totals,
        'jobs': jobs,
        'activeJobs': []
    }


def default_job_stat() -> Dict:
    return {'lastRunAt': None, 'success': 0, 'failed': 0, 'running': 0, 'queued': 0}


def update_job_from_step(job: Dict, step: Dict) -> None:
    job['lastRunAt'] = step.get('updatedAt') or job.get('lastRunAt')
    if step.get('status') == 'completed':
        job['success'] = job.get('success', 0) + 1
    if step.get('status') == 'failed':
        job['failed'] = job.get('failed', 0) + 1


def ensure_video(db: Dict, video_id: str) -> Dict:
    for video in db.get('videos', []):
        if video['id'] == video_id:
            return video
    video = {
        'id': video_id,
        'title': video_id,
        'createdAt': utcnow(),
        'updatedAt': utcnow(),
        'download': {'status': 'pending'},
        'transcription': {'status': 'pending'},
        'split': {'status': 'pending', 'parts': []},
        'translations': {},
        'history': []
    }
    db.setdefault('videos', []).append(video)
    return video


def append_history(
    video: Dict,
    event: str,
    status: str,
    notes: Optional[str] = None,
    workflow: Optional[str] = None
) -> None:
    video.setdefault('history', []).append(
        {
            'timestamp': utcnow(),
            'event': event,
            'status': status,
            'workflow': workflow,
            'notes': notes
        }
    )


def mark_step(video: Dict, step_name: str, status: str, **fields) -> None:
    step = video.setdefault(step_name, {})
    step.update({'status': status, 'updatedAt': utcnow(), **fields})
    video['updatedAt'] = utcnow()


def reset_step(video: Dict, step_key: str) -> None:
    if step_key == 'download':
        video['download'] = {'status': 'pending'}
    elif step_key == 'transcription':
        video['transcription'] = {'status': 'pending'}
    elif step_key == 'split':
        video['split'] = {'status': 'pending', 'parts': []}
    elif step_key == 'translations.ar':
        video.setdefault('translations', {}).pop('ar', None)
    elif step_key == 'translations.tr':
        video.setdefault('translations', {}).pop('tr', None)
    else:
        logging.warning('Unknown step key %s', step_key)
    append_history(video, f'reset:{step_key}', 'pending', notes='Step manually reset')


@dataclass
class WorkflowContext:
    video_id: str
    db: Dict = field(default_factory=load_db)
    video: Dict = field(init=False)

    def __post_init__(self) -> None:
        self.video = ensure_video(self.db, self.video_id)

    def save(self) -> None:
        save_db(self.db)


__all__ = [
    'DATA_DIR',
    'DB_PATH',
    'WorkflowContext',
    'append_history',
    'ensure_video',
    'mark_step',
    'reset_step',
    'save_db',
    'load_db',
    'compute_analytics',
    'utcnow'
]
