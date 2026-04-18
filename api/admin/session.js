import { createHmac, timingSafeEqual } from 'node:crypto';

const SESSION_COOKIE = 'sb_admin_session';
const SESSION_TTL_SECONDS = 60 * 60 * 8;
const DEFAULT_ADMIN_USERNAME = 'admin';

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status || 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...(init.headers || {}),
    },
  });
}

function getConfig() {
  const username = String(process.env.SANDBOX_ADMIN_USERNAME || DEFAULT_ADMIN_USERNAME).trim();
  const password = String(process.env.SANDBOX_ADMIN_PASSWORD || '').trim();
  const secret = String(process.env.SANDBOX_ADMIN_SESSION_SECRET || '').trim();

  return {
    username,
    password,
    secret: secret || password,
    configured: Boolean(password),
  };
}

function base64UrlEncode(input) {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function base64UrlDecode(input) {
  return Buffer.from(String(input || ''), 'base64url').toString('utf8');
}

function signPayload(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function createSessionToken(username, secret) {
  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
  const payload = base64UrlEncode(JSON.stringify({ username, expiresAt }));
  const signature = signPayload(payload, secret);
  return `${payload}.${signature}`;
}

function parseCookies(request) {
  const source = String(request.headers.get('cookie') || '');
  const cookies = {};

  source.split(';').forEach((part) => {
    const [rawName, ...rest] = part.trim().split('=');
    if (!rawName) {
      return;
    }
    cookies[rawName] = decodeURIComponent(rest.join('=') || '');
  });

  return cookies;
}

function verifyToken(token, secret) {
  if (!token || !secret || !String(token).includes('.')) {
    return null;
  }

  const [payload, signature] = String(token).split('.', 2);
  const expected = signPayload(payload, secret);
  const left = Buffer.from(signature, 'utf8');
  const right = Buffer.from(expected, 'utf8');

  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(payload));
    if (!parsed?.expiresAt || parsed.expiresAt < Date.now()) {
      return null;
    }

    return {
      username: String(parsed.username || DEFAULT_ADMIN_USERNAME),
      expiresAt: Number(parsed.expiresAt),
    };
  } catch {
    return null;
  }
}

function buildSessionCookie(token, maxAge = SESSION_TTL_SECONDS) {
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Secure',
    `Max-Age=${maxAge}`,
  ].join('; ');
}

function buildExpiredCookie() {
  return [
    `${SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Secure',
    'Max-Age=0',
  ].join('; ');
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export async function GET(request) {
  const config = getConfig();
  if (!config.configured) {
    return json({
      authenticated: false,
      configured: false,
      message: '管理者パスワードがサーバー環境変数に設定されていません。',
    });
  }

  const token = parseCookies(request)[SESSION_COOKIE] || '';
  const session = verifyToken(token, config.secret);

  return json({
    authenticated: Boolean(session),
    configured: true,
    username: session?.username || '',
    expiresAt: session?.expiresAt || 0,
  });
}

export async function POST(request) {
  const config = getConfig();
  if (!config.configured) {
    return json(
      {
        ok: false,
        configured: false,
        message: '管理者パスワードがサーバー環境変数に設定されていません。',
      },
      { status: 503 },
    );
  }

  const body = await readBody(request);
  const username = String(body?.username || DEFAULT_ADMIN_USERNAME).trim() || DEFAULT_ADMIN_USERNAME;
  const password = String(body?.password || '').trim();

  if (username !== config.username || password !== config.password) {
    return json(
      {
        ok: false,
        configured: true,
        message: '認証情報が正しくありません。',
      },
      { status: 401 },
    );
  }

  const token = createSessionToken(username, config.secret);

  return json(
    {
      ok: true,
      configured: true,
      username,
      message: '管理者セッションを開始しました。',
    },
    {
      headers: {
        'set-cookie': buildSessionCookie(token),
      },
    },
  );
}

export async function DELETE() {
  return json(
    {
      ok: true,
      configured: true,
      message: '管理者セッションを終了しました。',
    },
    {
      headers: {
        'set-cookie': buildExpiredCookie(),
      },
    },
  );
}
