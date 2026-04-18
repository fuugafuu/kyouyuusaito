import { DEFAULT_PROFILE_ICON, DEFAULT_PROFILE_NAME, EMPTY_ARTICLE_TITLE } from '../common/constants.js';
import { parseMarkupToHtml } from '../common/markup.js';
import { setSanitizedHTML } from '../common/sanitize.js';
import { extractAttachmentReferences } from '../common/markup.js';
import { formatDateTime } from '../common/utils.js';

function renderEmptyState(container, text) {
  container.innerHTML = '';
  const empty = document.createElement('p');
  empty.className = 'empty-state';
  empty.textContent = text;
  container.appendChild(empty);
}

function createRecentArticleCard(article, isCurrent) {
  const wrapper = document.createElement('article');
  wrapper.className = 'dashboard-article-card';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'dashboard-article-button';
  button.dataset.articleId = article.id;
  button.dataset.viewNext = 'compose';

  const title = document.createElement('strong');
  title.textContent = article.title || EMPTY_ARTICLE_TITLE;

  const meta = document.createElement('span');
  meta.className = 'muted-text';
  meta.textContent = `更新: ${formatDateTime(article.updatedAt)}`;

  const status = document.createElement('span');
  status.className = 'muted-text';
  status.textContent = isCurrent ? '現在編集中の記事' : 'クリックで編集画面へ';

  button.append(title, meta, status);
  wrapper.appendChild(button);
  return wrapper;
}

function createPreviewAttachmentCard(attachment) {
  const card = document.createElement('article');
  card.className = 'preview-attachment-card';

  const image = document.createElement('img');
  image.src = attachment.data;
  image.alt = attachment.name;

  const body = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = attachment.name;
  const meta = document.createElement('p');
  meta.className = 'muted-text';
  meta.textContent = attachment.mimeType || 'image/webp';

  body.append(title, meta);
  card.append(image, body);
  return card;
}

export function createUI(handlers) {
  const refs = {
    statusMessage: document.querySelector('#statusMessage'),
    storageModeBadge: document.querySelector('#storageModeBadge'),
    profileNameInput: document.querySelector('#profileNameInput'),
    profileIconInput: document.querySelector('#profileIconInput'),
    profileIconPreview: document.querySelector('#profileIconPreview'),
    liveProfileName: document.querySelector('#liveProfileName'),
    userKeyDisplay: document.querySelector('#userKeyDisplay'),
    settingsProfileMirror: document.querySelector('#settingsProfileMirror'),
    settingsProfileName: document.querySelector('#settingsProfileName'),
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
    navButtons: [...document.querySelectorAll('[data-view-nav]')],
    articleContentInput: document.querySelector('#articleContentInput'),
    articlePreview: document.querySelector('#articlePreview'),
    dashboardHeroTitle: document.querySelector('#dashboardHeroTitle'),
    dashboardHeroCopy: document.querySelector('#dashboardHeroCopy'),
    dashboardArticleCount: document.querySelector('#dashboardArticleCount'),
    dashboardAttachmentCount: document.querySelector('#dashboardAttachmentCount'),
    dashboardDraftState: document.querySelector('#dashboardDraftState'),
    dashboardLastSaved: document.querySelector('#dashboardLastSaved'),
    dashboardRecentList: document.querySelector('#dashboardRecentList'),
    dashboardShareSummary: document.querySelector('#dashboardShareSummary'),
    generateShareButton: document.querySelector('#generateShareButton'),
    copyShareButton: document.querySelector('#copyShareButton'),
    copySharePackageButton: document.querySelector('#copySharePackageButton'),
    systemShareButton: document.querySelector('#systemShareButton'),
    downloadShareButton: document.querySelector('#downloadShareButton'),
    copyShareCodeButton: document.querySelector('#copyShareCodeButton'),
    openShareButton: document.querySelector('#openShareButton'),
    shareUrlOutput: document.querySelector('#shareUrlOutput'),
    shareCodeOutput: document.querySelector('#shareCodeOutput'),
    shareWarning: document.querySelector('#shareWarning'),
    shareStatsOutput: document.querySelector('#shareStatsOutput'),
    articleMeta: document.querySelector('#articleMeta'),
    previewArticleTitle: document.querySelector('#previewArticleTitle'),
    previewArticleMeta: document.querySelector('#previewArticleMeta'),
    fullArticlePreview: document.querySelector('#fullArticlePreview'),
    previewAttachmentList: document.querySelector('#previewAttachmentList'),
    viewPanels: [...document.querySelectorAll('[data-view-panel]')],
  };

  const supportsSystemShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  if (!supportsSystemShare && refs.systemShareButton) {
    refs.systemShareButton.disabled = true;
    refs.systemShareButton.textContent = '端末共有非対応';
  }

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
  refs.copySharePackageButton.addEventListener('click', () => handlers.onCopySharePackage?.());
  refs.systemShareButton.addEventListener('click', () => handlers.onSystemShare?.());
  refs.downloadShareButton.addEventListener('click', () => handlers.onDownloadShare?.());
  refs.copyShareCodeButton.addEventListener('click', () => handlers.onCopyShareCode?.());
  refs.openShareButton.addEventListener('click', () => handlers.onOpenShare?.());
  refs.articleTitleInput.addEventListener('input', (event) =>
    handlers.onTitleInput?.(event.target.value),
  );

  refs.navButtons.forEach((button) => {
    button.addEventListener('click', () => {
      handlers.onViewChange?.(button.dataset.viewNav || 'dashboard');
    });
  });

  refs.attachmentInput.addEventListener('change', (event) => {
    const files = [...(event.target.files || [])];
    handlers.onAttachmentFiles?.(files);
    event.target.value = '';
  });

  const handleArticleSelectionClick = async (event) => {
    const button = event.target.closest('[data-article-id]');
    if (!button) {
      return;
    }

    await handlers.onSelectArticle?.(button.dataset.articleId || '');

    if (button.dataset.viewNext) {
      handlers.onViewChange?.(button.dataset.viewNext);
    }
  };

  refs.articleList.addEventListener('click', handleArticleSelectionClick);
  refs.dashboardRecentList.addEventListener('click', handleArticleSelectionClick);

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

    setView(view) {
      const nextView = view || 'dashboard';

      refs.viewPanels.forEach((panel) => {
        panel.classList.toggle('is-active', panel.dataset.viewPanel === nextView);
      });

      refs.navButtons.forEach((button) => {
        button.classList.toggle('is-active', button.dataset.viewNav === nextView);
      });
    },

    renderStorageMode(mode) {
      refs.storageModeBadge.textContent =
        mode === 'localstorage' ? '保存方式: localStorage フォールバック' : '保存方式: IndexedDB';
      refs.storageModeBadge.className = `storage-badge mode-${mode}`;
    },

    renderSettings(settings, mode) {
      refs.autoSaveToggle.checked = Boolean(settings?.autoSave);
      this.renderStorageMode(mode);
    },

    renderDashboard({ articles, currentArticle, attachmentCount, dirty, lastShareBundle }) {
      refs.dashboardHeroTitle.textContent = currentArticle
        ? `${currentArticle.title} を編集中`
        : 'SCP作成ワークスペース';
      refs.dashboardHeroCopy.textContent = currentArticle
        ? '現在の記事を起点に、作成画面とプレビュー画面を切り替えながら整えていけます。'
        : '記事の新規作成、閲覧確認、共有準備を段階的に進められます。';
      refs.dashboardArticleCount.textContent = String(articles.length);
      refs.dashboardAttachmentCount.textContent = String(attachmentCount);
      refs.dashboardDraftState.textContent = dirty ? 'Unsaved' : 'Clean';
      refs.dashboardLastSaved.textContent = currentArticle ? formatDateTime(currentArticle.updatedAt) : '--';

      if (!articles.length) {
        renderEmptyState(refs.dashboardRecentList, 'まだ記事がありません。');
      } else {
        refs.dashboardRecentList.innerHTML = '';
        articles.slice(0, 5).forEach((article) => {
          refs.dashboardRecentList.appendChild(
            createRecentArticleCard(article, article.id === currentArticle?.id),
          );
        });
      }

      if (!lastShareBundle?.url) {
        refs.dashboardShareSummary.textContent =
          '共有URLはまだ生成されていません。Preview 画面で共有形式を作成できます。';
        return;
      }

      const warnings = lastShareBundle.warnings?.length ? `警告 ${lastShareBundle.warnings.length}件` : '警告なし';
      refs.dashboardShareSummary.textContent = `直近の共有URL長: ${lastShareBundle.metrics.urlLength} 文字 / 画像 ${lastShareBundle.metrics.usedAttachmentCount} 点 / ${warnings}`;
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
        meta.textContent = formatDateTime(article.updatedAt);

        button.append(title, meta);

        if (dirty && article.id === currentArticleId) {
          const draft = document.createElement('span');
          draft.className = 'draft-badge';
          draft.textContent = '未保存';
          button.appendChild(draft);
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
        ? `${dirty ? '未保存 / ' : ''}最終更新: ${formatDateTime(article.updatedAt)}`
        : '記事が選択されていません。';
    },

    renderAttachments(attachments, selectedAttachmentId, articleContent) {
      refs.attachmentList.innerHTML = '';

      if (!attachments.length) {
        renderEmptyState(refs.attachmentList, '添付画像はまだありません。');
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

    renderPreviewView(article, attachments) {
      refs.previewArticleTitle.textContent = article?.title || 'プレビュー対象の記事がありません。';
      const referencedIds = new Set(extractAttachmentReferences(article?.content || ''));
      const usedAttachments = attachments.filter((attachment) => referencedIds.has(attachment.id));

      refs.previewArticleMeta.textContent = article
        ? `最終更新: ${formatDateTime(article.updatedAt)} / 使用画像 ${usedAttachments.length} 点`
        : '共有前の表示確認と共有形式の選択を行います。';

      if (!article) {
        refs.fullArticlePreview.innerHTML = '<p class="empty-preview">記事がありません。</p>';
        renderEmptyState(refs.previewAttachmentList, '使用中の画像はありません。');
        return;
      }

      setSanitizedHTML(refs.fullArticlePreview, parseMarkupToHtml(article.content, attachments));

      if (!usedAttachments.length) {
        renderEmptyState(refs.previewAttachmentList, '使用中の画像はありません。');
        return;
      }

      refs.previewAttachmentList.innerHTML = '';
      usedAttachments.forEach((attachment) => {
        refs.previewAttachmentList.appendChild(createPreviewAttachmentCard(attachment));
      });
    },

    renderShare(bundle, warnings = []) {
      refs.shareUrlOutput.value = bundle?.url || '';
      refs.shareCodeOutput.value = bundle?.token || '';
      refs.copyShareButton.disabled = !bundle?.url;
      refs.copySharePackageButton.disabled = !bundle?.token;
      refs.downloadShareButton.disabled = !bundle?.token;
      refs.systemShareButton.disabled = !bundle?.url || !supportsSystemShare;
      refs.copyShareCodeButton.disabled = !bundle?.token;
      refs.openShareButton.disabled = !bundle?.url;

      refs.shareWarning.textContent = warnings.join(' ');
      refs.shareWarning.className = warnings.length ? 'warning-text' : 'muted-text';

      if (!bundle?.metrics) {
        refs.shareStatsOutput.textContent = '共有情報はまだ生成されていません。';
        return;
      }

      const stats = bundle.metrics;
      const savedKb = Math.round(
        ((stats.savedAttachmentBytes || 0) + (stats.profileIconSavedBytes || 0)) / 1024,
      );

      refs.shareStatsOutput.textContent =
        `URL ${stats.urlLength} 文字 / コード ${stats.tokenLength} 文字 / 使用画像 ${stats.usedAttachmentCount} 点 / 最適化 ${stats.optimizedAttachmentCount} 点 / 圧縮モード ${stats.presetLabel} / 削減 約${savedKb}KB`;
    },

    renderBackupText(text) {
      refs.backupText.value = text || '';
    },

    renderProfilePreview(profile) {
      const icon = profile?.icon || DEFAULT_PROFILE_ICON;
      const name = profile?.name || DEFAULT_PROFILE_NAME;

      refs.profileIconPreview.src = icon;
      refs.liveProfileName.textContent = name;
      refs.settingsProfileMirror.src = icon;
      refs.settingsProfileMirror.alt = `${name} のプロフィール画像`;
      refs.settingsProfileName.textContent = name;
    },

    disableWorkspace(message) {
      refs.articleTitleInput.disabled = true;
      refs.articleContentInput.disabled = true;
      refs.saveArticleButton.disabled = true;
      refs.deleteArticleButton.disabled = true;
      refs.generateShareButton.disabled = true;
      refs.copyShareButton.disabled = true;
      refs.attachmentInput.disabled = true;
      refs.copySharePackageButton.disabled = true;
      refs.systemShareButton.disabled = true;
      refs.downloadShareButton.disabled = true;
      refs.copyShareCodeButton.disabled = true;
      refs.openShareButton.disabled = true;
      this.setStatus(message, 'error');
    },
  };
}
