import React from 'https://esm.sh/react@18.2.0';
import { createRoot } from 'https://esm.sh/react-dom@18.2.0/client';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Link,
  useNavigate,
  useParams
} from 'https://esm.sh/react-router-dom@6.22.3';
import htm from 'https://esm.sh/htm@3.1.1';

const {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  useContext,
  createContext,
  StrictMode
} = React;

const html = htm.bind(React.createElement);

const APP_CONFIG = globalThis.__APP_CONFIG__ || {};
const metaEnv = typeof import.meta !== 'undefined' && import.meta ? import.meta.env || {} : {};
const getEnv = (key, fallback = '') => {
  if (metaEnv && Object.prototype.hasOwnProperty.call(metaEnv, key) && metaEnv[key] != null) {
    return metaEnv[key];
  }
  if (APP_CONFIG && Object.prototype.hasOwnProperty.call(APP_CONFIG, key) && APP_CONFIG[key] != null) {
    return APP_CONFIG[key];
  }
  return fallback;
};

const CLIENT_ID = getEnv('VITE_GITHUB_CLIENT_ID');
const ALLOWED_LOGIN = getEnv('VITE_ALLOWED_GH_LOGIN');
const REPO_OWNER = getEnv('VITE_REPO_OWNER');
const REPO_NAME = getEnv('VITE_REPO_NAME');
const DEFAULT_BRANCH = getEnv('VITE_DEFAULT_BRANCH', 'main');
const PUBLIC_BASE = getEnv('VITE_PUBLIC_BASE', '/');

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

const formatDateTime = (iso) => {
  if (!iso) return '—';
  try {
    const date = new Date(iso);
    return date.toLocaleString();
  } catch (error) {
    return iso;
  }
};

const formatDuration = (seconds) => {
  if (seconds == null) return '—';
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

const formatBytes = (bytes) => {
  if (bytes == null) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

const formatStatus = (status) => {
  switch (status) {
    case 'completed':
      return 'Completed';
    case 'running':
      return 'Running';
    case 'queued':
      return 'Queued';
    case 'failed':
      return 'Failed';
    case 'skipped':
      return 'Skipped';
    case 'pending':
    default:
      return 'Pending';
  }
};

const getStatusColor = (status) => {
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

const workflowEventNames = {
  download: 'download',
  transcribe: 'transcribe',
  split: 'split',
  'translate-ar': 'translate-ar',
  'translate-tr': 'translate-tr',
  delete: 'delete',
  'reset-step': 'reset-step'
};

const WORKFLOW_LABELS = {
  download: 'Download',
  transcribe: 'Transcribe',
  split: 'Split Calls',
  'translate-ar': 'Translate (AR)',
  'translate-tr': 'Translate (TR)',
  delete: 'Delete Assets',
  'reset-step': 'Reset Step'
};

const allWorkflowKinds = ['download', 'transcribe', 'split', 'translate-ar', 'translate-tr', 'delete'];

const buildPayload = (kind, video, overrides = {}) => {
  const base = {
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
  return Object.assign({}, base, overrides);
};

const isActionDisabled = (kind, video) => {
  switch (kind) {
    case 'download':
      return video.download.status === 'completed';
    case 'transcribe':
      return video.transcription.status === 'completed';
    case 'split':
      return video.split.status === 'completed' && video.split.parts.length > 0;
    case 'translate-ar':
      return Boolean(video.translations?.ar && video.translations.ar.status === 'completed');
    case 'translate-tr':
      return Boolean(video.translations?.tr && video.translations.tr.status === 'completed');
    case 'delete':
    case 'reset-step':
    default:
      return false;
  }
};

const parseTimestamp = (value) => {
  const [time, ms] = value.split(',');
  const [hours, minutes, seconds] = time.split(':').map(Number);
  return hours * 3600 + minutes * 60 + Number(seconds) + Number(ms) / 1000;
};

const parseSrt = (content) => {
  return content
    .replace(/\r/g, '')
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block, index) => {
      const lines = block.split('\n');
      if (lines.length < 2) return null;
      const cueIndex = Number(lines[0]);
      const [startRaw, endRaw] = lines[1].split(' --> ').map((item) => item.trim());
      const text = lines.slice(2).join('\n');
      return {
        index: Number.isNaN(cueIndex) ? index + 1 : cueIndex,
        start: parseTimestamp(startRaw),
        end: parseTimestamp(endRaw),
        text
      };
    })
    .filter(Boolean);
};

// ---------------------------------------------------------------------------
// Auth context
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'automation-gh-token';
const DEVICE_INFO_KEY = 'automation-gh-device';

const AuthContext = createContext(undefined);

const fetchDeviceCode = async () => {
  const response = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      scope: 'repo read:user'
    })
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to start device flow: ${errorText}`);
  }
  const data = await response.json();
  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    expiresIn: data.expires_in,
    interval: data.interval,
    message: data.message
  };
};

const exchangeDeviceCode = async (deviceCode) => {
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
    })
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to exchange device code: ${errorText}`);
  }
  return response.json();
};

const fetchViewer = async (token) => {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Token is invalid or expired.');
    }
    const errorText = await response.text();
    throw new Error(`Failed to load GitHub profile: ${errorText}`);
  }
  return response.json();
};

const AuthProvider = ({ children }) => {
  const [state, setState] = useState({ status: 'signed-out', device: null });
  const pollRef = useRef(null);

  const clearPoller = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const finalizeLogin = useCallback(
    async (token) => {
      try {
        const user = await fetchViewer(token);
        if (ALLOWED_LOGIN && user.login !== ALLOWED_LOGIN) {
          sessionStorage.removeItem(STORAGE_KEY);
          sessionStorage.removeItem(DEVICE_INFO_KEY);
          setState({
            status: 'denied',
            error: `Access denied for GitHub user ${user.login}.`
          });
          return;
        }
        sessionStorage.setItem(STORAGE_KEY, token);
        setState({ status: 'signed-in', token, user, device: null });
      } catch (error) {
        sessionStorage.removeItem(STORAGE_KEY);
        setState({
          status: 'error',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    },
    []
  );

  const startPolling = useCallback(
    (info) => {
      clearPoller();
      pollRef.current = setInterval(async () => {
        try {
          const tokenResponse = await exchangeDeviceCode(info.deviceCode);
          if (tokenResponse.error) {
            if (tokenResponse.error === 'authorization_pending') {
              return;
            }
            if (tokenResponse.error === 'slow_down') {
              clearPoller();
              pollRef.current = setInterval(async () => {
                const retry = await exchangeDeviceCode(info.deviceCode);
                if (retry.access_token) {
                  clearPoller();
                  await finalizeLogin(retry.access_token);
                }
              }, (info.interval + 5) * 1000);
              return;
            }
            if (tokenResponse.error === 'expired_token') {
              clearPoller();
              sessionStorage.removeItem(DEVICE_INFO_KEY);
              setState({ status: 'error', error: 'Device code expired. Start again.' });
              return;
            }
            clearPoller();
            setState({
              status: 'error',
              error: `Device flow error: ${tokenResponse.error_description || tokenResponse.error}`
            });
            return;
          }
          if (tokenResponse.access_token) {
            clearPoller();
            sessionStorage.removeItem(DEVICE_INFO_KEY);
            await finalizeLogin(tokenResponse.access_token);
          }
        } catch (error) {
          clearPoller();
          setState({
            status: 'error',
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }, info.interval * 1000);
    },
    [clearPoller, finalizeLogin]
  );

  const startLogin = useCallback(async () => {
    setState({ status: 'starting', device: null });
    try {
      const info = await fetchDeviceCode();
      const enriched = Object.assign({}, info, { expiresAt: Date.now() + info.expiresIn * 1000 });
      sessionStorage.setItem(DEVICE_INFO_KEY, JSON.stringify(enriched));
      setState({ status: 'pending', device: enriched });
      startPolling(enriched);
    } catch (error) {
      setState({
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }, [startPolling]);

  const cancelLogin = useCallback(() => {
    clearPoller();
    sessionStorage.removeItem(DEVICE_INFO_KEY);
    setState({ status: 'signed-out', device: null });
  }, [clearPoller]);

  const logout = useCallback(() => {
    clearPoller();
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(DEVICE_INFO_KEY);
    setState({ status: 'signed-out', device: null });
  }, [clearPoller]);

  useEffect(() => {
    const existingToken = sessionStorage.getItem(STORAGE_KEY);
    if (existingToken) {
      finalizeLogin(existingToken);
    }
    const deviceInfoRaw = sessionStorage.getItem(DEVICE_INFO_KEY);
    if (deviceInfoRaw) {
      try {
        const parsed = JSON.parse(deviceInfoRaw);
        if (Date.now() < parsed.expiresAt) {
          setState({ status: 'pending', device: parsed });
          startPolling(parsed);
        } else {
          sessionStorage.removeItem(DEVICE_INFO_KEY);
        }
      } catch (error) {
        console.warn('Failed to restore device flow', error);
        sessionStorage.removeItem(DEVICE_INFO_KEY);
      }
    }
    return () => {
      clearPoller();
    };
  }, [clearPoller, finalizeLogin, startPolling]);

  const authenticatedFetch = useCallback(
    async (input, init = {}) => {
      if (!state.token) {
        throw new Error('Authentication required.');
      }
      const headers = new Headers(init.headers || {});
      headers.set('Authorization', `Bearer ${state.token}`);
      headers.set('Accept', 'application/vnd.github+json');
      headers.set('X-GitHub-Api-Version', '2022-11-28');
      return fetch(input, Object.assign({}, init, { headers }));
    },
    [state.token]
  );

  const triggerDispatch = useCallback(
    async (eventType, payload) => {
      const response = await authenticatedFetch(
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/dispatches`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ event_type: eventType, client_payload: payload })
        }
      );
      if (response.status === 204) {
        return;
      }
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to trigger workflow: ${text}`);
      }
    },
    [authenticatedFetch]
  );

  const value = useMemo(
    () => ({
      ...state,
      startLogin,
      cancelLogin,
      logout,
      authenticatedFetch,
      triggerDispatch,
      repo: {
        owner: REPO_OWNER,
        name: REPO_NAME,
        defaultBranch: DEFAULT_BRANCH
      }
    }),
    [authenticatedFetch, cancelLogin, logout, startLogin, state, triggerDispatch]
  );

  return html`<${AuthContext.Provider} value=${value}>${children}</${AuthContext.Provider}>`;
};

const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// ---------------------------------------------------------------------------
// Data context
// ---------------------------------------------------------------------------

const DataContext = createContext(undefined);

const DataProvider = ({ children }) => {
  const { authenticatedFetch, triggerDispatch, repo, status, token, user } = useAuth();
  const [state, setState] = useState({
    database: null,
    loading: Boolean(token),
    refreshing: false,
    dispatching: false
  });

  const loadDatabase = useCallback(async () => {
    if (!token) {
      setState((prev) => Object.assign({}, prev, { loading: false }));
      return;
    }
    setState((prev) => Object.assign({}, prev, { loading: true, error: null }));
    try {
      const response = await authenticatedFetch(
        `https://api.github.com/repos/${repo.owner}/${repo.name}/contents/db/index.json?ref=${repo.defaultBranch}`,
        {
          headers: {
            Accept: 'application/vnd.github.raw'
          }
        }
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch db/index.json: ${response.status}`);
      }
      const data = await response.json();
      setState((prev) =>
        Object.assign({}, prev, {
          database: data,
          loading: false,
          error: null
        })
      );
    } catch (error) {
      setState((prev) =>
        Object.assign({}, prev, {
          loading: false,
          error: error instanceof Error ? error.message : String(error)
        })
      );
    }
  }, [authenticatedFetch, repo.defaultBranch, repo.name, repo.owner, token]);

  const refresh = useCallback(async () => {
    if (!token) return;
    setState((prev) => Object.assign({}, prev, { refreshing: true }));
    await loadDatabase();
    setState((prev) => Object.assign({}, prev, { refreshing: false }));
  }, [loadDatabase, token]);

  useEffect(() => {
    if (status === 'signed-in' && token) {
      loadDatabase();
    } else if (status === 'signed-out') {
      setState({
        database: null,
        loading: false,
        refreshing: false,
        dispatching: false,
        dispatchError: null,
        activeEvent: null,
        error: null
      });
    }
  }, [loadDatabase, status, token]);

  const withRequester = useCallback(
    (overrides = {}) => ({
      ...overrides,
      requestedBy: overrides.requestedBy || (user && user.login)
    }),
    [user]
  );

  const runWorkflow = useCallback(
    async (kind, video, overrides = {}) => {
      if (!token) {
        throw new Error('Authentication required.');
      }
      const eventType = workflowEventNames[kind];
      const payload = buildPayload(kind, video, withRequester(overrides));
      setState((prev) =>
        Object.assign({}, prev, {
          dispatching: true,
          dispatchError: null,
          activeEvent: eventType
        })
      );
      try {
        await triggerDispatch(eventType, payload);
        await refresh();
      } catch (error) {
        setState((prev) =>
          Object.assign({}, prev, {
            dispatchError: error instanceof Error ? error.message : String(error)
          })
        );
      } finally {
        setState((prev) => Object.assign({}, prev, { dispatching: false, activeEvent: null }));
      }
    },
    [refresh, token, triggerDispatch, withRequester]
  );

  const runBulkWorkflow = useCallback(
    async (kind, videos, overrides = {}) => {
      if (!token || videos.length === 0) return;
      const eventType = workflowEventNames[kind];
      const payloadOverrides = withRequester(overrides);
      setState((prev) =>
        Object.assign({}, prev, {
          dispatching: true,
          dispatchError: null,
          activeEvent: `${eventType}-bulk`
        })
      );
      try {
        await Promise.all(
          videos.map((video) => triggerDispatch(eventType, buildPayload(kind, video, payloadOverrides)))
        );
        await refresh();
      } catch (error) {
        setState((prev) =>
          Object.assign({}, prev, {
            dispatchError: error instanceof Error ? error.message : String(error)
          })
        );
      } finally {
        setState((prev) => Object.assign({}, prev, { dispatching: false, activeEvent: null }));
      }
    },
    [refresh, token, triggerDispatch, withRequester]
  );

  const value = useMemo(
    () => ({
      ...state,
      refresh,
      runWorkflow,
      runBulkWorkflow
    }),
    [refresh, runBulkWorkflow, runWorkflow, state]
  );

  return html`<${DataContext.Provider} value=${value}>${children}</${DataContext.Provider}>`;
};

const useData = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

const StatusBadge = ({ status }) =>
  html`<span className=${`status-badge ${getStatusColor(status)}`}>${formatStatus(status)}</span>`;

const LoginCard = () => {
  const { startLogin, cancelLogin, status, device, error } = useAuth();
  const pollCountdown = (expiresAt) => {
    if (!expiresAt) return 0;
    return Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
  };
  const [secondsLeft, setSecondsLeft] = useState(() => pollCountdown(device && device.expiresAt));

  useEffect(() => {
    setSecondsLeft(pollCountdown(device && device.expiresAt));
    const timer = setInterval(() => {
      setSecondsLeft(pollCountdown(device && device.expiresAt));
    }, 1000);
    return () => clearInterval(timer);
  }, [device && device.expiresAt]);

  const showDeviceInfo = status === 'pending' && device;

  return html`
    <div className="login-card card">
      <h1>Secure GitHub Sign-In</h1>
      <p>
        This control panel uses GitHub OAuth device flow. Access is restricted to the approved
        maintainer.
      </p>
      ${error && html`<div className="alert-error">${error}</div>`}
      ${showDeviceInfo
        ? html`
            <div className="card" style=${{ background: 'rgba(15,23,42,0.65)', marginTop: 16 }}>
              <h2>Complete verification</h2>
              <ol>
                <li>Open <strong>${device.verificationUri}</strong>.</li>
                <li>Enter the code below and authorise the OAuth app.</li>
              </ol>
              <div className="badge" style=${{ fontSize: 20, letterSpacing: '0.3em' }}>
                ${device.userCode.split('').join(' ')}
              </div>
              <p style=${{ marginTop: 12, opacity: 0.7 }}>
                Code expires in <strong>${secondsLeft}s</strong>
              </p>
              <div className="flex-between" style=${{ marginTop: 16 }}>
                <button type="button" onClick=${() => cancelLogin()}>Cancel</button>
                <button type="button" disabled>Waiting for approval…</button>
              </div>
            </div>
          `
        : html`
            <div className="flex-between" style=${{ marginTop: 24 }}>
              <button type="button" onClick=${() => startLogin()}>
                Authenticate with GitHub
              </button>
            </div>
          `}
    </div>
  `;
};

const DashboardTable = ({ videos, selectedIds, onToggleSelect }) => {
  const sorted = useMemo(() => [...videos].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [videos]);
  return html`
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th></th>
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
          ${sorted.map((video) => {
            const isSelected = selectedIds.includes(video.id);
            return html`
              <tr key=${video.id}>
                <td>
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked=${isSelected}
                    onChange=${(event) => onToggleSelect(video.id, event.target.checked)}
                  />
                </td>
                <td>
                  <div style=${{ display: 'flex', flexDirection: 'column' }}>
                    <${Link} to=${`/videos/${video.id}`} style=${{ fontWeight: 600 }}>
                      ${video.title}
                    </${Link}>
                    <span style=${{ fontSize: 12, opacity: 0.65 }}>${video.channelTitle}</span>
                  </div>
                </td>
                <td><${StatusBadge} status=${video.download.status} /></td>
                <td><${StatusBadge} status=${video.transcription.status} /></td>
                <td><${StatusBadge} status=${video.split.status} /></td>
                <td><${StatusBadge} status=${(video.translations.ar && video.translations.ar.status) || 'pending'} /></td>
                <td><${StatusBadge} status=${(video.translations.tr && video.translations.tr.status) || 'pending'} /></td>
                <td>${formatDateTime(video.updatedAt)}</td>
              </tr>
            `;
          })}
        </tbody>
      </table>
    </div>
  `;
};

const BulkActionsBar = ({ videos, selectedIds, onSelectAll, onRunBulk, isDispatching }) => {
  const [selectedAction, setSelectedAction] = useState('download');
  const selectedVideos = useMemo(() => videos.filter((video) => selectedIds.includes(video.id)), [
    selectedIds,
    videos
  ]);
  const canExecute = selectedVideos.length > 0;

  const handleExecute = () => {
    if (!canExecute) return;
    onRunBulk(
      selectedAction,
      selectedVideos.filter((video) => !isActionDisabled(selectedAction, video))
    );
  };

  return html`
    <div className="card" style=${{ padding: 16 }}>
      <div className="table-toolbar">
        <label style=${{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            className="checkbox"
            checked=${selectedIds.length === videos.length && videos.length > 0}
            onChange=${(event) => onSelectAll(event.target.checked)}
          />
          Select all
        </label>
        <span style=${{ opacity: 0.7 }}>
          ${selectedIds.length} video${selectedIds.length === 1 ? '' : 's'} selected
        </span>
        <select value=${selectedAction} onChange=${(event) => setSelectedAction(event.target.value)}>
          ${allWorkflowKinds.map(
            (kind) => html`<option key=${kind} value=${kind}>${WORKFLOW_LABELS[kind]}</option>`
          )}
        </select>
        <button type="button" onClick=${handleExecute} disabled=${!canExecute || isDispatching}>
          Run for selection
        </button>
      </div>
    </div>
  `;
};

const StatsPanel = ({ analytics }) => {
  if (!analytics) {
    return html`
      <div className="card">
        <h2>Analytics</h2>
        <p style=${{ opacity: 0.7 }}>No analytics available yet.</p>
      </div>
    `;
  }
  const { totals, jobs, activeJobs } = analytics;
  return html`
    <div className="card">
      <div className="flex-between" style=${{ alignItems: 'flex-start' }}>
        <div>
          <h2>Automation Analytics</h2>
          <p className="hero-subtitle" style=${{ marginBottom: 0 }}>
            Updated ${formatDateTime((analytics.activeJobs && analytics.activeJobs[0]?.startedAt) || undefined)}
          </p>
        </div>
      </div>
      <div className="grid-columns" style=${{ marginTop: 24 }}>
        <div className="stat-card">
          <h3>Total videos</h3>
          <strong>${totals.videos}</strong>
          <span style=${{ opacity: 0.65 }}>Downloaded: ${totals.downloaded}</span>
        </div>
        <div className="stat-card">
          <h3>Transcribed</h3>
          <strong>${totals.transcribed}</strong>
          <span style=${{ opacity: 0.65 }}>Split: ${totals.split}</span>
        </div>
        <div className="stat-card">
          <h3>Translations</h3>
          <strong>AR ${totals.translatedAr} / TR ${totals.translatedTr}</strong>
        </div>
        <div className="stat-card">
          <h3>Runtime processed</h3>
          <strong>${formatDuration(totals.runtimeSeconds)}</strong>
          <span style=${{ opacity: 0.65 }}>Storage: ${formatBytes(totals.storageBytes)}</span>
        </div>
      </div>
      <h3 style=${{ marginTop: 32, textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: 12 }}>
        Workflow health
      </h3>
      <div className="grid-columns" style=${{ marginTop: 16 }}>
        ${Object.entries(jobs).map(
          ([key, stat]) => html`
            <div key=${key} className="meta-item">
              <span className="meta-label">${key}</span>
              <span className="meta-value">✅ ${stat.success} · ❌ ${stat.failed}</span>
              <span style=${{ fontSize: 12, opacity: 0.7 }}>
                Last run ${formatDateTime(stat.lastRunAt)}
              </span>
            </div>
          `
        )}
      </div>
      <h3 style=${{ marginTop: 32, textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: 12 }}>
        Active jobs
      </h3>
      ${activeJobs.length === 0
        ? html`<p style=${{ opacity: 0.7 }}>No jobs currently running.</p>`
        : html`
            <div className="grid-columns" style=${{ marginTop: 12 }}>
              ${activeJobs.map(
                (job) => html`
                  <div key=${job.id} className="meta-item">
                    <span className="meta-label">${job.step}</span>
                    <span className="meta-value">Video ${job.videoId}</span>
                    <span style=${{ fontSize: 12, opacity: 0.7 }}>
                      Started ${formatDateTime(job.startedAt)}
                    </span>
                  </div>
                `
              )}
            </div>
          `}
    </div>
  `;
};

const VideoActionsBar = ({ video, onRun, isDispatching }) => {
  const [resetTarget, setResetTarget] = useState('download');
  const actions = useMemo(() => allWorkflowKinds, []);

  const handleRunAll = async () => {
    for (const kind of actions) {
      if (isActionDisabled(kind, video)) continue;
      await onRun(kind);
    }
  };

  const resettableSteps = [
    { label: 'Download', key: 'download' },
    { label: 'Transcription', key: 'transcription' },
    { label: 'Split', key: 'split' },
    { label: 'Arabic translation', key: 'translations.ar' },
    { label: 'Turkish translation', key: 'translations.tr' }
  ];

  return html`
    <div className="card">
      <h2>Workflow controls</h2>
      <div className="tab-list" style=${{ flexWrap: 'wrap' }}>
        ${actions.map((kind) =>
          html`
            <button
              key=${kind}
              type="button"
              className=${isActionDisabled(kind, video) ? '' : 'active'}
              onClick=${() => onRun(kind)}
              disabled=${isActionDisabled(kind, video) || isDispatching}
            >
              ${WORKFLOW_LABELS[kind]}
            </button>
          `
        )}
      </div>
      <div className="flex-between" style=${{ marginTop: 16 }}>
        <button type="button" onClick=${handleRunAll} disabled=${isDispatching}>
          Run all remaining steps
        </button>
        <div style=${{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value=${resetTarget} onChange=${(event) => setResetTarget(event.target.value)}>
            ${resettableSteps.map(
              (step) => html`<option key=${step.key} value=${step.key}>Reset ${step.label}</option>`
            )}
          </select>
          <button
            type="button"
            onClick=${() => onRun('reset-step', { resetStep: resetTarget })}
            disabled=${isDispatching}
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  `;
};

const SubtitlePlayer = ({ videoId, audioPath, subtitlePath, title }) => {
  const { repo } = useAuth();
  const audioRef = useRef(null);
  const [cues, setCues] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState(null);

  const buildRawUrl = (path) =>
    path ? `https://raw.githubusercontent.com/${repo.owner}/${repo.name}/${repo.defaultBranch}/${path}` : undefined;

  const audioUrl = useMemo(() => {
    if (!audioPath) return undefined;
    return buildRawUrl(audioPath);
  }, [audioPath, repo.defaultBranch, repo.name, repo.owner]);

  const subtitleUrl = useMemo(() => {
    if (!subtitlePath) return undefined;
    return buildRawUrl(subtitlePath);
  }, [repo.defaultBranch, repo.name, repo.owner, subtitlePath]);

  useEffect(() => {
    const loadSubtitles = async () => {
      if (!subtitleUrl) {
        setCues([]);
        return;
      }
      try {
        const response = await fetch(subtitleUrl);
        if (!response.ok) {
          throw new Error(`Failed to load subtitles ${response.status}`);
        }
        const text = await response.text();
        setCues(parseSrt(text));
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };
    loadSubtitles();
  }, [subtitleUrl]);

  useEffect(() => {
    const element = audioRef.current;
    if (!element) return;

    const handleTimeUpdate = () => {
      const currentTime = element.currentTime;
      if (!cues || cues.length === 0) return;
      const found = cues.findIndex((cue) => currentTime >= cue.start && currentTime <= cue.end);
      if (found >= 0) {
        setActiveIndex(found);
      }
    };

    element.addEventListener('timeupdate', handleTimeUpdate);
    return () => {
      element.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [cues]);

  return html`
    <div className="card">
      <h2>Preview · ${title || videoId}</h2>
      ${!audioUrl
        ? html`<p style=${{ opacity: 0.7 }}>Audio not available yet.</p>`
        : html`<audio ref=${audioRef} controls className="audio-player" src=${audioUrl} preload="metadata"></audio>`}
      ${error && html`<div className="alert-error" style=${{ marginTop: 16 }}>${error}</div>`}
      <div className="subtitle-box">
        ${cues.length === 0
          ? html`<span style=${{ opacity: 0.6 }}>Subtitles unavailable.</span>`
          : cues.map((cue, index) =>
              html`<div key=${cue.index} className=${`subtitle-line ${index === activeIndex ? 'active' : ''}`}>
                ${cue.text}
              </div>`
            )}
      </div>
    </div>
  `;
};

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

const STATUS_FILTERS = [
  { value: 'all', label: 'All videos' },
  { value: 'downloaded', label: 'Downloaded' },
  { value: 'transcribed', label: 'Transcribed' },
  { value: 'split', label: 'Split' },
  { value: 'ar', label: 'Arabic translated' },
  { value: 'tr', label: 'Turkish translated' },
  { value: 'failed', label: 'Has failure' }
];

const matchesStatus = (video, filter) => {
  switch (filter) {
    case 'downloaded':
      return video.download.status === 'completed';
    case 'transcribed':
      return video.transcription.status === 'completed';
    case 'split':
      return video.split.status === 'completed';
    case 'ar':
      return video.translations?.ar?.status === 'completed';
    case 'tr':
      return video.translations?.tr?.status === 'completed';
    case 'failed':
      return (
        video.download.status === 'failed' ||
        video.transcription.status === 'failed' ||
        video.split.status === 'failed' ||
        (video.translations.ar && video.translations.ar.status === 'failed') ||
        (video.translations.tr && video.translations.tr.status === 'failed')
      );
    case 'all':
    default:
      return true;
  }
};

const DashboardPage = () => {
  const { database, loading, error, refreshing, runBulkWorkflow, dispatching, dispatchError } = useData();
  const videos = (database && database.videos) || [];
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState([]);

  const channels = useMemo(() => {
    const unique = new Set();
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
        (video.channelTitle && video.channelTitle.toLowerCase().includes(lowerQuery));
      const matchesStatusFilter = matchesStatus(video, statusFilter);
      const matchesChannel = channelFilter === 'all' || video.channelTitle === channelFilter;
      return matchesQuery && matchesStatusFilter && matchesChannel;
    });
  }, [channelFilter, query, statusFilter, videos]);

  const toggleSelect = (id, checked) => {
    setSelectedIds((prev) => {
      if (checked) {
        return Array.from(new Set([...prev, id]));
      }
      return prev.filter((item) => item !== id);
    });
  };

  const selectAll = (checked) => {
    if (checked) {
      setSelectedIds(filteredVideos.map((video) => video.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleBulk = async (kind, items) => {
    await runBulkWorkflow(kind, items);
  };

  return html`
    <div className="app-shell">
      <header>
        <h1 className="hero-title">Automation Control Center</h1>
        <p className="hero-subtitle">
          Monitor downloads, transcripts, translations and more in one secure dashboard.
        </p>
      </header>
      ${error && html`<div className="alert-error">${error}</div>`}
      ${dispatchError && html`<div className="alert-error">${dispatchError}</div>`}
      <div className="card">
        <div className="table-toolbar">
          <input
            type="search"
            placeholder="Search by title, channel or ID"
            value=${query}
            onChange=${(event) => setQuery(event.target.value)}
            style=${{ flex: 1, minWidth: 200 }}
          />
          <select value=${statusFilter} onChange=${(event) => setStatusFilter(event.target.value)}>
            ${STATUS_FILTERS.map(
              (filter) => html`<option key=${filter.value} value=${filter.value}>${filter.label}</option>`
            )}
          </select>
          <select value=${channelFilter} onChange=${(event) => setChannelFilter(event.target.value)}>
            ${channels.map((channel) =>
              html`<option key=${channel} value=${channel}>
                ${channel === 'all' ? 'All channels' : channel}
              </option>`
            )}
          </select>
          ${refreshing && html`<span className="badge">Refreshing…</span>`}
        </div>
        ${loading
          ? html`<p style=${{ opacity: 0.7 }}>Loading database…</p>`
          : html`<${DashboardTable}
              videos=${filteredVideos}
              selectedIds=${selectedIds}
              onToggleSelect=${toggleSelect}
            />`}
      </div>
      <${BulkActionsBar}
        videos=${filteredVideos}
        selectedIds=${selectedIds}
        onSelectAll=${selectAll}
        onRunBulk=${handleBulk}
        isDispatching=${dispatching}
      />
      <${StatsPanel} analytics=${database && database.analytics} />
    </div>
  `;
};

const VideoDetailPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { database, runWorkflow, dispatching } = useData();
  const { repo } = useAuth();
  const video = useMemo(() => (database && database.videos.find((item) => item.id === id)) || null, [
    database,
    id
  ]);

  if (!video) {
    return html`
      <div className="card">
        <h2>Video not found</h2>
        <p style=${{ opacity: 0.7 }}>We could not find the requested video in the database.</p>
        <button type="button" onClick=${() => navigate('/')}>Back to dashboard</button>
      </div>
    `;
  }

  const handleRun = async (kind, overrides) => {
    await runWorkflow(kind, video, overrides);
  };

  const buildRaw = (path) =>
    path ? `https://raw.githubusercontent.com/${repo.owner}/${repo.name}/${repo.defaultBranch}/${path}` : undefined;

  return html`
    <div className="app-shell">
      <${Link} to="/" style=${{ textDecoration: 'none', opacity: 0.7 }}>← Back to dashboard</${Link}>
      <div className="card">
        <h1 className="hero-title">${video.title}</h1>
        <p className="hero-subtitle">
          ${video.channelTitle} · Updated ${formatDateTime(video.updatedAt)}
        </p>
        <div className="meta-grid">
          <div className="meta-item">
            <span className="meta-label">Video ID</span>
            <span className="meta-value">${video.id}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Source URL</span>
            <a className="meta-value" href=${video.sourceUrl} target="_blank" rel="noreferrer">
              ${(video.sourceUrl && video.sourceUrl.slice(0, 60)) || 'Unknown'}
            </a>
          </div>
          <div className="meta-item">
            <span className="meta-label">Duration</span>
            <span className="meta-value">${formatDuration(video.durationSeconds)}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Storage used</span>
            <span className="meta-value">${formatBytes(video.metrics && video.metrics.storageBytes)}</span>
          </div>
        </div>
      </div>
      <${VideoActionsBar} video=${video} onRun=${handleRun} isDispatching=${dispatching} />
      <div className="video-detail-grid">
        <div className="card">
          <h2>Workflow status</h2>
          <div className="grid-columns">
            <div className="meta-item">
              <span className="meta-label">Download</span>
              <${StatusBadge} status=${video.download.status} />
              <span style=${{ fontSize: 12, opacity: 0.7 }}>
                Updated ${formatDateTime(video.download.updatedAt)}
              </span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Transcription</span>
              <${StatusBadge} status=${video.transcription.status} />
              <span style=${{ fontSize: 12, opacity: 0.7 }}>
                Updated ${formatDateTime(video.transcription.updatedAt)}
              </span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Split</span>
              <${StatusBadge} status=${video.split.status} />
              <span style=${{ fontSize: 12, opacity: 0.7 }}>
                Updated ${formatDateTime(video.split.updatedAt)}
              </span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Arabic</span>
              <${StatusBadge} status=${(video.translations.ar && video.translations.ar.status) || 'pending'} />
              <span style=${{ fontSize: 12, opacity: 0.7 }}>
                Updated ${formatDateTime(video.translations.ar && video.translations.ar.updatedAt)}
              </span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Turkish</span>
              <${StatusBadge} status=${(video.translations.tr && video.translations.tr.status) || 'pending'} />
              <span style=${{ fontSize: 12, opacity: 0.7 }}>
                Updated ${formatDateTime(video.translations.tr && video.translations.tr.updatedAt)}
              </span>
            </div>
          </div>
          ${video.lastError
            ? html`<div className="alert-error" style=${{ marginTop: 16 }}>
                Last error on ${video.lastError.step}: ${video.lastError.message} ·
                ${formatDateTime(video.lastError.occurredAt)}
              </div>`
            : null}
        </div>
        <${SubtitlePlayer}
          videoId=${video.id}
          title=${video.title}
          audioPath=${video.download.path}
          subtitlePath=${video.transcription.srtPath}
        />
      </div>
      <div className="card">
        <h2>Split parts</h2>
        ${video.split.parts.length === 0
          ? html`<p style=${{ opacity: 0.7 }}>No split calls detected yet.</p>`
          : html`
              <div className="grid-columns">
                ${video.split.parts.map(
                  (part) => html`
                    <div key=${part.id} className="part-card">
                      <span className="meta-label">${part.label}</span>
                      <span className="meta-value">
                        ${formatDuration(part.start)} → ${formatDuration(part.end)}
                      </span>
                      <span style=${{ fontSize: 12, opacity: 0.7 }}>${part.summary || '—'}</span>
                      ${part.srtPath
                        ? html`<a href=${buildRaw(part.srtPath)} target="_blank" rel="noreferrer" style=${{
                            opacity: 0.8
                          }}>
                            Open SRT
                          </a>`
                        : html`<span style=${{ opacity: 0.6 }}>No SRT</span>`}
                    </div>
                  `
                )}
              </div>
            `}
      </div>
      <div className="card">
        <h2>History</h2>
        ${video.history.length === 0
          ? html`<p style=${{ opacity: 0.7 }}>No history recorded for this video yet.</p>`
          : html`
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
                    ${video.history.map(
                      (entry) => html`
                        <tr key=${`${entry.timestamp}-${entry.event}`}>
                          <td>${formatDateTime(entry.timestamp)}</td>
                          <td>${entry.event}</td>
                          <td><${StatusBadge} status=${entry.status} /></td>
                          <td>${entry.actor || '—'}</td>
                          <td>${entry.notes || '—'}</td>
                        </tr>
                      `
                    )}
                  </tbody>
                </table>
              </div>
            `}
      </div>
      <div className="card">
        <h2>Translations</h2>
        <div className="grid-columns">
          ${['ar', 'tr'].map((lang) => {
            const translation = video.translations[lang];
            return html`
              <div key=${lang} className="part-card">
                <span className="meta-label">${lang === 'ar' ? 'Arabic' : 'Turkish'}</span>
                <${StatusBadge} status=${(translation && translation.status) || 'pending'} />
                <span style=${{ fontSize: 12, opacity: 0.7 }}>
                  Updated ${formatDateTime(translation && translation.updatedAt)}
                </span>
                ${translation && translation.srtPath
                  ? html`<a href=${buildRaw(translation.srtPath)} target="_blank" rel="noreferrer" style=${{
                      opacity: 0.8
                    }}>
                      Download subtitles
                    </a>`
                  : html`<span style=${{ opacity: 0.6 }}>No translation file</span>`}
              </div>
            `;
          })}
        </div>
      </div>
    </div>
  `;
};

// ---------------------------------------------------------------------------
// Application shell
// ---------------------------------------------------------------------------

const AuthenticatedApp = () => {
  const { user, logout } = useAuth();
  const { refresh, refreshing } = useData();
  return html`
    <main>
      <div className="flex-between" style=${{ marginBottom: 16 }}>
        <div style=${{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img
            src=${user && user.avatar_url}
            alt=${user && user.login}
            width=${40}
            height=${40}
            style=${{ borderRadius: '50%', border: '2px solid rgba(99,102,241,0.6)' }}
          />
          <div>
            <div style=${{ fontWeight: 600 }}>${(user && (user.name || user.login)) || ''}</div>
            <a href=${user && user.html_url} target="_blank" rel="noreferrer" style=${{ fontSize: 12 }}>
              @${user && user.login}
            </a>
          </div>
        </div>
        <div style=${{ display: 'flex', gap: 12 }}>
          <button type="button" onClick=${() => refresh()} disabled=${refreshing}>
            ${refreshing ? 'Refreshing…' : 'Refresh data'}
          </button>
          <button type="button" onClick=${() => logout()}>Sign out</button>
        </div>
      </div>
      <${Routes}>
        <${Route} path="/" element=${html`<${DashboardPage} />`} />
        <${Route} path="/videos/:id" element=${html`<${VideoDetailPage} />`} />
        <${Route} path="*" element=${html`<${Navigate} to="/" replace=${true} />`} />
      </${Routes}>
    </main>
  `;
};

const AuthGate = () => {
  const { status } = useAuth();
  if (status === 'signed-in') {
    return html`<${AuthenticatedApp} />`;
  }
  return html`
    <main>
      <${LoginCard} />
    </main>
  `;
};

const App = () => html`<${AuthGate} />`;

const Root = () =>
  html`
    <${StrictMode}>
      <${AuthProvider}>
        <${DataProvider}>
          <${BrowserRouter} basename=${PUBLIC_BASE}>
            <${App} />
          </${BrowserRouter}>
        </${DataProvider}>
      </${AuthProvider}>
    </${StrictMode}>
  `;

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(html`<${Root} />`);
