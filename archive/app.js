import { DEFAULT_PROFILE_NAME } from '../common/constants.js';
import { parseMarkupToHtml } from '../common/markup.js';
import { normalizePublicPayload } from '../common/models.js';
import { buildArticleDesignation, buildArticleSlug } from '../common/publication.js';
import { buildPublicArticlePath, buildPublicArticleUrl, getPublicHomeUrl } from '../common/routes.js';
import { mountSandboxedArticleFrame } from '../common/render-frame.js';
import { readClipboardText, readTextFile, safeParseJSON } from '../common/utils.js';
import {
  decodePublicPayloadFromText,
  extractPublicSlugFromText,
  extractPublicTokenFromText,
  readPublicRoute,
} from './decode.js';

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

function renderAttachments(attachments) {
  refs.attachmentList.innerHTML = '';

  if (!attachments.length) {
    refs.attachmentList.innerHTML = '<p class="empty-state">添付画像はありません。</p>';
    return;
  }

  attachments.forEach((attachment) => {
    const figure = document.createElement('figure');
    figure.className = 'attachment-item';

    const image = document.createElement('img');
    image.src = attachment.data;
    image.alt = attachment.name;

    const caption = document.createElement('figcaption');
    caption.textContent = attachment.name;

    figure.append(image, caption);
    refs.attachmentList.appendChild(figure);
  });
}

function renderPayload(payload, sourceLabel, { slug = '' } = {}) {
  const designation = buildArticleDesignation(payload.article);
  const articleSlug = slug || buildArticleSlug(payload.article);
  const articleHtml = parseMarkupToHtml(payload.article.content, payload.attachments);
  const summary =
    payload.article.summary ||
    stripPreviewText(payload.article.content).slice(0, 150) ||
    '公開記事の本文を表示しています。';

  syncMetadata({
    title: `${payload.article.title} | Sandwich Box`,
    description: summary,
    canonicalUrl: buildPublicArticleUrl(articleSlug, {
      currentUrl: window.location.href,
    }),
  });

  refs.title.textContent = payload.article.title;
  refs.designation.textContent = designation;
  refs.objectClass.textContent = `Object Class: ${payload.article.objectClass || '--'}`;
  refs.author.textContent = `Author: ${payload.profile.name || DEFAULT_PROFILE_NAME}`;
  refs.source.textContent = `Source: ${sourceLabel}`;
  refs.summary.textContent = summary;

  mountSandboxedArticleFrame(refs.frame, {
    title: payload.article.title,
    designation,
    objectClass: payload.article.objectClass,
    profileName: payload.profile.name || DEFAULT_PROFILE_NAME,
    summary: payload.article.summary,
    articleHtml,
    customCss: payload.article.customCss,
    customJs: payload.article.customJs,
    badgeText: 'Public Runtime',
  });

  renderAttachments(payload.attachments);
}

function renderArchiveList(list) {
  refs.archiveList.innerHTML = '';

  if (!list.length) {
    refs.archiveList.innerHTML = '<p class="empty-state">公開記事はまだありません。</p>';
    return;
  }

  list.forEach((article) => {
    const slug = article.slug || buildArticleSlug(article);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'archive-item';
    button.dataset.slug = slug;

    const title = document.createElement('strong');
    title.textContent = article.designation || article.title;

    const meta = document.createElement('span');
    meta.className = 'muted-text';
    meta.textContent = `${article.title} / /p/${slug}`;

    button.append(title, meta);
    refs.archiveList.appendChild(button);
  });
}

async function fetchLibrary() {
  if (library) {
    return library;
  }

  const response = await fetch(LIBRARY_URL, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('公開一覧を取得できませんでした。');
  }

  library = await response.json();
  renderArchiveList(Array.isArray(library?.articles) ? library.articles : []);
  return library;
}

async function fetchStaticArticle(slug) {
  const normalizedSlug = buildArticleSlug({ slug });
  const response = await fetch(`/data/articles/${encodeURIComponent(normalizedSlug)}.json`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('指定された公開記事が見つかりませんでした。');
  }

  return normalizePublicPayload(await response.json());
}

async function renderStaticSlug(slug) {
  const payload = await fetchStaticArticle(slug);
  renderPayload(payload, 'Static Archive', { slug });
  history.replaceState(null, '', buildPublicArticlePath(slug));
  setStatus('公開アーカイブから記事を読み込みました。', 'success');
}

function renderTokenText(text, sourceLabel, { slug = '', keepCleanUrl = false } = {}) {
  const payload = decodePublicPayloadFromText(text);
  const articleSlug = slug || buildArticleSlug(payload.article);
  const token = extractPublicTokenFromText(text);

  cachePublicToken(articleSlug, token);
  renderPayload(payload, sourceLabel, { slug: articleSlug });
  if (keepCleanUrl) {
    history.replaceState(null, '', buildPublicArticlePath(articleSlug));
  }
  setStatus('共有データを表示しました。', 'success');
}

async function loadImportText(text, sourceLabel) {
  const normalizedText = String(text || '').trim();
  if (!normalizedText) {
    throw new Error('公開URLまたは共有コードを入力してください。');
  }

  const token = extractPublicTokenFromText(normalizedText);
  if (token) {
    renderTokenText(normalizedText, sourceLabel);
    return;
  }

  const slug = extractPublicSlugFromText(normalizedText);
  if (slug) {
    await renderStaticSlug(slug);
    return;
  }

  renderTokenText(normalizedText, sourceLabel);
}

async function handlePaste() {
  try {
    const text = await readClipboardText();
    if (!text.trim()) {
      setStatus('クリップボードに共有データが見つかりませんでした。', 'warning');
      return;
    }

    refs.importInput.value = text;
    await loadImportText(text, 'Clipboard');
  } catch (error) {
    setStatus(
      error instanceof Error ? error.message : 'クリップボードの読み取りに失敗しました。',
      'error',
    );
  }
}

async function handleFile(file) {
  if (!file) {
    return;
  }

  try {
    const text = await readTextFile(file);
    refs.importInput.value = text;
    await loadImportText(text, 'Public File');
  } catch (error) {
    setStatus(
      error instanceof Error ? error.message : '公開ファイルの読み込みに失敗しました。',
      'error',
    );
  }
}

async function handleManualLoad() {
  const text = refs.importInput.value.trim();
  if (!text) {
    setStatus('公開URLまたは共有コードを入力してください。', 'warning');
    return;
  }

  try {
    await loadImportText(text, 'Manual Import');
  } catch (error) {
    setStatus(
      error instanceof Error ? error.message : '公開データの読み込みに失敗しました。',
      'error',
    );
  }
}

function handleClear() {
  refs.importInput.value = '';
  history.replaceState(null, '', '/');
  resetSurface();
  setStatus('入力をクリアしました。', 'info');
}

function setupActions() {
  refs.loadButton.addEventListener('click', handleManualLoad);
  refs.pasteButton.addEventListener('click', handlePaste);
  refs.clearButton.addEventListener('click', handleClear);
  refs.fileInput.addEventListener('change', (event) => {
    handleFile(event.target.files?.[0]);
    event.target.value = '';
  });
  refs.archiveList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-slug]');
    if (!button) {
      return;
    }

    renderStaticSlug(button.dataset.slug).catch((error) => {
      const cachedToken = getCachedPublicToken(button.dataset.slug);
      if (cachedToken) {
        renderTokenText(cachedToken, 'Saved Public Link', {
          slug: button.dataset.slug,
          keepCleanUrl: true,
        });
        return;
      }
      setStatus(
        error instanceof Error ? error.message : '公開アーカイブの読み込みに失敗しました。',
        'error',
      );
    });
  });
}

async function init() {
  refs.entryUrl.textContent = `公開トップ: ${getPublicHomeUrl(window.location.href)}`;
  setupActions();
  resetSurface();

  try {
    const loadedLibrary = await fetchLibrary();
    const featuredSlug =
      loadedLibrary?.articles?.find((item) => item.featured)?.slug ||
      loadedLibrary?.articles?.[0]?.slug ||
      '';

    if (featuredSlug && window.location.pathname === '/') {
      await renderStaticSlug(featuredSlug);
    }
  } catch (error) {
    refs.archiveHint.textContent = `公開一覧の読み込みに失敗しました: ${
      error instanceof Error ? error.message : 'Unknown error'
    }`;
  }

  try {
    const route = readPublicRoute(window.location);
    if (route.mode === 'token') {
      renderTokenText(route.value, 'Direct Public URL', {
        slug: route.slug,
      });
      return;
    }

    if (route.mode === 'slug') {
      await renderStaticSlug(route.value);
      return;
    }

    setStatus('公開一覧または共有コードから記事を選択してください。', 'info');
  } catch (error) {
    setStatus(
      error instanceof Error ? error.message : '公開記事の読み込みに失敗しました。',
      'error',
    );
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
