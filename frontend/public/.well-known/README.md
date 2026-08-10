# Universal links

The two token-bearing emails — password reset and email-change confirmation —
should open the app when the recipient is holding a phone, and the web app when
they are not. Both platforms decide that by fetching a file from the host named
in the link, so **the app config alone does nothing**: `mobile/app.config.ts`
claims the host, and the two files in this directory are the host agreeing.

The host is whatever the backend has as `APP_URL`, because that is what it builds
the links from. `mobile/.env` must carry the same value as `EXPO_PUBLIC_APP_URL`,
or the app claims a domain that never appears in any email.

Both files must be served **over HTTPS, with no redirect, at exactly**
`/.well-known/<name>`, with `Content-Type: application/json`. Vite copies
`public/` verbatim into the build, so they land at the right paths on their own.
A redirect — including the http→https one most hosts add — fails verification
silently.

## Before either works

**`apple-app-site-association`** — replace `TEAMID` with the Apple Developer Team
ID that signs the build. It is the ten-character prefix Apple shows beside the
app identifier; the finished value reads e.g. `A1B2C3D4E5.com.saulado.app`. Note
the file has **no `.json` extension** — Apple requires that exact name.

**`assetlinks.json`** — replace the fingerprint placeholder with the SHA-256 of
the certificate that signs the Android build:

```bash
# EAS-managed credentials
eas credentials --platform android

# a local keystore
keytool -list -v -keystore <path> -alias <alias>
```

Play App Signing re-signs the uploaded artifact, so a build shipped through the
Play Store needs the **App signing key certificate** fingerprint from the Play
Console, not the upload key's. Getting these two the wrong way round is the usual
reason verification passes in an internal build and fails in production. Both may
be listed at once — `sha256_cert_fingerprints` is an array, so a debug build's
fingerprint can sit alongside the release one during development.

## Checking it took

```bash
curl -sSL -D- https://<host>/.well-known/assetlinks.json
curl -sSL -D- https://<host>/.well-known/apple-app-site-association
```

Both must return `200` with JSON and no redirect in the header trace.

On Android, after installing the build:

```bash
adb shell pm get-app-links com.saulado.app     # want: verified
adb shell pm verify-app-links --re-verify com.saulado.app
```

iOS caches its fetch aggressively. Deleting and reinstalling the app is the
reliable way to force a re-fetch during development.

## What still works without any of this

The `saulado://` scheme, declared in `app.config.ts`, needs no domain and no
verification, and is how a development build opens links. Universal links are
only about a link the user taps in _mail_, on a device where the app is
installed, opening the app instead of the browser.
