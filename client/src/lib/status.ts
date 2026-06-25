export type StatusLevel =
  | 'operational'
  | 'degraded'
  | 'partial_outage'
  | 'major_outage'
  | 'maintenance';

export type StatusComponentId = 'api' | 'database' | 'web' | 'realtime' | 'uploads';

export type StatusComponent = {
  id: StatusComponentId;
  label: string;
  status: StatusLevel;
  message: string;
  source: 'manual' | 'auto';
  autoStatus: StatusLevel;
  autoMessage: string;
  checkedAt: string | null;
  setAt: string | null;
};

export type StatusPayload = {
  overall: StatusLevel;
  components: Record<string, StatusComponent>;
  checkedAt: string;
  updatedAt: string;
};

export const STATUS_BANNER: Record<StatusLevel, string> = {
  operational: 'bg-softspace-600/15 text-softspace-300 border-softspace-600/35',
  degraded: 'bg-amber-500/10 text-amber-200 border-amber-500/30',
  partial_outage: 'bg-orange-500/10 text-orange-200 border-orange-500/30',
  major_outage: 'bg-red-500/10 text-red-200 border-red-500/30',
  maintenance: 'bg-blue-500/10 text-blue-200 border-blue-500/30',
};

export const STATUS_DOT: Record<StatusLevel, string> = {
  operational: 'bg-softspace-600',
  degraded: 'bg-amber-500',
  partial_outage: 'bg-orange-500',
  major_outage: 'bg-red-500',
  maintenance: 'bg-blue-500',
};

export const STATUS_COMPONENT_IDS: StatusComponentId[] = [
  'api',
  'database',
  'web',
  'realtime',
  'uploads',
];

export function statusLevelKey(level: StatusLevel) {
  return `status_level_${level}` as const;
}

export function statusOverallKey(level: StatusLevel) {
  return `status_overall_${level}` as const;
}

export function statusComponentKey(id: StatusComponentId) {
  return `status_component_${id}` as const;
}
