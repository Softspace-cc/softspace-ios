import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { httpError } from '../lib/errors.js';
import { createServerSchema, updateServerSchema, reorderChannelsSchema } from '../lib/validators.js';
import {
  serializeChannel,
  serializeMember,
  serializeRole,
  serializeServer,
} from '../lib/serializers.js';
import {
  ADMIN_PERMS,
  DEFAULT_MEMBER_PERMS,
  Permissions,
  channelPermissions,
  hasPermission,
} from '../lib/permissions.js';
import { getMembershipOrFail, requirePermission, joinVisibleChannelRooms } from '../lib/membership.js';

const router = Router();

async function removeUserFromServerSockets(io, serverId, userId) {
  if (!io || !serverId || !userId) return;

  const [userSockets, channels] = await Promise.all([
    io.in(`user:${userId}`).fetchSockets().catch(() => []),
    prisma.channel.findMany({
      where: { serverId },
      select: { id: true },
    }).catch(() => []),
  ]);

  for (const socket of userSockets) {
    socket.leave(`server:${serverId}`);
    for (const channel of channels) {
      socket.leave(`channel:${channel.id}`);
    }
  }
}

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const memberships = await prisma.serverMember.findMany({
      where: { userId: req.user.id },
      include: {
        roles: { include: { role: true } },
        server: {
          include: {
            channels: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
            roles: { orderBy: { position: 'desc' } },
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });
    const serialized = memberships.map((m) => serializeServer(m.server, { member: m }));
    console.log(`[GET /api/servers] Returning ${serialized.length} servers for user ${req.user.id}`);
    res.json({ servers: serialized });
  } catch (err) {
    next(err);
  }
});

router.get('/discover', requireAuth, async (req, res, next) => {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const whereClause = {
      isPublic: true,
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { description: { contains: query, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const publicServers = await prisma.serverGuild.findMany({
      where: whereClause,
      include: {
        channels: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
        _count: {
          select: { members: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ servers: publicServers.map(s => serializeServer(s)) });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const data = createServerSchema.parse(req.body);
    const server = await prisma.$transaction(async (tx) => {
      const created = await tx.serverGuild.create({
        data: {
          name: data.name.trim(),
          iconUrl: data.iconUrl ?? null,
          ownerId: req.user.id,
        },
      });

      const everyoneRole = await tx.role.create({
        data: {
          serverId: created.id,
          name: '@everyone',
          color: '#a89cd6',
          position: 0,
          permissions: DEFAULT_MEMBER_PERMS,
          isDefault: true,
        },
      });
      await tx.role.create({
        data: {
          serverId: created.id,
          name: 'Admin',
          color: '#ff7eb6',
          position: 10,
          permissions: ADMIN_PERMS,
          isDefault: false,
        },
      });

      const general = await tx.channel.create({
        data: {
          serverId: created.id,
          name: 'general',
          type: 'TEXT',
          position: 0,
          topic: 'Willkommen / Welcome',
        },
      });
      await tx.channel.create({
        data: {
          serverId: created.id,
          name: 'voice-lounge',
          type: 'VOICE',
          position: 1,
        },
      });

      const member = await tx.serverMember.create({
        data: { serverId: created.id, userId: req.user.id },
      });
      await tx.serverMemberRole.create({
        data: { memberId: member.id, roleId: everyoneRole.id },
      });

      return tx.serverGuild.findUnique({
        where: { id: created.id },
        include: {
          channels: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
          roles: { orderBy: { position: 'desc' } },
        },
      });
    });

    const io = req.app.get('io');
    if (io) {
      try {
        const userSockets = await io.in(`user:${req.user.id}`).fetchSockets();
        const member = await prisma.serverMember.findUnique({
          where: { userId_serverId: { userId: req.user.id, serverId: server.id } },
          include: { roles: { include: { role: true } } },
        });
        for (const socket of userSockets) {
          socket.join(`server:${server.id}`);
          if (member) joinVisibleChannelRooms(socket, member, server);
        }
      } catch (err) {
        console.error('[server] Failed to join socket rooms:', err);
      }
    }

    io?.to(`user:${req.user.id}`).emit('server:created', serializeServer(server));
    res.status(201).json({ server: serializeServer(server) });
  } catch (err) {
    next(err);
  }
});

router.get('/:serverId', requireAuth, async (req, res, next) => {
  try {
    const member = await getMembershipOrFail(req.user.id, req.params.serverId);
    const server = await prisma.serverGuild.findUnique({
      where: { id: req.params.serverId },
      include: {
        channels: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
        roles: { orderBy: { position: 'desc' } },
      },
    });
    if (!server) throw httpError(404, 'server_not_found');
    res.json({ server: serializeServer(server, { member }) });
  } catch (err) {
    next(err);
  }
});

router.patch('/:serverId', requireAuth, async (req, res, next) => {
  try {
    await requirePermission(req.user.id, req.params.serverId, Permissions.MANAGE_SERVER);
    const data = updateServerSchema.parse(req.body);
    const update = {};
    for (const key of ['name', 'description', 'iconUrl', 'bannerUrl', 'isPublic']) {
      if (key in data) update[key] = data[key];
    }
    if ('vanityUrl' in data) update.vanityUrl = data.vanityUrl?.toLowerCase() ?? null;

    const server = await prisma.serverGuild.update({
      where: { id: req.params.serverId },
      data: update,
      include: {
        channels: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
        roles: { orderBy: { position: 'desc' } },
      },
    });
    req.app.get('io')?.to(`server:${server.id}`).emit('server:updated', serializeServer(server));
    res.json({ server: serializeServer(server) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:serverId', requireAuth, async (req, res, next) => {
  try {
    const server = await prisma.serverGuild.findUnique({ where: { id: req.params.serverId } });
    if (!server) throw httpError(404, 'server_not_found');
    if (server.ownerId !== req.user.id && req.user.systemRole !== 'CEO') {
      throw httpError(403, 'only_owner_can_delete');
    }
    await prisma.serverGuild.delete({ where: { id: server.id } });
    req.app.get('io')?.to(`server:${server.id}`).emit('server:deleted', { serverId: server.id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/:serverId/leave', requireAuth, async (req, res, next) => {
  try {
    const server = await prisma.serverGuild.findUnique({ where: { id: req.params.serverId } });
    if (!server) throw httpError(404, 'server_not_found');
    if (server.ownerId === req.user.id)
      throw httpError(400, 'owner_cannot_leave', 'Transfer ownership or delete the server first.');
    await prisma.serverMember.delete({
      where: { userId_serverId: { userId: req.user.id, serverId: server.id } },
    });
    
    // Broadcast member left
    req.app.get('io')?.to(`server:${server.id}`).emit('server:member_left', { serverId: server.id, userId: req.user.id });
    
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/:serverId/join', requireAuth, async (req, res, next) => {
  try {
    const server = await prisma.serverGuild.findUnique({ 
      where: { id: req.params.serverId },
      include: {
        roles: true,
        channels: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] }
      }
    });
    if (!server) throw httpError(404, 'server_not_found');
    if (!server.isPublic && req.user.systemRole !== 'CEO') {
      throw httpError(403, 'server_not_public');
    }

    const existing = await prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: req.user.id, serverId: server.id } }
    });

    if (existing) {
      return res.json({ server: serializeServer(server, { member: existing }) });
    }

    const everyoneRole = server.roles?.find((r) => r.isDefault);
    
    const member = await prisma.serverMember.create({
      data: { serverId: server.id, userId: req.user.id },
      include: { roles: { include: { role: true } } }
    });

    if (everyoneRole) {
      await prisma.serverMemberRole.create({
        data: { memberId: member.id, roleId: everyoneRole.id },
      });
    }

    // Refresh member to include roles
    const memberWithRoles = await prisma.serverMember.findUnique({
      where: { id: member.id },
      include: { roles: { include: { role: true } } }
    });

    const io = req.app.get('io');
    if (io) {
      try {
        const userSockets = await io.in(`user:${req.user.id}`).fetchSockets();
        for (const socket of userSockets) {
          socket.join(`server:${server.id}`);
          if (memberWithRoles) joinVisibleChannelRooms(socket, memberWithRoles, server);
        }
        io.to(`server:${server.id}`).emit('server:member_joined', serializeMember(memberWithRoles));
      } catch (err) {
        console.error('[server] Failed to join socket rooms:', err);
      }
    }

    res.json({ server: serializeServer(server, { member: memberWithRoles }) });
  } catch (err) {
    next(err);
  }
});

router.get('/:serverId/members', requireAuth, async (req, res, next) => {
  try {
    await getMembershipOrFail(req.user.id, req.params.serverId);
    const members = await prisma.serverMember.findMany({
      where: { serverId: req.params.serverId },
      include: { user: true, roles: { include: { role: true } } },
      orderBy: { joinedAt: 'asc' },
      take: 500,
    });
    res.json({ members: members.map(serializeMember) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:serverId/members/:userId', requireAuth, async (req, res, next) => {
  try {
    await requirePermission(req.user.id, req.params.serverId, Permissions.KICK_MEMBERS);
    const target = await prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: req.params.userId, serverId: req.params.serverId } },
      include: { server: true },
    });
    if (!target) throw httpError(404, 'member_not_found');
    if (target.server.ownerId === req.params.userId) throw httpError(400, 'cannot_kick_owner');
    await prisma.serverMember.delete({ where: { id: target.id } });
    const io = req.app.get('io');
    io?.to(`server:${req.params.serverId}`)
      .emit('server:member_left', { serverId: req.params.serverId, userId: req.params.userId });
    io?.to(`user:${req.params.userId}`).emit('server:removed', {
      serverId: req.params.serverId,
      userId: req.params.userId,
      action: 'kick',
    });
    await removeUserFromServerSockets(io, req.params.serverId, req.params.userId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.put('/:serverId/members/:userId/moderation', requireAuth, async (req, res, next) => {
  try {
    // Determine which permissions are needed based on what is being updated
    const updates = {};
    if (req.body.isMuted !== undefined) {
      await requirePermission(req.user.id, req.params.serverId, Permissions.MANAGE_SERVER);
      updates.isMuted = Boolean(req.body.isMuted);
    }
    if (req.body.isDeafened !== undefined) {
      await requirePermission(req.user.id, req.params.serverId, Permissions.MANAGE_SERVER);
      updates.isDeafened = Boolean(req.body.isDeafened);
    }
    if (req.body.timeoutUntil !== undefined) {
      await requirePermission(req.user.id, req.params.serverId, Permissions.MANAGE_SERVER);
      updates.timeoutUntil = req.body.timeoutUntil ? new Date(req.body.timeoutUntil) : null;
    }

    const target = await prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: req.params.userId, serverId: req.params.serverId } },
      include: { server: true },
    });
    if (!target) throw httpError(404, 'member_not_found');
    if (target.server.ownerId === req.params.userId) throw httpError(400, 'cannot_mod_owner');

    const updated = await prisma.serverMember.update({
      where: { id: target.id },
      data: updates,
      include: { user: true, roles: { include: { role: true } } },
    });

    req.app.get('io')?.to(`server:${req.params.serverId}`).emit('server:member_updated', serializeMember(updated));
    res.json({ member: serializeMember(updated) });
  } catch (err) {
    next(err);
  }
});

router.post('/:serverId/bans/:userId', requireAuth, async (req, res, next) => {
  try {
    await requirePermission(req.user.id, req.params.serverId, Permissions.BAN_MEMBERS);
    const target = await prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: req.params.userId, serverId: req.params.serverId } },
      include: { server: true },
    });
    if (target && target.server.ownerId === req.params.userId) throw httpError(400, 'cannot_ban_owner');

    await prisma.$transaction(async (tx) => {
      await tx.serverBan.upsert({
        where: { serverId_userId: { serverId: req.params.serverId, userId: req.params.userId } },
        update: { reason: req.body.reason },
        create: { serverId: req.params.serverId, userId: req.params.userId, reason: req.body.reason },
      });
      if (target) {
        await tx.serverMember.delete({ where: { id: target.id } });
      }
    });

    const io = req.app.get('io');
    io?.to(`server:${req.params.serverId}`)
      .emit('server:member_left', { serverId: req.params.serverId, userId: req.params.userId });
    io?.to(`user:${req.params.userId}`).emit('server:removed', {
      serverId: req.params.serverId,
      userId: req.params.userId,
      action: 'ban',
    });
    await removeUserFromServerSockets(io, req.params.serverId, req.params.userId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.put('/:serverId/channels/reorder', requireAuth, async (req, res, next) => {
  try {
    await requirePermission(req.user.id, req.params.serverId, Permissions.MANAGE_CHANNELS);
    const { items } = reorderChannelsSchema.parse(req.body ?? {});

    const ids = items.map((i) => i.id);
    const existing = await prisma.channel.findMany({
      where: { serverId: req.params.serverId, id: { in: ids } },
    });
    if (existing.length !== ids.length) throw httpError(400, 'invalid_channel_ids');

    const categoryIds = new Set(
      existing.filter((c) => c.type === 'CATEGORY').map((c) => c.id)
    );
    for (const item of items) {
      const ch = existing.find((c) => c.id === item.id);
      if (!ch) continue;
      if (item.parentId) {
        if (!categoryIds.has(item.parentId)) throw httpError(400, 'invalid_parent');
        if (ch.type === 'CATEGORY') throw httpError(400, 'category_cannot_be_nested');
      }
    }

    await prisma.$transaction(
      items.map((item) =>
        prisma.channel.update({
          where: { id: item.id },
          data: { position: item.position, parentId: item.parentId },
        })
      )
    );

    const updated = await prisma.channel.findMany({
      where: { serverId: req.params.serverId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });

    const io = req.app.get('io');
    for (const channel of updated) {
      io?.to(`server:${req.params.serverId}`).emit('channel:updated', serializeChannel(channel));
    }

    res.json({ channels: updated.map(serializeChannel) });
  } catch (err) {
    next(err);
  }
});

router.post('/:serverId/channels', requireAuth, async (req, res, next) => {
  try {
    await requirePermission(req.user.id, req.params.serverId, Permissions.MANAGE_CHANNELS);
    const { createChannelSchema } = await import('../lib/validators.js');
    const data = createChannelSchema.parse(req.body);
    const last = await prisma.channel.findFirst({
      where: { serverId: req.params.serverId },
      orderBy: { position: 'desc' },
    });
    const channel = await prisma.channel.create({
      data: {
        serverId: req.params.serverId,
        name: data.name.toLowerCase(),
        type: data.type,
        topic: data.topic ?? null,
        parentId: data.parentId ?? null,
        position: (last?.position ?? -1) + 1,
      },
    });
    const io = req.app.get('io');
    if (io) {
      try {
        const [sockets, members, serverWithRoles] = await Promise.all([
          io.in(`server:${req.params.serverId}`).fetchSockets(),
          prisma.serverMember.findMany({
            where: { serverId: req.params.serverId },
            include: { roles: { include: { role: true } } },
          }),
          prisma.serverGuild.findUnique({
            where: { id: req.params.serverId },
            include: { roles: true },
          }),
        ]);
        for (const s of sockets) {
          const member = members.find((m) => m.userId === s.data.userId);
          if (!member || !serverWithRoles) continue;
          const perms = channelPermissions(member, serverWithRoles, channel);
          if (hasPermission(perms, Permissions.VIEW_CHANNELS)) {
            s.join(`channel:${channel.id}`);
          }
        }
      } catch (err) {
        console.error('[channel] Failed to join socket rooms:', err);
      }
    }

    io?.to(`server:${req.params.serverId}`)
      .emit('channel:created', serializeChannel(channel));
    res.status(201).json({ channel: serializeChannel(channel) });
  } catch (err) {
    next(err);
  }
});

// Create server role
router.post('/:serverId/roles', requireAuth, async (req, res, next) => {
  try {
    await requirePermission(req.user.id, req.params.serverId, Permissions.MANAGE_ROLES);
    const lastRole = await prisma.role.findFirst({
      where: { serverId: req.params.serverId },
      orderBy: { position: 'desc' },
    });
    const newPosition = (lastRole?.position ?? 0) + 1;
    const role = await prisma.role.create({
      data: {
        serverId: req.params.serverId,
        name: req.body.name?.trim() || 'New Role',
        color: req.body.color || '#c9a8ff',
        position: newPosition,
        permissions: req.body.permissions ? BigInt(req.body.permissions) : DEFAULT_MEMBER_PERMS,
        isDefault: false,
      },
    });

    const server = await prisma.serverGuild.findUnique({
      where: { id: req.params.serverId },
      include: {
        channels: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
        roles: { orderBy: { position: 'desc' } },
      },
    });

    req.app.get('io')?.to(`server:${req.params.serverId}`).emit('server:updated', serializeServer(server));
    res.status(201).json({ role: serializeRole(role) });
  } catch (err) {
    next(err);
  }
});

// Update server role
router.patch('/:serverId/roles/:roleId', requireAuth, async (req, res, next) => {
  try {
    await requirePermission(req.user.id, req.params.serverId, Permissions.MANAGE_ROLES);
    const role = await prisma.role.findFirst({
      where: { id: req.params.roleId, serverId: req.params.serverId },
    });
    if (!role) throw httpError(404, 'role_not_found');

    const update = {};
    if ('name' in req.body && !role.isDefault) {
      update.name = req.body.name.trim();
    }
    if ('color' in req.body) {
      update.color = req.body.color;
    }
    if ('position' in req.body) {
      update.position = parseInt(req.body.position, 10);
    }
    if ('permissions' in req.body) {
      update.permissions = BigInt(req.body.permissions);
    }

    await prisma.role.update({
      where: { id: role.id },
      data: update,
    });

    const updatedRole = await prisma.role.findUnique({ where: { id: role.id } });

    const server = await prisma.serverGuild.findUnique({
      where: { id: req.params.serverId },
      include: {
        channels: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
        roles: { orderBy: { position: 'desc' } },
      },
    });

    req.app.get('io')?.to(`server:${req.params.serverId}`).emit('server:updated', serializeServer(server));
    res.json({ role: serializeRole(updatedRole) });
  } catch (err) {
    next(err);
  }
});

// Delete server role
router.delete('/:serverId/roles/:roleId', requireAuth, async (req, res, next) => {
  try {
    await requirePermission(req.user.id, req.params.serverId, Permissions.MANAGE_ROLES);
    const role = await prisma.role.findFirst({
      where: { id: req.params.roleId, serverId: req.params.serverId },
    });
    if (!role) throw httpError(404, 'role_not_found');
    if (role.isDefault) throw httpError(400, 'cannot_delete_default_role');

    await prisma.role.delete({
      where: { id: role.id },
    });

    const server = await prisma.serverGuild.findUnique({
      where: { id: req.params.serverId },
      include: {
        channels: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
        roles: { orderBy: { position: 'desc' } },
      },
    });

    req.app.get('io')?.to(`server:${req.params.serverId}`).emit('server:updated', serializeServer(server));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Assign roles to member
router.put('/:serverId/members/:userId/roles', requireAuth, async (req, res, next) => {
  try {
    await requirePermission(req.user.id, req.params.serverId, Permissions.MANAGE_ROLES);

    const member = await prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: req.params.userId, serverId: req.params.serverId } },
    });
    if (!member) throw httpError(404, 'member_not_found');

    const roleIds = Array.isArray(req.body.roleIds) ? req.body.roleIds : [];
    const validRoles = await prisma.role.findMany({
      where: {
        id: { in: roleIds },
        serverId: req.params.serverId,
        isDefault: false,
      },
    });

    await prisma.$transaction(async (tx) => {
      const everyoneRole = await tx.role.findFirst({
        where: { serverId: req.params.serverId, isDefault: true },
      });

      await tx.serverMemberRole.deleteMany({
        where: { memberId: member.id },
      });

      const rolesToCreate = validRoles.map((r) => ({
        memberId: member.id,
        roleId: r.id,
      }));

      if (everyoneRole) {
        rolesToCreate.push({
          memberId: member.id,
          roleId: everyoneRole.id,
        });
      }

      await tx.serverMemberRole.createMany({
        data: rolesToCreate,
      });
    });

    const updatedMember = await prisma.serverMember.findUnique({
      where: { id: member.id },
      include: { user: true, roles: { include: { role: true } } },
    });

    req.app.get('io')?.to(`server:${req.params.serverId}`).emit('server:member_updated', serializeMember(updatedMember));
    res.json({ member: serializeMember(updatedMember) });
  } catch (err) {
    next(err);
  }
});

export default router;
