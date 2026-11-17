# Android app (APK) for STARLINK HYPERCORE FINANCE

The Android app is a Trusted Web Activity: a small native shell that opens your **live website** full-screen.
That means the website, the installable PWA and the APK are one product. They share the same code, the same
Firebase sign-in (email and phone OTP), the same Firestore database and the same Storage. Fix or update the website
and the app updates with it. Nothing is stored or duplicated inside the APK.

The APK needs the website to be live first, because it opens that address.

## Order of work

1. **Put the website online** (once). Follow `SETUP.md` section 1 and 2, or use the **Deploy website to Firebase** workflow below. You get an address like `https://YOUR_PROJECT.web.app`.
2. **Build the APK** (GitHub Actions, no Android Studio needed).
3. **Install it on your phone.**
4. (Recommended) **Add a permanent signing key** so Android treats the app as fully trusted and future versions can update it.

### 1. Deploy the website from GitHub (optional shortcut)

In GitHub: Settings > Secrets and variables > Actions.

- Variable `FIREBASE_PROJECT_ID`: your Firebase project id.
- Secret `FIREBASE_SERVICE_ACCOUNT`: the full JSON of a service account (Firebase console > Project settings > Service accounts > Generate new private key). Keep it secret. Never commit it.

Then Actions > **Deploy website to Firebase** > Run workflow. The run summary shows the live addresses. You can also deploy from your computer with `firebase deploy` as described in `SETUP.md`.

### 2. Build the APK

1. In GitHub: Settings > Secrets and variables > Actions > **Variables** > New variable `SITE_URL` = your live address, for example `https://YOUR_PROJECT.web.app`. (Or type it in when you run the workflow.)
2. Actions > **Build Android APK** > Run workflow. It takes about 5 to 10 minutes.
3. Open the finished run and download **StarlinkHypercoreFinance-apk** at the bottom (a zip containing `StarlinkHypercoreFinance.apk`).

### 3. Install on an Android phone

1. Send the APK to the phone (download it there, or use USB, Google Drive, WhatsApp to yourself).
2. Open it. Android asks to allow installs from that app (Chrome, Files, WhatsApp); allow it.
3. If Google Play Protect says the app is unknown, choose **Install anyway**. That message is normal for any app installed outside the Play Store.
4. Open **Hypercore Finance** from the home screen.

If you only want an installable app and not an APK, open the website in Chrome on the phone and choose **Install app**. Both routes use the same backend.

### 4. Add a permanent signing key (recommended)

Without this, every build gets a temporary key, so updates cannot install over an older copy and the app shows a thin address bar at the top.

On your computer (needs Java):

```
keytool -genkeypair -v -keystore hypercore-release.jks -alias hypercore -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 hypercore-release.jks        # on a Mac use: base64 -i hypercore-release.jks
```

Add four GitHub secrets: `ANDROID_KEYSTORE_BASE64` (the base64 text), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`hypercore`), `ANDROID_KEY_PASSWORD`.
**Back up `hypercore-release.jks` and its passwords somewhere safe. If you lose them you can never update the app.** Do not commit the file.

Run **Build Android APK** again. The run summary shows the **SHA-256 fingerprint**. Put it in `.well-known/assetlinks.json` in place of `REPLACE_WITH_APK_SIGNING_SHA256_FINGERPRINT`, deploy the website again, then reinstall the APK. Check that `https://YOUR_SITE/.well-known/assetlinks.json` opens in a browser. After that the app opens fully full-screen without the address bar.

## Updating the app

- Website changes (almost everything): deploy the website. The app and the installed PWA pick it up automatically.
- Only rebuild the APK to change its name, icon, colour or website address. Increase `version_code` each time.

## Notes

- The package name is `ug.co.starlinkhypercore.finance`. Change it in `android/app/build.gradle`, `.well-known/assetlinks.json` before your first public release if you want something different.
- The app uses Chrome on the phone, so phone OTP (reCAPTCHA) and sign-in work exactly as on the website. A normal embedded browser (WebView) is deliberately not used.
- Publishing to Google Play needs a Play developer account and an app bundle. This setup produces a directly installable APK for your own use and testing.
- This project does not move real money. See `SETUP.md` section 7 before using real customers.
