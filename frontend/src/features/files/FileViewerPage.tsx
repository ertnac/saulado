import { useEffect, useState, type ReactElement } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { RepositoryFileType } from '@saulado/shared'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/dialog'
import { toast } from '@/stores/toast'
import { useAuthStore } from '@/stores/auth'
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
import { cn } from '@/lib/utils'

export function FileViewerPage(): ReactElement {
  const { fileId } = useParams<{ fileId: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const userId = user?.id || 'guest'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [fileType, setFileType] = useState<RepositoryFileType>('pdf')
  const [fileSize, setFileSize] = useState(0)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [content, setContent] = useState<DocumentParsedContent | null>(null)

  const [viewMode, setViewMode] = useState<'visual' | 'reader'>('visual')
  const [makeCardsOpen, setMakeCardsOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

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

        // If docx or doc without visual embed, default to reader mode
        if (currentType !== 'pdf') {
          setViewMode('reader')
        }
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
  }, [fileId, userId])

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
    <div className="space-y-4 pb-12">
      {/* Top Document Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/70 pb-4 bg-surface/50 backdrop-blur-xs sticky top-0 z-20 pt-1">
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

        <div className="flex items-center gap-2">
          {/* PDF Visual vs Reader mode toggle */}
          {fileType === 'pdf' && (
            <div className="flex items-center rounded-full bg-surface-muted p-0.5 border border-border/70">
              <button
                onClick={() => setViewMode('visual')}
                className={cn(
                  'px-3 py-1 text-xs font-bold rounded-full transition-all',
                  viewMode === 'visual'
                    ? 'bg-surface text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Visual
              </button>
              <button
                onClick={() => setViewMode('reader')}
                className={cn(
                  'px-3 py-1 text-xs font-bold rounded-full transition-all',
                  viewMode === 'reader'
                    ? 'bg-surface text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Reader
              </button>
            </div>
          )}

          {content.extractedText.trim().length > 0 && (
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

      {/* Viewer Content Area */}
      {viewMode === 'visual' && fileType === 'pdf' && blobUrl ? (
        <div className="w-full h-[82vh] rounded-2xl overflow-hidden border border-border/70 shadow-sm bg-surface-muted/20">
          <object data={blobUrl} type="application/pdf" className="w-full h-full" title={fileName}>
            <iframe src={blobUrl} className="w-full h-full border-0" title={fileName} />
          </object>
        </div>
      ) : (
        <Card className="max-w-4xl mx-auto p-8 sm:p-12 shadow-sm min-h-[75vh]">
          <div
            className="reader-view leading-relaxed text-foreground"
            dangerouslySetInnerHTML={{ __html: content.html }}
          />
        </Card>
      )}

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
