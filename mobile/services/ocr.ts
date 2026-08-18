import TextRecognition from '@react-native-ml-kit/text-recognition'
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator'
import { dewrap, normalizeParagraph } from '@saulado/shared'

/**
 * An image on disk in, a page of prose out — the mobile half of
 * `frontend/src/features/cards/ocr.ts`.
 *
 * Same contract as the web function on purpose: take one image, hand back text
 * that has already been de-wrapped and normalized. Everything downstream —
 * `segmentParagraphs`, the question stage, the blank stage, `useCardDraft` — is
 * then the code that already exists rather than a second implementation of it.
 * The signature is narrower only because the platform is: there is no `File`
 * here, no upload progress to report, and nothing to abort, since recognition
 * is a single native call measured in a few hundred milliseconds.
 *
 * The recognizer is Google's ML Kit on Android and Apple's Vision on iOS, both
 * on-device and both already present in the OS. No model download, no network,
 * and no image ever leaves the phone — which is what lets the scanner screen say
 * so without qualification.
 */

/**
 * Rebuilding the page from `blocks` rather than taking `result.text`.
 *
 * ML Kit's flat `text` is every line joined with a newline and no blank lines in
 * it at all, so `dewrap` — which treats a blank line as the one real paragraph
 * boundary — would fold an entire page into a single unreadable wall. A block is
 * the recognizer's own idea of a paragraph, so joining blocks with a blank line
 * restores exactly the boundary `dewrap` is looking for, and the line breaks
 * inside a block stay what they are: visual wrapping, to be undone.
 */

export async function recognize(uri: string): Promise<string> {
  const downscaled = await manipulateAsync(uri, [{ resize: { width: 1080 } }], {
    compress: 0.8,
    format: SaveFormat.JPEG,
  })

  const result = await TextRecognition.recognize(downscaled.uri)
  const page = result.blocks.map((block) => block.text).join('\n\n')

  return normalizeParagraph(dewrap(page))
}
