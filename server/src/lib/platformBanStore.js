import fs from 'fs/promises';
import path from 'path';

const STORE_PATH = path.resolve(process.cwd(), 'data', 'platform-bans.json');

let cachedBans = null;

async function loadStore() {
  if (cachedBans) return cachedBans;

  try {
    await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
    const data = await fs.readFile(STORE_PATH, 'utf-8');
    cachedBans = JSON.parse(data);
  } catch (_err) {
    cachedBans = {};
    await savePlatformBans(cachedBans).catch(() => {});
  }

  return cachedBans;
}

export async function getPlatformBans() {
  return await loadStore();
}

export async function savePlatformBans(bans) {
  cachedBans = bans;
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(bans, null, 2), 'utf-8');
}

export async function getStoredPlatformBan(userId) {
  const bans = await getPlatformBans();
  return bans[userId] ?? null;
}

export async function setStoredPlatformBan(userId, ban) {
  const bans = await getPlatformBans();
  bans[userId] = ban;
  await savePlatformBans(bans);
  return bans[userId];
}

export async function clearStoredPlatformBan(userId) {
  const bans = await getPlatformBans();
  delete bans[userId];
  await savePlatformBans(bans);
}
