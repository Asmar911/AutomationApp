import { WorkflowKind, WorkflowPayload, VideoRecord } from '../types';

export const workflowEventNames: Record<WorkflowKind, string> = {
  download: 'download',
  transcribe: 'transcribe',
  split: 'split',
  'translate-ar': 'translate-ar',
  'translate-tr': 'translate-tr',
  delete: 'delete',
  'reset-step': 'reset-step'
};

export const buildPayload = (
  kind: WorkflowKind,
  video: VideoRecord,
  overrides: Partial<WorkflowPayload> = {}
): WorkflowPayload => {
  const base: WorkflowPayload = {
    videoId: video.id,
    sourceUrl: video.sourceUrl,
    channelId: video.channelId,
    requestedBy: undefined
  };

  if (kind === 'translate-ar') {
    base.language = 'ar';
  }
  if (kind === 'translate-tr') {
    base.language = 'tr';
  }

  return { ...base, ...overrides };
};

export const isActionDisabled = (kind: WorkflowKind, video: VideoRecord) => {
  switch (kind) {
    case 'download':
      return video.download.status === 'completed';
    case 'transcribe':
      return video.transcription.status === 'completed';
    case 'split':
      return video.split.status === 'completed' && video.split.parts.length > 0;
    case 'translate-ar':
      return Boolean(video.translations.ar && video.translations.ar.status === 'completed');
    case 'translate-tr':
      return Boolean(video.translations.tr && video.translations.tr.status === 'completed');
    case 'delete':
      return false;
    case 'reset-step':
      return false;
    default:
      return false;
  }
};

export const WORKFLOW_LABELS: Record<WorkflowKind, string> = {
  download: 'Download',
  transcribe: 'Transcribe',
  split: 'Split Calls',
  'translate-ar': 'Translate (AR)',
  'translate-tr': 'Translate (TR)',
  delete: 'Delete Assets',
  'reset-step': 'Reset Step'
};

export const allWorkflowKinds: WorkflowKind[] = [
  'download',
  'transcribe',
  'split',
  'translate-ar',
  'translate-tr',
  'delete'
];
