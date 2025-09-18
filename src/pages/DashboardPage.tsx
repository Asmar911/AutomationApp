import { useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { BulkActionsBar } from '../components/BulkActionsBar';
import { DashboardTable } from '../components/DashboardTable';
import { StatsPanel } from '../components/StatsPanel';
import type { VideoRecord, WorkflowKind } from '../types';

const STATUS_FILTERS = [
  { value: 'all', label: 'All videos' },
  { value: 'downloaded', label: 'Downloaded' },
  { value: 'transcribed', label: 'Transcribed' },
  { value: 'split', label: 'Split' },
  { value: 'ar', label: 'Arabic translated' },
  { value: 'tr', label: 'Turkish translated' },
  { value: 'failed', label: 'Has failure' }
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]['value'];

const matchesStatus = (video: VideoRecord, filter: StatusFilter) => {
  switch (filter) {
    case 'downloaded':
      return video.download.status === 'completed';
    case 'transcribed':
      return video.transcription.status === 'completed';
    case 'split':
      return video.split.status === 'completed';
    case 'ar':
      return video.translations.ar?.status === 'completed';
    case 'tr':
      return video.translations.tr?.status === 'completed';
    case 'failed':
      return (
        video.download.status === 'failed' ||
        video.transcription.status === 'failed' ||
        video.split.status === 'failed' ||
        video.translations.ar?.status === 'failed' ||
        video.translations.tr?.status === 'failed'
      );
    case 'all':
    default:
      return true;
  }
};

export const DashboardPage = () => {
  const { database, loading, error, refreshing, runBulkWorkflow, dispatching, dispatchError } = useData();
  const videos = database?.videos ?? [];
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const channels = useMemo(() => {
    const unique = new Set<string>();
    videos.forEach((video) => {
      if (video.channelTitle) unique.add(video.channelTitle);
    });
    return ['all', ...Array.from(unique).sort()];
  }, [videos]);

  const filteredVideos = useMemo(() => {
    const lowerQuery = query.toLowerCase();
    return videos.filter((video) => {
      const matchesQuery =
        !lowerQuery ||
        video.title.toLowerCase().includes(lowerQuery) ||
        video.id.toLowerCase().includes(lowerQuery) ||
        (video.channelTitle?.toLowerCase().includes(lowerQuery) ?? false);
      const matchesStatusFilter = matchesStatus(video, statusFilter);
      const matchesChannel = channelFilter === 'all' || video.channelTitle === channelFilter;
      return matchesQuery && matchesStatusFilter && matchesChannel;
    });
  }, [channelFilter, query, statusFilter, videos]);

  const toggleSelect = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      if (checked) {
        return Array.from(new Set([...prev, id]));
      }
      return prev.filter((item) => item !== id);
    });
  };

  const selectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(filteredVideos.map((video) => video.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleBulk = async (kind: WorkflowKind, items: VideoRecord[]) => {
    await runBulkWorkflow(kind, items);
  };

  return (
    <div className="app-shell">
      <header>
        <h1 className="hero-title">Automation Control Center</h1>
        <p className="hero-subtitle">
          Monitor downloads, transcripts, translations and more in one secure dashboard.
        </p>
      </header>
      {error && <div className="alert-error">{error}</div>}
      {dispatchError && <div className="alert-error">{dispatchError}</div>}
      <div className="card">
        <div className="table-toolbar">
          <input
            type="search"
            placeholder="Search by title, channel or ID"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            style={{ flex: 1, minWidth: 200 }}
          />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
            {STATUS_FILTERS.map((filter) => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>
          <select value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)}>
            {channels.map((channel) => (
              <option key={channel} value={channel}>
                {channel === 'all' ? 'All channels' : channel}
              </option>
            ))}
          </select>
          {refreshing && <span className="badge">Refreshing…</span>}
        </div>
        {loading ? (
          <p style={{ opacity: 0.7 }}>Loading database…</p>
        ) : (
          <DashboardTable videos={filteredVideos} selectedIds={selectedIds} onToggleSelect={toggleSelect} />
        )}
      </div>
      <BulkActionsBar
        videos={filteredVideos}
        selectedIds={selectedIds}
        onSelectAll={selectAll}
        onRunBulk={handleBulk}
        isDispatching={dispatching}
      />
      <StatsPanel analytics={database?.analytics} />
    </div>
  );
};
