import i18n from '../i18n';
import type { ActivityRichPresence } from './presenceApps';
import type { RichPresenceData, SpotifyRichPresence } from '../components/RichPresenceDisplay';

function isSpotifyPresence(data: RichPresenceData): data is SpotifyRichPresence {
  if ('kind' in data) {
    return data.kind === 'spotify';
  }
  return 'title' in data && 'artist' in data && 'positionMs' in data;
}

export function getPresenceVerb(kind: 'app' | 'game' | 'spotify'): string {
  if (kind === 'spotify') return i18n.t('presence_listening');
  if (kind === 'game') return i18n.t('presence_playing');
  return i18n.t('presence_using');
}

export function formatPresenceLine(data: RichPresenceData): string {
  if (isSpotifyPresence(data)) {
    const line = i18n.t('presence_spotify_line', {
      title: data.title,
      artist: data.artist,
    });
    if (data.playbackStatus === 'paused') {
      return i18n.t('presence_spotify_paused_suffix', {
        line,
        paused: i18n.t('presence_paused'),
      });
    }
    return line;
  }

  const activity = data as ActivityRichPresence;
  const verb = getPresenceVerb(activity.kind);
  if (activity.detail) {
    return i18n.t('presence_line_with_detail', {
      verb,
      app: activity.app,
      detail: activity.detail,
    });
  }
  return i18n.t('presence_line', { verb, app: activity.app });
}

export function formatRecentActivityLabel(endedAt: number): string {
  const diffMs = Math.max(0, Date.now() - endedAt);
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);

  if (minutes < 1) return i18n.t('presence_recent_just_now');
  if (minutes < 60) return i18n.t('presence_recent_minutes_ago', { minutes });
  if (hours < 24) return i18n.t('presence_recent_hours_ago', { hours });
  return i18n.t('presence_recent_earlier_today');
}
