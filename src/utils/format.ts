export const formatDateTime = (iso?: string) => {
  if (!iso) return '—';
  try {
    const date = new Date(iso);
    return date.toLocaleString();
  } catch (err) {
    return iso;
  }
};

export const formatDuration = (seconds?: number) => {
  if (!seconds && seconds !== 0) return '—';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const parts = [
    hrs > 0 ? `${hrs}h` : null,
    mins > 0 ? `${mins}m` : null,
    `${secs}s`
  ].filter(Boolean);
  return parts.join(' ');
};

export const formatBytes = (bytes?: number) => {
  if (!bytes && bytes !== 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

export const formatStatus = (status: string) => {
  switch (status) {
    case 'completed':
      return 'Completed';
    case 'running':
      return 'Running';
    case 'queued':
      return 'Queued';
    case 'failed':
      return 'Failed';
    case 'pending':
      return 'Pending';
    case 'skipped':
      return 'Skipped';
    default:
      return status;
  }
};

export const getStatusColor = (status: string) => {
  switch (status) {
    case 'completed':
      return 'status-completed';
    case 'running':
      return 'status-running';
    case 'queued':
      return 'status-queued';
    case 'failed':
      return 'status-failed';
    case 'pending':
    default:
      return 'status-pending';
  }
};
