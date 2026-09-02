import { useId, useState, type DragEvent, type ReactElement } from 'react'
import { parseAndValidateJson, type ParsedImportResult } from '@saulado/shared'
import { Badge } from '@/components/ui/badge'
import { BrainSprite } from '@/components/ui/brand'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogActions } from '@/components/ui/dialog'
import { AlertIcon, CheckIcon, UploadIcon } from '@/components/ui/icons'
import { importSetsAndCards } from '@/services/transfer/json-import'
import { useQueryClient } from '@tanstack/react-query'
import { setKeys } from '../queries'
import { cn } from '@/lib/utils'

export interface UniversalImportDialogProps {
  open: boolean
  onClose: () => void
  targetSetId?: string
  targetSetTitle?: string
}

type Step = 'input' | 'preview' | 'importing' | 'complete'

export function UniversalImportDialog({
  open,
  onClose,
  targetSetId,
  targetSetTitle,
}: UniversalImportDialogProps): ReactElement {
  const [rawText, setRawText] = useState('')
  const [step, setStep] = useState<Step>('input')
  const [parseResult, setParseResult] = useState<ParsedImportResult | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [progressMsg, setProgressMsg] = useState('')
  const [progressVal, setProgressVal] = useState(0)
  const [summary, setSummary] = useState<{ importedSets: number; importedCards: number } | null>(
    null,
  )

  const textareaId = useId()
  const queryClient = useQueryClient()

  const handleValidate = (textToValidate: string): void => {
    setParseError(null)
    const result = parseAndValidateJson(textToValidate)
    if (result.success) {
      setParseResult(result.data)
      setStep('preview')
    } else {
      setParseError(result.error)
    }
  }

  const handleFileDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = () => {
        const text = typeof reader.result === 'string' ? reader.result : ''
        setRawText(text)
        handleValidate(text)
      }
      reader.readAsText(file)
    }
  }

  const handleExecuteImport = async (): Promise<void> => {
    if (!parseResult) return

    setStep('importing')
    setProgressVal(0)

    try {
      const result = await importSetsAndCards(
        parseResult,
        (current, total, message) => {
          setProgressVal(current / total)
          setProgressMsg(message)
        },
        targetSetId,
      )

      setSummary({
        importedSets: result.importedSets,
        importedCards: result.importedCards,
      })
      setStep('complete')
      await queryClient.invalidateQueries({ queryKey: setKeys.all })
    } catch {
      setParseError('An unexpected error occurred during import.')
      setStep('preview')
    }
  }

  const handleReset = (): void => {
    setRawText('')
    setParseResult(null)
    setParseError(null)
    setStep('input')
    setSummary(null)
  }

  const handleClose = (): void => {
    handleReset()
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={
        step === 'complete'
          ? 'Import Complete'
          : step === 'preview'
            ? 'Review & Confirm Import'
            : 'Import Deck / Cards (JSON, Anki, Markdown)'
      }
    >
      {step === 'input' && (
        <div className="space-y-4 pt-2">
          {/* File Drop Area */}
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleFileDrop}
            className={cn(
              'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors',
              isDragging
                ? 'border-primary bg-primary/10'
                : 'border-border bg-surface-muted/30 hover:border-primary/50',
            )}
          >
            <UploadIcon className="h-6 w-6 text-primary" />
            <p className="text-xs font-medium text-foreground">
              Drop a <code>.json</code> file here, or paste below
            </p>
            <p className="text-[11px] text-muted-foreground">
              Supports Saulado JSON, Anki cloze (<code>&#123;&#123;c1::...&#125;&#125;</code>), and
              Markdown (<code>[blank]</code>)
            </p>
          </div>

          {/* Text Area */}
          <div className="space-y-1.5">
            <label htmlFor={textareaId} className="text-xs font-semibold text-foreground">
              Paste JSON or card text:
            </label>
            <textarea
              id={textareaId}
              rows={8}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder='{"title": "My Set", "cards": [{"text": "The capital of France is [Paris]."}]}'
              className={cn(
                'w-full rounded-lg border border-border bg-surface p-3 font-mono text-xs text-foreground',
                'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20',
              )}
            />
          </div>

          {parseError && (
            <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
              <AlertIcon className="h-4 w-4 shrink-0 mt-0.5" />
              <p>{parseError}</p>
            </div>
          )}

          <DialogActions>
            <Button variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              variant="default"
              disabled={!rawText.trim()}
              onClick={() => handleValidate(rawText)}
            >
              Parse & Preview
            </Button>
          </DialogActions>
        </div>
      )}

      {step === 'preview' && parseResult && (
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between rounded-lg bg-surface-muted p-3 border border-border">
            <div>
              <p className="font-semibold text-sm text-foreground">
                Found {parseResult.sets.length} {parseResult.sets.length === 1 ? 'set' : 'sets'}{' '}
                with {parseResult.totalCards} cards
              </p>
              {targetSetTitle && (
                <p className="text-xs text-muted-foreground">
                  Importing directly into: <strong>{targetSetTitle}</strong>
                </p>
              )}
            </div>
            <Badge tone="accent">{parseResult.totalCards} Cards</Badge>
          </div>

          {/* Sets and Card Previews */}
          <div className="max-h-60 overflow-y-auto space-y-3 pr-1">
            {parseResult.sets.map((set, sIdx) => (
              <Card key={sIdx} className="p-3 border border-border/80">
                <p className="text-xs font-semibold text-foreground mb-2">
                  📁 {set.title} ({set.cards.length} cards)
                </p>
                <div className="space-y-1.5 pl-2 border-l-2 border-primary/30">
                  {set.cards.slice(0, 3).map((card, cIdx) => (
                    <p key={cIdx} className="text-xs text-muted-foreground truncate">
                      • {card.paragraph}
                    </p>
                  ))}
                  {set.cards.length > 3 && (
                    <p className="text-[11px] text-muted-foreground italic">
                      + {set.cards.length - 3} more cards…
                    </p>
                  )}
                </div>
              </Card>
            ))}
          </div>

          <DialogActions>
            <Button variant="ghost" onClick={() => setStep('input')}>
              Back
            </Button>
            <Button
              variant="default"
              onClick={() => {
                void handleExecuteImport()
              }}
            >
              Import {parseResult.totalCards} Cards
            </Button>
          </DialogActions>
        </div>
      )}

      {step === 'importing' && (
        <div className="space-y-4 py-6 text-center" aria-busy="true">
          <BrainSprite label={progressMsg} className="mx-auto h-14 w-14" />
          <div>
            <p className="font-semibold text-sm text-foreground">{progressMsg}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Saving sets and cards to your library…
            </p>
          </div>

          <progress
            className="h-2 w-full overflow-hidden rounded-full border-0 bg-surface-muted [&::-webkit-progress-bar]:bg-surface-muted [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary"
            value={progressVal}
            max={1}
            aria-label="Import progress"
          />
        </div>
      )}

      {step === 'complete' && summary && (
        <div className="space-y-4 py-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
            <CheckIcon className="h-6 w-6" />
          </div>

          <div>
            <h3 className="text-base font-semibold text-foreground">Import Successful!</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Successfully imported{' '}
              {summary.importedSets > 0 && (
                <>
                  <strong>{summary.importedSets}</strong>{' '}
                  {summary.importedSets === 1 ? 'set' : 'sets'} and{' '}
                </>
              )}
              <strong>{summary.importedCards}</strong> cards.
            </p>
          </div>

          <DialogActions>
            <Button variant="default" onClick={handleClose}>
              Done
            </Button>
          </DialogActions>
        </div>
      )}
    </Dialog>
  )
}
