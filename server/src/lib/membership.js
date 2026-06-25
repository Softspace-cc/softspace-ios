import prisma from './prisma.js';
import { httpError } from './errors.js';
import { hasPermission, memberPermissions, Permissions, channelPermissions, visibleChannels } from './permissions.js';

export async function getMembershipOrFail(userId, serverId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { systemRole: true } });
  
  const member = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId, serverId } },
    include: {
      roles: { include: { role: true } },
      server: { select: { id: true, ownerId: true } },
    },
  });

  if (!member && user?.systemRole !== 'CEO') {
    throw httpError(403, 'not_a_member');
  }

  // Mock member object for CEO if they aren't in the server
  if (!member && user?.systemRole === 'CEO') {
    const server = await prisma.serverGuild.findUnique({ where: { id: serverId }, select: { id: true, ownerId: true } });
    if (!server) throw httpError(404, 'server_not_found');
    return {
      userId,
      serverId,
      roles: [],
      server,
      isCEO: true
    };
  }

  if (member && user?.systemRole === 'CEO') {
    member.isCEO = true;
  }

  return member;
}

export async function requirePermission(userId, serverId, permission) {
  const member = await getMembershipOrFail(userId, serverId);
  if (member.isCEO) return { member, perms: BigInt(-1) }; // Max permissions
  const perms = memberPermissions(member, member.server);
  if (!hasPermission(perms, permission)) throw httpError(403, 'missing_permission');
  return { member, perms };
}

export async function getChannelOrFail(channelId) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: {
      server: {
        select: { id: true, ownerId: true, roles: true },
      },
    },
  });
  if (!channel) throw httpError(404, 'channel_not_found');
  return channel;
}

export async function getMessageOrFail(messageId) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: {
      channel: {
        include: {
          server: {
            select: { id: true, ownerId: true, roles: true },
          },
        },
      },
    },
  });
  if (!message) throw httpError(404, 'message_not_found');
  return message;
}

/** Join socket.io rooms for channels the member can view. */
export function joinVisibleChannelRooms(socket, member, server) {
  for (const channel of visibleChannels(member, server, server.channels ?? [])) {
    socket.join(`channel:${channel.id}`);
  }
}

export { Permissions };
