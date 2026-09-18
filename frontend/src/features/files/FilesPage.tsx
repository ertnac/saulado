import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import type { CloudFileSummary, RepositoryFileType } from '@saulado/shared'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/dialog'
import { FolderIcon, SearchIcon, ShoppingBagIcon, SparklesIcon, XIcon } from '@/components/ui/icons'
import { PageHeader } from '@/components/layout/PageHeader'
import { toast } from '@/stores/toast'
import { useAuthStore } from '@/stores/auth'
import { useSnippetBagStore } from '@/stores/snippet-bag'
import { SnippetBagModal } from './SnippetBagModal'
import {
  detectFileType,
  formatFileSize,
  verifyMagicBytes,
} from '@/services/file-repository/file-validation'
import {
  convertPptToPdf,
  deleteCloudFile,
  downloadCloudFileBlob,
  fetchCloudFiles,
  triggerBrowserDownload,
  uploadCloudFile,
} from '@/services/file-repository/api'
import {
  deleteLocalFile,
  getLocalFile,
  listLocalFiles,
  saveLocalFile,
  type LocalRepositoryFile,
} from '@/services/file-repository/storage'
import { cn } from '@/lib/utils'

type FileSourceFilter = 'all' | 'cloud' | 'local'

interface UnifiedFileItem {
  id: string
  name: string
  fileType: RepositoryFileType
  fileSize: number
  updatedAt: string
  isCloud: boolean
  isLocal: boolean
  cloudId?: string
  localId?: string
  blob?: Blob
}

export function FilesPage(): ReactElement {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const userId = user?.id || 'guest'

  const [cloudFiles, setCloudFiles] = useState<CloudFileSummary[]>([])
  const [localFiles, setLocalFiles] = useState<LocalRepositoryFile[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [syncingAll, setSyncingAll] = useState(false)
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set())
  const [isDragging, setIsDragging] = useState(false)

  const [sourceFilter, setSourceFilter] = useState<FileSourceFilter>('all')
  const [typeFilter, setTypeFilter] = useState<RepositoryFileType | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const [deleteTarget, setDeleteTarget] = useState<UnifiedFileItem | null>(null)
  const [snippetBagOpen, setSnippetBagOpen] = useState(false)
  const bagSnippets = useSnippetBagStore((s) => s.snippets)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load cloud & local files
  const loadFiles = useCallback(async () => {
    try {
      setLoading(true)
      const [cloud, local] = await Promise.all([
        fetchCloudFiles().catch((err) => {
          console.warn('[files] cloud fetch error:', err)
          return [] as CloudFileSummary[]
        }),
        listLocalFiles(userId).catch((err) => {
          console.warn('[files] local fetch error:', err)
          return [] as LocalRepositoryFile[]
        }),
      ])
      setCloudFiles(cloud)
      setLocalFiles(local)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void loadFiles()
  }, [loadFiles])

  // Merge and unify files list
  const unifiedItems: UnifiedFileItem[] = (() => {
    const map = new Map<string, UnifiedFileItem>()

    // Add local files
    for (const lf of localFiles) {
      const key = lf.cloudFileId || lf.name
      map.set(key, {
        id: lf.id,
        name: lf.name,
        fileType: lf.fileType,
        fileSize: lf.fileSize,
        updatedAt: lf.updatedAt,
        isCloud: Boolean(lf.cloudFileId),
        isLocal: true,
        cloudId: lf.cloudFileId,
        localId: lf.id,
        blob: lf.blob,
      })
    }

    // Merge or add cloud files
    for (const cf of cloudFiles) {
      const existing = map.get(cf.id) || map.get(cf.name)
      if (existing) {
        existing.isCloud = true
        existing.cloudId = cf.id
      } else {
        map.set(cf.id, {
          id: cf.id,
          name: cf.name,
          fileType: cf.fileType,
          fileSize: cf.fileSize,
          updatedAt: cf.updatedAt,
          isCloud: true,
          isLocal: false,
          cloudId: cf.id,
        })
      }
    }

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
  })()

  // Filter items
  const filteredItems = unifiedItems.filter((item) => {
    if (sourceFilter === 'cloud' && !item.isCloud) return false
    if (sourceFilter === 'local' && !item.isLocal) return false
    if (typeFilter !== 'all' && item.fileType !== typeFilter) return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      if (!item.name.toLowerCase().includes(q)) return false
    }
    return true
  })

  // Handle upload
  const handleUploadFile = async (file: File) => {
    let fileType = detectFileType(file.name, file.type)
    if (!fileType) {
      toast.error(
        'Unsupported file. Only PDF, PowerPoint (PPTX/PPT), and DOCX/DOC files are allowed.',
      )
      return
    }

    const isValid = await verifyMagicBytes(file, fileType)
    if (!isValid) {
      toast.error(`Invalid ${fileType.toUpperCase()} file header structure.`)
      return
    }

    try {
      setUploading(true)
      let uploadFile = file

      // If presentation, automatically convert into vector PDF for 100% fidelity & selectable text
      if (fileType === 'pptx' || fileType === 'ppt') {
        toast.info('Converting presentation into vector PDF with selectable text…')
        try {
          const converted = await convertPptToPdf(file)
          uploadFile = new File([converted.blob], converted.fileName, {
            type: 'application/pdf',
          })
          fileType = 'pdf'
        } catch (convErr) {
          console.error('[files] PPT conversion error:', convErr)
          toast.error('Failed to convert presentation to PDF. Please check server connection.')
          return
        }
      }

      // Upload to cloud account
      let uploadedCloudId: string | undefined
      try {
        const cloudResult = await uploadCloudFile(uploadFile, fileType)
        uploadedCloudId = cloudResult.id
      } catch (cloudErr) {
        console.warn('[files] cloud upload failed, caching locally only:', cloudErr)
        toast.info(
          `Cloud upload failed: ${cloudErr instanceof Error ? cloudErr.message : 'server error'}. Saved to device only.`,
        )
      }

      // Save locally in IndexedDB for instant offline access
      const localId = uploadedCloudId || crypto.randomUUID()
      await saveLocalFile({
        id: localId,
        userId,
        cloudFileId: uploadedCloudId,
        name: uploadFile.name,
        fileType,
        mimeType: uploadFile.type || 'application/octet-stream',
        fileSize: uploadFile.size,
        blob: uploadFile,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastViewedAt: null,
      })

      if (uploadedCloudId) {
        toast.success(`Imported "${uploadFile.name}" & saved for offline reading!`)
      } else {
        toast.info(`"${uploadFile.name}" saved to device.`)
      }
      await loadFiles()
    } catch (err) {
      console.error('[files] import error:', err)
      toast.error('Failed to import file. Please check connection and try again.')
    } finally {
      setUploading(false)
    }
  }

  const handleSyncItemToCloud = async (item: UnifiedFileItem) => {
    if (!item.blob) {
      toast.error('Local file binary data not found in cache.')
      return
    }
    try {
      setSyncingIds((prev) => new Set(prev).add(item.id))
      const file = new File([item.blob], item.name, {
        type: item.blob.type || 'application/octet-stream',
      })
      const cloudResult = await uploadCloudFile(file, item.fileType)

      if (item.localId) {
        const localRecord = await getLocalFile(item.localId)
        if (localRecord) {
          localRecord.cloudFileId = cloudResult.id
          await saveLocalFile(localRecord)
        }
      }
      toast.success(`"${item.name}" synced to Cloud!`)
      await loadFiles()
    } catch (err) {
      console.error('[files] sync error:', err)
      toast.error(`Sync failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setSyncingIds((prev) => {
        const next = new Set(prev)
        next.delete(item.id)
        return next
      })
    }
  }

  const handleSyncAllToCloud = async () => {
    const unsynced = unifiedItems.filter((item) => item.isLocal && !item.isCloud && item.blob)
    if (unsynced.length === 0) return

    setSyncingAll(true)
    let syncedCount = 0
    for (const item of unsynced) {
      if (!item.blob) continue
      try {
        const file = new File([item.blob], item.name, {
          type: item.blob.type || 'application/octet-stream',
        })
        const cloudResult = await uploadCloudFile(file, item.fileType)
        if (item.localId) {
          const localRecord = await getLocalFile(item.localId)
          if (localRecord) {
            localRecord.cloudFileId = cloudResult.id
            await saveLocalFile(localRecord)
          }
        }
        syncedCount++
      } catch (err) {
        console.warn(`[files] failed to sync ${item.name}:`, err)
      }
    }
    setSyncingAll(false)
    if (syncedCount > 0) {
      toast.success(`Synced ${syncedCount} file${syncedCount === 1 ? '' : 's'} to Cloud!`)
      await loadFiles()
    } else {
      toast.error('Failed to sync files to cloud. Please check backend connection.')
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    const file = files?.[0]
    if (file) {
      void handleUploadFile(file)
    }
    e.target.value = ''
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const files = e.dataTransfer.files
    const file = files?.[0]
    if (file) {
      void handleUploadFile(file)
    }
  }

  // Handle download
  const handleDownload = async (item: UnifiedFileItem) => {
    try {
      let blob = item.blob
      if (!blob && item.cloudId) {
        toast.info(`Downloading "${item.name}"…`)
        blob = await downloadCloudFileBlob(item.cloudId)
      }
      if (blob) {
        triggerBrowserDownload(blob, item.name)
        toast.success(`Downloaded "${item.name}"`)
      }
    } catch (err) {
      console.warn('[files] download error:', err)
      toast.error('Failed to download file.')
    }
  }

  // Handle delete
  const confirmDelete = async () => {
    if (!deleteTarget) return
    try {
      if (deleteTarget.cloudId) {
        await deleteCloudFile(deleteTarget.cloudId).catch(() => {})
      }
      if (deleteTarget.localId) {
        await deleteLocalFile(deleteTarget.localId).catch(() => {})
      }
      toast.success(`Deleted "${deleteTarget.name}"`)
      setDeleteTarget(null)
      await loadFiles()
    } catch (err) {
      console.warn('[files] delete error:', err)
    }
  }

  const unsyncedCount = unifiedItems.filter(
    (item) => item.isLocal && !item.isCloud && item.blob,
  ).length

  return (
    <div
      className="space-y-6 pb-12"
      onDragOver={(e) => {
        e.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <PageHeader
        title="File Repository"
        description="Access and read your PDF, PowerPoint (PPTX/PPT), and Word documents with offline viewing and flashcard conversion."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setSnippetBagOpen(true)}
              className="flex items-center gap-1.5"
            >
              <ShoppingBagIcon className="h-4 w-4 text-primary" />
              <span>Study Bag ({bagSnippets.length})</span>
            </Button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileInputChange}
              accept=".pdf,.docx,.doc,.pptx,.ppt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint"
              className="hidden"
            />
            <Button
              variant="default"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? 'Importing…' : '+ Upload Document'}
            </Button>
          </div>
        }
      />

      {/* Drag overlay notice */}
      {isDragging && (
        <div className="rounded-2xl border-2 border-dashed border-primary bg-primary/10 p-8 text-center text-primary font-semibold animate-pulse">
          Drop PDF, PowerPoint, or Word document here to import
        </div>
      )}

      {/* Unsynced Banner */}
      {unsyncedCount > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border border-sky-500/30 bg-sky-500/10 p-4 text-sky-700 dark:text-sky-300">
          <div className="flex items-center gap-3">
            <span className="text-2xl">☁️</span>
            <div>
              <p className="text-sm font-bold">
                {unsyncedCount} document{unsyncedCount === 1 ? '' : 's'} stored only on this browser
              </p>
              <p className="text-xs opacity-80">
                Sync them to your cloud account so they automatically render on your mobile app!
              </p>
            </div>
          </div>
          <Button
            variant="default"
            size="sm"
            disabled={syncingAll}
            onClick={() => void handleSyncAllToCloud()}
            className="whitespace-nowrap"
          >
            {syncingAll ? 'Syncing…' : 'Sync All to Cloud ☁️'}
          </Button>
        </div>
      )}

      {/* Top Scope & Filter Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Source Scope: All / Cloud / Local */}
        <div className="flex items-center rounded-full bg-surface-muted p-1 border border-border/60 self-start">
          <button
            onClick={() => setSourceFilter('all')}
            className={cn(
              'px-3 py-1 text-xs font-semibold rounded-full transition-all',
              sourceFilter === 'all'
                ? 'bg-surface text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            All Files ({unifiedItems.length})
          </button>
          <button
            onClick={() => setSourceFilter('cloud')}
            className={cn(
              'px-3 py-1 text-xs font-semibold rounded-full transition-all flex items-center gap-1.5',
              sourceFilter === 'cloud'
                ? 'bg-surface text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            ☁️ Cloud ({cloudFiles.length})
          </button>
          <button
            onClick={() => setSourceFilter('local')}
            className={cn(
              'px-3 py-1 text-xs font-semibold rounded-full transition-all flex items-center gap-1.5',
              sourceFilter === 'local'
                ? 'bg-surface text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            💻 Device ({localFiles.length})
          </button>
        </div>

        {/* Search & Type filter */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 sm:w-60">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search documents…"
              className="w-full rounded-full border border-border bg-surface pl-9 pr-8 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <XIcon className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1">
            {(['all', 'pdf', 'docx', 'doc', 'pptx', 'ppt'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setTypeFilter(type)}
                className={cn(
                  'px-2.5 py-1 text-xs font-medium rounded-lg transition-all',
                  typeFilter === type
                    ? 'bg-primary text-primary-foreground font-semibold'
                    : 'bg-surface-muted text-muted-foreground hover:bg-surface hover:text-foreground',
                )}
              >
                {type.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Document Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-5 h-36 animate-pulse bg-surface-muted/40" />
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <Card tone="dashed" className="p-12 text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <FolderIcon className="h-7 w-7" />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground">No documents found</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
              {searchQuery || typeFilter !== 'all' || sourceFilter !== 'all'
                ? 'No documents match your current filter settings. Try resetting search filters.'
                : 'Upload PDFs, PowerPoint presentations (.pptx/.ppt), or Word documents (.docx/.doc) to read and turn into flashcards.'}
            </p>
          </div>
          <Button
            variant="default"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="mt-2"
          >
            + Upload Your First Document
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map((item) => {
            const badgeColor =
              item.fileType === 'pdf'
                ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'
                : item.fileType === 'docx'
                  ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30'
                  : item.fileType === 'doc'
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                    : 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30'

            return (
              <Card
                key={item.id}
                className="p-5 flex flex-col justify-between transition-all hover:shadow-md border-border/80 group"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded-md text-[10px] font-bold border uppercase tracking-wider',
                        badgeColor,
                      )}
                    >
                      {item.fileType}
                    </span>

                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      {item.isCloud && (
                        <span
                          className="flex items-center gap-1 text-sky-600 dark:text-sky-400 font-medium"
                          title="Saved to cloud account"
                        >
                          ☁️ Cloud
                        </span>
                      )}
                      {item.isLocal && (
                        <span
                          className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium"
                          title="Cached locally on this device"
                        >
                          🟢 Offline
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3
                      className="font-bold text-sm text-foreground line-clamp-2 hover:text-primary cursor-pointer transition-colors"
                      onClick={() => {
                        void navigate(`/files/${item.id}`)
                      }}
                    >
                      {item.name}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatFileSize(item.fileSize)} ·{' '}
                      {new Date(item.updatedAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between border-t border-border/50 pt-3 mt-4 gap-2">
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="soft"
                      size="sm"
                      onClick={() => {
                        void navigate(`/files/${item.id}`)
                      }}
                      className="text-xs"
                    >
                      Open
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        void navigate(`/files/${item.id}?split=true`)
                      }}
                      title="Open side-by-side with Card Creation Studio"
                      className="text-xs flex items-center gap-1 hover:border-primary/50 font-semibold"
                    >
                      <SparklesIcon className="h-3 w-3 text-primary" />
                      <span>Split Studio</span>
                    </Button>
                  </div>

                  <div className="flex items-center gap-1">
                    {item.isLocal && !item.isCloud && item.blob && (
                      <Button
                        variant="soft"
                        size="sm"
                        disabled={syncingIds.has(item.id)}
                        onClick={() => void handleSyncItemToCloud(item)}
                        title="Upload this document to your cloud account"
                        className="text-xs text-sky-600 dark:text-sky-400 font-semibold hover:bg-sky-500/15"
                      >
                        {syncingIds.has(item.id) ? 'Syncing…' : '☁️ Sync'}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleDownload(item)}
                      title="Download file to device"
                    >
                      Download
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger hover:bg-danger/10"
                      onClick={() => setDeleteTarget(item)}
                      title="Delete file"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete Document?"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => {
          void confirmDelete()
        }}
      />

      {/* Study Bag Modal */}
      <SnippetBagModal open={snippetBagOpen} onClose={() => setSnippetBagOpen(false)} />
    </div>
  )
}
