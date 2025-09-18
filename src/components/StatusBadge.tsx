import { formatStatus, getStatusColor } from '../utils/format';
import type { StepStatus } from '../types';

export const StatusBadge = ({ status }: { status: StepStatus }) => (
  <span className={`status-badge ${getStatusColor(status)}`}>{formatStatus(status)}</span>
);
