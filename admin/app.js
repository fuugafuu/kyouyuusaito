import {
  clearAdminSession,
  hasAdminPasscode,
  isAdminSessionActive,
  setAdminPasscode,
  verifyAdminPasscode,
} from '../common/admin-auth.js';
import { runPublicationAudit } from '../common/moderation.js';
import { buildArticleDesignation, buildArticleSlug, buildPublicBundle, getPublicWarnings } from '../common/publication.js';
import { copyText, ensureUserKey, formatDateTime, serializeError } from '../common/utils.js';
import { createStorageService } from '../main/storage.js';

const refs = {
  status: document.querySelector('#adminStatus'),
  gateSection: document.querySelector('#adminGateSection'),
  workspace: document.querySelector('#adminWorkspace'),
  setupInput: document.querySelector('#adminSetupInput'),
  setupConfirmInput: document.querySelector('#adminSetupConfirmInput'),
  setupButton: document.querySelector('#adminSetupButton'),
  loginInput: document.querySelector('#adminLoginInput'),
  loginButton: document.querySelector('#adminLoginButton'),
  logoutButton: document.querySelector('#adminLogoutButton'),
  authHint: document.querySelector('#adminAuthHint'),
  totalCount: document.querySelector('#adminTotalCount'),
  pendingCount: document.querySelector('#adminPendingCount'),
  approvedCount: document.querySelector('#adminApprovedCount'),
  blockedCount: document.querySelector('#adminBlockedCount'),
  articleList: document.querySelector('#adminArticleList'),
  selectedTitle: document.querySelector('#adminSelectedTitle'),
  selectedMeta: document.querySelector('#adminSelectedMeta'),
  selectedSummary: document.querySelector('#adminSelectedSummary'),
  publicUrl: document.querySelector('#adminPublicUrl'),
  issueList: document.querySelector('#adminIssueList'),
  warningList: document.querySelector('#adminWarningList'),
  runAuditButton: document.querySelector('#adminRunAuditButton'),
  approveButton: document.querySelector('#adminApproveButton'),
  rejectButton: document.querySelector('#adminRejectButton'),
  draftButton: document.querySelector('#adminDraftButton'),
  copyPublicUrlButton: document.querySelector('#adminCopyPublicUrlButton'),
  openPublicButton: document.querySelector('#adminOpenPublicButton'),
  openEditorButton: document.querySelector('#adminOpenEditorButton'),
};

const state = {
  userKey: '',
  storage: null,
  profile: null,
  articles: [],
  selectedArticleId: '',
  warnings: [],
};

function setStatus(message, type = 'info') {
  refs.status.textContent = message;
  refs.status.className = `admin-status is-${type}`;
}

function getSelectedArticle() {
  return state.articles.find((article) => article.id === state.selectedArticleId) || null;
}

function renderEmptyList(container, text) {
  container.innerHTML = `<p class="muted-text">${text}</p>`;
}

function renderStats() {
  refs.totalCount.textContent = String(state.articles.length);
  refs.pendingCount.textContent = String(state.articles.filter((article) => article.publicationStatus === 'pending').length);
  refs.approvedCount.textContent = String(state.articles.filter((article) => article.publicationStatus === 'approved').length);
  refs.blockedCount.textContent = String(
    state.articles.filter((article) => article.moderationReport?.status === 'blocked').length,
  );
}

function renderQueue() {
  refs.articleList.innerHTML = '';

  if (!state.articles.length) {
    renderEmptyList(refs.articleList, 'まだ記事がありません。');
    return;
  }

  state.articles.forEach((article) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'queue-item';
    button.dataset.articleId = article.id;
    button.classList.toggle('is-active', article.id === state.selectedArticleId);

    const title = document.createElement('strong');
    title.textContent = article.title;

    const meta = document.createElement('span');
    meta.className = 'muted-text';
    meta.textContent = `${buildArticleDesignation(article)} / ${article.publicationStatus}`;

    const note = document.createElement('span');
    note.className = 'muted-text';
    note.textContent = article.moderationReport?.summary || '審査結果なし';

    button.append(title, meta, note);
    refs.articleList.appendChild(button);
  });
}

function renderIssues(report) {
  refs.issueList.innerHTML = '';
  const issues = report?.issues || [];
  if (!issues.length) {
    renderEmptyList(refs.issueList, '現在の審査結果はありません。');
    return;
  }

  issues.forEach((issue) => {
    const item = document.createElement('article');
    item.className = `issue-item is-${issue.severity || 'info'}`;

    const title = document.createElement('strong');
    title.textContent = `${issue.code || 'note'} / ${issue.severity || 'info'}`;

    const body = document.createElement('p');
    body.className = 'muted-text';
    body.textContent = issue.message || '';

    item.append(title, body);
    refs.issueList.appendChild(item);
  });
}

function renderWarnings(warnings = []) {
  refs.warningList.innerHTML = '';
  if (!warnings.length) {
    renderEmptyList(refs.warningList, '公開URL生成時の追加警告はありません。');
    return;
  }

  warnings.forEach((warning) => {
    const item = document.createElement('article');
    item.className = 'issue-item is-warning';
    const body = document.createElement('p');
    body.className = 'muted-text';
    body.textContent = warning;
    item.appendChild(body);
    refs.warningList.appendChild(item);
  });
}

function renderSelectedArticle() {
  const article = getSelectedArticle();

  refs.runAuditButton.disabled = !article;
  refs.approveButton.disabled = !article;
  refs.rejectButton.disabled = !article;
  refs.draftButton.disabled = !article;
  refs.copyPublicUrlButton.disabled = !article?.publicUrl;
  refs.openPublicButton.disabled = !article?.publicUrl;
  refs.openEditorButton.disabled = !article;

  if (!article) {
    refs.selectedTitle.textContent = '記事を選んでください';
    refs.selectedMeta.textContent = 'ここに記事の公開情報が表示されます。';
    refs.selectedSummary.textContent = 'ローカル審査の結果、公開URL、公開警告を確認できます。';
    refs.publicUrl.value = '';
    renderIssues(null);
    renderWarnings([]);
    return;
  }

  refs.selectedTitle.textContent = article.title;
  refs.selectedMeta.textContent = `${buildArticleDesignation(article)} / slug: ${buildArticleSlug(article)} / 状態: ${article.publicationStatus}`;
  refs.selectedSummary.textContent = [
    `Object Class: ${article.objectClass || '--'}`,
    `最終更新: ${formatDateTime(article.updatedAt)}`,
    `公開日時: ${article.publishedAt ? formatDateTime(article.publishedAt) : '未公開'}`,
    article.summary ? `要約: ${article.summary}` : '要約なし',
  ].join(' / ');
  refs.publicUrl.value = article.publicUrl || '';

  renderIssues(article.moderationReport);
  renderWarnings(state.warnings);
}

function renderAuthState() {
  if (hasAdminPasscode()) {
    refs.authHint.textContent = 'パスコード設定済みです。右のフォームからログインしてください。';
  } else {
    refs.authHint.textContent = 'まだパスコード未設定です。左のフォームから初期設定してください。';
  }
}

async function refreshData() {
  if (!state.storage) {
    state.userKey = ensureUserKey();
    state.storage = await createStorageService(state.userKey);
  }

  state.profile = await state.storage.getProfile();
  state.articles = await state.storage.listArticles();

  if (!state.selectedArticleId && state.articles.length) {
    state.selectedArticleId = state.articles[0].id;
  }

  if (state.selectedArticleId && !state.articles.some((article) => article.id === state.selectedArticleId)) {
    state.selectedArticleId = state.articles[0]?.id || '';
  }

  renderStats();
  renderQueue();
  renderSelectedArticle();
}

function showWorkspace() {
  refs.workspace.hidden = false;
  refs.gateSection.hidden = true;
}

function showGate() {
  refs.workspace.hidden = true;
  refs.gateSection.hidden = false;
}

function selectArticle(articleId) {
  state.selectedArticleId = articleId;
  state.warnings = [];
  renderQueue();
  renderSelectedArticle();
}

async function saveArticle(article) {
  await state.storage.saveArticle({
    ...article,
    updatedAt: Date.now(),
  });
  await refreshData();
}

async function runAuditAndPersist() {
  const article = getSelectedArticle();
  if (!article) {
    return null;
  }

  const report = runPublicationAudit({
    article,
    articles: state.articles,
  });

  await saveArticle({
    ...article,
    moderationReport: report,
    reviewedAt: report.checkedAt,
  });

  return report;
}

async function handleApprove() {
  const article = getSelectedArticle();
  if (!article) {
    setStatus('承認対象の記事がありません。', 'warning');
    return;
  }

  const report = runPublicationAudit({
    article,
    articles: state.articles,
  });

  if (report.status === 'blocked') {
    const confirmed = window.confirm('停止レベルの指摘があります。このまま承認して公開URLを生成しますか。');
    if (!confirmed) {
      setStatus('承認をキャンセルしました。', 'info');
      return;
    }
  }

  try {
    const attachments = await state.storage.listAttachmentsByArticle(article.id);
    const bundle = await buildPublicBundle({
      profile: state.profile,
      article,
      attachments,
      currentUrl: window.location.href,
    });

    const warnings = getPublicWarnings(bundle);
    state.warnings = warnings;

    await saveArticle({
      ...article,
      publicationStatus: 'approved',
      moderationReport: report,
      publicToken: bundle.token,
      publicUrl: bundle.url,
      publishedAt: Date.now(),
      reviewedAt: report.checkedAt,
    });

    setStatus(
      warnings.length
        ? '公開URLを生成して承認しました。警告も確認してください。'
        : '公開URLを生成して承認しました。',
      warnings.length ? 'warning' : 'success',
    );
  } catch (error) {
    setStatus(`公開URL生成に失敗しました: ${serializeError(error)}`, 'error');
  }
}

async function handleReject() {
  const article = getSelectedArticle();
  if (!article) {
    setStatus('差し戻し対象の記事がありません。', 'warning');
    return;
  }

  const report = runPublicationAudit({
    article,
    articles: state.articles,
  });

  state.warnings = [];
  await saveArticle({
    ...article,
    publicationStatus: 'rejected',
    moderationReport: report,
    publicToken: '',
    publicUrl: '',
    publishedAt: 0,
    reviewedAt: report.checkedAt,
  });

  setStatus('記事を差し戻し状態にしました。', 'warning');
}

async function handleDraft() {
  const article = getSelectedArticle();
  if (!article) {
    setStatus('対象の記事がありません。', 'warning');
    return;
  }

  state.warnings = [];
  await saveArticle({
    ...article,
    publicationStatus: 'draft',
    publicToken: '',
    publicUrl: '',
    publishedAt: 0,
    reviewedAt: 0,
  });

  setStatus('記事を下書きへ戻しました。', 'info');
}

async function handleCopyPublicUrl() {
  const article = getSelectedArticle();
  if (!article?.publicUrl) {
    setStatus('公開URLがありません。', 'warning');
    return;
  }

  await copyText(article.publicUrl);
  setStatus('公開URLをコピーしました。', 'success');
}

function handleOpenPublic() {
  const article = getSelectedArticle();
  if (!article?.publicUrl) {
    setStatus('公開URLがありません。', 'warning');
    return;
  }

  window.open(article.publicUrl, '_blank', 'noopener,noreferrer');
}

function handleOpenEditor() {
  window.open('/main', '_blank', 'noopener,noreferrer');
}

async function handleSetup() {
  const passcode = refs.setupInput.value.trim();
  const confirm = refs.setupConfirmInput.value.trim();

  if (!passcode || passcode.length < 4) {
    setStatus('パスコードは 4 文字以上にしてください。', 'warning');
    return;
  }

  if (passcode !== confirm) {
    setStatus('確認用パスコードが一致しません。', 'warning');
    return;
  }

  await setAdminPasscode(passcode);
  refs.setupInput.value = '';
  refs.setupConfirmInput.value = '';
  renderAuthState();
  await refreshData();
  showWorkspace();
  setStatus('ローカル管理パスコードを設定しました。', 'success');
}

async function handleLogin() {
  if (!hasAdminPasscode()) {
    setStatus('先にパスコードを設定してください。', 'warning');
    return;
  }

  const passcode = refs.loginInput.value.trim();
  if (!passcode) {
    setStatus('パスコードを入力してください。', 'warning');
    return;
  }

  const isValid = await verifyAdminPasscode(passcode);
  if (!isValid) {
    setStatus('パスコードが違います。', 'error');
    return;
  }

  refs.loginInput.value = '';
  await refreshData();
  showWorkspace();
  setStatus('管理画面へログインしました。', 'success');
}

function handleLogout() {
  clearAdminSession();
  showGate();
  setStatus('ログアウトしました。', 'info');
}

function setupActions() {
  refs.setupButton.addEventListener('click', () => {
    handleSetup().catch((error) => {
      setStatus(error instanceof Error ? error.message : 'パスコード設定に失敗しました。', 'error');
    });
  });

  refs.loginButton.addEventListener('click', () => {
    handleLogin().catch((error) => {
      setStatus(error instanceof Error ? error.message : 'ログインに失敗しました。', 'error');
    });
  });

  refs.logoutButton.addEventListener('click', handleLogout);
  refs.articleList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-article-id]');
    if (!button) {
      return;
    }

    selectArticle(button.dataset.articleId);
  });
  refs.runAuditButton.addEventListener('click', () => {
    runAuditAndPersist()
      .then((report) => {
        state.warnings = [];
        renderSelectedArticle();
        if (!report) {
          return;
        }
        setStatus(`ローカル審査を実行しました: ${report.summary}`, report.status === 'blocked' ? 'warning' : 'success');
      })
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : '審査に失敗しました。', 'error');
      });
  });
  refs.approveButton.addEventListener('click', () => {
    handleApprove().catch((error) => {
      setStatus(error instanceof Error ? error.message : '承認に失敗しました。', 'error');
    });
  });
  refs.rejectButton.addEventListener('click', () => {
    handleReject().catch((error) => {
      setStatus(error instanceof Error ? error.message : '差し戻しに失敗しました。', 'error');
    });
  });
  refs.draftButton.addEventListener('click', () => {
    handleDraft().catch((error) => {
      setStatus(error instanceof Error ? error.message : '下書き復帰に失敗しました。', 'error');
    });
  });
  refs.copyPublicUrlButton.addEventListener('click', () => {
    handleCopyPublicUrl().catch((error) => {
      setStatus(error instanceof Error ? error.message : 'URL コピーに失敗しました。', 'error');
    });
  });
  refs.openPublicButton.addEventListener('click', handleOpenPublic);
  refs.openEditorButton.addEventListener('click', handleOpenEditor);
}

async function init() {
  setupActions();
  renderAuthState();

  if (isAdminSessionActive()) {
    try {
      await refreshData();
      showWorkspace();
      setStatus('ローカル管理セッションを復元しました。', 'success');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '管理画面の初期化に失敗しました。', 'error');
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
