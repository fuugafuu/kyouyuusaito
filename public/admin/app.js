import { runPublicationAudit } from '../common/moderation.js';
import { buildArticleDesignation, buildArticleSlug, buildPublicBundle, getPublicWarnings } from '../common/publication.js';
import { getStudioUrl } from '../common/routes.js';
import { copyText, ensureUserKey, formatDateTime, serializeError } from '../common/utils.js';
import { createStorageService } from '../main/storage.js';

const refs = {
  status: document.querySelector('#adminStatus'),
  gateSection: document.querySelector('#adminGateSection'),
  workspace: document.querySelector('#adminWorkspace'),
  usernameInput: document.querySelector('#adminUsernameInput'),
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
    renderEmptyList(refs.articleList, 'この端末にはまだ記事がありません。');
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
    note.textContent = article.moderationReport?.summary || 'まだ審査していません。';

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
    renderEmptyList(refs.warningList, '公開URL生成時の注意はありません。');
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
    refs.selectedTitle.textContent = '記事を選択してください';
    refs.selectedMeta.textContent = 'ここに記事の公開情報が表示されます。';
    refs.selectedSummary.textContent = 'ローカル審査結果、公開URL、注意事項をここで確認できます。';
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
    `公開日: ${article.publishedAt ? formatDateTime(article.publishedAt) : '未公開'}`,
    article.summary ? `概要: ${article.summary}` : '概要: 未入力',
  ].join(' / ');
  refs.publicUrl.value = article.publicUrl || '';

  renderIssues(article.moderationReport);
  renderWarnings(state.warnings);
}

function renderAuthState({ configured = true, authenticated = false, username = '' } = {}) {
  if (!configured) {
    refs.authHint.textContent = 'Vercel の環境変数 `SANDBOX_ADMIN_PASSWORD` が未設定です。設定後に再読み込みしてください。';
    return;
  }

  refs.authHint.textContent = authenticated
    ? `認証済み: ${username || 'admin'} / この画面はサーバーセッションで保護されています。`
    : '認証が必要です。URLを知っていても、サーバー側の管理者認証を通過しない限り操作できません。';
}

async function fetchSessionStatus() {
  const response = await fetch('/api/admin/session', {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
  });
  return response.json();
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
    setStatus('審査対象の記事がありません。', 'warning');
    return;
  }

  const report = runPublicationAudit({
    article,
    articles: state.articles,
  });

  if (report.status === 'blocked') {
    const confirmed = window.confirm('危険レベルの指摘があります。このまま公開URLを生成しますか。');
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
      publicUrl: bundle.slugUrl || bundle.url,
      publishedAt: Date.now(),
      reviewedAt: report.checkedAt,
    });

    setStatus(
      warnings.length
        ? '短い公開URLを生成して承認しました。注意事項も確認してください。'
        : '短い公開URLを生成して承認しました。',
      warnings.length ? 'warning' : 'success',
    );
  } catch (error) {
    setStatus(`公開URL生成に失敗しました: ${serializeError(error)}`, 'error');
  }
}

async function handleReject() {
  const article = getSelectedArticle();
  if (!article) {
    setStatus('対象の記事がありません。', 'warning');
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

  setStatus('記事を差し戻しました。', 'warning');
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

  setStatus('記事を下書きに戻しました。', 'info');
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
  window.open(getStudioUrl(window.location.href), '_blank', 'noopener,noreferrer');
}

async function handleLogin() {
  const username = refs.usernameInput.value.trim() || 'admin';
  const password = refs.loginInput.value.trim();
  if (!password) {
    setStatus('パスワードを入力してください。', 'warning');
    return;
  }

  const response = await fetch('/api/admin/session', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      username,
      password,
    }),
  });

  const result = await response.json();
  renderAuthState({
    configured: result?.configured !== false,
    authenticated: response.ok,
    username,
  });

  if (!response.ok) {
    setStatus(result?.message || '認証に失敗しました。', 'error');
    return;
  }

  refs.loginInput.value = '';
  await refreshData();
  showWorkspace();
  setStatus('管理コンソールにログインしました。', 'success');
}

async function handleLogout() {
  await fetch('/api/admin/session', {
    method: 'DELETE',
    credentials: 'same-origin',
  });
  showGate();
  renderAuthState({
    configured: true,
    authenticated: false,
  });
  setStatus('ログアウトしました。', 'info');
}

function setupActions() {
  refs.loginButton.addEventListener('click', () => {
    handleLogin().catch((error) => {
      setStatus(error instanceof Error ? error.message : 'ログインに失敗しました。', 'error');
    });
  });

  refs.logoutButton.addEventListener('click', () => {
    handleLogout().catch((error) => {
      setStatus(error instanceof Error ? error.message : 'ログアウトに失敗しました。', 'error');
    });
  });

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
      setStatus(error instanceof Error ? error.message : '下書き変更に失敗しました。', 'error');
    });
  });

  refs.copyPublicUrlButton.addEventListener('click', () => {
    handleCopyPublicUrl().catch((error) => {
      setStatus(error instanceof Error ? error.message : 'URLコピーに失敗しました。', 'error');
    });
  });

  refs.openPublicButton.addEventListener('click', handleOpenPublic);
  refs.openEditorButton.addEventListener('click', handleOpenEditor);
}

async function init() {
  setupActions();

  try {
    const session = await fetchSessionStatus();
    renderAuthState(session);

    if (session?.authenticated) {
      await refreshData();
      showWorkspace();
      setStatus('サーバー認証済みのため管理コンソールを開きました。', 'success');
      return;
    }

    showGate();
  } catch (error) {
    showGate();
    setStatus(error instanceof Error ? error.message : '認証状態の確認に失敗しました。', 'error');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
