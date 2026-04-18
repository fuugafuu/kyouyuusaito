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
