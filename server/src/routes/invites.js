import { Router } from 'express';
import { customAlphabet } from 'nanoid';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { httpError } from '../lib/errors.js';
import { createInviteSchema } from '../lib/validators.js';
import { serializeInvite, serializeServer, serializeMember } from '../lib/serializers.js';
import { Permissions } from '../lib/permissions.js';
import { requirePermission, joinVisibleChannelRooms } from '../lib/membership.js';

const router = Router();
const inviteCode = customAlphabet('abcdefghjkmnpqrstuvwxyz23456789', 8);

router.post('/servers/:serverId/invites', requireAuth, async (req, res, next) => {
  try {
    await requirePermission(req.user.id, req.params.serverId, Permissions.CREATE_INVITES);
    const data = createInviteSchema.parse(req.body ?? {});
    const code = inviteCode();
    const expiresAt = data.expiresInHours
      ? new Date(Date.now() + data.expiresInHours * 60 * 60 * 1000)
      : null;
    const invite = await prisma.invite.create({
      data: {
        code,
        serverId: req.params.serverId,
        creatorId: req.user.id,
        expiresAt,
        maxUses: data.maxUses && data.maxUses > 0 ? data.maxUses : null,
      },
    });
    res.status(201).json({ invite: serializeInvite(invite) });
  } catch (err) {
    next(err);
  }
});

router.get('/servers/:serverId/invites', requireAuth, async (req, res, next) => {
  try {
    await requirePermission(req.user.id, req.params.serverId, Permissions.MANAGE_SERVER);
    const invites = await prisma.invite.findMany({
      where: { serverId: req.params.serverId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ invites: invites.map(serializeInvite) });
  } catch (err) {
    next(err);
  }
});

router.get('/invites/:code', async (req, res, next) => {
  try {
    const invite = await prisma.invite.findUnique({
      where: { code: req.params.code },
      include: {
        server: {
          include: {
            _count: { select: { members: true } },
          },
        },
      },
    });
    if (!invite) throw httpError(404, 'invite_not_found');
    if (invite.expiresAt && invite.expiresAt < new Date())
      throw httpError(410, 'invite_expired');
    if (invite.maxUses && invite.uses >= invite.maxUses)
      throw httpError(410, 'invite_used_up');

    res.json({
      invite: {
        code: invite.code,
        expiresAt: invite.expiresAt,
        memberCount: invite.server._count.members,
        server: {
          id: invite.server.id,
          name: invite.server.name,
          iconUrl: invite.server.iconUrl,
          bannerUrl: invite.server.bannerUrl,
          description: invite.server.description,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/invites/:code/use', requireAuth, async (req, res, next) => {
  try {
    const invite = await prisma.invite.findUnique({
      where: { code: req.params.code },
      include: { server: { include: { roles: true } } },
    });
    if (!invite) throw httpError(404, 'invite_not_found');
    if (invite.expiresAt && invite.expiresAt < new Date())
      throw httpError(410, 'invite_expired');
    if (invite.maxUses && invite.uses >= invite.maxUses)
      throw httpError(410, 'invite_used_up');

    const existing = await prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: req.user.id, serverId: invite.serverId } },
      include: { roles: { include: { role: true } } },
    });
    if (existing) {
      const everyoneRole = invite.server.roles.find((r) => r.isDefault);
      if (everyoneRole) {
        const hasEveryone = existing.roles.some((mr) => mr.roleId === everyoneRole.id);
        if (!hasEveryone) {
          await prisma.serverMemberRole.create({
            data: { memberId: existing.id, roleId: everyoneRole.id },
          });
        }
      }
      const server = await prisma.serverGuild.findUnique({
        where: { id: invite.serverId },
        include: {
          channels: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
          roles: { orderBy: { position: 'desc' } },
        },
      });
      const memberWithRoles = await prisma.serverMember.findUnique({
        where: { id: existing.id },
        include: { roles: { include: { role: true } } },
      });
      return res.json({
        server: serializeServer(server, { member: memberWithRoles }),
        alreadyMember: true,
      });
    }

    const everyoneRole = invite.server.roles.find((r) => r.isDefault);
    const result = await prisma.$transaction(async (tx) => {
      const member = await tx.serverMember.create({
        data: { userId: req.user.id, serverId: invite.serverId },
      });
      if (everyoneRole) {
        await tx.serverMemberRole.create({
          data: { memberId: member.id, roleId: everyoneRole.id },
        });
      }
      await tx.invite.update({
        where: { code: invite.code },
        data: { uses: { increment: 1 } },
      });
      const memberWithUser = await tx.serverMember.findUnique({
        where: { id: member.id },
        include: { user: true, roles: { include: { role: true } } },
      });
      const server = await tx.serverGuild.findUnique({
        where: { id: invite.serverId },
        include: {
          channels: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
          roles: { orderBy: { position: 'desc' } },
        },
      });
      return { server, member: memberWithUser };
    });

    const io = req.app.get('io');
    if (io) {
      try {
        const userSockets = await io.in(`user:${req.user.id}`).fetchSockets();
        for (const socket of userSockets) {
          socket.join(`server:${invite.serverId}`);
          joinVisibleChannelRooms(socket, result.member, result.server);
        }
      } catch (err) {
        console.error('[invite] Failed to join socket rooms:', err);
      }
    }

    io?.to(`user:${req.user.id}`).emit('server:created', serializeServer(result.server, { member: result.member }));
    io?.to(`server:${invite.serverId}`).emit('server:member_joined', {
      serverId: invite.serverId,
      member: serializeMember(result.member),
    });
    res.status(201).json({ server: serializeServer(result.server, { member: result.member }) });
  } catch (err) {
    next(err);
  }
});

router.delete('/invites/:code', requireAuth, async (req, res, next) => {
  try {
    const invite = await prisma.invite.findUnique({ where: { code: req.params.code } });
    if (!invite) throw httpError(404, 'invite_not_found');
    await requirePermission(req.user.id, invite.serverId, Permissions.MANAGE_SERVER);
    await prisma.invite.delete({ where: { code: invite.code } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
