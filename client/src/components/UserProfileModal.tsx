import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, User as UserIcon, UserPlus, UserMinus, Phone, ShieldAlert, MicOff, VolumeX, Ban } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api, assetUrl } from '../lib/api';
import { format } from 'date-fns';
import { de as deLocale, enUS as enLocale } from 'date-fns/locale';
import { useAuthStore } from '../store/useAuthStore';
import { useServerStore } from '../store/useServerStore';
import { useChatStore } from '../store/useChatStore';
import { useNavigate } from 'react-router-dom';
import { UserBadges } from './UserBadges';
import { ActivityPanel } from './ActivityPanel';
import { isManualCustomStatus } from '../lib/userPresence';
import StatusIndicator, { getDisplayStatus } from './StatusIndicator';
import { getClientPlatform } from '../lib/platform';

type UserProfile = {
  id: string;
  username: string;
  displayName?: string | null;
  email?: string;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  pronouns?: string | null;
  status?: string | null;
  customStatus?: string | null;
  activities?: string | null;
  platform?: 'web' | 'desktop' | 'mobile' | null;
  platformBanReason?: string | null;
  platformBanExpiresAt?: string | null;
  platformBanCreatedAt?: string | null;
  systemRole?: string | null;
  bio?: string | null;
  createdAt?: string;
  allowDownloads?: boolean;
  badges?: string[];
};

type ServerMemberInfo = {
  nickname?: string | null;
  joinedAt?: string;
  roleIds?: string[];
  roles?: Array<{
    id: string;
    name: string;
    color: string;
  }>;
};

type Props = {
  user: UserProfile;
  serverMemberInfo?: ServerMemberInfo | null;
  isOpen: boolean;
  onClose: () => void;
  language?: string;
  isMe?: boolean;
  serverId?: string;
  canModerate?: boolean;
};

export default function UserProfileModal({
  user,
  serverMemberInfo,
  isOpen,
  onClose,
  language = 'en',
  isMe = false,
  serverId,
  canModerate = false,
}: Props) {
  const { t } = useTranslation();
  const token = useAuthStore(state => state.token);
  const setAuth = useAuthStore(state => state.setAuth);
  const me = useAuthStore(state => state.user);
  const cachedFriends = useServerStore(state => state.cachedFriends);
  const cachedDms = useServerStore(state => state.cachedDms);
  const navigate = useNavigate();
  const socket = useChatStore(state => state.socket);
  const setActiveCall = useChatStore(state => state.setActiveCall);

  const [currentUser, setCurrentUser] = useState<UserProfile>(user);
  const [currentMemberInfo, setCurrentMemberInfo] = useState<ServerMemberInfo | null>(serverMemberInfo || null);

  useEffect(() => {
    setCurrentUser(user);
    setCurrentMemberInfo(serverMemberInfo || null);
  }, [user, serverMemberInfo]);

  useEffect(() => {
    if (isOpen && user.id) {
      // Fetch fresh profile data to get platform ban status for CEO
      api(`/api/users/${user.id}`, {}, token)
        .then(res => res.json())
        .then(data => {
          if (data?.user) {
            setCurrentUser(data.user);
          }
        })
        .catch(err => console.error('Failed to load user details:', err));
    }
  }, [isOpen, user.id, token]);

  const [isEditingStatus, setIsEditingStatus] = useState(false);
  const [editStatus, setEditStatus] = useState(currentUser.status || 'online');
  const [editCustomStatus, setEditCustomStatus] = useState(currentUser.customStatus || '');
  const [isSaving, setIsSaving] = useState(false);
  const [moderationDialog, setModerationDialog] = useState<null | 'timeout' | 'kick' | 'server-ban' | 'platform-ban'>(null);
  const [moderationReason, setModerationReason] = useState('');
  const [moderationDurationMinutes, setModerationDurationMinutes] = useState('');
  const [moderationBusy, setModerationBusy] = useState(false);
  const [moderationError, setModerationError] = useState('');
  const [profileTab, setProfileTab] = useState<'overview' | 'activity' | 'mutual-friends'>('overview');
  const [note, setNote] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [mutualFriends, setMutualFriends] = useState<any[]>([]);
  const [isLoadingMutual, setIsLoadingMutual] = useState(false);
  const [showRolePicker, setShowRolePicker] = useState(false);

  const cachedServerInfos = useServerStore(state => state.cachedServerInfos);
  const serverInfo = serverId ? cachedServerInfos[serverId] : null;
  const availableRoles = serverInfo?.roles?.filter((r: any) => !r.isDefault) || [];

  const dateLocale = language === 'de' ? deLocale : enLocale;
  const displayName = currentUser.displayName || currentUser.username;
  const joinedDate = currentMemberInfo?.joinedAt
    ? format(new Date(currentMemberInfo.joinedAt), 'PP', { locale: dateLocale })
    : null;

  const isActuallyMe = isMe || (me && me.id === currentUser.id);
  const displayStatus = getDisplayStatus(currentUser.status);
  const resolvedPlatform = isActuallyMe ? getClientPlatform() : (currentUser.platform ?? 'web');
  const effectiveCanModerate = canModerate || me?.systemRole === 'CEO' || me?.systemRole === 'MODERATOR';
  const friendStatus = useMemo(() => {
    if (isActuallyMe) return null;
    if (!cachedFriends) return 'NONE';
    const f = cachedFriends.find((f: any) => f.user?.id === currentUser.id || f.id === currentUser.id || f.recipientId === currentUser.id || f.requesterId === currentUser.id);
    if (!f) return 'NONE';
    if (f.status === 'ACCEPTED') return 'FRIEND';
    if (f.status === 'PENDING' && f.direction === 'outgoing') return 'PENDING_OUT';
    if (f.status === 'PENDING' && f.direction === 'incoming') return 'PENDING_IN';
    return 'NONE';
  }, [cachedFriends, currentUser.id, isActuallyMe]);

  useEffect(() => {
    if (isOpen && currentUser.id && !isActuallyMe) {
      setNote('');
      api(`/api/users/notes/${currentUser.id}`, {}, token)
        .then(res => res.json())
        .then(data => {
          if (data && typeof data.note === 'string') {
            setNote(data.note);
          }
        })
        .catch(err => console.error('Failed to load user note:', err));

      setIsLoadingMutual(true);
      setMutualFriends([]);
      api(`/api/friends/mutual/${currentUser.id}`, {}, token)
        .then(res => res.json())
        .then(data => {
          if (data && Array.isArray(data.mutualFriends)) {
            setMutualFriends(data.mutualFriends);
          }
        })
        .catch(err => console.error('Failed to load mutual friends:', err))
        .finally(() => setIsLoadingMutual(false));
    }
  }, [isOpen, currentUser.id, isActuallyMe, token]);

  const handleSaveNote = async (newNote: string) => {
    if (!token || isActuallyMe) return;
    setIsSavingNote(true);
    try {
      await api(`/api/users/notes/${currentUser.id}`, {
        method: 'PUT',
        body: JSON.stringify({ note: newNote }),
      }, token);
    } catch (err) {
      console.error('Failed to save user note:', err);
    } finally {
      setIsSavingNote(false);
    }
  };


  useEffect(() => {
    if (isOpen) {
      if (editStatus !== (currentUser.status || 'online')) setEditStatus(currentUser.status || 'online');
      if (editCustomStatus !== (currentUser.customStatus || '')) setEditCustomStatus(currentUser.customStatus || '');
    }
  }, [isOpen, currentUser.status, currentUser.customStatus]);

  useEffect(() => {
    if (!isOpen) {
      setProfileTab('overview');
      setModerationDialog(null);
      setModerationReason('');
      setModerationDurationMinutes('');
      setModerationError('');
      setModerationBusy(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleBackgroundClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const openModerationDialog = (type: 'timeout' | 'kick' | 'server-ban' | 'platform-ban') => {
    setModerationDialog(type);
    setModerationReason('');
    setModerationDurationMinutes('');
    setModerationError('');
  };

  const closeModerationDialog = () => {
    if (moderationBusy) return;
    setModerationDialog(null);
    setModerationReason('');
    setModerationDurationMinutes('');
    setModerationError('');
  };

  const readErrorMessage = async (res: Response, fallback: string) => {
    try {
      const text = await res.text();
      if (!text) return fallback;
      const parsed = JSON.parse(text);
      return parsed?.message || parsed?.error || fallback;
    } catch {
      return fallback;
    }
  };

  const handleSaveStatus = async () => {
    if (!token) return;
    setIsSaving(true);
    try {
      const res = await api('/api/users/me', {
        method: 'PATCH',
        body: JSON.stringify({
          status: editStatus,
          customStatus: editCustomStatus.trim() || null
        })
      }, token);

      if (res.ok) {
        let data: any = {};
        try {
          const text = await res.text();
          if (text) data = JSON.parse(text);
        } catch (e) { }
        setAuth(data.user, token);
        setIsEditingStatus(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddFriend = async () => {
    if (!token) return;
    try {
      await api('/api/friends', {
        method: 'POST',
        body: JSON.stringify({ username: currentUser.username })
      }, token);
      onClose();
    } catch (e) { }
  };

  const handleRemoveFriend = async () => {
    if (!token) return;
    const f = cachedFriends.find((f: any) => f.user?.id === currentUser.id || f.id === currentUser.id || f.recipientId === currentUser.id || f.requesterId === currentUser.id);
    if (f) {
      await api(`/api/friends/${f.id}`, { method: 'DELETE' }, token);
      onClose();
    }
  };

  const handleStartCall = async () => {
    if (!token) return;
    // Find or create DM
    let dmChannelId = null;
    const existingDm = cachedDms ? cachedDms.find((c: any) => !c.isGroup && c.members.some((m: any) => m.userId === currentUser.id)) : null;
    if (existingDm) {
      dmChannelId = existingDm.id;
    } else {
      try {
        const res = await api('/api/dms', {
          method: 'POST',
          body: JSON.stringify({ userIds: [currentUser.id] })
        }, token);
        if (res.ok) {
          let data: any = {};
          try {
            const text = await res.text();
            if (text) data = JSON.parse(text);
          } catch (e) { }
          dmChannelId = data.channel?.id;
        }
      } catch (e) { }
    }

    if (dmChannelId) {
      onClose();
      navigate(`/app/dms/@${currentUser.username}`);
      setActiveCall({ channelId: dmChannelId, isDm: true, minimized: false });
      if (socket) {
        socket.emit('voice:ring', { channelId: dmChannelId });
      }
    }
  };

  const handleModeration = async (updates: Record<string, any>) => {
    if (!token || !serverId) return;
    const res = await api(`/api/servers/${serverId}/members/${currentUser.id}/moderation`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    }, token);
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, 'Error updating member'));
    }
    const data = await res.json();
    if (data?.member) {
      setCurrentMemberInfo(data.member);
    }
  };

  const handleKick = async () => {
    if (!token || !serverId) return;
    const res = await api(`/api/servers/${serverId}/members/${currentUser.id}`, { method: 'DELETE' }, token);
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, 'Error kicking member'));
    }
  };

  const handleBan = async () => {
    if (!token || !serverId) return;
    const res = await api(`/api/servers/${serverId}/bans/${currentUser.id}`, {
      method: 'POST',
      body: JSON.stringify({ reason: moderationReason.trim() || null })
    }, token);
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, 'Error banning member'));
    }
  };

  const handlePlatformBan = async () => {
    if (!token || (me?.systemRole !== 'CEO' && me?.systemRole !== 'MODERATOR')) return;
    const trimmed = moderationDurationMinutes.trim();
    const durationMinutes = trimmed ? Number(trimmed) : null;
    if (trimmed && (!Number.isFinite(durationMinutes) || durationMinutes <= 0)) {
      throw new Error('Please enter a valid number of minutes or leave it empty for a permanent ban.');
    }

    const res = await api(`/api/users/${currentUser.id}/platform-ban`, {
      method: 'POST',
      body: JSON.stringify({
        reason: moderationReason.trim() || null,
        durationMinutes,
      }),
    }, token);
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, 'Error platform banning user'));
    }
    const data = await res.json();
    if (data?.user) {
      setCurrentUser(data.user);
    }
  };

  const handleRemovePlatformBan = async () => {
    if (!token || (me?.systemRole !== 'CEO' && me?.systemRole !== 'MODERATOR')) return;
    setModerationBusy(true);
    setModerationError('');
    try {
      const res = await api(`/api/users/${currentUser.id}/platform-ban`, {
        method: 'DELETE',
      }, token);
      if (!res.ok) {
        throw new Error(await readErrorMessage(res, 'Error removing platform ban'));
      }
      const data = await res.json();
      if (data?.user) {
        setCurrentUser(data.user);
      }
    } catch (e: any) {
      setModerationError(e?.message || 'Error removing platform ban');
    } finally {
      setModerationBusy(false);
    }
  };

  const handleAddRole = async (roleId: string) => {
    if (!serverId || !effectiveCanModerate || !token) return;
    try {
      const currentRoleIds = currentMemberInfo?.roleIds || [];
      if (currentRoleIds.includes(roleId)) return;
      const newRoleIds = [...currentRoleIds, roleId];
      
      const res = await api(`/api/servers/${serverId}/members/${currentUser.id}/roles`, {
        method: 'PUT',
        body: JSON.stringify({ roleIds: newRoleIds })
      }, token);
      
      if (!res.ok) throw new Error('Failed to add role');
      const data = await res.json();
      if (data.member) {
        setCurrentMemberInfo(data.member);
      }
      setShowRolePicker(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveRole = async (roleId: string) => {
    if (!serverId || !effectiveCanModerate || !token) return;
    try {
      const currentRoleIds = currentMemberInfo?.roleIds || [];
      const newRoleIds = currentRoleIds.filter(id => id !== roleId);
      
      const res = await api(`/api/servers/${serverId}/members/${currentUser.id}/roles`, {
        method: 'PUT',
        body: JSON.stringify({ roleIds: newRoleIds })
      }, token);
      
      if (!res.ok) throw new Error('Failed to remove role');
      const data = await res.json();
      if (data.member) {
        setCurrentMemberInfo(data.member);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const submitModerationDialog = async () => {
    if (!moderationDialog) return;
    setModerationBusy(true);
    setModerationError('');

    try {
      if (moderationDialog === 'timeout') {
        const minutes = Number(moderationDurationMinutes.trim());
        if (!Number.isFinite(minutes) || minutes <= 0) {
          throw new Error('Bitte gib eine gueltige Anzahl Minuten ein.');
        }
        const timeoutUntil = new Date(Date.now() + minutes * 60 * 1000).toISOString();
        await handleModeration({ timeoutUntil });
      }

      if (moderationDialog === 'kick') {
        await handleKick();
      }

      if (moderationDialog === 'server-ban') {
        await handleBan();
      }

      if (moderationDialog === 'platform-ban') {
        await handlePlatformBan();
      }

      setModerationDialog(null);
      setModerationReason('');
      setModerationDurationMinutes('');
      setModerationError('');
      onClose();
    } catch (e: any) {
      setModerationError(e?.message || 'Action failed');
    } finally {
      setModerationBusy(false);
    }
  };

  const moderationDialogTitle =
    moderationDialog === 'timeout' ? 'Timeout' :
      moderationDialog === 'kick' ? 'Kick User' :
        moderationDialog === 'server-ban' ? 'Server Ban' :
          moderationDialog === 'platform-ban' ? t('platform_ban') :
            '';

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fadeIn"
      onClick={handleBackgroundClick}
    >
      <div className={`relative w-full ${profileTab === 'activity' ? 'max-w-md' : 'max-w-sm'} bg-softspace-900 rounded-2xl shadow-2xl overflow-hidden border border-softspace-800 transition-all`}>

        {/* Banner */}
        <div className="h-20 bg-gradient-to-r from-softspace-600/30 to-softspace-800/30 relative shrink-0">
          {currentUser.bannerUrl && (
            <img
              src={assetUrl(currentUser.bannerUrl)}
              alt="Banner"
              className="w-full h-full object-cover pointer-events-none select-none opacity-80"
              draggable="false"
              onContextMenu={(e) => e.preventDefault()}
            />
          )}
        </div>

        <div className="px-5 relative">
          {/* Avatar */}
          <div className="absolute -top-10 left-4 p-1.5 bg-softspace-900 rounded-full">
            <div className="w-16 h-16 bg-softspace-800 rounded-full flex items-center justify-center overflow-hidden pointer-events-none select-none">
              {currentUser.avatarUrl ? (
                <img
                  src={assetUrl(currentUser.avatarUrl)}
                  alt={displayName}
                  className="w-full h-full object-cover pointer-events-none select-none"
                  draggable="false"
                  onContextMenu={(e) => e.preventDefault()}
                />
              ) : (
                <UserIcon size={32} className="text-softspace-400" />
              )}
            </div>
          </div>

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 bg-softspace-900/50 hover:bg-softspace-800 rounded-full text-softspace-400 hover:text-softspace-100 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X size={16} />
          </button>

          {/* Spacing for avatar */}
          <div className="h-10" />

          {/* User Info Header */}
          <div className="pb-4">
            <h2 className="text-xl font-bold text-softspace-50 flex items-baseline gap-2">
              {displayName}
              {currentMemberInfo?.nickname && (
                <span className="text-sm font-normal text-softspace-400">
                  ({currentMemberInfo.nickname})
                </span>
              )}
            </h2>
            <div className="text-sm text-softspace-400">@{currentUser.username}</div>

            {/* Custom Status (manual text only) */}
            {isManualCustomStatus(currentUser.customStatus) && !isEditingStatus && (
              <div className="mt-3 text-base font-medium text-softspace-200 italic">
                {currentUser.customStatus.replace(/\[\[ce:(?:EMOJI|GIF):([^:\]]+):[^\]]+\]\]/g, ':$1:')}
              </div>
            )}

            {isActuallyMe && isEditingStatus ? (
              <div className="mt-4 space-y-3 bg-softspace-950/50 p-3 rounded-xl border border-softspace-800">
                <div>
                  <label className="text-xs font-bold text-softspace-400 uppercase">{t('status')}</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full mt-1 bg-softspace-900 border border-softspace-700 rounded-lg px-2 py-1.5 text-sm text-softspace-100 focus:outline-none focus:border-softspace-500"
                  >
                    <option value="online">{t('status_online')}</option>
                    <option value="idle">{t('status_idle')}</option>
                    <option value="dnd">{t('status_dnd')}</option>
                    <option value="invisible">{t('status_invisible')}</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-softspace-400 uppercase">{t('custom_status')}</label>
                  <input
                    type="text"
                    maxLength={150}
                    value={editCustomStatus}
                    onChange={(e) => setEditCustomStatus(e.target.value)}
                    placeholder={t('custom_status_placeholder')}
                    className="w-full mt-1 bg-softspace-900 border border-softspace-700 rounded-lg px-2 py-1.5 text-sm text-softspace-100 focus:outline-none focus:border-softspace-500"
                  />
                  <div className="text-[10px] text-softspace-500 text-right mt-1">
                    {editCustomStatus.length}/150
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingStatus(false)}
                    className="text-xs px-3 py-1.5 rounded-lg hover:bg-softspace-800 text-softspace-300 transition-colors"
                  >
                    {t('cancel_btn')}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveStatus}
                    disabled={isSaving}
                    className="text-xs px-3 py-1.5 rounded-lg bg-softspace-500 hover:bg-softspace-400 text-white font-medium transition-colors disabled:opacity-50"
                  >
                    {t('save')}
                  </button>
                </div>
              </div>
            ) : (
              /* Badges / Status */
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap gap-2 items-center">
                  {currentUser.systemRole === 'CEO' && (
                    <span className="text-xs bg-orange-500 text-white px-2 py-0.5 rounded font-bold uppercase">
                      CEO
                    </span>
                  )}

                  {currentUser.pronouns && (
                    <span className="text-xs bg-softspace-800 text-softspace-300 px-2 py-0.5 rounded font-medium">
                      {currentUser.pronouns}
                    </span>
                  )}
                  <UserBadges badges={currentUser.badges} />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {currentUser.status && (
                      <span className="text-xs bg-softspace-800 text-softspace-300 px-2 py-0.5 rounded font-medium capitalize flex items-center gap-1.5">
                        <StatusIndicator status={currentUser.status} platform={resolvedPlatform} />
                        {displayStatus}
                      </span>
                    )}
                  </div>

                  {isActuallyMe && !isEditingStatus && (
                    <button
                      type="button"
                      onClick={() => setIsEditingStatus(true)}
                      className="text-xs bg-softspace-800 hover:bg-softspace-700 text-softspace-300 px-2 py-1 rounded font-medium transition-colors cursor-pointer"
                    >
                      {t('edit_profile').replace(' profile', '')}
                    </button>
                  )}

                  {!isActuallyMe && (
                    <div className="flex flex-wrap items-center gap-1.5 justify-end">
                      {friendStatus === 'FRIEND' && (
                        <button
                          type="button"
                          onClick={handleStartCall}
                          className="text-xs bg-green-600 hover:bg-green-500 text-white px-2 py-1 rounded font-medium transition-colors cursor-pointer flex items-center gap-1"
                          title={t('call_btn')}
                        >
                          <Phone size={12} /> {t('call_btn')}
                        </button>
                      )}

                      {friendStatus === 'NONE' && (
                        <button
                          type="button"
                          onClick={handleAddFriend}
                          className="text-xs bg-softspace-500 hover:bg-softspace-400 text-white px-2 py-1 rounded font-medium transition-colors cursor-pointer flex items-center gap-1"
                          title={t('add_btn')}
                        >
                          <UserPlus size={12} /> {t('add_btn')}
                        </button>
                      )}

                      {friendStatus === 'FRIEND' && (
                        <button
                          type="button"
                          onClick={handleRemoveFriend}
                          className="text-xs bg-red-500/20 hover:bg-red-500/30 text-red-400 px-2 py-1 rounded font-medium transition-colors cursor-pointer flex items-center gap-1"
                          title={t('remove_btn')}
                        >
                          <UserMinus size={12} /> {t('remove_btn')}
                        </button>
                      )}

                      {friendStatus === 'PENDING_OUT' && (
                        <button
                          type="button"
                          onClick={handleRemoveFriend}
                          className="text-xs bg-softspace-700 text-softspace-300 px-2 py-1 rounded font-medium transition-colors cursor-pointer flex items-center gap-1"
                          title={t('cancel_btn')}
                        >
                          <X size={12} /> {t('cancel_btn')}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="h-px bg-softspace-800 my-1" />

          <div className="px-5 flex gap-1 border-b border-softspace-800">
            <button
              type="button"
              onClick={() => setProfileTab('overview')}
              className={`px-3 py-2 text-sm font-semibold border-b-2 transition-colors ${profileTab === 'overview'
                  ? 'border-softspace-200 text-softspace-100'
                  : 'border-transparent text-softspace-500 hover:text-softspace-300'
                }`}
            >
              {t('profile_tab_overview')}
            </button>
            <button
              type="button"
              onClick={() => setProfileTab('activity')}
              className={`px-3 py-2 text-sm font-semibold border-b-2 transition-colors ${profileTab === 'activity'
                  ? 'border-softspace-200 text-softspace-100'
                  : 'border-transparent text-softspace-500 hover:text-softspace-300'
                }`}
            >
              {t('profile_tab_activity')}
            </button>
            {!isActuallyMe && (
              <button
                type="button"
                onClick={() => setProfileTab('mutual-friends')}
                className={`px-3 py-2 text-sm font-semibold border-b-2 transition-colors ${profileTab === 'mutual-friends'
                    ? 'border-softspace-200 text-softspace-100'
                    : 'border-transparent text-softspace-500 hover:text-softspace-300'
                  }`}
              >
                {t('mutual_friends')} ({mutualFriends.length})
              </button>
            )}
          </div>

          {/* Body */}
          <div className="py-4 space-y-4 px-5">
            {profileTab === 'activity' ? (
              <ActivityPanel activitiesRaw={currentUser.activities} />
            ) : profileTab === 'mutual-friends' ? (
              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {isLoadingMutual ? (
                  <div className="text-sm text-softspace-400 text-center py-4">{t('loading')}</div>
                ) : mutualFriends.length === 0 ? (
                  <div className="text-sm text-softspace-400 text-center py-4">{t('no_mutual_friends')}</div>
                ) : (
                  mutualFriends.map(friend => (
                    <div
                      key={friend.id}
                      className="flex items-center gap-3 p-2 rounded-xl hover:bg-softspace-800/40 transition-colors cursor-pointer"
                      onClick={() => {
                        onClose();
                        navigate(`/app/dms/@${friend.username}`);
                      }}
                    >
                      <div className="w-9 h-9 rounded-full bg-softspace-800 flex items-center justify-center overflow-hidden shrink-0 relative">
                        {friend.avatarUrl ? (
                          <img
                            src={assetUrl(friend.avatarUrl)}
                            alt={friend.username}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <UserIcon size={18} className="text-softspace-400" />
                        )}
                        {friend.status && (
                          <div className="absolute bottom-0 right-0 border border-softspace-900 rounded-full">
                            <StatusIndicator status={friend.status} platform={friend.platform} size="sm" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-softspace-100 truncate">
                          {friend.displayName || friend.username}
                        </div>
                        <div className="text-xs text-softspace-400 truncate">
                          @{friend.username}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <>

                {/* Platform Moderation */}
                {!isActuallyMe && (me?.systemRole === 'CEO' || me?.systemRole === 'MODERATOR') && (
                  <div className="bg-softspace-950/40 p-3 rounded-xl border border-red-900/30">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-[11px] font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                        <ShieldAlert size={12} /> {t('platform_moderation')}
                      </h3>
                      {currentUser.platformBanCreatedAt && (
                        <span className="text-[10px] font-bold uppercase bg-red-500 text-white px-1.5 py-0.5 rounded">
                          {t('platform_ban_banned')}
                        </span>
                      )}
                    </div>
                    {currentUser.platformBanCreatedAt && (
                      <div className="text-xs text-softspace-300 mb-3 space-y-1 bg-softspace-950/60 p-2 rounded border border-softspace-800">
                        <div>
                          <span className="text-softspace-500 font-semibold">{t('platform_ban_reason')}</span>{' '}
                          {currentUser.platformBanReason || t('platform_ban_no_reason')}
                        </div>
                        <div>
                          <span className="text-softspace-500 font-semibold">{t('platform_ban_expires')}</span>{' '}
                          {currentUser.platformBanExpiresAt
                            ? new Date(currentUser.platformBanExpiresAt).toLocaleString(language === 'de' ? 'de-DE' : 'en-US')
                            : t('platform_ban_permanent')}
                        </div>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openModerationDialog('platform-ban')}
                        className="text-[11px] bg-red-600/20 hover:bg-red-600/30 text-red-300 px-2 py-1 rounded transition-colors"
                      >
                        {t('platform_ban')}
                      </button>
                      <button
                        type="button"
                        onClick={handleRemovePlatformBan}
                        className="text-[11px] bg-green-600/20 hover:bg-green-600/30 text-green-300 px-2 py-1 rounded transition-colors"
                      >
                        {t('platform_ban_unban')}
                      </button>
                    </div>
                  </div>
                )}

                {/* Server Moderation */}
                {!isActuallyMe && effectiveCanModerate && serverId && !window.location.pathname.includes('/app/dms') && (
                  <div className="bg-softspace-950/40 p-3 rounded-xl border border-red-900/30">
                    <h3 className="text-[11px] font-bold text-red-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <ShieldAlert size={12} /> {t('moderation')}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          openModerationDialog('timeout');
                        }}
                        className="text-[11px] bg-softspace-800 hover:bg-softspace-700 text-softspace-200 px-2 py-1 rounded transition-colors"
                      >
                        Timeout
                      </button>
                      <button
                        type="button"
                        onClick={() => handleModeration({ isMuted: true })}
                        className="text-[11px] bg-softspace-800 hover:bg-softspace-700 text-softspace-200 px-2 py-1 rounded transition-colors flex items-center gap-1"
                      >
                        <MicOff size={10} /> {t('mute')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleModeration({ isDeafened: true })}
                        className="text-[11px] bg-softspace-800 hover:bg-softspace-700 text-softspace-200 px-2 py-1 rounded transition-colors flex items-center gap-1"
                      >
                        <VolumeX size={10} /> {t('deafen')}
                      </button>
                      <button
                        type="button"
                        onClick={() => openModerationDialog('kick')}
                        className="text-[11px] bg-red-500/10 hover:bg-red-500/20 text-red-400 px-2 py-1 rounded transition-colors"
                      >
                        {t('kick')}
                      </button>
                      <button
                        type="button"
                        onClick={() => openModerationDialog('server-ban')}
                        className="text-[11px] bg-red-500/20 hover:bg-red-500/30 text-red-400 px-2 py-1 rounded transition-colors flex items-center gap-1"
                      >
                        <Ban size={10} /> Ban
                      </button>
                    </div>
                  </div>
                )}

                {moderationDialog && (
                  <div className="bg-softspace-950/70 p-3 rounded-xl border border-red-900/30 mt-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <h3 className="text-sm font-bold text-red-400 flex items-center gap-1.5">
                        <ShieldAlert size={14} /> {moderationDialogTitle}
                      </h3>
                      <button
                        type="button"
                        onClick={closeModerationDialog}
                        className="text-softspace-400 hover:text-softspace-100 transition-colors"
                        disabled={moderationBusy}
                      >
                        <X size={16} />
                      </button>
                    </div>

                    <div className="space-y-3">
                      {moderationDialog === 'kick' && (
                        <div className="text-sm text-softspace-300">
                          Willst du {displayName} wirklich vom Server kicken?
                        </div>
                      )}

                      {(moderationDialog === 'server-ban' || moderationDialog === 'platform-ban') && (
                        <div>
                          <label className="text-xs font-bold text-softspace-400 uppercase">Reason</label>
                          <textarea
                            value={moderationReason}
                            onChange={(e) => setModerationReason(e.target.value)}
                            rows={3}
                            placeholder="Optionaler Grund"
                            className="w-full mt-1 bg-softspace-900 border border-softspace-700 rounded-lg px-3 py-2 text-sm text-softspace-100 focus:outline-none focus:border-softspace-500 resize-none"
                          />
                        </div>
                      )}

                      {(moderationDialog === 'timeout' || moderationDialog === 'platform-ban') && (
                        <div>
                          <label className="text-xs font-bold text-softspace-400 uppercase">
                            {moderationDialog === 'timeout' ? 'Minuten' : 'Dauer in Minuten'}
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={moderationDurationMinutes}
                            onChange={(e) => setModerationDurationMinutes(e.target.value)}
                            placeholder={moderationDialog === 'platform-ban' ? (me?.systemRole === 'MODERATOR' ? t('platform_ban_max_24h_placeholder') : t('platform_ban_permanent_placeholder')) : '60'}
                            className="w-full mt-1 bg-softspace-900 border border-softspace-700 rounded-lg px-3 py-2 text-sm text-softspace-100 focus:outline-none focus:border-softspace-500"
                          />
                          {moderationDialog === 'platform-ban' && (
                            <div className="text-[11px] text-softspace-500 mt-1">
                              {me?.systemRole === 'MODERATOR' ? t('platform_ban_max_24h_hint') : t('platform_ban_permanent_hint')}
                            </div>
                          )}
                        </div>
                      )}

                      {moderationError && (
                        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                          {moderationError}
                        </div>
                      )}

                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={closeModerationDialog}
                          disabled={moderationBusy}
                          className="text-xs px-3 py-2 rounded-lg hover:bg-softspace-800 text-softspace-300 transition-colors disabled:opacity-50"
                        >
                          {t('cancel_btn')}
                        </button>
                        <button
                          type="button"
                          onClick={submitModerationDialog}
                          disabled={moderationBusy}
                          className="text-xs px-3 py-2 rounded-lg bg-red-500 hover:bg-red-400 text-white font-medium transition-colors disabled:opacity-50"
                        >
                          {moderationBusy ? t('please_wait') : t('confirm_btn')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Bio */}
                {currentUser.bio && (
                  <div>
                    <h3 className="text-[11px] font-bold text-softspace-500 uppercase tracking-wider mb-1.5">
                      {t('about_me')}
                    </h3>
                    <p className="text-sm text-softspace-200 whitespace-pre-wrap leading-relaxed">
                      {currentUser.bio}
                    </p>
                  </div>
                )}

                {/* User Note */}
                {!isActuallyMe && (
                  <div>
                    <h3 className="text-[11px] font-bold text-softspace-500 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                      <span>{t('user_note')}</span>
                      {isSavingNote && <span className="text-[10px] text-softspace-400 normal-case font-normal">{t('saving')}</span>}
                    </h3>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      onBlur={() => handleSaveNote(note)}
                      placeholder={t('user_note_placeholder')}
                      rows={3}
                      className="w-full bg-softspace-950 border border-softspace-800 rounded-xl px-3 py-2 text-sm text-softspace-100 placeholder-softspace-500 focus:outline-none focus:border-softspace-500 resize-none transition-colors"
                    />
                  </div>
                )}


                {/* Roles */}
                {serverId && (
                  <div className="relative pb-2">
                    <h3 className="text-[11px] font-bold text-softspace-500 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                      {t('roles')}
                      {effectiveCanModerate && (
                        <button
                          onClick={() => setShowRolePicker(!showRolePicker)}
                          className="text-softspace-400 hover:text-white transition-colors"
                        >
                          <UserPlus size={12} />
                        </button>
                      )}
                    </h3>
                    
                    <div className="flex flex-wrap gap-1.5">
                      {currentMemberInfo?.roles?.map(role => (
                        <div
                          key={role.id}
                          className="flex items-center gap-1.5 text-xs px-2 py-1 rounded bg-softspace-950 border border-softspace-800"
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: role.color }}
                          />
                          <span className="text-softspace-200 font-medium">{role.name}</span>
                          {effectiveCanModerate && (
                            <button
                              onClick={() => handleRemoveRole(role.id)}
                              className="text-softspace-500 hover:text-red-400 ml-1 transition-colors"
                            >
                              <X size={10} />
                            </button>
                          )}
                        </div>
                      ))}
                      {(!currentMemberInfo?.roles || currentMemberInfo.roles.length === 0) && (
                        <span className="text-xs text-softspace-500 italic">Keine Rollen</span>
                      )}
                    </div>

                    {showRolePicker && effectiveCanModerate && (
                      <div className="absolute top-full right-0 mt-2 w-48 bg-softspace-900 border border-softspace-800 rounded-xl shadow-2xl z-[60] p-2 max-h-48 overflow-y-auto">
                        <div className="text-[10px] font-bold text-softspace-500 uppercase mb-2 px-1">Rolle hinzufügen</div>
                        {availableRoles.filter(r => !currentMemberInfo?.roles?.some(mr => mr.id === r.id)).map(role => (
                          <button
                            key={role.id}
                            onClick={() => handleAddRole(role.id)}
                            className="w-full flex items-center gap-2 text-sm text-softspace-300 hover:text-white hover:bg-softspace-800 px-2 py-1.5 rounded-lg transition-colors text-left"
                          >
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: role.color }} />
                            <span className="truncate">{role.name}</span>
                          </button>
                        ))}
                        {availableRoles.filter(r => !currentMemberInfo?.roles?.some(mr => mr.id === r.id)).length === 0 && (
                          <div className="text-xs text-softspace-500 px-1 py-2 text-center">Keine weiteren Rollen verfügbar</div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Joined Date */}
                {joinedDate && (
                  <div>
                    <h3 className="text-[11px] font-bold text-softspace-500 uppercase tracking-wider mb-1">
                      {t('joined_server')}
                    </h3>
                    <div className="text-xs text-softspace-300">
                      {joinedDate}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

        </div>
      </div>
    </div>,
    document.body
  );
}
