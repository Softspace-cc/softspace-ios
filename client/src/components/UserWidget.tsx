import { useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { assetUrl } from '../lib/api';
import { User as UserIcon, Settings } from 'lucide-react';
import UserProfileModal from './UserProfileModal';
import { UserBadges } from './UserBadges';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { getUserPresenceSummary, getUserPresenceIcon, isManualCustomStatus } from '../lib/userPresence';
import StatusIndicator, { getDisplayStatus } from './StatusIndicator';
import { getClientPlatform } from '../lib/platform';

export function UserWidget() {
  const { t, i18n } = useTranslation();
  const me = useAuthStore(state => state.user);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const navigate = useNavigate();

  if (!me) return null;

  const displayStatus = getDisplayStatus(me.status);
  const localPlatform = getClientPlatform();

  return (
    <>
      <div className="h-14 bg-softspace-950/50 border-t border-softspace-800 flex items-center px-3 shrink-0">
        <button
          type="button"
          onClick={() => setProfileModalOpen(true)}
          className="flex-1 flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-softspace-800 transition-colors text-left group min-w-0 cursor-pointer"
        >
          <div className="relative shrink-0">
            <div className="w-8 h-8 rounded-full bg-softspace-800 flex items-center justify-center overflow-hidden">
              {me.avatarUrl ? (
                <img
                  src={assetUrl(me.avatarUrl)}
                  alt={me.username}
                  className="w-full h-full object-cover"
                />
              ) : (
                <UserIcon size={16} className="text-softspace-400" />
              )}
            </div>
            <StatusIndicator
              status={me.status}
              platform={localPlatform}
              size="sm"
              className="absolute -bottom-0.5 -right-0.5"
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="font-bold text-sm text-softspace-100 truncate">
                {me.displayName || me.username}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <UserBadges badges={me.badges} variant="compact" />
              </div>
            </div>
            <div className="text-xs text-softspace-400 truncate flex items-center gap-1.5 min-w-0">
              {(() => {
                const summary = getUserPresenceSummary(me);
                const iconUrl = getUserPresenceIcon(me);
                if (summary) {
                  return (
                    <>
                      {iconUrl && (
                        <img src={iconUrl} alt="" className="w-4 h-4 rounded shrink-0 object-cover" />
                      )}
                      <span className="truncate">{summary}</span>
                    </>
                  );
                }
                if (isManualCustomStatus(me.customStatus)) {
                  return <span className="truncate">{me.customStatus.replace(/\[\[ce:(?:EMOJI|GIF):([^:\]]+):[^\]]+\]\]/g, ':$1:')}</span>;
                }
                return <span className="truncate">{t(`status_${displayStatus}`) || displayStatus}</span>;
              })()}
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => navigate('/app/settings')}
          className="p-2 text-softspace-400 hover:text-softspace-100 hover:bg-softspace-800 rounded-xl transition-colors cursor-pointer shrink-0 ml-1"
          aria-label={t('settings')}
        >
          <Settings size={18} />
        </button>
      </div>

      <UserProfileModal
        user={me}
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        language={i18n.language}
        isMe={true}
      />
    </>
  );
}
