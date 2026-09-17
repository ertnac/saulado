import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, string>()
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value)
      return Promise.resolve()
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key)
      return Promise.resolve()
    }),
    clear: vi.fn(() => {
      store.clear()
      return Promise.resolve()
    }),
  },
}))

import {
  getHighlightHex,
  getHighlightRgba,
  hexToRgba,
  HIGHLIGHT_COLOR_PRESETS,
  useHighlightPreferencesStore,
} from '../highlight-preferences'

describe('highlight-preferences', () => {
  beforeEach(() => {
    store.clear()
    useHighlightPreferencesStore.setState({
      highlightColor: 'yellow',
      customHex: '#3B82F6',
      hydrated: true,
    })
  })

  it('starts with yellow as default highlight color', () => {
    expect(useHighlightPreferencesStore.getState().highlightColor).toBe('yellow')
  })

  it('updates highlight color to blue and persists to storage', () => {
    useHighlightPreferencesStore.getState().setHighlightColor('blue')
    expect(useHighlightPreferencesStore.getState().highlightColor).toBe('blue')
    expect(store.get('saulado-highlight-color')).toBe('blue')
  })

  it('sets custom hex color and updates highlightColor', () => {
    useHighlightPreferencesStore.getState().setCustomHex('#10B981')
    expect(useHighlightPreferencesStore.getState().customHex).toBe('#10B981')
    expect(useHighlightPreferencesStore.getState().highlightColor).toBe('#10B981')
    expect(store.get('saulado-highlight-color')).toBe('#10B981')
    expect(store.get('saulado-highlight-custom-hex')).toBe('#10B981')
  })

  it('resolves preset colors and custom hexes to rgba correctly', () => {
    // Presets
    expect(getHighlightRgba('blue')).toBe('rgba(59, 130, 246, 0.45)')
    expect(getHighlightRgba('yellow')).toBe('rgba(250, 204, 21, 0.45)')
    expect(getHighlightRgba('emerald')).toBe('rgba(16, 185, 129, 0.45)')

    // Hex strings
    expect(getHighlightRgba('#3b82f6')).toBe('rgba(59, 130, 246, 0.45)')
    expect(getHighlightRgba('#ffffff', 0.5)).toBe('rgba(255, 255, 255, 0.5)')

    // Fallback
    expect(getHighlightRgba('unknown-color')).toBe('rgba(250, 204, 21, 0.45)')
  })

  it('resolves hex values via getHighlightHex correctly', () => {
    expect(getHighlightHex('blue')).toBe('#3B82F6')
    expect(getHighlightHex('yellow')).toBe('#FACC15')
    expect(getHighlightHex('#123456')).toBe('#123456')
  })

  it('converts 3-digit and 6-digit hex to rgba via hexToRgba', () => {
    expect(hexToRgba('#fff', 0.5)).toBe('rgba(255, 255, 255, 0.5)')
    expect(hexToRgba('#000000', 0.8)).toBe('rgba(0, 0, 0, 0.8)')
    expect(hexToRgba('invalid', 0.45)).toBe('rgba(59, 130, 246, 0.45)')
  })

  it('includes yellow, blue, emerald, rose, purple, amber in HIGHLIGHT_COLOR_PRESETS', () => {
    const ids = HIGHLIGHT_COLOR_PRESETS.map((p) => p.id)
    expect(ids).toContain('yellow')
    expect(ids).toContain('blue')
    expect(ids).toContain('emerald')
    expect(ids).toContain('rose')
    expect(ids).toContain('purple')
    expect(ids).toContain('amber')
  })
})
