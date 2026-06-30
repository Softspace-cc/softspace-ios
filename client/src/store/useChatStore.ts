import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from './useAuthStore';
import { resolveSocketUrl } from '../lib/api';
import { getClientPlatform } from '../lib/platform';

export type VoiceMember = {
  userId: string;
  muted: boolean;
  deafened: boolean;
  video: boolean;
  screen: boolean;
  user: {
    id?: string;
    username?: string | null;
    displayName?: string | null;
    avatarUrl?: string | null;
    systemRole?: string | null;
  } | null;
};

export type CallSession = {
  startedBy: string;
  startedAt: string;
  user: VoiceMember['user'];
};

const SELECTION_KEY = 'softspace:selection';

function loadSelection(): { serverId: string | null; channelId: string | null } {
  try {
    const raw = sessionStorage.getItem(SELECTION_KEY);
    if (!raw) return { serverId: null, channelId: null };
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return {
      serverId: typeof parsed?.serverId === 'string' ? parsed.serverId : null,
      channelId: typeof parsed?.channelId === 'string' ? parsed.channelId : null,
    };
  } catch {
    return { serverId: null, channelId: null };
  }
}

interface ChatState {
  socket: Socket | null;
  connected: boolean;
  activeServerId: string | null;
  activeChannelId: string | null;
  activeCall: { channelId: string; isDm: boolean; minimized: boolean } | null;
  voiceStates: Record<string, VoiceMember[]>;
  callSessions: Record<string, CallSession | null>;
  unreads: Record<string, number>;
  setActiveChannel: (serverId: string | null, channelId: string | null) => void;
  setActiveCall: (call: { channelId: string; isDm: boolean; minimized: boolean } | null) => void;
  incrementUnread: (channelId: string) => void;
  clearUnread: (channelId: string) => void;
  connect: () => void;
  disconnect: () => void;
}

const initialSelection = loadSelection();

export const useChatStore = create<ChatState>((set, get) => ({
  socket: null,
  connected: false,
  activeServerId: initialSelection.serverId,
  activeChannelId: initialSelection.channelId,
  activeCall: null,
  voiceStates: {},
  callSessions: {},
  unreads: {},
  setActiveChannel: (serverId, channelId) => {
    try {
      sessionStorage.setItem(SELECTION_KEY, JSON.stringify({ serverId, channelId }));
    } catch {
      // ignore storage errors
    }
    set({ activeServerId: serverId, activeChannelId: channelId });
    if (channelId) {
      get().clearUnread(channelId);
    }
  },
  setActiveCall: (call) => set({ activeCall: call }),
  incrementUnread: (channelId) => set((state) => ({
    unreads: {
      ...state.unreads,
      [channelId]: (state.unreads[channelId] ?? 0) + 1
    }
  })),
  clearUnread: (channelId) => set((state) => ({
    unreads: {
      ...state.unreads,
      [channelId]: 0
    }
  })),
  connect: () => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    if (get().socket) return; // already connected
    const platform = getClientPlatform();

    const socket = io(resolveSocketUrl(), {
      auth: { token, platform },
      query: { platform },
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => set({ connected: true }));
    socket.on('disconnect', () => set({ connected: false }));
    socket.on('connect_error', (err) => {
      console.error('socket connect error', err.message);
    });

    socket.on('ready', (data: { voiceStates?: Record<string, VoiceMember[]>; callSessions?: Record<string, CallSession> }) => {
      if (data?.voiceStates) set({ voiceStates: data.voiceStates });
      if (data?.callSessions) set({ callSessions: data.callSessions });
    });

    socket.on('message:created', (msg: any) => {
      const { activeChannelId } = get();
      const me = useAuthStore.getState().user;
      if (!msg || msg.authorId === me?.id) return;
      if (msg.channelId && msg.channelId !== activeChannelId) {
        get().incrementUnread(msg.channelId);
      }
    });

    socket.on('dm:message_created', (msg: any) => {
      const { activeChannelId } = get();
      const me = useAuthStore.getState().user;
      if (!msg || msg.authorId === me?.id) return;
      // Resolve the actual DM channel ID from URL or message
      const dmChannelId = msg.dmChannelId;
      if (dmChannelId && dmChannelId !== activeChannelId) {
        get().incrementUnread(dmChannelId);
      }
    });

    socket.on(
      'voice:state_update',
      ({
        channelId,
        members,
        session,
      }: {
        channelId: string;
        members?: VoiceMember[];
        session?: CallSession | null;
      }) => {
        if (!channelId) return;
        set((state) => ({
          voiceStates: { ...state.voiceStates, [channelId]: members ?? [] },
          callSessions: {
            ...state.callSessions,
            [channelId]:
              (members ?? []).length === 0
                ? null
                : session !== undefined
                  ? session
                  : state.callSessions[channelId] ?? null,
          },
        }));
      }
    );

    socket.on('call:force_end', ({ channelId }: { channelId: string }) => {
      const { activeCall } = get();
      if (activeCall?.channelId === channelId) {
        set({ activeCall: null });
      }
    });

    set({ socket });
  },
  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null, connected: false, voiceStates: {}, callSessions: {}, unreads: {} });
    }
  },
}));
