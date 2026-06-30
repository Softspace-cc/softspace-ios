import { parseActivities, formatActivitySummary, getPrimaryActivity } from './activities';
import { formatPresenceLine } from './presenceI18n';
import { parseRichPresence } from '../components/RichPresenceDisplay';
import type { RichPresenceData } from '../components/RichPresenceDisplay';

export function getUserPrimaryPresence(user: {
  activities?: string | null;
  customStatus?: string | null;
}): RichPresenceData | null {
  const activities = parseActivities(user.activities);
  const fromActivities = getPrimaryActivity(activities);
  if (fromActivities) return fromActivities;

  const legacy = parseRichPresence(user.customStatus);
  return typeof legacy === 'string' ? null : legacy;
}

export function getUserPresenceSummary(user: {
  activities?: string | null;
  customStatus?: string | null;
}): string | null {
  const activities = parseActivities(user.activities);
  const summary = formatActivitySummary(activities);
  if (summary) return summary;

  const legacy = parseRichPresence(user.customStatus);
  if (typeof legacy === 'string') {
    const raw = legacy.trim() || null;
    if (!raw) return null;
    return raw.replace(/\[\[ce:(?:EMOJI|GIF):([^:\]]+):[^\]]+\]\]/g, ':$1:');
  }
  if (legacy) return formatPresenceLine(legacy);
  return null;
}

export function getUserPresenceIcon(user: {
  activities?: string | null;
  customStatus?: string | null;
}): string | null {
  const primary = getUserPrimaryPresence(user);
  if (!primary) return null;
  if (primary.kind === 'spotify') {
    return primary.albumArt ?? 'https://cdn.simpleicons.org/spotify/1DB954';
  }
  return primary.iconUrl ?? null;
}

export function isManualCustomStatus(customStatus?: string | null): boolean {
  if (!customStatus?.trim()) return false;
  if (customStatus.startsWith('{"type":"rich_presence"')) return false;
  if (customStatus.startsWith('{"type":"activities"')) return false;
  return true;
}
