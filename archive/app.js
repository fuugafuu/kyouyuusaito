import { DEFAULT_PROFILE_NAME } from '../common/constants.js';
import { parseMarkupToHtml } from '../common/markup.js';
import { normalizePublicPayload } from '../common/models.js';
import {
  buildArticleDesignation,
  buildArticleSlug,
  buildCatalogRangeSummary,
  createCatalogRanges,
  formatArticleSlot,
  getArticleRatingSnapshot,
} from '../common/publication.js';
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
const PUBLIC_VOTE_CACHE_KEY = 'scpSandboxPublicVotes';
const MAX_CACHED_TOKENS = 12;
const LIBRARY_URL = '/data/library.json';
const RANGE_SIZE = 100;

const refs = {
  status: document.querySelector('#publicStatus'),
  title: document.querySelector('#publicTitle'),
  designation: document.querySelector('#publicDesignation'),
  objectClass: document.querySelector('#publicObjectClass'),
  author: document.querySelector('#publicAuthor'),
  source: document.querySelector('#publicSource'),
  summary: document.querySelector('#publicSummary'),
  archiveStats: document.querySelector('#publicArchiveStats'),
  rangeListScp: document.querySelector('#publicRangeListScp'),
  slotListScp: document.querySelector('#publicSlotListScp'),
  rangeListJp: document.querySelector('#publicRangeListJp'),
  slotListJp: document.querySelector('#publicSlotListJp'),
  importInput: document.querySelector('#publicImportInput'),
  loadButton: document.querySelector('#publicLoadButton'),
  pasteButton: document.querySelector('#publicPasteButton'),
  fileInput: document.querySelector('#publicFileInput'),
  clearButton: document.querySelector('#publicClearButton'),
  entryUrl: document.querySelector('#publicEntryUrl'),
  frame: document.querySelector('#publicArticleFrame'),
  attachmentList: document.querySelector('#publicAttachmentList'),
  ratingScore: document.querySelector('#publicRatingScore'),
  ratingMeta: document.querySelector('#publicRatingMeta'),
  voteUpButton: document.querySelector('#publicVoteUpButton'),
  voteDownButton: document.querySelector('#publicVoteDownButton'),
};

const state = {
  library: null,
  activeRangeIndexBySeries: {
    SCP: 0,
    'SCP-JP': 0,
  },
  currentSlug: '',
  currentPayload: null,
  currentLibraryEntry: null,
};

function getArticlesBySeries(series = 'SCP') {
  return (state.library?.articles || []).filter((article) => String(article.series || 'SCP') === series);
}

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

function updateNamedMeta(attribute, name, content) {
  let meta = document.querySelector(`meta[${attribute}="${name}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute(attribute, name);
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', content);
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
  updateNamedMeta('property', 'og:title', title);
  updateNamedMeta('property', 'og:description', description);
  updateNamedMeta('property', 'og:url', canonicalUrl);
  updateNamedMeta('name', 'twitter:title', title);
  updateNamedMeta('name', 'twitter:description', description);
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

function readVoteCache() {
  const cache = safeParseJSON(localStorage.getItem(PUBLIC_VOTE_CACHE_KEY) || '', null);
  return cache && typeof cache === 'object' ? cache : {};
}

function writeVoteCache(cache) {
  localStorage.setItem(PUBLIC_VOTE_CACHE_KEY, JSON.stringify(cache));
}

function getVoteRecord(slug) {
  return String(readVoteCache()?.[slug] || '');
}

function setVoteRecord(slug, value) {
  const cache = readVoteCache();
  cache[slug] = value;
  writeVoteCache(cache);
}

function findLibraryEntry(slug = '') {
  return state.library?.articles?.find((entry) => entry.slug === slug) || null;
}

function buildRatingSnapshot(source = {}, slug = '') {
  const base = getArticleRatingSnapshot(source);
  const localVote = getVoteRecord(slug);
  const up = base.up + (localVote === 'up' ? 1 : 0);
  const down = base.down + (localVote === 'down' ? 1 : 0);
  return {
    up,
    down,
    score: up - down,
  };
}

function renderRating() {
  const snapshot = buildRatingSnapshot(
    state.currentLibraryEntry?.ratingScore !== undefined
      ? state.currentLibraryEntry
      : state.currentPayload?.article || {},
    state.currentSlug,
  );
  const localVote = state.currentSlug ? getVoteRecord(state.currentSlug) : '';
  refs.ratingScore.textContent = `評価 ${snapshot.score >= 0 ? '+' : ''}${snapshot.score}`;
  refs.ratingMeta.textContent = `賛成 ${snapshot.up} / 反対 ${snapshot.down}`;
  refs.voteUpButton.disabled = !state.currentSlug || Boolean(localVote);
  refs.voteDownButton.disabled = !state.currentSlug || Boolean(localVote);
}

function resetSurface() {
  state.currentSlug = '';
  state.currentPayload = null;
  state.currentLibraryEntry = null;

  syncMetadata({
    title: 'Sandwich Box Archive',
    description:
      '公開された SCP 図鑑を短いURLで一覧・閲覧できる公開アーカイブ。スマホでも見やすく、検索エンジンにも載りやすい構成です。',
    canonicalUrl: getPublicHomeUrl(window.location.href),
  });

  refs.title.textContent = 'Sandwich Box Archive';
  refs.designation.textContent = 'SCP Archive';
  refs.objectClass.textContent = 'Object Class: Public';
  refs.author.textContent = 'Author: Sandwich Box';
  refs.source.textContent = 'Source: Static Archive';
  refs.summary.textContent =
    '公開済みの記事をここからすぐ読めます。番号一覧から開くことも、共有URLや共有コードを読み込むこともできます。';
  refs.attachmentList.innerHTML = '<p class="empty-state">添付画像はありません。</p>';
  refs.importInput.value = '';
  renderRating();

  mountSandboxedArticleFrame(refs.frame, {
    title: 'Sandwich Box Public Reader',
    articleHtml:
      '<p class="empty-preview">一覧から記事を選ぶか、共有URLや共有コードを読み込むと本文がここに表示されます。</p>',
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

function renderArchiveStats() {
  refs.archiveStats.innerHTML = '';
  const total = Number(state.library?.articles?.length || 0);
  const ranges = createCatalogRanges({ size: RANGE_SIZE });
  const scpArticles = getArticlesBySeries('SCP');
  const firstOpenRange = ranges.find((range) => buildCatalogRangeSummary(scpArticles, range).empty > 0);
  const jpCount = getArticlesBySeries('SCP-JP').length;

  [
    ['公開記事', String(total)],
    ['SCP-JP', String(jpCount)],
    ['表示範囲', '001-10000'],
    ['最初の空き', firstOpenRange ? firstOpenRange.label : 'なし'],
    ['スマホ対応', '対応済み'],
  ].forEach(([label, value]) => {
    const card = document.createElement('div');
    card.className = 'stats-pill';
    card.innerHTML = `<span class="muted-text">${label}</span><strong>${value}</strong>`;
    refs.archiveStats.appendChild(card);
  });
}

function renderRangeListForSeries(series, container) {
  container.innerHTML = '';
  const ranges = createCatalogRanges({ size: RANGE_SIZE });
  const articles = getArticlesBySeries(series);
  ranges.forEach((range, index) => {
    const summary = buildCatalogRangeSummary(articles, range);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'range-item';
    button.dataset.series = series;
    button.dataset.rangeIndex = String(index);
    button.classList.toggle('is-active', index === (state.activeRangeIndexBySeries[series] || 0));
    button.innerHTML = `<strong>${range.label}</strong><span class="muted-text">${summary.filled} 件 / 空き ${summary.empty}</span>`;
    container.appendChild(button);
  });
}

function renderRangeLists() {
  renderRangeListForSeries('SCP', refs.rangeListScp);
  renderRangeListForSeries('SCP-JP', refs.rangeListJp);
}

function renderSlotListForSeries(series, container) {
  container.innerHTML = '';
  const ranges = createCatalogRanges({ size: RANGE_SIZE });
  const activeRangeIndex = state.activeRangeIndexBySeries[series] || 0;
  const range = ranges[activeRangeIndex] || ranges[0];
  const summary = buildCatalogRangeSummary(getArticlesBySeries(series), range);

  summary.items.forEach((entry) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `slot-item ${entry.article ? 'is-filled' : 'is-empty'}`;
    button.dataset.series = series;
    button.dataset.slug = entry.article?.slug || '';
    button.disabled = !entry.article;

    const title = document.createElement('strong');
    title.textContent = entry.article
      ? `${formatArticleSlot(entry.number)} ${entry.article.title}`
      : `${formatArticleSlot(entry.number)} [未公開]`;

    const meta = document.createElement('span');
    meta.className = 'muted-text';
    meta.textContent = entry.article
      ? `${buildArticleDesignation(entry.article)} / ${entry.article.objectClass || '--'}`
      : `${series} / 未登録`;

    button.append(title, meta);
    container.appendChild(button);
  });
}

function renderSlotLists() {
  renderSlotListForSeries('SCP', refs.slotListScp);
  renderSlotListForSeries('SCP-JP', refs.slotListJp);
}

function renderPayload(payload, sourceLabel, { slug = '' } = {}) {
  const designation = buildArticleDesignation(payload.article);
  const articleSlug = slug || buildArticleSlug(payload.article);
  const articleHtml = parseMarkupToHtml(payload.article.content, payload.attachments);
  const summary =
    payload.article.summary ||
    stripPreviewText(payload.article.content).slice(0, 150) ||
    '公開記事の本文を表示しています。';

  state.currentSlug = articleSlug;
  state.currentPayload = payload;
  state.currentLibraryEntry = findLibraryEntry(articleSlug);

  syncMetadata({
    title: `${designation} | ${payload.article.title} | Sandwich Box`,
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
  renderRating();
}

async function fetchLibrary() {
  if (state.library) {
    return state.library;
  }

  const response = await fetch(LIBRARY_URL, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('公開一覧の取得に失敗しました。');
  }

  state.library = await response.json();
  renderArchiveStats();
  renderRangeLists();
  renderSlotLists();
  return state.library;
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
    throw new Error('共有URLまたは共有コードを入力してください。');
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
      setStatus('クリップボードに共有データが見つかりません。', 'warning');
      return;
    }

    refs.importInput.value = text;
    await loadImportText(text, 'Clipboard');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '貼り付け読込に失敗しました。', 'error');
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
    setStatus(error instanceof Error ? error.message : '共有ファイルの読込に失敗しました。', 'error');
  }
}

async function handleManualLoad() {
  const text = refs.importInput.value.trim();
  if (!text) {
    setStatus('共有URLまたは共有コードを入力してください。', 'warning');
    return;
  }

  try {
    await loadImportText(text, 'Manual Import');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '共有データの読込に失敗しました。', 'error');
  }
}

function handleClear() {
  history.replaceState(null, '', '/');
  resetSurface();
  setStatus('表示をクリアしました。', 'info');
}

function handleVote(type) {
  if (!state.currentSlug) {
    return;
  }

  const existing = getVoteRecord(state.currentSlug);
  if (existing) {
    setStatus('この端末ではすでに評価済みです。', 'warning');
    renderRating();
    return;
  }

  setVoteRecord(state.currentSlug, type);
  renderRating();
  setStatus('この端末のローカル評価を保存しました。', 'success');
}

function setupActions() {
  refs.loadButton.addEventListener('click', handleManualLoad);
  refs.pasteButton.addEventListener('click', handlePaste);
  refs.clearButton.addEventListener('click', handleClear);
  refs.voteUpButton.addEventListener('click', () => handleVote('up'));
  refs.voteDownButton.addEventListener('click', () => handleVote('down'));
  refs.fileInput.addEventListener('change', (event) => {
    handleFile(event.target.files?.[0]);
    event.target.value = '';
  });
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-range-index]');
    if (!button) {
      return;
    }
    const series = String(button.dataset.series || 'SCP');
    state.activeRangeIndexBySeries[series] = Number(button.dataset.rangeIndex) || 0;
    renderRangeLists();
    renderSlotLists();
  });
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-slug]');
    const slug = String(button?.dataset?.slug || '');
    if (!slug) {
      return;
    }

    renderStaticSlug(slug).catch((error) => {
      const cachedToken = getCachedPublicToken(slug);
      if (cachedToken) {
        renderTokenText(cachedToken, 'Saved Public Link', {
          slug,
          keepCleanUrl: true,
        });
        return;
      }
      setStatus(error instanceof Error ? error.message : '公開記事の読込に失敗しました。', 'error');
    });
  });
}

function focusRangeForSlug(slug = '') {
  const article = findLibraryEntry(slug);
  if (!article?.articleNumber) {
    return;
  }

  const series = String(article.series || 'SCP');
  state.activeRangeIndexBySeries[series] = Math.max(0, Math.floor((article.articleNumber - 1) / RANGE_SIZE));
  renderRangeLists();
  renderSlotLists();
}

function isArchiveLandingPath(pathname = window.location.pathname) {
  const normalizedPath = String(pathname || '').replace(/\/+$/g, '') || '/';
  return normalizedPath === '/' || normalizedPath === '/archive' || normalizedPath === '/archive/index.html';
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

    if (featuredSlug && isArchiveLandingPath(window.location.pathname)) {
      focusRangeForSlug(featuredSlug);
      await renderStaticSlug(featuredSlug);
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '公開一覧の取得に失敗しました。', 'error');
  }

  try {
    const route = readPublicRoute(window.location);
    if (route.mode === 'token') {
      focusRangeForSlug(route.slug);
      renderTokenText(route.value, 'Direct Public URL', { slug: route.slug });
      return;
    }

    if (route.mode === 'slug') {
      focusRangeForSlug(route.value);
      await renderStaticSlug(route.value);
      return;
    }

    setStatus('公開一覧または共有コードから記事を選択してください。', 'info');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '公開記事の読込に失敗しました。', 'error');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
