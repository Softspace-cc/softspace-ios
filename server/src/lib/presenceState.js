const userSockets = new Map(); // userId -> Set<socketId>
const userPlatforms = new Map(); // userId -> Map<socketId, platform>

export function normalizeClientPlatform(value) {
  if (value === 'mobile' || value === 'capacitor' || value === 'android' || value === 'ios') {
    return 'mobile';
  }

  if (value === 'desktop' || value === 'app' || value === 'electron') {
    return 'desktop';
  }

  if (value === 'web') {
    return 'web';
  }

  return 'web';
}

export function addUserSocket(userId, socketId, platform = 'web') {
  if (!userSockets.has(userId)) {
    userSockets.set(userId, new Set());
  }
  userSockets.get(userId).add(socketId);

  if (!userPlatforms.has(userId)) {
    userPlatforms.set(userId, new Map());
  }
  userPlatforms.get(userId).set(socketId, normalizeClientPlatform(platform));
}

export function removeUserSocket(userId, socketId) {
  const sockets = userSockets.get(userId);
  if (!sockets) return false;

  sockets.delete(socketId);
  if (sockets.size === 0) {
    userSockets.delete(userId);
  }

  const platforms = userPlatforms.get(userId);
  if (platforms) {
    platforms.delete(socketId);
    if (platforms.size === 0) {
      userPlatforms.delete(userId);
    }
  }

  return !userSockets.has(userId);
}

export function isUserOnline(userId) {
  return userSockets.has(userId);
}

export function onlineUserIds() {
  return [...userSockets.keys()];
}

export function getUserPlatform(userId) {
  const platforms = userPlatforms.get(userId);
  if (!platforms || platforms.size === 0) {
    return null;
  }

  let hasMobile = false;
  for (const platform of platforms.values()) {
    if (platform === 'desktop') {
      return 'desktop';
    }
    if (platform === 'mobile') {
      hasMobile = true;
    }
  }

  if (hasMobile) {
    return 'mobile';
  }

  return 'web';
}
