import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppWindow, Gamepad2 } from 'lucide-react';
import type { ActivityRichPresence } from '../lib/presenceApps';
import { formatPresenceLine, getPresenceVerb } from '../lib/presenceI18n';

export { formatPresenceLine } from '../lib/presenceI18n';

export type SpotifyRichPresence = {
  type: 'rich_presence';
  kind: 'spotify';
  app: 'Spotify';
  title: string;
  artist: string;
  albumArt?: string | null;
  playbackStatus?: string;
  positionMs: number;
  durationMs: number;
  ts: number;
};

export type RichPresenceData = SpotifyRichPresence | ActivityRichPresence;

function isSpotifyPresence(data: RichPresenceData): data is SpotifyRichPresence {
  if ('kind' in data) {
    return data.kind === 'spotify';
  }
  return 'title' in data && 'artist' in data && 'positionMs' in data;
}

function isActivityPresence(data: RichPresenceData): data is ActivityRichPresence {
  return data.kind === 'app' || data.kind === 'game';
}

export function parseRichPresence(statusString: string | null | undefined): RichPresenceData | string | null {
  if (!statusString) return null;
  if (statusString.startsWith('{"type":"rich_presence"')) {
    try {
      const parsed = JSON.parse(statusString) as RichPresenceData;
      if (isSpotifyPresence(parsed) && !parsed.kind) {
        return { ...parsed, kind: 'spotify' };
      }
      return parsed;
    } catch {
      return statusString;
    }
  }
  return statusString;
}

function computePositionMs(data: SpotifyRichPresence): number {
  if (data.playbackStatus !== 'playing') {
    return Math.max(0, data.positionMs);
  }
  const elapsed = Date.now() - data.ts;
  const next = data.positionMs + Math.max(0, elapsed);
  if (data.durationMs > 0) {
    return Math.min(data.durationMs, next);
  }
  return next;
}

export function formatTime(ms: number) {
  const safeMs = Math.max(0, ms);
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function formatSpotifyStatusLine(data: SpotifyRichPresence): string {
  return formatPresenceLine(data);
}

function trackArtKey(data: SpotifyRichPresence) {
  return `${data.title}|${data.artist}|${data.durationMs}`;
}

const albumArtCache = new Map<string, string>();

function resolveAlbumArt(data: SpotifyRichPresence): string | null {
  const key = trackArtKey(data);
  if (data.albumArt) {
    albumArtCache.set(key, data.albumArt);
    return data.albumArt;
  }
  return albumArtCache.get(key) ?? null;
}

function PresenceIcon({
  iconUrl,
  accentColor,
  kind,
  size = 'md',
}: {
  iconUrl?: string | null;
  accentColor?: string | null;
  kind: 'app' | 'game' | 'spotify';
  size?: 'sm' | 'md' | 'lg';
}) {
  const [failed, setFailed] = useState(false);
  const sizeClass = size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-14 h-14' : 'w-10 h-10';
  const iconSize = size === 'sm' ? 14 : size === 'lg' ? 22 : 18;
  const tint = accentColor ?? (kind === 'game' ? '#8B5CF6' : '#64748B');
  const FallbackIcon = kind === 'game' ? Gamepad2 : AppWindow;

  if (iconUrl && !failed) {
    return (
      <img
        src={iconUrl}
        alt=""
        className={`${sizeClass} rounded-md object-cover shrink-0 bg-softspace-800`}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-md shrink-0 flex items-center justify-center`}
      style={{ backgroundColor: `${tint}22`, color: tint }}
    >
      <FallbackIcon size={iconSize} aria-hidden="true" />
    </div>
  );
}

function ActivityPresenceCard({
  data,
  compact = false,
  stacked = false,
  dimmed = false,
}: {
  data: ActivityRichPresence;
  compact?: boolean;
  stacked?: boolean;
  dimmed?: boolean;
}) {
  const verb = getPresenceVerb(data.kind);
  const accent = data.accentColor ?? (data.kind === 'game' ? '#8B5CF6' : '#64748B');
  const outerClass = stacked
    ? `p-3 bg-softspace-900 border border-softspace-800 rounded-xl ${dimmed ? 'opacity-80' : ''}`
    : `mt-4 p-3 bg-softspace-900 border border-softspace-800 rounded-xl`;

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs mt-1 text-softspace-400 min-w-0">
        <PresenceIcon iconUrl={data.iconUrl} accentColor={data.accentColor} kind={data.kind} size="sm" />
        <div className="min-w-0">
          <span className="truncate font-medium text-softspace-300 block">
            {formatPresenceLine(data)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={outerClass}
      style={{ boxShadow: `inset 3px 0 0 0 ${accent}` }}
    >
      <div className="flex items-center gap-3">
        <PresenceIcon iconUrl={data.iconUrl} accentColor={data.accentColor} kind={data.kind} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: accent }}>
            {verb}
          </div>
          <div className="font-semibold text-sm truncate text-softspace-100">{data.app}</div>
          {data.detail && (
            <div className="text-xs text-softspace-400 truncate mt-0.5">{data.detail}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function SpotifyPresenceCard({
  data,
  compact = false,
  stacked = false,
  dimmed = false,
}: {
  data: SpotifyRichPresence;
  compact?: boolean;
  stacked?: boolean;
  dimmed?: boolean;
}) {
  const { t } = useTranslation();
  const isPlaying = data.playbackStatus === 'playing';
  const hasDuration = data.durationMs > 0;
  const albumArt = useMemo(() => resolveAlbumArt(data), [data.title, data.artist, data.durationMs, data.albumArt]);
  const [currentMs, setCurrentMs] = useState(() => computePositionMs(data));

  useEffect(() => {
    setCurrentMs(computePositionMs(data));
    if (!isPlaying) return undefined;
    const interval = setInterval(() => setCurrentMs(computePositionMs(data)), 250);
    return () => clearInterval(interval);
  }, [data.title, data.artist, data.positionMs, data.durationMs, data.playbackStatus, data.ts, isPlaying]);

  const progressPercent = hasDuration
    ? Math.min(100, Math.max(0, (currentMs / data.durationMs) * 100))
    : 0;

  const outerClass = stacked
    ? `p-3 bg-softspace-900 border border-softspace-800 rounded-xl ${!isPlaying || dimmed ? 'opacity-90' : ''}`
    : `mt-4 p-3 bg-softspace-900 border border-softspace-800 rounded-xl ${!isPlaying ? 'opacity-90' : ''}`;

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs mt-1 text-softspace-400 min-w-0">
        {albumArt ? (
          <img src={albumArt} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
        ) : (
          <PresenceIcon iconUrl="https://cdn.simpleicons.org/spotify/1DB954" accentColor="#1DB954" kind="spotify" size="sm" />
        )}
        <div className="min-w-0">
          <span className="truncate font-medium text-softspace-300 block">{data.title}</span>
          <span className="truncate block">
            {data.artist}
            {!isPlaying ? ` · ${t('presence_paused')}` : ''}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={outerClass}>
      <div className="flex items-center gap-3">
        <div className="relative w-14 h-14 rounded-md overflow-hidden shrink-0 bg-softspace-800">
          {albumArt ? (
            <img src={albumArt} alt="" className="w-full h-full object-cover" />
          ) : (
            <PresenceIcon iconUrl="https://cdn.simpleicons.org/spotify/1DB954" accentColor="#1DB954" kind="spotify" size="lg" />
          )}
          {!isPlaying && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" className="text-white/90" aria-hidden="true">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#1db954] mb-0.5">
            {t('presence_listening')}
          </div>
          <div className="font-semibold text-sm truncate text-softspace-100">{data.title}</div>
          <div className="text-xs text-softspace-400 truncate">{data.artist}</div>
        </div>
      </div>

      {hasDuration && (
        <div className="mt-3 space-y-1">
          <div className="h-1 bg-softspace-800 rounded-full overflow-hidden">
            <div
              className={`h-full bg-[#1db954] rounded-full ${isPlaying ? 'transition-[width] duration-300 ease-linear' : ''}`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-softspace-500 font-mono tabular-nums">
            <span>{formatTime(currentMs)}</span>
            <span>{formatTime(data.durationMs)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function RichPresenceDisplay({
  data,
  compact = false,
  stacked = false,
  dimmed = false,
}: {
  data: RichPresenceData;
  compact?: boolean;
  stacked?: boolean;
  dimmed?: boolean;
}) {
  if (isSpotifyPresence(data)) {
    return (
      <SpotifyPresenceCard
        data={{ ...data, kind: 'spotify' }}
        compact={compact}
        stacked={stacked}
        dimmed={dimmed}
      />
    );
  }
  if (isActivityPresence(data)) {
    return (
      <ActivityPresenceCard
        data={data}
        compact={compact}
        stacked={stacked}
        dimmed={dimmed}
      />
    );
  }
  return null;
}
