import { useEffect, useState, type ReactElement } from 'react'
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { WebView } from 'react-native-webview'
import * as Sharing from 'expo-sharing'
import { Button } from '../../../components/button'
import { Card } from '../../../components/card'
import type { RepositoryFile } from '../../../lib/offline/types'
import { setScannedPage } from '../../../lib/scan-handoff'
import {
  formatFileSize,
  getRepositoryFile,
  updateFileLastViewed,
} from '../../../services/file-repository'
import { loadDocumentContent, type DocumentContentResult } from '../../../services/document-viewer'
import { useTheme, useTokenColor } from '../../../stores/theme'

export default function DocumentViewerScreen(): ReactElement {
  const router = useRouter()
  const { fileId } = useLocalSearchParams<{ fileId: string }>()
  const { isDark } = useTheme()

  const primary = useTokenColor('--primary')
  const background = useTokenColor('--background')

  const [file, setFile] = useState<RepositoryFile | null>(null)
  const [content, setContent] = useState<DocumentContentResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'visual' | 'reader'>('visual')

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

  const handleCreateCards = (): void => {
    if (!content?.extractedText || content.extractedText.trim().length === 0) {
      Alert.alert(
        'No Text Found',
        'Could not find readable text in this document to generate flashcards.',
      )
      return
    }

    // Hand off extracted text to the scan/card review pipeline
    setScannedPage(content.extractedText)
    router.push('/scan-review')
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

          {content.extractedText.trim().length > 0 && (
            <Button label="Make Cards" onPress={handleCreateCards} />
          )}
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
      <View className="flex-1 bg-background">
        <WebView
          originWhitelist={['*']}
          source={{ html: currentHtml, baseUrl: 'file:///android_asset/' }}
          style={{ flex: 1, backgroundColor: background }}
          scalesPageToFit={true}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowFileAccess={true}
          allowFileAccessFromFileURLs={true}
          allowUniversalAccessFromFileURLs={true}
          mixedContentMode="always"
          startInLoadingState={true}
          renderLoading={() => (
            <View className="absolute inset-0 items-center justify-center bg-background">
              <ActivityIndicator size="small" color={primary} />
            </View>
          )}
        />
      </View>
    </View>
  )
}
