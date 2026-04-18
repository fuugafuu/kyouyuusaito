import { DEFAULT_PROFILE_NAME } from '../common/constants.js';
import { parseMarkupToHtml } from '../common/markup.js';
import { normalizePublicPayload } from '../common/models.js';
import { buildArticleDesignation, buildArticleSlug } from '../common/publication.js';
import { buildPublicArticlePath, buildPublicArticleUrl, getPublicHomeUrl } from '../common/routes.js';
import { mountSandboxedArticleFrame } from '../common/render-frame.js';
import { readClipboardText, readTextFile, safeParseJSON } from '../common/utils.js';
import { decodePublicPayloadFromText, extractPublicTokenFromText, readPublicRoute } from './decode.js';

const PUBLIC_TOKEN_CACHE_KEY = 'scpSandboxPublicTokenCache';
const MAX_CACHED_TOKENS = 12;
const LIBRARY_URL = '/data/library.json';

const refs = {
  status: document.querySelector('#publicStatus'),
  title: document.querySelector('#publicTitle'),
  designation: document.querySelector('#publicDesignation'),
  objectClass: document.querySelector('#publicObjectClass'),
  author: document.querySelector('#publicAuthor'),
  source: document.querySelector('#publicSource'),
  summary: document.querySelector('#publicSummary'),
  importInput: document.querySelector('#publicImportInput'),
  loadButton: document.querySelector('#publicLoadButton'),
  pasteButton: document.querySelector('#publicPasteButton'),
  fileInput: document.querySelector('#publicFileInput'),
  clearButton: document.querySelector('#publicClearButton'),
  archiveHint: document.querySelector('#publicArchiveHint'),
  archiveList: document.querySelector('#publicArchiveList'),
  entryUrl: document.querySelector('#publicEntryUrl'),
  frame: document.querySelector('#publicArticleFrame'),
  attachmentList: document.querySelector('#publicAttachmentList'),
};

let library = null;

function setStatus(message, type = 'info') {
  refs.status.textContent = message;
  refs.status.className = `public-status is-${type}`;
}

function getCanonicalLink() {
  let link = document.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  return link;
}

function getMetaDescription() {
  let meta = document.querySelector('meta[name="description"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'description');
    document.head.appendChild(meta);
  }
  return meta;
}

function stripPreviewText(value = '') {
  return String(value || '')
    .replace(/\[\[[^\]]+\]\]/g, ' ')
    .replace(/[`*_>#-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function syncMetadata({ title, description, canonicalUrl }) {
  document.title = title;
  getMetaDescription().setAttribute('content', description);
  getCanonicalLink().setAttribute('href', canonicalUrl);
}

function readPublicTokenCache() {
  const cache = safeParseJSON(localStorage.getItem(PUBLIC_TOKEN_CACHE_KEY) || '', null);
  return cache && typeof cache === 'object' ? cache : {};
}

function writePublicTokenCache(cache) {
  localStorage.setItem(PUBLIC_TOKEN_CACHE_KEY, JSON.stringify(cache));
}

function cachePublicToken(slug, token) {
  if (!slug || !token) {
    return;
  }

  const cache = readPublicTokenCache();
  cache[slug] = {
    token,
    updatedAt: Date.now(),
  };

  const orderedEntries = Object.entries(cache)
    .sort(([, left], [, right]) => (right?.updatedAt || 0) - (left?.updatedAt || 0))
    .slice(0, MAX_CACHED_TOKENS);

  writePublicTokenCache(Object.fromEntries(orderedEntries));
}

function getCachedPublicToken(slug) {
  return String(readPublicTokenCache()?.[slug]?.token || '').trim();
}

function resetSurface() {
  syncMetadata({
    title: 'Sandwich Box Archive',
    description: '短いURLと広いレイアウトで読める公開アーカイブ。',
    canonicalUrl: getPublicHomeUrl(window.location.href),
  });

  refs.title.textContent = 'Sandwich Box Archive';
  refs.designation.textContent = 'SCP Archive';
  refs.objectClass.textContent = 'Object Class: Public';
  refs.author.textContent = 'Author: Sandwich Box';
  refs.source.textContent = 'Source: Static Archive';
  refs.summary.textContent =
    '公開一覧からそのまま読める静的アーカイブです。共有コードや共有URLの貼り付けにも対応しつつ、別端末からは一覧ベースで素早く閲覧できます。';
  refs.attachmentList.innerHTML = '<p class="empty-state">添付画像はありません。</p>';

  mountSandboxedArticleFrame(refs.frame, {
    title: 'Sandwich Box Public Reader',
    articleHtml:
      '<p class="empty-preview">一覧から記事を選ぶか、共有URL・共有コードを読み込むと本文がここに表示されます。</p>',
    badgeText: 'Public Runtime',
  });
}
k�w��