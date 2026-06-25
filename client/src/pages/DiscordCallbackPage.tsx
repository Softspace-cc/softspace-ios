import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/useAuthStore';
import { api } from '../lib/api';

export default function DiscordCallbackPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const setAuth = useAuthStore(state => state.setAuth);

  useEffect(() => {
    const code = searchParams.get('code');
    if (!code) {
      alert(t('invalid_discord_code') || 'Invalid Discord OAuth code.');
      navigate('/auth');
      return;
    }

    let isMounted = true;

    api('/api/auth/discord/callback', {
      method: 'POST',
      body: JSON.stringify({ code })
    }).then(async res => {
      if (!isMounted) return;
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.message || err.error || 'Failed to authenticate with Discord.');
        navigate('/auth');
        return;
      }

      const data = await res.json();
      setAuth(data.user, data.token);

      if (data.isNewUser) {
        alert(t('discord_welcome_message') || 'Thank you for coming from Discord to Softspace! Your account has been created.');
      } else {
        // Just logged in
      }
      navigate('/app');
    }).catch(err => {
      if (!isMounted) return;
      console.error(err);
      alert('Network error while authenticating with Discord.');
      navigate('/auth');
    });

    return () => {
      isMounted = false;
    };
  }, [searchParams, navigate, setAuth, t]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-softspace-950 p-4">
      <div className="text-softspace-200 text-lg animate-pulse">
        {t('authenticating_discord') || 'Authenticating with Discord...'}
      </div>
    </div>
  );
}
