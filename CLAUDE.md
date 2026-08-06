# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Saulado** is a study application focused on **context-based active recall** using fill-in-the-blank questions generated from paragraphs. Users highlight important words/phrases in their notes, and the app automatically converts them into cloze deletions while preserving the original context.

**Core Philosophy:** Learn information within its natural context rather than as isolated flashcard facts.

## Technology Stack

### Frontend

- React 18+ with TypeScript
- State Management: Zustand or Redux Toolkit
- Styling: Tailwind CSS + shadcn/ui
- Text Editor: none — `<textarea>` + native Selection API (see `docs/adr/0001-editor.md`; Slate/ProseMirror were evaluated and rejected)
- Routing: React Router v6
- Build Tool: Vite

### Backend

- Node.js with Express or Nest.js
- Database: PostgreSQL
- ORM: Prisma or TypeORM
- Authentication: JWT + bcrypt
- Caching: Redis (optional, for session management)

### Testing

- Vitest + React Testing Library
- Supertest for API tests

## Key Architecture Concepts

### Text Processing Engine

The core feature is converting highlighted text into fill-in-the-blank questions:

```typescript
interface ProcessedCard {
  displayText: string // "The ____ is the brain of the computer"
  answers: Answer[] // [{ text: "CPU", position: 4, order: 0 }]
  originalParagraph: string
}

interface Answer {
  text: string // The actual answer
  position: number // Character position in original text
  order: number // Which blank this is (0-indexed)
}
```

**Key considerations:**

- Support multiple blanks in a single paragraph
- Preserve exact spacing and punctuation
- Handle multi-word answers
- Enable independent validation of each blank

### Answer Validation Logic

When checking user input:

- Case-insensitive comparison
- Trim whitespace from both ends
- Optional: Levenshtein distance for typo tolerance
- Optional: Support alternative correct answers

### Spaced Repetition Algorithm

Implement SM-2 or similar algorithm:

```typescript
interface ReviewSchedule {
  easeFactor: number // 1.3 - 2.5 (difficulty multiplier)
  interval: number // Days until next review
  repetitions: number // Consecutive correct answers
}
```

**Algorithm flow:**

1. User answers card correctly → increase interval
2. User answers incorrectly → reset interval to 1 day
3. Ease factor adjusts based on user confidence rating (if implemented)
4. Cards are queued by due date, with overdue cards prioritized

### Database Schema

Core tables:

```sql
Users
  - id, email, password_hash, created_at, settings

StudySets
  - id, user_id, title, description, created_at

StudyCards
  - id, study_set_id, title, paragraph, created_at

CardAnswers
  - id, card_id, answer_text, position, order

Reviews
  - id, card_id, user_id, correct, review_date, next_review

UserProgress
  - id, user_id, daily_streak, total_reviews, accuracy
```

**Important relationships:**

- One StudySet has many StudyCards
- One StudyCard has many CardAnswers (for multiple blanks)
- Each Review links to a specific card and user
- UserProgress aggregates statistics per user

## Development Commands

### Setup

```bash
# Install dependencies
npm install  # or pnpm install

# Set up database
npx prisma generate
npx prisma migrate dev

# Seed development data
npm run db:seed
```

### Development

```bash
# Run development server
npm run dev

# Run backend separately (if monorepo)
cd backend && npm run dev

# Run frontend separately
cd frontend && npm run dev
```

### Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test src/lib/text-processor.test.ts

# Run API integration tests
npm run test:api
```

### Database

```bash
# Create new migration
npx prisma migrate dev --name <migration_name>

# Reset database
npx prisma migrate reset

# Open Prisma Studio (database GUI)
npx prisma studio
```

### Build

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

## Critical Implementation Details

### Text Highlighting UI

The text editor must support:

- Visual feedback when selecting text to highlight
- Ability to highlight non-contiguous sections
- Preview of generated question before saving
- Edit/remove individual highlights
- Mobile-friendly selection (long-press or button-based)

### Study Session State

Track the following during a review session:

- Cards remaining in queue
- Current card index
- User answers for current card
- Correct/incorrect count
- Session start time
- Whether to show answer or collect input

### Performance Considerations

- Paginate study sets and cards (20-50 per page)
- Index database on `user_id`, `next_review`, and `study_set_id`
- Lazy load components in frontend
- Cache frequently accessed data (user stats, today's reviews)
- Debounce text input during card creation

### Mobile Responsiveness

Priority breakpoints:

- Mobile: 320px - 640px (single column, larger touch targets)
- Tablet: 641px - 1024px (adaptable layout)
- Desktop: 1025px+ (full features, keyboard shortcuts)

## Code Organization

### Frontend Structure

```
frontend/src/
├── components/       # Reusable UI components
│   ├── ui/          # shadcn/ui components
│   ├── study/       # Study-specific components
│   └── layout/      # Layout components
├── features/        # Feature-based modules
│   ├── auth/
│   ├── cards/
│   ├── study/
│   └── dashboard/
├── hooks/           # Custom React hooks
├── lib/             # Utilities (text-processor, validators)
├── services/        # API client
└── types/           # TypeScript definitions
```

### Backend Structure

```
backend/src/
├── modules/         # Feature modules
│   ├── auth/
│   ├── cards/
│   ├── study/
│   └── users/
├── common/          # Shared code (guards, interceptors)
├── database/        # Prisma schema and migrations
└── types/           # TypeScript definitions
```

## Common Patterns

### Creating a Study Card

1. User writes/pastes paragraph in text editor
2. User highlights answer(s) by selecting text
3. Frontend generates preview showing blanks
4. On save, extract:
   - Original paragraph
   - Array of answers with positions
   - Display text with blanks
5. Store in database with relationships

### Running a Study Session

1. Query cards where `next_review <= today` for current user
2. Order by `next_review ASC` (oldest first)
3. Present one card at a time
4. Collect user input for each blank
5. Validate answers
6. Update review schedule based on correctness
7. Save review record
8. Update user progress statistics

### Calculating Next Review Date

```typescript
function calculateNextReview(
  wasCorrect: boolean,
  currentInterval: number,
  currentEaseFactor: number,
  repetitions: number,
): { interval: number; easeFactor: number; repetitions: number } {
  if (!wasCorrect) {
    return {
      interval: 1, // Review again tomorrow
      easeFactor: Math.max(1.3, currentEaseFactor - 0.2),
      repetitions: 0,
    }
  }

  const newRepetitions = repetitions + 1
  let newInterval: number

  if (newRepetitions === 1) {
    newInterval = 1
  } else if (newRepetitions === 2) {
    newInterval = 6
  } else {
    newInterval = Math.round(currentInterval * currentEaseFactor)
  }

  return {
    interval: newInterval,
    easeFactor: currentEaseFactor,
    repetitions: newRepetitions,
  }
}
```

## Testing Strategy

### Unit Tests

- Text processing logic (blank generation, position tracking)
- Answer validation
- Spaced repetition algorithm
- Date calculations

### Integration Tests

- API endpoints (CRUD operations)
- Authentication flow
- Database queries and relationships

### E2E Tests

- Complete study session flow
- Card creation workflow
- Dashboard data accuracy

## Security Notes

- Hash passwords with bcrypt (minimum 10 rounds)
- Use JWT with short expiration (15 minutes) + refresh tokens
- Validate all user input server-side
- Implement rate limiting on auth endpoints
- Use parameterized queries (ORM handles this)
- Store sensitive config in environment variables

## Accessibility Requirements

- Keyboard navigation for all interactive elements
- ARIA labels for screen readers
- Sufficient color contrast (WCAG AA minimum)
- Focus indicators on all interactive elements
- Support for keyboard shortcuts during study sessions
- Alt text for any icons or images

## Future Feature Considerations

When implementing future phases, consider:

- Tag system: Add `tags` table with many-to-many relationship
- Shared study sets: Add `visibility` field and `shared_sets` table
- AI features: Integrate OpenAI/Anthropic API for suggestions
- Import/Export: Support common formats (Anki, CSV, JSON)
