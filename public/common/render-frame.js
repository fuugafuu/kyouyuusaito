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
