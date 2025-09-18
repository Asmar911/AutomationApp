import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

const pollCountdown = (expiresAt?: number) => {
  if (!expiresAt) return 0;
  return Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
};

export const LoginCard = () => {
  const { startLogin, cancelLogin, status, device, error } = useAuth();
  const [secondsLeft, setSecondsLeft] = useState(() => pollCountdown(device?.expiresAt));

  useEffect(() => {
    setSecondsLeft(pollCountdown(device?.expiresAt));
    const timer = setInterval(() => {
      setSecondsLeft(pollCountdown(device?.expiresAt));
    }, 1000);
    return () => clearInterval(timer);
  }, [device?.expiresAt]);

  const showDeviceInfo = status === 'pending' && device;

  return (
    <div className="login-card card">
      <h1>Secure GitHub Sign-In</h1>
      <p>
        This control panel uses GitHub OAuth device flow. Access is restricted to the approved
        maintainer.
      </p>
      {error && <div className="alert-error">{error}</div>}
      {showDeviceInfo ? (
        <div className="card" style={{ background: 'rgba(15,23,42,0.65)', marginTop: 16 }}>
          <h2>Complete verification</h2>
          <ol>
            <li>Open <strong>{device.verificationUri}</strong>.</li>
            <li>Enter the code below and authorise the OAuth app.</li>
          </ol>
          <div className="badge" style={{ fontSize: 20, letterSpacing: '0.3em' }}>
            {device.userCode.split('').join(' ')}
          </div>
          <p style={{ marginTop: 12, opacity: 0.7 }}>
            Code expires in <strong>{secondsLeft}s</strong>
          </p>
          <div className="flex-between" style={{ marginTop: 16 }}>
            <button type="button" onClick={cancelLogin}>
              Cancel
            </button>
            <button type="button" disabled>
              Waiting for approval…
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-between" style={{ marginTop: 24 }}>
          <button type="button" onClick={startLogin}>
            Authenticate with GitHub
          </button>
        </div>
      )}
    </div>
  );
};
