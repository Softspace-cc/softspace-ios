import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLayoutStore } from '../store/useLayoutStore';
import {
  Hash,
  Mic,
  Menu,
  Send,
  Smile,
  Paperclip,
  X,
  Trash2,
  Pencil,
  Reply,
  CornerUpLeft,
  Folder,
  ZoomIn,
  ZoomOut,
  Download,
  Lock,
  Search,
  Users,
  Phone,
  PhoneOff,
  ChevronUp,
  ChevronDown,
  GripHorizontal,
  Upload
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { useChatStore } from '../store/useChatStore';
import { useServerStore } from '../store/useServerStore';
import { useParams, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { de as deLocale, enUS as enLocale } from 'date-fns/locale';
import UserProfileModal from './UserProfileModal';
import { MemberList } from './MemberList';
import { api, assetUrl, API_URL } from '../lib/api';
import { ChannelSidebar } from './ChannelSidebar';
import { UserBadges } from './UserBadges';
import EmojiPicker, { Theme, EmojiStyle } from 'emoji-picker-react';

type ChatUser = {
  id: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  pronouns?: string | null;
  status?: string | null;
  systemRole?: string | null;
  allowDownloads?: boolean;
  badges?: string[];
};

type Attachment = {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  size: number;
  width?: number | null;
  height?: number | null;
};

type Reaction = {
  id: string;
  userId: string;
  emoji: string;
  messageId?: string | null;
  dmMessageId?: string | null;
};

type ChatMessage = {
  id: string;
  localId?: string;
  channelId?: string;
  dmChannelId?: string;
  authorId: string;
  author: ChatUser;
  content: string;
  messageType?: 'USER' | 'CALL_STARTED' | 'CALL_ENDED' | string;
  callMeta?: {
    startedBy?: string;
    startedAt?: string;
    endedAt?: string;
    endedBy?: string;
    durationSec?: number;
    user?: ChatUser | null;
  } | null;
  createdAt: string;
  editedAt?: string | null;
  replyToId?: string | null;
  replyTo?: {
    id: string;
    authorId: string;
    content: string;
    author: ChatUser;
  } | null;
  attachments?: Attachment[];
  reactions?: Reaction[];
  mentionedRoleIds?: string[];
};

type ChannelInfo = {
  id: string;
  serverId: string;
  name: string;
  type: 'TEXT' | 'VOICE' | 'CATEGORY' | string;
  topic?: string | null;
  parentId?: string | null;
  position: number;
  permissionOverrides?: string | null;
};

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
  timeoutUntil?: string | null;
  isMuted?: boolean;
  isDeafened?: boolean;
  user?: {
    id: string;
    username: string;
    displayName?: string | null;
    avatarUrl?: string | null;
    pronouns?: string | null;
    status?: string | null;
    allowDownloads?: boolean;
  } | null;
  roleIds?: string[];
};

type CustomEmojiItem = {
  id: string;
  name: string;
  url: string;
  type: 'EMOJI' | 'GIF';
  position: number;
};

export type ServerInfo = {
  id: string;
  name: string;
  ownerId?: string;
  channels?: ChannelInfo[] | null;
  roles?: RoleInfo[] | null;
};

const CUSTOM_EMOJI_TOKEN_RE = /\[\[ce:(EMOJI|GIF):([^:\]]+):([^\]]+)\]\]/g;

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildCustomEmojiToken(emoji: CustomEmojiItem) {
  return `[[ce:${emoji.type}:${encodeURIComponent(emoji.name)}:${encodeURIComponent(emoji.url)}]]`;
}

function encodeCustomEmojisInMessage(content: string, customEmojis: CustomEmojiItem[]) {
  let next = content;
  const sorted = [...customEmojis].sort((a, b) => b.name.length - a.name.length);
  for (const emoji of sorted) {
    const regex = new RegExp(escapeRegex(`:${emoji.name}:`), 'g');
    next = next.replace(regex, buildCustomEmojiToken(emoji));
  }
  return next;
}

function renderCustomEmojiInline(
  type: 'EMOJI' | 'GIF',
  nameEncoded: string,
  urlEncoded: string,
  key: string,
  compact = false
) {
  const name = decodeURIComponent(nameEncoded);
  const url = assetUrl(decodeURIComponent(urlEncoded));
  if (type === 'GIF') {
    return (
      <span
        key={key}
        className={`inline-flex align-middle overflow-hidden rounded-md border border-softspace-700 bg-softspace-900 mx-0.5 ${compact ? 'h-7 max-w-[56px]' : 'h-14 max-w-[120px]'
          }`}
        title={`:${name}:`}
      >
        <img src={url} alt={name} className="h-full w-full object-cover" />
      </span>
    );
  }

  return (
    <img
      key={key}
      src={url}
      alt={name}
      title={`:${name}:`}
      className={`inline-block align-text-bottom mx-0.5 ${compact ? 'h-6 w-6' : 'h-8 w-8'}`}
    />
  );
}

function renderReplyPreviewContent(content: string) {
  if (!content) return null;
  const nodes = [];
  let lastIndex = 0;
  let match;
  CUSTOM_EMOJI_TOKEN_RE.lastIndex = 0;

  while ((match = CUSTOM_EMOJI_TOKEN_RE.exec(content)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(<span key={`reply-text-${lastIndex}`}>{content.slice(lastIndex, match.index)}</span>);
    }
    nodes.push(renderCustomEmojiInline(match[1] as 'EMOJI' | 'GIF', match[2], match[3], `reply-emoji-${match.index}`, true));
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    nodes.push(<span key={`reply-text-tail-${lastIndex}`}>{content.slice(lastIndex)}</span>);
  }

  return nodes;
}

export default function ChatArea({ isDm = false }: { isDm?: boolean }) {
  const { t, i18n } = useTranslation();
  const { dmId: routeDmId } = useParams();
  const navigate = useNavigate();
  const me = useAuthStore(state => state.user);
  const token = useAuthStore(state => state.token);
  const socket = useChatStore(state => state.socket);
  const serverId = useChatStore(state => state.activeServerId) ?? undefined;
  const activeChannelId = useChatStore(state => state.activeChannelId) ?? undefined;

  const {
    mobileSidebarOpen, setMobileSidebarOpen,
    mobileChannelSidebarOpen, setMobileChannelSidebarOpen,
    mobileMemberListOpen, setMobileMemberListOpen
  } = useLayoutStore();

  const cachedServerInfos = useServerStore(state => state.cachedServerInfos);
  const cachedMembers = useServerStore(state => state.cachedMembers);
  const cachedMessages = useServerStore(state => state.cachedMessages);
  const cachedDms = useServerStore(state => state.cachedDms);
  const cachedFriends = useServerStore(state => state.cachedFriends);
  const setCachedDms = useServerStore(state => state.setCachedDms);
  const setCachedFriends = useServerStore(state => state.setCachedFriends);

  const dmId = useMemo(() => {
    if (!routeDmId) return routeDmId;
    if (routeDmId.startsWith('@')) {
      const username = routeDmId.slice(1).toLowerCase();
      if (!cachedDms) return routeDmId;
      const dm = cachedDms.find((c: any) =>
        !c.isGroup && c.members.some((m: any) => m.user?.username?.toLowerCase() === username)
      );
      return dm?.id || routeDmId;
    }
    // For group DMs, routeDmId might be the name or the ID
    if (cachedDms) {
      const dm = cachedDms.find((c: any) => c.id === routeDmId || c.name === routeDmId);
      if (dm) return dm.id;
    }
    return routeDmId;
  }, [routeDmId, cachedDms]);

  const currentActiveChannelId = isDm ? dmId : activeChannelId;

  const clearUnread = useChatStore(state => state.clearUnread);
  useEffect(() => {
    if (currentActiveChannelId) {
      clearUnread(currentActiveChannelId);
    }
  }, [currentActiveChannelId, clearUnread]);

  const activeCall = useChatStore(state => state.activeCall);
  const setActiveCall = useChatStore(state => state.setActiveCall);
  const voiceStates = useChatStore(state => state.voiceStates);
  const callSessions = useChatStore(state => state.callSessions);

  const setCachedServerInfo = useServerStore(state => state.setCachedServerInfo);
  const setCachedMembers = useServerStore(state => state.setCachedMembers);
  const setCachedMessages = useServerStore(state => state.setCachedMessages);

  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  const [newMessage, setNewMessage] = useState('');

  const CALL_PANEL_HEIGHT_KEY = 'softspace:dm-call-panel-height';
  const [callPanelHeight, setCallPanelHeight] = useState(() => {
    try {
      const stored = sessionStorage.getItem(CALL_PANEL_HEIGHT_KEY);
      const parsed = stored ? Number(stored) : 350;
      return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 180), Math.round(window.innerHeight * 0.75)) : 350;
    } catch {
      return 350;
    }
  });
  const callResizeRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const callPanelHeightRef = useRef(callPanelHeight);
  callPanelHeightRef.current = callPanelHeight;

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!callResizeRef.current) return;
      const delta = e.clientY - callResizeRef.current.startY;
      const maxHeight = Math.round(window.innerHeight * 0.75);
      const next = Math.min(Math.max(callResizeRef.current.startHeight + delta, 180), maxHeight);
      setCallPanelHeight(next);
    };
    const handleMouseUp = () => {
      if (!callResizeRef.current) return;
      callResizeRef.current = null;
      try {
        sessionStorage.setItem(CALL_PANEL_HEIGHT_KEY, String(callPanelHeightRef.current));
      } catch {
        // ignore
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const startCallPanelResize = (e: React.MouseEvent) => {
    e.preventDefault();
    callResizeRef.current = { startY: e.clientY, startHeight: callPanelHeight };
  };

  const refreshFriendsCache = useCallback(async () => {
    if (!token) return;
    const res = await api('/api/friends', {}, token);
    if (!res.ok) throw new Error('Failed to refresh friends');
    const data = await res.json().catch(() => ({}));
    setCachedFriends(Array.isArray(data?.friendships) ? data.friendships : []);
  }, [token, setCachedFriends]);

  const refreshDmsCache = useCallback(async () => {
    if (!token) return;
    const res = await api('/api/dms', {}, token);
    if (!res.ok) throw new Error('Failed to refresh dms');
    const data = await res.json().catch(() => ({}));
    setCachedDms(Array.isArray(data?.channels) ? data.channels : []);
  }, [token, setCachedDms]);

  const refreshServerMembers = useCallback(async () => {
    if (!token || !serverId || isDm) return;
    const res = await api(`/api/servers/${serverId}/members`, {}, token);
    if (!res.ok) throw new Error('Failed to refresh members');
    const data = await res.json().catch(() => ({}));
    setCachedMembers(serverId, Array.isArray(data?.members) ? data.members : []);
  }, [token, serverId, isDm, setCachedMembers]);

  const serverInfo = serverId ? (cachedServerInfos[serverId] || null) : null;
  const members = useMemo(() => {
    if (isDm) {
      const dmChannel = cachedDms?.find((c: any) => c.id === currentActiveChannelId);
      if (dmChannel) {
        return dmChannel.members.map((m: any) => ({
          userId: m.userId,
          user: m.user,
          roleIds: []
        }));
      }
      return [];
    }
    return serverId ? (cachedMembers[serverId] || []) : [];
  }, [isDm, currentActiveChannelId, cachedDms, serverId, cachedMembers]);
  const messages = currentActiveChannelId ? (cachedMessages[currentActiveChannelId] || []) : [];

  const dmChannelInfo = useMemo(() => {
    if (isDm && currentActiveChannelId) {
      return cachedDms?.find((c: any) => c.id === currentActiveChannelId) || null;
    }
    return null;
  }, [isDm, currentActiveChannelId, cachedDms]);

  const ongoingCallMembers = currentActiveChannelId ? (voiceStates[currentActiveChannelId] || []) : [];
  const hasOngoingCall = isDm && ongoingCallMembers.length > 0;
  const isInThisCall = activeCall?.channelId === currentActiveChannelId;
  const ongoingCallSession = currentActiveChannelId ? callSessions[currentActiveChannelId] : null;

  const joinDmCall = useCallback(() => {
    if (!currentActiveChannelId) return;
    setActiveCall({ channelId: currentActiveChannelId, isDm: true, minimized: false });
    if (!hasOngoingCall && socket) {
      socket.emit('voice:ring', { channelId: currentActiveChannelId });
    }
  }, [currentActiveChannelId, hasOngoingCall, setActiveCall, socket]);

  const leaveDmCall = useCallback(() => {
    if (activeCall?.isDm && socket) {
      socket.emit('voice:cancel_ring', { channelId: activeCall.channelId });
    }
    setActiveCall(null);
  }, [activeCall, setActiveCall, socket]);

  const endDmCallForEveryone = useCallback(() => {
    if (!currentActiveChannelId || !socket) return;
    socket.emit('call:end', { channelId: currentActiveChannelId });
    setActiveCall(null);
  }, [currentActiveChannelId, setActiveCall, socket]);

  const channelInfo = useMemo(() => {
    if (isDm) return null;
    if (serverInfo && currentActiveChannelId) {
      return serverInfo.channels?.find((c: any) => c.id === currentActiveChannelId) || null;
    }
    return null;
  }, [isDm, serverInfo, currentActiveChannelId]);

  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [channelDraftName, setChannelDraftName] = useState('');
  const [channelDraftType, setChannelDraftType] = useState<'TEXT' | 'VOICE' | 'CATEGORY'>('TEXT');
  const [channelDraftTopic, setChannelDraftTopic] = useState('');
  const [channelDraftParentId, setChannelDraftParentId] = useState<string | null>(null);
  const [isCreatingChannel, setIsCreatingChannel] = useState(false);

  // Lightbox Modal state
  const [lightboxImage, setLightboxImage] = useState<{ id: string; url: string; filename: string; allowDownloads: boolean; isOwn: boolean } | null>(null);
  const [lightboxZoom, setLightboxZoom] = useState(1);

  // Edit Channel Modal state
  const [editingChannel, setEditingChannel] = useState<ChannelInfo | null>(null);
  const [editChannelName, setEditChannelName] = useState('');
  const [editChannelTopic, setEditChannelTopic] = useState('');
  const [editChannelParentId, setEditChannelParentId] = useState<string | null>(null);
  const [editChannelOverrides, setEditChannelOverrides] = useState<string>('[]');
  const [isSavingChannelEdit, setIsSavingChannelEdit] = useState(false);

  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStartIndex, setMentionStartIndex] = useState<number>(-1);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);

  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);
  const [customEmojis, setCustomEmojis] = useState<CustomEmojiItem[]>([]);
  const [typingUsers, setTypingUsers] = useState<Record<string, number>>({});

  // Profile Modal state
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<ChatUser | null>(null);
  const [selectedMemberInfo, setSelectedMemberInfo] = useState<MemberInfo | null>(null);

  // User Context Menu state
  const [contextMenuState, setContextMenuState] = useState<{
    x: number;
    y: number;
    user: ChatUser;
    memberInfo?: MemberInfo;
  } | null>(null);

  const openUserContextMenu = useCallback((x: number, y: number, user: ChatUser, memberInfo?: MemberInfo | null) => {
    const menuWidth = 200;
    const menuHeight = 250;
    let nextX = x;
    let nextY = y;
    if (nextX + menuWidth > window.innerWidth) nextX = Math.max(8, window.innerWidth - menuWidth - 8);
    if (nextY + menuHeight > window.innerHeight) nextY = Math.max(8, window.innerHeight - menuHeight - 8);
    setContextMenuState({ x: nextX, y: nextY, user, memberInfo });
  }, []);

  const [showMembers, setShowMembers] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastTypingEmitRef = useRef<number>(0);

  const isVoiceChannel = !isDm && channelInfo?.type === 'VOICE';
  const dateLocale = i18n.language.startsWith('de') ? deLocale : enLocale;

  useEffect(() => {
    if (isVoiceChannel && currentActiveChannelId && activeCall?.channelId !== currentActiveChannelId) {
      if (!activeCall || activeCall.isDm) {
        setActiveCall({ channelId: currentActiveChannelId, isDm: false, minimized: false });
      } else {
        // Already in a voice channel call but switched channels, switch call channel.
        setActiveCall({ channelId: currentActiveChannelId, isDm: false, minimized: false });
      }
    }
  }, [isVoiceChannel, currentActiveChannelId, activeCall?.channelId, activeCall?.isDm, setActiveCall]);

  // Load messages + channel/server metadata
  useEffect(() => {
    if (!token || !currentActiveChannelId || currentActiveChannelId === 'default') {
      return;
    }
    const isDmActive = isDm;

    if (!cachedMessages[currentActiveChannelId]) {
      setIsMessagesLoading(true);
    }

    const path = isDmActive
      ? `/api/dms/${currentActiveChannelId}/messages`
      : `/api/messages/channels/${currentActiveChannelId}/messages`;

    // Fire network request immediately without awaiting it directly for UI responsiveness
    api(path, {}, token)
      .then(async res => {
        if (!res.ok) throw new Error('Failed to fetch messages');
        const text = await res.text();
        if (!text) return { messages: [] };
        try {
          return JSON.parse(text);
        } catch (e) {
          return { messages: [] };
        }
      })
      .then(data => {
        const msgs = Array.isArray(data?.messages) ? data.messages : [];
        setCachedMessages(currentActiveChannelId, msgs);
      })
      .catch(err => {
        console.error('Error fetching messages:', err);
      })
      .finally(() => setIsMessagesLoading(false));

    if (!isDmActive) {
      // Channel info is now derived from serverInfo synchronously, no need to fetch!
    } else {
      // Nothing needed for DMs
    }
  }, [currentActiveChannelId, isDm, token, cachedMessages, setCachedMessages]);

  // Load server when serverId changes
  useEffect(() => {
    if (!token || !serverId || isDm) {
      return;
    }

    api(`/api/servers/${serverId}`, {}, token)
      .then(res => res.text())
      .then(text => {
        try {
          return text ? JSON.parse(text) : null;
        } catch (e) {
          return null;
        }
      })
      .then(data => {
        const info = data?.server ?? null;
        if (info) setCachedServerInfo(serverId, info);
      })
      .catch(console.error);
  }, [serverId, token, isDm, cachedServerInfos, setCachedServerInfo]);

  // Load server members when serverId changes
  useEffect(() => {
    if (!token || !serverId || isDm) {
      return;
    }

    api(`/api/servers/${serverId}/members`, {}, token)
      .then(async res => {
        if (!res.ok) throw new Error('Failed to fetch members');
        const text = await res.text();
        if (!text) return { members: [] };
        try {
          return JSON.parse(text);
        } catch (e) {
          return { members: [] };
        }
      })
      .then(data => {
        const list = Array.isArray(data?.members) ? data.members : [];
        setCachedMembers(serverId, list);
      })
      .catch(console.error);
  }, [serverId, token, isDm, currentActiveChannelId, cachedMembers, setCachedMembers]);

  const handleModerationAction = async (userId: string, action: 'kick' | 'ban' | 'mute' | 'deafen' | 'timeout') => {
    if (!token || !serverId) return;
    try {
      if (action === 'kick') {
        if (!confirm('Kick user?')) return;
        const res = await api(`/api/servers/${serverId}/members/${userId}`, { method: 'DELETE' }, token);
        if (!res.ok) throw new Error('Kick failed');
      } else if (action === 'ban') {
        const reason = prompt('Reason for ban?');
        if (reason === null) return;
        const res = await api(`/api/servers/${serverId}/bans/${userId}`, { method: 'POST', body: JSON.stringify({ reason }) }, token);
        if (!res.ok) throw new Error('Ban failed');
      } else if (action === 'mute') {
        const res = await api(`/api/servers/${serverId}/members/${userId}/moderation`, { method: 'PUT', body: JSON.stringify({ isMuted: true }) }, token);
        if (!res.ok) throw new Error('Mute failed');
      } else if (action === 'deafen') {
        const res = await api(`/api/servers/${serverId}/members/${userId}/moderation`, { method: 'PUT', body: JSON.stringify({ isDeafened: true }) }, token);
        if (!res.ok) throw new Error('Deafen failed');
      } else if (action === 'timeout') {
        const min = prompt('Timeout in minutes? (0 to clear)');
        if (min === null) return;
        const minutes = parseInt(min, 10);
        if (isNaN(minutes)) return;
        const timeoutUntil = minutes > 0 ? new Date(Date.now() + minutes * 60 * 1000).toISOString() : null;
        const res = await api(`/api/servers/${serverId}/members/${userId}/moderation`, { method: 'PUT', body: JSON.stringify({ timeoutUntil }) }, token);
        if (!res.ok) throw new Error('Timeout failed');
      }
      await refreshServerMembers();
      setContextMenuState(null);
    } catch (e) {
      alert(`Error performing ${action}`);
    }
  };

  const handleFriendAction = async (user: ChatUser, action: 'add' | 'remove' | 'block') => {
    if (!token) return;
    try {
      if (action === 'add') {
        const res = await api('/api/friends', { method: 'POST', body: JSON.stringify({ username: user.username }) }, token);
        if (!res.ok) throw new Error('Add friend failed');
      } else {
        const friend = cachedFriends.find((f: any) => f.user.id === user.id);
        if (friend) {
          if (action === 'remove') {
            const res = await api(`/api/friends/${friend.id}`, { method: 'DELETE' }, token);
            if (!res.ok) throw new Error('Remove friend failed');
          } else if (action === 'block') {
            const res = await api(`/api/friends/${friend.id}/block`, { method: 'POST' }, token);
            if (!res.ok) throw new Error('Block failed');
          }
        }
      }
      await refreshFriendsCache();
      setContextMenuState(null);
    } catch (e) {
      console.error(e);
      alert('Aktion konnte nicht ausgeführt werden.');
    }
  };

  // Realtime listeners
  useEffect(() => {
    if (!socket || !currentActiveChannelId || currentActiveChannelId === 'default') return;
    const isDmActive = isDm;
    const currentId = currentActiveChannelId;

    const matchesCurrent = (msg: Partial<ChatMessage>) =>
      isDmActive ? msg.dmChannelId === currentId : msg.channelId === currentId;

    const onCreated = (msg: ChatMessage) => {
      if (!matchesCurrent(msg)) return;
      const prev = useServerStore.getState().cachedMessages[currentId] || [];
      const hasReal = prev.some(m => m.id === msg.id);

      // Strict matching for temp messages: same content, same author, created within last 5 seconds
      const hasTemp = prev.some(m =>
        m.id.startsWith('temp-') &&
        m.content === msg.content &&
        m.authorId === msg.authorId &&
        (Date.now() - new Date(m.createdAt).getTime() < 5000)
      );

      let next;
      if (hasReal) {
        // Already exists (e.g. from res.ok), update it
        next = prev.map(m => m.id === msg.id ? { ...msg, localId: m.localId || msg.localId } : m);
      } else if (hasTemp) {
        // Replace temp with real
        next = prev.map(m => (
          m.id.startsWith('temp-') &&
          m.content === msg.content &&
          m.authorId === msg.authorId &&
          (Date.now() - new Date(m.createdAt).getTime() < 5000)
        ) ? { ...msg, localId: m.id } : m);
      } else {
        next = [...prev, msg];
      }
      setCachedMessages(currentId, next);
    };
    const onUpdated = (msg: ChatMessage) => {
      if (!matchesCurrent(msg)) return;
      const prev = useServerStore.getState().cachedMessages[currentId] || [];
      const next = prev.map(m => (m.id === msg.id ? { ...m, ...msg } : m));
      setCachedMessages(currentId, next);
    };
    const onDeleted = (data: { id: string; channelId?: string; dmChannelId?: string }) => {
      const matches = isDmActive
        ? data.dmChannelId === currentId
        : data.channelId === currentId;
      if (!matches) return;
      const prev = useServerStore.getState().cachedMessages[currentId] || [];
      const next = prev.filter(m => m.id !== data.id);
      setCachedMessages(currentId, next);
    };
    const onReactionAdded = (data: { messageId?: string; dmMessageId?: string; reaction: Reaction }) => {
      const id = data.messageId ?? data.dmMessageId;
      if (!id) return;
      const prev = useServerStore.getState().cachedMessages[currentId] || [];
      const next = prev.map(m =>
        m.id === id
          ? {
            ...m,
            reactions: [...(m.reactions ?? []).filter((r: any) => r.id !== data.reaction.id), data.reaction],
          }
          : m
      );
      setCachedMessages(currentId, next);
    };
    const onReactionRemoved = (data: {
      messageId?: string;
      dmMessageId?: string;
      userId: string;
      emoji: string;
    }) => {
      const id = data.messageId ?? data.dmMessageId;
      if (!id) return;
      const prev = useServerStore.getState().cachedMessages[currentId] || [];
      const next = prev.map(m =>
        m.id === id
          ? {
            ...m,
            reactions: (m.reactions ?? []).filter(
              (r: any) => !(r.userId === data.userId && r.emoji === data.emoji)
            ),
          }
          : m
      );
      setCachedMessages(currentId, next);
    };
    const onTypingStart = (data: { channelId?: string; userId: string }) => {
      const matches = isDmActive ? false : data.channelId === currentId;
      if (!matches) return;
      setTypingUsers(prev => ({ ...prev, [data.userId]: Date.now() }));
    };
    const onTypingStop = (data: { channelId?: string; userId: string }) => {
      setTypingUsers(prev => {
        const next = { ...prev };
        delete next[data.userId];
        return next;
      });
    };
    const onDmTypingStart = (data: { channelId: string; userId: string }) => {
      if (!isDmActive || data.channelId !== currentId) return;
      setTypingUsers(prev => ({ ...prev, [data.userId]: Date.now() }));
    };
    const onDmTypingStop = (data: { channelId: string; userId: string }) => {
      setTypingUsers(prev => {
        const next = { ...prev };
        delete next[data.userId];
        return next;
      });
    };

    if (isDmActive) {
      socket.on('dm:message_created', onCreated);
      socket.on('dm:message_updated', onUpdated);
      socket.on('dm:message_deleted', onDeleted);
      socket.on('dm:reaction_added', onReactionAdded);
      socket.on('dm:reaction_removed', onReactionRemoved);
      socket.on('dm:typing:start', onDmTypingStart);
      socket.on('dm:typing:stop', onDmTypingStop);
    } else {
      socket.on('message:created', onCreated);
      socket.on('message:updated', onUpdated);
      socket.on('message:deleted', onDeleted);
      socket.on('reaction:added', onReactionAdded);
      socket.on('reaction:removed', onReactionRemoved);
      socket.on('typing:start', onTypingStart);
      socket.on('typing:stop', onTypingStop);
    }

    return () => {
      if (isDmActive) {
        socket.off('dm:message_created', onCreated);
        socket.off('dm:message_updated', onUpdated);
        socket.off('dm:message_deleted', onDeleted);
        socket.off('dm:reaction_added', onReactionAdded);
        socket.off('dm:reaction_removed', onReactionRemoved);
        socket.off('dm:typing:start', onDmTypingStart);
        socket.off('dm:typing:stop', onDmTypingStop);
      } else {
        socket.off('message:created', onCreated);
        socket.off('message:updated', onUpdated);
        socket.off('message:deleted', onDeleted);
        socket.off('reaction:added', onReactionAdded);
        socket.off('reaction:removed', onReactionRemoved);
        socket.off('typing:start', onTypingStart);
        socket.off('typing:stop', onTypingStop);
      }
    };
  }, [socket, currentActiveChannelId, isDm]);

  useEffect(() => {
    if (!socket || !serverId || isDm) return;

    const onMemberJoined = (member: any) => {
      const current = useServerStore.getState().cachedMembers[serverId] || [];
      if (current.some((m: any) => m.userId === member.userId)) return;
      useServerStore.getState().setCachedMembers(serverId, [...current, member]);
    };

    const onMemberUpdated = (member: any) => {
      const current = useServerStore.getState().cachedMembers[serverId] || [];
      useServerStore.getState().setCachedMembers(
        serverId,
        current.map((m: any) => (m.userId === member.userId ? member : m))
      );
    };

    const onMemberLeft = ({ serverId: leftServerId, userId }: { serverId: string; userId: string }) => {
      if (leftServerId !== serverId) return;
      const current = useServerStore.getState().cachedMembers[serverId] || [];
      useServerStore.getState().setCachedMembers(
        serverId,
        current.filter((m: any) => m.userId !== userId)
      );

      if (selectedUser?.id === userId) {
        setProfileModalOpen(false);
        setSelectedUser(null);
      }
    };

    const onPresenceUpdate = (data: { userId: string; status: string; customStatus?: string | null; activities?: string | null; platform?: 'web' | 'desktop' | null }) => {
      const current = useServerStore.getState().cachedMembers[serverId] || [];
      if (!current.some((m: any) => m.userId === data.userId)) return;

      useServerStore.getState().setCachedMembers(
        serverId,
        current.map((m: any) => {
          if (m.userId === data.userId && m.user) {
            return {
              ...m,
              user: {
                ...m.user,
                status: data.status,
                customStatus: data.customStatus !== undefined ? data.customStatus : m.user.customStatus,
                activities: data.activities !== undefined ? data.activities : m.user.activities,
                platform: data.platform !== undefined ? data.platform : m.user.platform,
              }
            };
          }
          return m;
        })
      );
    };

    socket.on('server:member_joined', onMemberJoined);
    socket.on('server:member_updated', onMemberUpdated);
    socket.on('server:member_left', onMemberLeft);
    socket.on('presence:update', onPresenceUpdate);

    return () => {
      socket.off('server:member_joined', onMemberJoined);
      socket.off('server:member_updated', onMemberUpdated);
      socket.off('server:member_left', onMemberLeft);
      socket.off('presence:update', onPresenceUpdate);
    };
  }, [socket, serverId, isDm, selectedUser?.id]);

  // Listen for channel events (server-side) so the channel sidebar updates live.
  useEffect(() => {
    if (!socket || !serverId || isDm) return;
    const onChannelCreated = (channel: ChannelInfo) => {
      if (channel.serverId !== serverId) return;
      const prev = useServerStore.getState().cachedServerInfos[serverId];
      if (!prev) return;
      if (prev.channels?.some((c: any) => c.id === channel.id)) return;
      setCachedServerInfo(serverId, { ...prev, channels: [...(prev.channels ?? []), channel] });
    };
    const onChannelUpdated = (channel: ChannelInfo) => {
      if (channel.serverId !== serverId) return;
      const prev = useServerStore.getState().cachedServerInfos[serverId];
      if (!prev) return;
      setCachedServerInfo(serverId, {
        ...prev,
        channels: (prev.channels ?? []).map((c: any) => (c.id === channel.id ? channel : c)),
      });
    };
    const onChannelDeleted = (data: { channelId: string; serverId: string }) => {
      if (data.serverId !== serverId) return;
      const prev = useServerStore.getState().cachedServerInfos[serverId];
      if (!prev) return;
      setCachedServerInfo(serverId, { ...prev, channels: (prev.channels ?? []).filter((c: any) => c.id !== data.channelId) });
      if (data.channelId === currentActiveChannelId) {
        navigate('/app');
      }
    };

    socket.on('channel:created', onChannelCreated);
    socket.on('channel:updated', onChannelUpdated);
    socket.on('channel:deleted', onChannelDeleted);
    return () => {
      socket.off('channel:created', onChannelCreated);
      socket.off('channel:updated', onChannelUpdated);
      socket.off('channel:deleted', onChannelDeleted);
    };
  }, [socket, serverId, isDm, currentActiveChannelId, navigate]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Clean stale typing entries
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setTypingUsers(prev => {
        const next: Record<string, number> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (now - v < 6000) next[k] = v;
        }
        return next;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const loadCustomEmojis = async () => {
      try {
        const res = await api('/api/users/me/custom-emojis', {}, token);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setCustomEmojis(data.customEmojis ?? []);
        }
      } catch (err) {
        console.error(err);
      }
    };

    void loadCustomEmojis();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleTyping = useCallback(() => {
    if (!socket || !currentActiveChannelId) return;
    const now = Date.now();
    if (now - lastTypingEmitRef.current < 3000) return;
    lastTypingEmitRef.current = now;
    socket.emit(isDm ? 'dm:typing:start' : 'typing:start', { channelId: currentActiveChannelId });
    setTimeout(() => {
      socket.emit(isDm ? 'dm:typing:stop' : 'typing:stop', { channelId: currentActiveChannelId });
    }, 4000);
  }, [socket, currentActiveChannelId, isDm]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentActiveChannelId || currentActiveChannelId === 'default') return;
    const content = encodeCustomEmojisInMessage(newMessage.trim(), customEmojis);
    if (!content && pendingAttachments.length === 0) return;

    const path = isDm
      ? `/api/dms/${currentActiveChannelId}/messages`
      : `/api/messages/channels/${currentActiveChannelId}/messages`;

    const body = {
      content,
      replyToId: replyTo?.id,
      attachmentIds: pendingAttachments.map(a => a.id),
    };

    // Optimistic UI update
    const tempId = `temp-${Date.now()}`;
    const tempMsg: ChatMessage = {
      id: tempId,
      localId: tempId,
      channelId: !isDm ? currentActiveChannelId : undefined,
      dmChannelId: isDm ? currentActiveChannelId : undefined,
      authorId: me!.id,
      author: me as ChatUser,
      content,
      createdAt: new Date().toISOString(),
      attachments: pendingAttachments,
      replyTo: replyTo ? {
        id: replyTo.id,
        authorId: replyTo.authorId,
        content: replyTo.content,
        author: replyTo.author,
      } : null,
    };

    setCachedMessages(currentActiveChannelId, [...(useServerStore.getState().cachedMessages[currentActiveChannelId] || []), tempMsg]);
    setNewMessage('');
    setReplyTo(null);
    setPendingAttachments([]);
    if (inputRef.current) inputRef.current.style.height = 'auto';

    try {
      const res = await api(
        path,
        { method: 'POST', body: JSON.stringify(body) },
        token
      );
      if (res.ok) {
        let data: any = {};
        try {
          const text = await res.text();
          if (text) data = JSON.parse(text);
        } catch (e) { }
        const currentMsgs = useServerStore.getState().cachedMessages[currentActiveChannelId] || [];
        // In case the socket arrived extremely fast and replaced our temp ID, we only add if it's missing
        if (currentMsgs.some(m => m.id === tempId)) {
          setCachedMessages(currentActiveChannelId, currentMsgs.map(m => m.id === tempId ? { ...(data.message || m), localId: tempId } : m));
        } else if (data.message && !currentMsgs.some(m => m.id === data.message.id)) {
          setCachedMessages(currentActiveChannelId, [...currentMsgs, data.message]);
        }
      } else {
        let err: any = {};
        try {
          const text = await res.text();
          if (text) err = JSON.parse(text);
        } catch (e) { }
        alert(err.message || err.error || 'Error sending message');
        const currentMsgs = useServerStore.getState().cachedMessages[currentActiveChannelId] || [];
        setCachedMessages(currentActiveChannelId, currentMsgs.filter(m => m.id !== tempId));
      }
    } catch (err) {
      console.error('Failed to send message', err);
      const currentMsgs = useServerStore.getState().cachedMessages[currentActiveChannelId] || [];
      setCachedMessages(currentActiveChannelId, currentMsgs.filter(m => m.id !== tempId));
    }
  };

  const handleStartEdit = (msg: ChatMessage) => {
    setEditingId(msg.id);
    setEditingContent(msg.content);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingContent('');
  };

  const handleSaveEdit = async (id: string) => {
    if (!editingContent.trim()) return;
    const path = isDm ? `/api/dms/messages/${id}` : `/api/messages/messages/${id}`;
    try {
      const res = await api(
        path,
        { method: 'PATCH', body: JSON.stringify({ content: editingContent }) },
        token
      );
      if (res.ok) {
        setEditingId(null);
        setEditingContent('');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteMessage = async (id: string) => {
    if (!confirm(t('delete_message_confirm') ?? 'Delete this message?')) return;
    const path = isDm ? `/api/dms/messages/${id}` : `/api/messages/messages/${id}`;
    try {
      await api(path, { method: 'DELETE' }, token);
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleReaction = async (msg: ChatMessage, emoji: string) => {
    if (!me) return;
    const existing = (msg.reactions ?? []).find(
      r => r.userId === me.id && r.emoji === emoji
    );
    const path = isDm
      ? `/api/dms/messages/${msg.id}/reactions/${encodeURIComponent(emoji)}`
      : `/api/messages/messages/${msg.id}/reactions/${encodeURIComponent(emoji)}`;
    try {
      await api(path, { method: existing ? 'DELETE' : 'PUT' }, token);
      setReactionPickerFor(null);
    } catch (err) {
      console.error(err);
    }
  };

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    try {
      const fd = new FormData();
      files.forEach(f => fd.append('files', f));
      const res = await api(
        '/api/uploads',
        { method: 'POST', body: fd },
        token
      );
      let data: any = {};
      try {
        const text = await res.text();
        if (text) data = JSON.parse(text);
      } catch (e) { }
      if (res.ok && Array.isArray(data?.attachments)) {
        setPendingAttachments(prev => [...prev, ...data.attachments]);
      } else {
        alert(data.message || data.error || 'Upload failed');
      }
    } catch (err) {
      console.error(err);
      alert('Upload failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    await uploadFiles(files);
  };



  const removePendingAttachment = (id: string) => {
    setPendingAttachments(prev => prev.filter(a => a.id !== id));
    api(`/api/uploads/${id}`, { method: 'DELETE' }, token).catch(() => { });
  };

  const refreshServerInfo = async () => {
    if (!token || !serverId) return;
    try {
      const res = await api(`/api/servers/${serverId}`, {}, token);
      if (!res.ok) return;
      let data: any = {};
      try {
        const text = await res.text();
        if (text) data = JSON.parse(text);
      } catch (e) { }
      if (data?.server) setCachedServerInfo(serverId, data.server);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !serverId || !channelDraftName.trim()) return;
    const normalizedName = channelDraftName
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    if (!normalizedName) return;
    setIsCreatingChannel(true);
    try {
      const res = await api(
        `/api/servers/${serverId}/channels`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: normalizedName,
            type: channelDraftType,
            topic: channelDraftTopic.trim() || undefined,
            parentId: channelDraftParentId || undefined,
          }),
        },
        token
      );
      if (!res.ok) {
        let err: any = {};
        try {
          const text = await res.text();
          if (text) err = JSON.parse(text);
        } catch (e) { }
        alert(err.message || 'Error creating channel');
        return;
      }
      setShowCreateChannel(false);
      setChannelDraftName('');
      setChannelDraftTopic('');
      setChannelDraftType('TEXT');
      setChannelDraftParentId(null);
      await refreshServerInfo();
    } catch (err) {
      console.error(err);
    } finally {
      setIsCreatingChannel(false);
    }
  };

  // Edit channel handlers
  const handleEditChannelClick = (c: ChannelInfo) => {
    setEditingChannel(c);
    setEditChannelName(c.name);
    setEditChannelTopic(c.topic ?? '');
    setEditChannelParentId(c.parentId ?? null);
    setEditChannelOverrides(typeof c.permissionOverrides === 'string' ? c.permissionOverrides : JSON.stringify(c.permissionOverrides || []));
  };

  const handleSaveChannelEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingChannel) return;
    setIsSavingChannelEdit(true);
    try {
      const res = await api(
        `/api/channels/${editingChannel.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            name: editChannelName,
            topic: editChannelTopic.trim() || null,
            parentId: editChannelParentId,
            permissionOverrides: editChannelOverrides,
          }),
        },
        token
      );
      if (res.ok) {
        setEditingChannel(null);
        await refreshServerInfo();
      } else {
        alert('Could not update channel.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingChannelEdit(false);
    }
  };

  const handleDeleteChannelEdit = async () => {
    if (!token || !editingChannel) return;
    if (!confirm('Are you sure you want to delete this channel permanently?')) return;
    try {
      const res = await api(
        `/api/channels/${editingChannel.id}`,
        { method: 'DELETE' },
        token
      );
      if (res.ok) {
        setEditingChannel(null);
        await refreshServerInfo();
      } else {
        alert('Could not delete channel.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Profile modal handlers
  const handleOpenProfile = (user: ChatUser) => {
    setSelectedUser(user);

    // Find server member info if in a server
    if (!isDm && serverId) {
      const memberInfo = members.find(m => m.userId === user.id);
      setSelectedMemberInfo(memberInfo || null);
    } else {
      setSelectedMemberInfo(null);
    }

    setProfileModalOpen(true);
  };

  const handleCloseProfile = () => {
    setProfileModalOpen(false);
    setSelectedUser(null);
    setSelectedMemberInfo(null);
  };

  const filteredMentions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();

    const matchedUsers = members.filter((m: MemberInfo) => {
      const username = (m.user?.username ?? '').toLowerCase();
      const displayName = (m.user?.displayName ?? '').toLowerCase();
      const nickname = (m.nickname ?? '').toLowerCase();
      return username.includes(q) || displayName.includes(q) || nickname.includes(q);
    }).map(m => ({
      type: 'user' as const,
      id: m.userId,
      name: m.nickname || m.user?.displayName || m.user?.username || m.userId,
      username: m.user?.username,
      avatarUrl: m.user?.avatarUrl,
      member: m
    }));

    const matchedRoles = isDm ? [] : (serverInfo?.roles ?? []).filter((r: any) => {
      const roleName = r.isDefault ? 'everyone' : r.name.toLowerCase();
      return roleName.includes(q);
    }).map((r: any) => ({
      type: 'role' as const,
      id: r.id,
      name: r.isDefault ? 'everyone' : r.name,
      color: r.color,
      isDefault: r.isDefault
    }));

    return [...matchedRoles, ...matchedUsers].slice(0, 8);
  }, [mentionQuery, members, serverInfo?.roles, isDm]);

  const insertMention = (mentionText: string) => {
    if (mentionStartIndex === -1 || !mentionText) return;
    const before = newMessage.slice(0, mentionStartIndex);
    const after = newMessage.slice(inputRef.current?.selectionStart ?? mentionStartIndex);
    setNewMessage(`${before}@${mentionText} ${after}`);
    setMentionQuery(null);
    setMentionStartIndex(-1);
    inputRef.current?.focus();
  };

  // Compute canManageChannels
  const myMemberInfo = useMemo(() => {
    if (isDm && activeChannelId) {
      // Create a fake member info for DMs so `isOwn` logic handles properly.
      return { userId: me?.id || '', roleIds: [] };
    }
    return members.find(m => m.userId === me?.id);
  }, [members, me?.id, isDm, activeChannelId]);
  const canManageChannels = useMemo(() => {
    if (me?.systemRole === 'CEO') return true;
    if (!serverInfo || !me) return false;
    if (serverInfo.ownerId === me.id) return true;

    let perms = 0n;
    const everyoneRole = serverInfo.roles?.find((r: any) => r.isDefault);
    if (everyoneRole) perms |= BigInt(everyoneRole.permissions || '0');

    for (const rid of (myMemberInfo?.roleIds ?? [])) {
      const r = serverInfo.roles?.find((role: any) => role.id === rid);
      if (r) perms |= BigInt(r.permissions || '0');
    }
    const ADMINISTRATOR = 1n << 9n;
    const MANAGE_CHANNELS = 1n << 3n;
    return (perms & ADMINISTRATOR) === ADMINISTRATOR || (perms & MANAGE_CHANNELS) === MANAGE_CHANNELS;
  }, [serverInfo, me, myMemberInfo]);

  const canManageServer = useMemo(() => {
    if (me?.systemRole === 'CEO') return true;
    if (!serverInfo || !me) return false;
    if (serverInfo.ownerId === me.id) return true;

    let perms = 0n;
    const everyoneRole = serverInfo.roles?.find((r: any) => r.isDefault);
    if (everyoneRole) perms |= BigInt(everyoneRole.permissions || '0');

    for (const rid of (myMemberInfo?.roleIds ?? [])) {
      const r = serverInfo.roles?.find((role: any) => role.id === rid);
      if (r) perms |= BigInt(r.permissions || '0');
    }
    const ADMINISTRATOR = 1n << 9n;
    const MANAGE_SERVER = 1n << 5n;
    return (perms & ADMINISTRATOR) === ADMINISTRATOR || (perms & MANAGE_SERVER) === MANAGE_SERVER;
  }, [serverInfo, me, myMemberInfo]);

  const canSendMessages = useMemo(() => {
    if (me?.systemRole === 'CEO') return true;
    if (isDm) return true;
    if (!serverInfo || !me || !channelInfo) return false;
    if (serverInfo.ownerId === me.id) return true;
    if (myMemberInfo?.timeoutUntil && new Date(myMemberInfo.timeoutUntil) > new Date()) return false;

    let perms = 0n;
    const everyoneRole = serverInfo.roles?.find((r: any) => r.isDefault);
    if (everyoneRole) perms |= BigInt(everyoneRole.permissions || '0');

    for (const rid of (myMemberInfo?.roleIds ?? [])) {
      const r = serverInfo.roles?.find((role: any) => role.id === rid);
      if (r) perms |= BigInt(r.permissions || '0');
    }

    const ADMINISTRATOR = 1n << 9n;
    if ((perms & ADMINISTRATOR) === ADMINISTRATOR) return true;

    const SEND_MESSAGES = 1n << 1n;
    let finalSend = (perms & SEND_MESSAGES) === SEND_MESSAGES;

    if (channelInfo.permissionOverrides) {
      try {
        const overrides = typeof channelInfo.permissionOverrides === 'string' ? JSON.parse(channelInfo.permissionOverrides) : channelInfo.permissionOverrides;
        for (const ov of overrides) {
          if (ov.roleId === everyoneRole?.id || (myMemberInfo?.roleIds ?? []).includes(ov.roleId)) {
            const allow = BigInt(ov.allow || '0');
            const deny = BigInt(ov.deny || '0');
            if ((deny & SEND_MESSAGES) === SEND_MESSAGES) finalSend = false;
            if ((allow & SEND_MESSAGES) === SEND_MESSAGES) finalSend = true;
          }
        }
      } catch (e) {
        console.error("Failed to parse permissionOverrides", e);
      }
    }

    return finalSend;
  }, [serverInfo, me, myMemberInfo, channelInfo, isDm]);

  // Drag and drop file upload handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!canSendMessages) return;
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      setIsDraggingFile(true);
    }
  }, [canSendMessages]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    if (!canSendMessages) return;
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      setIsDraggingFile(false);
      const files = Array.from(e.dataTransfer.files);
      await uploadFiles(files);
    }
  }, [canSendMessages, token]);

  const handlePaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!canSendMessages) return;
    const items = Array.from(e.clipboardData.items);
    const files: File[] = [];
    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      await uploadFiles(files);
    }
  }, [canSendMessages, token]);

  if (currentActiveChannelId === 'default' || !currentActiveChannelId) {
    return (
      <div className="flex-1 bg-softspace-950 flex flex-col items-center justify-center text-softspace-500">
        <Hash size={48} className="mb-4 opacity-20" />
        <p>{t('no_channel_selected')}</p>
      </div>
    );
  }

  // Voice channel view
  if (isVoiceChannel && serverId) {
    return (
      <div className="flex h-full relative">
        {/* Mobile overlay for Channel Sidebar */}
        {mobileChannelSidebarOpen && (
          <div
            className="md:hidden fixed inset-0 bg-black/50 z-40"
            onClick={() => setMobileChannelSidebarOpen(false)}
          />
        )}
        <div className={`
          absolute left-0 top-0 z-40 h-full transition-transform duration-200 ease-in-out shrink-0 w-60 md:relative md:translate-x-0 md:w-auto
          ${mobileChannelSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>
          <ChannelSidebar
            server={serverInfo}
            serverId={serverId}
            activeId={currentActiveChannelId}
            token={token}
            canManageChannels={canManageChannels}
            onCreate={() => setShowCreateChannel(true)}
            onCreateInCategory={(parentId) => {
              setChannelDraftParentId(parentId);
              setShowCreateChannel(true);
            }}
            onEditChannel={handleEditChannelClick}
            onChannelsChange={(channels) => {
              const prev = useServerStore.getState().cachedServerInfos[serverId];
              if (prev) setCachedServerInfo(serverId, { ...prev, channels });
            }}
          />
        </div>
        <div className="flex-1 bg-softspace-950 flex flex-col min-w-0 h-full">
          <div className="h-safe-header border-b border-softspace-800 flex items-center px-4 md:px-6 gap-3 shadow-sm shrink-0 z-10 relative">
            <div className="md:hidden flex items-center gap-2 mr-2">
              <button onClick={() => setMobileSidebarOpen(true)} className="p-1.5 text-softspace-400 hover:text-softspace-100 rounded-lg">
                <Menu size={20} />
              </button>
              <button onClick={() => setMobileChannelSidebarOpen(true)} className="p-1.5 text-softspace-400 hover:text-softspace-100 rounded-lg">
                <Hash size={20} />
              </button>
            </div>
            <Mic className="text-softspace-400 hidden md:block" size={20} />
            <h2 className="font-semibold text-softspace-100 truncate">
              {channelInfo?.name ?? t('voice_channel_label')}
            </h2>
            {canManageServer && (
              <button
                type="button"
                onClick={() => navigate(`/app/servers/${serverId}/settings`)}
                className="ml-auto px-3 py-1.5 bg-softspace-800 hover:bg-softspace-700 text-softspace-200 rounded-xl text-sm font-medium transition-colors"
              >
                {t('server_settings')}
              </button>
            )}
          </div>
          <div className="flex-1 flex flex-col min-h-0 relative z-0">
            {activeCall?.channelId === currentActiveChannelId && (
              <div id="voice-chat-portal" className="absolute inset-0 z-0 bg-softspace-950 flex flex-col w-full h-full overflow-hidden" />
            )}
          </div>
        </div>
        {showCreateChannel && (
          <CreateChannelModal
            value={{
              name: channelDraftName,
              type: channelDraftType,
              topic: channelDraftTopic,
            }}
            isCreatingChannel={isCreatingChannel}
            onChange={(patch) => {
              if (patch.name !== undefined) setChannelDraftName(patch.name);
              if (patch.type !== undefined) setChannelDraftType(patch.type);
              if (patch.topic !== undefined) setChannelDraftTopic(patch.topic);
            }}
            onSubmit={handleCreateChannel}
            onClose={() => setShowCreateChannel(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full relative">
      {!isDm && serverId && (
        <>
          {mobileChannelSidebarOpen && (
            <div
              className="md:hidden fixed inset-0 bg-black/50 z-40"
              onClick={() => setMobileChannelSidebarOpen(false)}
            />
          )}
          <div className={`
            absolute left-0 top-0 z-40 h-full transition-transform duration-200 ease-in-out shrink-0 w-60 md:relative md:translate-x-0 md:w-auto
            ${mobileChannelSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          `}>
            <ChannelSidebar
              server={serverInfo}
              serverId={serverId}
              activeId={currentActiveChannelId}
              token={token}
              canManageChannels={canManageChannels}
              onCreate={() => setShowCreateChannel(true)}
              onCreateInCategory={(parentId) => {
                setChannelDraftParentId(parentId);
                setShowCreateChannel(true);
              }}
              onEditChannel={handleEditChannelClick}
              onChannelsChange={(channels) => {
                const prev = useServerStore.getState().cachedServerInfos[serverId];
                if (prev) setCachedServerInfo(serverId, { ...prev, channels });
              }}
            />
          </div>
        </>
      )}

      {contextMenuState && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setContextMenuState(null)} />
          <div
            className="fixed z-[9999] bg-softspace-900 border border-softspace-800 shadow-2xl rounded-xl py-2 w-48 text-sm animate-fadeIn"
            style={{ top: contextMenuState.y, left: contextMenuState.x }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={e => e.preventDefault()}
          >
            <div className="px-4 py-1 text-xs font-bold text-softspace-400 mb-1 border-b border-softspace-800">
              {contextMenuState.user.displayName || contextMenuState.user.username}
            </div>
            <button
              onClick={() => handleOpenProfile(contextMenuState.user)}
              className="w-full px-4 py-2 text-left hover:bg-softspace-800 text-softspace-200 transition-colors"
            >
              Profile
            </button>
            {contextMenuState.user.id !== me?.id && (
              <>
                <div className="h-px bg-softspace-800 my-1 mx-2" />
                {(() => {
                  const friend = cachedFriends.find((f: any) => f.user.id === contextMenuState.user.id);
                  if (!friend || friend.status === 'BLOCKED') {
                    return (
                      <button
                        onClick={() => handleFriendAction(contextMenuState.user, 'add')}
                        className="w-full px-4 py-2 text-left hover:bg-softspace-800 text-softspace-200 transition-colors"
                      >
                        Add Friend
                      </button>
                    );
                  }
                  return (
                    <button
                      onClick={() => handleFriendAction(contextMenuState.user, 'remove')}
                      className="w-full px-4 py-2 text-left hover:bg-red-500/20 text-red-400 transition-colors"
                    >
                      Remove Friend
                    </button>
                  );
                })()}
                <button
                  onClick={() => handleFriendAction(contextMenuState.user, 'block')}
                  className="w-full px-4 py-2 text-left hover:bg-red-500/20 text-red-400 transition-colors"
                >
                  Block User
                </button>
              </>
            )}
            {isDm && dmChannelInfo?.isGroup && dmChannelInfo.ownerId === me?.id && contextMenuState.user.id !== me?.id && (
              <>
                <div className="h-px bg-softspace-800 my-1 mx-2" />
                <button
                  onClick={async () => {
                    if (!confirm('Remove user from group?')) return;
                    const res = await api(`/api/dms/${currentActiveChannelId}/members/${contextMenuState.user.id}`, { method: 'DELETE' }, token);
                    if (!res.ok) {
                      const err = await res.json().catch(() => ({}));
                      alert(err.message || 'Mitglied konnte nicht entfernt werden.');
                      return;
                    }
                    await refreshDmsCache();
                    setContextMenuState(null);
                    if (currentActiveChannelId && dmChannelInfo?.id === currentActiveChannelId) {
                      setSelectedMemberInfo(null);
                    }
                  }}
                  className="w-full px-4 py-2 text-left hover:bg-red-500/20 text-red-400 transition-colors"
                >
                  Remove from Group
                </button>
              </>
            )}
            {canManageChannels && serverId && contextMenuState.user.id !== me?.id && (
              <>
                <div className="h-px bg-softspace-800 my-1 mx-2" />
                <button
                  onClick={() => handleModerationAction(contextMenuState.user.id, 'timeout')}
                  className="w-full px-4 py-2 text-left hover:bg-softspace-800 text-softspace-200 transition-colors"
                >
                  Timeout
                </button>
                <button
                  onClick={() => handleModerationAction(contextMenuState.user.id, 'mute')}
                  className="w-full px-4 py-2 text-left hover:bg-softspace-800 text-softspace-200 transition-colors"
                >
                  Server Mute
                </button>
                <button
                  onClick={() => handleModerationAction(contextMenuState.user.id, 'deafen')}
                  className="w-full px-4 py-2 text-left hover:bg-softspace-800 text-softspace-200 transition-colors"
                >
                  Server Deafen
                </button>
                <div className="h-px bg-softspace-800 my-1 mx-2" />
                <button
                  onClick={() => handleModerationAction(contextMenuState.user.id, 'kick')}
                  className="w-full px-4 py-2 text-left hover:bg-red-500/20 text-red-400 transition-colors"
                >
                  Kick
                </button>
                <button
                  onClick={() => handleModerationAction(contextMenuState.user.id, 'ban')}
                  className="w-full px-4 py-2 text-left hover:bg-red-500/20 text-red-400 transition-colors"
                >
                  Ban
                </button>
              </>
            )}
          </div>
        </>
      )}

      <div
        className="flex-1 bg-softspace-950 flex flex-col min-w-0 h-full relative"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDraggingFile && (
          <div className="absolute inset-0 z-50 bg-softspace-950/80 backdrop-blur-sm flex flex-col items-center justify-center border-2 border-dashed border-softspace-500 m-4 rounded-2xl pointer-events-none animate-pulse">
            <Upload className="text-softspace-400 mb-2 animate-bounce" size={48} />
            <p className="text-lg font-semibold text-softspace-100">{t('drop_files_to_upload')}</p>
          </div>
        )}
        <div className="h-safe-header border-b border-softspace-800 flex items-center px-4 md:px-6 gap-2 md:gap-3 shadow-sm shrink-0">
          <div className="md:hidden flex items-center gap-2 mr-1">
            <button onClick={() => setMobileSidebarOpen(true)} className="p-1.5 text-softspace-400 hover:text-softspace-100 rounded-lg">
              <Menu size={20} />
            </button>
            {!isDm && serverId && (
              <button onClick={() => setMobileChannelSidebarOpen(true)} className="p-1.5 text-softspace-400 hover:text-softspace-100 rounded-lg">
                <Hash size={20} />
              </button>
            )}
            {isDm && (
              <button onClick={() => setMobileChannelSidebarOpen(true)} className="p-1.5 text-softspace-400 hover:text-softspace-100 rounded-lg">
                <Users size={20} />
              </button>
            )}
          </div>

          <Hash className="text-softspace-400 hidden md:block" size={20} />
          <h2 className="font-semibold text-softspace-100 truncate flex-1">
            {isDm ? t('direct_messages') : channelInfo?.name ?? '...'}
          </h2>
          {channelInfo?.topic && (
            <>
              <span className="h-5 w-px bg-softspace-800 mx-2" />
              <span className="text-sm text-softspace-400 truncate">
                {channelInfo.topic}
              </span>
            </>
          )}
          {isDm && (
            <div className="ml-auto flex items-center gap-2">
              {activeCall?.isDm && activeCall.channelId === currentActiveChannelId && (
                <button
                  type="button"
                  onClick={() => setActiveCall({ ...activeCall, minimized: !activeCall.minimized })}
                  className="p-1.5 bg-softspace-800 hover:bg-softspace-700 text-softspace-200 rounded-xl transition-colors"
                  title={activeCall.minimized ? "Expand Call" : "Minimize Call"}
                >
                  {activeCall.minimized ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (isInThisCall) {
                    leaveDmCall();
                  } else {
                    joinDmCall();
                  }
                }}
                className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${isInThisCall
                    ? 'bg-softspace-700 hover:bg-softspace-600 text-white flex items-center gap-1.5'
                    : hasOngoingCall
                      ? 'bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1.5'
                      : 'bg-green-600 hover:bg-green-500 text-white flex items-center gap-1.5'
                  }`}
              >
                {isInThisCall ? <PhoneOff size={16} /> : <Phone size={16} />}
                {isInThisCall ? t('leave_call') : hasOngoingCall ? t('join_call') : t('start_call')}
              </button>
            </div>
          )}
          {(!isDm && serverId) || (isDm && dmChannelInfo?.isGroup) ? (
            <div className="ml-auto flex items-center gap-3">
              <div className="relative group">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-softspace-500" />
                <input
                  type="text"
                  placeholder={t('search_placeholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-32 focus:w-48 bg-softspace-900 border border-softspace-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-softspace-100 focus:outline-none focus:border-softspace-600 transition-all"
                />
              </div>
              {canManageServer && !isDm && (
                <button
                  type="button"
                  onClick={() => navigate(`/app/servers/${serverId}/settings`)}
                  className="px-3 py-1.5 bg-softspace-800 hover:bg-softspace-700 text-softspace-200 rounded-xl text-sm font-medium transition-colors"
                >
                  {t('server_settings')}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setShowMembers(!showMembers);
                  if (!showMembers) setMobileMemberListOpen(true);
                  else setMobileMemberListOpen(false);
                }}
                className={`p-1.5 rounded-xl transition-colors ${showMembers ? 'bg-softspace-200 text-softspace-900' : 'bg-softspace-800 text-softspace-400 hover:text-softspace-200 hover:bg-softspace-700'}`}
                aria-label="Toggle Members"
              >
                <Users size={18} />
              </button>
            </div>
          ) : null}
        </div>

        {activeCall?.isDm && activeCall.channelId === currentActiveChannelId && (
          <>
            <div
              className="border-b border-softspace-800 overflow-hidden relative z-0 shrink-0"
              style={{
                height: activeCall.minimized ? 0 : callPanelHeight,
                minHeight: activeCall.minimized ? 0 : 180,
                maxHeight: activeCall.minimized ? 0 : '75vh',
                transition: callResizeRef.current ? 'none' : 'height 0.2s ease',
              }}
            >
              {activeCall?.channelId === currentActiveChannelId && (
                <div id="voice-chat-portal" className="absolute inset-0 z-0 bg-softspace-950 flex flex-col w-full h-full overflow-hidden" />
              )}
            </div>
            {!activeCall.minimized && (
              <div
                role="separator"
                aria-orientation="horizontal"
                aria-label={t('resize_call_panel')}
                onMouseDown={startCallPanelResize}
                className="h-2 shrink-0 cursor-row-resize bg-softspace-900 border-b border-softspace-800 hover:bg-softspace-700 transition-colors flex items-center justify-center group"
              >
                <GripHorizontal size={14} className="text-softspace-600 group-hover:text-softspace-300" />
              </div>
            )}
          </>
        )}

        <div className="flex-1 overflow-y-auto px-6 pt-4 pb-2 flex flex-col relative z-10">
          {isMessagesLoading && messages.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-softspace-500">
              <div className="animate-pulse flex items-center gap-2">
                <Hash size={16} /> {t('loading_messages')}
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-softspace-500">
              {t('no_messages_yet')}
            </div>
          ) : (
            messages
              .filter(msg => {
                if (!searchQuery) return true;
                const q = searchQuery.toLowerCase();
                const contentMatch = msg.content.toLowerCase().includes(q);
                const authorMatch = msg.author.username.toLowerCase().includes(q) || (msg.author.displayName || '').toLowerCase().includes(q);
                return contentMatch || authorMatch;
              })
              .map((msg, idx, arr) => {
                const isCallMessage = msg.messageType === 'CALL_STARTED' || msg.messageType === 'CALL_ENDED';
                if (isCallMessage) {
                  return (
                    <CallEventRow
                      key={msg.localId || msg.id}
                      message={msg}
                      dateLocale={dateLocale}
                      isActive={
                        msg.messageType === 'CALL_STARTED' &&
                        hasOngoingCall &&
                        msg.callMeta?.startedAt === ongoingCallSession?.startedAt
                      }
                      activeSessionStartedAt={ongoingCallSession?.startedAt}
                      participantCount={ongoingCallMembers.length}
                      isInCall={isInThisCall}
                      onJoin={joinDmCall}
                      onEnd={endDmCallForEveryone}
                      t={t}
                    />
                  );
                }

                const prev = arr[idx - 1];
                const showHeader =
                  !prev ||
                  prev.author.id !== msg.author.id ||
                  new Date(msg.createdAt).getTime() -
                  new Date(prev.createdAt).getTime() >
                  5 * 60 * 1000 ||
                  msg.replyToId;

                const isOwn = me?.id === msg.author.id;
                const canDelete = isOwn || me?.systemRole === 'CEO' || (!isDm && serverInfo && me?.id === serverInfo.ownerId);
                const authorMemberInfo = members.find(m => m.userId === msg.author.id);
                const authorRoleIds = authorMemberInfo?.roleIds ?? [];

                return (
                  <MessageRow
                    key={msg.localId || msg.id}
                    message={msg}
                    showHeader={Boolean(showHeader)}
                    dateLocale={dateLocale}
                    meId={me?.id ?? null}
                    meUsername={me?.username ?? ''}
                    myRoleIds={authorRoleIds}
                    serverRoles={serverInfo?.roles ?? []}
                    members={members}
                    isOwn={isOwn}
                    canDelete={Boolean(canDelete)}
                    editing={editingId === msg.id}
                    editingContent={editingContent}
                    onStartEdit={() => handleStartEdit(msg)}
                    onCancelEdit={handleCancelEdit}
                    onChangeEdit={setEditingContent}
                    onSaveEdit={() => handleSaveEdit(msg.id)}
                    onDelete={() => handleDeleteMessage(msg.id)}
                    onReply={() => setReplyTo(msg)}
                    onToggleReaction={(emoji) => handleToggleReaction(msg, emoji)}
                    reactionPickerOpen={reactionPickerFor === msg.id}
                    onOpenReactionPicker={() =>
                      setReactionPickerFor(reactionPickerFor === msg.id ? null : msg.id)
                    }
                    onImageClick={(id, url, filename, allowDownloads, isOwnImg) => {
                      setLightboxZoom(1);
                      setLightboxImage({ id, url, filename, allowDownloads, isOwn: isOwnImg });
                    }}
                    onOpenProfile={(u) => handleOpenProfile(u ?? msg.author)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      openUserContextMenu(e.clientX, e.clientY, msg.author, authorMemberInfo);
                    }}
                    onOpenUserMenu={(x, y, user) => openUserContextMenu(x, y, user, authorMemberInfo)}
                    t={t}
                  />
                );
              })
          )}
          <div ref={messagesEndRef} />
        </div>

        {isDm && hasOngoingCall && !isInThisCall && (
          <OngoingCallBanner
            session={ongoingCallSession}
            participantCount={ongoingCallMembers.length}
            onJoin={joinDmCall}
            onEnd={endDmCallForEveryone}
            t={t}
          />
        )}

        {Object.keys(typingUsers).length > 0 && (
          <div className="px-6 py-1 text-xs text-softspace-400 italic">
            {Object.keys(typingUsers).length === 1
              ? t('typing_one')
              : t('typing_many', { count: Object.keys(typingUsers).length })}
          </div>
        )}

        {/* Reply preview */}
        {replyTo && (
          <div className="mx-4 mb-2 flex items-center gap-2 bg-softspace-900 border border-softspace-800 rounded-xl px-3 py-2 text-sm">
            <CornerUpLeft size={14} className="text-softspace-400 shrink-0" />
            <span className="text-softspace-400 shrink-0">{t('replying_to')}</span>
            <span className="text-softspace-200 font-medium truncate">
              {replyTo.author.displayName || replyTo.author.username}
            </span>
            <span className="text-softspace-400 truncate">{renderReplyPreviewContent(replyTo.content)}</span>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              className="ml-auto text-softspace-400 hover:text-softspace-100"
              aria-label={t('cancel_reply') ?? 'Cancel'}
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Pending attachments preview */}
        {pendingAttachments.length > 0 && (
          <div className="mx-4 mb-2 flex flex-wrap gap-2">
            {pendingAttachments.map(att => (
              <AttachmentPreview
                key={att.id}
                attachment={att}
                onRemove={() => removePendingAttachment(att.id)}
              />
            ))}
          </div>
        )}

        {/* Mention autocomplete dropdown */}
        {filteredMentions.length > 0 && (
          <div className="mx-4 mb-2 bg-softspace-900 border border-softspace-800 rounded-2xl shadow-xl overflow-hidden max-h-48 overflow-y-auto">
            <div className="px-3 py-2 text-xs font-bold text-softspace-400 uppercase border-b border-softspace-850">
              Mention / Erwähnen
            </div>
            {filteredMentions.map((mention) => {
              if (mention.type === 'role') {
                return (
                  <button
                    type="button"
                    key={`role-${mention.id}`}
                    onClick={() => insertMention(mention.name)}
                    className="w-full text-left px-4 py-2 hover:bg-softspace-800 text-softspace-200 hover:text-softspace-100 flex items-center gap-2.5 transition-colors text-sm font-semibold cursor-pointer"
                  >
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${mention.color}30` }}
                    >
                      <Hash size={12} style={{ color: mention.color }} />
                    </div>
                    <span style={{ color: mention.color }}>@{mention.name}</span>
                  </button>
                );
              }

              const handleItemClick = (e: React.MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.target instanceof HTMLButtonElement) {
                  // Avatar button was clicked - open profile
                  if (mention.type === 'user' && mention.member?.user) {
                    handleOpenProfile(mention.member.user);
                  }
                } else {
                  // Rest of the item was clicked - insert mention
                  insertMention(mention.username ?? '');
                }
              };

              return (
                <div
                  key={`user-${mention.id}`}
                  onClick={handleItemClick}
                  className="w-full text-left px-4 py-2 hover:bg-softspace-800 text-softspace-200 hover:text-softspace-100 flex items-center gap-2.5 transition-colors text-sm font-semibold cursor-pointer"
                >
                  <button
                    type="button"
                    className="w-6 h-6 rounded-full bg-softspace-800 flex items-center justify-center overflow-hidden shrink-0 hover:bg-softspace-700 transition-colors cursor-pointer"
                    aria-label={`Open ${mention.name}'s profile`}
                  >
                    {mention.avatarUrl ? (
                      <img src={assetUrl(mention.avatarUrl)} alt={mention.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[10px] font-bold text-softspace-300">{(mention.username ?? '?').charAt(0).toUpperCase()}</span>
                    )}
                  </button>
                  <span>{mention.name}</span>
                  <span className="text-xs text-softspace-500">@{mention.username}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Input */}
        <div className="px-4 pb-4 pb-safe shrink-0">
          <form
            onSubmit={handleSendMessage}
            className={`bg-softspace-900 rounded-2xl flex items-end px-3 py-2 gap-2 border border-softspace-800 transition-colors ${canSendMessages ? 'focus-within:border-softspace-600' : 'opacity-50 cursor-not-allowed'
              }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="*/*"
              onChange={handleFileSelect}
              disabled={!canSendMessages || uploading}
              style={{ position: 'absolute', width: 0, height: 0, opacity: 0, overflow: 'hidden', pointerEvents: 'none' }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!canSendMessages || uploading}
              className="text-softspace-400 hover:text-softspace-200 transition-colors shrink-0 p-2 disabled:opacity-50"
              aria-label={t('attach_file') ?? 'Attach'}
              title={t('attach_file') ?? 'Attach'}
            >
              {uploading ? (
                <span className="text-xs">...</span>
              ) : (
                <Paperclip size={18} />
              )}
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setReactionPickerFor('input')}
                disabled={!canSendMessages}
                className="text-softspace-400 hover:text-softspace-200 transition-colors shrink-0 p-2 disabled:opacity-50"
                aria-label="Emoji"
              >
                <Smile size={18} />
              </button>
              {reactionPickerFor === 'input' && (
                <div className="absolute bottom-12 left-0 z-30 shadow-2xl w-[352px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-softspace-800 bg-softspace-900">
                  {customEmojis.length > 0 && (
                    <div className="border-b border-softspace-800">
                      <div className="px-3 pt-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-softspace-400">
                        {t('custom_emojis_heading')}
                      </div>
                      <div className="px-3 pb-3 flex flex-wrap gap-2 max-h-36 overflow-y-auto">
                        {customEmojis.map((emoji) => (
                          <button
                            key={emoji.id}
                            type="button"
                            onClick={() => {
                              setNewMessage((prev) => `${prev}:${emoji.name}:`);
                              setReactionPickerFor(null);
                            }}
                            className="flex items-center gap-2.5 rounded-2xl border border-softspace-800 bg-softspace-950 px-3 py-2 text-softspace-200 hover:border-softspace-600 hover:bg-softspace-900 transition-colors max-w-full"
                            title={`:${emoji.name}:`}
                          >
                            <img
                              src={assetUrl(emoji.url)}
                              alt={emoji.name}
                              className={emoji.type === 'GIF' ? 'h-10 w-14 rounded-xl object-cover shrink-0' : 'h-8 w-8 shrink-0'}
                            />
                            <span className="text-sm font-medium truncate max-w-[120px]">:{emoji.name}:</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <EmojiPicker
                    onEmojiClick={(emojiData) => {
                      setNewMessage(prev => prev + emojiData.emoji);
                      setReactionPickerFor(null);
                    }}
                    theme={Theme.DARK}
                    emojiStyle={EmojiStyle.NATIVE}
                    lazyLoadEmojis={true}
                    searchDisabled={false}
                    skinTonesDisabled={true}
                  />
                </div>
              )}
            </div>
            <textarea
              ref={inputRef}
              value={newMessage}
              disabled={!canSendMessages}
              onChange={(e) => {
                const val = e.target.value;
                setNewMessage(val);
                handleTyping();
                if (inputRef.current) {
                  inputRef.current.style.height = 'auto';
                  inputRef.current.style.height =
                    Math.min(inputRef.current.scrollHeight, 200) + 'px';
                }

                // Parse cursor position for @mentions
                const cursorIndex = e.target.selectionStart;
                const textBeforeCursor = val.slice(0, cursorIndex);
                const lastAtIdx = textBeforeCursor.lastIndexOf('@');

                if (lastAtIdx !== -1 && (lastAtIdx === 0 || /\s/.test(textBeforeCursor[lastAtIdx - 1]))) {
                  const query = textBeforeCursor.slice(lastAtIdx + 1);
                  if (!/\s/.test(query)) {
                    setMentionQuery(query);
                    setMentionStartIndex(lastAtIdx);
                  } else {
                    setMentionQuery(null);
                  }
                } else {
                  setMentionQuery(null);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSendMessage(e as unknown as React.FormEvent);
                }
              }}
              onPaste={handlePaste}
              rows={1}
              placeholder={canSendMessages ? t('message_placeholder') : t('send_message_denied')}
              className="flex-1 bg-transparent border-none focus:outline-none text-softspace-100 min-w-0 resize-none py-2 disabled:cursor-not-allowed"
            />
            <button
              type="submit"
              disabled={!canSendMessages || (!newMessage.trim() && pendingAttachments.length === 0)}
              className="bg-softspace-500 hover:bg-softspace-400 disabled:bg-softspace-800 disabled:text-softspace-500 text-white rounded-xl p-2.5 transition-colors shrink-0"
              aria-label="Send"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      </div>

      {showMembers && (!isDm || dmChannelInfo?.isGroup) && (
        <>
          {mobileMemberListOpen && (
            <div
              className="md:hidden fixed inset-0 bg-black/50 z-40"
              onClick={() => setMobileMemberListOpen(false)}
            />
          )}
          <div className={`
            absolute right-0 top-0 z-40 h-full min-h-0 overflow-hidden transition-transform duration-200 ease-in-out shrink-0 w-60 md:relative md:translate-x-0 md:w-auto
            ${mobileMemberListOpen ? 'translate-x-0' : 'translate-x-full'}
          `} style={{ height: '100%' }}>
            <MemberList
              members={members}
              roles={serverInfo?.roles ?? []}
              onOpenProfile={(user, memberInfo) => {
                setSelectedUser(user);
                setSelectedMemberInfo(memberInfo);
                setProfileModalOpen(true);
              }}
              onContextMenu={(e, user, memberInfo) => {
                e.preventDefault();
                e.stopPropagation();
                openUserContextMenu(e.clientX, e.clientY, user, memberInfo);
              }}
              onOpenContextMenu={(x, y, user, memberInfo) => openUserContextMenu(x, y, user, memberInfo)}
            />
          </div>
        </>
      )}

      {showCreateChannel && (
        <CreateChannelModal
          value={{ name: channelDraftName, type: channelDraftType, topic: channelDraftTopic, parentId: channelDraftParentId }}
          isCreatingChannel={isCreatingChannel}
          onChange={(patch) => {
            if (patch.name !== undefined) setChannelDraftName(patch.name);
            if (patch.type !== undefined) setChannelDraftType(patch.type as 'TEXT' | 'VOICE' | 'CATEGORY');
            if (patch.topic !== undefined) setChannelDraftTopic(patch.topic);
            if (patch.parentId !== undefined) setChannelDraftParentId(patch.parentId);
          }}
          onSubmit={handleCreateChannel}
          onClose={() => setShowCreateChannel(false)}
          categories={(serverInfo?.channels ?? []).filter((c: any) => c.type === 'CATEGORY')}
        />
      )}

      {editingChannel && (
        <EditChannelModal
          channel={editingChannel}
          name={editChannelName}
          topic={editChannelTopic}
          parentId={editChannelParentId}
          overridesStr={editChannelOverrides}
          categories={(serverInfo?.channels ?? []).filter((c: any) => c.type === 'CATEGORY')}
          roles={serverInfo?.roles ?? []}
          isSaving={isSavingChannelEdit}
          onNameChange={setEditChannelName}
          onTopicChange={setEditChannelTopic}
          onParentIdChange={setEditChannelParentId}
          onOverridesChange={setEditChannelOverrides}
          onSubmit={handleSaveChannelEdit}
          onDelete={handleDeleteChannelEdit}
          onClose={() => setEditingChannel(null)}
        />
      )}

      {lightboxImage && (
        <div className="fixed inset-0 bg-black/90 z-[100] flex flex-col items-center justify-center p-4 select-none backdrop-blur-sm animate-fadeIn">
          {/* Controls Bar on Top */}
          <div className="absolute top-4 right-4 flex items-center gap-3 bg-softspace-950/80 px-4 py-2 rounded-2xl border border-softspace-800 shrink-0">
            <button
              type="button"
              onClick={() => setLightboxZoom(z => Math.min(z + 0.25, 3))}
              className="text-softspace-300 hover:text-softspace-100 p-1.5 rounded-lg transition-colors cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn size={18} />
            </button>
            <button
              type="button"
              onClick={() => setLightboxZoom(z => Math.max(z - 0.25, 0.5))}
              className="text-softspace-300 hover:text-softspace-100 p-1.5 rounded-lg transition-colors cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut size={18} />
            </button>
            <button
              type="button"
              onClick={() => setLightboxZoom(1)}
              className="text-xs font-bold text-softspace-400 hover:text-softspace-200 px-2 py-1.5 rounded-lg bg-softspace-900 border border-softspace-850 cursor-pointer"
            >
              Reset ({Math.round(lightboxZoom * 100)}%)
            </button>

            <span className="h-4 w-px bg-softspace-800 mx-1" />

            {lightboxImage.allowDownloads || lightboxImage.isOwn ? (
              <button
                type="button"
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = `${API_URL}/api/uploads/${lightboxImage.id}/download`;
                  link.target = '_blank';
                  link.rel = 'noopener noreferrer';
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
                className="text-green-400 hover:text-green-300 p-1.5 rounded-lg transition-colors flex items-center gap-1.5 text-sm font-semibold cursor-pointer"
                title="Download"
              >
                <Download size={18} /> Download
              </button>
            ) : (
              <div className="flex items-center gap-1.5 text-red-400 text-xs font-semibold bg-red-950/40 border border-red-900/30 px-2.5 py-1.5 rounded-xl">
                <Lock size={14} /> {t('download_disabled')}
              </div>
            )}

            <span className="h-4 w-px bg-softspace-800 mx-1" />

            <button
              type="button"
              onClick={() => setLightboxImage(null)}
              className="text-softspace-300 hover:text-softspace-100 p-1.5 rounded-lg transition-colors cursor-pointer"
              title="Close"
            >
              <X size={20} />
            </button>
          </div>

          {/* Centered Image Container */}
          <div className="w-full h-full max-w-4xl max-h-[80vh] flex items-center justify-center overflow-hidden">
            <img
              src={lightboxImage.url}
              alt={lightboxImage.filename}
              className="max-w-full max-h-full rounded-lg shadow-2xl transition-all duration-150 select-none object-contain"
              style={{
                transform: `scale(${lightboxZoom})`,
                cursor: lightboxZoom > 1 ? 'zoom-out' : 'zoom-in'
              }}
              onClick={() => setLightboxZoom(z => z > 1 ? 1 : 2)}
              onContextMenu={(e) => {
                if (!lightboxImage.allowDownloads && !lightboxImage.isOwn) {
                  e.preventDefault();
                }
              }}
              onDragStart={(e) => {
                if (!lightboxImage.allowDownloads && !lightboxImage.isOwn) {
                  e.preventDefault();
                }
              }}
            />
          </div>
        </div>
      )}

      {selectedUser && (
        <UserProfileModal
          user={selectedUser}
          serverMemberInfo={selectedMemberInfo ? {
            nickname: selectedMemberInfo.nickname,
            joinedAt: selectedMemberInfo.joinedAt,
            roleIds: selectedMemberInfo.roleIds,
            roles: serverInfo?.roles?.filter((role: any) => selectedMemberInfo.roleIds?.includes(role.id)).map((role: any) => ({
              id: role.id,
              name: role.name,
              color: role.color
            }))
          } : null}
          isOpen={profileModalOpen}
          onClose={handleCloseProfile}
          language={i18n.language}
          isMe={me?.id === selectedUser.id}
          serverId={isDm ? undefined : serverId}
          canModerate={!isDm && canManageChannels}
        />
      )}
    </div>
  );
}



function CreateChannelModal({
  value,
  isCreatingChannel,
  onChange,
  onSubmit,
  onClose,
  categories = [],
}: {
  value: { name: string; type: 'TEXT' | 'VOICE' | 'CATEGORY'; topic: string; parentId?: string | null };
  isCreatingChannel: boolean;
  onChange: (patch: Partial<{ name: string; type: 'TEXT' | 'VOICE' | 'CATEGORY'; topic: string; parentId?: string | null }>) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  categories?: ChannelInfo[];
}) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm p-4">
      <div className="bg-softspace-900 border border-softspace-800 p-6 rounded-3xl w-full max-w-md shadow-2xl">
        <h2 className="text-2xl font-bold text-softspace-100 mb-4">{t('create_channel')}</h2>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-softspace-300 mb-2">
              {t('channel_name')}
            </label>
            <input
              autoFocus
              value={value.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder="general"
              className="w-full bg-softspace-950 border border-softspace-800 rounded-xl px-4 py-3 text-softspace-100 focus:outline-none focus:border-softspace-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-softspace-300 mb-2">
              {t('channel_type')}
            </label>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => onChange({ type: 'TEXT' })}
                className={`flex-1 flex items-center justify-center gap-1 px-2.5 py-3 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${value.type === 'TEXT'
                  ? 'bg-softspace-800 border-softspace-600 text-softspace-100'
                  : 'bg-softspace-950 border-softspace-800 text-softspace-300 hover:border-softspace-700'
                  }`}
              >
                <Hash size={14} /> Text
              </button>
              <button
                type="button"
                onClick={() => onChange({ type: 'VOICE' })}
                className={`flex-1 flex items-center justify-center gap-1 px-2.5 py-3 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${value.type === 'VOICE'
                  ? 'bg-softspace-800 border-softspace-600 text-softspace-100'
                  : 'bg-softspace-950 border-softspace-800 text-softspace-300 hover:border-softspace-700'
                  }`}
              >
                <Mic size={14} /> Voice
              </button>
              <button
                type="button"
                onClick={() => onChange({ type: 'CATEGORY' })}
                className={`flex-1 flex items-center justify-center gap-1 px-2.5 py-3 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${value.type === 'CATEGORY'
                  ? 'bg-softspace-800 border-softspace-600 text-softspace-100'
                  : 'bg-softspace-950 border-softspace-800 text-softspace-300 hover:border-softspace-700'
                  }`}
              >
                <Folder size={14} /> Category
              </button>
            </div>
          </div>

          {value.type !== 'CATEGORY' && (
            <div>
              <label className="block text-sm font-medium text-softspace-300 mb-2">
                {t('category_settings').replace(' settings', '')}
              </label>
              <select
                value={value.parentId ?? ''}
                onChange={(e) => onChange({ parentId: e.target.value || null })}
                className="w-full bg-softspace-950 border border-softspace-800 rounded-xl px-4 py-3 text-softspace-100 focus:outline-none focus:border-softspace-500 transition-colors cursor-pointer text-sm font-semibold"
              >
                <option value="">{t('no_category')}</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-softspace-300 mb-2">
              {t('channel_topic')}
            </label>
            <input
              value={value.topic}
              onChange={(e) => onChange({ topic: e.target.value })}
              className="w-full bg-softspace-950 border border-softspace-800 rounded-xl px-4 py-3 text-softspace-100 focus:outline-none focus:border-softspace-500 transition-colors"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-softspace-300 hover:text-softspace-100 transition-colors cursor-pointer"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={isCreatingChannel}
              className="px-5 py-2.5 bg-softspace-500 hover:bg-softspace-400 text-white font-medium rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isCreatingChannel ? t('saving') : t('save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditChannelModal({
  channel,
  name,
  topic,
  parentId,
  overridesStr,
  categories,
  roles,
  isSaving,
  onNameChange,
  onTopicChange,
  onParentIdChange,
  onOverridesChange,
  onSubmit,
  onDelete,
  onClose,
}: {
  channel: ChannelInfo;
  name: string;
  topic: string;
  parentId: string | null;
  overridesStr: string;
  categories: ChannelInfo[];
  roles: RoleInfo[];
  isSaving: boolean;
  onNameChange: (v: string) => void;
  onTopicChange: (v: string) => void;
  onParentIdChange: (v: string | null) => void;
  onOverridesChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  type OverrideEntry = { id: string; type: 'ROLE' | 'MEMBER'; allow: string; deny: string };
  let overrides: OverrideEntry[] = [];
  try {
    overrides = typeof overridesStr === 'string' ? JSON.parse(overridesStr || '[]') : (overridesStr || []);
  } catch (e) {
    console.error("Failed to parse overridesStr", e);
  }

  // To allow users to select a role to override, we manage a list of roles that have overrides.
  // By default, we show roles that already have overrides.
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [showRoleSelect, setShowRoleSelect] = useState(false);

  useEffect(() => {
    const rolesWithOverrides = overrides.filter(o => o.type === 'ROLE').map(o => o.id);
    setSelectedRoleIds(prev => Array.from(new Set([...prev, ...rolesWithOverrides])));
  }, [overridesStr]);

  const availableRolesToAdd = roles.filter(r => !selectedRoleIds.includes(r.id));

  const getOverrideState = (roleId: string, flag: bigint) => {
    const ov = overrides.find((o) => o.type === 'ROLE' && o.id === roleId);
    if (!ov) return 'inherit';
    const allow = BigInt(ov.allow ?? '0');
    const deny = BigInt(ov.deny ?? '0');
    if ((allow & flag) === flag) return 'allow';
    if ((deny & flag) === flag) return 'deny';
    return 'inherit';
  };

  const toggleOverride = (roleId: string, flag: bigint, state: 'allow' | 'deny' | 'inherit') => {
    let list = [...overrides];
    let ov = list.find((o) => o.type === 'ROLE' && o.id === roleId);
    if (!ov) {
      ov = { id: roleId, type: 'ROLE', allow: '0', deny: '0' };
      list.push(ov);
    }

    let allow = BigInt(ov.allow ?? '0');
    let deny = BigInt(ov.deny ?? '0');

    if (state === 'allow') {
      allow |= flag;
      deny &= ~flag;
    } else if (state === 'deny') {
      deny |= flag;
      allow &= ~flag;
    } else {
      allow &= ~flag;
      deny &= ~flag;
    }

    ov.allow = allow.toString();
    ov.deny = deny.toString();

    if (allow === 0n && deny === 0n) {
      list = list.filter((o) => !(o.type === 'ROLE' && o.id === roleId));
    }

    onOverridesChange(JSON.stringify(list));
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-softspace-900 border border-softspace-800 p-6 rounded-3xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col animate-fadeIn">
        <div className="flex items-center justify-between mb-4 shrink-0">
          <h2 className="text-xl font-bold text-softspace-100">{t('configure_channel')}</h2>
          <button onClick={onDelete} type="button" className="text-red-400 hover:text-red-300 text-xs font-semibold flex items-center gap-1 cursor-pointer">
            <Trash2 size={14} /> {t('delete')}
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 overflow-y-auto pr-1 flex-1">
          <div>
            <label className="block text-sm font-medium text-softspace-300 mb-1.5">Channel Name</label>
            <input
              value={name}
              onChange={e => onNameChange(e.target.value)}
              className="w-full bg-softspace-950 border border-softspace-800 rounded-xl px-4 py-2.5 text-softspace-100 focus:outline-none focus:border-softspace-500 text-sm font-semibold"
            />
          </div>

          {channel.type !== 'CATEGORY' && (
            <>
              <div>
                <label className="block text-sm font-medium text-softspace-300 mb-1.5">{t('topic')}</label>
                <input
                  value={topic}
                  onChange={e => onTopicChange(e.target.value)}
                  className="w-full bg-softspace-950 border border-softspace-800 rounded-xl px-4 py-2.5 text-softspace-100 focus:outline-none focus:border-softspace-500 text-sm font-semibold"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-softspace-300 mb-1.5">{t('category')}</label>
                <select
                  value={parentId ?? ''}
                  onChange={e => onParentIdChange(e.target.value || null)}
                  className="w-full bg-softspace-950 border border-softspace-800 rounded-xl px-4 py-2.5 text-softspace-100 focus:outline-none focus:border-softspace-500 text-sm cursor-pointer font-semibold"
                >
                  <option value="">{t('no_category')}</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Permission Overrides Panel */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-softspace-300 font-bold">{t('permissions')}</label>
              {availableRolesToAdd.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowRoleSelect(!showRoleSelect)}
                  className="text-[10px] bg-softspace-800 hover:bg-softspace-700 text-softspace-300 px-2 py-1 rounded font-bold uppercase transition-colors"
                >
                  + Add Role
                </button>
              )}
            </div>
            <p className="text-[11px] text-softspace-400 mb-3">{t('permissions_desc')}</p>

            {showRoleSelect && availableRolesToAdd.length > 0 && (
              <div className="mb-3 bg-softspace-950 p-2 rounded-xl border border-softspace-800 flex flex-wrap gap-1">
                {availableRolesToAdd.map(r => (
                  <button
                    type="button"
                    key={r.id}
                    onClick={() => {
                      setSelectedRoleIds(prev => [...prev, r.id]);
                      setShowRoleSelect(false);
                    }}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-softspace-900 hover:bg-softspace-800 transition-colors"
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                    <span className="text-xs text-softspace-200">{r.name}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-3 bg-softspace-950 p-4 rounded-xl border border-softspace-800 max-h-60 overflow-y-auto">
              {roles.filter(r => selectedRoleIds.includes(r.id)).map(r => {
                const renderToggle = (label: string, flag: bigint) => {
                  const state = getOverrideState(r.id, flag);
                  return (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-softspace-400">{label}</span>
                      <div className="flex bg-softspace-900 p-0.5 rounded-lg border border-softspace-800">
                        {(['deny', 'inherit', 'allow'] as const).map(st => (
                          <button
                            type="button"
                            key={st}
                            onClick={() => toggleOverride(r.id, flag, st)}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase cursor-pointer transition-all ${state === st
                                ? st === 'allow'
                                  ? 'bg-green-600 text-white'
                                  : st === 'deny'
                                    ? 'bg-red-600 text-white'
                                    : 'bg-softspace-700 text-softspace-100'
                                : 'text-softspace-400 hover:text-softspace-200'
                              }`}
                          >
                            {t(st) ?? st}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                };

                return (
                  <div key={r.id} className="border-b border-softspace-900 pb-3 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                        <span className="text-xs font-bold text-softspace-200">{r.name}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const newOverrides = overrides.filter(o => !(o.type === 'ROLE' && o.id === r.id));
                          onOverridesChange(JSON.stringify(newOverrides));
                          setSelectedRoleIds(prev => prev.filter(id => id !== r.id));
                        }}
                        className="text-[10px] text-red-400 hover:text-red-300 font-bold uppercase transition-colors"
                      >
                        {t('remove_btn') || 'Remove'}
                      </button>
                    </div>

                    <div className="space-y-2 pl-3">
                      {/* Common Permissions */}
                      {renderToggle(t('view_channel') || 'View Channel', 1n << 0n)}
                      {renderToggle('Manage Channel', 1n << 3n)}
                      {renderToggle('Create Invites', 1n << 8n)}

                      {/* Text Permissions */}
                      {channel.type === 'TEXT' && (
                        <>
                          {renderToggle(t('send_messages') || 'Send Messages', 1n << 1n)}
                          {renderToggle('Manage Messages', 1n << 2n)}
                          {renderToggle('Add Reactions', 1n << 13n)}
                          {renderToggle('Attach Files', 1n << 14n)}
                          {renderToggle('Mention Roles', 1n << 15n)}
                        </>
                      )}

                      {/* Voice Permissions */}
                      {(channel.type === 'VOICE' || channel.type === 'CATEGORY') && (
                        <>
                          {renderToggle('Connect', 1n << 10n)}
                          {renderToggle('Speak', 1n << 11n)}
                          {renderToggle('Video / Screen', 1n << 12n)}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-softspace-800 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs text-softspace-300 hover:text-softspace-100 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 bg-softspace-500 hover:bg-softspace-400 text-white text-xs font-medium rounded-xl disabled:opacity-50 cursor-pointer"
            >
              {isSaving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AttachmentPreview({
  attachment,
  onRemove,
}: {
  attachment: Attachment;
  onRemove: () => void;
}) {
  const isImage = attachment.mimeType.startsWith('image/');
  const ext = attachment.filename.split('.').pop()?.toUpperCase() || 'FILE';
  const sizeMB = (attachment.size / (1024 * 1024)).toFixed(2);

  return (
    <div className="relative bg-softspace-950 border border-softspace-800 rounded-xl overflow-hidden group min-w-[12rem] max-w-sm">
      <div className="bg-softspace-900/80 px-2 py-1 border-b border-softspace-800 flex items-center justify-between text-[10px]">
        <div className="flex items-center gap-1.5 truncate flex-1 pr-4">
          <span className="font-bold text-softspace-300">{ext}</span>
          <span className="text-softspace-200 truncate">{attachment.filename}</span>
        </div>
        <span className="text-softspace-500 font-medium shrink-0">{sizeMB} MB</span>
      </div>
      {isImage ? (
        <img
          src={assetUrl(attachment.url)}
          alt={attachment.filename}
          className="h-24 w-full object-cover"
        />
      ) : (
        <div className="h-24 w-full flex items-center justify-center text-3xl opacity-50 bg-softspace-900">
          📄
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-6 right-1 bg-softspace-950/80 hover:bg-red-500 hover:text-white text-softspace-100 rounded-lg p-1 transition-colors"
        aria-label="Remove"
      >
        <X size={12} />
      </button>
    </div>
  );
}

function formatCallDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

function useLiveCallDuration(startedAt?: string, active?: boolean): string {
  const [durationSec, setDurationSec] = useState(0);

  useEffect(() => {
    if (!active || !startedAt) {
      setDurationSec(0);
      return;
    }
    const update = () => {
      const diff = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
      setDurationSec(diff);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [active, startedAt]);

  return formatCallDuration(durationSec);
}

function CallEventRow(props: {
  message: ChatMessage;
  dateLocale: typeof enLocale;
  isActive: boolean;
  activeSessionStartedAt?: string;
  participantCount: number;
  isInCall: boolean;
  onJoin: () => void;
  onEnd: () => void;
  t: (k: string, opts?: Record<string, unknown>) => string;
}) {
  const { message, dateLocale, isActive, activeSessionStartedAt, participantCount, isInCall, onJoin, onEnd, t } = props;
  const meta = message.callMeta ?? {};
  const starterName =
    meta.user?.displayName || meta.user?.username || message.author.displayName || message.author.username;
  const startedAt = isActive ? (activeSessionStartedAt ?? meta.startedAt) : meta.startedAt;
  const liveDuration = useLiveCallDuration(startedAt, isActive && message.messageType === 'CALL_STARTED');

  const isStarted = message.messageType === 'CALL_STARTED';
  const isEnded = message.messageType === 'CALL_ENDED';

  let label = '';
  if (isStarted && isActive) {
    label = t('call_started', { name: starterName }) + ` · ${liveDuration}`;
  } else if (isStarted) {
    label = t('call_started', { name: starterName });
  } else if (isEnded) {
    const duration = formatCallDuration(meta.durationSec ?? 0);
    label = t('call_ended_duration', { duration });
  }

  return (
    <div className="flex justify-center my-3">
      <div className="flex flex-col items-center gap-2 max-w-md w-full">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-softspace-900/80 border border-softspace-800 text-sm text-softspace-300">
          <Phone size={14} className={isActive ? 'text-green-400' : 'text-softspace-500'} />
          <span>{label}</span>
          {isActive && participantCount > 0 && (
            <span className="text-softspace-500">· {t('call_participants', { count: participantCount })}</span>
          )}
          <span className="text-xs text-softspace-600">
            {format(new Date(message.createdAt), 'HH:mm', { locale: dateLocale })}
          </span>
        </div>
        {isStarted && isActive && !isInCall && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onJoin}
              className="px-3 py-1.5 rounded-xl text-xs font-medium bg-green-600 hover:bg-green-500 text-white transition-colors"
            >
              {t('join_call')}
            </button>
            <button
              type="button"
              onClick={onEnd}
              className="px-3 py-1.5 rounded-xl text-xs font-medium bg-red-600/80 hover:bg-red-600 text-white transition-colors"
            >
              {t('end_call_for_everyone')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function OngoingCallBanner(props: {
  session: { startedBy: string; startedAt: string; user: { id?: string; username?: string | null; displayName?: string | null; avatarUrl?: string | null; systemRole?: string | null } | null } | null | undefined;
  participantCount: number;
  onJoin: () => void;
  onEnd: () => void;
  t: (k: string, opts?: Record<string, unknown>) => string;
}) {
  const { session, participantCount, onJoin, onEnd, t } = props;
  const starterName = session?.user?.displayName || session?.user?.username || t('call_ongoing');
  const liveDuration = useLiveCallDuration(session?.startedAt, true);

  return (
    <div className="mx-4 mb-2 flex items-center justify-between gap-3 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-500/20 text-green-400 shrink-0">
          <Phone size={16} />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-softspace-100 truncate">
            {t('call_started', { name: starterName })}
          </div>
          <div className="text-xs text-softspace-400">
            {liveDuration} · {t('call_participants', { count: participantCount })}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onJoin}
          className="px-3 py-1.5 rounded-xl text-xs font-medium bg-green-600 hover:bg-green-500 text-white transition-colors"
        >
          {t('join_call')}
        </button>
        <button
          type="button"
          onClick={onEnd}
          className="px-3 py-1.5 rounded-xl text-xs font-medium bg-red-600/80 hover:bg-red-600 text-white transition-colors"
        >
          {t('end_call')}
        </button>
      </div>
    </div>
  );
}

function MessageRow(props: {
  message: ChatMessage;
  showHeader: boolean;
  dateLocale: typeof enLocale;
  meId: string | null;
  meUsername: string;
  myRoleIds: string[];
  serverRoles: RoleInfo[];
  members: MemberInfo[];
  isOwn: boolean;
  canDelete: boolean;
  editing: boolean;
  editingContent: string;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onChangeEdit: (v: string) => void;
  onSaveEdit: () => void;
  onDelete: () => void;
  onReply: () => void;
  onToggleReaction: (emoji: string) => void;
  reactionPickerOpen: boolean;
  onOpenReactionPicker: () => void;
  onImageClick: (id: string, url: string, filename: string, allowDownloads: boolean, isOwnImg: boolean) => void;
  onOpenProfile: (user?: ChatUser) => void;
  onContextMenu?: (e: React.MouseEvent, user: ChatUser) => void;
  onOpenUserMenu?: (x: number, y: number, user: ChatUser) => void;
  t: (k: string) => string;
}) {
  const {
    message,
    showHeader,
    dateLocale,
    meId,
    meUsername,
    myRoleIds,
    serverRoles,
    members,
    isOwn,
    canDelete,
    editing,
    editingContent,
    onStartEdit,
    onCancelEdit,
    onChangeEdit,
    onSaveEdit,
    onDelete,
    onReply,
    onToggleReaction,
    reactionPickerOpen,
    onOpenReactionPicker,
    onImageClick,
    onOpenProfile,
    onContextMenu,
    onOpenUserMenu,
    t,
  } = props;
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);

  const clearLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const startLongPress = (e: React.TouchEvent, user: ChatUser) => {
    if (!onOpenUserMenu) return;
    const touch = e.touches[0];
    if (!touch) return;
    clearLongPress();
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      onOpenUserMenu(touch.clientX, touch.clientY, user);
    }, 550);
  };

  const groupedReactions = (message.reactions ?? []).reduce<
    Record<string, { count: number; me: boolean }>
  >((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = { count: 0, me: false };
    acc[r.emoji].count += 1;
    if (r.userId === meId) acc[r.emoji].me = true;
    return acc;
  }, {});

  const isMentioned = Boolean(
    (meUsername && message.content.includes('@' + meUsername)) ||
    (message.mentionedRoleIds?.length && (
      message.mentionedRoleIds.some(rid => rid === '@everyone' || myRoleIds.includes(rid))
    ))
  );
  const isReplyToMe = Boolean(message.replyTo && message.replyTo.authorId === meId);

  // Parse custom emojis and mentions for rendering
  const renderContent = () => {
    if (!message.content) return null;

    const renderMentionText = (text: string, keyPrefix: string) => {
      const parts = text.split(/(@\w+)/g);
      return parts.map((part, index) => {
        if (!part.startsWith('@')) return <span key={`${keyPrefix}-text-${index}`}>{part}</span>;

        const mentionName = part.substring(1).toLowerCase();
        const role = serverRoles?.find(r => r.name.toLowerCase() === mentionName || (r.isDefault && mentionName === 'everyone'));
        if (role) {
          const isMyRole = role.isDefault || myRoleIds.includes(role.id);
          return (
            <span
              key={`${keyPrefix}-role-${index}`}
              className={`font-semibold px-1 rounded-md ${isMyRole ? 'bg-amber-500/20 text-amber-300' : 'bg-softspace-800/50'}`}
              style={{ color: isMyRole ? undefined : role.color }}
            >
              {part}
            </span>
          );
        }

        const member = members.find(m =>
          (m.user?.username ?? '').toLowerCase() === mentionName ||
          (m.user?.displayName ?? '').toLowerCase() === mentionName ||
          (m.nickname ?? '').toLowerCase() === mentionName
        );

        if (member) {
          const isMe = member.userId === meId;
          return (
            <button
              key={`${keyPrefix}-user-${index}`}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (member.user) onOpenProfile(member.user);
              }}
              className={`font-semibold px-1 rounded-md cursor-pointer hover:underline transition-colors ${isMe ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30' : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                }`}
            >
              {part}
            </button>
          );
        }

        return <span key={`${keyPrefix}-fallback-${index}`}>{part}</span>;
      });
    };

    const nodes = [];
    let lastIndex = 0;
    let match;
    CUSTOM_EMOJI_TOKEN_RE.lastIndex = 0;

    while ((match = CUSTOM_EMOJI_TOKEN_RE.exec(message.content)) !== null) {
      if (match.index > lastIndex) {
        nodes.push(...renderMentionText(message.content.slice(lastIndex, match.index), `segment-${lastIndex}`));
      }
      nodes.push(
        renderCustomEmojiInline(
          match[1] as 'EMOJI' | 'GIF',
          match[2],
          match[3],
          `emoji-${match.index}`
        )
      );
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < message.content.length) {
      nodes.push(...renderMentionText(message.content.slice(lastIndex), `tail-${lastIndex}`));
    }

    return nodes;
  };

  return (
    <div
      className={`group relative flex gap-3 ${showHeader ? 'mt-4' : 'mt-0.5'} rounded-lg -mx-2 px-2 py-1 transition-colors border-l-4 ${isMentioned
          ? 'border-amber-500 bg-amber-500/5 hover:bg-amber-500/10'
          : isReplyToMe
            ? 'border-softspace-400 bg-softspace-400/5 hover:bg-softspace-400/10'
            : 'border-transparent hover:bg-softspace-900/40'
        }`}
    >
      {showHeader ? (
        <button
          type="button"
          onClick={() => {
            if (longPressTriggeredRef.current) {
              longPressTriggeredRef.current = false;
              return;
            }
            onOpenProfile(message.author);
          }}
          onContextMenu={(e) => onContextMenu?.(e, message.author)}
          onTouchStart={(e) => startLongPress(e, message.author)}
          onTouchEnd={clearLongPress}
          onTouchMove={clearLongPress}
          onTouchCancel={clearLongPress}
          className="w-10 h-10 bg-softspace-800 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden hover:bg-softspace-700 transition-colors cursor-pointer pointer-events-auto"
          aria-label={`Open ${message.author.displayName || message.author.username}'s profile`}
        >
          {message.author.avatarUrl ? (
            <img
              src={assetUrl(message.author.avatarUrl)}
              alt={message.author.username}
              className="w-full h-full object-cover pointer-events-none select-none"
              draggable="false"
            />
          ) : (
            <span className="font-bold text-softspace-300 pointer-events-none select-none">
              {message.author.username.charAt(0).toUpperCase()}
            </span>
          )}
        </button>
      ) : (
        <div className="w-10 flex-shrink-0" />
      )}

      <div className="flex-1 min-w-0">
        {message.replyTo && (
          <div className="flex items-center gap-2 text-xs text-softspace-400 mb-1 truncate">
            <CornerUpLeft size={12} />
            <span className="font-semibold text-softspace-300 truncate">
              {message.replyTo.author?.displayName || message.replyTo.author?.username}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              <UserBadges badges={message.replyTo.author?.badges} variant="compact" />
            </div>
            <span className="truncate text-softspace-500">{renderReplyPreviewContent(message.replyTo.content)}</span>
          </div>
        )}

        {showHeader && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => {
                if (longPressTriggeredRef.current) {
                  longPressTriggeredRef.current = false;
                  return;
                }
                onOpenProfile(message.author);
              }}
              onContextMenu={(e) => onContextMenu?.(e, message.author)}
              onTouchStart={(e) => startLongPress(e, message.author)}
              onTouchEnd={clearLongPress}
              onTouchMove={clearLongPress}
              onTouchCancel={clearLongPress}
              className="font-semibold text-softspace-100 truncate hover:text-softspace-50 hover:underline transition-colors cursor-pointer text-left"
              aria-label={`Open ${message.author.displayName || message.author.username}'s profile`}
            >
              {message.author.displayName || message.author.username}
            </button>
            <div className="flex items-center gap-1 shrink-0">
              <UserBadges badges={message.author.badges} variant="compact" />
            </div>
            {message.author.systemRole === 'CEO' && (
              <span className="text-[10px] bg-orange-500 text-white px-1.5 py-0.5 rounded font-bold uppercase shrink-0">
                CEO
              </span>
            )}
            {message.author.pronouns && (
              <span className="text-[10px] bg-softspace-800 text-softspace-300 px-1.5 py-0.5 rounded font-normal shrink-0">
                {message.author.pronouns}
              </span>
            )}
            <span className="text-xs text-softspace-500 shrink-0">
              {format(new Date(message.createdAt), 'PPp', { locale: dateLocale })}
            </span>
          </div>
        )}

        {editing ? (
          <div className="mt-1">
            <textarea
              autoFocus
              value={editingContent}
              onChange={(e) => onChangeEdit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSaveEdit();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  onCancelEdit();
                }
              }}
              rows={Math.min(8, editingContent.split('\n').length + 1)}
              className="w-full bg-softspace-950 border border-softspace-700 rounded-xl px-3 py-2 text-softspace-100 focus:outline-none focus:border-softspace-500"
            />
            <div className="flex gap-2 mt-1 text-xs text-softspace-500">
              <button
                type="button"
                onClick={onCancelEdit}
                className="hover:text-softspace-200"
              >
                {t('cancel')}
              </button>
              <span>·</span>
              <button
                type="button"
                onClick={onSaveEdit}
                className="text-softspace-200 hover:text-softspace-100"
              >
                {t('save')}
              </button>
            </div>
          </div>
        ) : (
          <>
            {message.content && (
              <p className="text-softspace-200 break-words whitespace-pre-wrap leading-relaxed">
                {renderContent()}
                {message.editedAt && (
                  <span className="text-xs text-softspace-500 ml-2">
                    ({t('edited')})
                  </span>
                )}
              </p>
            )}

            {(message.attachments ?? []).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {message.attachments!.map(att => (
                  <AttachmentView
                    key={att.id}
                    attachment={att}
                    onImageClick={onImageClick}
                    allowDownloads={message.author.allowDownloads !== false}
                    isOwn={meId === message.author.id}
                  />
                ))}
              </div>
            )}

            {Object.keys(groupedReactions).length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {Object.entries(groupedReactions).map(([emoji, { count, me }]) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => onToggleReaction(emoji)}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${me
                      ? 'bg-softspace-500/20 border-softspace-400/40 text-softspace-100'
                      : 'bg-softspace-900 border-softspace-800 text-softspace-300 hover:bg-softspace-800'
                      }`}
                  >
                    <span>{emoji}</span>
                    <span>{count}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Hover toolbar */}
      {!editing && (
        <div className="absolute top-0 right-2 -translate-y-1/2 hidden group-hover:flex items-center gap-1 bg-softspace-900 border border-softspace-800 rounded-xl shadow-lg px-1 py-1">
          <button
            type="button"
            onClick={onOpenReactionPicker}
            className="p-1.5 text-softspace-400 hover:text-softspace-100 hover:bg-softspace-800 rounded-lg"
            aria-label={t('add_reaction')}
            title={t('add_reaction')}
          >
            <Smile size={16} />
          </button>
          <button
            type="button"
            onClick={onReply}
            className="p-1.5 text-softspace-400 hover:text-softspace-100 hover:bg-softspace-800 rounded-lg"
            aria-label={t('reply')}
            title={t('reply')}
          >
            <Reply size={16} />
          </button>
          {isOwn && (
            <button
              type="button"
              onClick={onStartEdit}
              className="p-1.5 text-softspace-400 hover:text-softspace-100 hover:bg-softspace-800 rounded-lg"
              aria-label={t('edit')}
              title={t('edit')}
            >
              <Pencil size={16} />
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="p-1.5 text-softspace-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg"
              aria-label={t('delete_message')}
              title={t('delete_message')}
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      )}

      {reactionPickerOpen && (
        <div className="absolute top-8 right-2 z-30 shadow-2xl">
          <EmojiPicker
            onEmojiClick={(emojiData) => onToggleReaction(emojiData.emoji)}
            theme={Theme.DARK}
            emojiStyle={EmojiStyle.NATIVE}
            lazyLoadEmojis={true}
            searchDisabled={false}
            skinTonesDisabled={true}
          />
        </div>
      )}
    </div>
  );
}

function AttachmentView({
  attachment,
  onImageClick,
  allowDownloads = true,
  isOwn = false,
}: {
  attachment: Attachment;
  onImageClick?: (id: string, url: string, filename: string, allowDownloads: boolean, isOwn: boolean) => void;
  allowDownloads?: boolean;
  isOwn?: boolean;
}) {
  const url = assetUrl(attachment.url);

  const ext = attachment.filename.split('.').pop()?.toUpperCase() || 'FILE';
  const sizeMB = (attachment.size / (1024 * 1024)).toFixed(2);

  const fileHeader = (
    <div className="bg-softspace-950/80 px-3 py-1.5 border-b border-softspace-800 flex items-center justify-between text-xs rounded-t-xl group-hover:bg-softspace-900 transition-colors">
      <div className="flex items-center gap-2 truncate flex-1">
        <span className="font-bold text-softspace-300">{ext}</span>
        <span className="text-softspace-200 truncate">{attachment.filename}</span>
      </div>
      <span className="text-softspace-500 font-medium shrink-0 ml-2">{sizeMB} MB</span>
    </div>
  );

  if (attachment.mimeType.startsWith('image/')) {
    return (
      <div className="group border border-softspace-800 rounded-xl overflow-hidden max-w-sm w-full">
        {fileHeader}
        <button
          type="button"
          onClick={() => onImageClick?.(attachment.id, url, attachment.filename, allowDownloads, isOwn)}
          className="block w-full focus:outline-none cursor-pointer text-left bg-softspace-950"
        >
          <img
            src={url}
            alt={attachment.filename}
            className="w-full max-h-72 object-cover hover:opacity-90 transition-opacity"
            onContextMenu={(e) => {
              if (!allowDownloads && !isOwn) e.preventDefault();
            }}
            onDragStart={(e) => {
              if (!allowDownloads && !isOwn) e.preventDefault();
            }}
          />
        </button>
      </div>
    );
  }

  if (attachment.mimeType.startsWith('video/')) {
    return (
      <div className="group border border-softspace-800 rounded-xl overflow-hidden max-w-sm w-full bg-softspace-950">
        {fileHeader}
        <video
          src={url}
          controls
          className="w-full max-h-72 object-contain bg-black"
        />
      </div>
    );
  }

  if (attachment.mimeType.startsWith('audio/')) {
    return (
      <div className="group border border-softspace-800 rounded-xl overflow-hidden max-w-sm w-full bg-softspace-950">
        {fileHeader}
        <div className="p-3">
          <audio src={url} controls className="w-full h-10" />
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        const link = document.createElement('a');
        link.href = `${API_URL}/api/uploads/${attachment.id}/download`;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }}
      className="w-full text-left group bg-softspace-950 border border-softspace-800 rounded-xl hover:bg-softspace-900 transition-colors max-w-xs block overflow-hidden cursor-pointer"
    >
      {fileHeader}
      <div className="px-3 py-2 flex items-center gap-2 text-sm text-softspace-300">
        <span className="text-xl">📄</span>
        <span>Download File</span>
      </div>
    </button>
  );
}
