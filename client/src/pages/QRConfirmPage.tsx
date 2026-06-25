import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { api } from '../lib/api';
import { Heart, MonitorSmartphone, CheckCircle2 } from 'lucide-react';

export default function QRConfirmPage() {
  const [searchParams] = useSearchParams();
  const socketId = searchParams.get('socketId');
  const token = useAuthStore(state => state.token);
  const navigate = useNavigate();
  
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!token) {
      // Must be logged in to confirm QR login
      navigate(`/auth?next=${encodeURIComponent(`/qr-login?socketId=${socketId ?? ''}`)}`);
    }
  }, [token, navigate, socketId]);

  if (!socketId) {
    return (
      <div className="min-h-screen bg-softspace-950 flex flex-col items-center justify-center text-white p-4">
        <h2 className="text-xl font-bold mb-2 text-red-400">Invalid QR Code</h2>
        <p className="text-softspace-300">No socket ID provided.</p>
      </div>
    );
  }

  const handleConfirm = async () => {
    setStatus('loading');
    try {
      const res = await api('/api/auth/qr-login', {
        method: 'POST',
        body: JSON.stringify({ socketId })
      }, token);
      if (res.ok) {
        setStatus('success');
      } else {
        const data = await res.json();
        throw new Error(data.message || 'Failed to login to PC');
      }
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.message || 'Network error');
    }
  };

  return (
    <div className="min-h-screen bg-softspace-950 flex flex-col items-center justify-center text-white p-4 selection:bg-softspace-500/30 selection:text-softspace-100">
      <div className="bg-softspace-900 border border-softspace-800 p-8 rounded-2xl w-full max-w-sm shadow-xl flex flex-col items-center text-center">
        {status === 'success' ? (
          <>
            <div className="w-16 h-16 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 size={32} />
            </div>
            <h1 className="text-2xl font-bold mb-2">Login Successful!</h1>
            <p className="text-softspace-300 mb-6">Your desktop app is now logged in.</p>
            <button
              onClick={() => navigate('/app')}
              className="w-full bg-softspace-800 hover:bg-softspace-700 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              Go to App
            </button>
          </>
        ) : (
          <>
            <div className="w-16 h-16 bg-softspace-800 text-white rounded-full flex items-center justify-center mb-4">
              <MonitorSmartphone size={32} />
            </div>
            <h1 className="text-2xl font-bold mb-2">Log in to Desktop?</h1>
            <p className="text-softspace-300 mb-8">
              You are about to log in to the Softspace desktop app.
            </p>

            {status === 'error' && (
              <div className="w-full bg-red-500/10 text-red-400 p-3 rounded-lg text-sm mb-6">
                {errorMsg}
              </div>
            )}

            <button
              onClick={handleConfirm}
              disabled={status === 'loading'}
              className="w-full bg-softspace-600 hover:bg-softspace-700 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors mb-3 flex items-center justify-center gap-2"
            >
              {status === 'loading' ? 'Confirming...' : 'Yes, log me in'}
            </button>
            <button
              onClick={() => navigate('/app')}
              className="w-full bg-transparent hover:bg-softspace-800 text-softspace-300 font-semibold py-3 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
