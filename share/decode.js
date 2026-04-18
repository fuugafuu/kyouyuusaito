import { SHARE_HASH_KEY, SHARE_QUERY_KEY } from '../common/constants.js';
import { normalizeSharePayload } from '../common/models.js';
import { decodeSharePayloadToken } from '../common/share-codec.js';
import { decodeBase64Utf8, readHashParam } from '../common/utils.js';

const DIRECT_TOKEN_PATTERN = /\b(?:raw|lzw)\.[A-Za-z0-9_-]+\b/;
const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;

function normalizeUrlCandidate(value) {
  return String(value || '').replace(/[),.!?。、】【」』＞>]+$/g, '');
}

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

function decodeLegacyPayload(encoded) {
  let decoded = '';
  let parsed = null;

  try {
    decoded = decodeBase64Utf8(decodeURIComponent(encoded));
  } catch {
    throw new Error('共有データの復元に失敗しました。');
  }

  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new Error('共有データの JSON が不正です。');
  }

  return parsed;
}

export function extractShareTokenFromText(text) {
  const source = String(text || '').trim();
  if (!source) {
    return '';
  }

  if (/^https?:\/\//i.test(source)) {
    try {
      const parsed = new URL(normalizeUrlCandidate(source));
      return (
        parsed.searchParams.get(SHARE_QUERY_KEY) ||
        readHashParam(SHARE_QUERY_KEY, parsed.hash) ||
        readHashParam(SHARE_HASH_KEY, parsed.hash) ||
        ''
      );
    } catch {
      // URLらしい文字列でも装飾が混ざることがあるため、下の走査へフォールバックする。
    }
  }

  const directTokenMatch = source.match(DIRECT_TOKEN_PATTERN);
  if (directTokenMatch) {
    return directTokenMatch[0];
  }

  for (const match of source.matchAll(URL_PATTERN)) {
    try {
      const parsed = new URL(normalizeUrlCandidate(match[0]));
      const token =
        parsed.searchParams.get(SHARE_QUERY_KEY) ||
        readHashParam(SHARE_QUERY_KEY, parsed.hash) ||
        readHashParam(SHARE_HASH_KEY, parsed.hash) ||
        '';

      if (token) {
        return token;
      }
    } catch {
      continue;
    }
  }

  return source;
}

export function decodeSharePayloadFromText(text) {
  const token = extractShareTokenFromText(text);
  if (!token) {
    throw new Error('共有コードまたは共有URLを入力してください。');
  }

  const parsed =
    token.startsWith('raw.') || token.startsWith('lzw.')
      ? decodeSharePayloadToken(token)
      : decodeLegacyPayload(token);

  assertSharePayloadShape(parsed);
  return normalizeSharePayload(parsed);
}

export function decodeSharePayloadFromLocation(locationLike = window.location) {
  const searchParams = new URLSearchParams(locationLike.search || '');
  const queryToken = searchParams.get(SHARE_QUERY_KEY);
  const hashToken =
    readHashParam(SHARE_QUERY_KEY, locationLike.hash) || readHashParam(SHARE_HASH_KEY, locationLike.hash);

  if (!queryToken && !hashToken) {
    throw new Error('共有データがまだ読み込まれていません。');
  }

  return decodeSharePayloadFromText(queryToken || hashToken || '');
}
