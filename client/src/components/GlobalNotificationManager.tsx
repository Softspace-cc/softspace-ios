import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatStore } from '../store/useChatStore';
import { useAuthStore } from '../store/useAuthStore';
import { useNavigate } from 'react-router-dom';
import { apiJson, publicAssetUrl } from '../lib/api';
import { isCapacitorApp } from '../lib/platform';
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
  const token = useAuthStore(state => state.token);
  const activeChannelId = useChatStore(state => state.activeChannelId);
  const setActiveChannel = useChatStore(state => state.setActiveChannel);
  const setActiveCall = useChatStore(state => state.setActiveCall);
  const navigate = useNavigate();
  const messageSoundRef = useRef<HTMLAudioElement | null>(null);
  const processedMessageIdsRef = useRef<Set<string>>(new Set());

  // Initialize Capacitor local notifications permissions, channels, click actions and App state change listeners
  useEffect(() => {
    if (!isCapacitorApp()) return;

    let listenerHandle: any = null;
    let appStateHandle: any = null;

    import('@capacitor/local-notifications').then(({ LocalNotifications }) => {
      LocalNotifications.requestPermissions().then((permission) => {
        if (permission.display === 'granted') {
          LocalNotifications.createChannel({
            id: 'messages',
            name: 'Chat Messages',
            description: 'Notification channel for chat messages',
            sound: 'message.mp3', // android/app/src/main/res/raw/message.mp3
            importance: 5,
            visibility: 1,
            vibration: true,
          }).catch(err => console.error('Failed to create channel', err));
        }
      });

      LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
        const payload = action.notification.extra;
        if (!payload) return;

        if (payload.type === 'call') {
          setActiveCall({ channelId: payload.channelId, isDm: true, minimized: false });
          navigate(`/app/dms/${payload.channelId}`);
        } else if (payload.type === 'dm' && payload.channelId) {
          setActiveChannel(null, payload.channelId);
          navigate(`/app/dms/${payload.channelId}`);
        } else if (payload.type === 'channel' && payload.channelId) {
          setActiveChannel(payload.serverId ?? null, payload.channelId);
          navigate('/app/channels');
        }
      }).then(handle => {
        listenerHandle = handle;
      });
    }).catch(err => console.error('Failed to initialize local notifications', err));

    import('@capacitor/app').then(({ App }) => {
      App.addListener('appStateChange', ({ isActive }) => {
        console.log('App state changed, isActive:', isActive);
        if (isActive) {
          // Re-establish socket connection when app becomes active again
          const currentSocket = useChatStore.getState().socket;
          if (currentSocket && !currentSocket.connected) {
            console.log('Reconnecting socket on app activation...');
            currentSocket.connect();
          }
        }
      }).then(handle => {
        appStateHandle = handle;
      });
    }).catch(err => console.error('Failed to import @capacitor/app', err));

    return () => {
      if (listenerHandle) {
        listenerHandle.remove();
      }
      if (appStateHandle) {
        appStateHandle.remove();
      }
    };
  }, [navigate, setActiveCall, setActiveChannel]);

  // Register for Capacitor push notifications when user is logged in
  useEffect(() => {
    if (!isCapacitorApp() || !user || !token) return;

    let registrationListener: any = null;
    let errorListener: any = null;
    let pushNotificationReceivedListener: any = null;
    let pushNotificationActionPerformedListener: any = null;

    import('@capacitor/push-notifications').then(({ PushNotifications }) => {
      // Request permission
      PushNotifications.requestPermissions().then((result) => {
        if (result.receive === 'granted') {
          // Register with Apple / Google to receive token
          PushNotifications.register();
        } else {
          console.warn('[Push] Push notifications permission denied');
        }
      });

      // Listen for registration success
      PushNotifications.addListener('registration', (pushToken) => {
        console.log('[Push] Token registered successfully:', pushToken.value);
        const platform = window.navigator.userAgent.toLowerCase().includes('android') ? 'android' : 'ios';
        
        apiJson('/api/users/me/push-tokens', {
          method: 'POST',
          body: {
            token: pushToken.value,
            platform,
          },
        }, token).then(() => {
          console.log('[Push] Registered token on server.');
        }).catch(err => {
          console.error('[Push] Failed to register token on server:', err);
        });
      }).then(handle => {
        registrationListener = handle;
      });

      // Listen for registration error
      PushNotifications.addListener('registrationError', (error) => {
        console.error('[Push] Error on registration:', error);
      }).then(handle => {
        errorListener = handle;
      });

      // Listen for incoming notifications when app is active/foreground
      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('[Push] Notification received in foreground:', notification);
      }).then(handle => {
        pushNotificationReceivedListener = handle;
      });

      // Listen for notification action (when user clicks the push notification banner)
      PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        console.log('[Push] Action performed on push notification:', action);
        const data = action.notification.data;
        if (!data) return;

        if (data.type === 'dm' && data.channelId) {
          setActiveChannel(null, data.channelId);
          navigate(`/app/dms/${data.channelId}`);
        } else if (data.type === 'channel' && data.channelId) {
          setActiveChannel(data.serverId ?? null, data.channelId);
          navigate('/app/channels');
        }
      }).then(handle => {
        pushNotificationActionPerformedListener = handle;
      });
    }).catch(err => console.error('Failed to initialize push notifications', err));

    return () => {
      if (registrationListener) registrationListener.remove();
      if (errorListener) errorListener.remove();
      if (pushNotificationReceivedListener) pushNotificationReceivedListener.remove();
      if (pushNotificationActionPerformedListener) pushNotificationActionPerformedListener.remove();
    };
  }, [user, token, navigate, setActiveChannel]);

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

      // Deduplicate message notifications by message ID
      if (msg.id) {
        if (processedMessageIdsRef.current.has(msg.id)) {
          console.log('Skipping duplicate notification for message:', msg.id);
          return;
        }
        processedMessageIdsRef.current.add(msg.id);
        if (processedMessageIdsRef.current.size > 100) {
          const firstValue = processedMessageIdsRef.current.values().next().value;
          if (firstValue !== undefined) {
            processedMessageIdsRef.current.delete(firstValue);
          }
        }
      }

      if (
        !shouldNotifyForMessage({
          channelId: msg.channelId,
          dmChannelId: msg.dmChannelId,
          activeChannelId,
        })
      ) {
        return;
      }

      // Only play HTML audio if NOT on Capacitor.
      // Capacitor local notifications handle their own sounds.
      if (!isCapacitorApp()) {
        if (messageSoundRef.current) {
          messageSoundRef.current.currentTime = 0;
          messageSoundRef.current.play().catch(() => {
            playMessageSound();
          });
        } else {
          playMessageSound();
        }
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
