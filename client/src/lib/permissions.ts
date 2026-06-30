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

export function computeChannelPermissions(me: any, myMemberInfo: any, serverInfo: any, channelInfo: any) {
  if (!me) return 0n;
  if (me.systemRole === 'CEO' || me.systemRole === 'MODERATOR') {
    return 0xffffffffffffn; // All permissions
  }
  if (!serverInfo) return 0n;
  if (serverInfo.ownerId === me.id) {
    return 0xffffffffffffn; // Owner gets all permissions
  }

  let perms = 0n;

  // 1. Base role permissions (everyone role)
  const everyoneRole = serverInfo.roles?.find((r: any) => r.isDefault);
  if (everyoneRole) {
    perms |= BigInt(everyoneRole.permissions || '0');
  }

  // 2. Member roles permissions
  for (const rid of (myMemberInfo?.roleIds ?? [])) {
    const r = serverInfo.roles?.find((role: any) => role.id === rid);
    if (r) {
      perms |= BigInt(r.permissions || '0');
    }
  }

  // Administrator bypasses channel overrides
  const ADMINISTRATOR = Permissions.ADMINISTRATOR;
  if ((perms & ADMINISTRATOR) === ADMINISTRATOR) {
    return 0xffffffffffffn;
  }

  // 3. Channel overrides if present
  if (channelInfo && channelInfo.permissionOverrides) {
    try {
      const overrides = typeof channelInfo.permissionOverrides === 'string'
        ? JSON.parse(channelInfo.permissionOverrides)
        : channelInfo.permissionOverrides;

      if (Array.isArray(overrides)) {
        // A. Everyone override
        const everyoneOverride = overrides.find((o: any) => o.type === 'ROLE' && o.id === everyoneRole?.id);
        if (everyoneOverride) {
          const allow = BigInt(everyoneOverride.allow || '0');
          const deny = BigInt(everyoneOverride.deny || '0');
          perms = (perms & ~deny) | allow;
        }

        // B. Role overrides
        let roleAllow = 0n;
        let roleDeny = 0n;
        let hasRoleOverride = false;

        for (const ov of overrides) {
          if (ov.type === 'ROLE' && (ov.id === everyoneRole?.id || (myMemberInfo?.roleIds ?? []).includes(ov.id))) {
            roleAllow |= BigInt(ov.allow || '0');
            roleDeny |= BigInt(ov.deny || '0');
            hasRoleOverride = true;
          }
        }
        if (hasRoleOverride) {
          perms = (perms & ~roleDeny) | roleAllow;
        }

        // C. Member override
        const memberOverride = overrides.find((o: any) => o.type === 'MEMBER' && o.id === me.id);
        if (memberOverride) {
          const allow = BigInt(memberOverride.allow || '0');
          const deny = BigInt(memberOverride.deny || '0');
          perms = (perms & ~deny) | allow;
        }
      }
    } catch (e) {
      console.error('Error parsing channel overrides:', e);
    }
  }

  return perms;
}

export function hasPermission(perms: bigint, flag: bigint) {
  const ADMINISTRATOR = Permissions.ADMINISTRATOR;
  if ((perms & ADMINISTRATOR) === ADMINISTRATOR) return true;
  return (perms & flag) === flag;
}
