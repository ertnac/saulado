import { useCallback, useEffect, useState, type ReactElement } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Sharing from 'expo-sharing'
import type { CloudFileSummary } from '@saulado/shared'
import { Button } from '../../../components/button'
import { Card } from '../../../components/card'
import {
  DocumentIcon,
  FolderIcon,
  SearchIcon,
  CloseIcon,
  ShoppingBagIcon,
} from '../../../components/icons'
import { SnippetBagModal } from '../../../components/snippet-bag-modal'
import { useSnippetBagStore } from '../../../stores/snippet-bag'
import type { RepositoryFile, RepositoryFileType } from '../../../lib/offline/types'
import {
  deleteCloudFile,
  deleteRepositoryFile,
  downloadCloudFile,
  fetchCloudFiles,
  formatFileSize,
  getDownloadedCloudFileMap,
  getRepositoryFiles,
  getRepositoryStats,
  pickAndImportFiles,
  renameRepositoryFile,
  type RepositoryStats,
} from '../../../services/file-repository'
import { useAuthStore } from '../../../stores/auth'
import { useTokenColor } from '../../../stores/theme'

export default function FileRepositoryScreen(): ReactElement {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const userId = user?.id || 'local-user'

  const primary = useTokenColor('--primary')
  const mutedForeground = useTokenColor('--muted-foreground')

  const snippets = useSnippetBagStore((s) => s.snippets)
  const [isBagModalOpen, setIsBagModalOpen] = useState(false)

  // Scopes: Device Files (100% offline on phone) vs Cloud Files (from web app / account)
  const [tabScope, setTabScope] = useState<'device' | 'cloud'>('device')

  const [files, setFiles] = useState<RepositoryFile[]>([])
  const [cloudFiles, setCloudFiles] = useState<CloudFileSummary[]>([])
  const [downloadedMap, setDownloadedMap] = useState<Map<string, string>>(new Map())
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set())

  const [stats, setStats] = useState<RepositoryStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [importing, setImporting] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<RepositoryFileType | 'all'>('all')

  // Rename modal state
  const [renameTarget, setRenameTarget] = useState<RepositoryFile | null>(null)
  const [newTitle, setNewTitle] = useState('')

  const loadData = useCallback(async () => {
    try {
      const [fileList, fileStats, cloudMap] = await Promise.all([
        getRepositoryFiles(userId, activeFilter, searchQuery),
        getRepositoryStats(userId),
        getDownloadedCloudFileMap(userId),
      ])
      setFiles(fileList)
      setStats(fileStats)
      setDownloadedMap(cloudMap)

      // Fetch cloud files if user is authenticated
      if (user) {
        try {
          const remoteFiles = await fetchCloudFiles()
          setCloudFiles(remoteFiles)
        } catch (cloudErr) {
          console.warn('[file-repository] remote files fetch error:', cloudErr)
        }
      }
    } catch (error) {
      console.warn('[file-repository] failed to load files:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [userId, user, activeFilter, searchQuery])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // Automatically show Cloud Files tab if user has documents in the cloud but none on device
  useEffect(() => {
    if (files.length === 0 && cloudFiles.length > 0) {
      setTabScope('cloud')
    }
  }, [files.length, cloudFiles.length])

  const handleImport = async (): Promise<void> => {
    try {
      setImporting(true)
      const imported = await pickAndImportFiles(userId)
      if (imported.length > 0) {
        await loadData()
        Alert.alert(
          'Files Imported',
          `Successfully imported ${imported.length} document${imported.length === 1 ? '' : 's'} into your device repository.`,
        )
      }
    } catch (error) {
      console.warn('[file-repository] import error:', error)
      Alert.alert('Import Failed', 'Could not import the selected file(s). Please try again.')
    } finally {
      setImporting(false)
    }
  }

  const handleDownloadCloud = async (cloudFile: CloudFileSummary): Promise<void> => {
    try {
      setDownloadingIds((prev) => new Set(prev).add(cloudFile.id))
      const downloaded = await downloadCloudFile(cloudFile, userId)

      // Update map & local list
      setDownloadedMap((prev) => new Map(prev).set(cloudFile.id, downloaded.id))
      await loadData()
      Alert.alert(
        'Downloaded for Offline',
        `"${cloudFile.name}" has been saved to your device and is ready for 100% offline reading!`,
      )
    } catch (error) {
      console.warn('[file-repository] cloud download error:', error)
      Alert.alert(
        'Download Failed',
        'Could not download the file from the cloud. Please check your connection and try again.',
      )
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev)
        next.delete(cloudFile.id)
        return next
      })
    }
  }

  const handleDelete = (file: RepositoryFile): void => {
    Alert.alert(
      'Delete Document?',
      `Are you sure you want to remove "${file.name}" from your device? This removes the local sandboxed copy.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void deleteRepositoryFile(file.id).then(() => loadData())
          },
        },
      ],
    )
  }

  const handleDeleteCloud = (cloudFile: CloudFileSummary): void => {
    Alert.alert(
      'Delete Cloud Document?',
      `Are you sure you want to delete "${cloudFile.name}" from your cloud account?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void deleteCloudFile(cloudFile.id).then(() => loadData())
          },
        },
      ],
    )
  }

  const handleShare = async (file: RepositoryFile): Promise<void> => {
    try {
      const isAvailable = await Sharing.isAvailableAsync()
      if (isAvailable) {
        await Sharing.shareAsync(file.fileUri, {
          dialogTitle: `Share ${file.name}`,
          mimeType: file.mimeType,
        })
      } else {
        Alert.alert('Sharing Unavailable', 'File sharing is not supported on this device.')
      }
    } catch (error) {
      console.warn('[file-repository] share error:', error)
    }
  }

  const handleRenameConfirm = async (): Promise<void> => {
    if (!renameTarget || !newTitle.trim()) return
    try {
      await renameRepositoryFile(renameTarget.id, newTitle.trim())
      setRenameTarget(null)
      setNewTitle('')
      await loadData()
    } catch (error) {
      console.warn('[file-repository] rename error:', error)
      Alert.alert('Rename Failed', 'Could not rename file.')
    }
  }

  const renderBadge = (type: RepositoryFileType) => {
    if (type === 'pdf') {
      return (
        <View className="rounded px-2 py-0.5 bg-rose-500/15 dark:bg-rose-500/25 border border-rose-500/30">
          <Text className="text-[11px] font-bold text-rose-600 dark:text-rose-400">PDF</Text>
        </View>
      )
    }
    if (type === 'docx') {
      return (
        <View className="rounded px-2 py-0.5 bg-blue-500/15 dark:bg-blue-500/25 border border-blue-500/30">
          <Text className="text-[11px] font-bold text-blue-600 dark:text-blue-400">DOCX</Text>
        </View>
      )
    }
    return (
      <View className="rounded px-2 py-0.5 bg-amber-500/15 dark:bg-amber-500/25 border border-amber-500/30">
        <Text className="text-[11px] font-bold text-amber-700 dark:text-amber-400">DOC</Text>
      </View>
    )
  }

  // Filter cloud files according to search and type
  const filteredCloudFiles = cloudFiles.filter((cf) => {
    if (activeFilter !== 'all' && cf.fileType !== activeFilter) return false
    if (searchQuery.trim().length > 0) {
      return cf.name.toLowerCase().includes(searchQuery.toLowerCase())
    }
    return true
  })

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-5 p-5"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 96, 128) }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true)
              void loadData()
            }}
            tintColor={primary}
          />
        }
      >
        {/* Header Title & Import Action */}
        <View className="flex-row items-center justify-between">
          <View className="flex-1 gap-1">
            <Text className="text-2xl font-bold tracking-tight text-foreground">
              File Repository
            </Text>
            <Text className="text-xs text-muted-foreground">
              {tabScope === 'device'
                ? 'Documents saved on this device (100% offline).'
                : 'Documents stored in your cloud account from web app.'}
            </Text>
          </View>
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={() => setIsBagModalOpen(true)}
              className="flex-row items-center gap-1.5 px-3 py-2 rounded-xl bg-primary/10 border border-primary/20 active:opacity-75"
              accessibilityLabel="Open Study Bag"
            >
              <ShoppingBagIcon color={primary} size={16} />
              <Text className="text-xs font-bold text-primary">Bag ({snippets.length})</Text>
            </Pressable>

            {tabScope === 'device' && (
              <Button
                label={importing ? 'Importing…' : '+ Import'}
                onPress={() => {
                  void handleImport()
                }}
                disabled={importing}
              />
            )}
          </View>
        </View>

        {/* Scope Switcher: Device Files vs Cloud Files */}
        <View className="flex-row items-center rounded-full bg-surface-muted p-1 border border-border/80 self-start">
          <Pressable
            onPress={() => setTabScope('device')}
            className={`px-3.5 py-1.5 rounded-full ${tabScope === 'device' ? 'bg-surface shadow-xs' : ''}`}
          >
            <Text
              className={`text-xs ${
                tabScope === 'device' ? 'font-bold text-foreground' : 'text-muted-foreground'
              }`}
            >
              📱 Device Files ({files.length})
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setTabScope('cloud')}
            className={`px-3.5 py-1.5 rounded-full ${tabScope === 'cloud' ? 'bg-surface shadow-xs' : ''}`}
          >
            <Text
              className={`text-xs ${
                tabScope === 'cloud' ? 'font-bold text-foreground' : 'text-muted-foreground'
              }`}
            >
              ☁️ Cloud Files ({cloudFiles.length})
            </Text>
          </Pressable>
        </View>

        {/* Storage Stats Banner */}
        {tabScope === 'device' && stats && stats.totalFiles > 0 && (
          <Card className="p-4 bg-surface border border-border">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-3">
                <View className="h-10 w-10 rounded-xl bg-primary/10 items-center justify-center">
                  <FolderIcon color={primary} size={20} />
                </View>
                <View>
                  <Text className="text-base font-semibold text-foreground">
                    {stats.totalFiles} {stats.totalFiles === 1 ? 'Document' : 'Documents'}
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    {formatFileSize(stats.totalSizeBytes)} ready offline
                  </Text>
                </View>
              </View>
              <View className="flex-row items-center gap-1.5">
                {stats.pdfCount > 0 && (
                  <View className="rounded-full bg-rose-500/10 px-2 py-0.5">
                    <Text className="text-[11px] font-medium text-rose-600 dark:text-rose-400">
                      {stats.pdfCount} PDF
                    </Text>
                  </View>
                )}
                {stats.docxCount + stats.docCount > 0 && (
                  <View className="rounded-full bg-blue-500/10 px-2 py-0.5">
                    <Text className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
                      {stats.docxCount + stats.docCount} Word
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </Card>
        )}

        {/* Search Bar */}
        <View className="flex-row items-center rounded-xl border border-border bg-surface px-3 py-2.5 gap-2.5">
          <SearchIcon color={mutedForeground} size={18} />
          <TextInput
            placeholder="Search documents by name…"
            placeholderTextColor={mutedForeground}
            value={searchQuery}
            onChangeText={setSearchQuery}
            className="flex-1 text-sm text-foreground p-0"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} className="p-1">
              <CloseIcon color={mutedForeground} size={16} />
            </Pressable>
          )}
        </View>

        {/* Filter Chips */}
        <View className="flex-row gap-2">
          {(['all', 'pdf', 'docx', 'doc'] as const).map((filter) => {
            const isSelected = activeFilter === filter
            const label =
              filter === 'all'
                ? 'All Files'
                : filter === 'pdf'
                  ? 'PDF'
                  : filter === 'docx'
                    ? 'DOCX'
                    : 'DOC'

            return (
              <Pressable
                key={filter}
                onPress={() => setActiveFilter(filter)}
                className={`rounded-full px-3.5 py-1.5 border ${
                  isSelected
                    ? 'bg-primary border-primary'
                    : 'bg-surface border-border active:opacity-75'
                }`}
              >
                <Text
                  className={`text-xs font-medium ${
                    isSelected ? 'text-primary-foreground font-semibold' : 'text-muted-foreground'
                  }`}
                >
                  {label}
                </Text>
              </Pressable>
            )
          })}
        </View>

        {/* TAB 1: DEVICE FILES */}
        {tabScope === 'device' && (
          <>
            {loading ? (
              <View className="py-12 items-center justify-center gap-3">
                <ActivityIndicator size="small" color={primary} />
                <Text className="text-xs text-muted-foreground">Loading device documents…</Text>
              </View>
            ) : files.length === 0 ? (
              <Card tone="dashed" className="p-8 items-center justify-center gap-3 text-center">
                <View className="h-14 w-14 rounded-2xl bg-surface-muted items-center justify-center mb-1">
                  <DocumentIcon color={primary} size={28} />
                </View>
                <Text className="text-base font-semibold text-foreground text-center">
                  {searchQuery ? 'No matching documents' : 'No documents on device'}
                </Text>
                <Text className="text-xs text-muted-foreground text-center max-w-[280px]">
                  {searchQuery
                    ? 'Try a different search term or clear the filter.'
                    : 'Import downloaded PDFs or Word documents from your phone or download them from the Cloud tab for offline study.'}
                </Text>
                {!searchQuery && (
                  <Button
                    label="+ Import Documents"
                    className="mt-3"
                    onPress={() => {
                      void handleImport()
                    }}
                    disabled={importing}
                  />
                )}
              </Card>
            ) : (
              <View className="gap-2.5">
                {files.map((file) => (
                  <Pressable
                    key={file.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${file.name}`}
                    onPress={() => {
                      router.push(`/files/${file.id}`)
                    }}
                    className="rounded-2xl border border-border bg-surface p-4 active:opacity-85 gap-3"
                  >
                    <View className="flex-row items-start justify-between gap-3">
                      <View className="flex-1 flex-row items-start gap-3">
                        <View className="mt-0.5">{renderBadge(file.fileType)}</View>
                        <View className="flex-1 gap-1">
                          <Text numberOfLines={1} className="text-sm font-semibold text-foreground">
                            {file.name}
                          </Text>
                          <Text className="text-xs text-muted-foreground">
                            {formatFileSize(file.fileSize)} ·{' '}
                            {file.cloudFileId ? '🟢 Synced from Cloud' : '📱 On Device'}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Bottom Card Actions */}
                    <View className="flex-row items-center justify-end gap-2 pt-2 border-t border-border/50">
                      {file.fileType !== 'pdf' && (
                        <Pressable
                          onPress={(e) => {
                            e.stopPropagation()
                            router.push(`/files/${file.id}`)
                          }}
                          className="px-2.5 py-1 rounded-md bg-primary/15 active:opacity-70 flex-row items-center gap-1 mr-auto"
                        >
                          <ShoppingBagIcon color={primary} size={13} />
                          <Text className="text-xs text-primary font-semibold">Bag Snippets</Text>
                        </Pressable>
                      )}

                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation()
                          setRenameTarget(file)
                          setNewTitle(file.name)
                        }}
                        className="px-2.5 py-1 rounded-md bg-surface-muted active:opacity-70"
                      >
                        <Text className="text-xs text-muted-foreground font-medium">Rename</Text>
                      </Pressable>

                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation()
                          void handleShare(file)
                        }}
                        className="px-2.5 py-1 rounded-md bg-surface-muted active:opacity-70"
                      >
                        <Text className="text-xs text-muted-foreground font-medium">Share</Text>
                      </Pressable>

                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation()
                          handleDelete(file)
                        }}
                        className="px-2.5 py-1 rounded-md bg-destructive/10 active:opacity-70"
                      >
                        <Text className="text-xs text-destructive font-medium">Delete</Text>
                      </Pressable>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}

        {/* TAB 2: CLOUD FILES */}
        {tabScope === 'cloud' && (
          <>
            {loading ? (
              <View className="py-12 items-center justify-center gap-3">
                <ActivityIndicator size="small" color={primary} />
                <Text className="text-xs text-muted-foreground">Checking cloud files…</Text>
              </View>
            ) : filteredCloudFiles.length === 0 ? (
              <Card tone="dashed" className="p-8 items-center justify-center gap-3 text-center">
                <View className="h-14 w-14 rounded-2xl bg-surface-muted items-center justify-center mb-1">
                  <FolderIcon color={primary} size={28} />
                </View>
                <Text className="text-base font-semibold text-foreground text-center">
                  {searchQuery ? 'No matching cloud files' : 'No files in cloud account'}
                </Text>
                <Text className="text-xs text-muted-foreground text-center max-w-[280px]">
                  {searchQuery
                    ? 'Try another search query.'
                    : 'Upload PDF or Word documents from the web app under your account, and they will appear here ready to download for offline study!'}
                </Text>
              </Card>
            ) : (
              <View className="gap-2.5">
                {filteredCloudFiles.map((cloudFile) => {
                  const isDownloaded = downloadedMap.has(cloudFile.id)
                  const localId = downloadedMap.get(cloudFile.id)
                  const isDownloading = downloadingIds.has(cloudFile.id)

                  return (
                    <View
                      key={cloudFile.id}
                      className="rounded-2xl border border-border bg-surface p-4 gap-3"
                    >
                      <View className="flex-row items-start justify-between gap-3">
                        <View className="flex-1 flex-row items-start gap-3">
                          <View className="mt-0.5">{renderBadge(cloudFile.fileType)}</View>
                          <View className="flex-1 gap-1">
                            <Text
                              numberOfLines={1}
                              className="text-sm font-semibold text-foreground"
                            >
                              {cloudFile.name}
                            </Text>
                            <Text className="text-xs text-muted-foreground">
                              {formatFileSize(cloudFile.fileSize)} ·{' '}
                              {new Date(cloudFile.updatedAt).toLocaleDateString()}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* Status indicator & Actions */}
                      <View className="flex-row items-center justify-between pt-2 border-t border-border/50">
                        {isDownloaded ? (
                          <View className="flex-row items-center gap-1.5">
                            <Text className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                              🟢 Available Offline
                            </Text>
                          </View>
                        ) : (
                          <View className="flex-row items-center gap-1.5">
                            <Text className="text-xs font-semibold text-sky-600 dark:text-sky-400">
                              ☁️ In Cloud
                            </Text>
                          </View>
                        )}

                        <View className="flex-row items-center gap-2">
                          {isDownloaded && localId ? (
                            <Pressable
                              onPress={() => router.push(`/files/${localId}`)}
                              className="px-3 py-1.5 rounded-md bg-primary active:opacity-80"
                            >
                              <Text className="text-xs font-semibold text-primary-foreground">
                                Open Offline
                              </Text>
                            </Pressable>
                          ) : (
                            <Pressable
                              disabled={isDownloading}
                              onPress={() => void handleDownloadCloud(cloudFile)}
                              className={`px-3 py-1.5 rounded-md bg-primary active:opacity-80 ${isDownloading ? 'opacity-50' : ''}`}
                            >
                              <Text className="text-xs font-semibold text-primary-foreground">
                                {isDownloading ? 'Downloading…' : 'Download for Offline'}
                              </Text>
                            </Pressable>
                          )}

                          <Pressable
                            onPress={() => handleDeleteCloud(cloudFile)}
                            className="px-2.5 py-1.5 rounded-md bg-destructive/10 active:opacity-70"
                          >
                            <Text className="text-xs text-destructive font-medium">Delete</Text>
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  )
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Rename Modal */}
      <Modal
        visible={renameTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameTarget(null)}
      >
        <View className="flex-1 bg-black/60 items-center justify-center p-5">
          <View className="w-full max-w-sm rounded-2xl bg-surface border border-border p-5 gap-4">
            <Text className="text-base font-bold text-foreground">Rename Document</Text>
            <TextInput
              value={newTitle}
              onChangeText={setNewTitle}
              autoFocus
              className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground"
              placeholder="Enter new filename"
              placeholderTextColor={mutedForeground}
            />
            <View className="flex-row justify-end gap-2">
              <Button label="Cancel" variant="outline" onPress={() => setRenameTarget(null)} />
              <Button
                label="Save"
                onPress={() => {
                  void handleRenameConfirm()
                }}
                disabled={!newTitle.trim()}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Floating Bag FAB (Bottom Right, Safely Above Bottom Nav Tab) */}
      {snippets.length > 0 && (
        <Pressable
          onPress={() => setIsBagModalOpen(true)}
          style={{
            bottom: Math.max(insets.bottom, 16) + 72,
            right: 20,
            zIndex: 9999,
            elevation: 10,
          }}
          className="absolute h-13 px-4 rounded-full bg-primary flex-row items-center gap-2 shadow-xl active:opacity-85"
          accessibilityLabel="Open Bag Modal"
        >
          <ShoppingBagIcon color="#ffffff" size={20} />
          <Text className="text-sm font-bold text-primary-foreground">Bag ({snippets.length})</Text>
        </Pressable>
      )}

      {/* Snippet Bag Modal */}
      <SnippetBagModal visible={isBagModalOpen} onClose={() => setIsBagModalOpen(false)} />
    </View>
  )
}
