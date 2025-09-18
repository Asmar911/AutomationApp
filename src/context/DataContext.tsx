import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import type { Database, VideoRecord, WorkflowKind, WorkflowPayload } from '../types';
import { buildPayload, workflowEventNames } from '../utils/actions';

interface DataState {
  database: Database | null;
  loading: boolean;
  error?: string | null;
  refreshing: boolean;
  dispatching: boolean;
  dispatchError?: string | null;
  activeEvent?: string | null;
}

interface DataContextValue extends DataState {
  refresh: () => Promise<void>;
  runWorkflow: (
    kind: WorkflowKind,
    video: VideoRecord,
    overrides?: Partial<WorkflowPayload>
  ) => Promise<void>;
  runBulkWorkflow: (
    kind: WorkflowKind,
    videos: VideoRecord[],
    overrides?: Partial<WorkflowPayload>
  ) => Promise<void>;
}

const DataContext = createContext<DataContextValue | undefined>(undefined);

export const DataProvider = ({ children }: { children: React.ReactNode }) => {
  const { authenticatedFetch, triggerDispatch, repo, status, token, user } = useAuth();
  const [state, setState] = useState<DataState>({
    database: null,
    loading: Boolean(token),
    refreshing: false,
    dispatching: false
  });

  const loadDatabase = useCallback(async () => {
    if (!token) {
      setState((prev) => ({ ...prev, loading: false }));
      return;
    }
    setState((prev) => ({ ...prev, loading: true, error: null }));
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
      const data = (await response.json()) as Database;
      setState((prev) => ({
        ...prev,
        database: data,
        loading: false,
        error: null
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : String(error)
      }));
    }
  }, [authenticatedFetch, repo.defaultBranch, repo.name, repo.owner, token]);

  const refresh = useCallback(async () => {
    if (!token) return;
    setState((prev) => ({ ...prev, refreshing: true }));
    await loadDatabase();
    setState((prev) => ({ ...prev, refreshing: false }));
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
    (overrides: Partial<WorkflowPayload> = {}) => ({
      ...overrides,
      requestedBy: overrides.requestedBy ?? user?.login
    }),
    [user?.login]
  );

  const runWorkflow = useCallback(
    async (kind: WorkflowKind, video: VideoRecord, overrides: Partial<WorkflowPayload> = {}) => {
      if (!token) {
        throw new Error('Authentication required.');
      }
      const eventType = workflowEventNames[kind];
      const payload = buildPayload(kind, video, withRequester(overrides));
      setState((prev) => ({ ...prev, dispatching: true, dispatchError: null, activeEvent: eventType }));
      try {
        await triggerDispatch(eventType, payload);
        await refresh();
      } catch (error) {
        setState((prev) => ({
          ...prev,
          dispatchError: error instanceof Error ? error.message : String(error)
        }));
      } finally {
        setState((prev) => ({ ...prev, dispatching: false, activeEvent: null }));
      }
    },
    [refresh, token, triggerDispatch, withRequester]
  );

  const runBulkWorkflow = useCallback(
    async (kind: WorkflowKind, videos: VideoRecord[], overrides: Partial<WorkflowPayload> = {}) => {
      if (!token || videos.length === 0) return;
      const eventType = workflowEventNames[kind];
      const payloadOverrides = withRequester(overrides);
      setState((prev) => ({ ...prev, dispatching: true, dispatchError: null, activeEvent: `${eventType}-bulk` }));
      try {
        await Promise.all(
          videos.map((video) => triggerDispatch(eventType, buildPayload(kind, video, payloadOverrides)))
        );
        await refresh();
      } catch (error) {
        setState((prev) => ({
          ...prev,
          dispatchError: error instanceof Error ? error.message : String(error)
        }));
      } finally {
        setState((prev) => ({ ...prev, dispatching: false, activeEvent: null }));
      }
    },
    [refresh, token, triggerDispatch, withRequester]
  );

  const value = useMemo<DataContextValue>(
    () => ({
      ...state,
      refresh,
      runWorkflow,
      runBulkWorkflow
    }),
    [refresh, runBulkWorkflow, runWorkflow, state]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};
