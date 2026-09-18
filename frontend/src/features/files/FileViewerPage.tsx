import { useEffect, useRef, useState, type ReactElement } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { RepositoryFileType } from '@saulado/shared'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/dialog'
import { ShoppingBagIcon, SparklesIcon } from '@/components/ui/icons'
import { toast } from '@/stores/toast'
import { useAuthStore } from '@/stores/auth'
import { useSnippetBagStore } from '@/stores/snippet-bag'
import { formatFileSize, detectFileType } from '@/services/file-repository/file-validation'
import {
  deleteCloudFile,
  downloadCloudFileBlob,
  triggerBrowserDownload,
} from '@/services/file-repository/api'
import {
  deleteLocalFile,
  getLocalFile,
  saveLocalFile,
  updateLocalLastViewed,
} from '@/services/file-repository/storage'
import {
  parseDocumentContent,
  type DocumentParsedContent,
} from '@/services/file-repository/document-parser'
import { MakeCardsDialog } from './MakeCardsDialog'
import { DocumentSelectionMenu, type SelectionPosition } from './DocumentSelectionMenu'
import { SplitCardStudio } from './SplitCardStudio'
import { SnippetBagModal } from './SnippetBagModal'
import { InteractivePdfViewer } from './InteractivePdfViewer'
import { cn } from '@/lib/utils'

export function FileViewerPage(): ReactElement {
  const { fileId } = useParams<{ fileId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const userId = user?.id || 'guest'

  const addSnippet = useSnippetBagStore((s) => s.addSnippet)
  const bagSnippets = useSnippetBagStore((s) => s.snippets)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [fileType, setFileType] = useState<RepositoryFileType>('pdf')
  const [fileSize, setFileSize] = useState(0)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [content, setContent] = useState<DocumentParsedContent | null>(null)
  const [isSplitMode, setIsSplitMode] = useState<boolean>(
    () => searchParams.get('split') === 'true',
  )
  const [incomingNoteText, setIncomingNoteText] = useState<string | null>(null)
  const [selectedText, setSelectedText] = useState('')
  const [selectionPos, setSelectionPos] = useState<SelectionPosition | null>(null)

  const [makeCardsOpen, setMakeCardsOpen] = useState(false)
  const [snippetBagOpen, setSnippetBagOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const readerContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!fileId) return
    let active = true

    async function load() {
      try {
        setLoading(true)
        setError(null)

        // 1. Try local IndexedDB first
        let currentBlob: Blob | null = null
        let currentName = ''
        let currentType: RepositoryFileType = 'pdf'
        let currentSize = 0

        const local = await getLocalFile(fileId!)
        if (local) {
          currentBlob = local.blob
          currentName = local.name
          currentType = local.fileType
          currentSize = local.fileSize
          void updateLocalLastViewed(fileId!)
        } else {
          // 2. Fetch from cloud
          currentBlob = await downloadCloudFileBlob(fileId!)
          currentName = 'Document'
          currentType = detectFileType(currentName, currentBlob.type) || 'pdf'
          currentSize = currentBlob.size

          // Cache locally
          await saveLocalFile({
            id: fileId!,
            userId,
            cloudFileId: fileId,
            name: currentName,
            fileType: currentType,
            mimeType: currentBlob.type || 'application/octet-stream',
            fileSize: currentSize,
            blob: currentBlob,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastViewedAt: new Date().toISOString(),
          }).catch(() => {})
        }

        if (!active) return

        setFileName(currentName)
        setFileType(currentType)
        setFileSize(currentSize)
        setBlob(currentBlob)

        const url = URL.createObjectURL(currentBlob)
        setBlobUrl(url)

        // Parse content for reader mode & card generation
        const parsed = await parseDocumentContent(currentBlob, currentName, currentType)
        if (!active) return
        setContent(parsed)
      } catch (err) {
        console.warn('[viewer] load failed:', err)
        if (active) {
          setError('Could not open this document. The file may be missing or inaccessible.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()

    return () => {
      active = false
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [fileId, userId, searchParams])

  // Sync isSplitMode with URL searchParams
  const toggleSplitMode = (active: boolean) => {
    setIsSplitMode(active)
    const next = new URLSearchParams(searchParams)
    if (active) {
      next.set('split', 'true')
    } else {
      next.delete('split')
      next.delete('snippetId')
    }
    setSearchParams(next, { replace: true })
  }

  // Handle document text selection
  const handleMouseUp = () => {
    const selection = window.getSelection()
    const text = selection?.toString()?.trim()

    if (text && text.length > 0) {
      try {
        const range = selection?.getRangeAt(0)
        const rect = range?.getBoundingClientRect()
        if (rect) {
          setSelectedText(text)
          setSelectionPos({
            x: rect.left + rect.width / 2,
            y: rect.top,
          })
          return
        }
      } catch {
        // Range get failed
      }
    }

    // Delay clearing so clicks on toolbar aren't lost
    setTimeout(() => {
      if (!window.getSelection()?.toString()?.trim()) {
        setSelectedText('')
        setSelectionPos(null)
      }
    }, 250)
  }

  const isDark =
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')

  const handlePdfTextSelected = (
    text: string,
    _pageNumber?: number,
    coords?: { x: number; y: number } | null,
  ) => {
    const trimmed = text.trim()
    if (!trimmed) return

    setSelectedText(trimmed)
    if (coords) {
      setSelectionPos(coords)
    }

    // In split mode: automatically populate the card creation module on the left!
    if (isSplitMode) {
      setIncomingNoteText(trimmed)
    }
  }

  const handlePdfSelectionCleared = () => {
    setTimeout(() => {
      if (!window.getSelection()?.toString()?.trim()) {
        setSelectedText('')
        setSelectionPos(null)
      }
    }, 250)
  }

  const handleAddToBag = (explicitText?: string) => {
    const textToBag = (explicitText || selectedText || '').trim()
    if (!textToBag || !fileId) return

    addSnippet({
      fileId,
      fileName,
      fileType,
      text: textToBag,
      source: fileType,
    })

    toast.success('Added note to Study Bag! 🛍️')
    setSelectedText('')
    setSelectionPos(null)
    window.getSelection()?.removeAllRanges()
  }

  const handleSendToCardStudio = (explicitText?: string) => {
    const textToSend = (explicitText || selectedText || '').trim()
    if (!textToSend) return

    setIncomingNoteText(textToSend)
    if (!isSplitMode) {
      toggleSplitMode(true)
    }
    setSelectedText('')
    setSelectionPos(null)
    window.getSelection()?.removeAllRanges()
  }

  const handleShortcut = (key: string, explicitText?: string) => {
    const upper = key.toUpperCase()
    if (upper === 'Q') {
      handleAddToBag(explicitText)
    } else if (upper === 'W') {
      handleSendToCardStudio(explicitText)
    }
  }

  // Keyboard shortcut listener on parent window (Q = Add to Bag, W = Highlight / Card Studio)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement ? document.activeElement.tagName : ''
      const isContentEditable = (document.activeElement as HTMLElement)?.isContentEditable
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || isContentEditable) {
        return
      }

      const key = (e.key || '').toUpperCase()
      if (key === 'Q' || key === 'W') {
        const selText = selectedText.trim() || window.getSelection()?.toString()?.trim() || ''
        if (selText) {
          e.preventDefault()
          handleShortcut(key, selText)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedText, fileId, fileName, fileType, isSplitMode])

  const handleDownload = () => {
    if (blob) {
      triggerBrowserDownload(blob, fileName)
      toast.success(`Downloaded "${fileName}"`)
    }
  }

  const handleDelete = async () => {
    if (!fileId) return
    try {
      await Promise.all([
        deleteCloudFile(fileId).catch(() => {}),
        deleteLocalFile(fileId).catch(() => {}),
      ])
      toast.success('Document deleted.')
      void navigate('/files')
    } catch {
      toast.error('Failed to delete document.')
    }
  }

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center flex-col gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm font-medium text-foreground">Preparing document for reading…</p>
      </div>
    )
  }

  if (error || !content) {
    return (
      <div className="max-w-md mx-auto py-12 text-center space-y-4">
        <Card tone="dashed" className="p-8 space-y-3">
          <h2 className="text-lg font-bold text-foreground">Failed to Open Document</h2>
          <p className="text-xs text-muted-foreground">
            {error || 'An unexpected error occurred.'}
          </p>
          <Button
            variant="outline"
            onClick={() => {
              void navigate('/files')
            }}
            className="mt-2"
          >
            Back to Files
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'w-full transition-all',
        isSplitMode ? 'h-full flex flex-col min-h-0 overflow-hidden pb-1' : 'space-y-4 pb-12',
      )}
    >
      {/* Top Document Header Bar */}
      <div
        className={cn(
          'flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/70 bg-surface/50 backdrop-blur-xs',
          isSplitMode ? 'pb-2 pt-0 shrink-0' : 'pb-4 pt-1 sticky top-0 z-20',
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void navigate('/files')
            }}
          >
            ← Files
          </Button>
          <div className="min-w-0">
            <h1 className="text-base font-bold text-foreground truncate">{fileName}</h1>
            <p className="text-[11px] text-muted-foreground">
              {fileType.toUpperCase()} · {formatFileSize(fileSize)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Split Mode Toggle Button */}
          <Button
            variant={isSplitMode ? 'default' : 'outline'}
            size="sm"
            onClick={() => toggleSplitMode(!isSplitMode)}
            title="Toggle Split View for creating cards while reading"
            className={cn(
              'flex items-center gap-1.5 transition-all text-xs font-semibold',
              isSplitMode
                ? 'bg-primary text-primary-foreground shadow-xs ring-2 ring-primary/30'
                : 'hover:border-primary/50 text-foreground',
            )}
          >
            <SparklesIcon className="h-3.5 w-3.5" />
            <span>{isSplitMode ? 'Close Split View' : '🔀 Split View: Create Cards'}</span>
          </Button>

          {/* Study Bag Quick Trigger */}
          <button
            type="button"
            onClick={() => setSnippetBagOpen(true)}
            className="relative flex h-8 items-center gap-1.5 rounded-lg border border-border/80 bg-surface px-2.5 text-xs font-semibold text-foreground hover:bg-surface-muted hover:border-primary/40 transition-colors"
            title="View Study Bag"
          >
            <ShoppingBagIcon className="h-3.5 w-3.5 text-primary" />
            <span>Bag ({bagSnippets.length})</span>
          </button>

          {content.extractedText.trim().length > 0 && !isSplitMode && (
            <Button variant="default" size="sm" onClick={() => setMakeCardsOpen(true)}>
              Make Cards
            </Button>
          )}

          <Button variant="outline" size="sm" onClick={handleDownload}>
            Download
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="text-danger hover:bg-danger/10"
            onClick={() => setDeleteConfirmOpen(true)}
          >
            Delete
          </Button>
        </div>
      </div>

      {/* Main Workspace: Split View vs Standard View */}
      {isSplitMode ? (
        <div className="flex flex-col lg:flex-row items-stretch gap-3 w-full flex-1 min-h-0 overflow-hidden">
          {/* Left + Middle: SplitCardStudio (55% = 20% Bag Drawer + 35% Card Studio) */}
          <div
            className={cn(
              'shrink-0 h-full overflow-hidden transition-all duration-300 min-h-0',
              bagSnippets.length > 0 ? 'w-full lg:w-[55%]' : 'w-full lg:w-[38%]',
            )}
          >
            <SplitCardStudio
              documentName={fileName}
              incomingNoteText={incomingNoteText}
              onClearIncomingNote={() => setIncomingNoteText(null)}
              activeSnippetId={searchParams.get('snippetId')}
              onCloseSplit={() => toggleSplitMode(false)}
            />
          </div>

          {/* Right Panel: Document & Notes Viewer (45% for PDF Reader when drawer is open, or 62% when no drawer) */}
          <div
            className={cn(
              'h-full rounded-2xl border border-border/80 shadow-xs bg-surface overflow-hidden flex flex-col transition-all duration-300 min-h-0',
              bagSnippets.length > 0 ? 'w-full lg:w-[45%]' : 'w-full lg:w-[62%]',
            )}
          >
            {/* Header sub-bar */}
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5 bg-surface/95 backdrop-blur-xs shrink-0">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-bold text-foreground truncate max-w-[240px] sm:max-w-md">
                  {fileName}
                </span>
                <span className="text-muted-foreground">•</span>
                <span className="text-muted-foreground font-medium">
                  {fileType === 'pdf' ? 'PDF Visual Document' : 'Document Notes'}
                </span>
              </div>
            </div>

            {/* Document display area */}
            {fileType === 'pdf' && blobUrl ? (
              <div className="flex-1 w-full h-full bg-surface-muted/10 relative overflow-hidden min-h-0">
                <InteractivePdfViewer
                  blob={blob}
                  blobUrl={blobUrl}
                  fileId={fileId}
                  fileName={fileName}
                  isDark={isDark}
                  onTextSelected={handlePdfTextSelected}
                  onSelectionCleared={handlePdfSelectionCleared}
                  onShortcutKey={handleShortcut}
                />
              </div>
            ) : (
              <div
                ref={readerContainerRef}
                onMouseUp={handleMouseUp}
                className="flex-1 overflow-y-auto min-h-0 p-6 sm:p-8 select-text"
              >
                <div
                  className="reader-view leading-relaxed text-foreground select-text max-w-3xl mx-auto"
                  dangerouslySetInnerHTML={{ __html: content.html }}
                />
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Standard Single-Column Document View */
        <div onMouseUp={handleMouseUp}>
          {fileType === 'pdf' && blobUrl ? (
            <div className="w-full h-[82vh] rounded-2xl overflow-hidden border border-border/70 shadow-sm bg-surface-muted/20">
              <InteractivePdfViewer
                blob={blob}
                blobUrl={blobUrl}
                fileId={fileId}
                fileName={fileName}
                isDark={isDark}
                onTextSelected={handlePdfTextSelected}
                onSelectionCleared={handlePdfSelectionCleared}
                onShortcutKey={handleShortcut}
              />
            </div>
          ) : (
            <Card className="max-w-4xl mx-auto p-8 sm:p-12 shadow-sm min-h-[75vh] select-text">
              <div
                className="reader-view leading-relaxed text-foreground select-text"
                dangerouslySetInnerHTML={{ __html: content.html }}
              />
            </Card>
          )}
        </div>
      )}

      {/* Floating Selection Action Menu */}
      <DocumentSelectionMenu
        selectedText={selectedText}
        position={selectionPos}
        isSplitMode={isSplitMode}
        onAddToBag={handleAddToBag}
        onSendToCardStudio={handleSendToCardStudio}
        onClose={() => {
          setSelectedText('')
          setSelectionPos(null)
        }}
      />

      {/* Study Bag Modal */}
      <SnippetBagModal
        open={snippetBagOpen}
        onClose={() => setSnippetBagOpen(false)}
        onOpenSplitView={(_fileId, snippetId) => {
          setSnippetBagOpen(false)
          toggleSplitMode(true)
          if (snippetId) {
            const next = new URLSearchParams(searchParams)
            next.set('split', 'true')
            next.set('snippetId', snippetId)
            setSearchParams(next, { replace: true })
          }
        }}
      />

      {/* Make Cards Dialog */}
      <MakeCardsDialog
        open={makeCardsOpen}
        onClose={() => setMakeCardsOpen(false)}
        documentName={fileName}
        extractedText={content.extractedText}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="Delete Document?"
        description={`Are you sure you want to delete "${fileName}"? This removes both cloud and local cached copies.`}
        confirmLabel="Delete"
        onConfirm={() => {
          void handleDelete()
        }}
      />
    </div>
  )
}
