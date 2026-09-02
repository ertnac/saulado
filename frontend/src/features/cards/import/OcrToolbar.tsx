import type { ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { SparkIcon } from '@/components/ui/icons'
import { cn } from '@/lib/utils'

export interface OcrToolbarProps {
  mode: 'edit' | 'highlight'
  onModeChange: (mode: 'edit' | 'highlight') => void
  onInsertSymbol: (symbol: string) => void
  onAutoClean: () => void
  onReset: () => void
  disabled?: boolean
  wordCount: number
  paragraphCount: number
}

export const QUICK_SYMBOLS = [
  { label: '•', value: '• ', title: 'Bullet' },
  { label: '—', value: '—', title: 'Em Dash' },
  { label: '→', value: '→', title: 'Arrow' },
  { label: '±', value: '±', title: 'Plus-Minus' },
  { label: '²', value: '²', title: 'Squared' },
  { label: '³', value: '³', title: 'Cubed' },
  { label: '°', value: '°', title: 'Degree' },
  { label: '≈', value: '≈', title: 'Approx' },
  { label: '≠', value: '≠', title: 'Not Equal' },
  { label: '≤', value: '≤', title: 'Less or Equal' },
  { label: '≥', value: '≥', title: 'Greater or Equal' },
  { label: '℃', value: '℃', title: 'Celsius' },
  { label: 'π', value: 'π', title: 'Pi' },
  { label: '✓', value: '✓', title: 'Check' },
]

export function OcrToolbar({
  mode,
  onModeChange,
  onInsertSymbol,
  onAutoClean,
  onReset,
  disabled = false,
  wordCount,
  paragraphCount,
}: OcrToolbarProps): ReactElement {
  return (
    <div className="space-y-3 border-b border-border/60 bg-surface-muted/40 p-3.5 sm:p-4 rounded-t-xl">
      {/* ── Top Bar: Mode Switcher & Actions ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Mode Toggle */}
        <div
          role="radiogroup"
          aria-label="Document review mode"
          className="inline-flex gap-1 rounded-full border border-border/50 bg-surface-muted p-1"
        >
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'edit'}
            aria-label="Edit text mode"
            disabled={disabled}
            onClick={() => onModeChange('edit')}
            className={cn(
              'inline-flex h-7.5 items-center justify-center rounded-full px-3 text-xs font-medium transition-colors',
              mode === 'edit'
                ? 'bg-surface text-foreground shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            1. Edit Text
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'highlight'}
            aria-label="Highlight cards mode"
            disabled={disabled}
            onClick={() => onModeChange('highlight')}
            className={cn(
              'inline-flex h-7.5 items-center justify-center rounded-full px-3 text-xs font-medium transition-colors',
              mode === 'highlight'
                ? 'bg-primary text-primary-foreground shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            2. Highlight Cards
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={onAutoClean}
            title="Auto-fix common OCR errors, broken words, and symbols"
            className="h-8 text-xs px-2.5 sm:px-3"
          >
            <SparkIcon className="mr-1 text-accent-strong" />
            Auto-Clean OCR
          </Button>

          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={onReset}
            title="Reset to original text"
            className="h-8 text-xs px-2 sm:px-2.5 text-muted-foreground"
          >
            Reset
          </Button>

          {/* Counts */}
          <div className="hidden sm:flex items-center gap-2 border-l border-border/60 pl-3 text-xs text-muted-foreground">
            <span>{wordCount} words</span>
            <span>·</span>
            <span>
              {paragraphCount} {paragraphCount === 1 ? 'card paragraph' : 'card paragraphs'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Quick Symbols Strip (Active in Edit mode) ── */}
      {mode === 'edit' && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mr-1">
            Insert Symbol:
          </span>
          {QUICK_SYMBOLS.map((sym) => (
            <button
              key={sym.title}
              type="button"
              disabled={disabled}
              title={sym.title}
              aria-label={`Insert ${sym.title} symbol`}
              onClick={() => onInsertSymbol(sym.value)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/60 bg-surface text-xs font-mono text-foreground hover:bg-surface-muted hover:border-primary/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {sym.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
