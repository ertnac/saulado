import { router } from 'expo-router'
import { useState, type ReactElement } from 'react'
import { Text, View } from 'react-native'
import { AuthLayout } from '../../components/auth-layout'
import { Button, TextLink } from '../../components/button'
import { Field, FormAlert, FormStack } from '../../components/form'
import { CheckIcon } from '../../components/icons'
import { useFormErrors } from '../../hooks/useFormErrors'
import { forgotPassword } from '../../services/auth'
import { useTokenColor } from '../../stores/theme'

/**
 * Ported from `frontend/src/features/auth/ForgotPasswordPage.tsx`.
 */
export default function ForgotPasswordScreen(): ReactElement {
  const { errors, setFromError, clear } = useFormErrors()

  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  const success = useTokenColor('--success')

  async function onSubmit(): Promise<void> {
    clear()
    setSubmitting(true)

    try {
      await forgotPassword({ email })
      setSent(true)
    } catch (err) {
      setFromError(err)
    } finally {
      setSubmitting(false)
    }
  }

  const footer = (
    <Text className="text-sm text-muted-foreground">
      Remembered it?{' '}
      <TextLink
        onPress={() => {
          router.push('/login')
        }}
      >
        Sign in
      </TextLink>
    </Text>
  )

  if (sent) {
    return (
      <AuthLayout title="Check your email" footer={footer}>
        <View className="flex-row items-start gap-3">
          <View className="pt-0.5">
            <CheckIcon color={success} size={20} />
          </View>

          {/*
            The API deliberately answers identically for known and unknown
            addresses so the form is not a membership oracle. Wording it as a
            definite "sent" would hand that leak straight back — a user who
            typed the wrong address would learn it has no account here.
          */}
          <Text className="flex-1 text-sm text-muted-foreground">
            If that email has an account, a reset link is on its way. It expires in an hour.
          </Text>
        </View>

        <View className="mt-5 items-start">
          <TextLink
            className="text-sm text-muted-foreground"
            onPress={() => {
              setSent(false)
            }}
          >
            Try a different address
          </TextLink>
        </View>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We'll email you a link to set a new one."
      footer={footer}
    >
      {errors.general !== null && <FormAlert message={errors.general} />}

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
          returnKeyType="go"
          autoFocus
          onSubmitEditing={() => {
            void onSubmit()
          }}
        />

        <Button
          label={submitting ? 'Sending…' : 'Send reset link'}
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
