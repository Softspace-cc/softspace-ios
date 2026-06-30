import { create } from 'zustand';
import { useChatStore } from './useChatStore';

export type BackendMode = 'primary' | 'backup1' | 'backup2' | 'offline';

const configuredApiUrl =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'https://softspace.cc';

function getPrimaryUrl() {
  if (typeof window !== 'undefined' && window.location.hostname === 'api.softspace.cc') {
    return window.location.origin;
  }
  return configuredApiUrl;
}

interface BackendState {
  activeUrl: string;
  primaryUrl: string;
  backup1Url: string;
  backup2Url: string;
  mode: BackendMode;
  isReconnecting: boolean;
  message: string | null;
  
  initialize: () => Promise<void>;
  handleRequestFailure: () => Promise<boolean>;
  resetToPrimary: () => Promise<boolean>;
  updateBackups: (b1: string, b2: string) => void;
}

async function pingServer(url: string): Promise<boolean> {
  if (!url) return false;
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${url}/api/status/snapshot`, {
      signal: controller.signal,
      cache: 'no-store'
    });
    clearTimeout(id);
    return res.ok;
  } catch {
    return false;
  }
}

export const useBackendStore = create<BackendState>((set, get) => ({
  activeUrl: getPrimaryUrl(),
  primaryUrl: getPrimaryUrl(),
  backup1Url: localStorage.getItem('softspace_backup1_url') || 'https://softspace.cc/api-backup1',
  backup2Url: localStorage.getItem('softspace_backup2_url') || 'https://softspace.cc/api-backup2',
  mode: (localStorage.getItem('softspace_backend_mode') as BackendMode) || 'primary',
  isReconnecting: false,
  message: null,

  initialize: async () => {
    const { primaryUrl } = get();
    
    // Set initial activeUrl based on stored mode
    const storedMode = (localStorage.getItem('softspace_backend_mode') as BackendMode) || 'primary';
    if (storedMode === 'backup1') {
      set({ activeUrl: get().backup1Url, mode: 'backup1' });
    } else if (storedMode === 'backup2') {
      set({ activeUrl: get().backup2Url, mode: 'backup2' });
    } else {
      set({ activeUrl: primaryUrl, mode: 'primary' });
    }

    // Try to update backup URLs from primary backend on startup if online
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${primaryUrl}/api/backend/config`, {
        signal: controller.signal,
        cache: 'no-store'
      });
      clearTimeout(id);
      if (res.ok) {
        const config = await res.json();
        if (config.backup1Url || config.backup2Url) {
          get().updateBackups(config.backup1Url, config.backup2Url);
        }
      }
    } catch (e) {
      console.warn('Could not fetch backup configs on start, using cached values.', e);
    }
  },

  handleRequestFailure: async () => {
    const { mode, backup1Url, backup2Url, primaryUrl, isReconnecting } = get();
    if (isReconnecting) {
      // Wait for the active reconnect attempt
      await new Promise(resolve => setTimeout(resolve, 3000));
      return get().mode !== 'offline';
    }

    set({ isReconnecting: true });

    // Step 1: Check if primary came back online (if we were on a backup)
    if (mode !== 'primary') {
      console.log('Testing primary server connection...');
      const primaryOnline = await pingServer(primaryUrl);
      if (primaryOnline) {
        console.log('Primary server is back online. Reconnecting to primary...');
        set({
          activeUrl: primaryUrl,
          mode: 'primary',
          message: 'Hauptserver wieder online. Verbinde...',
          isReconnecting: false
        });
        localStorage.setItem('softspace_backend_mode', 'primary');
        
        // Reconnect chat socket
        const chatStore = useChatStore.getState();
        if (chatStore.socket) {
          chatStore.disconnect();
          setTimeout(() => chatStore.connect(), 500);
        }
        
        setTimeout(() => set({ message: null }), 5000);
        return true;
      }
    }

    // Step 2: Failover check sequence
    if (mode === 'primary') {
      console.log('Primary server offline. Trying Backup 1...');
      set({ message: 'Verbindung verloren. Versuche Backup-Server 1...' });
      
      const b1Online = await pingServer(backup1Url);
      if (b1Online) {
        console.log('Backup 1 online. Switching...');
        set({
          activeUrl: backup1Url,
          mode: 'backup1',
          message: 'Verbindung über Backup-Server 1 hergestellt.',
          isReconnecting: false
        });
        localStorage.setItem('softspace_backend_mode', 'backup1');

        // Reconnect socket
        const chatStore = useChatStore.getState();
        if (chatStore.socket) {
          chatStore.disconnect();
          setTimeout(() => chatStore.connect(), 500);
        }

        setTimeout(() => set({ message: null }), 8000);
        return true;
      }
      
      // Fall through to try Backup 2
      console.log('Backup 1 offline. Trying Backup 2...');
      set({ message: 'Backup-Server 1 offline. Versuche Backup-Server 2...' });
      
      const b2Online = await pingServer(backup2Url);
      if (b2Online) {
        console.log('Backup 2 online. Switching...');
        set({
          activeUrl: backup2Url,
          mode: 'backup2',
          message: 'Verbindung über Backup-Server 2 hergestellt.',
          isReconnecting: false
        });
        localStorage.setItem('softspace_backend_mode', 'backup2');

        // Reconnect socket
        const chatStore = useChatStore.getState();
        if (chatStore.socket) {
          chatStore.disconnect();
          setTimeout(() => chatStore.connect(), 500);
        }

        setTimeout(() => set({ message: null }), 8000);
        return true;
      }
    } else if (mode === 'backup1') {
      console.log('Backup 1 offline. Trying Backup 2...');
      set({ message: 'Backup-Server 1 offline. Versuche Backup-Server 2...' });
      
      const b2Online = await pingServer(backup2Url);
      if (b2Online) {
        console.log('Backup 2 online. Switching...');
        set({
          activeUrl: backup2Url,
          mode: 'backup2',
          message: 'Verbindung über Backup-Server 2 hergestellt.',
          isReconnecting: false
        });
        localStorage.setItem('softspace_backend_mode', 'backup2');

        // Reconnect socket
        const chatStore = useChatStore.getState();
        if (chatStore.socket) {
          chatStore.disconnect();
          setTimeout(() => chatStore.connect(), 500);
        }

        setTimeout(() => set({ message: null }), 8000);
        return true;
      }
    }

    // If we reach here, all options failed
    console.error('All backend servers are offline!');
    set({
      mode: 'offline',
      message: 'Keine Verbindung zum Server möglich. Bitte überprüfe deine Internetverbindung.',
      isReconnecting: false
    });
    localStorage.setItem('softspace_backend_mode', 'offline');
    return false;
  },

  resetToPrimary: async () => {
    const { primaryUrl } = get();
    set({
      activeUrl: primaryUrl,
      mode: 'primary',
      message: 'Verbinde mit Hauptserver...',
      isReconnecting: false
    });
    localStorage.setItem('softspace_backend_mode', 'primary');

    // Reconnect socket
    const chatStore = useChatStore.getState();
    if (chatStore.socket) {
      chatStore.disconnect();
      setTimeout(() => chatStore.connect(), 500);
    }
    
    setTimeout(() => set({ message: null }), 3000);
    return true;
  },

  updateBackups: (b1, b2) => {
    set({ backup1Url: b1, backup2Url: b2 });
    localStorage.setItem('softspace_backup1_url', b1);
    localStorage.setItem('softspace_backup2_url', b2);
  }
}));
