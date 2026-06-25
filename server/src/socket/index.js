import { Server as IOServer } from 'socket.io';
import prisma from '../lib/prisma.js';
import { verifyToken } from '../lib/auth.js';
import { publicUser } from '../lib/serializers.js';
import { registerVoiceHandlers, voiceState, handleVoiceSocketDisconnect } from './voice.js';
import { channelPermissions, hasPermission, Permissions } from '../lib/permissions.js';
import { joinVisibleChannelRooms } from '../lib/membership.js';
import { ensureUserIsNotPlatformBanned } from '../lib/platformBans.js';
import {
  addUserSocket,
  removeUserSocket,
  isUserOnline,
  onlineUserIds,
  getUserPlatform,
  normalizeClientPlatform,
} from '../lib/presenceState.js';

export function createSocketServer(httpServer, { clientOrigin }) {
  const io = new IOServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (origin.startsWith('file://')) return callback(null, true);
        if (
          origin === 'http://localhost' ||
          origin === 'https://localhost' ||
          origin.startsWith('capacitor://')
        ) {
          return callback(null, true);
        }
        const allowedOrigins = clientOrigin === '*' ? true : clientOrigin?.split(',').map((o) => o.trim());
        if (allowedOrigins === true || allowedOrigins.indexOf(origin) !== -1) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
    },
    maxHttpBufferSize: 5 * 1024 * 1024,
    pingInterval: 25_000,
    pingTimeout: 30_000,
  });

  io.use(async (socket, next) => {
    try {
      const isQrLogin =
        socket.handshake.query?.qrLogin === 'true' ||
        socket.handshake.auth?.qrLogin === true ||
        socket.handshake.auth?.qrLogin === 'true';

      if (isQrLogin) {
        socket.data.isQrLogin = true;
        return next();
      }

      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');
      if (!token) return next(new Error('unauthenticated'));
      const payload = verifyToken(token);
      if (!payload?.sub) return next(new Error('invalid_token'));
      const session = await prisma.session.findUnique({
        where: { token },
        include: { user: true },
      });
      if (!session || session.expiresAt < new Date()) return next(new Error('session_expired'));
      const { user, ban } = await ensureUserIsNotPlatformBanned(session.user);
      if (ban) {
        await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
        return next(new Error('account_banned'));
      }
      socket.data.userId = session.user.id;
      socket.data.user = user;
      next();
    } catch (e) {
      next(new Error('socket_auth_failed'));
    }
  });

  io.on('connection', async (socket) => {
    if (socket.data.isQrLogin) {
      // Unauthenticated socket just for QR login. Do not execute normal logic.
      return;
    }

    const userId = socket.data.userId;
    const clientPlatform = normalizeClientPlatform(
      socket.handshake.auth?.platform || socket.handshake.query?.platform
    );

    addUserSocket(userId, socket.id, clientPlatform);
    socket.join(`user:${userId}`);

    // Join all servers and DMs the user belongs to
    try {
      const [memberships, dmMemberships] = await Promise.all([
        prisma.serverMember.findMany({
          where: { userId },
          include: {
            roles: { include: { role: true } },
            server: {
              include: {
                roles: true,
                channels: true,
              },
            },
          },
        }),
        prisma.dMChannelMember.findMany({ where: { userId }, select: { dmChannelId: true } }),
      ]);
      for (const m of memberships) {
        socket.join(`server:${m.serverId}`);
        joinVisibleChannelRooms(socket, m, m.server);
      }
      for (const m of dmMemberships) socket.join(`dm:${m.dmChannelId}`);

      // Always restore status back to online if they reconnect from an offline state
      const user = await prisma.user.findUnique({ where: { id: userId } });
      const newStatus = user.status; // Keep their preferred status!
      
      await prisma.user.update({
        where: { id: userId },
        data: { lastSeenAt: new Date() },
      });

      // Broadcast presence to all servers this user is part of
      for (const m of memberships) {
        io.to(`server:${m.serverId}`).emit('presence:update', {
          userId,
          status: newStatus === 'invisible' ? 'offline' : newStatus,
          customStatus: user.customStatus,
          activities: user.activities,
          platform: getUserPlatform(userId),
        });
      }
    } catch (e) {
      console.error('[socket] join error', e);
    }

    socket.emit('ready', {
      userId,
      onlineFriends: onlineUserIds(),
      voiceStates: voiceState.snapshot(),
      callSessions: voiceState.callSessionsSnapshot(),
    });

    // Typing indicator (server channel) — requires view + send permission
    socket.on('typing:start', async ({ channelId }) => {
      if (!channelId) return;
      try {
        const channel = await prisma.channel.findUnique({
          where: { id: channelId },
          include: { server: { include: { roles: true } } },
        });
        if (!channel || channel.type !== 'TEXT') return;
        const member = await prisma.serverMember.findUnique({
          where: { userId_serverId: { userId, serverId: channel.serverId } },
          include: { roles: { include: { role: true } } },
        });
        if (!member) return;
        const perms = channelPermissions(member, channel.server, channel);
        if (!hasPermission(perms, Permissions.VIEW_CHANNELS)) return;
        if (!hasPermission(perms, Permissions.SEND_MESSAGES)) return;
        socket.to(`channel:${channelId}`).emit('typing:start', { channelId, userId });
      } catch {}
    });
    socket.on('typing:stop', ({ channelId }) => {
      if (!channelId) return;
      socket.to(`channel:${channelId}`).emit('typing:stop', { channelId, userId });
    });

    // Typing indicator (DM)
    socket.on('dm:typing:start', ({ channelId }) => {
      if (!channelId) return;
      socket.to(`dm:${channelId}`).emit('dm:typing:start', { channelId, userId });
    });
    socket.on('dm:typing:stop', ({ channelId }) => {
      if (!channelId) return;
      socket.to(`dm:${channelId}`).emit('dm:typing:stop', { channelId, userId });
    });

    // Manual presence update (status change)
    socket.on('presence:set', async ({ status, customStatus, activities }) => {
      const allowed = ['online', 'idle', 'dnd', 'invisible', 'offline'];
      if (!allowed.includes(status)) return;

      let safeActivities = activities ?? null;
      if (safeActivities && typeof safeActivities === 'string' && safeActivities.length > 200000) {
        safeActivities = null;
      }

      const updated = await prisma.user.update({
        where: { id: userId },
        data: {
          status,
          ...(customStatus !== undefined ? { customStatus: customStatus ?? null } : {}),
          ...(activities !== undefined ? { activities: safeActivities } : {}),
        },
      });
      const memberships = await prisma.serverMember.findMany({
        where: { userId },
        select: { serverId: true },
      });
      for (const m of memberships) {
        io.to(`server:${m.serverId}`).emit('presence:update', {
          userId,
          status: updated.status === 'invisible' ? 'offline' : updated.status,
          customStatus: updated.customStatus,
          activities: updated.activities,
          platform: getUserPlatform(userId),
        });
      }
    });

    socket.on('user:profile_request', async ({ userId: targetId }, ack) => {
      if (typeof ack !== 'function') return;
      const user = await prisma.user.findUnique({ where: { id: targetId } });
      ack(publicUser(user));
    });

    registerVoiceHandlers(io, socket);

    socket.on('disconnect', async () => {
      const wasDesktop = clientPlatform === 'desktop';
      const lastSocket = removeUserSocket(userId, socket.id);
      await handleVoiceSocketDisconnect(io, socket);
      
      const currentPlatform = getUserPlatform(userId);
      const noLongerDesktop = wasDesktop && currentPlatform !== 'desktop';

      // Give the client a tiny window to reconnect (e.g. page refresh) before broadcasting offline
      if (lastSocket || noLongerDesktop) {
        setTimeout(async () => {
          const isOffline = !isUserOnline(userId);
          // Check again if they really are still offline after 2 seconds
          if (!isOffline && getUserPlatform(userId) === 'desktop') return;

          try {
            // Check their current custom status
            const user = await prisma.user.findUnique({ where: { id: userId } });
            let safeCustomStatus = user?.customStatus;
            let safeActivities = user?.activities;
            
            const isRpcCustomStatus = safeCustomStatus && (
              safeCustomStatus.startsWith('{') ||
              safeCustomStatus.startsWith('Playing: ') ||
              safeCustomStatus.startsWith('Using: ') ||
              safeCustomStatus.startsWith('Listening to: ')
            );

            const shouldClearActivities = isRpcCustomStatus || safeActivities;

            if (shouldClearActivities) {
              safeCustomStatus = isRpcCustomStatus ? null : safeCustomStatus;
              safeActivities = null;
              await prisma.user.update({
                where: { id: userId },
                data: { lastSeenAt: new Date(), customStatus: safeCustomStatus, activities: null },
              });
            } else if (isOffline) {
              await prisma.user.update({
                where: { id: userId },
                data: { lastSeenAt: new Date() },
              });
            }

            if (isOffline || shouldClearActivities) {
              const memberships = await prisma.serverMember.findMany({
                where: { userId },
                select: { serverId: true },
              });
              for (const m of memberships) {
                io.to(`server:${m.serverId}`).emit('presence:update', {
                  userId,
                  status: isOffline ? 'offline' : (user?.status === 'invisible' ? 'offline' : user?.status),
                  customStatus: safeCustomStatus,
                  activities: null,
                  platform: isOffline ? null : getUserPlatform(userId),
                });
              }
            }
          } catch {}
        }, 2000);
      }
    });
  });

  return io;
}
