import { useEffect, useRef, useState, type ComponentRef, type ReactElement } from 'react'
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'
import * as Sharing from 'expo-sharing'
import type { PdfHighlight } from '@saulado/shared'
import { Button } from '../../../components/button'
import { Card } from '../../../components/card'
import { CloseIcon, ShareIcon, ShoppingBagIcon } from '../../../components/icons'
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
import { useTheme, useTokenColor } from '../../../stores/theme'

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

  const primary = useTokenColor('--primary')
  const background = useTokenColor('--background')
  const foreground = useTokenColor('--foreground')

  const snippets = useSnippetBagStore((s) => s.snippets)
  const addSnippet = useSnippetBagStore((s) => s.addSnippet)

  const [file, setFile] = useState<RepositoryFile | null>(null)
  const [content, setContent] = useState<DocumentContentResult | null>(null)
  const [highlights, setHighlights] = useState<PdfHighlight[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'visual' | 'reader'>('visual')
  const [zoomScale, setZoomScale] = useState<number>(1.0)

  const [currentSelection, setCurrentSelection] = useState<CurrentSelection | null>(null)
  const [isBagModalOpen, setIsBagModalOpen] = useState(false)
  const [isQuickCardOpen, setIsQuickCardOpen] = useState(false)
  const [baggedNotice, setBaggedNotice] = useState<string | null>(null)

  const bottomNavOffset = Math.max(insets.bottom, 16) + 72

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

    const preview =
      currentSelection.text.length > 28
        ? `${currentSelection.text.slice(0, 28)}…`
        : currentSelection.text
    setBaggedNotice(`Bagged "${preview}"`)
    setCurrentSelection(null)
    webViewRef.current?.injectJavaScript('window.clearPdfSelection?.(); true;')

    setTimeout(() => {
      setBaggedNotice(null)
    }, 2800)
  }

  const handleHighlightSelected = async (): Promise<void> => {
    if (!currentSelection || !file) return

    try {
      const userId = await resolveUserId()
      const saved = await saveFileHighlight(userId, {
        fileId: file.id,
        pageNumber: currentSelection.pageNumber || 1,
        text: currentSelection.text,
        startOffset: currentSelection.startOffset,
        endOffset: currentSelection.endOffset,
        color: 'yellow',
      })

      setHighlights((prev) => [...prev, saved])
      webViewRef.current?.injectJavaScript(
        `window.addPdfHighlight?.(${JSON.stringify(saved)}); window.clearPdfSelection?.(); true;`,
      )

      setBaggedNotice(`Highlighted on Page ${currentSelection.pageNumber || 1}`)
      setCurrentSelection(null)

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
      <View className="flex-1 items-center justify-center bg-background gap-3">
        <ActivityIndicator size="large" color={primary} />
        <Text className="text-sm font-medium text-foreground">Preparing document…</Text>
      </View>
    )
  }

  if (error || !file || !content) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-6">
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
    <View className="flex-1 bg-background">
      {/* Top Document Details & Controls Strip */}
      <View className="flex-row items-center justify-between px-3.5 py-2.5 border-b border-border bg-surface">
        <View className="flex-1 mr-2 min-w-0">
          <Text numberOfLines={1} className="text-sm font-bold text-foreground">
            {file.name}
          </Text>
          <Text numberOfLines={1} className="text-[11px] text-muted-foreground">
            {file.fileType.toUpperCase()} · {formatFileSize(file.fileSize)}
            {highlights.length > 0
              ? ` · ${highlights.length} highlight${highlights.length === 1 ? '' : 's'}`
              : ''}
          </Text>
        </View>

        <View className="flex-row items-center gap-1.5 shrink-0">
          {/* Visual / Reader Mode Toggle for PDFs */}
          {file.fileType === 'pdf' && content.hasReaderMode && (
            <View className="flex-row items-center rounded-full bg-surface-muted p-0.5 border border-border/60">
              <Pressable
                onPress={() => setViewMode('visual')}
                className={`px-2 py-1 rounded-full ${viewMode === 'visual' ? 'bg-surface shadow-xs' : ''}`}
              >
                <Text
                  className={`text-xs ${
                    viewMode === 'visual' ? 'font-bold text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  Visual
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setViewMode('reader')}
                className={`px-2 py-1 rounded-full ${viewMode === 'reader' ? 'bg-surface shadow-xs' : ''}`}
              >
                <Text
                  className={`text-xs ${
                    viewMode === 'reader' ? 'font-bold text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  Reader
                </Text>
              </Pressable>
            </View>
          )}

          {/* Snippet Bag Button */}
          <Pressable
            onPress={() => setIsBagModalOpen(true)}
            className="flex-row items-center gap-1 px-2.5 py-1.5 rounded-full bg-primary/10 border border-primary/20 active:opacity-75"
            accessibilityLabel="Open Study Bag"
          >
            <ShoppingBagIcon color={primary} size={14} />
            <Text className="text-xs font-bold text-primary">{snippets.length}</Text>
          </Pressable>

          {/* Zoom Toggle */}
          {viewMode === 'visual' && file.fileType === 'pdf' && (
            <Pressable
              onPress={toggleZoom}
              className="px-2.5 py-1.5 rounded-full bg-surface-muted border border-border/80 active:opacity-75"
              accessibilityLabel="Toggle Zoom Scale"
            >
              <Text className="text-xs font-semibold text-foreground">
                {zoomScale === 1.0 ? 'Fit ↔' : `${Math.round(zoomScale * 100)}% 🔍`}
              </Text>
            </Pressable>
          )}

          {/* Native Share */}
          <Pressable
            onPress={() => {
              void handleShare()
            }}
            className="p-1.5 rounded-full bg-surface-muted border border-border/80 active:opacity-75"
            accessibilityLabel="Share Document"
          >
            <ShareIcon color={foreground} size={15} />
          </Pressable>
        </View>
      </View>

      {/* Main WebView Document Viewport */}
      <View className="flex-1 relative">
        <WebView
          ref={webViewRef}
          originWhitelist={['*']}
          source={{ html: currentHtml }}
          style={{ flex: 1, backgroundColor: background }}
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

        {/* Floating Study Toolbar upon active text selection */}
        {currentSelection && (
          <View className="absolute left-4 right-4 z-40" style={{ bottom: bottomNavOffset }}>
            <View className="rounded-2xl bg-neutral-900/95 dark:bg-neutral-800/95 border border-white/20 p-3 shadow-2xl backdrop-blur-md">
              <View className="flex-row items-center justify-between pb-2 mb-2 border-b border-white/10">
                <View className="flex-1 mr-2">
                  <Text numberOfLines={1} className="text-xs font-medium text-white/90">
                    "{currentSelection.text}"
                  </Text>
                  {currentSelection.pageNumber && (
                    <Text className="text-[10px] text-white/60">
                      Page {currentSelection.pageNumber}
                    </Text>
                  )}
                </View>

                <Pressable
                  onPress={() => {
                    setCurrentSelection(null)
                    webViewRef.current?.injectJavaScript('window.clearPdfSelection?.(); true;')
                  }}
                  className="h-7 w-7 items-center justify-center rounded-full bg-white/10 active:opacity-60"
                  accessibilityLabel="Dismiss selection"
                >
                  <CloseIcon color="#ffffff" size={14} />
                </Pressable>
              </View>

              <View className="flex-row items-center justify-end gap-2 pt-1">
                <Pressable
                  onPress={() => {
                    void handleHighlightSelected()
                  }}
                  className="px-3 py-1.5 rounded-xl border border-white/20 bg-white/10 active:opacity-75"
                  accessibilityLabel="Highlight selected text"
                >
                  <Text className="text-xs font-semibold text-white">Highlight 📌</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setIsQuickCardOpen(true)
                  }}
                  className="px-3 py-1.5 rounded-xl border border-white/20 bg-white/10 active:opacity-75"
                  accessibilityLabel="Generate flashcard from selected text"
                >
                  <Text className="text-xs font-semibold text-white">Card ✨</Text>
                </Pressable>
                <Pressable
                  onPress={handleAddSelectedToBag}
                  className="px-3.5 py-1.5 rounded-xl bg-primary active:opacity-85"
                  accessibilityLabel="Add selected text to snippet bag"
                >
                  <Text className="text-xs font-bold text-primary-foreground">+ Add to Bag 🛍️</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {/* Bagged / Highlight Confirmation Toast */}
        {baggedNotice && (
          <View className="absolute top-4 left-4 right-4 z-50 items-center">
            <View className="flex-row items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 shadow-md">
              <ShoppingBagIcon color="#ffffff" size={16} />
              <Text numberOfLines={1} className="text-xs font-semibold text-white">
                {baggedNotice}
              </Text>
            </View>
          </View>
        )}

        {/* Floating Bag FAB (Bottom Right, Positioned Safely Above Bottom Nav Tab) */}
        {snippets.length > 0 && !currentSelection && (
          <Pressable
            onPress={() => setIsBagModalOpen(true)}
            style={{ bottom: bottomNavOffset, right: 20, zIndex: 9999, elevation: 10 }}
            className="absolute h-13 px-4 rounded-full bg-primary flex-row items-center gap-2 shadow-xl active:opacity-85"
            accessibilityLabel="Open Bag Modal"
          >
            <ShoppingBagIcon color="#ffffff" size={20} />
            <Text className="text-sm font-bold text-primary-foreground">
              Bag ({snippets.length})
            </Text>
          </Pressable>
        )}
      </View>

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
