import { useEffect, useRef, useState, type ComponentRef, type ReactElement } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'
import * as Sharing from 'expo-sharing'
import type { PdfHighlight } from '@saulado/shared'
import { Button } from '../../../components/button'
import { Card } from '../../../components/card'
import {
  BookOpenIcon,
  CheckIcon,
  ChevronLeftIcon,
  CloseIcon,
  MoreHorizontalIcon,
  ShareIcon,
  ShoppingBagIcon,
} from '../../../components/icons'
import { QuickCardModal } from '../../../components/quick-card-modal'
import { SnippetBagModal } from '../../../components/snippet-bag-modal'
import type { RepositoryFile } from '../../../lib/offline/types'
import {
  formatFileSize,
  getRepositoryFile,
  updateFileLastViewed,
} from '../../../services/file-repository'
import { loadDocumentContent, type DocumentContentResult } from '../../../services/document-viewer'
import { getFileHighlights, saveFileHighlight } from '../../../services/highlights'
import { resolveUserId } from '../../../hooks/cards'
import { useSnippetBagStore } from '../../../stores/snippet-bag'
import {
  useHighlightPreferencesStore,
  getHighlightHex,
} from '../../../stores/highlight-preferences'
import { useTheme } from '../../../stores/theme'

interface CurrentSelection {
  text: string
  pageNumber?: number
  startOffset?: number
  endOffset?: number
}

export default function DocumentViewerScreen(): ReactElement {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const webViewRef = useRef<ComponentRef<typeof WebView>>(null)
  const { fileId } = useLocalSearchParams<{ fileId: string }>()
  const { isDark } = useTheme()

  const snippets = useSnippetBagStore((s) => s.snippets)
  const addSnippet = useSnippetBagStore((s) => s.addSnippet)
  const highlightColor = useHighlightPreferencesStore((s) => s.highlightColor)

  const [file, setFile] = useState<RepositoryFile | null>(null)
  const [content, setContent] = useState<DocumentContentResult | null>(null)
  const [highlights, setHighlights] = useState<PdfHighlight[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'visual' | 'reader'>('visual')
  const [zoomScale, setZoomScale] = useState<number>(1.0)
  const [pageProgress, setPageProgress] = useState<{ current: number; total: number } | null>(null)

  const [currentSelection, setCurrentSelection] = useState<CurrentSelection | null>(null)
  const [isBagModalOpen, setIsBagModalOpen] = useState(false)
  const [isQuickCardOpen, setIsQuickCardOpen] = useState(false)
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false)
  const [isAddedToastVisible, setIsAddedToastVisible] = useState(false)
  const [baggedNotice, setBaggedNotice] = useState<string | null>(null)

  const bottomNavOffset = Math.max(insets.bottom, 16) + 64 + 14

  useEffect(() => {
    async function load() {
      if (!fileId) return
      try {
        setLoading(true)
        setError(null)
        const item = await getRepositoryFile(fileId)
        if (!item) {
          setError('Document not found in repository.')
          return
        }
        setFile(item)
        void updateFileLastViewed(fileId)

        const userHighlights = await getFileHighlights(fileId)
        setHighlights(userHighlights)

        const docContent = await loadDocumentContent(item, isDark, userHighlights)
        setContent(docContent)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Could not render document.'
        console.warn('[document-viewer] load error:', err)
        setError(msg)
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [fileId, isDark])

  const handleShare = async (): Promise<void> => {
    if (!file) return
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
    } catch (err) {
      console.warn('[document-viewer] share failed:', err)
    }
  }

  const toggleZoom = (): void => {
    const next = zoomScale === 1.0 ? 1.25 : zoomScale === 1.25 ? 1.5 : 1.0
    setZoomScale(next)
    webViewRef.current?.injectJavaScript(`window.setDocumentZoom(${next}); true;`)
  }

  const handleWebViewMessage = (event: { nativeEvent: { data: string } }): void => {
    try {
      const data: unknown = JSON.parse(event.nativeEvent.data)
      if (typeof data === 'object' && data !== null && 'type' in data) {
        const payload = data as {
          type?: unknown
          text?: unknown
          pageNumber?: unknown
          startOffset?: unknown
          endOffset?: unknown
          totalPages?: unknown
        }

        if (payload.type === 'PDF_TEXT_SELECTION' && typeof payload.text === 'string') {
          const trimmed = payload.text.trim()
          if (trimmed.length > 0) {
            setCurrentSelection({
              text: trimmed,
              pageNumber: typeof payload.pageNumber === 'number' ? payload.pageNumber : undefined,
              startOffset:
                typeof payload.startOffset === 'number' ? payload.startOffset : undefined,
              endOffset: typeof payload.endOffset === 'number' ? payload.endOffset : undefined,
            })
          }
        } else if (payload.type === 'TEXT_SELECTION' && typeof payload.text === 'string') {
          const trimmed = payload.text.trim()
          setCurrentSelection(trimmed.length > 0 ? { text: trimmed } : null)
        } else if (payload.type === 'PDF_SELECTION_CLEARED') {
          setCurrentSelection(null)
        } else if (payload.type === 'PDF_SCANNED_PAGE') {
          setBaggedNotice('This page contains no digital text layer.')
          setTimeout(() => setBaggedNotice(null), 3000)
        } else if (payload.type === 'PDF_PAGE_CHANGED') {
          if (typeof payload.pageNumber === 'number' && typeof payload.totalPages === 'number') {
            setPageProgress({ current: payload.pageNumber, total: payload.totalPages })
          }
        }
      }
    } catch (err) {
      console.warn('[document-viewer] message parse error:', err)
    }
  }

  const handleAddSelectedToBag = (): void => {
    if (!currentSelection || !file) return

    addSnippet({
      fileId: file.id,
      fileName: file.name,
      fileType: file.fileType,
      source: file.fileType,
      text: currentSelection.text,
      pageNumber: currentSelection.pageNumber,
      startOffset: currentSelection.startOffset,
      endOffset: currentSelection.endOffset,
    })

    setCurrentSelection(null)
    webViewRef.current?.injectJavaScript('window.clearPdfSelection?.(); true;')

    // Show "Added to bag" confirmation card matching Image 2
    setIsAddedToastVisible(true)
    setTimeout(() => {
      setIsAddedToastVisible(false)
    }, 3500)
  }

  const handleHighlightSelected = async (): Promise<void> => {
    if (!currentSelection || !file) return

    try {
      const userId = await resolveUserId()
      const activeColor = highlightColor || 'yellow'
      const saved = await saveFileHighlight(userId, {
        fileId: file.id,
        pageNumber: currentSelection.pageNumber || 1,
        text: currentSelection.text,
        startOffset: currentSelection.startOffset,
        endOffset: currentSelection.endOffset,
        color: activeColor,
      })

      setHighlights((prev) => [...prev, saved])
      webViewRef.current?.injectJavaScript(
        `window.addPdfHighlight?.(${JSON.stringify(saved)}); window.clearPdfSelection?.(); true;`,
      )

      setCurrentSelection(null)
      setBaggedNotice(`Highlighted on Page ${currentSelection.pageNumber || 1}`)
      setTimeout(() => {
        setBaggedNotice(null)
      }, 2500)
    } catch (err) {
      console.warn('[document-viewer] highlight error:', err)
      Alert.alert('Highlight Failed', 'Could not save highlight.')
    }
  }

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isDark ? '#050D0A' : '#FAFBF9',
          gap: 12,
        }}
      >
        <ActivityIndicator size="large" color="#317054" />
        <Text
          style={{
            fontSize: 14,
            fontWeight: '600',
            color: isDark ? '#FFFFFF' : '#111A17',
          }}
        >
          Preparing document…
        </Text>
      </View>
    )
  }

  if (error || !file || !content) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isDark ? '#050D0A' : '#FAFBF9',
          padding: 24,
        }}
      >
        <Card tone="dashed" className="p-6 items-center justify-center gap-3 text-center">
          <Text className="text-base font-bold text-foreground">Failed to Open Document</Text>
          <Text className="text-xs text-muted-foreground text-center">
            {error || 'An unexpected error occurred while loading this document.'}
          </Text>
          <Button
            label="Go Back"
            variant="outline"
            className="mt-2"
            onPress={() => router.back()}
          />
        </Card>
      </View>
    )
  }

  const currentHtml =
    viewMode === 'reader' && content.readerHtml ? content.readerHtml : content.html

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? '#050D0A' : '#FAFBF9' }}>
      {/* 1. Top Custom Header Strip matching Image 1, 2, 3 */}
      <View
        style={{
          paddingTop: insets.top + 8,
          paddingHorizontal: 16,
          paddingBottom: 12,
          backgroundColor: isDark ? '#050D0A' : '#FAFBF9',
          borderBottomWidth: 1,
          borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : '#EEF2EE',
          gap: 12,
        }}
      >
        {/* Top Action Row: Back Button, Title + Meta, Options Button */}
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          {/* Circular Back Button */}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            activeOpacity={0.7}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: isDark ? '#111A17' : '#FFFFFF',
              borderWidth: 1,
              borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEF2EE',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#000000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.04,
              shadowRadius: 4,
              elevation: 2,
            }}
          >
            <ChevronLeftIcon color={isDark ? '#FFFFFF' : '#111A17'} size={20} />
          </TouchableOpacity>

          {/* Document Title & Metadata */}
          <View style={{ flex: 1, marginHorizontal: 12, alignItems: 'flex-start' }}>
            <Text
              numberOfLines={1}
              style={{
                fontSize: 15,
                fontWeight: '700',
                color: isDark ? '#FFFFFF' : '#111A17',
                letterSpacing: -0.2,
              }}
            >
              {file.name}
            </Text>
            <Text
              numberOfLines={1}
              style={{
                fontSize: 11,
                color: isDark ? '#889591' : '#889591',
                marginTop: 2,
                fontWeight: '500',
              }}
            >
              {file.fileType.toUpperCase()}
              {pageProgress?.total ? ` • ${pageProgress.total} pages` : ''}
              {file.fileSize ? ` • ${formatFileSize(file.fileSize)}` : ''}
              {highlights.length > 0
                ? ` • ${highlights.length} highlight${highlights.length === 1 ? '' : 's'}`
                : ''}
            </Text>
          </View>

          {/* Right Header Actions: Bag Pill Button + More Options Button */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {/* Bag Pill Button in Upper Right */}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`Open Study Bag (${snippets.length} items)`}
              onPress={() => setIsBagModalOpen(true)}
              activeOpacity={0.85}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 12,
                height: 40,
                borderRadius: 20,
                backgroundColor: '#052E24',
                shadowColor: '#052E24',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.25,
                shadowRadius: 6,
                elevation: 4,
              }}
            >
              <ShoppingBagIcon color="#FFFFFF" size={16} />
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: '#FFFFFF',
                }}
              >
                Bag ({snippets.length})
              </Text>
            </TouchableOpacity>

            {/* Circular More Options Button */}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="More options"
              onPress={() => setIsMoreMenuOpen(true)}
              activeOpacity={0.7}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: isDark ? '#111A17' : '#FFFFFF',
                borderWidth: 1,
                borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEF2EE',
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#000000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.04,
                shadowRadius: 4,
                elevation: 2,
              }}
            >
              <MoreHorizontalIcon color={isDark ? '#FFFFFF' : '#111A17'} size={20} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Page Progress Badge Pill (Image 1, 2, 3) */}
        {file.fileType === 'pdf' && pageProgress && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 12,
                backgroundColor: isDark ? '#1C2B25' : '#E8F3EE',
                borderWidth: 1,
                borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#E0ECE5',
              }}
            >
              <BookOpenIcon color={isDark ? '#A6C2B5' : '#317054'} size={14} />
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '700',
                  color: isDark ? '#A6C2B5' : '#317054',
                }}
              >
                Pages
              </Text>
            </View>
            <Text
              style={{
                fontSize: 13,
                fontWeight: '700',
                color: isDark ? '#FFFFFF' : '#111A17',
              }}
            >
              {pageProgress.current} / {pageProgress.total}
            </Text>
          </View>
        )}
      </View>

      {/* 2. Main WebView Document Viewport */}
      <View style={{ flex: 1, position: 'relative' }}>
        <WebView
          ref={webViewRef}
          originWhitelist={['*']}
          source={{ html: currentHtml }}
          style={{ flex: 1, backgroundColor: isDark ? '#050D0A' : '#FAFBF9' }}
          scrollEnabled={true}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowFileAccess={true}
          allowFileAccessFromFileURLs={true}
          allowUniversalAccessFromFileURLs={true}
          setBuiltInZoomControls={true}
          setDisplayZoomControls={false}
          scalesPageToFit={false}
          onMessage={handleWebViewMessage}
        />

        {/* 3. Post-Confirmation "Added to bag" Toast Card */}
        {isAddedToastVisible && (
          <View
            style={{
              position: 'absolute',
              bottom: bottomNavOffset,
              left: 14,
              right: 14,
              zIndex: 50,
              borderRadius: 20,
              backgroundColor: isDark ? '#111A17' : '#FFFFFF',
              borderWidth: 1,
              borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEF2EE',
              paddingHorizontal: 16,
              paddingVertical: 14,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              shadowColor: '#000000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.12,
              shadowRadius: 12,
              elevation: 6,
            }}
          >
            <View style={{ flex: 1, gap: 4, marginRight: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <CheckIcon color={isDark ? '#A6C2B5' : '#052E24'} size={16} />
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '700',
                    color: isDark ? '#FFFFFF' : '#052E24',
                  }}
                >
                  Added to bag
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 12,
                  lineHeight: 16,
                  color: isDark ? '#889591' : '#4C5854',
                }}
              >
                Your note has been saved to the bag for later review.
              </Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="View bag"
              onPress={() => {
                setIsAddedToastVisible(false)
                setIsBagModalOpen(true)
              }}
              activeOpacity={0.8}
              style={{
                backgroundColor: '#052E24',
                paddingHorizontal: 14,
                paddingVertical: 9,
                borderRadius: 18,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <ShoppingBagIcon color="#FFFFFF" size={14} />
              <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>
                View ({snippets.length})
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 4. Bagged / Highlight Temporary Notice (Top) */}
        {baggedNotice && (
          <View
            style={{
              position: 'absolute',
              top: 12,
              left: 20,
              right: 20,
              zIndex: 60,
              alignItems: 'center',
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                borderRadius: 20,
                backgroundColor: '#317054',
                paddingHorizontal: 16,
                paddingVertical: 8,
                shadowColor: '#000000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.2,
                shadowRadius: 6,
                elevation: 4,
              }}
            >
              <ShoppingBagIcon color="#FFFFFF" size={16} />
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 12,
                  fontWeight: '600',
                  color: '#FFFFFF',
                }}
              >
                {baggedNotice}
              </Text>
            </View>
          </View>
        )}

        {/* 5. Text Selection Action Card & Dimmed Backdrop (Floats above bottom nav tab) */}
        {currentSelection && (
          <>
            {/* Dimmed Backdrop */}
            <Pressable
              onPress={() => {
                setCurrentSelection(null)
                webViewRef.current?.injectJavaScript('window.clearPdfSelection?.(); true;')
              }}
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: 'rgba(5, 46, 36, 0.45)',
                  zIndex: 90,
                },
              ]}
            />

            {/* Floating Action Sheet Card above bottom nav */}
            <View
              style={{
                position: 'absolute',
                bottom: bottomNavOffset,
                left: 14,
                right: 14,
                zIndex: 100,
                backgroundColor: isDark ? '#111A17' : '#FFFFFF',
                borderRadius: 24,
                borderWidth: 1,
                borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEF2EE',
                paddingHorizontal: 18,
                paddingTop: 14,
                paddingBottom: 16,
                shadowColor: '#000000',
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: isDark ? 0.35 : 0.16,
                shadowRadius: 18,
                elevation: 16,
                gap: 12,
              }}
            >
              {/* Drag Handle Indicator */}
              <View
                style={{
                  alignSelf: 'center',
                  width: 36,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : '#E0ECE5',
                }}
              />

              {/* Header Row: SELECTED TEXT & Close Button */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '800',
                    letterSpacing: 0.8,
                    color: isDark ? '#A6C2B5' : '#052E24',
                  }}
                >
                  SELECTED TEXT
                </Text>

                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Close selection"
                  onPress={() => {
                    setCurrentSelection(null)
                    webViewRef.current?.injectJavaScript('window.clearPdfSelection?.(); true;')
                  }}
                  activeOpacity={0.7}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F0F4F2',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <CloseIcon color={isDark ? '#FFFFFF' : '#4C5854'} size={12} />
                </TouchableOpacity>
              </View>

              {/* Selected Text Preview */}
              <Text
                numberOfLines={2}
                style={{
                  fontSize: 13,
                  lineHeight: 19,
                  color: isDark ? '#C5D4CD' : '#4C5854',
                }}
              >
                “{currentSelection.text}”
              </Text>

              {/* 3 Action Buttons Row */}
              <View style={{ flexDirection: 'row', gap: 10, paddingTop: 4 }}>
                {/* Highlight Button with Color Indicator */}
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Highlight selected text"
                  onPress={() => void handleHighlightSelected()}
                  activeOpacity={0.8}
                  style={{
                    flex: 1,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: isDark ? '#1C2B25' : '#FAFBF9',
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEF2EE',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: getHighlightHex(highlightColor),
                    }}
                  />
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '700',
                      color: isDark ? '#FFFFFF' : '#052E24',
                    }}
                  >
                    Highlight 📌
                  </Text>
                </TouchableOpacity>

                {/* Card Button */}
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Create flashcard from selected text"
                  onPress={() => setIsQuickCardOpen(true)}
                  activeOpacity={0.8}
                  style={{
                    flex: 1,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: isDark ? '#1C2B25' : '#FAFBF9',
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEF2EE',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '700',
                      color: isDark ? '#FFFFFF' : '#052E24',
                    }}
                  >
                    Card ✨
                  </Text>
                </TouchableOpacity>

                {/* + Bag Button */}
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Add selected text to bag"
                  onPress={handleAddSelectedToBag}
                  activeOpacity={0.85}
                  style={{
                    flex: 1.2,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: '#052E24',
                    alignItems: 'center',
                    justifyContent: 'center',
                    shadowColor: '#052E24',
                    shadowOffset: { width: 0, height: 3 },
                    shadowOpacity: 0.25,
                    shadowRadius: 6,
                    elevation: 4,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '800',
                      color: '#FFFFFF',
                    }}
                  >
                    + Bag 🛍️
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}
      </View>

      {/* 7. Document Options Modal (...) */}
      {isMoreMenuOpen && (
        <Modal
          visible={isMoreMenuOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setIsMoreMenuOpen(false)}
        >
          <Pressable
            onPress={() => setIsMoreMenuOpen(false)}
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
                maxWidth: 340,
                borderRadius: 24,
                backgroundColor: isDark ? '#111A17' : '#FFFFFF',
                padding: 20,
                gap: 14,
                borderWidth: 1,
                borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEF2EE',
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '700',
                  color: isDark ? '#FFFFFF' : '#111A17',
                }}
              >
                Document Options
              </Text>

              {/* Share */}
              <TouchableOpacity
                onPress={() => {
                  setIsMoreMenuOpen(false)
                  void handleShare()
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : '#EEF2EE',
                }}
              >
                <ShareIcon color={isDark ? '#A6C2B5' : '#052E24'} size={18} />
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '600',
                    color: isDark ? '#FFFFFF' : '#111A17',
                  }}
                >
                  Share Document
                </Text>
              </TouchableOpacity>

              {/* Zoom Fit Toggle (for PDFs) */}
              {file.fileType === 'pdf' && (
                <TouchableOpacity
                  onPress={() => {
                    toggleZoom()
                    setIsMoreMenuOpen(false)
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : '#EEF2EE',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: '600',
                      color: isDark ? '#FFFFFF' : '#111A17',
                    }}
                  >
                    Zoom Scale
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '700',
                      color: isDark ? '#A6C2B5' : '#317054',
                    }}
                  >
                    {zoomScale === 1.0 ? 'Fit ↔' : `${Math.round(zoomScale * 100)}%`}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Reader / Visual Mode Toggle (if available) */}
              {file.fileType === 'pdf' && content.hasReaderMode && (
                <TouchableOpacity
                  onPress={() => {
                    setViewMode(viewMode === 'visual' ? 'reader' : 'visual')
                    setIsMoreMenuOpen(false)
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : '#EEF2EE',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: '600',
                      color: isDark ? '#FFFFFF' : '#111A17',
                    }}
                  >
                    Display Mode
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '700',
                      color: isDark ? '#A6C2B5' : '#317054',
                    }}
                  >
                    {viewMode === 'visual' ? 'Visual' : 'Reader'}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Close Button */}
              <TouchableOpacity
                onPress={() => setIsMoreMenuOpen(false)}
                style={{
                  height: 42,
                  borderRadius: 12,
                  backgroundColor: isDark ? '#1C2B25' : '#E8F3EE',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 4,
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '700',
                    color: isDark ? '#FFFFFF' : '#052E24',
                  }}
                >
                  Close
                </Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* Snippet Bag Review Modal */}
      <SnippetBagModal visible={isBagModalOpen} onClose={() => setIsBagModalOpen(false)} />

      {/* Direct Quick Card Creation Modal */}
      {isQuickCardOpen && (
        <QuickCardModal
          visible={isQuickCardOpen}
          onClose={() => {
            setIsQuickCardOpen(false)
            setCurrentSelection(null)
            webViewRef.current?.injectJavaScript('window.clearPdfSelection?.(); true;')
          }}
          initialParagraph={currentSelection?.text || ''}
          sourceFileName={file.name}
          pageNumber={currentSelection?.pageNumber}
          onCardSaved={() => {
            setBaggedNotice('Card Created! 🎉')
            setTimeout(() => setBaggedNotice(null), 2800)
          }}
        />
      )}
    </View>
  )
}
