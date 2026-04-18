import {
  MAX_ATTACHMENT_DIMENSION,
  MAX_ATTACHMENT_WARNING_BYTES,
  MAX_PROFILE_ICON_DIMENSION,
  MAX_PROFILE_ICON_WARNING_BYTES,
} from '../common/constants.js';
import { normalizeAttachment } from '../common/models.js';
import { generateId, isSupportedImageType, resizeImageFileToDataUrl } from '../common/utils.js';
import { removeAttachmentReferences } from '../common/markup.js';

async function prepareImage(file, options) {
  if (!isSupportedImageType(file.type)) {
    throw new Error(`${file.name} は PNG / JPEG / WebP / GIF のみ対応です。`);
  }

  if (file.type === 'image/gif') {
    return resizeImageFileToDataUrl(file, { ...options, outputType: 'image/gif' });
  }

  return resizeImageFileToDataUrl(file, options);
}

export async function createAttachmentsFromFiles(files, articleId) {
  const attachments = [];
  const warnings = [];

  for (const file of files) {
    const processed = await prepareImage(file, {
      maxDimension: MAX_ATTACHMENT_DIMENSION,
      quality: 0.82,
      outputType: 'image/webp',
    });

    if (file.size > MAX_ATTACHMENT_WARNING_BYTES || processed.approxBytes > MAX_ATTACHMENT_WARNING_BYTES) {
      warnings.push(`${file.name} は大きめの画像です。共有URLが長くなる可能性があります。`);
    }

    attachments.push(
      normalizeAttachment({
        id: generateId('attachment'),
        articleId,
        name: file.name,
        mimeType: processed.mimeType,
        data: processed.dataUrl,
        createdAt: Date.now(),
      }),
    );
  }

  return { attachments, warnings };
}

export async function createProfileIconFromFile(file) {
  const processed = await prepareImage(file, {
    maxDimension: MAX_PROFILE_ICON_DIMENSION,
    quality: 0.86,
    outputType: 'image/webp',
  });

  const warnings = [];
  if (file.size > MAX_PROFILE_ICON_WARNING_BYTES || processed.approxBytes > MAX_PROFILE_ICON_WARNING_BYTES) {
    warnings.push('アイコン画像が大きめです。共有URLに含める場合は長くなる可能性があります。');
  }

  return {
    dataUrl: processed.dataUrl,
    warnings,
  };
}

export function removeAttachmentFromArticle(article, attachmentId) {
  return {
    ...article,
    attachmentIds: article.attachmentIds.filter((id) => id !== attachmentId),
    content: removeAttachmentReferences(article.content, attachmentId),
  };
}
