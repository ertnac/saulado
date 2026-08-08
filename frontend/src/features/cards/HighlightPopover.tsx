import { useEffect, useRef, useState, type ReactElement } from 'react'
import { ALT_ANSWERS_MAX_PER_ANSWER } from '@saulado/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CloseIcon } from '@/components/ui/icons'
import type { EditorAnswer } from './useCardDraft'

/**
 * Options for one highlight: remove it, or give it alternative accepted answers
 * (plan §3.3).
 *
 * Rendered as an inline panel below the paragraph rather than a floating popover
 * anchored to the mark. Two reasons: a popover positioned over the text covers
 * the very words the user is deciding about, and on a phone it competes with the
 * selection handles and the keyboard for the same space. Inline costs a little
 * vertical room and avoids both.
 *
 * Alternatives are how "CPU" also accepts "processor". They matter most for the
 * answers people get wrong for the wrong reason — a synonym is not a memory
 * failure, and marking it wrong teaches the user to distrust the app.
 */

interface HighlightPopoverProps {
  answer: EditorAnswer
  onRemove: (ordinal: number) => void
  onChangeAlts: (ordinal: number, alts: string[]) => void
  onClose: () => void
}

export function HighlightPopover({
  answer,
  onRemove,
  onChangeAlts,
  onClose,
}: HighlightPopoverProps): ReactElement {
  const [pending, setPending] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus moves into the panel on open, so a keyboard user who pressed Enter on
  // a highlight lands where the actions are instead of being left behind on the
  // paragraph with an invisible panel open below.
  useEffect(() => {
    inputRef.current?.focus()
  }, [answer.ordinal])

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  const alts = answer.altAnswers
  const atLimit = alts.length >= ALT_ANSWERS_MAX_PER_ANSWER

  const addAlt = (): void => {
    const value = pending.trim()
    if (!value || atLimit) return

    // Case-insensitive de-dup, and never an alternative identical to the answer
    // itself — both would be dead entries in the checker's ladder.
    const existing = new Set([answer.answerText.toLowerCase(), ...alts.map((a) => a.toLowerCase())])
    if (existing.has(value.toLowerCase())) {
      setPending('')
      return
    }

    onChangeAlts(answer.ordinal, [...alts, value])
    setPending('')
  }

  return (
    <div
      role="dialog"
      aria-label={`Options for blank ${String(answer.ordinal + 1)}`}
      className="space-y-3 rounded-lg bg-surface-muted p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            Blank {answer.ordinal + 1}:{' '}
            <span className="rounded bg-highlight px-1 text-highlight-foreground">
              {answer.answerText}
            </span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add other spellings you would accept as correct.
          </p>
        </div>

        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close blank options">
          Done
        </Button>
      </div>

      {alts.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {alts.map((alt) => (
            <li key={alt}>
              <span className="inline-flex items-center gap-0.5 rounded-full bg-surface py-1 pl-3 pr-1.5 text-sm shadow-soft">
                {alt}
                <button
                  type="button"
                  onClick={() => {
                    onChangeAlts(
                      answer.ordinal,
                      alts.filter((a) => a !== alt),
                    )
                  }}
                  aria-label={`Remove alternative ${alt}`}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:text-foreground"
                >
                  <CloseIcon className="h-3.5 w-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <Input
          ref={inputRef}
          value={pending}
          onChange={(event) => {
            setPending(event.target.value)
          }}
          onKeyDown={(event) => {
            // Enter adds the alternative rather than submitting the card — this
            // panel is usually rendered inside the card <form>.
            if (event.key === 'Enter') {
              event.preventDefault()
              addAlt()
            }
          }}
          disabled={atLimit}
          placeholder={atLimit ? 'Limit reached' : 'e.g. processor'}
          aria-label={`Alternative answer for blank ${String(answer.ordinal + 1)}`}
        />
        <Button variant="soft" onClick={addAlt} disabled={!pending.trim() || atLimit}>
          Add
        </Button>
      </div>

      {/*
        `danger`, not `warning`. Warning in this editor means "that selection
        cannot become a blank" — a rejection the user should try again after.
        Removing a blank is destructive, and the two must not look alike.
      */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          onRemove(answer.ordinal)
          onClose()
        }}
        className="text-danger"
      >
        Remove this blank
      </Button>
    </div>
  )
}
