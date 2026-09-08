import * as FileSystem from 'expo-file-system/legacy'
import mammoth from 'mammoth'
import { extractTextFromPdfStream } from '@saulado/shared'
import type { RepositoryFile } from '../lib/offline/types'

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer
}

export function generateReaderHtml({
  title,
  bodyHtml,
  isDark,
}: {
  title: string
  bodyHtml: string
  isDark: boolean
}): string {
  const bg = isDark ? '#031a14' : '#ffffff'
  const text = isDark ? '#e6f0ed' : '#1a2e28'
  const cardBg = isDark ? '#072e24' : '#f4f8f6'
  const borderColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'
  const accentColor = '#22c55e'

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes" />
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px 20px 80px 20px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 16px;
      line-height: 1.7;
      color: ${text};
      background-color: ${bg};
      word-wrap: break-word;
    }
    h1, h2, h3, h4, h5, h6 {
      color: ${isDark ? '#ffffff' : '#052e24'};
      font-weight: 700;
      line-height: 1.3;
      margin-top: 1.4em;
      margin-bottom: 0.5em;
    }
    h1 { font-size: 1.6em; border-bottom: 1px solid ${borderColor}; padding-bottom: 8px; }
    h2 { font-size: 1.35em; }
    h3 { font-size: 1.15em; }
    p { margin-top: 0; margin-bottom: 1em; }
    a { color: ${accentColor}; text-decoration: none; }
    blockquote {
      margin: 1.2em 0;
      padding: 10px 16px;
      background: ${cardBg};
      border-left: 4px solid ${accentColor};
      border-radius: 4px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1.2em 0;
      font-size: 14px;
    }
    th, td {
      border: 1px solid ${borderColor};
      padding: 8px 12px;
      text-align: left;
    }
    th {
      background: ${cardBg};
      font-weight: 600;
    }
    ul, ol {
      padding-left: 24px;
      margin-bottom: 1em;
    }
    li { margin-bottom: 0.4em; }
    img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      margin: 12px 0;
    }
    pre, code {
      font-family: Menlo, Monaco, Consolas, monospace;
      background: ${cardBg};
      border-radius: 4px;
      padding: 2px 6px;
      font-size: 0.9em;
    }
    pre {
      padding: 12px;
      overflow-x: auto;
    }
  </style>
</head>
<body>
  ${bodyHtml}
</body>
</html>`
}

export function generatePdfViewerHtml({
  pdfBase64,
  title,
  isDark,
}: {
  pdfBase64: string
  title: string
  isDark: boolean
}): string {
  const bg = isDark ? '#031a14' : '#f0f4f2'
  const text = isDark ? '#ffffff' : '#052e24'
  const controlBg = isDark ? '#072e24' : '#ffffff'
  const borderColor = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes" />
  <title>${title}</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      background-color: ${bg};
      color: ${text};
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      min-height: 100vh;
    }
    #controls {
      position: sticky;
      top: 0;
      z-index: 100;
      width: 100%;
      background: ${controlBg};
      border-bottom: 1px solid ${borderColor};
      padding: 10px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    button {
      background: #052e24;
      color: #ffffff;
      border: none;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }
    button:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    #page-info {
      font-size: 14px;
      font-weight: 500;
    }
    #pdf-container {
      width: 100%;
      padding: 16px 8px 80px 8px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }
    canvas {
      max-width: 100%;
      height: auto !important;
      box-shadow: 0 4px 16px rgba(0,0,0,0.2);
      border-radius: 4px;
      background: #ffffff;
    }
    #loading {
      padding: 40px 20px;
      font-size: 16px;
      text-align: center;
    }
  </style>
</head>
<body>
  <div id="controls">
    <button id="prev" onclick="prevPage()">‹ Prev</button>
    <span id="page-info">Page <span id="current-page">1</span> of <span id="total-pages">…</span></span>
    <button id="next" onclick="nextPage()">Next ›</button>
  </div>

  <div id="loading">Loading document pages…</div>
  <div id="pdf-container">
    <canvas id="pdf-canvas"></canvas>
  </div>

  <script>
    const pdfData = atob("${pdfBase64}");
    const uint8Array = new Uint8Array(pdfData.length);
    for (let i = 0; i < pdfData.length; i++) {
      uint8Array[i] = pdfData.charCodeAt(i);
    }

    let pdfDoc = null;
    let pageNum = 1;
    let pageRendering = false;
    let pageNumPending = null;
    const canvas = document.getElementById('pdf-canvas');
    const ctx = canvas.getContext('2d');

    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    function renderPage(num) {
      pageRendering = true;
      pdfDoc.getPage(num).then(function(page) {
        const viewport = page.getViewport({ scale: 1.5 });
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: ctx,
          viewport: viewport
        };
        const renderTask = page.render(renderContext);

        renderTask.promise.then(function() {
          pageRendering = false;
          if (pageNumPending !== null) {
            renderPage(pageNumPending);
            pageNumPending = null;
          }
        });
      });

      document.getElementById('current-page').textContent = num;
      document.getElementById('prev').disabled = num <= 1;
      document.getElementById('next').disabled = num >= pdfDoc.numPages;
    }

    function queueRenderPage(num) {
      if (pageRendering) {
        pageNumPending = num;
      } else {
        renderPage(num);
      }
    }

    function prevPage() {
      if (pageNum <= 1) return;
      pageNum--;
      queueRenderPage(pageNum);
    }

    function nextPage() {
      if (pageNum >= pdfDoc.numPages) return;
      pageNum++;
      queueRenderPage(pageNum);
    }

    pdfjsLib.getDocument({ data: uint8Array }).promise.then(function(pdf) {
      pdfDoc = pdf;
      document.getElementById('total-pages').textContent = pdf.numPages;
      document.getElementById('loading').style.display = 'none';
      renderPage(pageNum);
    }).catch(function(error) {
      document.getElementById('loading').textContent = 'Error rendering PDF: ' + error.message;
    });
  </script>
</body>
</html>`
}

export interface DocumentContentResult {
  html: string
  extractedText: string
}

/**
 * Parses and loads the document content (PDF, DOCX, or DOC) into displayable HTML and plain text.
 */
export async function loadDocumentContent(
  file: RepositoryFile,
  isDark = false,
): Promise<DocumentContentResult> {
  const base64 = await FileSystem.readAsStringAsync(file.fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  })

  // 1. DOCX (Word Modern)
  if (file.fileType === 'docx') {
    const arrayBuffer = base64ToArrayBuffer(base64)
    const result = await mammoth.convertToHtml({ arrayBuffer })
    const rawTextResult = await mammoth.extractRawText({ arrayBuffer })

    const fullHtml = generateReaderHtml({
      title: file.name,
      bodyHtml: result.value || '<p><em>(Empty document)</em></p>',
      isDark,
    })

    return {
      html: fullHtml,
      extractedText: rawTextResult.value || '',
    }
  }

  // 2. PDF
  if (file.fileType === 'pdf') {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }

    // Extract text for reader mode & card creation
    let extractedText = ''
    try {
      extractedText = extractTextFromPdfStream(bytes)
    } catch {
      // Fallback
    }

    // Generate viewer HTML with pdf.js canvas renderer
    const viewerHtml = generatePdfViewerHtml({
      pdfBase64: base64,
      title: file.name,
      isDark,
    })

    return {
      html: viewerHtml,
      extractedText: extractedText || file.name,
    }
  }

  // 3. DOC (Legacy Word 97-2003)
  // Extract text strings from binary stream
  const binary = atob(base64)
  const textRuns: string[] = []
  let currentRun = ''

  for (let i = 0; i < binary.length; i++) {
    const code = binary.charCodeAt(i)
    // Printable ASCII or newline/tab
    if ((code >= 32 && code <= 126) || code === 10 || code === 13 || code === 9) {
      currentRun += binary.charAt(i)
    } else {
      if (currentRun.trim().length > 4) {
        textRuns.push(currentRun.trim())
      }
      currentRun = ''
    }
  }
  if (currentRun.trim().length > 4) {
    textRuns.push(currentRun.trim())
  }

  const extractedText = textRuns.join('\n\n')
  const bodyHtml = `
    <div style="padding: 12px; border-radius: 8px; background: rgba(234, 179, 8, 0.15); border: 1px solid rgba(234, 179, 8, 0.4); margin-bottom: 20px;">
      <strong>Notice:</strong> This is a legacy Word document (.doc). Showing extracted readable text.
    </div>
    ${textRuns.map((r) => `<p>${r.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`).join('')}
  `

  const fullHtml = generateReaderHtml({
    title: file.name,
    bodyHtml: bodyHtml || '<p><em>(Could not extract readable text from legacy .doc)</em></p>',
    isDark,
  })

  return {
    html: fullHtml,
    extractedText,
  }
}
