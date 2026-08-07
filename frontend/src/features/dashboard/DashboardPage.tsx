import type { ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth'

/**
 * The Phase 2 dashboard.
 *
 * Genuinely empty, on purpose. There are no sets or cards until Phase 3, so this
 * teaches what a cloze card *is* rather than rendering charts full of zeroes —
 * a zeroed chart reads as "this app is broken" to a new user (saulado-ux §5).
 *
 * No streak or due-count either. Both would be honest zeroes and both would be
 * discouraging on day one, and neither has data behind it yet.
 */

function ExampleCard(): ReactElement {
  return (
    <div className="rounded-lg border border-border p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        What a card looks like
      </p>

      <p className="mt-3 text-base leading-relaxed">
        The{' '}
        {/*
          Fixed-width blank (saulado-ux §1.1): 8ch regardless of the answer, so
          the gap never hints at the length of the word. Even in a static
          illustration — this is the shape the real thing has to keep.
        */}
        <span
          className="mx-0.5 inline-block border-b-2 border-foreground align-baseline"
          style={{ width: '8ch' }}
          aria-label="blank 1 of 1"
        />{' '}
        is the brain of the computer, carrying out the instructions of a program.
      </p>

      <p className="mt-4 text-sm text-muted-foreground">
        You write the paragraph, highlight <span className="font-medium">CPU</span>, and Saulado
        turns it into a question that keeps the sentence around it. Recall in context, not from a
        bare flashcard.
      </p>
    </div>
  )
}

export function DashboardPage(): ReactElement {
  const user = useAuthStore((s) => s.user)

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {user ? `Welcome, ${user.email.split('@')[0] ?? 'there'}` : 'Welcome'}
        </h1>
        <p className="mt-1 text-muted-foreground">
          You&apos;re signed in. Study sets arrive in the next phase.
        </p>
      </header>

      <section aria-labelledby="empty-heading" className="space-y-4">
        <h2 id="empty-heading" className="text-sm font-medium uppercase tracking-wide">
          Nothing to study yet
        </h2>

        <ExampleCard />

        <div className="rounded-lg border border-dashed border-border p-5">
          <p className="text-sm text-muted-foreground">
            Creating sets and cards is Phase 3. Until then this is the shell: sign out, reload the
            page, and you should land right back here.
          </p>
          {/* Disabled rather than absent, so the shape of the app is visible. */}
          <Button className="mt-4" size="lg" disabled title="Available in Phase 3">
            Create your first set
          </Button>
        </div>
      </section>
    </div>
  )
}
