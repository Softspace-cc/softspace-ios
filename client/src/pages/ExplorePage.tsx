import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Hash, Menu, Search } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { useChatStore } from '../store/useChatStore';
import { useServerStore } from '../store/useServerStore';
import { useLayoutStore } from '../store/useLayoutStore';
import { api, assetUrl } from '../lib/api';

type ChannelSummary = {
  id: string;
  name: string;
  type: string;
};

type ServerSummary = {
  id: string;
  name: string;
  iconUrl?: string | null;
  bannerUrl?: string | null;
  description?: string | null;
  channels?: ChannelSummary[];
  memberCount?: number;
};

export default function ExplorePage() {
  const token = useAuthStore(state => state.token);
  const setActiveChannel = useChatStore(state => state.setActiveChannel);
  const navigate = useNavigate();
  const [servers, setServers] = useState<ServerSummary[]>([]);
  const setMobileSidebarOpen = useLayoutStore(state => state.setMobileSidebarOpen);

  const [joining, setJoining] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (!token) return;
    api(`/api/servers/discover?q=${encodeURIComponent(debouncedQuery)}`, {}, token)
      .then(res => res.json())
      .then(data => setServers(Array.isArray(data?.servers) ? data.servers : []))
      .catch(console.error);
  }, [token, debouncedQuery]);

  const handleJoin = async (serverId: string, channelId: string | null) => {
    if (!token || joining) return;
    setJoining(serverId);
    try {
      const res = await api(`/api/servers/${serverId}/join`, { method: 'POST' }, token);
      if (res.ok) {
        const data = await res.json();
        if (data.server) {
          useServerStore.getState().addServer(data.server);
        }
        setActiveChannel(serverId, channelId);
        navigate('/app/channels');
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.message || 'Failed to join server');
      }
    } catch (e) {
      console.error(e);
      alert('Failed to join server');
    } finally {
      setJoining(null);
    }
  };

  return (
    <div className="flex-1 bg-softspace-950 flex flex-col min-w-0">
      <div className="h-14 border-b border-softspace-800 flex items-center px-4 md:px-6 gap-3 shrink-0">
        <div className="md:hidden flex items-center mr-2">
          <button onClick={() => setMobileSidebarOpen(true)} className="p-1.5 text-softspace-400 hover:text-softspace-100 rounded-lg">
            <Menu size={20} />
          </button>
        </div>
        <h2 className="font-semibold text-softspace-100">Explore</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-3xl font-bold text-softspace-100 mb-2">Explore</h1>
          <p className="text-softspace-400 mb-6">Discover servers and jump right into a chat.</p>

          <div className="mb-8 relative max-w-md">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search public servers..."
              className="w-full bg-softspace-900 border border-softspace-800 focus:border-softspace-700 rounded-xl py-2.5 pl-10 pr-4 text-sm text-softspace-100 placeholder-softspace-500 focus:outline-none transition-all shadow-inner"
            />
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-softspace-500">
              <Search size={16} />
            </div>
          </div>

          {servers.length === 0 ? (
            <div className="text-softspace-500 bg-softspace-900/30 border border-dashed border-softspace-800 rounded-2xl py-12 text-center">
              No servers found matching your criteria.
            </div>
          ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {servers.map(server => {
              const firstTextChannel = server.channels?.find(c => c.type === 'TEXT');
              const channelId = firstTextChannel?.id ?? server.channels?.[0]?.id ?? null;

              return (
                <button
                  key={server.id}
                  type="button"
                  disabled={joining === server.id}
                  onClick={() => handleJoin(server.id, channelId)}
                  className={`text-left bg-softspace-900 border border-softspace-800 rounded-2xl overflow-hidden hover:bg-softspace-800 transition-colors group relative ${joining === server.id ? 'opacity-50' : ''}`}
                >
                  <div className="h-24 bg-softspace-800 w-full relative">
                    {server.bannerUrl ? (
                      <img 
                        src={assetUrl(server.bannerUrl)} 
                        alt="Banner" 
                        className="w-full h-full object-cover pointer-events-none select-none" 
                        draggable="false"
                        onContextMenu={(e) => e.preventDefault()}
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-r from-softspace-800 to-softspace-700" />
                    )}
                  </div>
                  <div className="p-4 pt-8 relative">
                    <div className="absolute -top-6 left-4 w-12 h-12 bg-softspace-800 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden border-2 border-softspace-900 group-hover:border-softspace-800 transition-colors pointer-events-none select-none">
                      {server.iconUrl ? (
                        <img 
                          src={assetUrl(server.iconUrl)} 
                          alt={server.name} 
                          className="w-full h-full object-cover pointer-events-none select-none" 
                          draggable="false"
                          onContextMenu={(e) => e.preventDefault()}
                        />
                      ) : (
                        <span className="font-bold text-softspace-200 pointer-events-none select-none">{server.name.charAt(0).toUpperCase()}</span>
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="font-semibold text-softspace-100 truncate">{server.name}</div>
                      {server.description ? (
                        <div className="text-softspace-400 text-sm mt-1 line-clamp-2">{server.description}</div>
                      ) : (
                        <div className="text-softspace-500 text-sm mt-1">No description</div>
                      )}

                      <div className="mt-4 flex items-center justify-between text-softspace-300 text-xs">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Hash size={14} className="text-softspace-400 shrink-0" />
                          <span className="truncate max-w-[120px]">
                            {firstTextChannel?.name ?? server.channels?.[0]?.name ?? 'general'}
                          </span>
                        </div>
                        {server.memberCount !== undefined && (
                          <div className="flex items-center gap-1 text-softspace-400 shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                            <span>
                              {server.memberCount} {server.memberCount === 1 ? 'member' : 'members'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
