import { useEffect, useRef } from 'react';
import { useChatStore } from '../store/useChatStore';
import { useAuthStore } from '../store/useAuthStore';
import {
  fetchPresenceRules,
  buildActivityPresence,
  matchRuleForProcess,
  normalizeProcessName,
} from '../lib/presenceApps';
import { BUILTIN_PRESENCE_RULES } from '../lib/presenceCatalog';
import type { PresenceRule } from '../lib/presenceApps';
import {
  pruneRecentActivities,
  RECENT_ACTIVITY_LIMIT,
  serializeActivities,
  type ActivitiesPayload,
  type ActivityEntry,
  type RecentActivityEntry,
} from '../lib/activities';
import type { RichPresenceData, SpotifyRichPresence } from '../components/RichPresenceDisplay';

type MediaSession = {
  id?: string;
  sourceAppUserModelId?: string;
  title?: string;
  artist?: string;
  thumbnail?: string;
  playbackStatus?: string;
  timeline?: {
    positionMs?: number;
    durationMs?: number;
  };
};

type RunningProcess = {
  name: string;
  title: string;
};

const PLAYBACK_PRIORITY: Record<string, number> = {
  playing: 0,
  changing: 1,
  paused: 2,
  opened: 3,
  stopped: 4,
  closed: 5,
};

function isSpotifySession(session: MediaSession | null | undefined): boolean {
  if (!session) return false;
  return (
    session.id === 'Spotify.exe' ||
    (typeof session.sourceAppUserModelId === 'string' &&
      session.sourceAppUserModelId.toLowerCase().includes('spotify'))
  );
}

function pickSpotifySession(sessions: MediaSession[]): MediaSession | null {
  const spotifySessions = sessions
    .filter(isSpotifySession)
    .filter((session) => typeof session.title === 'string' && session.title.trim().length > 0);

  if (spotifySessions.length === 0) return null;

  return spotifySessions.sort((a, b) => {
    const aPriority = PLAYBACK_PRIORITY[a.playbackStatus ?? 'closed'] ?? 99;
    const bPriority = PLAYBACK_PRIORITY[b.playbackStatus ?? 'closed'] ?? 99;
    return aPriority - bPriority;
  })[0];
}

function normalizePlaybackStatus(status?: string, previousStatus?: string): 'playing' | 'paused' {
  if (status === 'playing') return 'playing';
  if (status === 'paused' || status === 'stopped') return 'paused';
  if (status === 'changing') {
    return previousStatus === 'paused' ? 'paused' : 'playing';
  }
  return previousStatus === 'playing' ? 'playing' : 'paused';
}

function buildSpotifyPresence(
  spotify: MediaSession,
  previousStatus?: string,
  albumArtFallback?: string | null
): SpotifyRichPresence {
  const positionMs = Math.max(0, spotify.timeline?.positionMs ?? 0);
  const durationMs = Math.max(0, spotify.timeline?.durationMs ?? 0);
  const playbackStatus = normalizePlaybackStatus(spotify.playbackStatus, previousStatus);

  return {
    type: 'rich_presence',
    kind: 'spotify',
    app: 'Spotify',
    title: spotify.title!.trim(),
    artist: (spotify.artist ?? '').trim() || 'Unknown Artist',
    albumArt: spotify.thumbnail || albumArtFallback || null,
    playbackStatus,
    positionMs,
    durationMs,
    ts: Date.now(),
  };
}

function slimSpotifyPresence(presence: SpotifyRichPresence, includeAlbumArt: boolean): SpotifyRichPresence {
  if (includeAlbumArt || !presence.albumArt) return presence;
  const { albumArt: _albumArt, ...rest } = presence;
  return rest;
}

function buildServerActivitiesPayload(activitiesJson: string): string {
  try {
    const data = JSON.parse(activitiesJson) as ActivitiesPayload;
    return serializeActivities({
      type: 'activities',
      active: (data.active ?? []).map((entry, index) => ({
        ...entry,
        presence:
          entry.presence.kind === 'spotify'
            ? slimSpotifyPresence(entry.presence, index === 0)
            : entry.presence,
      })),
      recent: (data.recent ?? []).map((entry) => ({
        ...entry,
        presence:
          entry.presence.kind === 'spotify'
            ? slimSpotifyPresence(entry.presence, false)
            : entry.presence,
      })),
    });
  } catch {
    return activitiesJson;
  }
}

function shouldSyncActivities(next: string | null, previous: string | null): boolean {
  if (next === previous) return false;
  if (!next || !previous) return next !== previous;

  try {
    const nextData = JSON.parse(next) as ActivitiesPayload;
    const prevData = JSON.parse(previous) as ActivitiesPayload;

    const signature = (payload: ActivitiesPayload) =>
      JSON.stringify({
        active: (payload.active ?? []).map((entry) => ({
          id: entry.id,
          presence: entry.presence,
        })),
        recent: (payload.recent ?? []).map((entry) => ({
          id: entry.id,
          endedAt: entry.endedAt,
          app: entry.presence.kind === 'spotify' ? entry.presence.title : entry.presence.app,
        })),
      });

    return signature(nextData) !== signature(prevData);
  } catch {
    return next !== previous;
  }
}

function dedupeRecent(recent: RecentActivityEntry[]): RecentActivityEntry[] {
  const seen = new Map<string, RecentActivityEntry>();
  for (const entry of recent) {
    const existing = seen.get(entry.id);
    if (!existing || existing.endedAt < entry.endedAt) {
      seen.set(entry.id, entry);
    }
  }
  return Array.from(seen.values()).sort((a, b) => b.endedAt - a.endedAt);
}

function sortActiveEntries(entries: ActivityEntry[]): ActivityEntry[] {
  const weight = (presence: RichPresenceData) => {
    if (presence.kind === 'spotify') return 0;
    if (presence.kind === 'game') return 1;
    return 2;
  };

  return [...entries].sort((a, b) => {
    const weightDiff = weight(a.presence) - weight(b.presence);
    if (weightDiff !== 0) return weightDiff;
    return b.updatedAt - a.updatedAt;
  });
}

export function GlobalPresenceManager() {
  const socket = useChatStore((state) => state.socket);
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const token = useAuthStore((state) => state.token);

  const currentActivitiesRef = useRef<string | null>(null);
  const activeMapRef = useRef<Map<string, ActivityEntry>>(new Map());
  const recentRef = useRef<RecentActivityEntry[]>([]);
  const lastSpotifyRef = useRef<MediaSession | null>(null);
  const lastSpotifySeenAtRef = useRef(0);
  const lastPlaybackStatusRef = useRef<'playing' | 'paused'>('paused');
  const lastAlbumArtRef = useRef<string | null>(null);
  const rulesRef = useRef<PresenceRule[]>(BUILTIN_PRESENCE_RULES);

  useEffect(() => {
    if (token) {
      fetchPresenceRules(token).then((rules) => {
        rulesRef.current = rules;
      });
    }
  }, [token]);

  useEffect(() => {
    // @ts-ignore
    if (!window.electron || !socket || !user) return;

    const pollInterval = setInterval(async () => {
      try {
        const now = Date.now();
        const currentActivities = new Map<string, RichPresenceData>();

        // @ts-ignore
        const [runningProcesses, activeWindow, mediaSessions] = await Promise.all([
          // @ts-ignore
          window.electron.getRunningProcesses?.() ?? [],
          // @ts-ignore
          window.electron.getActiveWindow(),
          // @ts-ignore
          window.electron.getMediaSessions?.() ?? [],
        ]);

        const focusedProcessName = activeWindow?.owner?.name
          ? normalizeProcessName(activeWindow.owner.name)
          : null;

        for (const process of runningProcesses as RunningProcess[]) {
          const rule = matchRuleForProcess(process.name, rulesRef.current);
          if (!rule) continue;

          const processId = normalizeProcessName(process.name);
          if (processId.includes('spotify')) continue;

          const title =
            focusedProcessName === processId && activeWindow?.title
              ? activeWindow.title
              : process.title;

          currentActivities.set(
            processId,
            buildActivityPresence(rule, { title: title || '' }, process.name)
          );
        }

        if (focusedProcessName) {
          const focusedRule = matchRuleForProcess(focusedProcessName, rulesRef.current);
          if (focusedRule && !focusedProcessName.includes('spotify')) {
            currentActivities.set(
              focusedProcessName,
              buildActivityPresence(
                focusedRule,
                { title: activeWindow?.title || '' },
                activeWindow?.owner?.name || focusedProcessName
              )
            );
          }
        }

        const spotify = pickSpotifySession(mediaSessions as MediaSession[]);
        if (spotify) {
          lastSpotifyRef.current = spotify;
          lastSpotifySeenAtRef.current = now;
          if (spotify.thumbnail) lastAlbumArtRef.current = spotify.thumbnail;

          const richData = buildSpotifyPresence(
            spotify,
            lastPlaybackStatusRef.current,
            lastAlbumArtRef.current
          );
          lastPlaybackStatusRef.current =
            richData.playbackStatus === 'paused' ? 'paused' : 'playing';
          currentActivities.set('spotify', richData);
        } else if (
          lastSpotifyRef.current?.title?.trim() &&
          now - lastSpotifySeenAtRef.current < 6000
        ) {
          const richData = buildSpotifyPresence(
            lastSpotifyRef.current,
            lastPlaybackStatusRef.current,
            lastAlbumArtRef.current
          );
          currentActivities.set('spotify', richData);
        } else {
          lastSpotifyRef.current = null;
          lastAlbumArtRef.current = null;
        }

        const nextActive = new Map<string, ActivityEntry>();
        for (const [id, presence] of currentActivities) {
          const existing = activeMapRef.current.get(id);
          nextActive.set(id, {
            id,
            presence,
            startedAt: existing?.startedAt ?? now,
            updatedAt: now,
          });
        }

        for (const [id, entry] of activeMapRef.current) {
          if (!nextActive.has(id)) {
            recentRef.current.unshift({ ...entry, endedAt: now });
          }
        }

        activeMapRef.current = nextActive;
        recentRef.current = pruneRecentActivities(dedupeRecent(recentRef.current)).slice(
          0,
          RECENT_ACTIVITY_LIMIT
        );

        const payload: ActivitiesPayload = {
          type: 'activities',
          active: sortActiveEntries(Array.from(nextActive.values())),
          recent: recentRef.current,
        };

        const activitiesJson =
          payload.active.length > 0 || payload.recent.length > 0
            ? serializeActivities(payload)
            : null;

        const currentUser = useAuthStore.getState().user;
        if (currentUser && currentUser.activities !== activitiesJson) {
          setUser({ ...currentUser, activities: activitiesJson });
        }

        if (shouldSyncActivities(activitiesJson, currentActivitiesRef.current)) {
          const serverPayload = activitiesJson ? buildServerActivitiesPayload(activitiesJson) : null;
          currentActivitiesRef.current = serverPayload;
          socket.emit('presence:set', {
            status: user.status || 'online',
            activities: serverPayload,
          });
        }
      } catch (err) {
        console.error('Failed to update activities:', err);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [socket, user, setUser]);

  return null;
}
