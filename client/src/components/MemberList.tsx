import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { assetUrl } from '../lib/api';
import { User as UserIcon } from 'lucide-react';
import { getUserPresenceSummary, getUserPresenceIcon } from '../lib/userPresence';
import StatusIndicator from './StatusIndicator';
import { useAuthStore } from '../store/useAuthStore';
import { getClientPlatform } from '../lib/platform';

type RoleInfo = {
  id: string;
  serverId: string;
  name: string;
  color: string;
  position: number;
  permissions: string;
  isDefault: boolean;
};

type MemberInfo = {
  userId: string;
  nickname?: string | null;
  joinedAt?: string;
  isMuted?: boolean;
  isDeafened?: boolean;
  user?: {
    id: string;
    username: string;
    displayName?: string | null;
    avatarUrl?: string | null;
    pronouns?: string | null;
    status?: string | null;
    customStatus?: string | null;
    activities?: string | null;
    platform?: 'web' | 'desktop' | 'mobile' | null;
    systemRole?: string | null;
    allowDownloads?: boolean;
  } | null;
  roleIds?: string[];
};

type MemberListProps = {
  members: MemberInfo[];
  roles: RoleInfo[];
  onOpenProfile: (user: any, memberInfo: MemberInfo) => void;
  onContextMenu?: (e: React.MouseEvent, user: any, memberInfo: MemberInfo) => void;
  onOpenContextMenu?: (x: number, y: number, user: any, memberInfo: MemberInfo) => void;
};

export function MemberList({ members, roles, onOpenProfile, onContextMenu, onOpenContextMenu }: MemberListProps) {
  const { t } = useTranslation();
  const me = useAuthStore(state => state.user);
  const localPlatform = getClientPlatform();
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);

  const clearLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  // Group members by their highest hoisted role
  const groups = useMemo(() => {
    // Exclude @everyone role from grouping if it's the default
    const validRoles = roles.filter(r => !r.isDefault).sort((a, b) => b.position - a.position);

    const grouped = new Map<string, { role: RoleInfo | null; members: MemberInfo[] }>();

    // Initialize with a default 'Online' / 'Offline' group if no roles
    // But for servers with roles, we group by role.
    
    validRoles.forEach(role => {
      grouped.set(role.id, { role, members: [] });
    });
    grouped.set('online', { role: null, members: [] });
    grouped.set('offline', { role: null, members: [] });

    members.forEach(member => {
      const isOfflineOrInvisible = !member.user?.status || member.user.status === 'offline' || member.user.status === 'invisible';

      // Find highest role
      let highestRole: RoleInfo | null = null;
      if (member.roleIds && member.roleIds.length > 0) {
        const memberRoles = validRoles.filter(r => member.roleIds!.includes(r.id));
        if (memberRoles.length > 0) {
          highestRole = memberRoles[0];
        }
      }

      const groupId = isOfflineOrInvisible ? 'offline' : (highestRole ? highestRole.id : 'online');
      
      if (!grouped.has(groupId)) {
        grouped.set(groupId, { role: highestRole, members: [] });
      }
      grouped.get(groupId)!.members.push(member);
    });

    // Remove empty groups
    const result = Array.from(grouped.values()).filter(g => g.members.length > 0);
    return result;
  }, [members, roles]);

  return (
    <div className="w-60 bg-softspace-900 border-l border-softspace-800 flex flex-col shrink-0 h-full min-h-0">
      <div className="flex-1 overflow-y-auto p-4 space-y-6 min-h-0">
        {groups.map(group => (
          <div key={group.role?.id ?? ((group.members[0]?.user?.status === 'offline' || group.members[0]?.user?.status === 'invisible') ? 'offline' : 'online')}>
            <div className="text-xs font-bold text-softspace-400 uppercase mb-2 px-2">
              {group.role ? group.role.name : (group.members[0]?.user?.status === 'offline' || group.members[0]?.user?.status === 'invisible' || !group.members[0]?.user?.status) ? t('offline') : 'Online'} — {group.members.length}
            </div>
            <div className="space-y-0.5">
              {group.members.map(member => {
                const displayName = member.nickname || member.user?.displayName || member.user?.username || 'Unknown';
                const isOffline = !member.user?.status || member.user.status === 'offline' || member.user.status === 'invisible';
                const isMe = me?.id === member.userId;
                const displayPlatform = isMe ? localPlatform : member.user?.platform;
                
                return (
                  <button
                    key={member.userId}
                    onClick={() => {
                      if (longPressTriggeredRef.current) {
                        longPressTriggeredRef.current = false;
                        return;
                      }
                      if (member.user) {
                        onOpenProfile(member.user, member);
                      }
                    }}
                    onContextMenu={(e) => {
                      if (member.user && onContextMenu) {
                        onContextMenu(e, member.user, member);
                      }
                    }}
                    onTouchStart={(e) => {
                      if (!member.user || !onOpenContextMenu) return;
                      const touch = e.touches[0];
                      if (!touch) return;
                      clearLongPress();
                      longPressTriggeredRef.current = false;
                      longPressTimerRef.current = setTimeout(() => {
                        longPressTriggeredRef.current = true;
                        onOpenContextMenu(touch.clientX, touch.clientY, member.user, member);
                      }, 550);
                    }}
                    onTouchEnd={() => clearLongPress()}
                    onTouchMove={() => clearLongPress()}
                    onTouchCancel={() => clearLongPress()}
                    className="w-full flex items-center gap-3 px-2 py-1.5 rounded-xl hover:bg-softspace-800/50 transition-colors text-left group"
                  >
                    <div className="relative">
                      <div className="w-8 h-8 rounded-full bg-softspace-800 flex items-center justify-center overflow-hidden shrink-0">
                        {member.user?.avatarUrl ? (
                          <img
                            src={assetUrl(member.user.avatarUrl)}
                            alt={displayName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <UserIcon size={16} className="text-softspace-400" />
                        )}
                      </div>
                      <StatusIndicator
                        status={member.user?.status}
                        platform={displayPlatform}
                        size="sm"
                        className="absolute -bottom-0.5 -right-0.5"
                        borderClassName="border-softspace-900 group-hover:border-softspace-800 transition-colors"
                      />
                    </div>
                    
                    <div className="flex-1 min-w-0 flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <div 
                          className="font-semibold text-sm truncate"
                          style={{ color: group.role ? group.role.color : '#e2e8f0' }}
                        >
                          {displayName}
                        </div>
                        {(member.user?.activities || member.user?.customStatus) && (
                          <div className="text-xs text-softspace-500 truncate flex items-center gap-1.5 min-w-0">
                            {(() => {
                              const summary = member.user ? getUserPresenceSummary(member.user) : null;
                              const iconUrl = member.user ? getUserPresenceIcon(member.user) : null;
                              if (!summary) return null;
                              return (
                                <>
                                  {iconUrl && (
                                    <img src={iconUrl} alt="" className="w-4 h-4 rounded shrink-0 object-cover" />
                                  )}
                                  <span className="truncate">{summary}</span>
                                </>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                      {member.user?.systemRole === 'CEO' && (
                        <span className="text-[10px] bg-orange-500 text-white px-1.5 py-0.5 rounded font-bold uppercase shrink-0 ml-1">
                          CEO
                        </span>
                      )}
                      {member.user?.systemRole === 'MODERATOR' && (
                        <span className="text-[10px] bg-indigo-500 text-white px-1.5 py-0.5 rounded font-bold uppercase shrink-0 ml-1">
                          MOD
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
