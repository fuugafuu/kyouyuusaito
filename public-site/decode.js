import { PUBLIC_QUERY_KEY, PUBLIC_SLUG_KEY } from '../common/constants.js';
import { normalizePublicPayload } from '../common/models.js';
import { decodeSharePayloadToken } from '../common/share-codec.js';
import { readHashParam } from '../common/utils.js';

const DIRECT_TOKEN_PATTERN = /\b(?:raw|lzw)\.[A-Za-z0-9_-]+\b/;
const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;

function normalizeUrlCandidate(value) {
  return String(value || '').replace(/[),.!?」』]+$/g, '');
}

export function readPublicRoute(locationLike = window.location) {
  const searchParams = new URLSearchParams(locationLike.search || '');
  const token =
    searchParams.get(PUBLIC_QUERY_KEY) || readHashParam(PUBLIC_QUERY_KEY, locationLike.hash);
  const slug =
    searchParams.get(PUBLIC_SLUG_KEY) || readHashParam(PUBLIC_SLUG_KEY, locationLike.hash);

  if (token) {
    return { mode: 'token', value: token };
  }

  if (slug) {
    return { mode: 'slug', value: decodeURIComponent(slug) };
  }

  return { mode: 'none', value: '' };
}

export function extractPublicTokenFromText(text) {
  const source = String(text || '').trim();
  if (!source) {
    return '';
  }

  if (/^https?:\/\//i.test(source)) {
    try {
      const parsed = new URL(normalizeUrlCandidate(source));
      return (
        parsed.searchParams.get(PUBLIC_QUERY_KEY) ||
        readHashParam(PUBLIC_QUERY_KEY, parsed.hash) ||
        ''
      );
    } catch {
      return '';
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
        parsed.searchParams.get(PUBLIC_QUERY_KEY) ||
        readHashParam(PUBLIC_QUERY_KEY, parsed.hash) ||
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

export function decodePublicPayloadFromText(text) {
  const token = extractPublicTokenFromText(text);
  if (!token) {
    throw new Error('公開URLまたは公開コードを入力してください。');
  }

  return normalizePublicPayload(decodeSharePayloadToken(token));
}
