import { PUBLIC_QUERY_KEY, PUBLIC_SLUG_KEY } from '../common/constants.js';
import { normalizePublicPayload } from '../common/models.js';
import { readPublicSlugFromPathname } from '../common/routes.js';
import { decodeSharePayloadToken } from '../common/share-codec.js';
import { readHashParam } from '../common/utils.js';
import { decodeSharePayloadFromText } from '../share/decode.js';

const DIRECT_TOKEN_PATTERN = /\b(?:raw|lzw)\.[A-Za-z0-9_-]+\b/;
const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;

function normalizeUrlCandidate(value) {
  return String(value || '')
    .replace(/[\u300c\u300d\u300e\u300f`"'<>]+/g, '')
    .replace(/[),.!?]+$/g, '');
}

function normalizeImportText(value) {
  return String(value || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
}

function collapseWhitespace(value) {
  return normalizeImportText(value).replace(/\s+/g, '');
}

function collectTokenCandidates(text) {
  const source = normalizeImportText(text);
  const collapsedSource = collapseWhitespace(source);
  const candidates = new Set();

  [source, collapsedSource].forEach((value) => {
    if (!value) {
      return;
    }
    candidates.add(value);
    try {
      candidates.add(decodeURIComponent(value));
    } catch {
      // noop
    }
  });

  return [...candidates].filter(Boolean);
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
  const tokenSources = collectTokenCandidates(text);
  if (!tokenSources.length) {
    return '';
  }

  for (const source of tokenSources) {
    if (!/^https?:\/\//i.test(source)) {
      continue;
    }
    try {
      const parsed = new URL(normalizeUrlCandidate(source));
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

  for (const source of tokenSources) {
    const directTokenMatch = source.match(DIRECT_TOKEN_PATTERN);
    if (directTokenMatch) {
      return directTokenMatch[0];
    }
  }

  for (const candidateSource of tokenSources) {
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

  const lines = normalizeImportText(text)
    .split(/\r?\n/)
    .flatMap((line) => collectTokenCandidates(line))
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
  const tokenSources = collectTokenCandidates(text);
  if (!tokenSources.length) {
    return '';
  }

  for (const candidateSource of tokenSources) {
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

  for (const candidateSource of tokenSources) {
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

  const collapsed = collapseWhitespace(text);
  if (/^[a-z0-9]+(?:-[a-z0-9]+)+$/i.test(collapsed) && !DIRECT_TOKEN_PATTERN.test(collapsed)) {
    return collapsed.toLowerCase();
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
