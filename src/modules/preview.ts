// Preview pane logic
export const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

export const maskToken = (token: string): string => {
  const trimmedToken = token.trim();
  if (!trimmedToken) {
    return '(未輸入)';
  }
  if (trimmedToken.length <= 10) {
    return `${trimmedToken.slice(0, 2)}***`;
  }
  return `${trimmedToken.slice(0, 6)}...${trimmedToken.slice(-4)}`;
};

export const createPreviewDocument = (previewText: string): string => `<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="UTF-8" />
    <title>Request Preview</title>
    <style>
      body { font-family: system-ui, sans-serif; padding: 12px; margin: 0; color: #0f172a; }
      h2 { margin-top: 0; font-size: 16px; }
      pre { white-space: pre-wrap; word-break: break-word; background: #f8fafc; border: 1px solid #cbd5e1; padding: 12px; border-radius: 8px; font-size: 12px; }
    </style>
  </head>
  <body>
    <h2>Sandbox Request Preview</h2>
    <pre>${escapeHtml(previewText)}</pre>
  </body>
</html>`;
