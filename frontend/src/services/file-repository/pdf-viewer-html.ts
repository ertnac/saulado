export interface GeneratePdfViewerHtmlOptions {
  pdfUrl?: string
  pdfBase64?: string
  fileId?: string
  title: string
  isDark?: boolean
  zoomScale?: number
}

/**
 * Generates self-contained HTML for viewing PDFs with continuous vertical scrolling,
 * canvas rendering via PDF.js, a transparent textLayer for accurate selection,
 * and postMessage communication for card creation and snippet bagging.
 */
export function generatePdfViewerHtml({
  pdfUrl,
  pdfBase64 = '',
  fileId = '',
  title,
  isDark = false,
  zoomScale = 1.0,
}: GeneratePdfViewerHtmlOptions): string {
  const bg = isDark ? '#031a14' : '#f0f4f2'
  const text = isDark ? '#ffffff' : '#052e24'
  const borderColor = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'
  const cleanPdfBase64 = (pdfBase64 || '').replace(/[\r\n\s]/g, '')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes" />
  <title>${title.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</title>
  <script src="/pdfjs/pdf.min.js"></script>
  <script src="/pdfjs/pdf.worker.min.js"></script>
  <script>
    if (typeof pdfjsLib === 'undefined') {
      document.write('<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"><\\/script>');
    }
  </script>
  <style>
    * { box-sizing: border-box; }
    html {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background-color: ${bg};
      color: ${text};
      -webkit-tap-highlight-color: transparent;
    }
    body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background-color: ${bg};
      color: ${text};
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
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
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 600;
      box-shadow: 0 4px 14px rgba(0,0,0,0.18);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      pointer-events: none;
      letter-spacing: 0.2px;
      transition: opacity 0.25s ease;
      display: none;
    }
    #pdf-container {
      width: 100%;
      min-height: 100%;
      padding: 20px 16px 180px 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 24px;
      box-sizing: border-box;
    }
    .page-wrapper {
      position: relative;
      margin: 0 auto;
      box-shadow: 0 4px 24px rgba(0,0,0,0.18);
      border-radius: 8px;
      background: #ffffff;
      display: block;
      overflow: hidden;
      max-width: none;
      box-sizing: border-box;
      flex-shrink: 0 !important;
      flex-grow: 0 !important;
    }
    .page-wrapper.loading-placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      background: ${isDark ? '#072e24' : '#ffffff'};
      color: ${isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.35)'};
      font-size: 13px;
      font-weight: 500;
      border: 1px dashed ${borderColor};
    }
    canvas {
      display: block;
      width: 100% !important;
      height: 100% !important;
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
    #loading {
      padding: 40px 20px;
      font-size: 14px;
      text-align: center;
      line-height: 1.5;
      color: ${isDark ? '#a0b5ad' : '#4a6b5d'};
    }
  </style>
</head>
<body>
  <div id="page-indicator">
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

    var pdfUrl = ${pdfUrl ? JSON.stringify(pdfUrl) : 'null'};
    var cleanBase64 = ${cleanPdfBase64 ? JSON.stringify(cleanPdfBase64) : 'null'};
    var fileId = ${JSON.stringify(fileId)};
    var currentZoomScale = ${zoomScale};
    var currentPage = 1;
    var pdfDoc = null;
    var renderedPages = new Set();
    var renderingPages = new Set();
    var pageViewports = {};

    function getAvailableWidth() {
      var container = document.getElementById('pdf-container');
      var clientW = container ? container.clientWidth : 0;
      var winW = window.innerWidth || document.documentElement.clientWidth || 0;
      var raw = clientW > 60 ? clientW : (winW > 60 ? winW : 360);
      return Math.max(raw - 24, 260);
    }

    function updatePageIndicator(num) {
      if (currentPage === num && document.getElementById('page-indicator').style.display !== 'none') return;
      currentPage = num;
      var indicator = document.getElementById('page-indicator');
      var indicatorText = document.getElementById('page-indicator-text');
      if (indicator && indicatorText && pdfDoc) {
        indicatorText.textContent = 'Page ' + num + ' of ' + pdfDoc.numPages;
        indicator.style.display = 'block';
      }
    }

    function renderPage(num) {
      if (!pdfDoc || renderingPages.has(num)) return;
      renderingPages.add(num);

      pdfDoc.getPage(num).then(function(page) {
        var unscaledViewport = page.getViewport({ scale: 1.0 });
        pageViewports[num] = unscaledViewport;

        var availableWidth = getAvailableWidth();
        var fitScale = availableWidth / unscaledViewport.width;
        var displayScale = fitScale * currentZoomScale;

        var cssViewport = page.getViewport({ scale: displayScale });
        var cssW = Math.floor(cssViewport.width);
        var cssH = Math.floor(cssViewport.height);

        var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        var renderViewport = page.getViewport({ scale: displayScale * dpr });

        var wrapper = document.getElementById('page-wrapper-' + num);
        if (!wrapper) {
          renderingPages.delete(num);
          return;
        }

        wrapper.classList.remove('loading-placeholder');
        wrapper.textContent = '';
        wrapper.style.width = cssW + 'px';
        wrapper.style.height = cssH + 'px';
        wrapper.style.minHeight = cssH + 'px';
        wrapper.style.maxHeight = 'none';
        wrapper.style.flexShrink = '0';

        var canvas = document.getElementById('pdf-canvas-' + num);
        if (!canvas) {
          canvas = document.createElement('canvas');
          canvas.id = 'pdf-canvas-' + num;
          wrapper.appendChild(canvas);
        }

        canvas.width = Math.floor(renderViewport.width);
        canvas.height = Math.floor(renderViewport.height);
        canvas.style.width = cssW + 'px';
        canvas.style.height = cssH + 'px';

        var textLayer = document.getElementById('text-layer-' + num);
        if (!textLayer) {
          textLayer = document.createElement('div');
          textLayer.id = 'text-layer-' + num;
          textLayer.className = 'textLayer';
          wrapper.appendChild(textLayer);
        }
        textLayer.innerHTML = '';
        textLayer.style.width = cssW + 'px';
        textLayer.style.height = cssH + 'px';

        var ctx = canvas.getContext('2d');
        var renderContext = {
          canvasContext: ctx,
          viewport: renderViewport
        };

        var renderTask = page.render(renderContext);
        renderTask.promise.then(function() {
          renderingPages.delete(num);
          renderedPages.add(num);

          page.getTextContent().then(function(textContent) {
            if (!textContent.items || textContent.items.length === 0) return;

            var runningOffset = 0;
            textContent.items.forEach(function(item) {
              if (!item || !item.str) return;
              var tx = pdfjsLib.Util.transform(cssViewport.transform, item.transform);
              var fontHeight = Math.hypot(tx[2], tx[3]) || 12;

              var span = document.createElement('span');
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

    var renderObserver = null;
    var activePageObserver = null;

    function setupObservers() {
      if (renderObserver) renderObserver.disconnect();
      if (activePageObserver) activePageObserver.disconnect();

      var wrappers = document.querySelectorAll('.page-wrapper');

      // Eagerly render first 4 pages immediately so user has zero wait time
      var initialCount = Math.min(pdfDoc ? pdfDoc.numPages : 1, 4);
      for (var p = 1; p <= initialCount; p++) {
        renderPage(p);
      }

      if ('IntersectionObserver' in window) {
        renderObserver = new IntersectionObserver(function(entries) {
          entries.forEach(function(entry) {
            if (entry.isIntersecting) {
              var num = parseInt(entry.target.dataset.pageNumber, 10);
              if (!renderedPages.has(num) && !renderingPages.has(num)) {
                renderPage(num);
              }
            }
          });
        }, {
          root: null,
          rootMargin: '600px 0px 600px 0px',
          threshold: 0.01
        });

        wrappers.forEach(function(wrapper) {
          renderObserver.observe(wrapper);
        });

        var visibleRatios = {};
        activePageObserver = new IntersectionObserver(function(entries) {
          entries.forEach(function(entry) {
            var num = parseInt(entry.target.dataset.pageNumber, 10);
            visibleRatios[num] = entry.isIntersecting ? entry.intersectionRatio : 0;
          });

          var maxRatio = -1;
          var mostVisiblePage = currentPage;
          for (var p in visibleRatios) {
            if (visibleRatios[p] > maxRatio) {
              maxRatio = visibleRatios[p];
              mostVisiblePage = parseInt(p, 10);
            }
          }

          if (maxRatio > 0) {
            updatePageIndicator(mostVisiblePage);
          }
        }, {
          root: null,
          threshold: [0.1, 0.3, 0.5, 0.7, 0.9]
        });

        wrappers.forEach(function(wrapper) {
          activePageObserver.observe(wrapper);
        });
      } else {
        for (var i = 1; i <= (pdfDoc ? pdfDoc.numPages : 1); i++) {
          renderPage(i);
        }
      }
    }

    var resizeTimer = null;
    window.addEventListener('resize', function() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function() {
        if (!pdfDoc) return;
        var newWidth = getAvailableWidth();
        for (var i = 1; i <= pdfDoc.numPages; i++) {
          var unscaled = pageViewports[i] || pageViewports[1];
          if (unscaled) {
            var fitScale = newWidth / unscaled.width;
            var displayScale = fitScale * currentZoomScale;
            var cssW = Math.floor(unscaled.width * displayScale);
            var cssH = Math.floor(unscaled.height * displayScale);
            var wrapper = document.getElementById('page-wrapper-' + i);
            if (wrapper) {
              wrapper.style.width = cssW + 'px';
              wrapper.style.height = cssH + 'px';
              wrapper.style.minHeight = cssH + 'px';
            }
          }
        }
        renderedPages.forEach(function(num) {
          renderedPages.delete(num);
          renderPage(num);
        });
      }, 250);
    });

    function getFormattedSelectedText(sel, range) {
      try {
        if (range && !range.collapsed) {
          var ancestor = range.commonAncestorContainer;
          var containerElement = ancestor.nodeType === 1 ? ancestor : ancestor.parentElement;

          if (containerElement) {
            var textLayer = containerElement.closest('.textLayer');
            if (textLayer) {
              var allSpans = Array.from(textLayer.querySelectorAll('span'));
              var selectedSpans = allSpans.filter(function(span) {
                try {
                  return sel.containsNode(span, true);
                } catch (ce) {
                  return false;
                }
              });

              if (selectedSpans.length > 0) {
                var built = '';
                var lastTop = null;
                var lastBottom = null;
                var lastRight = null;
                var newlineChar = '\\n';

                for (var si = 0; si < selectedSpans.length; si++) {
                  var s = selectedSpans[si];
                  var spanText = s.textContent || '';
                  var rect = s.getBoundingClientRect();

                  if (lastTop !== null) {
                    var height = rect.height || 14;
                    var isNewLine = Math.abs(rect.top - lastTop) > height * 0.45;
                    var isParagraphBreak = (rect.top - (lastBottom || rect.top)) > height * 0.7;

                    if (isParagraphBreak) {
                      built = built.trimEnd() + newlineChar + newlineChar;
                    } else if (isNewLine) {
                      built = built.trimEnd() + newlineChar;
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

                if (built.trim().length > 0) return built.trim();
              }
            }
          }
        }
      } catch (e) {
        console.warn('DOM range extraction error:', e);
      }
      return sel ? sel.toString().trim() : '';
    }

    var lastSelectedText = '';
    function checkSelection() {
      try {
        var sel = window.getSelection();
        if (!sel || sel.isCollapsed) {
          if (lastSelectedText !== '') {
            lastSelectedText = '';
            if (window.parent && window.parent !== window) {
              window.parent.postMessage({
                type: 'PDF_SELECTION_CLEARED'
              }, '*');
            }
          }
          return;
        }

        var range = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
        var text = getFormattedSelectedText(sel, range);
        if (!text || text === lastSelectedText) return;
        lastSelectedText = text;

        var selPageNumber = currentPage;
        try {
          if (range) {
            var startSpan = range.startContainer.nodeType === 3
              ? range.startContainer.parentElement
              : range.startContainer;
            var wrapper = startSpan ? startSpan.closest('.page-wrapper') : null;
            if (wrapper && wrapper.dataset && wrapper.dataset.pageNumber) {
              selPageNumber = parseInt(wrapper.dataset.pageNumber, 10);
            }
          }
        } catch (pe) {}

        var rect = range ? range.getBoundingClientRect() : null;
        var coords = rect ? {
          clientX: rect.left + rect.width / 2,
          clientY: rect.top,
        } : null;

        if (window.parent && window.parent !== window) {
          window.parent.postMessage({
            type: 'PDF_TEXT_SELECTION',
            fileId: fileId,
            pageNumber: selPageNumber,
            text: text,
            coords: coords,
            source: 'pdf'
          }, '*');
        }
      } catch (e) {
        console.warn('Selection check error:', e);
      }
    }

    document.addEventListener('selectionchange', function() {
      setTimeout(checkSelection, 80);
    });
    document.addEventListener('mouseup', function() {
      setTimeout(checkSelection, 120);
    });
    document.addEventListener('touchend', function() {
      setTimeout(checkSelection, 150);
    });

    function showFallbackError(err) {
      console.warn('PDF visual render error:', err);
      var loadEl = document.getElementById('loading');
      if (loadEl) {
        loadEl.innerHTML =
          '<div style="text-align:center;padding:24px 16px;background:' + (${isDark ? "'rgba(7,46,36,0.85)'" : "'#e8f3ee'"}) + ';border-radius:16px;border:1px solid ' + (${isDark ? "'rgba(255,255,255,0.1)'" : "'#a6c2b5'"}) + ';max-width:340px;margin:20px auto;box-shadow:0 4px 16px rgba(0,0,0,0.1);">' +
          '<p style="color:#ef4444;font-weight:700;font-size:14px;margin:0 0 8px 0;">Visual rendering encountered an issue.</p>' +
          '<p style="color:' + (${isDark ? "'#a0b5ad'" : "'#4a6b5d'"}) + ';font-size:12px;margin:0 0 16px 0;">' + (err && err.message ? err.message : 'Error rendering PDF pages.') + '</p>' +
          '<button id="retry-btn" style="background:#052e24;color:#ffffff;border:none;padding:8px 18px;border-radius:20px;font-weight:700;font-size:12px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.2);">Retry Loading PDF</button>' +
          '</div>';
        var btn = document.getElementById('retry-btn');
        if (btn) {
          btn.onclick = function() {
            window.location.reload();
          };
        }
      }
    }

    function loadPdfFromBytes(bytes) {
      if (pdfDoc) return;
      var loadEl = document.getElementById('loading');
      if (loadEl) loadEl.textContent = 'Rendering PDF pages…';

      pdfjsLib.getDocument({ data: bytes }).promise.then(function(pdf) {
        pdfDoc = pdf;
        if (loadEl) loadEl.style.display = 'none';
        updatePageIndicator(1);

        pdfDoc.getPage(1).then(function(firstPage) {
          var defaultViewport = firstPage.getViewport({ scale: 1.0 });
          pageViewports[1] = defaultViewport;

          var availableWidth = getAvailableWidth();
          var fitScale = availableWidth / defaultViewport.width;
          var displayScale = fitScale * currentZoomScale;

          var defaultCssViewport = firstPage.getViewport({ scale: displayScale });
          var defaultCssW = Math.floor(defaultCssViewport.width);
          var defaultCssH = Math.floor(defaultCssViewport.height);

          var container = document.getElementById('pdf-container');
          container.innerHTML = '';

          for (var i = 1; i <= pdfDoc.numPages; i++) {
            var wrapper = document.createElement('div');
            wrapper.id = 'page-wrapper-' + i;
            wrapper.className = 'page-wrapper loading-placeholder';
            wrapper.dataset.pageNumber = String(i);
            wrapper.style.width = defaultCssW + 'px';
            wrapper.style.height = defaultCssH + 'px';
            wrapper.style.minHeight = defaultCssH + 'px';
            wrapper.style.maxHeight = 'none';
            wrapper.style.flexShrink = '0';
            wrapper.textContent = 'Page ' + i;
            container.appendChild(wrapper);
          }

          setupObservers();
        }).catch(function(err) {
          console.warn('First page error:', err);
          setupObservers();
        });
      }).catch(function(err) {
        showFallbackError(err);
      });
    }

    window.addEventListener('message', function(event) {
      if (!event.data || typeof event.data !== 'object') return;
      if (event.data.type === 'LOAD_PDF_BUFFER' && event.data.buffer) {
        try {
          var bytes = new Uint8Array(event.data.buffer);
          loadPdfFromBytes(bytes);
        } catch (be) {
          showFallbackError(be);
        }
      } else if (event.data.type === 'LOAD_PDF_BASE64' && event.data.base64) {
        try {
          var binary = atob(event.data.base64);
          var bytes = new Uint8Array(binary.length);
          for (var i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          loadPdfFromBytes(bytes);
        } catch (be) {
          showFallbackError(be);
        }
      }
    });

    function initDocument() {
      if (cleanBase64 && cleanBase64.length > 0) {
        try {
          var binary = atob(cleanBase64);
          var bytes = new Uint8Array(binary.length);
          for (var i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          loadPdfFromBytes(bytes);
          return;
        } catch (e) {
          console.warn('base64 decode error:', e);
        }
      }

      if (pdfUrl) {
        pdfjsLib.getDocument(pdfUrl).promise.then(function(pdf) {
          pdfDoc = pdf;
          var loadEl = document.getElementById('loading');
          if (loadEl) loadEl.style.display = 'none';
          updatePageIndicator(1);

          pdfDoc.getPage(1).then(function(firstPage) {
            var defaultViewport = firstPage.getViewport({ scale: 1.0 });
            pageViewports[1] = defaultViewport;

            var availableWidth = getAvailableWidth();
            var fitScale = availableWidth / defaultViewport.width;
            var displayScale = fitScale * currentZoomScale;

            var defaultCssViewport = firstPage.getViewport({ scale: displayScale });
            var defaultCssW = Math.floor(defaultCssViewport.width);
            var defaultCssH = Math.floor(defaultCssViewport.height);

            var container = document.getElementById('pdf-container');
            container.innerHTML = '';

            for (var i = 1; i <= pdfDoc.numPages; i++) {
              var wrapper = document.createElement('div');
              wrapper.id = 'page-wrapper-' + i;
              wrapper.className = 'page-wrapper loading-placeholder';
              wrapper.dataset.pageNumber = String(i);
              wrapper.style.width = defaultCssW + 'px';
              wrapper.style.height = defaultCssH + 'px';
              wrapper.style.minHeight = defaultCssH + 'px';
              wrapper.style.maxHeight = 'none';
              wrapper.style.flexShrink = '0';
              wrapper.textContent = 'Page ' + i;
              container.appendChild(wrapper);
            }

            setupObservers();
          }).catch(function(err) {
            console.warn('First page error:', err);
            setupObservers();
          });
        }).catch(function(err) {
          showFallbackError(err);
        });
      }
    }

    if (typeof pdfjsLib !== 'undefined') {
      initDocument();
    } else {
      window.addEventListener('load', function() {
        if (typeof pdfjsLib !== 'undefined') {
          initDocument();
        } else {
          document.getElementById('loading').textContent = 'PDF visual library unavailable.';
        }
      });
    }

    window.addEventListener('keydown', function(e) {
      var k = (e.key || '').toUpperCase();
      if (k === 'Q' || k === 'W') {
        var activeTag = document.activeElement ? document.activeElement.tagName : '';
        if (activeTag !== 'INPUT' && activeTag !== 'TEXTAREA') {
          var sel = window.getSelection();
          var selText = sel ? sel.toString().trim() : '';
          e.preventDefault();
          if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'PDF_KEY_SHORTCUT', key: k, text: selText }, '*');
          }
        }
      }
    });
  </script>
</body>
</html>`
}
