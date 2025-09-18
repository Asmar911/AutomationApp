import { useMemo, useState } from 'react';
import type { VideoRecord, WorkflowKind } from '../types';
import { allWorkflowKinds, WORKFLOW_LABELS, isActionDisabled } from '../utils/actions';

interface BulkActionsBarProps {
  videos: VideoRecord[];
  selectedIds: string[];
  onSelectAll: (checked: boolean) => void;
  onRunBulk: (kind: WorkflowKind, videos: VideoRecord[]) => void;
  isDispatching: boolean;
}

export const BulkActionsBar = ({
  videos,
  selectedIds,
  onSelectAll,
  onRunBulk,
  isDispatching
}: BulkActionsBarProps) => {
  const [selectedAction, setSelectedAction] = useState<WorkflowKind>('download');

  const selectedVideos = useMemo(
    () => videos.filter((video) => selectedIds.includes(video.id)),
    [selectedIds, videos]
  );

  const canExecute = selectedVideos.length > 0;

  const handleExecute = () => {
    if (!canExecute) return;
    onRunBulk(
      selectedAction,
      selectedVideos.filter((video) => !isActionDisabled(selectedAction, video))
    );
  };

  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="table-toolbar">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            className="checkbox"
            checked={selectedIds.length === videos.length && videos.length > 0}
            onChange={(event) => onSelectAll(event.target.checked)}
          />
          Select all
        </label>
        <span style={{ opacity: 0.7 }}>
          {selectedIds.length} video{selectedIds.length === 1 ? '' : 's'} selected
        </span>
        <select
          value={selectedAction}
          onChange={(event) => setSelectedAction(event.target.value as WorkflowKind)}
        >
          {allWorkflowKinds.map((kind) => (
            <option key={kind} value={kind}>
              {WORKFLOW_LABELS[kind]}
            </option>
          ))}
        </select>
        <button type="button" onClick={handleExecute} disabled={!canExecute || isDispatching}>
          Run for selection
        </button>
      </div>
    </div>
  );
};
