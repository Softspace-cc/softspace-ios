import { api } from './api';
import { BUILTIN_PRESENCE_RULES } from './presenceCatalog';

export type PresenceRule = {
  processName: string;
  displayName: string;
  type: 'APP' | 'GAME';
  showTitle: boolean;
  iconUrl?: string;
  accentColor?: string;
};

export type ActivityRichPresence = {
  type: 'rich_presence';
  kind: 'app' | 'game';
  app: string;
  detail?: string | null;
  iconUrl?: string | null;
  accentColor?: string | null;
};

let cachedRules: PresenceRule[] | null = null;
let lastFetch = 0;

function mergeRules(remote: PresenceRule[]): PresenceRule[] {
  const byProcess = new Map<string, PresenceRule>();
  for (const rule of BUILTIN_PRESENCE_RULES) {
    byProcess.set(rule.processName.toLowerCase(), rule);
  }
  for (const rule of remote) {
    byProcess.set(rule.processName.toLowerCase(), { ...byProcess.get(rule.processName.toLowerCase()), ...rule });
  }
  return Array.from(byProcess.values());
}

export async function fetchPresenceRules(token?: string | null): Promise<PresenceRule[]> {
  if (cachedRules && Date.now() - lastFetch < 60000) {
    return cachedRules;
  }
  try {
    const res = await api('/api/users/badge-admin/presence-apps', {}, token);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.rules)) {
        cachedRules = mergeRules(data.rules);
        lastFetch = Date.now();
        return cachedRules;
      }
    }
  } catch (err) {
    console.error('Failed to fetch presence rules', err);
  }
  cachedRules = mergeRules(cachedRules ?? []);
  return cachedRules;
}

const IGNORED_PROCESSES = new Set([
  'explorer.exe',
  'textinputhost.exe',
  'searchapp.exe',
  'searchhost.exe',
  'startmenuexperiencehost.exe',
  'shellexperiencehost.exe',
  'applicationframehost.exe',
  'systemsettings.exe',
  'electron.exe',
  'softspace.exe',
  'softspace',
]);

function cleanWindowTitle(title: string, processName: string): string {
  let cleanTitle = title.trim();
  const processLower = processName.toLowerCase();

  if (processLower.includes('discord')) {
    if (cleanTitle.includes(' - Discord')) {
      cleanTitle = cleanTitle.split(' - Discord')[0].trim();
    }
    if (cleanTitle.includes('Friends - ')) return 'Friends';
    if (cleanTitle.startsWith('@')) return 'Direct Messages';
    if (cleanTitle.startsWith('#')) return cleanTitle;
    return cleanTitle;
  }

  if (processLower.includes('chrome') || processLower.includes('firefox') || processLower.includes('msedge')) {
    for (const suffix of [' - Google Chrome', ' - Mozilla Firefox', ' - Microsoft​ Edge', ' - Microsoft Edge']) {
      if (cleanTitle.endsWith(suffix)) {
        cleanTitle = cleanTitle.slice(0, -suffix.length).trim();
      }
    }
  }

  if (processLower === 'code.exe' || processLower === 'cursor.exe') {
    if (cleanTitle.endsWith(' - Visual Studio Code')) {
      cleanTitle = cleanTitle.slice(0, -' - Visual Studio Code'.length).trim();
    }
    if (cleanTitle.endsWith(' - Cursor')) {
      cleanTitle = cleanTitle.slice(0, -' - Cursor'.length).trim();
    }
  }

  return cleanTitle;
}

function buildActivityDetail(rule: PresenceRule, windowData: { title: string }, processName: string): string | null {
  if (!rule.showTitle || !windowData.title?.trim()) return null;

  const cleanTitle = cleanWindowTitle(windowData.title, processName);
  if (!cleanTitle) return null;

  if (processName.toLowerCase().includes('spotify')) {
    if (cleanTitle === 'Spotify Premium' || cleanTitle === 'Spotify') return null;
    return cleanTitle;
  }

  if (rule.type === 'GAME') {
    return cleanTitle;
  }

  return cleanTitle;
}

export function buildActivityPresence(
  rule: PresenceRule,
  windowData: { title: string },
  processName: string,
): ActivityRichPresence {
  const detail = buildActivityDetail(rule, windowData, processName);
  return {
    type: 'rich_presence',
    kind: rule.type === 'GAME' ? 'game' : 'app',
    app: rule.displayName,
    detail,
    iconUrl: rule.iconUrl ?? null,
    accentColor: rule.accentColor ?? null,
  };
}

export function normalizeProcessName(name: string): string {
  const trimmed = name.trim().toLowerCase();
  return trimmed.endsWith('.exe') ? trimmed : `${trimmed}.exe`;
}

export function matchRuleForProcess(processName: string, rules: PresenceRule[]): PresenceRule | null {
  const normalized = normalizeProcessName(processName);
  return rules.find((rule) => normalizeProcessName(rule.processName) === normalized) ?? null;
}

export function buildActivityRichPresence(rule: PresenceRule, windowData: { title: string }, processName: string): string {
  return JSON.stringify(buildActivityPresence(rule, windowData, processName));
}

export function evaluatePresence(
  windowData: { title: string; owner: { name: string } } | null,
  rules: PresenceRule[]
): string | null {
  if (!windowData || !windowData.owner || !windowData.owner.name) return null;

  const processName = windowData.owner.name;
  const processNameLower = processName.toLowerCase();

  if (IGNORED_PROCESSES.has(processNameLower)) return null;
  if (windowData.title && windowData.title.toLowerCase().includes('softspace')) return null;

  const rule = matchRuleForProcess(processName, rules);
  if (!rule) {
    return null;
  }

  if (processNameLower.includes('spotify')) {
    const title = windowData.title?.trim();
    if (!title || title === 'Spotify Premium' || title === 'Spotify') {
      return null;
    }
  }

  return buildActivityRichPresence(rule, windowData, processName);
}
