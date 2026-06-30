import { Router } from 'express';
import sanitizeHtml from 'sanitize-html';
import fs from 'fs/promises';
import path from 'path';
import rateLimit from 'express-rate-limit';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { httpError } from '../lib/errors.js';
import {
  createDmSchema,
  editMessageSchema,
  reactionSchema,
  sendMessageSchema,
} from '../lib/validators.js';
import {
  serializeDmChannel,
  serializeDmMessage,
  serializeReaction,
} from '../lib/serializers.js';
import { UPLOAD_DIR } from './uploads.js';

const router = Router();

const dmCreateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Max 10 DMs created per minute
  message: { error: 'Too many DMs created, please wait.' }
});

const dmChatLimiter = rateLimit({
  windowMs: 5 * 1000, // 5 seconds
  max: 10, // Max 10 requests per 5 seconds
  message: { error: 'Too many messages/actions, please slow down.' }
});

const DM_MESSAGE_INCLUDE = {
  author: true,
  reactions: true,
  attachments: true,
  replyTo: { include: { author: true } },
};

function sanitizeContent(content) {
  return sanitizeHtml(content ?? '', { allowedTags: [], allowedAttributes: {} }).trim();
}

async function ensureDmMember(channelIdOrName, userId) {
  // 1. Try to find membership by channel ID first
  let member = await prisma.dMChannelMember.findUnique({
    where: { dmChannelId_userId: { dmChannelId: channelIdOrName, userId } },
  });

  if (member) {
    return { member, channelId: channelIdOrName };
  }

  // 2. If not found by ID, search by group name (fallback)
  const channel = await prisma.dMChannel.findFirst({
    where: { name: channelIdOrName, isGroup: true, members: { some: { userId } } },
  });
  if (!channel) throw httpError(404, 'not_found');

  // Fetch membership for the resolved channel
  member = await prisma.dMChannelMember.findUnique({
    where: { dmChannelId_userId: { dmChannelId: channel.id, userId } },
  });
  
  if (!member) throw httpError(403, 'not_a_dm_member');
  return { member, channelId: channel.id };
}

async function ensureDmChannel(channelIdOrName, userId) {
  const { channelId } = await ensureDmMember(channelIdOrName, userId);
  const channel = await prisma.dMChannel.findUnique({
    where: { id: channelId },
    include: {
      members: { include: { user: true } },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: { author: true, attachments: true, reactions: true },
      },
    },
  });
  if (!channel) throw httpError(404, 'not_found');
  return channel;
}

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const memberships = await prisma.dMChannelMember.findMany({
      where: { userId: req.user.id },
      include: {
        dmChannel: {
          include: {
            members: { include: { user: true } },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: { author: true, attachments: true, reactions: true },
            },
          },
        },
      },
    });
    const channels = memberships
      .map((m) => m.dmChannel)
      .sort((a, b) => {
        const ad = a.messages[0]?.createdAt ?? a.createdAt;
        const bd = b.messages[0]?.createdAt ?? b.createdAt;
        return new Date(bd).getTime() - new Date(ad).getTime();
      });
    res.json({ channels: channels.map(serializeDmChannel) });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, dmCreateLimiter, async (req, res, next) => {
  try {
    const data = createDmSchema.parse(req.body);
    const otherIds = [...new Set(data.userIds.filter((id) => id !== req.user.id))];
    if (otherIds.length === 0) throw httpError(400, 'no_recipients');

    const others = await prisma.user.findMany({ where: { id: { in: otherIds } }, select: { id: true } });
    if (others.length !== otherIds.length) throw httpError(404, 'user_not_found');

    const isGroup = otherIds.length > 1;

    if (!isGroup) {
      // Try to find existing 1:1 DM
      const existing = await prisma.dMChannel.findFirst({
        where: {
          isGroup: false,
          AND: [
            { members: { some: { userId: req.user.id } } },
            { members: { some: { userId: otherIds[0] } } },
          ],
        },
        include: {
          members: { include: { user: true } },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { author: true, attachments: true, reactions: true },
          },
        },
      });
      if (existing) return res.json({ channel: serializeDmChannel(existing) });
    }

    const channel = await prisma.$transaction(async (tx) => {
      const created = await tx.dMChannel.create({
        data: {
          isGroup,
          ownerId: isGroup ? req.user.id : null,
          name: data.name ?? null,
        },
      });
      const memberIds = [req.user.id, ...otherIds];
      await tx.dMChannelMember.createMany({
        data: memberIds.map((userId) => ({ dmChannelId: created.id, userId })),
      });
      return tx.dMChannel.findUnique({
        where: { id: created.id },
        include: {
          members: { include: { user: true } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1, include: { author: true } },
        },
      });
    });

    const payload = serializeDmChannel(channel);
    const io = req.app.get('io');
    for (const memberId of [req.user.id, ...otherIds]) {
      io?.to(`user:${memberId}`).emit('dm:created', payload);
    }
    res.status(201).json({ channel: payload });
  } catch (err) {
    next(err);
  }
});

router.get('/:channelId', requireAuth, async (req, res, next) => {
  try {
    const channel = await ensureDmChannel(req.params.channelId, req.user.id);
    res.json({ channel: serializeDmChannel(channel) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:channelId/members/:userId', requireAuth, async (req, res, next) => {
  try {
    const channel = await ensureDmChannel(req.params.channelId, req.user.id);
    if (!channel.isGroup) throw httpError(400, 'not_a_group');
    if (channel.ownerId !== req.user.id) throw httpError(403, 'not_owner');
    if (req.params.userId === req.user.id) throw httpError(400, 'cannot_remove_self');

    await prisma.dMChannelMember.delete({
      where: { dmChannelId_userId: { dmChannelId: channel.id, userId: req.params.userId } },
    });

    const io = req.app.get('io');
    const members = await prisma.dMChannelMember.findMany({
      where: { dmChannelId: channel.id },
      select: { userId: true },
    });
    // Notify removed user
    io?.to(`user:${req.params.userId}`).emit('dm:removed', { channelId: channel.id });
    // Notify remaining users
    for (const m of members) {
      io?.to(`user:${m.userId}`).emit('dm:member_removed', { channelId: channel.id, userId: req.params.userId });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/:channelId/leave', requireAuth, async (req, res, next) => {
  try {
    const channel = await ensureDmChannel(req.params.channelId, req.user.id);
    if (!channel.isGroup) throw httpError(400, 'not_a_group');
    
    await prisma.dMChannelMember.delete({
      where: { dmChannelId_userId: { dmChannelId: channel.id, userId: req.user.id } },
    });

    const io = req.app.get('io');
    const members = await prisma.dMChannelMember.findMany({
      where: { dmChannelId: channel.id },
      select: { userId: true },
    });
    // Notify removed user
    io?.to(`user:${req.user.id}`).emit('dm:removed', { channelId: channel.id });
    // Notify remaining users
    for (const m of members) {
      io?.to(`user:${m.userId}`).emit('dm:member_removed', { channelId: channel.id, userId: req.user.id });
    }
    
    if (members.length === 0) {
      await prisma.dMChannel.delete({ where: { id: channel.id } });
    } else if (channel.ownerId === req.user.id) {
      // Reassign owner
      await prisma.dMChannel.update({
        where: { id: channel.id },
        data: { ownerId: members[0].userId }
      });
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/:channelId', requireAuth, dmChatLimiter, async (req, res, next) => {
  try {
    const { channelId } = await ensureDmMember(req.params.channelId, req.user.id);
    const channel = await prisma.dMChannel.findUnique({
      where: { id: channelId },
      include: { members: true }
    });
    if (!channel) throw httpError(404, 'not_found');

    // Find all attachments in this DM channel to delete physically from disk
    const attachments = await prisma.attachment.findMany({
      where: { dmMessage: { dmChannelId: channelId } }
    });

    // Break self-referential replyTo relationships to avoid foreign key cascading issues in SQLite/Postgres
    await prisma.dMMessage.updateMany({
      where: { dmChannelId: channelId },
      data: { replyToId: null }
    });

    await prisma.dMChannel.delete({ where: { id: channelId } });

    // Delete physical files
    for (const att of attachments) {
      const filePath = path.join(UPLOAD_DIR, path.basename(att.url));
      fs.unlink(filePath).catch(() => {});
    }

    const io = req.app.get('io');
    for (const m of channel.members) {
      io?.to(`user:${m.userId}`).emit('dm:removed', { channelId });
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/:channelId/messages', requireAuth, async (req, res, next) => {
  try {
    const { channelId } = await ensureDmMember(req.params.channelId, req.user.id);
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const before = req.query.before ? new Date(String(req.query.before)) : null;
    const messages = await prisma.dMMessage.findMany({
      where: {
        dmChannelId: channelId,
        ...(before ? { createdAt: { lt: before } } : {}),
      },
      include: DM_MESSAGE_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    res.json({ messages: messages.reverse().map(serializeDmMessage) });
  } catch (err) {
    next(err);
  }
});

router.post('/:channelId/messages', requireAuth, dmChatLimiter, async (req, res, next) => {
  try {
    const { channelId } = await ensureDmMember(req.params.channelId, req.user.id);
    const data = sendMessageSchema.parse(req.body);
    const content = sanitizeContent(data.content);
    if (!content && (!data.attachmentIds || data.attachmentIds.length === 0))
      throw httpError(400, 'empty_message');

    if (data.replyToId) {
      const replyTarget = await prisma.dMMessage.findUnique({
        where: { id: data.replyToId },
        select: { id: true, dmChannelId: true },
      });
      if (!replyTarget || replyTarget.dmChannelId !== channelId) {
        throw httpError(400, 'invalid_reply_target');
      }
    }

    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.dMMessage.create({
        data: {
          dmChannelId: channelId,
          authorId: req.user.id,
          content,
          replyToId: data.replyToId ?? null,
        },
      });
      if (data.attachmentIds?.length) {
        await tx.attachment.updateMany({
          where: { id: { in: data.attachmentIds }, messageId: null, dmMessageId: null },
          data: { dmMessageId: created.id },
        });
      }
      return tx.dMMessage.findUnique({ where: { id: created.id }, include: DM_MESSAGE_INCLUDE });
    });

    const payload = serializeDmMessage(message);
    const io = req.app.get('io');
    const members = await prisma.dMChannelMember.findMany({
      where: { dmChannelId: channelId },
      select: { userId: true },
    });
    for (const m of members) {
      io?.to(`user:${m.userId}`).emit('dm:message_created', payload);
    }

    // Send push notifications to other members
    const recipientIds = members.map(m => m.userId).filter(id => id !== req.user.id);
    if (recipientIds.length > 0) {
      void prisma.dMChannel.findUnique({
        where: { id: channelId },
        select: { isGroup: true, name: true }
      }).then(channel => {
        if (!channel) return;
        import('../lib/pushNotifications.js').then(({ sendPushNotification }) => {
          const title = channel.isGroup
            ? (channel.name || 'Group Chat')
            : (message.author.displayName || message.author.username);
          const body = channel.isGroup
            ? `${message.author.displayName || message.author.username}: ${message.content || 'Sent an attachment'}`
            : (message.content || 'Sent an attachment');

          sendPushNotification(recipientIds, {
            title,
            body,
            data: {
              channelId,
              type: 'dm'
            }
          }).catch(err => console.error('Failed to send DM push notification', err));
        }).catch(err => console.error('Failed to import pushNotifications', err));
      }).catch(err => console.error('Failed to fetch DM channel for push notification', err));
    }

    res.status(201).json({ message: payload });
  } catch (err) {
    next(err);
  }
});

router.patch('/messages/:messageId', requireAuth, dmChatLimiter, async (req, res, next) => {
  try {
    const message = await prisma.dMMessage.findUnique({ where: { id: req.params.messageId } });
    if (!message) throw httpError(404, 'message_not_found');
    if (message.authorId !== req.user.id) throw httpError(403, 'not_message_author');
    const data = editMessageSchema.parse(req.body);
    const content = sanitizeContent(data.content);
    if (!content) throw httpError(400, 'empty_message');

    const updated = await prisma.dMMessage.update({
      where: { id: message.id },
      data: { content, editedAt: new Date() },
      include: DM_MESSAGE_INCLUDE,
    });
    const payload = serializeDmMessage(updated);
    const io = req.app.get('io');
    const members = await prisma.dMChannelMember.findMany({
      where: { dmChannelId: message.dmChannelId },
      select: { userId: true },
    });
    for (const m of members) io?.to(`user:${m.userId}`).emit('dm:message_updated', payload);
    res.json({ message: payload });
  } catch (err) {
    next(err);
  }
});

router.delete('/messages/:messageId', requireAuth, dmChatLimiter, async (req, res, next) => {
  try {
    const message = await prisma.dMMessage.findUnique({ where: { id: req.params.messageId } });
    if (!message) throw httpError(404, 'message_not_found');
    let canDelete = message.authorId === req.user.id;
    if (req.user.systemRole === 'CEO' || req.user.systemRole === 'MODERATOR') canDelete = true;
    if (!canDelete) throw httpError(403, 'not_message_author');

    // Find attachments to delete physically from disk
    const attachments = await prisma.attachment.findMany({
      where: { dmMessageId: message.id }
    });

    await prisma.dMMessage.delete({ where: { id: message.id } });

    // Delete physical files
    for (const att of attachments) {
      const filePath = path.join(UPLOAD_DIR, path.basename(att.url));
      fs.unlink(filePath).catch(() => {});
    }

    const io = req.app.get('io');
    const members = await prisma.dMChannelMember.findMany({
      where: { dmChannelId: message.dmChannelId },
      select: { userId: true },
    });
    for (const m of members)
      io?.to(`user:${m.userId}`).emit('dm:message_deleted', {
        id: message.id,
        dmChannelId: message.dmChannelId,
      });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.put('/messages/:messageId/reactions/:emoji', requireAuth, dmChatLimiter, async (req, res, next) => {
  try {
    const data = reactionSchema.parse({ emoji: decodeURIComponent(req.params.emoji) });
    const message = await prisma.dMMessage.findUnique({ where: { id: req.params.messageId } });
    if (!message) throw httpError(404, 'message_not_found');
    const { channelId } = await ensureDmMember(message.dmChannelId, req.user.id);
    const reaction = await prisma.reaction.upsert({
      where: {
        dmMessageId_userId_emoji: {
          dmMessageId: message.id,
          userId: req.user.id,
          emoji: data.emoji,
        },
      },
      update: {},
      create: { dmMessageId: message.id, userId: req.user.id, emoji: data.emoji },
    });
    const io = req.app.get('io');
    const members = await prisma.dMChannelMember.findMany({
      where: { dmChannelId: channelId },
      select: { userId: true },
    });
    for (const m of members)
      io?.to(`user:${m.userId}`).emit('dm:reaction_added', {
        dmMessageId: message.id,
        reaction: serializeReaction(reaction),
      });
    res.json({ reaction: serializeReaction(reaction) });
  } catch (err) {
    next(err);
  }
});

router.delete('/messages/:messageId/reactions/:emoji', requireAuth, dmChatLimiter, async (req, res, next) => {
  try {
    const emoji = decodeURIComponent(req.params.emoji);
    const message = await prisma.dMMessage.findUnique({ where: { id: req.params.messageId } });
    if (!message) throw httpError(404, 'message_not_found');
    const { channelId } = await ensureDmMember(message.dmChannelId, req.user.id);
    await prisma.reaction
      .delete({
        where: {
          dmMessageId_userId_emoji: {
            dmMessageId: message.id,
            userId: req.user.id,
            emoji,
          },
        },
      })
      .catch(() => {});
    const io = req.app.get('io');
    const members = await prisma.dMChannelMember.findMany({
      where: { dmChannelId: channelId },
      select: { userId: true },
    });
    for (const m of members)
      io?.to(`user:${m.userId}`).emit('dm:reaction_removed', {
        dmMessageId: message.id,
        userId: req.user.id,
        emoji,
      });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/:channelId/read', requireAuth, async (req, res, next) => {
  try {
    const { channelId } = await ensureDmMember(req.params.channelId, req.user.id);
    await prisma.dMChannelMember.update({
      where: { dmChannelId_userId: { dmChannelId: channelId, userId: req.user.id } },
      data: { lastReadAt: new Date() },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
