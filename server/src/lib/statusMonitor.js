import fs from 'fs/promises';
import prisma from './prisma.js';
import { UPLOAD_DIR } from '../routes/uploads.js';
import {
  COMPONENT_IDS,
  getStatusStore,
  setAutoComponentStatus,
  effectiveStatus,
  overallStatus,
} from './statusStore.js';

const WEB_CHECK_URL = process.env.STATUS_WEB_URL || 'https://softspace.cc';
const CHECK_INTERVAL_MS = Number(process.env.STATUS_CHECK_INTERVAL_MS || 60_000);

let timer = null;
let running = false;

async function checkDatabase() {
  await prisma.$queryRaw`SELECT 1`;
  return { status: 'operational', message: 'PostgreSQL erreichbar' };
}

async function checkWeb() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(WEB_CHECK_URL, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': 'SoftSpace-StatusMonitor/1.0' },
    });

    if (response.ok) {
      return { status: 'operational', message: 'Web-App antwortet' };
    }

    if (response.status >= 500) {
      return { status: 'major_outage', message: `HTTP ${response.status}` };
    }

    return { status: 'degraded', message: `HTTP ${response.status}` };
  } catch (error) {
    return {
      status: 'major_outage',
      message: error.name === 'AbortError' ? 'Zeitüberschreitung' : 'Nicht erreichbar',
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function checkUploads() {
  await fs.access(UPLOAD_DIR);
  return { status: 'operational', message: 'Upload-Speicher verfügbar' };
}

async function runChecks() {
  if (running) return;
  running = true;

  try {
    await setAutoComponentStatus('api', 'operational', 'API antwortet');

    const [database, web, uploads] = await Promise.all([
      checkDatabase().catch(() => ({
        status: 'major_outage',
        message: 'Datenbank nicht erreichbar',
      })),
      checkWeb(),
      checkUploads().catch(() => ({
        status: 'degraded',
        message: 'Upload-Ordner nicht verfügbar',
      })),
    ]);

    await setAutoComponentStatus('database', database.status, database.message);
    await setAutoComponentStatus('web', web.status, web.message);
    await setAutoComponentStatus('uploads', uploads.status, uploads.message);
    await setAutoComponentStatus(
      'realtime',
      database.status === 'major_outage' ? 'major_outage' : 'operational',
      database.status === 'major_outage'
        ? 'Socket.io offline (Backend down)'
        : 'WebSocket-Server aktiv'
    );
  } finally {
    running = false;
  }
}

export async function buildPublicStatus() {
  const store = await getStatusStore();

  const labels = {
    api: 'API',
    database: 'Datenbank',
    web: 'Web-App',
    realtime: 'Echtzeit (Chat & Voice)',
    uploads: 'Datei-Uploads',
  };

  const components = {};
  for (const id of COMPONENT_IDS) {
    const effective = effectiveStatus(store, id);
    components[id] = {
      id,
      label: labels[id],
      ...effective,
    };
  }

  return {
    overall: overallStatus(components),
    components,
    updatedAt: store.updatedAt,
    checkedAt: new Date().toISOString(),
  };
}

export function startStatusMonitor() {
  if (timer) return;

  void runChecks();
  timer = setInterval(() => {
    void runChecks();
  }, CHECK_INTERVAL_MS);

  if (typeof timer.unref === 'function') {
    timer.unref();
  }
}
