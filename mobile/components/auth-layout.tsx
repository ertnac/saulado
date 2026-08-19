import type { ReactElement, ReactNode } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
  Image,
  Pressable,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import Animated, { FadeIn } from 'react-native-reanimated'
import sauladoLogo from '../assets/saulado.png'

interface AuthLayoutProps {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  activeTab?: 'login' | 'register'
}

/**
 * Shared frame for the five unauthenticated screens, redesigned for the mobile app
 * with a dynamic hero header and bottom-sheet form container.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  activeTab,
}: AuthLayoutProps): ReactElement {
  const insets = useSafeAreaInsets()

  return (
    <View className="flex-1 bg-background dark:bg-[#031a14]">
      {/* Absolute Header Background for the Hero Section */}
      <View className="absolute top-0 left-0 right-0 h-[40%] bg-[#052e24] dark:bg-transparent" />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            // Only add bottom padding; the top is handled by the hero area
            paddingBottom: insets.bottom + 24,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Hero Header Area */}
          <View
            className="w-full items-center justify-center px-6"
            style={{ paddingTop: Math.max(insets.top + 16, 36), minHeight: 280 }}
          >
            <Image source={sauladoLogo} className="w-32 h-32 mb-2" resizeMode="contain" />
            <Text accessibilityRole="header" className="text-3xl font-bold text-white text-center">
              {title}
            </Text>
            {subtitle !== undefined && (
              <Text className="mt-2 text-sm text-white/80 text-center max-w-[280px]">
                {subtitle}
              </Text>
            )}
          </View>

          {/* Bottom Sheet Container */}
          <View className="flex-1 bg-background rounded-t-[32px] px-6 pt-6 shadow-sm overflow-hidden">
            <View className="mx-auto w-full max-w-md">
              {/* Segmented Tab Switcher (Only on login/register screens) */}
              {activeTab !== undefined && (
                <View className="flex-row rounded-full bg-surface-muted p-1 mb-8">
                  <Pressable
                    onPress={() => {
                      if (activeTab !== 'login') router.replace('/login')
                    }}
                    className={`flex-1 rounded-full py-3 items-center justify-center ${
                      activeTab === 'login' ? 'bg-surface shadow-sm' : ''
                    }`}
                  >
                    <Text
                      className={`text-sm font-semibold ${
                        activeTab === 'login' ? 'text-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      Log In
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      if (activeTab !== 'register') router.replace('/register')
                    }}
                    className={`flex-1 rounded-full py-3 items-center justify-center ${
                      activeTab === 'register' ? 'bg-surface shadow-sm' : ''
                    }`}
                  >
                    <Text
                      className={`text-sm font-semibold ${
                        activeTab === 'register' ? 'text-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      Sign Up
                    </Text>
                  </Pressable>
                </View>
              )}

              {/* Form Content */}
              <Animated.View entering={FadeIn.duration(200)}>{children}</Animated.View>

              {/* Footer Links */}
              {footer !== undefined && <View className="mt-8 items-center pb-6">{footer}</View>}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}
