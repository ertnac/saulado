# Saulado Web Frontend — Feature Parity Implementation

You are the **senior frontend engineer and tech lead** responsible for implementing major feature parity between the Saulado React web frontend and the existing Saulado React Native/Expo mobile application.

## OBJECTIVE

Bring the `frontend/` application toward functional parity with the existing `mobile/` application while preserving the existing web functionality and adapting mobile-specific UX into appropriate desktop/browser experiences.

The implementation must be done incrementally and safely.

DO NOT rewrite the frontend from scratch.

DO NOT blindly copy mobile code into web.

Use the mobile implementation as the behavioral/reference implementation, while creating proper React web components and browser-specific implementations.

---

# CRITICAL PRODUCT REQUIREMENTS

The web application MUST support:

1. Type-In study mode
2. Multiple-Choice study mode
3. 3D Flip Flashcard study mode
4. Study mode switching
5. File importing
6. Image importing
7. PDF importing
8. OCR processing
9. OCR text cleanup
10. OCR review/editing
11. Mathematical/scientific symbol insertion
12. Highlight-to-create-card workflow
13. Universal JSON import/export
14. Anki cloze import
15. Markdown `[blank]` import
16. QA card import
17. Seed decks
18. Set mastery
19. Set search/filter/sort
20. Single-set JSON export
21. Archived Sets management
22. Dashboard feature parity
23. Quick Learn
24. Eventually, web offline persistence and synchronization

---

# EXPLICITLY EXCLUDED FEATURES

DO NOT implement the mobile camera scanning system on web.

The following are explicitly OUT OF SCOPE:

- Camera scanner
- Live camera viewfinder
- Lens AR overlay
- Live camera bounding boxes
- Mobile camera capture workflow
- Mobile-specific scanning UI

The web OCR workflow MUST instead be:

FILE / IMAGE
→ IMPORT
→ OCR
→ TEXT CLEANUP
→ REVIEW / EDIT
→ HIGHLIGHT ANSWERS
→ CREATE CARDS
→ SAVE TO SET

The dashboard action should be called something such as:

"Import & OCR"

rather than "Scan Note".

---

# EXISTING ARCHITECTURE

The repository is a monorepo containing:

- `mobile/`
- `frontend/`
- `backend/`
- `shared/`

The existing mobile implementation already contains offline-first architecture and study functionality.

Relevant mobile references include:

- `mobile/app/(app)/study.tsx`
- `mobile/components/study-card.tsx`
- `mobile/components/multiple-choice-grid.tsx`
- `mobile/components/flashcard-card.tsx`
- `mobile/lib/offline/`
- `mobile/services/json-transfer.ts`
- `mobile/seed-decks.json`
- `mobile/components/document-print-layout.tsx`

Relevant web references include:

- `frontend/src/features/study/StudySessionPage.tsx`
- `frontend/src/features/study/BlankSlot.tsx`
- `frontend/src/features/cards/SetsPage.tsx`
- `frontend/src/features/cards/SetDetailPage.tsx`
- `frontend/src/features/cards/ImportDialog.tsx`
- `frontend/src/features/dashboard/DashboardPage.tsx`
- `frontend/src/features/account/AccountPage.tsx`

Inspect the actual current repository before modifying anything.

Never assume that the previously described architecture is still identical to the current files.

---

# PHASE 0 — BASELINE

Before implementation:

1. Inspect repository status.
2. Inspect current frontend architecture.
3. Inspect package.json.
4. Inspect TypeScript configuration.
5. Inspect React Query configuration.
6. Inspect existing API services.
7. Inspect existing study logic.
8. Inspect existing OCR implementation.
9. Inspect existing JSON import/export.
10. Inspect shared schemas and types.

Run the existing validation commands:

```bash
pnpm lint
pnpm typecheck
pnpm build
```

If one of these commands does not exist, identify the appropriate equivalent from package.json.

Do not fix unrelated issues unless they block implementation.

Record the baseline before continuing.

---

# PHASE 1 — STUDY ENGINE

Refactor the web study engine into reusable answering modes.

Target architecture:

```text
StudySessionPage
    |
    +-- TypeInMode
    |
    +-- MultipleChoiceMode
    |
    +-- FlashcardMode
```

Create an appropriate structure under:

```text
frontend/src/features/study/
```

Do not duplicate study-session state management between modes.

The study session, card progression, answer submission, scoring, and API interaction should remain centralized.

## Type-In

Preserve the existing behavior.

Refactor it only where necessary so it works as a reusable study mode.

## Multiple Choice

Implement:

- A/B/C/D answers
- distractor generation using existing shared/domain logic where available
- selected state
- correct/incorrect feedback
- keyboard shortcuts
- accessible buttons
- responsive desktop UI

Keyboard support:

- `1` → A
- `2` → B
- `3` → C
- `4` → D

## Flashcards

Implement a web-native 3D flip card.

Use CSS 3D transforms or the project's existing animation library if already installed.

Required behavior:

- front/prompt
- flip
- back/answer
- correct
- wrong
- keyboard controls

Keyboard:

- `Space` → flip
- `1` → wrong
- `2` → correct

Do not introduce a new animation library unless there is a clear architectural reason.

---

# PHASE 2 — STUDY MODE SWITCHER

Add a study-mode switcher to the study header.

Example:

```text
[ Type In ] [ Quiz ] [ Cards ]
```

Switching modes must not create a new study session unnecessarily.

All modes should consume the same study-session state.

Do not duplicate API calls.

---

# PHASE 3 — FILE AND IMAGE OCR IMPORT

Replace the current simplistic import workflow with a modular OCR pipeline.

Create an architecture similar to:

```text
Import UI
   ↓
OcrImportPipeline
   ↓
OCR Service
   ↓
OCR Provider
```

The initial OCR provider may use the existing `tesseract.js` implementation if appropriate.

Do not allow UI components to directly depend on Tesseract.

Create a service abstraction so the OCR provider can later be replaced with a backend OCR service such as olmOCR without rewriting the UI.

Suggested structure:

```text
frontend/src/features/cards/import/
    FileImportDialog.tsx
    OcrReviewEditor.tsx
    OcrToolbar.tsx
    CardHighlightEditor.tsx
    OcrImportPipeline.ts

frontend/src/services/ocr/
    ocr-service.ts
    image-ocr.ts
    document-ocr.ts
    ocr-cleanup.ts
```

---

# SUPPORTED IMPORT TYPES

Support, where technically appropriate:

- PNG
- JPG
- JPEG
- WEBP
- PDF
- TXT

For PDFs:

1. Detect whether usable text already exists.
2. Extract text directly when possible.
3. Only OCR rendered pages when the PDF is image/scanned content.

Do not OCR text PDFs unnecessarily.

---

# OCR REVIEW

Never automatically create cards immediately after OCR.

The user must receive an editable review interface.

Required flow:

```text
Imported file
    ↓
OCR
    ↓
Raw extracted text
    ↓
Cleanup
    ↓
Editable review
```

The user must be able to:

- edit text
- delete text
- insert text
- undo/redo where practical
- insert symbols
- create cards from highlighted text

---

# SCIENCE / MATH SYMBOL TOOLBAR

Provide quick insertion for:

```text
•
—
→
±
²
³
°
≈
≠
≤
≥
℃
π
✓
```

The toolbar must insert symbols at the current cursor/selection.

Do not hard-code mobile-specific UI dimensions.

Use an appropriate desktop web toolbar.

---

# OCR CLEANUP

Reuse existing shared OCR cleanup logic where possible.

Prefer shared logic under:

```text
@saulado/shared
```

if it is genuinely platform-independent.

Do not duplicate the same OCR cleanup algorithm in mobile and frontend unnecessarily.

The pipeline should conceptually be:

```text
Raw OCR
↓
Whitespace normalization
↓
Line/paragraph reconstruction
↓
OCR cleanup
↓
User review
```

Never silently destroy the original OCR content.

---

# HIGHLIGHT-TO-CARD

Allow the user to highlight text inside the OCR editor.

Example source:

```text
Photosynthesis converts light energy into chemical energy.
```

User highlights:

```text
chemical energy
```

Generate:

```text
Photosynthesis converts light energy into [chemical energy].
```

Then:

```text
Question:
Photosynthesis converts light energy into ______.

Answer:
chemical energy
```

Support multiple highlighted answers from the same document.

Allow the user to:

- create card
- edit card
- remove card
- continue highlighting
- preview generated cards

Cards should not be saved until the user confirms.

---

# PHASE 4 — UNIVERSAL IMPORT / EXPORT

Port the behavioral functionality of:

```text
mobile/services/json-transfer.ts
```

into the web architecture.

Prefer moving platform-independent parsing logic into:

```text
@saulado/shared
```

when appropriate.

Support:

## Saulado JSON

Existing project format.

## Anki Cloze

Support:

```text
{{c1::answer}}
```

and:

```text
{{c1::answer::hint}}
```

## Markdown blank syntax

Example:

```text
The capital of France is [Paris].
```

## QA format

Question/answer cards.

## String arrays

Convert supported string arrays into cards according to existing Saulado behavior.

Do not silently accept malformed data.

Display validation errors to users.

---

# PHASE 5 — SET LIBRARY

Upgrade SetsPage.

Add:

- mastery percentage
- mastery progress bar
- card count
- due count
- search
- filter
- sort
- archived state
- JSON export
- share
- study action

Avoid unnecessary API requests.

Reuse existing React Query queries and query keys.

---

# PHASE 6 — ARCHIVED SETS

Add an Archived Sets section to Account.

Support:

- view archived sets
- restore
- permanently delete
- bulk selection
- bulk restore
- bulk delete

Respect existing backend/API semantics.

Do not invent new endpoints if existing endpoints already support these operations.

---

# PHASE 7 — SEED DECKS

Port:

```text
mobile/seed-decks.json
```

only after validating its structure.

Create a web Seed Decks UI.

Users should be able to import starter decks with one action.

Validate imported seed data through the same parser/schema system used for normal imports.

Avoid duplicating seed-deck parsing logic.

---

# PHASE 8 — DASHBOARD

Redesign the dashboard toward the mobile student portal experience while preserving web usability.

Add:

- time-aware greeting
- mascot/avatar area if existing assets are available
- streak
- daily goal
- due count
- active sets
- quick actions
- Quick Learn
- Import & OCR

Do NOT add a camera scanner.

Use:

```text
Import & OCR
```

for the web action.

Avoid expensive rerenders.

Use memoization only where profiling/architecture justifies it.

---

# PHASE 9 — QUICK LEARN

Implement a web Quick Learn modal/dialog.

Flow:

```text
Quick Learn
    ↓
Choose Set
    ↓
Choose Study Mode
    ↓
Start
```

Study modes:

- Type In
- Quiz
- Cards

Reuse the existing StudySession implementation.

Do not create a second study engine.

---

# PHASE 10 — WEB OFFLINE ARCHITECTURE

Implement this only after online functionality is stable.

Target:

```text
React UI
    ↓
Data Source
    ├── REST API
    └── IndexedDB
             ↓
        Mutation Queue
             ↓
        Sync Engine
             ↓
          Backend
```

Mirror the conceptual behavior of:

```text
mobile/lib/offline/
```

but use browser-appropriate storage.

Evaluate IndexedDB/Dexie or another existing project-approved solution before adding dependencies.

Implement:

- local persistence
- offline reads
- queued mutations
- mutation compaction
- temporary IDs
- ID remapping
- reconnect synchronization
- offline study sessions

Do not implement offline architecture prematurely.

---

# ARCHITECTURAL RULES

## Rule 1 — Reuse shared logic

Before writing new logic, search:

```text
shared/
mobile/
frontend/
```

for existing implementations.

Prefer:

```text
@saulado/shared
```

for domain logic.

---

## Rule 2 — Do not duplicate API clients

Inspect existing API service implementations.

Do not create another REST client.

Reuse or consolidate existing services.

---

## Rule 3 — Do not duplicate study logic

There must be one study-session state machine.

Modes are presentation/answering strategies.

---

## Rule 4 — Preserve existing behavior

Existing features must continue working.

Do not replace working functionality just for stylistic consistency.

---

## Rule 5 — No speculative dependencies

Before installing a package:

1. Check package.json.
2. Check whether the functionality already exists.
3. Prefer existing dependencies.
4. Only install a dependency when necessary.

---

# TESTING REQUIREMENTS

After EVERY phase:

```bash
pnpm lint
pnpm typecheck
pnpm build
```

Run relevant tests if available.

For UI functionality, manually verify:

## Study

- Type-In
- Multiple Choice
- Flashcards
- mode switching
- keyboard controls
- session completion

## OCR

- PNG
- JPG/JPEG
- WEBP
- PDF with selectable text
- scanned PDF
- TXT
- OCR review
- editing
- symbol insertion
- highlighting
- card creation
- multiple card creation

## Import

- Saulado JSON
- Anki cloze
- Markdown blanks
- QA
- malformed files

## Sets

- search
- filtering
- mastery
- export
- archive
- restore

## Account

- seed decks
- archived sets
- import/export

## Dashboard

- metrics
- Quick Learn
- Import & OCR

---

# GIT STRATEGY

Do not create one giant commit.

Create focused commits after each stable feature.

Suggested commits:

```text
feat(web): establish feature parity baseline

feat(study): add multiple choice mode

feat(study): add flashcard mode

feat(study): add study mode switcher

feat(ocr): add file and image import pipeline

feat(ocr): add OCR review editor

feat(ocr): add highlight to card workflow

feat(import): add universal import parser

feat(sets): add mastery and library filters

feat(account): add archived sets

feat(account): add seed decks

feat(dashboard): add student portal experience

feat(study): add quick learn

feat(offline): add web persistence
```

Do not commit generated build artifacts, node_modules, local databases, secrets, or environment files.

---

# IMPORTANT IMPLEMENTATION BEHAVIOR

Before modifying a file:

1. Read the current implementation.
2. Understand its dependencies.
3. Search for all consumers.
4. Determine whether the behavior is shared.
5. Make the smallest architectural change necessary.
6. Run validation.
7. Continue to the next phase only when stable.

Do not make speculative changes across the entire repository.

Do not rewrite unrelated components.

Do not modify backend APIs unless the current frontend requirements cannot be fulfilled using existing APIs.

If a backend change becomes necessary, stop and clearly explain:

- why it is necessary
- which endpoint/schema is missing
- the smallest compatible change

---

# FINAL DEFINITION OF DONE

The web application should eventually provide:

```text
Dashboard
    ├── Metrics
    ├── Quick Learn
    └── Import & OCR

Study
    ├── Type In
    ├── Multiple Choice
    └── Flashcards

Sets
    ├── Search
    ├── Filters
    ├── Mastery
    ├── Export
    ├── Share
    └── Archive

Import
    ├── JSON
    ├── Anki
    ├── Markdown
    ├── QA
    ├── Images
    ├── PDF
    └── TXT

OCR
    ├── Extract
    ├── Cleanup
    ├── Review
    ├── Edit
    ├── Symbols
    └── Highlight → Card

Account
    ├── Seed Decks
    ├── Import/Export
    └── Archived Sets

Offline
    ├── IndexedDB
    ├── Local Study
    ├── Mutation Queue
    └── Background Sync
```

Remember:

**Mobile camera/Lens scanning is explicitly excluded.**

The web replacement is:

**File/Image Import → OCR → Review → Highlight → Create Cards.**

Implement this system incrementally and keep the existing application working throughout the process.
