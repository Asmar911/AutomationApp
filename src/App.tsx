import { Routes, Route, Navigate } from 'react-router-dom';
import { LoginCard } from './components/LoginCard';
import { DashboardPage } from './pages/DashboardPage';
import { VideoDetailPage } from './pages/VideoDetailPage';
import { useAuth } from './context/AuthContext';
import { useData } from './context/DataContext';

const AuthenticatedApp = () => {
  const { user, logout } = useAuth();
  const { refresh, refreshing } = useData();

  return (
    <main>
      <div className="flex-between" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img
            src={user?.avatar_url}
            alt={user?.login}
            width={40}
            height={40}
            style={{ borderRadius: '50%', border: '2px solid rgba(99,102,241,0.6)' }}
          />
          <div>
            <div style={{ fontWeight: 600 }}>{user?.name ?? user?.login}</div>
            <a href={user?.html_url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
              @{user?.login}
            </a>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button type="button" onClick={refresh} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh data'}
          </button>
          <button type="button" onClick={logout}>
            Sign out
          </button>
        </div>
      </div>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/videos/:id" element={<VideoDetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
  );
};

const AuthGate = () => {
  const { status } = useAuth();

  if (status === 'signed-in') {
    return <AuthenticatedApp />;
  }

  return (
    <main>
      <LoginCard />
    </main>
  );
};

const App = () => {
  return <AuthGate />;
};

export default App;
