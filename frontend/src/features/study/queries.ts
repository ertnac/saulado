import type {
  AnswerResponse,
  DueCountsResponse,
  SessionResponse,
  SubmitAnswerRequest,
  SummaryResponse,
} from '@saulado/shared'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import * as api from '@/services/study'
import { cardKeys, setKeys } from '@/features/cards/queries'
import { dashboardKeys, progressKeys } from '@/features/dashboard/queries'

/**
 * Caching for study sessions.
 *
 * A study session is not like a set or a card list. It is a short-lived,
 * single-tab, strictly-ordered thing, and treating it as ordinary cacheable data
 * causes specific misbehaviour: a background refetch mid-review would swap the
 * queue under the user's fingers, and a retried answer would count as two
 * recalls.
 *
 * So the rules here are deliberately unlike `features/cards/queries.ts`:
 *
 * - **The session is never refetched in the background.** `staleTime: Infinity`
 *   and no refetch-on-focus. The client holds the queue and walks it; the server
 *   is the authority on grading, not on what the next card is mid-session.
 * - **Answers are never retried automatically.** The idempotency key makes a
 *   retry *safe*, not free — an automatic retry on a timeout that actually
 *   succeeded would be fine, but one on a 400 is just noise. Retry is the user's
 *   call, and the key is what makes their retry safe.
 * - **Due counts are invalidated after every answer**, because the dashboard's
 *   "12 due today" is exactly the number the answer just changed.
 */

export const studyKeys = {
  all: ['study'] as const,
  sessions: () => [...studyKeys.all, 'session'] as const,
  session: (id: string) => [...studyKeys.sessions(), id] as const,
  due: () => [...studyKeys.all, 'due'] as const,
}

/**
 * Today's due counts, per set.
 *
 * Short `staleTime` rather than `Infinity`: this number changes when the user
 * studies in another tab, and it is cheap to refetch. It is also the one study
 * query that *should* refetch on focus — coming back to the dashboard after a
 * session elsewhere should not show a stale backlog.
 */
export function useDueCounts(): UseQueryResult<DueCountsResponse> {
  return useQuery({
    queryKey: studyKeys.due(),
    queryFn: () => api.getDueCounts(),
    staleTime: 30_000,
  })
}

/**
 * Resumes an interrupted session (plan §4.2).
 *
 * Enabled only when there is an id to resume. The queue this returns already
 * excludes answered cards, so a resumed session picks up where it left off
 * without the client having to reconcile anything.
 */
export function useSession(sessionId: string | null): UseQueryResult<SessionResponse> {
  return useQuery({
    queryKey: studyKeys.session(sessionId ?? 'none'),
    queryFn: () => api.getSession(sessionId ?? ''),
    enabled: sessionId !== null,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })
}

/**
 * Starts a session, or picks up the open one.
 *
 * A mutation rather than a query even though it reads: it has a side effect (a
 * `study_sessions` row), and it must fire when the user says "Study", never
 * because a component mounted twice.
 */
export function useStartSession(): UseMutationResult<SessionResponse, Error, string | undefined> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (studySetId: string | undefined) => api.startSession(studySetId),
    onSuccess: (data) => {
      // Seeded rather than invalidated: this response *is* the session, so a
      // refetch would ask the server for what we are already holding.
      queryClient.setQueryData(studyKeys.session(data.session.id), data)
    },
  })
}

export interface SubmitAnswerVariables {
  sessionId: string
  body: SubmitAnswerRequest
}

/**
 * Submits one answer.
 *
 * `retry: false` is load-bearing — see the module docblock. The caller generates
 * the idempotency key once per card presentation and reuses it across manual
 * retries, so a replay returns the original verdict rather than re-grading.
 */
export function useSubmitAnswer(): UseMutationResult<AnswerResponse, Error, SubmitAnswerVariables> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ sessionId, body }: SubmitAnswerVariables) => api.submitAnswer(sessionId, body),
    retry: false,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: studyKeys.due() })
      /**
       * The dashboard carries today's reviews, the streak and the goal ring, and
       * an answer moves all three. Invalidated per answer rather than only at
       * session end, because the tab the user left the dashboard open in is the
       * one that should not be showing this morning's zero.
       */
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.all })
    },
  })
}

/**
 * Finishes the session and returns the summary.
 *
 * Invalidates the card and set lists as well as the due counts: a review changes
 * a card's schedule, which is what the "due" badge on a set is derived from.
 */
export function useCompleteSession(): UseMutationResult<SummaryResponse, Error, string> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (sessionId: string) => api.completeSession(sessionId),
    onSuccess: (_data, sessionId) => {
      queryClient.removeQueries({ queryKey: studyKeys.session(sessionId) })
      void queryClient.invalidateQueries({ queryKey: studyKeys.due() })
      void queryClient.invalidateQueries({ queryKey: setKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: cardKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.all })
      /**
       * Every range, not just the one last viewed. A session that ends today
       * changes today, and today is the last day of all four windows.
       */
      void queryClient.invalidateQueries({ queryKey: progressKeys.all })
    },
  })
}
