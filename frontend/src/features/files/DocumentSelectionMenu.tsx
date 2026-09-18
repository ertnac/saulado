import { useEffect, useRef, type ReactElement } from 'react'
import { ShoppingBagIcon, SparklesIcon, XIcon } from '@/components/ui/icons'
import { cn } from '@/lib/utils'

export interface SelectionPosition {
  x: number
  y: number
}

export interface DocumentSelectionMenuProps {
  selectedText: string
  position: SelectionPosition | null
  isSplitMode: boolean
  onAddToBag: () => void
  onSendToCardStudio: () => void
  onClose: () => void
}

export function DocumentSelectionMenu({
  selectedText,
  position,
  isSplitMode,
  onAddToBag,
  onSendToCardStudio,
  onClose,
}: DocumentSelectionMenuProps): ReactElement | null {
  const menuRef = useRef<HTMLDivElement>(null)

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [onClose])

  if (!position || !selectedText.trim()) return null

  const wordCount = selectedText.trim().split(/\s+/).filter(Boolean).length

  return (
    <div
      ref={menuRef}
      role="toolbar"
      aria-label="Selection actions"
      style={{
        position: 'fixed',
        left: `${Math.max(16, Math.min(position.x - 140, window.innerWidth - 300))}px`,
        top: `${Math.max(16, position.y - 52)}px`,
        zIndex: 50,
      }}
      className={cn(
        'flex items-center gap-1.5 rounded-full border border-border/80 bg-surface/95 px-2 py-1.5 shadow-lift backdrop-blur-md animate-in fade-in zoom-in-95',
      )}
    >
      <span className="text-[10px] font-semibold text-muted-foreground px-1 border-r border-border/60">
        {wordCount} {wordCount === 1 ? 'word' : 'words'}
      </span>

      <button
        type="button"
        onClick={onSendToCardStudio}
        className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary transition-all hover:bg-primary/20 hover:scale-[1.02] active:scale-95 shadow-xs"
        title="Send text to card creation studio on the left (Shortcut: W)"
      >
        <SparklesIcon className="h-3.5 w-3.5 text-primary" />
        <span>{isSplitMode ? 'Set as Card Note' : 'Create Card in Split'}</span>
        <kbd className="ml-0.5 rounded bg-primary/20 px-1 py-0.5 text-[9px] font-mono font-bold text-primary border border-primary/30">
          W
        </kbd>
      </button>

      <button
        type="button"
        onClick={onAddToBag}
        className="flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-foreground transition-all hover:bg-muted hover:text-primary active:scale-95"
        title="Save note to study bag (Shortcut: Q)"
      >
        <ShoppingBagIcon className="h-3.5 w-3.5 text-muted-foreground" />
        <span>Add to Bag</span>
        <kbd className="ml-0.5 rounded bg-surface px-1 py-0.5 text-[9px] font-mono font-bold text-muted-foreground border border-border">
          Q
        </kbd>
      </button>

      <button
        type="button"
        onClick={onClose}
        aria-label="Close selection menu"
        className="rounded-full p-1 text-muted-foreground hover:bg-surface-muted hover:text-foreground transition-colors"
      >
        <XIcon className="h-3 w-3" />
      </button>
    </div>
  )
}
