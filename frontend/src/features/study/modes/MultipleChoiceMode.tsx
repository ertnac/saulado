import { useEffect, useState, type ReactElement } from 'react'
import { extractContextWords, type BlankResult, type SessionCard } from '@saulado/shared'
import { CheckIcon, CloseIcon } from '@/components/ui/icons'
import { cn } from '@/lib/utils'

export interface MultipleChoiceModeProps {
  card: SessionCard
  values: Record<number, string>
  /** `null` until the card is graded; then one entry per blank. */
  results: BlankResult[] | null
  disabled: boolean
  onChange: (ordinal: number, value: string) => void
  onSubmit: (overrideValues?: Record<number, string>) => void
}

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

export function MultipleChoiceMode({
  card,
  values,
  results,
  disabled,
  onChange,
  onSubmit,
}: MultipleChoiceModeProps): ReactElement {
  const [focusedOrdinal, setFocusedOrdinal] = useState(0)

  // Reset focused ordinal on card transition
  useEffect(() => {
    setFocusedOrdinal(0)
  }, [card.cardId])

  const byOrdinal = new Map(results?.map((result) => [result.ordinal, result]))
  const isGraded = results !== null

  // Extract full paragraph text for fallback context words if options are missing
  const paragraphText = card.segments.map((s) => (s.kind === 'text' ? s.text : '___')).join('')

  // Determine options for the focused blank
  const optionsForBlank: string[] = (() => {
    const rawOptions = card.blankOptions?.[focusedOrdinal]
    if (rawOptions && rawOptions.length > 0) return rawOptions

    // Fallback: extract context words from paragraph if backend did not provide blankOptions
    const fallbackWords = extractContextWords(paragraphText, [])
    const sample = fallbackWords.slice(0, 4)
    return sample.length > 0 ? sample : ['Option A', 'Option B', 'Option C', 'Option D']
  })()

  const handleSelectOption = (option: string): void => {
    if (disabled || isGraded) return

    const nextValues = { ...values, [focusedOrdinal]: option }
    onChange(focusedOrdinal, option)

    const isLastBlank = focusedOrdinal === card.blankCount - 1
    if (isLastBlank) {
      onSubmit(nextValues)
    } else {
      setFocusedOrdinal((prev) => prev + 1)
    }
  }

  // Keyboard shortcut support: 1-4 or A-D
  useEffect(() => {
    if (disabled || isGraded) return

    const onKeyDown = (event: KeyboardEvent): void => {
      // Ignore if typing inside an active input or holding modifiers
      if (event.altKey || event.ctrlKey || event.metaKey) return
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return

      const key = event.key.toUpperCase()
      let index = -1

      if (key === '1') index = 0
      else if (key === '2') index = 1
      else if (key === '3') index = 2
      else if (key === '4') index = 3
      else if (key === 'A') index = 0
      else if (key === 'B') index = 1
      else if (key === 'C') index = 2
      else if (key === 'D') index = 3

      if (index >= 0 && index < optionsForBlank.length) {
        const chosen = optionsForBlank[index]
        if (chosen) {
          event.preventDefault()
          handleSelectOption(chosen)
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [disabled, isGraded, optionsForBlank, focusedOrdinal, values, card.blankCount])

  const currentBlankResult = byOrdinal.get(focusedOrdinal)

  return (
    <div className="space-y-6">
      {/* ── Paragraph with In-Context Blanks ── */}
      <p className="whitespace-pre-wrap text-base leading-loose sm:text-lg">
        {card.segments.map((segment, index) => {
          if (segment.kind === 'text') {
            return <span key={`t${String(index)}`}>{segment.text}</span>
          }

          const ord = segment.ordinal
          const res = byOrdinal.get(ord)
          const val = values[ord]
          const isFocused = focusedOrdinal === ord && !isGraded

          if (res) {
            // Graded state
            return (
              <span
                key={`b${String(ord)}`}
                className={cn(
                  'mx-1 inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium',
                  res.correct
                    ? 'border border-success/40 bg-success/15 text-success'
                    : 'border border-danger/40 bg-danger/15 text-danger line-through',
                )}
              >
                {res.canonical || res.submitted || '—'}
              </span>
            )
          }

          if (val) {
            // Answer selected for this blank
            return (
              <button
                type="button"
                key={`b${String(ord)}`}
                onClick={() => setFocusedOrdinal(ord)}
                className={cn(
                  'mx-1 inline-flex items-center rounded-md px-2.5 py-0.5 font-medium transition-colors',
                  isFocused
                    ? 'border-2 border-primary bg-primary/10 text-primary'
                    : 'border border-border bg-surface-muted text-foreground hover:border-primary/50',
                )}
              >
                {val}
              </button>
            )
          }

          // Unanswered blank slot
          return (
            <button
              type="button"
              key={`b${String(ord)}`}
              onClick={() => setFocusedOrdinal(ord)}
              className={cn(
                'mx-1 inline-block min-w-[5ch] border-b-2 align-baseline transition-all',
                isFocused
                  ? 'border-primary bg-primary/10 text-primary font-semibold'
                  : 'border-muted-foreground/50 hover:border-foreground',
              )}
              style={{ width: `${String(Math.max(5, segment.answerLength))}ch` }}
              aria-label={`Blank ${String(ord + 1)} of ${String(card.blankCount)}`}
            />
          )
        })}
      </p>

      {/* ── Multiple Choice Options Grid ── */}
      <div className="border-t border-border/60 pt-5">
        {card.blankCount > 1 && (
          <div className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Options for Blank {focusedOrdinal + 1}</span>
            <span className="text-primary font-medium">
              {focusedOrdinal + 1} of {card.blankCount}
            </span>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {optionsForBlank.map((option, index) => {
            const letter = OPTION_LETTERS[index] ?? String(index + 1)
            const isSelected = values[focusedOrdinal] === option

            const isCanonical =
              isGraded &&
              Boolean(currentBlankResult?.canonical) &&
              option.toLowerCase().trim() === currentBlankResult?.canonical.toLowerCase().trim()

            const isSelectedWrong = isGraded && isSelected && !currentBlankResult?.correct
            const isUnselectedOther = isGraded && !isCanonical && !isSelected

            let buttonClass =
              'border-border bg-surface hover:border-primary/60 hover:bg-surface-muted text-foreground'
            let badgeClass = 'bg-surface-muted text-muted-foreground border-border/80'

            if (isGraded) {
              if (isCanonical) {
                buttonClass = 'border-success bg-success/15 text-success font-semibold shadow-xs'
                badgeClass = 'bg-success text-success-foreground border-success'
              } else if (isSelectedWrong) {
                buttonClass = 'border-danger bg-danger/15 text-danger font-semibold'
                badgeClass = 'bg-danger text-white border-danger'
              } else if (isUnselectedOther) {
                buttonClass = 'border-border/40 bg-surface/50 text-muted-foreground opacity-45'
                badgeClass = 'bg-transparent text-muted-foreground/60 border-border/40'
              }
            } else if (isSelected) {
              buttonClass =
                'border-primary bg-primary/10 text-primary font-semibold ring-2 ring-primary/20'
              badgeClass = 'bg-primary text-primary-foreground border-primary'
            }

            return (
              <button
                key={`${index}-${option}`}
                type="button"
                disabled={disabled || isGraded}
                onClick={() => handleSelectOption(option)}
                aria-label={`Option ${letter}: ${option}`}
                aria-pressed={isSelected}
                className={cn(
                  'flex min-h-[52px] items-center justify-between gap-3 rounded-xl border p-3.5 text-left text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  buttonClass,
                  disabled && !isGraded && 'opacity-50 cursor-not-allowed',
                )}
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold transition-colors',
                      badgeClass,
                    )}
                  >
                    {letter}
                  </span>
                  <span className="min-w-0 flex-1 break-words font-medium">{option}</span>
                </div>

                {isCanonical && (
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success/20 text-success">
                    <CheckIcon />
                  </span>
                )}
                {isSelectedWrong && (
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-danger/20 text-danger">
                    <CloseIcon />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
