# Saulado — User Guide & Study Handbook

> **Learn in Context. Remember for Life.**  
> A smart, context-based active recall study app for students, lifelong learners, and academic reviewers.

---

## Table of Contents

1. [What is Saulado?](#what-is-saulado)
2. [First-Time User Guide (Get Started in 3 Minutes)](#first-time-user-guide-get-started-in-3-minutes)
3. [Recommended Study Workflow](#recommended-study-workflow)
4. [Complete Feature Guide by Module](#complete-feature-guide-by-module)
   - [Module 1: Account Creation & Authentication](#module-1-account-creation--authentication)
   - [Module 2: Dashboard & Daily Hub](#module-2-dashboard--daily-hub)
   - [Module 3: Study Sets & Deck Management](#module-3-study-sets--deck-management)
   - [Module 4: Files Repository & Cloud Document Storage](#module-4-files-repository--cloud-document-storage)
   - [Module 5: Note Scanner & OCR Text Importer](#module-5-note-scanner--ocr-text-importer)
   - [Module 6: Interactive PDF Reader & Document Viewer](#module-6-interactive-pdf-reader--document-viewer)
   - [Module 7: Text Selection & Multi-Color Highlighting](#module-7-text-selection--multi-color-highlighting)
   - [Module 8: Snippet Bag (Study Bag)](#module-8-snippet-bag-study-bag)
   - [Module 9: Bag Studio & Split Card Studio](#module-9-bag-studio--split-card-studio)
   - [Module 10: Card Generation & Context Cloze Highlighting](#module-10-card-generation--context-cloze-highlighting)
   - [Module 11: Study Modes (Flashcard, Multiple Choice, Type-in Cloze)](#module-11-study-modes)
   - [Module 12: Study Sessions & Queue Management](#module-12-study-sessions--queue-management)
   - [Module 13: Progress Tracking & Analytics](#module-13-progress-tracking--analytics)
   - [Module 14: Offline Mode & Local Storage](#module-14-offline-mode--local-storage)
   - [Module 15: Cross-Device Syncing & Background Sync](#module-15-cross-device-syncing--background-sync)
   - [Module 16: Profile & Account Settings](#module-16-profile--account-settings)
5. [Mobile App User Guide](#mobile-app-user-guide)
6. [Web App User Guide](#web-app-user-guide)
7. [Step-by-Step User Workflows](#step-by-step-user-workflows)
   - [Workflow 1: Create a Study Set from Scratch](#workflow-1-create-a-study-set-from-scratch)
   - [Workflow 2: Import Notes and Generate Cards](#workflow-2-import-notes-and-generate-cards)
   - [Workflow 3: Scan Printed Notes using OCR & Paste Flow](#workflow-3-scan-printed-notes-using-ocr--paste-flow)
   - [Workflow 4: Read a PDF and Add Snippets to Bag](#workflow-4-read-a-pdf-and-add-snippets-to-bag)
   - [Workflow 5: Generate Cards from Snippets](#workflow-5-generate-cards-from-snippets)
   - [Workflow 6: Study Using Different Modes](#workflow-6-study-using-different-modes)
   - [Workflow 7: Continue Studying Offline](#workflow-7-continue-studying-offline)
   - [Workflow 8: Sync Changes When Internet Returns](#workflow-8-sync-changes-when-internet-returns)
8. [Frequently Asked Questions (FAQ)](#frequently-asked-questions-faq)

---

## What is Saulado?

Most flashcard apps force you to memorize isolated words detached from reality: front of the card has a vocabulary word, back has a dictionary definition. When test day arrives or when you need that knowledge in clinical practice, legal analysis, or engineering exams, you struggle to recall how the concept actually fits together.

**Saulado changes this with Context-Based Active Recall:**

1. **Full-Sentence Context**: Instead of fragmented terms, you work with complete paragraphs, textbook excerpts, lecture definitions, and legal provisions.
2. **Interactive Cloze Blanks**: You highlight key phrases or technical terms within the sentence. Saulado turns them into dynamic blanks (`[ 1 ]`, `[ 2 ]`) while leaving the surrounding sentence structure intact.
3. **Scientific Spaced Repetition (SM-2)**: Saulado calculates the optimal interval before you forget a concept, prompting you to review right when memory decay begins.
4. **Offline-First Architecture**: Your flashcards, review history, and notes remain accessible on your mobile phone even in airplane mode, subway commutes, or rural campuses without internet.

![Screenshot: Saulado Concept & Context Card Example](assets/screenshots/concept-preview.png)

---

## First-Time User Guide (Get Started in 3 Minutes)

Welcome to Saulado! Follow these quick steps to make your very first flashcard deck and complete your first study session:

### Step 1: Create an Account

1. Open the Saulado Web App in your browser or launch the Mobile App on your Android device.
2. Tap **Get Started** or **Create Account**.
3. Enter your Name, Email, and Password. Tap **Sign Up**.

### Step 2: Create Your First Study Set

1. From the Home Dashboard, click or tap the **+ New Set** button.
2. Enter a title (for example: _Human Anatomy 101_ or _Criminal Law Fundamentals_).
3. Choose an accent color and click **Create Set**.

### Step 3: Add Your First Context Card

1. Inside your new study set, tap **Add Card** (or use **Paste Notes** from the dashboard).
2. Type or paste a complete sentence:
   > _"The mitochondria produces adenosine triphosphate through aerobic respiration, serving as the cell's primary energy generator."_
3. Highlight the word **mitochondria** with your mouse cursor or finger. Saulado immediately converts it into blank `[1]`.
4. Highlight **adenosine triphosphate**. It converts into blank `[2]`.
5. Tap **Save Card**.

### Step 4: Run a 60-Second Study Session

1. Tap **Study Now** at the top of your set.
2. Choose your preferred study mode: **Flashcard** (Flip & rate), **Multiple Choice**, or **Type-in Blank**.
3. Complete the questions, review your instant accuracy score, and watch your daily study streak ignite!

![Screenshot: First Time Onboarding Flow](assets/screenshots/first-time-onboarding.png)

---

## Recommended Study Workflow

To maximize long-term retention and study efficiently for major exams, follow this proven 5-stage learning cycle in Saulado:

```
┌────────────────────────────────────────────────────────────────────────┐
│ 1. IMPORT & READ      Upload your syllabus, lecture slides, or PDF     │
│    (Files Hub)        textbooks directly into the Saulado Files Hub.   │
├────────────────────────────────────────────────────────────────────────┤
│ 2. COLLECT SNIPPETS   Read in Visual or Reader mode. Highlight key     │
│    (Snippet Bag)      passages and tap "Add to Bag" as you read.       │
├────────────────────────────────────────────────────────────────────────┤
│ 3. CRAFT CLOZE CARDS  Open Bag Studio (or Split Studio on Web). Step   │
│    (Card Studio)      through your notes, blank out key terms, & save. │
├────────────────────────────────────────────────────────────────────────┤
│ 4. ACTIVE RECALL      Test yourself using Multiple Choice or Type-in   │
│    (Study Sessions)   Cloze mode to build high-stakes recall power.   │
├────────────────────────────────────────────────────────────────────────┤
│ 5. SPACED REVIEWS     Open the app daily. Saulado prompts only cards   │
│    (SM-2 Algorithm)   due for review, saving you hours of re-reading. │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Complete Feature Guide by Module

---

### Module 1: Account Creation & Authentication

#### What It Does

Provides secure personal accounts so your study sets, reading highlights, progress metrics, and flashcard queues are safely preserved and synchronized across all your devices.

#### Why Students Would Use It

Students switch between laptop workstations during campus library sessions and mobile phones while commuting or studying in bed. An account ensures you never lose study progress.

#### Step-by-Step Instructions

1. Navigate to the login screen.
2. To create a new account, click or tap **Create an Account**.
3. Fill in your full name, email address, and a secure password (minimum 8 characters).
4. Tap **Sign Up**. You are automatically signed in to your personal dashboard.
5. If you forget your password, click **Forgot Password?** on the login screen, enter your email address, and follow the password reset link sent to your inbox.

#### Expected Result

You gain access to your personalized cloud dashboard with a welcome banner tailored to the time of day (_Good morning_, _Good afternoon_, _Good evening_).

![Screenshot: Account Login & Registration](assets/screenshots/auth-screens.png)

---

### Module 2: Dashboard & Daily Hub

#### What It Does

Serves as your study command center. It highlights cards due for review, active study streaks, recent study sets, quick creation shortcuts, and daily review targets.

#### Why Students Would Use It

Eliminates decision fatigue. Instead of wondering _"What should I study today?"_, the dashboard immediately presents the cards that require memory reinforcement today.

#### Step-by-Step Instructions

1. Open the Saulado app.
2. Look at the top metric cards:
   - **Cards Due**: Number of flashcards awaiting review today.
   - **Daily Streak**: Number of consecutive days you have completed study reviews.
   - **Daily Review Goal**: Circular progress ring showing your progress towards your daily target (e.g., 15/20 cards).
3. Tap **Study Due Cards** (or **Review Now**) to launch into your daily review session immediately.
4. Use the **Quick Actions** row to:
   - **Paste Notes to Cards**: Instant card generation from raw text.
   - **New Study Set**: Create a new deck.
   - **Browse Files**: Jump into your uploaded PDFs.
   - **Starter Decks (Web)**: Load pre-built decks in medicine, psychology, law, or languages.

#### Expected Result

You get an instant snapshot of your academic workload and can begin learning in one click.

![Screenshot: Dashboard & Daily Hub](assets/screenshots/dashboard.png)

---

### Module 3: Study Sets & Deck Management

#### What It Does

Allows you to create, organize, color-code, and manage collections of context flashcards.

#### Why Students Would Use It

Keeps course subjects compartmentalized. You can separate _Organic Chemistry_ from _Microeconomics_ and track mastery stats independently.

#### Step-by-Step Instructions

1. Click or tap **Sets** in the navigation menu.
2. Tap the **+ (New Set)** button.
3. Provide a clear title (e.g., _Biochemistry: Glycolysis Pathway_) and an optional description.
4. Select an accent color (Sage Green, Forest Dark, Ocean Blue, Coral, or Amber) to visually categorize your deck.
5. Tap **Create Set**.
6. Inside the set detail view, you can:
   - Tap **Add Card** to create individual context cards.
   - Tap **Paste Notes** to generate cards in bulk.
   - Tap **Study** to begin practice.
   - Tap the three dots (`•••`) menu to edit the title, export as JSON, or delete the set.

#### Expected Result

A clean, card-grid view showing card counts, due count badges, and last-studied timestamps for each subject deck.

![Screenshot: Study Sets Management](assets/screenshots/study-sets.png)

---

### Module 4: Files Repository & Cloud Document Storage

#### What It Does

A built-in cloud drive inside Saulado where you can upload, organize into folders, preview, and read your course materials (PDF textbooks, syllabi, lecture presentations, and research papers).

#### Why Students Would Use It

Eliminates jumping between an external PDF reader, a cloud drive, and a flashcard tool. You read documents directly inside the study environment where cards are created.

#### Step-by-Step Instructions

1. Open the **Files** tab from the main navigation bar.
2. To organize materials, tap **New Folder** and name it (e.g., _Midterm Readings_).
3. Tap **Upload File** (or drag and drop a PDF on Web).
4. Select a PDF document from your phone storage or computer.
5. Once uploaded, the document card displays the file title, page count, file size, and upload date.
6. Tap any file to open the interactive document reader.

#### Expected Result

Your study files are securely stored, searchable, and ready for instant reading and snippet extraction.

![Screenshot: Files Repository](assets/screenshots/files-repository.png)

---

### Module 5: Note Scanner & OCR Text Importer

> **Implementation Status**:
>
> - **Paste Notes to Cards**: Fully operational, high-speed, and **100% offline-ready** on both Web and Mobile.
> - **Live Camera Optical Character Recognition (OCR)**: _Planned / Experimental_. Direct camera viewfinder auto-capture is in active R&D for a future native update. In the meantime, use your phone camera's built-in "Copy Text from Photo" feature or paste transcribed text directly into Saulado!

#### What It Does

Lets you paste large blocks of lecture notes, textbook summaries, syllabus bullet points, or scanned text into Saulado. The system automatically segments the text by paragraphs or numbered list items (`1.`, `2.`, `•`) into distinct cards, normalizes punctuation, and provides a quick cloze highlighting workspace.

#### Why Students Would Use It

Typing flashcards one by one is slow. With Note Importer, you can paste an entire page of notes and create 10 flashcards in under two minutes.

#### Step-by-Step Instructions

1. On Mobile: Tap the elevated **Center Button (Note Icon)** in the bottom navigation bar, or select **Paste Notes** from the dashboard.  
   On Web: Click **Paste to Cards** in the Dashboard quick actions or set detail view.
2. Select your target **Study Set** from the dropdown menu (or choose _Create New Set_).
3. Paste your notes into the large text area.
4. (Optional) Tap the **Enhance Notes (Magic Wand)** button to clean up line breaks, stray bullet marks, and quotation marks.
5. Tap **Done Editing / Highlight Answers**.
6. Saulado renders each paragraph as a distinct card preview:
   - Highlight the critical answer keywords in each paragraph.
   - Blanks are automatically numbered `[1]`, `[2]`, etc.
7. Tap **Save Cards to Set**.

#### Expected Result

All segmented paragraphs are saved into your study deck as full-sentence context flashcards. On mobile, this works completely offline and synchronizes when you reconnect.

![Screenshot: Paste Notes to Cards](assets/screenshots/paste-cards.png)

---

### Module 6: Interactive PDF Reader & Document Viewer

#### What It Does

A high-performance document reader tailored specifically for studying. It offers both a **Visual Canvas Mode** (exact PDF page rendering with tables, diagrams, and figures) and a **Reader Mode** (clean, readable text optimized for distraction-free reading).

#### Why Students Would Use It

Reading academic PDFs on mobile or desktop is often clunky. Saulado lets you zoom, jump between pages, highlight text, and instantly convert paragraphs into flashcards without leaving the document.

#### Step-by-Step Instructions

1. Open any PDF from the **Files** repository.
2. Switch between modes using the top toggle:
   - **Visual Mode**: High-fidelity page layouts, charts, and mathematical formulas. Supports pinch-to-zoom on mobile and wheel zoom on web.
   - **Reader Mode**: Distraction-free, responsive text layout with comfortable line heights for long study sessions.
3. Use the page navigation bar at the bottom to jump to specific pages.
4. Select text by dragging your finger or cursor over sentences to bring up the study action popover.

#### Expected Result

Crisp document rendering with interactive text selection overlays on top of the document.

![Screenshot: Interactive PDF Reader](assets/screenshots/pdf-reader.png)

---

### Module 7: Text Selection & Multi-Color Highlighting

#### What It Does

Allows you to highlight important passages in your uploaded PDFs using five student-friendly colors (Yellow, Green, Blue, Pink, and Purple) and trigger instant study actions.

#### Why Students Would Use It

Color-coding helps categorize concepts (e.g., Yellow for core definitions, Green for examples, Pink for exam warnings). Highlighting passages makes skimming before exams effortless.

#### Step-by-Step Instructions

1. Inside the PDF reader, drag across any sentence or paragraph.
2. An interactive floating popover appears with three actions:
   - **Highlight**: Applies your active color to the text and stores it in your document memory.
   - **Add to Bag**: Stashes the selected text into your Snippet Bag for later batch card creation.
   - **Make Card**: Opens the Quick Card creator immediately with this sentence loaded.
3. To switch highlight colors, tap the color palette circle in the top toolbar.

#### Expected Result

Your document retains your colored highlights across sessions, and selected text can be converted into study cards with one tap.

![Screenshot: Text Selection & Multi-Color Highlighting](assets/screenshots/text-selection.png)

---

### Module 8: Snippet Bag (Study Bag)

#### What It Does

A temporary study tray that collects text excerpts, formulas, and definitions as you read through books or lecture slides.

#### Why Students Would Use It

Stops the disruptive cycle of _"read one sentence, create one card, read one sentence, create one card"_. With the Snippet Bag, you stay in the reading flow, collect 10–15 important concepts, and then process them into flashcards all at once in **Bag Studio**.

#### Step-by-Step Instructions

1. As you read a PDF, select any sentence.
2. Tap **Add to Bag** in the selection menu.
3. Notice the floating **Shopping Bag icon** in the top-right corner increment its count (e.g., `(3)`).
4. Tap the **Bag icon** anytime to open the **Snippet Bag Tray**:
   - Preview all bagged excerpts with their source document name and page number.
   - Tap the trash icon to discard any accidental clips.
   - Tap **Open Bag Studio** (or **Clear Bag**).

#### Expected Result

Your harvested snippets are neatly organized and waiting for conversion into cloze cards.

![Screenshot: Snippet Bag Tray](assets/screenshots/snippet-bag.png)

---

### Module 9: Bag Studio & Split Card Studio

#### What It Does

- **On Mobile (Bag Studio)**: A focused, step-by-step card creation pipeline that loads your bagged snippets one by one so you can highlight answers rapidly.
- **On Web (Split Card Studio)**: A side-by-side workspace with the interactive PDF document on the right half of the screen and the Card Creation Studio + Study Bag queue on the left half.

#### Why Students Would Use It

It offers the fastest card creation experience available. You see your source material on one side and turn paragraphs into interactive questions on the other without switching tabs.

#### Step-by-Step Instructions

**On Mobile (Bag Studio)**:

1. Tap the Snippet Bag icon and tap **Open Bag Studio**.
2. Select your destination **Study Set**.
3. Snippet #1 is loaded into the highlight canvas. Highlight the target blank words.
4. Tap **Save & Next**. Snippet #1 is converted into a card, removed from your bag, and Snippet #2 immediately appears.
5. Continue until your bag is empty!

**On Web (Split Card Studio)**:

1. Open a PDF in the Files viewer and click **⚡ Split Studio** in the top header.
2. Your screen splits into two synchronized panels:
   - **Right Panel**: Full visual PDF. Drag across any sentence to instantly drop it into the left studio.
   - **Left Panel**: Card Editor and collapsible **Study Bag (N)** tray.
3. Highlight words in the left editor to make blanks.
4. Click **Save Card to Set**. The next note in your queue auto-loads automatically.

#### Expected Result

A batch of high-quality context cards produced in minutes, directly linked to source document context.

![Screenshot: Split Card Studio](assets/screenshots/split-card-studio.png)

---

### Module 10: Card Generation & Context Cloze Highlighting

#### What It Does

The core engine of Saulado. Converts highlighted words inside paragraphs into cloze deletion blanks (`[1]`, `[2]`), preserves sentence context, handles multi-part questions, and provides a quick mathematical/scientific symbol toolbar.

#### Why Students Would Use It

You don't need to manually type brackets like `{{c1::answer}}` (like in legacy flashcard apps). Simply drag your cursor or finger over text, and Saulado handles indexing, validation, and rendering automatically.

#### Step-by-Step Instructions

1. Open the card creator from any screen (Set detail, Paste Notes, or Bag Studio).
2. Write or paste your text:
   > _"The Supreme Court has the power of judicial review to declare a law unconstitutional under Article VIII of the Constitution."_
3. Highlight **judicial review**. A green pill badge with `[1]` replaces the selection.
4. Highlight **Article VIII**. A second badge with `[2]` appears.
5. Need scientific symbols? Tap any icon in the **Quick Symbols Bar** above the keyboard:
   - Bullet `•`, Em Dash `—`, Arrow `→`, Plus-Minus `±`, Exponents `²` `³`, Degree `°`, Approx `≈`, Inequality `≠` `≤` `≥`, Celsius `℃`, Pi `π`, Checkmark `✓`.
6. To undo a blank, tap the blanked word chip and click the remove `✕` icon.
7. Tap **Save Card**.

#### Expected Result

A complete context card stored with answer keys, character offsets, and auto-assigned ordinals.

![Screenshot: Context Cloze Highlighting](assets/screenshots/cloze-highlighting.png)

---

### Module 11: Study Modes

Saulado provides three distinct answering modes so you can practice at different levels of recall difficulty:

```
┌────────────────────────────────────────────────────────────────────────┐
│ 1. FLASHCARD MODE        Flip card to reveal answers. Rate your recall │
│    (Self-Rating)         ease (Again, Hard, Good, Easy) for SM-2.      │
├────────────────────────────────────────────────────────────────────────┤
│ 2. MULTIPLE CHOICE MODE  Choose the correct answers from auto-generated│
│    (Recognition)         distractor options. Great for initial review. │
├────────────────────────────────────────────────────────────────────────┤
│ 3. TYPE-IN CLOZE MODE    Type missing words directly into sentence     │
│    (Active Retrieval)    blank fields. True exam-level mastery.        │
└────────────────────────────────────────────────────────────────────────┘
```

#### Feature Comparison

| Feature              | Flashcard Mode            | Multiple Choice Mode     | Type-in Cloze Mode                 |
| -------------------- | ------------------------- | ------------------------ | ---------------------------------- |
| **Interaction**      | Flip & rate yourself      | Tap option A, B, C, or D | Type into blank input boxes        |
| **Cognitive Effort** | Moderate (self-monitored) | Light (recognition)      | Heavy (active retrieval)           |
| **Tolerance**        | Subjective                | Exact choice             | Smart typo tolerance (Levenshtein) |
| **Best For**         | Quick daily review passes | New decks / fast drills  | Final exam / board prep            |

#### Step-by-Step Instructions

1. Tap **Study** on any set or dashboard.
2. In the top toolbar, tap the **Mode Selector** pill:
   - Select **Flashcard**: The front displays the paragraph with missing blanks marked `[ ... ]`. Tap **Reveal Answer** (or spacebar) to flip. Rate your recall: **Again** (forgot), **Hard**, **Good**, or **Easy**.
   - Select **Multiple Choice**: Saulado extracts intelligent distractors from other cards in the deck. Tap your answer. Correct choices flash green; mistakes flash red with immediate correction.
   - Select **Type-in Blank**: Active `<input>` fields appear inside the sentence. Type the missing terms. Press Enter or tap **Submit**. Saulado checks your spelling and highlights discrepancies.

#### Expected Result

Accurate tracking of your answer performance regardless of which mode you use to practice.

![Screenshot: Three Study Modes](assets/screenshots/study-modes.png)

---

### Module 12: Study Sessions & Queue Management

#### What It Does

Orchestrates your study queue based on your selected practice mode:

- **Spaced Repetition (Default)**: Leverages the SM-2 algorithm. Serves cards due for review plus interleaved new cards.
- **Sequential**: Studies all cards in creation order ("learn this deck top to bottom").
- **Shuffled**: Randomizes all cards in the deck to challenge positional memory.
- **Retake Session**: Instant practice pass over the specific cards you missed or left blank in the prior session.

#### Why Students Would Use It

Enables flexible studying: use Spaced Repetition for long-term retention throughout the semester, Sequential when first learning a lecture, and Retake Mode right before an exam.

#### Step-by-Step Instructions

1. Open a study set.
2. Tap the chevron next to the **Study** button to reveal queue options:
   - **Spaced Review**
   - **Sequential Order**
   - **Shuffled Mix**
3. During a session, your progress is tracked by a progress bar (e.g., `Card 7 of 24`).
4. You can pause anytime; Saulado automatically remembers your exact card position.
5. At the end of the session, the **Session Summary Screen** displays:
   - Total Cards Studied
   - Overall Accuracy Rate (%)
   - Cards Mastered vs Cards to Review
   - A one-tap **Retake Missed Cards** button.

#### Expected Result

Continuous, structured study sessions with clear end-of-session performance metrics.

![Screenshot: Study Session & Summary](assets/screenshots/session-summary.png)

---

### Module 13: Progress Tracking & Analytics

#### What It Does

Provides deep visualization into your study habits, retention curves, daily goals, and mastery progression over time.

#### Why Students Would Use It

Seeing tangible progress builds study momentum and prevents cramming anxiety by proving you are mastering the material.

#### Step-by-Step Instructions

1. Tap the **Progress** tab in the navigation bar.
2. Review the analytics modules:
   - **Daily Review Goal Gauge**: Large circular gauge showing cards reviewed today against your target goal (e.g., `15 / 20 cards`, `75%`).
   - **Key Metrics Row**:
     - _Cards Mastered_: Total cards with stability rating ≥ 21 days.
     - _Cards Due_: Immediate reviews waiting in your queue.
     - _Review Accuracy_: All-time and 7-day average recall percentage.
   - **4-Week Activity Heatmap**: GitHub-style activity grid (4 rows × 7 days) color-coded by cards studied (0, 1–2, 3–4, 5+ cards).
   - **7-Day Accuracy Trend Line**: SVG graph mapping your day-by-day recall accuracy.

#### Expected Result

A comprehensive, data-driven view of your academic consistency and subject mastery.

![Screenshot: Progress Tracking Analytics](assets/screenshots/progress-analytics.png)

---

### Module 14: Offline Mode & Local Storage

#### What It Does

Allows complete mobile functionality—card creation, deck browsing, and full study sessions—without requiring an active Wi-Fi or cellular connection.

#### Why Students Would Use It

Campuses frequently have spotty Wi-Fi in basements, study halls, or transit lines. Saulado guarantees that your study session never freezes or loses data when internet drops.

#### Step-by-Step Instructions

1. Download your sets while online (or let Saulado automatically cache recent decks).
2. Switch your device to **Airplane Mode**.
3. Notice the subtle offline status badge in the header.
4. Continue studying:
   - Cards flip instantly from local device storage (SQLite).
   - Card ratings and answers are safely stored in your local mutation log.
   - You can create new cards via **Paste Notes** or manual input while offline.

#### Expected Result

Zero loading spinners, zero network timeouts, and uninterrupted studying wherever you are.

![Screenshot: Offline Mode Indicator](assets/screenshots/offline-mode.png)

---

### Module 15: Cross-Device Syncing & Background Sync

#### What It Does

Automatically uploads all offline reviews, new cards, and edits to the cloud server as soon as an internet connection is re-established.

#### Why Students Would Use It

You can study on the subway on your phone, then open your laptop at home and find all review intervals, streaks, and card edits perfectly up to date.

#### Step-by-Step Instructions

1. Complete study sessions or create cards while offline on your phone.
2. Reconnect your phone to Wi-Fi or cellular data.
3. Saulado’s background sync engine activates automatically:
   - Uses strict FIFO (First-In, First-Out) queueing to prevent conflicts.
   - Remaps temporary offline IDs to permanent cloud IDs.
   - Updates your cloud review schedule.
4. Open the Web App; your new cards and updated review intervals appear instantly.

#### Expected Result

Seamless, invisible synchronization without duplicate cards or lost review history.

![Screenshot: Background Syncing Flow](assets/screenshots/sync-flow.png)

---

### Module 16: Profile & Account Settings

#### What It Does

Enables personal customization, theme switching (Light Mode, Dark Mode, or System Match), email and password management, and data backup exports.

#### Why Students Would Use It

Adjusts the visual appearance for late-night study sessions (deep OLED dark mode) and safeguards personal account security.

#### Step-by-Step Instructions

1. Tap your avatar or the **Settings / Account** icon.
2. In the **Theme** section:
   - Choose **Dark** (OLED-friendly Deep Forest palette).
   - Choose **Light** (Crisp clean parchment palette).
   - Choose **System** (Follows your operating system schedule).
3. In the **Account** section:
   - Update your display name or email address.
   - Change your account password.
4. In the **Data Management** section:
   - Export your entire library of sets and cards as a JSON backup file.
   - Clear local document cache if you need to free up device storage.
5. Tap **Log Out** when using a public library workstation.

#### Expected Result

Personalized app styling and complete control over your study data.

![Screenshot: Profile & Settings](assets/screenshots/settings.png)

---

## Mobile App User Guide

The Saulado Mobile App is designed for one-handed thumb navigation and high-speed mobile study:

```
┌────────────────────────────────────────────────────────┐
│                     SAULADO MOBILE                     │
│                                                        │
│  [ Home ]  [ Sets ]     ( 📄 )     [ Progress ] [Files]│
│                          FAB                           │
└────────────────────────────────────────────────────────┘
```

### Bottom Navigation Pill Bar

The floating bottom pill bar gives you one-tap access to all 5 primary screens:

1. **Home (House Icon)**: Today's greeting, due cards count, daily streak, and quick action cards.
2. **Sets (Layers Icon)**: All your subject folders, study decks, and card counts.
3. **Center Hero Button (Document Icon)**: Elevated circular quick-action button that immediately opens **Paste Notes to Cards** for instant card creation.
4. **Progress (Trending Chart Icon)**: Daily review gauge, activity heatmap, accuracy trends, and mastery statistics.
5. **Files (Folder Icon)**: Your uploaded PDF documents, folders, and Snippet Bag tray.

### Mobile Gestures & Shortcuts

- **Swipe Between Flashcards**: In Flashcard Mode, tap anywhere on the card to flip between question and answer.
- **Pinch-to-Zoom**: In PDF Visual Mode, use standard two-finger pinch to inspect detailed diagrams and charts.
- **Keyboard-Safe Toolbar**: During card editing, the quick symbol bar and action buttons remain pinned directly above your soft keyboard so buttons are never hidden behind keyboard popups.

### Android Direct Install & NFC Support

- Students can install the Android APK directly.
- **NFC Quick-Launch**: Tap a Saulado-programmed NFC study badge or desk sticker with your phone to instantly launch the app or open today's due cards session.

![Screenshot: Mobile App Navigation & Pill Bar](assets/screenshots/mobile-guide.png)

---

## Web App User Guide

The Saulado Web App is optimized for desktop and laptop environments with wide-screen displays, mouse precision, and physical keyboards:

### Split Card Studio

When viewing any PDF on desktop, click **⚡ Split Studio** in the top header. Your browser transforms into a dual-pane workstation:

- **Left Pane (Card Studio & Study Bag)**: Drag-and-drop highlight editor, symbol insertion keys, and active queue of bagged notes.
- **Right Pane (Visual PDF Viewer)**: In-memory PDF canvas with instant text selection.

### Starter Seed Decks

Need to start studying immediately? On the Web Dashboard, click **Starter Decks** to import professionally structured starter cards across:

- Human Anatomy & Physiology
- Cognitive Psychology
- Constitutional Law
- Medical Terminology
- World Geography & Capitals
- Japanese Hiragana & Katakana

### Universal JSON Import & Export

Easily back up your decks or share sets with classmates. Click **Import Decks** to paste or drop any standard Saulado JSON backup file.

### Desktop Keyboard Shortcuts

| Shortcut | Action                                              |
| -------- | --------------------------------------------------- |
| `Space`  | Flip Flashcard / Reveal Answer                      |
| `1`      | Rate card: **Again** (Forgot)                       |
| `2`      | Rate card: **Hard**                                 |
| `3`      | Rate card: **Good**                                 |
| `4`      | Rate card: **Easy**                                 |
| `Enter`  | Submit Type-in Cloze Answer / Continue to Next Card |
| `Esc`    | Close Dialog / Exit Study Session                   |

![Screenshot: Web App Split Studio & Desktop Interface](assets/screenshots/web-guide.png)

---

## Step-by-Step User Workflows

---

### Workflow 1: Create a Study Set from Scratch

1. **Step 1**: From the Dashboard or Sets screen, click **+ New Set**.
2. **Step 2**: Enter Set Title: _Cellular Biology — Unit 1_.
3. **Step 3**: Select a theme color badge (e.g., _Forest Green_). Click **Create**.
4. **Step 4**: Inside the empty set, tap **Add Card**.
5. **Step 5**: In the paragraph text box, type:
   > _"The cell membrane is composed of a phospholipid bilayer with hydrophilic heads pointing outward and hydrophobic tails shielded inward."_
6. **Step 6**: Highlight the words **phospholipid bilayer**. Saulado turns them into `[1]`.
7. **Step 7**: Highlight **hydrophilic heads**. Saulado marks them as `[2]`.
8. **Step 8**: Highlight **hydrophobic tails**. Saulado marks them as `[3]`.
9. **Step 9**: Click **Save Card**.
10. **Result**: Your first context card is created with three coordinated blanks.

---

### Workflow 2: Import Notes and Generate Cards

1. **Step 1**: Open the app and tap **Paste Notes** (or the Center Hero button on mobile).
2. **Step 2**: Select your destination set (_European History_).
3. **Step 3**: Paste your multi-paragraph lecture notes:
   > _"The Treaty of Versailles was signed on June 28, 1919, officially ending World War I._
   >
   > _The League of Nations was founded in 1920 as the first worldwide intergovernmental organization tasked with maintaining world peace."_
4. **Step 4**: Tap **Enhance Notes** to clean formatting and normalize line spacing.
5. **Step 5**: Tap **Done Editing / Highlight Answers**.
6. **Step 6**: On Card 1, highlight **Treaty of Versailles** and **June 28, 1919**.
7. **Step 7**: On Card 2, highlight **League of Nations** and **1920**.
8. **Step 8**: Tap **Save All Cards**.
9. **Result**: Multiple cards are saved simultaneously into your study set.

---

### Workflow 3: Scan Printed Notes using OCR & Paste Flow

> _Direct camera auto-capture OCR is currently in active development ("Planned / Experimental"). Here is the fastest, reliable method used by students today:_

1. **Step 1**: Take a photo of your printed textbook page or handwritten notes using your phone's camera.
2. **Step 2**: Use your phone's native text detection (iOS Live Text or Google Lens / Android text selection) to copy the text from the photo.
3. **Step 3**: Open Saulado and tap the **Center FAB (Note Icon)**.
4. **Step 4**: Paste the scanned text into the editor.
5. **Step 5**: Tap the **Magic Wand (Enhance)** button. Saulado automatically removes awkward line wraps, fixes hyphens, and cleans stray characters.
6. **Step 6**: Tap **Highlight Answers**.
7. **Step 7**: Highlight the key answers you want to test yourself on.
8. **Step 8**: Tap **Save Cards to Set**.
9. **Result**: Printed textbook pages are converted into clean digital active recall cards in seconds.

---

### Workflow 4: Read a PDF and Add Snippets to Bag

1. **Step 1**: Go to **Files** and tap on your syllabus or textbook PDF (_Neuroscience 4th Edition.pdf_).
2. **Step 2**: Read through Chapter 2 in **Visual Mode** or **Reader Mode**.
3. **Step 3**: Locate an important definition:
   > _"Action potentials operate under the all-or-none law, meaning a neuron fires completely or does not fire at all."_
4. **Step 4**: Drag your finger or mouse across this sentence.
5. **Step 5**: In the popup menu, tap **Add to Bag**.
6. **Step 6**: Continue reading. Select another sentence about _neurotransmitters_ and tap **Add to Bag**.
7. **Result**: The Snippet Bag counter in the top bar updates to `(2)`, safely storing both excerpts without interrupting your reading flow.

---

### Workflow 5: Generate Cards from Snippets

1. **Step 1**: Inside the PDF viewer, tap the **Snippet Bag icon** `(2)`.
2. **Step 2**: Review your collected quotes, then tap **Open Bag Studio** (or on Web, look at the left pane of **Split Studio**).
3. **Step 3**: Pick the target deck: _Neuroscience Exam Prep_.
4. **Step 4**: Snippet 1 appears in the editor. Highlight **all-or-none law**.
5. **Step 5**: Tap **Save & Next**.
6. **Step 6**: Snippet 2 loads instantly. Highlight **neurotransmitters**.
7. **Step 7**: Tap **Save & Finish**.
8. **Result**: All snippets from your reading session are converted into active recall cards, and your Snippet Bag is cleanly emptied.

---

### Workflow 6: Study Using Different Modes

1. **Step 1**: Open your deck and tap **Study**.
2. **Step 2 (Early Learning — Recognition)**:
   - Tap the Mode pill and select **Multiple Choice Mode**.
   - Read the sentence context and tap the correct option from the 4 choices.
   - Complete 10 cards to build initial familiarity.
3. **Step 3 (Intermediate Mastery — Self-Rating)**:
   - Switch mode to **Flashcard Mode**.
   - Read the sentence with blank `[ ... ]`.
   - Mentally recall the answer, tap **Reveal Answer**, and rate your recall: **Again**, **Hard**, **Good**, or **Easy**.
4. **Step 4 (Exam Ready — High Stakes)**:
   - Switch mode to **Type-in Cloze Mode**.
   - Read the paragraph and physically type the answer into the blank slot.
   - Press **Submit** to verify spelling and precision under exam-like conditions.
5. **Result**: Multi-tiered learning that transitions your brain from simple recognition to active production.

---

### Workflow 7: Continue Studying Offline

1. **Step 1**: While connected to Wi-Fi at home, open Saulado so your active sets and queue are synchronized.
2. **Step 2**: Board a flight or subway train and enable **Airplane Mode**.
3. **Step 3**: Open Saulado. Notice the app opens instantly with zero network errors.
4. **Step 4**: Tap **Study Due Cards**.
5. **Step 5**: Review 30 flashcards, submit answers, and receive instant feedback.
6. **Step 6**: Open **Paste Notes** and add 3 new cards from your lecture notes.
7. **Result**: All study ratings, intervals, and new cards are saved directly to your local offline database (SQLite) without data loss.

---

### Workflow 8: Sync Changes When Internet Returns

1. **Step 1**: Exit the subway or land from your flight and turn off Airplane Mode.
2. **Step 2**: Reconnect your device to mobile data or home Wi-Fi.
3. **Step 3**: Saulado detects connection recovery in the background.
4. **Step 4**: The offline sync engine automatically transmits queued reviews and new cards in FIFO order to the cloud server.
5. **Step 5**: Open the Saulado Web App on your laptop.
6. **Result**: Your study streak, cards mastered count, and new cards are synchronized and visible on your computer.

---

## Frequently Asked Questions (FAQ)

### What makes Saulado different from Anki or Quizlet?

Anki and Quizlet predominantly rely on basic front/back flashcards where words are memorized in isolation. Saulado uses **Context-Based Active Recall**: you learn and recall terms embedded inside real paragraphs and full sentences. This preserves grammatical, situational, and conceptual connections, making recall during actual exams significantly more natural.

### How does Spaced Repetition (SM-2) work in Saulado?

Saulado implements the SuperMemo SM-2 algorithm. Every time you review a card and rate your recall (Again, Hard, Good, Easy), Saulado updates the card's **Ease Factor** and calculates its next review date. Cards you struggle with reappear frequently (in 1–2 days); cards you know well are spaced further out (6 days, 16 days, 35 days, etc.), drastically reducing total study time while boosting retention.

### Can I create cards with more than one blank?

Yes! A single card can contain up to 10 coordinated blanks. Each blank receives an ordinal indicator (`[1]`, `[2]`, `[3]`). In study mode, you test your recall across the entire multi-part concept simultaneously.

### Does Saulado work without an internet connection?

Yes. On mobile, Saulado is designed with an **offline-first** architecture using an internal SQLite database. You can review cards, create new cards, browse sets, and check progress completely offline. When your connection returns, everything syncs to the cloud automatically.

### Is camera OCR scanning available?

You can paste lecture notes, textbook summaries, or text copied from your phone camera's photo-scanner directly into Saulado's **Paste Notes to Cards** feature (available offline!). Direct camera viewfinder scanning is currently categorized as _Planned / Experimental_ as we finalize on-device camera ML processing.

### What file formats can I upload to the Files Repository?

You can upload PDF files (`.pdf`). In both Visual Mode and Reader Mode, Saulado lets you view pages, highlight text in 5 colors, and clip excerpts directly into your Snippet Bag.

### Are my decks and study data safe?

Yes. Your data is backed up to secure cloud storage whenever you are connected. You can also export your entire collection of decks, cards, and cloze blanks as a JSON file anytime from **Settings > Data Management > Export Decks**.

---

_Saulado — Learn in Context. Remember for Life._
