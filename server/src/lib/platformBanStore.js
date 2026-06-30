import prisma from './prisma.js';

export async function getPlatformBans() {
  const users = await prisma.user.findMany({
    where: {
      platformBanCreatedAt: { not: null }
    },
    select: {
      id: true,
      platformBanReason: true,
      platformBanExpiresAt: true,
      platformBanCreatedAt: true,
    }
  });

  const bans = {};
  for (const user of users) {
    // If the ban has already expired, skip or clear it
    if (user.platformBanExpiresAt && user.platformBanExpiresAt <= new Date()) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          platformBanReason: null,
          platformBanExpiresAt: null,
          platformBanCreatedAt: null,
        }
      }).catch(() => {});
      continue;
    }

    bans[user.id] = {
      reason: user.platformBanReason,
      expiresAt: user.platformBanExpiresAt ? user.platformBanExpiresAt.toISOString() : null,
      createdAt: user.platformBanCreatedAt.toISOString(),
    };
  }
  return bans;
}

export async function savePlatformBans(bans) {
  // Provided for backward compatibility, but database-backed should be modified individually.
  // We can perform individual updates if needed.
  for (const [userId, ban] of Object.entries(bans)) {
    if (ban) {
      await setStoredPlatformBan(userId, ban);
    } else {
      await clearStoredPlatformBan(userId);
    }
  }
}

export async function getStoredPlatformBan(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      platformBanReason: true,
      platformBanExpiresAt: true,
      platformBanCreatedAt: true,
    }
  });

  if (!user || !user.platformBanCreatedAt) {
    return null;
  }

  if (user.platformBanExpiresAt && user.platformBanExpiresAt <= new Date()) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        platformBanReason: null,
        platformBanExpiresAt: null,
        platformBanCreatedAt: null,
      }
    });
    return null;
  }

  return {
    reason: user.platformBanReason,
    expiresAt: user.platformBanExpiresAt ? user.platformBanExpiresAt.toISOString() : null,
    createdAt: user.platformBanCreatedAt.toISOString(),
  };
}

export async function setStoredPlatformBan(userId, ban) {
  const expiresAt = ban.expiresAt ? new Date(ban.expiresAt) : null;
  const createdAt = ban.createdAt ? new Date(ban.createdAt) : new Date();

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      platformBanReason: ban.reason || null,
      platformBanExpiresAt: expiresAt,
      platformBanCreatedAt: createdAt,
    }
  });

  return {
    reason: user.platformBanReason,
    expiresAt: user.platformBanExpiresAt ? user.platformBanExpiresAt.toISOString() : null,
    createdAt: user.platformBanCreatedAt.toISOString(),
  };
}

export async function clearStoredPlatformBan(userId) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      platformBanReason: null,
      platformBanExpiresAt: null,
      platformBanCreatedAt: null,
    }
  });
}
