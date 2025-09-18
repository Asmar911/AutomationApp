export type StepStatus = 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'skipped';

export interface StepInfo {
  status: StepStatus;
  updatedAt?: string;
  startedAt?: string;
  path?: string;
  notes?: string;
  sizeBytes?: number;
  durationSeconds?: number;
  engine?: string;
  attempts?: number;
  checksum?: string;
}

export interface SplitPart {
  id: string;
  label: string;
  start: number;
  end: number;
  srtPath: string;
  summary?: string;
}

export interface SplitInfo extends StepInfo {
  parts: SplitPart[];
  callsPath?: string;
}

export interface TranslationInfo extends StepInfo {
  srtPath?: string;
  language: 'ar' | 'tr';
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    costUsd?: number;
  };
}

export interface HistoryEntry {
  timestamp: string;
  event: string;
  status: StepStatus;
  actor?: string;
  workflow?: string;
  notes?: string;
}

export interface VideoRecord {
  id: string;
  title: string;
  channelId?: string;
  channelTitle?: string;
  sourceUrl?: string;
  durationSeconds?: number;
  publishedAt?: string;
  thumbnailUrl?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  download: StepInfo;
  transcription: StepInfo & { srtPath?: string };
  split: SplitInfo;
  translations: {
    ar?: TranslationInfo;
    tr?: TranslationInfo;
  };
  metrics?: {
    storageBytes?: number;
    runtimeSeconds?: number;
    parts?: number;
  };
  history: HistoryEntry[];
  lastError?: {
    step: string;
    message: string;
    occurredAt: string;
  } | null;
}

export interface JobStat {
  lastRunAt?: string;
  success: number;
  failed: number;
  running: number;
  queued: number;
  averageSeconds?: number;
}

export interface Analytics {
  totals: {
    videos: number;
    downloaded: number;
    transcribed: number;
    split: number;
    translatedAr: number;
    translatedTr: number;
    runtimeSeconds: number;
    storageBytes: number;
  };
  jobs: Record<string, JobStat>;
  activeJobs: Array<{
    id: string;
    videoId: string;
    step: string;
    startedAt: string;
    actor?: string;
  }>;
}

export interface Database {
  version: number;
  updatedAt: string;
  videos: VideoRecord[];
  analytics: Analytics;
}

export interface DeviceFlowInfo {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
  message?: string;
}

export interface GithubUser {
  id: number;
  login: string;
  avatar_url: string;
  html_url: string;
  name?: string;
  email?: string;
}

export type WorkflowKind =
  | 'download'
  | 'transcribe'
  | 'split'
  | 'translate-ar'
  | 'translate-tr'
  | 'delete'
  | 'reset-step';

export interface WorkflowPayload {
  videoId: string;
  channelId?: string;
  sourceUrl?: string;
  language?: 'ar' | 'tr';
  force?: boolean;
  resetStep?: string;
  requestedBy?: string;
  metadata?: Record<string, unknown>;
}
