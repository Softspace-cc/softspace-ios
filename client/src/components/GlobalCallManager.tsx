import { useEffect, useRef, useState, useMemo } from 'react';
import { useChatStore } from '../store/useChatStore';
import VoiceChat from './VoiceChat';
import { Maximize2, PhoneOff, GripHorizontal } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { useServerStore } from '../store/useServerStore';
import { useLocation, useNavigate } from 'react-router-dom';

export function GlobalCallManager() {
  const activeCall = useChatStore(state => state.activeCall);
  const setActiveCall = useChatStore(state => state.setActiveCall);
  const activeChannelId = useChatStore(state => state.activeChannelId);
  const socket = useChatStore(state => state.socket);
  const me = useAuthStore(state => state.user);
  const location = useLocation();
  const navigate = useNavigate();
  
  const cachedMembers = useServerStore(state => state.cachedMembers);
  const cachedDms = useServerStore(state => state.cachedDms);
  
  const matchDm = location.pathname.match(/^\/app\/dms\/(.+)$/);
  const dmIdFromUrl = matchDm ? decodeURIComponent(matchDm[1]) : null;

  const currentDmId = useMemo(() => {
    if (!dmIdFromUrl) return null;
    if (dmIdFromUrl.startsWith('@')) {
      const username = dmIdFromUrl.slice(1).toLowerCase();
      if (!cachedDms) return dmIdFromUrl;
      const dm = cachedDms.find((c: any) => 
        !c.isGroup && c.members.some((m: any) => m.user?.username?.toLowerCase() === username)
      );
      return dm?.id || dmIdFromUrl;
    }
    
    // For group DMs, dmIdFromUrl might be the name or the ID
    if (cachedDms) {
      const dm = cachedDms.find((c: any) => c.id === dmIdFromUrl || c.name === dmIdFromUrl);
      if (dm) return dm.id;
    }
    
    return dmIdFromUrl;
  }, [dmIdFromUrl, cachedDms]);

  const currentActiveChannelId = currentDmId || activeChannelId;

  const [position, setPosition] = useState({ x: window.innerWidth - 320, y: window.innerHeight - 240 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number, startY: number, initialX: number, initialY: number } | null>(null);

  const persistentRef = useRef<HTMLDivElement>(null);
  const floatingContainerRef = useRef<HTMLDivElement>(null);

  // Is the user looking at the active call's channel?
  const isViewingCallChannel = currentActiveChannelId === activeCall?.channelId;
  const shouldFloat = activeCall && (!isViewingCallChannel || activeCall.minimized);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      
      let newX = dragRef.current.initialX + dx;
      let newXMax = window.innerWidth - 300;
      if (newX < 0) newX = 0;
      if (newX > newXMax) newX = newXMax;

      let newY = dragRef.current.initialY + dy;
      let newYMax = window.innerHeight - 200;
      if (newY < 0) newY = 0;
      if (newY > newYMax) newY = newYMax;

      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragRef.current = null;
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Manually move the persistent WebRTC container
  useEffect(() => {
    if (!activeCall || !persistentRef.current) return;
    
    const moveContainer = () => {
      if (!persistentRef.current) return;
      if (shouldFloat) {
        if (floatingContainerRef.current && persistentRef.current.parentElement !== floatingContainerRef.current) {
          floatingContainerRef.current.appendChild(persistentRef.current);
        }
      } else {
        const portal = document.getElementById('voice-chat-portal');
        if (portal && persistentRef.current.parentElement !== portal) {
          portal.appendChild(persistentRef.current);
        }
      }
    };

    moveContainer();

    // In case the portal takes a moment to render
    const interval = setInterval(moveContainer, 100);
    return () => clearInterval(interval);
  }, [shouldFloat, activeCall, isViewingCallChannel]);

  if (!activeCall) return null;

  const handleLeaveCall = () => {
    if (activeCall?.isDm && socket) {
      socket.emit('voice:cancel_ring', { channelId: activeCall.channelId });
    }
    setActiveCall(null);
    if (isViewingCallChannel && !activeCall?.isDm) {
      // Find a text channel to navigate to, or just go to /app
      const serverId = useChatStore.getState().activeServerId;
      if (serverId) {
        const serverInfo = useServerStore.getState().cachedServerInfos[serverId];
        const firstText = serverInfo?.channels?.find((c: any) => c.type === 'TEXT');
        if (firstText) {
          useChatStore.getState().setActiveChannel(serverId, firstText.id);
        } else {
          window.location.href = '/app';
        }
      }
    }
  };

  let isServerMuted = false;
  let isServerDeafened = false;
  
  if (!activeCall.isDm) {
    for (const members of Object.values(cachedMembers)) {
      const meMember = members.find(m => m.userId === me?.id);
      if (meMember) {
        isServerMuted = !!meMember.isMuted;
        isServerDeafened = !!meMember.isDeafened;
        break;
      }
    }
  }

  return (
    <>
      {/* The actual VoiceChat instance is always rendered here, so it never unmounts */}
      <div style={{ display: shouldFloat ? 'none' : 'contents' }} id="hidden-voice-chat-container">
        <div ref={persistentRef} className="absolute inset-0 w-full h-full flex flex-col min-h-0 bg-softspace-950 z-10 overflow-hidden isolate">
          <VoiceChat
            socket={socket}
            channelId={activeCall.channelId}
            isServerMuted={isServerMuted}
            isServerDeafened={isServerDeafened}
            onLeave={handleLeaveCall}
            isFloating={!!shouldFloat}
          />
        </div>
      </div>

      {/* The floating window UI */}
      <div 
        className="fixed z-[9000] w-[320px] h-[240px] bg-softspace-900 border border-softspace-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ 
          left: position.x, 
          top: position.y,
          display: shouldFloat ? 'flex' : 'none'
        }}
      >
        <div 
          className="h-8 bg-softspace-950 flex items-center px-3 cursor-grab active:cursor-grabbing select-none shrink-0 border-b border-softspace-800"
          onMouseDown={(e) => {
            setIsDragging(true);
            dragRef.current = {
              startX: e.clientX,
              startY: e.clientY,
              initialX: position.x,
              initialY: position.y
            };
          }}
        >
          <GripHorizontal size={14} className="text-softspace-500 mx-auto" />
          <div className="absolute right-2 flex items-center gap-2">
            <button 
              onClick={() => {
                if (isViewingCallChannel) {
                  setActiveCall({ ...activeCall, minimized: false });
                } else {
                  // Navigate to the call channel
                  if (activeCall.isDm) {
                    navigate(`/app/dms/${activeCall.channelId}`);
                  } else {
                    // For server voice channels, we need to find the server ID
                    let foundServerId = null;
                    const { cachedServerInfos } = useServerStore.getState();
                    for (const [serverId, serverInfo] of Object.entries(cachedServerInfos)) {
                      if (serverInfo?.channels?.some(c => c.id === activeCall.channelId)) {
                        foundServerId = serverId;
                        break;
                      }
                    }
                    if (foundServerId) {
                      useChatStore.getState().setActiveChannel(foundServerId, activeCall.channelId);
                      navigate(`/app/servers/${foundServerId}`);
                    }
                  }
                  setActiveCall({ ...activeCall, minimized: false });
                }
              }}
              className={`text-softspace-400 hover:text-softspace-100 transition-colors`}
              title={isViewingCallChannel ? "Return to channel view" : "Navigate to channel to expand"}
            >
              <Maximize2 size={14} />
            </button>
            <button 
              onClick={handleLeaveCall}
              className="text-red-400 hover:text-red-300 transition-colors"
            >
              <PhoneOff size={14} />
            </button>
          </div>
        </div>
        <div className="flex-1 flex flex-col relative overflow-hidden" ref={floatingContainerRef}>
          {/* persistentRef will be appended here when shouldFloat is true */}
        </div>
      </div>
    </>
  );
}