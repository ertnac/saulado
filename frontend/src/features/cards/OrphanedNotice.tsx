import type { ReactElement } from 'react'
import type { DraftAnswer } from '@saulado/shared'
import { Button } from '@/components/ui/button'
import { AlertIcon } from '@/components/ui/icons'

/**
 * Tells the user which highlights an edit destroyed (plan §2.1, §3.3).
 *
 * `reanchorAnswers` relocates a highlight by searching for its exact text in the
 * edited paragraph. When the user rewrites or deletes the highlighted word
 * itself, there is nothing to find — and that case is genuinely ambiguous, so the
 * engine escalates rather than guessing.
 *
 * The rule this component enforces is that escalation is *visible*. Dropping the
 * highlight silently would be the easy path and it is the wrong one: the user
 * deliberately marked that word, and they would discover it missing during a
 * review weeks later with no idea when it went.
 *
 * `role="status"` rather than `alert`: this follows an edit the user just made,
 * so it is a consequence to read, not an emergency interrupting them.
 */

interface OrphanedNoticeProps {
  orphaned: readonly DraftAnswer[]
  onDismiss: () => void
}

export function OrphanedNotice({ orphaned, onDismiss }: OrphanedNoticeProps): ReactElement | null {
  if (orphaned.length === 0) return null

  const count = orphaned.length

  return (
    <div
      role="status"
      className="space-y-3 rounded-lg border border-warning/30 bg-warning/5 p-4 text-sm"
    >
      {/* Icon as well as the tint — the border colour alone says nothing. */}
      <p className="flex items-start gap-1.5 font-medium text-warning">
        <AlertIcon className="mt-0.5 h-[1em] w-[1em]" />
        {count === 1
          ? '1 highlight no longer matches your text'
          : `${String(count)} highlights no longer match your text`}
      </p>

      <p className="text-muted-foreground">
        The words below were edited or removed, so their blanks were dropped. Highlight them again
        if you still want them.
      </p>

      <ul className="flex flex-wrap gap-2">
        {orphaned.map((answer, index) => (
          <li
            key={`${answer.answerText}-${String(index)}`}
            className="rounded-full bg-surface px-3 py-1 shadow-soft"
          >
            {answer.answerText}
          </li>
        ))}
      </ul>

      <Button variant="soft" size="sm" onClick={onDismiss}>
        Got it
      </Button>
    </div>
  )
}
