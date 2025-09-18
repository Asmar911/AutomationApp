import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { StatusBadge } from '../components/StatusBadge';
import { VideoActionsBar } from '../components/VideoActionsBar';
import { SubtitlePlayer } from '../components/SubtitlePlayer';
import { formatBytes, formatDateTime, formatDuration } from '../utils/format';
import type { WorkflowKind } from '../types';

const toRawUrl = (owner: string, repo: string, branch: string, path?: string) =>
  path ? `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}` : undefined;

export const VideoDetailPage = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { database, runWorkflow, dispatching } = useData();
  const { repo } = useAuth();
  const video = useMemo(() => database?.videos.find((item) => item.id === id), [database, id]);

  if (!video) {
    return (
      <div className="card">
        <h2>Video not found</h2>
        <p style={{ opacity: 0.7 }}>We could not find the requested video in the database.</p>
        <button type="button" onClick={() => navigate('/')}>Back to dashboard</button>
      </div>
    );
  }

  const handleRun = async (kind: WorkflowKind, overrides?: Record<string, unknown>) => {
    await runWorkflow(kind, video, overrides);
  };

  const buildRaw = (path?: string) => toRawUrl(repo.owner, repo.name, repo.defaultBranch, path);

  return (
    <div className="app-shell">
      <Link to="/" style={{ textDecoration: 'none', opacity: 0.7 }}>
        ← Back to dashboard
      </Link>
      <div className="card">
        <h1 className="hero-title">{video.title}</h1>
        <p className="hero-subtitle">
          {video.channelTitle} · Updated {formatDateTime(video.updatedAt)}
        </p>
        <div className="meta-grid">
          <div className="meta-item">
            <span className="meta-label">Video ID</span>
            <span className="meta-value">{video.id}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Source URL</span>
            <a className="meta-value" href={video.sourceUrl} target="_blank" rel="noreferrer">
              {video.sourceUrl?.slice(0, 60) ?? 'Unknown'}
            </a>
          </div>
          <div className="meta-item">
            <span className="meta-label">Duration</span>
            <span className="meta-value">{formatDuration(video.durationSeconds)}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Storage used</span>
            <span className="meta-value">{formatBytes(video.metrics?.storageBytes)}</span>
          </div>
        </div>
      </div>
      <VideoActionsBar video={video} onRun={handleRun} isDispatching={dispatching} />
      <div className="video-detail-grid">
        <div className="card">
          <h2>Workflow status</h2>
          <div className="grid-columns">
            <div className="meta-item">
              <span className="meta-label">Download</span>
              <StatusBadge status={video.download.status} />
              <span style={{ fontSize: 12, opacity: 0.7 }}>Updated {formatDateTime(video.download.updatedAt)}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Transcription</span>
              <StatusBadge status={video.transcription.status} />
              <span style={{ fontSize: 12, opacity: 0.7 }}>
                Updated {formatDateTime(video.transcription.updatedAt)}
              </span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Split</span>
              <StatusBadge status={video.split.status} />
              <span style={{ fontSize: 12, opacity: 0.7 }}>Updated {formatDateTime(video.split.updatedAt)}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Arabic</span>
              <StatusBadge status={video.translations.ar?.status ?? 'pending'} />
              <span style={{ fontSize: 12, opacity: 0.7 }}>
                Updated {formatDateTime(video.translations.ar?.updatedAt)}
              </span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Turkish</span>
              <StatusBadge status={video.translations.tr?.status ?? 'pending'} />
              <span style={{ fontSize: 12, opacity: 0.7 }}>
                Updated {formatDateTime(video.translations.tr?.updatedAt)}
              </span>
            </div>
          </div>
          {video.lastError && (
            <div className="alert-error" style={{ marginTop: 16 }}>
              Last error on {video.lastError.step}: {video.lastError.message} ·{' '}
              {formatDateTime(video.lastError.occurredAt)}
            </div>
          )}
        </div>
        <SubtitlePlayer
          videoId={video.id}
          title={video.title}
          audioPath={video.download.path}
          subtitlePath={video.transcription.srtPath}
        />
      </div>
      <div className="card">
        <h2>Split parts</h2>
        {video.split.parts.length === 0 ? (
          <p style={{ opacity: 0.7 }}>No split calls detected yet.</p>
        ) : (
          <div className="grid-columns">
            {video.split.parts.map((part) => (
              <div key={part.id} className="part-card">
                <span className="meta-label">{part.label}</span>
                <span className="meta-value">
                  {formatDuration(part.start)} → {formatDuration(part.end)}
                </span>
                <span style={{ fontSize: 12, opacity: 0.7 }}>{part.summary ?? '—'}</span>
                {part.srtPath ? (
                  <a href={buildRaw(part.srtPath)} target="_blank" rel="noreferrer" style={{ opacity: 0.8 }}>
                    Open SRT
                  </a>
                ) : (
                  <span style={{ opacity: 0.6 }}>No SRT</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="card">
        <h2>History</h2>
        {video.history.length === 0 ? (
          <p style={{ opacity: 0.7 }}>No history recorded for this video yet.</p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Event</th>
                  <th>Status</th>
                  <th>Actor</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {video.history.map((entry) => (
                  <tr key={`${entry.timestamp}-${entry.event}`}>
                    <td>{formatDateTime(entry.timestamp)}</td>
                    <td>{entry.event}</td>
                    <td>
                      <StatusBadge status={entry.status} />
                    </td>
                    <td>{entry.actor ?? '—'}</td>
                    <td>{entry.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="card">
        <h2>Translations</h2>
        <div className="grid-columns">
          {['ar', 'tr'].map((lang) => {
            const translation = video.translations[lang as 'ar' | 'tr'];
            return (
              <div key={lang} className="part-card">
                <span className="meta-label">{lang === 'ar' ? 'Arabic' : 'Turkish'}</span>
                <StatusBadge status={translation?.status ?? 'pending'} />
                <span style={{ fontSize: 12, opacity: 0.7 }}>
                  Updated {formatDateTime(translation?.updatedAt)}
                </span>
                {translation?.srtPath ? (
                  <a href={buildRaw(translation.srtPath)} target="_blank" rel="noreferrer" style={{ opacity: 0.8 }}>
                    Download subtitles
                  </a>
                ) : (
                  <span style={{ opacity: 0.6 }}>No translation file</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
