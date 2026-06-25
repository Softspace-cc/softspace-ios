import { create } from 'zustand';

interface ChannelSummary {
  id: string;
  name: string;
  type: 'TEXT' | 'VOICE' | 'CATEGORY' | string;
}

interface Server {
  id: string;
  name: string;
  iconUrl: string | null;
  description?: string | null;
  bannerUrl?: string | null;
  vanityUrl?: string | null;
  isPublic?: boolean;
  ownerId?: string;
  createdAt?: string;
  channels?: ChannelSummary[];
}

interface ServerState {
  servers: Server[];
  cachedServerInfos: Record<string, any>;
  cachedMembers: Record<string, any[]>;
  cachedMessages: Record<string, any[]>;
  cachedDms: any[];
  cachedFriends: any[];
  setServers: (servers: Server[]) => void;
  addServer: (server: Server) => void;
  removeServer: (serverId: string) => void;
  setCachedServerInfo: (serverId: string, info: any) => void;
  setCachedMembers: (serverId: string, members: any[]) => void;
  setCachedMessages: (channelId: string, messages: any[]) => void;
  setCachedDms: (dms: any[]) => void;
  setCachedFriends: (friends: any[]) => void;
  clear: () => void;
}

export const useServerStore = create<ServerState>((set) => ({
  servers: [],
  cachedServerInfos: {},
  cachedMembers: {},
  cachedMessages: {},
  cachedDms: [],
  cachedFriends: [],
  clear: () => set({
    servers: [],
    cachedServerInfos: {},
    cachedMembers: {},
    cachedMessages: {},
    cachedDms: [],
    cachedFriends: []
  }),
  setServers: (servers) => {
    console.log("Setting servers in store:", servers?.length);
    set({ servers });
  },
  addServer: (server) => set((state) => {
    if (state.servers.some(s => s.id === server.id)) return state;
    return { servers: [...state.servers, server] };
  }),
  removeServer: (serverId) => set((state) => ({
    servers: state.servers.filter(s => s.id !== serverId)
  })),
  setCachedServerInfo: (serverId, info) => set((state) => ({
    cachedServerInfos: { ...state.cachedServerInfos, [serverId]: info }
  })),
  setCachedMembers: (serverId, members) => set((state) => ({
    cachedMembers: { ...state.cachedMembers, [serverId]: members }
  })),
  setCachedMessages: (channelId, messages) => set((state) => ({
    cachedMessages: { ...state.cachedMessages, [channelId]: messages }
  })),
  setCachedDms: (dms) => set({ cachedDms: dms }),
  setCachedFriends: (friends) => set({ cachedFriends: friends }),
}));