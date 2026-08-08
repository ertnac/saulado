import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { buttonClass } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth'

/**
 * The dashboard.
 *
 * Still deliberately spare. It teaches what a cloze card *is* rather than
 * rendering charts full of zeroes — a zeroed chart reads as "this app is broken"
 * to a new user (saulado-ux §5).
 *
 * No streak or due-count yet: review scheduling is Phase 4, so both numbers would
 * be honest zeroes with nothing behind them, and both would be discouraging on day
 * one. The CTA now points at the real library.
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
          Build a set, highlight what matters, and study it in context.
        </p>
      </header>

      <section aria-labelledby="empty-heading" className="space-y-4">
        <h2 id="empty-heading" className="text-sm font-medium uppercase tracking-wide">
          Nothing to study yet
        </h2>

        <ExampleCard />

        <div className="rounded-lg border border-dashed border-border p-5">
          <p className="text-sm text-muted-foreground">
            A set holds cards on one subject. Each card is a paragraph of your own notes with the
            words worth recalling blanked out.
          </p>
          <Link className={buttonClass({ size: 'lg', className: 'mt-4' })} to="/sets">
            Create your first set
          </Link>
        </div>
      </section>
    </div>
  )
}
