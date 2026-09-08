import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from 'react'
import { ActivityIndicator, type LayoutChangeEvent, Pressable, Text, View } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { onlineManager } from '@tanstack/react-query'
import { Button } from '../../components/button'
import { AlertIcon, FileTextIcon, ImageIcon } from '../../components/icons'
import { LensArOverlay, type InboundBox } from '../../components/lens-ar-overlay'
import { setScannedPage } from '../../lib/scan-handoff'
import {
  filterBlocksByInboundBox,
  formatScannedDocument,
  processDocumentFile,
  recognize,
  recognizeWithLayout,
  type RecognizedLayout,
} from '../../services/ocr'
import { useTokenColor } from '../../stores/theme'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

/**
 * Google Lens-style Camera Scanning View with Inbounding Target Frame.
 *
 * Captures frames continuously on an interval, detects text blocks in real time,
 * and restricts text extraction ONLY to what is inside the center Inbounding Box.
 * Background text outside the frame is dimmed and ignored.
 */

/** How long the loop waits between captures. */
const CAPTURE_INTERVAL_MS = 650

/** Below this the read is a caption or a stray word, not a page worth reviewing. */
const MIN_PAGE_CODE_POINTS = 20

type Phase =
  /** Nothing read yet, or the last read did not match its predecessor. */
  | { kind: 'searching' }
  /** One read in hand, waiting for a second that agrees with it. */
  | { kind: 'steady' }
  /** A gallery image is being read, or the shutter was pressed. */
  | { kind: 'reading' }
  | { kind: 'error'; message: string }

const NO_TEXT_IN_FRAME = 'No text found inside the frame. Fit your notes inside the green box.'
const FAILED = 'Could not read that image. Try again, or pick a different photo.'

export default function ScanScreen(): ReactElement {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { setId } = useLocalSearchParams<{ setId?: string }>()
  const camera = useRef<CameraView>(null)
  const [permission, requestPermission] = useCameraPermissions()
  const [phase, setPhase] = useState<Phase>({ kind: 'searching' })

  // Camera viewport dimensions for AR coordinate projection
  const [viewport, setViewport] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  })
  // Real-time detected bounding boxes and layout
  const [detectedLayout, setDetectedLayout] = useState<RecognizedLayout | null>(null)

  // Inbounding box coordinates ref for live cropping & filtering
  const targetBoxRef = useRef<InboundBox | null>(null)

  const warning = useTokenColor('--warning')
  const mutedForeground = useTokenColor('--muted-foreground')

  const previous = useRef<string | null>(null)
  const busy = useRef(false)
  const alive = useRef(true)

  const isOnline = useSyncExternalStore(
    (onStoreChange) => onlineManager.subscribe(onStoreChange),
    () => onlineManager.isOnline(),
  )

  useEffect(() => {
    if (!isOnline) {
      router.replace(
        setId === undefined || setId.length === 0
          ? '/scan-review?mode=paste'
          : `/scan-review?mode=paste&setId=${encodeURIComponent(setId)}`,
      )
    }
  }, [isOnline, router, setId])

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  /** Hands the page to the review screen and leaves the camera behind. */
  const accept = useCallback(
    (text: string): void => {
      setScannedPage(text)
      router.replace(
        setId === undefined || setId.length === 0
          ? '/scan-review'
          : `/scan-review?setId=${encodeURIComponent(setId)}`,
      )
    },
    [router, setId],
  )

  /**
   * One frame: capture, filter to Inbounding Box ONLY, and update live AR overlay.
   */
  const readFrame = useCallback(
    async (force: boolean): Promise<void> => {
      if (busy.current || camera.current === null) return
      busy.current = true

      try {
        if (force) setPhase({ kind: 'reading' })

        const photo = await camera.current.takePictureAsync({
          skipProcessing: true,
          shutterSound: false,
        })
        if (!alive.current) return

        if (!photo || !photo.uri) {
          if (force) setPhase({ kind: 'error', message: NO_TEXT_IN_FRAME })
          return
        }

        const layout = await recognizeWithLayout(photo.uri)
        if (!alive.current) return

        // Update live AR bounding boxes for the viewfinder
        if (layout.blocks && layout.blocks.length > 0) {
          setDetectedLayout(layout)
        } else {
          setDetectedLayout(null)
        }

        // Filter text to ONLY what is inside the Inbounding Box
        let textToEvaluate = layout.text

        if (
          targetBoxRef.current !== null &&
          viewport.width > 0 &&
          viewport.height > 0 &&
          layout.imageWidth > 0 &&
          layout.imageHeight > 0
        ) {
          const normBox = {
            left: targetBoxRef.current.left / viewport.width,
            top: targetBoxRef.current.top / viewport.height,
            width: targetBoxRef.current.width / viewport.width,
            height: targetBoxRef.current.height / viewport.height,
          }

          const filteredBlocks = filterBlocksByInboundBox(
            layout.blocks,
            layout.imageWidth,
            layout.imageHeight,
            normBox,
          )

          textToEvaluate = formatScannedDocument(filteredBlocks, '')
        }

        if (textToEvaluate.length < MIN_PAGE_CODE_POINTS) {
          previous.current = null
          if (force) setPhase({ kind: 'error', message: NO_TEXT_IN_FRAME })
          else setPhase({ kind: 'searching' })
          return
        }

        if (force || textToEvaluate === previous.current) {
          accept(textToEvaluate)
          return
        }

        previous.current = textToEvaluate
        setPhase({ kind: 'steady' })
      } catch {
        if (!alive.current) return
        previous.current = null
        if (force) setPhase({ kind: 'error', message: FAILED })
      } finally {
        busy.current = false
      }
    },
    [accept, viewport.width, viewport.height],
  )

  const scan = useRef(readFrame)
  useEffect(() => {
    scan.current = readFrame
  }, [readFrame])

  const running = permission?.granted === true && phase.kind !== 'reading' && phase.kind !== 'error'

  useEffect(() => {
    if (!running) return

    const id = setInterval(() => {
      void scan.current(false)
    }, CAPTURE_INTERVAL_MS)

    return () => {
      clearInterval(id)
    }
  }, [running])

  const pickImage = useCallback((): void => {
    void (async (): Promise<void> => {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        quality: 1,
      })
      const asset = result.canceled ? undefined : result.assets[0]
      if (asset === undefined) return

      setPhase({ kind: 'reading' })

      try {
        const text = await recognize(asset.uri)
        if (!alive.current) return

        if (text.length < MIN_PAGE_CODE_POINTS) {
          setPhase({ kind: 'error', message: NO_TEXT_IN_FRAME })
          return
        }
        accept(text)
      } catch {
        if (alive.current) setPhase({ kind: 'error', message: FAILED })
      }
    })()
  }, [accept])

  const pickDocument = useCallback((): void => {
    void (async (): Promise<void> => {
      try {
        const result = await DocumentPicker.getDocumentAsync({
          type: ['application/pdf', 'image/*', 'text/plain'],
          copyToCacheDirectory: true,
        })
        if (result.canceled || !result.assets || result.assets.length === 0) return
        const asset = result.assets[0]
        if (!asset) return

        setPhase({ kind: 'reading' })
        const text = await processDocumentFile(asset.uri, asset.mimeType, asset.name)
        if (!alive.current) return

        if (text.length < MIN_PAGE_CODE_POINTS) {
          setPhase({ kind: 'error', message: NO_TEXT_IN_FRAME })
          return
        }
        accept(text)
      } catch {
        if (alive.current) setPhase({ kind: 'error', message: FAILED })
      }
    })()
  }, [accept])

  const handleLayout = (e: LayoutChangeEvent): void => {
    const { width, height } = e.nativeEvent.layout
    setViewport({ width, height })
  }

  if (permission === null) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator accessibilityLabel="Opening the camera" />
      </View>
    )
  }

  if (!permission.granted) {
    return (
      <View className="flex-1 justify-center gap-4 bg-background p-6">
        <Text className="text-xl font-semibold text-foreground">Read a page with the camera</Text>
        <Text className="text-base text-muted-foreground">
          Point the camera at your notes and the text is read here on your phone. Nothing is
          uploaded, and no photo is kept.
        </Text>

        {permission.canAskAgain ? (
          <Button
            label="Allow camera access"
            size="lg"
            onPress={() => {
              void requestPermission()
            }}
          />
        ) : (
          <View className="flex-row items-start gap-1.5">
            <AlertIcon color={warning} size={16} />
            <Text className="flex-1 text-sm text-warning">
              Camera access is off for Saulado. Turn it back on in your phone's Settings, or pick a
              photo you have already taken.
            </Text>
          </View>
        )}

        <Button label="Choose a photo instead" variant="outline" size="lg" onPress={pickImage} />
      </View>
    )
  }

  return (
    <View className="flex-1 bg-background">
      <View className="flex-1" onLayout={handleLayout}>
        <CameraView
          ref={camera}
          style={{ flex: 1 }}
          facing="back"
          active={phase.kind !== 'reading'}
          animateShutter={false}
        />

        {/* Real-time Google Lens Inbounding Box & AR Overlay */}
        {viewport.width > 0 && viewport.height > 0 && (
          <LensArOverlay
            blocks={detectedLayout?.blocks ?? []}
            imageWidth={detectedLayout?.imageWidth ?? 0}
            imageHeight={detectedLayout?.imageHeight ?? 0}
            viewWidth={viewport.width}
            viewHeight={viewport.height}
            onBoxCalculated={(box) => {
              targetBoxRef.current = box
            }}
            onScanSelection={(selectedText) => {
              if (selectedText.trim().length > 0) {
                accept(selectedText)
              }
            }}
            onSelectBlock={(blockText) => {
              // Tapping a detected box inside the frame accepts the read
              if (blockText.length >= MIN_PAGE_CODE_POINTS) {
                accept(blockText)
              } else if (detectedLayout?.text) {
                accept(detectedLayout.text)
              }
            }}
          />
        )}

        {phase.kind === 'reading' && (
          <View className="absolute inset-0 items-center justify-center gap-3 bg-background/80">
            <ActivityIndicator size="large" />
            <Text className="text-base font-medium text-foreground">Reading the page…</Text>
          </View>
        )}
      </View>

      <View
        style={{ paddingBottom: Math.max(insets.bottom + 16, 24) }}
        className="gap-4 border-t border-border bg-surface p-5"
      >
        <View accessibilityLiveRegion="polite" className="min-h-10 justify-center">
          {phase.kind === 'error' ? (
            <View className="flex-row items-start gap-1.5">
              <AlertIcon color={warning} size={16} />
              <Text className="flex-1 text-sm text-warning">{phase.message}</Text>
            </View>
          ) : (
            <Text className="text-center text-sm font-medium text-muted-foreground">
              {phase.kind === 'steady'
                ? '✨ Text aligned in frame • Tap shutter to edit'
                : 'Fit your document inside the frame to scan'}
            </Text>
          )}
        </View>

        <View className="flex-row items-center justify-between">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose a photo instead"
            onPress={pickImage}
            className="h-16 w-16 items-center justify-center rounded-full active:opacity-70"
          >
            <ImageIcon color={mutedForeground} size={26} />
          </Pressable>

          {/* Google Lens Shutter Button */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Read this frame now"
            disabled={phase.kind === 'reading'}
            onPress={() => {
              void readFrame(true)
            }}
            className={`h-20 w-20 items-center justify-center rounded-full border-4 border-primary/40 p-1 active:opacity-70 ${
              phase.kind === 'reading' ? 'opacity-50' : ''
            }`}
          >
            <View className="h-full w-full items-center justify-center rounded-full border-2 border-primary bg-surface">
              <View className="h-10 w-10 rounded-full bg-primary" />
            </View>
          </Pressable>

          {/* Document / PDF Import Button */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Import a PDF or document"
            onPress={pickDocument}
            className="h-16 w-16 items-center justify-center rounded-full active:opacity-70"
          >
            <FileTextIcon color={mutedForeground} size={26} />
          </Pressable>
        </View>

        {/* Manual Paste Text Shortcut */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Switch to pasted text reviewer"
          onPress={() => {
            router.replace(
              setId === undefined || setId.length === 0
                ? '/scan-review?mode=paste'
                : `/scan-review?mode=paste&setId=${encodeURIComponent(setId)}`,
            )
          }}
          className="items-center pt-1"
        >
          <Text className="text-xs font-semibold text-primary">Or paste text notes manually →</Text>
        </Pressable>
      </View>
    </View>
  )
}
