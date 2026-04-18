import { escapeAttribute, escapeHtml, escapeRegExp } from './utils.js';

function renderSafeLink(label, url) {
  const safeUrl = String(url || '').trim();
  if (!/^https?:\/\//i.test(safeUrl)) {
    return escapeHtml(label);
  }

  return `<a href="${escapeAttribute(safeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
}

function renderAttachment(id, alt, attachmentMap) {
  const attachment = attachmentMap.get(id);
  if (!attachment) {
    return `<span class="missing-attachment">missing attachment: ${escapeHtml(id)}</span>`;
  }

  const altText = alt || attachment.name || 'attachment';
  return `<img class="inline-attachment" src="${escapeAttribute(attachment.data)}" alt="${escapeAttribute(altText)}" data-attachment-id="${escapeAttribute(id)}">`;
}

function renderInlineMarkup(text, attachmentMap) {
  const tokenPattern =
    /\[\[attachment:([a-z0-9_-]+)(?:\|([^\]]*))?\]\]|\[\[([^\]|]+)\|([^\]]+)\]\]|\[\[(https?:\/\/[^\]]+)\]\]|\*\*([^*]+)\*\*|\/\/([^/\n]+)\/\//gi;

  let html = '';
  let lastIndex = 0;

  for (const match of text.matchAll(tokenPattern)) {
    const index = match.index ?? 0;
    html += escapeHtml(text.slice(lastIndex, index));

    if (match[1]) {
      html += renderAttachment(match[1], match[2], attachmentMap);
    } else if (match[3] && match[4]) {
      html += renderSafeLink(match[3], match[4]);
    } else if (match[5]) {
      html += renderSafeLink(match[5], match[5]);
    } else if (match[6]) {
      html += `<strong>${escapeHtml(match[6])}</strong>`;
    } else if (match[7]) {
      html += `<em>${escapeHtml(match[7])}</em>`;
    }

    lastIndex = index + match[0].length;
  }

  html += escapeHtml(text.slice(lastIndex));
  return html;
}

function renderParagraph(lines, attachmentMap) {
  const html = renderInlineMarkup(lines.join('\n'), attachmentMap).replaceAll('\n', '<br>');
  return `<p>${html}</p>`;
}

function renderQuote(lines, attachmentMap) {
  const html = renderInlineMarkup(lines.join('\n'), attachmentMap).replaceAll('\n', '<br>');
  return `<blockquote>${html}</blockquote>`;
}

function renderPreformatted(lines, className) {
  return `<pre class="${escapeAttribute(className)}">${escapeHtml(lines.join('\n'))}</pre>`;
}

function renderCollapsibleBlock(title, content, attachments, { open = false } = {}) {
  const safeTitle = escapeHtml(title || '折りたたみ');
  const innerHtml = parseMarkupToHtml(content, attachments);
  return `<details class="collapsible-block"${open ? ' open' : ''}><summary>${safeTitle}</summary><div class="collapsible-body">${innerHtml}</div></details>`;
}

function parseFoldDirective(line) {
  const trimmed = String(line || '').trim();
  const startMatch = trimmed.match(/^\[\[(fold|collapse)(-open)?:([^\]]+)\]\]$/i);
  if (startMatch) {
    return {
      type: 'start',
      open: Boolean(startMatch[2]),
      title: startMatch[3].trim() || '折りたたみ',
    };
  }

  if (/^\[\[\/(fold|collapse)\]\]$/i.test(trimmed)) {
    return { type: 'end' };
  }

  return null;
}

function getLogLineScore(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) {
    return 0;
  }

  let score = 0;
  if (/^\[[A-Z0-9_-]+(?:\s+[A-Z0-9_-]+)*\]/.test(trimmed)) {
    score += 2;
  }
  if (/^[A-Z][A-Z0-9_.-]*\s*=/.test(trimmed)) {
    score += 2;
  }
  if (/"[^"]+"/.test(trimmed)) {
    score += 1;
  }
  if (/(NOT FOUND|UNRESOLVED|MISMATCH|PURGED|EMPTY|DEGRADATION|RISK)/i.test(trimmed)) {
    score += 1;
  }
  return score;
}

function isLikelyLogBlock(lines) {
  const visibleLines = lines.filter((line) => String(line || '').trim());
  if (visibleLines.length < 3) {
    return false;
  }

  const totalScore = visibleLines.reduce((sum, line) => sum + getLogLineScore(line), 0);
  return totalScore >= visibleLines.length * 1.5;
}

export function extractAttachmentReferences(content = '') {
  const ids = new Set();
  const pattern = /\[\[attachment:([a-z0-9_-]+)(?:\|[^\]]*)?\]\]/gi;

  for (const match of String(content || '').matchAll(pattern)) {
    if (match[1]) {
      ids.add(match[1]);
    }
  }

  return [...ids];
}

export function removeAttachmentReferences(content = '', attachmentId) {
  const pattern = new RegExp(
    `\\[\\[attachment:${escapeRegExp(attachmentId)}(?:\\|[^\\]]*)?\\]\\]\\s*`,
    'gi',
  );

  return String(content || '').replace(pattern, '').replace(/\n{3,}/g, '\n\n').trimEnd();
}

export function parseMarkupToHtml(content = '', attachments = []) {
  const normalizedContent = String(content || '').replaceAll('\r\n', '\n');
  if (!normalizedContent.trim()) {
    return '<p class="empty-preview">本文はまだ空です。</p>';
  }

  const attachmentMap = new Map(
    attachments
      .filter((attachment) => attachment?.id && attachment?.data)
      .map((attachment) => [attachment.id, attachment]),
  );

  const blocks = [];
  const paragraph = [];
  const quote = [];
  const codeBlock = [];
  const lines = normalizedContent.split('\n');
  let inCodeBlock = false;
  let collapsibleBlock = null;

  const flushParagraph = () => {
    if (!paragraph.length) {
      return;
    }

    const linesToRender = paragraph.splice(0);
    if (isLikelyLogBlock(linesToRender)) {
      blocks.push(renderPreformatted(linesToRender, 'log-block'));
      return;
    }

    blocks.push(renderParagraph(linesToRender, attachmentMap));
  };

  const flushQuote = () => {
    if (!quote.length) {
      return;
    }
    blocks.push(renderQuote(quote.splice(0), attachmentMap));
  };

  const flushCodeBlock = () => {
    if (!codeBlock.length) {
      return;
    }
    blocks.push(renderPreformatted(codeBlock.splice(0), 'code-block'));
  };

  const flushCollapsibleBlock = () => {
    if (!collapsibleBlock) {
      return;
    }

    blocks.push(
      renderCollapsibleBlock(
        collapsibleBlock.title,
        collapsibleBlock.lines.join('\n'),
        attachments,
        { open: collapsibleBlock.open },
      ),
    );
    collapsibleBlock = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^```/.test(trimmed)) {
      flushParagraph();
      flushQuote();

      if (inCodeBlock) {
        flushCodeBlock();
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }

      continue;
    }

    if (inCodeBlock) {
      codeBlock.push(line);
      continue;
    }

    const foldDirective = parseFoldDirective(line);
    if (collapsibleBlock) {
      if (foldDirective?.type === 'end') {
        flushCollapsibleBlock();
      } else {
        collapsibleBlock.lines.push(line);
      }
      continue;
    }

    if (foldDirective?.type === 'start') {
      flushParagraph();
      flushQuote();
      collapsibleBlock = {
        title: foldDirective.title,
        open: foldDirective.open,
        lines: [],
      };
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      flushQuote();
      continue;
    }

    if (trimmed === '---') {
      flushParagraph();
      flushQuote();
      blocks.push('<hr>');
      continue;
    }

    if (/^###\s+/.test(line)) {
      flushParagraph();
      flushQuote();
      blocks.push(`<h3>${renderInlineMarkup(line.replace(/^###\s+/, ''), attachmentMap)}</h3>`);
      continue;
    }

    if (/^##\s+/.test(line)) {
      flushParagraph();
      flushQuote();
      blocks.push(`<h2>${renderInlineMarkup(line.replace(/^##\s+/, ''), attachmentMap)}</h2>`);
      continue;
    }

    if (/^#\s+/.test(line)) {
      flushParagraph();
      flushQuote();
      blocks.push(`<h1>${renderInlineMarkup(line.replace(/^#\s+/, ''), attachmentMap)}</h1>`);
      continue;
    }

    if (/^>\s?/.test(line)) {
      flushParagraph();
      quote.push(line.replace(/^>\s?/, ''));
      continue;
    }

    flushQuote();
    paragraph.push(line);
  }

  flushParagraph();
  flushQuote();
  flushCodeBlock();
  flushCollapsibleBlock();

  return blocks.join('\n');
}
