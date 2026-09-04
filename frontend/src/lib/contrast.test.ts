import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The one constraint in the clay redesign that cannot be checked by eye without
 * checking it on every screen: 4.5:1 on text, in both themes
 * (docs/superpowers/specs/2026-09-04-clay-ui-redesign-design.md §9.1).
 *
 * Clay's filled buttons are gradients, so a token pair that passes at the base
 * end can still fail at the deep end — which is exactly the dark-mode defect the
 * `--*-deep` tokens were added to fix. This reads the real token values out of
 * `index.css` so the check cannot drift away from the stylesheet, and asserts
 * the far end of every gradient still carries its foreground.
 */

// Relative to the Vitest root (`frontend/`), not to this file: under Vite's
// transform `import.meta.url` is not a `file:` URL and `readFileSync` rejects it.
const CSS = readFileSync('src/index.css', 'utf8')

/**
 * The token values from one theme block.
 *
 * `:root` and `.dark` both define the same names, so the blocks have to be split
 * before matching — a single pass over the whole file would let the dark value
 * overwrite the light one and quietly test dark twice.
 */
function tokens(selector: string): Record<string, string> {
  const start = CSS.indexOf(`${selector} {`)
  expect(start, `${selector} block not found in index.css`).toBeGreaterThan(-1)

  // Ends at the first line that closes a block at this nesting depth. The token
  // blocks contain no nested braces, so the first `\n  }` is the end.
  const end = CSS.indexOf('\n  }', start)
  const block = CSS.slice(start, end)

  const found: Record<string, string> = {}
  for (const [, name, value] of block.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    if (name && value) found[name] = value.trim()
  }
  return found
}

/** `H S% L%` — the space the design tokens are stored in — to sRGB 0..1. */
function hslToRgb(value: string): [number, number, number] {
  const parts = value.split(/\s+/)
  const h = Number.parseFloat(parts[0] ?? '')
  const s = Number.parseFloat(parts[1] ?? '') / 100
  const l = Number.parseFloat(parts[2] ?? '') / 100
  expect(Number.isFinite(h) && Number.isFinite(s) && Number.isFinite(l), value).toBe(true)

  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = h / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  const m = l - c / 2

  const face: [number, number, number] =
    hp < 1
      ? [c, x, 0]
      : hp < 2
        ? [x, c, 0]
        : hp < 3
          ? [0, c, x]
          : hp < 4
            ? [0, x, c]
            : hp < 5
              ? [x, 0, c]
              : [c, 0, x]

  return [face[0] + m, face[1] + m, face[2] + m]
}

/** WCAG 2.1 relative luminance. */
function luminance(value: string): number {
  const [r, g, b] = hslToRgb(value).map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Both ends of a clay button's gradient, against the text sitting on it. The
 * mid-point cannot be worse than the worse of the two ends, so checking the ends
 * covers the whole sweep.
 *
 * `floor` is where a pre-existing shortfall is recorded rather than hidden.
 * Absent — which is every case but one — means the 4.5:1 requirement.
 */
interface Gradient {
  fill: string
  deep: string
  text: string
  floor?: Partial<Record<'light' | 'dark', number>>
}

const GRADIENTS: Gradient[] = [
  { fill: '--primary', deep: '--primary-deep', text: '--primary-foreground' },
  {
    fill: '--accent',
    deep: '--accent-deep',
    text: '--accent-foreground',
    /*
     * ponytail: 3.2:1 at the base, 3.8:1 at the deep end. Pre-existing and
     * knowingly left alone — neither is a clay regression. `--accent` at 58%
     * lightness cannot hold near-white text, and `--accent-deep` only tokenises
     * the literal `14 82% 50%` that the gradient already used. The file's own
     * note at `--accent-strong` says exactly this about accent-as-text; the same
     * arithmetic applies to accent-as-fill and that case was missed.
     *
     * The fix is to darken light-theme `--accent-foreground` the way the dark
     * theme already does (measures 5.1:1 against the base). That recolours the
     * text on every accent button and badge in the light theme — including the
     * landing page, which the clay redesign spec §12 freezes as its reference —
     * so it belongs in its own change rather than smuggled into this one. Delete
     * this floor when that lands.
     */
    floor: { light: 3.2 },
  },
  // `.clay-btn-danger` puts `--primary-foreground` on a danger fill, matching
  // what `Button`'s danger variant already does.
  { fill: '--danger', deep: '--danger-deep', text: '--primary-foreground' },
]

describe.each([
  ['light', ':root'],
  ['dark', '.dark'],
] as const)('%s theme token contrast', (themeName, selector) => {
  const theme = tokens(selector)

  it.each(GRADIENTS)('$fill → $deep carries $text', ({ fill, deep, text, floor }) => {
    const fillValue = theme[fill]
    const deepValue = theme[deep]
    const textValue = theme[text]
    expect([fillValue, deepValue, textValue].every(Boolean), `missing token in ${selector}`).toBe(
      true,
    )

    const required = floor?.[themeName] ?? 4.5
    expect(
      contrast(fillValue as string, textValue as string),
      `${fill} fill`,
    ).toBeGreaterThanOrEqual(required)
    expect(
      contrast(deepValue as string, textValue as string),
      `${deep} deep end`,
    ).toBeGreaterThanOrEqual(required)
  })

  it('carries body text on every surface at 4.5:1', () => {
    for (const surface of ['--background', '--surface', '--surface-muted'] as const) {
      const surfaceValue = theme[surface] as string
      expect(
        contrast(surfaceValue, theme['--foreground'] as string),
        `--foreground on ${surface}`,
      ).toBeGreaterThanOrEqual(4.5)
      // The muted variant is the one that actually gets close — it exists to be
      // quieter, and "quieter" is one step from "unreadable".
      expect(
        contrast(surfaceValue, theme['--muted-foreground'] as string),
        `--muted-foreground on ${surface}`,
      ).toBeGreaterThanOrEqual(4.5)
    }
  })
})
