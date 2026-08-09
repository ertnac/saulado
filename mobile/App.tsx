import { StatusBar } from 'expo-status-bar'
import { StyleSheet, Text, View } from 'react-native'
import { calculateNextReview, INITIAL_REVIEW_STATE } from '@saulado/shared'

/**
 * Phase 0's only job: prove `@saulado/shared` resolves and runs under Hermes.
 *
 * Not a placeholder screen with a shared import bolted on — the numbers below
 * are the assertion. `calculateNextReview` runs with a fixed `now` and
 * `fuzz: false`, so a correct build shows exactly `interval 6 · ease 2.5 ·
 * reps 2`. Anything else means the shared package resolved to something
 * unexpected, and a screen reading "it works" would not have told us that.
 *
 * Two reviews rather than one because the SM-2 ladder's first step is a
 * hardcoded 1 day (`nextInterval` in `shared/src/scheduler/sm2.ts`) — a card
 * seen once returns 1 whatever the ease factor is, so it cannot tell a working
 * scheduler from a stub. The second step is the first computed one.
 *
 * Replaced wholesale in Phase 2, when Expo Router takes over the entry point.
 */

const FIXED_NOW = new Date('2026-08-09T09:00:00.000Z')

function scheduleAfterTwoGoodReviews(): string {
  const first = calculateNextReview('good', INITIAL_REVIEW_STATE, {
    now: FIXED_NOW,
    fuzz: false,
  })
  const second = calculateNextReview('good', first, { now: FIXED_NOW, fuzz: false })

  return `interval ${String(second.interval)} · ease ${String(second.easeFactor)} · reps ${String(second.repetitions)}`
}

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Saulado</Text>
      <Text style={styles.label}>@saulado/shared · SM-2 after two good reviews</Text>
      <Text style={styles.figure}>{scheduleAfterTwoGoodReviews()}</Text>
      <Text style={styles.label}>expected: interval 6 · ease 2.5 · reps 2</Text>
      <StatusBar style="auto" />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f2faf6',
    gap: 8,
    padding: 24,
  },
  heading: {
    fontSize: 28,
    fontWeight: '600',
    color: '#16302a',
  },
  label: {
    fontSize: 13,
    color: '#576b62',
    textAlign: 'center',
  },
  figure: {
    fontSize: 17,
    fontVariant: ['tabular-nums'],
    color: '#16302a',
  },
})
