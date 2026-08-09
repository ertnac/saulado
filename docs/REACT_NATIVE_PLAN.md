# React Native — Implementation Plan

> Saulado as a native iOS and Android app, sharing the cloze engine and the API
> client with the web frontend.
>
> `IMPLEMENTATION_PLAN.md` §1.4 lists native apps as out of scope for v1. This
> pulls them forward, the same way `whimsical-swinging-rain.md` pulled OCR
> forward. Read that as a deliberate scope change, not an oversight.

---

## 1. Read this before starting

React Native is the most expensive of three ways to get Saulado onto a phone,
and the cost is concentrated in one place: **the highlight editor cannot come
with us.** `frontend/src/lib/selection.ts` is 298 lines whose entire job is
mapping DOM `(node, offset)` pairs to code-point offsets by walking a tree of
text nodes. React Native has no DOM, no `TreeWalker`, and no
`window.getSelection()`. That file is rewritten from scratch on a different
primitive, and `IMPLEMENTATION_PLAN.md` §1.2 puts the highlight editor at 30% of
total build effort for good reason.

Three options, measured against this repository as it stands:

|                                                             | Effort     | Stores | Keeps `selection.ts` | Keeps all 12,906 UI LOC |
| ----------------------------------------------------------- | ---------- | ------ | -------------------- | ----------------------- |
| **PWA** — manifest + service worker                         | ~1 day     | no     | yes                  | yes                     |
| **Capacitor** — native shell around the existing Vite build | ~3 days    | yes    | yes                  | yes                     |
| **React Native** — this plan                                | ~18.5 days | yes    | **no**               | **no**                  |

Capacitor is worth one paragraph of honest consideration because it is a WebView:
the highlight editor, the OCR importer, `tesseract.js`, the `ch`-unit blank
slots, and every Tailwind class keep working untouched, and it still gets native
camera, native push, native secure storage, and a listing in both stores. Camera
capture in particular is nearly free there — the Capacitor Camera plugin returns
a file, and the `tesseract.js` importer that already ships reads it with no new
code. If the goal is "Saulado on the App Store", that is the lazy path and it is
three days.

React Native earns its cost when the goal is native _feel_ — 60fps list
scrolling, platform-native text selection and keyboard behaviour, OS-level
integrations (widgets, share sheet, background sync). Those are real and a
WebView does not give them. **The rest of this document assumes that is the
goal.**

---

## 2. What is actually reusable

Measured, not estimated.

| Package                         | Non-test LOC | Reuse                                                   |
| ------------------------------- | ------------ | ------------------------------------------------------- |
| `shared/`                       | 3,771        | **100%, unchanged**                                     |
| `frontend/src/services`         | 577          | ~90% — two edits, see §4.2                              |
| `frontend/src/stores`           | 177          | 100% — zustand is platform-agnostic                     |
| `frontend/src/**/queries.ts`    | ~800         | ~95% — TanStack Query runs in RN                        |
| `frontend/src/hooks`            | 188          | `useDebouncedValue`, `useFormErrors` yes; `useTheme` no |
| `frontend/src/lib/selection.ts` | 298          | **0% — rewritten, see §4.1**                            |
| `frontend/src/components`       | 2,388        | 0% — DOM elements and Tailwind class strings            |
| `frontend/src/features`         | 9,014        | markup rewritten; the hooks inside mostly survive       |

`shared/` is the reason this is viable at all. The cloze engine
(`answers`, `codepoints`, `levenshtein`, `reanchor`, `render`, `validate`), the
SM-2 scheduler, `progress/series`, `search/snippet`, `study/day` and
`ocr/dewrap` are pure TypeScript with zero platform dependency. The hard,
correctness-critical half of this product ports for free.

One nice surprise on the backend: `hasAllowedOrigin`
(`backend/src/auth/cookies.ts:82`) already returns `true` when no `Origin`
header is present, which is exactly what a native client sends. The CSRF check
needs no change.

---

## 3. Stack

New workspace `mobile/`, added to `pnpm-workspace.yaml`. The backend and the web
frontend are untouched apart from the one auth change in §4.2.

| Concern | Choice                            | Why this one                                                                                                                                                                                                                            |
| ------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime | **Expo** (managed, with prebuild) | Bare RN means owning an Xcode project and a Gradle build. Nothing here needs that.                                                                                                                                                      |
| Routing | **Expo Router**                   | Two routes arrive as _email links_ — `/reset-password?token=` and `/account/email/confirm?token=`. Expo Router consumes the same path strings `APP_URL` already emits, so universal links need no hand-written linking map.             |
| Styling | **NativeWind v4**                 | `index.css` is HSL-triplet CSS variables read by `tailwind.config`. NativeWind supports variables and dark mode, so `bg-surface` and `text-muted-foreground` carry over rather than being re-derived into a second palette that drifts. |
| Data    | `@tanstack/react-query`           | Already a dependency and platform-agnostic. Wire `onlineManager` to NetInfo or the app retries forever behind a dead radio.                                                                                                             |
| State   | `zustand`                         | Already a dependency, works unchanged.                                                                                                                                                                                                  |
| Charts  | `react-native-svg`                | `GoalRing` and `TrendChart` are `<svg>`. `scale.ts` is pure and ports as-is.                                                                                                                                                            |
| Secrets | `expo-secure-store`               | Keychain / Android Keystore. **Not `AsyncStorage`** — that is unencrypted plaintext on disk.                                                                                                                                            |

Take whatever versions `npx create-expo-app@latest` installs and commit the
lockfile. Do not hand-pick an SDK number.

---

## 4. The four blockers

Everything else is ordinary porting. These four need a decision before code.

### 4.1 Text selection — the expensive one

`window.getSelection()` does not exist. RN's `TextInput` has `onSelectionChange`
reporting `{start, end}` in UTF-16 code units, which is _closer_ to what we want
than the DOM — no tree to walk, and `codeUnitToCodePoint` already lives in
`shared/`. But a read-only `TextInput` selects inconsistently across platforms,
and `<Text selectable>` gives copy/paste with no offset callback at all.

**Chosen: tap-to-select-word, no selection API.** Render the paragraph as word
`<Text>` children, each carrying the code-point start/end it occupies, computed
once from the paragraph string. Tap the first word, tap the last, span between
them. Deterministic, identical on both platforms, and unit-testable without a
renderer.

saulado-ux §3 pre-authorizes this: _"If free selection proves unworkable, fall
back to tap-to-select-word/phrase, which is arguably better on touch anyway."_
`snapToWordBoundaries` in `shared/` already defines where word edges are, so the
tokenizer is derived from the same rule the web path snaps with rather than a
second one.

What is lost: highlighting a prefix. "bio" out of "biology" is a legitimate
answer on web and will not be selectable on mobile. Accept it for v1 or add a
drag-handle refinement step later.

### 4.2 The refresh token — needs a backend change

Auth today is an in-memory access token plus an httpOnly refresh cookie scoped to
`/api/auth`, `SameSite=None`, `Secure`, with an Origin check standing in for the
CSRF protection `SameSite` gave up. In React Native that whole mechanism is
inapplicable: there is no browser, `credentials: 'include'` is ignored on
Android's OkHttp stack, cookie persistence across app restarts is not guaranteed
on either platform, and there is no cross-site forgery vector to defend against.

**This is a security-relevant change. Read it fully before implementing.**

Add a parallel path rather than relaxing the cookie:

- The client sends an explicit `X-Saulado-Client: native` header.
- On `/api/auth/login`, `/register`, and `/refresh`, when and only when that
  header is present, the refresh token is returned **in the JSON body** and no
  cookie is set.
- The mobile app stores it in `expo-secure-store` and sends it in the request
  body on refresh.
- The web flow is untouched: no header, cookie as today.

What makes this safe is already built. The server rotates the refresh token on
every use and treats a second presentation of a spent token as theft, revoking
the whole family (`backend/src/auth/session.ts`). A stolen token is usable once
before it burns itself and logs the attacker out along with the victim.

Do **not** skip the header gate and return the token unconditionally — that puts
a long-lived credential into a JSON body a browser cache, a proxy log, or a
service worker could retain.

### 4.3 `ch` units in the blank slot

`BlankSlot.tsx:55` reserves its box with `calc(${answerLength}ch + ${SLOT_PADDING})`.
React Native has no `ch`. This is not cosmetic — saulado-ux §1.1 and §1.2 are the
two non-negotiable rules in the product: a blank must not leak its answer's
length, and the paragraph must not reflow when the answer appears.

**Fix:** measure one character of the slot's font once at mount and multiply.
Must read `PixelRatio.getFontScale()` and re-measure when it changes, or an OS
font-size change desyncs the reserved box from its contents and reintroduces
exactly the layout shift §1.2 forbids. Use a monospace face for the slot so one
measurement is valid for every character.

Verify the same way the web does: screenshot before and after reveal, and confirm
every character outside the blank sits at the same pixel position.

### 4.4 OCR — three paths, one decision

`tesseract.js` cannot run in React Native: Hermes has no WASM, so the 4 MB WASM
build the web importer loads through a dynamic `import()` is unusable, and no
community port ships a Hermes-compatible engine. **But this is the one place
where native is strictly better than the web.** Three strategies:

1. **ML Kit / Vision native modules — the primary answer.** ML Kit Text
   Recognition (Android) and `VNRecognizeTextRequest` (iOS) are faster, more
   accurate, and more reliable on long paragraphs than Tesseract, they run
   fully offline, and they are free (ML Kit through Google Play Services, Vision
   in the OS). `@react-native-ml-kit/text-recognition` is the maintained Expo
   config-plugin path for both. Requires a **dev build** — Expo Go cannot load
   native modules.

2. **Expo's built-in `expo-camera` + `expo-image-picker`.** `expo-camera` alone
   gets you the live viewfinder and a photo; `expo-image-picker` gets gallery
   import. These are what give the camera the user asked for. They require a dev
   build for the camera itself — so they ride along with the ML Kit dev build.

3. **Server-side OCR — rejected.** Shipping the image to the backend and
   running an OCR service there means uploads, an external OCR provider, and an
   API call per photo — the exact "nothing is uploaded" decision the web OCR
   phase already made, reversed.

**The camera feature moves OCR into v1.** The old §4.4 deferred it out of the
first release. A camera-first capture flow is not a small deferred add-on — it is
the point of the feature — so it becomes Phase 6 and store submission slides to
Phase 7. The cost is one dev build (`npx expo prebuild`, then
`eas build --profile development`), roughly half a day, after which Expo Go is
gone for the rest of the project. Everything through Phase 5 runs in Expo Go, so
do the dev build once at the start of the OCR phase and never go back.

**Auto-capture: what "automatically converts it into text" actually costs.**
Recognition is not deterministic frame to frame — the same paragraph read thirty
times gives thirty slightly different strings. Without a stability rule the text
flickers and the flow fires on a half-read page, which is worse than a shutter
button. So the capture loop is: take a frame every ~800 ms, recognize it, and
accept only when two consecutive results are identical after `dewrap`. A short
"hold steady" line while it settles, and a manual shutter beside it for the pages
that never do.

The cheap version of that loop is `expo-camera`'s `takePictureAsync` on an
interval, feeding each file to the ML Kit `recognize(uri)`. That is a few dozen
lines and no new architecture. The expensive version is
`react-native-vision-camera` v4 with a text-recognition **frame processor**,
which gives true ~30 fps recognition in the viewfinder — but it pulls in
VisionCamera, Reanimated worklets, and a frame-processor plugin per platform.
Build the interval version; move to a frame processor only if 800 ms proves too
slow to feel live on a real phone. That is a measurement, not a guess.

The mobile OCR surface, in the shape the web importer already has:

1. **Camera screen** — live viewfinder, auto-capture per above, plus a manual
   shutter and a "pick from gallery" button (`expo-image-picker`) for photos
   already taken.
2. **Review** — the recognized page as de-wrapped prose, then the same two-stage
   highlight flow. `dewrap` and `normalizeParagraph` in `shared/` are reused
   untouched, because they are pure TypeScript.

One `recognize(uri: string): Promise<string>` behind it all, matching the
signature the web `frontend/src/features/cards/ocr.ts` already exposes, so the
only thing that differs between web and mobile is which engine fills it in.

---

## 5. Phases

Focused engineering days, converted honestly per `IMPLEMENTATION_PLAN.md` §1.5.

### Phase 0 — Scaffold · 0.5 day

`mobile/` workspace, added to `pnpm-workspace.yaml`, `@saulado/shared` as a
`workspace:*` dependency. Confirm Metro resolves the workspace symlink and that
`shared/dist` is picked up — this is the one setup step that reliably breaks in a
pnpm monorepo, so prove it with a throwaway screen importing `sm2` before
building anything else.

Deliverable: a blank app that imports and calls one shared function.

### Phase 1 — API client and auth foundation · 2 days

The backend change in §4.2, plus `services/` ported. `services/config.ts` moves
from `import.meta.env` to `process.env.EXPO_PUBLIC_*`. `services/api.ts` drops
`credentials: 'include'`, adds the `X-Saulado-Client` header, and swaps the
in-memory-token-plus-cookie model for in-memory access token plus SecureStore
refresh token. `stores/auth.ts` ports unchanged; the `onSessionChange` bridge
already exists and is exactly the seam this needs.

Deliverable: log in from the phone against the deployed API, and survive an app
restart still signed in.

### Phase 2 — Navigation and auth screens · 2 days

Expo Router file tree mirroring the 14 existing routes, with the `ProtectedRoute`
/ `AnonymousRoute` split expressed as route groups. Login, register, forgot
password, reset password, confirm email change. Universal links configured for
the two token-bearing email routes and tested from a real email, not a simulator
paste.

The theme port lands here: `useTheme`'s `localStorage` becomes AsyncStorage,
`matchMedia` becomes `useColorScheme()`, and the
`document.documentElement.classList.toggle('dark')` line becomes NativeWind's
`colorScheme.set()`.

Deliverable: full auth flow, both themes, on both platforms.

### Phase 3 — Study mode · 3 days

Do this before the editor. saulado-ux §2 puts 95% of user time on this screen,
and it is the one screen where a native app should feel obviously better than the
web one.

`useStudySession` (161 lines) and `resume.ts` port with their logic intact —
`resume.ts` has four web-API references to swap for AsyncStorage. `BlankSlot`
needs §4.3. The mobile input attributes saulado-ux §2 calls a rage-quit bug if
omitted map to RN props: `autoCapitalize="none"`, `autoCorrect={false}`,
`spellCheck={false}`, `returnKeyType="next"`. iOS autocorrect rewriting
"chloroplast" and then marking it wrong is the single worst thing this app can do.

Keyboard-aware layout via `KeyboardAvoidingView` — saulado-ux §7: the submit
button must never sit behind the keyboard.

Deliverable: a full study session, offline-tolerant queue, zero layout shift on
reveal, verified by pixel diff.

### Phase 4 — Sets, cards, and the highlight editor · 4 days

The largest phase, and §4.1 is why. Sets list, nested set tree, card list, then
the editor: compose mode is an ordinary `TextInput`; highlight mode is the
tap-to-select-word surface.

`useCardDraft` (193 lines) and `useCardDraftPersistence` (127 lines) port with
their logic intact — the second has five web-API references, all
`localStorage`, all mechanical. `toPieces` in `HighlightSurface.tsx` is pure and
moves across unchanged; only the markup around it is rewritten.

Keep the two-layer structure the web editor has: a pure offsets module with its
own tests, and a component that renders. That separation is what made the web
version testable in jsdom without the editor, and it is worth more here where
there is no jsdom.

Deliverable: create a set, write a card, place blanks, save, study it.

### Phase 5 — Dashboard, progress, search, settings · 2 days

`queries.ts` files port nearly unchanged. Charts become `react-native-svg` with
`scale.ts` untouched. `Heatmap` and `BarChart` are `<View>` grids and are
arguably easier here than in CSS. The mascot sprite sheet does **not** port —
`background-position` stepping has no RN equivalent; use a cropped-view frame
stepper or a Lottie/animated-image export, and honour `AccessibilityInfo.isReduceMotionEnabled()`
the way `index.css` honours `prefers-reduced-motion`.

`CommandPalette` and `useSearchShortcut` are keyboard-driven and should be
dropped rather than translated — a `Ctrl+K` palette on a phone is a desktop idiom
with no touch equivalent. A search tab covers the same need.

Deliverable: feature parity with web for everything except image import.

### Phase 6 — Camera capture and native OCR · 3 days

Per §4.4, and the first phase that needs a dev build. Half a day of that budget
is the dev build itself; do it first and confirm a native module loads before
writing any of the feature.

`@react-native-ml-kit/text-recognition` behind one
`recognize(uri): Promise<string>` — the same signature the web `ocr.ts` exposes,
so `dewrap`, `normalizeParagraph`, and both highlight stages are shared code
rather than a second implementation. On iOS the plugin routes to Vision, on
Android to ML Kit; neither needs a model download and neither needs network.

Then the camera screen: viewfinder, the ~800 ms auto-capture loop with the
two-identical-results stability rule, a manual shutter, and a gallery picker.
Camera permission is requested at the point of use with a plain-language reason,
not at launch — a cold permission prompt on first open is the most common reason
this feature gets denied and then never retried. `NSCameraUsageDescription` and
`NSPhotoLibraryUsageDescription` strings go in `app.json`; Apple rejects a build
that reads the camera without them.

Then the review screen, which is the existing two-stage flow against recognized
text instead of pasted text.

Deliverable: point the phone at a page of notes, watch the text settle, highlight
questions, highlight blanks, save cards. Nothing leaves the device.

### Phase 7 — Store submission · 2 days

App icons and splash from the existing brand marks in `frontend/public/`. EAS
Build and EAS Submit. Apple requires a privacy manifest and an account-deletion
path — the latter already exists as an API route, so it needs a screen, not a
feature. Android needs a data-safety declaration. Budget two days of review
latency on top of the two days of work; first submissions are usually rejected
for something procedural.

Deliverable: TestFlight and Play internal testing builds.

**Total: 18.5 days to a submitted v1, camera OCR included.**

---

## 6. What is deliberately not in this plan

- **Sharing UI components between web and mobile.** React Native Web plus a
  unified component library (Tamagui, gluestack) is the tempting answer and it
  means rewriting the working web frontend to serve the mobile one. Two UI
  layers over one shared core is the cheaper shape here.
- **Offline-first / local sync.** `IMPLEMENTATION_PLAN.md` §1.3 item 4 already
  frames this as its own future phase. TanStack Query's cache persisted to
  AsyncStorage covers read-only offline; a real write queue with conflict
  resolution is a project, not a phase.
- **Push notifications.** §1.3 item 2 ships the settings toggle without delivery.
  Native push is the first genuinely new capability worth adding after v1, but it
  needs the server-side delivery that phase deferred.
- **Widgets, share-sheet import, Apple Watch.** Real reasons to be native, none
  of them v1.
- **Detached / bare workflow.** Nothing here needs it. Expo prebuild plus a dev
  build covers the OCR native module in Phase 6.
- **A frame-processor camera.** `react-native-vision-camera` with a
  text-recognition worklet is the ~30 fps version of Phase 6's capture loop. The
  interval version ships first; this is the upgrade if 800 ms does not feel live
  on a real device (§4.4).
- **Cloud OCR.** Google Cloud Vision, Textract, and Azure all read hard images
  better than on-device engines. All three also upload the photo, need a backend
  proxy because an API key cannot ship in an app binary, cost per request, and
  need network. On-device is worse at handwriting and better at everything that
  matters here.
- **Document-boundary detection and perspective correction.** ML Kit's document
  scanner and iOS `VNDocumentCameraViewController` both do it, both are separate
  APIs from text recognition, and neither is needed to read a flat page held
  square. Add it if real use shows people photographing pages at an angle.
- **Replacing the web app.** It stays. The API serves both.

---

## 7. Verification

Automated, per phase:

```bash
# repo root — shared must emit before mobile can typecheck
pnpm --filter @saulado/shared build
pnpm --filter @saulado/shared test

# mobile/
npx tsc --noEmit --pretty false
npx eslint .
npx vitest run          # offsets, tokenizer, and ported hooks
```

By hand, and none of this is optional:

1. **Real devices, both platforms.** saulado-ux §3 and §7 both say emulators lie
   about selection and file-input behaviour. They lie about keyboard avoidance
   too.
2. **The offset invariant.** Highlight three spans out of order, confirm badges
   read 1, 2, 3 in reading order, and confirm the saved answer text matches what
   was tapped. A tokenizer off by one code point corrupts stored data — this is
   the one bug class that survives to the database.
3. **Zero layout shift on reveal** (§4.3), pixel-diffed, then repeated after
   changing the OS font size.
4. **Autocorrect off.** Type "chloroplast" into a blank on real iOS and confirm
   it is neither rewritten nor marked wrong.
5. **Token rotation.** Log in on the phone, force-quit, reopen — still signed in.
   Then log in on the phone _and_ the web simultaneously and confirm neither
   session revokes the other's family.
6. **Reduce Motion** on at OS level: the mascot and any transitions settle on a
   resting frame rather than freezing mid-animation.
7. **320 px equivalent.** An iPhone SE in the largest accessibility text size is
   the real floor, and it is tighter than 320 px on web.
8. **Auto-capture settles.** Point the camera at a real page of notes and hold
   it. The text must stop changing and hand off on its own — if it keeps
   re-firing, the two-identical-results rule is comparing raw output instead of
   de-wrapped output. Then do the opposite: point it at a moving page and confirm
   the manual shutter is still reachable while it is trying.
9. **Camera permission, both answers.** Deny it the first time. The screen must
   explain and offer a route to Settings, not sit on a black rectangle. Then
   allow it and confirm no restart is needed. Test denial on iOS specifically —
   the prompt appears once per install, so use a fresh install.
10. **A page it cannot read.** Handwriting, a photo at a steep angle, and a blank
    wall. Each must land on "no text found" with a way out, never a hang and
    never an empty highlight surface.
11. **Airplane mode.** The whole capture flow must work with no network — that is
    the point of on-device recognition. Only saving the finished cards should
    fail, and it should fail as a normal offline error.
