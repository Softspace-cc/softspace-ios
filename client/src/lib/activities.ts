import type { RichPresenceData } from '../components/RichPresenceDisplay';
import { formatPresenceLine, formatRecentActivityLabel } from './presenceI18n';

export type ActivityEntry = {
  id: string;
  presence: RichPresenceData;
  startedAt: number;
  updatedAt: number;
};

export type RecentActivityEntry = ActivityEntry & {
  endedAt: number;
};

export type ActivitiesPayload = {
  type: 'activities';
  active: ActivityEntry[];
  recent: RecentActivityEntry[];
};

export const RECENT_ACTIVITY_LIMIT = 6;
export const RECENT_ACTIVITY_TTL_MS = 2 * 60 * 60 * 1000;

export function parseActivities(raw: string | null | undefined): ActivitiesPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.type !== 'activities') return null;
    return {
      type: 'activities',
      active: Array.isArray(parsed.active) ? parsed.active : [],
      recent: Array.isArray(parsed.recent) ? parsed.recent : [],
    };
  } catch {
    return null;
  }
}

export function serializeActivities(payload: ActivitiesPayload): string {
  return JSON.stringify(payload);
}

export function getPrimaryActivity(payload: ActivitiesPayload | null): RichPresenceData | null {
  if (!payload?.active?.length) return null;
  return payload.active[0]?.presence ?? null;
}

export function formatRecentActivityLabelForEntry(entry: RecentActivityEntry): string {
  return formatRecentActivityLabel(entry.endedAt ?? Date.now());
}

export function formatActivitySummary(payload: ActivitiesPayload | null): string | null {
  const primary = getPrimaryActivity(payload);
  if (!primary) return null;
  const line = formatPresenceLine(primary);
  const extra = (payload?.active?.length ?? 0) - 1;
  if (extra > 0) return `${line} +${extra}`;
  return line;
}

export function pruneRecentActivities(recent: RecentActivityEntry[], now = Date.now()): RecentActivityEntry[] {
  return recent
    .filter((entry) => now - entry.endedAt < RECENT_ACTIVITY_TTL_MS)
    .slice(0, RECENT_ACTIVITY_LIMIT);
}
