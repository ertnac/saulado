import * as FileSystem from 'expo-file-system/legacy'
import mammoth from 'mammoth'
import { extractTextFromPdfStream, type PdfHighlight } from '@saulado/shared'
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
  enableSnippetSelection = false,
  zoomScale = 0.85,
}: {
  title: string
  bodyHtml: string
  isDark: boolean
  enableSnippetSelection?: boolean
  zoomScale?: number
}): string {
  const bg = isDark ? '#031a14' : '#ffffff'
  const text = isDark ? '#e6f0ed' : '#1a2e28'
  const cardBg = isDark ? '#072e24' : '#f4f8f6'
  const borderColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'
  const accentColor = '#22c55e'

  const selectionScript = enableSnippetSelection
    ? `
  <script>
    (function() {
      let lastSelection = '';
      function checkSelection() {
        try {
          const sel = window.getSelection();
          const selectedText = sel ? sel.toString().trim() : '';
          if (selectedText !== lastSelection) {
            lastSelection = selectedText;
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'TEXT_SELECTION',
                text: selectedText
              }));
            }
          }
        } catch (e) {
          console.warn('selection check error:', e);
        }
      }
      document.addEventListener('selectionchange', checkSelection);
      document.addEventListener('touchend', function() {
        setTimeout(checkSelection, 150);
      });
      document.addEventListener('mouseup', function() {
        setTimeout(checkSelection, 150);
      });
    })();
  </script>
`
    : ''

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=${zoomScale}, minimum-scale=0.5, maximum-scale=3.0, user-scalable=yes" />
  <title>${title}</title>
  <script>
    window.setDocumentZoom = function(scale) {
      document.body.style.zoom = scale;
    };
  </script>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 16px 14px 160px 14px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      zoom: ${zoomScale};
      color: ${text};
      background-color: ${bg};
      word-wrap: break-word;
    }
    h1, h2, h3, h4, h5, h6 {
      color: ${isDark ? '#ffffff' : '#052e24'};
      font-weight: 700;
      line-height: 1.3;
      margin-top: 1.2em;
      margin-bottom: 0.4em;
    }
    h1 { font-size: 1.5em; border-bottom: 1px solid ${borderColor}; padding-bottom: 6px; }
    h2 { font-size: 1.25em; }
    h3 { font-size: 1.1em; }
    p { margin-top: 0; margin-bottom: 0.85em; }
    a { color: ${accentColor}; text-decoration: none; }
    blockquote {
      margin: 1em 0;
      padding: 8px 14px;
      background: ${cardBg};
      border-left: 4px solid ${accentColor};
      border-radius: 4px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1em 0;
      font-size: 13px;
    }
    th, td {
      border: 1px solid ${borderColor};
      padding: 6px 10px;
      text-align: left;
    }
    th {
      background: ${cardBg};
      font-weight: 600;
    }
    ul, ol {
      padding-left: 20px;
      margin-bottom: 0.85em;
    }
    li { margin-bottom: 0.3em; }
    img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      margin: 10px 0;
    }
    pre, code {
      font-family: Menlo, Monaco, Consolas, monospace;
      background: ${cardBg};
      border-radius: 4px;
      padding: 2px 5px;
      font-size: 0.9em;
    }
    pre {
      padding: 10px;
      overflow-x: auto;
    }
  </style>
</head>
<body>
  ${bodyHtml}
  ${selectionScript}
</body>
</html>`
}

export function generatePdfViewerHtml({
  pdfBase64,
  fileId = '',
  title,
  isDark,
  zoomScale = 1.0,
  highlights = [],
}: {
  pdfBase64: string
  fileId?: string
  title: string
  isDark: boolean
  zoomScale?: number
  highlights?: PdfHighlight[]
}): string {
  const bg = isDark ? '#031a14' : '#f0f4f2'
  const text = isDark ? '#ffffff' : '#052e24'
  const borderColor = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'
  const safeHighlightsJson = JSON.stringify(highlights || []).replace(/</g, '\\u003c')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes" />
  <title>${title}</title>
  <script src="file:///android_asset/pdfjs/pdf.min.js"></script>
  <script>
    if (typeof pdfjsLib === 'undefined') {
      document.write('<script src="pdfjs/pdf.min.js"><\\/script>');
    }
  </script>
  <script>
    if (typeof pdfjsLib === 'undefined') {
      document.write('<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"><\\/script>');
    }
  </script>
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      min-height: 100%;
      background-color: ${bg};
      color: ${text};
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      -webkit-tap-highlight-color: transparent;
    }
    body {
      display: flex;
      flex-direction: column;
      align-items: center;
      overflow-x: auto;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
    }
    #page-indicator {
      position: fixed;
      top: 12px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 1000;
      background: ${isDark ? 'rgba(7, 46, 36, 0.92)' : 'rgba(255, 255, 255, 0.92)'};
      color: ${text};
      border: 1px solid ${borderColor};
      padding: 4px 14px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      box-shadow: 0 4px 14px rgba(0,0,0,0.18);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      pointer-events: none;
      letter-spacing: 0.2px;
      transition: opacity 0.25s ease;
    }
    #pdf-container {
      width: 100%;
      padding: 16px 8px 160px 8px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      box-sizing: border-box;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
    .page-wrapper {
      position: relative;
      margin: 0 auto;
      box-shadow: 0 4px 20px rgba(0,0,0,0.18);
      border-radius: 6px;
      background: #ffffff;
      display: block;
      overflow: hidden;
      max-width: none;
      box-sizing: border-box;
      transition: width 0.2s ease, height 0.2s ease;
    }
    .page-wrapper.loading-placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      background: ${isDark ? '#072e24' : '#e6edea'};
      color: ${isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.35)'};
      font-size: 13px;
      font-weight: 500;
    }
    canvas {
      display: block;
      width: 100%;
      height: 100%;
    }
    .textLayer {
      position: absolute;
      left: 0;
      top: 0;
      right: 0;
      bottom: 0;
      overflow: hidden;
      opacity: 1;
      line-height: 1.0;
      -webkit-user-select: text;
      user-select: text;
      touch-action: pan-y;
      pointer-events: auto;
    }
    .textLayer span {
      color: transparent;
      position: absolute;
      white-space: pre;
      cursor: text;
      transform-origin: 0% 0%;
    }
    .textLayer ::selection {
      background: rgba(34, 197, 94, 0.35);
    }
    .textLayer ::-moz-selection {
      background: rgba(34, 197, 94, 0.35);
    }
    .pdf-highlight {
      background-color: rgba(250, 204, 21, 0.45) !important;
      border-radius: 2px;
    }
    .pdf-highlight-yellow {
      background-color: rgba(250, 204, 21, 0.45) !important;
    }
    .pdf-highlight-emerald {
      background-color: rgba(16, 185, 129, 0.4) !important;
    }
    .pdf-highlight-green {
      background-color: rgba(34, 197, 94, 0.4) !important;
    }
    .pdf-highlight-rose {
      background-color: rgba(244, 63, 94, 0.35) !important;
    }
    #loading {
      padding: 40px 20px;
      font-size: 15px;
      text-align: center;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div id="page-indicator" style="display: none;">
    <span id="page-indicator-text">Page 1 of …</span>
  </div>

  <div id="loading">Loading document pages…</div>
  <div id="pdf-container"></div>

  <script>
    if (typeof pdfjsLib !== 'undefined') {
      try {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'file:///android_asset/pdfjs/pdf.worker.min.js';
      } catch (e) {
        try {
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs/pdf.worker.min.js';
        } catch (e2) {}
      }
    }

    const pdfData = atob("${pdfBase64}");
    const uint8Array = new Uint8Array(pdfData.length);
    for (let i = 0; i < pdfData.length; i++) {
      uint8Array[i] = pdfData.charCodeAt(i);
    }

    let pdfDoc = null;
    let storedHighlights = ${safeHighlightsJson};
    let currentZoomScale = ${zoomScale};
    let currentPage = 1;
    const renderedPages = new Set();
    const renderingPages = new Set();
    const pageViewports = {};

    function getAvailableWidth() {
      const container = document.getElementById('pdf-container');
      const clientW = container ? container.clientWidth : 0;
      const winW = window.innerWidth || document.documentElement.clientWidth || 0;
      const raw = clientW > 60 ? clientW : (winW > 60 ? winW : 360);
      return Math.max(raw - 16, 260);
    }

    function updatePageIndicator(num) {
      if (currentPage === num && document.getElementById('page-indicator').style.display !== 'none') return;
      currentPage = num;
      const indicator = document.getElementById('page-indicator');
      const indicatorText = document.getElementById('page-indicator-text');
      if (indicator && indicatorText && pdfDoc) {
        indicatorText.textContent = 'Page ' + num + ' of ' + pdfDoc.numPages;
        indicator.style.display = 'block';
      }
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'PDF_PAGE_CHANGED',
          pageNumber: num,
          totalPages: pdfDoc ? pdfDoc.numPages : 1
        }));
      }
    }

    function applyHighlightsForPage(num) {
      const pageHighlights = storedHighlights.filter(function(h) {
        return h.pageNumber === num;
      });
      if (!pageHighlights || pageHighlights.length === 0) return;

      const textLayer = document.getElementById('text-layer-' + num);
      if (!textLayer) return;

      const spans = textLayer.querySelectorAll('span');
      if (!spans || spans.length === 0) return;

      pageHighlights.forEach(function(hl) {
        const targetText = (hl.text || '').trim();
        if (!targetText) return;
        const colorClass = 'pdf-highlight-' + (hl.color || 'yellow');

        spans.forEach(function(span) {
          const spanText = (span.textContent || '').trim();
          if (spanText.length > 0 && (targetText.includes(spanText) || spanText.includes(targetText))) {
            span.classList.add('pdf-highlight');
            span.classList.add(colorClass);
          }
        });
      });
    }

    function renderPage(num) {
      if (renderingPages.has(num)) return;
      renderingPages.add(num);

      pdfDoc.getPage(num).then(function(page) {
        const unscaledViewport = page.getViewport({ scale: 1.0 });
        pageViewports[num] = unscaledViewport;

        const availableWidth = getAvailableWidth();
        const fitScale = availableWidth / unscaledViewport.width;
        const displayScale = fitScale * currentZoomScale;

        const cssViewport = page.getViewport({ scale: displayScale });
        const cssW = Math.floor(cssViewport.width);
        const cssH = Math.floor(cssViewport.height);

        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        const renderViewport = page.getViewport({ scale: displayScale * dpr });

        const wrapper = document.getElementById('page-wrapper-' + num);
        if (!wrapper) {
          renderingPages.delete(num);
          return;
        }

        wrapper.classList.remove('loading-placeholder');
        wrapper.textContent = '';
        wrapper.style.width = cssW + 'px';
        wrapper.style.height = cssH + 'px';

        let canvas = document.getElementById('pdf-canvas-' + num);
        if (!canvas) {
          canvas = document.createElement('canvas');
          canvas.id = 'pdf-canvas-' + num;
          wrapper.appendChild(canvas);
        }

        canvas.width = Math.floor(renderViewport.width);
        canvas.height = Math.floor(renderViewport.height);
        canvas.style.width = cssW + 'px';
        canvas.style.height = cssH + 'px';

        let textLayer = document.getElementById('text-layer-' + num);
        if (!textLayer) {
          textLayer = document.createElement('div');
          textLayer.id = 'text-layer-' + num;
          textLayer.className = 'textLayer';
          wrapper.appendChild(textLayer);
        }
        textLayer.innerHTML = '';

        const ctx = canvas.getContext('2d');
        const renderContext = {
          canvasContext: ctx,
          viewport: renderViewport
        };

        const renderTask = page.render(renderContext);
        renderTask.promise.then(function() {
          renderingPages.delete(num);
          renderedPages.add(num);

          page.getTextContent().then(function(textContent) {
            if (!textContent.items || textContent.items.length === 0) {
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'PDF_SCANNED_PAGE',
                  pageNumber: num
                }));
              }
              return;
            }

            let runningOffset = 0;
            textContent.items.forEach(function(item) {
              if (!item || !item.str) return;
              const tx = pdfjsLib.Util.transform(cssViewport.transform, item.transform);
              const fontHeight = Math.hypot(tx[2], tx[3]) || 12;

              const span = document.createElement('span');
              span.textContent = item.str;
              span.style.left = tx[4] + 'px';
              span.style.top = (tx[5] - fontHeight) + 'px';
              span.style.fontSize = fontHeight + 'px';
              span.style.fontFamily = item.fontName || 'sans-serif';
              span.dataset.startOffset = runningOffset;
              runningOffset += item.str.length;
              span.dataset.endOffset = runningOffset;
              textLayer.appendChild(span);
            });

            applyHighlightsForPage(num);
          }).catch(function(err) {
            console.warn('Text content error for page ' + num + ':', err);
          });
        }).catch(function(err) {
          renderingPages.delete(num);
          if (err && err.name !== 'RenderingCancelledException') {
            console.warn('Page render error for page ' + num + ':', err);
          }
        });
      }).catch(function(err) {
        renderingPages.delete(num);
        console.warn('Page get error for page ' + num + ':', err);
      });
    }

    let renderObserver = null;
    let activePageObserver = null;

    function setupObservers() {
      if (renderObserver) renderObserver.disconnect();
      if (activePageObserver) activePageObserver.disconnect();

      const wrappers = document.querySelectorAll('.page-wrapper');

      if ('IntersectionObserver' in window) {
        renderObserver = new IntersectionObserver(function(entries) {
          entries.forEach(function(entry) {
            if (entry.isIntersecting) {
              const num = parseInt(entry.target.dataset.pageNumber, 10);
              if (!renderedPages.has(num) && !renderingPages.has(num)) {
                renderPage(num);
              }
            }
          });
        }, {
          root: null,
          rootMargin: '350px 0px 350px 0px',
          threshold: 0.01
        });

        wrappers.forEach(function(wrapper) {
          renderObserver.observe(wrapper);
        });

        const visibleRatios = {};
        activePageObserver = new IntersectionObserver(function(entries) {
          entries.forEach(function(entry) {
            const num = parseInt(entry.target.dataset.pageNumber, 10);
            visibleRatios[num] = entry.isIntersecting ? entry.intersectionRatio : 0;
          });

          let maxRatio = -1;
          let mostVisiblePage = 1;
          for (const numStr in visibleRatios) {
            const ratio = visibleRatios[numStr];
            if (ratio > maxRatio) {
              maxRatio = ratio;
              mostVisiblePage = parseInt(numStr, 10);
            }
          }

          if (maxRatio > 0) {
            updatePageIndicator(mostVisiblePage);
          }
        }, {
          root: null,
          threshold: [0, 0.25, 0.5, 0.75, 1.0]
        });

        wrappers.forEach(function(wrapper) {
          activePageObserver.observe(wrapper);
        });
      } else {
        for (let i = 1; i <= Math.min(3, pdfDoc.numPages); i++) {
          renderPage(i);
        }
      }
    }

    let resizeTimer = null;
    window.addEventListener('resize', function() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function() {
        if (window.setDocumentZoom) {
          window.setDocumentZoom(currentZoomScale);
        }
      }, 200);
    });

    window.setDocumentZoom = function(scale) {
      currentZoomScale = scale;
      if (!pdfDoc) return;

      const availableWidth = getAvailableWidth();
      const wrappers = document.querySelectorAll('.page-wrapper');

      wrappers.forEach(function(wrapper) {
        const num = parseInt(wrapper.dataset.pageNumber, 10);
        const unscaled = pageViewports[num];
        if (unscaled) {
          const fitScale = availableWidth / unscaled.width;
          const displayScale = fitScale * currentZoomScale;
          const cssW = Math.floor(unscaled.width * displayScale);
          const cssH = Math.floor(unscaled.height * displayScale);
          wrapper.style.width = cssW + 'px';
          wrapper.style.height = cssH + 'px';
        }
      });

      const pdfContainer = document.getElementById('pdf-container');
      if (pdfContainer) {
        pdfContainer.style.alignItems = currentZoomScale > 1.0 ? 'flex-start' : 'center';
      }

      renderedPages.clear();
      renderingPages.clear();
      setupObservers();
    };

    window.clearPdfSelection = function() {
      try {
        const sel = window.getSelection();
        if (sel) {
          sel.removeAllRanges();
        }
        lastSelectedText = '';
      } catch (e) {}
    };

    window.addPdfHighlight = function(highlight) {
      if (!highlight) return;
      storedHighlights.push(highlight);
      applyHighlightsForPage(highlight.pageNumber);
    };

    // Contextual selection detection across multi-page layout
    let lastSelectedText = '';
    function checkSelection() {
      try {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) {
          if (lastSelectedText !== '') {
            lastSelectedText = '';
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'PDF_SELECTION_CLEARED'
              }));
            }
          }
          return;
        }

        const text = sel.toString().trim();
        if (!text || text === lastSelectedText) return;
        lastSelectedText = text;

        let startOffset = undefined;
        let endOffset = undefined;
        let selPageNumber = currentPage;

        try {
          const range = sel.getRangeAt(0);
          const startSpan = range.startContainer.nodeType === 3
            ? range.startContainer.parentElement
            : range.startContainer;
          const endSpan = range.endContainer.nodeType === 3
            ? range.endContainer.parentElement
            : range.endContainer;

          if (startSpan && startSpan.dataset && startSpan.dataset.startOffset) {
            startOffset = parseInt(startSpan.dataset.startOffset, 10) + range.startOffset;
          }
          if (endSpan && endSpan.dataset && endSpan.dataset.startOffset) {
            endOffset = parseInt(endSpan.dataset.startOffset, 10) + range.endOffset;
          }

          const wrapper = startSpan ? startSpan.closest('.page-wrapper') : null;
          if (wrapper && wrapper.dataset && wrapper.dataset.pageNumber) {
            selPageNumber = parseInt(wrapper.dataset.pageNumber, 10);
          }
        } catch (re) {}

        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'PDF_TEXT_SELECTION',
            fileId: "${fileId}",
            pageNumber: selPageNumber,
            text: text,
            startOffset: startOffset,
            endOffset: endOffset,
            source: 'pdf'
          }));
        }
      } catch (e) {
        console.warn('Selection check error:', e);
      }
    }

    document.addEventListener('selectionchange', function() {
      setTimeout(checkSelection, 80);
    });
    document.addEventListener('touchend', function() {
      setTimeout(checkSelection, 150);
    });
    document.addEventListener('mouseup', function() {
      setTimeout(checkSelection, 150);
    });

    if (typeof pdfjsLib === 'undefined') {
      document.getElementById('loading').innerHTML =
        '<strong>Offline Visual Engine Initializing...</strong><br/><span style="font-size: 13px; opacity: 0.8;">You can also switch to <em>Reader</em> mode at the top for instant distraction-free reading.</span>';
    } else {
      pdfjsLib.getDocument({ data: uint8Array }).promise.then(function(pdf) {
        pdfDoc = pdf;
        document.getElementById('loading').style.display = 'none';

        updatePageIndicator(1);

        pdfDoc.getPage(1).then(function(firstPage) {
          const defaultViewport = firstPage.getViewport({ scale: 1.0 });
          pageViewports[1] = defaultViewport;

          const availableWidth = getAvailableWidth();
          const fitScale = availableWidth / defaultViewport.width;
          const displayScale = fitScale * currentZoomScale;

          const defaultCssViewport = firstPage.getViewport({ scale: displayScale });
          const defaultCssW = Math.floor(defaultCssViewport.width);
          const defaultCssH = Math.floor(defaultCssViewport.height);

          const container = document.getElementById('pdf-container');
          container.innerHTML = '';

          for (let i = 1; i <= pdfDoc.numPages; i++) {
            const wrapper = document.createElement('div');
            wrapper.id = 'page-wrapper-' + i;
            wrapper.className = 'page-wrapper loading-placeholder';
            wrapper.dataset.pageNumber = String(i);
            wrapper.style.width = defaultCssW + 'px';
            wrapper.style.height = defaultCssH + 'px';
            wrapper.textContent = 'Page ' + i;

            container.appendChild(wrapper);
          }

          setupObservers();
          renderPage(1);
        }).catch(function(firstPageErr) {
          console.warn('First page load error:', firstPageErr);
          setupObservers();
        });
      }).catch(function(error) {
        document.getElementById('loading').innerHTML =
          '<strong>Notice:</strong> Could not render visual canvas (' + error.message + ').<br/><span style="font-size: 13px;">Please switch to <em>Reader</em> mode in the top bar to read the extracted text.</span>';
      });
    }
  </script>
</body>
</html>`
}

export interface DocumentContentResult {
  html: string
  readerHtml?: string
  extractedText: string
  hasReaderMode?: boolean
}

/**
 * Parses and loads the document content (PDF, DOCX, or DOC) into displayable HTML and plain text.
 */
export async function loadDocumentContent(
  file: RepositoryFile,
  isDark = false,
  highlights: PdfHighlight[] = [],
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
      enableSnippetSelection: true,
    })

    return {
      html: fullHtml,
      extractedText: rawTextResult.value || '',
      hasReaderMode: false,
    }
  }

  // 2. PDF
  if (file.fileType === 'pdf') {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }

    // Extract text for reader mode & card creation completely offline
    let extractedText = ''
    try {
      extractedText = extractTextFromPdfStream(bytes)
    } catch {
      // Fallback
    }

    // Generate formatted reader HTML for offline reading
    const paragraphs = extractedText
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0)

    const readerBody =
      paragraphs.length > 0
        ? paragraphs.map((p) => `<p>${p.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`).join('')
        : `<p>${extractedText.replace(/</g, '&lt;').replace(/>/g, '&gt;') || '<em>(No selectable text in this PDF)</em>'}</p>`

    const readerHtml = generateReaderHtml({
      title: file.name,
      bodyHtml: readerBody,
      isDark,
      enableSnippetSelection: true,
    })

    // Generate visual canvas viewer HTML with offline pdf.js
    const viewerHtml = generatePdfViewerHtml({
      pdfBase64: base64,
      fileId: file.id,
      title: file.name,
      isDark,
      highlights,
    })

    return {
      html: viewerHtml,
      readerHtml,
      extractedText: extractedText || file.name,
      hasReaderMode: true,
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
    enableSnippetSelection: true,
  })

  return {
    html: fullHtml,
    extractedText,
  }
}
