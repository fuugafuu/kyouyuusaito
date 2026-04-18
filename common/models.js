import {
  APP_VERSION,
  DEFAULT_PROFILE_ICON,
  DEFAULT_PROFILE_NAME,
  DEFAULT_SETTINGS,
  EMPTY_ARTICLE_TITLE,
} from './constants.js';
import { generateId, isSafeImageSource, uniqueStrings } from './utils.js';

function asString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value, fallback) {
  return Number.isFinite(value) ? Number(value) : fallback;
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
    createdAt: asNumber(source.createdAt, base.createdAt),
    updatedAt: asNumber(source.updatedAt, base.updatedAt),
  };
}

export function createEmptyArticle(title = EMPTY_ARTICLE_TITLE) {
  const now = Date.now();
  return {
    id: generateId('article'),
    title,
    content: '',
    attachmentIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeArticle(article = {}) {
  const source = article && typeof article === 'object' ? article : {};
  const now = Date.now();
  return {
    id: asString(source.id, generateId('article')),
    title: asString(source.title).trim() || EMPTY_ARTICLE_TITLE,
    content: asString(source.content),
    attachmentIds: uniqueStrings(Array.isArray(source.attachmentIds) ? source.attachmentIds : []),
    createdAt: asNumber(source.createdAt, now),
    updatedAt: asNumber(source.updatedAt, now),
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
    createdAt: asNumber(source.createdAt, now),
  };
}

export function normalizeSettings(settings = {}) {
  const source = settings && typeof settings === 'object' ? settings : {};
  return {
    autoSave:
      typeof source.autoSave === 'boolean' ? source.autoSave : DEFAULT_SETTINGS.autoSave,
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
