# Quiz Speed Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver 0ms instant quiz answer feedback on the web app using client-side evaluation with non-blocking background server synchronization.

**Architecture:** Extend `useStudySession` with `evaluateLocally` (using `@saulado/shared`'s `checkAnswers` and `gradeCard`) and `syncProgress`. Update `StudySessionPage` to render feedback immediately with 0ms delay while dispatching non-blocking background mutations to `/api/study/sessions/:id/answers`, guarded by active card IDs to prevent race conditions during rapid advancement.

**Tech Stack:** React 18, TypeScript, `@tanstack/react-query`, Vitest, `@testing-library/react`, `@saulado/shared`.

## Global Constraints

- Never mutate server session contracts or database schemas.
- Preserve idempotency key behavior across retries.
- Maintain existing `@saulado/shared` grading logic (`checkAnswers`, `gradeCard`, `shouldRequeue`).
- No UI blocking or "Checking…" button state when grading cards.
- Server response reconciliation must never overwrite a new card if the user advances quickly (`activeCardId` guard).

---

### Task 1: Add Local Evaluation & Progress Syncing to `useStudySession`

**Files:**

- Modify: `frontend/src/features/study/useStudySession.ts`
- Test: `frontend/src/features/study/useStudySession.test.ts` (create new test file)

**Interfaces:**

- Consumes: `@saulado/shared` (`checkAnswers`, `gradeCard`, `shouldRequeue`, `type AnswerResponse`, `type SessionMode`, `type SessionProgress`)
- Produces:
  - `evaluateLocally(submittedValues: Record<number, string>, revealed: boolean, sessionMode?: SessionMode): AnswerResponse | null`
  - `accept(graded: AnswerResponse, forCardId?: string): void`
  - `syncProgress(serverProgress: SessionProgress): void`

- [ ] **Step 1: Write failing unit tests for `useStudySession`**

Create `frontend/src/features/study/useStudySession.test.ts`:

```typescript
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useStudySession } from './useStudySession'
import type { StudySession, SessionCard } from '@saulado/shared'

const mockCard: SessionCard = {
  cardId: 'card-1',
  studySetId: 'set-1',
  segments: [
    { kind: 'text', text: 'The ' },
    { kind: 'blank', ordinal: 0, answerLength: 3 },
    { kind: 'text', text: ' is cool.' },
  ],
  blankCount: 1,
  tags: [],
  isNew: false,
  isLeech: false,
  cardAnswers: [{ answerText: 'CPU', altAnswers: ['Central Processing Unit'] }],
}

const mockSession: StudySession = {
  id: 'sess-1',
  studySetId: 'set-1',
  mode: 'spaced',
  startedAt: '2026-09-19T00:00:00.000Z',
  completedAt: null,
  queue: [mockCard],
  progress: { answered: 0, total: 1, correct: 0 },
}

describe('useStudySession - evaluateLocally & safe accept', () => {
  it('evaluates answers locally and returns instant verdict', () => {
    const { result } = renderHook(() => useStudySession())
    act(() => {
      result.current.load(mockSession)
    })

    const verdict = result.current.evaluateLocally({ 0: 'CPU' }, false, 'spaced')
    expect(verdict).not.toBeNull()
    expect(verdict?.correct).toBe(true)
    expect(verdict?.grade).toBe('good')
    expect(verdict?.results[0]?.correct).toBe(true)
  })

  it('accepts local verdict and ignores stale background sync for advanced card', () => {
    const { result } = renderHook(() => useStudySession())
    act(() => {
      result.current.load(mockSession)
    })

    const localVerdict = result.current.evaluateLocally({ 0: 'CPU' }, false, 'spaced')!
    act(() => {
      result.current.accept(localVerdict, 'card-1')
    })
    expect(result.current.answer).toEqual(localVerdict)

    // Advance to next card
    act(() => {
      result.current.advance()
    })

    // Stale server response arriving for card-1 should NOT overwrite answer
    act(() => {
      result.current.accept({ ...localVerdict, dueAt: '2026-10-01' }, 'card-1')
    })
    expect(result.current.answer).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @saulado/frontend test src/features/study/useStudySession.test.ts`
Expected: FAIL (evaluateLocally is not a function)

- [ ] **Step 3: Implement `evaluateLocally`, updated `accept`, and `syncProgress` in `useStudySession.ts`**

Update `frontend/src/features/study/useStudySession.ts`:

- Import `checkAnswers`, `gradeCard`, `shouldRequeue`, `type SessionMode`.
- Maintain `attemptsRef = useRef<Record<string, number>>({})`.
- Implement `evaluateLocally(submittedValues, revealed, sessionMode)`:
  - Check `queueRef.current[0]`.
  - Check answers with `checkAnswers(inputs, answersForEval, { typoTolerance: true })`.
  - Calculate `grade = revealed ? 'again' : gradeCard(results)`.
  - Calculate `correct = !revealed && grade !== 'again' && grade !== 'hard'`.
  - Calculate `hadEmptyBlank = !revealed && results.some((r) => r.submitted.trim() === '')`.
  - Track `attempts`: `attemptsRef.current[currentCard.cardId] = (attemptsRef.current[currentCard.cardId] ?? 0) + 1`.
  - Calculate `requeued = sessionMode === 'spaced' ? shouldRequeue(grade, attempts) : (!hadEmptyBlank && shouldRequeue(grade, attempts))`.
  - Return `AnswerResponse` with optimistic progress.
- Update `accept`:
  - Accept optional `forCardId?: string`.
  - If `!forCardId || queueRef.current[0]?.cardId === forCardId`, update `setAnswerBoth(graded)`.
  - Always call `setProgress(graded.progress)`.
- Implement `syncProgress`:
  - `setProgress(serverProgress)`.
- Reset `attemptsRef` on `reset` and `load`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @saulado/frontend test src/features/study/useStudySession.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/study/useStudySession.ts frontend/src/features/study/useStudySession.test.ts
git commit -m "feat(study): add instant local evaluation and safe accept to useStudySession"
```

---

### Task 2: Update `StudySessionPage` to Use Instant Evaluation with Non-Blocking Background Sync

**Files:**

- Modify: `frontend/src/features/study/StudySessionPage.tsx`
- Modify: `frontend/src/features/study/StudySessionPage.test.tsx`

**Interfaces:**

- Consumes: `useStudySession`'s `evaluateLocally`, `accept(verdict, cardId)`, and `syncProgress`.

- [ ] **Step 1: Write integration tests asserting instant feedback without waiting on server**

In `frontend/src/features/study/StudySessionPage.test.tsx`:
Add tests:

- Instant feedback test: Verify that when clicking "Check answer", "Correct" appears immediately without waiting for `mocked.submitAnswer` to resolve.
- Rapid advance test: Verify that answering a card, advancing immediately, and having `mocked.submitAnswer` resolve afterward does not corrupt the second card.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @saulado/frontend test src/features/study/StudySessionPage.test.tsx`
Expected: FAIL (currently waits on submit.mutate)

- [ ] **Step 3: Update `StudySessionPage.tsx`**

In `frontend/src/features/study/StudySessionPage.tsx`:

- Update `send`:
  ```typescript
  const send = (revealed: boolean, overrideValues?: Record<number, string>): void => {
    if (!session.card || !sessionId || session.answer) return

    const valuesToSubmit = overrideValues ?? session.values
    const activeCardId = session.card.cardId

    // 1. Instant 0ms local evaluation
    const localVerdict = session.evaluateLocally(valuesToSubmit, revealed, mode)
    if (localVerdict) {
      session.accept(localVerdict, activeCardId)
      if (answeringType === 'flashcard') {
        const spent = session.advance()
        if (spent && sessionId) finish(sessionId)
      }
    }

    // 2. Non-blocking background sync
    const body: SubmitAnswerRequest = {
      cardId: activeCardId,
      blanks: Object.entries(valuesToSubmit).map(([ordinal, submitted]) => ({
        ordinal: Number(ordinal),
        submitted,
      })),
      durationMs: elapsed(),
      idempotencyKey: session.idempotencyKey,
      ...(revealed ? { revealed: true } : {}),
    }

    submit.mutate(
      { sessionId, body },
      {
        onSuccess: (data) => {
          session.accept(data, activeCardId)
        },
      },
    )
  }
  ```
- Remove "Checking…" button text / spinner on "Check answer". Change:

  ```tsx
  <Button
    disabled={session.answer !== null}
    onClick={() => {
      send(false)
    }}
  >
    Check answer
  </Button>
  ```

  and `disabled={session.answer !== null}` on "Reveal answer".

- [ ] **Step 4: Run tests to verify all tests pass**

Run: `pnpm --filter @saulado/frontend test`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/study/StudySessionPage.tsx frontend/src/features/study/StudySessionPage.test.tsx
git commit -m "feat(study): enable 0ms instant quiz answer feedback and non-blocking sync"
```

---

### Task 3: Full Workspace Verification

**Files:** None (verification step)

- [ ] **Step 1: Run typecheck across entire repository**

Run: `pnpm --filter @saulado/frontend typecheck`
Expected: 0 errors

- [ ] **Step 2: Run all frontend tests**

Run: `pnpm --filter @saulado/frontend test`
Expected: All test suites pass
