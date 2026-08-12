import type { ReactElement } from 'react'
import type { StartableMode } from '@saulado/shared'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface ModePickerProps {
  selected: StartableMode
  onChange: (mode: StartableMode) => void
  onStart: () => void
  pending: boolean
}

export function ModePicker({
  selected,
  onChange,
  onStart,
  pending,
}: ModePickerProps): ReactElement {
  const modes: {
    id: StartableMode
    title: string
    description: string
    badge?: string
    icon: string
  }[] = [
    {
      id: 'spaced',
      title: 'Spaced Repetition',
      description: 'Reviews only the cards that are due, optimized for long-term retention.',
      badge: 'Recommended',
      icon: '🧠',
    },
    {
      id: 'sequential',
      title: 'Sequential Drill',
      description:
        'Study every card in the set, walking through them in the order they were created.',
      icon: '📖',
    },
    {
      id: 'shuffled',
      title: 'Shuffled Drill',
      description:
        'Study every card in the set, shuffled in a random order to challenge your recall.',
      icon: '🔀',
    },
  ]

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl text-foreground">
          Study Session Settings
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Pick a method to drill your cards. Only spaced repetition updates daily goals.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-1">
        {modes.map((mode) => {
          const active = selected === mode.id
          return (
            <Card
              key={mode.id}
              as="button"
              onClick={() => {
                onChange(mode.id)
              }}
              className={`group flex items-start text-left p-5 transition-all duration-200 border-2 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                active
                  ? 'border-primary bg-primary/5 shadow-soft scale-[1.01]'
                  : 'border-border bg-surface hover:border-muted-foreground/30 hover:scale-[1.005]'
              }`}
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-2xl group-hover:scale-110 transition-transform duration-200">
                {mode.icon}
              </div>
              <div className="ml-4 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <h3
                    className={`font-semibold text-base transition-colors ${active ? 'text-primary' : 'text-foreground'}`}
                  >
                    {mode.title}
                  </h3>
                  {mode.badge && (
                    <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-semibold text-accent-strong uppercase tracking-wider">
                      {mode.badge}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground leading-normal">
                  {mode.description}
                </p>
              </div>
            </Card>
          )
        })}
      </div>

      <div className="flex justify-center pt-2">
        <Button
          size="lg"
          className="w-full sm:w-64 shadow-soft py-6 rounded-full font-semibold text-base tracking-wide"
          onClick={onStart}
          disabled={pending}
        >
          {pending ? 'Starting…' : 'Start session'}
        </Button>
      </div>
    </div>
  )
}
