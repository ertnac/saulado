import { useState, type ReactElement } from 'react'
import { Link } from 'react-router-dom'
import {
  BookOpenIcon,
  CheckIcon,
  ChevronRightIcon,
  FileTextIcon,
  FlameIcon,
  SparklesIcon,
} from '@/components/ui/icons'
import { Logo, MascotSprite } from '@/components/ui/brand'
import { Badge } from '@/components/ui/badge'

export function LandingPage(): ReactElement {
  // Hero Interactive Demo State
  const [heroInput, setHeroInput] = useState('')
  const [heroRevealed, setHeroRevealed] = useState(false)
  const isHeroCorrect = heroInput.trim().toLowerCase() === 'time'

  // Answering Mode Interactive Preview State
  const [selectedMode, setSelectedMode] = useState<'type-in' | 'multiple-choice' | 'flashcard'>(
    'type-in',
  )
  const [mcSelection, setMcSelection] = useState<number | null>(null)
  const [isFlipped, setIsFlipped] = useState(false)

  // Interactive Sandbox State
  const [sandboxText, setSandboxText] = useState(
    'Mitochondria generate chemical energy in the form of ATP for the cell.',
  )
  const [blankWord, setBlankWord] = useState('ATP')
  const [sandboxTestInput, setSandboxTestInput] = useState('')
  const [sandboxRevealed, setSandboxRevealed] = useState(false)

  const sandboxWords = sandboxText.split(' ')

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-accent/20">
      {/* ── Top Navigation Bar ── */}
      <header className="sticky top-0 z-40 w-full backdrop-blur-md bg-background/85 border-b border-border/60 transition-all">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group">
            <Logo className="h-8 w-8 transition-transform group-hover:scale-105" />
            <span className="font-bold text-xl sm:text-2xl tracking-tight text-foreground">
              Saulado
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-muted-foreground">
            <a href="#how-it-works" className="hover:text-foreground transition-colors">
              How it Works
            </a>
            <a href="#study-modes" className="hover:text-foreground transition-colors">
              Study Modes
            </a>
            <a href="#sandbox" className="hover:text-foreground transition-colors">
              Interactive Sandbox
            </a>
            <a href="#features" className="hover:text-foreground transition-colors">
              Features
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="clay-pill px-4 py-2 text-xs sm:text-sm font-semibold text-foreground hover:text-primary transition-colors"
            >
              Sign In
            </Link>
            <Link
              to="/register"
              className="clay-btn-primary px-4 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 shadow-sm"
            >
              Get Started
              <ChevronRightIcon className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero Section ── */}
      <section className="relative pt-12 pb-20 sm:pt-20 sm:pb-28 overflow-hidden">
        {/* Subtle Ambient Radial Accents */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-primary/10 rounded-full blur-3xl pointer-events-none -z-10" />

        <div className="mx-auto max-w-6xl px-4 sm:px-6 text-center space-y-8">
          {/* Eyebrow Pill */}
          <div className="inline-flex items-center gap-2 clay-pill px-4 py-1.5 text-xs font-semibold text-primary">
            <SparklesIcon className="h-3.5 w-3.5 text-accent" />
            <span>Active Recall · Spaced Repetition · Contextual Cloze</span>
          </div>

          {/* Main Headline */}
          <div className="space-y-4 max-w-3xl mx-auto">
            <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-foreground leading-[1.12]">
              Remember what you learn.{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-emerald-600 to-teal-500 dark:from-emerald-400 dark:to-teal-300">
                In context.
              </span>
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground leading-relaxed font-normal">
              Traditional flashcards isolate facts. Saulado turns your actual notes, textbooks, and
              documents into smart cloze recall cards—spaced at the exact moment before you forget.
            </p>
          </div>

          {/* Call to Actions */}
          <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
            <Link
              to="/register"
              className="clay-btn-primary px-7 py-3.5 text-base font-semibold inline-flex items-center gap-2 text-white"
            >
              Start Studying Free
              <ChevronRightIcon className="h-4 w-4" />
            </Link>
            <a
              href="#sandbox"
              className="clay-pill px-6 py-3.5 text-base font-medium text-foreground hover:bg-surface-muted transition-all"
            >
              Try Interactive Demo
            </a>
          </div>

          {/* Micro Trust Stats */}
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-12 pt-4 text-xs sm:text-sm text-muted-foreground font-medium">
            <span className="flex items-center gap-1.5">
              <CheckIcon className="h-4 w-4 text-emerald-500" />
              100% Free & Open Source
            </span>
            <span className="flex items-center gap-1.5">
              <CheckIcon className="h-4 w-4 text-emerald-500" />
              No Credit Card Required
            </span>
            <span className="flex items-center gap-1.5">
              <CheckIcon className="h-4 w-4 text-emerald-500" />
              SM-2 Spaced Algorithm
            </span>
          </div>

          {/* ── Interactive Hero Preview Card (Claymorphic) ── */}
          <div className="max-w-2xl mx-auto mt-12 text-left">
            <div className="clay-card p-6 sm:p-8 space-y-6 relative overflow-hidden group">
              <div className="flex items-center justify-between border-b border-border/50 pb-4">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-red-400/80" />
                  <span className="h-3 w-3 rounded-full bg-amber-400/80" />
                  <span className="h-3 w-3 rounded-full bg-emerald-400/80" />
                  <span className="text-xs text-muted-foreground font-medium ml-2">
                    Live Cloze Demo
                  </span>
                </div>
                <Badge tone="accent" className="text-xs font-semibold">
                  Try typing below
                </Badge>
              </div>

              <div className="space-y-4">
                <p className="text-base sm:text-lg leading-relaxed text-foreground font-normal">
                  "Spaced repetition is an evidence-based learning technique that incorporates
                  increasing intervals of{' '}
                  <span className="inline-block relative align-baseline mx-1">
                    {heroRevealed ? (
                      <span className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold px-2 py-0.5 rounded-lg border border-emerald-500/30">
                        time
                      </span>
                    ) : (
                      <input
                        type="text"
                        value={heroInput}
                        onChange={(e) => setHeroInput(e.target.value)}
                        placeholder="[ type here ]"
                        className={`w-32 px-2.5 py-1 text-sm font-semibold rounded-xl border text-center transition-all focus:outline-none ${
                          isHeroCorrect
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/30'
                            : heroInput.length > 0
                              ? 'bg-amber-500/10 border-amber-400 text-foreground'
                              : 'bg-surface border-border text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20'
                        }`}
                      />
                    )}
                  </span>{' '}
                  between subsequent review of previously learned material."
                </p>

                <div className="flex items-center justify-between pt-2">
                  <div className="text-xs text-muted-foreground">
                    {isHeroCorrect ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                        <CheckIcon className="h-4 w-4" /> Correct recall! Memory anchored.
                      </span>
                    ) : (
                      <span>Hint: Dimension of clocks and hours</span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setHeroRevealed(!heroRevealed)
                      if (!heroRevealed) setHeroInput('time')
                    }}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    {heroRevealed ? 'Hide answer' : 'Reveal answer'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Study Modes Interactive Showcase ── */}
      <section
        id="study-modes"
        className="py-16 sm:py-24 bg-surface-muted/50 border-y border-border/60"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6 space-y-12">
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <h2 className="text-xs font-bold uppercase tracking-wider text-accent">
              Triple Answering Engine
            </h2>
            <h3 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
              Study your way: Type-In, Quiz, or Flashcards
            </h3>
            <p className="text-sm sm:text-base text-muted-foreground">
              Switch modes anytime mid-session. Zero lock-in, seamless progress sync across all
              modes.
            </p>
          </div>

          {/* Mode Selector Tabs (Clay Pill Style) */}
          <div className="flex justify-center">
            <div className="clay-pill p-1.5 inline-flex items-center gap-1.5 max-w-full overflow-x-auto">
              <button
                type="button"
                onClick={() => setSelectedMode('type-in')}
                className={`px-4 sm:px-6 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all ${
                  selectedMode === 'type-in'
                    ? 'clay-btn-primary text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                1. Type-In (Active Recall)
              </button>
              <button
                type="button"
                onClick={() => setSelectedMode('multiple-choice')}
                className={`px-4 sm:px-6 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all ${
                  selectedMode === 'multiple-choice'
                    ? 'clay-btn-primary text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                2. Multiple Choice (Fast Quiz)
              </button>
              <button
                type="button"
                onClick={() => setSelectedMode('flashcard')}
                className={`px-4 sm:px-6 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all ${
                  selectedMode === 'flashcard'
                    ? 'clay-btn-primary text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                3. Flashcards (Self-Graded)
              </button>
            </div>
          </div>

          {/* Interactive Mode Preview Card */}
          <div className="max-w-3xl mx-auto">
            <div className="clay-card p-6 sm:p-10 space-y-6">
              {selectedMode === 'type-in' && (
                <div className="space-y-6 animate-fadeIn">
                  <div className="flex items-center justify-between">
                    <Badge tone="accent">Type-In Mode</Badge>
                    <span className="text-xs text-muted-foreground">
                      Typo-Tolerant String Distance
                    </span>
                  </div>
                  <p className="text-lg leading-relaxed text-foreground">
                    "Binary search operates in{' '}
                    <input
                      type="text"
                      placeholder="[ answer ]"
                      defaultValue="O(log n)"
                      readOnly
                      className="inline-block w-28 px-2 py-0.5 text-center font-bold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 rounded-lg border border-emerald-500/30"
                    />{' '}
                    time on sorted arrays by repeatedly dividing the search interval in half."
                  </p>
                  <p className="text-xs text-muted-foreground italic">
                    ✓ Evaluated with Levenshtein typo-tolerance so minor spelling slips don't break
                    your streak.
                  </p>
                </div>
              )}

              {selectedMode === 'multiple-choice' && (
                <div className="space-y-6 animate-fadeIn">
                  <div className="flex items-center justify-between">
                    <Badge tone="accent">Multiple Choice Mode</Badge>
                    <span className="text-xs text-muted-foreground">
                      Smart Contextual Distractors
                    </span>
                  </div>
                  <p className="text-lg leading-relaxed text-foreground">
                    "A{' '}
                    <span className="font-bold underline decoration-primary decoration-2 underline-offset-4">
                      [ ? ]
                    </span>{' '}
                    uses a hashing function to map keys to bucket indices for fast average O(1)
                    lookups."
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    {[
                      { id: 0, text: 'A. Stack', correct: false },
                      { id: 1, text: 'B. Hash table', correct: true },
                      { id: 2, text: 'C. Linked list', correct: false },
                      { id: 3, text: 'D. Binary Tree', correct: false },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setMcSelection(opt.id)}
                        className={`p-3.5 rounded-2xl border text-left text-sm font-semibold transition-all ${
                          mcSelection === opt.id
                            ? opt.correct
                              ? 'bg-emerald-500/20 border-emerald-500 text-emerald-800 dark:text-emerald-300 ring-2 ring-emerald-500/30'
                              : 'bg-danger/10 border-danger text-danger'
                            : 'bg-surface border-border hover:border-primary/50 text-foreground'
                        }`}
                      >
                        {opt.text}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedMode === 'flashcard' && (
                <div className="space-y-6 animate-fadeIn">
                  <div className="flex items-center justify-between">
                    <Badge tone="accent">Flashcard Mode</Badge>
                    <span className="text-xs text-muted-foreground">3D Flip with SM-2 Grading</span>
                  </div>
                  <div
                    onClick={() => setIsFlipped(!isFlipped)}
                    className="cursor-pointer p-8 rounded-2xl bg-surface-muted/60 border border-border/80 text-center space-y-4 hover:border-primary/50 transition-all group"
                  >
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {isFlipped ? 'Back (Answer)' : 'Front (Question) — Click to Flip'}
                    </p>
                    <p className="text-xl font-bold text-foreground">
                      {isFlipped
                        ? 'Answer: Mitochondria (ATP production)'
                        : 'Which organelle generates most of the cellular energy in the form of ATP?'}
                    </p>
                    <p className="text-xs text-primary font-medium group-hover:underline">
                      {isFlipped ? 'Click to flip back' : 'Press Space or Click to Reveal'}
                    </p>
                  </div>
                  {isFlipped && (
                    <div className="grid grid-cols-4 gap-2 pt-2 animate-fadeIn">
                      <button
                        type="button"
                        className="p-2 rounded-xl bg-danger/10 text-danger text-xs font-bold hover:bg-danger/20"
                      >
                        Again [1]
                      </button>
                      <button
                        type="button"
                        className="p-2 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs font-bold hover:bg-amber-500/20"
                      >
                        Hard [2]
                      </button>
                      <button
                        type="button"
                        className="p-2 rounded-xl bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20"
                      >
                        Good [3]
                      </button>
                      <button
                        type="button"
                        className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold hover:bg-emerald-500/20"
                      >
                        Easy [4]
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Interactive Cloze Sandbox ── */}
      <section id="sandbox" className="py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 space-y-12">
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <h2 className="text-xs font-bold uppercase tracking-wider text-accent">
              Interactive Sandbox
            </h2>
            <h3 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
              Create a card in 5 seconds
            </h3>
            <p className="text-sm sm:text-base text-muted-foreground">
              Click any word in your sentence below to instantly turn it into a cloze blank.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            {/* Left: Interactive Creator */}
            <div className="clay-card p-6 sm:p-8 space-y-6">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-base text-foreground">1. Type or edit your note</h4>
                <span className="text-xs text-muted-foreground">Click word to blank</span>
              </div>

              <textarea
                value={sandboxText}
                onChange={(e) => setSandboxText(e.target.value)}
                rows={3}
                className="w-full p-3.5 text-sm rounded-xl border border-border bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />

              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">
                  Pick target blank from your words:
                </p>
                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1">
                  {sandboxWords.map((word, idx) => {
                    const clean = word.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, '')
                    const isBlanked = clean === blankWord
                    return (
                      <button
                        key={`${word}-${String(idx)}`}
                        type="button"
                        onClick={() => {
                          setBlankWord(clean)
                          setSandboxTestInput('')
                          setSandboxRevealed(false)
                        }}
                        className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-all ${
                          isBlanked
                            ? 'bg-accent text-accent-foreground font-bold shadow-sm scale-105'
                            : 'bg-surface-muted text-foreground hover:bg-surface-muted/80'
                        }`}
                      >
                        {clean}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Right: Instant Playable Preview */}
            <div className="clay-card p-6 sm:p-8 space-y-6 bg-gradient-to-br from-surface to-surface-muted/40">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-base text-foreground">
                  2. Live Generated Cloze Card
                </h4>
                <Badge tone="accent" className="text-xs">
                  Ready to test
                </Badge>
              </div>

              <div className="p-5 rounded-2xl bg-surface border border-border/80 space-y-4">
                <p className="text-base leading-relaxed text-foreground">
                  {sandboxWords.map((word, idx) => {
                    const clean = word.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, '')
                    const isBlank = clean === blankWord
                    const punctuation = word.slice(clean.length)

                    if (isBlank) {
                      return (
                        <span key={String(idx)} className="inline-block mx-1">
                          {sandboxRevealed ? (
                            <span className="font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-lg">
                              {clean}
                            </span>
                          ) : (
                            <input
                              type="text"
                              value={sandboxTestInput}
                              onChange={(e) => setSandboxTestInput(e.target.value)}
                              placeholder="[ ? ]"
                              className={`w-24 px-2 py-0.5 text-xs text-center font-bold rounded-lg border focus:outline-none ${
                                sandboxTestInput.trim().toLowerCase() === blankWord.toLowerCase()
                                  ? 'bg-emerald-500/20 border-emerald-500 text-emerald-700'
                                  : 'bg-surface border-border'
                              }`}
                            />
                          )}
                          {punctuation}
                        </span>
                      )
                    }
                    return <span key={String(idx)}>{word} </span>
                  })}
                </p>

                <div className="flex items-center justify-between pt-2 border-t border-border/40">
                  <span className="text-xs text-muted-foreground">
                    {sandboxTestInput.trim().toLowerCase() === blankWord.toLowerCase() ? (
                      <span className="text-emerald-600 font-semibold">✓ Correct!</span>
                    ) : (
                      'Type above to test'
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSandboxRevealed(!sandboxRevealed)}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    {sandboxRevealed ? 'Hide' : 'Reveal'}
                  </button>
                </div>
              </div>

              <Link
                to="/register"
                className="clay-btn-accent w-full py-3 text-center text-sm font-semibold block text-white"
              >
                Save This to Your Free Deck ➔
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Feature Bento Grid ── */}
      <section
        id="features"
        className="py-16 sm:py-24 bg-surface-muted/40 border-t border-border/60"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6 space-y-12">
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <h2 className="text-xs font-bold uppercase tracking-wider text-accent">
              Engineered For Mastery
            </h2>
            <h3 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
              Everything you need. Zero bloat.
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Tile 1 */}
            <div className="clay-card p-6 sm:p-8 space-y-4">
              <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                <FileTextIcon className="h-6 w-6" />
              </div>
              <h4 className="text-xl font-bold text-foreground">Document & Image OCR</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Drag-and-drop lecture slides, PDFs, or photos of textbooks. Saulado extracts
                sentences and turns highlighted phrases into instant recall cards.
              </p>
            </div>

            {/* Tile 2 */}
            <div className="clay-card p-6 sm:p-8 space-y-4">
              <div className="h-12 w-12 rounded-2xl bg-accent/10 text-accent flex items-center justify-center">
                <FlameIcon className="h-6 w-6" />
              </div>
              <h4 className="text-xl font-bold text-foreground">SM-2 Spaced Algorithm</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Scientifically calculated review intervals. Review cards right at the peak of the
                forgetting curve to cement concepts into permanent memory.
              </p>
            </div>

            {/* Tile 3 */}
            <div className="clay-card p-6 sm:p-8 space-y-4">
              <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                <BookOpenIcon className="h-6 w-6" />
              </div>
              <h4 className="text-xl font-bold text-foreground">Starter Seed Decks</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Explore curated foundational decks in Computer Science, World History, and Human
                Physiology with 1-click bundle import.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final Call to Action ── */}
      <section className="py-20 sm:py-28 text-center relative overflow-hidden">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 space-y-8">
          <div className="clay-card p-8 sm:p-14 space-y-6 bg-gradient-to-b from-surface via-surface to-primary/5">
            <MascotSprite className="mx-auto" />
            <div className="space-y-3 max-w-xl mx-auto">
              <h3 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
                Ready to transform the way you learn?
              </h3>
              <p className="text-sm sm:text-base text-muted-foreground">
                Join thousands of students mastering complex subjects with contextual spaced recall.
              </p>
            </div>
            <div className="pt-2">
              <Link
                to="/register"
                className="clay-btn-primary px-8 py-3.5 text-base font-semibold inline-flex items-center gap-2 text-white shadow-md"
              >
                Create Free Account
                <ChevronRightIcon className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Minimalist Footer ── */}
      <footer className="mt-auto border-t border-border/60 py-8 bg-background">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2 font-medium">
            <Logo className="h-5 w-5" />
            <span>© 2026 Saulado. Built for active recall.</span>
          </div>
          <div className="flex items-center gap-6">
            <Link to="/login" className="hover:text-foreground transition-colors">
              Sign In
            </Link>
            <Link to="/register" className="hover:text-foreground transition-colors">
              Register
            </Link>
            <a href="#how-it-works" className="hover:text-foreground transition-colors">
              Overview
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
