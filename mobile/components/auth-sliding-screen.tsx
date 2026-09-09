import { useState, useEffect, type ReactElement } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
  Pressable,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  runOnJS,
} from 'react-native-reanimated'
import { PASSWORD_MIN_LENGTH, checkPassword } from '@saulado/shared'
import { GoogleSignin, statusCodes, isErrorWithCode } from '../lib/google-signin'
import { Button, TextLink } from './button'
import { Field, FormAlert, FormStack } from './form'
import { useFormErrors } from '../hooks/useFormErrors'
import { useAuthStore } from '../stores/auth'
import { MailIcon, LockIcon, EyeIcon, EyeOffIcon, GoogleIcon } from './icons'
import { useTokenColor } from '../stores/theme'
import * as SplashScreen from 'expo-splash-screen'
import { SauladoLogo, type SauladoLogoAnimation } from './saulado-logo'

interface AuthSlidingScreenProps {
  initialTab?: 'login' | 'register'
}

export function AuthSlidingScreen({ initialTab = 'login' }: AuthSlidingScreenProps): ReactElement {
  const insets = useSafeAreaInsets()
  const { width: windowWidth, height: windowHeight } = useWindowDimensions()
  const iconColor = useTokenColor('--foreground')

  const status = useAuthStore((s) => s.status)
  const login = useAuthStore((s) => s.login)
  const register = useAuthStore((s) => s.register)
  const googleLogin = useAuthStore((s) => s.googleLogin)
  const { from, notice } = useLocalSearchParams<{ from?: string; notice?: string }>()

  // If already authenticated, redirect straight to dashboard
  useEffect(() => {
    if (status === 'authenticated' || status === 'offline-authenticated') {
      router.replace(from !== undefined && from !== '' ? { pathname: from } : '/')
    }
  }, [status, from])

  const [activeTab, setActiveTab] = useState<'login' | 'register'>(initialTab)
  const [containerWidth, setContainerWidth] = useState(windowWidth - 48)
  const [tabBarWidth, setTabBarWidth] = useState(0)

  // Login form states
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [showLoginPassword, setShowLoginPassword] = useState(false)
  const [loginSubmitting, setLoginSubmitting] = useState(false)
  const loginErrors = useFormErrors()

  // Register form states
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regConfirmPassword, setRegConfirmPassword] = useState('')
  const [showRegPassword, setShowRegPassword] = useState(false)
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false)
  const [localPasswordError, setLocalPasswordError] = useState<string | null>(null)
  const [localConfirmPasswordError, setLocalConfirmPasswordError] = useState<string | null>(null)
  const [regSubmitting, setRegSubmitting] = useState(false)
  const regErrors = useFormErrors()

  // Goodnotes Splash entrance animation states:
  // 1. Logo appears centered at 120pt matching native splash size (scale: 1, opacity: 1).
  // 2. Logo slides to the left (translateX: 0 -> -60) as "Saulado" smoothly appears on its right.
  // 3. Smooth slow-motion glide upwards into the header position while bottom sheet rises and inputs reveal.
  const [logoAnimation, setLogoAnimation] = useState<SauladoLogoAnimation>('star-gyro')
  const splashOpacity = useSharedValue(1)
  const lockupSlideX = useSharedValue(0)
  const wordmarkOpacity = useSharedValue(0)
  const wordmarkTranslateX = useSharedValue(16)
  const glideProgress = useSharedValue(0)

  const headerPaddingTop = Math.max(insets.top + 16, 36)
  // The Android native splash centers `splashscreen_logo.png` exactly at the physical center of the screen (windowHeight / 2).
  // The header lockup sits at headerPaddingTop + 60 (center of 120pt container).
  // Therefore, the exact travel distance from the native splash height to the header height is:
  const splashCenterY = windowHeight / 2
  const headerCenterY = headerPaddingTop + 60
  const logoTravelDistance = Math.max(0, splashCenterY - headerCenterY)

  useEffect(() => {
    // Hide native splash screen as soon as AuthSlidingScreen mounts
    void SplashScreen.hideAsync()

    // Phase 1 (t=500ms): Logo slides smoothly to the left, Saulado name fades & slides in from right
    lockupSlideX.value = withDelay(
      500,
      withTiming(-60, {
        duration: 1100,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
      }),
    )

    wordmarkOpacity.value = withDelay(
      650,
      withTiming(1, {
        duration: 900,
        easing: Easing.out(Easing.quad),
      }),
    )

    wordmarkTranslateX.value = withDelay(
      500,
      withTiming(0, {
        duration: 1100,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
      }),
    )

    // Phase 2 (t=3000ms): Smooth, slow-motion upward glide into header position, revealing login forms
    glideProgress.value = withDelay(
      3000,
      withTiming(
        1,
        {
          duration: 1600,
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        },
        (finished) => {
          if (finished) {
            runOnJS(setLogoAnimation)('pulse-aura')
          }
        },
      ),
    )

    // During upward glide, smoothly center the logo back into header position (translateX: -60 -> 0)
    lockupSlideX.value = withDelay(
      3000,
      withTiming(0, {
        duration: 1600,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
      }),
    )

    // Splash wordmark fades out gracefully as the centered header title & tagline fade in
    wordmarkOpacity.value = withDelay(
      3000,
      withTiming(0, {
        duration: 700,
        easing: Easing.inOut(Easing.quad),
      }),
    )
  }, [])

  // Animation values
  const slideProgress = useSharedValue(initialTab === 'login' ? 0 : 1)

  useEffect(() => {
    GoogleSignin.configure({
      webClientId:
        process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ||
        '330543096063-tppmsqj37prrk2hsjnhlrn078ucl1jqd.apps.googleusercontent.com',
    })
  }, [])

  const switchTab = (tab: 'login' | 'register') => {
    setActiveTab(tab)
    loginErrors.clear()
    regErrors.clear()
    setLocalPasswordError(null)
    setLocalConfirmPasswordError(null)
    slideProgress.value = withTiming(tab === 'login' ? 0 : 1, {
      duration: 400,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    })
  }

  // Animated styles for Goodnotes splash & upward glide intro
  const animatedLockupStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateY: (1 - glideProgress.value) * logoTravelDistance,
        },
      ],
    }
  })

  const animatedLogoStyle = useAnimatedStyle(() => {
    return {
      opacity: splashOpacity.value,
      transform: [
        { translateX: lockupSlideX.value },
        // Slight scale adjustment from splash (120pt) to header (108pt)
        { scale: 1 - glideProgress.value * 0.1 },
      ],
    }
  })

  const animatedSplashWordmarkStyle = useAnimatedStyle(() => {
    return {
      opacity: wordmarkOpacity.value,
      transform: [
        // Wordmark tracks lockup slide and has subtle entrance slide
        { translateX: lockupSlideX.value + wordmarkTranslateX.value },
      ],
    }
  })

  const animatedHeroTextStyle = useAnimatedStyle(() => {
    return {
      opacity: glideProgress.value,
      transform: [
        {
          translateY: (1 - glideProgress.value) * 20,
        },
      ],
    }
  })

  const animatedFormContainerStyle = useAnimatedStyle(() => {
    return {
      opacity: glideProgress.value,
      transform: [
        {
          translateY: (1 - glideProgress.value) * 80,
        },
      ],
    }
  })

  // Animated style for sliding form pages
  const formSliderStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: -slideProgress.value * containerWidth }],
    }
  })

  // Animated style for the segmented tab indicator pill
  const pillSliderStyle = useAnimatedStyle(() => {
    const pillWidth = tabBarWidth > 0 ? (tabBarWidth - 8) / 2 : 0
    return {
      width: pillWidth,
      transform: [{ translateX: slideProgress.value * pillWidth }],
    }
  })

  // Google sign in handler
  async function handleGoogleSignIn(isRegister = false) {
    const setSubmitting = isRegister ? setRegSubmitting : setLoginSubmitting
    const formErrors = isRegister ? regErrors : loginErrors

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
        throw new Error(
          'Google Sign-In is not configured for this debug build. Please log in with email and password.',
        )
      }
    } catch (error) {
      if (isErrorWithCode(error)) {
        if (error.code === statusCodes.SIGN_IN_CANCELLED) {
          // User cancelled
        } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
          formErrors.setFromError(new Error('Play Services not available or outdated'))
        } else {
          formErrors.setFromError(error)
        }
      } else {
        formErrors.setFromError(error)
      }
    } finally {
      setSubmitting(false)
    }
  }

  // Login submit handler
  async function onLoginSubmit(): Promise<void> {
    loginErrors.clear()
    setLoginSubmitting(true)

    try {
      await login(loginEmail, loginPassword)
      router.replace(from !== undefined && from !== '' ? { pathname: from } : '/')
    } catch (err) {
      loginErrors.setFromError(err)
    } finally {
      setLoginSubmitting(false)
    }
  }

  // Register submit handler
  async function onRegisterSubmit(): Promise<void> {
    regErrors.clear()
    setLocalPasswordError(null)
    setLocalConfirmPasswordError(null)

    if (regPassword !== regConfirmPassword) {
      setLocalConfirmPasswordError('Passwords do not match.')
      return
    }

    const problem = checkPassword(regPassword)
    if (problem) {
      setLocalPasswordError(problem.message)
      return
    }

    setRegSubmitting(true)
    try {
      await register(regEmail, regPassword)
      router.replace('/')
    } catch (err) {
      regErrors.setFromError(err)
    } finally {
      setRegSubmitting(false)
    }
  }

  const isLogin = activeTab === 'login'

  return (
    <View className="flex-1 bg-[#052e24] dark:bg-[#031a14]">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          bounces={false}
          overScrollMode="never"
          contentContainerStyle={{
            flexGrow: 1,
            paddingBottom: insets.bottom + 24,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Hero Header Area with Saulado Logo & Animated Text */}
          <View
            className="w-full items-center justify-center px-6 z-20"
            style={{ paddingTop: headerPaddingTop, minHeight: 270 }}
          >
            <Animated.View
              style={[
                animatedLockupStyle,
                {
                  width: 120,
                  height: 120,
                  alignItems: 'center',
                  justifyContent: 'center',
                },
              ]}
            >
              {/* Logo Mark (starts at size 120 exactly matching native splash screen) */}
              <Animated.View
                style={[
                  animatedLogoStyle,
                  {
                    width: 120,
                    height: 120,
                    alignItems: 'center',
                    justifyContent: 'center',
                  },
                ]}
              >
                <SauladoLogo size={120} animation={logoAnimation} />
              </Animated.View>

              {/* Splash Wordmark "Saulado" (positioned on the right side of the sliding logo) */}
              <Animated.View
                style={[
                  animatedSplashWordmarkStyle,
                  {
                    position: 'absolute',
                    left: 128,
                    top: 0,
                    bottom: 0,
                    justifyContent: 'center',
                  },
                ]}
                pointerEvents="none"
              >
                <Text numberOfLines={1} className="text-3xl font-black text-white tracking-tight">
                  Saulado
                </Text>
              </Animated.View>
            </Animated.View>

            {/* Header Title & Tagline (reveals once lockup glides up to header position) */}
            <Animated.View style={[animatedHeroTextStyle, { alignItems: 'center', width: '100%' }]}>
              <Text
                accessibilityRole="header"
                className="text-3xl font-bold text-white text-center mt-2"
              >
                Saulado
              </Text>
              <Text className="mt-1.5 text-sm text-white/80 text-center max-w-[290px]">
                Learn in context. Remember for life.
              </Text>
            </Animated.View>
          </View>

          {/* Bottom Sheet Container */}
          <Animated.View
            style={[animatedFormContainerStyle]}
            className="flex-1 bg-background rounded-t-[32px] px-6 pt-6 shadow-sm z-10"
          >
            <View
              className="mx-auto w-full max-w-md"
              onLayout={(e: LayoutChangeEvent) => {
                setContainerWidth(e.nativeEvent.layout.width)
              }}
            >
              {/* Segmented Tab Switcher with Animated Sliding Pill */}
              <View
                className="flex-row rounded-full bg-surface-muted p-1 mb-6 relative"
                onLayout={(e: LayoutChangeEvent) => {
                  setTabBarWidth(e.nativeEvent.layout.width)
                }}
              >
                {/* Sliding indicator */}
                {tabBarWidth > 0 && (
                  <Animated.View
                    style={[
                      pillSliderStyle,
                      {
                        position: 'absolute',
                        top: 4,
                        left: 4,
                        bottom: 4,
                        borderRadius: 9999,
                      },
                    ]}
                    className="bg-surface shadow-sm"
                  />
                )}

                <Pressable
                  onPress={() => switchTab('login')}
                  className="flex-1 rounded-full py-3 items-center justify-center z-10"
                >
                  <Text
                    className={`text-sm font-semibold ${
                      isLogin ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    Log In
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => switchTab('register')}
                  className="flex-1 rounded-full py-3 items-center justify-center z-10"
                >
                  <Text
                    className={`text-sm font-semibold ${
                      !isLogin ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    Sign Up
                  </Text>
                </Pressable>
              </View>

              {/* Notice Banner */}
              {notice !== undefined && notice !== '' && isLogin && (
                <FormAlert message={notice} variant="success" />
              )}

              {/* Sliding Form Carousel Viewport */}
              <View style={{ width: containerWidth, overflow: 'hidden' }}>
                <Animated.View
                  style={[formSliderStyle, { flexDirection: 'row', width: containerWidth * 2 }]}
                >
                  {/* ================= PAGE 1: LOG IN FORM ================= */}
                  <View style={{ width: containerWidth }}>
                    {loginErrors.errors.general !== null && (
                      <FormAlert message={loginErrors.errors.general} />
                    )}

                    <FormStack>
                      <Field
                        label="Email"
                        value={loginEmail}
                        onChangeText={setLoginEmail}
                        error={loginErrors.errors.fields.email}
                        placeholder="Enter your email"
                        leftIcon={<MailIcon color={iconColor} size={20} />}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="email"
                        textContentType="emailAddress"
                        returnKeyType="next"
                      />

                      <View className="mb-2">
                        <Field
                          label="Password"
                          value={loginPassword}
                          onChangeText={setLoginPassword}
                          error={loginErrors.errors.fields.password}
                          placeholder="Enter your password"
                          leftIcon={<LockIcon color={iconColor} size={20} />}
                          rightElement={
                            <Pressable
                              onPress={() => setShowLoginPassword(!showLoginPassword)}
                              hitSlop={12}
                              className="opacity-60"
                            >
                              {showLoginPassword ? (
                                <EyeOffIcon color={iconColor} size={20} />
                              ) : (
                                <EyeIcon color={iconColor} size={20} />
                              )}
                            </Pressable>
                          }
                          secureTextEntry={!showLoginPassword}
                          autoCapitalize="none"
                          autoComplete="current-password"
                          textContentType="password"
                          returnKeyType="go"
                          onSubmitEditing={() => {
                            void onLoginSubmit()
                          }}
                        />

                        <View className="flex-row items-center justify-end mt-3 px-1">
                          <TextLink
                            className="text-sm font-medium text-accent-strong"
                            onPress={() => {
                              router.push('/forgot-password')
                            }}
                          >
                            Forgot Password?
                          </TextLink>
                        </View>
                      </View>

                      <View className="mt-2">
                        <Button
                          label={loginSubmitting ? 'Signing in…' : 'Log In'}
                          onPress={() => {
                            void onLoginSubmit()
                          }}
                          loading={loginSubmitting}
                          size="lg"
                          className="rounded-full bg-accent-strong"
                        />
                      </View>

                      <View className="flex-row items-center my-6">
                        <View className="flex-1 h-px bg-border" />
                        <Text className="px-4 text-xs font-medium text-muted-foreground">
                          Or continue with
                        </Text>
                        <View className="flex-1 h-px bg-border" />
                      </View>

                      <Button
                        label="Google"
                        variant="outline"
                        disabled={loginSubmitting}
                        onPress={() => {
                          void handleGoogleSignIn(false)
                        }}
                        className="rounded-full h-14"
                        icon={<GoogleIcon size={24} />}
                      />

                      <View className="mt-8 items-center pb-6">
                        <Text className="text-sm font-medium text-foreground">
                          Don't have an account?{' '}
                          <TextLink
                            onPress={() => switchTab('register')}
                            className="text-accent-strong"
                          >
                            Create an account
                          </TextLink>
                        </Text>
                      </View>
                    </FormStack>
                  </View>

                  {/* ================= PAGE 2: SIGN UP FORM ================= */}
                  <View style={{ width: containerWidth }}>
                    {regErrors.errors.general !== null && (
                      <FormAlert message={regErrors.errors.general} />
                    )}

                    <FormStack>
                      <Field
                        label="Email"
                        value={regEmail}
                        onChangeText={setRegEmail}
                        error={regErrors.errors.fields.email}
                        placeholder="Enter your email"
                        leftIcon={<MailIcon color={iconColor} size={20} />}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="email"
                        textContentType="emailAddress"
                        returnKeyType="next"
                      />

                      <View className="mb-2">
                        <Field
                          label="Password"
                          value={regPassword}
                          onChangeText={(next) => {
                            setRegPassword(next)
                            if (localPasswordError !== null) setLocalPasswordError(null)
                            if (localConfirmPasswordError !== null)
                              setLocalConfirmPasswordError(null)
                          }}
                          error={localPasswordError ?? regErrors.errors.fields.password}
                          placeholder="Enter your password"
                          leftIcon={<LockIcon color={iconColor} size={20} />}
                          rightElement={
                            <Pressable
                              onPress={() => setShowRegPassword(!showRegPassword)}
                              hitSlop={12}
                              className="opacity-60"
                            >
                              {showRegPassword ? (
                                <EyeOffIcon color={iconColor} size={20} />
                              ) : (
                                <EyeIcon color={iconColor} size={20} />
                              )}
                            </Pressable>
                          }
                          hint={`At least ${String(PASSWORD_MIN_LENGTH)} characters. A memorable phrase beats a short, complicated one.`}
                          secureTextEntry={!showRegPassword}
                          autoCapitalize="none"
                          autoComplete="new-password"
                          textContentType="newPassword"
                          returnKeyType="next"
                        />
                      </View>

                      <View className="mb-2">
                        <Field
                          label="Confirm Password"
                          value={regConfirmPassword}
                          onChangeText={(next) => {
                            setRegConfirmPassword(next)
                            if (localConfirmPasswordError !== null)
                              setLocalConfirmPasswordError(null)
                          }}
                          error={localConfirmPasswordError ?? undefined}
                          placeholder="Confirm your password"
                          leftIcon={<LockIcon color={iconColor} size={20} />}
                          rightElement={
                            <Pressable
                              onPress={() => setShowRegConfirmPassword(!showRegConfirmPassword)}
                              hitSlop={12}
                              className="opacity-60"
                            >
                              {showRegConfirmPassword ? (
                                <EyeOffIcon color={iconColor} size={20} />
                              ) : (
                                <EyeIcon color={iconColor} size={20} />
                              )}
                            </Pressable>
                          }
                          secureTextEntry={!showRegConfirmPassword}
                          autoCapitalize="none"
                          autoComplete="new-password"
                          textContentType="newPassword"
                          returnKeyType="go"
                          onSubmitEditing={() => {
                            void onRegisterSubmit()
                          }}
                        />
                      </View>

                      <View className="mt-2">
                        <Button
                          label={regSubmitting ? 'Creating account…' : 'Create Account'}
                          onPress={() => {
                            void onRegisterSubmit()
                          }}
                          loading={regSubmitting}
                          size="lg"
                          className="rounded-full bg-accent-strong"
                        />
                      </View>

                      <View className="flex-row items-center my-6">
                        <View className="flex-1 h-px bg-border" />
                        <Text className="px-4 text-xs font-medium text-muted-foreground">
                          Or continue with
                        </Text>
                        <View className="flex-1 h-px bg-border" />
                      </View>

                      <Button
                        label="Google"
                        variant="outline"
                        disabled={regSubmitting}
                        onPress={() => {
                          void handleGoogleSignIn(true)
                        }}
                        className="rounded-full h-14"
                        icon={<GoogleIcon size={24} />}
                      />

                      <View className="mt-8 items-center pb-6">
                        <Text className="text-sm font-medium text-foreground">
                          Already have an account?{' '}
                          <TextLink
                            onPress={() => switchTab('login')}
                            className="text-accent-strong"
                          >
                            Log In
                          </TextLink>
                        </Text>
                      </View>
                    </FormStack>
                  </View>
                </Animated.View>
              </View>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}
