import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Users,
  Search,
  MessageSquare,
  UserPlus,
  Check,
  X,
  Plus
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { useChatStore } from '../store/useChatStore';
import { useServerStore } from '../store/useServerStore';
import { useLayoutStore } from '../store/useLayoutStore';
import { useNavigate, useParams, Outlet } from 'react-router-dom';
import { api, assetUrl } from '../lib/api';

import { UserWidget } from '../components/UserWidget';
import { Menu } from 'lucide-react';

type UserSummary = {
  id: string;
  username: string;
  displayName?: string | null;
  pronouns?: string | null;
  avatarUrl?: string | null;
  status?: string | null;
};

type Friendship = {
  id: string;
  status: 'PENDING' | 'ACCEPTED' | 'BLOCKED';
  direction: 'incoming' | 'outgoing';
  user: UserSummary;
};

type DmChannel = {
  id: string;
  isGroup: boolean;
  name: string | null;
  iconUrl: string | null;
  members: { userId: string; user: UserSummary | null }[];
  lastMessage: { content: string; createdAt: string; author: UserSummary | null } | null;
};

type Tab = 'friends' | 'pending' | 'add';

/**
 * FriendsLayout renders the left "home" sidebar (friend tabs + DM list).
 * The main area is filled by an <Outlet /> — either FriendsContent (default)
 * or the ChatArea when a DM is open.
 */
export default function FriendsLayout() {
  const { t } = useTranslation();
  const token = useAuthStore(state => state.token);
  const me = useAuthStore(state => state.user);
  const socket = useChatStore(state => state.socket);
  const unreads = useChatStore(state => state.unreads);
  const navigate = useNavigate();
  const { dmId } = useParams();
  const { mobileChannelSidebarOpen, setMobileChannelSidebarOpen } = useLayoutStore();

  const cachedFriends = useServerStore(state => state.cachedFriends);
  const cachedDms = useServerStore(state => state.cachedDms);
  const setCachedFriends = useServerStore(state => state.setCachedFriends);
  const setCachedDms = useServerStore(state => state.setCachedDms);

  const [friendships, setFriendships] = useState<Friendship[]>(cachedFriends);
  const [dms, setDms] = useState<DmChannel[]>(cachedDms);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupMenu, setGroupMenu] = useState<{ x: number; y: number; channel: DmChannel } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);

  const clampMenuPosition = useCallback((x: number, y: number) => {
    const menuWidth = 220;
    const menuHeight = 120;
    return {
      x: x + menuWidth > window.innerWidth ? Math.max(8, window.innerWidth - menuWidth - 8) : x,
      y: y + menuHeight > window.innerHeight ? Math.max(8, window.innerHeight - menuHeight - 8) : y,
    };
  }, []);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const refreshFriends = useCallback(() => {
    if (!token) return;
    api('/api/friends', {}, token)
      .then(res => res.json())
      .then(data => {
        const list = Array.isArray(data?.friendships) ? data.friendships : [];
        setFriendships(list);
        setCachedFriends(list);
      })
      .catch(console.error);
  }, [token, setCachedFriends]);

  const refreshDms = useCallback(() => {
    if (!token) return;
    api('/api/dms', {}, token)
      .then(res => res.json())
      .then(data => {
        const list = Array.isArray(data?.channels) ? data.channels : [];
        setDms(list);
        setCachedDms(list);
      })
      .catch(console.error);
  }, [token, setCachedDms]);

  useEffect(() => {
    refreshFriends();
    refreshDms();
  }, [refreshFriends, refreshDms]);

  useEffect(() => {
    if (!socket) return;
    const onChange = () => {
      refreshFriends();
      refreshDms();
    };
    socket.on('friend:incoming', onChange);
    socket.on('friend:outgoing', onChange);
    socket.on('friend:updated', onChange);
    socket.on('friend:removed', onChange);
    socket.on('dm:created', onChange);
    socket.on('dm:message_created', onChange);
    return () => {
      socket.off('friend:incoming', onChange);
      socket.off('friend:outgoing', onChange);
      socket.off('friend:updated', onChange);
      socket.off('friend:removed', onChange);
      socket.off('dm:created', onChange);
      socket.off('dm:message_created', onChange);
    };
  }, [socket, refreshFriends, refreshDms]);

  const incomingCount = friendships.filter(
    f => f.status === 'PENDING' && f.direction === 'incoming'
  ).length;

  const handleLeaveGroup = useCallback(async (channel: DmChannel) => {
    if (!token) return;
    try {
      const res = await api(`/api/dms/${channel.id}/leave`, { method: 'POST' }, token);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.message || 'Gruppe konnte nicht verlassen werden.');
        return;
      }
      setGroupMenu(null);
      await refreshDms();
      if (dmId === channel.id || dmId === channel.name) {
        navigate('/app');
      }
    } catch (err) {
      console.error(err);
      alert('Gruppe konnte nicht verlassen werden.');
    }
  }, [token, refreshDms, dmId, navigate]);

  return (
    <div className="flex h-full relative">
      {/* Mobile overlay */}
      {mobileChannelSidebarOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/50 z-40" 
          onClick={() => setMobileChannelSidebarOpen(false)}
        />
      )}
      <aside className={`
        w-64 bg-softspace-900 border-r border-softspace-800 flex flex-col shrink-0
        absolute md:relative z-40 h-full transition-transform duration-200 ease-in-out
        ${mobileChannelSidebarOpen ? 'translate-x-0' : '-translate-x-full md:transform-none'}
      `}>
        <div className="p-3 space-y-1">
          <SidebarItem
            active={!dmId && location.pathname === '/app'}
            onClick={() => {
              navigate('/app');
              setMobileChannelSidebarOpen(false);
            }}
            icon={<Users size={16} />}
            label={t('friends')}
          />
          {incomingCount > 0 && (
            <SidebarItem
              active={false}
              onClick={() => {
                navigate('/app?tab=pending');
                setMobileChannelSidebarOpen(false);
              }}
              icon={<UserPlus size={16} />}
              label={t('pending')}
              count={incomingCount}
              highlight
            />
          )}
        </div>

        <div className="px-3 py-1 text-xs font-bold text-softspace-500 uppercase tracking-wider flex items-center justify-between group">
          <span>{t('direct_messages')}</span>
          <button 
            type="button" 
            onClick={() => setShowCreateGroup(true)}
            className="text-softspace-400 hover:text-softspace-100 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Create Group DM"
          >
            <Plus size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
          {dms.length === 0 ? (
            <div className="text-softspace-500 text-sm px-2 py-3">{t('no_dms')}</div>
          ) : (
            dms.map(channel => {
              const otherMember = channel.members.find(m => m.userId !== me?.id);
              
              const display = channel.isGroup 
                ? (channel.name || channel.members.filter(m => m.userId !== me?.id).map(m => m.user?.displayName || m.user?.username).join(', '))
                : (channel.name ?? otherMember?.user?.displayName ?? otherMember?.user?.username ?? channel.id.slice(0, 6));

              const avatar = channel.isGroup 
                ? channel.iconUrl
                : (channel.iconUrl ?? otherMember?.user?.avatarUrl ?? null);

              const initial = (display ?? '?').charAt(0).toUpperCase();
              const targetUrl = (!channel.isGroup && otherMember?.user?.username) 
                ? `/app/dms/@${otherMember.user.username}` 
                : `/app/dms/${channel.name || channel.id}`;

              // Check if this DM is active
              let isActive = false;
              
              if (!channel.isGroup && otherMember?.user?.username) {
                // For 1:1 DMs - check if URL contains @username
                isActive = dmId?.startsWith('@') && otherMember.user.username.toLowerCase() === dmId.slice(1).toLowerCase();
              } else if (channel.isGroup) {
                // For group DMs - check if URL contains group name or ID
                if (channel.name) {
                  isActive = channel.name === dmId;
                } else {
                  isActive = channel.id === dmId;
                }
              } else {
                // Fallback - check by ID
                isActive = channel.id === dmId;
              }

              const unreadCount = unreads[channel.id] ?? 0;
              const hasUnread = unreadCount > 0;

              return (
                <button
                  type="button"
                  key={channel.id}
                  onClick={() => {
                    if (longPressTriggeredRef.current) {
                      longPressTriggeredRef.current = false;
                      return;
                    }
                    navigate(targetUrl);
                    setMobileChannelSidebarOpen(false);
                  }}
                  onContextMenu={(e) => {
                    if (channel.isGroup) {
                      e.preventDefault();
                      e.stopPropagation();
                      const pos = clampMenuPosition(e.clientX, e.clientY);
                      setGroupMenu({ x: pos.x, y: pos.y, channel });
                    }
                  }}
                  onTouchStart={(e) => {
                    if (!channel.isGroup) return;
                    const touch = e.touches[0];
                    if (!touch) return;
                    clearLongPress();
                    longPressTriggeredRef.current = false;
                    longPressTimerRef.current = setTimeout(() => {
                      longPressTriggeredRef.current = true;
                      const pos = clampMenuPosition(touch.clientX, touch.clientY);
                      setGroupMenu({ x: pos.x, y: pos.y, channel });
                    }, 550);
                  }}
                  onTouchEnd={() => clearLongPress()}
                  onTouchMove={() => clearLongPress()}
                  onTouchCancel={() => clearLongPress()}
                  className={`w-full flex items-center gap-3 p-2 rounded-xl transition-colors text-left ${
                    isActive
                      ? 'bg-softspace-800 text-softspace-100 font-semibold'
                      : hasUnread
                        ? 'bg-softspace-800/40 text-softspace-100 font-bold'
                        : 'hover:bg-softspace-800 text-softspace-300'
                  }`}
                >
                  <div className="w-9 h-9 bg-softspace-700 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden">
                    {avatar ? (
                      <img
                        src={assetUrl(avatar)}
                        alt={display}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="font-bold text-softspace-300">{initial}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`truncate ${hasUnread ? 'font-bold text-white' : 'font-medium'}`}>{display}</div>
                    {channel.lastMessage && (
                      <div className={`text-xs truncate ${hasUnread ? 'text-softspace-200 font-medium' : 'text-softspace-500'}`}>
                        {channel.lastMessage.content || '...'}
                      </div>
                    )}
                  </div>
                  {hasUnread && (
                    <span className="bg-red-500 text-white text-[10px] font-bold rounded-full h-5 min-w-[20px] px-1.5 flex items-center justify-center shrink-0">
                      {unreadCount}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
        <UserWidget />
      </aside>

      <main className="flex-1 bg-softspace-950 overflow-hidden flex flex-col">
        <Outlet
          context={{
            friendships,
            refreshFriends,
            refreshDms,
            me,
          } satisfies FriendsOutletContext}
        />
      </main>

      {showCreateGroup && (
        <CreateGroupModal
          friendships={friendships.filter(f => f.status === 'ACCEPTED')}
          onClose={() => setShowCreateGroup(false)}
          onSuccess={(dmId) => {
            setShowCreateGroup(false);
            refreshDms();
            navigate(`/app/dms/${dmId}`);
          }}
        />
      )}

      {groupMenu && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setGroupMenu(null)} />
          <div
            className="fixed z-[9999] bg-softspace-900 border border-softspace-800 shadow-2xl rounded-xl py-2 w-56 text-sm"
            style={{ top: groupMenu.y, left: groupMenu.x }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div className="px-4 py-1 text-xs font-bold text-softspace-400 mb-1 border-b border-softspace-800 truncate">
              {groupMenu.channel.name || 'Gruppe'}
            </div>
            <button
              type="button"
              onClick={() => handleLeaveGroup(groupMenu.channel)}
              className="w-full px-4 py-2 text-left hover:bg-red-500/20 text-red-400 transition-colors"
            >
              Gruppe verlassen
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export type FriendsOutletContext = {
  friendships: Friendship[];
  refreshFriends: () => void;
  refreshDms: () => void;
  me: UserSummary | null;
};

/* ------------------------------------------------------------------ */
/* Default content shown at /app (no DM open) */
/* ------------------------------------------------------------------ */

import { useOutletContext } from 'react-router-dom';

export function FriendsContent() {
  const { t } = useTranslation();
  const token = useAuthStore(state => state.token);
  const navigate = useNavigate();
  const { friendships, refreshFriends } = useOutletContext<FriendsOutletContext>();
  const { setMobileSidebarOpen, setMobileChannelSidebarOpen } = useLayoutStore();

  const [tab, setTab] = useState<Tab>('friends');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSummary[]>([]);
  const [searchInfo, setSearchInfo] = useState<string | null>(null);

  const accepted = friendships.filter(f => f.status === 'ACCEPTED');
  const incoming = friendships.filter(
    f => f.status === 'PENDING' && f.direction === 'incoming'
  );
  const outgoing = friendships.filter(
    f => f.status === 'PENDING' && f.direction === 'outgoing'
  );

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearchInfo(null);
    if (!searchQuery.trim()) return;
    try {
      const res = await api(
        `/api/users/search?q=${encodeURIComponent(searchQuery)}`,
        {},
        token
      );
      let data: any = {};
      try {
        const text = await res.text();
        if (text) data = JSON.parse(text);
      } catch(e) {}
      const users = Array.isArray(data?.users) ? data.users : [];
      setSearchResults(users);
      if (users.length === 0) setSearchInfo(t('no_users_found'));
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendRequest = async (username: string) => {
    try {
      const res = await api(
        '/api/friends',
        { method: 'POST', body: JSON.stringify({ username }) },
        token
      );
      if (res.ok) {
        setSearchInfo(t('request_sent'));
        setSearchResults([]);
        setSearchQuery('');
        refreshFriends();
      } else {
        const err = await res.json().catch(() => ({}));
        setSearchInfo(err.message || err.error || 'Error');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAccept = async (id: string) => {
    await api(`/api/friends/${id}/accept`, { method: 'POST' }, token);
    refreshFriends();
  };

  const handleDecline = async (id: string) => {
    await api(`/api/friends/${id}`, { method: 'DELETE' }, token);
    refreshFriends();
  };

  const handleStartDm = async (userId: string) => {
    try {
      const res = await api(
        '/api/dms',
        { method: 'POST', body: JSON.stringify({ userIds: [userId] }) },
        token
      );
      let data: any = {};
      try {
        const text = await res.text();
        if (text) data = JSON.parse(text);
      } catch(e) {}
      const ch = data?.channel ?? data;
      if (ch?.id) {
        const otherUser = ch.members?.find((m: any) => m.userId === userId)?.user;
        if (!ch.isGroup && otherUser?.username) {
          navigate(`/app/dms/@${otherUser.username}`);
        } else {
          navigate(`/app/dms/${ch.id}`);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <>
      <div className="h-14 border-b border-softspace-800 flex items-center px-4 md:px-6 gap-3 shrink-0">
        <div className="md:hidden flex items-center gap-2 mr-2">
          <button onClick={() => setMobileSidebarOpen(true)} className="p-1.5 text-softspace-400 hover:text-softspace-100 rounded-lg">
            <Menu size={20} />
          </button>
          <button onClick={() => setMobileChannelSidebarOpen(true)} className="p-1.5 text-softspace-400 hover:text-softspace-100 rounded-lg">
            <Users size={20} />
          </button>
        </div>
        
        <Users className="text-softspace-400 hidden md:block" size={20} />
        <h2 className="font-semibold text-softspace-100">{t('friends')}</h2>

        <div className="flex items-center gap-1 ml-auto md:ml-4 overflow-x-auto no-scrollbar">
          <TabBtn active={tab === 'friends'} onClick={() => setTab('friends')}>
            {t('all_friends')} {accepted.length > 0 && `· ${accepted.length}`}
          </TabBtn>
          <TabBtn active={tab === 'pending'} onClick={() => setTab('pending')}>
            {t('pending')} {incoming.length > 0 && `· ${incoming.length}`}
          </TabBtn>
        </div>

        <button
          type="button"
          onClick={() => setTab('add')}
          className={`shrink-0 text-sm px-3 py-1.5 rounded-lg transition-colors ${
            tab === 'add'
              ? 'bg-softspace-500 text-white'
              : 'bg-softspace-800 hover:bg-softspace-700 text-softspace-200'
          }`}
        >
          <span className="hidden sm:inline">{t('add_friend')}</span>
          <span className="sm:hidden"><UserPlus size={16}/></span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-2xl mx-auto">
          {tab === 'friends' && (
            <div className="space-y-2">
              {accepted.length === 0 ? (
                <EmptyState text={t('no_friends')} />
              ) : (
                accepted.map(f => (
                  <UserCard
                    key={f.id}
                    user={f.user}
                    action={
                      <button
                        type="button"
                        onClick={() => handleStartDm(f.user.id)}
                        className="bg-softspace-800 hover:bg-softspace-700 text-softspace-100 px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                      >
                        <MessageSquare size={14} />
                        {t('start_conversation')}
                      </button>
                    }
                  />
                ))
              )}
            </div>
          )}

          {tab === 'pending' && (
            <div className="space-y-6">
              {incoming.length > 0 && (
                <div>
                  <div className="text-xs text-softspace-400 uppercase tracking-wider mb-2">
                    {t('pending')}
                  </div>
                  <div className="space-y-2">
                    {incoming.map(f => (
                      <UserCard
                        key={f.id}
                        user={f.user}
                        action={
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleAccept(f.id)}
                              className="bg-softspace-500 hover:bg-softspace-400 text-white p-2 rounded-lg transition-colors"
                              aria-label={t('accept')}
                              title={t('accept')}
                            >
                              <Check size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDecline(f.id)}
                              className="bg-softspace-800 hover:bg-red-500/20 text-softspace-200 hover:text-red-300 p-2 rounded-lg transition-colors"
                              aria-label={t('decline')}
                              title={t('decline')}
                            >
                              <X size={16} />
                            </button>
                          </div>
                        }
                      />
                    ))}
                  </div>
                </div>
              )}
              {outgoing.length > 0 && (
                <div>
                  <div className="text-xs text-softspace-400 uppercase tracking-wider mb-2">
                    {t('cancel_request')}
                  </div>
                  <div className="space-y-2">
                    {outgoing.map(f => (
                      <UserCard
                        key={f.id}
                        user={f.user}
                        action={
                          <button
                            type="button"
                            onClick={() => handleDecline(f.id)}
                            className="bg-softspace-800 hover:bg-red-500/20 text-softspace-200 hover:text-red-300 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                          >
                            {t('cancel_request')}
                          </button>
                        }
                      />
                    ))}
                  </div>
                </div>
              )}
              {incoming.length === 0 && outgoing.length === 0 && (
                <EmptyState text={t('no_pending_requests')} />
              )}
            </div>
          )}

          {tab === 'add' && (
            <div>
              <h2 className="text-xl font-bold text-softspace-100 mb-2">
                {t('add_friend')}
              </h2>
              <p className="text-softspace-400 text-sm mb-6">{t('search_users')}</p>

              <form onSubmit={handleSearch} className="flex gap-2 mb-6">
                <div className="flex-1 bg-softspace-900 border border-softspace-800 rounded-xl px-4 py-3 flex items-center focus-within:border-softspace-500 transition-colors">
                  <input
                    type="text"
                    placeholder={t('search_users')}
                    className="flex-1 bg-transparent border-none focus:outline-none text-softspace-100"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    autoFocus
                  />
                  <Search className="text-softspace-500" size={20} />
                </div>
                <button
                  type="submit"
                  className="bg-softspace-500 hover:bg-softspace-400 text-white px-6 rounded-xl font-medium transition-colors"
                >
                  {t('search_users')}
                </button>
              </form>

              {searchInfo && (
                <div className="text-sm text-softspace-300 bg-softspace-900 border border-softspace-800 rounded-xl px-4 py-3 mb-4">
                  {searchInfo}
                </div>
              )}

              <div className="space-y-2">
                {searchResults.map(u => (
                  <UserCard
                    key={u.id}
                    user={u}
                    action={
                      <button
                        type="button"
                        onClick={() => handleSendRequest(u.username)}
                        className="bg-softspace-500 hover:bg-softspace-400 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                      >
                        {t('send_friend_request')}
                      </button>
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function SidebarItem({
  active,
  onClick,
  icon,
  label,
  count,
  highlight,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
  highlight?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-colors text-sm font-medium ${
        active
          ? 'bg-softspace-800 text-softspace-100'
          : 'text-softspace-300 hover:bg-softspace-800/60'
      }`}
    >
      <span className="text-softspace-400">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {typeof count === 'number' && count > 0 && (
        <span
          className={`text-xs rounded-full px-2 py-0.5 ${
            highlight
              ? 'bg-softspace-500 text-white'
              : 'bg-softspace-800 text-softspace-300'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        active
          ? 'bg-softspace-800 text-softspace-100'
          : 'text-softspace-300 hover:bg-softspace-800/60'
      }`}
    >
      {children}
    </button>
  );
}

function UserCard({
  user,
  action,
}: {
  user: UserSummary;
  action: React.ReactNode;
}) {
  return (
    <div className="bg-softspace-900 border border-softspace-800 rounded-xl p-3 flex items-center gap-3">
      <div className="w-10 h-10 rounded-full bg-softspace-800 flex items-center justify-center overflow-hidden flex-shrink-0">
        {user.avatarUrl ? (
          <img
            src={assetUrl(user.avatarUrl)}
            alt={user.username}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="font-bold text-softspace-300">
            {user.username.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-softspace-100 truncate flex items-center gap-2">
          {user.displayName || user.username}
          {user.pronouns && (
            <span className="text-[10px] bg-softspace-800 text-softspace-300 px-1.5 py-0.5 rounded font-normal">
              {user.pronouns}
            </span>
          )}
        </div>
        <div className="text-xs text-softspace-500 truncate">@{user.username}</div>
      </div>
      <div className="flex-shrink-0">{action}</div>
    </div>
  );
}

function CreateGroupModal({
  friendships,
  onClose,
  onSuccess
}: {
  friendships: Friendship[];
  onClose: () => void;
  onSuccess: (dmId: string) => void;
}) {
  const { t } = useTranslation();
  const token = useAuthStore(state => state.token);
  const [name, setName] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const toggleUser = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIds.size < 2) return;
    setSubmitting(true);
    try {
      const res = await api('/api/dms', {
        method: 'POST',
        body: JSON.stringify({
          userIds: Array.from(selectedIds),
          name: name.trim() || null
        })
      }, token);
      
      if (res.ok) {
        let data: any = {};
        try {
          const text = await res.text();
          if (text) data = JSON.parse(text);
        } catch(e) {}
        if (data?.channel?.id) {
          onSuccess(data.channel.id);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn" onClick={onClose}>
      <div className="w-full max-w-md bg-softspace-900 rounded-2xl shadow-2xl overflow-hidden border border-softspace-800 flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-softspace-800 shrink-0">
          <h2 className="text-xl font-bold text-softspace-50">{t('create_group_dm')}</h2>
          <button onClick={onClose} className="text-softspace-400 hover:text-softspace-100 transition-colors p-1 rounded-lg">
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-6 overflow-y-auto space-y-4">
            <div>
              <label className="block text-sm font-medium text-softspace-300 mb-2">{t('group_name_optional')}</label>
              <input 
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Awesome Group"
                className="w-full bg-softspace-950 border border-softspace-800 rounded-xl px-4 py-3 text-softspace-100 focus:outline-none focus:border-softspace-500 transition-colors"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-softspace-300 mb-2">
                {t('select_friends')} ({selectedIds.size} selected, min 2)
              </label>
              <div className="space-y-2">
                {friendships.map(f => {
                  const friend = f.user;
                  const isSelected = selectedIds.has(friend.id);
                  return (
                    <div 
                      key={friend.id}
                      onClick={() => toggleUser(friend.id)}
                      className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-colors ${isSelected ? 'bg-softspace-800/50 border-softspace-600' : 'bg-softspace-950 border-softspace-800 hover:border-softspace-700'}`}
                    >
                      <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-softspace-500 text-white' : 'border border-softspace-700'}`}>
                        {isSelected && <Check size={14} />}
                      </div>
                      <div className="w-8 h-8 bg-softspace-800 rounded-full flex items-center justify-center overflow-hidden shrink-0">
                        {friend.avatarUrl ? (
                          <img src={assetUrl(friend.avatarUrl)} alt={friend.username} className="w-full h-full object-cover" />
                        ) : (
                          <Users size={14} className="text-softspace-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-softspace-100 text-sm truncate">{friend.displayName || friend.username}</div>
                        <div className="text-xs text-softspace-400 truncate">@{friend.username}</div>
                      </div>
                    </div>
                  );
                })}
                {friendships.length === 0 && (
                  <div className="text-softspace-500 text-sm py-4 text-center">{t('no_friends_to_add')}</div>
                )}
              </div>
            </div>
          </div>
          <div className="p-4 border-t border-softspace-800 bg-softspace-950 flex justify-end shrink-0">
            <button
              type="submit"
              disabled={selectedIds.size < 2 || submitting}
              className="bg-softspace-500 hover:bg-softspace-400 text-white px-5 py-2.5 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? t('creating') : t('create_group')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-softspace-500 text-center py-16">
      <Users size={36} className="mx-auto mb-3 opacity-30" />
      <p>{text}</p>
    </div>
  );
}
