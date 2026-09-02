import { useState, useMemo, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AnsweringType, StudySet } from '@saulado/shared'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  BookOpenIcon,
  CardsIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ListIcon,
  PencilIcon,
  SearchIcon,
  SparklesIcon,
  ZapIcon,
} from '@/components/ui/icons'
import { useSets } from '@/features/cards/queries'
import { cn } from '@/lib/utils'

export interface QuickLearnDialogProps {
  open: boolean
  onClose: () => void
  initialSetId?: string | null
}

type Step = 'choose-set' | 'choose-mode'

interface ModeOption {
  type: AnsweringType
  title: string
  subtitle: string
  badge: string
  icon: ReactElement
  description: string
  hotkey: string
}

const STUDY_MODES: ModeOption[] = [
  {
    type: 'identification',
    title: 'Type-In Mode',
    subtitle: 'Identification & spelling recall',
    badge: 'Active Recall',
    icon: <PencilIcon className="h-5 w-5" />,
    description: 'Type the missing cloze words from memory. Tolerates minor spelling typos.',
    hotkey: 'T',
  },
  {
    type: 'multiple-choice',
    title: 'Quiz Mode',
    subtitle: 'Multiple choice options',
    badge: 'Fast Pace',
    icon: <ListIcon className="h-5 w-5" />,
    description: 'Select the correct answer from 4 context-aware distractors. Use 1–4 keys.',
    hotkey: 'Q',
  },
  {
    type: 'flashcard',
    title: 'Flashcards',
    subtitle: 'Flip & self-rate confidence',
    badge: 'Classic Spaced',
    icon: <CardsIcon className="h-5 w-5" />,
    description: 'Flip the card to reveal blanks and grade your recall: Again, Hard, Good, Easy.',
    hotkey: 'F',
  },
]

export function QuickLearnDialog({
  open,
  onClose,
  initialSetId = null,
}: QuickLearnDialogProps): ReactElement {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>(initialSetId ? 'choose-mode' : 'choose-set')
  const [selectedSet, setSelectedSet] = useState<StudySet | null>(null)
  const [selectedMode, setSelectedMode] = useState<AnsweringType>('identification')
  const [search, setSearch] = useState('')
  const [parentSet, setParentSet] = useState<StudySet | null>(null)

  const rootSetsQuery = useSets({ parent: null })
  const childSetsQuery = useSets({ parent: parentSet?.id ?? null })

  const activeQuery = parentSet ? childSetsQuery : rootSetsQuery
  const rawSets = useMemo(
    () => activeQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [activeQuery.data],
  )

  const filteredSets = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rawSets
    return rawSets.filter((s) => s.title.toLowerCase().includes(q))
  }, [rawSets, search])

  const handleSelectAllDue = (): void => {
    setSelectedSet(null)
    setStep('choose-mode')
  }

  const handleSelectSet = (set: StudySet): void => {
    setSelectedSet(set)
    setStep('choose-mode')
  }

  const handleStartStudy = (modeToUse = selectedMode): void => {
    onClose()
    const targetSetId = selectedSet?.id ?? initialSetId
    const query = new URLSearchParams()
    if (targetSetId) {
      query.set('set', targetSetId)
    }
    query.set('type', modeToUse)

    void navigate(`/study?${query.toString()}`)
  }

  const handleReset = (): void => {
    setStep('choose-set')
    setSelectedSet(null)
    setParentSet(null)
    setSearch('')
  }

  const handleClose = (): void => {
    onClose()
    setTimeout(handleReset, 200)
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={step === 'choose-set' ? 'Quick Learn — Choose Study Scope' : 'Choose Answering Mode'}
      description={
        step === 'choose-set'
          ? 'Select a study set or review all due flashcards across your library.'
          : `Pick your answering format for ${selectedSet ? selectedSet.title : 'all due cards'}.`
      }
    >
      <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
        {step === 'choose-set' ? (
          <div className="space-y-3">
            {/* All Due Cards Option */}
            {!parentSet && (
              <button
                type="button"
                onClick={handleSelectAllDue}
                className="w-full text-left p-4 rounded-xl border border-primary/30 bg-primary/10 hover:bg-primary/15 transition-all flex items-center justify-between gap-3 group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                    <ZapIcon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground text-sm flex items-center gap-2">
                      All Due Flashcards
                      <Badge tone="accent">Recommended</Badge>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Review all scheduled cards across all decks in one spaced session.
                    </p>
                  </div>
                </div>
                <ChevronRightIcon className="h-5 w-5 text-primary shrink-0 transition-transform group-hover:translate-x-0.5" />
              </button>
            )}

            {/* Breadcrumb / Drilled Header */}
            {parentSet && (
              <div className="flex items-center gap-2 pb-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setParentSet(null)}
                  className="h-8 px-2"
                >
                  <ChevronLeftIcon className="h-4 w-4 mr-1" />
                  All Sets
                </Button>
                <span className="text-xs text-muted-foreground">/</span>
                <span className="text-xs font-semibold text-foreground truncate">
                  {parentSet.title}
                </span>
              </div>
            )}

            {/* Set Search */}
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                <SearchIcon className="h-4 w-4" />
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search study sets…"
                className="w-full rounded-xl border border-border bg-surface pl-9 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* Set List */}
            <div className="space-y-2 pt-1">
              {activeQuery.isPending ? (
                <div className="space-y-2">
                  <Skeleton className="h-16 rounded-xl" />
                  <Skeleton className="h-16 rounded-xl" />
                  <Skeleton className="h-16 rounded-xl" />
                </div>
              ) : filteredSets.length === 0 ? (
                <div className="py-8 text-center space-y-2">
                  <p className="text-sm font-medium text-foreground">No study sets found</p>
                  <p className="text-xs text-muted-foreground">
                    {search
                      ? 'Try another search term.'
                      : 'Create a set first or import starter decks to start studying.'}
                  </p>
                </div>
              ) : (
                filteredSets.map((set) => (
                  <div
                    key={set.id}
                    className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-border bg-surface hover:border-primary/40 hover:bg-surface-muted/40 transition-all group"
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectSet(set)}
                      className="flex-1 text-left min-w-0"
                    >
                      <div className="flex items-center gap-2">
                        <BookOpenIcon className="h-4 w-4 text-primary shrink-0" />
                        <span className="font-semibold text-sm text-foreground truncate">
                          {set.title}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 tabular-nums">
                        {set.cardCount} {set.cardCount === 1 ? 'card' : 'cards'}
                        {set.childCount > 0 ? ` · ${set.childCount} sub-sets` : ''}
                      </p>
                    </button>

                    <div className="flex items-center gap-2 shrink-0">
                      {set.childCount > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setParentSet(set)}
                          className="h-8 px-2 text-xs"
                        >
                          Sub-sets
                          <ChevronRightIcon className="h-3.5 w-3.5 ml-1" />
                        </Button>
                      )}
                      <Button
                        variant="accent"
                        size="sm"
                        onClick={() => handleSelectSet(set)}
                        className="h-8 px-3 text-xs"
                      >
                        Select
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep('choose-set')}
                className="h-8 px-2"
              >
                <ChevronLeftIcon className="h-4 w-4 mr-1" />
                Change Set
              </Button>
              <Badge tone="accent">{selectedSet ? selectedSet.title : 'All Due Flashcards'}</Badge>
            </div>

            <div className="space-y-3">
              {STUDY_MODES.map((mode) => {
                const isSelected = selectedMode === mode.type
                return (
                  <Card
                    key={mode.type}
                    onClick={() => {
                      setSelectedMode(mode.type)
                    }}
                    className={cn(
                      'p-4 cursor-pointer transition-all border-2 text-left relative',
                      isSelected
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-border hover:border-border/80 hover:bg-surface-muted/30',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <span
                          className={cn(
                            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors',
                            isSelected
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-surface-muted text-foreground',
                          )}
                        >
                          {mode.icon}
                        </span>
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-foreground">{mode.title}</h4>
                            <Badge tone={isSelected ? 'primary' : 'muted'} className="text-[10px]">
                              {mode.badge}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{mode.description}</p>
                        </div>
                      </div>

                      <Button
                        variant={isSelected ? 'accent' : 'outline'}
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleStartStudy(mode.type)
                        }}
                        className="shrink-0 h-8 text-xs"
                      >
                        Start {mode.hotkey && `[${mode.hotkey}]`}
                      </Button>
                    </div>
                  </Card>
                )
              })}
            </div>

            <div className="pt-2 flex justify-end gap-3">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button variant="accent" onClick={() => handleStartStudy(selectedMode)}>
                <SparklesIcon className="mr-1.5 h-4 w-4" />
                Launch Session
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  )
}
