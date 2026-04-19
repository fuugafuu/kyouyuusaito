import {
  base64UrlToBytes,
  buildDataUrl,
  bytesToBase64Url,
  decodeUtf8Bytes,
  encodeUtf8Bytes,
  splitDataUrl,
} from './utils.js';

const RAW_PREFIX = 'raw.';
const LZW_PREFIX = 'lzw.';
const EOF_CODE = 256;
const INITIAL_NEXT_CODE = 257;
const MAX_CODE_SIZE = 20;

function createBitWriter() {
  const bytes = [];
  let currentByte = 0;
  let usedBits = 0;

  return {
    write(value, width) {
      for (let bitIndex = width - 1; bitIndex >= 0; bitIndex -= 1) {
        currentByte = (currentByte << 1) | ((value >> bitIndex) & 1);
        usedBits += 1;

        if (usedBits === 8) {
          bytes.push(currentByte);
          currentByte = 0;
          usedBits = 0;
        }
      }
    },

    finish() {
      if (usedBits > 0) {
        currentByte <<= 8 - usedBits;
        bytes.push(currentByte);
      }

      return Uint8Array.from(bytes);
    },
  };
}

function createBitReader(bytes) {
  let byteIndex = 0;
  let currentByte = 0;
  let remainingBits = 0;

  return {
    read(width) {
      let value = 0;

      for (let offset = 0; offset < width; offset += 1) {
        if (remainingBits === 0) {
          if (byteIndex >= bytes.length) {
            return null;
          }

          currentByte = bytes[byteIndex];
          byteIndex += 1;
          remainingBits = 8;
        }

        value = (value << 1) | ((currentByte >> (remainingBits - 1)) & 1);
        remainingBits -= 1;
      }

      return value;
    },
  };
}

function binaryStringToBytes(binary) {
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function lzwCompressBytes(bytes) {
  const dictionary = new Map();
  for (let index = 0; index < 256; index += 1) {
    dictionary.set(String.fromCharCode(index), index);
  }

  const writer = createBitWriter();
  let nextCode = INITIAL_NEXT_CODE;
  let codeSize = 9;
  let current = '';

  for (const byte of bytes) {
    const char = String.fromCharCode(byte);
    if (!current) {
      current = char;
      continue;
    }

    const combined = current + char;
    if (dictionary.has(combined)) {
      current = combined;
      continue;
    }

    writer.write(dictionary.get(current), codeSize);
    dictionary.set(combined, nextCode);
    nextCode += 1;

    if (nextCode >= 1 << codeSize && codeSize < MAX_CODE_SIZE) {
      codeSize += 1;
    }

    current = char;
  }

  if (current) {
    writer.write(dictionary.get(current), codeSize);
  }

  writer.write(EOF_CODE, codeSize);
  return writer.finish();
}

function lzwDecompressBytes(bytes) {
  if (!(bytes instanceof Uint8Array) || !bytes.length) {
    return new Uint8Array();
  }

  const dictionary = Array.from({ length: INITIAL_NEXT_CODE }, (_, index) =>
    index < 256 ? String.fromCharCode(index) : '',
  );

  const reader = createBitReader(bytes);
  let nextCode = INITIAL_NEXT_CODE;
  let codeSize = 9;
  const firstCode = reader.read(codeSize);

  if (firstCode === null || firstCode === EOF_CODE) {
    return new Uint8Array();
  }

  if (firstCode < 0 || firstCode >= 256) {
    throw new Error('共有データの先頭コードが壊れています。');
  }

  let previous = dictionary[firstCode];
  let output = previous;

  while (true) {
    const code = reader.read(codeSize);
    if (code === null || code === EOF_CODE) {
      break;
    }

    let entry = dictionary[code];
    if (entry == null || entry === '') {
      if (code !== nextCode) {
        throw new Error('共有データの復元に失敗しました。');
      }
      entry = previous + previous[0];
    }

    output += entry;
    dictionary[nextCode] = previous + entry[0];
    nextCode += 1;

    if (nextCode >= 1 << codeSize && codeSize < MAX_CODE_SIZE) {
      codeSize += 1;
    }

    previous = entry;
  }

  return binaryStringToBytes(output);
}

function packImageSource(dataUrl = '') {
  const parts = splitDataUrl(dataUrl);
  if (!parts || !parts.isBase64 || !parts.payload) {
    return null;
  }

  return [parts.mimeType, parts.payload];
}

function unpackImageSource(parts) {
  if (!Array.isArray(parts) || parts.length !== 2) {
    return '';
  }

  return buildDataUrl(parts[0], parts[1], { isBase64: true });
}

function packPayload(payload) {
  return {
    v: Number(payload?.version) || 1,
    p: [String(payload?.profile?.name || ''), packImageSource(payload?.profile?.icon || '')],
    a: [
      String(payload?.article?.title || ''),
      String(payload?.article?.content || ''),
      String(payload?.article?.series || ''),
      Number(payload?.article?.articleNumber) || 0,
      String(payload?.article?.objectClass || ''),
      String(payload?.article?.slug || ''),
      String(payload?.article?.summary || ''),
      String(payload?.article?.customCss || ''),
      String(payload?.article?.customJs || ''),
      Number(payload?.article?.publishedAt) || 0,
      Number(payload?.article?.updatedAt) || 0,
    ],
    m: Array.isArray(payload?.attachments)
      ? payload.attachments
          .map((attachment) => {
            const image = packImageSource(attachment?.data || '');
            if (!image) {
              return null;
            }

            return [
              String(attachment?.id || ''),
              String(attachment?.name || ''),
              image[0],
              image[1],
            ];
          })
          .filter(Boolean)
      : [],
  };
}

function unpackPayload(compact) {
  if (!compact || typeof compact !== 'object') {
    throw new Error('共有データの形式が正しくありません。');
  }

  const profile = Array.isArray(compact.p) ? compact.p : ['', null];
  const article = Array.isArray(compact.a) ? compact.a : [];
  const attachments = Array.isArray(compact.m) ? compact.m : [];

  return {
    version: Number(compact.v) || 1,
    profile: {
      name: String(profile[0] || ''),
      icon: unpackImageSource(profile[1]),
    },
    article: {
      title: String(article[0] || ''),
      content: String(article[1] || ''),
      series: String(article[2] || ''),
      articleNumber: Number(article[3]) || null,
      objectClass: String(article[4] || ''),
      slug: String(article[5] || ''),
      summary: String(article[6] || ''),
      customCss: String(article[7] || ''),
      customJs: String(article[8] || ''),
      publishedAt: Number(article[9]) || 0,
      updatedAt: Number(article[10]) || 0,
    },
    attachments: attachments
      .map((item) => {
        if (!Array.isArray(item) || item.length < 4) {
          return null;
        }

        return {
          id: String(item[0] || ''),
          name: String(item[1] || ''),
          mimeType: String(item[2] || 'image/webp'),
          data: buildDataUrl(String(item[2] || 'image/webp'), String(item[3] || ''), {
            isBase64: true,
          }),
        };
      })
      .filter(Boolean),
  };
}

export function encodeSharePayloadToken(payload) {
  const json = JSON.stringify(packPayload(payload));
  const rawBytes = encodeUtf8Bytes(json);
  const compressedBytes = lzwCompressBytes(rawBytes);
  const shouldUseCompressed =
    compressedBytes.length + LZW_PREFIX.length < rawBytes.length + RAW_PREFIX.length;

  return shouldUseCompressed
    ? `${LZW_PREFIX}${bytesToBase64Url(compressedBytes)}`
    : `${RAW_PREFIX}${bytesToBase64Url(rawBytes)}`;
}

export function decodeSharePayloadToken(token) {
  const normalized = String(token || '').trim();
  if (!normalized) {
    throw new Error('共有コードが空です。');
  }

  let json = '';
  if (normalized.startsWith(LZW_PREFIX)) {
    try {
      json = decodeUtf8Bytes(lzwDecompressBytes(base64UrlToBytes(normalized.slice(LZW_PREFIX.length))));
    } catch (error) {
      throw new Error(
        error instanceof Error && error.message
          ? `共有データの復元に失敗しました: ${error.message}`
          : '共有データの復元に失敗しました。',
      );
    }
  } else if (normalized.startsWith(RAW_PREFIX)) {
    try {
      json = decodeUtf8Bytes(base64UrlToBytes(normalized.slice(RAW_PREFIX.length)));
    } catch {
      throw new Error('共有データの読み取りに失敗しました。');
    }
  } else {
    throw new Error('共有コードの形式が正しくありません。');
  }

  try {
    return unpackPayload(JSON.parse(json));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('共有データの JSON が壊れています。');
    }
    throw error;
  }
}
