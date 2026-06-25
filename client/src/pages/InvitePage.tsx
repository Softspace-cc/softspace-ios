import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Heart } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { useChatStore } from '../store/useChatStore';
import { api, assetUrl } from '../lib/api';

type InviteServerSummary = {
  id: string;
  name: string;
  iconUrl?: string | null;
  bannerUrl?: string | null;
  description?: string | null;
};

type InviteDetails = {
  code: string;
  expiresAt: string | null;
  memberCount: number;
  server: InviteServerSummary;
};

type InvitePayload = { invite?: InviteDetails };
type ServerJoinPayload = {
  server?: { id: string; channels?: { id: string; type: string }[] };
};

export default function InvitePage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const token = useAuthStore(state => state.token);
  const setActiveChannel = useChatStore(state => state.setActiveChannel);

  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    api(`/api/invites/invites/${code}`)
      .then(async res => {
        const json = (await res.json().catch(() => ({}))) as InvitePayload &
          { error?: string; message?: string };
        if (cancelled) return;
        if (!res.ok || !json.invite) {
          setError(json.message ?? json.error ?? 'invite_invalid');
          return;
        }
        setInvite(json.invite);
      })
      .catch(err => {
        if (cancelled) return;
        setError(err.message ?? 'invite_invalid');
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const handleJoin = async () => {
    if (!code) return;
    if (!token) {
      navigate(`/auth?next=${encodeURIComponent(`/invite/${code}`)}`);
      return;
    }
    setJoining(true);
    try {
      const res = await api(`/api/invites/invites/${code}/use`, { method: 'POST' }, token);
      const json = (await res.json().catch(() => ({}))) as ServerJoinPayload &
        { error?: string; message?: string };
      if (!res.ok || !json.server) {
        setError(json.message ?? json.error ?? 'invite_invalid');
        return;
      }
      const serverId = json.server.id;
      const firstText = json.server.channels?.find(c => c.type === 'TEXT');
      const channelId = firstText?.id ?? json.server.channels?.[0]?.id ?? null;
      setActiveChannel(serverId, channelId);
      navigate('/app/channels');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-softspace-950 p-4">
      <div className="w-full max-w-md bg-softspace-900 border border-softspace-800 rounded-3xl shadow-2xl overflow-hidden">
        {invite?.server.bannerUrl ? (
          <div
            className="h-28 bg-cover bg-center"
            style={{ backgroundImage: `url(${assetUrl(invite.server.bannerUrl)})` }}
          />
        ) : (
          <div className="h-28 bg-gradient-to-br from-softspace-700 to-softspace-900" />
        )}

        <div className="px-8 pb-8 pt-0 -mt-10 text-center">
          <div className="w-20 h-20 mx-auto rounded-3xl bg-softspace-800 border-4 border-softspace-900 flex items-center justify-center overflow-hidden shadow-xl">
            {invite?.server.iconUrl ? (
              <img
                src={assetUrl(invite.server.iconUrl)}
                alt={invite.server.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <Heart className="text-softspace-300" size={32} />
            )}
          </div>

          {error && (
            <div className="mt-6 text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm">
              {translateError(error, t)}
            </div>
          )}

          {invite && !error && (
            <>
              <p className="text-softspace-400 text-sm mt-4">{t('invite_invited_to')}</p>
              <h1 className="text-2xl font-bold text-softspace-50 mt-1">
                {invite.server.name}
              </h1>
              {invite.server.description && (
                <p className="text-softspace-300 text-sm mt-3">
                  {invite.server.description}
                </p>
              )}
              <p className="text-softspace-500 text-xs mt-3">
                {invite.memberCount} {t('members_count')}
              </p>

              <button
                type="button"
                onClick={handleJoin}
                disabled={joining}
                className="mt-6 w-full bg-softspace-500 hover:bg-softspace-400 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-50"
              >
                {joining
                  ? t('joining')
                  : token
                    ? t('accept_invite')
                    : t('login_to_accept')}
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => navigate('/')}
            className="mt-3 text-softspace-400 hover:text-softspace-200 text-sm transition-colors"
          >
            {t('cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

function translateError(code: string, t: (k: string) => string): string {
  const map: Record<string, string> = {
    invite_not_found: t('invite_not_found'),
    invite_expired: t('invite_expired'),
    invite_used_up: t('invite_used_up'),
  };
  return map[code] ?? code;
}
