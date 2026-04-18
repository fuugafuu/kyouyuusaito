const BLOCKED_TAGS = new Set([
  'SCRIPT',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'STYLE',
  'LINK',
  'META',
  'BASE',
  'FORM',
  'INPUT',
  'BUTTON',
  'TEXTAREA',
  'SELECT',
  'OPTION',
]);

const ALLOWED_TAGS = new Set([
  'A',
  'BLOCKQUOTE',
  'BR',
  'CODE',
  'DETAILS',
  'DIV',
  'EM',
  'FIGCAPTION',
  'FIGURE',
  'H1',
  'H2',
  'H3',
  'HR',
  'IMG',
  'P',
  'PRE',
  'SECTION',
  'SPAN',
  'STRONG',
  'SUMMARY',
]);

const ALLOWED_ATTRIBUTES = {
  '*': new Set(['class']),
  A: new Set(['href', 'target', 'rel', 'class']),
  DETAILS: new Set(['open', 'class']),
  IMG: new Set(['src', 'alt', 'class', 'data-attachment-id']),
};

function isSafeHref(value) {
  const trimmed = String(value || '').trim();
  return /^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed) || trimmed.startsWith('#');
}

function isSafeImageSource(value) {
  const trimmed = String(value || '').trim();
  return (
    /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,/i.test(trimmed) ||
    /^https?:\/\//i.test(trimmed) ||
    /^blob:/i.test(trimmed)
  );
}

function unwrapElement(element) {
  const parent = element.parentNode;
  if (!parent) {
    return;
  }

  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element);
  }

  parent.removeChild(element);
}

function sanitizeElement(element) {
  const tagName = element.tagName.toUpperCase();
  if (BLOCKED_TAGS.has(tagName)) {
    element.remove();
    return;
  }

  if (!ALLOWED_TAGS.has(tagName)) {
    unwrapElement(element);
    return;
  }

  const allowedForTag = new Set([
    ...(ALLOWED_ATTRIBUTES['*'] || []),
    ...(ALLOWED_ATTRIBUTES[tagName] || []),
  ]);

  for (const attribute of [...element.attributes]) {
    const name = attribute.name.toLowerCase();
    const value = attribute.value;

    if (name.startsWith('on')) {
      element.removeAttribute(attribute.name);
      continue;
    }

    if (!allowedForTag.has(attribute.name)) {
      element.removeAttribute(attribute.name);
      continue;
    }

    if (tagName === 'A' && name === 'href' && !isSafeHref(value)) {
      element.removeAttribute(attribute.name);
    }

    if (tagName === 'IMG' && name === 'src' && !isSafeImageSource(value)) {
      element.remove();
      return;
    }
  }

  if (tagName === 'A') {
    element.setAttribute('target', '_blank');
    element.setAttribute('rel', 'noopener noreferrer');
  }

  for (const child of [...element.childNodes]) {
    sanitizeNode(child);
  }
}

function sanitizeNode(node) {
  if (node.nodeType === Node.COMMENT_NODE) {
    node.remove();
    return;
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    sanitizeElement(node);
  }
}

export function sanitizeHtml(html = '') {
  const parser = new DOMParser();
  const documentFragment = parser.parseFromString(`<body>${html}</body>`, 'text/html');
  const { body } = documentFragment;

  for (const child of [...body.childNodes]) {
    sanitizeNode(child);
  }

  return body.innerHTML;
}

export function setSanitizedHTML(element, html) {
  element.innerHTML = sanitizeHtml(html);
}
