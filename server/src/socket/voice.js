// Voice/Video signaling for WebRTC mesh peer connections.
// The server only routes signaling messages (offer, answer, ICE candidates) and
// tracks who is connected to which voice channel. Media is peer-to-peer.

import prisma from '../lib/prisma.js';
import { serializeDmMessage } from '../lib/serializers.js';

const DM_MESSAGE_INCLUDE = {
  author: true,
  reactions: true,
  attachments: true,
  replyTo: { include: { author: true } },
};

class VoiceState {
  constructor() {
    // channelId -> Map<userId, { socketId, muted, deafened, video, screen, joinedAt }>
    this.channels = new Map();
    // socketId -> { channelId, userId }
    this.sockets = new Map();
    // channelId -> { startedBy, startedAt, user }
    this.callSessions = new Map();
  }

  snapshot() {
    const out = {};
    for (const [channelId, members] of this.channels) {
      out[channelId] = [...members.entries()].map(([userId, info]) => ({
        userId,
        muted: info.muted,
        deafened: info.deafened,
        video: info.video,
        screen: info.screen,
        joinedAt: info.joinedAt,
        user: info.user ?? null,
      }));
    }
    return out;
  }

  callSessionsSnapshot() {
    const out = {};
    for (const [channelId, session] of this.callSessions) {
      out[channelId] = session;
    }
    return out;
  }

  channelMembers(channelId) {
    const members = this.channels.get(channelId);
    if (!members) return [];
    return [...members.entries()].map(([userId, info]) => ({
      userId,
      socketId: info.socketId,
      muted: info.muted,
      deafened: info.deafened,
      video: info.video,
      screen: info.screen,
      user: info.user ?? null,
    }));
  }

  join(channelId, userId, socketId, user) {
    if (!this.channels.has(channelId)) this.channels.set(channelId, new Map());
    const map = this.channels.get(channelId);
    map.set(userId, {
      socketId,
      muted: false,
      deafened: false,
      video: false,
      screen: false,
      joinedAt: new Date().toISOString(),
      user: user ?? null,
    });
    this.sockets.set(socketId, { channelId, userId });
  }

  leaveBySocket(socketId) {
    const info = this.sockets.get(socketId);
    if (!info) return null;
    this.sockets.delete(socketId);
    const map = this.channels.get(info.channelId);
    if (!map) return info;
    map.delete(info.userId);
    if (map.size === 0) this.channels.delete(info.channelId);
    return info;
  }

  leaveChannel(channelId) {
    const map = this.channels.get(channelId);
    if (!map) return [];
    const left = [];
    for (const [userId, info] of map.entries()) {
      this.sockets.delete(info.socketId);
      left.push({ userId, socketId: info.socketId });
    }
    this.channels.delete(channelId);
    return left;
  }

  setFlag(socketId, flag, value) {
    const info = this.sockets.get(socketId);
    if (!info) return null;
    const map = this.channels.get(info.channelId);
    if (!map) return null;
    const member = map.get(info.userId);
    if (!member) return null;
    member[flag] = !!value;
    return info;
  }

  getMember(channelId, userId) {
    return this.channels.get(channelId)?.get(userId) ?? null;
  }

  purgeStaleMembers(io, channelId) {
    const map = this.channels.get(channelId);
    if (!map) return;
    for (const [userId, info] of [...map.entries()]) {
      if (!io.sockets.sockets.has(info.socketId)) {
        map.delete(userId);
        this.sockets.delete(info.socketId);
      }
    }
    if (map.size === 0) {
      this.channels.delete(channelId);
      this.callSessions.delete(channelId);
    }
  }

  disconnect(io, socket) {
    const info = this.leaveBySocket(socket.id);
    if (!info) return null;
    io.to(`voice:${info.channelId}`).emit('voice:peer_left', {
      channelId: info.channelId,
      userId: info.userId,
    });
    socket.leave(`voice:${info.channelId}`);
    return info;
  }
}

export const voiceState = new VoiceState();

function mapMembersForBroadcast(channelId) {
  return voiceState.channelMembers(channelId).map((m) => ({
    userId: m.userId,
    muted: m.muted,
    deafened: m.deafened,
    video: m.video,
    screen: m.screen,
    user: m.user,
  }));
}

function getCallSessionPayload(channelId) {
  const session = voiceState.callSessions.get(channelId);
  if (!session) return null;
  return {
    startedBy: session.startedBy,
    startedAt: session.startedAt,
    user: session.user ?? null,
  };
}

function broadcastVoiceState(io, channelId, { isDm = false, serverId = null } = {}) {
  const payload = {
    channelId,
    members: mapMembersForBroadcast(channelId),
    session: getCallSessionPayload(channelId),
  };
  if (serverId) {
    io.to(`server:${serverId}`).emit('voice:state_update', payload);
  } else if (isDm) {
    io.to(`dm:${channelId}`).emit('voice:state_update', payload);
  }
}

async function emitCallSystemMessage(io, channelId, messageType, callMeta, authorId) {
  const message = await prisma.dMMessage.create({
    data: {
      dmChannelId: channelId,
      authorId,
      content: '',
      messageType,
      callMeta: JSON.stringify(callMeta),
    },
    include: DM_MESSAGE_INCLUDE,
  });
  const payload = serializeDmMessage(message);
  const members = await prisma.dMChannelMember.findMany({
    where: { dmChannelId: channelId },
    select: { userId: true },
  });
  for (const m of members) {
    io.to(`user:${m.userId}`).emit('dm:message_created', payload);
  }
  return message;
}

async function endDmCall(io, channelId, endedByUserId) {
  const session = voiceState.callSessions.get(channelId);
  const startedAt = session?.startedAt ? new Date(session.startedAt) : new Date();
  const durationSec = Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000));

  const leftMembers = voiceState.leaveChannel(channelId);
  for (const m of leftMembers) {
    const peerSocket = io.sockets.sockets.get(m.socketId);
    if (peerSocket) {
      peerSocket.leave(`voice:${channelId}`);
      peerSocket.emit('call:force_end', { channelId });
    }
    io.to(`voice:${channelId}`).emit('voice:peer_left', {
      channelId,
      userId: m.userId,
    });
  }

  voiceState.callSessions.delete(channelId);

  if (session) {
    await emitCallSystemMessage(
      io,
      channelId,
      'CALL_ENDED',
      {
        startedBy: session.startedBy,
        startedAt: session.startedAt,
        endedAt: new Date().toISOString(),
        endedBy: endedByUserId,
        durationSec,
        user: session.user ?? null,
      },
      session.startedBy
    );
  }

  broadcastVoiceState(io, channelId, { isDm: true });
}

async function handleDmLeave(io, channelId, userId) {
  const remaining = voiceState.channelMembers(channelId);
  if (remaining.length === 0) {
    const session = voiceState.callSessions.get(channelId);
    if (session) {
      const startedAt = new Date(session.startedAt);
      const durationSec = Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000));
      await emitCallSystemMessage(
        io,
        channelId,
        'CALL_ENDED',
        {
          startedBy: session.startedBy,
          startedAt: session.startedAt,
          endedAt: new Date().toISOString(),
          endedBy: userId,
          durationSec,
          user: session.user ?? null,
        },
        session.startedBy
      );
      voiceState.callSessions.delete(channelId);
    }
  }
  broadcastVoiceState(io, channelId, { isDm: true });
}

export async function handleVoiceSocketDisconnect(io, socket) {
  const userId = socket.data.userId;
  const info = voiceState.disconnect(io, socket);
  if (!info) return;

  const channel = await prisma.channel.findUnique({
    where: { id: info.channelId },
    select: { serverId: true },
  });
  if (channel) {
    broadcastVoiceState(io, info.channelId, { serverId: channel.serverId });
  } else {
    await handleDmLeave(io, info.channelId, userId);
  }
}

export function registerVoiceHandlers(io, socket) {
  const userId = socket.data.userId;
  const voiceUserInfo = {
    id: socket.data.user?.id ?? userId,
    username: socket.data.user?.username ?? null,
    displayName: socket.data.user?.displayName ?? null,
    avatarUrl: socket.data.user?.avatarUrl ?? null,
    systemRole: socket.data.user?.systemRole ?? null,
  };

  socket.on('voice:ring', async ({ channelId }) => {
    try {
      const dmChannel = await prisma.dMChannel.findUnique({
        where: { id: channelId },
        include: { members: true },
      });
      if (!dmChannel) return;

      const isMember = dmChannel.members.some((m) => m.userId === userId);
      if (!isMember) return;

      const otherMembers = dmChannel.members.filter((m) => m.userId !== userId);
      for (const m of otherMembers) {
        io.to(`user:${m.userId}`).emit('voice:incoming_ring', {
          channelId,
          caller: voiceUserInfo,
        });
      }
    } catch (e) {}
  });

  socket.on('voice:cancel_ring', async ({ channelId }) => {
    try {
      const dmChannel = await prisma.dMChannel.findUnique({
        where: { id: channelId },
        include: { members: true },
      });
      if (!dmChannel) return;

      const isMember = dmChannel.members.some((m) => m.userId === userId);
      if (!isMember) return;

      const otherMembers = dmChannel.members.filter((m) => m.userId !== userId);
      for (const m of otherMembers) {
        io.to(`user:${m.userId}`).emit('voice:cancel_ring', {
          channelId,
        });
      }
    } catch (e) {}
  });

  socket.on('voice:join', async ({ channelId }, ack) => {
    try {
      let isDm = false;
      let serverId = null;

      let channel = await prisma.channel.findUnique({
        where: { id: channelId },
        select: { id: true, type: true, serverId: true },
      });

      if (!channel) {
        const dmChannel = await prisma.dMChannel.findUnique({
          where: { id: channelId },
        });
        if (dmChannel) {
          isDm = true;
          const dmMember = await prisma.dMChannelMember.findUnique({
            where: { dmChannelId_userId: { dmChannelId: channelId, userId } },
          });
          if (!dmMember) {
            ack?.({ ok: false, error: 'not_a_member' });
            return;
          }
        } else {
          ack?.({ ok: false, error: 'channel_not_found' });
          return;
        }
      } else {
        if (channel.type !== 'VOICE') {
          ack?.({ ok: false, error: 'not_voice_channel' });
          return;
        }
        serverId = channel.serverId;
      }

      let member = null;
      if (!isDm) {
        member = await prisma.serverMember.findUnique({
          where: { userId_serverId: { userId, serverId: serverId } },
        });
        if (!member) {
          ack?.({ ok: false, error: 'not_a_member' });
          return;
        }
        if (member.timeoutUntil && member.timeoutUntil > new Date()) {
          ack?.({ ok: false, error: 'timeout' });
          return;
        }
      }

      const prev = voiceState.sockets.get(socket.id);
      if (prev) {
        const prevIsDm = !(await prisma.channel.findUnique({ where: { id: prev.channelId } }));
        voiceState.leaveBySocket(socket.id);
        socket.leave(`voice:${prev.channelId}`);
        io.to(`voice:${prev.channelId}`).emit('voice:peer_left', {
          channelId: prev.channelId,
          userId,
        });
        if (prevIsDm) {
          await handleDmLeave(io, prev.channelId, userId);
        } else {
          const prevChannel = await prisma.channel.findUnique({
            where: { id: prev.channelId },
            select: { serverId: true },
          });
          if (prevChannel) {
            broadcastVoiceState(io, prev.channelId, { serverId: prevChannel.serverId });
          }
        }
      }

      voiceState.purgeStaleMembers(io, channelId);
      const existingMembers = voiceState.channelMembers(channelId);
      const wasEmpty = existingMembers.length === 0;
      voiceState.join(channelId, userId, socket.id, voiceUserInfo);
      if (member?.isMuted) voiceState.setFlag(socket.id, 'muted', true);
      if (member?.isDeafened) voiceState.setFlag(socket.id, 'deafened', true);
      socket.join(`voice:${channelId}`);

      if (isDm && wasEmpty) {
        const startedAt = new Date().toISOString();
        voiceState.callSessions.set(channelId, {
          startedBy: userId,
          startedAt,
          user: voiceUserInfo,
        });
        await emitCallSystemMessage(
          io,
          channelId,
          'CALL_STARTED',
          {
            startedBy: userId,
            startedAt,
            user: voiceUserInfo,
          },
          userId
        );
      }

      io.to(`voice:${channelId}`).except(socket.id).emit('voice:peer_joined', {
        channelId,
        userId,
        muted: member?.isMuted ?? false,
        deafened: member?.isDeafened ?? false,
        video: false,
        screen: false,
        user: voiceUserInfo,
      });

      if (isDm) {
        broadcastVoiceState(io, channelId, { isDm: true });
      } else if (serverId) {
        broadcastVoiceState(io, channelId, { serverId });
      }

      ack?.({
        ok: true,
        existingPeers: existingMembers.map((m) => ({
          userId: m.userId,
          socketId: m.socketId,
          muted: m.muted,
          deafened: m.deafened,
          video: m.video,
          screen: m.screen,
          user: m.user,
        })),
      });
    } catch (err) {
      console.error('voice:join error', err);
      ack?.({ ok: false, error: 'internal_error' });
    }
  });

  socket.on('voice:leave', async () => {
    const info = voiceState.leaveBySocket(socket.id);
    if (!info) return;
    socket.leave(`voice:${info.channelId}`);
    io.to(`voice:${info.channelId}`).emit('voice:peer_left', {
      channelId: info.channelId,
      userId,
    });

    const channel = await prisma.channel.findUnique({
      where: { id: info.channelId },
      select: { serverId: true },
    });
    if (channel) {
      broadcastVoiceState(io, info.channelId, { serverId: channel.serverId });
    } else {
      await handleDmLeave(io, info.channelId, userId);
    }
  });

  socket.on('call:end', async ({ channelId }) => {
    try {
      if (!channelId) return;
      const dmChannel = await prisma.dMChannel.findUnique({
        where: { id: channelId },
      });
      if (!dmChannel) return;

      const dmMember = await prisma.dMChannelMember.findUnique({
        where: { dmChannelId_userId: { dmChannelId: channelId, userId } },
      });
      if (!dmMember) return;

      const members = voiceState.channelMembers(channelId);
      if (members.length === 0) return;

      await endDmCall(io, channelId, userId);
    } catch (err) {
      console.error('call:end error', err);
    }
  });

  socket.on('voice:state', async ({ muted, deafened, video, screen }) => {
    const info = voiceState.sockets.get(socket.id);
    if (!info) return;

    let isServerMuted = false;
    let isServerDeafened = false;
    try {
      const channel = await prisma.channel.findUnique({ where: { id: info.channelId }, select: { serverId: true } });
      if (channel) {
        const member = await prisma.serverMember.findUnique({
          where: { userId_serverId: { userId, serverId: channel.serverId } },
        });
        if (member) {
          isServerMuted = member.isMuted;
          isServerDeafened = member.isDeafened;
        }
      }
    } catch (e) {}

    if (typeof muted === 'boolean') voiceState.setFlag(socket.id, 'muted', isServerMuted ? true : muted);
    if (typeof deafened === 'boolean') voiceState.setFlag(socket.id, 'deafened', isServerDeafened ? true : deafened);
    if (typeof video === 'boolean') voiceState.setFlag(socket.id, 'video', video);
    if (typeof screen === 'boolean') voiceState.setFlag(socket.id, 'screen', screen);
    const member = voiceState.getMember(info.channelId, info.userId);
    io.to(`voice:${info.channelId}`).emit('voice:peer_state', {
      channelId: info.channelId,
      userId,
      muted: member.muted,
      deafened: member.deafened,
      video: member.video,
      screen: member.screen,
    });

    const channel = await prisma.channel.findUnique({
      where: { id: info.channelId },
      select: { serverId: true },
    });
    if (channel) {
      broadcastVoiceState(io, info.channelId, { serverId: channel.serverId });
    } else {
      broadcastVoiceState(io, info.channelId, { isDm: true });
    }
  });

  socket.on('rtc:signal', ({ to, data }) => {
    if (!to || !data) return;
    io.to(to).emit('rtc:signal', { from: socket.id, fromUserId: userId, data });
  });

  socket.on('rtc:ice', ({ to, candidate }) => {
    if (!to || !candidate) return;
    io.to(to).emit('rtc:ice', { from: socket.id, fromUserId: userId, candidate });
  });
}
