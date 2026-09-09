import { useEffect, useRef, useState, type ComponentRef, type ReactElement } from 'react'
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'
import * as Sharing from 'expo-sharing'
import { Button } from '../../../components/button'
import { Card } from '../../../components/card'
import { CloseIcon, ShoppingBagIcon } from '../../../components/icons'
import { SnippetBagModal } from '../../../components/snippet-bag-modal'
import type { RepositoryFile } from '../../../lib/offline/types'
import {
  formatFileSize,
  getRepositoryFile,
  updateFileLastViewed,
} from '../../../services/file-repository'
import { loadDocumentContent, type DocumentContentResult } from '../../../services/document-viewer'
import { useSnippetBagStore } from '../../../stores/snippet-bag'
import { useTheme, useTokenColor } from '../../../stores/theme'

export default function DocumentViewerScreen(): ReactElement {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const webViewRef = useRef<ComponentRef<typeof WebView>>(null)
  const { fileId } = useLocalSearchParams<{ fileId: string }>()
  const { isDark } = useTheme()

  const primary = useTokenColor('--primary')
  const background = useTokenColor('--background')

  const snippets = useSnippetBagStore((s) => s.snippets)
  const addSnippet = useSnippetBagStore((s) => s.addSnippet)

  const [file, setFile] = useState<RepositoryFile | null>(null)
  const [content, setContent] = useState<DocumentContentResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'visual' | 'reader'>('visual')
  const [zoomScale, setZoomScale] = useState<number>(0.85)

  const [selectedSnippet, setSelectedSnippet] = useState<string | null>(null)
  const [isBagModalOpen, setIsBagModalOpen] = useState(false)
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

        const docContent = await loadDocumentContent(item, isDark)
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
    const next = zoomScale === 0.85 ? 1.0 : 0.85
    setZoomScale(next)
    webViewRef.current?.injectJavaScript(`window.setDocumentZoom(${next}); true;`)
  }

  const handleWebViewMessage = (event: { nativeEvent: { data: string } }): void => {
    // Explicitly exclude PDFs from snippet selection
    if (file?.fileType === 'pdf') return

    try {
      const data: unknown = JSON.parse(event.nativeEvent.data)
      if (typeof data === 'object' && data !== null && 'type' in data) {
        const payload = data as { type?: unknown; text?: unknown }
        if (payload.type === 'TEXT_SELECTION' && typeof payload.text === 'string') {
          const trimmed = payload.text.trim()
          setSelectedSnippet(trimmed.length > 0 ? trimmed : null)
        }
      }
    } catch (err) {
      console.warn('[document-viewer] message parse error:', err)
    }
  }

  const handleAddSelectedToBag = (): void => {
    if (!selectedSnippet || !file || file.fileType === 'pdf') return

    addSnippet({
      fileId: file.id,
      fileName: file.name,
      fileType: file.fileType,
      text: selectedSnippet,
    })

    const preview =
      selectedSnippet.length > 30 ? `${selectedSnippet.slice(0, 30)}…` : selectedSnippet
    setBaggedNotice(`Bagged "${preview}"`)
    setSelectedSnippet(null)

    setTimeout(() => {
      setBaggedNotice(null)
    }, 2800)
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
      <View className="flex-row items-center justify-between px-4 py-2.5 border-b border-border bg-surface">
        <View className="flex-1 mr-3">
          <Text numberOfLines={1} className="text-sm font-bold text-foreground">
            {file.name}
          </Text>
          <Text className="text-[11px] text-muted-foreground">
            {file.fileType.toUpperCase()} · {formatFileSize(file.fileSize)}
            {file.fileType === 'pdf' ? ' · PDFs excluded from bag' : ' · Select text to bag'}
          </Text>
        </View>

        <View className="flex-row items-center gap-2">
          {/* Visual / Reader Mode Toggle for PDFs */}
          {file.fileType === 'pdf' && content.hasReaderMode && (
            <View className="flex-row items-center rounded-full bg-surface-muted p-0.5 border border-border/60">
              <Pressable
                onPress={() => setViewMode('visual')}
                className={`px-2.5 py-1 rounded-full ${viewMode === 'visual' ? 'bg-surface shadow-xs' : ''}`}
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
                className={`px-2.5 py-1 rounded-full ${viewMode === 'reader' ? 'bg-surface shadow-xs' : ''}`}
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
            className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 active:opacity-75"
            accessibilityLabel="Open Study Bag"
          >
            <ShoppingBagIcon color={primary} size={15} />
            <Text className="text-xs font-bold text-primary">{snippets.length}</Text>
          </Pressable>

          {/* Zoom Toggle */}
          <Pressable
            onPress={toggleZoom}
            className="flex-row items-center gap-1 px-2.5 py-1.5 rounded-full bg-surface-muted border border-border/80 active:opacity-75"
            accessibilityLabel="Toggle Zoom Scale"
          >
            <Text className="text-xs font-semibold text-foreground">
              {zoomScale === 0.85 ? '🔍 85%' : '🔍 100%'}
            </Text>
          </Pressable>

          <Button
            label="Share"
            variant="outline"
            onPress={() => {
              void handleShare()
            }}
          />
        </View>
      </View>

      {/* In-App WebView Viewer */}
      <View className="flex-1 bg-background relative">
        <WebView
          ref={webViewRef}
          originWhitelist={['*']}
          source={{ html: currentHtml, baseUrl: 'file:///android_asset/' }}
          style={{ flex: 1, backgroundColor: background }}
          scalesPageToFit={true}
          setBuiltInZoomControls={true}
          setDisplayZoomControls={false}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowFileAccess={true}
          allowFileAccessFromFileURLs={true}
          allowUniversalAccessFromFileURLs={true}
          mixedContentMode="always"
          startInLoadingState={true}
          onMessage={handleWebViewMessage}
          renderLoading={() => (
            <View className="absolute inset-0 items-center justify-center bg-background">
              <ActivityIndicator size="small" color={primary} />
            </View>
          )}
        />

        {/* Floating Add to Bag Pill for Selected Text (Option B - Positioned Above Bottom Nav Tab) */}
        {selectedSnippet && file.fileType !== 'pdf' && (
          <View
            style={{ bottom: bottomNavOffset, left: 16, right: 16, zIndex: 10000, elevation: 12 }}
            className="absolute"
          >
            <View className="flex-row items-center justify-between rounded-2xl bg-[#052e24] dark:bg-[#07382d] p-3 shadow-lg border border-primary/40 gap-3">
              <View className="flex-1 mr-2">
                <Text className="text-[11px] font-bold text-primary uppercase tracking-wider">
                  Text Selected
                </Text>
                <Text numberOfLines={2} className="text-xs text-white mt-0.5 leading-4">
                  &ldquo;{selectedSnippet}&rdquo;
                </Text>
              </View>

              <View className="flex-row items-center gap-2">
                <Button label="+ Add to Bag 🛍️" size="md" onPress={handleAddSelectedToBag} />
                <Pressable
                  onPress={() => setSelectedSnippet(null)}
                  className="h-8 w-8 items-center justify-center rounded-full bg-white/10 active:opacity-60"
                  accessibilityLabel="Dismiss selection"
                >
                  <CloseIcon color="#ffffff" size={16} />
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {/* Bagged Confirmation Toast */}
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
        {snippets.length > 0 && !selectedSnippet && (
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
    </View>
  )
}
