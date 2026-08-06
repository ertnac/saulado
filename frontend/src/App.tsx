import type { ReactElement } from 'react'
import type { HealthResponse } from '@saulado/shared'
import { Button } from '@/components/ui/button'
import { useHealth } from '@/hooks/useHealth'
import { cn } from '@/lib/utils'

function StatusRow({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-2 last:border-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="font-mono text-sm">{value}</dd>
    </div>
  )
}

function HealthCard({ data }: { data: HealthResponse }): ReactElement {
  const connected = data.database === 'connected'

  return (
    <div className="rounded-lg border border-border p-5">
      {/* Icon + text alongside colour — never colour alone (saulado-ux §1.3). */}
      <div
        className={cn(
          'mb-4 flex items-center gap-2 font-medium',
          connected ? 'text-[hsl(var(--success))]' : 'text-[hsl(var(--warning))]',
        )}
      >
        <span aria-hidden="true">{connected ? '✓' : '!'}</span>
        <span>{connected ? 'Database connected' : 'Database unreachable'}</span>
      </div>

      <dl>
        <StatusRow label="Status" value={data.status} />
        <StatusRow label="Database" value={data.database} />
        <StatusRow
          label="DB latency"
          value={data.databaseLatencyMs === null ? '—' : `${String(data.databaseLatencyMs)} ms`}
        />
        <StatusRow label="Uptime" value={`${String(data.uptimeSeconds)} s`} />
        <StatusRow label="Version" value={data.version} />
      </dl>

      {!connected && (
        <p className="mt-4 rounded-md bg-muted p-3 text-sm text-muted-foreground">
          The API is running but Postgres did not answer. Start it with{' '}
          <code className="font-mono">pnpm db:up</code>, then run{' '}
          <code className="font-mono">pnpm db:migrate</code>.
        </p>
      )}
    </div>
  )
}

export function App(): ReactElement {
  const { state, refresh } = useHealth()

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Saulado</h1>
        <p className="mt-1 text-muted-foreground">Learn in Context. Remember for Life.</p>
      </header>

      <section aria-labelledby="health-heading">
        <h2 id="health-heading" className="mb-3 text-sm font-medium uppercase tracking-wide">
          Walking skeleton
        </h2>

        {/* Announce transitions without interrupting (saulado-ux §6). */}
        <div aria-live="polite" aria-busy={state.kind === 'loading'}>
          {state.kind === 'loading' && (
            <div className="rounded-lg border border-border p-5">
              <div className="h-5 w-40 animate-pulse rounded bg-muted" />
              <div className="mt-4 space-y-3">
                <div className="h-4 w-full animate-pulse rounded bg-muted" />
                <div className="h-4 w-full animate-pulse rounded bg-muted" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
              </div>
              <span className="sr-only">Checking API health</span>
            </div>
          )}

          {state.kind === 'error' && (
            <div className="rounded-lg border border-border p-5">
              <p className="font-medium text-[hsl(var(--warning))]">
                <span aria-hidden="true">! </span>Cannot reach the API
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{state.message}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Start it with <code className="font-mono">pnpm dev</code>.
              </p>
            </div>
          )}

          {state.kind === 'ready' && <HealthCard data={state.data} />}
        </div>

        <Button onClick={refresh} variant="outline" className="mt-4">
          Check again
        </Button>
      </section>
    </main>
  )
}
