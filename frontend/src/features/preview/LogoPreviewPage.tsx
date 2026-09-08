import { useState, type ReactElement } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  SauladoLogo,
  SauladoIcon,
  SauladoLoader,
  type StarAnimation,
} from '@/components/ui/saulado-logo'
import { CheckIcon } from '@/components/ui/icons'

type AnimationType =
  | 'star-loading'
  | 'star-loading-spin'
  | 'star-glow'
  | 'star-bounce-spin'
  | 'star-coin-flip'
  | 'star-bounce'
  | 'star-spin'
  | 'float'
  | 'twinkle'
  | 'pulse'
  | 'shimmer'
  | 'spring'
  | 'rotate-slow'
  | 'none'

type BgOption = 'dark' | 'forest' | 'mint' | 'white' | 'checker'

export function LogoPreviewPage(): ReactElement {
  const [anim, setAnim] = useState<AnimationType>('star-loading')
  const [size, setSize] = useState<number>(180)
  const [withBg, setWithBg] = useState<boolean>(false)
  const [containerBg, setContainerBg] = useState<BgOption>('forest')
  const [copied, setCopied] = useState<boolean>(false)
  const [showWordmark, setShowWordmark] = useState<boolean>(true)
  const [showFullScreenLoader, setShowFullScreenLoader] = useState<boolean>(false)

  // Background map
  const bgStyles: Record<BgOption, string> = {
    dark: 'bg-[#031a14] text-white',
    forest: 'bg-[#072d24] text-white',
    mint: 'bg-[#f0f8f4] text-[#072d24]',
    white: 'bg-white text-gray-900 border border-gray-200',
    checker:
      'bg-[linear-gradient(45deg,#e2e8f0_25%,transparent_25%),linear-gradient(-45deg,#e2e8f0_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#e2e8f0_75%),linear-gradient(-45deg,transparent_75%,#e2e8f0_75%)] bg-[size:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0] text-gray-900',
  }

  const isStarAnimation = anim.startsWith('star-')
  const starAnimProp: StarAnimation = isStarAnimation
    ? (anim.replace('star-', '') as StarAnimation)
    : 'none'

  // Whole-logo animation variants (active only when not using star-only animation)
  const getLogoAnimationProps = (): Record<string, unknown> => {
    if (isStarAnimation) return {}

    switch (anim) {
      case 'float':
        return {
          animate: {
            y: [-6, 6, -6],
            scale: [1, 1.02, 1],
            transition: { duration: 3.5, repeat: Infinity, ease: 'easeInOut' },
          },
        }
      case 'twinkle':
        return {
          animate: {
            filter: [
              'drop-shadow(0 0 0px rgba(254, 201, 91, 0))',
              'drop-shadow(0 0 16px rgba(254, 201, 91, 0.75))',
              'drop-shadow(0 0 2px rgba(254, 201, 91, 0.2))',
            ],
            scale: [1, 1.03, 1],
            transition: { duration: 2.2, repeat: Infinity, ease: 'easeInOut' },
          },
        }
      case 'pulse':
        return {
          animate: {
            scale: [1, 1.05, 1],
            filter: [
              'drop-shadow(0 4px 12px rgba(167, 207, 170, 0.15))',
              'drop-shadow(0 8px 28px rgba(167, 207, 170, 0.5))',
              'drop-shadow(0 4px 12px rgba(167, 207, 170, 0.15))',
            ],
            transition: { duration: 2.5, repeat: Infinity, ease: 'easeInOut' },
          },
        }
      case 'shimmer':
        return {
          animate: {
            opacity: [0.88, 1, 0.88],
            scale: [0.99, 1.015, 0.99],
            rotate: [-0.5, 0.5, -0.5],
            transition: { duration: 2.8, repeat: Infinity, ease: 'easeInOut' },
          },
        }
      case 'spring':
        return {
          whileHover: { scale: 1.1, rotate: 3 },
          whileTap: { scale: 0.95, rotate: -2 },
          transition: { type: 'spring', stiffness: 300, damping: 15 },
        }
      case 'rotate-slow':
        return {
          animate: {
            rotate: 360,
            transition: { duration: 20, repeat: Infinity, ease: 'linear' },
          },
        }
      default:
        return {}
    }
  }

  // Generate code snippet
  const getSnippet = () => {
    if (isStarAnimation) {
      if (starAnimProp === 'loading' || starAnimProp === 'loading-spin') {
        return `// 1. Direct SVG Logo with Loading Star:
import { SauladoLogo } from '@/components/ui/saulado-logo'

<SauladoLogo
  size={${size}}
  starAnimation="${starAnimProp}"
/>

// 2. Ready-to-Use Drop-in Loading Screen:
import { SauladoLoader } from '@/components/ui/saulado-logo'

// Inside a container/card:
<SauladoLoader message="Loading your deck..." starAnimation="${starAnimProp}" />

// As a full-screen overlay:
<SauladoLoader fullScreen message="Loading Saulado..." submessage="Preparing your brain..." starAnimation="${starAnimProp}" />`
      }

      return `// Web React with Star Animation:
import { SauladoLogo, SauladoIcon } from '@/components/ui/saulado-logo'

<SauladoLogo
  size={${size}}
  starAnimation="${starAnimProp}"
/>

// As a transparent icon:
<SauladoIcon size={32} starAnimation="${starAnimProp}" />`
    }

    let animClass = ''
    if (anim === 'float') animClass = ' className="animate-bounce"'
    if (anim === 'pulse') animClass = ' className="animate-pulse"'
    if (anim === 'rotate-slow') animClass = ' className="animate-spin duration-1000"'

    return `// Web React:
import { SauladoLogo, SauladoIcon } from '@/components/ui/saulado-logo'

<SauladoLogo
  size={${size}}
  withBackground={${withBg}}${animClass}
/>

// Transparent Icon:
<SauladoIcon size={28} />`
  }

  const copySnippet = () => {
    void navigator.clipboard.writeText(getSnippet()).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="min-h-screen bg-[#07130e] text-slate-100 flex flex-col selection:bg-emerald-500 selection:text-white">
      {/* Top Banner */}
      <header className="border-b border-emerald-900/50 bg-[#061812]/90 backdrop-blur sticky top-0 z-50 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="flex items-center gap-2 text-xs text-emerald-400 hover:text-emerald-300 transition-colors bg-emerald-950/70 border border-emerald-800/60 rounded-full px-3 py-1.5"
          >
            ← Back to App
          </Link>
          <div className="h-4 w-px bg-emerald-800/60" />
          <div className="flex items-center gap-2">
            <SauladoIcon size={22} starAnimation="glow" />
            <h1 className="font-semibold text-sm tracking-tight text-white">
              Saulado Logo & Animation Test Studio
            </h1>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
              Star Glow Active
            </span>
          </div>
        </div>

        <div className="text-xs text-slate-400 hidden md:flex items-center gap-2">
          <span>
            When satisfied with the animation, you can copy the code and remove this test page.
          </span>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Viewport Stage (7 cols) */}
        <section className="lg:col-span-7 flex flex-col gap-4">
          <div className="bg-[#0b221a]/80 border border-emerald-900/40 rounded-2xl p-4 flex flex-col gap-3">
            {/* Viewport Toolbar */}
            <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
              <span className="font-medium text-amber-400 flex items-center gap-1.5">
                ★ Live Interactive Stage (Star-Only Glow)
              </span>

              {/* Stage background picker */}
              <div className="flex items-center gap-1.5 bg-[#071913] p-1 rounded-lg border border-emerald-950">
                <span className="text-[11px] text-slate-400 px-1.5">Background:</span>
                {(['forest', 'dark', 'mint', 'white', 'checker'] as BgOption[]).map((b) => (
                  <button
                    key={b}
                    onClick={() => setContainerBg(b)}
                    className={`px-2 py-0.5 rounded text-[11px] capitalize transition-all ${
                      containerBg === b
                        ? 'bg-emerald-600 text-white font-medium shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>

            {/* Stage Canvas */}
            <div
              className={`min-h-[380px] sm:min-h-[440px] rounded-xl flex flex-col items-center justify-center p-8 transition-colors duration-300 relative overflow-hidden ${bgStyles[containerBg]}`}
            >
              <div className="absolute top-3 left-3 text-[11px] opacity-60 font-mono">
                {size}px × {size}px • starAnimation="{starAnimProp}"
              </div>

              {/* Animated Logo Container */}
              <motion.div
                key={anim}
                {...getLogoAnimationProps()}
                className="cursor-pointer flex flex-col items-center justify-center"
              >
                <SauladoLogo
                  size={size}
                  withBackground={withBg}
                  starAnimation={starAnimProp}
                  className="transition-all duration-200"
                />
              </motion.div>

              {/* Wordmark preview underneath if enabled */}
              {showWordmark && (
                <div className="mt-4 flex items-center gap-2">
                  <span className="text-xl font-bold tracking-tight">Saulado</span>
                </div>
              )}
            </div>

            {/* Quick Sizing & Wordmark Toggles */}
            <div className="flex items-center justify-between flex-wrap gap-4 pt-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Quick Sizes:</span>
                {[24, 32, 48, 64, 96, 160, 240].map((s) => (
                  <button
                    key={s}
                    onClick={() => setSize(s)}
                    className={`px-2 py-1 rounded text-xs transition-colors ${
                      size === s
                        ? 'bg-amber-400 text-slate-950 font-bold'
                        : 'bg-[#081b14] text-slate-300 hover:bg-emerald-900/50'
                    }`}
                  >
                    {s}px
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showWordmark}
                    onChange={(e) => setShowWordmark(e.target.checked)}
                    className="accent-amber-500 rounded"
                  />
                  Wordmark
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={withBg}
                    onChange={(e) => setWithBg(e.target.checked)}
                    className="accent-amber-500 rounded"
                  />
                  Plate Background
                </label>
              </div>
            </div>
          </div>

          {/* Real-World Context Mockups */}
          <div className="bg-[#0b221a]/80 border border-emerald-900/40 rounded-2xl p-5 flex flex-col gap-4">
            <h2 className="text-xs font-semibold text-emerald-400 flex items-center gap-2">
              ❖ Real Context Mockups (With Star Glow)
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* 1. Header Bar Mockup */}
              <div className="bg-[#051c14] border border-emerald-950 rounded-xl p-3 flex flex-col gap-2">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  1. Navigation Header
                </span>
                <div className="bg-[#07241b] rounded-lg p-2 flex items-center justify-between border border-emerald-800/40">
                  <div className="flex items-center gap-2">
                    <SauladoIcon size={22} starAnimation="glow" />
                    <span className="font-bold text-xs text-white">Saulado</span>
                  </div>
                  <div className="h-2 w-8 bg-emerald-800/40 rounded" />
                </div>
              </div>

              {/* 2. Primary Button Mockup */}
              <div className="bg-[#051c14] border border-emerald-950 rounded-xl p-3 flex flex-col gap-2">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  2. Button Mark
                </span>
                <button className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg p-2 flex items-center justify-center gap-2 text-xs font-medium shadow transition-all">
                  <SauladoIcon size={18} starAnimation="loading" />
                  <span>Loading...</span>
                </button>
              </div>

              {/* 3. Mobile App Icon Mockup */}
              <div className="bg-[#051c14] border border-emerald-950 rounded-xl p-3 flex flex-col gap-2">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  3. App Tile / Badge
                </span>
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-[#082218] border border-emerald-800/60 shadow-md flex items-center justify-center p-1">
                    <SauladoLogo size={36} starAnimation="loading" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-white leading-tight">
                      Saulado App
                    </span>
                    <span className="text-[10px] text-amber-400">Loading State</span>
                  </div>
                </div>
              </div>

              {/* 4. Fullscreen Loading Screen Mockup */}
              <div className="bg-[#051c14] border border-emerald-950 rounded-xl p-3 flex flex-col justify-between gap-2">
                <span className="text-[10px] text-amber-400 uppercase tracking-wider font-semibold flex items-center gap-1">
                  <span>★</span> 4. Loading Screen
                </span>
                <button
                  onClick={() => setShowFullScreenLoader(true)}
                  className="w-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg py-1.5 px-2 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all shadow-sm"
                >
                  <span>Launch Fullscreen</span>
                  <span>↗</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Right: Controls & Code Generator (5 cols) */}
        <section className="lg:col-span-5 flex flex-col gap-4">
          {/* Animation Picker */}
          <div className="bg-[#0b221a]/80 border border-emerald-900/40 rounded-2xl p-5 flex flex-col gap-3">
            <h2 className="text-xs font-semibold text-amber-400 flex items-center gap-2">
              ⭐ Star Only Animations (&lt;g id="Star"&gt;)
            </h2>

            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  id: 'star-loading',
                  label: 'Star Synapse Loading',
                  desc: 'Rhythmic pulse & aura for loading screens',
                  highlight: true,
                },
                {
                  id: 'star-loading-spin',
                  label: 'Star Gyro Spinner',
                  desc: '360° spin with radiant flare for loaders',
                  highlight: true,
                },
                {
                  id: 'star-glow',
                  label: 'Star Only Glow',
                  desc: 'Calm ambient luminescence aura',
                },
                {
                  id: 'star-bounce-spin',
                  label: 'Star Bounce & Spin',
                  desc: 'Bounces Y while spinning 360°',
                },
                {
                  id: 'star-coin-flip',
                  label: 'Star 3D Coin Flip',
                  desc: 'Bounces Y with horizontal flip',
                },
                {
                  id: 'star-bounce',
                  label: 'Star Bounce Only',
                  desc: 'Playful vertical bounce on brain',
                },
                {
                  id: 'star-spin',
                  label: 'Star Spin Only',
                  desc: 'Smooth 360° spin in place',
                },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setAnim(item.id as AnimationType)}
                  className={`text-left p-2.5 rounded-xl border transition-all ${
                    anim === item.id
                      ? 'bg-amber-500/25 border-amber-400 text-amber-200 shadow-md ring-1 ring-amber-400/40'
                      : 'bg-[#071a13] border-emerald-950/80 text-slate-300 hover:text-white hover:border-amber-500/40'
                  }`}
                >
                  <div className="font-semibold text-xs flex items-center gap-1.5">
                    <span className="text-amber-400">★</span>
                    <span className="text-white">{item.label}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{item.desc}</div>
                </button>
              ))}
            </div>

            <h2 className="text-xs font-semibold text-emerald-400 flex items-center gap-2 mt-2 pt-2 border-t border-emerald-950">
              ✦ Full Logo Animations
            </h2>

            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'float', label: 'Floating Breathe', desc: 'Whole logo idle float' },
                { id: 'pulse', label: 'Pulse Aura', desc: 'Heartbeat scale & aura' },
                { id: 'twinkle', label: 'Twinkle Shimmer', desc: 'Light sweep' },
                { id: 'shimmer', label: 'Subtle Shimmer', desc: 'Organic facet motion' },
                { id: 'spring', label: 'Interactive Spring', desc: 'Hover / tap physics' },
                { id: 'rotate-slow', label: 'Continuous Spin', desc: 'Slow 360 rotation' },
                { id: 'none', label: 'Static', desc: 'Crisp still vector' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setAnim(item.id as AnimationType)}
                  className={`text-left p-2 rounded-lg border transition-all ${
                    anim === item.id
                      ? 'bg-emerald-600/30 border-emerald-500 text-white shadow-sm'
                      : 'bg-[#071a13] border-emerald-950/80 text-slate-400 hover:text-slate-200 hover:border-emerald-800/40'
                  }`}
                >
                  <div className="font-semibold text-xs text-white">{item.label}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{item.desc}</div>
                </button>
              ))}
            </div>

            {/* Custom Slider */}
            <div className="mt-2 pt-3 border-t border-emerald-950 flex flex-col gap-1.5">
              <div className="flex justify-between text-xs text-slate-300">
                <span>Custom Size:</span>
                <span className="font-mono text-emerald-400">{size}px</span>
              </div>
              <input
                type="range"
                min="16"
                max="420"
                value={size}
                onChange={(e) => setSize(Number(e.target.value))}
                className="accent-amber-500 cursor-pointer w-full"
              />
            </div>
          </div>

          {/* Copy-Paste Code Generator */}
          <div className="bg-[#0b221a]/80 border border-emerald-900/40 rounded-2xl p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-emerald-400 flex items-center gap-2">
                📋 Ready-to-Use Code
              </h2>
              <button
                onClick={copySnippet}
                className="flex items-center gap-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-xs px-2.5 py-1 rounded-lg transition-colors"
              >
                {copied ? <CheckIcon className="w-3.5 h-3.5" /> : null}
                <span>{copied ? 'Copied!' : 'Copy Code'}</span>
              </button>
            </div>

            <pre className="bg-[#040e0b] border border-emerald-950 p-3.5 rounded-xl font-mono text-[11px] text-amber-300/90 overflow-x-auto leading-relaxed">
              {getSnippet()}
            </pre>
          </div>

          {/* How to revert / clean up instructions */}
          <div className="bg-[#091a13]/60 border border-emerald-900/20 rounded-2xl p-4 text-xs text-slate-400 flex flex-col gap-2">
            <span className="font-semibold text-slate-200">
              💡 How to go back after you are satisfied:
            </span>
            <p className="text-[11px] leading-normal">
              This preview page is completely isolated. Once you are satisfied with your animation
              choice:
            </p>
            <ol className="list-decimal list-inside text-[11px] space-y-1 text-slate-300">
              <li>Copy the code snippet above with your chosen preset.</li>
              <li>
                To remove this preview route, simply delete{' '}
                <code className="text-emerald-400">/logo-preview</code> from{' '}
                <code className="text-emerald-400">frontend/src/App.tsx</code> and delete{' '}
                <code className="text-emerald-400">LogoPreviewPage.tsx</code>.
              </li>
            </ol>
          </div>
        </section>
      </main>

      {/* Fullscreen Loading Overlay Demo */}
      {showFullScreenLoader && (
        <div
          onClick={() => setShowFullScreenLoader(false)}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#07130e]/95 backdrop-blur-md p-6 cursor-pointer"
        >
          <SauladoLoader
            size={110}
            starAnimation={starAnimProp === 'loading-spin' ? 'loading-spin' : 'loading'}
            message="Loading Saulado Deck..."
            submessage="Preparing your brain for spaced repetition mastery..."
          />
          <button
            onClick={() => setShowFullScreenLoader(false)}
            className="mt-8 text-xs text-emerald-400 hover:text-emerald-200 border border-emerald-800/60 rounded-full px-4 py-1.5 bg-emerald-950/70 shadow transition-all"
          >
            Click anywhere or press Esc to exit loading preview
          </button>
        </div>
      )}
    </div>
  )
}

export default LogoPreviewPage
