import {
  APP_VERSION,
  DEFAULT_ARTICLE_SERIES,
  DEFAULT_PROFILE_NAME,
  PUBLIC_URL_DANGER_LENGTH,
  PUBLIC_URL_WARN_LENGTH,
  SHARE_ICON_MAX_DIMENSION,
  SHARE_ICON_QUALITY,
  SHARE_IMAGE_MAX_DIMENSION,
  SHARE_IMAGE_QUALITY,
} from './constants.js';
import { encodeSharePayloadToken } from './share-codec.js';
import { extractAttachmentReferences } from './markup.js';
import { normalizePublicPayload } from './models.js';
import { buildPublicArticleUrl, getPublicHomeUrl } from './routes.js';
import { estimateDataUrlBytes, resizeImageDataUrl, slugify, splitDataUrl } from './utils.js';

const PUBLIC_IMAGE_PRESETS = [
  {
    label: 'standard',
    maxDimension: SHARE_IMAGE_MAX_DIMENSION,
    quality: SHARE_IMAGE_QUALITY,
    iconMaxDimension: SHARE_ICON_MAX_DIMENSION,
    iconQuality: SHARE_ICON_QUALITY,
  },
  {
    label: 'compact',
    maxDimension: 768,
    quality: 0.64,
    iconMaxDimension: 144,
    iconQuality: 0.68,
  },
  {
    label: 'lean',
    maxDimension: 640,
    quality: 0.58,
    iconMaxDimension: 128,
    iconQuality: 0.62,
  },
];

function getMimeTypeFromDataUrl(dataUrl, fallback = 'image/webp') {
  return splitDataUrl(dataUrl)?.mimeType || fallback;
}

function padArticleNumber(value) {
  if (!Number.isFinite(value)) {
    return '';
  }

  return String(Math.max(0, Math.round(value))).padStart(3, '0');
}

export function buildArticleDesignation(article = {}) {
  const series = String(article.series || DEFAULT_ARTICLE_SERIES).trim() || DEFAULT_ARTICLE_SERIES;
  const number = Number.isFinite(article.articleNumber) ? padArticleNumber(article.articleNumber) : '';
  return number ? `${series}-${number}` : series;
}

export function buildArticleSlug(article = {}) {
  const explicit = String(article.slug || '').trim();
  if (explicit) {
    return slugify(explicit, 'scp-entry');
  }

  const designation = buildArticleDesignation(article);
  const title = String(article.title || '').trim();
  const basis = [designation, title].filter(Boolean).join(' ');
  return slugify(basis, 'scp-entry');
}

export function buildPublicEntryUrl(currentUrl = window.location.href) {
  return getPublicHomeUrl(currentUrl);
}

export function buildPublicUrlFromToken(token, article, currentUrl = window.location.href) {
  const slug = buildArticleSlug(article);
  return buildPublicArticleUrl(slug, {
    token,
    currentUrl,
  });
}

export function buildLocalPublicSlugUrl(slug, currentUrl = window.location.href) {
  return buildPublicArticleUrl(slug, {
    currentUrl,
  });
}

async function optimizeImage(dataUrl, { maxDimension, quality }) {
  const originalBytes = estimateDataUrlBytes(dataUrl);
  const originalMimeType = getMimeTypeFromDataUrl(dataUrl);

  if (!dataUrl) {
    return {
      dataUrl: '',
      mimeType: originalMimeType,
      approxBytes: 0,
      savedBytes: 0,
      optimized: false,
    };
  }

  try {
    const processed = await resizeImageDataUrl(dataUrl, {
      maxDimension,
      quality,
      outputType: originalMimeType === 'image/gif' ? 'image/gif' : 'image/webp',
    });

    if (!processed.dataUrl || processed.approxBytes >= originalBytes) {
      return {
        dataUrl,
        mimeType: originalMimeType,
        approxBytes: originalBytes,
        savedBytes: 0,
        optimized: false,
      };
    }

    return {
      dataUrl: processed.dataUrl,
      mimeType: processed.mimeType,
      approxBytes: processed.approxBytes,
      savedBytes: Math.max(0, originalBytes - processed.approxBytes),
      optimized: true,
    };
  } catch {
    return {
      dataUrl,
      mimeType: originalMimeType,
      approxBytes: originalBytes,
      savedBytes: 0,
      optimized: false,
    };
  }
}

async function createPublicCandidate({
  profile,
  article,
  attachments,
  currentUrl,
  preset,
}) {
  const referencedIds = extractAttachmentReferences(article.content);
  const attachmentMap = new Map((attachments || []).map((attachment) => [attachment.id, attachment]));
  const includedAttachments = [];
  const missingAttachmentIds = [];
  let optimizedAttachmentCount = 0;
  let savedAttachmentBytes = 0;

  for (const attachmentId of referencedIds) {
    const attachment = attachmentMap.get(attachmentId);
    if (!attachment) {
      missingAttachmentIds.push(attachmentId);
      continue;
    }

    const optimized = await optimizeImage(attachment.data, {
      maxDimension: preset.maxDimension,
      quality: preset.quality,
    });

    if (optimized.optimized) {
      optimizedAttachmentCount += 1;
      savedAttachmentBytes += optimized.savedBytes;
    }

    includedAttachments.push({
      id: attachment.id,
      name: attachment.name,
      mimeType: optimized.mimeType,
      data: optimized.dataUrl,
      articleId: attachment.articleId,
      createdAt: attachment.createdAt,
    });
  }

  let shareIcon = '';
  let profileIconSavedBytes = 0;

  if (profile?.icon) {
    const optimizedIcon = await optimizeImage(profile.icon, {
      maxDimension: preset.iconMaxDimension,
      quality: preset.iconQuality,
    });
    shareIcon = optimizedIcon.dataUrl || '';
    profileIconSavedBytes = optimizedIcon.savedBytes;
  }

  const payload = normalizePublicPayload({
    version: APP_VERSION,
    profile: {
      name: profile?.name || DEFAULT_PROFILE_NAME,
      icon: shareIcon,
    },
    article: {
      ...article,
      slug: buildArticleSlug(article),
      publishedAt: article.publishedAt || Date.now(),
    },
    attachments: includedAttachments,
  });

  const token = encodeSharePayloadToken(payload);
  const url = buildPublicUrlFromToken(token, payload.article, currentUrl);
  const slugUrl = buildLocalPublicSlugUrl(payload.article.slug, currentUrl);

  return {
    payload,
    token,
    url,
    slugUrl,
    baseViewerUrl: buildPublicEntryUrl(currentUrl),
    missingAttachmentIds,
    metrics: {
      tokenLength: token.length,
      urlLength: url.length,
      usedAttachmentCount: includedAttachments.length,
      optimizedAttachmentCount,
      savedAttachmentBytes,
      profileIconSavedBytes,
      presetLabel: preset.label,
    },
  };
}

export async function buildPublicBundle({
  profile,
  article,
  attachments,
  currentUrl = window.location.href,
}) {
  if (!article) {
    throw new Error('公開する記事が選択されていません。');
  }

  let bestCandidate = null;
  for (const preset of PUBLIC_IMAGE_PRESETS) {
    const candidate = await createPublicCandidate({
      profile,
      article,
      attachments,
      currentUrl,
      preset,
    });

    if (!bestCandidate || candidate.metrics.urlLength < bestCandidate.metrics.urlLength) {
      bestCandidate = candidate;
    }

    if (candidate.metrics.urlLength <= PUBLIC_URL_WARN_LENGTH) {
      break;
    }
  }

  return bestCandidate;
}

export function getPublicWarnings(bundle) {
  const warnings = [];
  if (!bundle?.url && !bundle?.slugUrl) {
    return warnings;
  }

  if (!bundle?.slugUrl && bundle.metrics?.urlLength > PUBLIC_URL_DANGER_LENGTH) {
    warnings.push('公開URLが非常に長いため、一部のSNSやスマホでは開けない可能性があります。公開ファイルや公開コードの併用をおすすめします。');
  } else if (!bundle?.slugUrl && bundle.metrics?.urlLength > PUBLIC_URL_WARN_LENGTH) {
    warnings.push('公開URLが長めです。LINEや一部ブラウザでは途中で切れる場合があります。');
  }

  if (bundle.missingAttachmentIds?.length) {
    warnings.push('本文内で参照されている添付画像の一部が見つからず、公開データには含まれていません。');
  }

  if (bundle.payload?.article?.customCss) {
    warnings.push('カスタムCSSは sandbox iframe 内でのみ適用されます。');
  }

  if (bundle.payload?.article?.customJs) {
    warnings.push('カスタムJSは制限付き sandbox iframe 内で実行されます。');
  }

  return warnings;
}
