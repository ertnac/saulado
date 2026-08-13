import type { Config } from 'tailwindcss'

/**
 * The theme is entirely CSS variables (see `src/index.css`), and every colour
 * below is a reference rather than a value. That is what lets dark mode be a
 * class on `<html>` instead of a second set of utilities on every element.
 */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        border: 'hsl(var(--border))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        surface: {
          DEFAULT: 'hsl(var(--surface))',
          muted: 'hsl(var(--surface-muted))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
          // The AA-safe variant, for accent-coloured *text* rather than fills.
          strong: 'hsl(var(--accent-strong))',
        },
        sand: {
          DEFAULT: 'hsl(var(--sand))',
          foreground: 'hsl(var(--sand-foreground))',
        },
        info: 'hsl(var(--info))',
        success: 'hsl(var(--success))',
        warning: 'hsl(var(--warning))',
        danger: 'hsl(var(--danger))',
        highlight: {
          DEFAULT: 'hsl(var(--highlight))',
          foreground: 'hsl(var(--highlight-foreground))',
        },
      },
      /**
       * `lg` is the card radius and the scale steps down from it, so a nested
       * well inside a card is visibly tighter than its parent rather than
       * concentric with it. `md` — the most-used step in the app — lands at
       * 12px.
       */
      borderRadius: {
        sm: 'calc(var(--radius) - 0.5rem)',
        md: 'calc(var(--radius) - 0.25rem)',
        lg: 'var(--radius)',
        xl: 'calc(var(--radius) + 0.5rem)',
        '2xl': 'calc(var(--radius) + 1rem)',
      },
      boxShadow: {
        soft: 'var(--shadow-soft)',
        // For things that float above the page: dialogs, the palette, popovers.
        lift: 'var(--shadow-lift)',
      },
      backgroundImage: {
        wash: 'var(--wash)',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
      },
      animation: {
        shimmer: 'shimmer 2s infinite linear',
      },
    },
  },
  plugins: [],
} satisfies Config
