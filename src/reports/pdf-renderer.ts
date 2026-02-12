import chromium from '@sparticuz/chromium';
import { marked } from 'marked';
import puppeteer from 'puppeteer-core';
import type { Document } from '../types.js';

const PDF_CSS = `
  body {
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 13px;
    line-height: 1.6;
    color: #333;
    margin: 0;
    padding: 0;
  }
  .header {
    border-bottom: 2px solid #1a237e;
    padding-bottom: 12px;
    margin-bottom: 24px;
  }
  .header h1 {
    color: #1a237e;
    margin: 0 0 8px 0;
    font-size: 22px;
  }
  .header-meta {
    display: flex;
    gap: 24px;
    font-size: 12px;
    color: #666;
  }
  .content h1 { font-size: 20px; color: #1a237e; }
  .content h2 { font-size: 17px; color: #283593; margin-top: 24px; }
  .content h3 { font-size: 15px; color: #3949ab; }
  .content table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  .content th, .content td { border: 1px solid #ddd; padding: 6px 10px; font-size: 12px; }
  .content th { background: #f5f5f5; font-weight: 600; }
  .content code { background: #f5f5f5; padding: 1px 4px; border-radius: 3px; font-size: 12px; }
  .content pre { background: #f5f5f5; padding: 12px; border-radius: 4px; overflow-x: auto; }
  .content pre code { background: none; padding: 0; }
  .content img { max-width: 100%; }
  .content blockquote { border-left: 3px solid #1a237e; margin-left: 0; padding-left: 16px; color: #666; }
  .mermaid { margin: 16px 0; }
  .mermaid svg { max-width: 100%; }
`;

const MERMAID_SCRIPT = `
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
    mermaid.initialize({ startOnLoad: true, theme: 'default' });
  </script>
`;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Convert mermaid code blocks to <pre class="mermaid"> for rendering.
 */
function processMermaidBlocks(html: string, renderMermaid: boolean): string {
  if (!renderMermaid) {
    // Fallback to placeholder like existing PactoSigna export
    return html.replace(
      /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g,
      (_match, content) => {
        const decoded = content
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"');
        return `<div style="background:#f5f5f5;padding:12px;border-radius:4px;font-family:monospace;font-size:12px;white-space:pre-wrap;">${decoded}</div>`;
      }
    );
  }

  // Convert to mermaid-renderable divs
  return html.replace(
    /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g,
    (_match, content) => {
      const decoded = content
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"');
      return `<pre class="mermaid">${decoded}</pre>`;
    }
  );
}

function generateDocumentHtml(
  htmlContent: string,
  doc: Document,
  commitSha: string,
  renderMermaid: boolean
): string {
  const processed = processMermaidBlocks(htmlContent, renderMermaid);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>${PDF_CSS}</style>
  ${renderMermaid ? MERMAID_SCRIPT : ''}
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(doc.title)}</h1>
    <div class="header-meta">
      <span><strong>Document ID:</strong> ${escapeHtml(doc.id)}</span>
      <span><strong>Type:</strong> ${escapeHtml(doc.docType)}</span>
      <span><strong>Version:</strong> ${escapeHtml(commitSha.substring(0, 7))}</span>
    </div>
  </div>
  <div class="content">
    ${processed}
  </div>
</body>
</html>`;
}

/**
 * Render a single document to PDF.
 */
export async function renderDocumentPdf(
  doc: Document,
  commitSha: string,
  renderMermaid: boolean = true
): Promise<Buffer> {
  const html = await marked.parse(doc.body);
  const fullHtml = generateDocumentHtml(html, doc, commitSha, renderMermaid);

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1920, height: 1080 },
    executablePath: await chromium.executablePath(),
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(fullHtml, { waitUntil: 'networkidle0', timeout: 30000 });

    // Wait for Mermaid diagrams to render
    if (renderMermaid) {
      await page.waitForFunction(
        () => !document.querySelector('.mermaid:not([data-processed])'),
        { timeout: 10000 }
      ).catch(() => {
        // Mermaid rendering timeout is non-fatal
      });
    }

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '2cm', bottom: '2cm', left: '2cm', right: '2cm' },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `
        <div style="font-size:10px;width:100%;text-align:center;color:#999;">
          <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
        </div>
      `,
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

/**
 * Render raw HTML to PDF (for traceability reports).
 */
export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1920, height: 1080 },
    executablePath: await chromium.executablePath(),
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '2cm', bottom: '2cm', left: '2cm', right: '2cm' },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `
        <div style="font-size:10px;width:100%;text-align:center;color:#999;">
          <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
        </div>
      `,
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
