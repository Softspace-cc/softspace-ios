import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { httpError } from '../lib/errors.js';
import { updateChannelSchema } from '../lib/validators.js';
import { serializeChannel } from '../lib/serializers.js';
import { Permissions, channelPermissions, hasPermission } from '../lib/permissions.js';
import { getChannelOrFail, getMembershipOrFail, requirePermission } from '../lib/membership.js';
import { UPLOAD_DIR } from './uploads.js';

const router = Router();

router.get('/:channelId', requireAuth, async (req, res, next) => {
  try {
    const channel = await getChannelOrFail(req.params.channelId);
    const member = await getMembershipOrFail(req.user.id, channel.serverId);
    const server = await prisma.serverGuild.findUnique({
      where: { id: channel.serverId },
      include: { roles: true },
    });
    const perms = channelPermissions(member, server, channel);
    if (!hasPermission(perms, Permissions.VIEW_CHANNELS)) {
      throw httpError(403, 'missing_permission', 'You do not have permission to view this channel.');
    }
    res.json({ channel: serializeChannel(channel) });
  } catch (err) {
    next(err);
  }
});

router.patch('/:channelId', requireAuth, async (req, res, next) => {
  try {
    const channel = await getChannelOrFail(req.params.channelId);
    await requirePermission(req.user.id, channel.serverId, Permissions.MANAGE_CHANNELS);
    const data = updateChannelSchema.parse(req.body);
    const update = {};
    if ('name' in data) update.name = data.name.toLowerCase();
    if ('topic' in data) update.topic = data.topic;
    if ('position' in data) update.position = data.position;
    if ('parentId' in data) update.parentId = data.parentId;
    if ('permissionOverrides' in data) update.permissionOverrides = data.permissionOverrides;
    const updated = await prisma.channel.update({ where: { id: channel.id }, data: update });
    req.app
      .get('io')
      ?.to(`server:${channel.serverId}`)
      .emit('channel:updated', serializeChannel(updated));
    res.json({ channel: serializeChannel(updated) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:channelId', requireAuth, async (req, res, next) => {
  try {
    const channel = await getChannelOrFail(req.params.channelId);
    await requirePermission(req.user.id, channel.serverId, Permissions.MANAGE_CHANNELS);

    // Find all attachments in this channel to delete physically from disk
    const attachments = await prisma.attachment.findMany({
      where: { message: { channelId: channel.id } }
    });

    await prisma.channel.delete({ where: { id: channel.id } });

    // Delete physical files
    for (const att of attachments) {
      const filePath = path.join(UPLOAD_DIR, path.basename(att.url));
      fs.unlink(filePath).catch(() => {});
    }

    req.app
      .get('io')
      ?.to(`server:${channel.serverId}`)
      .emit('channel:deleted', { channelId: channel.id, serverId: channel.serverId });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
