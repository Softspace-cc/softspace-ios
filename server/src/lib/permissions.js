// Discord-style permission bitfield. Stored as BigInt in the DB.
export const Permissions = {
  VIEW_CHANNELS: 1n << 0n,
  SEND_MESSAGES: 1n << 1n,
  MANAGE_MESSAGES: 1n << 2n,
  MANAGE_CHANNELS: 1n << 3n,
  MANAGE_ROLES: 1n << 4n,
  MANAGE_SERVER: 1n << 5n,
  KICK_MEMBERS: 1n << 6n,
  BAN_MEMBERS: 1n << 7n,
  CREATE_INVITES: 1n << 8n,
  ADMINISTRATOR: 1n << 9n,
  CONNECT_VOICE: 1n << 10n,
  SPEAK: 1n << 11n,
  VIDEO: 1n << 12n,
  ADD_REACTIONS: 1n << 13n,
  ATTACH_FILES: 1n << 14n,
  MENTION_ROLES: 1n << 15n,
};

export const DEFAULT_MEMBER_PERMS =
  Permissions.VIEW_CHANNELS |
  Permissions.SEND_MESSAGES |
  Permissions.ADD_REACTIONS |
  Permissions.ATTACH_FILES |
  Permissions.CONNECT_VOICE |
  Permissions.SPEAK |
  Permissions.VIDEO |
  Permissions.CREATE_INVITES |
  Permissions.MENTION_ROLES;

export const ADMIN_PERMS =
  DEFAULT_MEMBER_PERMS |
  Permissions.MANAGE_MESSAGES |
  Permissions.MANAGE_CHANNELS |
  Permissions.MANAGE_ROLES |
  Permissions.MANAGE_SERVER |
  Permissions.KICK_MEMBERS |
  Permissions.BAN_MEMBERS |
  Permissions.ADMINISTRATOR;

export function memberPermissions(member, server) {
  if (!member) return 0n;
  if (member.isCEO) return ADMIN_PERMS;
  if (server && server.ownerId === member.userId) return ADMIN_PERMS;
  let perms = 0n;

  // Always implicitly apply the @everyone role permissions
  const everyoneRole = server?.roles?.find((r) => r.isDefault);
  if (everyoneRole) {
    perms |= BigInt(everyoneRole.permissions ?? 0);
  }

  for (const memberRole of member.roles ?? []) {
    const role = memberRole.role;
    if (!role) continue;
    perms |= BigInt(role.permissions ?? 0);
  }
  return perms;
}

export function channelPermissions(member, server, channel) {
  if (!member) return 0n;
  if (member.isCEO) return ADMIN_PERMS;
  if (server && server.ownerId === member.userId) return ADMIN_PERMS;

  // Base server-level permissions for the member
  let perms = memberPermissions(member, server);

  // Administrators bypass all channel overrides
  if (perms & Permissions.ADMINISTRATOR) {
    return ADMIN_PERMS;
  }

  // Apply channel-specific permission overrides if they exist
  if (channel && channel.permissionOverrides) {
    try {
      const overrides = JSON.parse(channel.permissionOverrides);
      if (Array.isArray(overrides)) {
        // 1. @everyone role override
        const everyoneRole = server?.roles?.find(r => r.isDefault);
        const everyoneOverride = overrides.find(
          o => o.type === 'ROLE' && o.id === everyoneRole?.id
        );
        if (everyoneOverride) {
          const allow = BigInt(everyoneOverride.allow ?? 0n);
          const deny = BigInt(everyoneOverride.deny ?? 0n);
          perms = (perms & ~deny) | allow;
        }

        // 2. Member roles overrides (combined)
        let roleAllow = 0n;
        let roleDeny = 0n;
        const memberRoleIds = (member.roles ?? [])
          .map(mr => mr.roleId ?? mr.role?.id)
          .filter(Boolean);

        for (const roleId of memberRoleIds) {
          const roleOverride = overrides.find(o => o.type === 'ROLE' && o.id === roleId);
          if (roleOverride) {
            roleAllow |= BigInt(roleOverride.allow ?? 0n);
            roleDeny |= BigInt(roleOverride.deny ?? 0n);
          }
        }
        perms = (perms & ~roleDeny) | roleAllow;

        // 3. User-specific override
        const memberOverride = overrides.find(
          o => o.type === 'MEMBER' && o.id === member.userId
        );
        if (memberOverride) {
          const allow = BigInt(memberOverride.allow ?? 0n);
          const deny = BigInt(memberOverride.deny ?? 0n);
          perms = (perms & ~deny) | allow;
        }
      }
    } catch (err) {
      console.error('[permissions] Failed to parse channel permission overrides:', err);
    }
  }

  return perms;
}

export function hasPermission(perms, flag) {
  const p = BigInt(perms ?? 0);
  if (p & Permissions.ADMINISTRATOR) return true;
  return (p & flag) === flag;
}

/** Channels the member is allowed to view (respects overrides). */
export function visibleChannels(member, server, channels) {
  if (!channels?.length) return [];
  return channels.filter((channel) => {
    const perms = channelPermissions(member, server, channel);
    return hasPermission(perms, Permissions.VIEW_CHANNELS);
  });
}
