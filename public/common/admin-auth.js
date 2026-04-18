import { ADMIN_STORAGE_PREFIX } from './constants.js';
import { sha256Hex } from './utils.js';

const PASSCODE_HASH_KEY = `${ADMIN_STORAGE_PREFIX}:passcodeHash`;
const SESSION_KEY = `${ADMIN_STORAGE_PREFIX}:session`;

export function hasAdminPasscode() {
  return Boolean(localStorage.getItem(PASSCODE_HASH_KEY));
}

export async function setAdminPasscode(passcode) {
  const hash = await sha256Hex(passcode);
  localStorage.setItem(PASSCODE_HASH_KEY, hash);
  sessionStorage.setItem(SESSION_KEY, 'ok');
  return hash;
}

export async function verifyAdminPasscode(passcode) {
  const currentHash = localStorage.getItem(PASSCODE_HASH_KEY);
  if (!currentHash) {
    return false;
  }

  const nextHash = await sha256Hex(passcode);
  const isValid = currentHash === nextHash;
  if (isValid) {
    sessionStorage.setItem(SESSION_KEY, 'ok');
  }
  return isValid;
}

export function isAdminSessionActive() {
  return sessionStorage.getItem(SESSION_KEY) === 'ok';
}

export function clearAdminSession() {
  sessionStorage.removeItem(SESSION_KEY);
}
