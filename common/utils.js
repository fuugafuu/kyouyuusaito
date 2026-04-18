import {
  COOKIE_NAME_USER_KEY,
  DEFAULT_PROFILE_ICON,
  SUPPORTED_IMAGE_TYPES,
} from './constants.js';

export function getCookie(name) {
  return document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1) || '';
}

export function setCookie(name, value, days = 365) {
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

export function generateId(prefix = 'id') {
  if (crypto?.randomUUID) {
    return `${prefix}-${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
  }

  if (crypto?.getRandomValues) {
    const buffer = new Uint8Array(10);
    crypto.getRandomValues(buffer);
    return `${prefix}-${Array.from(buffer, (item) => item.toString(16).padStart(2, '0')).join('')}`;
  }

  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function ensureUserKey() {
  let userKey = decodeURIComponent(getCookie(COOKIE_NAME_USER_KEY) || '');
  if (!userKey) {
    userKey = generateId('user');
    setCookie(COOKIE_NAME_USER_KEY, userKey);
  }
  return userKey;
}

export function safeParseJSON(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

export function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function encodeUtf8Bytes(text) {
  return new TextEncoder().encode(String(text ?? ''));
}

export function decodeUtf8Bytes(bytes) {
  return new TextDecoder().decode(bytes);
}

export function encodeBase64Utf8(text) {
  return bytesToBase64(encodeUtf8Bytes(text));
}

export function decodeBase64Utf8(base64) {
  return decodeUtf8Bytes(base64ToBytes(base64));
}

export function bytesToBase64Url(bytes) {
  return bytesToBase64(bytes).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

export function base64UrlToBytes(base64Url) {
  const normalized = String(base64Url || '')
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(Math.ceil(String(base64Url || '').length / 4) * 4, '=');
  return base64ToBytes(normalized);
}

export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function escapeAttribute(value = '') {
  return escapeHtml(value);
}

export function formatDateTime(timestamp) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return '未保存';
  }

  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp);
}

export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(String(text ?? ''));
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = String(text ?? '');
  textarea.setAttribute('readonly', 'readonly');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

export async function readClipboardText() {
  if (!navigator.clipboard?.readText) {
    throw new Error('この環境ではクリップボード読み取りに対応していません。');
  }

  return navigator.clipboard.readText();
}

export function downloadTextFile(filename, text, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([String(text ?? '')], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}

export function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました。'));
    reader.readAsText(file, 'utf-8');
  });
}

export function serializeError(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === 'string' ? error : '不明なエラーが発生しました。';
}

export function isSupportedImageType(mimeType) {
  return SUPPORTED_IMAGE_TYPES.includes(String(mimeType || '').toLowerCase());
}

export function isSafeHttpUrl(value) {
  try {
    const parsed = new URL(value, window.location.href);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isSafeImageSource(value, { allowDefault = false, allowRemote = false } = {}) {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return false;
  }

  if (allowDefault && trimmed === DEFAULT_PROFILE_ICON) {
    return true;
  }

  if (/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[a-z0-9+/=]+$/i.test(trimmed)) {
    return true;
  }

  if (/^blob:/i.test(trimmed)) {
    return true;
  }

  return allowRemote ? isSafeHttpUrl(trimmed) : false;
}

export function estimateDataUrlBytes(dataUrl = '') {
  const [header = '', payload = ''] = String(dataUrl || '').split(',', 2);
  if (!payload) {
    return 0;
  }

  if (header.includes(';base64')) {
    const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
    return Math.floor((payload.length * 3) / 4) - padding;
  }

  return decodeURIComponent(payload).length;
}

export function splitDataUrl(dataUrl = '') {
  const match = String(dataUrl || '').match(/^data:([^;,]+)(?:;charset=[^;,]+)?(;base64)?,(.*)$/i);
  if (!match) {
    return null;
  }

  return {
    mimeType: match[1].toLowerCase(),
    isBase64: Boolean(match[2]),
    payload: match[3] || '',
  };
}

export function buildDataUrl(mimeType, payload, { isBase64 = true } = {}) {
  if (!mimeType || !payload) {
    return '';
  }

  return `data:${mimeType}${isBase64 ? ';base64' : ''},${payload}`;
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('画像データの読み込みに失敗しました。'));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('画像のデコードに失敗しました。'));
    image.src = dataUrl;
  });
}

function fitInside(width, height, maxDimension) {
  if (width <= maxDimension && height <= maxDimension) {
    return { width, height };
  }

  const ratio = width >= height ? maxDimension / width : maxDimension / height;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

export async function resizeImageFileToDataUrl(
  file,
  { maxDimension = 1600, quality = 0.84, outputType = 'image/webp' } = {},
) {
  const originalDataUrl = await fileToDataUrl(file);

  if (file.type === 'image/gif') {
    return {
      dataUrl: originalDataUrl,
      mimeType: file.type,
      approxBytes: file.size,
      wasCompressed: false,
      width: 0,
      height: 0,
    };
  }

  const image = await loadImage(originalDataUrl);
  const { width, height } = fitInside(image.width, image.height, maxDimension);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas を初期化できませんでした。');
  }

  context.drawImage(image, 0, 0, width, height);

  const mimeType = isSupportedImageType(outputType) ? outputType : 'image/webp';
  const dataUrl = canvas.toDataURL(mimeType, quality);

  return {
    dataUrl,
    mimeType,
    approxBytes: estimateDataUrlBytes(dataUrl),
    wasCompressed: dataUrl !== originalDataUrl,
    width,
    height,
  };
}

export async function resizeImageDataUrl(
  dataUrl,
  { maxDimension = 1600, quality = 0.84, outputType = 'image/webp' } = {},
) {
  const source = String(dataUrl || '').trim();
  const parts = splitDataUrl(source);
  if (!parts) {
    throw new Error('画像データの形式が正しくありません。');
  }

  if (parts.mimeType === 'image/gif') {
    return {
      dataUrl: source,
      mimeType: parts.mimeType,
      approxBytes: estimateDataUrlBytes(source),
      wasCompressed: false,
      width: 0,
      height: 0,
    };
  }

  const image = await loadImage(source);
  const { width, height } = fitInside(image.width, image.height, maxDimension);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas を初期化できませんでした。');
  }

  context.drawImage(image, 0, 0, width, height);

  const mimeType = isSupportedImageType(outputType) ? outputType : 'image/webp';
  const resizedDataUrl = canvas.toDataURL(mimeType, quality);

  return {
    dataUrl: resizedDataUrl,
    mimeType,
    approxBytes: estimateDataUrlBytes(resizedDataUrl),
    wasCompressed: resizedDataUrl !== source,
    width,
    height,
  };
}

export function uniqueStrings(values = []) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim()))];
}

export function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function readHashParam(name, hash = window.location.hash) {
  const fragment = String(hash || '').startsWith('#') ? String(hash || '').slice(1) : String(hash || '');
  const params = new URLSearchParams(fragment);
  return params.get(name) || '';
}

export function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

export function slugify(value, fallback = 'untitled') {
  const normalized = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || fallback;
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', encodeUtf8Bytes(String(value || '')));
  const bytes = new Uint8Array(digest);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
