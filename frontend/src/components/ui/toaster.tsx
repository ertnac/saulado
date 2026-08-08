import type { ComponentType, ReactElement } from 'react'
import { useToastStore, type ToastVariant } from '@/stores/toast'
import { cn } from '@/lib/utils'
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon, type IconProps } from './icons'

/** Colour is never the only signal — icon and text carry it too (saulado-ux §1.3). */
const ICON: Record<ToastVariant, ComponentType<IconProps>> = {
  success: CheckIcon,
  error: AlertIcon,
  info: InfoIcon,
}

const TONE: Record<ToastVariant, string> = {
  success: 'text-success',
  error: 'text-danger',
  info: 'text-info',
}

/** Screen readers get the kind of message, not just its text. */
const LABEL: Record<ToastVariant, string> = {
  success: 'Success',
  error: 'Error',
  info: 'Notice',
}

export function Toaster(): ReactElement {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  return (
    /**
     * `polite`, never `assertive`: assertive interrupts a screen reader
     * mid-sentence, which is precisely wrong when the user is typing a password.
     *
     * The region is always mounted rather than rendered only when a toast
     * exists. A live region inserted at the same moment as its content is
     * frequently not announced at all — the region has to be there first.
     */
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:bottom-auto sm:right-0 sm:top-0 sm:items-end"
    >
      {toasts.map((t) => {
        const VariantIcon = ICON[t.variant]
        return (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-border',
              'bg-surface p-4 shadow-lift',
            )}
          >
            <VariantIcon className={cn('mt-0.5', TONE[t.variant])} />
            <p className="flex-1 text-sm">
              <span className="sr-only">{LABEL[t.variant]}: </span>
              {t.message}
            </p>
            <button
              type="button"
              onClick={() => {
                dismiss(t.id)
              }}
              // 44px target (saulado-ux §7) without visually bloating the toast.
              className="-m-2 rounded-full p-2 text-muted-foreground hover:text-foreground"
              aria-label="Dismiss notification"
            >
              <CloseIcon />
            </button>
          </div>
        )
      })}
    </div>
  )
}
