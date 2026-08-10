import type { ReactElement, ReactNode } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

interface AuthLayoutProps {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}

/**
 * Shared frame for the five unauthenticated screens, ported from
 * `frontend/src/features/auth/AuthLayout.tsx`.
 *
 * The web version's job is heading hierarchy — one `<main>`, one `<h1>` per page.
 * Here it earns its keep for a different reason: the keyboard. Every screen
 * inside it is a form whose submit button must stay visible above the keyboard
 * (saulado-ux §7), and solving that once is the whole reason not to let five
 * screens each invent their own scroll container.
 *
 * `KeyboardAvoidingView` needs different behaviour per platform, and the
 * difference is not stylistic: iOS reports the keyboard as an overlay that the
 * view must be pushed clear of (`padding`), while Android already resizes the
 * window via `adjustResize` and padding on top of that would double-count.
 */
export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps): ReactElement {
  const insets = useSafeAreaInsets()

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-background"
    >
      <ScrollView
        // The form is short enough not to scroll on most phones, but not on a
        // small one with the keyboard up — and `Field`'s error messages grow it
        // further. `flexGrow: 1` keeps it vertically centred until it overflows,
        // then lets it scroll instead of clipping the submit button.
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
        }}
        contentContainerClassName="px-6"
        keyboardShouldPersistTaps="handled"
      >
        <View className="mx-auto w-full max-w-md">
          <View className="mb-6">
            {/*
              No back link to `/`. On the web the wordmark navigates home; here
              "home" is behind the guard that sent the user to this screen, so
              the link would bounce straight back and read as the tap having
              failed.
            */}
            <Text className="text-sm font-medium text-muted-foreground">Saulado</Text>
            <Text
              accessibilityRole="header"
              className="mt-5 text-2xl font-semibold text-foreground"
            >
              {title}
            </Text>
            {subtitle !== undefined && (
              <Text className="mt-2 text-sm text-muted-foreground">{subtitle}</Text>
            )}
          </View>

          <View className="rounded-lg bg-surface p-6">{children}</View>

          {footer !== undefined && <View className="mt-6">{footer}</View>}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
