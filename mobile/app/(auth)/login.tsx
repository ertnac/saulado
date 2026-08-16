import { router, useLocalSearchParams } from 'expo-router'
import { useState, useEffect, type ReactElement } from 'react'
import {
  GoogleSignin,
  statusCodes,
  isErrorWithCode,
} from '@react-native-google-signin/google-signin'
import { Text, View } from 'react-native'
import { AuthLayout } from '../../components/auth-layout'
import { Button, TextLink } from '../../components/button'
import { Field, FormAlert, FormStack } from '../../components/form'
import { useFormErrors } from '../../hooks/useFormErrors'
import { useAuthStore } from '../../stores/auth'

GoogleSignin.configure({
  webClientId:
    process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ||
    '330543096063-tppmsqj37prrk2hsjnhlrn078ucl1jqd.apps.googleusercontent.com',
})

/**
 * Ported from `frontend/src/features/auth/LoginPage.tsx`.
 */
export default function LoginScreen(): ReactElement {
  const login = useAuthStore((s) => s.login)
  const googleLogin = useAuthStore((s) => s.googleLogin)
  const { errors, setFromError, clear } = useFormErrors()

  /**
   * Where the user was headed before the guard bounced them here, and `notice`
   * from the password reset. Both arrive as search params rather than router
   * state — Expo Router has no counterpart to React Router's `location.state`.
   */
  const { from, notice } = useLocalSearchParams<{ from?: string; notice?: string }>()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    console.log('[DEBUG] GOOGLE CLIENT ID:', process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID)
  }, [])

  async function handleGoogleSignIn() {
    setSubmitting(true)
    try {
      await GoogleSignin.hasPlayServices()
      if (GoogleSignin.hasPreviousSignIn()) {
        await GoogleSignin.signOut()
      }
      const userInfo = await GoogleSignin.signIn()

      if (userInfo.data?.idToken) {
        await googleLogin(userInfo.data.idToken)
        router.replace(from !== undefined && from !== '' ? { pathname: from } : '/')
      } else {
        throw new Error('No ID token received from Google')
      }
    } catch (error) {
      if (isErrorWithCode(error)) {
        if (error.code === statusCodes.SIGN_IN_CANCELLED) {
          // User cancelled the login flow
        } else if (error.code === statusCodes.IN_PROGRESS) {
          // Operation already in progress
        } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
          setFromError(new Error('Play Services not available or outdated'))
        } else {
          setFromError(error)
        }
      } else {
        setFromError(error)
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function onSubmit(): Promise<void> {
    clear()
    setSubmitting(true)

    try {
      await login(email, password)
      /**
       * `replace` so Back does not return to the login form of a session the
       * user is now inside. On Android that button is a hardware one and gets
       * pressed constantly.
       */
      router.replace(from !== undefined && from !== '' ? { pathname: from } : '/')
    } catch (err) {
      setFromError(err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Welcome back."
      footer={
        <Text className="text-sm text-muted-foreground">
          New here?{' '}
          <TextLink
            onPress={() => {
              router.push('/register')
            }}
          >
            Create an account
          </TextLink>
        </Text>
      }
    >
      {notice !== undefined && notice !== '' && <FormAlert message={notice} variant="success" />}
      {errors.general !== null && <FormAlert message={errors.general} />}

      <View className="mb-6">
        <Button
          variant="outline"
          disabled={submitting}
          onPress={() => {
            void handleGoogleSignIn()
          }}
          label="Sign in with Google"
        />
      </View>

      <View className="flex-row items-center mb-6">
        <View className="flex-1 h-px bg-border" />
        <Text className="px-4 text-xs uppercase text-muted-foreground">Or continue with email</Text>
        <View className="flex-1 h-px bg-border" />
      </View>

      <FormStack>
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          error={errors.fields.email}
          /*
            The mobile input attributes from saulado-ux §2. Autocapitalize on an
            email field is the single most common way a phone turns a valid
            address into a rejected one.
          */
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
          // Only on the first field, so a password manager or a returning user
          // lands in the right place without the screen stealing focus later.
          autoFocus
        />

        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          error={errors.fields.password}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={() => {
            void onSubmit()
          }}
        />

        <Button
          label={submitting ? 'Signing in…' : 'Sign in'}
          onPress={() => {
            void onSubmit()
          }}
          loading={submitting}
          size="lg"
        />

        <View className="items-center">
          <TextLink
            className="text-sm text-muted-foreground"
            onPress={() => {
              router.push('/forgot-password')
            }}
          >
            Forgot your password?
          </TextLink>
        </View>
      </FormStack>
    </AuthLayout>
  )
}
