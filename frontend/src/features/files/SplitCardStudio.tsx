import { useEffect, useState, type ReactElement } from 'react'
import type { AnswerInput, DraftAnswer } from '@saulado/shared'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  FolderIcon,
  ShoppingBagIcon,
  SparklesIcon,
  TrashIcon,
  XIcon,
  UndoIcon,
  RedoIcon,
} from '@/components/ui/icons'
import { HighlightEditor } from '@/features/cards/HighlightEditor'
import { useCardDraft } from '@/features/cards/useCardDraft'
import { useCreateCard, useCreateSet, useSets } from '@/features/cards/queries'
import { useSnippetBagStore, type BaggedSnippet } from '@/stores/snippet-bag'
import { toast } from '@/stores/toast'
import { formatDocumentTextLayout } from '@/lib/text-formatting'
import { cn } from '@/lib/utils'

import type { RepositoryFileType } from '@saulado/shared'

export interface SplitCardStudioProps {
  fileId: string
  fileType: RepositoryFileType
  documentName: string
  incomingNoteText?: string | null
  onClearIncomingNote?: () => void
  activeSnippetId?: string | null
  onCloseSplit?: () => void
}

function toAnswerInputs(answers: readonly DraftAnswer[]): AnswerInput[] {
  return answers.map((answer) => ({
    startOffset: answer.startOffset,
    endOffset: answer.endOffset,
    ...(answer.altAnswers && answer.altAnswers.length > 0 ? { altAnswers: answer.altAnswers } : {}),
  }))
}

export function SplitCardStudio({
  fileId,
  fileType,
  documentName,
  incomingNoteText,
  onClearIncomingNote,
  activeSnippetId,
  onCloseSplit,
}: SplitCardStudioProps): ReactElement {
  const setsQuery = useSets()
  const createSetMutation = useCreateSet()
  const snippets = useSnippetBagStore((s) => s.snippets)
  const removeSnippet = useSnippetBagStore((s) => s.removeSnippet)
  const clearBag = useSnippetBagStore((s) => s.clearBag)
  const addSnippet = useSnippetBagStore((s) => s.addSnippet)

  const [selectedSetId, setSelectedSetId] = useState<string>('')
  const [isCreatingSet, setIsCreatingSet] = useState(false)
  const [newSetTitle, setNewSetTitle] = useState(
    documentName ? documentName.replace(/\.[^/.]+$/, '') : 'Study Set',
  )
  const [createdCount, setCreatedCount] = useState(0)

  // Drawer open / collapsed toggle state
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(true)

  // Auto vs Manual Mode state
  const [studioMode, setStudioMode] = useState<'auto' | 'manual'>('auto')

  // Track the active snippet ID currently loaded in the editor
  const [activeSnippetIdState, setActiveSnippetIdState] = useState<string | null>(() => {
    if (activeSnippetId) return activeSnippetId
    const first = snippets[0]
    if (first && !incomingNoteText) return first.id
    return null
  })
  const [manualSelection, setManualSelection] = useState<{ start: number; end: number } | null>(
    null,
  )
  const [manualText, setManualText] = useState('')

  const currentSnippet = snippets.find((s) => s.id === activeSnippetIdState)
  const initialText = incomingNoteText
    ? formatDocumentTextLayout(incomingNoteText)
    : currentSnippet
      ? formatDocumentTextLayout(currentSnippet.text)
      : snippets[0]
        ? formatDocumentTextLayout(snippets[0].text)
        : ''

  const draft = useCardDraft({
    paragraph: initialText,
    mode: initialText.trim() ? 'highlight' : 'compose',
  })

  // Set default target set once sets query loads
  const sets = setsQuery.data?.pages.flatMap((page) => page.items) ?? []
  useEffect(() => {
    if (!selectedSetId && sets.length > 0) {
      setSelectedSetId(sets[0]?.id || '')
    }
  }, [sets, selectedSetId])

  // If drawer has notes and the editor is currently empty, automatically load the top card
  useEffect(() => {
    if (
      !activeSnippetIdState &&
      snippets.length > 0 &&
      draft.paragraph.trim().length === 0 &&
      !incomingNoteText
    ) {
      const top = snippets[0]
      if (top) {
        setActiveSnippetIdState(top.id)
        const formatted = formatDocumentTextLayout(top.text)
        draft.reset({ paragraph: formatted, answers: [] })
        draft.setMode('highlight')
      }
    }
  }, [activeSnippetIdState, snippets, draft, incomingNoteText])

  // When active snippet changes, override editor state
  useEffect(() => {
    if (activeSnippetIdState && currentSnippet) {
      draft.reset({ paragraph: currentSnippet.text, answers: [] })
      draft.setMode('highlight') // automatically ready to add blanks
      setStudioMode('auto') // automatically switch to auto mode to edit the card
    }
  }, [activeSnippetIdState, currentSnippet])

  // Listen for new incoming highlighted notes from the document
  useEffect(() => {
    if (incomingNoteText && incomingNoteText.trim().length > 0) {
      const formatted = formatDocumentTextLayout(incomingNoteText)

      if (studioMode === 'manual') {
        if (manualText.trim().length > 0) {
          setManualText(manualText.trimRight() + '\n\n' + formatted)
        } else {
          setManualText(formatted)
        }
      } else {
        if (draft.draftText.trim().length > 0) {
          // Append to existing text with a blank line space
          const newText = draft.draftText.trimRight() + '\n\n' + formatted
          draft.reset({ paragraph: newText, answers: [] })
        } else {
          draft.reset({ paragraph: formatted, answers: [] })
        }
        draft.setMode('highlight')
      }

      setActiveSnippetIdState(null) // Direct note from document
      onClearIncomingNote?.()
    }
  }, [incomingNoteText, draft, manualText, studioMode, onClearIncomingNote])

  const handleLoadSnippet = (snippet: BaggedSnippet) => {
    setActiveSnippetIdState(snippet.id)
    const formatted = formatDocumentTextLayout(snippet.text)
    draft.reset({ paragraph: formatted, answers: [] })
    draft.setMode('highlight')
    setStudioMode('auto')
  }

  const handleRemoveSnippet = (id: string) => {
    removeSnippet(id)
    if (activeSnippetIdState === id) {
      const remaining = snippets.filter((s) => s.id !== id)
      const next = remaining[0]
      if (next) {
        handleLoadSnippet(next)
      } else {
        setActiveSnippetIdState(null)
        draft.reset({ paragraph: '', answers: [] })
      }
    }
  }

  const handleClearBag = () => {
    if (window.confirm('Are you sure you want to clear all notes from your Study Bag?')) {
      clearBag()
      setActiveSnippetIdState(null)
      toast.info('Study Bag cleared.')
    }
  }

  // Support pasting notes copied from PDF or external sources
  const handlePasteFromClipboard = async () => {
    try {
      const clipText = await navigator.clipboard.readText()
      if (clipText && clipText.trim().length > 0) {
        const formatted = formatDocumentTextLayout(clipText)
        draft.reset({ paragraph: formatted, answers: [] })
        draft.setMode('compose')
        setActiveSnippetIdState(null)
        toast.success('Note pasted from clipboard! You can edit it before highlighting.')
      } else {
        toast.info('Clipboard is empty. Copy a sentence from the PDF first (Ctrl+C).')
      }
    } catch {
      draft.setMode('compose')
      toast.info('Paste your copied note into the card box below (Ctrl+V).')
    }
  }

  // Also support global Ctrl+V paste when viewing PDF in split mode
  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') {
        return
      }
      const text = e.clipboardData?.getData('text')
      if (text && text.trim().length > 0) {
        const formatted = formatDocumentTextLayout(text)
        draft.reset({ paragraph: formatted, answers: [] })
        draft.setMode('compose')
        setActiveSnippetIdState(null)
        toast.success('Note captured from paste! You can edit it before highlighting.')
      }
    }
    window.addEventListener('paste', handleGlobalPaste)
    return () => window.removeEventListener('paste', handleGlobalPaste)
  }, [draft])

  // Undo/Redo keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement ? document.activeElement.tagName : ''
      const isContentEditable = (document.activeElement as HTMLElement)?.isContentEditable
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || isContentEditable) {
        return
      }

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
        if (e.key === 'z') {
          e.preventDefault()
          if (draft.canUndo) draft.undo()
        } else if (e.key === 'y') {
          e.preventDefault()
          if (draft.canRedo) draft.redo()
        }
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (draft.canRedo) draft.redo()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [draft])

  // Mutation for creating card
  const createCardMutation = useCreateCard(selectedSetId)
  const isSaving = createCardMutation.isPending || createSetMutation.isPending

  const handleCreateNewSet = async () => {
    if (!newSetTitle.trim()) {
      toast.error('Set title cannot be empty.')
      return
    }
    try {
      const created = await createSetMutation.mutateAsync({
        title: newSetTitle.trim(),
      })
      setSelectedSetId(created.set.id)
      setIsCreatingSet(false)
      toast.success(`Created set "${created.set.title}"!`)
    } catch {
      toast.error('Failed to create new set.')
    }
  }

  const handleSaveCard = async () => {
    draft.commitParagraph()
    const textToSave = draft.paragraph.trim()

    if (textToSave.length === 0) {
      toast.error(
        'Card text cannot be empty. Please highlight text from the document or select a bagged note.',
      )
      return
    }

    if (!selectedSetId) {
      toast.error('Please select or create a destination study set.')
      return
    }

    if (draft.answers.length === 0) {
      const confirmed = window.confirm(
        'No blanks have been created for this note. Do you want to save it as-is, or cancel and drag across words to make blanks for active recall?',
      )
      if (!confirmed) return
    }

    try {
      await createCardMutation.mutateAsync({
        paragraph: textToSave,
        answers: toAnswerInputs(draft.answers),
      })

      setCreatedCount((prev) => prev + 1)

      // Find the snippet that matches current active ID or current text
      const matchingSnippet = snippets.find(
        (s) => s.id === activeSnippetIdState || formatDocumentTextLayout(s.text) === textToSave,
      )

      if (matchingSnippet) {
        // Remove completed card from the bag
        removeSnippet(matchingSnippet.id)
        const remaining = snippets.filter((s) => s.id !== matchingSnippet.id)
        const nextSnippet = remaining[0] // The card next on top of the drawer!

        if (nextSnippet) {
          setActiveSnippetIdState(nextSnippet.id)
          const nextText = formatDocumentTextLayout(nextSnippet.text)
          draft.reset({ paragraph: nextText, answers: [] })
          draft.setMode('compose')
          toast.success('Flashcard saved! Loaded next card from top of drawer. ✨')
        } else {
          setActiveSnippetIdState(null)
          draft.reset({ paragraph: '', answers: [] })
          toast.success('Flashcard saved! All cards in the drawer are completed! 🎓')
        }
      } else {
        // Direct note mode: if there are cards in the drawer, automatically advance to top card
        if (snippets.length > 0) {
          const topSnippet = snippets[0]
          if (topSnippet) {
            setActiveSnippetIdState(topSnippet.id)
            const topText = formatDocumentTextLayout(topSnippet.text)
            draft.reset({ paragraph: topText, answers: [] })
            draft.setMode('compose')
            toast.success('Flashcard saved! Loaded top card from drawer. ✨')
          }
        } else {
          draft.reset({ paragraph: '', answers: [] })
          toast.success('Flashcard saved! 🎉')
        }
      }
    } catch (err) {
      console.warn('[split-studio] failed to save card:', err)
      toast.error('Failed to save card. Please try again.')
    }
  }

  const handleSaveNoteToBag = () => {
    let textToSave = ''
    let remainingText = ''
    let isPartial = false

    if (studioMode === 'manual') {
      if (manualSelection && manualSelection.start !== manualSelection.end) {
        const fullText = manualText
        const start = manualSelection.start
        const end = manualSelection.end
        textToSave = fullText.substring(start, end).trim()

        // Remove the selected portion and trim any resulting double newlines
        remainingText = (fullText.substring(0, start) + fullText.substring(end)).trim()
        isPartial = true

        // Clear selection state after extracting
        setManualSelection(null)
      } else {
        textToSave = manualText.trim()
      }
    } else {
      draft.commitParagraph()
      textToSave = draft.paragraph.trim()
    }

    if (!textToSave) {
      toast.error('Note text cannot be empty. Select some text or type a note.')
      return
    }

    // Don't add to bag if it's already in the bag
    const matchingSnippet = snippets.find(
      (s) => s.id === activeSnippetIdState || formatDocumentTextLayout(s.text) === textToSave,
    )
    if (matchingSnippet) {
      toast.info('This note is already in your Study Bag.')
      return
    }

    addSnippet({
      fileId,
      fileName: documentName,
      fileType,
      text: textToSave,
      source: fileType,
    })

    if (isPartial) {
      if (studioMode === 'manual') {
        setManualText(remainingText)
      } else {
        draft.reset({ paragraph: remainingText, answers: [] }, false)
      }
      toast.success('Selected text extracted and added to Study Bag! 🛍️')
    } else {
      if (studioMode === 'manual') {
        setManualText('')
      } else {
        setActiveSnippetIdState(null)
        draft.reset({ paragraph: '', answers: [] })
      }
      toast.success('Note added to Study Bag! 🛍️')
    }
  }

  const selectedSet = sets.find((s) => s.id === selectedSetId)
  const isCurrentCardFromDrawer = snippets.some(
    (s) =>
      s.id === activeSnippetIdState || formatDocumentTextLayout(s.text) === draft.paragraph.trim(),
  )

  return (
    <div className="flex h-full w-full flex-row gap-3 overflow-hidden bg-transparent">
      {/* 1. LEFT SIDE: Study Bag Drawer (20% of total view = 36.4% of 55% studio width) */}
      {snippets.length > 0 && (
        <aside
          className={cn(
            'h-full rounded-2xl border border-border/80 shadow-xs bg-surface flex flex-col shrink-0 transition-all duration-300 ease-in-out overflow-hidden',
            isDrawerOpen ? 'w-[36.4%]' : 'w-11',
          )}
        >
          {isDrawerOpen ? (
            <div className="flex flex-col h-full overflow-hidden">
              {/* Drawer Top Cabinet Header */}
              <div className="p-3 border-b border-border/70 bg-surface/90 backdrop-blur-xs flex items-center justify-between gap-1.5 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                    <ShoppingBagIcon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-xs font-bold text-foreground truncate">Study Bag Drawer</h3>
                    <p className="text-[10px] text-muted-foreground font-medium">
                      {snippets.length} {snippets.length === 1 ? 'card queued' : 'cards queued'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {snippets.length > 1 && (
                    <button
                      type="button"
                      onClick={handleClearBag}
                      title="Clear all cards from drawer"
                      className="rounded p-1 text-[11px] text-muted-foreground hover:text-danger hover:bg-surface-muted transition-colors cursor-pointer"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsDrawerOpen(false)}
                    title="Collapse drawer"
                    className="rounded-lg p-1 text-muted-foreground hover:bg-surface-muted hover:text-foreground transition-colors cursor-pointer text-xs"
                  >
                    ◀
                  </button>
                </div>
              </div>

              {/* Drawer Stack of Cards */}
              <div className="flex-1 overflow-y-auto p-2.5 space-y-2 select-none">
                <div className="flex items-center justify-between px-1 text-[10px] font-bold text-primary tracking-wider uppercase">
                  <span>Card Queue</span>
                  <span>Top to Bottom</span>
                </div>

                {snippets.map((snippet, idx) => {
                  const isTop = idx === 0
                  const isActive =
                    activeSnippetIdState === snippet.id ||
                    formatDocumentTextLayout(snippet.text) === draft.paragraph.trim()

                  return (
                    <div
                      key={snippet.id}
                      onClick={() => handleLoadSnippet(snippet)}
                      className={cn(
                        'group relative rounded-xl border p-2.5 transition-all cursor-pointer text-xs space-y-1.5 shadow-2xs',
                        isActive
                          ? 'border-primary bg-background ring-2 ring-primary/40 shadow-xs'
                          : 'border-border/80 bg-surface hover:border-primary/50 hover:bg-background/80',
                      )}
                    >
                      {/* Card Top Label Row */}
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              'flex h-4 px-1.5 items-center justify-center rounded-full text-[10px] font-bold tabular-nums',
                              isActive
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-surface-muted text-muted-foreground',
                            )}
                          >
                            #{idx + 1}
                          </span>
                          {isTop && (
                            <span className="rounded bg-amber-500/15 border border-amber-500/30 px-1 py-0.2 text-[9px] font-bold text-amber-600 dark:text-amber-400">
                              TOP ⚡
                            </span>
                          )}
                          {isActive && (
                            <span className="rounded bg-primary/20 px-1 py-0.2 text-[9px] font-bold text-primary">
                              IN STUDIO ✏️
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          title="Discard this card from drawer"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleRemoveSnippet(snippet.id)
                          }}
                          className="rounded p-1 text-muted-foreground opacity-40 hover:opacity-100 hover:text-danger hover:bg-surface-muted transition-all cursor-pointer"
                        >
                          <TrashIcon className="h-3 w-3" />
                        </button>
                      </div>

                      {/* Card Snippet Preview */}
                      <p
                        className={cn(
                          'line-clamp-3 text-[11px] leading-relaxed',
                          isActive ? 'text-foreground font-medium' : 'text-muted-foreground',
                        )}
                      >
                        {snippet.text}
                      </p>

                      {/* Card Bottom Meta */}
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground/70 pt-0.5 border-t border-border/40">
                        <span className="truncate max-w-[130px]">
                          {snippet.fileName || documentName}
                        </span>
                        <span>{snippet.text.split(/\s+/).filter(Boolean).length} words</span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Drawer Footer Advice */}
              <div className="p-2 border-t border-border/70 bg-surface/80 text-center text-[10px] text-muted-foreground font-medium shrink-0">
                Saving current card auto-loads the card next on top ⚡
              </div>
            </div>
          ) : (
            /* Collapsed Drawer Rail */
            <div className="flex flex-col items-center py-3 h-full justify-between select-none">
              <div className="flex flex-col items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(true)}
                  title="Expand Study Bag Drawer"
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors relative cursor-pointer"
                >
                  <ShoppingBagIcon className="h-4 w-4" />
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                    {snippets.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(true)}
                  title="Expand Drawer"
                  className="text-muted-foreground hover:text-foreground text-xs p-1 cursor-pointer"
                >
                  ▶
                </button>
              </div>

              <div
                onClick={() => setIsDrawerOpen(true)}
                className="[writing-mode:vertical-lr] rotate-180 text-[10px] font-bold tracking-widest text-muted-foreground hover:text-primary cursor-pointer uppercase py-4"
              >
                Card Drawer ({snippets.length})
              </div>
            </div>
          )}
        </aside>
      )}

      {/* 2. MIDDLE / RIGHT: Card Studio Main Editor (35% of total view = 63.6% of 55% studio width) */}
      <main className="flex-1 min-w-0 h-full rounded-2xl border border-border/80 shadow-xs flex flex-col bg-surface overflow-hidden">
        {/* Studio Top Header */}
        <div className="border-b border-border/70 bg-surface/95 px-4 py-3 backdrop-blur-md space-y-3 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <SparklesIcon className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-sm font-bold text-foreground">Card Studio</h2>
                <p className="text-[11px] text-muted-foreground">
                  Highlight notes to create cloze flashcards
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {studioMode === 'auto' && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] px-2 text-muted-foreground hover:text-foreground"
                    disabled={!draft.canUndo}
                    onClick={() => draft.undo()}
                    title="Undo (Ctrl+Z)"
                  >
                    <UndoIcon className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] px-2 text-muted-foreground hover:text-foreground"
                    disabled={!draft.canRedo}
                    onClick={() => draft.redo()}
                    title="Redo (Ctrl+Y)"
                  >
                    <RedoIcon className="h-3 w-3" />
                  </Button>
                </div>
              )}

              <div className="flex bg-surface-muted p-1 rounded-lg mr-2">
                <Button
                  variant={studioMode === 'auto' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-6 text-[10px] px-2"
                  onClick={() => setStudioMode('auto')}
                >
                  Auto
                </Button>
                <Button
                  variant={studioMode === 'manual' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-6 text-[10px] px-2"
                  onClick={() => setStudioMode('manual')}
                >
                  Manual
                </Button>
              </div>
              {createdCount > 0 && (
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                  +{createdCount} created
                </span>
              )}
              {onCloseSplit && (
                <button
                  type="button"
                  onClick={onCloseSplit}
                  title="Exit split view"
                  className="rounded-lg p-1 text-muted-foreground hover:bg-surface-muted hover:text-foreground transition-colors cursor-pointer"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Target Study Set Selector (Auto Mode Only) */}
          {studioMode === 'auto' && (
            <div className="rounded-xl border border-border/70 bg-surface-muted/40 p-2.5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 font-medium text-muted-foreground">
                  <FolderIcon className="h-3.5 w-3.5 text-primary" />
                  <span>Target Set:</span>
                </div>
                {!isCreatingSet ? (
                  <button
                    type="button"
                    onClick={() => setIsCreatingSet(true)}
                    className="text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                  >
                    + New Set
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsCreatingSet(false)}
                    className="text-[11px] font-medium text-muted-foreground hover:underline cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
              </div>

              {isCreatingSet ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={newSetTitle}
                    onChange={(e) => setNewSetTitle(e.target.value)}
                    placeholder="e.g. Biology Exam Prep"
                    className="flex-1 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <Button
                    variant="default"
                    size="sm"
                    disabled={isSaving}
                    onClick={() => void handleCreateNewSet()}
                    className="text-xs h-7 px-2.5"
                  >
                    Create
                  </Button>
                </div>
              ) : (
                <select
                  value={selectedSetId}
                  onChange={(e) => setSelectedSetId(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {sets.length === 0 && <option value="">No study sets found. Create one!</option>}
                  {sets.map((set) => (
                    <option key={set.id} value={set.id}>
                      {set.title} ({set.cardCount} cards)
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>

        {/* Editor Main Content Area */}
        <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">
          {draft.paragraph.trim().length === 0 ? (
            <Card tone="dashed" className="p-8 text-center space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-muted text-muted-foreground">
                <SparklesIcon className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold text-foreground">No Card in Studio</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {snippets.length > 0
                  ? 'Click any card from the Study Bag drawer on the left to highlight it.'
                  : 'Highlight text in the document on the right to start creating cloze cards, or add notes to your Study Bag.'}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => void handlePasteFromClipboard()}
                  className="text-xs font-semibold shadow-xs"
                >
                  📋 Paste Copied Note
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    draft.setMode('compose')
                    draft.setDraftText('')
                  }}
                  className="text-xs"
                >
                  Type Manually
                </Button>
              </div>
            </Card>
          ) : studioMode === 'manual' ? (
            <div className="flex flex-col h-full space-y-3">
              <p className="text-xs text-muted-foreground px-1">
                Type or paste text below. When you add it to your Study Bag, it will clear this box
                and appear in your drawer queue.
              </p>
              <textarea
                id="manual-note-textarea"
                value={manualText}
                onChange={(e) => {
                  setManualText(e.target.value)
                  setManualSelection(null) // Reset selection when text changes
                }}
                onSelect={(e) => {
                  const target = e.target as HTMLTextAreaElement
                  if (target.selectionStart !== target.selectionEnd) {
                    setManualSelection({ start: target.selectionStart, end: target.selectionEnd })
                  } else {
                    setManualSelection(null)
                  }
                }}
                placeholder="Paste copied text here..."
                className="flex-1 min-h-[200px] w-full rounded-2xl border border-border/80 bg-background p-4 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none shadow-xs"
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed text-foreground">
                <span>
                  💡 <strong className="font-semibold">How to make blanks:</strong> Click or drag
                  across words to make cloze blanks (
                  <span className="rounded bg-primary/20 px-1 py-0.5 font-bold text-primary">
                    [...1]
                  </span>
                  ). Punctuation is excluded automatically.
                </span>
                <button
                  type="button"
                  onClick={() => void handlePasteFromClipboard()}
                  className="text-[11px] font-semibold text-primary hover:underline shrink-0 cursor-pointer"
                >
                  📋 Paste New
                </button>
              </div>

              <div className="rounded-2xl border border-border/80 bg-background p-3 shadow-xs">
                <HighlightEditor draft={draft} showPreview={false} />
              </div>
            </div>
          )}
        </div>

        {/* Action Footer */}
        {draft.paragraph.trim().length > 0 && (
          <div className="border-t border-border/70 bg-surface/95 px-4 py-3 backdrop-blur-md flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setActiveSnippetIdState(null)
                  draft.reset({ paragraph: '', answers: [] })
                }}
                className="text-xs text-muted-foreground hover:text-danger"
              >
                Clear
              </Button>
              {studioMode === 'auto' && (
                <span className="text-[11px] text-muted-foreground font-medium">
                  {draft.answers.length} {draft.answers.length === 1 ? 'blank' : 'blanks'}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant={studioMode === 'manual' ? 'default' : 'outline'}
                size="sm"
                onClick={() => void handleSaveNoteToBag()}
                className="text-xs font-semibold"
              >
                Save as Note 🛍️
              </Button>

              {studioMode === 'auto' && (
                <Button
                  variant="default"
                  size="sm"
                  disabled={isSaving || !selectedSetId}
                  onClick={() => void handleSaveCard()}
                  className="text-xs font-bold"
                >
                  {isSaving
                    ? 'Saving…'
                    : isCurrentCardFromDrawer && snippets.length > 1
                      ? `Save & Next (${snippets.length - 1} left) ➔`
                      : isCurrentCardFromDrawer
                        ? 'Save Final Drawer Card ✓'
                        : `Save Card to "${selectedSet?.title || 'Set'}" ✓`}
                </Button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
