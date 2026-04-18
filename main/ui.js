import { DEFAULT_PROFILE_ICON, DEFAULT_PROFILE_NAME, EMPTY_ARTICLE_TITLE } from '../common/constants.js';
import { extractAttachmentReferences } from '../common/markup.js';
import { formatDateTime } from '../common/utils.js';

export function createUI(handlers) {
  const refs = {
    statusMessage: document.querySelector('#statusMessage'),
    storageModeBadge: document.querySelector('#storageModeBadge'),
    profileNameInput: document.querySelector('#profileNameInput'),
    profileIconInput: document.querySelector('#profileIconInput'),
    profileIconPreview: document.querySelector('#profileIconPreview'),
    liveProfileName: document.querySelector('#liveProfileName'),
    userKeyDisplay: document.querySelector('#userKeyDisplay'),
    saveProfileButton: document.querySelector('#saveProfileButton'),
    resetProfileIconButton: document.querySelector('#resetProfileIconButton'),
    autoSaveToggle: document.querySelector('#autoSaveToggle'),
    backupText: document.querySelector('#backupText'),
    exportBackupButton: document.querySelector('#exportBackupButton'),
    importBackupButton: document.querySelector('#importBackupButton'),
    newArticleButton: document.querySelector('#newArticleButton'),
    articleList: document.querySelector('#articleList'),
    articleTitleInput: document.querySelector('#articleTitleInput'),
    saveArticleButton: document.querySelector('#saveArticleButton'),
    deleteArticleButton: document.querySelector('#deleteArticleButton'),
    attachmentInput: document.querySelector('#attachmentInput'),
    attachmentList: document.querySelector('#attachmentList'),
    toolbarButtons: [...document.querySelectorAll('[data-command]')],
    tabButtons: [...document.querySelectorAll('[data-tab]')],
    articleContentInput: document.querySelector('#articleContentInput'),
    articlePreview: document.querySelector('#articlePreview'),
    generateShareButton: document.querySelector('#generateShareButton'),
    copyShareButton: document.querySelector('#copyShareButton'),
    shareUrlOutput: document.querySelector('#shareUrlOutput'),
    shareWarning: document.querySelector('#shareWarning'),
    articleMeta: document.querySelector('#articleMeta'),
  };

  refs.newArticleButton.addEventListener('click', () => handlers.onNewArticle?.());
  refs.saveArticleButton.addEventListener('click', () => handlers.onSaveArticle?.());
  refs.deleteArticleButton.addEventListener('click', () => handlers.onDeleteArticle?.());
  refs.autoSaveToggle.addEventListener('change', (event) =>
    handlers.onToggleAutoSave?.(event.target.checked),
  );
  refs.exportBackupButton.addEventListener('click', () => handlers.onExportBackup?.());
  refs.importBackupButton.addEventListener('click', () => handlers.onImportBackup?.());
  refs.generateShareButton.addEventListener('click', () => handlers.onGenerateShare?.());
  refs.copyShareButton.addEventListener('click', () => handlers.onCopyShare?.());
  refs.articleTitleInput.addEventListener('input', (event) =>
    handlers.onTitleInput?.(event.target.value),
  );

  refs.attachmentInput.addEventListener('change', (event) => {
    const files = [...(event.target.files || [])];
    handlers.onAttachmentFiles?.(files);
    event.target.value = '';
  });

  refs.articleList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-article-id]');
    if (!button) {
      return;
    }
    handlers.onSelectArticle?.(button.dataset.articleId || '');
  });

  refs.attachmentList.addEventListener('click', (event) => {
    const target = event.target.closest('[data-attachment-id]');
    if (!target) {
      return;
    }

    const attachmentId = target.dataset.attachmentId || '';
    const action = target.dataset.action || 'select';

    if (action === 'insert') {
      handlers.onInsertAttachment?.(attachmentId);
      return;
    }

    if (action === 'delete') {
      handlers.onDeleteAttachment?.(attachmentId);
      return;
    }

    handlers.onSelectAttachment?.(attachmentId);
  });

  return {
    refs,

    setStatus(message, type = 'info') {
      refs.statusMessage.textContent = message;
      refs.statusMessage.className = `status-message is-${type}`;
    },

    renderStorageMode(mode) {
      refs.storageModeBadge.textContent =
        mode === 'localstorage'
          ? '保存方式: localStorage フォールバック'
          : '保存方式: IndexedDB';
      refs.storageModeBadge.className = `storage-badge mode-${mode}`;
    },

    renderSettings(settings, mode) {
      refs.autoSaveToggle.checked = Boolean(settings?.autoSave);
      this.renderStorageMode(mode);
    },

    renderArticleList(articles, currentArticleId, dirty) {
      refs.articleList.innerHTML = '';

      if (!articles.length) {
        const empty = document.createElement('li');
        empty.className = 'empty-state';
        empty.textContent = '記事はまだありません。';
        refs.articleList.appendChild(empty);
        return;
      }

      for (const article of articles) {
        const item = document.createElement('li');
        item.className = 'article-item';

        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.articleId = article.id;
        button.className = 'article-link';
        button.classList.toggle('is-active', article.id === currentArticleId);

        const title = document.createElement('span');
        title.className = 'article-link-title';
        title.textContent = article.title || EMPTY_ARTICLE_TITLE;

        const meta = document.createElement('span');
        meta.className = 'article-link-meta';
        meta.textContent = `更新: ${formatDateTime(article.updatedAt)}`;

        button.append(title, meta);

        if (dirty && article.id === currentArticleId) {
          const badge = document.createElement('span');
          badge.className = 'draft-badge';
          badge.textContent = '未保存';
          button.appendChild(badge);
        }

        item.appendChild(button);
        refs.articleList.appendChild(item);
      }
    },

    renderCurrentArticle(article, dirty) {
      const hasArticle = Boolean(article);
      refs.articleTitleInput.disabled = !hasArticle;
      refs.articleContentInput.disabled = !hasArticle;
      refs.saveArticleButton.disabled = !hasArticle;
      refs.deleteArticleButton.disabled = !hasArticle;
      refs.generateShareButton.disabled = !hasArticle;

      refs.articleTitleInput.value = article?.title || '';
      refs.articleMeta.textContent = hasArticle
        ? `${dirty ? '編集中 / ' : ''}最終保存: ${formatDateTime(article.updatedAt)}`
        : '記事が選択されていません。';
    },

    renderAttachments(attachments, selectedAttachmentId, articleContent) {
      refs.attachmentList.innerHTML = '';

      if (!attachments.length) {
        const empty = document.createElement('p');
        empty.className = 'empty-state';
        empty.textContent = '添付画像はまだありません。';
        refs.attachmentList.appendChild(empty);
        return;
      }

      const referencedIds = new Set(extractAttachmentReferences(articleContent || ''));

      for (const attachment of attachments) {
        const card = document.createElement('article');
        card.className = 'attachment-card';
        card.classList.toggle('is-selected', attachment.id === selectedAttachmentId);

        const image = document.createElement('img');
        image.src = attachment.data;
        image.alt = attachment.name;
        image.className = 'attachment-thumb';
        image.dataset.attachmentId = attachment.id;
        image.dataset.action = 'select';

        const name = document.createElement('h3');
        name.className = 'attachment-name';
        name.textContent = attachment.name;

        const badge = document.createElement('p');
        badge.className = 'attachment-usage';
        badge.textContent = referencedIds.has(attachment.id) ? '本文で使用中' : '未挿入';

        const buttonRow = document.createElement('div');
        buttonRow.className = 'attachment-actions';

        const selectButton = document.createElement('button');
        selectButton.type = 'button';
        selectButton.textContent = '選択';
        selectButton.dataset.attachmentId = attachment.id;
        selectButton.dataset.action = 'select';

        const insertButton = document.createElement('button');
        insertButton.type = 'button';
        insertButton.textContent = '本文へ挿入';
        insertButton.dataset.attachmentId = attachment.id;
        insertButton.dataset.action = 'insert';

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.textContent = '削除';
        deleteButton.dataset.attachmentId = attachment.id;
        deleteButton.dataset.action = 'delete';
        deleteButton.className = 'danger-button';

        buttonRow.append(selectButton, insertButton, deleteButton);
        card.append(image, name, badge, buttonRow);
        refs.attachmentList.appendChild(card);
      }
    },

    renderShare(url, warnings = []) {
      refs.shareUrlOutput.value = url || '';
      refs.copyShareButton.disabled = !url;
      refs.shareWarning.textContent = warnings.join(' ');
      refs.shareWarning.className = warnings.length ? 'warning-text' : 'muted-text';
    },

    renderBackupText(text) {
      refs.backupText.value = text || '';
    },

    renderProfilePreview(profile) {
      refs.profileIconPreview.src = profile?.icon || DEFAULT_PROFILE_ICON;
      refs.liveProfileName.textContent = profile?.name || DEFAULT_PROFILE_NAME;
    },

    disableWorkspace(message) {
      refs.articleTitleInput.disabled = true;
      refs.articleContentInput.disabled = true;
      refs.saveArticleButton.disabled = true;
      refs.deleteArticleButton.disabled = true;
      refs.generateShareButton.disabled = true;
      refs.attachmentInput.disabled = true;
      this.setStatus(message, 'error');
    },
  };
}
