import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * Remembers which session was in progress, so killing the app mid-card and
 * coming back does not lose the queue.
 *
 * The web version of this file (`frontend/src/features/study/resume.ts`) reads
 * `localStorage` synchronously. AsyncStorage has no synchronous read, so all
 * three functions return promises and the caller has to hold a third state —
 * "still reading" — distinct from "nothing saved". That distinction matters:
 * treating a pending read as "nothing saved" starts a second session while the
 * first is still resumable.
 *
 * The pointer is deliberately just an id and a timestamp. The session itself
 * lives on the server, so a stale pointer costs one failed fetch and nothing
 * else, and a pointer that outlived its session must not be able to reconstruct
 * a wrong queue from the device.
 */

const KEY = 'saulado-study-session'

/** Anything older than this is a session the user has plainly abandoned. */
const MAX_AGE_MS = 12 * 60 * 60 * 1000

interface ResumePointer {
  sessionId: string
  savedAt: number
}

function isPointer(value: unknown): value is ResumePointer {
  if (typeof value !== 'object' || value === null) return false
  const pointer = value as Partial<ResumePointer>
  return typeof pointer.sessionId === 'string' && typeof pointer.savedAt === 'number'
}

/** The session to resume, or `null` if there is none worth resuming. */
export async function readResumableSession(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY)
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isPointer(parsed)) return null
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) return null
    return parsed.sessionId
  } catch {
    return null
  }
}

export async function rememberSession(sessionId: string): Promise<void> {
  try {
    const pointer: ResumePointer = { sessionId, savedAt: Date.now() }
    await AsyncStorage.setItem(KEY, JSON.stringify(pointer))
  } catch {
    // Storage being unavailable costs the resume, not the session.
  }
}

export async function forgetSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY)
  } catch {
    // As above.
  }
}
