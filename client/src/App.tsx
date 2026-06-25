import { useEffect, useRef } from 'react';
import {
  BrowserRouter,
  HashRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
} from 'react-router-dom';
import { useAuthStore } from './store/useAuthStore';
import { useChatStore } from './store/useChatStore';
import { api } from './lib/api';
import { useNavigate } from 'react-router-dom';

import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import AuthPage from './pages/AuthPage';
import FriendsLayout, { FriendsContent } from './pages/FriendsPage';
import SettingsPage from './pages/SettingsPage';
import RootPage from './pages/RootPage';
import StatusPage from './pages/StatusPage';
import ExplorePage from './pages/ExplorePage';
import ServerSettingsPage from './pages/ServerSettingsPage';
import InvitePage from './pages/InvitePage';
import TermsPage from './pages/TermsPage';
import GuidelinesPage from './pages/GuidelinesPage';
import PrivacyPage from './pages/PrivacyPage';
import SupportPage from './pages/SupportPage';
import SupportTicketPage from './pages/SupportTicketPage';
import SupportAdminPage from './pages/SupportAdminPage';
import AboutPage from './pages/AboutPage';
import DiscordCallbackPage from './pages/DiscordCallbackPage';
import BadgeAdminPage from './pages/BadgeAdminPage';
import AppsGamesAdminPage from './pages/AppsGamesAdminPage';
import QRConfirmPage from './pages/QRConfirmPage';
import BlogPage from './pages/BlogPage';
import BlogAdminPage from './pages/BlogAdminPage';
import EmailChangeAdminPage from './pages/EmailChangeAdminPage';
import { CallRingModal } from './components/CallRingModal';
import { GlobalContextMenu } from './components/GlobalContextMenu';
import { isDesktopApp, isCapacitorApp } from './lib/platform';

import { useServerStore } from './store/useServerStore';

// ...
function AppLayout() {
  const { mobileSidebarOpen, setMobileSidebarOpen } = useLayoutStore();
  
  return (
    <div className="flex h-full w-full bg-softspace-950 text-softspace-50 overflow-hidden relative">
      {/* Mobile overlay for main sidebar */}
      {mobileSidebarOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/50 z-40" 
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}
      <div className={`
        absolute left-0 top-0 z-50 h-full transition-transform duration-200 ease-in-out w-20 md:relative md:translate-x-0 md:w-auto
        ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <Sidebar />
      </div>
      <div className="flex-1 flex flex-col bg-softspace-900 overflow-hidden relative min-w-0">
        <Outlet />
      </div>
      <GlobalCallManager />
      <GlobalNotificationManager />
      <GlobalPresenceManager />
      <CallRingModal />
      <GlobalContextMenu />
    </div>
  );
}

const isElectron = isDesktopApp();
const isCapacitor = isCapacitorApp();
const Router = (isElectron || isCapacitor) ? HashRouter : BrowserRouter;

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore(state => state.token);
  const user = useAuthStore(state => state.user);
  const setAuth = useAuthStore(state => state.setAuth);
  const logout = useAuthStore(state => state.logout);
  const connect = useChatStore(state => state.connect);
  const disconnect = useChatStore(state => state.disconnect);
  const socket = useChatStore(state => state.socket);
  const navigate = useNavigate();

  // Auto-away after 5 minutes of inactivity
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isIdleRef = useRef(false);

  useEffect(() => {
    const handleBeforeUnload = () => {
      // Force immediate disconnect so the server knows the user left
      if (socket) {
        // Send a synchronous beacon or emit a final status so the server knows instantly
        socket.emit('presence:set', { status: 'offline' });
        socket.disconnect();
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [socket]);

  useEffect(() => {
    if (!token || !user || !socket) return;
    
    // Set initial status to server to ensure we are marked online, unless we want to be DND/invisible
    if (!user.status || user.status === 'offline') {
      socket.emit('presence:set', { status: 'online', customStatus: user.customStatus });
      setAuth({ ...user, status: 'online' }, token);
    } else {
      socket.emit('presence:set', { status: user.status, customStatus: user.customStatus });
    }

    const resetIdleTimer = () => {
      if (isIdleRef.current) {
        // We were idle, but now we're active again. Restore online status if we didn't explicitly set to dnd/invisible
        const currentUser = useAuthStore.getState().user;
        if (currentUser && currentUser.status !== 'dnd' && currentUser.status !== 'invisible') {
          socket.emit('presence:set', { status: 'online', customStatus: currentUser.customStatus });
          setAuth({ ...currentUser, status: 'online' }, token);
        }
        isIdleRef.current = false;
      }

      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);

      idleTimeoutRef.current = setTimeout(() => {
        isIdleRef.current = true;
        const currentUser = useAuthStore.getState().user;
        if (currentUser && currentUser.status === 'online') {
          socket.emit('presence:set', { status: 'idle', customStatus: currentUser.customStatus });
          setAuth({ ...currentUser, status: 'idle' }, token);
        }
      }, 10 * 60 * 1000); // 10 minutes
    };

    resetIdleTimer();

    const handleActivity = () => resetIdleTimer();

    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('mousedown', handleActivity);
    window.addEventListener('touchstart', handleActivity);

    return () => {
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('mousedown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
    };
  }, [token, socket, user?.status, user?.customStatus, setAuth]);

  useEffect(() => {
    if (!token) {
      useServerStore.getState().clear();
    }
    if (token) connect();
    return () => disconnect();
  }, [token, connect, disconnect]);

  useEffect(() => {
    if (!socket) return;

    const onForceLogout = (payload: { reason?: string | null; expiresAt?: string | null; permanent?: boolean } | null) => {
      const defaultMessage = payload?.permanent
        ? 'Your account has been permanently banned from Softspace.'
        : payload?.expiresAt
          ? `Your account has been banned until ${new Date(payload.expiresAt).toLocaleString()}.`
          : 'Your account has been banned from Softspace.';

      const reasonText = payload?.reason ? `\nReason: ${payload.reason}` : '';
      alert(`${defaultMessage}${reasonText}`);
      disconnect();
      logout();
      navigate('/auth');
    };

    socket.on('account:force_logout', onForceLogout);
    return () => {
      socket.off('account:force_logout', onForceLogout);
    };
  }, [socket, disconnect, logout, navigate]);

  useEffect(() => {
    if (!token || user) return;
    let cancelled = false;
    api('/api/auth/me', {}, token)
      .then(res => {
        if (!res.ok) throw new Error(`auth/me failed (${res.status})`);
        return res.json();
      })
      .then(data => {
        if (cancelled) return;
        if (data?.user) setAuth(data.user, token);
      })
      .catch(err => {
        console.error(err);
        if (!cancelled) logout();
      });
    return () => {
      cancelled = true;
    };
  }, [token, user, setAuth, logout]);

  useEffect(() => {
    if (!token) return;
    const refreshFriends = async () => {
      try {
        const res = await api('/api/friends', {}, token);
        if (res.ok) {
          const data = await res.json();
          if (data?.friendships) {
            useServerStore.getState().setCachedFriends(data.friendships);
          }
        }
      } catch (err) {
        console.error('Failed to fetch friends', err);
      }
    };
    
    refreshFriends();
      
    // Load DMs to ensure calling from profiles works
    const refreshDms = async () => {
      try {
        const res = await api('/api/dms', {}, token);
        if (res.ok) {
          const data = await res.json();
          if (data?.channels) {
            useServerStore.getState().setCachedDms(data.channels);
          }
        }
      } catch (err) {
        console.error('Failed to fetch DMs', err);
      }
    };
    
    refreshDms();

    // Fetch servers here as well to make sure global state is populated on fresh load
    const refreshServers = async () => {
      try {
        const res = await api('/api/servers', {}, token);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data?.servers)) {
            useServerStore.getState().setServers(data.servers);
          }
        }
      } catch (err) {
        console.error('Failed to fetch servers', err);
      }
    };
    refreshServers();

    if (socket) {
      socket.on('friend:incoming', refreshFriends);
      socket.on('friend:outgoing', refreshFriends);
      socket.on('friend:updated', refreshFriends);
      socket.on('friend:removed', refreshFriends);
      return () => {
        socket.off('friend:incoming', refreshFriends);
        socket.off('friend:outgoing', refreshFriends);
        socket.off('friend:updated', refreshFriends);
        socket.off('friend:removed', refreshFriends);
      };
    }
  }, [token, socket]);

  if (!token) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

import { GlobalCallManager } from './components/GlobalCallManager';
import { useLayoutStore } from './store/useLayoutStore';
import TitleBar from './components/TitleBar';
import { GlobalNotificationManager } from './components/GlobalNotificationManager';
import { GlobalPresenceManager } from './components/GlobalPresenceManager';



export default function App() {
  useEffect(() => {
    const preventDefault = (e: DragEvent) => {
      e.preventDefault();
    };
    window.addEventListener('dragover', preventDefault);
    window.addEventListener('drop', preventDefault);
    return () => {
      window.removeEventListener('dragover', preventDefault);
      window.removeEventListener('drop', preventDefault);
    };
  }, []);

  const content = (
    <Router>
      <Routes>
        <Route path="/" element={<RootPage />} />
        <Route path="/status" element={<StatusPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/qr-login" element={<QRConfirmPage />} />
        <Route path="/auth/discord/callback" element={<DiscordCallbackPage />} />
        <Route path="/invite/:code" element={<InvitePage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/guidelines" element={<GuidelinesPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/support" element={<SupportPage />} />
        <Route path="/support/ticket/:id" element={<SupportTicketPage />} />
        <Route path="/support/admin" element={<SupportAdminPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/blog" element={<BlogPage />} />
        <Route path="/blog/admin" element={<BlogAdminPage />} />

        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          {/* Home: friends layout with DM sidebar */}
          <Route element={<FriendsLayout />}>
            <Route index element={<FriendsContent />} />
            <Route path="dms/:dmId" element={<ChatArea isDm />} />
          </Route>

          <Route
            path="channels"
            element={<ChatArea />}
          />
          <Route path="explore" element={<ExplorePage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="changeemail" element={<EmailChangeAdminPage />} />
          <Route path="admin/dashboard/appsandgames" element={<AppsGamesAdminPage />} />
          <Route path="bage/admin" element={<BadgeAdminPage />} />
          <Route path="bages/admin" element={<BadgeAdminPage />} />
          <Route
            path="servers/:serverId/settings"
            element={<ServerSettingsPage />}
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );

  if (isElectron) {
    return (
      <div className="flex flex-col h-screen w-screen overflow-hidden">
        <TitleBar />
        <div className="flex-1 overflow-hidden relative">
          {content}
        </div>
      </div>
    );
  }

  return content;
}
