import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Catches render-time crashes.
 *
 * Still a class component: `componentDidCatch` has no hook equivalent, and this
 * is the one place in a modern React codebase where a class is the only option.
 *
 * Only render errors reach here. Async rejections and event-handler throws do
 * not — those surface through the API layer's `ApiError` handling instead.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Kept until a real error reporter exists. A crash that leaves no trace is
    // one that gets reported as "it just went white" and never reproduced.
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  override render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Something broke</h1>
        <p className="mt-2 text-muted-foreground">
          This is a bug on our side, not something you did.
        </p>

        {/*
          The message is shown, not hidden behind "an error occurred". It is the
          only thing a user can paste into a bug report, and it is already in
          their console anyway.
        */}
        <p className="mt-4 rounded-lg bg-surface-muted p-3 font-mono text-sm">{error.message}</p>

        <div className="mt-6 flex gap-3">
          {/*
            A full reload rather than clearing the error state. Whatever produced
            the crash is probably still in the component tree, so re-rendering it
            would land straight back here.
          */}
          <Button
            size="lg"
            onClick={() => {
              window.location.reload()
            }}
          >
            Reload the page
          </Button>
          <Button
            variant="soft"
            size="lg"
            onClick={() => {
              window.location.href = '/'
            }}
          >
            Go to dashboard
          </Button>
        </div>
      </main>
    )
  }
}
