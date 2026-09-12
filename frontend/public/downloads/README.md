# Saulado Standalone Android APK Directory

Place your release `saulado.apk` file in this directory:

```
frontend/public/downloads/saulado.apk
```

### Direct Download URL on Vercel:

```
https://saulado-sigma.vercel.app/downloads/saulado.apk
```

### Note on Vercel File Size Limits:

- Vercel's maximum file size limit for static files is **100 MB**.
- If your universal APK is larger than 100 MB, you can either:
  1. Set `enableSeparateBuildPerCPUArchitecture = true` in `mobile/android/app/build.gradle` to generate split APKs (~35-45 MB each).
  2. Upload the APK to **GitHub Releases** (supports files up to 2 GB) and set `VITE_APK_DOWNLOAD_URL` in `.env`.
