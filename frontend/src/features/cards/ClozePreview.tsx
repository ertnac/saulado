import type { ReactElement } from 'react'
import { renderCloze, type AnswerRange } from '@saulado/shared'
import { cn } from '@/lib/utils'

/**
 * The generated question, exactly as study mode will render it (plan §3.3).
 *
 * Built on the shared `renderCloze` rather than a local string replace, so what
 * the editor promises and what the study screen delivers cannot drift. This is
 * the whole payoff of deriving blanks instead of storing them.
 *
 * Blanks are fixed width. Sizing each one to its answer leaks the answer — the
 * difference between `_____` and `______________` is a free hint that measurably
 * degrades recall (plan §2.7). The editor showing proportional blanks would be
 * misleading even if study mode got it right.
 */

interface ClozePreviewProps {
  paragraph: string
  answers: readonly AnswerRange[]
  className?: string
}

const BLANK_WIDTH = 5

export function ClozePreview({ paragraph, answers, className }: ClozePreviewProps): ReactElement {
  const segments = renderCloze(paragraph, answers)

  return (
    <div
      className={cn(
        'whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-4 text-base leading-relaxed',
        className,
      )}
    >
      {segments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Your question will appear here as you highlight words.
        </p>
      ) : (
        segments.map((segment, index) =>
          segment.kind === 'text' ? (
            <span key={`t${String(index)}`}>{segment.text}</span>
          ) : (
            <span
              key={`b${String(segment.ordinal)}`}
              className="mx-0.5 font-mono text-muted-foreground"
            >
              {/*
                A screen reader given the raw underscores announces "line line
                line line line" or skips them entirely, neither of which conveys
                that there is a gap to fill. The visible run is hidden from the
                accessibility tree and replaced with wording.
              */}
              <span aria-hidden="true">
                {'_'.repeat(BLANK_WIDTH)}
                <sup className="ml-0.5 text-[0.625rem] font-semibold tabular-nums">
                  {segment.ordinal + 1}
                </sup>
              </span>
              <span className="sr-only">{` blank ${String(segment.ordinal + 1)} `}</span>
            </span>
          ),
        )
      )}
    </div>
  )
}
