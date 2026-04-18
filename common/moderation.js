import { buildArticleDesignation, buildArticleSlug } from './publication.js';

const HIGH_RISK_JS_PATTERNS = [
  { code: 'js-eval', pattern: /\beval\s*\(/i, message: 'eval の使用は危険です。' },
  { code: 'js-function-constructor', pattern: /\bnew\s+Function\s*\(/i, message: 'Function コンストラクタの使用は危険です。' },
  { code: 'js-cookie', pattern: /document\.cookie/i, message: 'cookie への直接アクセスは許可しない方が安全です。' },
  { code: 'js-dom-write', pattern: /innerHTML\s*=|outerHTML\s*=|insertAdjacentHTML/i, message: '危険な HTML 挿入につながる DOM 書き込みがあります。' },
];

const REVIEW_JS_PATTERNS = [
  { code: 'js-network', pattern: /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/i, message: '外部通信系 API が含まれています。' },
  { code: 'js-storage', pattern: /localStorage|sessionStorage|indexedDB/i, message: '保存領域へアクセスするコードが含まれています。' },
  { code: 'js-navigation', pattern: /window\.open|location\.href|location\.assign|history\./i, message: 'ページ遷移や別ウィンドウ操作が含まれています。' },
  { code: 'js-timer', pattern: /setInterval|requestAnimationFrame/i, message: '継続実行される処理が含まれています。' },
];

const HIGH_RISK_CSS_PATTERNS = [
  { code: 'css-import', pattern: /@import/i, message: '@import による外部 CSS 読み込みがあります。' },
  { code: 'css-legacy-expr', pattern: /expression\s*\(|behavior\s*:/i, message: '古いブラウザ依存の危険な CSS 記述があります。' },
];

const REVIEW_CSS_PATTERNS = [
  { code: 'css-remote-url', pattern: /url\s*\(\s*['"]?https?:/i, message: '外部 URL を参照する CSS が含まれています。' },
  { code: 'css-fullscreen', pattern: /position\s*:\s*fixed|z-index\s*:\s*999/i, message: '全面オーバーレイ化しやすい CSS が含まれています。' },
];

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function collectBigrams(text) {
  const compact = normalizeText(text).replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, '');
  if (compact.length < 2) {
    return new Set(compact ? [compact] : []);
  }

  const grams = new Set();
  for (let index = 0; index < compact.length - 1; index += 1) {
    grams.add(compact.slice(index, index + 2));
  }
  return grams;
}

function jaccardSimilarity(leftText, rightText) {
  const left = collectBigrams(leftText);
  const right = collectBigrams(rightText);
  if (!left.size || !right.size) {
    return 0;
  }

  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) {
      intersection += 1;
    }
  }

  const union = left.size + right.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function pushIssue(list, severity, code, message) {
  list.push({ severity, code, message });
}

function auditMetadata(article, issues) {
  if (!String(article.title || '').trim()) {
    pushIssue(issues, 'error', 'title-empty', 'タイトルが空です。');
  }

  if (!String(article.content || '').trim()) {
    pushIssue(issues, 'error', 'content-empty', '本文が空です。');
  }

  if (!article.articleNumber) {
    pushIssue(issues, 'warning', 'number-empty', '記事番号が未設定です。');
  }

  if (!String(article.summary || '').trim()) {
    pushIssue(issues, 'warning', 'summary-empty', '公開用サマリーが未設定です。');
  }

  if (!String(article.slug || '').trim()) {
    pushIssue(issues, 'warning', 'slug-empty', 'slug が未設定のため自動生成になります。');
  }
}

function auditDuplicates(article, articles, issues) {
  const designation = buildArticleDesignation(article);
  const slug = buildArticleSlug(article);
  const peers = (articles || []).filter((item) => item.id !== article.id);

  for (const peer of peers) {
    if (designation && designation === buildArticleDesignation(peer)) {
      pushIssue(issues, 'warning', 'designation-duplicate', `記事番号が ${peer.title} と重複しています。`);
      break;
    }
  }

  for (const peer of peers) {
    if (slug && slug === buildArticleSlug(peer)) {
      pushIssue(issues, 'warning', 'slug-duplicate', `slug が ${peer.title} と重複しています。`);
      break;
    }
  }

  const candidateText = `${article.title}\n${article.summary}\n${article.content}`;
  for (const peer of peers) {
    const peerText = `${peer.title}\n${peer.summary}\n${peer.content}`;
    const score = jaccardSimilarity(candidateText, peerText);
    if (score >= 0.96) {
      pushIssue(issues, 'error', 'content-near-duplicate', `本文が ${peer.title} とほぼ同一です。`);
      return;
    }
    if (score >= 0.86) {
      pushIssue(issues, 'warning', 'content-similar', `本文が ${peer.title} とかなり近いため確認が必要です。`);
      return;
    }
  }
}

function auditPatterns(source, patterns, severity, issues) {
  for (const entry of patterns) {
    if (entry.pattern.test(source)) {
      pushIssue(issues, severity, entry.code, entry.message);
    }
  }
}

function summarize(issues) {
  if (!issues.length) {
    return '重大な問題は見つかりませんでした。';
  }

  const errorCount = issues.filter((issue) => issue.severity === 'error').length;
  const warningCount = issues.filter((issue) => issue.severity === 'warning').length;

  if (errorCount > 0) {
    return `公開停止レベル ${errorCount} 件、確認推奨 ${warningCount} 件です。`;
  }

  if (warningCount > 0) {
    return `確認推奨の項目が ${warningCount} 件あります。`;
  }

  return '情報レベルのメモのみです。';
}

export function runPublicationAudit({ article, articles = [] }) {
  const issues = [];
  auditMetadata(article, issues);
  auditDuplicates(article, articles, issues);
  auditPatterns(String(article.customJs || ''), HIGH_RISK_JS_PATTERNS, 'error', issues);
  auditPatterns(String(article.customJs || ''), REVIEW_JS_PATTERNS, 'warning', issues);
  auditPatterns(String(article.customCss || ''), HIGH_RISK_CSS_PATTERNS, 'error', issues);
  auditPatterns(String(article.customCss || ''), REVIEW_CSS_PATTERNS, 'warning', issues);

  const score = issues.reduce((total, issue) => {
    if (issue.severity === 'error') {
      return total + 4;
    }
    if (issue.severity === 'warning') {
      return total + 2;
    }
    return total + 1;
  }, 0);

  const status = issues.some((issue) => issue.severity === 'error')
    ? 'blocked'
    : issues.some((issue) => issue.severity === 'warning')
      ? 'review'
      : 'pass';

  return {
    status,
    score,
    summary: summarize(issues),
    checkedAt: Date.now(),
    issues,
  };
}
