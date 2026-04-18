import { DEFAULT_PROFILE_NAME, PUBLIC_SLUG_KEY } from '../common/constants.js';
import { parseMarkupToHtml } from '../common/markup.js';
import { normalizePublicPayload } from '../common/models.js';
import { buildArticleDesignation, buildArticleSlug } from '../common/publication.js';
import { mountSandboxedArticleFrame } from '../common/render-frame.js';
import { ensureUserKey, readClipboardText, readTextFile } from '../common/utils.js';
import { createStorageService } from '../main/storage.js';
import { decodePublicPayloadFromText, readPublicRoute } from './decode.js';

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

let storage = null;
let profile = null;
let articles = [];

function setStatus(message, type = 'info') {
  refs.status.textContent = message;
  refs.status.className = `public-status is-${type}`;
}

function resetSurface() {
  document.title = 'SCP Public Reader';
  refs.title.textContent = 'SCP Public Reader';
  refs.designation.textContent = '未選択';
  refs.objectClass.textContent = 'Object Class: --';
  refs.author.textContent = 'Author: --';
  refs.source.textContent = 'Source: --';
  refs.summary.textContent = '公開記事が読み込まれると、ここに要約が表示されます。';
  refs.attachmentList.innerHTML = '<p class="empty-state">添付画像はまだありません。</p>';
  mountSandboxedArticleFrame(refs.frame, {
    title: 'Public Reader',
    articleHtml: '<p class="empty-preview">公開記事を読み込むとここに表示されます。</p>',
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

function renderPayload(payload, sourceLabel) {
  const designation = buildArticleDesignation(payload.article);
  const articleHtml = parseMarkupToHtml(payload.article.content, payload.attachments);

  document.title = `${payload.article.title} | SCP Public Reader`;
  refs.title.textContent = payload.article.title;
  refs.designation.textContent = designation;
  refs.objectClass.textContent = `Object Class: ${payload.article.objectClass || '--'}`;
  refs.author.textContent = `Author: ${payload.profile.name || DEFAULT_PROFILE_NAME}`;
  refs.source.textContent = `Source: ${sourceLabel}`;
  refs.summary.textContent = payload.article.summary || '要約は設定されていません。';

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
    refs.archiveList.innerHTML = '<p class="empty-state">このブラウザではまだ承認済みの記事がありません。</p>';
    return;
  }

  list.forEach((article) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'archive-item';
    button.dataset.slug = buildArticleSlug(article);

    const title = document.createElement('strong');
    title.textContent = article.title;

    const meta = document.createElement('span');
    meta.className = 'muted-text';
    meta.textContent = `${buildArticleDesignation(article)} / ${buildArticleSlug(article)}`;

    button.append(title, meta);
    refs.archiveList.appendChild(button);
  });
}

async function refreshLocalArchive() {
  if (!storage) {
    storage = await createStorageService(ensureUserKey());
  }

  profile = await storage.getProfile();
  articles = await storage.listArticles();
  renderArchiveList(articles.filter((article) => article.publicationStatus === 'approved'));
}

async function renderLocalSlug(slug) {
  await refreshLocalArchive();
  const article = articles.find(
    (item) => item.publicationStatus === 'approved' && buildArticleSlug(item) === slug,
  );

  if (!article) {
    throw new Error('このブラウザ内に該当する公開記事が見つかりません。別端末共有には公開URLトークンを使ってください。');
  }

  const attachments = await storage.listAttachmentsByArticle(article.id);
  const payload = normalizePublicPayload({
    profile,
    article,
    attachments,
  });

  renderPayload(payload, 'Local Archive');
  history.replaceState(null, '', `${window.location.pathname}#${PUBLIC_SLUG_KEY}=${encodeURIComponent(slug)}`);
  setStatus('ローカル公開アーカイブから記事を読み込みました。', 'success');
}

function renderTokenText(text, sourceLabel) {
  const payload = decodePublicPayloadFromText(text);
  renderPayload(payload, sourceLabel);
  setStatus('公開データを復元しました。', 'success');
}

async function handlePaste() {
  try {
    const text = await readClipboardText();
    if (!text.trim()) {
      setStatus('クリップボードに公開データが見つかりませんでした。', 'warning');
      return;
    }

    refs.importInput.value = text;
    renderTokenText(text, 'Clipboard');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'クリップボードの読み取りに失敗しました。', 'error');
  }
}

async function handleFile(file) {
  if (!file) {
    return;
  }

  try {
    const text = await readTextFile(file);
    refs.importInput.value = text;
    renderTokenText(text, 'Public File');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '公開ファイルの読み込みに失敗しました。', 'error');
  }
}

function handleManualLoad() {
  const text = refs.importInput.value.trim();
  if (!text) {
    setStatus('公開URLまたは公開コードを入力してください。', 'warning');
    return;
  }

  renderTokenText(text, 'Manual Import');
}

function handleClear() {
  refs.importInput.value = '';
  history.replaceState(null, '', window.location.pathname);
  resetSurface();
  setStatus('公開ビューをクリアしました。', 'info');
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

    renderLocalSlug(button.dataset.slug).catch((error) => {
      setStatus(error instanceof Error ? error.message : 'ローカル公開記事を開けませんでした。', 'error');
    });
  });
}

async function init() {
  refs.entryUrl.textContent = `公開ビュー入口: ${new URL('/public', window.location.origin).toString()}`;
  setupActions();
  resetSurface();

  try {
    await refreshLocalArchive();
  } catch (error) {
    refs.archiveHint.textContent = `ローカル公開一覧を読み込めませんでした: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }

  try {
    const route = readPublicRoute(window.location);
    if (route.mode === 'token') {
      renderTokenText(route.value, 'Direct Public URL');
      return;
    }

    if (route.mode === 'slug') {
      await renderLocalSlug(route.value);
      return;
    }

    setStatus('公開URL、公開コード、またはローカル公開一覧から記事を選んでください。', 'info');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '公開記事の読み込みに失敗しました。', 'error');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
