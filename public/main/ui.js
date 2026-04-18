import { DEFAULT_PROFILE_ICON, DEFAULT_PROFILE_NAME, EMPTY_ARTICLE_TITLE } from '../common/constants.js';
import { extractAttachmentReferences, parseMarkupToHtml } from '../common/markup.js';
import { buildArticleDesignation, buildArticleSlug } from '../common/publication.js';
import { mountSandboxedArticleFrame } from '../common/render-frame.js';
import { setSanitizedHTML } from '../common/sanitize.js';
import { formatDateTime } from '../common/utils.js';

const PUBLICATION_LABELS = {
  draft: '下書き',
  pending: '審査待ち',
  approved: '公開中',
  rejected: '差し戻し',
};

function renderEmptyState(container, text) {
  container.innerHTML = '';
  const empty = document.createElement('p');
  empty.className = 'empty-state';
  empty.textContent = text;
  container.appendChild(empty);
}

function createStatusPill(status) {
  const pill = document.createElement('span');
  pill.className = 'viewer-pill';
  pill.textContent = PUBLICATION_LABELS[status] || '下書き';
  return pill;
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
  meta.textContent = `${buildArticleDesignation(article)} / 更新: ${formatDateTime(article.updatedAt)}`;

  const status = document.createElement('span');
  status.className = 'muted-text';
  status.textContent = isCurrent ? '現在編集中' : `状態: ${PUBLICATION_LABELS[article.publicationStatus] || '下書き'}`;

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

function getPublicationSummary(article) {
  if (!article) {
    return '記事を選ぶと公開状態がここに表示されます。';
  }

  const designation = buildArticleDesignation(article);
  const slug = buildArticleSlug(article);

  if (article.publicationStatus === 'approved' && article.publicUrl) {
    return `${designation} / slug: ${slug} / 公開日時: ${formatDateTime(article.publishedAt)}`;
  }

  if (article.publicationStatus === 'pending') {
    return `${designation} は審査待ちです。Admin 画面で承認すると公開URLが確定します。`;
  }

  if (article.publicationStatus === 'rejected') {
    return `${designation} は差し戻し状態です。修正後に再度審査へ送ってください。`;
  }

  return `${designation} / slug: ${slug} / 公開前の下書きです。`;
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
    articleSeriesInput: document.querySelector('#articleSeriesInput'),
    articleNumberInput: document.querySelector('#articleNumberInput'),
    articleObjectClassInput: document.querySelector('#articleObjectClassInput'),
    articleSlugInput: document.querySelector('#articleSlugInput'),
    articleSummaryInput: document.querySelector('#articleSummaryInput'),
    articleCustomCssInput: document.querySelector('#articleCustomCssInput'),
    articleCustomJsInput: document.querySelector('#articleCustomJsInput'),
    publicationNote: document.querySelector('#publicationNote'),
    requestReviewButton: document.querySelector('#requestReviewButton'),
    requestReviewButtonAlt: document.querySelector('#requestReviewButtonAlt'),
    openAdminButton: document.querySelector('#openAdminButton'),
    openAdminButtonAlt: document.querySelector('#openAdminButtonAlt'),
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
    dashboardPendingCount: document.querySelector('#dashboardPendingCount'),
    dashboardApprovedCount: document.querySelector('#dashboardApprovedCount'),
    dashboardRecentList: document.querySelector('#dashboardRecentList'),
    dashboardShareSummary: document.querySelector('#dashboardShareSummary'),
    dashboardPublicSummary: document.querySelector('#dashboardPublicSummary'),
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
    publicPreviewFrame: document.querySelector('#publicPreviewFrame'),
    publicationStatusBadge: document.querySelector('#publicationStatusBadge'),
    publicationSummary: document.querySelector('#publicationSummary'),
    publicationIssueList: document.querySelector('#publicationIssueList'),
    publicUrlOutput: document.querySelector('#publicUrlOutput'),
    copyPublicUrlButton: document.querySelector('#copyPublicUrlButton'),
    openPublicButton: document.querySelector('#openPublicButton'),
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
  refs.autoSaveToggle.addEventListener('change', (event) => handlers.onToggleAutoSave?.(event.target.checked));
  refs.exportBackupButton.addEventListener('click', () => handlers.onExportBackup?.());
  refs.importBackupButton.addEventListener('click', () => handlers.onImportBackup?.());
  refs.generateShareButton.addEventListener('click', () => handlers.onGenerateShare?.());
  refs.copyShareButton.addEventListener('click', () => handlers.onCopyShare?.());
  refs.copySharePackageButton.addEventListener('click', () => handlers.onCopySharePackage?.());
  refs.systemShareButton.addEventListener('click', () => handlers.onSystemShare?.());
  refs.downloadShareButton.addEventListener('click', () => handlers.onDownloadShare?.());
  refs.copyShareCodeButton.addEventListener('click', () => handlers.onCopyShareCode?.());
  refs.openShareButton.addEventListener('click', () => handlers.onOpenShare?.());
  refs.copyPublicUrlButton.addEventListener('click', () => handlers.onCopyPublicUrl?.());
  refs.openPublicButton.addEventListener('click', () => handlers.onOpenPublic?.());
  refs.requestReviewButton.addEventListener('click', () => handlers.onRequestReview?.());
  refs.requestReviewButtonAlt.addEventListener('click', () => handlers.onRequestReview?.());
  refs.openAdminButton.addEventListener('click', () => handlers.onOpenAdmin?.());
  refs.openAdminButtonAlt.addEventListener('click', () => handlers.onOpenAdmin?.());

  refs.articleTitleInput.addEventListener('input', (event) => handlers.onTitleInput?.(event.target.value));
  refs.articleSeriesInput.addEventListener('change', (event) => handlers.onMetaChange?.('series', event.target.value));
  refs.articleNumberInput.addEventListener('input', (event) => handlers.onMetaChange?.('articleNumber', event.target.value));
  refs.articleObjectClassInput.addEventListener('input', (event) => handlers.onMetaChange?.('objectClass', event.target.value));
  refs.articleSlugInput.addEventListener('input', (event) => handlers.onMetaChange?.('slug', event.target.value));
  refs.articleSummaryInput.addEventListener('input', (event) => handlers.onMetaChange?.('summary', event.target.value));
  refs.articleCustomCssInput.addEventListener('input', (event) => handlers.onMetaChange?.('customCss', event.target.value));
  refs.articleCustomJsInput.addEventListener('input', (event) => handlers.onMetaChange?.('customJs', event.target.value));

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
        mode === 'localstorage' ? '保存先: localStorage fallback' : '保存先: IndexedDB';
      refs.storageModeBadge.className = `storage-badge mode-${mode}`;
    },

    renderSettings(settings, mode) {
      refs.autoSaveToggle.checked = Boolean(settings?.autoSave);
      this.renderStorageMode(mode);
    },

    renderDashboard({ articles, currentArticle, attachmentCount, dirty, lastShareBundle }) {
      const pendingCount = articles.filter((article) => article.publicationStatus === 'pending').length;
      const approvedCount = articles.filter((article) => article.publicationStatus === 'approved').length;

      refs.dashboardHeroTitle.textContent = currentArticle
        ? `${currentArticle.title} を編集中`
        : 'SCP Sandbox Workspace';
      refs.dashboardHeroCopy.textContent = currentArticle
        ? '現在の記事を編集しながら、共有や公開準備までまとめて進められます。'
        : '記事の新規作成、共有URL生成、公開審査の準備をひとつの場所で扱えます。';
      refs.dashboardArticleCount.textContent = String(articles.length);
      refs.dashboardAttachmentCount.textContent = String(attachmentCount);
      refs.dashboardDraftState.textContent = dirty ? 'Unsaved' : 'Clean';
      refs.dashboardLastSaved.textContent = currentArticle ? formatDateTime(currentArticle.updatedAt) : '--';
      refs.dashboardPendingCount.textContent = String(pendingCount);
      refs.dashboardApprovedCount.textContent = String(approvedCount);

      if (!articles.length) {
        renderEmptyState(refs.dashboardRecentList, 'まだ記事がありません。');
      } else {
        refs.dashboardRecentList.innerHTML = '';
        articles.slice(0, 5).forEach((article) => {
          refs.dashboardRecentList.appendChild(createRecentArticleCard(article, article.id === currentArticle?.id));
        });
      }

      if (!lastShareBundle?.url) {
        refs.dashboardShareSummary.textContent = 'まだ共有URLは生成されていません。Preview 画面から生成できます。';
      } else {
        const warnings = lastShareBundle.warnings?.length ? `警告 ${lastShareBundle.warnings.length} 件` : '警告なし';
        refs.dashboardShareSummary.textContent = `最新共有URL長: ${lastShareBundle.metrics.urlLength} 文字 / 画像 ${lastShareBundle.metrics.usedAttachmentCount} 枚 / ${warnings}`;
      }

      const latestApproved = articles.find((article) => article.publicationStatus === 'approved' && article.publicUrl);
      if (!latestApproved) {
        refs.dashboardPublicSummary.textContent = 'まだ公開承認された記事はありません。Admin 画面で審査できます。';
      } else {
        refs.dashboardPublicSummary.textContent = `最新公開: ${buildArticleDesignation(latestApproved)} / ${latestApproved.title} / ${latestApproved.publicUrl}`;
      }
    },

    renderArticleList(articles, currentArticleId, dirty) {
      refs.articleList.innerHTML = '';

      if (!articles.length) {
        const empty = document.createElement('li');
        empty.className = 'empty-state';
        empty.textContent = '記事がまだありません。';
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
        meta.textContent = `${buildArticleDesignation(article)} / ${formatDateTime(article.updatedAt)}`;

        button.append(title, meta, createStatusPill(article.publicationStatus));

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
      refs.articleSeriesInput.disabled = !hasArticle;
      refs.articleNumberInput.disabled = !hasArticle;
      refs.articleObjectClassInput.disabled = !hasArticle;
      refs.articleSlugInput.disabled = !hasArticle;
      refs.articleSummaryInput.disabled = !hasArticle;
      refs.articleCustomCssInput.disabled = !hasArticle;
      refs.articleCustomJsInput.disabled = !hasArticle;
      refs.saveArticleButton.disabled = !hasArticle;
      refs.deleteArticleButton.disabled = !hasArticle;
      refs.generateShareButton.disabled = !hasArticle;
      refs.requestReviewButton.disabled = !hasArticle;
      refs.requestReviewButtonAlt.disabled = !hasArticle;

      refs.articleTitleInput.value = article?.title || '';
      refs.articleSeriesInput.value = article?.series || 'SCP';
      refs.articleNumberInput.value = article?.articleNumber ? String(article.articleNumber) : '';
      refs.articleObjectClassInput.value = article?.objectClass || '';
      refs.articleSlugInput.value = article?.slug || '';
      refs.articleSummaryInput.value = article?.summary || '';
      refs.articleCustomCssInput.value = article?.customCss || '';
      refs.articleCustomJsInput.value = article?.customJs || '';

      refs.articleMeta.textContent = hasArticle
        ? `${dirty ? '未保存 / ' : ''}${buildArticleDesignation(article)} / 最終更新: ${formatDateTime(article.updatedAt)}`
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
        badge.textContent = referencedIds.has(attachment.id) ? '本文で使用中' : '未参照';

        const buttonRow = document.createElement('div');
        buttonRow.className = 'attachment-actions';

        const selectButton = document.createElement('button');
        selectButton.type = 'button';
        selectButton.textContent = '選択';
        selectButton.dataset.attachmentId = attachment.id;
        selectButton.dataset.action = 'select';

        const insertButton = document.createElement('button');
        insertButton.type = 'button';
        insertButton.textContent = '本文へ';
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

    renderPreviewView(article, attachments, profile) {
      refs.previewArticleTitle.textContent = article?.title || 'プレビュー対象の記事がありません。';
      const referencedIds = new Set(extractAttachmentReferences(article?.content || ''));
      const usedAttachments = attachments.filter((attachment) => referencedIds.has(attachment.id));

      refs.previewArticleMeta.textContent = article
        ? `${buildArticleDesignation(article)} / 最終更新: ${formatDateTime(article.updatedAt)} / 使用画像 ${usedAttachments.length} 枚`
        : '記事を選ぶとここに公開前プレビューと配布導線が表示されます。';

      if (!article) {
        refs.fullArticlePreview.innerHTML = '<p class="empty-preview">記事がありません。</p>';
        renderEmptyState(refs.previewAttachmentList, '使用中の添付はありません。');
        mountSandboxedArticleFrame(refs.publicPreviewFrame, {
          title: 'Preview',
          articleHtml: '<p class="empty-preview">記事がありません。</p>',
          badgeText: 'Sandboxed Runtime',
        });
        return;
      }

      const articleHtml = parseMarkupToHtml(article.content, attachments);
      setSanitizedHTML(refs.fullArticlePreview, articleHtml);

      mountSandboxedArticleFrame(refs.publicPreviewFrame, {
        title: article.title,
        designation: buildArticleDesignation(article),
        objectClass: article.objectClass,
        profileName: profile?.name || DEFAULT_PROFILE_NAME,
        summary: article.summary,
        articleHtml,
        customCss: article.customCss,
        customJs: article.customJs,
        badgeText: 'Public Runtime Sandbox',
      });

      if (!usedAttachments.length) {
        renderEmptyState(refs.previewAttachmentList, '使用中の添付はありません。');
      } else {
        refs.previewAttachmentList.innerHTML = '';
        usedAttachments.forEach((attachment) => {
          refs.previewAttachmentList.appendChild(createPreviewAttachmentCard(attachment));
        });
      }
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
        refs.shareStatsOutput.textContent = '共有データはまだ生成されていません。';
        return;
      }

      const stats = bundle.metrics;
      const savedKb = Math.round(((stats.savedAttachmentBytes || 0) + (stats.profileIconSavedBytes || 0)) / 1024);
      refs.shareStatsOutput.textContent = `URL ${stats.urlLength} 文字 / コード ${stats.tokenLength} 文字 / 使用画像 ${stats.usedAttachmentCount} 枚 / 最適化 ${stats.optimizedAttachmentCount} 枚 / プリセット ${stats.presetLabel} / 削減 ${savedKb}KB`;
    },

    renderPublication(article) {
      const status = article?.publicationStatus || 'draft';
      refs.publicationStatusBadge.textContent = PUBLICATION_LABELS[status] || '下書き';
      refs.publicationStatusBadge.className = 'viewer-pill';
      refs.publicationSummary.textContent = getPublicationSummary(article);
      refs.publicUrlOutput.value = article?.publicUrl || '';
      refs.copyPublicUrlButton.disabled = !article?.publicUrl;
      refs.openPublicButton.disabled = !article?.publicUrl;

      const noteParts = ['カスタム CSS / JS は sandbox iframe 内でのみ実行します。'];
      if (article?.customCss?.trim()) {
        noteParts.push('Custom CSS あり');
      }
      if (article?.customJs?.trim()) {
        noteParts.push('Custom JS あり');
      }
      refs.publicationNote.textContent = noteParts.join(' / ');

      refs.publicationIssueList.innerHTML = '';
      const issues = article?.moderationReport?.issues || [];
      if (!issues.length) {
        renderEmptyState(refs.publicationIssueList, '現在のローカル審査結果はありません。');
        return;
      }

      issues.forEach((issue) => {
        const item = document.createElement('article');
        item.className = `issue-item is-${issue.severity || 'info'}`;

        const heading = document.createElement('strong');
        heading.textContent = `${issue.code || 'note'} / ${issue.severity || 'info'}`;

        const body = document.createElement('p');
        body.className = 'muted-text';
        body.textContent = issue.message || '';

        item.append(heading, body);
        refs.publicationIssueList.appendChild(item);
      });
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
      refs.copyPublicUrlButton.disabled = true;
      refs.openPublicButton.disabled = true;
      this.setStatus(message, 'error');
    },
  };
}
