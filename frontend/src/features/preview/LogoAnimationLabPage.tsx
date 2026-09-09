import { useState, useId, useEffect, type ReactElement } from 'react'
import { Link } from 'react-router-dom'
import {
  SauladoLogo,
  SauladoIcon,
  SauladoLoader,
  type StarAnimation,
} from '@/components/ui/saulado-logo'
import { CheckIcon } from '@/components/ui/icons'

// Animation category definitions
export type AnimationCategory = 'star' | 'mobile' | 'neural'

export interface AnimationDefinition {
  id: string
  name: string
  category: AnimationCategory
  tag: string
  description: string
  baseStarProp?: StarAnimation
  cssClass: string
  keyframesCss: (id: string, speedMultiplier: number) => string
}

export const ANIMATION_PRESETS: AnimationDefinition[] = [
  // ── Standard Web Star Animations ──
  {
    id: 'loading',
    name: 'Synaptic Loading',
    category: 'star',
    tag: 'Web Native',
    description: 'Rhythmic golden beacon pulse with high-energy flare. Default study loader.',
    baseStarProp: 'loading',
    cssClass: 'anim-loading',
    keyframesCss: (id, speed) => `
      #${id} [data-name="Star"], #${id} [id*="star"] {
        transform-origin: 247.45px 241.47px;
        animation: lab-star-loading-${id} ${1.5 / speed}s cubic-bezier(0.4, 0, 0.2, 1) infinite;
      }
      @keyframes lab-star-loading-${id} {
        0%, 100% { transform: scale(0.95); filter: drop-shadow(0 0 4px rgba(254, 201, 91, 0.35)); opacity: 0.88; }
        25% { transform: scale(1.10); filter: drop-shadow(0 0 16px rgba(254, 201, 91, 1)) drop-shadow(0 0 32px rgba(245, 158, 11, 0.85)); opacity: 1; }
        45% { transform: scale(1.0); filter: drop-shadow(0 0 8px rgba(254, 201, 91, 0.5)); opacity: 0.92; }
        65% { transform: scale(1.15); filter: drop-shadow(0 0 24px rgba(254, 201, 91, 1)) drop-shadow(0 0 45px rgba(245, 158, 11, 0.9)); opacity: 1; }
      }
    `,
  },
  {
    id: 'loading-spin',
    name: 'Gyroscopic Spinner',
    category: 'star',
    tag: 'Web Native',
    description: '360° spin with radiant aura flare. Ideal for active spinners and crunching.',
    baseStarProp: 'loading-spin',
    cssClass: 'anim-loading-spin',
    keyframesCss: (id, speed) => `
      #${id} [data-name="Star"], #${id} [id*="star"] {
        transform-origin: 247.45px 241.47px;
        animation: lab-star-spin-${id} ${1.6 / speed}s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite;
      }
      @keyframes lab-star-spin-${id} {
        0% { transform: rotate(0deg) scale(0.96); filter: drop-shadow(0 0 5px rgba(254, 201, 91, 0.4)); }
        50% { transform: rotate(180deg) scale(1.12); filter: drop-shadow(0 0 24px rgba(254, 201, 91, 1)) drop-shadow(0 0 42px rgba(245, 158, 11, 0.85)); }
        100% { transform: rotate(360deg) scale(0.96); filter: drop-shadow(0 0 5px rgba(254, 201, 91, 0.4)); }
      }
    `,
  },
  {
    id: 'glow',
    name: 'Subtle Luminescence',
    category: 'star',
    tag: 'Web Native',
    description: 'Smooth atmospheric golden shimmer. Gentle ambient presence on idle state.',
    baseStarProp: 'glow',
    cssClass: 'anim-glow',
    keyframesCss: (id, speed) => `
      #${id} [data-name="Star"], #${id} [id*="star"] {
        transform-origin: 247.45px 241.47px;
        animation: lab-star-glow-${id} ${2.4 / speed}s ease-in-out infinite;
      }
      @keyframes lab-star-glow-${id} {
        0%, 100% { filter: drop-shadow(0 0 4px rgba(254, 201, 91, 0.35)) drop-shadow(0 0 10px rgba(224, 135, 32, 0.2)); opacity: 0.92; }
        50% { filter: drop-shadow(0 0 18px rgba(254, 201, 91, 0.95)) drop-shadow(0 0 32px rgba(245, 158, 11, 0.75)); opacity: 1; }
      }
    `,
  },
  {
    id: 'bounce-spin',
    name: 'Levitating Orbit',
    category: 'star',
    tag: 'Web Native',
    description: 'Vertical bouncy levitation with 360° spin. Playful celebration mode.',
    baseStarProp: 'bounce-spin',
    cssClass: 'anim-bounce-spin',
    keyframesCss: (id, speed) => `
      #${id} [data-name="Star"], #${id} [id*="star"] {
        transform-origin: 247.45px 241.47px;
        animation: lab-star-bouncespin-${id} ${2.2 / speed}s ease-in-out infinite;
      }
      @keyframes lab-star-bouncespin-${id} {
        0%, 100% { transform: translateY(0px) rotate(0deg) scale(1); }
        25% { transform: translateY(-16px) rotate(90deg) scale(1.05); }
        50% { transform: translateY(0px) rotate(180deg) scale(1); }
        75% { transform: translateY(-10px) rotate(270deg) scale(1.03); }
      }
    `,
  },
  {
    id: 'coin-flip',
    name: '3D Token Flip',
    category: 'star',
    tag: 'Web Native',
    description: '3D horizontal axis rotation mimicking a spinning gold medal or coin.',
    baseStarProp: 'coin-flip',
    cssClass: 'anim-coin-flip',
    keyframesCss: (id, speed) => `
      #${id} [data-name="Star"], #${id} [id*="star"] {
        transform-origin: 247.45px 241.47px;
        animation: lab-star-coin-${id} ${2.0 / speed}s ease-in-out infinite;
      }
      @keyframes lab-star-coin-${id} {
        0%, 100% { transform: translateY(0px) scaleX(1); }
        25% { transform: translateY(-16px) scaleX(0.08); }
        50% { transform: translateY(0px) scaleX(-1); }
        75% { transform: translateY(-8px) scaleX(0.08); }
      }
    `,
  },

  // ── Mobile Parity Animations (Ported from React Native Reanimated) ──
  {
    id: 'mobile-star-gyro',
    name: 'Mobile Star Gyro',
    category: 'mobile',
    tag: 'Mobile Parity',
    description:
      'Recreation of mobile/components/saulado-logo.tsx Star Gyro: continuous smooth rotation with blooming golden flare.',
    cssClass: 'anim-mobile-gyro',
    keyframesCss: (id, speed) => `
      #${id} [data-name="Star"], #${id} [id*="star"] {
        transform-origin: 247.45px 241.47px;
        animation: lab-mobile-gyro-${id} ${2.4 / speed}s linear infinite;
      }
      @keyframes lab-mobile-gyro-${id} {
        0% {
          transform: rotate(0deg) scale(1);
          filter: drop-shadow(0 0 6px rgba(254, 201, 91, 0.4)) drop-shadow(0 0 12px rgba(251, 183, 69, 0.2));
        }
        25% {
          transform: rotate(90deg) scale(1.08);
          filter: drop-shadow(0 0 20px rgba(254, 201, 91, 0.9)) drop-shadow(0 0 38px rgba(245, 158, 11, 0.7));
        }
        50% {
          transform: rotate(180deg) scale(1.02);
          filter: drop-shadow(0 0 12px rgba(254, 201, 91, 0.5)) drop-shadow(0 0 24px rgba(251, 183, 69, 0.3));
        }
        75% {
          transform: rotate(270deg) scale(1.12);
          filter: drop-shadow(0 0 26px rgba(254, 201, 91, 1)) drop-shadow(0 0 50px rgba(245, 158, 11, 0.85));
        }
        100% {
          transform: rotate(360deg) scale(1);
          filter: drop-shadow(0 0 6px rgba(254, 201, 91, 0.4)) drop-shadow(0 0 12px rgba(251, 183, 69, 0.2));
        }
      }
    `,
  },
  {
    id: 'mobile-pulse-aura',
    name: 'Mobile Pulse Aura',
    category: 'mobile',
    tag: 'Mobile Parity',
    description:
      'Recreation of mobile/components/saulado-logo.tsx Pulse Aura: rhythmic organic heartbeat pulse with radiating ambient luminescence ring.',
    cssClass: 'anim-mobile-pulse-aura',
    keyframesCss: (id, speed) => `
      #${id} svg {
        transform-origin: center center;
        animation: lab-mobile-heartbeat-${id} ${2.6 / speed}s cubic-bezier(0.4, 0, 0.2, 1) infinite;
      }
      #${id} [data-name="Star"], #${id} [id*="star"] {
        transform-origin: 247.45px 241.47px;
        animation: lab-mobile-star-throb-${id} ${2.6 / speed}s cubic-bezier(0.4, 0, 0.2, 1) infinite;
      }
      @keyframes lab-mobile-heartbeat-${id} {
        0%, 100% {
          transform: scale(1);
          filter: drop-shadow(0 4px 12px rgba(167, 207, 170, 0.15));
        }
        20% {
          transform: scale(1.04);
          filter: drop-shadow(0 12px 36px rgba(74, 222, 128, 0.45)) drop-shadow(0 0 20px rgba(254, 201, 91, 0.3));
        }
        35% {
          transform: scale(0.99);
        }
        50% {
          transform: scale(1.025);
          filter: drop-shadow(0 8px 24px rgba(74, 222, 128, 0.35));
        }
        70% {
          transform: scale(1);
        }
      }
      @keyframes lab-mobile-star-throb-${id} {
        0%, 100% {
          transform: scale(1);
          filter: drop-shadow(0 0 4px rgba(254, 201, 91, 0.3));
        }
        20% {
          transform: scale(1.15);
          filter: drop-shadow(0 0 26px rgba(254, 201, 91, 1)) drop-shadow(0 0 48px rgba(245, 158, 11, 0.8));
        }
        50% {
          transform: scale(1.06);
          filter: drop-shadow(0 0 14px rgba(254, 201, 91, 0.6));
        }
      }
    `,
  },

  // ── Innovative / Experimental Logo Animations ──
  {
    id: 'neural-synapse',
    name: 'Neural Synapse Ripple',
    category: 'neural',
    tag: 'Experimental',
    description:
      'Electric neural impulse ripples across the brain hemisphere contours with synchronized star activation.',
    cssClass: 'anim-neural-synapse',
    keyframesCss: (id, speed) => `
      #${id} [data-name="Star"], #${id} [id*="star"] {
        transform-origin: 247.45px 241.47px;
        animation: lab-neural-star-${id} ${2.0 / speed}s cubic-bezier(0.2, 0.8, 0.2, 1) infinite;
      }
      #${id} g[id="Brain"], #${id} g:not([id*="star"]):not([data-name="Star"]) {
        animation: lab-neural-brain-${id} ${2.0 / speed}s ease-in-out infinite;
      }
      @keyframes lab-neural-star-${id} {
        0%, 100% { transform: scale(1); filter: drop-shadow(0 0 4px rgba(254, 201, 91, 0.3)); }
        15% { transform: scale(1.22); filter: drop-shadow(0 0 35px rgba(254, 201, 91, 1)) drop-shadow(0 0 65px rgba(255, 240, 150, 0.9)); }
        35% { transform: scale(1.05); filter: drop-shadow(0 0 12px rgba(254, 201, 91, 0.6)); }
      }
      @keyframes lab-neural-brain-${id} {
        0%, 100% { filter: brightness(1) drop-shadow(0 0 0px transparent); }
        18% { filter: brightness(1.35) drop-shadow(0 0 24px rgba(135, 183, 143, 0.85)); }
        40% { filter: brightness(1.08) drop-shadow(0 0 10px rgba(135, 183, 143, 0.35)); }
      }
    `,
  },
  {
    id: 'celestial-orbit',
    name: 'Celestial Orbit',
    category: 'neural',
    tag: 'Experimental',
    description:
      'Elliptical planetary orbital motion with dynamic focal depth and lighting reflections.',
    cssClass: 'anim-celestial-orbit',
    keyframesCss: (id, speed) => `
      #${id} [data-name="Star"], #${id} [id*="star"] {
        transform-origin: 247.45px 241.47px;
        animation: lab-celestial-${id} ${3.0 / speed}s ease-in-out infinite;
      }
      @keyframes lab-celestial-${id} {
        0% { transform: translate(0px, 0px) scale(1) rotate(0deg); filter: drop-shadow(0 0 6px rgba(254, 201, 91, 0.4)); }
        25% { transform: translate(14px, -12px) scale(1.12) rotate(45deg); filter: drop-shadow(0 0 22px rgba(254, 201, 91, 0.95)) drop-shadow(4px -4px 15px rgba(245, 158, 11, 0.8)); }
        50% { transform: translate(0px, -20px) scale(1.18) rotate(90deg); filter: drop-shadow(0 0 32px rgba(254, 201, 91, 1)); }
        75% { transform: translate(-14px, -12px) scale(1.10) rotate(135deg); filter: drop-shadow(0 0 18px rgba(254, 201, 91, 0.8)); }
        100% { transform: translate(0px, 0px) scale(1) rotate(180deg); filter: drop-shadow(0 0 6px rgba(254, 201, 91, 0.4)); }
      }
    `,
  },
  {
    id: 'golden-shimmer',
    name: 'Liquid Gold Shimmer',
    category: 'neural',
    tag: 'Experimental',
    description: 'Specular light wave cascading diagonally across the entire vector geometry.',
    cssClass: 'anim-golden-shimmer',
    keyframesCss: (id, speed) => `
      #${id} svg {
        animation: lab-shimmer-sweep-${id} ${3.2 / speed}s ease-in-out infinite;
      }
      #${id} [data-name="Star"], #${id} [id*="star"] {
        transform-origin: 247.45px 241.47px;
        animation: lab-shimmer-star-${id} ${3.2 / speed}s ease-in-out infinite;
      }
      @keyframes lab-shimmer-sweep-${id} {
        0%, 100% { filter: contrast(1) brightness(1); }
        30% { filter: contrast(1.15) brightness(1.3) drop-shadow(0 0 24px rgba(254, 201, 91, 0.6)); }
        60% { filter: contrast(1.05) brightness(1.05); }
      }
      @keyframes lab-shimmer-star-${id} {
        0%, 100% { transform: scale(1); filter: drop-shadow(0 0 4px rgba(254, 201, 91, 0.3)); }
        30% { transform: scale(1.14); filter: drop-shadow(0 0 30px rgba(254, 201, 91, 1)) drop-shadow(0 0 55px rgba(255, 215, 0, 0.9)); }
        60% { transform: scale(1.02); filter: drop-shadow(0 0 10px rgba(254, 201, 91, 0.5)); }
      }
    `,
  },
  {
    id: 'breathing-zen',
    name: 'Zen Calming Breath',
    category: 'neural',
    tag: 'Experimental',
    description:
      'Meditative 4-second organic inhalation and exhalation rhythm. Zero cognitive strain.',
    cssClass: 'anim-breathing-zen',
    keyframesCss: (id, speed) => `
      #${id} svg {
        transform-origin: center center;
        animation: lab-zen-breathe-${id} ${4.2 / speed}s ease-in-out infinite;
      }
      #${id} [data-name="Star"], #${id} [id*="star"] {
        transform-origin: 247.45px 241.47px;
        animation: lab-zen-star-${id} ${4.2 / speed}s ease-in-out infinite;
      }
      @keyframes lab-zen-breathe-${id} {
        0%, 100% { transform: scale(1); filter: drop-shadow(0 4px 16px rgba(11, 61, 48, 0.3)); }
        50% { transform: scale(1.035); filter: drop-shadow(0 8px 32px rgba(135, 183, 143, 0.55)); }
      }
      @keyframes lab-zen-star-${id} {
        0%, 100% { filter: drop-shadow(0 0 6px rgba(254, 201, 91, 0.4)); opacity: 0.9; }
        50% { filter: drop-shadow(0 0 20px rgba(254, 201, 91, 0.85)) drop-shadow(0 0 36px rgba(245, 158, 11, 0.6)); opacity: 1; }
      }
    `,
  },
]

type BgScheme = 'forest' | 'midnight' | 'emerald' | 'slate' | 'white' | 'mint' | 'checker'

const BG_CONFIG: Record<
  BgScheme,
  { label: string; bgClass: string; textClass: string; borderClass: string }
> = {
  forest: {
    label: 'Saulado Forest',
    bgClass: 'bg-[#072d24]',
    textClass: 'text-white',
    borderClass: 'border-emerald-800/40',
  },
  midnight: {
    label: 'Deep Midnight',
    bgClass: 'bg-[#03140f]',
    textClass: 'text-white',
    borderClass: 'border-emerald-950/60',
  },
  emerald: {
    label: 'Emerald Studio',
    bgClass: 'bg-[#0b3d30]',
    textClass: 'text-emerald-50',
    borderClass: 'border-emerald-700/50',
  },
  slate: {
    label: 'Studio Slate',
    bgClass: 'bg-slate-900',
    textClass: 'text-slate-100',
    borderClass: 'border-slate-800',
  },
  mint: {
    label: 'Mint Cream',
    bgClass: 'bg-[#f2faf5]',
    textClass: 'text-[#072d24]',
    borderClass: 'border-emerald-200/80',
  },
  white: {
    label: 'Pure White',
    bgClass: 'bg-white',
    textClass: 'text-gray-900',
    borderClass: 'border-gray-200',
  },
  checker: {
    label: 'Transparency Grid',
    bgClass:
      'bg-[linear-gradient(45deg,#e2e8f0_25%,transparent_25%),linear-gradient(-45deg,#e2e8f0_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#e2e8f0_75%),linear-gradient(-45deg,transparent_75%,#e2e8f0_75%)] bg-[size:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0]',
    textClass: 'text-gray-900',
    borderClass: 'border-gray-300',
  },
}

// ── Goodnotes Splash Themes ──
export type SplashTheme = 'forest' | 'midnight' | 'cyan' | 'mint'

const SPLASH_THEMES: Record<
  SplashTheme,
  { label: string; bg: string; text: string; buttonBg: string; buttonText: string; accent: string }
> = {
  forest: {
    label: 'Saulado Mobile Forest (Brand Signature)',
    bg: '#052e24',
    text: '#FFFFFF',
    buttonBg: '#059669',
    buttonText: '#FFFFFF',
    accent: '#FEC95B',
  },
  midnight: {
    label: 'Deep Midnight (Sleek Dark)',
    bg: '#03140F',
    text: '#FFFFFF',
    buttonBg: '#059669',
    buttonText: '#FFFFFF',
    accent: '#34D399',
  },
  cyan: {
    label: 'Goodnotes Cyan (Ripplix Original)',
    bg: '#31B5D6',
    text: '#0B1B3D',
    buttonBg: '#1C8FE3',
    buttonText: '#FFFFFF',
    accent: '#1C8FE3',
  },
  mint: {
    label: 'Light Study Mint',
    bg: '#E2F3EB',
    text: '#072D24',
    buttonBg: '#0F766E',
    buttonText: '#FFFFFF',
    accent: '#0F766E',
  },
}

const DEFAULT_PRESET: AnimationDefinition = ANIMATION_PRESETS[0]!

// ── Mobile Auth Screen Icons (Ported from mobile/components/icons.tsx) ──
function FormMailIcon({ className = 'w-4 h-4' }: { className?: string }): ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 7.5V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7.5" />
      <path d="M3 6l9 6 9-6" />
      <path d="M5 6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2" />
    </svg>
  )
}

function FormLockIcon({ className = 'w-4 h-4' }: { className?: string }): ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z" />
      <path d="M17 11V7a5 5 0 0 0-10 0v4" />
    </svg>
  )
}

function FormEyeIcon({ className = 'w-4 h-4' }: { className?: string }): ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
    </svg>
  )
}

function FormEyeOffIcon({ className = 'w-4 h-4' }: { className?: string }): ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <path d="m2 2 20 20" />
    </svg>
  )
}

function FormGoogleIcon({ size = 20 }: { size?: number }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="shrink-0">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}

/**
 * Interactive Goodnotes Onboarding Splash Animation Component.
 * Faithfully mirrors the sequence from:
 * https://www.ripplix.com/library/onboarding-splash-goodnotes-productivity-tools-mobile-app
 * Seamlessly transitions into the mobile auth form (from mobile/components/auth-sliding-screen.tsx).
 */
function GoodnotesSplashSimulator({
  speed = 0.5,
  theme = 'forest',
  isManual = false,
  manualStep = 0,
  onStepChange,
}: {
  speed: number
  theme: SplashTheme
  isManual?: boolean
  manualStep?: number
  onStepChange?: (step: number) => void
}): ReactElement {
  const currentTheme = SPLASH_THEMES[theme]

  // Sequence phase: 0: initial, 1: logo-pop, 2: stroke-draw, 3: shift-wordmark, 4: hold-pulse, 5: mobile-login-form
  const [phase, setPhase] = useState<number>(0)
  const [replayKey, setReplayKey] = useState<number>(0)

  // Mobile Auth Sliding Screen States
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login')
  const [loginEmail, setLoginEmail] = useState('alex@student.edu')
  const [loginPassword, setLoginPassword] = useState('password123')
  const [showLoginPassword, setShowLoginPassword] = useState(false)
  const [loginSubmitting, setLoginSubmitting] = useState(false)

  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regConfirmPassword, setRegConfirmPassword] = useState('')
  const [showRegPassword, setShowRegPassword] = useState(false)
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false)
  const [regSubmitting, setRegSubmitting] = useState(false)

  useEffect(() => {
    if (isManual) {
      setPhase(manualStep)
      return
    }

    // Automated choreographed sequence
    setPhase(0)
    const baseDuration = 1000 / speed

    const t1 = setTimeout(() => setPhase(1), 150)
    const t2 = setTimeout(() => setPhase(2), 150 + baseDuration * 0.7)
    const t3 = setTimeout(() => setPhase(3), 150 + baseDuration * 1.8)
    const t4 = setTimeout(() => setPhase(4), 150 + baseDuration * 2.8)
    const t5 = setTimeout(() => setPhase(5), 150 + baseDuration * 4.0)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      clearTimeout(t4)
      clearTimeout(t5)
    }
  }, [replayKey, speed, isManual, manualStep])

  const restart = () => {
    setReplayKey((k) => k + 1)
  }

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setLoginSubmitting(true)
    setTimeout(() => {
      setLoginSubmitting(false)
    }, 1200)
  }

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setRegSubmitting(true)
    setTimeout(() => {
      setRegSubmitting(false)
    }, 1200)
  }

  return (
    <div className="flex flex-col items-center">
      {/* ── Mockup Phone Device Container ── */}
      <div
        className="relative w-[350px] h-[720px] rounded-[50px] p-3.5 bg-[#0a1512] border-4 border-slate-700/80 shadow-[0_25px_70px_rgba(0,0,0,0.85)] ring-1 ring-white/15 overflow-hidden select-none"
        style={{
          boxShadow:
            '0 0 0 1px rgba(255,255,255,0.1), 0 30px 60px -12px rgba(0,0,0,0.85), 0 18px 36px -18px rgba(0,0,0,0.95)',
        }}
      >
        {/* Device Glare Reflection Effect */}
        <div
          aria-hidden="true"
          className="absolute inset-0 rounded-[46px] pointer-events-none z-40 bg-gradient-to-tr from-transparent via-white/[0.03] to-transparent"
        />

        {/* Dynamic Island / Speaker Pill */}
        <div className="absolute top-5 left-1/2 -translate-x-1/2 w-28 h-6 bg-black rounded-full z-50 flex items-center justify-between px-2.5 shadow-inner">
          <div className="w-2.5 h-2.5 rounded-full bg-slate-900 border border-slate-800" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-950/40 border border-emerald-900/60" />
        </div>

        {/* ── Screen Viewport ── */}
        <div
          className="relative w-full h-full rounded-[42px] overflow-hidden flex flex-col transition-colors duration-500"
          style={{ backgroundColor: currentTheme.bg }}
        >
          {/* iOS Status Bar */}
          <div className="relative z-30 pt-3 px-6 flex items-center justify-between text-xs font-semibold shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="px-2 py-0.5 rounded-full bg-[#EA4335] text-white text-[11px] font-mono tracking-tight font-bold shadow-sm">
                10:48
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-white/90">
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                <path d="M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L12 22l7.03-4.39C20.26 16.07 21 14.12 21 12c0-4.97-4.03-9-9-9z" />
              </svg>
              <span className="text-[10px] font-mono">5G</span>
              <div className="w-5 h-2.5 border border-white/80 rounded-sm p-0.5 flex items-center">
                <div className="w-full h-full bg-white rounded-2xs" />
              </div>
            </div>
          </div>

          {/* ── Splash Logo Arena (Phase 0 - 4) ── */}
          <div
            className={`absolute inset-0 z-20 flex items-center justify-center pointer-events-none transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              phase >= 5
                ? 'opacity-0 scale-90 -translate-y-28'
                : 'opacity-100 scale-100 translate-y-0'
            }`}
          >
            {/* Lockup wrapper: 120px x 120px with logo visibly sliding to the left to place Saulado name beside it */}
            <div
              className={`relative w-[120px] h-[120px] flex items-center justify-center transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                phase === 0 ? 'opacity-0' : 'opacity-100'
              }`}
            >
              {/* Logo Mark (slides from center X=0 to left X=-60px in phase >= 3) */}
              <div
                className={`w-[120px] h-[120px] flex items-center justify-center transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                  phase >= 3 ? '-translate-x-[60px]' : 'translate-x-0'
                }`}
              >
                <SauladoLogo size={120} starAnimation={phase >= 2 ? 'loading-spin' : 'none'} />
              </div>

              {/* Saulado name (positioned on the right side of the sliding logo) */}
              <div
                className={`absolute left-[128px] top-0 bottom-0 flex items-center whitespace-nowrap transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] select-none ${
                  phase >= 3
                    ? 'opacity-100 -translate-x-[60px]'
                    : 'opacity-0 translate-x-[-44px] pointer-events-none'
                }`}
              >
                <span className="text-3xl font-black tracking-tight font-sora text-white drop-shadow-md">
                  Saulado
                </span>
              </div>
            </div>
          </div>

          {/* ── Mobile Login & Sign Up Screen (Phase >= 5) ── */}
          {/* Matches mobile/components/auth-sliding-screen.tsx 1:1 */}
          <div
            className={`relative z-10 flex-1 flex flex-col justify-between overflow-hidden transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              phase >= 5
                ? 'opacity-100 translate-y-0 pointer-events-auto'
                : 'opacity-0 translate-y-16 pointer-events-none'
            }`}
          >
            {/* Header Area with Large Saulado Logo & Animated Text */}
            <div className="w-full flex flex-col items-center justify-center px-6 pt-3 pb-4 shrink-0">
              <SauladoLogo size={78} starAnimation="glow" />
              <h1 className="text-2xl font-bold text-white text-center mt-1.5 tracking-tight">
                Saulado
              </h1>
              <p className="mt-0.5 text-xs text-white/80 text-center max-w-[260px] leading-snug">
                Learn in context. Remember for life.
              </p>
            </div>

            {/* Bottom Sheet Container (rounded-t-[32px] bg-background) */}
            <div className="flex-1 bg-white dark:bg-[#041a14] rounded-t-[32px] px-5 pt-4 pb-2 shadow-2xl flex flex-col overflow-hidden text-slate-900 dark:text-slate-100 border-t border-white/20">
              {/* Segmented Tab Switcher with Animated Sliding Pill */}
              <div className="relative flex items-center rounded-full bg-slate-100 dark:bg-slate-800/90 p-1 mb-3 shrink-0">
                {/* Sliding indicator pill */}
                <div
                  className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full bg-white dark:bg-slate-700 shadow-sm transition-transform duration-300 ease-out"
                  style={{
                    transform: authTab === 'login' ? 'translateX(0%)' : 'translateX(100%)',
                  }}
                />

                <button
                  type="button"
                  onClick={() => setAuthTab('login')}
                  className={`flex-1 relative z-10 py-2 rounded-full text-xs font-semibold transition-colors text-center ${
                    authTab === 'login'
                      ? 'text-slate-900 dark:text-white font-bold'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                  }`}
                >
                  Log In
                </button>

                <button
                  type="button"
                  onClick={() => setAuthTab('register')}
                  className={`flex-1 relative z-10 py-2 rounded-full text-xs font-semibold transition-colors text-center ${
                    authTab === 'register'
                      ? 'text-slate-900 dark:text-white font-bold'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                  }`}
                >
                  Sign Up
                </button>
              </div>

              {/* Sliding Form Carousel Viewport */}
              <div className="relative w-full flex-1 overflow-y-auto overflow-x-hidden pr-0.5 custom-scrollbar">
                <div
                  className="flex w-[200%] transition-transform duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)]"
                  style={{
                    transform: authTab === 'login' ? 'translateX(0%)' : 'translateX(-50%)',
                  }}
                >
                  {/* ================= PAGE 1: LOG IN FORM ================= */}
                  <div className="w-1/2 pr-2">
                    <form onSubmit={handleLoginSubmit} className="space-y-3">
                      {/* Email Field */}
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1">
                          Email
                        </label>
                        <div className="h-11 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 px-3.5 flex items-center gap-2.5 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 transition-all">
                          <span className="text-slate-400 shrink-0">
                            <FormMailIcon />
                          </span>
                          <input
                            type="email"
                            value={loginEmail}
                            onChange={(e) => setLoginEmail(e.target.value)}
                            placeholder="Enter your email"
                            required
                            className="w-full text-xs bg-transparent outline-none text-slate-900 dark:text-white placeholder:text-slate-400"
                          />
                        </div>
                      </div>

                      {/* Password Field */}
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1">
                          Password
                        </label>
                        <div className="h-11 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 px-3.5 flex items-center gap-2.5 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 transition-all">
                          <span className="text-slate-400 shrink-0">
                            <FormLockIcon />
                          </span>
                          <input
                            type={showLoginPassword ? 'text' : 'password'}
                            value={loginPassword}
                            onChange={(e) => setLoginPassword(e.target.value)}
                            placeholder="Enter your password"
                            required
                            className="w-full text-xs bg-transparent outline-none text-slate-900 dark:text-white placeholder:text-slate-400"
                          />
                          <button
                            type="button"
                            onClick={() => setShowLoginPassword(!showLoginPassword)}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0 p-1"
                          >
                            {showLoginPassword ? <FormEyeOffIcon /> : <FormEyeIcon />}
                          </button>
                        </div>
                        <div className="flex justify-end mt-1.5">
                          <button
                            type="button"
                            onClick={() => alert('Demo: Forgot password modal')}
                            className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
                          >
                            Forgot Password?
                          </button>
                        </div>
                      </div>

                      {/* Log In Button (Rounded Full Emerald) */}
                      <button
                        type="submit"
                        disabled={loginSubmitting}
                        className="w-full py-3 rounded-full bg-[#059669] hover:bg-[#047857] active:scale-[0.98] text-white font-semibold text-xs tracking-wide transition-all shadow-md shadow-emerald-700/25 flex items-center justify-center gap-2"
                      >
                        {loginSubmitting ? (
                          <>
                            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span>Signing in…</span>
                          </>
                        ) : (
                          <span>Log In</span>
                        )}
                      </button>

                      {/* Divider */}
                      <div className="flex items-center my-2.5">
                        <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
                        <span className="px-3 text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                          Or continue with
                        </span>
                        <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
                      </div>

                      {/* Google Outline Button */}
                      <button
                        type="button"
                        onClick={() => alert('Demo: Google Sign In')}
                        className="w-full py-2.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 active:scale-[0.98] flex items-center justify-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200 shadow-sm transition-all"
                      >
                        <FormGoogleIcon size={18} />
                        <span>Google</span>
                      </button>

                      {/* Footer Switcher */}
                      <div className="pt-2 text-center">
                        <p className="text-[11px] text-slate-600 dark:text-slate-400">
                          Don't have an account?{' '}
                          <button
                            type="button"
                            onClick={() => setAuthTab('register')}
                            className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                          >
                            Create an account
                          </button>
                        </p>
                      </div>
                    </form>
                  </div>

                  {/* ================= PAGE 2: SIGN UP FORM ================= */}
                  <div className="w-1/2 pl-2">
                    <form onSubmit={handleRegisterSubmit} className="space-y-2.5">
                      {/* Email Field */}
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1">
                          Email
                        </label>
                        <div className="h-10 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 px-3.5 flex items-center gap-2.5 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 transition-all">
                          <span className="text-slate-400 shrink-0">
                            <FormMailIcon />
                          </span>
                          <input
                            type="email"
                            value={regEmail}
                            onChange={(e) => setRegEmail(e.target.value)}
                            placeholder="Enter your email"
                            required
                            className="w-full text-xs bg-transparent outline-none text-slate-900 dark:text-white placeholder:text-slate-400"
                          />
                        </div>
                      </div>

                      {/* Password Field */}
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1">
                          Password
                        </label>
                        <div className="h-10 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 px-3.5 flex items-center gap-2.5 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 transition-all">
                          <span className="text-slate-400 shrink-0">
                            <FormLockIcon />
                          </span>
                          <input
                            type={showRegPassword ? 'text' : 'password'}
                            value={regPassword}
                            onChange={(e) => setRegPassword(e.target.value)}
                            placeholder="Enter your password"
                            required
                            className="w-full text-xs bg-transparent outline-none text-slate-900 dark:text-white placeholder:text-slate-400"
                          />
                          <button
                            type="button"
                            onClick={() => setShowRegPassword(!showRegPassword)}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0 p-1"
                          >
                            {showRegPassword ? <FormEyeOffIcon /> : <FormEyeIcon />}
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-400 dark:text-slate-400 mt-1 leading-tight">
                          At least 8 characters. A memorable phrase beats a short, complicated one.
                        </p>
                      </div>

                      {/* Confirm Password Field */}
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1">
                          Confirm Password
                        </label>
                        <div className="h-10 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 px-3.5 flex items-center gap-2.5 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 transition-all">
                          <span className="text-slate-400 shrink-0">
                            <FormLockIcon />
                          </span>
                          <input
                            type={showRegConfirmPassword ? 'text' : 'password'}
                            value={regConfirmPassword}
                            onChange={(e) => setRegConfirmPassword(e.target.value)}
                            placeholder="Confirm your password"
                            required
                            className="w-full text-xs bg-transparent outline-none text-slate-900 dark:text-white placeholder:text-slate-400"
                          />
                          <button
                            type="button"
                            onClick={() => setShowRegConfirmPassword(!showRegConfirmPassword)}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0 p-1"
                          >
                            {showRegConfirmPassword ? <FormEyeOffIcon /> : <FormEyeIcon />}
                          </button>
                        </div>
                      </div>

                      {/* Create Account Button */}
                      <button
                        type="submit"
                        disabled={regSubmitting}
                        className="w-full py-3 rounded-full bg-[#059669] hover:bg-[#047857] active:scale-[0.98] text-white font-semibold text-xs tracking-wide transition-all shadow-md shadow-emerald-700/25 flex items-center justify-center gap-2 mt-1"
                      >
                        {regSubmitting ? (
                          <>
                            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span>Creating account…</span>
                          </>
                        ) : (
                          <span>Create Account</span>
                        )}
                      </button>

                      {/* Divider */}
                      <div className="flex items-center my-2">
                        <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
                        <span className="px-3 text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                          Or continue with
                        </span>
                        <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
                      </div>

                      {/* Google Button */}
                      <button
                        type="button"
                        onClick={() => alert('Demo: Google Sign In')}
                        className="w-full py-2 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 active:scale-[0.98] flex items-center justify-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200 shadow-sm transition-all"
                      >
                        <FormGoogleIcon size={18} />
                        <span>Google</span>
                      </button>

                      {/* Footer Switcher */}
                      <div className="pt-1.5 text-center">
                        <p className="text-[11px] text-slate-600 dark:text-slate-400">
                          Already have an account?{' '}
                          <button
                            type="button"
                            onClick={() => setAuthTab('login')}
                            className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                          >
                            Log In
                          </button>
                        </p>
                      </div>
                    </form>
                  </div>
                </div>
              </div>

              {/* iOS Home Indicator Bar */}
              <div className="pt-2 pb-1 flex justify-center pointer-events-none shrink-0">
                <div className="w-28 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Controls Toolbar for the Splash Simulator ── */}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-xs">
        <button
          type="button"
          onClick={restart}
          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-all shadow-md flex items-center gap-1.5"
        >
          <span>↺</span>
          <span>Replay Splash Sequence</span>
        </button>

        {onStepChange && (
          <div className="flex items-center gap-1 bg-emerald-950/60 border border-emerald-800/40 p-1 rounded-xl">
            <span className="px-2 text-slate-400 text-[11px]">Jump to:</span>
            {[
              { s: 1, label: 'Logo' },
              { s: 2, label: 'Stroke' },
              { s: 3, label: 'Shift' },
              { s: 4, label: 'Hold' },
              { s: 5, label: 'Login Form' },
            ].map((btn) => (
              <button
                key={btn.s}
                type="button"
                onClick={() => onStepChange(btn.s)}
                className={`px-2 py-1 rounded text-[10px] font-mono transition-colors ${
                  phase === btn.s
                    ? 'bg-amber-400 text-black font-bold'
                    : 'text-slate-300 hover:text-white hover:bg-emerald-900/50'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Temporary Testing Web Page for SVG Logo Animations & Goodnotes Splash.
 * Branch: feat/svg-logo-animations
 * Note: Will be deleted upon user approval as requested.
 */
export function LogoAnimationLabPage(): ReactElement {
  const pageInstanceId = useId().replace(/:/g, '')

  // Tab State: 'splash' (Goodnotes onboarding splash) vs 'studio' (logo animations matrix & stage)
  const [activeTab, setActiveTab] = useState<'splash' | 'studio'>('splash')

  // Splash Simulator Controls
  const [splashTheme, setSplashTheme] = useState<SplashTheme>('forest')
  const [splashSpeed, setSplashSpeed] = useState<number>(0.5)
  const [splashManual, setSplashManual] = useState<boolean>(false)
  const [splashStep, setSplashStep] = useState<number>(1)
  const [isFullscreenSplash, setIsFullscreenSplash] = useState<boolean>(false)

  // Studio State
  const [selectedId, setSelectedId] = useState<string>('loading')
  const [size, setSize] = useState<number>(220)
  const [speed, setSpeed] = useState<number>(1)
  const [bgScheme, setBgScheme] = useState<BgScheme>('forest')
  const [isPaused, setIsPaused] = useState<boolean>(false)
  const [activeCategory, setActiveCategory] = useState<AnimationCategory | 'all'>('all')
  const [showAuraRing, setShowAuraRing] = useState<boolean>(true)
  const [isolateLayer, setIsolateLayer] = useState<'all' | 'star' | 'brain'>('all')
  const [copied, setCopied] = useState<boolean>(false)
  const [showLoaderModal, setShowLoaderModal] = useState<boolean>(false)

  const activePreset: AnimationDefinition =
    ANIMATION_PRESETS.find((p) => p.id === selectedId) ?? DEFAULT_PRESET

  const filteredPresets =
    activeCategory === 'all'
      ? ANIMATION_PRESETS
      : ANIMATION_PRESETS.filter((p) => p.category === activeCategory)

  // Copy code snippet helper
  const handleCopyCode = () => {
    const codeSnippet = `// Implementation for "${activePreset.name}" preset:
<SauladoLogo
  size={${size}}
  ${activePreset.baseStarProp ? `starAnimation="${activePreset.baseStarProp}"` : `className="${activePreset.cssClass}"`}
/>`
    void navigator.clipboard
      .writeText(codeSnippet)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => {})
  }

  // Dynamic CSS injection for the hero stage animation
  const heroContainerId = `hero-stage-${pageInstanceId}`
  const heroDynamicCss = activePreset.keyframesCss(heroContainerId, speed)

  return (
    <div className="min-h-screen bg-[#04120e] text-slate-100 selection:bg-emerald-500 selection:text-white pb-24">
      {/* ── Temporary Test Lab Notice Banner ── */}
      <div className="border-b border-amber-500/30 bg-gradient-to-r from-amber-500/15 via-emerald-500/10 to-amber-500/15 px-4 py-2.5 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
              🧪 TEST LAB
            </span>
            <span className="font-medium text-amber-200">
              Temporary Testing Page for SVG Logo Animations &amp; Goodnotes Splash (Branch:{' '}
              <code className="px-1.5 py-0.5 bg-black/40 rounded text-amber-300 font-mono">
                feat/svg-logo-animations
              </code>
              )
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-slate-400 text-xs hidden md:inline">
              Will be removed upon approval
            </span>
            <Link
              to="/logo-preview"
              className="text-emerald-400 hover:text-emerald-300 font-medium underline underline-offset-2 transition-colors"
            >
              ← Standard Preview
            </Link>
            <Link to="/landing" className="text-slate-400 hover:text-white transition-colors">
              Landing Page
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {/* ── Header Title & Introduction ── */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
              <SauladoIcon size={26} starAnimation="loading" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-2">
                SVG Logo Animation Lab
                <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Interactive Test Bench
                </span>
              </h1>
              <p className="text-sm text-slate-400">
                Test and review the requested Goodnotes onboarding splash animation and SVG logo
                presets.
              </p>
            </div>
          </div>

          {/* Primary View Switcher Tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-[#081f18] border border-emerald-800/50">
            <button
              type="button"
              onClick={() => setActiveTab('splash')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === 'splash'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-black shadow-lg shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>📱</span>
              <span>Goodnotes Splash Onboarding</span>
              <span className="px-1.5 py-0.2 rounded bg-black/20 text-[10px] font-mono">NEW</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('studio')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === 'studio'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-black shadow-lg shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>🎛️</span>
              <span>Logo Animation Matrix &amp; Presets</span>
            </button>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* ── TAB 1: GOODNOTES-STYLE SPLASH ANIMATION ONBOARDING ── */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'splash' && (
          <div className="space-y-8 animate-in fade-in duration-300">
            {/* Top Info Callout */}
            <div className="bg-[#081f18] border border-emerald-800/40 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/40">
                    Ripplix Showcase Match
                  </span>
                  <span className="text-sm font-semibold text-white">
                    Goodnotes Mobile App Onboarding Splash Sequence
                  </span>
                </div>
                <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
                  Faithfully re-engineered for Saulado: <strong>1)</strong> Centered squircle badge
                  spring scale-in, <strong>2)</strong> Vector mark &amp; golden star spark assembly,{' '}
                  <strong>3)</strong> Leftward translation as "Saulado" wordmark sketches in,{' '}
                  <strong>4)</strong> Hold &amp; pulse, and <strong>5)</strong> Smooth bottom sheet
                  slide-up into active recall onboarding.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsFullscreenSplash(true)}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-md shadow-blue-600/20 flex items-center gap-2"
                >
                  <span>⛶</span>
                  <span>Launch Fullscreen Splash</span>
                </button>
              </div>
            </div>

            {/* Splash Simulator Layout: Phone Mockup & Controls Side-by-Side */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left Column: Device Mockup (7 cols) */}
              <div className="lg:col-span-7 flex justify-center">
                <GoodnotesSplashSimulator
                  speed={splashSpeed}
                  theme={splashTheme}
                  isManual={splashManual}
                  manualStep={splashStep}
                  onStepChange={(s) => {
                    setSplashManual(true)
                    setSplashStep(s)
                  }}
                />
              </div>

              {/* Right Column: Interactive Configuration Bench (5 cols) */}
              <div className="lg:col-span-5 flex flex-col gap-6 bg-[#081f18] border border-emerald-800/40 rounded-2xl p-6 shadow-xl">
                <h3 className="text-base font-semibold text-white flex items-center gap-2 border-b border-emerald-800/30 pb-3">
                  <span>⚙️</span> Splash Animation Controls
                </h3>

                {/* Theme Selector */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-300 block">
                    Background Color &amp; Palette Theme:
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    {(Object.keys(SPLASH_THEMES) as SplashTheme[]).map((tKey) => {
                      const item = SPLASH_THEMES[tKey]
                      return (
                        <button
                          key={tKey}
                          type="button"
                          onClick={() => setSplashTheme(tKey)}
                          className={`flex items-center justify-between p-2.5 rounded-xl border text-left transition-all ${
                            splashTheme === tKey
                              ? 'border-emerald-400 bg-emerald-900/40 shadow-sm ring-1 ring-emerald-500/30'
                              : 'border-emerald-950/80 bg-emerald-950/30 hover:border-emerald-700/50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div
                              className="w-5 h-5 rounded-full border border-white/20 shrink-0"
                              style={{ backgroundColor: item.bg }}
                            />
                            <span className="text-xs font-medium text-slate-200">{item.label}</span>
                          </div>
                          {splashTheme === tKey && (
                            <span className="text-emerald-400 text-xs font-bold">✓ Active</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Speed Multiplier */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <label className="font-medium text-slate-300">
                      Choreography Speed:{' '}
                      <span className="font-mono text-amber-400">{splashSpeed}x</span>
                    </label>
                    <span className="text-slate-500">Normal is 1x</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { s: 0.5, l: '0.5x (Slow-Mo)' },
                      { s: 0.75, l: '0.75x' },
                      { s: 1, l: '1.0x (Original)' },
                      { s: 1.5, l: '1.5x (Snappy)' },
                    ].map((btn) => (
                      <button
                        key={btn.s}
                        type="button"
                        onClick={() => {
                          setSplashManual(false)
                          setSplashSpeed(btn.s)
                        }}
                        className={`py-2 px-1 text-center rounded-xl text-xs font-mono transition-colors ${
                          splashSpeed === btn.s && !splashManual
                            ? 'bg-amber-400 text-black font-bold shadow-md'
                            : 'bg-emerald-950/60 text-slate-300 border border-emerald-800/40 hover:bg-emerald-900/60'
                        }`}
                      >
                        {btn.l}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Stepper Mode Scrubber */}
                <div className="space-y-2 pt-2 border-t border-emerald-800/30">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-slate-300 block">
                      Frame-by-Frame Inspector:
                    </label>
                    <button
                      type="button"
                      onClick={() => setSplashManual(!splashManual)}
                      className={`text-[11px] px-2.5 py-0.5 rounded font-semibold transition-colors ${
                        splashManual
                          ? 'bg-amber-500 text-black'
                          : 'bg-emerald-900/50 text-emerald-300 hover:bg-emerald-800/50'
                      }`}
                    >
                      {splashManual ? 'Manual Pause ON' : 'Auto Playback'}
                    </button>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[
                      { s: 1, label: '1. Logo' },
                      { s: 2, label: '2. Stroke' },
                      { s: 3, label: '3. Shift' },
                      { s: 4, label: '4. Hold' },
                      { s: 5, label: '5. Login Form' },
                    ].map((step) => (
                      <button
                        key={step.s}
                        type="button"
                        onClick={() => {
                          setSplashManual(true)
                          setSplashStep(step.s)
                        }}
                        className={`py-2 px-1 text-center rounded-lg text-[10px] font-medium transition-all ${
                          splashManual && splashStep === step.s
                            ? 'bg-emerald-400 text-black font-bold'
                            : 'bg-emerald-950/60 text-slate-300 border border-emerald-800/40 hover:bg-emerald-900/50'
                        }`}
                      >
                        {step.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sequence Breakdown Card */}
                <div className="bg-black/40 border border-emerald-950 rounded-xl p-4 space-y-2.5 text-xs">
                  <h4 className="font-semibold text-emerald-400 flex items-center gap-1.5">
                    <span>🎬</span> Sequence Breakdown
                  </h4>
                  <ul className="space-y-1.5 text-slate-400 text-[11px] leading-relaxed">
                    <li className="flex items-start gap-1.5">
                      <span className="text-amber-400 font-bold">0.0s – 0.6s:</span>
                      <span>
                        Logo mark springs into screen center with clean transparent backdrop.
                      </span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-amber-400 font-bold">0.6s – 1.6s:</span>
                      <span>
                        Brain vector contours assemble; golden star activates with radiant flare.
                      </span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-amber-400 font-bold">1.6s – 2.4s:</span>
                      <span>Logo translates left (-48px) while "Saulado" wordmark draws in.</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-amber-400 font-bold">2.4s – 3.2s:</span>
                      <span>Combined lockup rests centered with subtle golden luminescence.</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-amber-400 font-bold">3.2s+:</span>
                      <span>
                        Logo glides upward into header position as Login &amp; Sign Up forms
                        smoothly fade &amp; slide into view.
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Fullscreen Modal View */}
            {isFullscreenSplash && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-xl p-4">
                <button
                  type="button"
                  onClick={() => setIsFullscreenSplash(false)}
                  className="absolute top-6 right-6 px-4 py-2 rounded-xl text-xs font-semibold bg-white/15 hover:bg-white/25 text-white transition-all z-50"
                >
                  ✕ Close Fullscreen (ESC)
                </button>
                <div className="transform scale-100 sm:scale-110">
                  <GoodnotesSplashSimulator
                    speed={splashSpeed}
                    theme={splashTheme}
                    isManual={false}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* ── TAB 2: LOGO ANIMATION MATRIX & INTERACTIVE STAGE ── */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'studio' && (
          <div className="animate-in fade-in duration-300">
            {/* ── Interactive Main Stage & Control Panel ── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-12">
              {/* Left: Interactive Canvas Stage (7 cols) */}
              <div className="lg:col-span-7 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Active Animation Stage:{' '}
                    <span className="text-amber-400">{activePreset.name}</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsPaused(!isPaused)}
                      className={`text-xs px-3 py-1 rounded-md font-medium transition-all ${
                        isPaused
                          ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20'
                          : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 hover:bg-emerald-900/60'
                      }`}
                    >
                      {isPaused ? '▶ Resume Animation' : '⏸ Pause Animation'}
                    </button>
                  </div>
                </div>

                {/* Stage Canvas */}
                <div
                  className={`relative rounded-2xl border ${BG_CONFIG[bgScheme].borderClass} ${BG_CONFIG[bgScheme].bgClass} ${BG_CONFIG[bgScheme].textClass} min-h-[380px] sm:min-h-[440px] flex items-center justify-center p-8 transition-colors duration-300 overflow-hidden shadow-2xl`}
                >
                  {/* Optional Ambient Background Aura Ring */}
                  {showAuraRing && (
                    <div
                      aria-hidden="true"
                      className="absolute w-72 h-72 rounded-full bg-gradient-to-tr from-emerald-500/20 via-amber-400/20 to-emerald-400/15 blur-3xl pointer-events-none animate-pulse"
                    />
                  )}

                  {/* Dynamic Keyframes Injection */}
                  <style>{heroDynamicCss}</style>

                  {/* Logo Presentation Element */}
                  <div
                    id={heroContainerId}
                    className="relative z-10 flex items-center justify-center transition-all"
                    style={{
                      animationPlayState: isPaused ? 'paused' : 'running',
                    }}
                  >
                    {/* CSS rules for layer isolation */}
                    <style>{`
                      #${heroContainerId} svg * {
                        animation-play-state: ${isPaused ? 'paused' : 'running'} !important;
                      }
                      ${
                        isolateLayer === 'star'
                          ? `#${heroContainerId} [id="Brain"], #${heroContainerId} path:not([id*="Vector_14"]):not([id*="Vector_15"]) { opacity: 0.1 !important; }`
                          : ''
                      }
                      ${
                        isolateLayer === 'brain'
                          ? `#${heroContainerId} [data-name="Star"], #${heroContainerId} [id*="star"] { opacity: 0.1 !important; }`
                          : ''
                      }
                    `}</style>

                    <SauladoLogo
                      size={size}
                      starAnimation={activePreset.baseStarProp}
                      className="transition-all duration-200"
                    />
                  </div>

                  {/* Canvas Overlay Badge */}
                  <div className="absolute bottom-3 left-4 flex items-center gap-2 text-xs font-mono opacity-70">
                    <span className="px-2 py-0.5 rounded bg-black/40 backdrop-blur-sm border border-white/10 text-slate-300">
                      {size}px × {size}px
                    </span>
                    <span className="px-2 py-0.5 rounded bg-black/40 backdrop-blur-sm border border-white/10 text-emerald-300">
                      {speed}x speed
                    </span>
                  </div>
                </div>

                {/* Quick Presets for Canvas Size */}
                <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                  <span className="text-xs text-slate-400">Quick Size Presets:</span>
                  <div className="flex items-center gap-1.5">
                    {[48, 80, 120, 180, 240, 320, 420].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSize(s)}
                        className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
                          size === s
                            ? 'bg-emerald-500 text-black font-semibold'
                            : 'bg-emerald-950/60 text-slate-300 border border-emerald-800/40 hover:bg-emerald-900/60'
                        }`}
                      >
                        {s}px
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right: Stage Control Panel (5 cols) */}
              <div className="lg:col-span-5 flex flex-col gap-6 bg-[#081f18] border border-emerald-800/40 rounded-2xl p-6 shadow-xl">
                <h3 className="text-base font-semibold text-white flex items-center gap-2 border-b border-emerald-800/30 pb-3">
                  <span>🎛️</span> Stage Parameters &amp; Controls
                </h3>

                {/* Size Slider */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <label htmlFor="size-range" className="font-medium text-slate-300">
                      Logo Size: <span className="font-mono text-emerald-400">{size}px</span>
                    </label>
                    <span className="text-slate-500">Range: 32px – 480px</span>
                  </div>
                  <input
                    id="size-range"
                    type="range"
                    min={32}
                    max={480}
                    step={8}
                    value={size}
                    onChange={(e) => setSize(Number(e.target.value))}
                    className="w-full accent-emerald-400 bg-emerald-950/80 rounded-lg cursor-pointer h-2"
                  />
                </div>

                {/* Speed Multiplier */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <label className="font-medium text-slate-300">
                      Animation Speed Multiplier:{' '}
                      <span className="font-mono text-amber-400">{speed}x</span>
                    </label>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[0.5, 0.75, 1, 1.5, 2].map((sp) => (
                      <button
                        key={sp}
                        type="button"
                        onClick={() => setSpeed(sp)}
                        className={`py-1.5 rounded text-xs font-mono transition-colors ${
                          speed === sp
                            ? 'bg-amber-500 text-black font-semibold shadow-md'
                            : 'bg-emerald-950/60 text-slate-300 border border-emerald-800/40 hover:bg-emerald-900/60'
                        }`}
                      >
                        {sp}x
                      </button>
                    ))}
                  </div>
                </div>

                {/* Background Color Switcher */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-300 block">
                    Stage Background Backdrop:
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(Object.keys(BG_CONFIG) as BgScheme[]).map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setBgScheme(key)}
                        className={`flex items-center gap-2 p-2 rounded-lg border text-left transition-all ${
                          bgScheme === key
                            ? 'border-emerald-400 bg-emerald-900/50 shadow-sm'
                            : 'border-emerald-900/60 bg-emerald-950/30 hover:border-emerald-700/50'
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded-full border border-white/20 shrink-0 ${BG_CONFIG[key].bgClass}`}
                        />
                        <span className="text-xs text-slate-200 truncate">
                          {BG_CONFIG[key].label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Layer Isolation Toggle */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-300 block">
                    Layer Focus / Isolation:
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'all', label: 'Full Logo' },
                      { id: 'star', label: 'Star Core' },
                      { id: 'brain', label: 'Brain Mark' },
                    ].map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => setIsolateLayer(l.id as 'all' | 'star' | 'brain')}
                        className={`py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                          isolateLayer === l.id
                            ? 'bg-emerald-500 text-black font-semibold'
                            : 'bg-emerald-950/60 text-slate-300 border border-emerald-800/50 hover:bg-emerald-900/60'
                        }`}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Atmosphere Aura Toggle */}
                <div className="flex items-center justify-between pt-2 border-t border-emerald-800/30 text-xs">
                  <span className="text-slate-300">Ambient Atmospheric Glow</span>
                  <button
                    type="button"
                    onClick={() => setShowAuraRing(!showAuraRing)}
                    className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${
                      showAuraRing ? 'bg-emerald-500' : 'bg-emerald-950 border border-emerald-800'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        showAuraRing ? 'translate-x-5' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Code Export Box */}
                <div className="mt-2 pt-3 border-t border-emerald-800/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-400">
                      React Code Snippet:
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyCode}
                      className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                    >
                      {copied ? <CheckIcon className="h-3 w-3" /> : null}
                      {copied ? 'Copied!' : 'Copy Snippet'}
                    </button>
                  </div>
                  <pre className="text-xs font-mono bg-black/60 border border-emerald-950/80 p-3 rounded-xl text-emerald-300/90 overflow-x-auto">
                    {`<SauladoLogo\n  size={${size}}\n  ${activePreset.baseStarProp ? `starAnimation="${activePreset.baseStarProp}"` : `className="${activePreset.cssClass}"`}\n/>`}
                  </pre>
                </div>
              </div>
            </div>

            {/* ── Category Filter & All Presets Comparison Matrix ── */}
            <div className="mb-14">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-6 border-b border-emerald-800/30 pb-4">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <span>✨</span> Animation Preset Catalog
                  </h2>
                  <p className="text-xs text-slate-400">
                    Click any animation card to inspect it in the main stage above.
                  </p>
                </div>

                {/* Category tabs */}
                <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#081f18] border border-emerald-800/50">
                  {[
                    { id: 'all', label: 'All Variants' },
                    { id: 'star', label: '🌟 Star Core' },
                    { id: 'mobile', label: '📱 Mobile Parity' },
                    { id: 'neural', label: '⚡ Experimental' },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setActiveCategory(cat.id as AnimationCategory | 'all')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        activeCategory === cat.id
                          ? 'bg-emerald-500 text-black font-semibold shadow-md'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Grid of Animation Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {filteredPresets.map((preset) => {
                  const cardStageId = `card-stage-${preset.id}-${pageInstanceId}`
                  const cardCss = preset.keyframesCss(cardStageId, 1)
                  const isSelected = preset.id === selectedId

                  return (
                    <div
                      key={preset.id}
                      onClick={() => setSelectedId(preset.id)}
                      className={`cursor-pointer rounded-2xl border p-5 flex flex-col justify-between transition-all duration-200 group ${
                        isSelected
                          ? 'border-emerald-400 bg-[#082a20] shadow-lg shadow-emerald-500/10 ring-2 ring-emerald-500/30'
                          : 'border-emerald-900/40 bg-[#061914] hover:border-emerald-700/60 hover:bg-[#07221b]'
                      }`}
                    >
                      <style>{cardCss}</style>

                      {/* Card Header Badges */}
                      <div className="flex items-center justify-between mb-4">
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                            preset.category === 'mobile'
                              ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                              : preset.category === 'neural'
                                ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                                : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                          }`}
                        >
                          {preset.tag}
                        </span>
                        {isSelected && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-500/40">
                            ACTIVE IN STAGE
                          </span>
                        )}
                      </div>

                      {/* Micro Logo Animation Canvas */}
                      <div
                        id={cardStageId}
                        className="h-32 flex items-center justify-center relative overflow-hidden rounded-xl bg-black/30 border border-emerald-950/80 mb-4 group-hover:scale-105 transition-transform"
                      >
                        <SauladoLogo size={80} starAnimation={preset.baseStarProp} />
                      </div>

                      {/* Info */}
                      <div>
                        <h3 className="font-semibold text-sm text-white group-hover:text-emerald-300 transition-colors">
                          {preset.name}
                        </h3>
                        <p className="text-xs text-slate-400 line-clamp-2 mt-1 leading-relaxed">
                          {preset.description}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ── Real-World Context Testing Simulators ── */}
            <div className="border-t border-emerald-800/30 pt-10 mb-14">
              <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                <span>📱</span> Real-World UI Context Simulators
              </h2>
              <p className="text-xs text-slate-400 mb-6">
                Verify how the active animation looks in practical UI surfaces: navigation bar,
                mobile card, and loading modal.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* 1. App Header Context (32px) */}
                <div className="bg-[#081f18] border border-emerald-800/40 rounded-2xl p-5 flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-semibold text-emerald-400 block mb-3 uppercase tracking-wider">
                      1. Header / Navbar (32px)
                    </span>
                    <div className="bg-[#03140f] rounded-xl border border-emerald-900/60 p-3 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <SauladoLogo size={30} starAnimation={activePreset.baseStarProp} />
                        <span className="font-bold text-sm tracking-tight text-white">Saulado</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-emerald-800/50 flex items-center justify-center text-[10px] text-emerald-200">
                          S
                        </span>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 mt-4">
                    Compact test ensuring the star animation doesn't clip or cause layout shifts in
                    high-density bars.
                  </p>
                </div>

                {/* 2. Mobile App Splash Card (120px) */}
                <div className="bg-[#081f18] border border-emerald-800/40 rounded-2xl p-5 flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-semibold text-emerald-400 block mb-3 uppercase tracking-wider">
                      2. Mobile Splash Card (110px)
                    </span>
                    <div className="bg-[#03140f] rounded-xl border border-emerald-900/60 p-4 flex flex-col items-center justify-center gap-2">
                      <SauladoLogo size={110} starAnimation={activePreset.baseStarProp} />
                      <span className="font-bold text-sm text-white">Saulado Mobile</span>
                      <span className="text-[10px] text-emerald-400/80">Smart Active Recall</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 mt-4">
                    Simulates splash screens and high-focus loading states on mobile devices.
                  </p>
                </div>

                {/* 3. Fullscreen Loader Test */}
                <div className="bg-[#081f18] border border-emerald-800/40 rounded-2xl p-5 flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-semibold text-emerald-400 block mb-3 uppercase tracking-wider">
                      3. Fullscreen Loader Modal
                    </span>
                    <div className="bg-[#03140f] rounded-xl border border-emerald-900/60 p-6 flex flex-col items-center justify-center gap-3 text-center">
                      <SauladoLoader
                        size={64}
                        starAnimation={
                          activePreset.baseStarProp === 'loading-spin'
                            ? 'loading-spin'
                            : activePreset.baseStarProp === 'glow'
                              ? 'glow'
                              : 'loading'
                        }
                        message="Preparing Flashcards..."
                      />
                    </div>
                  </div>
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => setShowLoaderModal(true)}
                      className="w-full py-2 px-3 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                    >
                      Test Fullscreen Modal Overlay
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Fullscreen Loader Modal Overlay ── */}
            {showLoaderModal && (
              <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#03140f]/95 backdrop-blur-md p-6">
                <SauladoLoader
                  size={96}
                  starAnimation={
                    activePreset.baseStarProp === 'loading-spin' ? 'loading-spin' : 'loading'
                  }
                  message="Syncing Offline Study Progress"
                  submessage="Testing SauladoLoader modal overlay with active star animation"
                />
                <button
                  type="button"
                  onClick={() => setShowLoaderModal(false)}
                  className="mt-8 px-4 py-2 rounded-xl text-xs font-medium text-slate-300 bg-white/10 hover:bg-white/20 transition-colors"
                >
                  Close Overlay (ESC)
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Footer Information ── */}
        <div className="border-t border-emerald-800/30 pt-6 text-center text-xs text-slate-500">
          <p>
            Saulado SVG Logo Animation Test Lab • Current Branch:{' '}
            <span className="font-mono text-emerald-400">feat/svg-logo-animations</span>
          </p>
          <p className="mt-1">
            Once you review and approve these animations, let me know and this testing page file
            will be deleted cleanly.
          </p>
        </div>
      </div>
    </div>
  )
}

export default LogoAnimationLabPage
