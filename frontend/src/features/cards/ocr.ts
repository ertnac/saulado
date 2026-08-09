import { dewrap, normalizeParagraph } from '@saulado/shared'

/**
 * Image to paragraphs, in the browser.
 *
 * OCR runs here rather than on the API for three reasons that all favour the
 * user. Tesseract reports its own progress, so the wait is a real bar instead
 * of an opaque request. The free API instance sleeps when idle, so an upload
 * would begin with a 30–60 second cold start. And a 512 MB box can only OCR one
 * image at a time, so a second user would be turned away. Nothing is uploaded,
 * which also means nothing is stored.
 *
 * `tesseract.js` and its ~4 MB of WASM and English training data enter through
 * the dynamic `import()` below and nowhere else, so Vite emits them as a chunk
 * that is fetched the first time someone opens the importer and never as part
 * of the initial bundle. The browser caches them afterwards.
 */

/**
 * The share of the progress bar given to loading the recognizer.
 *
 * Fetching the WASM and the training data is most of the wait on a cold cache
 * and reports its own 0–1 progress, so it gets the first band and recognition
 * gets the rest. Reporting only the recognition phase would leave the bar at
 * zero for the longest part of the first run, which reads as frozen.
 */
const LOADING_SHARE = 0.3

/** Tesseract's logger payload, narrowed to the two fields this file uses. */
interface Progress {
  status: string
  progress: number
}

/**
 * Reads text out of an image.
 *
 * `onProgress` receives a fraction from 0 to 1 that never decreases — each
 * phase of the load reports its own 0–1, and a bar that slides backwards looks
 * like a fault. Pass `signal` to abandon a running recognition; the promise
 * rejects and the worker is torn down, but note that the WASM cannot be
 * interrupted mid-page, so the work stops at the next phase boundary.
 *
 * Returns de-wrapped, normalized prose: newlines inside visual lines are
 * collapsed, hyphenated line breaks are rejoined, and the text is in NFC with
 * trailing whitespace removed — ready for highlighting, and byte-identical to
 * what {@link normalizeParagraph} would produce.
 */
export async function recognize(
  file: File,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  const { createWorker } = await import('tesseract.js')

  let reported = 0
  const report = (fraction: number): void => {
    if (fraction <= reported) return
    reported = fraction
    onProgress(fraction)
  }

  const worker = await createWorker('eng', 1, {
    logger: ({ status, progress }: Progress) => {
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
      : Promise.race([recognizing, rejectOnAbort(signal)]))

    return normalizeParagraph(dewrap(data.text))
  } finally {
    // Not optional and not conditional: the worker holds tens of megabytes of
    // WASM heap, and one left running per cancelled import would outlive the
    // dialog that started it.
    await worker.terminate()
  }
}

/** Never resolves; rejects when the signal aborts, so it can lose a `race`. */
function rejectOnAbort(signal: AbortSignal): Promise<never> {
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
