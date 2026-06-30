import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_FILE = path.join(__dirname, 'backendConfig.json');

const DEFAULT_CONFIG = {
  backup1Url: 'https://softspace.cc/api-backup1',
  backup2Url: 'https://softspace.cc/api-backup2',
  simulateOffline: false,
};

let currentConfig = { ...DEFAULT_CONFIG };

export async function loadBackendConfig() {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf8');
    currentConfig = { ...DEFAULT_CONFIG, ...JSON.parse(data) };
  } catch (err) {
    // If file doesn't exist, save default
    await saveBackendConfig(DEFAULT_CONFIG);
  }
  return currentConfig;
}

export async function saveBackendConfig(config) {
  currentConfig = { ...currentConfig, ...config };
  try {
    await fs.writeFile(CONFIG_FILE, JSON.stringify(currentConfig, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save backend config:', err);
  }
  return currentConfig;
}

export function getBackendConfigSync() {
  return currentConfig;
}

// Initial load
void loadBackendConfig();
