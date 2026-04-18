import { DEFAULT_PROFILE_ICON } from '../common/constants.js';
import { parseMarkupToHtml } from '../common/markup.js';
import { decodeSharePayloadFromLocation } from './decode.js';
import { setSanitizedHTML } from './sanitize.js';

const refs = {
  status: document.querySelector('#viewerStatus'),
  profileName: document.querySelector('#viewerProfileName'),
  profileIcon: document.querySelector('#viewerProfileIcon'),
  articleTitle: document.querySelector('#viewerArticleTitle'),
  articleContent: document.querySelector('#viewerArticleContent'),
  attachmentList: document.querySelector('#viewerAttachmentList'),
};

function showError(message) {
  refs.status.textContent = message;
  refs.status.className = 'viewer-status is-error';
  refs.articleTitle.textContent = '共有データを表示できませんでした';
  refs.articleContent.innerHTML = '';
  refs.attachmentList.innerHTML = '';
}

function renderAttachments(attachments) {
  refs.attachmentList.innerHTML = '';

  if (!attachments.length) {
    const empty = document.createElement('p');
    empty.className = 'muted-text';
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

function renderPayload(payload) {
  document.title = `${payload.article.title} | Shared SCP Viewer`;
  refs.status.textContent = 'これは共有ビューです。閲覧専用表示になります。';
  refs.status.className = 'viewer-status is-info';
  refs.profileName.textContent = payload.profile.name;
  refs.profileIcon.src = payload.profile.icon || DEFAULT_PROFILE_ICON;
  refs.articleTitle.textContent = payload.article.title;
  setSanitizedHTML(refs.articleContent, parseMarkupToHtml(payload.article.content, payload.attachments));
  renderAttachments(payload.attachments);
}

function init() {
  try {
    const payload = decodeSharePayloadFromLocation(window.location);
    renderPayload(payload);
  } catch (error) {
    showError(error instanceof Error ? error.message : '共有データの表示に失敗しました。');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
