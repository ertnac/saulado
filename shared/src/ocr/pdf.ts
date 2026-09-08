import { enhanceOcrText } from './ocr-enhancer.js'

declare const TextDecoder: {
  new (
    label?: string,
    options?: { fatal?: boolean; ignoreBOM?: boolean },
  ): {
    decode(input?: Uint8Array | ArrayBuffer | ArrayBufferView): string
  }
}

/**
 * Unescapes PDF string literal escape sequences:
 * \( -> (
 * \) -> )
 * \\ -> \
 * \n, \r, \t, \b, \f
 * \ddd -> octal character code
 */
function unescapePdfString(str: string): string {
  return str
    .replace(/\\([0-7]{1,3})/g, (_, octal: string) => String.fromCharCode(parseInt(octal, 8)))
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
}

/**
 * Extracts human-readable text from raw PDF stream content or uncompressed PDF bytes.
 *
 * Handles standard PDF text objects (`BT ... ET`), `Tj` string literals,
 * `TJ` spaced array fragments, hex strings `<...>`, and fallback stream scanning.
 */
export function extractTextFromPdfStream(rawContent: string | Uint8Array): string {
  let content: string
  if (typeof rawContent === 'string') {
    content = rawContent
  } else {
    const decoder = new TextDecoder('utf-8', { fatal: false })
    content = decoder.decode(rawContent)
  }

  if (!content || content.trim().length === 0) {
    return ''
  }

  const extractedParagraphs: string[] = []

  // 1. Scan for text objects: BT (Begin Text) ... ET (End Text)
  const textObjectRegex = /BT([\s\S]*?)ET/g
  let objectMatch: RegExpExecArray | null

  while ((objectMatch = textObjectRegex.exec(content)) !== null) {
    const blockContent = objectMatch[1] ?? ''
    const blockLines: string[] = []

    // Match both (string) Tj / ' and [(string) num (string)] TJ operators
    const operatorRegex =
      /(\((?:[^()\\]|\\.)*\)|<[0-9a-fA-F\s]+>)\s*(?:Tj|'|")|\[((?:[^[\]]|\((?:[^()\\]|\\.)*\))*)\]\s*TJ/g
    let opMatch: RegExpExecArray | null

    while ((opMatch = operatorRegex.exec(blockContent)) !== null) {
      if (opMatch[1]) {
        const rawToken = opMatch[1].trim()
        if (rawToken.startsWith('(') && rawToken.endsWith(')')) {
          const inner = rawToken.slice(1, -1)
          const unescaped = unescapePdfString(inner).trim()
          if (unescaped.length > 0) {
            blockLines.push(unescaped)
          }
        } else if (rawToken.startsWith('<') && rawToken.endsWith('>')) {
          // Hex string
          const hex = rawToken.slice(1, -1).replace(/\s+/g, '')
          let decoded = ''
          for (let i = 0; i < hex.length; i += 2) {
            const code = parseInt(hex.substring(i, i + 2), 16)
            if (!isNaN(code) && code >= 32) {
              decoded += String.fromCharCode(code)
            }
          }
          if (decoded.trim().length > 0) {
            blockLines.push(decoded.trim())
          }
        }
      } else if (opMatch[2]) {
        // TJ array: [(Hello) -10 (World)] TJ
        const arrayContent = opMatch[2]
        const tjStringRegex = /\((?:[^()\\]|\\.)*\)/g
        let strMatch: RegExpExecArray | null
        const parts: string[] = []

        while ((strMatch = tjStringRegex.exec(arrayContent)) !== null) {
          const inner = strMatch[0].slice(1, -1)
          const unescaped = unescapePdfString(inner)
          if (unescaped.length > 0) {
            parts.push(unescaped)
          }
        }

        if (parts.length > 0) {
          blockLines.push(parts.join(''))
        }
      }
    }

    if (blockLines.length > 0) {
      extractedParagraphs.push(blockLines.join(' '))
    }
  }

  // 2. Fallback: If no BT...ET blocks were found (e.g. uncompressed streams without clean BT markers),
  // extract standalone (string) Tj occurrences across the entire document.
  if (extractedParagraphs.length === 0) {
    const standaloneTjRegex = /\(((?:[^()\\]|\\.)*)\)\s*Tj/g
    let match: RegExpExecArray | null
    const fallbackLines: string[] = []

    while ((match = standaloneTjRegex.exec(content)) !== null) {
      if (match[1] && match[1].trim().length > 0) {
        fallbackLines.push(unescapePdfString(match[1]))
      }
    }

    if (fallbackLines.length > 0) {
      extractedParagraphs.push(fallbackLines.join(' '))
    }
  }

  // 3. Second Fallback: Plaintext sequences with sentence-like length in uncompressed streams
  if (extractedParagraphs.length === 0) {
    const cleanMatches = content.match(/[A-Za-z0-9,.;:'"!?\s-]{20,}/g)
    if (cleanMatches && cleanMatches.length > 0) {
      const filtered = cleanMatches
        .map((m) => m.trim())
        .filter((m) => !m.startsWith('/Filter') && !m.startsWith('stream') && !m.includes('endobj'))
      if (filtered.length > 0) {
        extractedParagraphs.push(...filtered)
      }
    }
  }

  const combined = extractedParagraphs.join('\n\n')
  return enhanceOcrText(combined)
}
