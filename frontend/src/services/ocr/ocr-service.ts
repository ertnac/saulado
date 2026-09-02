import { cleanOcrText } from './ocr-cleanup'

export interface OcrProgress {
  status: string
  progress: number
}

export interface OcrProvider {
  name: string
  recognizeImage: (
    file: File | Blob,
    onProgress?: (fraction: number) => void,
    signal?: AbortSignal,
  ) => Promise<string>
}

const LOADING_SHARE = 0.3

/**
 * Default browser-based OCR Provider using Tesseract.js WASM.
 */
export class TesseractOcrProvider implements OcrProvider {
  readonly name = 'tesseract.js'

  async recognizeImage(
    file: File | Blob,
    onProgress?: (fraction: number) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    const { createWorker } = await import('tesseract.js')

    let reported = 0
    const report = (fraction: number): void => {
      if (!onProgress || fraction <= reported) return
      reported = fraction
      onProgress(fraction)
    }

    const worker = await createWorker('eng', 1, {
      logger: ({ status, progress }: OcrProgress) => {
        report(
          status === 'recognizing text'
            ? LOADING_SHARE + progress * (1 - LOADING_SHARE)
            : progress * LOADING_SHARE,
        )
      },
    })

    try {
      const recognizing = worker.recognize(file)
      const { data } = await (signal === undefined
        ? recognizing
        : Promise.race([recognizing, this.rejectOnAbort(signal)]))

      return cleanOcrText(data.text)
    } finally {
      await worker.terminate()
    }
  }

  private rejectOnAbort(signal: AbortSignal): Promise<never> {
    return new Promise((_resolve, reject) => {
      const abort = (): void => {
        reject(new Error('Recognition cancelled'))
      }

      if (signal.aborted) {
        abort()
        return
      }

      signal.addEventListener('abort', abort, { once: true })
    })
  }
}

let activeProvider: OcrProvider = new TesseractOcrProvider()

export function getOcrProvider(): OcrProvider {
  return activeProvider
}

export function setOcrProvider(provider: OcrProvider): void {
  activeProvider = provider
}
