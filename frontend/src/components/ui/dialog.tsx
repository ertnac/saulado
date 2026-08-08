import { useEffect, useId, useRef, type ReactElement, type ReactNode } from 'react'
import { Button } from './button'

/**
 * A modal dialog, hand-rolled against the native focus rules.
 *
 * No `<dialog>` element: `showModal()` cannot be driven from a React `open` prop
 * without an effect that fights the browser's own state, and jsdom does not
 * implement it, so every test touching one would need a polyfill.
 *
 * What a modal actually has to get right is focus (saulado-ux §6): move focus in
 * on open, keep Tab inside while open, restore it to the trigger on close. A
 * dialog that leaves focus behind it drops a keyboard user onto the page under
 * the overlay, where their Tab presses land on controls they cannot see.
 */

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  /** Optional supporting line, wired to `aria-describedby`. */
  description?: string
  children: ReactNode
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
}: DialogProps): ReactElement | null {
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return

    // Captured before focus moves, so closing returns the user to whatever they
    // opened this from rather than to the top of the document.
    restoreRef.current = document.activeElement as HTMLElement | null

    const panel = panelRef.current
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE)
    // The panel itself is the fallback: a dialog whose body is all text still has
    // to receive focus, or the screen reader keeps reading the page behind it.
    ;(first ?? panel)?.focus()

    return () => {
      restoreRef.current?.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key !== 'Tab') return

      const nodes = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
      if (nodes.length === 0) return

      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (!first || !last) return

      // Wrapping by hand, because the browser's Tab order does not know the rest
      // of the page is inert — without this, Tab from the last control walks out
      // into the page behind the overlay.
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      {/*
        Presentational: the Escape handler and the Cancel button are the
        accessible ways out, and a focusable overlay would be one more stop
        between the user and the form.
      */}
      <div className="absolute inset-0 bg-foreground/40" aria-hidden="true" onClick={onClose} />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={description ? `${id}-description` : undefined}
        tabIndex={-1}
        // Full-width sheet on mobile, centred card from sm up — a centred modal at
        // 320px leaves no room for the form inside it.
        className="relative w-full max-w-lg rounded-t-lg border border-border bg-background p-5 shadow-lg sm:rounded-lg"
      >
        <h2 id={`${id}-title`} className="text-lg font-semibold tracking-tight">
          {title}
        </h2>

        {description && (
          <p id={`${id}-description`} className="mt-1 text-sm text-muted-foreground">
            {description}
          </p>
        )}

        <div className="mt-4">{children}</div>
      </div>
    </div>
  )
}

/** The footer row every dialog in the app ends with, so spacing cannot drift. */
export function DialogActions({ children }: { children: ReactNode }): ReactElement {
  return <div className="mt-5 flex flex-wrap justify-end gap-2">{children}</div>
}

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: string
  confirmLabel: string
  pending?: boolean
}

/**
 * Confirmation for something irreversible.
 *
 * Used for delete, not for archive: archive is reversible, and a confirm on a
 * reversible action trains people to click through confirms they should read.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  pending = false,
}: ConfirmDialogProps): ReactElement {
  return (
    <Dialog open={open} onClose={onClose} title={title} description={description}>
      <DialogActions>
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        {/*
          Cancel is first in DOM order, so it is what focus lands on when the
          dialog opens — the safe default for a destructive prompt.
        */}
        <Button
          className="bg-warning text-background hover:opacity-90"
          onClick={onConfirm}
          disabled={pending}
        >
          {pending ? 'Working…' : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
