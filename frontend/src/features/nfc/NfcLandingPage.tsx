import { useEffect, useState, type ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '@/components/ui/brand'
import {
  CheckIcon,
  DownloadIcon,
  FileTextIcon,
  SmartphoneIcon,
  SparklesIcon,
} from '@/components/ui/icons'

export function NfcLandingPage(): ReactElement {
  const [userAgent, setUserAgent] = useState('')
  const [countdown, setCountdown] = useState(2)
  const [downloadStarted, setDownloadStarted] = useState(false)

  // Configure APK download URL with environment fallback
  const apkDownloadUrl: string = import.meta.env.VITE_APK_DOWNLOAD_URL || '/downloads/saulado.apk'

  useEffect(() => {
    const ua = navigator.userAgent || ''
    setUserAgent(ua)

    const isAndroid = /android/i.test(ua)
    if (isAndroid) {
      // 1. Attempt to open installed Saulado app via custom scheme (in production/browser)
      if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
        try {
          window.location.href = 'saulado://'
        } catch {
          // App not installed
        }
      }

      // 2. Countdown timer then trigger APK download
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer)
            triggerDownload()
            return 0
          }
          return prev - 1
        })
      }, 1000)

      return () => clearInterval(timer)
    }
  }, [])

  const triggerDownload = (): void => {
    setDownloadStarted(true)
    const link = document.createElement('a')
    link.href = apkDownloadUrl
    link.download = 'saulado.apk'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const isAndroid = /android/i.test(userAgent)
  const isIOS =
    /iPad|iPhone|iPod/.test(userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

  return (
    <div className="min-h-screen bg-[#031a14] text-white flex flex-col justify-between selection:bg-emerald-500/20">
      {/* Top Header */}
      <header className="w-full border-b border-white/10 bg-[#05241c]/80 backdrop-blur-md px-4 py-3 sm:py-4 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 group">
            <Logo className="h-7 w-7 transition-transform group-hover:scale-105" />
            <span className="font-bold text-lg tracking-tight text-white">Saulado</span>
          </Link>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            NFC Scanned
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8 sm:py-12 max-w-2xl mx-auto w-full">
        {/* Glow backdrop */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 sm:w-[500px] h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -z-10" />

        {/* Card Frame */}
        <div className="w-full rounded-3xl bg-[#062e24]/90 border border-emerald-500/20 p-6 sm:p-10 shadow-2xl backdrop-blur-sm space-y-6 text-center">
          {/* Hero Icon */}
          <div className="mx-auto h-16 w-16 sm:h-20 sm:w-20 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 p-0.5 shadow-lg flex items-center justify-center">
            <div className="h-full w-full bg-[#04211a] rounded-2xl flex items-center justify-center text-emerald-400">
              <SmartphoneIcon className="h-8 w-8 sm:h-10 sm:w-10" />
            </div>
          </div>

          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Get the Saulado App
            </h1>
            <p className="mt-2 text-sm sm:text-base text-emerald-200/80 max-w-md mx-auto leading-relaxed">
              Offline PDF Reader, Text Highlighting & Spaced Repetition Flashcard Reviewer.
            </p>
          </div>

          {/* Android Flow */}
          {isAndroid ? (
            <div className="space-y-5 pt-2">
              <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-500/20">
                <p className="text-xs sm:text-sm font-medium text-emerald-300">
                  {downloadStarted
                    ? '🎉 Download initiated! Check your notification bar.'
                    : countdown > 0
                      ? `⏳ Download starting automatically in ${countdown}s…`
                      : '⚡ Starting your APK download…'}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={triggerDownload}
                  className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-[#031a14] font-bold text-base shadow-lg shadow-emerald-900/30 transition-all"
                >
                  <DownloadIcon className="h-5 w-5" />
                  <span>Download APK Manually</span>
                </button>

                <a
                  href="saulado://"
                  className="flex items-center justify-center gap-1.5 px-5 py-3.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white font-semibold text-sm transition-all"
                >
                  <span>Open App if Installed</span>
                </a>
              </div>

              {/* Step-by-Step Install Guide */}
              <div className="pt-4 text-left border-t border-white/10 space-y-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                  3-Step Installation Guide (Android)
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="p-3 rounded-xl bg-[#031a14]/60 border border-white/5 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                      <span className="flex h-5 w-5 rounded-full bg-emerald-500/20 text-emerald-400 items-center justify-center text-[10px]">
                        1
                      </span>
                      <span>Download</span>
                    </div>
                    <p className="text-[11px] text-white/60 leading-tight">
                      When Chrome prompts <em>"File might be harmful"</em>, tap{' '}
                      <strong className="text-white">Download anyway</strong>.
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-[#031a14]/60 border border-white/5 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                      <span className="flex h-5 w-5 rounded-full bg-emerald-500/20 text-emerald-400 items-center justify-center text-[10px]">
                        2
                      </span>
                      <span>Open File</span>
                    </div>
                    <p className="text-[11px] text-white/60 leading-tight">
                      Swipe down your notification bar and tap{' '}
                      <strong className="text-white">saulado.apk</strong>.
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-[#031a14]/60 border border-white/5 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                      <span className="flex h-5 w-5 rounded-full bg-emerald-500/20 text-emerald-400 items-center justify-center text-[10px]">
                        3
                      </span>
                      <span>Install & Study</span>
                    </div>
                    <p className="text-[11px] text-white/60 leading-tight">
                      Tap <strong className="text-white">Install</strong>, grant permission if
                      prompted, and study 100% offline!
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : isIOS ? (
            /* iOS Flow */
            <div className="space-y-4 pt-2">
              <div className="p-4 rounded-2xl bg-teal-950/40 border border-teal-500/20 text-left space-y-2">
                <div className="flex items-center gap-2 text-teal-300 font-bold text-sm">
                  <SparklesIcon className="h-4 w-4" />
                  <span>iOS Web App Ready</span>
                </div>
                <p className="text-xs text-teal-200/80 leading-relaxed">
                  Saulado runs directly in Safari as an offline-capable Progressive Web App with
                  zero installation required.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <Link
                  to="/"
                  className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-[#031a14] font-bold text-base shadow-lg shadow-emerald-900/30 transition-all"
                >
                  <span>Launch Web App</span>
                </Link>

                <div className="p-3.5 rounded-xl bg-[#031a14]/60 border border-white/5 text-left text-xs text-white/70 space-y-1">
                  <p className="font-semibold text-white">📲 Add to your iPhone Home Screen:</p>
                  <p className="leading-normal">
                    In Safari, tap the <strong>Share</strong> icon at the bottom, scroll down and
                    tap <strong>"Add to Home Screen"</strong>.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* Desktop / Other Flow */
            <div className="space-y-5 pt-2">
              <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/20 space-y-2">
                <p className="text-xs sm:text-sm text-emerald-200">
                  You scanned this from a desktop or laptop. You can download the Android APK file
                  directly below or open the web app.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={triggerDownload}
                  className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#031a14] font-bold text-sm transition-all"
                >
                  <DownloadIcon className="h-4 w-4" />
                  <span>Download Standalone APK</span>
                </button>
                <Link
                  to="/"
                  className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-sm border border-white/10 transition-all"
                >
                  <FileTextIcon className="h-4 w-4" />
                  <span>Open Web Platform</span>
                </Link>
              </div>
            </div>
          )}

          {/* Key Features Bullet Points */}
          <div className="pt-4 border-t border-white/10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-white/60">
            <span className="flex items-center gap-1.5">
              <CheckIcon className="h-3.5 w-3.5 text-emerald-400" />
              100% Offline Study
            </span>
            <span className="flex items-center gap-1.5">
              <CheckIcon className="h-3.5 w-3.5 text-emerald-400" />
              PDF Visual Highlighting
            </span>
            <span className="flex items-center gap-1.5">
              <CheckIcon className="h-3.5 w-3.5 text-emerald-400" />
              Automatic Cloze Cards
            </span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-6 text-center text-xs text-white/40 border-t border-white/5">
        <p>© {new Date().getFullYear()} Saulado. Offline-first intelligent reviewer system.</p>
      </footer>
    </div>
  )
}
