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
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { CloudFileSummary } from '@saulado/shared'
import {
  DocumentIcon,
  FilePlusIcon,
  FileTextIcon,
  ShoppingBagIcon,
} from '../../../components/icons'
import { SnippetBagModal } from '../../../components/snippet-bag-modal'
import { useSnippetBagStore } from '../../../stores/snippet-bag'
import type { RepositoryFile, RepositoryFileType } from '../../../lib/offline/types'
import {
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
import { useTheme } from '../../../stores/theme'

export default function FileRepositoryScreen(): ReactElement {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const userId = user?.id || 'local-user'
  const { isDark } = useTheme()

  const snippets = useSnippetBagStore((s) => s.snippets)
  const [isBagModalOpen, setIsBagModalOpen] = useState(false)

  // Scopes: Device Files vs Cloud Files (Image 1: "On Device" vs "Cloud Bag")
  const [tabScope, setTabScope] = useState<'device' | 'cloud'>('device')

  const [files, setFiles] = useState<RepositoryFile[]>([])
  const [cloudFiles, setCloudFiles] = useState<CloudFileSummary[]>([])
  const [downloadedMap, setDownloadedMap] = useState<Map<string, string>>(new Map())
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set())

  const [stats, setStats] = useState<RepositoryStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [importing, setImporting] = useState(false)

  const [activeFilter, setActiveFilter] = useState<'all' | 'pdf' | 'image'>('all')

  // Rename modal state
  const [renameTarget, setRenameTarget] = useState<RepositoryFile | null>(null)
  const [newTitle, setNewTitle] = useState('')

  const loadData = useCallback(async () => {
    try {
      const repoFilter: RepositoryFileType | 'all' = activeFilter === 'pdf' ? 'pdf' : 'all'
      const [fileList, fileStats, cloudMap] = await Promise.all([
        getRepositoryFiles(userId, repoFilter, ''),
        getRepositoryStats(userId),
        getDownloadedCloudFileMap(userId),
      ])
      setFiles(fileList)
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
  }, [userId, user, activeFilter])

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
          `Successfully imported ${imported.length} document${imported.length === 1 ? '' : 's'}.`,
        )
      }
    } catch (error) {
      console.warn('[file-repository] import error:', error)
      const message =
        error instanceof Error
          ? error.message
          : 'Could not import the selected file(s). Please try again.'
      Alert.alert('Import Failed', message)
    } finally {
      setImporting(false)
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

  const handleDownloadCloud = async (cloudFile: CloudFileSummary): Promise<void> => {
    try {
      setDownloadingIds((prev) => new Set(prev).add(cloudFile.id))
      await downloadCloudFile(cloudFile, userId)
      await loadData()
    } catch (err) {
      console.warn('[file-repository] download error:', err)
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev)
        next.delete(cloudFile.id)
        return next
      })
    }
  }

  // Fallback demonstration files matching Image 1
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
      ? cloudFiles.map((cf) => ({
          id: cf.id,
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
          rawFile: undefined as RepositoryFile | undefined,
        }))
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
          paddingBottom: Math.max(insets.bottom + 96, 128),
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
        {/* 1. Top Action Row: Study Bag & Import Pill (Image 1) */}
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

        {/* 2. Two-Column Storage & Scope Cards (Image 1) */}
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

        {/* 3. Filter Chips Row (All / PDF Documents / Images) */}
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

        {/* 4. Document Cards List (Image 1) */}
        <View style={{ gap: 12 }}>
          {displayFiles.map((item) => (
            <TouchableOpacity
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`${item.name}, ${item.type} document, ${item.size}`}
              onPress={() => {
                if (!item.id.startsWith('mock-') && item.rawFile) {
                  router.push(`/files/${item.id}`)
                }
              }}
              onLongPress={() => {
                if (item.rawFile) {
                  handleDelete(item.rawFile)
                }
              }}
              activeOpacity={0.8}
              style={{
                backgroundColor: isDark ? '#111A17' : '#FFFFFF',
                borderRadius: 20,
                borderWidth: 1,
                borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEF2EE',
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

              {/* Title, Badge, Size & Time */}
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
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
                  <Text style={{ fontSize: 12, color: isDark ? '#889591' : '#4C5854' }}>
                    {item.size}
                  </Text>
                  <Text style={{ fontSize: 12, color: isDark ? '#889591' : '#889591' }}>
                    · {item.time}
                  </Text>
                </View>
              </View>

              {/* Dark Forest Action Button (Right) */}
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={
                  item.isCloud && !item.isDownloaded ? 'Download document' : 'Open document'
                }
                onPress={() => {
                  if (item.isCloud && !item.isDownloaded && item.rawCloud) {
                    void handleDownloadCloud(item.rawCloud)
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
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

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
    </View>
  )
}
