import type { ExpoConfig } from 'expo/config'

/**
 * The whole app config, in one file rather than an `app.json` with a dynamic
 * layer on top of it. Two of the values below are computed, so the file has to
 * be TypeScript either way — and a static `app.json` beside it would only be a
 * second place to look for a setting.
 *
 * Two token-bearing links arrive by email — `/reset-password?token=` and
 * `/account/email/confirm?token=` — and the backend builds both from its own
 * `APP_URL`. The host the app claims has to be the host the mail names, and that
 * is not knowable at commit time: it lives in a Render dashboard variable
 * (`render.yaml` keeps `APP_URL` as `sync: false`). Hard-coding a domain here
 * would mean every deployment quietly claims someone else's.
 */
const APP_URL = process.env.EXPO_PUBLIC_APP_URL ?? ''
const APP_HOST = APP_URL.replace(/^https?:\/\//, '').replace(/\/.*$/, '')

/**
 * Only an `https` host is eligible. `http://localhost:5173` is a correct value
 * for the backend to build links from and a meaningless one here — neither
 * platform verifies a link over plain HTTP, so claiming it produces config that
 * silently does nothing.
 *
 * Not a gap in development: the custom scheme below needs no domain, no
 * verification and no deployment, and is what a development build opens links
 * with anyway.
 */
const universalHost = APP_URL.startsWith('https://') && APP_HOST !== '' ? APP_HOST : null

/** The two paths that arrive as email links, and the only two worth claiming. */
const LINK_PATHS = ['/reset-password', '/account/email/confirm']

const config: ExpoConfig = {
  name: 'Saulado',
  slug: 'saulado',
  version: '0.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  // `automatic` lets the OS appearance reach `useColorScheme()`, which is what
  // the `system` theme option reads. Pinning this to light or dark would make
  // that option report a constant.
  userInterfaceStyle: 'automatic',
  platforms: ['ios', 'android'],

  // Required for deep linking at all, and the only mechanism that works in Expo
  // Go and in a development build. `saulado://reset-password?token=…`.
  scheme: 'saulado',

  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.saulado.app',
    // `applinks:` is the Universal Links entitlement, and half the contract. The
    // other half is an `apple-app-site-association` file served by that host over
    // HTTPS naming this bundle identifier and these paths. Without both, iOS
    // opens the link in Safari and the app never sees it.
    associatedDomains: universalHost ? [`applinks:${universalHost}`] : undefined,
  },

  android: {
    package: 'com.saulado.app',
    adaptiveIcon: {
      backgroundColor: '#F2F9F5',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    // `autoVerify` makes the system fetch `/.well-known/assetlinks.json` from the
    // host and check this package's signing certificate against it. Unverified,
    // the link falls back to an "open with" chooser — worse than the browser.
    intentFilters: universalHost
      ? [
          {
            action: 'VIEW',
            autoVerify: true,
            data: LINK_PATHS.map((pathPrefix) => ({
              scheme: 'https',
              host: universalHost,
              pathPrefix,
            })),
            category: ['BROWSABLE', 'DEFAULT'],
          },
        ]
      : undefined,
  },

  /**
   * The two permission strings are not boilerplate: Apple rejects a build that
   * opens the camera or reads the photo library without one, and the string is
   * what the system dialog shows, so it is the only place the app gets to explain
   * itself before the user decides. Both say where the text goes, because that is
   * the question someone pointing a camera at their own notes is actually asking.
   *
   * `recordAudioAndroid` and `microphonePermission` are off because nothing here
   * records: left at their defaults, both plugins add `RECORD_AUDIO` to the
   * manifest and a microphone string to the plist for a feature the app does not
   * have. `barcodeScannerEnabled` off drops the scanner out of the binary for the
   * same reason.
   */
  plugins: [
    'expo-secure-store',
    'expo-router',
    '@react-native-google-signin/google-signin',
    [
      'expo-camera',
      {
        cameraPermission:
          'Saulado uses the camera to read text from a page you point it at. The photo is processed on this device and is never uploaded or saved.',
        recordAudioAndroid: false,
        barcodeScannerEnabled: false,
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission:
          'Saulado reads text from a photo you choose. It stays on this device and is never uploaded.',
        microphonePermission: false,
      },
    ],
  ],
}

export default config
