import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { ApiError } from './services/api'
import { ConfigError } from './services/config'
import { useAuthStore } from './stores/auth'

/**
 * Phase 1's deliverable, and the whole of it: sign in from the phone against the
 * deployed API, and still be signed in after the app is killed and relaunched.
 *
 * A login form rather than a navigation shell, because the thing under test is
 * the token round-trip and not the screens. Expo Router takes over this entry
 * point in Phase 2 and this file goes away — so it stays one file, with no
 * routing, no form library and no design system.
 *
 * The restart half is the part worth watching. Nothing here persists anything:
 * `services/api` wrote the refresh token to the keychain when login returned it,
 * and `restore()` below trades that token for a fresh access token before the
 * first paint decides which screen to show.
 */

export default function App() {
  const status = useAuthStore((s) => s.status)
  const restore = useAuthStore((s) => s.restore)

  // Runs once, before anything protected renders. `status` starts as
  // `restoring`, so a returning user never sees the login form flash past.
  useEffect(() => {
    void restore()
  }, [restore])

  return (
    <View style={styles.root}>
      {status === 'restoring' ? <Restoring /> : null}
      {status === 'authenticated' ? <SignedIn /> : null}
      {status === 'anonymous' ? <LoginForm /> : null}
      <StatusBar style="auto" />
    </View>
  )
}

function Restoring() {
  return (
    <View style={styles.centered}>
      <ActivityIndicator color="#16302a" />
      <Text style={styles.label}>Restoring your session…</Text>
    </View>
  )
}

function SignedIn() {
  const user = useAuthStore((s) => s.user)
  const settings = useAuthStore((s) => s.settings)
  const logout = useAuthStore((s) => s.logout)
  const [busy, setBusy] = useState(false)

  return (
    <View style={styles.centered}>
      <Text style={styles.heading}>Signed in</Text>
      <Text style={styles.figure}>{user?.email ?? '—'}</Text>
      <Text style={styles.label}>
        daily goal {String(settings?.dailyGoal ?? 0)} · new cards{' '}
        {String(settings?.newCardsPerDay ?? 0)}
      </Text>
      <Text style={styles.hint}>
        Force-quit the app and reopen it. Landing back on this screen is the Phase 1 deliverable.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: busy }}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        disabled={busy}
        onPress={() => {
          setBusy(true)
          void logout().finally(() => {
            setBusy(false)
          })
        }}
      >
        <Text style={styles.buttonText}>{busy ? 'Signing out…' : 'Sign out'}</Text>
      </Pressable>
    </View>
  )
}

function LoginForm() {
  const login = useAuthStore((s) => s.login)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const disabled = busy || email.trim() === '' || password === ''

  const submit = () => {
    if (disabled) return
    setBusy(true)
    setError(null)

    login(email.trim(), password)
      .catch((cause: unknown) => {
        // `ApiError` and `ConfigError` both already carry a message written for
        // a person — the backend's own copy, and the "set EXPO_PUBLIC_API_URL"
        // instruction respectively. What is left is a genuine transport
        // failure, whose own message (`Network request failed`) says nothing
        // actionable, so it gets the one below instead.
        setError(
          cause instanceof ApiError || cause instanceof ConfigError
            ? cause.message
            : 'Could not reach the API. The phone must be able to see that host — the emulator uses ' +
                'http://10.0.2.2:3000 for a server on this machine, and a real device needs its LAN address.',
        )
      })
      .finally(() => {
        setBusy(false)
      })
  }

  return (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.centered} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>Saulado</Text>
        <Text style={styles.label}>Sign in to continue</Text>

        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor="#8fa39a"
          accessibilityLabel="Email"
          keyboardType="email-address"
          textContentType="emailAddress"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="email"
          returnKeyType="next"
          editable={!busy}
        />

        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor="#8fa39a"
          accessibilityLabel="Password"
          secureTextEntry
          textContentType="password"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="password"
          returnKeyType="go"
          onSubmitEditing={submit}
          editable={!busy}
        />

        {error === null ? null : (
          // `assertive` is the wrong choice for typing feedback and the right
          // one here: the user pressed a button and is waiting on the answer.
          <Text style={styles.error} accessibilityLiveRegion="assertive">
            {error}
          </Text>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          style={({ pressed }) => [
            styles.button,
            disabled && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
          disabled={disabled}
          onPress={submit}
        >
          <Text style={styles.buttonText}>{busy ? 'Signing in…' : 'Sign in'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f2faf6',
  },
  fill: {
    flex: 1,
  },
  centered: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
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
  hint: {
    fontSize: 12,
    color: '#576b62',
    textAlign: 'center',
    maxWidth: 280,
  },
  figure: {
    fontSize: 17,
    color: '#16302a',
  },
  input: {
    width: '100%',
    maxWidth: 360,
    // 48, not 44: the WCAG floor is a floor, and a text field is aimed at more
    // carefully than a button.
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#c8ded3',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#16302a',
  },
  button: {
    width: '100%',
    maxWidth: 360,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#16302a',
    paddingHorizontal: 20,
  },
  buttonDisabled: {
    // 3.4:1 against white text — below the 4.5:1 body-text floor on purpose, as
    // WCAG 1.4.3 exempts disabled controls, and a disabled button that reads at
    // full strength is the more common accessibility complaint.
    backgroundColor: '#7d938a',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    maxWidth: 360,
    // 5.9:1 on this background. Paired with the text itself, never colour alone.
    color: '#a3231b',
    fontSize: 13,
    textAlign: 'center',
  },
})
