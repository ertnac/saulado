# Remove OCR & Implement Paste Text to Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all OCR modules and native/WASM dependencies from both the web app (`frontend`) and mobile app (`mobile`), replacing OCR with a unified, 100% offline-capable "Paste Text to Cards" feature.

**Architecture:** Replace Tesseract.js (frontend) and ML Kit / Camera (mobile) with dedicated Paste Text to Cards editors. Mobile leverages `DocumentPrintLayout` + `createCardOfflineAware` saving directly to SQLite offline and syncing online, accessible directly via the center tab bar FAB, dashboard quick action, and set detail buttons. Frontend features a unified `PasteToCardsDialog` and `PasteTextEditor` with cloze blank highlighting.

**Tech Stack:** React 18, React Native 0.86, Expo Router, Tailwind CSS / NativeWind, TanStack Query, Expo SQLite, Vitest, TypeScript.

## Global Constraints

- Zero OCR dependencies: remove `tesseract.js`, `@react-native-ml-kit/text-recognition`, `expo-camera`, and `expo-image-manipulator`.
- 100% offline support in mobile: all card creation via `paste-cards` must save to local SQLite and update query caches when disconnected.
- Preserve backward-compatibility: routes like `/scan` or `/scan-review` must redirect to `/paste-cards`.
- Retain text processing utilities (`segmentParagraphs`, `dewrap`, `enhanceNotesText`) in `@saulado/shared`.

---

### Task 1: Update Shared Library Text Normalization Utilities

**Files:**

- Modify: `shared/src/ocr/index.ts`
- Modify: `shared/src/index.ts`
- Test: `shared/src/ocr/segment.test.ts`
- Test: `shared/src/ocr/dewrap.test.ts`

**Interfaces:**

- Consumes: `segmentParagraphs(text: string)`, `dewrap(text: string)`, `enhanceOcrText(text: string)`
- Produces: `enhanceNotesText(text: string)` (aliased to `enhanceOcrText` for backwards compatibility)

- [ ] **Step 1: Write test verifying enhanceNotesText alias**

Add to `shared/src/ocr/dewrap.test.ts`:

```typescript
import { enhanceNotesText, enhanceOcrText } from './ocr-enhancer'

describe('enhanceNotesText', () => {
  it('exports enhanceNotesText identical to enhanceOcrText', () => {
    const raw = 'The fi-rst step is photosynthesis.'
    expect(enhanceNotesText(raw)).toBe(enhanceOcrText(raw))
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm --filter @saulado/shared test`

- [ ] **Step 3: Export enhanceNotesText in shared library**

In `shared/src/ocr/ocr-enhancer.ts`:

```typescript
export { enhanceOcrText as enhanceNotesText }
```

And re-export in `shared/src/ocr/index.ts` and `shared/src/index.ts`.

- [ ] **Step 4: Run test to verify pass**

Run: `pnpm --filter @saulado/shared test` and `pnpm --filter @saulado/shared build`

- [ ] **Step 5: Commit changes**

```bash
git add shared/
git commit -m "feat(shared): export enhanceNotesText alias for text normalization"
```

---

### Task 2: Remove OCR Modules & Tesseract Dependency from Web App

**Files:**

- Delete: `frontend/src/services/ocr/image-ocr.ts`
- Delete: `frontend/src/services/ocr/document-ocr.ts`
- Delete: `frontend/src/services/ocr/ocr-service.ts`
- Delete: `frontend/src/services/ocr/ocr-cleanup.ts`
- Delete: `frontend/src/services/ocr/ocr-cleanup.test.ts`
- Delete: `frontend/src/services/ocr/document-ocr.test.ts`
- Delete: `frontend/src/features/cards/ocr.ts`
- Delete: `frontend/src/features/cards/import/OcrImportPipeline.ts`
- Modify: `frontend/package.json`
- Modify: `pnpm-workspace.yaml`

**Interfaces:**

- Removes: `tesseract.js`, `recognize`, `processImageOcr`, `processDocumentText`, `runOcrImportPipeline`

- [ ] **Step 1: Delete OCR service and import pipeline files**

Remove `frontend/src/services/ocr/`, `frontend/src/features/cards/ocr.ts`, and `frontend/src/features/cards/import/OcrImportPipeline.ts`.

- [ ] **Step 2: Update package.json and pnpm-workspace.yaml**

In `frontend/package.json`:
Remove `"tesseract.js": "^7.0.0"` from `dependencies`.
In `pnpm-workspace.yaml`:
Remove `tesseract.js: false` from `allowBuilds`.

- [ ] **Step 3: Run pnpm install to update lockfile**

Run: `pnpm install`

- [ ] **Step 4: Commit changes**

```bash
git add pnpm-workspace.yaml pnpm-lock.yaml frontend/
git commit -m "refactor(frontend): remove tesseract.js and deprecated ocr services"
```

---

### Task 3: Build Unified "Paste Text to Cards" Editor & Dialog for Web

**Files:**

- Create: `frontend/src/features/cards/import/TextCardsToolbar.tsx`
- Create: `frontend/src/features/cards/import/PasteTextEditor.tsx`
- Create: `frontend/src/features/cards/import/PasteToCardsDialog.tsx`
- Modify: `frontend/src/features/cards/ImportDialog.tsx`
- Modify: `frontend/src/features/files/MakeCardsDialog.tsx`
- Delete: `frontend/src/features/cards/import/OcrToolbar.tsx`
- Delete: `frontend/src/features/cards/import/OcrToolbar.test.tsx`
- Delete: `frontend/src/features/cards/import/OcrReviewEditor.tsx`
- Delete: `frontend/src/features/cards/import/OcrReviewEditor.test.tsx`
- Delete: `frontend/src/features/cards/import/FileImportDialog.tsx`
- Delete: `frontend/src/features/cards/import/FileImportDialog.test.tsx`
- Test: `frontend/src/features/cards/import/PasteToCardsDialog.test.tsx`

**Interfaces:**

- Produces:

  ```typescript
  export interface PasteToCardsDialogProps {
    open: boolean
    onClose: () => void
    onImport?: (questions: { text: string; answers: AnswerRange[] }[]) => void
    targetSetId?: string
  }
  export function PasteToCardsDialog(props: PasteToCardsDialogProps): ReactElement
  ```

- [ ] **Step 1: Write test for PasteToCardsDialog**

Create `frontend/src/features/cards/import/PasteToCardsDialog.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PasteToCardsDialog } from './PasteToCardsDialog'

describe('PasteToCardsDialog', () => {
  it('renders paste textarea and title when open', () => {
    render(<PasteToCardsDialog open={true} onClose={vi.fn()} />)
    expect(screen.getByText(/Paste Notes to Cards/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Paste or type notes here/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Implement TextCardsToolbar component**

Create `frontend/src/features/cards/import/TextCardsToolbar.tsx`:
Provides mode switcher (Edit Notes vs Highlight Cards), symbol inserters (`•`, `—`, `→`, `²`, `³`, `°`, `≈`, `≠`, `≤`, `≥`, `℃`, `π`), Auto-Clean formatting, and reset.

- [ ] **Step 3: Implement PasteTextEditor component**

Create `frontend/src/features/cards/import/PasteTextEditor.tsx`:
Accepts `initialText`, allows typing/pasting text, splits into question cards on blank lines (`\n\n`), integrates `CardHighlightEditor` for cloze blank assignment, and commits valid cards.

- [ ] **Step 4: Implement PasteToCardsDialog component**

Create `frontend/src/features/cards/import/PasteToCardsDialog.tsx`:
Provides dialog wrapping `PasteTextEditor`. When `targetSetId` is passed, saves directly into that set; otherwise provides set picker / creation step.

- [ ] **Step 5: Update MakeCardsDialog and ImportDialog**

Update `MakeCardsDialog.tsx` to use `PasteTextEditor` instead of `OcrReviewEditor`.
Update `ImportDialog.tsx` to re-export `PasteToCardsDialog as ImportDialog`.
Delete old `OcrToolbar.*`, `OcrReviewEditor.*`, and `FileImportDialog.*`.

- [ ] **Step 6: Run tests and typecheck**

Run: `pnpm --filter @saulado/frontend test` and `pnpm --filter @saulado/frontend typecheck`

- [ ] **Step 7: Commit changes**

```bash
git add frontend/
git commit -m "feat(frontend): implement PasteToCardsDialog and PasteTextEditor"
```

---

### Task 4: Update Frontend Dashboard & Landing Page

**Files:**

- Modify: `frontend/src/features/dashboard/DashboardPage.tsx`
- Modify: `frontend/src/features/landing/LandingPage.tsx`
- Test: `frontend/src/App.test.tsx`

**Interfaces:**

- Consumes: `PasteToCardsDialog`
- Replaces: `onImportOcr` -> `onPasteCards`, "Import Document" -> "Paste Notes to Cards"

- [ ] **Step 1: Update QuickActions in DashboardPage.tsx**

Replace `onImportOcr` with `onPasteCards`, label "Paste to Cards", icon `FileTextIcon` or `SparklesIcon`. Mount `PasteToCardsDialog` when triggered.

- [ ] **Step 2: Update LandingPage.tsx feature tile**

Change tile title from "Document & Image OCR" to "Instant Paste & Cloze Cards". Update description to emphasize pasting summaries, textbook notes, and lecture notes with instant blank generation.

- [ ] **Step 3: Run web tests**

Run: `pnpm --filter @saulado/frontend test`

- [ ] **Step 4: Commit changes**

```bash
git add frontend/src/features/dashboard/ frontend/src/features/landing/
git commit -m "feat(frontend): update dashboard quick action and landing page for paste to cards"
```

---

### Task 5: Remove Native OCR & Camera Dependencies from Mobile App

**Files:**

- Delete: `mobile/services/ocr.ts`
- Delete: `mobile/lib/text-recognition.ts`
- Delete: `mobile/components/lens-ar-overlay.tsx`
- Delete: `mobile/lib/scan-handoff.ts`
- Modify: `mobile/package.json`
- Modify: `mobile/app.config.ts`

**Interfaces:**

- Removes: `@react-native-ml-kit/text-recognition`, `expo-camera`, `expo-image-manipulator`

- [ ] **Step 1: Delete mobile OCR source files**

Delete `mobile/services/ocr.ts`, `mobile/lib/text-recognition.ts`, `mobile/components/lens-ar-overlay.tsx`, and `mobile/lib/scan-handoff.ts`.

- [ ] **Step 2: Remove dependencies in mobile/package.json and app.config.ts**

In `mobile/package.json`:
Remove `@react-native-ml-kit/text-recognition`, `expo-camera`, `expo-image-manipulator`.
In `mobile/app.config.ts`:
Remove the `expo-camera` plugin block and its camera permissions description.

- [ ] **Step 3: Run install and verify dependencies removed**

Run: `cd mobile && npm install --package-lock-only` (or `pnpm install`)

- [ ] **Step 4: Commit changes**

```bash
git add mobile/
git commit -m "refactor(mobile): remove native ocr and camera dependencies"
```

---

### Task 6: Implement Dedicated "Paste Notes to Cards" Route on Mobile

**Files:**

- Create: `mobile/app/(app)/paste-cards.tsx`
- Modify: `mobile/app/(app)/scan-review.tsx` (redirect / backward-compat alias)
- Modify: `mobile/app/(app)/scan.tsx` (redirect / backward-compat alias)
- Modify: `mobile/components/document-print-layout.tsx`
- Test: `mobile/app/(app)/__tests__/paste-cards.test.tsx`

**Interfaces:**

- Produces: `PasteCardsScreen()` routing at `/paste-cards`, with optional query param `?setId=...`

- [ ] **Step 1: Write test for paste-cards screen**

Create `mobile/app/(app)/__tests__/paste-cards.test.tsx` verifying render of notes editor and offline card persistence.

- [ ] **Step 2: Clean up DocumentPrintLayout.tsx**

Remove OCR references and update default title to "Paste & Review Notes". Replace `scanAgainLabel` with "Cancel / Back".

- [ ] **Step 3: Create mobile/app/(app)/paste-cards.tsx**

Directly initialize `DocumentPrintLayout` in paste mode with text input open. Upon clicking save, persist via `createCardOfflineAware(targetSetId, ...)` into SQLite/server and invalidate query caches. If no `setId` was specified, display the `ChooseSet` screen.

- [ ] **Step 4: Update scan.tsx and scan-review.tsx to redirect to paste-cards**

Turn `scan.tsx` and `scan-review.tsx` into clean `<Redirect href="/paste-cards" />` handlers so any legacy navigation or bookmarks route to the new screen seamlessly.

- [ ] **Step 5: Run mobile test suite**

Run: `pnpm --filter @saulado/mobile test`

- [ ] **Step 6: Commit changes**

```bash
git add mobile/
git commit -m "feat(mobile): add dedicated paste-cards route with offline sqlite persistence"
```

---

### Task 7: Update Mobile Tab Bar, Dashboard & Set Screens

**Files:**

- Modify: `mobile/components/tab-bar.tsx`
- Modify: `mobile/app/(app)/_layout.tsx`
- Modify: `mobile/app/(app)/index.tsx`
- Modify: `mobile/app/(app)/sets/[setId].tsx`

**Interfaces:**

- Navigation: Center tab bar FAB -> `/paste-cards`
- Dashboard action: "Paste Notes" -> `/paste-cards`
- Set action: "Paste Notes" -> `/paste-cards?setId=${setId}`

- [ ] **Step 1: Update AppLayout SCREENS in mobile/app/(app)/\_layout.tsx**

Replace `{ name: 'scan', title: 'Scan a page' }` and `{ name: 'scan-review', title: 'Review the scan' }` with `{ name: 'paste-cards', title: 'Paste Notes to Cards' }`.

- [ ] **Step 2: Update TabBar in mobile/components/tab-bar.tsx**

Update the center Hero button to always navigate to `/paste-cards` (online or offline), using `FileTextIcon` with accessibility label "Create cards from pasted text".

- [ ] **Step 3: Update Dashboard in mobile/app/(app)/index.tsx**

Change Quick Action tile from "Scan Paper: Import cards" with `CameraIcon` to "Paste Notes: Create cards from text" with `FileTextIcon`, pushing `/paste-cards`.

- [ ] **Step 4: Update Set Detail in mobile/app/(app)/sets/[setId].tsx**

Change "Scan Note" and "Read a page with the camera" to "Paste Notes" routing to `/paste-cards?setId=${setId}`.

- [ ] **Step 5: Run mobile typecheck and tests**

Run: `cd mobile && npm run typecheck` and `npm test`

- [ ] **Step 6: Commit changes**

```bash
git add mobile/
git commit -m "feat(mobile): update tab bar, dashboard and set views to launch paste-cards"
```

---

### Task 8: End-to-End Validation & Verification

**Files:**

- All touched files across workspace

- [ ] **Step 1: Run typechecks across workspace**

Run: `pnpm typecheck`
Expected: 0 errors across `@saulado/shared`, `@saulado/backend`, `@saulado/frontend`.
Run: `cd mobile && npm run typecheck`
Expected: 0 errors across `@saulado/mobile`.

- [ ] **Step 2: Run all unit and integration tests**

Run: `pnpm test`
Run: `cd mobile && npm test`
Expected: All test suites pass.

- [ ] **Step 3: Run workspace linter and format checker**

Run: `pnpm lint`
Run: `pnpm format:check`

- [ ] **Step 4: Final commit and summary**

```bash
git add .
git commit -m "chore: complete removal of ocr and implementation of paste text to cards"
```
