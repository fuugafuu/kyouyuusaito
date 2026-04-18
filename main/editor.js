import { parseMarkupToHtml } from '../common/markup.js';
import { setSanitizedHTML } from '../common/sanitize.js';

function replaceRange(textarea, replacement, start, end) {
  textarea.setRangeText(replacement, start, end, 'end');
  textarea.focus();
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function wrapSelection(textarea, before, after, fallbackText) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.slice(start, end) || fallbackText;
  replaceRange(textarea, `${before}${selected}${after}`, start, end);
}

function prefixSelectionLines(textarea, prefix) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.slice(start, end) || '引用文';
  const replaced = selected
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');

  replaceRange(textarea, replaced, start, end);
}

function wrapSelectionAsBlock(textarea, fence, fallbackText) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.slice(start, end).trim() || fallbackText;
  const prefix = start > 0 && textarea.value[start - 1] !== '\n' ? '\n' : '';
  const suffix = end < textarea.value.length && textarea.value[end] !== '\n' ? '\n' : '';
  const block = `${prefix}${fence}\n${selected}\n${fence}${suffix}`;

  replaceRange(textarea, block, start, end);
}

function wrapSelectionAsCollapsible(textarea, title, fallbackText, { open = false } = {}) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.slice(start, end).trim() || fallbackText;
  const prefix = start > 0 && textarea.value[start - 1] !== '\n' ? '\n' : '';
  const suffix = end < textarea.value.length && textarea.value[end] !== '\n' ? '\n' : '';
  const directive = open ? 'fold-open' : 'fold';
  const block = `${prefix}[[${directive}:${title}]]\n${selected}\n[[/fold]]${suffix}`;

  replaceRange(textarea, block, start, end);
}

export function createEditorController({
  textarea,
  preview,
  tabButtons,
  toolbarButtons,
  onChange,
  onImageCommand,
  onTabChange,
}) {
  let currentAttachments = [];
  let currentTab = 'edit';

  function renderPreview() {
    const html = parseMarkupToHtml(textarea.value, currentAttachments);
    setSanitizedHTML(preview, html);
  }

  function updateTabButtons() {
    tabButtons.forEach((button) => {
      const isActive = button.dataset.tab === currentTab;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-selected', String(isActive));
    });
  }

  function setTab(tab) {
    currentTab = tab === 'preview' ? 'preview' : 'edit';
    textarea.hidden = currentTab !== 'edit';
    preview.hidden = currentTab !== 'preview';
    updateTabButtons();
    onTabChange?.(currentTab);

    if (currentTab === 'preview') {
      renderPreview();
    }
  }

  function handleToolbar(command) {
    switch (command) {
      case 'bold':
        wrapSelection(textarea, '**', '**', '太字テキスト');
        break;
      case 'italic':
        wrapSelection(textarea, '//', '//', '斜体テキスト');
        break;
      case 'heading':
        wrapSelection(textarea, '## ', '', '見出し');
        break;
      case 'rule':
        replaceRange(
          textarea,
          `${textarea.value && !textarea.value.endsWith('\n') ? '\n' : ''}---\n`,
          textarea.selectionStart,
          textarea.selectionEnd,
        );
        break;
      case 'quote':
        prefixSelectionLines(textarea, '> ');
        break;
      case 'link':
        wrapSelection(textarea, '[[', '|https://example.com]]', 'リンク名');
        break;
      case 'codeblock':
        wrapSelectionAsBlock(
          textarea,
          '```',
          '[CLS-AUDIT] 20XX-11-07 11:44:03 JST\nFIELD=title\nOLD="sample"\nNEW=""',
        );
        break;
      case 'fold':
        wrapSelectionAsCollapsible(textarea, '折りたたみタイトル', 'ここに閉じておきたい本文を書く');
        break;
      case 'image':
        onImageCommand?.();
        break;
      default:
        break;
    }
  }

  textarea.addEventListener('input', () => {
    onChange?.(textarea.value);
    if (currentTab === 'preview') {
      renderPreview();
    }
  });

  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setTab(button.dataset.tab || 'edit');
    });
  });

  toolbarButtons.forEach((button) => {
    button.addEventListener('click', () => {
      handleToolbar(button.dataset.command || '');
    });
  });

  return {
    setContent(content) {
      textarea.value = content || '';
      if (currentTab === 'preview') {
        renderPreview();
      }
    },

    setAttachments(attachments) {
      currentAttachments = Array.isArray(attachments) ? attachments : [];
      if (currentTab === 'preview') {
        renderPreview();
      }
    },

    setTab,

    insertAttachment(attachment) {
      const alt = String(attachment?.name || '添付画像').replaceAll(']', '');
      const token = `[[attachment:${attachment.id}|${alt}]]`;
      replaceRange(textarea, token, textarea.selectionStart, textarea.selectionEnd);
    },

    renderPreview,
  };
}
