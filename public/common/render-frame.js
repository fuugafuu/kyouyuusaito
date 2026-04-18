import { sanitizeHtml } from './sanitize.js';
import { escapeHtml } from './utils.js';

function escapeInlineScriptText(value = '') {
  return String(value || '').replace(/<\/script/gi, '<\\/script');
}

function escapeInlineStyleText(value = '') {
  return String(value || '').replace(/<\/style/gi, '<\\/style');
}

export function buildSandboxedArticleDocument({
  title = 'Sandbox Preview',
  designation = '',
  objectClass = '',
  profileName = '',
  summary = '',
  articleHtml = '',
  customCss = '',
  customJs = '',
  badgeText = 'Sandboxed Runtime',
}) {
  const safeArticleHtml = sanitizeHtml(articleHtml);
  const safeCustomCss = escapeInlineStyleText(customCss);
  const safeCustomJs = escapeInlineScriptText(customJs);

  return `<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: dark;
        --frame-bg: #111316;
        --panel-bg: rgba(20, 22, 25, 0.92);
        --panel-border: rgba(210, 206, 191, 0.18);
        --text-main: #ece7da;
        --text-soft: #aaa28f;
        --accent: #b53b35;
        --line: rgba(212, 208, 192, 0.12);
        --code-bg: rgba(5, 7, 10, 0.72);
        --paper: linear-gradient(180deg, rgba(23, 24, 27, 0.98), rgba(16, 17, 20, 0.98));
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        min-height: 100%;
        background:
          radial-gradient(circle at top, rgba(181, 59, 53, 0.16), transparent 44%),
          linear-gradient(180deg, #14171b 0%, #090a0c 100%);
        color: var(--text-main);
        font-family: Georgia, "Times New Roman", serif;
      }

      body {
        padding: 24px;
      }

      .runtime {
        max-width: 980px;
        margin: 0 auto;
        display: grid;
        gap: 18px;
      }

      .runtime-header,
      .runtime-paper {
        border: 1px solid var(--panel-border);
        border-radius: 20px;
        background: var(--panel-bg);
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.32);
        overflow: hidden;
      }

      .runtime-badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 14px;
        border-radius: 999px;
        border: 1px solid rgba(181, 59, 53, 0.36);
        background: rgba(181, 59, 53, 0.12);
        color: #ffd1cc;
        font-size: 12px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      .runtime-header {
        padding: 22px 24px;
      }

      .runtime-meta {
        display: grid;
        gap: 10px;
      }

      .runtime-label {
        color: var(--text-soft);
        font-size: 12px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }

      .runtime-title {
        margin: 0;
        font-size: clamp(28px, 5vw, 42px);
        line-height: 1.06;
      }

      .runtime-subline {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        color: var(--text-soft);
        font-size: 13px;
      }

      .runtime-paper {
        background: var(--paper);
      }

      .runtime-paper-inner {
        padding: 28px;
      }

      .runtime-summary {
        margin: 0 0 22px;
        padding: 14px 16px;
        border-radius: 14px;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.02);
        color: var(--text-soft);
      }

      .rendered-article {
        display: grid;
        gap: 1rem;
      }

      .rendered-article h1,
      .rendered-article h2,
      .rendered-article h3 {
        margin: 0;
        line-height: 1.2;
      }

      .rendered-article h1 {
        font-size: clamp(26px, 4vw, 38px);
      }

      .rendered-article h2 {
        font-size: clamp(22px, 3vw, 30px);
      }

      .rendered-article h3 {
        font-size: clamp(18px, 2.3vw, 24px);
      }

      .rendered-article p,
      .rendered-article blockquote,
      .rendered-article pre {
        margin: 0;
      }

      .rendered-article blockquote {
        padding: 14px 18px;
        border-left: 4px solid var(--accent);
        background: rgba(255, 255, 255, 0.03);
        color: #d6d0c2;
      }

      .rendered-article hr {
        width: 100%;
        border: none;
        border-top: 1px solid var(--line);
      }

      .rendered-article a {
        color: #ffd7c8;
      }

      .rendered-article img {
        max-width: 100%;
        display: block;
        border-radius: 14px;
        border: 1px solid rgba(255, 255, 255, 0.08);
      }

      .rendered-article pre {
        padding: 16px 18px;
        overflow: auto;
        border-radius: 16px;
        border: 1px solid rgba(255, 255, 255, 0.06);
        background: var(--code-bg);
        color: #dceaf8;
        font-family: "Cascadia Code", Consolas, monospace;
        font-size: 13px;
        line-height: 1.6;
      }

      .rendered-article details {
        border: 1px solid var(--line);
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.03);
        overflow: hidden;
      }

      .rendered-article summary {
        cursor: pointer;
        padding: 14px 16px;
        font-weight: 700;
      }

      .rendered-article .collapsible-body {
        padding: 0 16px 16px;
      }
    </style>
    <style>${safeCustomCss}</style>
  </head>
  <body>
    <div class="runtime">
      <section class="runtime-header">
        <span class="runtime-badge">${escapeHtml(badgeText)}</span>
        <div class="runtime-meta">
          <span class="runtime-label">${escapeHtml(designation || 'Custom Preview')}</span>
          <h1 class="runtime-title">${escapeHtml(title)}</h1>
          <div class="runtime-subline">
            ${objectClass ? `<span>Object Class: ${escapeHtml(objectClass)}</span>` : ''}
            ${profileName ? `<span>Author: ${escapeHtml(profileName)}</span>` : ''}
          </div>
        </div>
      </section>
      <section class="runtime-paper">
        <div class="runtime-paper-inner">
          ${summary ? `<p class="runtime-summary">${escapeHtml(summary)}</p>` : ''}
          <article class="rendered-article">${safeArticleHtml}</article>
        </div>
      </section>
    </div>
    <script>
      (() => {
        const deny = (name) => {
          throw new Error(name + ' is disabled in sandbox mode.');
        };

        window.fetch = (...args) => deny('fetch');
        window.XMLHttpRequest = function XMLHttpRequest() {
          deny('XMLHttpRequest');
        };
        window.WebSocket = function WebSocket() {
          deny('WebSocket');
        };
        window.EventSource = function EventSource() {
          deny('EventSource');
        };
        window.open = () => null;
        window.print = () => null;

        try {
          Object.defineProperty(document, 'cookie', {
            configurable: false,
            get() {
              return '';
            },
            set() {
              return true;
            },
          });
        } catch {}

        try {
          Object.defineProperty(window, 'localStorage', {
            configurable: false,
            get() {
              deny('localStorage');
            },
          });
          Object.defineProperty(window, 'sessionStorage', {
            configurable: false,
            get() {
              deny('sessionStorage');
            },
          });
          Object.defineProperty(window, 'indexedDB', {
            configurable: false,
            get() {
              deny('indexedDB');
            },
          });
        } catch {}

        window.addEventListener('error', (event) => {
          const marker = document.createElement('pre');
          marker.textContent = 'Sandbox runtime error: ' + (event.message || 'Unknown error');
          marker.style.marginTop = '16px';
          marker.style.color = '#ffb8b1';
          marker.style.background = 'rgba(181,59,53,0.12)';
          marker.style.border = '1px solid rgba(181,59,53,0.35)';
          marker.style.borderRadius = '14px';
          marker.style.padding = '14px';
          document.querySelector('.runtime-paper-inner')?.appendChild(marker);
        });
      })();
    </script>
    <script>${safeCustomJs}</script>
  </body>
</html>`;
}

export function mountSandboxedArticleFrame(iframe, options) {
  if (!iframe) {
    return;
  }

  iframe.setAttribute('sandbox', 'allow-scripts');
  iframe.srcdoc = buildSandboxedArticleDocument(options);
}
