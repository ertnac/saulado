# Phase 1.4 — Mobile Editor Spike

## What this is

A throwaway prototype to answer one question: can you accurately select text on a phone using the native browser selection API, or does that fail badly enough that we need to switch to tap-to-select-whole-words before Phase 3?

The answer decides whether Phase 3 builds the highlight editor directly against the Selection API (Option A) or pivots to word-level tap targets (Option C). Option B (ProseMirror/Slate) is rejected — see `docs/adr/0001-editor.md` for why.

## How to test it

1. **Start the dev server with LAN access:**

   ```bash
   cd frontend
   pnpm dev:lan
   ```

2. **Find your local IP:**

   ```bash
   # Windows
   ipconfig | findstr IPv4

   # Mac/Linux
   ifconfig | grep "inet " | grep -v 127.0.0.1
   ```

3. **Open on your phone:**
   - Make sure your phone is on the same WiFi network as your dev machine
   - Open `http://<your-ip>:5173/#spike` (note the `#spike` hash)
   - Example: `http://192.168.1.42:5173/#spike`

4. **Run the 8 tests listed at the bottom of the spike page**

5. **Record the results in section 5 of `docs/adr/0001-editor.md`**

6. **Stop the server when you're done.** `dev:lan` binds to `0.0.0.0`, which
   exposes both the dev server and its `/api` proxy to everyone on your network.
   That is fine for a few minutes on home WiFi and not fine on a café network.
   The default `pnpm dev` stays bound to localhost, which is why LAN access is a
   separate opt-in script rather than the config default.

## What to test

The spike has three sample paragraphs you can load with one tap:

- **CPU / RAM** — the basic happy path
- **Unicode** — emoji and CJK, where naive UTF-16 offsets break
- **Repeated words** — where the engine must pick the right occurrence

For each sample:

1. Tap-drag to select a word or phrase
2. Confirm the yellow bar appears immediately when you lift your finger
3. Tap "Make this a blank"
4. Check that the bracketed offsets `[start–end]` land on the right characters
5. Try editing text before a blank — does the blank follow its word, or drift?
6. Try deleting a blanked word — is it reported as orphaned, or does it vanish?

## What happens next

- **Tests 1–5 pass** → confirm Option A, delete `frontend/src/spike/`, update ADR status to Accepted
- **Test 3 fails (handle-dragging is fiddly)** → switch to Option C before Phase 3
- **Tests 6–8 fail** → bug in `shared/src/cloze/`, not the editor — fix the engine first

## Files involved

- `frontend/src/spike/TextHighlighter.tsx` — the prototype
- `frontend/src/main.tsx` — routes `#spike` to it
- `docs/adr/0001-editor.md` — the decision record (section 5 is the gate)
- This file

Delete all four after the ADR is finalized.
