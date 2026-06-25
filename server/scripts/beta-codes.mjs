import crypto from 'crypto';
import {
  BETA_CODES_FILE,
  hashBetaCode,
  readBetaCodeStore,
  writeBetaCodeStore,
} from '../src/lib/betaCodes.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function formatCode(raw) {
  return raw.match(/.{1,4}/g).join('-');
}

function randomCode() {
  let raw = '';
  for (let i = 0; i < 16; i += 1) {
    raw += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
  }
  return formatCode(raw);
}

function printUsage() {
  console.log(`SoftSpace Server Beta Codes

Usage:
  npm --prefix server run beta:codes -- generate [label]
  npm --prefix server run beta:codes -- list
  npm --prefix server run beta:codes -- delete <code-or-id>

Store:
  ${BETA_CODES_FILE}
`);
}

async function generate(label) {
  const store = await readBetaCodeStore();
  let code = randomCode();
  let codeHash = hashBetaCode(code);

  while (store.codes.some((entry) => entry.hash === codeHash)) {
    code = randomCode();
    codeHash = hashBetaCode(code);
  }

  const entry = {
    id: crypto.randomBytes(4).toString('hex'),
    label: label || null,
    hash: codeHash,
    active: true,
    createdAt: new Date().toISOString(),
  };

  store.codes.push(entry);
  await writeBetaCodeStore(store);

  console.log(`Code: ${code}`);
  console.log(`ID:   ${entry.id}`);
  console.log(`File: ${BETA_CODES_FILE}`);
}

async function list() {
  const store = await readBetaCodeStore();
  if (store.codes.length === 0) {
    console.log('Keine Beta-Codes vorhanden.');
    console.log(`File: ${BETA_CODES_FILE}`);
    return;
  }

  for (const entry of store.codes) {
    const label = entry.label ? ` (${entry.label})` : '';
    const state = entry.active === false ? 'inactive' : 'active';
    console.log(`${entry.id}${label} - ${state} - ${entry.createdAt || 'unknown'}`);
  }
}

async function deleteCode(value) {
  const needle = String(value || '').trim();
  if (!needle) {
    throw new Error('Bitte Code oder ID angeben.');
  }

  const store = await readBetaCodeStore();
  const codeHash = hashBetaCode(needle);
  const before = store.codes.length;
  store.codes = store.codes.filter((entry) => entry.id !== needle && entry.hash !== codeHash);
  const removed = before - store.codes.length;

  await writeBetaCodeStore(store);
  console.log(removed > 0 ? `${removed} Code geloescht.` : 'Kein passender Code gefunden.');
}

const [command, ...args] = process.argv.slice(2);

try {
  if (command === 'generate') {
    await generate(args.join(' ').trim());
  } else if (command === 'list') {
    await list();
  } else if (command === 'delete') {
    await deleteCode(args[0]);
  } else {
    printUsage();
    process.exitCode = command ? 1 : 0;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
