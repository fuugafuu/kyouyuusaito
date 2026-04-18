import { APP_VERSION } from '../common/constants.js';
import { normalizeBackupPayload } from '../common/models.js';
import { decodeBase64Utf8, encodeBase64Utf8 } from '../common/utils.js';

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertBackupPayloadShape(payload) {
  if (!isRecord(payload)) {
    throw new Error('バックアップ文字列の形式が正しくありません。');
  }

  if (payload.version !== APP_VERSION) {
    throw new Error('未対応のバックアップバージョンです。');
  }

  if (!isRecord(payload.profile) || !isRecord(payload.settings)) {
    throw new Error('プロフィールまたは設定データが壊れています。');
  }

  if (!Array.isArray(payload.articles) || !Array.isArray(payload.attachments)) {
    throw new Error('記事または添付データが配列ではありません。');
  }
}

export async function exportBackupString(storage, userKey) {
  const payload = normalizeBackupPayload(await storage.getAllData(), userKey);
  return encodeBase64Utf8(JSON.stringify(payload));
}

export function parseBackupString(text, userKey) {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    throw new Error('バックアップ文字列が空です。');
  }

  let payload = null;
  try {
    payload = JSON.parse(decodeBase64Utf8(trimmed));
  } catch {
    throw new Error('バックアップ文字列の復元に失敗しました。');
  }

  assertBackupPayloadShape(payload);
  return normalizeBackupPayload(payload, userKey);
}

export async function restoreBackupString(storage, text, userKey) {
  const payload = parseBackupString(text, userKey);
  await storage.replaceAllData(payload);
  return payload;
}
