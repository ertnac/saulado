/**
 * Tailwind, sharing the web app's token names.
 *
 * Every colour is a reference to a variable in `global.css`, never a literal —
 * the same arrangement as `frontend/tailwind.config.ts`, and for the same
 * reason. It is what lets dark mode be a class the runtime toggles rather than
 * a second set of utilities on every element, and it keeps one definition of
 * "surface" instead of two that drift apart.
 *
 * `darkMode: 'class'` is required, not stylistic. It is what tells NativeWind
 * to key the `dark:` variant and the `.dark:root` variable block off a class it
 * controls, which is what `colorScheme.set()` sets. Left at the default
 * (`media`), the app would follow the OS appearance and the in-app theme
 * setting would do nothing.
 */
module.exports = {
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
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
       * The web scale, resolved. It is `calc(var(--radius) ± n)` there so a
       * single variable moves the whole set; here the arithmetic is done
       * because the radius is one fixed scale that never changes between
       * themes, and a variable that only ever holds one value is a lookup with
       * nothing on the other end. `lg` is the card radius and the scale steps
       * down from it, so a nested well inside a card is visibly tighter than
       * its parent rather than concentric with it.
       */
      borderRadius: {
        sm: 8,
        md: 12,
        lg: 16,
        xl: 24,
        '2xl': 32,
      },
    },
  },
  plugins: [],
}
