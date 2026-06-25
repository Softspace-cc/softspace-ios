import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatStore } from '../store/useChatStore';
import { useAuthStore } from '../store/useAuthStore';
import { useNavigate } from 'react-router-dom';
import { publicAssetUrl } from '../lib/api';
import type { DesktopNotificationTarget } from '../lib/desktopNotifications';
import {
  authorAvatarIcon,
  buildMessageNotificationBody,
  showDesktopNotification,
  shouldNotifyForMessage,
} from '../lib/desktopNotifications';

export function GlobalNotificationManager() {
  const { t } = useTranslation();
  const socket = useChatStore(state => state.socket);
  const user = useAuthStore(state => state.user);
  const activeChannelId = useChatStore(state => state.activeChannelId);
  const setActiveChannel = useChatStore(state => state.setActiveChannel);
  const setActiveCall = useChatStore(state => state.setActiveCall);
  const navigate = useNavigate();
  const messageSoundRef = useRef<HTMLAudioElement | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);

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

  const playMessageSound = () => {
    const ctx = getAudioContext();
    if (!ctx) return;

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.08);

    gainNode.gain.setValueAtTime(0.0001, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.2);
  };

  useEffect(() => {
    messageSoundRef.current = new Audio(publicAssetUrl('/sounds/message.mp3'));
    messageSoundRef.current.preload = 'auto';
    messageSoundRef.current.load();

    return () => {
      if (messageSoundRef.current) {
        messageSoundRef.current.pause();
        messageSoundRef.current = null;
      }
      audioContextRef.current?.close().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!window.electron?.onNotificationClick) return;

    const openNotificationTarget = (payload: DesktopNotificationTarget | null) => {
      if (!payload) return;

      if (payload.type === 'call') {
        setActiveCall({ channelId: payload.channelId, isDm: true, minimized: false });
        navigate(`/app/dms/${payload.channelId}`);
        return;
      }

      if (payload.type === 'dm' && payload.channelId) {
        setActiveChannel(null, payload.channelId);
        navigate(`/app/dms/${payload.channelId}`);
        return;
      }

      if (payload.type === 'channel' && payload.channelId) {
        setActiveChannel(payload.serverId ?? null, payload.channelId);
        navigate('/app/channels');
      }
    };

    const unsubscribe = window.electron.onNotificationClick(openNotificationTarget);
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [navigate, setActiveCall, setActiveChannel]);

  useEffect(() => {
    if (!socket || !user) return;

    const onMessageCreated = (msg: any) => {
      if (!msg) return;
      if (msg.messageType === 'CALL_STARTED' || msg.messageType === 'CALL_ENDED') return;
      if (msg.authorId === user.id) return;

      if (
        !shouldNotifyForMessage({
          channelId: msg.channelId,
          dmChannelId: msg.dmChannelId,
          activeChannelId,
        })
      ) {
        return;
      }

      if (messageSoundRef.current) {
        messageSoundRef.current.currentTime = 0;
        messageSoundRef.current.play().catch(() => {
          playMessageSound();
        });
      } else {
        playMessageSound();
      }

      const title = msg.author?.displayName || msg.author?.username || t('notification_unknown_user');
      const body = buildMessageNotificationBody(msg);
      const icon = authorAvatarIcon(msg.author?.avatarUrl);

      showDesktopNotification({
        title,
        body,
        icon,
        navigationTarget: msg.dmChannelId
          ? { type: 'dm', channelId: msg.dmChannelId }
          : {
              type: 'channel',
              channelId: msg.channelId,
              serverId: msg.channel?.serverId ?? null,
            },
      });
    };

    if (!window.electron && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission();
    }

    socket.on('message:created', onMessageCreated);
    socket.on('dm:message_created', onMessageCreated);

    return () => {
      socket.off('message:created', onMessageCreated);
      socket.off('dm:message_created', onMessageCreated);
    };
  }, [activeChannelId, socket, t, user]);

  return null;
}
