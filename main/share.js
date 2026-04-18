import {
  APP_VERSION,
  DEFAULT_PROFILE_ICON,
  SHARE_ICON_MAX_DIMENSION,
  SHARE_ICON_QUALITY,
  SHARE_IMAGE_MAX_DIMENSION,
  SHARE_IMAGE_QUALITY,
  SHARE_QUERY_KEY,
  SHARE_URL_DANGER_LENGTH,
  SHARE_URL_WARN_LENGTH,
} from '../common/constants.js';
import { encodeSharePayloadToken } from '../common/share-codec.js';
import { extractAttachmentReferences } from '../common/markup.js';
import { estimateDataUrlBytes, resizeImageDataUrl, splitDataUrl } from '../common/utils.js';

const SHARE_IMAGE_PRESETS = [
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
  {
    label: 'minimal',
    maxDimension: 480,
    quality: 0.48,
    iconMaxDimension: 112,
    iconQuality: 0.54,
  },
];

function getMimeTypeFromDataUrl(dataUrl, fallback = 'image/webp') {
  return splitDataUrl(dataUrl)?.mimeType || fallback;
}

async function optimizeShareImage(dataUrl, { maxDimension, quality }) {
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

async function createShareCandidate({
  profile,
  article,
  attachmentMap,
  referencedIds,
  currentUrl,
  preset,
}) {
  const includedAttachments = [];
  const missingAttachmentIds = [];
  let optimizedAttachmentCount = 0;
  let savedAttachmentBytes = 0;
  const baseViewerUrl = buildViewerEntryUrl(currentUrl);

  for (const attachmentId of referencedIds) {
    const attachment = attachmentMap.get(attachmentId);
    if (!attachment) {
      missingAttachmentIds.push(attachmentId);
      continue;
    }

    const optimized = await optimizeShareImage(attachment.data, {
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
    });
  }

  let shareIcon = '';
  let profileIconOptimized = false;
  let profileIconSavedBytes = 0;

  if (profile?.icon && profile.icon !== DEFAULT_PROFILE_ICON) {
    const optimizedIcon = await optimizeShareImage(profile.icon, {
      maxDimension: preset.iconMaxDimension,
      quality: preset.iconQuality,
    });
    shareIcon = optimizedIcon.dataUrl || '';
    profileIconOptimized = optimizedIcon.optimized;
    profileIconSavedBytes = optimizedIcon.savedBytes;
  }

  const payload = {
    version: APP_VERSION,
    profile: {
      name: profile?.name || '財団職員',
      icon: shareIcon,
    },
    article: {
      title: article.title,
      content: article.content,
    },
    attachments: includedAttachments,
  };

  const token = encodeSharePayloadToken(payload);
  const shareUrl = buildShareUrl(token, currentUrl);

  return {
    payload,
    token,
    url: shareUrl,
    baseViewerUrl,
    missingAttachmentIds,
    metrics: {
      tokenLength: token.length,
      urlLength: shareUrl.length,
      usedAttachmentCount: includedAttachments.length,
      optimizedAttachmentCount,
      savedAttachmentBytes,
      profileIconOptimized,
      profileIconSavedBytes,
      presetLabel: preset.label,
      imageMaxDimension: preset.maxDimension,
      imageQuality: preset.quality,
    },
  };
}

export async function buildShareBundle({ profile, article, attachments, currentUrl = window.location.href }) {
  if (!article) {
    throw new Error('共有対象の記事がありません。');
  }

  const referencedIds = extractAttachmentReferences(article.content);
  const attachmentMap = new Map((attachments || []).map((attachment) => [attachment.id, attachment]));
  let bestCandidate = null;

  for (const preset of SHARE_IMAGE_PRESETS) {
    const candidate = await createShareCandidate({
      profile,
      article,
      attachmentMap,
      referencedIds,
      currentUrl,
      preset,
    });

    if (!bestCandidate || candidate.metrics.urlLength < bestCandidate.metrics.urlLength) {
      bestCandidate = candidate;
    }

    if (candidate.metrics.urlLength <= SHARE_URL_WARN_LENGTH) {
      break;
    }
  }

  return bestCandidate;
}

export function buildShareUrl(token, currentUrl = window.location.href) {
  const sharePageUrl = new URL(buildViewerEntryUrl(currentUrl));
  sharePageUrl.hash = `${SHARE_QUERY_KEY}=${token}`;
  return sharePageUrl.toString();
}

export function buildViewerEntryUrl(currentUrl = window.location.href) {
  const current = new URL(currentUrl);
  return new URL('/share', current.origin).toString();
}

export function buildSharePackageText(bundle) {
  if (!bundle?.token) {
    return '';
  }

  const articleTitle = String(bundle.payload?.article?.title || '無題記事');
  const lines = [
    `SCP Sandbox Editor 共有データ`,
    `記事タイトル: ${articleTitle}`,
    `共有ビュー: ${bundle.baseViewerUrl || buildViewerEntryUrl()}`,
    `共有コード:`,
    bundle.token,
    '',
    '長いURLが開けない場合は、このメッセージ全体または共有コードだけを共有ビューへ貼り付けてください。',
  ];

  return lines.join('\n');
}

export function getShareWarnings(bundle) {
  const warnings = [];
  const { url, missingAttachmentIds = [], metrics = {} } = bundle || {};

  if (!url) {
    return warnings;
  }

  if (metrics.urlLength > SHARE_URL_DANGER_LENGTH) {
    warnings.push(
      '共有URLが非常に長いため、LINE や一部スマホ環境ではリンクとして扱われない可能性があります。受信用メッセージコピー、共有ファイル、共有コードの利用を優先してください。',
    );
  } else if (metrics.urlLength > SHARE_URL_WARN_LENGTH) {
    warnings.push(
      '共有URLが長めです。モバイルメッセンジャーで不安定な場合は「受信用メッセージコピー」「端末で共有」または共有ファイルを使ってください。',
    );
  }

  if (missingAttachmentIds.length > 0) {
    warnings.push('本文で参照されている添付画像の一部が見つからないため、その画像は共有に含まれていません。');
  }

  return warnings;
}
