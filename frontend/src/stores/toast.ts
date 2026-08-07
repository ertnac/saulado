import { create } from 'zustand'

export type ToastVariant = 'success' | 'error' | 'info'

export interface Toast {
  id: string
  message: string
  variant: ToastVariant
}

interface ToastState {
  toasts: Toast[]
  show: (message: string, variant?: ToastVariant) => void
  dismiss: (id: string) => void
}

/** Errors stay longest — they usually carry an instruction the user has to read. */
const DURATION_MS: Record<ToastVariant, number> = {
  success: 4000,
  info: 5000,
  error: 8000,
}

let counter = 0

/**
 * Toasts.
 *
 * A store rather than a context, so code outside the component tree (the API
 * layer, a route action) can raise one without being rendered inside a provider.
 *
 * Toasts are transient acknowledgement only. Anything the user must act on
 * belongs on the page itself — a message that erases itself after four seconds
 * is the wrong home for "your session expired, sign in again".
 */
export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  show: (message, variant = 'info') => {
    counter += 1
    const id = `toast-${String(counter)}`

    set((state) => ({ toasts: [...state.toasts, { id, message, variant }] }))

    setTimeout(() => {
      get().dismiss(id)
    }, DURATION_MS[variant])
  },

  dismiss: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
  },
}))

/** Imperative helper for call sites that are not components. */
export const toast = {
  success: (message: string) => {
    useToastStore.getState().show(message, 'success')
  },
  error: (message: string) => {
    useToastStore.getState().show(message, 'error')
  },
  info: (message: string) => {
    useToastStore.getState().show(message, 'info')
  },
}
