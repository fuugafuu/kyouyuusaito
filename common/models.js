import {
  APP_VERSION,
  DEFAULT_ARTICLE_SERIES,
  DEFAULT_OBJECT_CLASS,
  DEFAULT_PROFILE_ICON,
  DEFAULT_PROFILE_NAME,
  DEFAULT_SETTINGS,
  EMPTY_ARTICLE_TITLE,
  MAX_ARTICLE_NUMBER,
  MIN_ARTICLE_NUMBER,
} from './constants.js';
import { generateId, isSafeImageSource, uniqueStrings } from './utils.js';

function asString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function asFiniteNumber(value, fallback) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function asBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function clampArticleNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.min(MAX_ARTICLE_NUMBER, Math.max(MIN_ARTICLE_NUMBER, Math.round(parsed)));
}

function normalizeModerationIssue(issue = {}) {
  return {
    severity: ['info', 'warning', 'error'].includes(issue?.severity) ? issue.severity : 'info',
    code: asString(issue?.code, 'note'),
    message: asString(issue?.message, ''),
  };
}

function normalizeModerationReport(report = null) {
  if (!report || typeof report !== 'object') {
    return null;
  }

  return {
    status: ['pass', 'review', 'blocked'].includes(report.status) ? report.status : 'review',
    score: asFiniteNumber(report.score, 0),
    summary: asString(report.summary),
    checkedAt: asFiniteNumber(report.checkedAt, 0),
    issues: Array.isArray(report.issues) ? report.issues.map((item) => normalizeModerationIssue(item)) : [],
  };
}

function normalizePublicationStatus(value) {
  return ['draft', 'pending', 'approved', 'rejected'].includes(value) ? value : 'draft';
}

export function createDefaultProfile(id = generateId('profile')) {
  const now = Date.now();
  return {
    id,
    name: DEFAULT_PROFILE_NAME,
    icon: DEFAULT_PROFILE_ICON,
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeProfile(profile = {}, userKey = '') {
  const source = profile && typeof profile === 'object' ? profile : {};
  const base = createDefaultProfile(asString(source.id, userKey || generateId('profile')));
  const name = asString(source.name).trim() || DEFAULT_PROFILE_NAME;
  const icon = isSafeImageSource(source.icon, { allowDefault: true }) ? source.icon : DEFAULT_PROFILE_ICON;

  return {
    id: base.id,
    name,
    icon,
    createdAt: asFiniteNumber(source.createdAt, base.createdAt),
    updatedAt: asFiniteNumber(source.updatedAt, base.updatedAt),
  };
}

export function createEmptyArticle(title = EMPTY_ARTICLE_TITLE) {
  const now = Date.now();
  return {
    id: generateId('article'),
    title,
    content: '',
    attachmentIds: [],
    series: DEFAULT_ARTICLE_SERIES,
    articleNumber: null,
    objectClass: DEFAULT_OBJECT_CLASS,
    slug: '',
    summary: '',
    customCss: '',
    customJs: '',
    publicationStatus: 'draft',
    publicToken: '',
    publicUrl: '',
    publishedAt: 0,
    reviewedAt: 0,
    moderationReport: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeArticle(article = {}) {
  const source = article && typeof article === 'object' ? article : {};
  const base = createEmptyArticle(asString(source.title).trim() || EMPTY_ARTICLE_TITLE);
  const now = Date.now();

  return {
    id: asString(source.id, base.id),
    title: asString(source.title).trim() || EMPTY_ARTICLE_TITLE,
    content: asString(source.content),
    attachmentIds: uniqueStrings(Array.isArray(source.attachmentIds) ? source.attachmentIds : []),
    series: asString(source.series, DEFAULT_ARTICLE_SERIES) || DEFAULT_ARTICLE_SERIES,
    articleNumber: clampArticleNumber(source.articleNumber),
    objectClass: asString(source.objectClass, DEFAULT_OBJECT_CLASS).trim() || DEFAULT_OBJECT_CLASS,
    slug: asString(source.slug).trim(),
    summary: asString(source.summary).trim(),
    customCss: asString(source.customCss),
    customJs: asString(source.customJs),
    publicationStatus: normalizePublicationStatus(source.publicationStatus),
    publicToken: asString(source.publicToken).trim(),
    publicUrl: asString(source.publicUrl).trim(),
    publishedAt: asFiniteNumber(source.publishedAt, 0),
    reviewedAt: asFiniteNumber(source.reviewedAt, 0),
    moderationReport: normalizeModerationReport(source.moderationReport),
    createdAt: asFiniteNumber(source.createdAt, now),
    updatedAt: asFiniteNumber(source.updatedAt, now),
  };
}

export function normalizeAttachment(attachment = {}) {
  const source = attachment && typeof attachment === 'object' ? attachment : {};
  const now = Date.now();
  const data = isSafeImageSource(source.data) ? source.data : asString(source.data, '').trim();

  return {
    id: asString(source.id, generateId('attachment')),
    articleId: asString(source.articleId),
    name: asString(source.name, 'attachment'),
    mimeType: asString(source.mimeType, 'image/webp'),
    data,
    createdAt: asFiniteNumber(source.createdAt, now),
  };
}

export function normalizeSettings(settings = {}) {
  const source = settings && typeof settings === 'object' ? settings : {};
  return {
    autoSave: asBoolean(source.autoSave, DEFAULT_SETTINGS.autoSave),
    theme: asString(source.theme, DEFAULT_SETTINGS.theme) || DEFAULT_SETTINGS.theme,
  };
}

export function normalizeBackupPayload(payload = {}, userKey = '') {
  const profile = normalizeProfile(payload.profile, userKey);
  const settings = normalizeSettings(payload.settings);
  const articles = Array.isArray(payload.articles)
    ? payload.articles.map((item) => normalizeArticle(item))
    : [];
  const articleIds = new Set(articles.map((article) => article.id));
  const attachments = Array.isArray(payload.attachments)
    ? payload.attachments
        .map((item) => normalizeAttachment(item))
        .filter((attachment) => attachment.articleId && attachment.data && articleIds.has(attachment.articleId))
    : [];
  const attachmentIds = new Set(attachments.map((attachment) => attachment.id));
  const normalizedArticles = articles.map((article) => ({
    ...article,
    attachmentIds: article.attachmentIds.filter((id) => attachmentIds.has(id)),
  }));

  return {
    version: APP_VERSION,
    profile,
    articles: normalizedArticles,
    attachments,
    settings,
  };
}

export function normalizeSharePayload(payload = {}) {
  const article = normalizeArticle(payload.article);
  const attachments = Array.isArray(payload.attachments)
    ? payload.attachments
        .map((item) => normalizeAttachment(item))
        .filter((attachment) => attachment.data)
    : [];

  return {
    version: typeof payload.version === 'number' ? payload.version : APP_VERSION,
    profile: {
      name: asString(payload.profile?.name).trim() || DEFAULT_PROFILE_NAME,
      icon: isSafeImageSource(payload.profile?.icon, { allowDefault: false }) ? payload.profile.icon : '',
    },
    article: {
      title: article.title,
      content: article.content,
    },
    attachments,
  };
}

export function normalizePublicPayload(payload = {}) {
  const article = normalizeArticle(payload.article);
  const attachments = Array.isArray(payload.attachments)
    ? payload.attachments
        .map((item) => normalizeAttachment(item))
        .filter((attachment) => attachment.data)
    : [];

  return {
    version: typeof payload.version === 'number' ? payload.version : APP_VERSION,
    profile: {
      name: asString(payload.profile?.name).trim() || DEFAULT_PROFILE_NAME,
      icon: isSafeImageSource(payload.profile?.icon, { allowDefault: false }) ? payload.profile.icon : '',
    },
    article: {
      title: article.title,
      content: article.content,
      series: article.series,
      articleNumber: article.articleNumber,
      objectClass: article.objectClass,
      slug: article.slug,
      summary: article.summary,
      customCss: article.customCss,
      customJs: article.customJs,
      publishedAt: article.publishedAt,
      updatedAt: article.updatedAt,
    },
    attachments,
  };
}
