import { useMemo, useState } from 'react';
import type { VideoRecord, WorkflowKind } from '../types';
import { WORKFLOW_LABELS, allWorkflowKinds, isActionDisabled } from '../utils/actions';

interface VideoActionsBarProps {
  video: VideoRecord;
  onRun: (kind: WorkflowKind, overrides?: Record<string, unknown>) => Promise<void>;
  isDispatching: boolean;
}

const resettableSteps: { label: string; key: string }[] = [
  { label: 'Download', key: 'download' },
  { label: 'Transcription', key: 'transcription' },
  { label: 'Split', key: 'split' },
  { label: 'Arabic translation', key: 'translations.ar' },
  { label: 'Turkish translation', key: 'translations.tr' }
];

export const VideoActionsBar = ({ video, onRun, isDispatching }: VideoActionsBarProps) => {
  const [resetTarget, setResetTarget] = useState('download');
  const actions = useMemo(() => allWorkflowKinds, []);

  const handleRunAll = async () => {
    for (const kind of actions) {
      if (isActionDisabled(kind, video)) continue;
      await onRun(kind);
    }
  };

  return (
    <div className="card">
      <h2>Workflow controls</h2>
      <div className="tab-list" style={{ flexWrap: 'wrap' }}>
        {actions.map((kind) => (
          <button
            key={kind}
            type="button"
            className={isActionDisabled(kind, video) ? '' : 'active'}
            onClick={() => onRun(kind)}
            disabled={isActionDisabled(kind, video) || isDispatching}
          >
            {WORKFLOW_LABELS[kind]}
          </button>
        ))}
      </div>
      <div className="flex-between" style={{ marginTop: 16 }}>
        <button type="button" onClick={handleRunAll} disabled={isDispatching}>
          Run all remaining steps
        </button>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={resetTarget} onChange={(event) => setResetTarget(event.target.value)}>
            {resettableSteps.map((step) => (
              <option key={step.key} value={step.key}>
                Reset {step.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onRun('reset-step', { resetStep: resetTarget })}
            disabled={isDispatching}
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
};
