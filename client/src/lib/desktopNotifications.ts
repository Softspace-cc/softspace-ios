import i18n from '../i18n';
import { assetUrl } from './api';
import { isCapacitorApp } from './platform';

export type DesktopNotificationTarget =
  | { type: 'dm'; channelId: string }
  | { type: 'channel'; channelId: string; serverId: string | null }
  | { type: 'call'; channelId: string };

export type DesktopNotificationOptions = {
  title: string;
  body: string;
  icon?: string | null;
  navigationTarget?: DesktopNotificationTarget;
};

export function showDesktopNotification(options: DesktopNotificationOptions): void {
  if (typeof window === 'undefined') return;

  const { title, body, icon, navigationTarget } = options;

  if (isCapacitorApp()) {
    // Sync notification to Apple Watch companion app
    import('./watchSync').then(({ syncMessageToWatch }) => {
      void syncMessageToWatch(title, body);
    }).catch(err => console.error('Failed to sync to Apple Watch:', err));

    import('@capacitor/local-notifications').then(({ LocalNotifications }) => {
      LocalNotifications.schedule({
        notifications: [
          {
            title,
            body,
            id: Math.floor(Math.random() * 100000),
            schedule: { at: new Date(Date.now() + 50) },
            sound: 'message.mp3', // For iOS (copied to bundle)
            channelId: 'messages', // For Android (configured channel)
            extra: navigationTarget,
          }
        ]
      }).catch(err => console.error('Failed to schedule local notification', err));
    }).catch(err => console.error('Failed to load LocalNotifications plugin', err));
    return;
  }

  // Prefer the native Electron notification bridge when available
  if (window.electron?.showNotification) {
    window.electron.showNotification({
      title,
      body,
      icon: icon ?? undefined,
      navigationTarget,
    });
    return;
  }

  if (typeof Notification === 'undefined') return;

  if (Notification.permission === 'default') {
    void Notification.requestPermission();
    return;
  }

  if (Notification.permission !== 'granted') return;

  new Notification(title, {
    body,
    icon: icon ?? undefined,
  });
}

export function buildMessageNotificationBody(msg: {
  content?: string | null;
  attachments?: unknown[] | null;
}): string {
  const text = typeof msg.content === 'string' ? msg.content.trim() : '';
  if (text) return text.length > 140 ? `${text.slice(0, 137)}…` : text;
  if (Array.isArray(msg.attachments) && msg.attachments.length > 0) {
    return i18n.t('notification_attachment_sent');
  }
  return i18n.t('notification_new_message');
}

export function shouldNotifyForMessage(params: {
  channelId?: string | null;
  dmChannelId?: string | null;
  activeChannelId: string | null;
}): boolean {
  const messageChannelId = params.dmChannelId ?? params.channelId ?? null;
  const isCurrentlyViewing =
    messageChannelId != null && messageChannelId === params.activeChannelId;
  const appIsInBackground = document.hidden || !document.hasFocus();
  return !isCurrentlyViewing || appIsInBackground;
}

export function authorAvatarIcon(avatarUrl?: string | null): string | null {
  return avatarUrl ? assetUrl(avatarUrl) : null;
}
