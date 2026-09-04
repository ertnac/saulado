import { useEffect, useId, useRef, type ReactElement, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { DUR, EASE, SPRING } from '@/lib/motion'
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

/**
 * The focusable controls inside the panel, in Tab order.
 *
 * `hidden` ones are dropped: the selector matches them, but the browser will
 * not focus them, so leaving one at either end of this list makes Tab wrap onto
 * nothing and strand the user. A hidden `<input type="file">` behind a real
 * button is the common case.
 */
function focusable(panel: HTMLElement | null): HTMLElement[] {
  return Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
    (node) => !node.hidden,
  )
}

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
    const first = focusable(panel)[0]
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

      const nodes = focusable(panelRef.current)
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

  /**
   * Enter only, no exit.
   *
   * Wrapping the panel in `AnimatePresence` would keep it mounted after close
   * while the exit ran, and the dialog is asserted gone immediately after the
   * closing click in several places — an exit animation would turn those into
   * timing races for the sake of a transition nobody watches. The panel is
   * unmounted by the `open` guard above, as it always was.
   */
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      {/*
        Presentational: the Escape handler and the Cancel button are the
        accessible ways out, and a focusable overlay would be one more stop
        between the user and the form.
      */}
      <motion.div
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
        aria-hidden="true"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: DUR.base, ease: EASE }}
      />

      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={description ? `${id}-description` : undefined}
        tabIndex={-1}
        /*
          Scale only, deliberately not opacity. A panel that fades in is reported
          as invisible for as long as its opacity is under one, which is exactly
          what a test asserting the dialog is showing would catch — and a
          modal appearing over a backdrop that is itself fading needs no second
          fade to read as arriving.
        */
        initial={{ scale: 0.96 }}
        animate={{ scale: 1 }}
        transition={SPRING}
        // `.clay-raised` owns the fill, the shadow and the 1.5rem radius, so the
        // `bg-surface` and `shadow-lift` utilities that used to are gone. The
        // bottom corners are squared off below `sm`, where the panel is a sheet
        // sitting flush against the bottom edge of the screen.
        className="clay-raised relative w-full max-w-lg rounded-b-none p-6 sm:rounded-b-3xl"
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
      </motion.div>
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
        <Button variant="ghost" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        {/*
          Cancel is first in DOM order, so it is what focus lands on when the
          dialog opens — the safe default for a destructive prompt.

          `danger` rather than a borrowed `--warning` fill: the highlight editor
          already spends warning on a rejected selection, and "this cannot be
          highlighted" must not look like "this will erase your account".
        */}
        <Button variant="danger" onClick={onConfirm} disabled={pending}>
          {pending ? 'Working…' : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
