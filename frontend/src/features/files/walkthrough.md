# Visual PDF Rendering Fix & Study Bag Workspace Integration

We have fixed the visual PDF rendering issue and implemented the **Study Bag Notes Manager** directly inside the left Card Studio panel in Split Mode.

---

## 1. Problem & Root Cause Analysis

1. **PDF Rendering Failure ("Failed to render PDF pages visually.")**:
   - **Root Cause**: The iframe was configured with `sandbox="allow-scripts allow-same-origin"` and passed a `blob:` URL (`blob:http://localhost:5173/...`) into PDF.js. In Chromium, Web Workers cannot fetch main-thread Blob URLs due to origin isolation, causing `loadTask.promise` to reject. Additionally, the sandboxed iframe restricted worker instantiation.
   - **Fix**:
     - `InteractivePdfViewer` now reads the `Blob` directly into memory via `FileReader.readAsDataURL(blob)` and provides the bytes directly to PDF.js via `pdfjsLib.getDocument({ data: bytes })`. This requires **zero network requests** and has **zero worker fetch failures**.
     - Configured `pdfjsLib.GlobalWorkerOptions.workerSrc = ''` so PDF.js safely and reliably runs in-thread without worker sandbox friction.
     - Removed the restrictive `sandbox` attribute from `<iframe />`.
     - Added a graceful fallback button ("Switch to Fast Reader Mode") if any corrupted file is opened.

2. **Managing Many Bagged Notes in Card Studio**:
   - **Requirement**: When a user bags multiple notes from documents, they need to view, browse, and easily convert them into flashcards one-by-one from the left Card Creation panel.
   - **Implementation**:
     - Created a collapsible **Study Bag ({snippets.length})** workspace tray inside [**`SplitCardStudio.tsx`**](file:///c:/projects/saulado/frontend/src/features/files/SplitCardStudio.tsx).
     - Displays all bagged notes with numbered badges (`#1`, `#2`, ...), two-line text previews, and source document tags.
     - Clicking any note card (or clicking "Load") immediately populates that note into the Highlight Editor in `highlight` mode.
     - Individual Delete button (`TrashIcon`) and "Clear All" with confirmation.
     - When saving a card, it automatically removes that note from the bag and smoothly loads the next note.
     - When the editor is empty and bagged notes exist, it presents an actionable card: `"You Have {N} Bagged Notes"` with a `"Start Blanking Note #1 🚀"` button.

---

## 2. Files Modified

| File                                                                                                           | Changes                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`pdf-viewer-html.ts`](file:///c:/projects/saulado/frontend/src/services/file-repository/pdf-viewer-html.ts)   | Enabled in-memory `Uint8Array` data loading, disabled external worker failures with `workerSrc = ''`, added fallback reader button.                   |
| [`InteractivePdfViewer.tsx`](file:///c:/projects/saulado/frontend/src/features/files/InteractivePdfViewer.tsx) | Reads `blob` to base64, posts ArrayBuffer to iframe, removed `sandbox` restrictions, added reader fallback event handling.                            |
| [`FileViewerPage.tsx`](file:///c:/projects/saulado/frontend/src/features/files/FileViewerPage.tsx)             | Passes `blob` and `onSwitchToReader` to `InteractivePdfViewer`.                                                                                       |
| [`SplitCardStudio.tsx`](file:///c:/projects/saulado/frontend/src/features/files/SplitCardStudio.tsx)           | Added Bagged Notes tray with active note highlighting, one-click loading, individual note deletion, auto-advance queue on save, and rich empty state. |

---

## 3. Verification Results

- **TypeScript Typecheck**: `pnpm --filter @saulado/frontend typecheck` passed (0 errors).
- **Unit Tests**: `pnpm --filter @saulado/frontend test` passed (43 test files, 378 tests passed).
- **Production Build**: `pnpm --filter @saulado/frontend build` built in 8.31s.
- **Local Dev Server**: `http://localhost:5173` running and responsive.

---

## 4. How to Test on Localhost

1. Open `http://localhost:5173/files` and click on `itprofel week 4.pdf`.
2. Click **"⚡ Split Studio"** in the top header.
3. **Check Visual PDF (Right Panel)**: The PDF document pages now render with full visual layout, crisp canvas, and clear text.
4. **Drag to Select on PDF**: Drag across any text in the PDF — it automatically appears in the Card Studio on the left in Highlight mode!
5. **Drag to Blank (Left Panel)**: Drag across any words on the card — they turn into cloze blanks (`[1]`, `[2]`).
6. **Study Bag Notes (Left Panel)**:
   - Notice the **"Study Bag (1)"** (or more) section at the top of the Card Studio on the left.
   - If you have multiple notes bagged, click "Show All ▾" to see all of them.
   - Click any bagged note to immediately load it into the editor.
   - Click **"Save Card to [Set] ✓"** — the card is saved, the note is checked off from the bag, and the next bagged note loads automatically!
