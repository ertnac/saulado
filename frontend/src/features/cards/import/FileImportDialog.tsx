import { useEffect, useRef, useState, type DragEvent, type ReactElement } from 'react'
import type { AnswerRange } from '@saulado/shared'
import { BrainSprite } from '@/components/ui/brand'
import { Button } from '@/components/ui/button'
import { Dialog, DialogActions } from '@/components/ui/dialog'
import { AlertIcon, ImageIcon } from '@/components/ui/icons'
import { runOcrImportPipeline } from './OcrImportPipeline'
import { OcrReviewEditor } from './OcrReviewEditor'
import { cn } from '@/lib/utils'

export interface FileImportDialogProps {
  open: boolean
  onClose: () => void
  onImport: (questions: { text: string; answers: AnswerRange[] }[]) => void
}

type Stage =
  | { kind: 'idle' }
  | { kind: 'working'; progress: number; label: string }
  | { kind: 'error'; message: string }
  | { kind: 'review'; text: string }

export function FileImportDialog({ open, onClose, onImport }: FileImportDialogProps): ReactElement {
  const [stage, setStage] = useState<Stage>({ kind: 'idle' })
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const processFile = (file: File | undefined | null): void => {
    if (!file) return

    const controller = new AbortController()
    abortRef.current = controller
    setStage({ kind: 'working', progress: 0, label: 'Reading file…' })

    runOcrImportPipeline(
      file,
      (progress, label) => {
        if (!controller.signal.aborted) {
          setStage({
            kind: 'working',
            progress,
            label: label ?? 'Extracting text…',
          })
        }
      },
      controller.signal,
    )
      .then((extractedText) => {
        if (controller.signal.aborted) return
        const trimmed = extractedText.trim()
        if (trimmed.length === 0) {
          setStage({
            kind: 'error',
            message: 'No readable text could be found in that file.',
          })
        } else {
          setStage({ kind: 'review', text: trimmed })
        }
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setStage({
            kind: 'error',
            message:
              err instanceof Error
                ? err.message
                : 'Could not process that file. Please check your connection and try again.',
          })
        }
      })
  }

  // Handle Clipboard Paste (Ctrl+V / Cmd+V on window while dialog open)
  useEffect(() => {
    if (!open || stage.kind !== 'idle') return

    const onPaste = (event: ClipboardEvent): void => {
      const items = event.clipboardData?.items
      if (!items) return

      for (const item of items) {
        if (item.kind === 'file') {
          const file = item.getAsFile()
          if (file) {
            processFile(file)
            break
          }
        }
      }
    }

    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('paste', onPaste)
    }
  }, [open, stage.kind])

  const handleDragOver = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (): void => {
    setIsDragging(false)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  const handleClose = (): void => {
    abortRef.current?.abort()
    abortRef.current = null
    setStage({ kind: 'idle' })
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={
        stage.kind === 'review' ? 'Review Document & Highlight Cards' : 'Import Document / Image'
      }
    >
      {stage.kind === 'idle' && (
        <div className="space-y-4 pt-2">
          {/* Drag and Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-all',
              isDragging
                ? 'border-primary bg-primary/10 scale-[1.01]'
                : 'border-border bg-surface-muted/30 hover:border-primary/50 hover:bg-surface-muted/60',
            )}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ImageIcon className="h-6 w-6" />
            </div>

            <div>
              <p className="font-semibold text-sm sm:text-base text-foreground">
                Drop your file here, or browse
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Supports Images (PNG, JPG, WEBP) and Documents (PDF, TXT, MD)
              </p>
              <p className="mt-2 text-[11px] text-muted-foreground/80">
                You can also paste a screenshot directly with Ctrl+V / ⌘V
              </p>
            </div>

            <Button size="sm" variant="outline" className="mt-2 pointer-events-none">
              Choose File
            </Button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf,text/plain,text/markdown,.txt,.md,.pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) processFile(file)
              }}
            />
          </div>

          <DialogActions>
            <Button variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
          </DialogActions>
        </div>
      )}

      {stage.kind === 'working' && (
        <div className="space-y-4 py-6 text-center" aria-busy="true">
          <BrainSprite label={stage.label} className="mx-auto h-16 w-16" />
          <div>
            <p className="font-semibold text-foreground">{stage.label}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Processing runs in your browser without uploading your files.
            </p>
          </div>

          <progress
            className="h-2 w-full overflow-hidden rounded-full border-0 bg-surface-muted [&::-webkit-progress-bar]:bg-surface-muted [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary"
            value={stage.progress}
            max={1}
            aria-label="Extraction progress"
          />

          <DialogActions>
            <Button variant="ghost" size="sm" onClick={handleClose}>
              Cancel
            </Button>
          </DialogActions>
        </div>
      )}

      {stage.kind === 'error' && (
        <div className="space-y-4 pt-2">
          <div className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
            <AlertIcon className="h-5 w-5 shrink-0 mt-0.5" />
            <p>{stage.message}</p>
          </div>

          <DialogActions>
            <Button variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={() => {
                setStage({ kind: 'idle' })
              }}
            >
              Try Another File
            </Button>
          </DialogActions>
        </div>
      )}

      {stage.kind === 'review' && (
        <div className="mt-2 -mx-6 -mb-6">
          <OcrReviewEditor
            initialText={stage.text}
            onCommitCards={(cards) => {
              onImport(cards)
              handleClose()
            }}
            onCancel={handleClose}
          />
        </div>
      )}
    </Dialog>
  )
}
