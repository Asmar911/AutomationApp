import type { Analytics } from '../types';
import { formatBytes, formatDuration, formatDateTime } from '../utils/format';

interface StatsPanelProps {
  analytics?: Analytics;
}

export const StatsPanel = ({ analytics }: StatsPanelProps) => {
  if (!analytics) {
    return (
      <div className="card">
        <h2>Analytics</h2>
        <p style={{ opacity: 0.7 }}>No analytics available yet.</p>
      </div>
    );
  }

  const { totals, jobs, activeJobs } = analytics;

  return (
    <div className="card">
      <div className="flex-between" style={{ alignItems: 'flex-start' }}>
        <div>
          <h2>Automation Analytics</h2>
          <p className="hero-subtitle" style={{ marginBottom: 0 }}>
            Updated {formatDateTime(analytics?.activeJobs?.[0]?.startedAt ?? undefined)}
          </p>
        </div>
      </div>
      <div className="grid-columns" style={{ marginTop: 24 }}>
        <div className="stat-card">
          <h3>Total videos</h3>
          <strong>{totals.videos}</strong>
          <span style={{ opacity: 0.65 }}>Downloaded: {totals.downloaded}</span>
        </div>
        <div className="stat-card">
          <h3>Transcribed</h3>
          <strong>{totals.transcribed}</strong>
          <span style={{ opacity: 0.65 }}>Split: {totals.split}</span>
        </div>
        <div className="stat-card">
          <h3>Translations</h3>
          <strong>AR {totals.translatedAr} / TR {totals.translatedTr}</strong>
        </div>
        <div className="stat-card">
          <h3>Runtime processed</h3>
          <strong>{formatDuration(totals.runtimeSeconds)}</strong>
          <span style={{ opacity: 0.65 }}>Storage: {formatBytes(totals.storageBytes)}</span>
        </div>
      </div>
      <h3 style={{ marginTop: 32, textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: 12 }}>
        Workflow health
      </h3>
      <div className="grid-columns" style={{ marginTop: 16 }}>
        {Object.entries(jobs).map(([key, stat]) => (
          <div key={key} className="meta-item">
            <span className="meta-label">{key}</span>
            <span className="meta-value">
              ✅ {stat.success} · ❌ {stat.failed}
            </span>
            <span style={{ fontSize: 12, opacity: 0.7 }}>
              Last run {formatDateTime(stat.lastRunAt)}
            </span>
          </div>
        ))}
      </div>
      <h3 style={{ marginTop: 32, textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: 12 }}>
        Active jobs
      </h3>
      {activeJobs.length === 0 ? (
        <p style={{ opacity: 0.7 }}>No jobs currently running.</p>
      ) : (
        <div className="grid-columns" style={{ marginTop: 12 }}>
          {activeJobs.map((job) => (
            <div key={job.id} className="meta-item">
              <span className="meta-label">{job.step}</span>
              <span className="meta-value">Video {job.videoId}</span>
              <span style={{ fontSize: 12, opacity: 0.7 }}>
                Started {formatDateTime(job.startedAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
