import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Animated, Easing, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native'
import type { TextBlock } from '../lib/text-recognition'

export interface InboundBox {
  left: number
  top: number
  width: number
  height: number
}

interface LensArOverlayProps {
  blocks: TextBlock[]
  imageWidth: number
  imageHeight: number
  viewWidth: number
  viewHeight: number
  onSelectBlock?: (text: string) => void
  onBoxCalculated?: (box: InboundBox) => void
  onScanSelection?: (selectedText: string) => void
}

type DragHandle = 'tl' | 'tr' | 'bl' | 'br' | 'body' | 'draw' | null

const MIN_BOX_SIZE = 60
const HANDLE_TOUCH_SIZE = 44

export function LensArOverlay({
  blocks,
  imageWidth,
  imageHeight,
  viewWidth,
  viewHeight,
  onSelectBlock,
  onBoxCalculated,
  onScanSelection,
}: LensArOverlayProps): ReactElement | null {
  // Laser scan line animation
  const scanAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scanAnim, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [scanAnim])

  // User-draggable selection box state
  const [customBox, setCustomBox] = useState<InboundBox | null>(null)

  // Compute default center box if user hasn't dragged yet
  const defaultBoxWidth = Math.min(viewWidth * 0.88, 360)
  const defaultBoxHeight = Math.min(viewHeight * 0.62, 480)
  const defaultBoxLeft = (viewWidth - defaultBoxWidth) / 2
  const defaultBoxTop = (viewHeight - defaultBoxHeight) / 2 - 20

  const activeBox: InboundBox = customBox ?? {
    left: Math.max(0, defaultBoxLeft),
    top: Math.max(0, defaultBoxTop),
    width: defaultBoxWidth,
    height: defaultBoxHeight,
  }

  // Keep ref in sync for pan responder
  const boxRef = useRef<InboundBox>(activeBox)
  boxRef.current = activeBox

  const activeHandle = useRef<DragHandle>(null)
  const dragStart = useRef<{
    touchX: number
    touchY: number
    box: InboundBox
  }>({
    touchX: 0,
    touchY: 0,
    box: activeBox,
  })

  // Notify parent of active box for OCR filtering
  useEffect(() => {
    if (onBoxCalculated) {
      onBoxCalculated(activeBox)
    }
  }, [activeBox.left, activeBox.top, activeBox.width, activeBox.height, onBoxCalculated])

  // Aspect-fill coordinate scaling
  const scaleX = imageWidth > 0 ? viewWidth / imageWidth : 1
  const scaleY = imageHeight > 0 ? viewHeight / imageHeight : 1
  const scale = Math.max(scaleX, scaleY)

  const offsetX = (viewWidth - imageWidth * scale) / 2
  const offsetY = (viewHeight - imageHeight * scale) / 2

  // Extract only lines that fall inside the user-dragged box
  const linesInside: {
    key: string
    text: string
    left: number
    top: number
    width: number
    height: number
  }[] = []

  if (blocks && blocks.length > 0 && imageWidth > 0 && imageHeight > 0) {
    blocks.forEach((block, bIdx) => {
      if (block.lines && block.lines.length > 0) {
        block.lines.forEach((line, lIdx) => {
          if (line.frame && line.text.trim().length > 0) {
            const screenLeft = line.frame.left * scale + offsetX
            const screenTop = line.frame.top * scale + offsetY
            const screenWidth = line.frame.width * scale
            const screenHeight = line.frame.height * scale

            const centerX = screenLeft + screenWidth / 2
            const centerY = screenTop + screenHeight / 2

            if (
              centerX >= activeBox.left &&
              centerX <= activeBox.left + activeBox.width &&
              centerY >= activeBox.top &&
              centerY <= activeBox.top + activeBox.height
            ) {
              linesInside.push({
                key: `line-${String(bIdx)}-${String(lIdx)}`,
                text: line.text,
                left: screenLeft,
                top: screenTop,
                width: screenWidth,
                height: screenHeight,
              })
            }
          }
        })
      } else if (block.frame && block.text.trim().length > 0) {
        const screenLeft = block.frame.left * scale + offsetX
        const screenTop = block.frame.top * scale + offsetY
        const screenWidth = block.frame.width * scale
        const screenHeight = block.frame.height * scale

        const centerX = screenLeft + screenWidth / 2
        const centerY = screenTop + screenHeight / 2

        if (
          centerX >= activeBox.left &&
          centerX <= activeBox.left + activeBox.width &&
          centerY >= activeBox.top &&
          centerY <= activeBox.top + activeBox.height
        ) {
          linesInside.push({
            key: `block-${String(bIdx)}`,
            text: block.text,
            left: screenLeft,
            top: screenTop,
            width: screenWidth,
            height: screenHeight,
          })
        }
      }
    })
  }

  // PanResponder to handle interactive dragging, corner resizing, and drawing selection box
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent
        const current = boxRef.current
        dragStart.current = {
          touchX: locationX,
          touchY: locationY,
          box: { ...current },
        }

        const handleRadius = HANDLE_TOUCH_SIZE / 2

        // Detect which handle was touched
        const isNearTL =
          Math.abs(locationX - current.left) <= handleRadius &&
          Math.abs(locationY - current.top) <= handleRadius
        const isNearTR =
          Math.abs(locationX - (current.left + current.width)) <= handleRadius &&
          Math.abs(locationY - current.top) <= handleRadius
        const isNearBL =
          Math.abs(locationX - current.left) <= handleRadius &&
          Math.abs(locationY - (current.top + current.height)) <= handleRadius
        const isNearBR =
          Math.abs(locationX - (current.left + current.width)) <= handleRadius &&
          Math.abs(locationY - (current.top + current.height)) <= handleRadius

        if (isNearTL) {
          activeHandle.current = 'tl'
        } else if (isNearTR) {
          activeHandle.current = 'tr'
        } else if (isNearBL) {
          activeHandle.current = 'bl'
        } else if (isNearBR) {
          activeHandle.current = 'br'
        } else if (
          locationX >= current.left &&
          locationX <= current.left + current.width &&
          locationY >= current.top &&
          locationY <= current.top + current.height
        ) {
          activeHandle.current = 'body'
        } else {
          // Tapped outside: start drawing a fresh box from tap location
          activeHandle.current = 'draw'
          setCustomBox({
            left: locationX,
            top: locationY,
            width: 10,
            height: 10,
          })
        }
      },
      onPanResponderMove: (evt, gestureState) => {
        const handle = activeHandle.current
        if (!handle) return

        const { dx, dy } = gestureState
        const start = dragStart.current.box
        const originX = dragStart.current.touchX
        const originY = dragStart.current.touchY
        const currentX = evt.nativeEvent.locationX
        const currentY = evt.nativeEvent.locationY

        if (handle === 'draw') {
          // Drawing a new box
          const left = Math.min(originX, currentX)
          const top = Math.min(originY, currentY)
          const width = Math.max(MIN_BOX_SIZE, Math.abs(currentX - originX))
          const height = Math.max(MIN_BOX_SIZE, Math.abs(currentY - originY))

          setCustomBox({
            left: Math.max(0, left),
            top: Math.max(0, top),
            width: Math.min(viewWidth - left, width),
            height: Math.min(viewHeight - top, height),
          })
        } else if (handle === 'body') {
          // Dragging the whole box
          const newLeft = Math.max(0, Math.min(viewWidth - start.width, start.left + dx))
          const newTop = Math.max(0, Math.min(viewHeight - start.height, start.top + dy))
          setCustomBox({
            left: newLeft,
            top: newTop,
            width: start.width,
            height: start.height,
          })
        } else if (handle === 'tl') {
          const newLeft = Math.max(
            0,
            Math.min(start.left + start.width - MIN_BOX_SIZE, start.left + dx),
          )
          const newTop = Math.max(
            0,
            Math.min(start.top + start.height - MIN_BOX_SIZE, start.top + dy),
          )
          const newWidth = start.width - (newLeft - start.left)
          const newHeight = start.height - (newTop - start.top)
          setCustomBox({
            left: newLeft,
            top: newTop,
            width: newWidth,
            height: newHeight,
          })
        } else if (handle === 'tr') {
          const newTop = Math.max(
            0,
            Math.min(start.top + start.height - MIN_BOX_SIZE, start.top + dy),
          )
          const newWidth = Math.max(
            MIN_BOX_SIZE,
            Math.min(viewWidth - start.left, start.width + dx),
          )
          const newHeight = start.height - (newTop - start.top)
          setCustomBox({
            left: start.left,
            top: newTop,
            width: newWidth,
            height: newHeight,
          })
        } else if (handle === 'bl') {
          const newLeft = Math.max(
            0,
            Math.min(start.left + start.width - MIN_BOX_SIZE, start.left + dx),
          )
          const newWidth = start.width - (newLeft - start.left)
          const newHeight = Math.max(
            MIN_BOX_SIZE,
            Math.min(viewHeight - start.top, start.height + dy),
          )
          setCustomBox({
            left: newLeft,
            top: start.top,
            width: newWidth,
            height: newHeight,
          })
        } else if (handle === 'br') {
          const newWidth = Math.max(
            MIN_BOX_SIZE,
            Math.min(viewWidth - start.left, start.width + dx),
          )
          const newHeight = Math.max(
            MIN_BOX_SIZE,
            Math.min(viewHeight - start.top, start.height + dy),
          )
          setCustomBox({
            left: start.left,
            top: start.top,
            width: newWidth,
            height: newHeight,
          })
        }
      },
      onPanResponderRelease: () => {
        activeHandle.current = null
      },
    }),
  ).current

  if (viewWidth <= 0 || viewHeight <= 0) {
    return null
  }

  const scanBarTranslateY = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, activeBox.height - 4],
  })

  const selectedProse = linesInside.map((l) => l.text).join('\n')

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* 1. Darkened Mask Outside the User-Dragged Selection Box */}
      <View
        style={[styles.mask, { top: 0, left: 0, right: 0, height: Math.max(0, activeBox.top) }]}
      />
      <View
        style={[
          styles.mask,
          {
            top: activeBox.top + activeBox.height,
            left: 0,
            right: 0,
            bottom: 0,
          },
        ]}
      />
      <View
        style={[
          styles.mask,
          {
            top: activeBox.top,
            left: 0,
            width: Math.max(0, activeBox.left),
            height: activeBox.height,
          },
        ]}
      />
      <View
        style={[
          styles.mask,
          {
            top: activeBox.top,
            left: activeBox.left + activeBox.width,
            right: 0,
            height: activeBox.height,
          },
        ]}
      />

      {/* 2. Interactive Pan Responder Layer for Dragging & Resizing */}
      <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers}>
        {/* The Draggable Selection Box */}
        <View
          style={[
            styles.targetBox,
            {
              top: activeBox.top,
              left: activeBox.left,
              width: activeBox.width,
              height: activeBox.height,
            },
          ]}
        >
          {/* Laser scanning beam */}
          <Animated.View
            style={[
              styles.laserBar,
              {
                transform: [{ translateY: scanBarTranslateY }],
              },
            ]}
          />

          {/* 4 Corner Google Lens Corner Reticles */}
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
        </View>

        {/* 4 Interactive Drag Handles (Grip Pins) */}
        {/* Top-Left Grip Handle */}
        <View
          style={[
            styles.gripPin,
            {
              top: activeBox.top - 8,
              left: activeBox.left - 8,
            },
          ]}
        />
        {/* Top-Right Grip Handle */}
        <View
          style={[
            styles.gripPin,
            {
              top: activeBox.top - 8,
              left: activeBox.left + activeBox.width - 8,
            },
          ]}
        />
        {/* Bottom-Left Grip Handle */}
        <View
          style={[
            styles.gripPin,
            {
              top: activeBox.top + activeBox.height - 8,
              left: activeBox.left - 8,
            },
          ]}
        />
        {/* Bottom-Right Grip Handle */}
        <View
          style={[
            styles.gripPin,
            {
              top: activeBox.top + activeBox.height - 8,
              left: activeBox.left + activeBox.width - 8,
            },
          ]}
        />
      </View>

      {/* 3. Highlighted Text Blocks inside the user's dragged box */}
      {linesInside.map((item) => (
        <Pressable
          key={item.key}
          onPress={() => {
            if (onSelectBlock) {
              onSelectBlock(item.text)
            }
          }}
          style={[
            styles.box,
            {
              left: Math.max(activeBox.left, item.left - 2),
              top: Math.max(activeBox.top, item.top - 2),
              width: Math.min(activeBox.width - 4, item.width + 4),
              height: Math.max(16, item.height + 4),
            },
          ]}
        >
          <View style={styles.cornerDot} />
        </Pressable>
      ))}

      {/* 4. Google Lens Top Status Pill */}
      <View style={styles.badgeContainer} pointerEvents="none">
        <View style={styles.lensBadge}>
          <View
            style={[
              styles.pulseDot,
              {
                backgroundColor: linesInside.length > 0 ? '#10b981' : '#94a3b8',
              },
            ]}
          />
          <Text style={styles.badgeText}>
            {linesInside.length > 0
              ? `✨ ${String(linesInside.length)} lines selected • Drag corners to adjust`
              : '👆 Drag on screen or corners to select text'}
          </Text>
        </View>
      </View>

      {/* 5. Quick "Copy / Scan Selected Area" Floating Pill below the box */}
      {linesInside.length > 0 && onScanSelection && (
        <View
          style={[
            styles.quickActionBar,
            {
              top: Math.min(viewHeight - 110, activeBox.top + activeBox.height + 14),
            },
          ]}
        >
          <Pressable
            onPress={() => {
              onScanSelection(selectedProse)
            }}
            style={styles.scanSelectionButton}
          >
            <Text style={styles.scanSelectionText}>
              {`Scan Selected Text (${String(linesInside.length)} lines) →`}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  )
}

const CORNER_SIZE = 24
const CORNER_BORDER = 3.5
const CORNER_COLOR = '#34d399'

const styles = StyleSheet.create({
  mask: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 0, 0, 0.48)', // Dims everything outside user's dragged area
  },
  targetBox: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: 'rgba(52, 211, 153, 0.45)',
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
  },
  laserBar: {
    height: 2,
    backgroundColor: '#34d399',
    shadowColor: '#34d399',
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 4,
    opacity: 0.6,
  },
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: CORNER_COLOR,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_BORDER,
    borderLeftWidth: CORNER_BORDER,
    borderTopLeftRadius: 14,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_BORDER,
    borderRightWidth: CORNER_BORDER,
    borderTopRightRadius: 14,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_BORDER,
    borderLeftWidth: CORNER_BORDER,
    borderBottomLeftRadius: 14,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_BORDER,
    borderRightWidth: CORNER_BORDER,
    borderBottomRightRadius: 14,
  },
  gripPin: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 3,
    borderColor: '#10b981',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 5,
  },
  box: {
    position: 'absolute',
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(52, 211, 153, 0.75)',
    backgroundColor: 'rgba(16, 185, 129, 0.22)',
    overflow: 'hidden',
  },
  cornerDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#34d399',
  },
  badgeContainer: {
    position: 'absolute',
    top: 55,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  lensBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.4)',
  },
  pulseDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  badgeText: {
    color: '#f8fafc',
    fontSize: 12.5,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  quickActionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  scanSelectionButton: {
    backgroundColor: '#10b981',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 6,
  },
  scanSelectionText: {
    color: '#0f172a',
    fontSize: 13.5,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
})
