import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/useAuthStore';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { api, resolveSocketUrl } from '../lib/api';
import TelegramLoginWidget from '../components/TelegramLoginWidget';
import { QRCodeSVG } from 'qrcode.react';
import { io } from 'socket.io-client';

// Small inline Discord icon for the button
function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 127.14 96.36" fill="currentColor">
      <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.31,60,73.31,53s5-12.74,11.43-12.74S96.2,46,96.12,53,91.08,65.69,84.69,65.69Z" />
    </svg>
  );
}

// Small inline Telegram icon for the button
function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.21-1.12-.33-1.08-.7.02-.19.27-.39.75-.59 2.95-1.29 4.92-2.14 5.9-2.55 2.81-1.18 3.39-1.38 3.78-1.39.09 0 .28.02.4.1.11.06.18.15.2.26.01.07.01.16 0 .24z"/>
    </svg>
  );
}

export default function AuthPage() {
  const { t } = useTranslation();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [pronouns, setPronouns] = useState('');
  const [identity, setIdentity] = useState('');
  const setAuth = useAuthStore(state => state.setAuth);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = searchParams.get('next') || '/app';
  const [telegramBotName, setTelegramBotName] = useState<string | null>(null);

  const [qrSocketId, setQrSocketId] = useState<string | null>(null);

  useEffect(() => {
    const debugUrl = 'http://127.0.0.1:7777/event';
    const debugSessionId = 'qr-login-loading';

    // Fetch telegram bot name for the widget
    api('/api/auth/telegram/config')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.botName) setTelegramBotName(data.botName);
      })
      .catch(() => {});
      
    // Set up socket for QR login
    // #region debug-point A:qr-socket-init
    fetch(debugUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: debugSessionId, runId: 'pre-fix', hypothesisId: 'A', location: 'AuthPage.tsx:qr-init', msg: '[DEBUG] creating qr socket', data: { socketUrl: resolveSocketUrl(), isElectron, href: window.location.href }, ts: Date.now() }) }).catch(() => {});
    // #endregion
    const socket = io(resolveSocketUrl(), {
      auth: { qrLogin: true },
      query: { qrLogin: 'true' },
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      // #region debug-point C:qr-socket-connect
      fetch(debugUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: debugSessionId, runId: 'pre-fix', hypothesisId: 'C', location: 'AuthPage.tsx:connect', msg: '[DEBUG] qr socket connected', data: { socketId: socket.id, connected: socket.connected }, ts: Date.now() }) }).catch(() => {});
      // #endregion
      setQrSocketId(socket.id || null);
    });

    if (socket.connected) {
      // #region debug-point C:qr-socket-already-connected
      fetch(debugUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: debugSessionId, runId: 'pre-fix', hypothesisId: 'C', location: 'AuthPage.tsx:already-connected', msg: '[DEBUG] qr socket already connected', data: { socketId: socket.id, connected: socket.connected }, ts: Date.now() }) }).catch(() => {});
      // #endregion
      setQrSocketId(socket.id || null);
    }

    socket.on('connect_error', (error) => {
      // #region debug-point B:qr-socket-connect-error
      fetch(debugUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: debugSessionId, runId: 'pre-fix', hypothesisId: 'B', location: 'AuthPage.tsx:connect_error', msg: '[DEBUG] qr socket connect_error', data: { message: error.message, description: (error as any)?.description ?? null, context: (error as any)?.context ?? null, type: (error as any)?.type ?? null }, ts: Date.now() }) }).catch(() => {});
      // #endregion
    });

    socket.on('disconnect', (reason) => {
      // #region debug-point A:qr-socket-disconnect
      fetch(debugUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: debugSessionId, runId: 'pre-fix', hypothesisId: 'A', location: 'AuthPage.tsx:disconnect', msg: '[DEBUG] qr socket disconnected', data: { reason }, ts: Date.now() }) }).catch(() => {});
      // #endregion
    });

    socket.on('qr:login:success', (data: { token: string; user: any }) => {
      setAuth(data.user, data.token);
      navigate(nextPath);
      socket.disconnect();
    });

    return () => {
      socket.disconnect();
    };
  }, [navigate, nextPath, setAuth]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';

    const identityTags = identity
      ? identity.split(',').map(tag => tag.trim()).filter(Boolean)
      : undefined;

    const body = isLogin
      ? { identifier: email, password }
      : {
          email,
          password,
          username,
          displayName: displayName || username,
          pronouns: pronouns || undefined,
          identityTags: identityTags?.length ? identityTags : undefined,
        };

    try {
      const res = await api(endpoint, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        if (err.issues) {
          const issues = Array.isArray(err.issues) ? err.issues : [];
          const issuesStr = issues
            .map((i: unknown) => {
              const issue = i as { path?: string; message?: string };
              return `${issue.path ?? ''}: ${issue.message ?? ''}`;
            })
            .join(', ');
          alert(`${t('validation_error')}: ${issuesStr}`);
        } else {
          alert(err.message || err.error || t('network_error'));
        }
        return;
      }

      const data = await res.json();
      setAuth(data.user, data.token);
      navigate(nextPath);
    } catch {
      alert(t('network_error'));
    }
  };

  const handleDiscordLogin = async () => {
    try {
      const res = await api('/api/auth/discord/url');
      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
        }
      } else {
        alert(t('discord_oauth_not_configured') || 'Discord OAuth is not configured.');
      }
    } catch (err) {
      console.error(err);
      alert(t('network_error'));
    }
  };

  const handleTelegramAuth = async (user: any) => {
    try {
      const res = await api('/api/auth/telegram/callback', {
        method: 'POST',
        body: JSON.stringify(user)
      });
      if (res.ok) {
        const data = await res.json();
        setAuth(data.user, data.token);
        if (data.isNewUser) {
          alert(t('telegram_welcome_message') || 'Thank you for coming from Telegram to Softspace! Your account has been created.');
        }
        navigate(nextPath);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.message || err.error || t('telegram_auth_failed') || 'Failed to authenticate with Telegram.');
      }
    } catch (err) {
      console.error(err);
      alert(t('network_error'));
    }
  };

  // @ts-ignore
  const isElectron = !!window.electron;
  const isCapacitor = typeof window !== 'undefined' && typeof (window as any).Capacitor !== 'undefined';

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-softspace-950 p-4 selection:bg-softspace-500/30 selection:text-softspace-100">
      {!isElectron && !isCapacitor && (
        <Link
          to="/"
          className="absolute top-6 left-6 px-4 py-2 bg-softspace-900 hover:bg-softspace-800 border border-softspace-800 text-xs font-semibold text-softspace-300 hover:text-white rounded-lg transition-colors"
        >
          ← {t('back')}
        </Link>
      )}


      <div className={`flex gap-8 items-center bg-softspace-900 border border-softspace-800 p-8 rounded-2xl shadow-xl w-full justify-center ${isElectron ? 'max-w-4xl' : 'max-w-md'}`}>
        {/* Form Section */}
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center mb-6">
            <div className="w-12 h-12 bg-softspace-600 rounded-xl flex items-center justify-center mb-3">
              <Heart className="text-white" size={22} />
            </div>
            <h1 className="text-2xl font-bold text-center tracking-tight">{t('app_name')}</h1>
            <p className="text-center text-sm text-softspace-300 mt-1.5">
              {isLogin ? t('welcome_back') : t('join_softspace')}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <>
              <div>
                <label className="block text-xs font-semibold text-softspace-200 mb-1.5 uppercase tracking-wider">{t('username')}</label>
                <input
                  type="text"
                  required
                  className="w-full bg-softspace-950 border border-softspace-800 rounded-lg px-4 py-2.5 text-sm text-softspace-100 placeholder-softspace-500 focus:outline-none focus:border-softspace-500 transition-colors"
                  value={username} onChange={e => setUsername(e.target.value)}
                  placeholder="milo"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-softspace-200 mb-1.5 uppercase tracking-wider">{t('display_name')}</label>
                <input
                  type="text"
                  className="w-full bg-softspace-950 border border-softspace-800 rounded-lg px-4 py-2.5 text-sm text-softspace-100 placeholder-softspace-500 focus:outline-none focus:border-softspace-500 transition-colors"
                  value={displayName} onChange={e => setDisplayName(e.target.value)}
                  placeholder="Milo"
                />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-softspace-200 mb-1.5 uppercase tracking-wider">{t('pronouns')}</label>
                  <input
                    type="text" placeholder="they/them"
                    className="w-full bg-softspace-950 border border-softspace-800 rounded-lg px-4 py-2.5 text-sm text-softspace-100 placeholder-softspace-500 focus:outline-none focus:border-softspace-500 transition-colors"
                    value={pronouns} onChange={e => setPronouns(e.target.value)}
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-softspace-200 mb-1.5 uppercase tracking-wider">{t('identity')}</label>
                  <input
                    type="text"
                    placeholder="trans, furry"
                    className="w-full bg-softspace-950 border border-softspace-800 rounded-lg px-4 py-2.5 text-sm text-softspace-100 placeholder-softspace-500 focus:outline-none focus:border-softspace-500 transition-colors"
                    value={identity} onChange={e => setIdentity(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-softspace-200 mb-1.5 uppercase tracking-wider">
              {isLogin ? t('email_or_username') : t('email')}
            </label>
            <input
              type={isLogin ? 'text' : 'email'}
              required
              className="w-full bg-softspace-950 border border-softspace-800 rounded-lg px-4 py-2.5 text-sm text-softspace-100 placeholder-softspace-500 focus:outline-none focus:border-softspace-500 transition-colors"
              value={email} onChange={e => setEmail(e.target.value)}
              placeholder={isLogin ? t('email_or_username') : 'hello@softspace.cc'}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-softspace-200 mb-1.5 uppercase tracking-wider">{t('password')}</label>
            <input
              type="password"
              required
              className="w-full bg-softspace-950 border border-softspace-800 rounded-lg px-4 py-2.5 text-sm text-softspace-100 placeholder-softspace-500 focus:outline-none focus:border-softspace-500 transition-colors"
              value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-softspace-600 hover:bg-softspace-700 text-white font-semibold py-3 rounded-lg transition-colors mt-2"
          >
            {isLogin ? t('login') : t('register')}
          </button>
        </form>

        {!isElectron && (
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-softspace-800"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-softspace-900 px-2 text-softspace-400">
                {t('or_continue_with') || 'Or continue with'}
              </span>
            </div>
          </div>
        )}

        {!isElectron && (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={handleDiscordLogin}
              className="w-full bg-[#5865F2] hover:bg-[#4752C4] text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <DiscordIcon className="w-5 h-5" />
              Discord
            </button>
            
            {telegramBotName && (
              <div className="w-full flex justify-center">
                <TelegramLoginWidget botName={telegramBotName} onAuth={handleTelegramAuth} />
              </div>
            )}
          </div>
        )}

        <p className="text-center text-softspace-300 mt-6 text-sm">
          {isLogin ? t('no_account') : t('has_account')}
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-softspace-200 font-semibold hover:text-white underline ml-1 transition-colors"
          >
            {isLogin ? t('register') : t('login')}
          </button>
        </p>
        </div>

        {/* QR Code Section (Desktop only) */}
        {/* @ts-ignore */}
        {window.electron && (
          <div className="hidden md:flex flex-col items-center justify-center border-l border-softspace-800 pl-8 ml-4 w-64">
            <h3 className="text-xl font-bold text-white mb-2 text-center">Log in with QR Code</h3>
            <p className="text-sm text-softspace-300 text-center mb-6">
              Scan this with your mobile camera while logged in to Softspace.
            </p>
            <div className="bg-white p-4 rounded-xl">
              {qrSocketId ? (
                <QRCodeSVG
                  value={`https://softspace.cc/qr-login?socketId=${encodeURIComponent(qrSocketId)}`}
                  size={160}
                  bgColor="#ffffff"
                  fgColor="#000000"
                  level="Q"
                />
              ) : (
                <div className="w-[160px] h-[160px] flex items-center justify-center bg-gray-100 text-gray-400 rounded">
                  Loading...
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
