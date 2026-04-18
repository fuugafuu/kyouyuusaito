import { APP_VERSION, DEFAULT_PROFILE_ICON, SHARE_HASH_KEY, SHARE_URL_WARN_LENGTH } from '../common/constants.js';
import { encodeBase64Utf8 } from '../common/utils.js';
import { extractAttachmentReferences } from '../common/markup.js';

export function buildShareData({ profile, article, attachments }) {
  if (!article) {
    throw new Error('共有対象の記事がありません。');
  }

  const referencedIds = extractAttachmentReferences(article.content);
  const attachmentMap = new Map((attachments || []).map((attachment) => [attachment.id, attachment]));
  const includedAttachments = [];
  const missingAttachmentIds = [];

  for (const attachmentId of referencedIds) {
    const attachment = attachmentMap.get(attachmentId);
    if (attachment) {
      includedAttachments.push(attachment);
    } else {
      missingAttachmentIds.push(attachmentId);
    }
  }

  return {
    payload: {
      version: APP_VERSION,
      profile: {
        name: profile?.name || '財団職員',
        icon: profile?.icon && profile.icon !== DEFAULT_PROFILE_ICON ? profile.icon : '',
      },
      article: {
        title: article.title,
        content: article.content,
      },
      attachments: includedAttachments,
    },
    missingAttachmentIds,
  };
}

export function buildShareUrl(payload, currentUrl = window.location.href) {
  const encoded = encodeURIComponent(encodeBase64Utf8(JSON.stringify(payload)));
  const sharePageUrl = new URL('../share/index.html', currentUrl);
  sharePageUrl.hash = `${SHARE_HASH_KEY}=${encoded}`;
  return sharePageUrl.toString();
}

export function getShareWarnings(url, missingAttachmentIds = []) {
  const warnings = [];

  if (url.length > SHARE_URL_WARN_LENGTH) {
    warnings.push('共有URLが長くなっています。ブラウザや環境によっては共有しにくい可能性があります。');
  }

  if (missingAttachmentIds.length > 0) {
    warnings.push('本文内で参照している添付画像の一部が見つからなかったため、共有データに含められませんでした。');
  }

  return warnings;
}
