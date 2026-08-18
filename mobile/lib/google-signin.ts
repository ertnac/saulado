import Constants, { ExecutionEnvironment } from 'expo-constants'

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient

export interface ConfigureParams {
  webClientId?: string
  iosClientId?: string
  offlineAccess?: boolean
  hostedDomain?: string
  loginHint?: string
  forceCodeForRefreshToken?: boolean
  accountName?: string
  googleServicePlistPath?: string
  openIdRealm?: string
  profileImageSize?: number
}

export interface GoogleUser {
  id: string
  name: string | null
  email: string
  photo: string | null
  familyName: string | null
  givenName: string | null
}

export interface SignInResult {
  user?: GoogleUser
  data?: {
    idToken?: string | null
    user?: GoogleUser
  }
  idToken?: string | null
  serverAuthCode?: string | null
}

interface GoogleSigninModuleType {
  configure: (config?: ConfigureParams) => void
  hasPlayServices: (options?: { showPlayServicesUpdateDialog?: boolean }) => Promise<boolean>
  hasPreviousSignIn: () => boolean
  signIn: () => Promise<SignInResult>
  signOut: () => Promise<void>
}

let nativeGoogleSignin: GoogleSigninModuleType | null = null
let nativeStatusCodes: Record<string, string> = {}
let nativeIsErrorWithCode: ((error: unknown) => boolean) | null = null

if (!isExpoGo) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const g = require('@react-native-google-signin/google-signin') as {
      GoogleSignin: GoogleSigninModuleType
      statusCodes: Record<string, string>
      isErrorWithCode: (error: unknown) => boolean
    }
    nativeGoogleSignin = g.GoogleSignin
    nativeStatusCodes = g.statusCodes
    nativeIsErrorWithCode = g.isErrorWithCode
  } catch {
    // Native module not linked in current binary
  }
}

export const GoogleSignin = {
  configure: (config?: ConfigureParams): void => {
    if (nativeGoogleSignin?.configure) {
      nativeGoogleSignin.configure(config)
    }
  },
  hasPlayServices: async (options?: {
    showPlayServicesUpdateDialog?: boolean
  }): Promise<boolean> => {
    if (nativeGoogleSignin?.hasPlayServices) {
      return await nativeGoogleSignin.hasPlayServices(options)
    }
    return false
  },
  hasPreviousSignIn: (): boolean => {
    if (nativeGoogleSignin?.hasPreviousSignIn) {
      return nativeGoogleSignin.hasPreviousSignIn()
    }
    return false
  },
  signIn: async (): Promise<SignInResult> => {
    if (nativeGoogleSignin?.signIn) {
      return await nativeGoogleSignin.signIn()
    }
    throw new Error(
      'Google Sign-In requires a custom development build (npx expo run:android / npx expo run:ios) and is not available in Expo Go.',
    )
  },
  signOut: async (): Promise<void> => {
    if (nativeGoogleSignin?.signOut) {
      await nativeGoogleSignin.signOut()
    }
  },
}

export const statusCodes = {
  SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
  IN_PROGRESS: 'IN_PROGRESS',
  PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
  ...nativeStatusCodes,
}

export function isErrorWithCode(error: unknown): error is { code: string; message: string } {
  if (nativeIsErrorWithCode && nativeIsErrorWithCode(error)) {
    return true
  }
  return typeof error === 'object' && error !== null && 'code' in error
}
