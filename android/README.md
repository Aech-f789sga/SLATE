# Slate for Android

A WebView shell around the Slate web app. Content updates are offered to the
user, not pushed at them: the app checks for a new build every three hours and
asks before switching to it.

---

## The mental model

There are two different kinds of "update", and they behave differently.

| Layer | What it is | How it updates | Who decides |
|---|---|---|---|
| **Web build** | The app on Vercel | In-app prompt, checked every 3h | **The user** |
| **APK** | This Android shell | New `.apk` file, user taps Install | The user |

Almost everything you change lives in the web layer. Push code, Vercel deploys,
and every running client is offered the new build within three hours — on the
library screen, never over a note. **No APK rebuild, no Play Store review, no
reinstall.**

The APK only needs rebuilding when you change native behaviour (permissions,
stylus handling, the shell UI itself).

### How the update prompt works

Each build publishes `version.json` and bakes its own id in as
`__SLATE_VERSION__`. Every three hours, while online, the client fetches
`version.json` with `no-store` and compares the two.

- Different → an "Update available" card appears, **only on the library screen**.
- It hides itself the moment a note or a modal opens, and comes back when the
  user returns to the library.
- **Later** snoozes it for three hours. **Update now** clears caches, drops the
  service worker registration, and reloads onto the new build.

The service worker precaching `index.html` is what makes this meaningful: a
running client keeps executing the build it booted with even after a newer one
has been deployed, so the prompt decides *when* that cached copy is discarded.

If the app is backgrounded when a check fires, the shell raises a system
notification instead — the one case the in-app card cannot cover. That needs
`POST_NOTIFICATIONS` on Android 13+, which is requested at the moment there is
first something to say rather than at launch.

### The Firestore gate is now an override

`app_config/release` still works exactly as described below, and the shell still
prefers `approved.url` over the bundled default whenever that document exists.
But it is dormant unless you create it, so it is now an emergency lever — pin
every phone to one specific build immediately — rather than the normal release
path.

---

## Setup, once

> Only needed for the Firestore override and for CI-built APKs. The in-app
> update prompt needs none of it — it works from `version.json` alone.

### 1. Deploy the Firestore rules

`firestore.rules` gained an `app_config` block: world-readable (the app must
know which build to load *before* anyone signs in), admin-only writes.

```bash
npm run deploy:rules
```

Until you do this, the app silently falls back to the bundled URL.

### 2. Vercel token

Create a token at <https://vercel.com/account/tokens>, then add three repo
secrets:

| Secret | Where to find it |
|---|---|
| `VERCEL_TOKEN` | the token you just made |
| `VERCEL_ORG_ID` | `.vercel/project.json` after `vercel link`, or Project → Settings |
| `VERCEL_PROJECT_ID` | same file |

### 3. Firebase service account

Firebase console → Project settings → Service accounts → **Generate new private
key**. Paste the whole JSON into the repo secret `FIREBASE_SERVICE_ACCOUNT`.

This lets CI write `pending`. It has no way to write `approved` — only the
admin account can do that, because the rules say so.

### 4. Signing key

The keystore in `android/keystore/slate-release.jks` signs the APK.

```bash
base64 -w0 android/keystore/slate-release.jks    # → SLATE_KEYSTORE_BASE64
```

| Secret | Value |
|---|---|
| `SLATE_KEYSTORE_BASE64` | output above |
| `SLATE_STORE_PASSWORD` | see `android/keystore.properties` |
| `SLATE_KEY_ALIAS` | `slate` |
| `SLATE_KEY_PASSWORD` | same as store password |

> **Back this keystore up somewhere you will not lose it.** Android identifies
> an app by its signing key. Lose it and you can never ship an update to anyone
> who already installed the app — they would have to uninstall first, losing
> local-only notebooks. There is no recovery.

### 5. Google sign-in (optional but recommended)

Google refuses to run OAuth inside a WebView, so the app uses the native Android
account picker instead. That needs one extra OAuth client:

1. Google Cloud console → APIs & Services → Credentials → **Create credentials**
   → OAuth client ID → **Android**.
2. Package name: `app.slate.notes`
3. SHA-1: `8F:50:00:FF:7F:4E:59:A7:3B:E8:32:96:01:12:EF:82:9A:F0:D0:57`
4. Paste the *web* client ID (not the Android one) into
   `android/gradle.properties` → `slateGoogleClientId`.

Until this is done, `Continue with Google` is disabled inside the app and users
sign in with email/password. Everything else works.

---

## Day to day

```
edit code  →  push to main  →  open /release-admin.html  →  Preview  →  Approve
```

The admin console is at:

```
https://slate-omega-henna.vercel.app/release-admin.html
```

Sign in with the admin Google account. You will see the pending build, the
currently live build, and a rollback list. Approving is one click; rolling back
is one click and takes effect on the next app launch.

### Rolling back

Every approval pushes the previous build onto `history`. Press **Roll back** on
any entry and every phone returns to it. Useful when a build looks fine on
desktop but misbehaves with a stylus.

---

## Building locally

```bash
cd android
gradle assembleRelease
# → app/build/outputs/apk/release/app-release.apk
```

Requires JDK 17 and an Android SDK with `platforms;android-34`. If you do not
have them, just push — CI builds the APK for you and attaches it as an artifact
(or to the GitHub Release when you push a tag).

---

## Known limits

**Stylus latency.** This is a WebView, not a native drawing surface. Android's
Chromium reports pen pressure and `pointerType` correctly, and the app's palm
rejection still works — but inking latency is a few milliseconds behind a native
canvas. Test it on your actual tablet before committing to this distribution
path. If it feels wrong, the fix is a native ink layer, not a config tweak.

**APK updates cannot be silent.** Android forbids installing an update without
the user tapping through the installer, unless the device is managed by an MDM.
The web layer sidesteps this entirely by updating content, not the app.

**Play Store.** This APK is built for sideloading / direct distribution. If you
want it on Play, a Trusted Web Activity (Bubblewrap) is the usual route — but a
TWA cannot do the admin gate, because it loads the site by origin and you cannot
swap origins per approved build.

**Offline first launch.** The very first launch needs network to read the
release document. If it cannot, it falls back to the bundled URL so the app
still opens; the gate re-engages on the next launch.

---

## Layout

```
android/
├── app/src/main/java/app/slate/notes/
│   ├── MainActivity.kt      WebView host, boot sequence, gate, file/media plumbing
│   ├── ReleaseChannel.kt    Firestore REST read + local cache
│   ├── NativeBridge.kt      JS bridge surface (`SlateHost`)
│   └── GoogleSignIn.kt      Credential Manager → ID token
├── gradle.properties        version, fallback URL, Google client ID
└── keystore.properties      signing (git-ignored)

public/release-admin.html    the approval console
scripts/publish-release.mjs  CI → Firestore `pending`
.github/workflows/release.yml  build web + APK on push
firestore.rules              app_config block
```
