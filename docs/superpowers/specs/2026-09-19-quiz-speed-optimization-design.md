# Quiz Speed Optimization: 0ms Instant Evaluation & Background Sync

**Date:** 2026-09-19  
**Status:** Approved  
**Target:** Web Study Session (`frontend/src/features/study/`)

---

## 1. Problem & Context

During study quizzes on the web application, users experience an annoying lag when checking answers. When clicking "Check answer", pressing Enter, or selecting a multiple-choice option, the interface blocks with a "Checking..." spinner while waiting for a full network round-trip to `POST /api/study/sessions/:id/answers`.

This latency includes:

- Network roundtrip time.
- Server-side multi-table Prisma transaction (`prisma.$transaction` touching `card_schedules`, `reviews`, `user_daily_stats`, and `study_session_cards`).
- Schedule computation.

However, the client already receives all necessary data (`cardAnswers` and `blankAnswers`) when loading the queue from the backend (`toSessionCard` in `backend/src/study/render.ts`). The mobile client (`mobile/app/(app)/study.tsx` & `mobile/hooks/useStudySession.ts`) has already resolved this via instant 0ms local evaluation and background sync.

This design brings that instant 0ms quiz responsiveness to the web application.

---

## 2. Goals & Non-Goals

### Goals

1. **0ms Instant Feedback**: Deliver instant answer grading and feedback immediately upon submission across all study modes (Type-In, Multiple-Choice, Flashcard).
2. **Zero UI Blocking**: Eliminate the blocking "Checking..." state and disabled buttons on submission.
3. **Non-blocking Background Sync**: Asynchronously sync answers to the backend without interrupting the user's flow or study pace.
4. **Seamless Reconciliation**: Safely reconcile authoritative server progress and spaced-repetition schedules (`dueAt`, `intervalDays`) without flashing old cards if the user moves forward quickly.
5. **Accurate Requeuing**: Accurately predict and handle card requeuing locally for `again` cards so the deck cycle continues without network delays.

### Non-Goals

- Changing the backend database schema or API contracts.
- Offline-first IndexedDB storage for the web (the web app continues to use existing HTTP session APIs with online resumption).

---

## 3. Architecture & Data Flow

```
[User Submits Answer (Click / Enter / Shortcut)]
                    │
                    ▼
     ┌─────────────────────────────┐
     │  Local Evaluation (0ms)     │
     │  (@saulado/shared grading)  │
     └──────────────┬──────────────┘
                    │
       ┌────────────┴────────────┐
       ▼                         ▼
┌──────────────────┐    ┌───────────────────────────┐
│ Immediate UI     │    │ Asynchronous Background   │
│ Update           │    │ Network Sync              │
│ (0ms latency,    │    │ (POST /sessions/:id/ans)  │
│  Feedback Panel) │    └─────────────┬─────────────┘
└──────────────────┘                  ▼
                         ┌───────────────────────────┐
                         │ Silent Reconciliation:    │
                         │ • Progress count sync     │
                         │ • SM-2 schedules sync     │
                         │ • Guarded against stale   │
                         │   card ID overrides       │
                         └───────────────────────────┘
```

1. **Submission Event**: Triggered by keyboard shortcuts (Enter / Space / 1-4 / A-D) or button clicks.
2. **Instant Local Evaluation**:
   - `evaluateLocally(values, revealed)` compares inputs against `card.cardAnswers` using `@saulado/shared`'s `checkAnswers` and `gradeCard`.
   - Produces an `AnswerResponse` object with local grade, correctness, and local requeue verdict.
   - Immediately calls `session.accept(localVerdict, activeCardId)`.
3. **Background Sync**:
   - Fires `submit.mutate({ sessionId, body })` in the background.
   - UI does **not** set loading state or disable controls.
4. **Reconciliation**:
   - If the user is still on the same card when the server responds: updates `session.answer` with the authoritative server schedule.
   - If the user has already clicked "Next card": updates `session.progress` using `session.syncProgress`, without flashing previous card feedback.

---

## 4. Component Changes

### 4.1 `frontend/src/features/study/useStudySession.ts`

- **Add `evaluateLocally`**:

  ```typescript
  evaluateLocally: (
    submittedValues: Record<number, string>,
    revealed: boolean,
    sessionMode?: SessionMode,
  ) => AnswerResponse | null
  ```
  - Extracts `cardAnswers` (or falls back to `blankAnswers`).
  - Evaluates answers using `checkAnswers` with `{ typoTolerance: true }`.
  - Determines card grade (`gradeCard`) and correctness.
  - Determines requeue status using `shouldRequeue(grade, attempts)` (with attempts tracked per card).
  - Returns optimistic `AnswerResponse` with updated progress (`progress.answered + 1`, `progress.correct + (correct ? 1 : 0)`).

- **Update `accept(graded: AnswerResponse, forCardId?: string)`**:
  - Only calls `setAnswerBoth(graded)` if `!forCardId || queueRef.current[0]?.cardId === forCardId`.
  - Always updates progress with `setProgress(graded.progress)`.

- **Add `syncProgress(progress: SessionProgress)`**:
  - Updates progress state independently without touching current card or answer state.

- **Card Attempts Tracking**:
  - Keep track of card submission attempts locally (`attemptsRef: Record<string, number>`) to accurately mirror server-side `shouldRequeue(grade, attempts)`.

### 4.2 `frontend/src/features/study/StudySessionPage.tsx`

- **Update `send`**:
  - Perform local evaluation first:
    ```typescript
    const localVerdict = session.evaluateLocally(valuesToSubmit, revealed, mode)
    if (localVerdict) {
      session.accept(localVerdict, activeCardId)
    }
    ```
  - Fire `submit.mutate` asynchronously:
    ```typescript
    submit.mutate(
      { sessionId, body },
      {
        onSuccess: (data) => {
          session.accept(data, activeCardId)
        },
        onError: (err) => {
          // Log or display non-intrusive alert; idempotencyKey protects retries
        },
      },
    )
    ```
- **UI State Adjustments**:
  - Remove button text changing to "Checking…" during answer evaluation.
  - Keep "Check answer" responsive and instant.
  - Maintain error display if network fails, allowing standard retry with unchanged `idempotencyKey`.

---

## 5. Edge Cases & Safety Guards

1. **Card ID Stale Race Condition**:
   - If a user answers, sees "Correct" (0ms), and immediately hits Enter / clicks Next before the server response returns, `session.advance()` moves the queue forward.
   - When the HTTP response for the previous card finally arrives, `session.accept(data, activeCardId)` checks `queueRef.current[0]?.cardId === activeCardId`. Since the card has advanced, it does not overwrite `answer` on the new card; it simply updates `progress`.

2. **Idempotency Stability**:
   - The `idempotencyKey` remains tied to the card presentation and survives retries.

3. **Requeued Cards**:
   - If a card grades `again`, local evaluation flags `requeued: true`. When the user clicks "Next", `session.advance()` inserts the card back into the local queue at `requeuePosition(0, rest.length)` synchronously.

---

## 6. Testing Plan

### Automated Vitest Tests

- **Unit Tests (`useStudySession.test.ts` or `StudySessionPage.test.tsx`)**:
  - Verify that upon clicking "Check answer", the verdict ("Correct" / "Incorrect") appears synchronously in the DOM without waiting for `api.submitAnswer` promise resolution.
  - Verify that advancing to the next card immediately works even while `api.submitAnswer` is pending.
  - Verify that a resolved background response for a previous card does not overwrite or corrupt the next card's UI.
  - Verify that requeue logic puts `again` cards back in the queue properly.
