# Mobile Tab Navigation & View Analysis (Saulado)

This document provides a comprehensive UI/UX, architectural, and visual evaluation of the mobile navigation tabs in `c:\projects\saulado\mobile`. It is structured to provide full context and actionable recommendations for redesigning the tab experience with design and engineering agents.

---

## 1. Architecture & Technical Breakdown

### 1.1 Layout Navigator & Route Mapping

- **File**: [`mobile/app/(app)/_layout.tsx`](file:///c:/projects/saulado/mobile/app/%28app%29/_layout.tsx)
- **Engine**: Expo Router (`Tabs` component from `expo-router`).
- **Structure**: All top-level screens and sub-routes are registered inside a single flattened `Tabs` navigator.
- **Header Configuration**:
  - Global header styled with `--background` token to appear flush with screen content.
  - Header right hosts [SettingsButton](file:///c:/projects/saulado/mobile/app/%28app%29/_layout.tsx#L63-L79) and [ThemeToggle](file:///c:/projects/saulado/mobile/components/theme-toggle.tsx).
  - Header left renders [ChevronLeftIcon](file:///c:/projects/saulado/mobile/components/icons.tsx) back navigation for child routes (`scan`, `sets/[setId]`, `files/[fileId]`, `bag-studio`).
  - [study.tsx](file:///c:/projects/saulado/mobile/app/%28app%29/study.tsx) sets `headerShown: false` for full-screen flashcard focus.

### 1.2 Custom Tab Bar Architecture

- **File**: [`mobile/components/tab-bar.tsx`](file:///c:/projects/saulado/mobile/components/tab-bar.tsx)
- **Type**: Asymmetric Dual-Island Floating Bar (`position: 'absolute'`, bottom-pinned with safe area insets).
- **Component Anatomy**:
  1. **Left Island (Solo Action Button / FAB)**:
     - 56×56 circular floating button.
     - Painted in `--accent` (`#e8593a` terracotta / clay).
     - Context-aware action:
       - **Online**: Shows `ScanIcon` → Navigates to `/scan` (camera OCR).
       - **Offline**: Shows `FileTextIcon` → Navigates to `/scan-review?mode=paste` (manual card creator).
  2. **Right Island (Navigation Pill)**:
     - Height: 56px, `rounded-2xl`, flex-1 horizontal pill.
     - Background: Hardcoded deep forest green `#052e24` in light mode; `dark:bg-surface` with `dark:border-border/80` in dark mode.
     - Contains 4 tabs:
       - **Home**: `index` (`HomeIcon`)
       - **Sets**: `sets/index` (`LayersIcon`)
       - **Files**: `files/index` (`FolderIcon`)
       - **Account**: `account` (`UserIcon`)
     - **Visual Indicator**: Active tab renders a white icon (`#ffffff`) with a 4px circular dot underneath; inactive tabs render muted sage-slate (`#86a39b`) with no dot.
     - **Labels**: Icon-only (no typography labels).
- **Hiding Logic**:
  - Unconditionally returns `null` when current route is `study`, `scan`, `scan-review`, or `files/bag-studio`.

---

## 2. Detailed Breakdown of Current Tab Views

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              TOP HEADER                                 │
│  [Screen Title]                                  [Settings] [Theme]    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  TAB 1: HOME (index.tsx)                                                │
│  - Greeting ("Good morning/afternoon, Student ✨") & Date               │
│  - Metric Chips: Streak / Due Now / Active Sets                         │
│  - 1-Tap Quick Action Row: Scan / Quick Learn / New Set / Progress      │
│  - Featured Session Deck (Hero Card with "Study Now" CTA)               │
│  - Habit & Progress Section: Daily goal ring + Sparkline                │
│  - Recent Sets list with card counts and study status                   │
│                                                                         │
│  TAB 2: SETS (sets/index.tsx)                                           │
│  - Persistent Search bar (debounced live card/set search)               │
│  - Mode Switcher: Browse Mode vs Search Mode                            │
│  - Priority Deck Hero Card (large banner with mastery progress bar)     │
│  - Hierarchical Subject Tree (Folder & deck hierarchy)                  │
│  - Filter Chips (Due Now / Never Studied / Scheduled)                   │
│                                                                         │
│  TAB 3: FILES (files/index.tsx)                                         │
│  - Header with Study Bag Trigger (`Bag (N)`) + `+ Import` button        │
│  - Segmented Scope Switcher: [📱 Device Files] vs [☁️ Cloud Files]       │
│  - Storage Stats Card (Local storage footprint, PDF count)              │
│  - Format Chips: All / PDF / Images / Audio / Markdown                  │
│  - Document cards with OCR preview and "Create Cards" workflow          │
│                                                                         │
│  TAB 4: ACCOUNT (account.tsx)                                           │
│  - User identity badge & Logout button                                  │
│  - Avatar picker & Display name editor                                  │
│  - Embedded Learning Analytics: Heatmap calendar, accuracy trends       │
│  - Archived Sets recovery list                                          │
│  - Data export/import (JSON backup) & Security danger zones             │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                        FLOATING TAB BAR ISLANDS                         │
│  [ (📷) SCAN FAB ]     [ (🏠 Home)   (📚 Sets)   (📁 Files)   (👤 User) ]│
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. UI / UX Evaluation (Strengths & Friction Points)

### 3.1 Strengths

1. **Strong Brand Identity**:
   - The forest teal (`#052e24`) combined with terracotta accent (`--accent`) gives Saulado a distinct, scholarly, organic aesthetic far removed from generic purple/blue SaaS palettes.
2. **High-Value Scan Affordance**:
   - Elevating the capture feature (Camera OCR / Notes scanning) into a solo FAB emphasizes the app's core differentiator: turning real-world paper notes and PDFs into study decks.
3. **Offline-Resilient Logic**:
   - Both the tab bar scan button and the tab views gracefully pivot when offline (e.g. Scan button swaps to text paste; Files tab highlights locally downloaded files; Sets shows offline-cached decks).

### 3.2 Key UX Friction Points

1. **Ergonomic Handedness Imbalance**:
   - The Scan button sits on the **far left edge**. Over 85% of users navigate single-handed with their right thumb. Hitting the primary action button requires reaching across the screen or switching to a two-handed grip.
2. **Cognitive Load of Icon-Only Tabs**:
   - Modern usability heuristics recommend micro-labels for 4+ tab configurations.
   - `LayersIcon` is used for "Sets", which can be confused with "Layers / Flashcard stack".
   - `UserIcon` represents "Account", but inside that screen lies the user's **Progress Analytics, Study Heatmap, and Daily Review statistics**. Users looking for their learning progress don't intuitively tap the user profile icon.
3. **Dead End in Quick Actions**:
   - On `index.tsx`, the `QuickActionRow` has a button:
     ```tsx
     onProgress={() => router.push('/progress')}
     ```
     However, `/progress` does **not exist** in `SCREENS`. The progress view is actually trapped inside `account.tsx` as `<ProgressSection />`.
4. **Theme Inconsistency in Light Mode**:
   - In `tab-bar.tsx`, the pill background in light mode is hardcoded as `bg-[#052e24]` (a dark forest green) over a very light sage page (`#f3f8f5`). While high-contrast, it behaves like an inverted dark-mode widget while the rest of the screen is in light mode.
5. **Scroll View Clipping & Absolute Position Hazard**:
   - The floating tab bar floats above content with `position: 'absolute'`. Every screen must manually enforce bottom padding (`paddingBottom: Math.max(insets.bottom + 96, 128)`). In smaller devices or nested modal sheets, content frequently clips underneath the bar.
6. **Abrupt Visibility Transitions**:
   - When entering `study` or `scan`, the tab bar abruptly disappears (`return null`). There is no layout animation or slide-down transition, creating a jarring visual flicker.
7. **Narrow Hit Target Density**:
   - The 4 tab items are packed into a `flex: 1` pill alongside the 56px FAB. On devices with narrow screens (360px–375px), touch zones for the 4 inner tabs sit tightly together without adequate tap forgiveness zones.

---

## 4. Redesign Directions & Proposals for Agent Discussions

### Direction 1: The "Habit & Retention" Information Architecture (Recommended)

**Core Idea**: Promote Learning Analytics (Progress) to a primary tab and move Account/Profile to the Top-Right Header.

- **Top Header**:
  - Left: Saulado Brand Mark / Current Subject context.
  - Right: Streak Badge (`🔥 5`) + User Avatar button (tapping opens Account/Settings modal).
- **Bottom Navigation (5 Items)**:
  1. **Home**: Dashboard, Daily Goal, Quick Study.
  2. **Sets**: Flashcard decks, categories, deck creator.
  3. **Scan (Center Hero FAB)**: Symmetrical center-docked or elevated circular button.
  4. **Progress**: Heatmap, accuracy charts, retention metrics (extracted from Account).
  5. **Files**: PDF & Document reader, study bag.

### Direction 2: The Unified Floating Island (Modern Glassmorphism)

**Core Idea**: Merge the disjointed "Left FAB + Right Pill" into a single coherent floating bar with an elevated center button.

- Single pill container with fluid spring physics (`react-native-reanimated`).
- Elevated center Scan button that breaks the top plane of the pill by 8px with an active glow.
- Blur backdrop using `expo-blur` or semi-transparent surface tokens so underlying cards softly diffuse during scrolling.
- Pill background dynamically adapts to theme tokens (`--surface` with subtle border) rather than hardcoded hex.

### Direction 3: Dynamic Expanding Tab Labels (Micro-Interaction Polish)

**Core Idea**: Eliminate icon ambiguity without bloating horizontal space.

- Inactive tabs show icon only.
- The active tab smoothly expands to reveal its label text beside the icon using spring width animation:
  ```
  [ 🏠 Home ]   (📚)   (📷)   (📈)   (📁)
  ```
- Gives immediate confirmation of screen context and eliminates icon misinterpretation.

---

## 5. Architectural Checklist for Implementation

When ready to redesign with the subagents, address these files in order:

1. [`mobile/components/tab-bar.tsx`](file:///c:/projects/saulado/mobile/components/tab-bar.tsx):
   - Replace hardcoded hex `#052e24` with theme token variables (`--surface`, `--surface-muted`, `--border`).
   - Add Reanimated layout animation for smooth show/hide transitions during Study/Scan sessions.
   - Expand touch target hit areas (`hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}`).
2. [`mobile/app/(app)/_layout.tsx`](file:///c:/projects/saulado/mobile/app/%28app%29/_layout.tsx):
   - Align `SCREENS` array with the desired information architecture.
   - Clean up navigation routes (e.g. resolve `/progress` routing).
3. [`mobile/app/(app)/index.tsx`](file:///c:/projects/saulado/mobile/app/%28app%29/index.tsx):
   - Update quick actions to route correctly to new or refactored tab destinations.
