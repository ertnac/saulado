# Continuous Scroll PDF Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the mobile visual PDF viewer from a single-page viewer with Prev/Next navigation buttons into a smooth, continuous vertical scroll viewer that renders all document pages in a single scrollable viewport with lazy rendering, correct multi-page text selection, and highlight support.

**Architecture:** Replace the single-canvas paging model in `generatePdfViewerHtml` with a multi-page DOM container structure where each page has its own `.page-wrapper`, `<canvas>`, and `.textLayer`. Leverage an `IntersectionObserver` to lazy-render canvases as they enter the viewport buffer (preventing mobile WebView out-of-memory crashes on large documents), an active page observer to update a floating page indicator pill ("Page X of Y"), and contextual text selection detection to extract the accurate page number for snippet bagging and highlighting.

**Tech Stack:** React Native (Expo), `react-native-webview`, PDF.js (v3.11 / offline bundle), TypeScript, Vitest.

## Global Constraints

- **Zero Regression on Offline Capabilities:** Must use the existing local offline `pdf.js` assets (`file:///android_asset/pdfjs/...`) and base64 parsing without requiring external internet.
- **Memory Safety on Low-End Devices:** Continuous rendering must not render all canvases synchronously at once on documents with tens or hundreds of pages; it must use lazy intersection-based rendering with a viewport buffer.
- **Selection & Snippet Integrity:** Highlighting and adding snippets to the Snippet Bag must capture the exact page number of the selected text across all rendered pages.
- **Theme & Dark Mode Consistency:** Respect current dark mode tokens (`#031a14`, `#072e24`, `#22c55e`) and light mode backgrounds.

---

## User Review Required

> [!IMPORTANT]
> **Page Navigation & Indicator Design:**
> The current top strip `< Prev  Page 1 of 9  Next >` will be replaced by:
>
> 1. A sleek, floating / sticky page counter pill (e.g. `Page 1 of 9`) that smoothly updates as the user scrolls through the document.
> 2. All pages rendered vertically in sequence with a clean 16px gap and subtle shadow, enabling fluid continuous vertical scrolling.

> [!NOTE]
> Zoom controls ("Fit ↔", "125%", "150%") on the native header will continue to work, dynamically recalculating page widths and re-rendering visible pages cleanly.

---

## Proposed Changes

### Mobile Service Layer

#### [MODIFY] [document-viewer.ts](file:///c:/projects/saulado/mobile/services/document-viewer.ts)

- Replace `#controls` with a floating/sticky `#page-indicator-pill`.
- Change `#pdf-container` HTML generation to create a container for multiple page wrappers (`page-wrapper-${num}`).
- Implement layout pre-sizing:
  - Once the PDF document metadata loads, create all placeholder `.page-wrapper` containers with the appropriate aspect ratio and heights. This guarantees that the WebView's scrollbar and total scroll height are immediately accurate from the start.
- Implement lazy canvas & text layer rendering via `IntersectionObserver` with a `350px` root margin buffer:
  - Pages within or near the viewport render their `<canvas>` and `.textLayer` on demand.
  - Off-screen pages remain lightweight placeholders until scrolled near.
- Implement active page indicator:
  - An observer detects which page wrapper occupies the center of the viewport and dynamically updates `#page-indicator-pill` (e.g., `Page 3 of 9`).
- Update `checkSelection()`:
  - Locate `range.startContainer.parentElement.closest('.page-wrapper')` to extract the exact `dataset.pageNumber` for `PDF_TEXT_SELECTION`.
- Update `addPdfHighlight()` and `applyHighlightsForPage()`:
  - Scope highlight classes to the specific page's `#text-layer-${num}`.
- Update zoom handler `setDocumentZoom`:
  - Recalculate CSS dimensions for all page wrappers and re-render visible pages.

---

### Tests

#### [MODIFY] [file-repository.test.ts](file:///c:/projects/saulado/mobile/services/__tests__/file-repository.test.ts)

- Update tests for `generatePdfViewerHtml`:
  - Remove obsolete checks for `prevPage()` and `nextPage()`.
  - Add assertions verifying multi-page container, scrollable viewport styles, page indicator pill, and lazy rendering observer script.
- Add unit test validating multi-page selection message construction and highlight scoping.

---

## Detailed Task Breakdown

### Task 1: Update Tests for Continuous Multi-Page PDF Viewer

**Files:**

- Modify: `mobile/services/__tests__/file-repository.test.ts:137-150`

**Interfaces:**

- Consumes: `generatePdfViewerHtml({ pdfBase64, title, isDark, zoomScale, highlights })`
- Produces: HTML string containing continuous scroll container, page indicator, and multi-page rendering scripts.

- [x] **Step 1: Update the unit test in `file-repository.test.ts` to reflect continuous scroll design**

```typescript
it('generates continuous scroll PDF viewer HTML with page container and indicator', () => {
  const html = generatePdfViewerHtml({
    pdfBase64: 'JVBERg==',
    title: 'Sample PDF',
    isDark: false,
  })
  expect(html).toContain('pdf.js')
  expect(html).toContain('Sample PDF')
  expect(html).toContain('pdf-container')
  expect(html).toContain('page-indicator')
  // Prev and Next navigation buttons should no longer be present
  expect(html).not.toContain('prevPage()')
  expect(html).not.toContain('nextPage()')
  // Multi-page observer and text layer support
  expect(html).toContain('IntersectionObserver')
  expect(html).toContain('page-wrapper')
})
```

- [x] **Step 2: Run test to verify failure**

Run: `npm test` in `mobile`
Expected: FAIL (because current `generatePdfViewerHtml` still contains `prevPage()` / `nextPage()` and does not yet contain `IntersectionObserver` / `page-indicator`).

---

### Task 2: Implement Continuous Scroll Multi-Page Rendering Engine in `document-viewer.ts`

**Files:**

- Modify: `mobile/services/document-viewer.ts:157-640`

**Interfaces:**

- Input: `pdfBase64`, `fileId`, `title`, `isDark`, `zoomScale`, `highlights`
- Output: Complete HTML string with continuous vertical scrolling, lazy page rendering, multi-page text layer extraction, and dynamic page indicator.

- [x] **Step 1: Replace CSS styles in `generatePdfViewerHtml`**
  - Remove `#controls` flex strip with next/prev buttons.
  - Add styles for `#page-indicator`:
    ```css
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
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      pointer-events: none;
      transition: opacity 0.3s ease;
    }
    ```
  - Style `.page-wrapper`:
    ```css
    .page-wrapper {
      position: relative;
      margin: 0 auto 16px auto;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.18);
      border-radius: 6px;
      background: #ffffff;
      display: block;
      overflow: hidden;
      min-height: 200px;
      transition:
        width 0.2s ease,
        height 0.2s ease;
    }
    ```
  - Ensure `#pdf-container` supports vertical scrolling with bottom padding:
    ```css
    #pdf-container {
      width: 100%;
      padding: 16px 8px 160px 8px;
      display: flex;
      flex-direction: column;
      align-items: center;
      box-sizing: border-box;
    }
    ```

- [x] **Step 2: Implement Multi-Page DOM Skeleton and Lazy Rendering Script**
  - Once `pdfDoc` loads:
    1. Read first page viewport to determine aspect ratio.
    2. Dynamically create all placeholder divs in `#pdf-container`:
       ```javascript
       for (let i = 1; i <= pdfDoc.numPages; i++) {
         const wrapper = document.createElement('div')
         wrapper.id = 'page-wrapper-' + i
         wrapper.className = 'page-wrapper'
         wrapper.dataset.pageNumber = i
         wrapper.style.width = cssW + 'px'
         wrapper.style.height = cssH + 'px'

         const canvas = document.createElement('canvas')
         canvas.id = 'pdf-canvas-' + i
         wrapper.appendChild(canvas)

         const textLayer = document.createElement('div')
         textLayer.id = 'text-layer-' + i
         textLayer.className = 'textLayer'
         wrapper.appendChild(textLayer)

         container.appendChild(wrapper)
       }
       ```
    3. Initialize `IntersectionObserver` for page rendering with `rootMargin: '350px 0px'`:
       - When page enters, render page canvas (with DPR scaling for crisp text) and text layer.
       - Track rendered state (`wrapper.dataset.rendered = "true"`) to avoid duplicate rendering.
    4. Initialize `IntersectionObserver` or scroll tracker for active page indicator:
       - Detects the page most visible on screen and updates `#page-indicator`: `Page ${activePage} of ${pdfDoc.numPages}`.

- [x] **Step 3: Update Text Selection & Highlight Logic for Multi-Page Context**
  - In `checkSelection()`:
    - Get selected range: `sel.getRangeAt(0)`
    - Find the containing page wrapper: `range.startContainer.parentElement?.closest('.page-wrapper')`
    - Extract `pageNumber = parseInt(wrapper.dataset.pageNumber, 10) || 1`
    - Post `PDF_TEXT_SELECTION` message with the correct dynamic `pageNumber`.
  - In `applyHighlightsForPage(pageNumber)`:
    - Target the specific text layer `#text-layer-${pageNumber}`.
  - In `window.addPdfHighlight(highlight)`:
    - Push to `storedHighlights` and call `applyHighlightsForPage(highlight.pageNumber)`.

- [x] **Step 4: Update Zoom Handler**
  - In `window.setDocumentZoom(scale)`:
    - Update `currentZoomScale`.
    - Recalculate dimensions for all `.page-wrapper` elements.
    - Trigger re-render of currently visible canvases.

---

### Task 3: Verification & Integration Testing

**Files:**

- Run automated tests in `mobile`
- Run typecheck in `mobile`

- [x] **Step 1: Run vitest suite**
  - Command: `npm test` in `mobile`
  - Verify all 14 test files pass including `file-repository.test.ts`.

- [x] **Step 2: Run TypeScript check**
  - Command: `npm run typecheck` in `mobile`
  - Verify clean build without TypeScript errors.

- [x] **Step 3: Verify document viewer screen edge cases**
  - Verify DOCX & legacy DOC files continue rendering properly using `generateReaderHtml`.
  - Verify Snippet Bag addition works with dynamic page numbers.
  - Verify highlight persistence on multi-page scroll.

---

## Verification Plan

### Automated Tests

- Run `npm test` in `c:\projects\saulado\mobile`:
  - `mobile/services/__tests__/file-repository.test.ts` (continuous scroll HTML structure & page indicator assertions)
  - Full test suite regression run.
- Run `npm run typecheck` in `c:\projects\saulado\mobile`.

### Manual Verification

- Open any multi-page PDF (e.g., `Challenges_Ass...` 9-page lecture notes).
- Confirm all 9 pages are displayed in a single vertical scroll view.
- Verify smooth scrolling from page 1 through page 9.
- Verify top/floating page indicator updates accurately as each page scrolls into view.
- Select text on Page 3: verify selection toolbar appears and "+ Add to Bag" saves snippet with `pageNumber: 3`.
- Tap "Highlight": verify the yellow highlight renders on Page 3.
- Toggle zoom ("Fit ↔" -> "125%"): verify all pages scale properly and re-render crisply.
