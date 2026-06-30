import { create } from 'zustand';

export interface User {
  id: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  bio?: string | null;
  pronouns?: string | null;
  identityTags?: string[];
  badges?: string[];
  accentColor?: string | null;
  status: string;
  customStatus?: string | null;
  activities?: string | null;
  platform?: 'web' | 'desktop' | null;
  email?: string;
  locale?: string;
  theme?: string;
  allowDownloads?: boolean;
  systemRole?: string | null;
}

interface AuthState {
  user: User | null;
  token: string | null;
  setAuth: (user: User, token: string) => void;
  setUser: (user: User) => void;
  logout: () => void;
}

function loadStored<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: loadStored<User>('softspace_user'),
  token: localStorage.getItem('softspace_token'),
  setAuth: (user, token) => {
    localStorage.setItem('softspace_token', token);
    localStorage.setItem('softspace_user', JSON.stringify(user));
    set({ user, token });
    if (user.status) {
      import('../lib/watchSync').then(({ syncPresenceToWatch }) => {
        void syncPresenceToWatch(user.status as any);
      }).catch(() => {});
    }
  },
  setUser: (user) => {
    localStorage.setItem('softspace_user', JSON.stringify(user));
    set({ user });
    if (user.status) {
      import('../lib/watchSync').then(({ syncPresenceToWatch }) => {
        void syncPresenceToWatch(user.status as any);
      }).catch(() => {});
    }
  },
  logout: () => {
    localStorage.removeItem('softspace_token');
    localStorage.removeItem('softspace_user');
    set({ user: null, token: null });
    import('../lib/watchSync').then(({ syncPresenceToWatch }) => {
      void syncPresenceToWatch('offline');
    }).catch(() => {});
  },
}));
