import * as FileSystem from 'expo-file-system/legacy'
import JSZip from 'jszip'
import { extractTextFromPdfStream, type PdfHighlight } from '@saulado/shared'
import type { RepositoryFile } from '../lib/offline/types'

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
}

export async function parseDocxContent(base64: string): Promise<{ html: string; text: string }> {
  try {
    const zip = await JSZip.loadAsync(base64, { base64: true })
    const docXmlFile = zip.file('word/document.xml')
    if (!docXmlFile) {
      return { html: '<p><em>(Empty document)</em></p>', text: '' }
    }
    const xml = await docXmlFile.async('text')
    const bodyMatch = xml.match(/<w:body[^>]*>([\s\S]*?)<\/w:body>/)
    if (!bodyMatch || !bodyMatch[1]) {
      return { html: '<p><em>(Empty document)</em></p>', text: '' }
    }
    const bodyContent = bodyMatch[1]
    const blockRegex = /<w:tbl[\s\S]*?<\/w:tbl>|<w:p[\s\S]*?<\/w:p>/g
    const blocks = bodyContent.match(blockRegex) || []

    const htmlParts: string[] = []
    const textParts: string[] = []
    let inList = false

    for (const block of blocks) {
      if (block.startsWith('<w:tbl')) {
        if (inList) {
          htmlParts.push('</ul>')
          inList = false
        }
        const rows = block.match(/<w:tr[\s\S]*?<\/w:tr>/g) || []
        const trHtml: string[] = []
        const trText: string[] = []
        for (const row of rows) {
          const cells = row.match(/<w:tc[\s\S]*?<\/w:tc>/g) || []
          const tdHtml: string[] = []
          const tdText: string[] = []
          for (const cell of cells) {
            const pMatches = cell.match(/<w:p[\s\S]*?<\/w:p>/g) || [cell]
            const cellTexts: string[] = []
            for (const p of pMatches) {
              const tMatches = p.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || []
              const pText = tMatches
                .map((t) => decodeXmlEntities(t.replace(/<w:t[^>]*>([\s\S]*?)<\/w:t>/, '$1')))
                .join('')
              if (pText.trim()) cellTexts.push(pText.trim())
            }
            const cellContent = cellTexts.join(' ')
            tdHtml.push(`<td>${cellContent || '&nbsp;'}</td>`)
            tdText.push(cellContent)
          }
          if (tdHtml.length > 0) {
            trHtml.push(`<tr>${tdHtml.join('')}</tr>`)
            trText.push(tdText.join(' | '))
          }
        }
        if (trHtml.length > 0) {
          htmlParts.push(
            `<table border="1" style="width:100%; border-collapse:collapse; margin:12px 0;">${trHtml.join('')}</table>`,
          )
          textParts.push(trText.join('\n'))
        }
      } else {
        const headingMatch = block.match(
          /<w:pStyle\s+[^>]*w:val=["'](?:Heading|Title)?([1-6])?["']/i,
        )
        const isList = /<w:numPr[\s\S]*?<\/w:numPr>/.test(block)

        const runs = block.match(/<w:r[\s\S]*?<\/w:r>/g) || []
        let pText = ''
        let pHtml = ''

        for (const run of runs) {
          const isBold =
            /<w:b(\s|\/|>)/.test(run) && !/<w:b\s+[^>]*w:val=["'](?:0|false|off)["']/.test(run)
          const isItalic =
            /<w:i(\s|\/|>)/.test(run) && !/<w:i\s+[^>]*w:val=["'](?:0|false|off)["']/.test(run)
          const isUnderline =
            /<w:u(\s|\/|>)/.test(run) && !/<w:u\s+[^>]*w:val=["'](?:none)["']/.test(run)

          const parts =
            run.match(
              /<w:t[^>]*>[\s\S]*?<\/w:t>|<w:br\b[^>]*\/>|<w:cr\b[^>]*\/>|<w:tab\b[^>]*\/>/g,
            ) || []
          let runText = ''
          let runHtml = ''
          for (const part of parts) {
            if (part.startsWith('<w:t')) {
              const raw = part.replace(/<w:t[^>]*>([\s\S]*?)<\/w:t>/, '$1')
              const decoded = decodeXmlEntities(raw)
              runText += decoded
              runHtml += decoded.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            } else if (part.startsWith('<w:br') || part.startsWith('<w:cr')) {
              runText += '\n'
              runHtml += '<br/>'
            } else if (part.startsWith('<w:tab')) {
              runText += '\t'
              runHtml += '&nbsp;&nbsp;&nbsp;&nbsp;'
            }
          }

          if (runText) {
            pText += runText
            let formattedHtml = runHtml
            if (isBold) formattedHtml = `<strong>${formattedHtml}</strong>`
            if (isItalic) formattedHtml = `<em>${formattedHtml}</em>`
            if (isUnderline) formattedHtml = `<u>${formattedHtml}</u>`
            pHtml += formattedHtml
          }
        }

        const trimmedText = pText.trim()
        if (trimmedText) {
          textParts.push(trimmedText)
          if (headingMatch && headingMatch[1]) {
            if (inList) {
              htmlParts.push('</ul>')
              inList = false
            }
            const level = headingMatch[1]
            htmlParts.push(`<h${level}>${pHtml}</h${level}>`)
          } else if (isList) {
            if (!inList) {
              htmlParts.push('<ul>')
              inList = true
            }
            htmlParts.push(`<li>${pHtml}</li>`)
          } else {
            if (inList) {
              htmlParts.push('</ul>')
              inList = false
            }
            htmlParts.push(`<p>${pHtml}</p>`)
          }
        }
      }
    }

    if (inList) {
      htmlParts.push('</ul>')
    }

    const finalHtml =
      htmlParts.length > 0 ? htmlParts.join('\n') : '<p><em>(Empty document)</em></p>'
    const finalText = textParts.join('\n\n')
    return { html: finalHtml, text: finalText }
  } catch (err) {
    console.warn('[document-viewer] docx parsing error:', err)
    return { html: '<p><em>(Could not parse document content)</em></p>', text: '' }
  }
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
  <script src="pdfjs/pdf.min.js"></script>
  <script src="pdfjs/pdf.worker.min.js"></script>
  <script>
    if (typeof pdfjsLib === 'undefined') {
      document.write('<script src="file:///android_asset/pdfjs/pdf.min.js"><\\/script>');
      document.write('<script src="file:///android_asset/pdfjs/pdf.worker.min.js"><\\/script>');
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
      display: none !important;
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
    .pdf-highlight {
      background-color: rgba(250, 204, 21, 0.45) !important;
      border-radius: 2px;
    }
    .pdf-highlight-yellow {
      background-color: rgba(250, 204, 21, 0.45) !important;
    }
    .pdf-highlight-blue {
      background-color: rgba(59, 130, 246, 0.45) !important;
    }
    .pdf-highlight-emerald {
      background-color: rgba(16, 185, 129, 0.45) !important;
    }
    .pdf-highlight-green {
      background-color: rgba(16, 185, 129, 0.45) !important;
    }
    .pdf-highlight-rose {
      background-color: rgba(244, 63, 94, 0.40) !important;
    }
    .pdf-highlight-purple {
      background-color: rgba(139, 92, 246, 0.40) !important;
    }
    .pdf-highlight-amber {
      background-color: rgba(249, 115, 22, 0.45) !important;
    }
    .pdf-highlight-orange {
      background-color: rgba(249, 115, 22, 0.45) !important;
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
        pdfjsLib.GlobalWorkerOptions.workerSrc = '';
      } catch (e) {}
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

    function hexToRgba(hex, alpha) {
      try {
        var c = hex.replace('#', '').trim();
        if (c.length === 3) c = c.split('').map(function(x) { return x + x; }).join('');
        if (c.length !== 6) return 'rgba(59, 130, 246, ' + (alpha || 0.45) + ')';
        var num = parseInt(c, 16);
        return 'rgba(' + (num >> 16) + ',' + ((num >> 8) & 255) + ',' + (num & 255) + ',' + (alpha || 0.45) + ')';
      } catch (e) {
        return 'rgba(59, 130, 246, ' + (alpha || 0.45) + ')';
      }
    }

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
        const rawColor = (hl.color || 'yellow').trim();
        const colorClass = 'pdf-highlight-' + rawColor.toLowerCase();

        spans.forEach(function(span) {
          const spanText = (span.textContent || '').trim();
          if (spanText.length > 0 && (targetText.includes(spanText) || spanText.includes(targetText))) {
            span.classList.add('pdf-highlight');
            if (rawColor.startsWith('#')) {
              span.style.backgroundColor = hexToRgba(rawColor, 0.45);
            } else if (rawColor.startsWith('rgb')) {
              span.style.backgroundColor = rawColor;
            } else {
              span.classList.add(colorClass);
            }
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

    function formatDocumentTextLayout(raw) {
      if (!raw) return '';
      var text = String(raw).trim();
      text = text.replace(/\\r\\n/g, '\\n').replace(/\\r/g, '\\n');
      text = text.replace(/([.!?])([A-Z])/g, '$1 $2');
      text = text.replace(/([)\\]])([A-Za-z0-9])/g, '$1 $2');
      text = text.replace(/\\b(and|or|in|to|of|the|with|for|by|from|is|are|on|at|as|between|into)([A-Z][a-z]+)\\b/g, '$1 $2');
      text = text.replace(/\\b([A-Z]{2,})([a-z]{3,})\\b/g, '$1 $2');
      text = text.replace(/\\b(Introduction|Overview|Summary|Objectives|Conclusion|Background|Definitions?|Chapter\\s*\\d+|Section\\s*\\d+)([A-Z][a-z]+)\\b/g, '$1\\n\\n$2');
      var bulletPattern = /(?<=[^\\n])\\s+([•\\u2022\\u25cf\\u25cb\\u25a0]|\\(?\\d{1,2}[.)]|\\([a-zA-Z]\\)|[a-zA-Z][.)]|[-*–—])\\s+(?=[A-Za-z0-9"'\\x60\\u201c\\u2018])/g;
      text = text.replace(bulletPattern, '\\n$1 ');
      text = text.replace(/(:)\\s*([•\\u2022\\u25cf\\u25cb\\u25a0]|\\(?\\d{1,2}[.)]|\\([a-zA-Z]\\)|[a-zA-Z][.)]|[-*–—])\\s+/g, '$1\\n$2 ');
      return text.split('\\n').map(function(l) { return l.replace(/[ \\t]+/g, ' ').trim(); }).filter(function(l, i, arr) {
        return l.length > 0 || (i > 0 && arr[i-1].length > 0);
      }).join('\\n').trim();
    }

    function getFormattedSelectedText(sel, range) {
      try {
        if (!sel || sel.isCollapsed) return '';
        if (range) {
          var common = range.commonAncestorContainer;
          var textLayer = (common.nodeType === 1 && common.classList.contains('textLayer'))
            ? common
            : (common.parentElement ? common.parentElement.closest('.textLayer') : null);

          if (textLayer) {
            var spans = Array.from(textLayer.querySelectorAll('span'));
            var selectedSpans = [];

            for (var i = 0; i < spans.length; i++) {
              var span = spans[i];
              try {
                if (range.intersectsNode(span)) {
                  selectedSpans.push(span);
                }
              } catch (re) {}
            }

            if (selectedSpans.length > 0) {
              var built = '';
              var lastTop = null;
              var lastBottom = null;
              var lastRight = null;

              for (var j = 0; j < selectedSpans.length; j++) {
                var s = selectedSpans[j];
                var spanText = s.textContent || '';
                if (!spanText) continue;

                if (s === range.startContainer.parentElement || s === range.startContainer) {
                  spanText = spanText.substring(range.startOffset);
                }
                if (s === range.endContainer.parentElement || s === range.endContainer) {
                  spanText = spanText.substring(0, range.endOffset);
                }
                if (!spanText) continue;

                var rect = s.getBoundingClientRect();

                if (lastTop !== null) {
                  var height = rect.height || 14;
                  var isNewLine = Math.abs(rect.top - lastTop) > height * 0.45;
                  var isParagraphBreak = (rect.top - (lastBottom || rect.top)) > height * 0.7;

                  if (isParagraphBreak) {
                    built = built.trimEnd() + '\n\n';
                  } else if (isNewLine) {
                    built = built.trimEnd() + '\n';
                  } else {
                    var gap = rect.left - (lastRight || rect.left);
                    if (gap > 2 && !built.endsWith(' ') && !spanText.startsWith(' ')) {
                      built += ' ';
                    }
                  }
                }

                built += spanText;
                lastTop = rect.top;
                lastBottom = rect.bottom;
                lastRight = rect.right;
              }

              var formatted = formatDocumentTextLayout(built);
              if (formatted.length > 0) return formatted;
            }
          }
        }
      } catch (e) {
        console.warn('DOM range extraction error:', e);
      }
      return formatDocumentTextLayout(sel ? sel.toString() : '');
    }

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

        const range = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
        const text = getFormattedSelectedText(sel, range);
        if (!text || text === lastSelectedText) return;
        lastSelectedText = text;

        let startOffset = undefined;
        let endOffset = undefined;
        let selPageNumber = currentPage;

        try {
          if (range) {
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

    var loadingWatchdog = setTimeout(function() {
      var loadEl = document.getElementById('loading');
      if (loadEl && loadEl.style.display !== 'none') {
        loadEl.innerHTML = '<div style="padding: 16px; border-radius: 14px; background: ' + (${isDark ? "'rgba(7,46,36,0.95)'" : "'#E8F3EE'"}) + '; border: 1px solid ' + (${isDark ? "'rgba(255,255,255,0.12)'" : "'#A6C2B5'"}) + '; max-width: 320px; margin: 0 auto; text-align: center; box-shadow: 0 4px 14px rgba(0,0,0,0.12);">' +
          '<p style="margin: 0 0 12px 0; font-weight: 700; font-size: 14px; color: ' + (${isDark ? "'#FFFFFF'" : "'#052E24'"}) + ';">Document rendering is taking a moment…</p>' +
          '<button id="switch-reader-btn" style="background: #052E24; color: #FFFFFF; border: none; padding: 10px 18px; border-radius: 20px; font-weight: 700; font-size: 13px; cursor: pointer;">Switch to Fast Reader Mode</button>' +
          '</div>';
        var btn = document.getElementById('switch-reader-btn');
        if (btn) {
          btn.onclick = function() {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SWITCH_TO_READER' }));
            }
          };
        }
      }
    }, 4500);

    if (typeof pdfjsLib === 'undefined') {
      var loadEl = document.getElementById('loading');
      if (loadEl) {
        loadEl.innerHTML = '<div style="padding: 16px; border-radius: 14px; background: ' + (${isDark ? "'rgba(7,46,36,0.95)'" : "'#E8F3EE'"}) + '; border: 1px solid ' + (${isDark ? "'rgba(255,255,255,0.12)'" : "'#A6C2B5'"}) + '; max-width: 320px; margin: 0 auto; text-align: center; box-shadow: 0 4px 14px rgba(0,0,0,0.12);">' +
          '<p style="margin: 0 0 12px 0; font-weight: 700; font-size: 14px; color: ' + (${isDark ? "'#FFFFFF'" : "'#052E24'"}) + ';">Visual engine unavailable offline</p>' +
          '<button id="switch-reader-btn-init" style="background: #052E24; color: #FFFFFF; border: none; padding: 10px 18px; border-radius: 20px; font-weight: 700; font-size: 13px; cursor: pointer;">Open in Reader Mode</button>' +
          '</div>';
        var btn = document.getElementById('switch-reader-btn-init');
        if (btn) {
          btn.onclick = function() {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SWITCH_TO_READER' }));
            }
          };
        }
      }
    } else {
      pdfjsLib.getDocument({ data: uint8Array }).promise.then(function(pdf) {
        pdfDoc = pdf;
        clearTimeout(loadingWatchdog);
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
        clearTimeout(loadingWatchdog);
        var loadEl = document.getElementById('loading');
        if (loadEl) {
          loadEl.innerHTML = '<div style="padding: 16px; border-radius: 14px; background: ' + (${isDark ? "'rgba(7,46,36,0.95)'" : "'#E8F3EE'"}) + '; border: 1px solid ' + (${isDark ? "'rgba(255,255,255,0.12)'" : "'#A6C2B5'"}) + '; max-width: 320px; margin: 0 auto; text-align: center; box-shadow: 0 4px 14px rgba(0,0,0,0.12);">' +
            '<p style="margin: 0 0 12px 0; font-weight: 700; font-size: 14px; color: ' + (${isDark ? "'#FFFFFF'" : "'#052E24'"}) + ';">Visual render error (' + (error && error.message ? error.message : 'error') + ')</p>' +
            '<button id="switch-reader-btn-err" style="background: #052E24; color: #FFFFFF; border: none; padding: 10px 18px; border-radius: 20px; font-weight: 700; font-size: 13px; cursor: pointer;">Switch to Reader Mode</button>' +
            '</div>';
          var btn = document.getElementById('switch-reader-btn-err');
          if (btn) {
            btn.onclick = function() {
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SWITCH_TO_READER' }));
              }
            };
          }
        }
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
    const docxResult = await parseDocxContent(base64)

    const fullHtml = generateReaderHtml({
      title: file.name,
      bodyHtml: docxResult.html || '<p><em>(Empty document)</em></p>',
      isDark,
      enableSnippetSelection: true,
    })

    return {
      html: fullHtml,
      extractedText: docxResult.text || '',
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
