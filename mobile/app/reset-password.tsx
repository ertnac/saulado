import { PASSWORD_MIN_LENGTH, checkPassword } from '@saulado/shared'
import { router, useLocalSearchParams } from 'expo-router'
import { useState, type ReactElement } from 'react'
import { Text, View } from 'react-native'
import { AuthLayout } from '../components/auth-layout'
import { Button, TextLink } from '../components/button'
import { Field, FormAlert, FormStack } from '../components/form'
import { AlertIcon } from '../components/icons'
import { useFormErrors } from '../hooks/useFormErrors'
import { resetPassword } from '../services/auth'
import { useTokenColor } from '../stores/theme'

/**
 * Ported from `frontend/src/features/auth/ResetPasswordPage.tsx`.
 *
 * Lives at the root of `app/`, outside both `(auth)` and `(app)`. The token
 * arrives from an email, so this screen has to work whatever the session state
 * is: `(auth)` would bounce a signed-in user to the dashboard and throw the
 * token away, and `(app)` would bounce a signed-out one to login for the same
 * result.
 */
export default function ResetPasswordScreen(): ReactElement {
  const { token } = useLocalSearchParams<{ token?: string }>()
  const { errors, setFromError, clear } = useFormErrors()

  const [password, setPassword] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const warning = useTokenColor('--warning')

  async function onSubmit(): Promise<void> {
    clear()
    setLocalError(null)

    const problem = checkPassword(password)
    if (problem) {
      setLocalError(problem.message)
      return
    }

    setSubmitting(true)
    try {
      await resetPassword({ token: token ?? '', password })
      /**
       * Straight to login, not to the dashboard. The reset revoked every session
       * for this account — including any this device held — so there is no
       * session to land in, and signing in with the new password is also the
       * user's own confirmation that it took.
       *
       * The web hands that confirmation to a toast. Phase 2 has no toast store,
       * so it travels as a search param and renders as a `FormAlert` on the
       * sign-in screen, where it stays put until the user has read it.
       */
      router.replace({
        pathname: '/login',
        params: { notice: 'Password updated. Sign in with your new password.' },
      })
    } catch (err) {
      setFromError(err)
    } finally {
      setSubmitting(false)
    }
  }

  /**
   * A missing token is caught before the form renders.
   *
   * Someone who opens `/reset-password` directly should be told the link is the
   * problem, not shown a form that can only fail after they have chosen a
   * password and typed it in.
   */
  if (token === undefined || token === '') {
    return (
      <AuthLayout
        title="This link is incomplete"
        footer={
          <TextLink
            onPress={() => {
              router.replace('/login')
            }}
          >
            Back to sign in
          </TextLink>
        }
      >
        {/*
          `--warning`, not `--danger`. A truncated link is a nuisance with an
          obvious next step, not a destructive act; danger stays reserved for
          things that cannot be undone.
        */}
        <View className="flex-row items-center gap-2">
          <AlertIcon color={warning} size={16} />
          <Text className="text-sm font-medium text-warning">Link incomplete</Text>
        </View>

        <Text className="mt-3 text-sm text-muted-foreground">
          The reset link is missing its token. Email clients sometimes break long links across lines
          — try opening the whole thing, or request a new one.
        </Text>

        <Button
          className="mt-4"
          size="lg"
          label="Request a new link"
          onPress={() => {
            router.replace('/forgot-password')
          }}
        />
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Choose a new password" subtitle="This will sign you out everywhere else.">
      {errors.general !== null && <FormAlert message={errors.general} />}

      <FormStack>
        <Field
          label="New password"
          value={password}
          onChangeText={(next) => {
            setPassword(next)
            if (localError !== null) setLocalError(null)
          }}
          error={localError ?? errors.fields.password}
          hint={`At least ${String(PASSWORD_MIN_LENGTH)} characters.`}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          autoFocus
          onSubmitEditing={() => {
            void onSubmit()
          }}
        />

        <Button
          label={submitting ? 'Updating…' : 'Update password'}
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
