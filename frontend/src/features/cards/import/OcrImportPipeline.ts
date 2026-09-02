import { isImageFile, processImageOcr } from '@/services/ocr/image-ocr'
import { isDocumentFile, processDocumentText } from '@/services/ocr/document-ocr'

export interface PipelineProgressCallback {
  (fraction: number, stageLabel?: string): void
}

/**
 * Universal file import & OCR pipeline:
 * Directs images to OCR and documents to direct text extractor.
 */
export async function runOcrImportPipeline(
  file: File,
  onProgress?: PipelineProgressCallback,
  signal?: AbortSignal,
): Promise<string> {
  if (isImageFile(file)) {
    return processImageOcr(
      file,
      (fraction) => {
        onProgress?.(
          fraction,
          fraction < 0.3 ? 'Loading OCR engine…' : 'Extracting text from image…',
        )
      },
      signal,
    )
  }

  if (isDocumentFile(file)) {
    return processDocumentText(file, (fraction) => {
      onProgress?.(fraction, 'Reading document text…')
    })
  }

  // If MIME is unknown or arbitrary, attempt text read first
  try {
    const text = await file.text()
    if (text && text.trim().length > 0) {
      return text.trim()
    }
  } catch {
    // Fall through to error
  }

  throw new Error(
    'Unsupported file format. Please upload an image (PNG, JPG, WEBP) or document (PDF, TXT, MD).',
  )
}
