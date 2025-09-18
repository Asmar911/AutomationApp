import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import type { DeviceFlowInfo, GithubUser } from '../types';

const STORAGE_KEY = 'automation-gh-token';
const DEVICE_INFO_KEY = 'automation-gh-device';
const CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID;
const ALLOWED_LOGIN = import.meta.env.VITE_ALLOWED_GH_LOGIN;
const REPO_OWNER = import.meta.env.VITE_REPO_OWNER;
const REPO_NAME = import.meta.env.VITE_REPO_NAME;
const DEFAULT_BRANCH = import.meta.env.VITE_DEFAULT_BRANCH || 'main';

export type AuthStatus =
  | 'signed-out'
  | 'starting'
  | 'pending'
  | 'verifying'
  | 'signed-in'
  | 'denied'
  | 'error';

interface AuthState {
  status: AuthStatus;
  token?: string;
  user?: GithubUser;
  device?: (DeviceFlowInfo & { expiresAt: number }) | null;
  error?: string;
}

interface AuthContextValue extends AuthState {
  startLogin: () => Promise<void>;
  cancelLogin: () => void;
  logout: () => void;
  authenticatedFetch: (input: RequestInfo, init?: RequestInit) => Promise<Response>;
  triggerDispatch: (eventType: string, payload: Record<string, unknown>) => Promise<void>;
  repo: {
    owner: string;
    name: string;
    defaultBranch: string;
  };
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const fetchDeviceCode = async (): Promise<DeviceFlowInfo> => {
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

const exchangeDeviceCode = async (deviceCode: string) => {
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

const fetchViewer = async (token: string): Promise<GithubUser> => {
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

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, setState] = useState<AuthState>({ status: 'signed-out', device: null });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearPoller = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const finalizeLogin = useCallback(
    async (token: string) => {
      try {
        const user = await fetchViewer(token);
        if (user.login !== ALLOWED_LOGIN) {
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
        setState({ status: 'error', error: error instanceof Error ? error.message : String(error) });
      }
    },
    []
  );

  const startPolling = useCallback(
    (info: DeviceFlowInfo & { expiresAt: number }) => {
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
          setState({ status: 'error', error: error instanceof Error ? error.message : String(error) });
        }
      }, info.interval * 1000);
    },
    [clearPoller, finalizeLogin]
  );

  const startLogin = useCallback(async () => {
    setState({ status: 'starting', device: null });
    try {
      const info = await fetchDeviceCode();
      const enriched = { ...info, expiresAt: Date.now() + info.expiresIn * 1000 };
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
        const parsed = JSON.parse(deviceInfoRaw) as DeviceFlowInfo & { expiresAt: number };
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
    async (input: RequestInfo, init: RequestInit = {}) => {
      if (!state.token) {
        throw new Error('Authentication required.');
      }
      const headers = new Headers(init.headers || {});
      headers.set('Authorization', `Bearer ${state.token}`);
      headers.set('Accept', 'application/vnd.github+json');
      headers.set('X-GitHub-Api-Version', '2022-11-28');
      return fetch(input, { ...init, headers });
    },
    [state.token]
  );

  const triggerDispatch = useCallback(
    async (eventType: string, payload: Record<string, unknown>) => {
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

  const value = useMemo<AuthContextValue>(
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

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
