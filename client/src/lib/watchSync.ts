import { registerPlugin } from '@capacitor/core';
import { isCapacitorApp } from './platform';

interface WatchConnectorPlugin {
  sendToWatch(options: { data: { type: 'message' | 'presence'; payload: any } }): Promise<void>;
}

let WatchConnector: WatchConnectorPlugin | null = null;

if (isCapacitorApp()) {
  try {
    WatchConnector = registerPlugin<WatchConnectorPlugin>('WatchConnector');
  } catch (e) {
    console.warn('WatchConnector plugin not registered/available on this platform:', e);
  }
}

/**
 * Sync the user's online status (presence) to the Apple Watch.
 */
export async function syncPresenceToWatch(status: 'online' | 'idle' | 'dnd' | 'offline'): Promise<void> {
  if (!WatchConnector) return;
  try {
    await WatchConnector.sendToWatch({
      data: {
        type: 'presence',
        payload: { status }
      }
    });
  } catch (err) {
    console.warn('Failed to sync presence to Apple Watch:', err);
  }
}

/**
 * Sync a new incoming message notification to the Apple Watch.
 */
export async function syncMessageToWatch(sender: string, content: string): Promise<void> {
  if (!WatchConnector) return;
  try {
    await WatchConnector.sendToWatch({
      data: {
        type: 'message',
        payload: {
          sender,
          content,
          timestamp: new Date().toISOString()
        }
      }
    });
  } catch (err) {
    console.warn('Failed to sync message to Apple Watch:', err);
  }
}
