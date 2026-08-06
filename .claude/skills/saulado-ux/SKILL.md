---
name: saulado-ux
description: UI/UX rules for Saulado's study interface. Read BEFORE writing or reviewing any component that renders a paragraph, a blank, an answer input, feedback state, the highlight editor, the dashboard, a streak, or an empty/loading/error state. Triggers on - "blank", "cloze", "highlight", "study mode", "study session", "answer input", "reveal answer", "card preview", "streak", "daily goal", "dashboard", "empty state", "dark mode", "accessibility", "a11y", "mobile layout", "touch target", "keyboard shortcut", "focus", "screen reader". Also read when the task is styling or laying out any screen in this app, even if it sounds trivial.
---

# Saulado UX

The product thesis is **context preservation**. Every UI decision is judged by one question: _does this keep the paragraph as the focus and make recall harder in the productive way?_ An interface that makes answering easier by leaking information is a bug, not a convenience.

Architecture context lives in `IMPLEMENTATION_PLAN.md` (§2.1 offsets, §2.5 validation, §2.7 blank rendering). This skill is the UI half.

---

## 1. The three rules that are non-negotiable

These cause silent product damage and are near-impossible to retrofit.

### 1.1 A blank must not leak its answer's length

Sizing `_____` to the answer is a free hint and measurably degrades recall. **Default to fixed-width.**

```tsx
// WRONG — width encodes the answer
;<span style={{ width: `${answer.length}ch` }} />

// RIGHT — fixed width, or user-opted proportional
const width = mode === 'proportional' ? `${Math.min(answerLen, 24)}ch` : '8ch'
```

`blank_width_mode: 'fixed' | 'proportional'` is a user setting. Fixed is the default. Do not "helpfully" change this.

### 1.2 Zero layout shift between input and reveal

If the paragraph reflows when the answer appears, the user loses their place in the sentence — which is the entire point of the app.

Reserve the space. Measure the widest of (input, answer, alt-answer) and lock the box before state changes. Verify by screenshotting pre- and post-reveal and diffing: **every character outside the blank must be at the same pixel position.**

```tsx
<span className="relative inline-block align-baseline" style={{ minWidth: reservedWidth }}>
  {/* input and revealed answer occupy the same reserved box */}
</span>
```

### 1.3 Never encode feedback in colour alone

Red/green is invisible to ~8% of men. Every state pairs colour with an icon **and** text.

| State       | Colour | Icon | Text                   |
| ----------- | ------ | ---- | ---------------------- |
| exact       | green  | ✓    | —                      |
| alternative | green  | ✓    | "also accepted"        |
| typo        | amber  | ✓    | shows correct spelling |
| wrong       | red    | ✕    | reveals the answer     |

The typo state is easy to get wrong: it counts as **correct**, but must still display the exact spelling. Silently accepting a misspelling teaches the misspelling.

---

## 2. Study mode

The screen where users spend 95% of their time. Optimize it before anything else.

**Layout**

- Paragraph is the largest element on screen. Chrome (progress, nav, buttons) is visually subordinate.
- Max ~65ch line length. Long lines destroy readability at exactly the moment attention matters.
- One card at a time. No peeking at the next.
- Nothing animates during reading. Motion pulls the eye off the text.

**Input flow**

- Auto-focus blank 0 on card mount.
- `Tab` / `Enter` advance between blanks; `Enter` on the last blank submits.
- `Shift+Tab` goes back.
- Never auto-advance on "looks complete" — the user decides when they're done.
- Each blank is validated and displayed independently (§2.5). A card with 3 blanks shows 3 verdicts.

**Mobile input attributes** — omitting these is a rage-quit bug:

```html
<input
  autocapitalize="off"
  autocorrect="off"
  spellcheck="false"
  autocomplete="off"
  enterkeyhint="next"
/>
```

iOS autocorrect rewriting "chloroplast" into something else, then marking it wrong, is the single worst experience this app can produce.

**Escape hatch**
"Reveal answers" always available, grades as `again`. Never hide it — a stuck user with no exit closes the tab.

**Interruption recovery**
Refresh mid-session must not lose progress. Persist session position; restore on mount.

**Keyboard shortcuts** (`?` opens the overlay)

| Key                 | Action                                |
| ------------------- | ------------------------------------- |
| `Enter`             | submit / next                         |
| `Tab` / `Shift+Tab` | move between blanks                   |
| `R`                 | reveal                                |
| `Esc`               | exit session (confirm if >0 answered) |
| `?`                 | shortcuts overlay                     |

---

## 3. The highlight editor

Budget 5 days (Phase 3.3). It is consistently underestimated.

**Two distinct modes, clearly signposted:**

- **Compose** — plain `<textarea>`, autosize, paste-safe, debounced draft to `localStorage`.
- **Highlight** — read-only rendered paragraph, selection creates ranges.

Mixing them into one contenteditable surface is where offset bugs are born.

**Selection → offsets**

- Map `window.getSelection()` to **code-point** offsets, not UTF-16 indices (`"café".length` lies).
- The DOM splits text nodes at highlight boundaries — walk the tree and accumulate, don't trust a single node's offset.
- Trim leading/trailing whitespace out of the selection before creating the answer. Users overshoot by a space constantly.

**Feedback**

- Numbered badge per highlight, matching the blank ordinal the user will see.
- Overlapping selection → inline explanation ("highlights can't overlap — remove the existing one first"). Never a silent no-op; the user thinks the app is broken.
- Tap/click a highlight → popover: remove, or add alternative answers.
- Live preview of the generated question, always visible.

**Keyboard path is mandatory, not a stretch goal**
Assume `getSelection()` is unavailable. Provide: `Shift+arrows` to select, `Ctrl/Cmd+H` to highlight, `Tab` through existing highlights, `Delete` to remove. Screen-reader users must be able to create a card.

**Mobile**
Long-press selection + a "Highlight selection" action bar pinned above the keyboard using `visualViewport`. **Test on real iOS Safari and real Android Chrome — emulators lie about selection behaviour.** If free selection proves unworkable, fall back to tap-to-select-word/phrase, which is arguably better on touch anyway.

**Paragraph edits**
When the paragraph changes, re-anchor answers by searching for `answerText` near the old offset. Orphans get surfaced as "this highlight no longer matches — re-highlight or delete." Never silently drop a user's work.

---

## 4. Dashboard, streaks, progress

**One dominant CTA.** "Start studying" with the due count. Everything else is secondary. If a user has to choose where to look, the dashboard failed.

**Streaks are honest and non-punitive.** They are the most emotionally load-bearing number in the app.

- "2 days" and "Start a streak today" both read fine.
- No loss-framing, no flame-about-to-die animations, no guilt.
- A streak day = a day with ≥1 review **in the user's timezone** (§2.3). Getting this wrong breaks streaks for every traveller and every non-UTC user.

**Charts** — respect `prefers-reduced-motion`, meet 4.5:1 contrast in both themes, never colour-only. If you're building any chart here, invoke the `dataviz` skill first.

---

## 5. States — all four, every time

For every data-driven view: **loading, empty, error, populated.** A view missing one is incomplete, not "to be polished later."

- **Loading:** skeletons matching final layout. No spinners for content — they cause a second layout shift.
- **Empty:** teach the concept. "No study sets" is a wasted screen. Show what a cloze card _is_, with the Manila or CPU/RAM example and a create button.
- **Error:** what happened + what to do. A retry button that actually retries.
- **New user:** genuine empty states, not charts full of zeroes. Zeroed charts read as "this app is broken."

---

## 6. Accessibility — WCAG 2.1 AA

- Every interactive element keyboard-operable with a **visible** focus ring. Never `outline: none` without a replacement.
- Blanks announce as "blank 1 of 3" via `aria-label`.
- Results announced via `aria-live="polite"` — polite, not assertive; assertive interrupts the user mid-typing.
- 4.5:1 contrast in **both** themes. Dark mode is not exempt and is usually where this breaks.
- `prefers-reduced-motion` honoured throughout.
- Correct heading hierarchy, skip-to-content link.
- axe-core in CI, plus one manual VoiceOver/NVDA pass of the full study flow.

---

## 7. Mobile

- 320px → 1440px verified at every breakpoint.
- Touch targets ≥ 44×44px.
- Primary actions in thumb reach (bottom third).
- Keyboard-aware layout via `visualViewport` — **the submit button must never hide behind the keyboard.**
- Test on real devices.

---

## Review checklist

Before calling any UI work done:

- [ ] Blank width doesn't leak answer length
- [ ] Zero layout shift on reveal (pixel-diff verified)
- [ ] Feedback has colour + icon + text
- [ ] Typo state shows the correct spelling
- [ ] Full keyboard path, visible focus
- [ ] Screen-reader sane (blanks numbered, results announced politely)
- [ ] 4.5:1 contrast in light _and_ dark
- [ ] Works at 320px; targets ≥44px; submit clear of the keyboard
- [ ] `autocorrect`/`autocapitalize`/`spellcheck` off on answer inputs
- [ ] Loading, empty, error states all exist
- [ ] Tested on a real phone
