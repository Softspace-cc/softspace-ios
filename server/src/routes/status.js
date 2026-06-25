import { Router } from 'express';
import { z } from 'zod';
import { httpError } from '../lib/errors.js';
import { buildPublicStatus } from '../lib/statusMonitor.js';
import {
  COMPONENT_IDS,
  STATUS_LEVELS,
  getStatusStore,
  setManualComponentStatus,
  effectiveStatus,
  overallStatus,
} from '../lib/statusStore.js';

const router = Router();

const adminUpdateSchema = z.object({
  componentId: z.enum(COMPONENT_IDS),
  status: z.union([z.enum(STATUS_LEVELS), z.null()]),
  message: z.string().max(500).optional(),
});

function requireStatusAdmin(req) {
  const expected = process.env.STATUS_ADMIN_PASSWORD;
  if (!expected) {
    throw httpError(503, 'status_admin_not_configured');
  }

  const password = req.headers['x-status-admin-password'];
  if (password !== expected) {
    throw httpError(401, 'invalid_status_admin_password');
  }
}

function buildStatusFromStore(store) {
  const labels = {
    api: 'API',
    database: 'Datenbank',
    web: 'Web-App',
    realtime: 'Echtzeit (Chat & Voice)',
    uploads: 'Datei-Uploads',
  };

  const components = {};
  for (const id of COMPONENT_IDS) {
    components[id] = {
      id,
      label: labels[id],
      ...effectiveStatus(store, id),
    };
  }

  return {
    overall: overallStatus(components),
    components,
    updatedAt: store.updatedAt,
    checkedAt: new Date().toISOString(),
  };
}

router.get('/', async (_req, res, next) => {
  try {
    const payload = await buildPublicStatus();
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

router.get('/snapshot', async (_req, res, next) => {
  try {
    const store = await getStatusStore();
    res.json(buildStatusFromStore(store));
  } catch (err) {
    next(err);
  }
});

router.patch('/admin', async (req, res, next) => {
  try {
    requireStatusAdmin(req);
    const data = adminUpdateSchema.parse(req.body);
    await setManualComponentStatus(data.componentId, {
      status: data.status,
      message: data.message,
    });
    const store = await getStatusStore();
    res.json(buildStatusFromStore(store));
  } catch (err) {
    next(err);
  }
});

export default router;
