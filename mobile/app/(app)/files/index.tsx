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
import { Button } from '../../../components/button'
import { Card } from '../../../components/card'
import { DocumentIcon, FolderIcon, SearchIcon, CloseIcon } from '../../../components/icons'
import type { RepositoryFile, RepositoryFileType } from '../../../lib/offline/types'
import {
  deleteRepositoryFile,
  formatFileSize,
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

  const [files, setFiles] = useState<RepositoryFile[]>([])
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
      const [fileList, fileStats] = await Promise.all([
        getRepositoryFiles(userId, activeFilter, searchQuery),
        getRepositoryStats(userId),
      ])
      setFiles(fileList)
      setStats(fileStats)
    } catch (error) {
      console.warn('[file-repository] failed to load files:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [userId, activeFilter, searchQuery])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleImport = async (): Promise<void> => {
    try {
      setImporting(true)
      const imported = await pickAndImportFiles(userId)
      if (imported.length > 0) {
        await loadData()
        Alert.alert(
          'Files Imported',
          `Successfully imported ${imported.length} document${imported.length === 1 ? '' : 's'} into your repository.`,
        )
      }
    } catch (error) {
      console.warn('[file-repository] import error:', error)
      Alert.alert('Import Failed', 'Could not import the selected file(s). Please try again.')
    } finally {
      setImporting(false)
    }
  }

  const handleDelete = (file: RepositoryFile): void => {
    Alert.alert(
      'Delete Document?',
      `Are you sure you want to remove "${file.name}" from your repository? This removes the local sandboxed copy.`,
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
    await renameRepositoryFile(renameTarget.id, newTitle.trim())
    setRenameTarget(null)
    setNewTitle('')
    await loadData()
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
      <View className="rounded px-2 py-0.5 bg-sky-600/15 dark:bg-sky-600/25 border border-sky-600/30">
        <Text className="text-[11px] font-bold text-sky-700 dark:text-sky-300">DOC</Text>
      </View>
    )
  }

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
              Store and view your downloaded PDF & Word documents.
            </Text>
          </View>
          <Button
            label={importing ? 'Importing…' : '+ Import'}
            onPress={() => {
              void handleImport()
            }}
            disabled={importing}
          />
        </View>

        {/* Storage Stats Banner */}
        {stats && stats.totalFiles > 0 && (
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
                    {formatFileSize(stats.totalSizeBytes)} stored locally
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

        {/* Document List */}
        {loading ? (
          <View className="py-12 items-center justify-center gap-3">
            <ActivityIndicator size="small" color={primary} />
            <Text className="text-xs text-muted-foreground">Loading documents…</Text>
          </View>
        ) : files.length === 0 ? (
          <Card tone="dashed" className="p-8 items-center justify-center gap-3 text-center">
            <View className="h-14 w-14 rounded-2xl bg-surface-muted items-center justify-center mb-1">
              <DocumentIcon color={primary} size={28} />
            </View>
            <Text className="text-base font-semibold text-foreground text-center">
              {searchQuery ? 'No matching documents' : 'No documents in repository'}
            </Text>
            <Text className="text-xs text-muted-foreground text-center max-w-[280px]">
              {searchQuery
                ? 'Try a different search term or clear the filter.'
                : 'Import downloaded PDFs or Word documents (.docx, .doc) from your device to view and study them offline.'}
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
                        {formatFileSize(file.fileSize)} · Added{' '}
                        {new Date(file.createdAt).toLocaleDateString()}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Bottom Card Actions */}
                <View className="flex-row items-center justify-end gap-2 pt-2 border-t border-border/50">
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
    </View>
  )
}
