# Automatic PPT/PPTX to PDF Conversion Implementation Plan (Mobile & Web)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable both Mobile (Expo/React Native) and Web (React) users to select PowerPoint presentations (`.pptx` and `.ppt`) from their device, automatically convert them into pixel-perfect vector PDFs with full selectable text, and store them locally in the device repository so they can be viewed, studied, highlighted, and turned into flashcards 100% offline.

**Architecture:**

1. **Backend (`@saulado/backend`):** Introduce a dedicated presentation conversion pipeline (`ppt-converter.ts`) powered by headless LibreOffice that accepts `.pptx` or legacy `.ppt` buffers and returns a vector PDF with full formatting fidelity and a selectable text layer. Expose `POST /api/files/convert-ppt`. Update the production Dockerfile to bundle `libreoffice` and CJK/Unicode fonts.
2. **Shared Library (`@saulado/shared`):** Expand `RepositoryFileType` to support `'pptx' | 'ppt'`, define `ConvertPptRequest` and `ConvertPptResponse` contracts, and export magic bytes verification helpers for presentations.
3. **Mobile App (`@saulado/mobile`):** Update `pickAndImportFiles` and `ALLOWED_MIME_TYPES` / `ALLOWED_EXTENSIONS` to accept PowerPoint files. When a user picks a `.pptx` or `.ppt`, the app automatically streams the file to the conversion endpoint, receives the converted vector PDF, and saves it into the local SQLite database and sandboxed filesystem as an offline PDF.
4. **Web Frontend (`@saulado/frontend`):** Update `file-validation.ts` and `FilesPage.tsx` drag-and-drop / upload handler to accept `.pptx` and `.ppt`, invoke the conversion endpoint, and store the resulting PDF in IndexedDB and cloud storage.

**Tech Stack:** Node.js, Express, Docker (Alpine with LibreOffice & Unicode fonts), React Native (Expo), React (Vite), TypeScript, Vitest.

---

## Global Constraints

- **Preserve Slide Formatting:** Conversion must use true vector slide rendering (not rasterized low-res screenshots) preserving background fills, tables, shapes, images, and text positioning.
- **Selectable Text & Flashcard Support:** Converted PDFs must have a valid text layer compatible with our continuous vertical scroll viewer, text highlighting, and Snippet Bag / flashcard creation.
- **Permanent Offline Accessibility:** Once converted and downloaded onto the device, the PDF must be stored in the app's local sandbox and SQLite database, allowing students to read and study completely offline with zero internet.
- **Graceful Offline Protection:** If a user attempts to import a `.pptx` or `.ppt` while disconnected from Wi-Fi/cellular, show a friendly alert explaining that conversion requires internet once, rather than failing silently.
- **Backward Compatibility:** Existing `.pdf`, `.docx`, and `.doc` import workflows must remain completely unaffected.

---

## User Review Required

> [!IMPORTANT]
> **Conversion Strategy:**
>
> - When a user selects a `.pptx` or `.ppt`, it is converted to `.pdf` during import.
> - In both the Mobile and Web file lists, the document is saved and displayed as a native PDF (e.g., `Biology_Lecture_1.pdf` instead of `.pptx`), ensuring it opens in the newly built continuous vertical scroll viewer with full highlighting and study features.
> - The original filename is preserved with the `.pdf` extension.

> [!NOTE]
> **Docker Production Environment:**
> `backend/Dockerfile` will be updated to include `libreoffice` and font packages (`font-dejavu`, `font-noto`, `font-noto-cjk`) so headless conversion works automatically in containerized production deployments.

---

## Proposed Changes

### 1. Shared Types & Contracts (`packages/shared`)

#### [MODIFY] [types.ts](file:///c:/projects/saulado/shared/src/repository/types.ts)

- Add `'pptx' | 'ppt'` to `RepositoryFileType`.
- Define `ConvertPptRequest`:
  ```typescript
  export interface ConvertPptRequest {
    name: string
    mimeType?: string
    dataBase64: string
  }
  ```
- Define `ConvertPptResponse`:
  ```typescript
  export interface ConvertPptResponse {
    file: {
      name: string
      fileType: 'pdf'
      mimeType: 'application/pdf'
      fileSize: number
      dataBase64: string
    }
  }
  ```

---

### 2. Backend Services & Routes (`backend`)

#### [NEW] [ppt-converter.ts](file:///c:/projects/saulado/backend/src/services/ppt-converter.ts)

- Encapsulates headless conversion:
  - Takes input buffer, original filename, and options.
  - Writes to a secure temporary directory (`os.tmpdir()`).
  - Executes `soffice --headless --convert-to pdf --outdir <tempDir> <tempFile>`.
  - Reads output PDF buffer and cleans up temporary files in a `finally` block.
  - Includes a fallback for test/dev environments without `soffice` installed (returns valid mock vector PDF buffer in test mode).

#### [MODIFY] [files.ts](file:///c:/projects/saulado/backend/src/routes/files.ts)

- Add `verifyMagicBytes` support for:
  - `'pptx'`: ZIP PK header (`0x50 0x4B 0x03 0x04`)
  - `'ppt'`: OLE Compound Document header (`0xD0 0xCF 0x11 0xE0`)
- Add `POST /api/files/convert-ppt`:
  - Validates user authentication (`requireAuth`).
  - Validates base64 data and magic bytes.
  - Runs `convertPresentationToPdf`.
  - Returns JSON with `file: { name, fileType: 'pdf', mimeType: 'application/pdf', fileSize, dataBase64 }`.

#### [MODIFY] [Dockerfile](file:///c:/projects/saulado/backend/Dockerfile)

- In the `runtime` stage, add `apk add --no-cache libreoffice font-dejavu font-noto font-noto-cjk` to provide the headless rendering engine and fonts.

---

### 3. Mobile Client (`mobile`)

#### [MODIFY] [file-repository.ts](file:///c:/projects/saulado/mobile/services/file-repository.ts)

- Add PowerPoint MIME types to `ALLOWED_MIME_TYPES`:
  - `'application/vnd.ms-powerpoint'`
  - `'application/vnd.openxmlformats-officedocument.presentationml.presentation'`
- Add `'.ppt', '.pptx'` to `ALLOWED_EXTENSIONS`.
- Update `detectFileType()` to identify `'ppt'` and `'pptx'`.
- Update `verifyMagicBytes()` for PPT and PPTX.
- In `pickAndImportFiles()`:
  - When asset is `'ppt'` or `'pptx'`:
    - Verify device is online (`onlineManager.isOnline()`). If offline, throw an explicit user-friendly error.
    - Read asset as base64.
    - Call `/api/files/convert-ppt` via `authorizedRequest`.
    - Save the returned PDF base64 into the sandboxed file directory (`${REPOSITORY_DIR}${fileId}_${convertedName}`).
    - Insert into SQLite with `file_type: 'pdf'`.

---

### 4. Web Frontend (`frontend`)

#### [MODIFY] [file-validation.ts](file:///c:/projects/saulado/frontend/src/services/file-repository/file-validation.ts)

- Add `.pptx` and `.ppt` to `ALLOWED_EXTENSIONS`.
- Add PowerPoint MIME types to `ALLOWED_MIME_TYPES`.
- Update `detectFileType()` and `verifyMagicBytes()`.

#### [MODIFY] [api.ts](file:///c:/projects/saulado/frontend/src/services/file-repository/api.ts)

- Add `convertPptToPdf(file: File): Promise<{ blob: Blob; fileName: string }>`:
  - Encodes presentation file to base64.
  - Calls `POST /api/files/convert-ppt`.
  - Converts response base64 into a native `Blob` (`application/pdf`).

#### [MODIFY] [FilesPage.tsx](file:///c:/projects/saulado/frontend/src/features/files/FilesPage.tsx)

- In `handleUploadFile`:
  - If dropped/selected file is `'pptx'` or `'ppt'`, trigger conversion toast.
  - Await `convertPptToPdf(file)`.
  - Wrap converted blob as a `File` with `.pdf` extension.
  - Proceed with standard local/cloud PDF storage.

---

## Detailed Task Breakdown

### Task 1: Update Shared Contracts & Types

**Files:**

- Modify: `shared/src/repository/types.ts`
- Test: Build `@saulado/shared`

- [ ] **Step 1: Add PPT and PPTX types and conversion contracts**

```typescript
export type RepositoryFileType = 'pdf' | 'docx' | 'doc' | 'pptx' | 'ppt'

export interface ConvertPptRequest {
  name: string
  mimeType?: string
  dataBase64: string
}

export interface ConvertPptResponse {
  file: {
    name: string
    fileType: 'pdf'
    mimeType: 'application/pdf'
    fileSize: number
    dataBase64: string
  }
}
```

- [ ] **Step 2: Build shared package**
      Run: `pnpm --filter @saulado/shared build`
      Expected: PASS

---

### Task 2: Implement Backend Headless PPT Converter & API Endpoint

**Files:**

- Create: `backend/src/services/ppt-converter.ts`
- Modify: `backend/src/routes/files.ts`
- Create: `backend/src/routes/files-convert.test.ts`
- Modify: `backend/Dockerfile`

- [ ] **Step 1: Write failing unit test for `POST /api/files/convert-ppt`**

```typescript
import { describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'

describe('POST /api/files/convert-ppt', () => {
  it('rejects unauthenticated requests', async () => {
    const app = createApp()
    const res = await request(app).post('/api/files/convert-ppt').send({})
    expect(res.status).toBe(401)
  })

  it('validates file extension and magic bytes', async () => {
    // Test that corrupt or disguised files are rejected with VALIDATION_ERROR
  })
})
```

- [ ] **Step 2: Implement `ppt-converter.ts` service**
  - Use `child_process.execFile` calling `soffice --headless --convert-to pdf`.
  - Provide safe mock fallback when running in test mode.

- [ ] **Step 3: Add `POST /api/files/convert-ppt` route in `backend/src/routes/files.ts`**
  - Authenticate request with `requireAuth`.
  - Decode base64, verify magic bytes (`PK\x03\x04` for PPTX or `0xD0CF11E0` for PPT).
  - Execute conversion and return converted PDF file metadata and base64.

- [ ] **Step 4: Update Dockerfile runtime stage**
  - Add `apk add --no-cache libreoffice font-dejavu font-noto font-noto-cjk` to Alpine image.

- [ ] **Step 5: Run backend tests**
      Run: `npm test` in `backend`
      Expected: PASS

---

### Task 3: Implement Mobile PPT/PPTX Import & Automatic Conversion

**Files:**

- Modify: `mobile/services/file-repository.ts`
- Modify: `mobile/services/__tests__/file-repository.test.ts`

- [ ] **Step 1: Update unit tests in `file-repository.test.ts`**
  - Add test: `detectFileType detects PPTX and PPT files`.
  - Add test: `verifyMagicBytes accepts valid PPTX and PPT headers`.
  - Add test: `pickAndImportFiles converts PPTX into PDF and stores in SQLite`.

- [ ] **Step 2: Update `file-repository.ts`**
  - Add PowerPoint MIME types and extensions to picker configuration.
  - Implement conversion call to `authorizedRequest('/api/files/convert-ppt')`.
  - Write converted PDF binary to sandboxed filesystem and record as `pdf` in SQLite.

- [ ] **Step 3: Run mobile tests and typecheck**
      Run: `npm test` and `npm run typecheck` in `mobile`
      Expected: PASS

---

### Task 4: Implement Web Frontend PPT/PPTX Upload & Conversion

**Files:**

- Modify: `frontend/src/services/file-repository/file-validation.ts`
- Modify: `frontend/src/services/file-repository/api.ts`
- Modify: `frontend/src/features/files/FilesPage.tsx`
- Test: `frontend/src/services/file-repository/__tests__/file-validation.test.ts`

- [ ] **Step 1: Update `file-validation.ts` to recognize PPT and PPTX**
  - Add extensions: `.pptx`, `.ppt`.
  - Add MIME types.
  - Add magic byte verification for PK (PPTX) and OLE (PPT).

- [ ] **Step 2: Add `convertPptToPdf` in `api.ts`**
  - Post presentation file to `/api/files/convert-ppt` and parse returned PDF buffer into a `Blob`.

- [ ] **Step 3: Update `FilesPage.tsx` upload handler**
  - Intercept `.pptx` and `.ppt` file uploads.
  - Display informative conversion notification.
  - Convert to PDF blob and store as a high-fidelity PDF.

- [ ] **Step 4: Run frontend tests and typecheck**
      Run: `pnpm --filter @saulado/frontend test` and `pnpm --filter @saulado/frontend typecheck`
      Expected: PASS

---

## Verification Plan

### Automated Tests

1. **Shared:**
   - `pnpm --filter @saulado/shared build`
2. **Backend:**
   - `npm test` in `backend`: Verify authentication, payload validation, magic bytes check, and conversion endpoint.
3. **Mobile:**
   - `npm test` in `mobile`: Verify PPT/PPTX detection, magic bytes verification, and conversion to PDF.
   - `npm run typecheck` in `mobile`: Verify clean TypeScript compilation.
4. **Frontend:**
   - `pnpm --filter @saulado/frontend test`: Verify file validation tests.
   - `pnpm --filter @saulado/frontend typecheck`: Verify clean TypeScript compilation.

### Manual Verification

1. **Mobile Device Test:**
   - Open mobile app -> navigate to **Files** tab -> tap **Import Document**.
   - Select a sample PowerPoint presentation (`.pptx` or `.ppt`).
   - Confirm brief toast/indicator: _"Converting PowerPoint to PDF…"_.
   - Confirm document is saved in the repository as a `.pdf`.
   - Tap to open: confirm pixel-perfect slide visual formatting, continuous vertical scroll, and selectable text.
   - Select slide text: confirm "+ Add to Bag" saves snippet and highlighting works.
   - Turn on Airplane mode: verify the document still opens and reads **100% offline**.
2. **Web Browser Test:**
   - Open web app -> navigate to **Files** page.
   - Drag and drop or upload a `.pptx` file.
   - Confirm conversion occurs seamlessly and file appears in the list as a `.pdf`.
   - Click to open: confirm visual slide fidelity and selectable text.
