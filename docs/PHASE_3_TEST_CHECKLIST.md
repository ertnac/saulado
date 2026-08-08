# Phase 3 — Manual test checklist

> Every row is one action and the **one correct result**. If the result differs, that
> row failed — note it and keep going, later rows still tell you something.
>
> Companion to [PHASE_3.md](./PHASE_3.md), which explains _why_ each check exists.

**Legend:** ✅ correct · ❌ a real bug · ⚠️ needs a phone (Part K)

---

## Part 0 — Get it running

| #   | Do this                       | Correct result                                                                                                          |
| --- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 0.1 | `pnpm install`                | Finishes, and `postinstall` builds `shared` — `shared/dist/` exists                                                     |
| 0.2 | `pnpm db:up`                  | `docker compose up -d` starts Postgres. `docker ps` shows it on **5432**                                                |
| 0.3 | Check `backend/.env` exists   | It does. If not: copy `backend/.env.example` to `backend/.env` — the defaults work as-is                                |
| 0.4 | `pnpm db:migrate`             | Migrations apply cleanly, including `…_sets_cards_answers`. No prompt to reset the database                             |
| 0.5 | `pnpm dev`                    | Two servers: frontend **http://localhost:5173**, backend **http://localhost:3000**                                      |
| 0.6 | Open http://localhost:5173    | Redirects to `/login` — you are not signed in yet                                                                       |
| 0.7 | Register at `/register`       | Lands on the dashboard. **There is no seed script** despite what CLAUDE.md says — a fresh account is the intended start |
| 0.8 | Click **Sets** in the top nav | `/sets`, heading **"Your sets"**, and the empty state **"No sets yet"**                                                 |

> **If Vite refuses to start on 5173**, kill whatever holds the port rather than
> letting it pick 5174. `strictPort` is deliberate: the backend's `CORS_ORIGIN`
> names 5173, and on 5174 login works but every token refresh silently 401s.

---

## Part A — The automated gate

Run from the repo root. **Do not pipe these through `tail`** — the exit code you
see becomes `tail`'s, so a failing command reports success.

| #   | Command                                             | Correct result                                                                                                                      |
| --- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| A.1 | `pnpm --filter @saulado/shared build`               | Exit 0, no errors. **Run this first** — the frontend typechecks against `shared/dist`, so skipping it checks the _previous_ version |
| A.2 | `pnpm --filter @saulado/shared test -- --run`       | **205 passed**, 11 files                                                                                                            |
| A.3 | `pnpm --filter @saulado/frontend exec tsc --noEmit` | **No output at all.** Any output is a failure                                                                                       |
| A.4 | `pnpm --filter @saulado/backend exec tsc --noEmit`  | **No output at all**                                                                                                                |
| A.5 | `pnpm --filter @saulado/frontend test -- --run`     | **143 passed**, 9 files                                                                                                             |
| A.6 | `pnpm --filter @saulado/backend test`               | **143 passed**, 9 files. Needs Postgres up (step 0.2)                                                                               |
| A.7 | `pnpm lint`                                         | No output, exit 0                                                                                                                   |
| A.8 | `pnpm format:check`                                 | `All matched files use Prettier code style!`                                                                                        |
| A.9 | `pnpm --filter @saulado/frontend build`             | Builds, ~**309 kB** (~97 kB gzip), no warnings about unresolved imports                                                             |

**Total: 491 tests.** A lower number is not automatically wrong — but if a _file_
count dropped, tests were deleted rather than fixed.

Shortcut for A.3–A.7: `pnpm verify` runs typecheck, lint and tests together.

---

## Part B — The library (`/sets`)

| #    | Do this                                                  | Correct result                                                                                                                                              |
| ---- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B.1  | Click **New set**                                        | A dialog opens with **Title**, Description, and a colour row. **Create set** is **disabled**                                                                |
| B.2  | Type `Hardware` in Title                                 | **Create set** becomes enabled                                                                                                                              |
| B.3  | Leave Description empty, click **Create set**            | Dialog closes; a row appears reading **Hardware** and **0 cards**                                                                                           |
| B.4  | Create a second set `Biology`, description `Cell basics` | Two rows. Biology shows its description under the title                                                                                                     |
| B.5  | Click **Archived**                                       | The list goes to **"Nothing archived"**. There is **no** "Create your first set" button here — creating one would not appear in the list you are looking at |
| B.6  | Click **Active**                                         | Both sets are back                                                                                                                                          |
| B.7  | On Hardware, click **Archive**                           | It disappears from Active. **The button on that row read "Archive", not "Restore"**                                                                         |
| B.8  | Click **Archived**                                       | Hardware is here, and its button now reads **Restore**                                                                                                      |
| B.9  | Click **Restore**                                        | It leaves the archive. Back on **Active** it is present again                                                                                               |
| B.10 | Click **Edit** on Biology, change the title, **Save**    | The row shows the new title immediately — no page reload needed                                                                                             |
| B.11 | Click **Delete** on Biology                              | A confirm names **"Biology"**, states its card count, and offers **"archive it instead"**                                                                   |
| B.12 | Click **Cancel**                                         | Nothing is deleted. Biology is still listed                                                                                                                 |
| B.13 | **Delete** → **Delete set**                              | The row goes                                                                                                                                                |

> **B.7 + B.9 together are the real check.** Both buttons are the same control
> reading `archivedAt`. If Restore silently re-archives, it looks like a dead
> button and you would blame the network.

---

## Part C — Inside a set (`/sets/:id`)

Open **Hardware**.

| #   | Do this                                     | Correct result                                                                                                    |
| --- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| C.1 | Look at the empty set                       | Heading is the set title; body reads **"No cards yet"** and explains what a card is, with **Add your first card** |
| C.2 | Note the buttons in the header              | **Edit set** and **New card**                                                                                     |
| C.3 | Break the API (stop the backend) and reload | **"That set could not be loaded"** with a way back — not an empty set that looks like you lost your cards         |
| C.4 | Restart the backend, reload                 | The set loads normally again                                                                                      |

Tag filtering needs cards, so come back to Part C after Part G.

| #    | Do this (after you have 2+ cards with different tags) | Correct result                                                                                                                                 |
| ---- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| C.5  | Look at **Filter by tag**                             | One chip per tag, each with a **count**                                                                                                        |
| C.6  | Click one chip                                        | It highlights; the list narrows to cards carrying that tag                                                                                     |
| C.7  | Click a second chip                                   | A line appears: **"Showing cards with all of: computing, biology."** The list shows only cards with **both** — this narrows, it does not widen |
| C.8  | Pick two tags no single card shares                   | **"No matching cards"** and a **Clear filter** button. **Not** "Add your first card" — creating a card would not show up in a filtered list    |
| C.9  | Click **Clear**                                       | Every card is back                                                                                                                             |
| C.10 | With a filter active, edit a card and save            | You return to the set and **the filtered list updates**. A stale row here is the query-key prefix bug (PHASE_3.md §6.2)                        |

---

## Part D — The card editor, Write mode

From Hardware, click **New card**.

**The test paragraph** (copy this exactly — later checks cite its offsets):

```
The CPU is the brain of the computer and RAM stores temporary data
```

| #    | Do this                                                     | Correct result                                                                                                |
| ---- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| D.1  | Look at the page                                            | Heading **"New card"**. Tabs **Write** / **Highlight** — **Highlight is disabled** (nothing to highlight yet) |
| D.2  | Type `The CPU` in Title, leave the paragraph empty          | **Create card** is **disabled**. A title alone is not a card                                                  |
| D.3  | Paste the test paragraph                                    | The textarea **grows to fit** — no inner scrollbar. The counter reads **66 / 5,000**                          |
| D.4  | Select all in the textarea and delete                       | The box **shrinks back**. It does not stay at its tallest                                                     |
| D.5  | Paste it again                                              | **Highlight** is now enabled, **Create card** is now enabled                                                  |
| D.6  | Look at the Preview pane at the bottom                      | **"Your question will appear here as you highlight words."** and the heading says **"no blanks yet"**         |
| D.7  | Type `computing` in **Tags** and press comma                | A chip **computing** appears and the field clears                                                             |
| D.8  | Type `Cell Biology` and press Enter                         | The chip reads **`cell biology`** — lowercased and collapsed, matching what the server stores                 |
| D.9  | Press Backspace with the tag field empty                    | The **last chip is removed**. (Press it again only if you meant to)                                           |
| D.10 | Type a tag and click **Create card** without pressing Enter | The tag is **still saved** — the field commits on blur                                                        |

> **D.8 matters more than it looks.** If the chip kept its capitals, the tag you
> just added would not match the filter chip you click in Part C.

---

## Part E — Highlighting (the core of the phase)

Back in a New card with the test paragraph typed. Click **Highlight**.

| #    | Do this                                                 | Correct result                                                                                                                                       |
| ---- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| E.1  | Look at the surface                                     | The paragraph is rendered as text (no textarea). A hint reads **"Select words to blank them. Ctrl/⌘+H also works, and Tab moves between blanks."**   |
| E.2  | Select the word `CPU` with the mouse                    | It highlights immediately on mouse-up, with a small **1** badge after it                                                                             |
| E.3  | Select `RAM`                                            | Highlights, badged **2**                                                                                                                             |
| E.4  | **Now select `brain`** (between the two)                | It highlights — and the badges **renumber to 1 `CPU`, 2 `brain`, 3 `RAM`**. Ordinals follow **position in the paragraph**, not the order you clicked |
| E.5  | Try to select `the brai` (overlapping blank 2)          | Nothing is added. A message reads **"That overlaps blank 2. Remove it first, or select different words."**                                           |
| E.6  | Select only the space between two words                 | **"Select a word or phrase — a blank cannot be only spaces."**                                                                                       |
| E.7  | Click once in the paragraph without dragging            | **No message at all.** A bare click is not an error worth narrating                                                                                  |
| E.8  | Click on the highlighted `CPU`                          | An options panel opens: **"Blank 1: CPU"**, an alternative-answer field, **Done**, **Remove this blank**                                             |
| E.9  | Type `processor` and press Enter in that field          | A **processor** chip appears. Enter does **not** submit the card                                                                                     |
| E.10 | Type `CPU` (the answer itself) and press Enter          | It is **silently ignored** — an alternative identical to the answer is a dead entry                                                                  |
| E.11 | Type `Processor` (different case)                       | Also ignored — de-dup is case-insensitive                                                                                                            |
| E.12 | Press **Escape**                                        | The panel closes                                                                                                                                     |
| E.13 | Click blank 3 (`RAM`) and hit **Remove this blank**     | `RAM` returns to plain text; **`CPU` and `brain` stay 1 and 2**                                                                                      |
| E.14 | Drag a selection and **release the mouse over a badge** | It still highlights correctly. The badge is not treated as paragraph text — this is the §6.1 bug                                                     |

> **E.14 is the one that would have shipped.** Before the fix, the badge's digit
> counted as one character of paragraph text, so with one existing blank every
> later offset shifted by one. Highlighting `brain` stored `rain ` — same length,
> valid range, renders fine, wrong answer. Part G.6 is how you confirm it.

---

## Part F — The Preview pane

With `CPU` and `RAM` highlighted (remove `brain` if you added it).

| #   | Look at this                                     | Correct result                                                                            |
| --- | ------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| F.1 | The Preview text                                 | `The _____¹ is the brain of the computer and _____² stores temporary data`                |
| F.2 | **The width of the two blanks**                  | **Identical.** Five underscores each, regardless of whether the answer is 3 letters or 30 |
| F.3 | The heading beside "Preview"                     | **"2 blanks"** (and **"1 blank"**, singular, with one)                                    |
| F.4 | Highlight `photosynthesis`-length text elsewhere | Its blank is **still five underscores**                                                   |
| F.5 | Remove every blank                               | Preview returns to **"Your question will appear here as you highlight words."**           |

> **F.2 is a correctness bug, not a styling one.** A blank sized to its answer
> gives the width away: `_____` rules out `photosynthesis` before the user has
> thought about it. If the widths differ, the fixed-width path was bypassed.

---

## Part G — Save and round trip (the Phase 3 done-when criterion)

| #    | Do this                                                                        | Correct result                                                                                                                                                      |
| ---- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G.1  | With `CPU` and `RAM` blanked, click **Create card**                            | You land back on **`/sets/:id`**, and the new card is in the list                                                                                                   |
| G.2  | Read the row                                                                   | It shows **the original paragraph** — "The CPU is the brain…", **not** the blanked form. A list of rows all starting "The ____ is…" would be unusable               |
| G.3  | Read the count on the row                                                      | **"2 blanks"**                                                                                                                                                      |
| G.4  | Click the card title                                                           | Opens `/cards/:id`, heading **"Edit card"**, Title and paragraph populated, tags restored                                                                           |
| G.5  | Switch to **Highlight**                                                        | **The same two words are highlighted, badged 1 and 2.** This is the done-when criterion met                                                                         |
| G.6  | **The drift check.** Add a blank on `brain`, save, reopen, switch to Highlight | The blank covers exactly **`brain`** — not `rain`, not `brain ` with a trailing space, not `brai`                                                                   |
| G.7  | Save a card with a title and paragraph but **no highlights**                   | It saves. A note under the button says so: _"A card with no blanks is still worth saving — you can highlight later."_ Highlighting is the cheap part; typing is not |
| G.8  | Stop the backend, then click **Save card**                                     | You **stay on the form**, the paragraph is intact, and an alert reads **"Could not reach the server."** Navigating away here would discard what you wrote           |
| G.9  | Restart the backend and click **Save card** again                              | It saves normally                                                                                                                                                   |
| G.10 | Start a **New card**, type a paragraph, wait ~1s, then reload the page         | Your text **comes back** — drafts autosave to `localStorage` after a 500 ms pause                                                                                   |
| G.11 | Open an **existing** card, note its paragraph, reload                          | You see the **saved card**, never a stale draft. Restore is create-only                                                                                             |
| G.12 | Delete a card from the set list                                                | A confirm names the card and its blank count; **Delete card** removes it; Cancel removes nothing                                                                    |

### G.6 the rigorous way — check the database

`answerText` is a **corruption tripwire**: the client never sends it, so the server
sliced it out of the paragraph using the offsets you stored. If it disagrees with
what you highlighted, the offsets are wrong.

```bash
pnpm db:studio     # opens Prisma Studio
```

Open **CardAnswer** for your card. For the test paragraph, correct values are:

| Highlight | `startOffset` | `endOffset` | `answerText` |
| --------- | ------------- | ----------- | ------------ |
| `CPU`     | 4             | 7           | `CPU`        |
| `brain`   | 15            | 20          | `brain`      |
| `RAM`     | 41            | 44          | `RAM`        |

**Any `answerText` with a leading or trailing space, or off by one letter, is the
badge-offset bug — even though the app looks perfectly fine.**

---

## Part H — Editing a paragraph that already has blanks

This is where offsets go wrong quietly. Open a saved card with two blanks.

| #   | Do this                                                                           | Correct result                                                                                                                   |
| --- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| H.1 | Switch to **Write**                                                               | The hint changes to _"Your existing blanks follow their words as you edit. If you delete a highlighted word, you will be told."_ |
| H.2 | Type a whole new sentence **above** your highlights, then switch to **Highlight** | **Every blank still covers the same words.** They shifted with the text, they did not stay at fixed numbers                      |
| H.3 | Add text **between** the two blanks and commit                                    | Both blanks still correct                                                                                                        |
| H.4 | Delete a highlighted word (e.g. remove `RAM`) and commit                          | A notice appears: **"1 highlight no longer matches your text"**, listing **RAM** by name, with **Got it**                        |
| H.5 | Undo that deletion (type `RAM` back) and commit                                   | The blank is **found again** and the notice clears on its own                                                                    |
| H.6 | Delete two highlighted words at once                                              | **"2 highlights no longer match your text"**, both named                                                                         |
| H.7 | Click **Got it**                                                                  | The notice dismisses and does not come back on the next keystroke                                                                |
| H.8 | Type in the textarea while blanks exist, **without** switching tabs               | Nothing recomputes mid-keystroke. Re-anchoring happens on **commit** (tab switch or blur), not per character                     |
| H.9 | Type text, then click straight on **Save card** without switching back            | It saves your edited text. Blur is also a commit — nothing typed is lost                                                         |

> **H.4 is a design decision you are verifying, not a bug.** A blank whose word is
> gone cannot survive. Dropping it silently would be easier and is wrong: you
> deliberately marked that word, and you would discover it missing mid-review
> weeks later with no idea when it went.

### H.10 — Emoji, if you want to be thorough

Paste `A 🧠 thinks fast` and highlight `thinks`. Save, reopen.

**Correct:** the blank still covers `thinks`. Offsets are **code points**, not
UTF-16 units — that string is 11 UTF-16 units and 10 code points, so a
`String.length` index would slice the emoji in half and shift everything after it.

---

## Part I — Keyboard and screen reader

Do these with **no mouse**.

| #    | Do this                                                                                          | Correct result                                                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| I.1  | Press Tab from the top of any page                                                               | The **first** stop is a **"Skip to content"** link that becomes visible when focused                                                 |
| I.2  | In Highlight mode, select text with **Shift+arrow keys**, then press **Ctrl+H** (**⌘+H** on Mac) | The selection becomes a blank                                                                                                        |
| I.3  | Press **Ctrl+H** while focus is in the **Title** field                                           | Nothing is highlighted — you get a literal `H`. The binding is on the paragraph, not the window                                      |
| I.4  | Press Tab repeatedly in Highlight mode                                                           | Focus visits **each blank in document order**, with a visible focus ring                                                             |
| I.5  | Press **Enter** on a focused blank                                                               | Its options panel opens **and focus moves into it** — you are not stranded behind an invisible panel                                 |
| I.6  | Press **Delete** or **Backspace** on a focused blank                                             | **That** blank is removed — not the last one, not all of them. No confirm dialog (re-highlighting is one selection away)             |
| I.7  | Turn on a screen reader and focus a blank                                                        | It announces **"Blank 2: brain. Enter for options, Delete to remove."** — the badge digit is not read out twice                      |
| I.8  | Let a screen reader read the **Preview**                                                         | Each gap announces as **"blank 1"**, **"blank 2"** — **not** "line line line line line", and never a length that hints at the answer |
| I.9  | Tab through a dialog (New set / Delete)                                                          | Focus stays inside it; **Escape** closes it                                                                                          |
| I.10 | Toggle the theme (☾/☀) and re-check contrast on highlights                                       | Highlighted text stays readable in **both** light and dark                                                                           |

---

## Part J — Isolation between accounts

The one check where a wrong result is a **security** bug, not a UX one.

1. Sign in as **user A**, open a set, copy its id from the URL (`/sets/<A_SET_ID>`).
2. Sign out. Register **user B**.
3. As B, paste `/sets/<A_SET_ID>` into the address bar.

| #   | Check                    | Correct result                                                                     |
| --- | ------------------------ | ---------------------------------------------------------------------------------- |
| J.1 | The page B sees          | **"That set could not be loaded"** — no title, no description, no cards            |
| J.2 | B's `/sets` list         | Only B's own sets. A's are not there in any state, archived or not                 |
| J.3 | B's tag filter chips     | Only tags from **B's** cards. A's vocabulary must not leak through `GET /api/tags` |
| J.4 | At the API level (below) | **HTTP 404**, never 403                                                            |

```bash
# Sign in as B and keep the cookie, then:
curl -i -b b.txt http://localhost:3000/api/sets/<A_SET_ID>
# → HTTP/1.1 404 Not Found, and no body describing the set
```

> **403 is the bug.** It confirms the row exists. Run it a few thousand times over
> guessed ids and you have a map of who owns what. 404 says only "not yours to
> know about".

---

## Part K — On a phone ⚠️ (the one thing still unverified)

**Everything above passes in a desktop browser whether or not the touch path
works.** That is exactly why this section exists, and why the Phase 3 done-when
criterion is marked ⚠️ rather than ✅ in the plan.

### Getting the dev server onto your phone

```bash
# 1. Find your machine's LAN address
ipconfig                      # Windows — look for IPv4 Address, e.g. 192.168.1.42

# 2. Add that origin to backend/.env — CORS_ORIGIN is comma-separated
CORS_ORIGIN="http://localhost:5173,http://192.168.1.42:5173"

# 3. Restart the backend, then serve Vite on the network
pnpm --filter @saulado/frontend dev -- --host
```

Open `http://192.168.1.42:5173` on a phone on the same Wi-Fi.

> **Skip step 2 and you get a convincing false failure:** login succeeds and sets
> the cookie, then every refresh comes back 401, so the app looks signed in until
> you reload and are bounced to `/login`. That is CORS, not a Phase 3 bug.

### The touch checks

| #    | Do this on the phone                                  | Correct result                                                                                                                                                                               |
| ---- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K.1  | In Highlight mode, **long-press** a word              | The word selects, and a bar pins to the **bottom of the screen** reading **"Blank out selection"**                                                                                           |
| K.2  | **Drag the selection handles** to widen the selection | The bar **stays visible** and the selection updates. This is the check — handle-dragging fires no `mouseup`, so a `mouseup`-based build does nothing here while working perfectly on desktop |
| K.3  | Tap **Blank out selection**                           | The blank is created and badged                                                                                                                                                              |
| K.4  | Long-press so the press lands **mid-word**            | The selection **snaps to the whole word**. Snapping is touch-only — on desktop, highlighting `bio` inside `biology` must still work                                                          |
| K.5  | Tap an existing highlight                             | The options panel opens **inline below the paragraph**, not floating over the text you are reading                                                                                           |
| K.6  | Open the panel with the keyboard up                   | The panel is not hidden behind the on-screen keyboard or the OS copy/paste bubble                                                                                                            |
| K.7  | Tap once without selecting                            | No error message                                                                                                                                                                             |
| K.8  | Rotate to landscape and back                          | Blanks stay on the same words                                                                                                                                                                |
| K.9  | Narrow to **320px** (or a small phone)                | No horizontal scrolling anywhere; buttons stay tappable                                                                                                                                      |
| K.10 | **Repeat K.1–K.5 on iOS Safari _and_ Android Chrome** | Both behave the same. WebKit and Blink implement selection handles differently, and only one of them has ever been tested here                                                               |

**Status if you skip this section:** the phone criterion stays ⚠️ unverified. It
is the only Phase 3 acceptance item not currently proven.

---

## Part L — Limits and edge cases

Optional, but each of these is a real boundary in `shared/src/cards/limits.ts`.

| #   | Do this                                                 | Correct result                                                                                                                                                          |
| --- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L.1 | Paste more than **5,000** characters into the paragraph | The counter turns a warning colour and **Highlight is disabled**. You are stopped while typing, not after clicking Save                                                 |
| L.2 | Create **20** blanks, then try a 21st                   | **"You have reached the limit of 20 blanks."** The first 20 are untouched                                                                                               |
| L.3 | Add **10** alternatives to one blank, then an 11th      | The field disables and reads **"Limit reached"**                                                                                                                        |
| L.4 | Add **15** tags, then a 16th                            | The field disables: **"Limit of 15 tags reached"**                                                                                                                      |
| L.5 | Type a set title over **120** characters                | Input stops at the cap rather than failing on save                                                                                                                      |
| L.6 | Create **21+** sets                                     | The list pages at 20 with a **Load more** button; clicking it appends and the button eventually **disappears** — it must not sit there refetching the last page forever |
| L.7 | Highlight a word, remove it, highlight it again         | Works; no ghost blank left behind                                                                                                                                       |
| L.8 | Open card A, then navigate straight to card B           | B shows **B's** paragraph, not A's                                                                                                                                      |

---

## Part M — Score sheet

Copy this and fill it in.

```
Date:                              Browser:
Ran on phone?  iOS ☐   Android ☐   Neither ☐

Part 0  Setup .................. ☐ pass  ☐ fail: ____________________
Part A  Automated gate ......... ☐ 491 tests  ☐ other: ______________
Part B  Library CRUD ........... ☐ pass  ☐ fail: ____________________
Part C  Set detail + tags ...... ☐ pass  ☐ fail: ____________________
Part D  Write mode ............. ☐ pass  ☐ fail: ____________________
Part E  Highlighting ........... ☐ pass  ☐ fail: ____________________
Part F  Fixed-width blanks ..... ☐ pass  ☐ fail: ____________________
Part G  Save + round trip ...... ☐ pass  ☐ fail: ____________________
        G.6 offsets in DB ...... ☐ exact ☐ DRIFTED — stop and report
Part H  Re-anchor + orphans .... ☐ pass  ☐ fail: ____________________
Part I  Keyboard + a11y ........ ☐ pass  ☐ fail: ____________________
Part J  Isolation .............. ☐ 404   ☐ 403 — SECURITY, stop and report
Part K  Phone .................. ☐ pass  ☐ fail  ☐ not run (stays ⚠️)
Part L  Limits ................. ☐ pass  ☐ fail: ____________________
```

### If only three checks fit in your day

1. **G.6** — the offsets in the database. Silent corruption, invisible in the UI.
2. **J.4** — 404 and not 403. The only check whose failure is a security bug.
3. **K.2** — dragging selection handles on a real phone. The one criterion still
   unproven, and a desktop browser cannot tell you.

### Known-not-implemented — not bugs

Do not file these; they are recorded as deferred in `IMPLEMENTATION_PLAN.md`:

- **No due counts or due state** on sets or cards — needs Phase 4's `card_schedules`
  table, which does not exist yet. A hardcoded zero would read as real data.
- **No bulk select → delete/move** — needs a batch endpoint that has not been built.
- **No standalone read-only card view** — the editor's Write/Highlight tabs and the
  Preview pane cover it.
- **No study/review flow at all.** That is Phase 4. Saving a card is where Phase 3 ends.
