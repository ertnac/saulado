import { PASSWORD_MIN_LENGTH, checkPassword } from '@saulado/shared'
import { router } from 'expo-router'
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

/**
 * Ported from `frontend/src/features/auth/RegisterPage.tsx`.
 */
export default function RegisterScreen(): ReactElement {
  const register = useAuthStore((s) => s.register)
  const googleLogin = useAuthStore((s) => s.googleLogin)
  const { errors, setFromError, clear } = useFormErrors()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [localPasswordError, setLocalPasswordError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    GoogleSignin.configure({
      webClientId:
        process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ||
        '330543096063-tppmsqj37prrk2hsjnhlrn078ucl1jqd.apps.googleusercontent.com',
    })
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
        router.replace('/')
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
    setLocalPasswordError(null)

    /**
     * Same `checkPassword` the API enforces, from `@saulado/shared`. Running it
     * here is purely to save a round trip and a rate-limit slot — the server
     * check is the control, this is the courtesy. Because both sides call one
     * function, the form cannot accept something the API will reject.
     *
     * Worth more on a phone than on the web: the round trip it saves is over a
     * mobile connection, and the rate-limit slot it saves is shared with every
     * other device on the same carrier NAT.
     */
    const problem = checkPassword(password)
    if (problem) {
      setLocalPasswordError(problem.message)
      return
    }

    setSubmitting(true)
    try {
      await register(email, password)
      router.replace('/')
    } catch (err) {
      setFromError(err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Learn in context. Remember for life."
      footer={
        <Text className="text-sm text-muted-foreground">
          Already have an account?{' '}
          <TextLink
            onPress={() => {
              router.push('/login')
            }}
          >
            Sign in
          </TextLink>
        </Text>
      }
    >
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
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
          autoFocus
        />

        <Field
          label="Password"
          value={password}
          onChangeText={(next) => {
            setPassword(next)
            if (localPasswordError !== null) setLocalPasswordError(null)
          }}
          error={localPasswordError ?? errors.fields.password}
          // States the rule up front instead of failing the user after submit.
          hint={`At least ${String(PASSWORD_MIN_LENGTH)} characters. A memorable phrase beats a short, complicated one.`}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={() => {
            void onSubmit()
          }}
        />

        <Button
          label={submitting ? 'Creating account…' : 'Create account'}
          onPress={() => {
            void onSubmit()
          }}
          loading={submitting}
          size="lg"
        />
      </FormStack>
    </AuthLayout>
  )
}
