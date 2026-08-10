import { useMutation } from '@tanstack/react-query'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, type ReactElement } from 'react'
import { Text } from 'react-native'
import { AuthLayout } from '../../../components/auth-layout'
import { Button, TextLink } from '../../../components/button'
import { confirmEmailChange } from '../../../services/account'
import { useAuthStore } from '../../../stores/auth'

/**
 * Where the confirmation link from the new inbox lands. Ported from
 * `frontend/src/features/account/ConfirmEmailChangePage.tsx`.
 *
 * Public by construction, and so it sits at the root of `app/` outside both
 * guard groups: the link was mailed to an address that is not yet the account's,
 * so the app that opens it is routinely not signed in — that is why the backend
 * moved this onto `accountPublicRouter`. The token is the credential, and it is
 * spent (single-use) the moment this screen runs.
 */
export default function ConfirmEmailChangeScreen(): ReactElement {
  const { token } = useLocalSearchParams<{ token?: string }>()

  const confirm = useMutation({
    mutationFn: confirmEmailChange,
    /**
     * The change revoked every session for this account, including the one this
     * device is holding. Clearing it here rather than letting the next cold
     * start discover it means the user is not left inside a shell whose every
     * request 401s. `logout` clears the keychain even when its network call
     * fails, which is exactly the case here — the token it would present is
     * already dead.
     */
    onSuccess: () => {
      void useAuthStore.getState().logout()
    },
  })

  // Fires once on mount. A user who reopens the link should not re-consume the
  // token — the mutation ran, the server spent it, and re-running would turn a
  // done thing into an error screen.
  useEffect(() => {
    if (token === undefined || token === '') return
    confirm.mutate({ token })
  }, [])

  if (token === undefined || token === '') {
    return (
      <AuthLayout title="This link is incomplete">
        <Text className="text-sm text-muted-foreground">
          The confirmation link is missing its token. Try opening the whole link from the email, or
          request the change again.
        </Text>
        <Text className="mt-4">
          <TextLink
            onPress={() => {
              router.replace('/settings')
            }}
          >
            Go to settings
          </TextLink>
        </Text>
      </AuthLayout>
    )
  }

  if (confirm.isPending) {
    return (
      <AuthLayout title="Confirming your new email…">
        <Text className="text-sm text-muted-foreground">This should only take a moment.</Text>
      </AuthLayout>
    )
  }

  if (confirm.isError) {
    return (
      <AuthLayout
        title="That link did not work"
        footer={
          <TextLink
            onPress={() => {
              router.replace('/settings')
            }}
          >
            Back to settings
          </TextLink>
        }
      >
        <Text className="text-sm text-muted-foreground">
          The confirmation link is invalid or has already been used. Request a new one from your
          settings — your email address has not changed.
        </Text>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Email address updated">
      <Text className="text-sm text-muted-foreground">
        Your new address is in effect, and every session was signed out — including this one. Sign
        in with the new address to continue.
      </Text>
      <Button
        size="lg"
        className="mt-4"
        label="Sign in"
        onPress={() => {
          // `replace`, and no `from` param. The session this screen ended is not
          // one to come back to, and Back landing on a spent token reads as the
          // confirmation having been undone.
          router.replace('/login')
        }}
      />
    </AuthLayout>
  )
}
