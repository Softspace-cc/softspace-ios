import { clearStoredPlatformBan, getStoredPlatformBan } from './platformBanStore.js';

function normalizeBanRecord(record) {
  if (!record?.createdAt) return null;

  const expiresAt = record.expiresAt ? new Date(record.expiresAt) : null;
  if (expiresAt && expiresAt <= new Date()) {
    return null;
  }

  return {
    reason: record.reason || null,
    createdAt: new Date(record.createdAt),
    expiresAt,
    permanent: !expiresAt,
  };
}

export async function getActivePlatformBan(userId) {
  const stored = await getStoredPlatformBan(userId);
  return normalizeBanRecord(stored);
}

export function buildPlatformBanMessage(ban) {
  if (!ban) return null;

  if (ban.permanent) {
    return 'Your Softspace account has been permanently banned from the platform.';
  }

  return `Your Softspace account is banned until ${new Date(ban.expiresAt).toLocaleString('en-GB')}.`;
}

export async function clearExpiredPlatformBan(user) {
  const ban = await getActivePlatformBan(user?.id);
  if (ban || !user?.id) {
    return user;
  }
  await clearStoredPlatformBan(user.id);
  return user;
}

export async function ensureUserIsNotPlatformBanned(user) {
  const freshUser = await clearExpiredPlatformBan(user);
  const ban = await getActivePlatformBan(freshUser?.id);
  return {
    user: freshUser,
    ban,
  };
}
