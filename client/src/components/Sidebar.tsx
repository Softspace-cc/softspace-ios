import { Link, useNavigate } from 'react-router-dom';
import { Home, Plus, Compass } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuthStore } from '../store/useAuthStore';
import { useServerStore } from '../store/useServerStore';
import { useChatStore } from '../store/useChatStore';
import { useLayoutStore } from '../store/useLayoutStore';
import { api, assetUrl } from '../lib/api';

export default function Sidebar() {
  const { t } = useTranslation();
  const token = useAuthStore(state => state.token);
  const { servers, setServers } = useServerStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newServerName, setNewServerName] = useState('');
  const setMobileSidebarOpen = useLayoutStore(state => state.setMobileSidebarOpen);

  const socket = useChatStore(state => state.socket);
  const setActiveChannel = useChatStore(state => state.setActiveChannel);
  const navigate = useNavigate();
  const [serverMenu, setServerMenu] = useState<{ x: number; y: number; server: { id: string; name: string } } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);

  const clampMenuPosition = (x: number, y: number) => {
    const menuWidth = 220;
    const menuHeight = 120;
    return {
      x: x + menuWidth > window.innerWidth ? Math.max(8, window.innerWidth - menuWidth - 8) : x,
      y: y + menuHeight > window.innerHeight ? Math.max(8, window.innerHeight - menuHeight - 8) : y,
    };
  };

  const openServerMenu = (server: { id: string; name: string }, x: number, y: number) => {
    const pos = clampMenuPosition(x, y);
    setServerMenu({ x: pos.x, y: pos.y, server });
  };

  const clearLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleLeaveServer = async (serverId: string) => {
    if (!token) return;
    try {
      const res = await api(`/api/servers/${serverId}/leave`, { method: 'POST' }, token);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.message || 'Server konnte nicht verlassen werden.');
        return;
      }

      const nextServers = useServerStore.getState().servers.filter(s => s.id !== serverId);
      useServerStore.getState().setServers(nextServers);
      if (useChatStore.getState().activeServerId === serverId) {
        setActiveChannel(null, null);
        navigate('/app');
      }
      setServerMenu(null);
    } catch (err) {
      console.error(err);
      alert('Server konnte nicht verlassen werden.');
    }
  };

  useEffect(() => {
    if (!token) return;
    
    const fetchServers = async () => {
      try {
        const res = await api('/api/servers', {}, token);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data?.servers)) {
            setServers(data.servers);
          }
        }
      } catch (err) {
        console.error(err);
      }
    };
    
    fetchServers();
  }, [token, setServers]);

  useEffect(() => {
    if (!socket) return;
    const onCreated = (server: { id: string; name: string }) => {
      useServerStore.getState().addServer(server as never);
    };
    const onDeleted = ({ serverId }: { serverId: string }) => {
      useServerStore.getState().removeServer(serverId);
    };
    const onRemoved = ({ serverId, action }: { serverId: string; action?: 'kick' | 'ban' }) => {
      useServerStore.getState().removeServer(serverId);
      if (useChatStore.getState().activeServerId === serverId) {
        setActiveChannel(null, null);
        navigate('/app');
      }
      alert(action === 'ban' ? 'Du wurdest von diesem Server gebannt.' : 'Du wurdest von diesem Server entfernt.');
    };
    socket.on('server:created', onCreated);
    socket.on('server:deleted', onDeleted);
    socket.on('server:removed', onRemoved);
    return () => {
      socket.off('server:created', onCreated);
      socket.off('server:deleted', onDeleted);
      socket.off('server:removed', onRemoved);
    };
  }, [socket, navigate, setActiveChannel]);

  const handleCreateServer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newServerName.trim()) return;

    try {
      const res = await api(
        '/api/servers',
        {
          method: 'POST',
          body: JSON.stringify({ name: newServerName }),
        },
        token
      );
      if (res.ok) {
        let payload: any = {};
        try {
          const text = await res.text();
          if (text) payload = JSON.parse(text);
        } catch(e) {}
        const newServer = payload?.server ?? payload;
        useServerStore.getState().addServer(newServer);
        setShowCreateModal(false);
        setNewServerName('');
      } else {
        let err: any = {};
        try {
          const text = await res.text();
          if (text) err = JSON.parse(text);
        } catch(e) {}
        alert(err.message || t('error_creating_server'));
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <>
      <div className="w-20 bg-softspace-950 flex flex-col items-center py-4 space-y-4 flex-shrink-0 z-10 relative h-full overflow-y-auto [&::-webkit-scrollbar]:!hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <Link
          to="/app"
          onClick={() => setMobileSidebarOpen(false)}
          className="w-12 h-12 bg-softspace-800 rounded-2xl flex items-center justify-center hover:bg-softspace-700 hover:rounded-xl transition-all duration-200 group relative"
        >
          <Home className="text-softspace-200" size={24} />
          <div className="absolute left-16 bg-softspace-950 text-softspace-100 px-3 py-1.5 rounded-lg text-sm font-medium opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
            {t('friends')}
          </div>
        </Link>
        
        <div className="w-8 h-[2px] bg-softspace-800 rounded-full" />
        
        {/* Real Server List */}
        {servers.map(server => {
          const firstTextChannel = server.channels?.find(c => c.type === 'TEXT');
          const channelId = firstTextChannel?.id ?? server.channels?.[0]?.id ?? null;

          return (
            <button
              key={server.id}
              type="button"
              onClick={() => {
                if (longPressTriggeredRef.current) {
                  longPressTriggeredRef.current = false;
                  return;
                }
                setActiveChannel(server.id, channelId);
                setMobileSidebarOpen(false);
                navigate('/app/channels');
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openServerMenu(server, e.clientX, e.clientY);
              }}
              onTouchStart={(e) => {
                const touch = e.touches[0];
                if (!touch) return;
                clearLongPress();
                longPressTriggeredRef.current = false;
                longPressTimerRef.current = setTimeout(() => {
                  longPressTriggeredRef.current = true;
                  openServerMenu(server, touch.clientX, touch.clientY);
                }, 550);
              }}
              onTouchEnd={() => clearLongPress()}
              onTouchMove={() => clearLongPress()}
              onTouchCancel={() => clearLongPress()}
              className="w-12 h-12 bg-softspace-800 rounded-2xl flex items-center justify-center hover:bg-softspace-700 hover:rounded-xl transition-all duration-200 cursor-pointer group relative"
            >
              {server.iconUrl ? (
                <img
                  src={assetUrl(server.iconUrl)}
                  alt={server.name}
                  className="w-full h-full rounded-2xl group-hover:rounded-xl transition-all duration-200 object-cover"
                />
              ) : (
                <span className="font-bold text-softspace-200">{server.name.charAt(0).toUpperCase()}</span>
              )}

              {/* Tooltip */}
              <div className="absolute left-16 bg-softspace-950 text-softspace-100 px-3 py-1.5 rounded-lg text-sm font-medium opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
                {server.name}
              </div>
            </button>
          );
        })}
        
        <button 
          onClick={() => setShowCreateModal(true)}
          className="w-12 h-12 bg-softspace-800 rounded-2xl flex items-center justify-center hover:bg-green-600 hover:text-white text-green-500 hover:rounded-xl transition-all duration-200 group relative"
        >
          <Plus size={24} />
          <div className="absolute left-16 bg-softspace-950 text-softspace-100 px-3 py-1.5 rounded-lg text-sm font-medium opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
            {t('create_server')}
          </div>
        </button>

        <Link
          to="/app/explore"
          onClick={() => setMobileSidebarOpen(false)}
          className="w-12 h-12 bg-softspace-800 rounded-2xl flex items-center justify-center hover:bg-softspace-700 hover:rounded-xl transition-all duration-200 group relative shrink-0"
        >
          <Compass className="text-softspace-200" size={24} />
          <div className="absolute left-16 bg-softspace-950 text-softspace-100 px-3 py-1.5 rounded-lg text-sm font-medium opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
            {t('explore')}
          </div>
        </Link>
        
        <div className="flex-1" />
      </div>

      {serverMenu && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setServerMenu(null)} />
          <div
            className="fixed z-[9999] bg-softspace-900 border border-softspace-800 shadow-2xl rounded-xl py-2 w-56 text-sm"
            style={{ top: serverMenu.y, left: serverMenu.x }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div className="px-4 py-1 text-xs font-bold text-softspace-400 mb-1 border-b border-softspace-800 truncate">
              {serverMenu.server.name}
            </div>
            <button
              type="button"
              onClick={() => handleLeaveServer(serverMenu.server.id)}
              className="w-full px-4 py-2 text-left hover:bg-red-500/20 text-red-400 transition-colors"
            >
              Server verlassen
            </button>
          </div>
        </>
      )}

      {/* Create Server Modal */}
      {showCreateModal && createPortal(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-softspace-900 border border-softspace-800 p-6 rounded-3xl w-full max-w-sm shadow-2xl">
            <h2 className="text-2xl font-bold text-softspace-100 mb-2">{t('create_server')}</h2>
            <p className="text-softspace-400 text-sm mb-6">{t('create_server_subtitle')}</p>
            <form onSubmit={handleCreateServer} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-softspace-300 mb-2">
                  {t('server_name')}
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newServerName}
                  onChange={(e) => setNewServerName(e.target.value)}
                  placeholder={t('server_name_placeholder')}
                  className="w-full bg-softspace-950 border border-softspace-800 rounded-xl px-4 py-3 text-softspace-100 focus:outline-none focus:border-softspace-500 transition-colors"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-5 py-2.5 rounded-xl text-softspace-300 hover:text-softspace-100 transition-colors cursor-pointer"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-softspace-500 hover:bg-softspace-400 text-white font-medium rounded-xl transition-colors cursor-pointer"
                >
                  {t('create_server')}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
