import { SHARE_HASH_KEY } from '../common/constants.js';
import { normalizeSharePayload } from '../common/models.js';
import { decodeBase64Utf8, readHashParam } from '../common/utils.js';

function assertSharePayloadShape(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('共有データの形式が不正です。');
  }

  if (!payload.article || typeof payload.article !== 'object') {
    throw new Error('記事データが見つかりません。');
  }

  if (!Array.isArray(payload.attachments)) {
    throw new Error('添付画像データが不正です。');
  }
}

export function decodeSharePayloadFromLocation(locationLike = window.location) {
  const encoded = readHashParam(SHARE_HASH_KEY, locationLike.hash);
  if (!encoded) {
    throw new Error('共有データがURLに含まれていません。');
  }

  let decoded = '';
  let parsed = null;

  try {
    decoded = decodeBase64Utf8(decodeURIComponent(encoded));
  } catch {
    throw new Error('共有データの復号に失敗しました。');
  }

  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new Error('共有データがJSONとして不正です。');
  }

  assertSharePayloadShape(parsed);
  return normalizeSharePayload(parsed);
}
