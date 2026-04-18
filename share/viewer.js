import { DEFAULT_PROFILE_ICON } from '../common/constants.js';
import { parseMarkupToHtml } from '../common/markup.js';
import { readClipboardText, readTextFile } from '../common/utils.js';
import { decodeSharePayloadFromLocation, decodeSharePayloadFromText } from './decode.js';
import { setSanitizedHTML } from './sanitize.js';

const refs = {
  status: document.querySelector('#viewerStatus'),
  articleTitle: document.querySelector('#viewerArticleTitle'),
  importInput: document.querySelector('#viewerImportInput'),
  loadButton: document.querySelector('#viewerLoadButton'),
  pasteButton: document.querySelector('#viewerPasteButton'),
  fileInput: document.querySelector('#viewerFileInput'),
  clearButton: document.querySelector('#viewerClearButton'),
  resetButton: document.querySelector('#viewerResetButton'),
  entryUrl: document.querySelector('#viewerEntryUrl'),
  profileName: document.querySelector('#viewerProfileName'),
  profileIcon: document.querySelector('#viewerProfileIcon'),
  dataMode: document.querySelector('#viewerDataMode'),
  attachmentCount: document.querySelector('#viewerAttachmentCount'),
  sourceLabel: document.querySelector('#viewerSourceLabel'),
  summary: document.querySelector('#viewerSummary'),
  articleContent: document.querySelector('#viewerArticleContent'),
  attachmentList: document.querySelector('#viewerAttachmentList'),
};

function setStatus(message, type = 'info') {
  refs.status.textContent = message;
  refs.status.className = `viewer-status is-${type}`;
}

function setEmptyArticle(message) {
  refs.articleContent.innerHTML = '';
  const paragraph = document.createElement('p');
  paragraph.className = 'empty-preview';
  paragraph.textContent = message;
  refs.articleContent.appendChild(paragraph);
}

function renderAttachments(attachments) {
  refs.attachmentList.innerHTML = '';

  if (!attachments.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = '添付画像はありません。';
    refs.attachmentList.appendChild(empty);
    return;
  }

  for (const attachment of attachments) {
    const figure = document.createElement('figure');
    figure.className = 'viewer-attachment';

    const image = document.createElement('img');
    image.src = attachment.data;
    image.alt = attachment.name;

    const caption = document.createElement('figcaption');
    caption.textContent = attachment.name;

    figure.append(image, caption);
    refs.attachmentList.appendChild(figure);
  }
}

function resetViewerSurface() {
  document.title = 'SCP Shared Viewer';
  refs.articleTitle.textContent = '共有ビューア';
  refs.profileName.textContent = '匿名職員';
  refs.profileIcon.src = DEFAULT_PROFILE_ICON;
  refs.dataMode.textContent = 'Waiting';
  refs.attachmentCount.textContent = '0';
  refs.sourceLabel.textContent = 'No Data';
  refs.summary.textContent =
    '共有URL、共有コード、共有ファイルのいずれかを読み込むと閲覧専用の記事が表示されます。';
  setEmptyArticle('共有データを読み込むと本文がここに表示されます。危険な HTML はサニタイズしてから描画します。');
  renderAttachments([]);
}

function renderPayload(payload, sourceLabel) {
  const attachmentCount = payload.attachments.length;

  document.title = `${payload.article.title} | Shared SCP Viewer`;
  refs.articleTitle.textContent = payload.article.title;
  refs.profileName.textContent = payload.profile.name;
  refs.profileIcon.src = payload.profile.icon || DEFAULT_PROFILE_ICON;
  refs.dataMode.textContent = 'Read Only';
  refs.attachmentCount.textContent = String(attachmentCount);
  refs.sourceLabel.textContent = sourceLabel;
  refs.summary.textContent =
    attachmentCount > 0
      ? `閲覧専用の記事を復元しました。本文と参照画像 ${attachmentCount} 枚を表示しています。`
      : '閲覧専用の記事を復元しました。本文のみを表示しています。';

  setSanitizedHTML(refs.articleContent, parseMarkupToHtml(payload.article.content, payload.attachments));
  renderAttachments(payload.attachments);
}

function showDecodeError(message) {
  setStatus(message, 'error');
  refs.articleTitle.textContent = '共有データを表示できませんでした';
  refs.profileName.textContent = '匿名職員';
  refs.profileIcon.src = DEFAULT_PROFILE_ICON;
  refs.sourceLabel.textContent = 'Error';
  refs.dataMode.textContent = 'Invalid';
  refs.attachmentCount.textContent = '0';
  refs.summary.textContent = '共有コードが壊れているか、対応していない形式です。';
  setEmptyArticle('共有データの復元に失敗しました。');
  renderAttachments([]);
}

function getShortViewerUrl() {
  return new URL('/share', window.location.origin).toString();
}

function maybeStripShareQuery() {
  const current = new URL(window.location.href);
  if (!current.search && !current.hash) {
    return;
  }

  current.search = '';
  current.hash = '';
  history.replaceState(null, '', current.toString());
}

function loadPayloadFromText(text, sourceLabel) {
  try {
    const payload = decodeSharePayloadFromText(text);
    renderPayload(payload, sourceLabel);
    setStatus('共有データを読み込みました。', 'success');
  } catch (error) {
    showDecodeError(error instanceof Error ? error.message : '共有データの表示に失敗しました。');
  }
}

async function handlePaste() {
  try {
    const text = await readClipboardText();
    if (!text.trim()) {
      setStatus('クリップボードに共有データが見つかりませんでした。', 'warning');
      return;
    }

    refs.importInput.value = text;
    loadPayloadFromText(text, 'Clipboard');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'クリップボードの読み取りに失敗しました。', 'error');
  }
}

async function handleFileImport(file) {
  if (!file) {
    return;
  }

  try {
    const text = await readTextFile(file);
    refs.importInput.value = text;
    loadPayloadFromText(text, 'Share File');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '共有ファイルの読み込みに失敗しました。', 'error');
  }
}

function handleManualLoad() {
  const text = refs.importInput.value.trim();
  if (!text) {
    setStatus('共有URLまたは共有コードを入力してください。', 'warning');
    return;
  }

  loadPayloadFromText(text, 'Manual Import');
}

function handleClear() {
  refs.importInput.value = '';
  resetViewerSurface();
  setStatus('入力内容をクリアしました。', 'info');
}

function handleReset() {
  refs.importInput.value = '';
  maybeStripShareQuery();
  resetViewerSurface();
  setStatus('共有ビューアを初期状態へ戻しました。', 'info');
}

function setupActions() {
  refs.loadButton.addEventListener('click', handleManualLoad);
  refs.pasteButton.addEventListener('click', handlePaste);
  refs.fileInput.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    handleFileImport(file);
    event.target.value = '';
  });
  refs.clearButton.addEventListener('click', handleClear);
  refs.resetButton.addEventListener('click', handleReset);
  refs.importInput.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      handleManualLoad();
    }
  });
}

function init() {
  refs.entryUrl.textContent = `共有ビュー入口: ${getShortViewerUrl()}`;
  refs.profileIcon.src = DEFAULT_PROFILE_ICON;
  setupActions();
  resetViewerSurface();

  try {
    const payload = decodeSharePayloadFromLocation(window.location);
    renderPayload(payload, 'Direct URL');
    setStatus('URL から共有データを復元しました。', 'success');
  } catch (error) {
    const message = error instanceof Error ? error.message : '共有データの表示に失敗しました。';
    if (message === '共有データがまだ読み込まれていません。') {
      setStatus('共有URL、共有コード、共有ファイルのいずれかを読み込んでください。', 'info');
      return;
    }

    showDecodeError(message);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
