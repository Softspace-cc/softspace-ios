import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { httpError } from '../lib/errors.js';
import { friendRequestSchema } from '../lib/validators.js';
import { serializeFriendship, publicUser } from '../lib/serializers.js';

const router = Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [{ requesterId: req.user.id }, { recipientId: req.user.id }],
      },
      include: { requester: true, recipient: true },
      orderBy: { updatedAt: 'desc' },
    });
    res.json({
      friendships: friendships.map((f) => serializeFriendship(f, req.user.id)),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/mutual/:userId', requireAuth, async (req, res, next) => {
  try {
    const targetUserId = req.params.userId;
    if (targetUserId === req.user.id) {
      return res.json({ mutualFriends: [] });
    }

    const myFriendships = await prisma.friendship.findMany({
      where: {
        OR: [{ requesterId: req.user.id }, { recipientId: req.user.id }],
        status: 'ACCEPTED',
      },
    });

    const myFriendIds = new Set(
      myFriendships.map(f => (f.requesterId === req.user.id ? f.recipientId : f.requesterId))
    );

    const targetFriendships = await prisma.friendship.findMany({
      where: {
        OR: [{ requesterId: targetUserId }, { recipientId: targetUserId }],
        status: 'ACCEPTED',
      },
    });

    const targetFriendIds = new Set(
      targetFriendships.map(f => (f.requesterId === targetUserId ? f.recipientId : f.requesterId))
    );

    const mutualIds = [...myFriendIds].filter(id => targetFriendIds.has(id));

    const mutualUsers = await prisma.user.findMany({
      where: {
        id: { in: mutualIds },
      },
    });

    res.json({ mutualFriends: mutualUsers.map(publicUser) });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { username } = friendRequestSchema.parse(req.body);
    const target = await prisma.user.findUnique({ where: { username: username.toLowerCase() } });
    if (!target) throw httpError(404, 'user_not_found');
    if (target.id === req.user.id) throw httpError(400, 'cannot_friend_self');

    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: req.user.id, recipientId: target.id },
          { requesterId: target.id, recipientId: req.user.id },
        ],
      },
    });
    if (existing) {
      if (existing.status === 'BLOCKED') throw httpError(403, 'blocked');
      if (existing.status === 'ACCEPTED') throw httpError(409, 'already_friends');
      if (existing.recipientId === req.user.id && existing.status === 'PENDING') {
        // Auto-accept reverse request
        const updated = await prisma.friendship.update({
          where: { id: existing.id },
          data: { status: 'ACCEPTED' },
          include: { requester: true, recipient: true },
        });
        req.app.get('io')?.to(`user:${updated.requesterId}`)
          .emit('friend:updated', serializeFriendship(updated, updated.requesterId));
        req.app.get('io')?.to(`user:${updated.recipientId}`)
          .emit('friend:updated', serializeFriendship(updated, updated.recipientId));
        return res.status(200).json({
          friendship: serializeFriendship(updated, req.user.id),
        });
      }
      throw httpError(409, 'request_already_pending');
    }

    const friendship = await prisma.friendship.create({
      data: {
        requesterId: req.user.id,
        recipientId: target.id,
        status: 'PENDING',
      },
      include: { requester: true, recipient: true },
    });
    req.app.get('io')?.to(`user:${target.id}`)
      .emit('friend:incoming', serializeFriendship(friendship, target.id));
    req.app.get('io')?.to(`user:${req.user.id}`)
      .emit('friend:outgoing', serializeFriendship(friendship, req.user.id));
    res.status(201).json({ friendship: serializeFriendship(friendship, req.user.id) });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/accept', requireAuth, async (req, res, next) => {
  try {
    const friendship = await prisma.friendship.findUnique({ where: { id: req.params.id } });
    if (!friendship) throw httpError(404, 'not_found');
    if (friendship.recipientId !== req.user.id) throw httpError(403, 'forbidden');
    if (friendship.status !== 'PENDING') throw httpError(400, 'invalid_state');
    const updated = await prisma.friendship.update({
      where: { id: friendship.id },
      data: { status: 'ACCEPTED' },
      include: { requester: true, recipient: true },
    });
    req.app.get('io')?.to(`user:${updated.requesterId}`)
      .emit('friend:updated', serializeFriendship(updated, updated.requesterId));
    req.app.get('io')?.to(`user:${updated.recipientId}`)
      .emit('friend:updated', serializeFriendship(updated, updated.recipientId));
    res.json({ friendship: serializeFriendship(updated, req.user.id) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const friendship = await prisma.friendship.findUnique({ where: { id: req.params.id } });
    if (!friendship) throw httpError(404, 'not_found');
    if (friendship.requesterId !== req.user.id && friendship.recipientId !== req.user.id)
      throw httpError(403, 'forbidden');
    await prisma.friendship.delete({ where: { id: friendship.id } });
    req.app.get('io')?.to(`user:${friendship.requesterId}`)
      .emit('friend:removed', { id: friendship.id });
    req.app.get('io')?.to(`user:${friendship.recipientId}`)
      .emit('friend:removed', { id: friendship.id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/block', requireAuth, async (req, res, next) => {
  try {
    const friendship = await prisma.friendship.findUnique({ where: { id: req.params.id } });
    if (!friendship) throw httpError(404, 'not_found');
    if (friendship.requesterId !== req.user.id && friendship.recipientId !== req.user.id)
      throw httpError(403, 'forbidden');
    const updated = await prisma.friendship.update({
      where: { id: friendship.id },
      data: { status: 'BLOCKED' },
      include: { requester: true, recipient: true },
    });
    res.json({ friendship: serializeFriendship(updated, req.user.id) });
  } catch (err) {
    next(err);
  }
});

export default router;
