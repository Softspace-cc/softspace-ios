import { Router } from 'express';
import sanitizeHtml from 'sanitize-html';
import fs from 'fs/promises';
import path from 'path';
import rateLimit from 'express-rate-limit';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { httpError } from '../lib/errors.js';
import { editMessageSchema, reactionSchema, sendMessageSchema } from '../lib/validators.js';
import { serializeMessage, serializeReaction } from '../lib/serializers.js';
import { Permissions } from '../lib/permissions.js';
import {
  getChannelOrFail,
  getMembershipOrFail,
  getMessageOrFail,
} from '../lib/membership.js';
import { hasPermission, channelPermissions } from '../lib/permissions.js';
import { parseRoleMentions, stringifyMentionedRoleIds } from '../lib/mentions.js';
import { UPLOAD_DIR } from './uploads.js';

const router = Router();

const chatLimiter = rateLimit({
  windowMs: 5 * 1000, // 5 seconds
  max: 10, // Max 10 requests per 5 seconds
  message: { error: 'Too many messages/actions, please slow down.' }
});

const MESSAGE_INCLUDE = {
  author: true,
  reactions: true,
  attachments: true,
  replyTo: { include: { author: true } },
};

function sanitizeContent(content) {
  return sanitizeHtml(content ?? '', {
    allowedTags: [],
    allowedAttributes: {},
  }).trim();
}

router.get('/channels/:channelId/messages', requireAuth, async (req, res, next) => {
  try {
    const channel = await getChannelOrFail(req.params.channelId);
    const member = await getMembershipOrFail(req.user.id, channel.serverId);
    if (channel.type !== 'TEXT') throw httpError(400, 'not_text_channel');

    const server = await prisma.serverGuild.findUnique({
      where: { id: channel.serverId },
      include: { roles: true },
    });
    const perms = channelPermissions(member, server, channel);
    if (!hasPermission(perms, Permissions.VIEW_CHANNELS)) {
      throw httpError(403, 'missing_permission', 'You do not have permission to view this channel.');
    }

    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const before = req.query.before ? new Date(String(req.query.before)) : null;

    const messages = await prisma.message.findMany({
      where: {
        channelId: channel.id,
        ...(before ? { createdAt: { lt: before } } : {}),
      },
      include: MESSAGE_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    res.json({ messages: messages.reverse().map(serializeMessage) });
  } catch (err) {
    next(err);
  }
});

router.post('/channels/:channelId/messages', requireAuth, chatLimiter, async (req, res, next) => {
  try {
    const channel = await getChannelOrFail(req.params.channelId);
    const member = await getMembershipOrFail(req.user.id, channel.serverId);
    if (channel.type !== 'TEXT') throw httpError(400, 'not_text_channel');

    const server = await prisma.serverGuild.findUnique({
      where: { id: channel.serverId },
      include: { roles: true },
    });
    
    if (channel.serverId === 'teamchat') {
      if (req.user.systemRole === 'MODERATOR' && channel.name !== 'chat') {
        throw httpError(403, 'cannot_send_messages', 'Moderators can only chat in the chat channel.');
      }
    }

    const perms = channelPermissions(member, server, channel);
    if (!hasPermission(perms, Permissions.VIEW_CHANNELS)) {
      throw httpError(403, 'missing_permission', 'You do not have permission to view this channel.');
    }
    if (!hasPermission(perms, Permissions.SEND_MESSAGES)) {
      throw httpError(403, 'cannot_send_messages', 'You do not have permission to send messages in this channel.');
    }
    if (member.timeoutUntil && member.timeoutUntil > new Date()) {
      throw httpError(403, 'timeout', 'You are currently timed out from this server.');
    }

    const data = sendMessageSchema.parse(req.body);
    const content = sanitizeContent(data.content);
    if (!content && (!data.attachmentIds || data.attachmentIds.length === 0))
      throw httpError(400, 'empty_message');

    if (data.attachmentIds?.length && !hasPermission(perms, Permissions.ATTACH_FILES)) {
      throw httpError(403, 'cannot_attach_files', 'You do not have permission to attach files in this channel.');
    }

    let mentionedRoleIds = parseRoleMentions(content, server?.roles);
    if (mentionedRoleIds.length > 0 && !hasPermission(perms, Permissions.MENTION_ROLES)) {
      mentionedRoleIds = [];
    }

    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          channelId: channel.id,
          authorId: req.user.id,
          content,
          replyToId: data.replyToId ?? null,
          mentionedRoleIds: stringifyMentionedRoleIds(mentionedRoleIds),
        },
      });
      if (data.attachmentIds?.length) {
        await tx.attachment.updateMany({
          where: { id: { in: data.attachmentIds }, messageId: null, dmMessageId: null },
          data: { messageId: created.id },
        });
      }
      return tx.message.findUnique({ where: { id: created.id }, include: MESSAGE_INCLUDE });
    });

    const payload = serializeMessage(message);
    req.app.get('io')?.to(`channel:${channel.id}`).emit('message:created', payload);

    // Send push notification to server members (except sender)
    void prisma.serverMember.findMany({
      where: {
        serverId: channel.serverId,
        userId: { not: req.user.id }
      },
      select: { userId: true }
    }).then(serverMembers => {
      const recipientIds = serverMembers.map(m => m.userId);
      if (recipientIds.length > 0) {
        import('../lib/pushNotifications.js').then(({ sendPushNotification }) => {
          sendPushNotification(recipientIds, {
            title: `#${channel.name}`,
            body: `${message.author.displayName || message.author.username}: ${message.content || 'Sent an attachment'}`,
            data: {
              channelId: channel.id,
              serverId: channel.serverId,
              type: 'channel'
            }
          }).catch(err => console.error('Failed to send channel push notification', err));
        }).catch(err => console.error('Failed to import pushNotifications', err));
      }
    }).catch(err => console.error('Failed to fetch server members for push notification', err));

    res.status(201).json({ message: payload });
  } catch (err) {
    next(err);
  }
});

router.patch('/messages/:messageId', requireAuth, chatLimiter, async (req, res, next) => {
  try {
    const existing = await getMessageOrFail(req.params.messageId);
    if (existing.authorId !== req.user.id) throw httpError(403, 'not_message_author');

    const member = await getMembershipOrFail(req.user.id, existing.channel.serverId);
    const server = existing.channel.server;
    const perms = channelPermissions(member, server, existing.channel);
    if (!hasPermission(perms, Permissions.VIEW_CHANNELS)) {
      throw httpError(403, 'missing_permission', 'You cannot view this channel.');
    }
    if (!hasPermission(perms, Permissions.SEND_MESSAGES)) {
      throw httpError(403, 'cannot_send_messages', 'You do not have permission to send messages in this channel.');
    }

    const data = editMessageSchema.parse(req.body);
    const content = sanitizeContent(data.content);
    if (!content) throw httpError(400, 'empty_message');

    let mentionedRoleIds = parseRoleMentions(content, server?.roles);
    if (mentionedRoleIds.length > 0 && !hasPermission(perms, Permissions.MENTION_ROLES)) {
      mentionedRoleIds = [];
    }

    const message = await prisma.message.update({
      where: { id: existing.id },
      data: {
        content,
        editedAt: new Date(),
        mentionedRoleIds: stringifyMentionedRoleIds(mentionedRoleIds),
      },
      include: MESSAGE_INCLUDE,
    });
    const payload = serializeMessage(message);
    req.app.get('io')?.to(`channel:${existing.channelId}`).emit('message:updated', payload);
    res.json({ message: payload });
  } catch (err) {
    next(err);
  }
});

router.delete('/messages/:messageId', requireAuth, chatLimiter, async (req, res, next) => {
  try {
    const message = await getMessageOrFail(req.params.messageId);
    const member = await getMembershipOrFail(req.user.id, message.channel.serverId);
    const perms = channelPermissions(member, message.channel.server, message.channel);
    if (!hasPermission(perms, Permissions.VIEW_CHANNELS)) {
      throw httpError(403, 'missing_permission', 'You cannot view this channel.');
    }

    let canDelete = message.authorId === req.user.id;
    if (!canDelete) {
      canDelete = hasPermission(perms, Permissions.MANAGE_MESSAGES);
    }
    if (req.user.systemRole === 'CEO' || req.user.systemRole === 'MODERATOR') canDelete = true;
    if (!canDelete) throw httpError(403, 'cannot_delete_message');

    // Find attachments to delete physically from disk
    const attachments = await prisma.attachment.findMany({
      where: { messageId: message.id }
    });

    await prisma.message.delete({ where: { id: message.id } });
    
    // Delete physical files
    for (const att of attachments) {
      const filePath = path.join(UPLOAD_DIR, path.basename(att.url));
      fs.unlink(filePath).catch(() => {});
    }

    req.app
      .get('io')
      ?.to(`channel:${message.channelId}`)
      .emit('message:deleted', { id: message.id, channelId: message.channelId });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.put('/messages/:messageId/reactions/:emoji', requireAuth, chatLimiter, async (req, res, next) => {
  try {
    const data = reactionSchema.parse({ emoji: decodeURIComponent(req.params.emoji) });
    const message = await getMessageOrFail(req.params.messageId);
    const member = await getMembershipOrFail(req.user.id, message.channel.serverId);
    const perms = channelPermissions(member, message.channel.server, message.channel);
    if (!hasPermission(perms, Permissions.VIEW_CHANNELS)) {
      throw httpError(403, 'missing_permission', 'You cannot view this channel.');
    }
    if (!hasPermission(perms, Permissions.ADD_REACTIONS)) {
      throw httpError(403, 'cannot_add_reactions', 'You do not have permission to react in this channel.');
    }

    const reaction = await prisma.reaction.upsert({
      where: { messageId_userId_emoji: { messageId: message.id, userId: req.user.id, emoji: data.emoji } },
      update: {},
      create: { messageId: message.id, userId: req.user.id, emoji: data.emoji },
    });
    req.app
      .get('io')
      ?.to(`channel:${message.channelId}`)
      .emit('reaction:added', { messageId: message.id, reaction: serializeReaction(reaction) });
    res.json({ reaction: serializeReaction(reaction) });
  } catch (err) {
    next(err);
  }
});

router.delete('/messages/:messageId/reactions/:emoji', requireAuth, chatLimiter, async (req, res, next) => {
  try {
    const emoji = decodeURIComponent(req.params.emoji);
    const message = await getMessageOrFail(req.params.messageId);
    const member = await getMembershipOrFail(req.user.id, message.channel.serverId);
    const perms = channelPermissions(member, message.channel.server, message.channel);
    if (!hasPermission(perms, Permissions.VIEW_CHANNELS)) {
      throw httpError(403, 'missing_permission', 'You cannot view this channel.');
    }

    await prisma.reaction
      .delete({
        where: { messageId_userId_emoji: { messageId: message.id, userId: req.user.id, emoji } },
      })
      .catch(() => { });
    req.app
      .get('io')
      ?.to(`channel:${message.channelId}`)
      .emit('reaction:removed', { messageId: message.id, userId: req.user.id, emoji });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
