import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatStore } from '../store/useChatStore';
import { useServerStore } from '../store/useServerStore';
import { useAuthStore } from '../store/useAuthStore';
import { useNavigate } from 'react-router-dom';
import { Phone, PhoneOff, User as UserIcon } from 'lucide-react';
import { assetUrl, publicAssetUrl } from '../lib/api';
import { authorAvatarIcon, showDesktopNotification } from '../lib/desktopNotifications';

type Caller = {
  id: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
};

export function CallRingModal() {
  const { t } = useTranslation();
  const socket = useChatStore(state => state.socket);
  const setActiveCall = useChatStore(state => state.setActiveCall);
  const navigate = useNavigate();
  const [incomingCall, setIncomingCall] = useState<{ channelId: string; caller: Caller } | null>(null);
  const callRingSoundRef = useRef<HTMLAudioElement | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const ringIntervalRef = useRef<number | null>(null);

  const getAudioContext = () => {
    if (typeof window === 'undefined') return null;
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) return null;
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextCtor();
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {});
    }
    return audioContextRef.current;
  };

  const playRingBurst = () => {
    const ctx = getAudioContext();
    if (!ctx) return;

    const start = ctx.currentTime;
    [0, 0.35].forEach((offset) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(740, start + offset);
      oscillator.frequency.exponentialRampToValueAtTime(620, start + offset + 0.18);

      gainNode.gain.setValueAtTime(0.0001, start + offset);
      gainNode.gain.exponentialRampToValueAtTime(0.08, start + offset + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.24);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.start(start + offset);
      oscillator.stop(start + offset + 0.26);
    });
  };

  const stopRing = () => {
    if (ringIntervalRef.current !== null) {
      window.clearInterval(ringIntervalRef.current);
      ringIntervalRef.current = null;
    }

    if (callRingSoundRef.current) {
      callRingSoundRef.current.pause();
      callRingSoundRef.current.currentTime = 0;
    }
  };

  useEffect(() => {
    callRingSoundRef.current = new Audio(publicAssetUrl('/sounds/call_ring.mp3'));
    callRingSoundRef.current.preload = 'auto';
    callRingSoundRef.current.loop = true;
    callRingSoundRef.current.load();
    
    return () => {
      stopRing();
      callRingSoundRef.current = null;
      audioContextRef.current?.close().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (incomingCall) {
      stopRing();
      if (callRingSoundRef.current) {
        callRingSoundRef.current.play().catch(() => {
          playRingBurst();
          ringIntervalRef.current = window.setInterval(() => {
            playRingBurst();
          }, 1800);
        });
      }
    } else {
      stopRing();
    }
    
    return () => {
      stopRing();
    };
  }, [incomingCall]);

  useEffect(() => {
    if (!socket) return;
    
    const onIncomingRing = (data: { channelId: string; caller: Caller }) => {
      if (useChatStore.getState().activeCall) return;
      setIncomingCall(data);

      const displayName = data.caller.displayName || data.caller.username;
      showDesktopNotification({
        title: t('notification_incoming_call_title', { name: displayName }),
        body: t('notification_incoming_call_body'),
        icon: authorAvatarIcon(data.caller.avatarUrl),
        navigationTarget: { type: 'call', channelId: data.channelId },
      });
    };

    const onCancel = ({ channelId }: { channelId: string }) => {
      setIncomingCall(prev => prev?.channelId === channelId ? null : prev);
    };

    socket.on('voice:incoming_ring', onIncomingRing);
    socket.on('voice:cancel_ring', onCancel);
    return () => {
      socket.off('voice:incoming_ring', onIncomingRing);
      socket.off('voice:cancel_ring', onCancel);
    };
  }, [socket, t]);

  if (!incomingCall) return null;

  const { caller, channelId } = incomingCall;
  const displayName = caller.displayName || caller.username;

  return (
    <div className="fixed top-4 right-4 z-[9999] bg-softspace-900 border border-softspace-800 rounded-2xl p-4 shadow-2xl animate-bounce">
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 bg-softspace-800 rounded-full flex items-center justify-center overflow-hidden">
          {caller.avatarUrl ? (
            <img
              src={assetUrl(caller.avatarUrl)}
              alt={displayName}
              className="w-full h-full object-cover"
            />
          ) : (
            <UserIcon size={32} className="text-softspace-400" />
          )}
        </div>
        <div className="text-center">
          <div className="font-bold text-softspace-100">{displayName}</div>
          <div className="text-xs text-softspace-400">{t('notification_incoming_call_body')}</div>
        </div>
        <div className="flex gap-4">
          <button
            onClick={() => setIncomingCall(null)}
            className="w-12 h-12 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center text-white transition-colors"
          >
            <PhoneOff size={24} />
          </button>
          <button
            onClick={() => {
              setIncomingCall(null);
              setActiveCall({ channelId, isDm: true, minimized: false });
              
              const cachedDms = useServerStore.getState().cachedDms;
              const dm = cachedDms ? cachedDms.find((c: any) => c.id === channelId) : null;
              const otherUser = dm?.members?.find((m: any) => m.userId !== useAuthStore.getState().user?.id)?.user;
              if (dm && !dm.isGroup && otherUser?.username) {
                navigate(`/app/dms/@${otherUser.username}`);
              } else {
                navigate(`/app/dms/${channelId}`);
              }
            }}
            className="w-12 h-12 rounded-full bg-green-500 hover:bg-green-400 flex items-center justify-center text-white transition-colors animate-pulse"
          >
            <Phone size={24} />
          </button>
        </div>
      </div>
    </div>
  );
}
