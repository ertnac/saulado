import { PASSWORD_MIN_LENGTH, checkPassword } from '@saulado/shared'
import { router } from 'expo-router'
import { useState, useEffect, type ReactElement } from 'react'
import * as WebBrowser from 'expo-web-browser'
import * as Google from 'expo-auth-session/providers/google'
import { Text, View } from 'react-native'
import { AuthLayout } from '../../components/auth-layout'
import { Button, TextLink } from '../../components/button'
import { Field, FormAlert, FormStack } from '../../components/form'
import { useFormErrors } from '../../hooks/useFormErrors'
import { useAuthStore } from '../../stores/auth'

WebBrowser.maybeCompleteAuthSession()

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

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
    redirectUri: 'https://auth.expo.io/@ertnac/saulado',
    // Add androidClientId for production later if needed
  })

  useEffect(() => {
    if (response?.type === 'success' && response.params?.id_token) {
      setSubmitting(true)
      googleLogin(response.params.id_token)
        .then(() => {
          router.replace('/')
        })
        .catch((err) => {
          setFromError(err)
          setSubmitting(false)
        })
    }
  }, [response])

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
          disabled={!request || submitting}
          onPress={() => {
            void promptAsync()
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
