const STATUS_TYPE_PATTERN = /\bis-(?:info|success|warning|error)\b/g;

function resolveStatusTarget() {
  const selector = document.body?.dataset?.statusTarget || '';
  if (selector) {
    return document.querySelector(selector);
  }

  return (
    document.querySelector('#statusMessage') ||
    document.querySelector('#publicStatus') ||
    document.querySelector('#viewerStatus') ||
    document.querySelector('#adminStatus')
  );
}

function setErrorState(target, message) {
  if (!target) {
    return;
  }

  const baseClassName = String(target.className || '')
    .replace(STATUS_TYPE_PATTERN, '')
    .replace(/\s+/g, ' ')
    .trim();

  target.textContent = message;
  target.className = `${baseClassName} is-error`.trim();
}

function formatReason(reason) {
  if (reason instanceof Error) {
    return reason.stack || reason.message;
  }

  if (reason && typeof reason === 'object' && 'message' in reason) {
    return String(reason.message || 'Unknown error');
  }

  return String(reason || 'Unknown error');
}

function attachGlobalErrorHandlers() {
  window.addEventListener('error', (event) => {
    if (!event?.message) {
      return;
    }

    const target = resolveStatusTarget();
    setErrorState(target, `Application Error: ${event.error?.stack || event.message}`);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const target = resolveStatusTarget();
    setErrorState(target, `Unhandled Rejection: ${formatReason(event?.reason)}`);
  });
}

attachGlobalErrorHandlers();
