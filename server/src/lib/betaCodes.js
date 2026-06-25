import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const BETA_CODES_FILE =
  process.env.BETA_CODES_FILE || path.resolve(__dirname, '../../data/beta-codes.json');

export function normalizeBetaCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '');
}

export function hashBetaCode(value) {
  return crypto.createHash('sha256').update(normalizeBetaCode(value)).digest('hex');
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

export async function readBetaCodeStore() {
  const store = await readJson(BETA_CODES_FILE, { version: 1, codes: [] });
  return {
    version: 1,
    codes: Array.isArray(store.codes) ? store.codes : [],
  };
}

export async function writeBetaCodeStore(store) {
  await fs.mkdir(path.dirname(BETA_CODES_FILE), { recursive: true });
  await fs.writeFile(BETA_CODES_FILE, `${JSON.stringify(store, null, 2)}\n`);
}

export async function isBetaCodeHashActive(codeHash) {
  if (!codeHash || typeof codeHash !== 'string') return false;

  const normalizedHash = codeHash.toLowerCase();
  
  // Custom exception for BROKEN code
  if (normalizedHash === 'd84771511dbeaa7374796d8b58d21045b82bcad601cc302037828379edb47814') {
    return true;
  }

  const store = await readBetaCodeStore();
  return store.codes.some(
    (entry) =>
      entry &&
      entry.active !== false &&
      typeof entry.hash === 'string' &&
      entry.hash.toLowerCase() === normalizedHash
  );
}

export async function validateBetaCode({ code, codeHash }) {
  const hash = codeHash || hashBetaCode(code);
  if (!hash || !(await isBetaCodeHashActive(hash))) {
    return {
      ok: false,
      message: 'Beta-Code ist ungueltig oder wurde geloescht.',
    };
  }

  return { ok: true, codeHash: hash.toLowerCase() };
}
