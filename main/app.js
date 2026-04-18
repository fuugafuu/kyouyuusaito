import {
  AUTO_SAVE_INTERVAL_MS,
  SHARE_FILE_EXTENSION,
  SHARE_URL_WARN_LENGTH,
} from '../common/constants.js';
import { createEmptyArticle } from '../common/models.js';
import { runPublicationAudit } from '../common/moderation.js';
import {
  copyText,
  downloadTextFile,
  ensureUserKey,
  serializeError,
} from '../common/utils.js';
import { createAttachmentsFromFiles, removeAttachmentFromArticle } from './attachments.js';
import { exportBackupString, restoreBackupString } from './backup.js';
import { createEditorController } from './editor.js';
import { createProfileController } from './profile.js';
import { buildShareBundle, buildSharePackageText, getShareWarnings } from './share.js';
import {
  createMainState,
  getCurrentArticle,
  removeArticle,
  sortArticlesInState,
  upsertArticle,
} from './state.js';
import { createStorageService } from './storage.js';
import { createUI } from './ui.js';

const state = createMainState();
const VIEW_NAMES = new Set(['dashboard', 'compose', 'preview', 'settings']);

let storage = null;
let ui = null;
let editor = null;
let profileController = null;

function getAttachmentCount() {
  return state.articles.reduce((count, article) => count + (article.attachmentIds?.length || 0), 0);
}

function sanitizeFilenamePart(value) {
  return String(value || 'scp-share')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 60);
}

function setCurrentView(view, { syncHash = true } = {}) {
  state.currentView = VIEW_NAMES.has(view) ? view : 'dashboard';
  ui.setView(state.currentView);

  if (syncHash) {
    history.replaceState(null, '', `#${state.currentView}`);
  }
}

function invalidateShareBundle() {
  state.lastShareBundle = null;
}

function resetPublicationState(article) {
  return {
    ...article,
    publicationStatus: 'draft',
    publicToken: '',
    publicUrl: '',
    publishedAt: 0,
    reviewedAt: 0,
    moderationReport: null,
  };
}

function updateComposeMetaText(article) {
  if (!ui?.refs?.articleMeta) {
    return;
  }

  if (!article) {
    ui.refs.articleMeta.textContent = '記事が選択されていません。';
    return;
  }

  const designation = article.articleNumber ? `${article.series}-${String(article.articleNumber).padStart(3, '0')}` : article.series;
  ui.refs.articleMeta.textContent = `${state.dirty ? '未保存 / ' : ''}${designation} / 最終更新: ${new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(article.updatedAt)}`;
}

function renderWorkspace({ preserveEditor = false } = {}) {
  const article = getCurrentArticle(state);

  ui.setView(state.currentView);
  ui.renderSettings(state.settings, state.storageMode);
  ui.renderProfilePreview(state.profile);
  ui.renderArticleList(state.articles, state.currentArticleId, state.dirty);
  ui.renderAttachments(state.currentAttachments, state.selectedAttachmentId, article?.content || '');
  ui.renderPreviewView(article, state.currentAttachments, state.profile);
  ui.renderPublication(article);
  ui.renderDashboard({
    articles: state.articles,
    currentArticle: article,
    attachmentCount: getAttachmentCount(),
    dirty: state.dirty,
    lastShareBundle: state.lastShareBundle,
  });
  ui.renderShare(state.lastShareBundle, state.lastShareBundle?.warnings || []);

  if (!preserveEditor) {
    ui.renderCurrentArticle(article, state.dirty);
    editor.setContent(article?.content || '');
    editor.setTab(state.currentTab);
  } else {
    updateComposeMetaText(article);
  }

  editor.setAttachments(state.currentAttachments);
}

async function loadCurrentAttachments() {
  const article = getCurrentArticle(state);
  state.currentAttachments = article ? await storage.listAttachmentsByArticle(article.id) : [];
  state.selectedAttachmentId = state.currentAttachments[0]?.id || '';
}

async function ensureInitialArticle() {
  if (state.articles.length > 0) {
    return;
  }

  const article = await storage.saveArticle(createEmptyArticle('新規記事 1'));
  state.articles = [article];
  state.currentArticleId = article.id;
}

async function loadAllData() {
  state.profile = await storage.getProfile();
  state.settings = await storage.getSettings();
  state.articles = await storage.listArticles();
  sortArticlesInState(state);
  await ensureInitialArticle();
  state.currentArticleId = state.currentArticleId || state.articles[0]?.id || '';
  state.dirty = false;
  invalidateShareBundle();
  await loadCurrentAttachments();
  profileController.setProfile(state.profile, state.userKey);
  renderWorkspace();
}

async function saveCurrentArticle({ silent = false, auto = false } = {}) {
  const article = getCurrentArticle(state);
  if (!article || state.isSaving) {
    return article;
  }

  state.isSaving = true;

  try {
    const savedArticle = await storage.saveArticle({
      ...article,
      attachmentIds: [...new Set(article.attachmentIds)],
      updatedAt: Date.now(),
    });

    upsertArticle(state, savedArticle);
    state.currentArticleId = savedArticle.id;
    state.dirty = false;
    renderWorkspace();

    if (!silent) {
      ui.setStatus(`${auto ? '自動' : ''}保存しました: ${savedArticle.title}`, 'success');
    }

    return savedArticle;
  } finally {
    state.isSaving = false;
  }
}

async function persistDraftBeforeTransition() {
  if (!state.dirty) {
    return true;
  }

  try {
    await saveCurrentArticle({ silent: true });
    return true;
  } catch (error) {
    ui.setStatus(`保存に失敗したため画面を切り替えられません: ${serializeError(error)}`, 'error');
    return false;
  }
}

function applyArticlePatch(patch, { preserveEditor = true } = {}) {
  const article = getCurrentArticle(state);
  if (!article) {
    return;
  }

  const nextArticle = resetPublicationState({
    ...article,
    ...patch,
  });

  upsertArticle(state, nextArticle);
  state.currentArticleId = nextArticle.id;
  state.dirty = true;
  invalidateShareBundle();
  renderWorkspace({ preserveEditor });
}

async function handleSelectArticle(articleId) {
  if (!articleId || articleId === state.currentArticleId) {
    return;
  }

  const canLeave = await persistDraftBeforeTransition();
  if (!canLeave) {
    return;
  }

  state.currentArticleId = articleId;
  state.dirty = false;
  invalidateShareBundle();
  await loadCurrentAttachments();
  renderWorkspace();
  ui.setStatus('記事を切り替えました。', 'info');
}

async function handleNewArticle() {
  const canLeave = await persistDraftBeforeTransition();
  if (!canLeave) {
    return;
  }

  const newArticle = await storage.saveArticle(createEmptyArticle(`新規記事 ${state.articles.length + 1}`));
  upsertArticle(state, newArticle);
  state.currentArticleId = newArticle.id;
  state.currentAttachments = [];
  state.selectedAttachmentId = '';
  state.dirty = false;
  invalidateShareBundle();
  setCurrentView('compose');
  renderWorkspace();
  ui.setStatus('新規記事を作成しました。', 'success');
}

async function handleDeleteArticle() {
  const article = getCurrentArticle(state);
  if (!article) {
    return;
  }

  if (!window.confirm(`「${article.title}」を削除します。添付画像もまとめて削除されます。`)) {
    return;
  }

  await storage.deleteAttachmentsByArticle(article.id);
  await storage.deleteArticle(article.id);
  removeArticle(state, article.id);
  await ensureInitialArticle();
  state.currentArticleId = state.articles[0]?.id || '';
  state.dirty = false;
  invalidateShareBundle();
  await loadCurrentAttachments();
  renderWorkspace();
  ui.setStatus('記事を削除しました。', 'success');
}

async function handleAttachmentFiles(files) {
  const article = getCurrentArticle(state);
  if (!article || files.length === 0) {
    return;
  }

  try {
    const result = await createAttachmentsFromFiles(files, article.id);
    for (const attachment of result.attachments) {
      const savedAttachment = await storage.saveAttachment(attachment);
      state.currentAttachments.push(savedAttachment);
      if (!article.attachmentIds.includes(savedAttachment.id)) {
        article.attachmentIds.push(savedAttachment.id);
      }
      state.selectedAttachmentId = savedAttachment.id;
    }

    const nextArticle = resetPublicationState({
      ...article,
      attachmentIds: [...new Set(article.attachmentIds)],
    });
    upsertArticle(state, nextArticle);
    state.currentArticleId = nextArticle.id;
    invalidateShareBundle();
    await saveCurrentArticle({ silent: true });
    renderWorkspace();

    if (result.warnings.length > 0) {
      ui.setStatus(result.warnings.join(' '), 'warning');
    } else {
      ui.setStatus(`${result.attachments.length} 枚の画像を追加しました。`, 'success');
    }
  } catch (error) {
    ui.setStatus(`添付画像の追加に失敗しました: ${serializeError(error)}`, 'error');
  }
}

function handleContentChange(content) {
  applyArticlePatch({ content }, { preserveEditor: true });
}

function handleTitleInput(title) {
  applyArticlePatch({ title }, { preserveEditor: true });
}

function handleMetaChange(field, value) {
  if (field === 'articleNumber') {
    applyArticlePatch({ articleNumber: value ? Number(value) : null }, { preserveEditor: true });
    return;
  }

  applyArticlePatch({ [field]: value }, { preserveEditor: true });
}

function handleSelectAttachment(attachmentId) {
  state.selectedAttachmentId = attachmentId;
  renderWorkspace({ preserveEditor: true });
}

function insertSelectedAttachment() {
  const attachment =
    state.currentAttachments.find((item) => item.id === state.selectedAttachmentId) ||
    state.currentAttachments[0];

  if (!attachment) {
    ui.setStatus('先に添付画像を追加してください。', 'warning');
    return;
  }

  state.selectedAttachmentId = attachment.id;
  editor.insertAttachment(attachment);
}

async function handleDeleteAttachment(attachmentId) {
  const article = getCurrentArticle(state);
  const attachment = state.currentAttachments.find((item) => item.id === attachmentId);
  if (!article || !attachment) {
    return;
  }

  if (!window.confirm(`添付画像「${attachment.name}」を削除します。本文中の参照も削除されます。`)) {
    return;
  }

  await storage.deleteAttachment(attachmentId);
  state.currentAttachments = state.currentAttachments.filter((item) => item.id !== attachmentId);
  const nextArticle = resetPublicationState(removeAttachmentFromArticle(article, attachmentId));
  upsertArticle(state, nextArticle);
  state.currentArticleId = nextArticle.id;
  state.selectedAttachmentId = state.currentAttachments[0]?.id || '';
  invalidateShareBundle();
  await saveCurrentArticle({ silent: true });
  renderWorkspace();
  ui.setStatus('添付画像を削除しました。', 'success');
}

async function handleSaveProfile(profile) {
  state.profile = await storage.saveProfile(profile);
  profileController.setProfile(state.profile, state.userKey);
  renderWorkspace({ preserveEditor: true });
  ui.setStatus('プロフィールを保存しました。', 'success');
}

async function handleToggleAutoSave(autoSave) {
  state.settings = await storage.saveSettings({
    ...state.settings,
    autoSave,
  });
  renderWorkspace({ preserveEditor: true });
  ui.setStatus(`自動保存を${autoSave ? '有効' : '無効'}にしました。`, 'info');
}

async function handleExportBackup() {
  const text = await exportBackupString(storage, state.userKey);
  ui.renderBackupText(text);
  ui.setStatus('バックアップ文字列を生成しました。', 'success');
}

async function handleImportBackup() {
  const text = ui.refs.backupText.value.trim();
  if (!text) {
    ui.setStatus('復元するバックアップ文字列を貼り付けてください。', 'warning');
    return;
  }

  if (!window.confirm('現在の保存内容を上書きして復元します。よろしいですか。')) {
    return;
  }

  await restoreBackupString(storage, text, state.userKey);
  await loadAllData();
  ui.setStatus('バックアップから復元しました。', 'success');
}

async function handleGenerateShare() {
  const article = getCurrentArticle(state);
  if (!article) {
    ui.setStatus('共有対象の記事がありません。', 'warning');
    return;
  }

  try {
    ui.setStatus('共有データを最適化しています...', 'info');
    const bundle = await buildShareBundle({
      profile: state.profile,
      article,
      attachments: state.currentAttachments,
      currentUrl: window.location.href,
    });

    const warnings = getShareWarnings(bundle);
    state.lastShareBundle = {
      ...bundle,
      warnings,
    };

    setCurrentView('preview');
    renderWorkspace({ preserveEditor: true });

    ui.setStatus(
      warnings.length ? '共有URLを生成しました。警告も確認してください。' : '共有URLを生成しました。',
      warnings.length ? 'warning' : 'success',
    );
  } catch (error) {
    ui.setStatus(`共有URLの生成に失敗しました: ${serializeError(error)}`, 'error');
  }
}

async function handleCopyShare() {
  if (!state.lastShareBundle?.url) {
    ui.setStatus('先に共有URLを生成してください。', 'warning');
    return;
  }

  await copyText(state.lastShareBundle.url);
  ui.setStatus('共有URLをコピーしました。', 'success');
}

async function handleCopyShareCode() {
  if (!state.lastShareBundle?.token) {
    ui.setStatus('共有コードがまだありません。', 'warning');
    return;
  }

  await copyText(state.lastShareBundle.token);
  ui.setStatus('共有コードをコピーしました。', 'success');
}

async function handleCopySharePackage() {
  if (!state.lastShareBundle?.token) {
    ui.setStatus('共有データを先に生成してください。', 'warning');
    return;
  }

  await copyText(buildSharePackageText(state.lastShareBundle));
  ui.setStatus('共有パッケージをコピーしました。', 'success');
}

async function handleSystemShare() {
  if (!state.lastShareBundle?.url) {
    ui.setStatus('先に共有URLを生成してください。', 'warning');
    return;
  }

  if (typeof navigator.share !== 'function') {
    ui.setStatus('この端末では共有シートが使えません。', 'warning');
    return;
  }

  const article = getCurrentArticle(state);
  const filename = `${sanitizeFilenamePart(article?.title || 'scp-share')}${SHARE_FILE_EXTENSION}`;
  const shareFile =
    typeof File === 'function'
      ? new File([state.lastShareBundle.token], filename, {
          type: 'text/plain;charset=utf-8',
        })
      : null;

  const usePackageFallback = (state.lastShareBundle.metrics?.urlLength || 0) > SHARE_URL_WARN_LENGTH;
  const shareData = {
    title: article?.title || 'SCP Share',
    text: usePackageFallback
      ? buildSharePackageText(state.lastShareBundle)
      : 'SCP Sandbox Editor から共有された記事です。',
    url: usePackageFallback ? state.lastShareBundle.baseViewerUrl : state.lastShareBundle.url,
  };

  if (shareFile && navigator.canShare?.({ files: [shareFile] })) {
    shareData.files = [shareFile];
  }

  try {
    await navigator.share(shareData);
    ui.setStatus('端末の共有シートを開きました。', 'success');
  } catch (error) {
    if (error?.name === 'AbortError') {
      return;
    }

    ui.setStatus(`端末共有に失敗しました: ${serializeError(error)}`, 'error');
  }
}

function handleDownloadShare() {
  if (!state.lastShareBundle?.token) {
    ui.setStatus('共有コードがまだありません。', 'warning');
    return;
  }

  const article = getCurrentArticle(state);
  const filename = `${sanitizeFilenamePart(article?.title || 'scp-share')}${SHARE_FILE_EXTENSION}`;
  downloadTextFile(filename, state.lastShareBundle.token);
  ui.setStatus('共有ファイルを保存しました。', 'success');
}

function handleOpenShare() {
  if (!state.lastShareBundle?.url) {
    ui.setStatus('共有URLがまだありません。', 'warning');
    return;
  }

  window.open(state.lastShareBundle.url, '_blank', 'noopener,noreferrer');
}

async function handleRequestReview() {
  const article = getCurrentArticle(state);
  if (!article) {
    ui.setStatus('審査対象の記事がありません。', 'warning');
    return;
  }

  const report = runPublicationAudit({
    article,
    articles: state.articles,
  });

  const nextArticle = {
    ...article,
    publicationStatus: 'pending',
    moderationReport: report,
    publicToken: '',
    publicUrl: '',
    publishedAt: 0,
    reviewedAt: report.checkedAt,
  };

  upsertArticle(state, nextArticle);
  state.currentArticleId = nextArticle.id;
  state.dirty = false;
  await saveCurrentArticle({ silent: true });
  renderWorkspace();

  if (report.status === 'blocked') {
    ui.setStatus('審査用のローカルチェックで停止項目が見つかりました。Admin で確認してください。', 'warning');
  } else if (report.status === 'review') {
    ui.setStatus('審査待ちとして保存しました。Admin で確認してください。', 'warning');
  } else {
    ui.setStatus('審査待ちとして保存しました。', 'success');
  }

  setCurrentView('preview');
}

async function handleCopyPublicUrl() {
  const article = getCurrentArticle(state);
  if (!article?.publicUrl) {
    ui.setStatus('公開URLはまだありません。Admin で承認してください。', 'warning');
    return;
  }

  await copyText(article.publicUrl);
  ui.setStatus('公開URLをコピーしました。', 'success');
}

function handleOpenPublic() {
  const article = getCurrentArticle(state);
  if (!article?.publicUrl) {
    ui.setStatus('公開URLはまだありません。Admin で承認してください。', 'warning');
    return;
  }

  window.open(article.publicUrl, '_blank', 'noopener,noreferrer');
}

function handleOpenAdmin() {
  window.open('/admin', '_blank', 'noopener,noreferrer');
}

function startAutoSaveLoop() {
  window.setInterval(async () => {
    if (!state.settings?.autoSave || !state.dirty || state.isSaving) {
      return;
    }

    try {
      await saveCurrentArticle({ auto: true });
    } catch (error) {
      ui.setStatus(`自動保存に失敗しました: ${serializeError(error)}`, 'error');
    }
  }, AUTO_SAVE_INTERVAL_MS);
}

function setupBeforeUnload() {
  window.addEventListener('beforeunload', (event) => {
    if (!state.dirty) {
      return;
    }

    event.preventDefault();
    event.returnValue = '';
  });
}

function setupHashRouting() {
  const initialHash = window.location.hash.replace(/^#/, '');
  if (VIEW_NAMES.has(initialHash)) {
    state.currentView = initialHash;
  }

  window.addEventListener('hashchange', () => {
    const nextHash = window.location.hash.replace(/^#/, '');
    if (!VIEW_NAMES.has(nextHash) || nextHash === state.currentView) {
      return;
    }

    state.currentView = nextHash;
    renderWorkspace({ preserveEditor: true });
  });
}

async function init() {
  ui = createUI({
    onNewArticle: handleNewArticle,
    onSelectArticle: handleSelectArticle,
    onSaveArticle: () => saveCurrentArticle(),
    onDeleteArticle: handleDeleteArticle,
    onAttachmentFiles: handleAttachmentFiles,
    onTitleInput: handleTitleInput,
    onMetaChange: handleMetaChange,
    onSelectAttachment: handleSelectAttachment,
    onInsertAttachment: (attachmentId) => {
      handleSelectAttachment(attachmentId);
      insertSelectedAttachment();
    },
    onDeleteAttachment: handleDeleteAttachment,
    onToggleAutoSave: handleToggleAutoSave,
    onExportBackup: handleExportBackup,
    onImportBackup: handleImportBackup,
    onGenerateShare: handleGenerateShare,
    onCopyShare: handleCopyShare,
    onCopySharePackage: handleCopySharePackage,
    onCopyShareCode: handleCopyShareCode,
    onSystemShare: handleSystemShare,
    onDownloadShare: handleDownloadShare,
    onOpenShare: handleOpenShare,
    onRequestReview: handleRequestReview,
    onCopyPublicUrl: handleCopyPublicUrl,
    onOpenPublic: handleOpenPublic,
    onOpenAdmin: handleOpenAdmin,
    onViewChange: (view) => setCurrentView(view),
  });

  profileController = createProfileController({
    nameInput: ui.refs.profileNameInput,
    iconInput: ui.refs.profileIconInput,
    iconPreview: ui.refs.profileIconPreview,
    liveName: ui.refs.liveProfileName,
    userKeyText: ui.refs.userKeyDisplay,
    saveButton: ui.refs.saveProfileButton,
    resetButton: ui.refs.resetProfileIconButton,
    onSave: handleSaveProfile,
    onStatus: (message, type) => ui.setStatus(message, type),
  });

  editor = createEditorController({
    textarea: ui.refs.articleContentInput,
    preview: ui.refs.articlePreview,
    tabButtons: ui.refs.tabButtons,
    toolbarButtons: ui.refs.toolbarButtons,
    onChange: handleContentChange,
    onImageCommand: insertSelectedAttachment,
    onTabChange: (tab) => {
      state.currentTab = tab;
    },
  });

  try {
    setupHashRouting();
    state.userKey = ensureUserKey();
    storage = await createStorageService(state.userKey);
    state.storageMode = storage.mode;
    await loadAllData();
    startAutoSaveLoop();
    setupBeforeUnload();

    if (state.storageMode === 'localstorage') {
      ui.setStatus('IndexedDB が使えなかったため localStorage フォールバックで保存しています。', 'warning');
    } else {
      ui.setStatus('IndexedDB で初期化しました。', 'success');
    }
  } catch (error) {
    ui.disableWorkspace(`初期化に失敗しました: ${serializeError(error)}`);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
