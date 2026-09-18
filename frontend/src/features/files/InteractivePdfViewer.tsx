import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { generatePdfViewerHtml } from '@/services/file-repository/pdf-viewer-html'

// Typed discriminated union for all messages coming from the PDF iframe
interface PdfTextSelectionMessage {
  type: 'PDF_TEXT_SELECTION'
  text: string
  pageNumber?: number
  coords?: { clientX: number; clientY: number }
}
interface PdfSelectionClearedMessage {
  type: 'PDF_SELECTION_CLEARED'
}
interface PdfKeyShortcutMessage {
  type: 'PDF_KEY_SHORTCUT'
  key: string
  text?: string
}
type PdfIframeMessage = PdfTextSelectionMessage | PdfSelectionClearedMessage | PdfKeyShortcutMessage

export interface InteractivePdfViewerProps {
  blob?: Blob | null
  blobUrl: string | null
  fileId?: string
  fileName: string
  isDark?: boolean
  className?: string
  onTextSelected?: (
    text: string,
    pageNumber?: number,
    coords?: { x: number; y: number } | null,
  ) => void
  onSelectionCleared?: () => void
  onShortcutKey?: (key: string, text?: string) => void
}

/**
 * High-fidelity, continuous-scrolling PDF viewer using PDF.js with HTML5 canvas and .textLayer.
 * Directly supports drag-selection across words and sentences and broadcasts selection
 * events back to the parent React application via postMessage.
 */
export function InteractivePdfViewer({
  blob,
  blobUrl,
  fileId = '',
  fileName,
  isDark = false,
  className = 'w-full h-full border-0',
  onTextSelected,
  onSelectionCleared,
  onShortcutKey,
}: InteractivePdfViewerProps): ReactElement {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [pdfBase64, setPdfBase64] = useState<string>('')
  const [isReady, setIsReady] = useState(false)

  // Convert blob to base64 for reliable in-memory PDF.js loading
  useEffect(() => {
    if (!blob) {
      setIsReady(true)
      return
    }

    let active = true
    const reader = new FileReader()

    reader.onloadend = () => {
      if (!active) return
      const result = reader.result as string
      if (typeof result === 'string') {
        const base64 = result.substring(result.indexOf(',') + 1)
        setPdfBase64(base64)
      }
      setIsReady(true)
    }

    reader.onerror = () => {
      if (active) setIsReady(true)
    }

    reader.readAsDataURL(blob)

    return () => {
      active = false
    }
  }, [blob])

  const htmlDocUrl = useMemo(() => {
    if (!blobUrl && !pdfBase64) return null

    const html = generatePdfViewerHtml({
      pdfUrl: blobUrl || undefined,
      pdfBase64: pdfBase64 || undefined,
      fileId,
      title: fileName,
      isDark,
    })
    const htmlBlob = new Blob([html], { type: 'text/html' })
    return URL.createObjectURL(htmlBlob)
  }, [blobUrl, pdfBase64, fileId, fileName, isDark])

  useEffect(() => {
    return () => {
      if (htmlDocUrl) URL.revokeObjectURL(htmlDocUrl)
    }
  }, [htmlDocUrl])

  // Handle iframe messages (selection, switch to reader, etc.)
  useEffect(() => {
    const handleMessage = (event: MessageEvent<unknown>) => {
      if (!event.data || typeof event.data !== 'object') return

      const msg = event.data as PdfIframeMessage
      if (msg.type === 'PDF_TEXT_SELECTION') {
        const text = msg.text.trim()
        if (text.length > 0) {
          let screenCoords: { x: number; y: number } | null = null
          if (msg.coords && iframeRef.current) {
            const iframeRect = iframeRef.current.getBoundingClientRect()
            screenCoords = {
              x: iframeRect.left + (msg.coords.clientX || 0),
              y: iframeRect.top + (msg.coords.clientY || 0),
            }
          }
          onTextSelected?.(text, msg.pageNumber, screenCoords)
        }
      } else if (msg.type === 'PDF_SELECTION_CLEARED') {
        onSelectionCleared?.()
      } else if (msg.type === 'PDF_KEY_SHORTCUT') {
        onShortcutKey?.(msg.key, msg.text)
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [onTextSelected, onSelectionCleared, onShortcutKey])

  // Post ArrayBuffer to iframe once it loads
  const handleIframeLoad = () => {
    if (blob && iframeRef.current?.contentWindow) {
      blob
        .arrayBuffer()
        .then((buffer) => {
          iframeRef.current?.contentWindow?.postMessage(
            {
              type: 'LOAD_PDF_BUFFER',
              buffer,
            },
            '*',
          )
        })
        .catch(() => {})
    }
  }

  if (!isReady || (!blobUrl && !pdfBase64) || !htmlDocUrl) {
    return (
      <div className="flex h-full w-full items-center justify-center p-8 text-center text-sm text-muted-foreground flex-col gap-2">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p>Rendering visual PDF pages…</p>
      </div>
    )
  }

  return (
    <iframe
      ref={iframeRef}
      src={htmlDocUrl}
      onLoad={handleIframeLoad}
      className={className}
      title={fileName}
    />
  )
}
