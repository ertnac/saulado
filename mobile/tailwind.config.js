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
        // Saulado Mobile Design System Palette
        'deep-forest': '#052E24',
        forest: '#317054',
        sage: '#6B9985',
        'soft-sage': '#A6C2B5',
        ink: '#111A17',
        'surface-mint': '#E8F3EE',
        'surface-alt': '#EBEEE9',
        'surface-soft': '#EEF2EE',
        'surface-canvas': '#FAFBF9',
      },
      fontFamily: {
        outfit: ['Outfit', 'System', 'sans-serif'],
        'outfit-semibold': ['Outfit-SemiBold', 'System', 'sans-serif'],
        'outfit-bold': ['Outfit-Bold', 'System', 'sans-serif'],
        manrope: ['Manrope', 'System', 'sans-serif'],
        'manrope-medium': ['Manrope-Medium', 'System', 'sans-serif'],
        'manrope-semibold': ['Manrope-SemiBold', 'System', 'sans-serif'],
        'manrope-bold': ['Manrope-Bold', 'System', 'sans-serif'],
      },
      fontSize: {
        '3xs': ['10px', '13px'],
        '2xs': ['11px', '14px'],
        xs: ['12px', '16px'],
        'sm-tight': ['13px', '17px'],
        sm: ['14px', '19px'],
        base: ['15px', '21px'],
        md: ['16px', '22px'],
        lg: ['18px', '24px'],
        xl: ['20px', '26px'],
        '2xl': ['22px', '28px'],
        '3xl': ['24px', '30px'],
        '4xl': ['32px', '38px'],
        '5xl': ['34px', '40px'],
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
        card: 18,
        xl: 24,
        '2xl': 32,
      },
    },
  },
  plugins: [],
}
