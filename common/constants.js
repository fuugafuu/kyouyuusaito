export const APP_NAME = 'SCP Sandbox Editor + Share Viewer';
export const APP_VERSION = 1;
export const DB_NAME_PREFIX = 'scp-sandbox-editor';
export const DB_VERSION = 1;
export const COOKIE_NAME_USER_KEY = 'scpSandboxUserKey';
export const LOCAL_STORAGE_PREFIX = 'scpSandbox';
export const ADMIN_STORAGE_PREFIX = 'scpSandboxAdmin';

export const STORE_NAMES = {
  profile: 'profile',
  settings: 'settings',
  articles: 'articles',
  attachments: 'attachments',
};

export const DEFAULT_PROFILE_NAME = '匿名職員';
export const EMPTY_ARTICLE_TITLE = '無題記事';
export const DEFAULT_THEME = 'scp-dark';
export const DEFAULT_SETTINGS = Object.freeze({
  autoSave: true,
  theme: DEFAULT_THEME,
});

export const ARTICLE_SERIES_OPTIONS = Object.freeze(['SCP', 'SCP-JP']);
export const DEFAULT_ARTICLE_SERIES = 'SCP';
export const DEFAULT_OBJECT_CLASS = 'SAFE';
export const MIN_ARTICLE_NUMBER = 1;
export const MAX_ARTICLE_NUMBER = 10000;

export const AUTO_SAVE_INTERVAL_MS = 15000;
export const SHARE_HASH_KEY = 'data';
export const SHARE_QUERY_KEY = 'd';
export const PUBLIC_QUERY_KEY = 'pub';
export const PUBLIC_SLUG_KEY = 'slug';
export const SHARE_URL_WARN_LENGTH = 1800;
export const SHARE_URL_DANGER_LENGTH = 6000;
export const PUBLIC_URL_WARN_LENGTH = 2200;
export const PUBLIC_URL_DANGER_LENGTH = 7000;
export const SHARE_IMAGE_MAX_DIMENSION = 960;
export const SHARE_IMAGE_QUALITY = 0.72;
export const SHARE_ICON_MAX_DIMENSION = 160;
export const SHARE_ICON_QUALITY = 0.76;
export const SHARE_FILE_EXTENSION = '.scp-share';
export const PUBLIC_FILE_EXTENSION = '.scp-public';

export const MAX_ATTACHMENT_WARNING_BYTES = 2 * 1024 * 1024;
export const MAX_ATTACHMENT_DIMENSION = 1600;
export const MAX_PROFILE_ICON_DIMENSION = 256;
export const MAX_PROFILE_ICON_WARNING_BYTES = 768 * 1024;

export const SUPPORTED_IMAGE_TYPES = Object.freeze([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

const DEFAULT_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
  <rect width="160" height="160" rx="18" fill="#1d1d1d" />
  <path d="M80 10l58 20v41c0 39-23 63-58 79-35-16-58-40-58-79V30L80 10z" fill="none" stroke="#d4d0c0" stroke-width="8"/>
  <circle cx="80" cy="56" r="22" fill="#d4d0c0" />
  <path d="M42 128c8-22 24-34 38-34s30 12 38 34" fill="#9a2e2e" />
</svg>
`.trim();

export const DEFAULT_PROFILE_ICON = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
  DEFAULT_ICON_SVG,
)}`;

export const STATUS_TIMEOUT_MS = 5000;
