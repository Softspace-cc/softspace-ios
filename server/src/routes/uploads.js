import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import { customAlphabet } from 'nanoid';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { httpError } from '../lib/errors.js';
import { serializeAttachment } from '../lib/serializers.js';
import { Permissions, channelPermissions, hasPermission } from '../lib/permissions.js';
import { getChannelOrFail, getMembershipOrFail } from '../lib/membership.js';

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.resolve('uploads');
const MAX_MB = Number(process.env.MAX_UPLOAD_MB ?? 20);

if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

const fileId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 24);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    // Generate a secure random filename but preserve the original extension
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${fileId()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    // Allow any file type
    cb(null, true);
  },
});

const router = Router();

router.post('/', requireAuth, (req, res, next) => {
  upload.array('files', 10)(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return next(httpError(413, 'file_too_large'));
      if (err.message === 'mime_not_allowed') return next(httpError(415, 'mime_not_allowed'));
      return next(err);
    }
    try {
      const files = req.files ?? [];
      if (files.length === 0) throw httpError(400, 'no_files');

      const channelId = req.body?.channelId;
      if (channelId) {
        const channel = await getChannelOrFail(channelId);
        const member = await getMembershipOrFail(req.user.id, channel.serverId);
        const server = await prisma.serverGuild.findUnique({
          where: { id: channel.serverId },
          include: { roles: true },
        });
        const perms = channelPermissions(member, server, channel);
        if (!hasPermission(perms, Permissions.VIEW_CHANNELS)) {
          throw httpError(403, 'missing_permission', 'You cannot view this channel.');
        }
        if (!hasPermission(perms, Permissions.ATTACH_FILES)) {
          throw httpError(403, 'cannot_attach_files', 'You do not have permission to attach files in this channel.');
        }
      }

      const created = await Promise.all(
        files.map((f) =>
          prisma.attachment.create({
            data: {
              url: `/uploads/${path.basename(f.path)}`,
              filename: f.originalname,
              mimeType: f.mimetype,
              size: f.size,
            },
          })
        )
      );
      res.status(201).json({ attachments: created.map(serializeAttachment) });
    } catch (e) {
      next(e);
    }
  });
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const att = await prisma.attachment.findUnique({ where: { id: req.params.id } });
    if (!att) throw httpError(404, 'not_found');
    // Only allow delete if unattached (orphan)
    if (att.messageId || att.dmMessageId) throw httpError(403, 'attached_cannot_delete');
    await prisma.attachment.delete({ where: { id: att.id } });
    const filePath = path.join(UPLOAD_DIR, path.basename(att.url));
    fs.unlink(filePath).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/download', requireAuth, async (req, res, next) => {
  try {
    const att = await prisma.attachment.findUnique({
      where: { id: req.params.id },
      include: {
        message: {
          include: {
            channel: {
              include: {
                server: {
                  include: { roles: true }
                }
              }
            }
          }
        },
        dmMessage: {
          include: {
            dmChannel: {
              include: {
                members: true
              }
            }
          }
        }
      }
    });
    if (!att) throw httpError(404, 'not_found');

    // Access control check:
    if (att.messageId && att.message?.channel) {
      const channel = att.message.channel;
      const serverId = channel.serverId;
      const member = await prisma.serverMember.findUnique({
        where: { userId_serverId: { userId: req.user.id, serverId } },
        include: { roles: { include: { role: true } } },
      });
      if (!member) {
        throw httpError(403, 'not_server_member', 'You are not a member of this server.');
      }
      const perms = channelPermissions(member, channel.server, channel);
      if (!hasPermission(perms, Permissions.VIEW_CHANNELS)) {
        throw httpError(403, 'missing_permission', 'You do not have permission to view this channel.');
      }
    } else if (att.dmMessageId && att.dmMessage?.dmChannel) {
      const dmChannel = att.dmMessage.dmChannel;
      const isMember = dmChannel.members.some(m => m.userId === req.user.id);
      if (!isMember) {
        throw httpError(403, 'not_dm_member', 'You are not a member of this DM.');
      }
    }

    const filePath = path.join(UPLOAD_DIR, path.basename(att.url));
    res.download(filePath, att.filename);
  } catch (err) {
    next(err);
  }
});

export { UPLOAD_DIR };
export default router;
