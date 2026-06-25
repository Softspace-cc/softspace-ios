import fs from 'fs/promises';
import path from 'path';

const STORE_PATH = path.resolve(process.cwd(), 'data', 'status.json');

export const STATUS_LEVELS = /** @type {const} */ ([
  'operational',
  'degraded',
  'partial_outage',
  'major_outage',
  'maintenance',
]);

export const COMPONENT_IDS = /** @type {const} */ ([
  'api',
  'database',
  'web',
  'realtime',
  'uploads',
]);

const defaultStore = () => ({
  manual: {},
  auto: Object.fromEntries(
    COMPONENT_IDS.map((id) => [id, { status: 'operational', message: '', checkedAt: null }])
  ),
  updatedAt: new Date().toISOString(),
});

let cachedStore = null;

export async function getStatusStore() {
  if (cachedStore) return cachedStore;

  try {
    await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
    const raw = await fs.readFile(STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    cachedStore = {
      ...defaultStore(),
      ...parsed,
      manual: parsed.manual ?? {},
      auto: { ...defaultStore().auto, ...(parsed.auto ?? {}) },
    };
  } catch {
    cachedStore = defaultStore();
    await saveStatusStore(cachedStore).catch(() => {});
  }

  return cachedStore;
}

export async function saveStatusStore(store) {
  cachedStore = {
    ...store,
    updatedAt: new Date().toISOString(),
  };
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(cachedStore, null, 2), 'utf-8');
  return cachedStore;
}

export async function setManualComponentStatus(componentId, payload) {
  const store = await getStatusStore();
  if (!COMPONENT_IDS.includes(componentId)) {
    throw new Error('invalid_component');
  }

  if (!payload || payload.status == null) {
    delete store.manual[componentId];
  } else {
    store.manual[componentId] = {
      status: payload.status,
      message: payload.message?.trim() || '',
      setAt: new Date().toISOString(),
    };
  }

  return saveStatusStore(store);
}

export async function setAutoComponentStatus(componentId, status, message = '') {
  const store = await getStatusStore();
  if (!COMPONENT_IDS.includes(componentId)) {
    throw new Error('invalid_component');
  }

  store.auto[componentId] = {
    status,
    message: message.trim(),
    checkedAt: new Date().toISOString(),
  };

  return saveStatusStore(store);
}

export function effectiveStatus(store, componentId) {
  const manual = store.manual[componentId];
  const auto = store.auto[componentId] ?? { status: 'operational', message: '' };

  if (manual?.status) {
    return {
      status: manual.status,
      message: manual.message || auto.message,
      source: 'manual',
      autoStatus: auto.status,
      autoMessage: auto.message,
      checkedAt: auto.checkedAt,
      setAt: manual.setAt ?? null,
    };
  }

  return {
    status: auto.status,
    message: auto.message,
    source: 'auto',
    autoStatus: auto.status,
    autoMessage: auto.message,
    checkedAt: auto.checkedAt,
    setAt: null,
  };
}

export function overallStatus(components) {
  const priority = {
    major_outage: 4,
    partial_outage: 3,
    degraded: 2,
    maintenance: 1,
    operational: 0,
  };

  let worst = 'operational';
  for (const component of Object.values(components)) {
    if (priority[component.status] > priority[worst]) {
      worst = component.status;
    }
  }

  return worst;
}
