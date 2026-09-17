import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'

export interface HighlightColorPreset {
  id: string
  name: string
  hex: string
  rgba: string
  border: string
}

export const HIGHLIGHT_COLOR_PRESETS: HighlightColorPreset[] = [
  {
    id: 'yellow',
    name: 'Yellow',
    hex: '#FACC15',
    rgba: 'rgba(250, 204, 21, 0.45)',
    border: 'rgba(234, 179, 8, 0.8)',
  },
  {
    id: 'blue',
    name: 'Blue',
    hex: '#3B82F6',
    rgba: 'rgba(59, 130, 246, 0.45)',
    border: 'rgba(37, 99, 235, 0.8)',
  },
  {
    id: 'emerald',
    name: 'Green',
    hex: '#10B981',
    rgba: 'rgba(16, 185, 129, 0.45)',
    border: 'rgba(5, 150, 105, 0.8)',
  },
  {
    id: 'rose',
    name: 'Rose',
    hex: '#F43F5E',
    rgba: 'rgba(244, 63, 94, 0.40)',
    border: 'rgba(225, 29, 72, 0.8)',
  },
  {
    id: 'purple',
    name: 'Purple',
    hex: '#8B5CF6',
    rgba: 'rgba(139, 92, 246, 0.40)',
    border: 'rgba(124, 58, 237, 0.8)',
  },
  {
    id: 'amber',
    name: 'Orange',
    hex: '#F97316',
    rgba: 'rgba(249, 115, 22, 0.45)',
    border: 'rgba(234, 88, 12, 0.8)',
  },
]

export function hexToRgba(hex: string, alpha = 0.45): string {
  try {
    let clean = hex.replace('#', '').trim()
    if (clean.length === 3) {
      clean = clean
        .split('')
        .map((char) => char + char)
        .join('')
    }
    if (clean.length !== 6) return `rgba(59, 130, 246, ${alpha})`
    const num = parseInt(clean, 16)
    if (Number.isNaN(num)) return `rgba(59, 130, 246, ${alpha})`
    const r = (num >> 16) & 255
    const g = (num >> 8) & 255
    const b = num & 255
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  } catch {
    return `rgba(59, 130, 246, ${alpha})`
  }
}

export function getHighlightRgba(color: string, alpha = 0.45): string {
  const normalized = (color || 'yellow').toLowerCase().trim()
  const matched = HIGHLIGHT_COLOR_PRESETS.find((p) => p.id === normalized)
  if (matched) return matched.rgba
  if (normalized.startsWith('#')) return hexToRgba(normalized, alpha)
  if (normalized.startsWith('rgb')) return normalized
  return `rgba(250, 204, 21, ${alpha})`
}

export function getHighlightHex(color: string): string {
  const normalized = (color || 'yellow').toLowerCase().trim()
  const matched = HIGHLIGHT_COLOR_PRESETS.find((p) => p.id === normalized)
  if (matched) return matched.hex
  if (normalized.startsWith('#')) return normalized
  return '#FACC15'
}

const STORAGE_KEY_COLOR = 'saulado-highlight-color'
const STORAGE_KEY_CUSTOM_HEX = 'saulado-highlight-custom-hex'

interface HighlightPreferencesState {
  highlightColor: string
  customHex: string
  hydrated: boolean
  setHighlightColor: (color: string) => void
  setCustomHex: (hex: string) => void
}

export const useHighlightPreferencesStore = create<HighlightPreferencesState>((set) => ({
  highlightColor: 'yellow',
  customHex: '#3B82F6',
  hydrated: false,

  setHighlightColor: (color) => {
    set({ highlightColor: color })
    AsyncStorage.setItem(STORAGE_KEY_COLOR, color).catch((err) => {
      console.warn('[highlight-preferences] failed to save color:', err)
    })
  },

  setCustomHex: (hex) => {
    set({ customHex: hex, highlightColor: hex })
    AsyncStorage.setItem(STORAGE_KEY_CUSTOM_HEX, hex).catch(() => {})
    AsyncStorage.setItem(STORAGE_KEY_COLOR, hex).catch(() => {})
  },
}))

// Eager hydration on module import
void (async () => {
  try {
    const [savedColor, savedCustomHex] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEY_COLOR),
      AsyncStorage.getItem(STORAGE_KEY_CUSTOM_HEX),
    ])

    useHighlightPreferencesStore.setState({
      highlightColor: savedColor || 'yellow',
      customHex: savedCustomHex || '#3B82F6',
      hydrated: true,
    })
  } catch {
    useHighlightPreferencesStore.setState({ hydrated: true })
  }
})()
