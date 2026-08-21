import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as ImagePicker from 'expo-image-picker'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Button } from '../../components/button'
import { AlertIcon, ImageIcon } from '../../components/icons'
import { setScannedPage } from '../../lib/scan-handoff'
import { recognize } from '../../services/ocr'
import { useTokenColor } from '../../stores/theme'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

/**
 * Point the phone at a page and watch the text settle — Phase 6's camera screen.
 *
 * The viewfinder captures on a timer rather than waiting for a shutter press,
 * because the thing being photographed is a flat page the user is already
 * holding still. The expensive version of this is a `react-native-vision-camera`
 * frame processor running the recognizer on the preview buffer with no file
 * written at all; the cheap version is `takePictureAsync` on an interval, which
 * is what this is.
 *
 * **The stability rule is the whole design.** Frame-to-frame OCR is not
 * deterministic — focus drift, a moving shadow and camera shake each change a
 * word or two — so a single read is a guess. Two consecutive reads that agree
 * are not: whatever wobbled has stopped. That is why the loop compares against
 * the previous frame's text and only accepts on a match, and why "Hold steady"
 * is shown rather than a spinner. The manual shutter beside it is the escape
 * hatch for a page that never settles, and it accepts the first read outright.
 *
 * Permission is requested when the camera is first opened, in front of the
 * viewfinder that explains why — never at launch. The strings the system dialog
 * shows live in `app.config.ts`.
 *
 * Nothing leaves the device: `recognize` is Vision on iOS and ML Kit on Android,
 * both on-device, and no frame is uploaded or kept. The captured files land in
 * the app's own cache directory, which the OS reclaims.
 *
 * ponytail: `takePictureAsync` on an 800ms interval, which writes a JPEG per
 * frame. Swap in a `react-native-vision-camera` v4 frame processor if 800ms
 * proves too slow on a real device — that is a measurement, not a guess.
 */

/** How long the loop waits between captures. Plan §4.4's figure. */
const CAPTURE_INTERVAL_MS = 800

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

const NO_TEXT =
  'No text found. Fill the frame with the page, hold the phone parallel to it, and try again in better light. Handwriting is not recognised.'
const FAILED = 'Could not read that image. Try again, or pick a different photo.'

export default function ScanScreen(): ReactElement {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  // Which set the cards land in. The page itself travels through
  // `scan-handoff`, not a route param — a multi-kilobyte href would put every
  // offset the review screen produces through a percent-encoding round trip.
  const { setId } = useLocalSearchParams<{ setId?: string }>()
  const camera = useRef<CameraView>(null)
  const [permission, requestPermission] = useCameraPermissions()
  const [phase, setPhase] = useState<Phase>({ kind: 'searching' })

  const warning = useTokenColor('--warning')
  const mutedForeground = useTokenColor('--muted-foreground')

  /**
   * The previous frame's text, and the gate that stops two captures overlapping.
   *
   * Refs rather than state: neither is rendered, and a capture that is already in
   * flight has to be visible to the *next* interval tick, which a state update
   * scheduled for the next render would not be.
   */
  const previous = useRef<string | null>(null)
  const busy = useRef(false)
  /** False once the screen is torn down, so a late promise cannot navigate. */
  const alive = useRef(true)

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
      // The param is omitted rather than sent empty when the scan tab opened the
      // camera with no set in mind. An empty `setId` is a string the review
      // screen would have to test for; an absent one is already `undefined`, and
      // that is the value its picker branches on.
      router.replace(
        setId === undefined || setId.length === 0
          ? '/scan-review'
          : `/scan-review?setId=${encodeURIComponent(setId)}`,
      )
    },
    [router, setId],
  )

  /**
   * One frame: capture, recognize, and accept only on a repeat.
   *
   * `force` is the manual shutter, which accepts the first usable read — someone
   * pressing the button has decided the frame is the one they want, and making
   * them press twice would be the automatic loop with extra steps.
   */
  const readFrame = useCallback(
    async (force: boolean): Promise<void> => {
      if (busy.current || camera.current === null) return
      busy.current = true

      try {
        if (force) setPhase({ kind: 'reading' })

        const photo = await camera.current.takePictureAsync({
          // Skips the orientation fix-up, which is the slow part of a capture
          // and is irrelevant to a recognizer that reads a rotated page anyway.
          skipProcessing: true,
          shutterSound: false,
        })
        if (!alive.current) return

        const text = photo === undefined ? '' : await recognize(photo.uri)
        if (!alive.current) return

        if (text.length < MIN_PAGE_CODE_POINTS) {
          previous.current = null
          if (force) setPhase({ kind: 'error', message: NO_TEXT })
          else setPhase({ kind: 'searching' })
          return
        }

        if (force || text === previous.current) {
          accept(text)
          return
        }

        previous.current = text
        setPhase({ kind: 'steady' })
      } catch {
        if (!alive.current) return
        previous.current = null
        // A failed automatic frame is not worth a message — the next one is
        // 800ms away, and an error panel that appears and vanishes on its own
        // reads as a fault in the app rather than in the shot.
        if (force) setPhase({ kind: 'error', message: FAILED })
      } finally {
        busy.current = false
      }
    },
    [accept],
  )

  /**
   * The loop, armed only while the camera is the thing on screen.
   *
   * Held in a ref so the interval is created once rather than being torn down and
   * rebuilt every time `readFrame`'s identity changes — a restarted interval
   * resets its own clock, which on a fast render loop means it never fires.
   */
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

  /**
   * The gallery path, and the only one that works when the camera is refused.
   *
   * No media-library permission request of our own: the modern picker runs out of
   * process and returns a single asset the app is granted access to, so asking
   * for the whole library would be requesting more than the feature needs.
   */
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
          setPhase({ kind: 'error', message: NO_TEXT })
          return
        }
        accept(text)
      } catch {
        if (alive.current) setPhase({ kind: 'error', message: FAILED })
      }
    })()
  }, [accept])

  if (permission === null) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator accessibilityLabel="Opening the camera" />
      </View>
    )
  }

  /**
   * The pre-permission screen: the reason first, the system dialog second.
   *
   * `canAskAgain` false means the OS will no longer show its dialog, so the
   * button would do nothing — the gallery is the whole feature at that point, and
   * saying where the setting lives is more use than a button that silently fails.
   */
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
      <View className="flex-1">
        {/*
          `active` unmounts the session without unmounting the view: leaving the
          preview live under the reading overlay would keep the loop's captures
          competing with the one the user is waiting for.
        */}
        <CameraView
          ref={camera}
          style={{ flex: 1 }}
          facing="back"
          active={phase.kind !== 'reading'}
          animateShutter={false}
        />

        {phase.kind === 'reading' && (
          <View className="absolute inset-0 items-center justify-center gap-3 bg-background/80">
            <ActivityIndicator size="large" />
            <Text className="text-base text-foreground">Reading the page…</Text>
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
            <Text className="text-center text-sm text-muted-foreground">
              {phase.kind === 'steady'
                ? 'Hold steady…'
                : 'Fill the frame with the page. It reads by itself.'}
            </Text>
          )}
        </View>

        <View className="flex-row items-center justify-between">
          {/* 64pt each side, so the shutter sits centred without a spacer view. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose a photo instead"
            onPress={pickImage}
            className="h-16 w-16 items-center justify-center rounded-full active:opacity-70"
          >
            <ImageIcon color={mutedForeground} size={26} />
          </Pressable>

          {/*
            The manual shutter. It is not a fallback for a broken loop — a page in
            a book that will not lie flat never produces two identical reads, and
            without this the user would stand there waiting indefinitely.
          */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Read this frame now"
            disabled={phase.kind === 'reading'}
            onPress={() => {
              void readFrame(true)
            }}
            className={`h-16 w-16 items-center justify-center rounded-full border-4 border-primary active:opacity-70 ${
              phase.kind === 'reading' ? 'opacity-50' : ''
            }`}
          >
            <View className="h-11 w-11 rounded-full bg-primary" />
          </Pressable>

          <View className="h-16 w-16" />
        </View>
      </View>
    </View>
  )
}
