import { PUBLIC_QUERY_KEY, PUBLIC_SLUG_KEY } from '../common/constants.js';
import { normalizePublicPayload } from '../common/models.js';
import { readPublicSlugFromPathname } from '../common/routes.js';
import { decodeSharePayloadToken } from '../common/share-codec.js';
import { readHashParam } from '../common/utils.js';
import { decodeSharePayloadFromText } from '../share/decode.js';

const DIRECT_TOKEN_PATTERN = /\b(?:raw|lzw)\.[A-Za-z0-9_-]+\b/;
const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;

function normalizeUrlCandidate(value) {
  return String(value || '').replace(/[),.!?]+$/g, '');
}

function normalizeImportText(value) {
  return String(value || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
}

function collapseWhitespace(value) {
  return normalizeImportText(value).replace(/\s+/g, '');
}

function convertSharePayloadToPublicPayload(sharePayload) {
  return normalizePublicPayload({
    version: sharePayload.version,
    profile: sharePayload.profile,
    article: {
      title: sharePayload.article.title,
      content: sharePayload.article.content,
      series: 'SCP',
      articleNumber: null,
      objectClass: 'UNCLASSIFIED',
      slug: '',
      summary: '',
      customCss: '',
      customJs: '',
      publishedAt: 0,
      updatedAt: Date.now(),
    },
    attachments: sharePayload.attachments,
  });
}

export function readPublicRoute(locationLike = window.location) {
  const searchParams = new URLSearchParams(locationLike.search || '');
  const token =
    searchParams.get(PUBLIC_QUERY_KEY) || readHashParam(PUBLIC_QUERY_KEY, locationLike.hash);
  const slug =
    searchParams.get(PUBLIC_SLUG_KEY) ||
    readHashParam(PUBLIC_SLUG_KEY, locationLike.hash) ||
    readPublicSlugFromPathname(locationLike.pathname);

  if (token) {
    return { mode: 'token', value: token, slug: slug ? decodeURIComponent(slug) : '' };
  }

  if (slug) {
    return { mode: 'slug', value: decodeURIComponent(slug) };
  }

  return { mode: 'none', value: '' };
}

export function extractPublicTokenFromText(text) {
  const source = normalizeImportText(text);
  if (!source) {
    return '';
  }

  const collapsedSource = collapseWhitespace(source);

  if (/^https?:\/\//i.test(source) || /^https?:\/\//i.test(collapsedSource)) {
    try {
      const parsed = new URL(normalizeUrlCandidate(/^https?:\/\//i.test(source) ? source : collapsedSource));
      return (
        parsed.searchParams.get(PUBLIC_QUERY_KEY) ||
        readHashParam(PUBLIC_QUERY_KEY, parsed.hash) ||
        ''
      );
    } catch {
      return '';
    }
  }

  const directTokenMatch =
    source.match(DIRECT_TOKEN_PATTERN) || collapsedSource.match(DIRECT_TOKEN_PATTERN);
  if (directTokenMatch) {
    return directTokenMatch[0];
  }

  for (const candidateSource of [source, collapsedSource]) {
    for (const match of candidateSource.matchAll(URL_PATTERN)) {
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
  }

  const lines = source
    .split(/\r?\n/)
    .map((line) => collapseWhitespace(line))
    .filter(Boolean);

  for (const line of lines) {
    const token = line.match(DIRECT_TOKEN_PATTERN)?.[0] || '';
    if (token) {
      return token;
    }
  }

  return '';
}

export function extractPublicSlugFromText(text) {
  const source = normalizeImportText(text);
  if (!source) {
    return '';
  }

  const collapsedSource = collapseWhitespace(source);

  for (const candidateSource of [source, collapsedSource]) {
    if (/^https?:\/\//i.test(candidateSource)) {
      try {
        const parsed = new URL(normalizeUrlCandidate(candidateSource));
        const slug = readPublicSlugFromPathname(parsed.pathname);
        if (slug) {
          return decodeURIComponent(slug);
        }
      } catch {
        continue;
      }
    }

    const directPathMatch = candidateSource.match(/^\/?p\/([^?#\s]+)/i);
    if (directPathMatch?.[1]) {
      return decodeURIComponent(directPathMatch[1]);
    }
  }

  for (const candidateSource of [source, collapsedSource]) {
    for (const match of candidateSource.matchAll(URL_PATTERN)) {
      try {
        const parsed = new URL(normalizeUrlCandidate(match[0]));
        const slug = readPublicSlugFromPathname(parsed.pathname);
        if (slug) {
          return decodeURIComponent(slug);
        }
      } catch {
        continue;
      }
    }
  }

  if (
    /^[a-z0-9]+(?:-[a-z0-9]+)+$/i.test(collapsedSource) &&
    !DIRECT_TOKEN_PATTERN.test(collapsedSource)
  ) {
    return collapsedSource.toLowerCase();
  }

  return '';
}

export function decodePublicPayloadFromText(text) {
  const token = extractPublicTokenFromText(text);
  if (!token) {
    throw new Error('公開URLまたは公開コードを入力してください。');
  }

  try {
    return normalizePublicPayload(decodeSharePayloadToken(token));
  } catch (publicDecodeError) {
    try {
      return convertSharePayloadToPublicPayload(decodeSharePayloadFromText(text));
    } catch {
      throw publicDecodeError;
    }
  }
}
