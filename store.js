// store.js — localStorage persistence for settings and the breath log.
import { DEFAULT_SETTINGS } from './clocks.js';

const SETTINGS_KEY = 'tattva-tide:settings:v1';
const LOG_KEY = 'tattva-tide:log:v1';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
}

export function loadSettings() {
  const saved = read(SETTINGS_KEY, null);
  return { ...DEFAULT_SETTINGS, ...(saved || {}), _fresh: !saved };
}
export function saveSettings(settings) {
  const { _fresh, ...rest } = settings;
  write(SETTINGS_KEY, rest);
}

export function loadLog() {
  const log = read(LOG_KEY, []);
  return Array.isArray(log) ? log : [];
}
export function saveLog(log) {
  write(LOG_KEY, log);
}
