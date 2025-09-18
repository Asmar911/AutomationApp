import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { VideoRecord } from '../types';
import { formatDateTime } from '../utils/format';
import { StatusBadge } from './StatusBadge';

interface DashboardTableProps {
  videos: VideoRecord[];
  selectedIds: string[];
  onToggleSelect: (id: string, checked: boolean) => void;
}

export const DashboardTable = ({ videos, selectedIds, onToggleSelect }: DashboardTableProps) => {
  const sorted = useMemo(
    () => [...videos].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [videos]
  );

  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th />
            <th>Video</th>
            <th>Download</th>
            <th>Transcribe</th>
            <th>Split</th>
            <th>AR</th>
            <th>TR</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((video) => {
            const isSelected = selectedIds.includes(video.id);
            return (
              <tr key={video.id}>
                <td>
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked={isSelected}
                    onChange={(event) => onToggleSelect(video.id, event.target.checked)}
                  />
                </td>
                <td>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <Link to={`/videos/${video.id}`} style={{ fontWeight: 600 }}>
                      {video.title}
                    </Link>
                    <span style={{ fontSize: 12, opacity: 0.65 }}>{video.channelTitle}</span>
                  </div>
                </td>
                <td>
                  <StatusBadge status={video.download.status} />
                </td>
                <td>
                  <StatusBadge status={video.transcription.status} />
                </td>
                <td>
                  <StatusBadge status={video.split.status} />
                </td>
                <td>
                  <StatusBadge status={video.translations.ar?.status ?? 'pending'} />
                </td>
                <td>
                  <StatusBadge status={video.translations.tr?.status ?? 'pending'} />
                </td>
                <td>{formatDateTime(video.updatedAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
