# Image → Cards (OCR Import)

Paste an image of text, get a reviewed list of paragraphs, turn each into a cloze card
with the existing highlight editor.

---

## 0. Context before starting

**This pulls a Post-MVP feature forward.** `IMPLEMENTATION_PLAN.md` §1.4 lists OCR as
explicitly out of scope for v1, and the Post-MVP table puts it in phase 12 ("highest infra
cost, highest user-perceived magic"). That is not a reason not to build it, but it is the
reason the risk section below is longer than usual — nothing in the current architecture
was designed with an upload path in mind.

**The good news: most of this feature already exists.** OCR produces _text_. The pipeline
from text → paragraph → highlights → card is already built and tested:

| Already built                                     | Where                                              |
| ------------------------------------------------- | -------------------------------------------------- |
| Paragraph normalization (NFC, CRLF, trailing)     | `shared/src/cloze/answers.ts` `normalizeParagraph` |
| Draft state, commit/re-anchor boundary            | `frontend/src/features/cards/useCardDraft.ts`      |
| Highlight surface, selection → code-point offsets | `HighlightSurface.tsx`, `lib/selection.ts`         |
| Live cloze preview                                | `ClozePreview.tsx`                                 |
| Create card, tags, drafts                         | `CardComposer.tsx`, `POST /api/sets/:setId/cards`  |

So the **only** genuinely new work is: get an image to the server, turn it into text, split
that text into candidate paragraphs, and let the user choose. Everything downstream is
plumbing into `useCardDraft`.

**Decisions taken** (asked and answered, do not re-litigate):

1. OCR runs on the **backend**, as a new endpoint.
2. **English only** at launch.
3. OCR output is **segmented into paragraphs, and the user picks** which become cards.

---

## 1. The constraint that shapes everything

The API runs on Render's **free tier: 512 MB RAM, single instance, spins down when idle**
(`render.yaml`). Tesseract's WASM core plus the English traineddata plus a decoded bitmap
is roughly 100–200 MB of transient allocation per recognition.

Two failure modes follow, and both are silent until production:

**1. OOM.** Node + Prisma's client already sit at ~120–180 MB resident. Two concurrent OCR
requests will exceed the cap and Render restarts the container — killing any in-flight
study session with it.

**2. Event-loop starvation.** `healthCheckPath: /api/ready` gates the deploy and Render
polls it continuously. Tesseract in the main thread blocks the loop for 2–10s per image,
during which `/api/ready` cannot respond. Render reads that as an unhealthy instance and
restarts it. **This turns a slow OCR request into a service outage**, which is why the
worker thread below is not optional.

Mitigations are built into the design, not bolted on:

| Risk                                  | Mitigation                                                             |
| ------------------------------------- | ---------------------------------------------------------------------- |
| Event loop blocked                    | OCR runs in a `worker_threads` worker, never the request thread        |
| OOM under concurrency                 | Global concurrency gate of **1**; excess returns `503` + `Retry-After` |
| Unbounded memory / decompression bomb | Hard caps on bytes **and** pixel dimensions, enforced before decode    |
| Cold-start cost                       | Worker spawned lazily on first OCR, torn down after 60s idle           |
| Traineddata download at runtime       | Baked into the image at build time, `langPath` pointed at it           |

**Checkpoint at the end of Phase 2:** measure peak RSS during OCR on a 512 MB container.
If it exceeds ~400 MB, stop and either move OCR to the browser or upgrade the Render plan.
Do not proceed to the UI phases on a backend that cannot hold.

---

## 2. Architecture

```
Browser                              Backend (Express)
───────                              ─────────────────
paste / drop / pick image
  ↓  client-side downscale
     (canvas → JPEG, ≤2000px)
  ↓  multipart POST
                    ──────────────→  POST /api/ocr
                                       requireAuth
                                       ocrLimiter (rate limit)
                                       multer memoryStorage (caps)
                                       ↓ sniff magic bytes
                                       ↓ concurrency gate (max 1)
                                       ↓ postMessage → worker_threads
                                          ┌──────────────────────┐
                                          │ ocr.worker.ts        │
                                          │  tesseract.js        │
                                          │  eng.traineddata     │
                                          └──────────────────────┘
                                       ↓ raw text
                                       ↓ segmentParagraphs()  ← shared/
                    ←──────────────    { paragraphs: [...] }
  ↓
ExtractedParagraphs dialog
  (checkboxes, edit, reorder)
  ↓  user confirms
ImportQueue → CardComposer (existing)
  card 1 of N → highlight → Save → card 2 of N …
                    ──────────────→  POST /api/sets/:setId/cards  (unchanged)
```

The image is **never persisted**. It lives in memory for the duration of the request and is
dropped. No storage bucket, no cleanup job, no new GDPR surface.

---

## 3. Phases

Ordered so the risky, load-bearing part is proven before any UI is built on top of it.

### Phase 1 — Text segmentation (shared, pure) · 0.5 day

Pure functions first: no I/O, fully testable, and they define the contract the UI consumes.

**New: `shared/src/ocr/segment.ts`**

```ts
/** A candidate paragraph extracted from OCR text. */
export interface ExtractedParagraph {
  /** Stable within one extraction — the client uses it as a React key. */
  id: string
  text: string
  /** Below this, the paragraph is likely a page number or caption. Drives default-unchecked. */
  confidence: 'likely' | 'unlikely'
}

export function segmentParagraphs(raw: string): ExtractedParagraph[]
export function dewrapParagraph(text: string): string
```

`segmentParagraphs` splits on blank lines, then per block:

- **De-wrap hard line breaks.** OCR of a printed page emits a newline at every _visual_
  line. Left as-is, the paragraph reads as a column of fragments and — more importantly —
  the newlines are code points that every answer offset has to index around. Join lines
  that don't end in sentence-final punctuation.
- **Rejoin hyphenated words** split across lines (`chloro-\nplast` → `chloroplast`).
- **Mark low-value blocks `unlikely`**: under ~40 code points, no sentence-ending
  punctuation, mostly digits, or matching a page-number/figure-caption shape. These render
  **unchecked by default** rather than being dropped — the user can still tick them.
- **Normalize** each with the existing `normalizeParagraph`, so what the user sees in the
  dialog is byte-identical to what `useCardDraft` will commit. Any divergence here is an
  offset bug waiting to happen.
- **Drop** blocks that are empty after normalization, and truncate any block over
  `PARAGRAPH_MAX_CODE_POINTS` (5,000) rather than letting the composer reject it later.

Export from `shared/src/ocr/index.ts`; re-export types through the existing barrel.

**Tests** (`segment.test.ts`) — this is where correctness is cheapest to establish:
multi-paragraph splitting; hard-wrap de-wrapping; hyphen rejoining; page numbers and figure
captions marked `unlikely`; CJK and accented text surviving NFC; a 6,000-code-point block
being truncated; empty and whitespace-only input returning `[]`.

---

### Phase 2 — OCR service & endpoint · 2 days

**The load-bearing phase.** Do not start Phase 3 until the memory checkpoint passes.

**Dependencies** (backend only — the frontend bundle is untouched, protecting the 180 KB budget):

```
pnpm --filter @saulado/backend add tesseract.js multer
pnpm --filter @saulado/backend add -D @types/multer
```

Pin `multer` to a current release — 1.x has known advisories. Verify at install time.

**New: `backend/src/ocr/ocr.worker.ts`**

A `worker_threads` worker owning the Tesseract lifecycle. Receives a buffer, returns text.
One long-lived Tesseract worker inside it (creation is the expensive part — do not create
one per request), torn down on idle.

**New: `backend/src/ocr/service.ts`**

- Lazy worker spawn on first request; terminate after **60s idle** so a spun-down-then-woken
  instance isn't holding OCR memory it isn't using.
- **Concurrency gate of 1.** Requests beyond it get `503` with `Retry-After`, not a queue —
  a queue on a 512 MB box just defers the OOM.
- **Per-request timeout (~20s)**, after which the worker is killed and respawned. A wedged
  Tesseract worker must not wedge the endpoint permanently.
- Translates worker failures into `ApiError`, so `app.ts`'s existing error middleware
  renders them consistently.

**New: `backend/src/routes/ocr.ts`** — `POST /api/ocr`

Middleware order matters; each layer exists to stop something reaching the expensive one:

1. `requireAuth` — never OCR for an anonymous caller.
2. `ocrLimiter` — new limiter in `http/rate-limit.ts`, ~10/hour/user. OCR is the most
   expensive endpoint in the app by an order of magnitude; the existing limiters are all
   IP-keyed auth guards and none of them fit.
3. `multer({ storage: memoryStorage, limits: { fileSize: 8MB, files: 1 } })` — memory
   storage deliberately: no temp files means no temp-file cleanup and no disk on a
   free-tier container.
4. **Sniff magic bytes**, don't trust `Content-Type` or the filename. Accept PNG/JPEG/WebP.
5. **Reject oversized dimensions before decoding** (~40 MP). An 8 MB PNG can decode to
   gigabytes — the byte cap alone does not protect memory.
6. Run OCR → `segmentParagraphs` → respond.

`express.json({ limit: '1mb' })` in `app.ts` does not apply to multipart, so it needs no
change — but confirm the route is mounted _before_ the 404 handler.

**Response** (`shared/src/ocr/types.ts`):

```ts
interface OcrResponse {
  paragraphs: ExtractedParagraph[]
  /** 0–100 mean word confidence. Drives the "this scan looks poor" hint. */
  meanConfidence: number
}
```

**Dockerfile** — bake `eng.traineddata` into the runtime stage and set `langPath`/`cachePath`
to it. Downloading it at first request means the first OCR of every cold start is slow, and
fails outright if the CDN is unreachable. Costs ~15 MB of image size.

**Tests** (`ocr.test.ts`, Supertest): unauthenticated → 401; oversized file → 413;
`.txt` renamed `.png` → 400; a real fixture PNG → 200 with expected paragraphs; second
concurrent request → 503. Mock the OCR service in route tests — do not run real Tesseract
in CI.

**⛔ Memory checkpoint.** Build the image, run it constrained to 512 MB, OCR a full-page
scan, watch peak RSS. Over ~400 MB → stop and reconsider (browser-side OCR, or a paid plan).

---

### Phase 3 — Upload & extraction UI · 2 days

Lazy-loaded (`React.lazy`) so nothing here touches the initial bundle.

**`ImageDropzone.tsx`** — three input paths, one handler:

- **Paste** (`onPaste` reading `clipboardData.files`) — the headline interaction.
- **Drag & drop**, with a visible drop target.
- **File picker** — the keyboard-accessible path, and the only one that works on most
  mobile browsers. A button, not just a hidden input.

**Downscale client-side before upload** (canvas → JPEG, longest edge ≤ 2000px). A modern
phone photo is 4–12 MB and 12 MP; downscaling cuts upload time on 4G _and_ cuts peak server
memory, which is the actual constraint. Note that OCR accuracy _drops_ below ~1000px, so
this is a floor as well as a ceiling — don't over-shrink.

**`ExtractedParagraphs.tsx`** — the review dialog:

- Checkbox per paragraph; `unlikely` ones start unchecked.
- Each paragraph text is **editable inline** — OCR always gets something wrong, and fixing
  it here is much cheaper than fixing it per-card later.
- Live count: "2 of 3 selected".
- Low `meanConfidence` → a non-blocking hint suggesting a better-lit or straighter photo.

**All four states, per the UX skill §5:** loading (determinate progress — OCR takes seconds,
a spinner reads as frozen), empty ("no text found in that image" + what to try), error
(distinguish 413 / 503 / 400, each with the actual next step), populated.

**Accessibility** — non-negotiable, and easy to get wrong on a dropzone:

- The file picker button is reachable and operable by keyboard; the dropzone is not a
  keyboard trap.
- Progress via `aria-live="polite"`, not assertive — it must not interrupt.
- Dialog focus-trapped, `Esc` closes, focus restored to the trigger on close.
- Touch targets ≥ 44px; dialog usable at 320px.

---

### Phase 4 — Import queue → composer · 1.5 days

Bridges confirmed paragraphs into the existing composer. **Do not fork `CardComposer`** —
it carries the draft-persistence, focus and one-composer-at-a-time invariants documented in
its header, and a parallel copy will drift.

**`useImportQueue.ts`** — holds the confirmed paragraphs, the current index, and
`advance()`.

**Wiring** — `CardComposer` gains one optional prop:

```ts
interface CardComposerProps {
  setId: string
  cardId?: string
  onClose: () => void
  /** Seeds a new-card composer from an OCR import. */
  importQueue?: { paragraph: string; index: number; total: number; onAdvance: () => void }
}
```

Three things this must respect, all of which the composer already gets right and which a
careless integration breaks:

1. **Seed through `useCardDraft`'s initializer**, exactly as the restored-draft path does —
   not a `reset()` in an effect. The composer's own header explains why: a reset landing
   after mount races the user's typing and discards it.
2. **Key the composer by queue index**, mirroring the existing `key={card.data.card.id}`, so
   advancing remounts the draft instead of leaving card N's highlights on card N+1.
3. **Suppress `localStorage` draft persistence during an import.** The scope key is
   `set:${setId}:new` for every new card, so N queued cards would all write to one key and
   overwrite each other. Pass `enabled: false`, as the editing path already does.

On save, advance; on the last card, close the queue and show "3 cards added".
"Skip this one" must exist — OCR will occasionally produce a paragraph not worth keeping,
and the user shouldn't have to abandon the whole import to drop it.

**Entry point:** an "Import from image" button beside "Add a card" on `SetDetailPage`.

---

### Phase 5 — Hardening · 1 day

- **Real-device test.** Paste on desktop Safari/Chrome/Firefox; camera-roll upload on real
  iOS Safari and real Android Chrome. Per the UX skill: emulators lie about selection and
  file input behaviour.
- **Bundle check** — confirm the OCR route is genuinely split out and the initial bundle is
  still under 180 KB (`rollup-plugin-visualizer`).
- **axe-core** pass on the dropzone and dialog.
- **Adversarial inputs:** 1×1 px image, all-white image, photo of handwriting, rotated 90°,
  a PDF renamed `.png`, a 40 MP photo. None may crash the container; each must produce a
  comprehensible message.
- **Load behaviour:** two users OCR-ing simultaneously → one gets a clean 503, and the
  study path stays responsive throughout. This is the test that proves the event-loop
  mitigation works.

---

## 4. Estimate

| Phase                      | Days  |
| -------------------------- | ----- |
| 1 · Segmentation (shared)  | 0.5   |
| 2 · OCR service & endpoint | 2     |
| 3 · Upload & extraction UI | 2     |
| 4 · Import queue           | 1.5   |
| 5 · Hardening              | 1     |
| **Total**                  | **7** |

---

## 5. Explicitly not in this plan

- **Auto-suggesting which words to blank.** That is Post-MVP phase 10 (AI), and the plan is
  emphatic that suggestions require user confirmation and must never auto-create cards.
  The user highlights, exactly as they do today.
- **Storing the source image.** Nothing is persisted.
- **PDF import.** Same Post-MVP bucket, but a different problem — PDFs have a text layer
  and want extraction, not OCR.
- **Non-English languages.** Deliberately deferred; `langPath` makes adding them a
  configuration change plus a traineddata file.
- **Layout reconstruction** (tables, columns, equations). Tesseract handles these poorly and
  the user is better served editing the text in the review dialog.

---

## 6. Files

**New — shared**
`shared/src/ocr/segment.ts`, `segment.test.ts`, `types.ts`, `index.ts`

**New — backend**
`backend/src/ocr/service.ts`, `ocr.worker.ts`, `backend/src/routes/ocr.ts`, `ocr.schemas.ts`, `ocr.test.ts`

**New — frontend**
`frontend/src/features/cards/ImageDropzone.tsx`, `ExtractedParagraphs.tsx`, `useImportQueue.ts`, `services/ocr.ts`, plus tests

**Modified**
`backend/src/app.ts` (mount route) · `backend/src/http/rate-limit.ts` (`ocrLimiter`) ·
`backend/Dockerfile` (traineddata) · `backend/package.json` (deps) ·
`frontend/src/features/cards/CardComposer.tsx` (optional `importQueue` prop) ·
`SetDetailPage.tsx` (entry point) · `shared/src/index.ts` (barrel)
