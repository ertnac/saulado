import { useCallback, useEffect, useState, type ReactElement } from 'react'
import {
  ActivityIndicator,
  Alert,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { CloudFileSummary } from '@saulado/shared'
import {
  CheckIcon,
  CheckSquareIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  DocumentIcon,
  EditIcon,
  FilePlusIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  MoreHorizontalIcon,
  ShoppingBagIcon,
  SquareIcon,
  TrashIcon,
  XIcon,
} from '../../../components/icons'
import { SnippetBagModal } from '../../../components/snippet-bag-modal'
import { useSnippetBagStore } from '../../../stores/snippet-bag'
import type {
  RepositoryFile,
  RepositoryFileType,
  RepositoryFolder,
} from '../../../lib/offline/types'
import {
  createRepositoryFolder,
  deleteRepositoryFile,
  deleteRepositoryFolder,
  downloadCloudFile,
  fetchCloudFiles,
  formatFileSize,
  getDownloadedCloudFileMap,
  getRepositoryFiles,
  getRepositoryFolders,
  getRepositoryStats,
  moveFilesToFolder,
  pickAndImportFiles,
  renameRepositoryFile,
  updateRepositoryFolder,
  type ImportProgressUpdate,
  type RepositoryStats,
} from '../../../services/file-repository'
import { ConversionProgressModal } from '../../../components/conversion-progress-modal'
import { useAuthStore } from '../../../stores/auth'
import { useTheme } from '../../../stores/theme'

const FOLDER_COLORS = [
  { label: 'Forest', value: '#317054' },
  { label: 'Deep Green', value: '#052E24' },
  { label: 'Sage', value: '#6B9985' },
  { label: 'Teal', value: '#0E7490' },
  { label: 'Blue', value: '#2563EB' },
  { label: 'Indigo', value: '#4F46E5' },
  { label: 'Amber', value: '#D97706' },
  { label: 'Rose', value: '#E11D48' },
]

export default function FileRepositoryScreen(): ReactElement {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const userId = user?.id || 'local-user'
  const { isDark } = useTheme()

  const snippets = useSnippetBagStore((s) => s.snippets)
  const [isBagModalOpen, setIsBagModalOpen] = useState(false)

  // Scopes: Device Files vs Cloud Files
  const [tabScope, setTabScope] = useState<'device' | 'cloud'>('device')

  const [files, setFiles] = useState<RepositoryFile[]>([])
  const [folders, setFolders] = useState<RepositoryFolder[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [isFoldersExpanded, setIsFoldersExpanded] = useState(false)

  const toggleFolders = (): void => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true)
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setIsFoldersExpanded((prev) => !prev)
  }

  // Multi-selection state
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set())

  // Move Modal State
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false)
  const [moveTargetFileIds, setMoveTargetFileIds] = useState<string[]>([])

  // Folder Create/Edit Modal State
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false)
  const [folderModalMode, setFolderModalMode] = useState<'create' | 'edit'>('create')
  const [editingFolder, setEditingFolder] = useState<RepositoryFolder | null>(null)
  const [folderFormName, setFolderFormName] = useState('')
  const [folderFormColor, setFolderFormColor] = useState('#317054')

  const [cloudFiles, setCloudFiles] = useState<CloudFileSummary[]>([])
  const [downloadedMap, setDownloadedMap] = useState<Map<string, string>>(new Map())
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set())

  const [stats, setStats] = useState<RepositoryStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState<ImportProgressUpdate | null>(null)

  const [activeFilter, setActiveFilter] = useState<'all' | 'pdf' | 'image'>('all')

  // Rename modal state
  const [renameTarget, setRenameTarget] = useState<RepositoryFile | null>(null)
  const [newTitle, setNewTitle] = useState('')

  const loadData = useCallback(async () => {
    try {
      const repoFilter: RepositoryFileType | 'all' = activeFilter === 'pdf' ? 'pdf' : 'all'
      const [fileList, folderList, fileStats, cloudMap] = await Promise.all([
        getRepositoryFiles(userId, repoFilter, '', selectedFolderId ?? 'all'),
        getRepositoryFolders(userId),
        getRepositoryStats(userId),
        getDownloadedCloudFileMap(userId),
      ])
      setFiles(fileList)
      setFolders(folderList)
      setStats(fileStats)
      setDownloadedMap(cloudMap)

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
  }, [userId, user, activeFilter, selectedFolderId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const activeFolder = selectedFolderId
    ? (folders.find((f) => f.id === selectedFolderId) ?? null)
    : null

  const handleImport = async (): Promise<void> => {
    try {
      setImporting(true)
      const imported = await pickAndImportFiles(
        userId,
        (update) => {
          setImportProgress(update)
        },
        selectedFolderId,
      )
      if (imported.length > 0) {
        setImportProgress((prev) =>
          prev
            ? {
                ...prev,
                step: 3,
                title: 'Conversion Complete!',
                detail: 'Saved to your offline library.',
              }
            : null,
        )
        await new Promise((resolve) => setTimeout(resolve, 500))
        setImportProgress(null)
        await loadData()
        const destMsg = activeFolder ? ` into folder "${activeFolder.name}"` : ''
        Alert.alert(
          'Files Imported',
          `Successfully imported ${imported.length} document${imported.length === 1 ? '' : 's'}${destMsg}.`,
        )
      }
    } catch (error) {
      console.warn('[file-repository] import error:', error)
      setImportProgress(null)
      const message =
        error instanceof Error
          ? error.message
          : 'Could not import the selected file(s). Please try again.'
      Alert.alert('Import Failed', message)
    } finally {
      setImporting(false)
      setImportProgress(null)
    }
  }

  const handleDelete = (file: RepositoryFile): void => {
    Alert.alert('Delete Document', `Are you sure you want to delete "${file.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await deleteRepositoryFile(file.id)
            await loadData()
          })()
        },
      },
    ])
  }

  const handleRenameSubmit = async (): Promise<void> => {
    if (!renameTarget || !newTitle.trim()) return
    try {
      await renameRepositoryFile(renameTarget.id, newTitle.trim())
      setRenameTarget(null)
      await loadData()
    } catch (error) {
      console.warn('[file-repository] rename error:', error)
      Alert.alert('Rename Failed', 'Could not rename file.')
    }
  }

  const handleDownloadCloud = async (
    cloudFile: CloudFileSummary,
    openAfter = false,
  ): Promise<void> => {
    try {
      setDownloadingIds((prev) => new Set(prev).add(cloudFile.id))
      const downloaded = await downloadCloudFile(cloudFile, userId)
      await loadData()
      if (openAfter) {
        router.push(`/files/${downloaded.id}`)
      }
    } catch (err) {
      console.warn('[file-repository] download error:', err)
      Alert.alert('Download Failed', 'Could not download document from cloud.')
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev)
        next.delete(cloudFile.id)
        return next
      })
    }
  }

  // Folder modal triggers
  const openCreateFolderModal = (): void => {
    setFolderModalMode('create')
    setEditingFolder(null)
    setFolderFormName('')
    setFolderFormColor('#317054')
    setIsFolderModalOpen(true)
  }

  const openEditFolderModal = (folder: RepositoryFolder): void => {
    setFolderModalMode('edit')
    setEditingFolder(folder)
    setFolderFormName(folder.name)
    setFolderFormColor(folder.color || '#317054')
    setIsFolderModalOpen(true)
  }

  const handleSaveFolder = async (): Promise<void> => {
    const trimmed = folderFormName.trim()
    if (!trimmed) {
      Alert.alert('Folder Name Required', 'Please enter a name for the folder.')
      return
    }

    try {
      if (folderModalMode === 'create') {
        const created = await createRepositoryFolder(userId, trimmed, folderFormColor)
        setIsFolderModalOpen(false)
        await loadData()
        setSelectedFolderId(created.id)
        if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
          UIManager.setLayoutAnimationEnabledExperimental(true)
        }
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
        setIsFoldersExpanded(true)
      } else if (editingFolder) {
        await updateRepositoryFolder(editingFolder.id, trimmed, folderFormColor)
        setIsFolderModalOpen(false)
        await loadData()
      }
    } catch (error) {
      console.warn('[file-repository] folder save error:', error)
      Alert.alert('Error', 'Could not save folder. Please try again.')
    }
  }

  const handleDeleteFolder = (folder: RepositoryFolder): void => {
    Alert.alert(
      'Delete Folder',
      `Are you sure you want to delete "${folder.name}"? Documents inside will not be deleted; they will be kept safely in your library as uncategorized.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Folder',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await deleteRepositoryFolder(folder.id)
                if (selectedFolderId === folder.id) {
                  setSelectedFolderId(null)
                }
                await loadData()
              } catch (err) {
                console.warn('[file-repository] delete folder error:', err)
                Alert.alert('Error', 'Could not delete folder.')
              }
            })()
          },
        },
      ],
    )
  }

  // Move to folder triggers
  const handleOpenMoveModalForSingle = (fileId: string): void => {
    setMoveTargetFileIds([fileId])
    setIsMoveModalOpen(true)
  }

  const handleOpenMoveModalForBatch = (): void => {
    if (selectedFileIds.size === 0) {
      Alert.alert('No Files Selected', 'Please select at least one file to move.')
      return
    }
    setMoveTargetFileIds(Array.from(selectedFileIds))
    setIsMoveModalOpen(true)
  }

  const handleExecuteMove = async (targetFolderId: string | null): Promise<void> => {
    if (moveTargetFileIds.length === 0) return
    try {
      await moveFilesToFolder(moveTargetFileIds, targetFolderId)
      setIsMoveModalOpen(false)
      setMoveTargetFileIds([])
      setSelectedFileIds(new Set())
      setIsSelectionMode(false)
      await loadData()
      const destName = targetFolderId
        ? folders.find((f) => f.id === targetFolderId)?.name || 'folder'
        : 'Uncategorized'
      Alert.alert('Moved', `Successfully moved document(s) to ${destName}.`)
    } catch (err) {
      console.warn('[file-repository] move files error:', err)
      Alert.alert('Move Failed', 'Could not move files into the selected folder.')
    }
  }

  const toggleSelectFile = (fileId: string): void => {
    setSelectedFileIds((prev) => {
      const next = new Set(prev)
      if (next.has(fileId)) {
        next.delete(fileId)
      } else {
        next.add(fileId)
      }
      return next
    })
  }

  const handleSelectAll = (): void => {
    if (selectedFileIds.size === files.length) {
      setSelectedFileIds(new Set())
    } else {
      setSelectedFileIds(new Set(files.map((f) => f.id)))
    }
  }

  // Fallback demonstration files
  const mockFiles = [
    {
      id: 'mock-doc-1',
      name: 'Skeletal Structure Anatomy...',
      type: 'PDF',
      size: '4.2 MB',
      time: '2 hours ago',
      color: '#E8F3EE',
      badgeColor: '#317054',
    },
    {
      id: 'mock-doc-2',
      name: 'Swiggy Swamy handwritten...',
      type: 'Image',
      size: '1.8 MB',
      time: 'Yesterday',
      color: '#E8F3EE',
      badgeColor: '#317054',
    },
    {
      id: 'mock-doc-3',
      name: 'Microeconomics Seminar...',
      type: 'Audio',
      size: '12.5 MB',
      time: '3 days ago',
      color: '#E8F3EE',
      badgeColor: '#317054',
    },
  ]

  const displayFiles =
    tabScope === 'cloud'
      ? cloudFiles.map((cf) => {
          const localId = downloadedMap.get(cf.id)
          const matchedLocal = localId ? files.find((f) => f.id === localId) : undefined
          return {
            id: localId || cf.id,
            name: cf.name,
            type: cf.fileType.toUpperCase(),
            size: formatFileSize(cf.fileSize),
            time: downloadedMap.has(cf.id) ? 'Downloaded' : 'In Cloud',
            color: '#E8F3EE',
            badgeColor: '#317054',
            isCloud: true,
            isDownloaded: downloadedMap.has(cf.id),
            isDownloading: downloadingIds.has(cf.id),
            rawCloud: cf,
            rawFile: matchedLocal,
          }
        })
      : files.length > 0
        ? files.map((f, i) => ({
            id: f.id,
            name: f.name,
            type: f.fileType.toUpperCase(),
            size: formatFileSize(f.fileSize),
            time: i === 0 ? '2 hours ago' : i === 1 ? 'Yesterday' : '3 days ago',
            color: '#E8F3EE',
            badgeColor: '#317054',
            isCloud: false,
            isDownloaded: true,
            isDownloading: false,
            rawCloud: undefined as CloudFileSummary | undefined,
            rawFile: f,
          }))
        : mockFiles.map((m) => ({
            ...m,
            isCloud: false,
            isDownloaded: true,
            isDownloading: false,
            rawCloud: undefined as CloudFileSummary | undefined,
            rawFile: undefined as RepositoryFile | undefined,
          }))

  const usedPercent =
    stats && stats.totalFiles > 0
      ? Math.max(
          1,
          Math.min(100, Math.round((stats.totalSizeBytes / (15 * 1024 * 1024 * 1024)) * 100)),
        )
      : 14

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? '#050D0A' : '#FAFBF9' }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: isSelectionMode
            ? Math.max(insets.bottom, 16) + 160
            : Math.max(insets.bottom + 110, 140),
          gap: 18,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true)
              void loadData()
            }}
            tintColor="#317054"
          />
        }
      >
        {/* 1. Top Action Row: Study Bag & Import Pill */}
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          {/* Study Bag Trigger Pill */}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Study Bag with ${snippets.length} items`}
            onPress={() => setIsBagModalOpen(true)}
            activeOpacity={0.75}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingHorizontal: 16,
              height: 44,
              borderRadius: 22,
              backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#E8F3EE',
              borderWidth: 1,
              borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E0ECE5',
            }}
          >
            <ShoppingBagIcon color={isDark ? '#A6C2B5' : '#052E24'} size={18} />
            <Text
              style={{
                fontSize: 14,
                fontWeight: '700',
                color: isDark ? '#FFFFFF' : '#052E24',
              }}
            >
              Study Bag ({snippets.length || 3})
            </Text>
          </TouchableOpacity>

          {/* Import Button */}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Import documents"
            onPress={() => void handleImport()}
            disabled={importing}
            activeOpacity={0.85}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingHorizontal: 20,
              height: 44,
              borderRadius: 22,
              backgroundColor: '#052E24',
              shadowColor: '#052E24',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.2,
              shadowRadius: 8,
              elevation: 4,
            }}
          >
            {importing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <FilePlusIcon color="#FFFFFF" size={18} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>Import</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* 2. Two-Column Storage & Scope Cards */}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {/* Left Card: Scope Segmented Switcher */}
          <View
            style={{
              flex: 1,
              backgroundColor: isDark ? '#111A17' : '#E8F3EE',
              borderRadius: 20,
              padding: 6,
              justifyContent: 'center',
              gap: 4,
            }}
          >
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="On Device"
              onPress={() => setTabScope('device')}
              activeOpacity={0.85}
              style={{
                height: 38,
                borderRadius: 16,
                backgroundColor:
                  tabScope === 'device' ? (isDark ? '#1C2B25' : '#FFFFFF') : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#052E24',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: tabScope === 'device' ? 0.08 : 0,
                shadowRadius: 4,
                elevation: tabScope === 'device' ? 2 : 0,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: tabScope === 'device' ? '700' : '500',
                  color:
                    tabScope === 'device'
                      ? isDark
                        ? '#FFFFFF'
                        : '#111A17'
                      : isDark
                        ? '#889591'
                        : '#4C5854',
                }}
              >
                On Device
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Cloud Bag"
              onPress={() => setTabScope('cloud')}
              activeOpacity={0.85}
              style={{
                height: 38,
                borderRadius: 16,
                backgroundColor:
                  tabScope === 'cloud' ? (isDark ? '#1C2B25' : '#FFFFFF') : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#052E24',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: tabScope === 'cloud' ? 0.08 : 0,
                shadowRadius: 4,
                elevation: tabScope === 'cloud' ? 2 : 0,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: tabScope === 'cloud' ? '700' : '500',
                  color:
                    tabScope === 'cloud'
                      ? isDark
                        ? '#FFFFFF'
                        : '#111A17'
                      : isDark
                        ? '#889591'
                        : '#4C5854',
                }}
              >
                Cloud Bag
              </Text>
            </TouchableOpacity>
          </View>

          {/* Right Card: Storage Footprint Card */}
          <View
            style={{
              flex: 1.2,
              backgroundColor: isDark ? '#111A17' : '#FFFFFF',
              borderRadius: 20,
              borderWidth: 1,
              borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEF2EE',
              padding: 14,
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Text
                style={{ fontSize: 11, color: isDark ? '#889591' : '#4C5854', fontWeight: '500' }}
              >
                Local Space
              </Text>
              <Text
                style={{ fontSize: 13, fontWeight: '800', color: isDark ? '#A6C2B5' : '#052E24' }}
              >
                {usedPercent}% Used
              </Text>
            </View>

            {/* Storage Progress Bar */}
            <View
              style={{
                height: 6,
                borderRadius: 3,
                backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#E8F3EE',
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  height: '100%',
                  width: `${usedPercent}%`,
                  backgroundColor: '#052E24',
                  borderRadius: 3,
                }}
              />
            </View>

            <Text style={{ fontSize: 11, color: isDark ? '#889591' : '#4C5854' }}>
              3.2 GB of 15 GB Free
            </Text>
          </View>
        </View>

        {/* 3. Folders Section (Only on Device tab) */}
        {tabScope === 'device' && (
          <View style={{ gap: 10 }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              {/* Tappable Header Title & Active Folder Pill */}
              <TouchableOpacity
                onPress={toggleFolders}
                activeOpacity={0.7}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}
                accessibilityRole="button"
                accessibilityLabel={`Folders, ${folders.length} available. Tap to ${isFoldersExpanded ? 'collapse' : 'expand'} folder view`}
              >
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: '700',
                    color: isDark ? '#FFFFFF' : '#111A17',
                  }}
                >
                  Folders
                </Text>
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 10,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E8F3EE',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '700',
                      color: isDark ? '#A6C2B5' : '#317054',
                    }}
                  >
                    {folders.length}
                  </Text>
                </View>

                {/* In collapsed mode, display current active folder pill with quick clear */}
                {!isFoldersExpanded && activeFolder && (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      paddingLeft: 8,
                      paddingRight: 4,
                      paddingVertical: 2,
                      borderRadius: 8,
                      backgroundColor: `${activeFolder.color || '#317054'}1E`,
                    }}
                  >
                    <FolderIcon color={activeFolder.color || '#317054'} size={11} />
                    <Text
                      numberOfLines={1}
                      style={{
                        fontSize: 11,
                        fontWeight: '700',
                        color: isDark ? '#A6C2B5' : activeFolder.color || '#317054',
                        maxWidth: 95,
                      }}
                    >
                      {activeFolder.name}
                    </Text>
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation()
                        setSelectedFolderId(null)
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={{ padding: 2 }}
                      accessibilityLabel="Clear folder filter"
                    >
                      <XIcon
                        color={isDark ? '#A6C2B5' : activeFolder.color || '#317054'}
                        size={11}
                      />
                    </TouchableOpacity>
                  </View>
                )}
              </TouchableOpacity>

              {/* Right Side Control: When in full view / not collapsed, New Folder is replaced by the Dropdown Collapse button */}
              {isFoldersExpanded ? (
                <TouchableOpacity
                  onPress={toggleFolders}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 14,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E8F3EE',
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(255,255,255,0.12)' : '#D0E3D8',
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Collapse Folders Dropdown"
                >
                  <ChevronUpIcon color={isDark ? '#A6C2B5' : '#052E24'} size={15} />
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '700',
                      color: isDark ? '#A6C2B5' : '#052E24',
                    }}
                  >
                    Collapse
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <TouchableOpacity
                    onPress={openCreateFolderModal}
                    activeOpacity={0.7}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 14,
                      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#E8F3EE',
                      borderWidth: 1,
                      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E0ECE5',
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="New Folder"
                  >
                    <FolderPlusIcon color={isDark ? '#A6C2B5' : '#052E24'} size={15} />
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '700',
                        color: isDark ? '#A6C2B5' : '#052E24',
                      }}
                    >
                      New Folder
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={toggleFolders}
                    activeOpacity={0.7}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#E8F3EE',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1,
                      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E0ECE5',
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Expand Folders Dropdown"
                  >
                    <ChevronDownIcon color={isDark ? '#A6C2B5' : '#052E24'} size={16} />
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Collapsible Horizontal Folder Carousel: rendered only when expanded */}
            {isFoldersExpanded && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 10, paddingVertical: 2 }}
              >
                {/* "All Files" Card */}
                <TouchableOpacity
                  onPress={() => setSelectedFolderId(null)}
                  activeOpacity={0.8}
                  style={{
                    minWidth: 120,
                    padding: 12,
                    borderRadius: 18,
                    backgroundColor:
                      selectedFolderId === null ? '#052E24' : isDark ? '#111A17' : '#FFFFFF',
                    borderWidth: 1,
                    borderColor:
                      selectedFolderId === null
                        ? '#052E24'
                        : isDark
                          ? 'rgba(255,255,255,0.08)'
                          : '#EEF2EE',
                    gap: 8,
                    shadowColor: '#052E24',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: selectedFolderId === null ? 0.2 : 0.03,
                    shadowRadius: 6,
                    elevation: 2,
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      backgroundColor:
                        selectedFolderId === null
                          ? 'rgba(255,255,255,0.15)'
                          : isDark
                            ? 'rgba(255,255,255,0.06)'
                            : '#E8F3EE',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <FolderIcon
                      color={selectedFolderId === null ? '#FFFFFF' : isDark ? '#A6C2B5' : '#317054'}
                      size={18}
                    />
                  </View>
                  <View>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontSize: 13,
                        fontWeight: '700',
                        color:
                          selectedFolderId === null ? '#FFFFFF' : isDark ? '#FFFFFF' : '#111A17',
                      }}
                    >
                      All Files
                    </Text>
                    <Text
                      style={{
                        fontSize: 11,
                        color:
                          selectedFolderId === null ? '#A6C2B5' : isDark ? '#889591' : '#4C5854',
                      }}
                    >
                      {stats?.totalFiles ?? files.length} files
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* Custom Folder Cards */}
                {folders.map((folder) => {
                  const isSelected = selectedFolderId === folder.id
                  return (
                    <TouchableOpacity
                      key={folder.id}
                      onPress={() => setSelectedFolderId(folder.id)}
                      onLongPress={() => openEditFolderModal(folder)}
                      activeOpacity={0.8}
                      style={{
                        minWidth: 125,
                        padding: 12,
                        borderRadius: 18,
                        backgroundColor: isSelected
                          ? isDark
                            ? '#1C2B25'
                            : '#E8F3EE'
                          : isDark
                            ? '#111A17'
                            : '#FFFFFF',
                        borderWidth: 1.5,
                        borderColor: isSelected
                          ? folder.color || '#317054'
                          : isDark
                            ? 'rgba(255,255,255,0.08)'
                            : '#EEF2EE',
                        gap: 8,
                        shadowColor: '#052E24',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: isSelected ? 0.15 : 0.03,
                        shadowRadius: 6,
                        elevation: 2,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <View
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            backgroundColor: `${folder.color || '#317054'}22`,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <FolderIcon color={folder.color || '#317054'} size={18} />
                        </View>
                        <TouchableOpacity
                          onPress={() => openEditFolderModal(folder)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          style={{ padding: 2 }}
                        >
                          <MoreHorizontalIcon color={isDark ? '#889591' : '#889591'} size={16} />
                        </TouchableOpacity>
                      </View>
                      <View>
                        <Text
                          numberOfLines={1}
                          style={{
                            fontSize: 13,
                            fontWeight: '700',
                            color: isDark ? '#FFFFFF' : '#111A17',
                          }}
                        >
                          {folder.name}
                        </Text>
                        <Text
                          style={{
                            fontSize: 11,
                            color: isDark ? '#889591' : '#4C5854',
                          }}
                        >
                          {folder.fileCount || 0} {folder.fileCount === 1 ? 'file' : 'files'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )
                })}

                {/* Quick Add Button Card */}
                <TouchableOpacity
                  onPress={openCreateFolderModal}
                  activeOpacity={0.7}
                  style={{
                    minWidth: 100,
                    padding: 12,
                    borderRadius: 18,
                    borderWidth: 1.5,
                    borderStyle: 'dashed',
                    borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#A6C2B5',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <FolderPlusIcon color={isDark ? '#A6C2B5' : '#317054'} size={20} />
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '700',
                      color: isDark ? '#A6C2B5' : '#317054',
                    }}
                  >
                    + Add
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        )}

        {/* Active Folder Filter Header Banner */}
        {selectedFolderId !== null && activeFolder && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderRadius: 16,
              backgroundColor: isDark ? '#1C2B25' : '#E8F3EE',
              borderLeftWidth: 4,
              borderLeftColor: activeFolder.color || '#317054',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <FolderIcon color={activeFolder.color || '#317054'} size={20} />
              <View style={{ flex: 1 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 14,
                    fontWeight: '700',
                    color: isDark ? '#FFFFFF' : '#052E24',
                  }}
                >
                  {activeFolder.name}
                </Text>
                <Text style={{ fontSize: 11, color: isDark ? '#A6C2B5' : '#4C5854' }}>
                  {files.length} {files.length === 1 ? 'document' : 'documents'} inside
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TouchableOpacity
                onPress={() => openEditFolderModal(activeFolder)}
                style={{ padding: 6 }}
                accessibilityLabel="Edit Folder"
              >
                <EditIcon color={isDark ? '#A6C2B5' : '#317054'} size={17} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleDeleteFolder(activeFolder)}
                style={{ padding: 6 }}
                accessibilityLabel="Delete Folder"
              >
                <TrashIcon color="#E11D48" size={17} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setSelectedFolderId(null)}
                activeOpacity={0.7}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 12,
                  backgroundColor: '#052E24',
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF' }}>All Files</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* 4. Filter Chips Row (All / PDF Documents / Images) */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(
            [
              { key: 'all', label: 'All' },
              { key: 'pdf', label: 'PDF Documents' },
              { key: 'image', label: 'Images' },
            ] as const
          ).map((chip) => {
            const selected = activeFilter === chip.key
            return (
              <TouchableOpacity
                key={chip.key}
                accessibilityRole="button"
                accessibilityLabel={chip.label}
                accessibilityState={{ selected }}
                onPress={() => setActiveFilter(chip.key)}
                activeOpacity={0.75}
                style={{
                  height: 38,
                  paddingHorizontal: 16,
                  borderRadius: 19,
                  backgroundColor: selected ? '#052E24' : isDark ? '#111A17' : '#FFFFFF',
                  borderWidth: selected ? 0 : 1,
                  borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEF2EE',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: selected ? '700' : '500',
                    color: selected ? '#FFFFFF' : isDark ? '#889591' : '#4C5854',
                  }}
                >
                  {chip.label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>

        {loading && (
          <View style={{ paddingVertical: 10, alignItems: 'center' }}>
            <ActivityIndicator size="small" color="#317054" />
          </View>
        )}

        {/* 5. Document List Header with Document Count + Select Toggle */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: 4,
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: '700',
              color: isDark ? '#A6C2B5' : '#4C5854',
              textTransform: 'uppercase',
              letterSpacing: 0.8,
            }}
          >
            {tabScope === 'cloud'
              ? `Cloud Bag (${displayFiles.length})`
              : selectedFolderId !== null
                ? `${activeFolder?.name || 'Folder'} Files (${displayFiles.length})`
                : `All Documents (${displayFiles.length})`}
          </Text>

          {tabScope === 'device' && files.length > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {isSelectionMode && (
                <TouchableOpacity
                  onPress={handleSelectAll}
                  activeOpacity={0.7}
                  style={{ paddingHorizontal: 6, paddingVertical: 4 }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '700',
                      color: isDark ? '#A6C2B5' : '#317054',
                    }}
                  >
                    {selectedFileIds.size === files.length ? 'Deselect All' : 'Select All'}
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={() => {
                  setIsSelectionMode(!isSelectionMode)
                  setSelectedFileIds(new Set())
                }}
                activeOpacity={0.7}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  paddingHorizontal: 12,
                  paddingVertical: 5,
                  borderRadius: 14,
                  backgroundColor: isSelectionMode
                    ? '#052E24'
                    : isDark
                      ? 'rgba(255,255,255,0.06)'
                      : '#E8F3EE',
                }}
              >
                <CheckSquareIcon
                  color={isSelectionMode ? '#FFFFFF' : isDark ? '#A6C2B5' : '#052E24'}
                  size={14}
                />
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '700',
                    color: isSelectionMode ? '#FFFFFF' : isDark ? '#A6C2B5' : '#052E24',
                  }}
                >
                  {isSelectionMode ? 'Done' : 'Select'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* 6. Document Cards List */}
        <View style={{ gap: 12 }}>
          {displayFiles.map((item) => {
            const isSelected = selectedFileIds.has(item.id)
            const matchedFolder = item.rawFile?.folderId
              ? folders.find((f) => f.id === item.rawFile?.folderId)
              : null

            return (
              <TouchableOpacity
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={`${item.name}, ${item.type} document, ${item.size}`}
                onPress={() => {
                  if (isSelectionMode) {
                    toggleSelectFile(item.id)
                    return
                  }
                  if (item.isCloud && !item.isDownloaded && item.rawCloud) {
                    void handleDownloadCloud(item.rawCloud, true)
                  } else if (!item.id.startsWith('mock-')) {
                    router.push(`/files/${item.id}`)
                  }
                }}
                onLongPress={() => {
                  if (!item.id.startsWith('mock-')) {
                    if (!isSelectionMode) {
                      setIsSelectionMode(true)
                      setSelectedFileIds(new Set([item.id]))
                    } else {
                      toggleSelectFile(item.id)
                    }
                  } else if (item.rawFile) {
                    handleDelete(item.rawFile)
                  }
                }}
                activeOpacity={0.8}
                style={{
                  backgroundColor: isSelected
                    ? isDark
                      ? '#1C2B25'
                      : '#E8F3EE'
                    : isDark
                      ? '#111A17'
                      : '#FFFFFF',
                  borderRadius: 20,
                  borderWidth: isSelected ? 1.5 : 1,
                  borderColor: isSelected
                    ? '#317054'
                    : isDark
                      ? 'rgba(255,255,255,0.08)'
                      : '#EEF2EE',
                  padding: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  shadowColor: '#052E24',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: isDark ? 0.2 : 0.03,
                  shadowRadius: 8,
                  elevation: 2,
                }}
              >
                {/* Selection Checkbox (visible in selection mode) */}
                {isSelectionMode && (
                  <TouchableOpacity
                    onPress={() => toggleSelectFile(item.id)}
                    activeOpacity={0.7}
                    style={{ paddingRight: 2 }}
                  >
                    {isSelected ? (
                      <CheckSquareIcon color="#052E24" size={22} />
                    ) : (
                      <SquareIcon color={isDark ? '#889591' : '#A6C2B5'} size={22} />
                    )}
                  </TouchableOpacity>
                )}

                {/* Document Thumbnail Preview Icon */}
                <View
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 14,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#E8F3EE',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <DocumentIcon color={isDark ? '#A6C2B5' : '#317054'} size={24} />
                </View>

                {/* Title, Badges, Size & Time */}
                <View style={{ flex: 1, gap: 4 }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: 15,
                      fontWeight: '700',
                      color: isDark ? '#FFFFFF' : '#111A17',
                    }}
                  >
                    {item.name}
                  </Text>
                  <View
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}
                  >
                    <View
                      style={{
                        paddingHorizontal: 7,
                        paddingVertical: 2,
                        borderRadius: 6,
                        backgroundColor: isDark ? 'rgba(49, 112, 84, 0.25)' : '#E8F3EE',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: '700',
                          color: isDark ? '#A6C2B5' : '#317054',
                        }}
                      >
                        {item.type}
                      </Text>
                    </View>

                    {/* Folder Badge if assigned */}
                    {matchedFolder && (
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                          paddingHorizontal: 7,
                          paddingVertical: 2,
                          borderRadius: 6,
                          backgroundColor: `${matchedFolder.color || '#317054'}1A`,
                        }}
                      >
                        <FolderIcon color={matchedFolder.color || '#317054'} size={10} />
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '700',
                            color: isDark ? '#A6C2B5' : matchedFolder.color || '#317054',
                          }}
                        >
                          {matchedFolder.name}
                        </Text>
                      </View>
                    )}

                    <Text style={{ fontSize: 12, color: isDark ? '#889591' : '#4C5854' }}>
                      {item.size}
                    </Text>
                    <Text style={{ fontSize: 12, color: isDark ? '#889591' : '#889591' }}>
                      · {item.time}
                    </Text>
                  </View>
                </View>

                {/* Action Buttons Row on the right */}
                {!isSelectionMode && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {/* Quick Move to Folder button */}
                    {tabScope === 'device' && !item.id.startsWith('mock-') && (
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel="Move to Folder"
                        onPress={() => handleOpenMoveModalForSingle(item.id)}
                        activeOpacity={0.7}
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 12,
                          backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#E8F3EE',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <FolderIcon color={isDark ? '#A6C2B5' : '#317054'} size={18} />
                      </TouchableOpacity>
                    )}

                    {/* Dark Forest Action Button */}
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={
                        item.isCloud && !item.isDownloaded ? 'Download document' : 'Open document'
                      }
                      onPress={() => {
                        if (item.isCloud && !item.isDownloaded && item.rawCloud) {
                          void handleDownloadCloud(item.rawCloud, true)
                        } else if (!item.id.startsWith('mock-')) {
                          router.push(`/files/${item.id}`)
                        }
                      }}
                      activeOpacity={0.8}
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 14,
                        backgroundColor: '#052E24',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {item.isDownloading ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <FileTextIcon color="#FFFFFF" size={20} />
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </TouchableOpacity>
            )
          })}
        </View>
      </ScrollView>

      {/* Floating Bottom Bar for Multi-Select Mode */}
      {isSelectionMode && (
        <View
          style={{
            position: 'absolute',
            bottom: Math.max(insets.bottom, 16) + 80,
            left: 16,
            right: 16,
            backgroundColor: '#052E24',
            borderRadius: 24,
            paddingHorizontal: 18,
            paddingVertical: 12,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.14)',
            shadowColor: '#052E24',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.4,
            shadowRadius: 16,
            elevation: 20,
            zIndex: 999,
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>
            {selectedFileIds.size} Selected
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity
              onPress={() => {
                setIsSelectionMode(false)
                setSelectedFileIds(new Set())
              }}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 14,
                backgroundColor: 'rgba(255,255,255,0.12)',
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFFFFF' }}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleOpenMoveModalForBatch}
              disabled={selectedFileIds.size === 0}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 14,
                backgroundColor: selectedFileIds.size > 0 ? '#317054' : 'rgba(255,255,255,0.2)',
              }}
            >
              <FolderIcon color="#FFFFFF" size={16} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>Move</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Move to Folder Modal */}
      <Modal
        visible={isMoveModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsMoveModalOpen(false)}
      >
        <Pressable
          onPress={() => setIsMoveModalOpen(false)}
          style={{
            flex: 1,
            backgroundColor: 'rgba(5, 46, 36, 0.45)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 380,
              maxHeight: '80%',
              borderRadius: 24,
              backgroundColor: isDark ? '#111A17' : '#FFFFFF',
              padding: 22,
              gap: 16,
              shadowColor: '#052E24',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.15,
              shadowRadius: 20,
              elevation: 8,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Text
                style={{ fontSize: 18, fontWeight: '700', color: isDark ? '#FFFFFF' : '#111A17' }}
              >
                Move{' '}
                {moveTargetFileIds.length === 1
                  ? 'Document'
                  : `${moveTargetFileIds.length} Documents`}
              </Text>
              <TouchableOpacity onPress={() => setIsMoveModalOpen(false)} style={{ padding: 4 }}>
                <XIcon color={isDark ? '#889591' : '#4C5854'} size={18} />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 13, color: isDark ? '#889591' : '#4C5854' }}>
              Select destination folder:
            </Text>

            <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={{ gap: 8 }}>
              {/* Uncategorized / None Option */}
              <TouchableOpacity
                onPress={() => void handleExecuteMove(null)}
                activeOpacity={0.75}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: 12,
                  borderRadius: 14,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F7FAF8',
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#EEF2EE',
                }}
              >
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E8F3EE',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <FolderOpenIcon color={isDark ? '#889591' : '#4C5854'} size={20} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: '600',
                      color: isDark ? '#FFFFFF' : '#111A17',
                    }}
                  >
                    Uncategorized (No Folder)
                  </Text>
                  <Text style={{ fontSize: 11, color: isDark ? '#889591' : '#889591' }}>
                    Remove from current folder
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Existing Folders */}
              {folders.map((folder) => (
                <TouchableOpacity
                  key={folder.id}
                  onPress={() => void handleExecuteMove(folder.id)}
                  activeOpacity={0.75}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: 12,
                    borderRadius: 14,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F7FAF8',
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#EEF2EE',
                  }}
                >
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      backgroundColor: `${folder.color || '#317054'}20`,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <FolderIcon color={folder.color || '#317054'} size={20} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: '700',
                        color: isDark ? '#FFFFFF' : '#111A17',
                      }}
                    >
                      {folder.name}
                    </Text>
                    <Text style={{ fontSize: 11, color: isDark ? '#889591' : '#889591' }}>
                      {folder.fileCount || 0} {folder.fileCount === 1 ? 'file' : 'files'}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Quick "+ New Folder" action inside move modal */}
            <TouchableOpacity
              onPress={() => {
                setIsMoveModalOpen(false)
                openCreateFolderModal()
              }}
              activeOpacity={0.8}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                paddingVertical: 12,
                borderRadius: 14,
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: isDark ? 'rgba(255,255,255,0.2)' : '#A6C2B5',
                backgroundColor: isDark ? 'transparent' : '#FAFBF9',
              }}
            >
              <FolderPlusIcon color={isDark ? '#A6C2B5' : '#317054'} size={18} />
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: isDark ? '#A6C2B5' : '#317054',
                }}
              >
                Create New Folder
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Create / Edit Folder Modal */}
      <Modal
        visible={isFolderModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsFolderModalOpen(false)}
      >
        <Pressable
          onPress={() => setIsFolderModalOpen(false)}
          style={{
            flex: 1,
            backgroundColor: 'rgba(5, 46, 36, 0.45)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 380,
              borderRadius: 24,
              backgroundColor: isDark ? '#111A17' : '#FFFFFF',
              padding: 22,
              gap: 16,
              shadowColor: '#052E24',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.15,
              shadowRadius: 20,
              elevation: 8,
            }}
          >
            <Text
              style={{ fontSize: 18, fontWeight: '700', color: isDark ? '#FFFFFF' : '#111A17' }}
            >
              {folderModalMode === 'create' ? 'Create New Folder' : 'Edit Folder'}
            </Text>

            <View style={{ gap: 6 }}>
              <Text
                style={{ fontSize: 12, fontWeight: '600', color: isDark ? '#889591' : '#4C5854' }}
              >
                Folder Name
              </Text>
              <TextInput
                value={folderFormName}
                onChangeText={setFolderFormName}
                placeholder="e.g. Science, Mathematics, History"
                placeholderTextColor={isDark ? '#889591' : '#889591'}
                autoFocus
                style={{
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(255,255,255,0.12)' : '#E0ECE5',
                  borderRadius: 14,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: 14,
                  color: isDark ? '#FFFFFF' : '#111A17',
                  backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#FAFBF9',
                }}
              />
            </View>

            <View style={{ gap: 8 }}>
              <Text
                style={{ fontSize: 12, fontWeight: '600', color: isDark ? '#889591' : '#4C5854' }}
              >
                Color Tag
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {FOLDER_COLORS.map((c) => {
                  const isSelected = folderFormColor === c.value
                  return (
                    <TouchableOpacity
                      key={c.value}
                      onPress={() => setFolderFormColor(c.value)}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: c.value,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: isSelected ? 3 : 0,
                        borderColor: isDark ? '#FFFFFF' : '#052E24',
                      }}
                    >
                      {isSelected && <CheckIcon color="#FFFFFF" size={16} />}
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>

            <View
              style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}
            >
              <TouchableOpacity
                onPress={() => setIsFolderModalOpen(false)}
                style={{ paddingHorizontal: 16, paddingVertical: 10 }}
              >
                <Text style={{ color: isDark ? '#889591' : '#4C5854', fontWeight: '600' }}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void handleSaveFolder()}
                style={{
                  backgroundColor: '#052E24',
                  borderRadius: 14,
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>
                  {folderModalMode === 'create' ? 'Create' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Snippet Bag Modal */}
      <SnippetBagModal visible={isBagModalOpen} onClose={() => setIsBagModalOpen(false)} />

      {/* Rename File Modal */}
      {renameTarget && (
        <Modal
          visible={Boolean(renameTarget)}
          transparent
          animationType="fade"
          onRequestClose={() => setRenameTarget(null)}
        >
          <Pressable
            onPress={() => setRenameTarget(null)}
            style={{
              flex: 1,
              backgroundColor: 'rgba(5, 46, 36, 0.45)',
              justifyContent: 'center',
              alignItems: 'center',
              padding: 20,
            }}
          >
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: 360,
                borderRadius: 20,
                backgroundColor: isDark ? '#111A17' : '#FFFFFF',
                padding: 20,
                gap: 14,
              }}
            >
              <Text
                style={{ fontSize: 18, fontWeight: '700', color: isDark ? '#FFFFFF' : '#111A17' }}
              >
                Rename File
              </Text>
              <TextInput
                value={newTitle}
                onChangeText={setNewTitle}
                placeholder="Enter new filename"
                placeholderTextColor={isDark ? '#889591' : '#889591'}
                style={{
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#EEF2EE',
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  fontSize: 14,
                  color: isDark ? '#FFFFFF' : '#111A17',
                }}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
                <TouchableOpacity
                  onPress={() => setRenameTarget(null)}
                  style={{ paddingHorizontal: 14, paddingVertical: 8 }}
                >
                  <Text style={{ color: isDark ? '#889591' : '#4C5854', fontWeight: '600' }}>
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => void handleRenameSubmit()}
                  style={{
                    backgroundColor: '#052E24',
                    borderRadius: 10,
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Save</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* 3-Step Automatic Document Conversion Progress Modal */}
      <ConversionProgressModal
        visible={Boolean(importProgress)}
        step={importProgress?.step ?? 1}
        title={importProgress?.title ?? 'Importing File'}
        detail={importProgress?.detail ?? 'Processing document...'}
        fileName={importProgress?.fileName}
      />
    </View>
  )
}
