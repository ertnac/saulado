import { useEffect, useState, type ReactElement } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import type { BlankResult, SessionCard } from '@saulado/shared'
import { Button } from '@/components/ui/button'
import { CheckIcon, CloseIcon } from '@/components/ui/icons'
import { cn } from '@/lib/utils'

export interface FlashcardModeProps {
  card: SessionCard
  /** `null` until the card is graded; then one entry per blank. */
  results: BlankResult[] | null
  disabled: boolean
  onSubmit: (overrideValues?: Record<number, string>) => void
}

export function FlashcardMode({
  card,
  results,
  disabled,
  onSubmit,
}: FlashcardModeProps): ReactElement {
  const [isFlipped, setIsFlipped] = useState(false)
  const shouldReduceMotion = useReducedMotion()
  const isGraded = results !== null

  // Reset flip state when moving to a new card
  useEffect(() => {
    setIsFlipped(false)
  }, [card.cardId])

  const getAnswerForOrdinal = (ordinal: number): string => {
    if (card.blankAnswers && card.blankAnswers[ordinal]) {
      return card.blankAnswers[ordinal]
    }
    if (card.cardAnswers && card.cardAnswers[ordinal]) {
      return card.cardAnswers[ordinal].answerText
    }
    return 'Answer'
  }

  const handleFlip = (): void => {
    if (disabled || isGraded) return
    setIsFlipped(true)
  }

  const handleRate = (isCorrect: boolean): void => {
    if (disabled || isGraded) return

    const overrideValues: Record<number, string> = {}
    for (let i = 0; i < card.blankCount; i++) {
      overrideValues[i] = isCorrect ? getAnswerForOrdinal(i) : ''
    }

    onSubmit(overrideValues)
  }

  // Keyboard shortcut listener: Space to flip, 1 for Wrong, 2 for Correct
  useEffect(() => {
    if (disabled || isGraded) return

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.altKey || event.ctrlKey || event.metaKey) return
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return

      if (event.key === ' ' || event.code === 'Space') {
        if (!isFlipped) {
          event.preventDefault()
          handleFlip()
        }
      } else if (isFlipped) {
        if (event.key === '1') {
          event.preventDefault()
          handleRate(false)
        } else if (event.key === '2') {
          event.preventDefault()
          handleRate(true)
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [disabled, isGraded, isFlipped, card.blankCount])

  return (
    <div className="relative min-h-[320px] w-full [perspective:1200px]">
      <motion.div
        className="relative h-full min-h-[320px] w-full rounded-2xl border border-border bg-surface p-6 shadow-soft transition-shadow duration-200"
        style={{ transformStyle: 'preserve-3d' }}
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={
          shouldReduceMotion ? { duration: 0 } : { duration: 0.45, ease: [0.25, 1, 0.5, 1] }
        }
      >
        {/* ── FRONT FACE: Prompt / Question ── */}
        <div
          className={cn(
            'flex h-full min-h-[280px] flex-col justify-between [backface-visibility:hidden]',
            isFlipped && 'pointer-events-none opacity-0',
          )}
        >
          <div>
            <div className="mb-4 flex items-center justify-between border-b border-border/50 pb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Question
              </span>
              <span className="text-xs text-muted-foreground">
                {card.blankCount === 1 ? '1 blank' : `${String(card.blankCount)} blanks`}
              </span>
            </div>

            <p className="whitespace-pre-wrap text-base leading-loose sm:text-lg">
              {card.segments.map((segment, index) =>
                segment.kind === 'text' ? (
                  <span key={`t${String(index)}`}>{segment.text}</span>
                ) : (
                  <span
                    key={`b${String(segment.ordinal)}`}
                    className="mx-1 inline-block border-b-2 border-foreground align-baseline font-mono text-muted-foreground"
                    style={{ width: `${String(Math.max(5, segment.answerLength))}ch` }}
                    aria-label={`Blank ${String(segment.ordinal + 1)}`}
                  >
                    {'_'.repeat(Math.max(5, segment.answerLength))}
                  </span>
                ),
              )}
            </p>
          </div>

          <div className="mt-8 flex flex-col items-center gap-3 pt-4 border-t border-border/40">
            <Button
              type="button"
              size="lg"
              variant="outline"
              disabled={disabled || isGraded}
              onClick={handleFlip}
              className="w-full sm:w-auto px-8"
            >
              Reveal Answer <span className="ml-2 text-xs text-muted-foreground">(Space)</span>
            </Button>
          </div>
        </div>

        {/* ── BACK FACE: Answer & Self-Grading ── */}
        <div
          className={cn(
            'absolute inset-0 flex h-full flex-col justify-between p-6 [backface-visibility:hidden] [transform:rotateY(180deg)]',
            !isFlipped && 'pointer-events-none opacity-0',
          )}
        >
          <div>
            <div className="mb-4 flex items-center justify-between border-b border-border/50 pb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                Answer Revealed
              </span>
              <span className="text-xs text-muted-foreground">Recall in context</span>
            </div>

            <p className="whitespace-pre-wrap text-base leading-loose sm:text-lg">
              {card.segments.map((segment, index) =>
                segment.kind === 'text' ? (
                  <span key={`t${String(index)}`}>{segment.text}</span>
                ) : (
                  <span
                    key={`b${String(segment.ordinal)}`}
                    className="mx-1 inline-block rounded bg-highlight px-1.5 py-0.5 font-semibold text-highlight-foreground shadow-xs"
                  >
                    {getAnswerForOrdinal(segment.ordinal)}
                  </span>
                ),
              )}
            </p>
          </div>

          <div className="mt-8 pt-4 border-t border-border/40">
            {!isGraded ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  disabled={disabled}
                  onClick={() => handleRate(false)}
                  className="flex-1 border-danger/30 text-danger hover:bg-danger/10 hover:border-danger sm:flex-initial px-6"
                >
                  <CloseIcon className="mr-1.5" />
                  Wrong <span className="ml-1.5 text-xs text-muted-foreground">(1)</span>
                </Button>

                <Button
                  type="button"
                  size="lg"
                  variant="default"
                  disabled={disabled}
                  onClick={() => handleRate(true)}
                  className="flex-1 bg-success hover:bg-success/90 text-white sm:flex-initial px-6"
                >
                  <CheckIcon className="mr-1.5" />
                  Correct <span className="ml-1.5 text-xs text-white/80">(2)</span>
                </Button>
              </div>
            ) : (
              <div className="text-center text-sm font-medium text-muted-foreground">
                Answer evaluated. Press Enter to continue.
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  )
}
