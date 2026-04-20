import { PUBLIC_QUERY_KEY } from './constants.js';
import { slugify } from './utils.js';

export const INTERNAL_ROUTE_PATHS = Object.freeze({
  publicSite: '/public-site',
  studio: '/main',
  share: '/share',
  admin: '/admin',
});

export const PUBLIC_ROUTE_PATHS = Object.freeze({
  home: '/',
  studio: '/studio',
  share: '/s',
  publicArticlePrefix: '/p',
  adminEntry: '/clearance-7f3d9q',
});

function resolveOrigin(currentUrl = '') {
  const fallbackOrigin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://example.com';

  return new URL(currentUrl || fallbackOrigin, fallbackOrigin).origin;
}

export function buildAbsoluteUrl(path, currentUrl = '') {
  return new URL(path, resolveOrigin(currentUrl)).toString();
}

export function getPublicHomeUrl(currentUrl = '') {
  return buildAbsoluteUrl(PUBLIC_ROUTE_PATHS.home, currentUrl);
}

export function getStudioUrl(currentUrl = '') {
  return buildAbsoluteUrl(PUBLIC_ROUTE_PATHS.studio, currentUrl);
}

export function getShareViewerUrl(currentUrl = '') {
  return buildAbsoluteUrl(PUBLIC_ROUTE_PATHS.share, currentUrl);
}

export function getAdminEntryUrl(currentUrl = '') {
  return buildAbsoluteUrl(PUBLIC_ROUTE_PATHS.adminEntry, currentUrl);
}

export function buildPublicArticlePath(slug = '') {
  const normalizedSlug = slugify(slug, 'scp-entry');
  return `${PUBLIC_ROUTE_PATHS.publicArticlePrefix}/${encodeURIComponent(normalizedSlug)}`;
}

export function buildPublicArticleUrl(slug = '', { token = '', currentUrl = '' } = {}) {
  const url = new URL(buildPublicArticlePath(slug), resolveOrigin(currentUrl));
  if (token) {
    url.searchParams.set(PUBLIC_QUERY_KEY, token);
  }
  return url.toString();
}

export function readPublicSlugFromPathname(pathname = '') {
  const normalizedPathname = String(pathname || '').replace(/\/+$/g, '') || '/';
  const prefix = `${PUBLIC_ROUTE_PATHS.publicArticlePrefix}/`;
  if (!normalizedPathname.startsWith(prefix)) {
    return '';
  }
  return decodeURIComponent(normalizedPathname.slice(prefix.length));
}
