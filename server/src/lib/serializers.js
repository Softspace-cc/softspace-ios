// Convert DB models into safe public DTOs (no password hashes, BigInt → string).

import { getUserPlatform, isUserOnline } from './presenceState.js';

export function publicUser(user) {
  if (!user) return null;
  const isOnline = isUserOnline(user.id);
  let effectiveStatus = user.status;
  if (!isOnline) {
    effectiveStatus = 'offline';
  } else if (effectiveStatus === 'invisible') {
    effectiveStatus = 'offline';
  }

  let safeCustomStatus = user.customStatus;
  let safeActivities = user.activities;
  if (!isOnline) {
    if (
      safeCustomStatus &&
      (safeCustomStatus.startsWith('{') ||
      safeCustomStatus.startsWith('Playing: ') ||
      safeCustomStatus.startsWith('Using: ') ||
      safeCustomStatus.startsWith('Listening to: '))
    ) {
      safeCustomStatus = null;
    }
    safeActivities = null;
  }

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bannerUrl: user.bannerUrl,
    bio: user.bio,
    pronouns: user.pronouns,
    identityTags: parseTags(user.identityTags),
    badges: parseBadges(user.badges),
    accentColor: user.accentColor,
    status: effectiveStatus,
    customStatus: safeCustomStatus,
    activities: safeActivities,
    platform: getUserPlatform(user.id),
    systemRole: user.systemRole,
    allowDownloads: user.allowDownloads ?? true,
    createdAt: user.createdAt,
  };
}

export function privateUser(user) {
  if (!user) return null;
  return {
    ...publicUser(user),
    email: user.email,
    locale: user.locale,
    theme: user.theme,
    lastSeenAt: user.lastSeenAt,
    platformBanReason: user.platformBanReason ?? null,
    platformBanExpiresAt: user.platformBanExpiresAt ?? null,
    platformBanCreatedAt: user.platformBanCreatedAt ?? null,
  };
}

export function parseTags(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseBadges(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((badge) => String(badge).trim()).filter(Boolean);
  }
  try {
    const parsed = JSON.parse(String(value));
    if (!Array.isArray(parsed)) return [];
    return parsed.map((badge) => String(badge).trim()).filter(Boolean);
  } catch (_err) {
    return [];
  }
}

export function stringifyBadges(badges) {
  if (!badges) return null;
  if (!Array.isArray(badges)) return null;
  return JSON.stringify(
    badges
      .map((badge) => String(badge).trim())
      .filter(Boolean)
      .slice(0, 12)
  );
}

export function stringifyTags(tags) {
  if (!tags) return null;
  if (typeof tags === 'string') return tags;
  if (!Array.isArray(tags)) return null;
  return tags
    .map((s) => String(s).trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 10)
    .join(',');
}

export function serializeRole(role) {
  if (!role) return null;
  return {
    id: role.id,
    serverId: role.serverId,
    name: role.name,
    color: role.color,
    position: role.position,
    permissions: String(role.permissions),
    isDefault: role.isDefault,
  };
}

export function serializeMember(member) {
  if (!member) return null;
  return {
    id: member.id,
    userId: member.userId,
    serverId: member.serverId,
    nickname: member.nickname,
    joinedAt: member.joinedAt,
    timeoutUntil: member.timeoutUntil,
    isMuted: member.isMuted,
    isDeafened: member.isDeafened,
    user: publicUser(member.user),
    roles: (member.roles ?? [])
      .map((mr) => mr.role ? serializeRole(mr.role) : null)
      .filter(Boolean),
    roleIds: (member.roles ?? []).map((mr) => mr.roleId ?? mr.role?.id).filter(Boolean),
  };
}

export function serializeChannel(channel) {
  if (!channel) return null;
  return {
    id: channel.id,
    serverId: channel.serverId,
    name: channel.name,
    type: channel.type,
    topic: channel.topic,
    position: channel.position,
    parentId: channel.parentId,
    permissionOverrides: channel.permissionOverrides,
    createdAt: channel.createdAt,
  };
}

export function serializeServer(server) {
  if (!server) return null;
  return {
    id: server.id,
    name: server.name,
    iconUrl: server.iconUrl,
    bannerUrl: server.bannerUrl,
    description: server.description,
    vanityUrl: server.vanityUrl,
    isPublic: server.isPublic,
    ownerId: server.ownerId,
    createdAt: server.createdAt,
    channels: (server.channels ?? []).map(serializeChannel),
    roles: (server.roles ?? []).map(serializeRole),
    memberCount: server._count?.members ?? (server.members ? server.members.length : undefined),
  };
}

export function serializeAttachment(attachment) {
  if (!attachment) return null;
  return {
    id: attachment.id,
    url: attachment.url,
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    size: attachment.size,
    width: attachment.width,
    height: attachment.height,
  };
}

export function serializeReaction(r) {
  return {
    id: r.id,
    emoji: r.emoji,
    userId: r.userId,
    messageId: r.messageId,
    dmMessageId: r.dmMessageId,
  };
}

export function serializeMessage(message) {
  if (!message) return null;
  let mentionedRoleIds = [];
  try {
    mentionedRoleIds = message.mentionedRoleIds ? JSON.parse(message.mentionedRoleIds) : [];
  } catch (err) {}

  return {
    id: message.id,
    channelId: message.channelId,
    authorId: message.authorId,
    author: publicUser(message.author),
    content: message.content,
    createdAt: message.createdAt,
    editedAt: message.editedAt,
    replyToId: message.replyToId,
    mentionedRoleIds,
    replyTo: message.replyTo
      ? {
        id: message.replyTo.id,
        authorId: message.replyTo.authorId,
        content: message.replyTo.content,
        author: publicUser(message.replyTo.author),
      }
      : null,
    reactions: (message.reactions ?? []).map(serializeReaction),
    attachments: (message.attachments ?? []).map(serializeAttachment),
  };
}

export function serializeDmMessage(message) {
  if (!message) return null;
  let callMeta = null;
  if (message.callMeta) {
    try {
      callMeta = JSON.parse(message.callMeta);
    } catch (_err) {
      callMeta = null;
    }
  }
  return {
    id: message.id,
    dmChannelId: message.dmChannelId,
    authorId: message.authorId,
    author: publicUser(message.author),
    content: message.content,
    messageType: message.messageType ?? 'USER',
    callMeta,
    createdAt: message.createdAt,
    editedAt: message.editedAt,
    replyToId: message.replyToId,
    replyTo: message.replyTo
      ? {
        id: message.replyTo.id,
        authorId: message.replyTo.authorId,
        content: message.replyTo.content,
        author: publicUser(message.replyTo.author),
      }
      : null,
    reactions: (message.reactions ?? []).map(serializeReaction),
    attachments: (message.attachments ?? []).map(serializeAttachment),
  };
}

export function serializeDmChannel(channel) {
  if (!channel) return null;
  return {
    id: channel.id,
    isGroup: channel.isGroup,
    name: channel.name,
    iconUrl: channel.iconUrl,
    ownerId: channel.ownerId,
    createdAt: channel.createdAt,
    members: (channel.members ?? []).map((m) => ({
      userId: m.userId,
      user: publicUser(m.user),
      lastReadAt: m.lastReadAt,
    })),
    lastMessage: channel.messages?.[0] ? serializeDmMessage(channel.messages[0]) : null,
  };
}

export function serializeCustomEmoji(emoji) {
  if (!emoji) return null;
  return {
    id: emoji.id,
    userId: emoji.userId,
    name: emoji.name,
    url: emoji.url,
    type: emoji.type,
    position: emoji.position,
    createdAt: emoji.createdAt,
  };
}

export function serializeFriendship(friendship, viewerId) {
  if (!friendship) return null;
  const isRequester = friendship.requesterId === viewerId;
  const other = isRequester ? friendship.recipient : friendship.requester;
  return {
    id: friendship.id,
    status: friendship.status,
    direction: isRequester ? 'outgoing' : 'incoming',
    user: publicUser(other),
    createdAt: friendship.createdAt,
    updatedAt: friendship.updatedAt,
  };
}

export function serializeInvite(invite) {
  if (!invite) return null;
  return {
    code: invite.code,
    serverId: invite.serverId,
    creatorId: invite.creatorId,
    expiresAt: invite.expiresAt,
    maxUses: invite.maxUses,
    uses: invite.uses,
    createdAt: invite.createdAt,
    server: invite.server ? serializeServer(invite.server) : undefined,
  };
}
