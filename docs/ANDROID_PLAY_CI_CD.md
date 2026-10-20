# SLATE — Android CI/CD to Google Play Internal Testing

This is the complete setup for wrapping SLATE with Capacitor and publishing a signed
Android App Bundle (`.aab`) to the Google Play **internal testing** track on every push
to `main`.

**Pipeline:** push to `main` → Bun install → Vite build → Capacitor sync → Gradle
`signed bundleRelease` → Fastlane `supply` → Google Play internal testing.

## Prerequisites

- Bun 1.3+ for install and build
- Node.js 22+ for the Capacitor CLI (`bunx` runs the CLI through its Node shebang;
  the workflow installs both Bun and Node 22)
- JDK 21 (Android Studio's embedded JDK is fine)
- Android Studio / Android SDK with API 36 (only needed for local builds)
- Ruby 3.4 + Bundler if you want to run Fastlane locally (WSL is easiest on Windows)
- A Google Play Developer account and a Google Cloud project
- The first release uploaded manually to Play Console (see section 7)

**Assumed identifiers**

| Item | Value |
| --- | --- |
| Repository | `Aech-f789sga/SLATE` |
| Branch | `main` |
| App name | `SLATE` |
| Android package / applicationId | `com.aech.slate` |
| Play track | `internal` |
| Capacitor | 8.x |
| JDK | 21 |
| Android compile/target SDK | 36 |

`com.aech.slate` is only a starting point. The package name is **permanent** after the
first Play Console upload, so change it before that point if you want a different one.
If you do, update it in:

- `capacitor.config.ts` (`appId`)
- `android/app/build.gradle` (`namespace` and `applicationId`)
- `android/fastlane/Appfile` (`package_name`)
- The app you create in Play Console

---

## 1. Capacitor setup (already done in this repository)

> **This repository already includes the generated `android/` project.** Do not run
> `bunx cap add android` again; Capacitor refuses to add a platform when `android/`
> already exists. This section documents how the platform was generated, and how to
> recreate it from scratch.
>
> In a fresh repo, generate the Android platform **before** creating/copying
> `android/fastlane/`; if you copied Fastlane first, move it aside, generate the
> platform, then put it back.

For a fresh checkout, from the repository root:

```bash
bun add @capacitor/core@^8 @capacitor/android@^8
bun add -d @capacitor/cli@^8

# Skip this if capacitor.config.ts already exists (it is included in this bundle).
bunx cap init "SLATE" com.aech.slate --web-dir=dist

bunx cap add android
bun install
```

`capacitor.config.ts` should contain:

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aech.slate',
  appName: 'SLATE',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
```

Then commit the generated native project:

```bash
git add capacitor.config.ts package.json bun.lock android
git commit -m "chore: add Capacitor Android platform"
```

> **Important:** commit `android/`. It is source code, not a build artifact. The GitHub
> Actions runner needs `android/gradlew`, `android/app/build.gradle`, and the Fastlane
> files. Do **not** add `android/` to `.gitignore`.

If you already generated `android/` with a different app ID, either regenerate it before
the first Play upload (`rm -rf android && bunx cap add android`) or update the Android
package name and move the Java package folder manually.

### 1.1 Protect credentials in `.gitignore` before adding them

The root `.gitignore` already includes these patterns. They must be present **before**
you create a keystore or place the service account JSON inside the repo:

```gitignore
# Android signing and Play credentials
*.jks
*.keystore
android/fastlane/play-service-account.json

# Android local machine config
android/local.properties
```

Android build output is ignored by the generated `android/.gitignore`. Do **not** ignore
`android/` itself. Verify the sensitive paths are ignored:

```bash
git check-ignore -v android/app/slate-upload.jks android/fastlane/play-service-account.json
```

If you already committed a keystore or service account JSON, remove it from Git history
immediately, rotate the credential, and replace the Play/Google Cloud key.

---

## 2. Configure release signing and CI versioning

The generated **`android/app/build.gradle`** in this repository already contains the
signing/versioning patch. Verify it against the snippets below; do not replace the whole
file.

### 2.1 Add signing/version variables above `android {`

Near the top of the file, after `apply plugin: 'com.android.application'`, add this block.
Do **not** duplicate the `apply plugin` line.

```groovy
// --- Release signing and CI versioning ---------------------------------------
def releaseStoreFile = System.getenv("ANDROID_KEYSTORE_PATH")
def releaseStorePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
def releaseKeyAlias = System.getenv("ANDROID_KEY_ALIAS")
def releaseKeyPassword = System.getenv("ANDROID_KEY_PASSWORD")
def releaseVersionCode = System.getenv("VERSION_CODE")?.toInteger() ?: 1
def releaseVersionName = System.getenv("VERSION_NAME") ?: "1.0"
def hasReleaseSigning = releaseStoreFile && releaseStorePassword && releaseKeyAlias && releaseKeyPassword && file(releaseStoreFile).exists()
// -----------------------------------------------------------------------------
```

The generated `android { ... }` block already contains `namespace = "com.aech.slate"`.

### 2.2 Replace `versionCode` / `versionName` in `defaultConfig`

```groovy
    defaultConfig {
        applicationId "com.aech.slate"
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
        versionCode releaseVersionCode
        versionName releaseVersionName
        // ... keep the rest of the generated block ...
    }
```

### 2.3 Add `signingConfigs` before `buildTypes`

```groovy
    signingConfigs {
        release {
            if (hasReleaseSigning) {
                storeFile file(releaseStoreFile)
                storePassword releaseStorePassword
                keyAlias releaseKeyAlias
                keyPassword releaseKeyPassword
            }
        }
    }

    buildTypes {
        release {
            if (hasReleaseSigning) {
                signingConfig signingConfigs.release
            }
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
```

The signing credentials are passed as environment variables, never hard-coded. When the
variables are absent, a local release build is simply unsigned. CI always sets them.

### 2.4 How version codes work

`versionCode` and `versionName` are supplied by the workflow:

```text
VERSION_CODE = 1000 + github.run_number   # 1001, 1002, 1003, ...
VERSION_NAME = 1.0.<github.run_number>
```

The `+1000` leaves room for the manually uploaded first release (version code `1`).
Google Play requires every upload to have a higher version code than every previous
upload, including uploads to internal testing.

If you rename the workflow file, GitHub may reset `run_number`; in that case raise the
`1000` base so the next code is still above the highest code already in Play Console.
Re-running a workflow that already uploaded successfully reuses the same version code
and will be rejected by Play. Push a new commit instead.

---

## 3. Fastlane files

These files are already committed under `android/`:

```text
android/fastlane/Fastfile
android/fastlane/Appfile
android/fastlane/metadata/android/en-US/changelogs/default.txt
```

Fastlane must be run **from the `android/` directory** so relative paths such as
`app/build/...` and `fastlane/metadata/...` resolve correctly.

### Root `Gemfile`

The `Gemfile` at the repository root pins Fastlane. `ruby/setup-ruby` installs it in CI:

```ruby
source "https://rubygems.org"

gem "fastlane", "~> 2.241"
```

Run `bundle install` locally once and commit `Gemfile.lock` for fully reproducible CI.
The workflow works without a lockfile too, but a lockfile is recommended.

---

## 4. Generate the Android upload keystore

Generate one upload key and keep it forever. This is the key that signs uploads to Play;
Google Play App Signing stores the actual app-signing key.

### macOS / Linux / WSL

```bash
keytool -genkeypair -v \
  -keystore slate-upload.jks \
  -alias slate-upload \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -storetype JKS
```

### Windows PowerShell

```powershell
keytool -genkeypair -v `
  -keystore slate-upload.jks `
  -alias slate-upload `
  -keyalg RSA `
  -keysize 2048 `
  -validity 10000 `
  -storetype JKS
```

Use a strong store password and the same password for the key when prompted. Record:

- Keystore/store password
- Key alias (`slate-upload` in this example)
- Key password
- The keystore file itself

Verify it:

```bash
keytool -list -v -keystore slate-upload.jks -alias slate-upload
```

Back up `slate-upload.jks` and all passwords in a password manager or secure vault. Do
not commit the keystore. If you lose the upload key, you must request an upload-key reset
from Google Play.

> If the SLATE app is already published on Play, use its **existing upload keystore**
> instead of generating a new one. When you upload the first AAB, opt in to **Play App
> Signing**; this keystore then acts as your upload key while Google holds the app-signing
> key.

Place it at `android/app/slate-upload.jks` for local release builds, or leave it anywhere
outside the repo and point `ANDROID_KEYSTORE_PATH` at it.

---

## 5. Create the Google Cloud service account

1. Open [Google Cloud Console](https://console.cloud.google.com/) and select (or create)
   the project you will link to Play Console.
2. Go to **APIs & Services → Library**, search for **Google Play Android Developer API**,
   and enable it.
3. Go to **IAM & Admin → Service Accounts → Create service account**.
   - Name: `slate-play-publisher`
   - No Google Cloud IAM role is required for Play uploads; permissions are granted in
     Play Console.
4. Open the new service account → **Keys → Add key → Create new key → JSON**.
   Download the JSON file. This is the only copy of that private key.
5. Copy the service account email (looks like
   `slate-play-publisher@<project>.iam.gserviceaccount.com`).

### CLI alternative with `gcloud`

If you have the [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) installed,
steps 1–4 can be done from a terminal:

```bash
gcloud config set project YOUR_PROJECT_ID
gcloud services enable androidpublisher.googleapis.com

gcloud iam service-accounts create slate-play-publisher \
  --display-name="SLATE Play Publisher"

gcloud iam service-accounts keys create play-service-account.json \
  --iam-account="slate-play-publisher@YOUR_PROJECT_ID.iam.gserviceaccount.com"
```

The last command creates the JSON key on disk. You still must link the Google Cloud
project and invite the service account in Play Console (sections 5.1 and 5.2).

### 5.1 Link the Google Cloud project to Play Console

In Play Console: **Setup → API access**. Link the Google Cloud project that contains the
service account. If the project is not linked, uploads fail with a `401`/permission error.

### 5.2 Grant the service account access in Play Console

1. **Users and permissions → Invite new users**.
2. Paste the service account email.
3. **App permissions**: select the SLATE app.
4. Grant **Release to testing tracks** (or **Admin** while you are validating the
   pipeline).
5. Invite the user. Wait a few minutes for propagation.

You cannot create an app through the Play Developer API. Create the app manually in Play
Console first, with the exact package name `com.aech.slate`.

---

## 6. Base64-encode the credentials and add GitHub Secrets

Base64 is only an encoding to move binary/multiline files safely into GitHub Secrets. It
is **not encryption**. GitHub encrypts secrets at rest; never commit these files.

### 6.1 Encode the keystore

**Linux / WSL:**

```bash
base64 -w 0 slate-upload.jks
```

**macOS:**

```bash
base64 -i slate-upload.jks | tr -d '\n'
```

**Windows PowerShell:**

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("slate-upload.jks"))
```

### 6.2 Encode the service account JSON

The same commands, replacing `slate-upload.jks` with `play-service-account.json`.

### 6.3 Add the secrets with GitHub CLI

Authenticate first if needed (`gh auth login`), then run from the directory containing
the files:

```bash
# Linux/WSL: base64 output has no line breaks
base64 -w 0 slate-upload.jks | gh secret set ANDROID_KEYSTORE_BASE64 --repo Aech-f789sga/SLATE
base64 -w 0 play-service-account.json | gh secret set PLAY_SERVICE_ACCOUNT_JSON_BASE64 --repo Aech-f789sga/SLATE
```

On macOS, use `base64 -i <file> | tr -d '\n' | gh secret set ...`.

Set the password/alias secrets interactively (the value is hidden):

```bash
gh secret set ANDROID_KEYSTORE_PASSWORD --repo Aech-f789sga/SLATE
gh secret set ANDROID_KEY_ALIAS --repo Aech-f789sga/SLATE --body "slate-upload"
gh secret set ANDROID_KEY_PASSWORD --repo Aech-f789sga/SLATE
```

Alternatively use **GitHub → Settings → Secrets and variables → Actions → New repository
secret** for each entry.

### Exact secret names

| GitHub secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | Base64 of `slate-upload.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore/store password |
| `ANDROID_KEY_ALIAS` | `slate-upload` (or your alias) |
| `ANDROID_KEY_PASSWORD` | Key password |
| `PLAY_SERVICE_ACCOUNT_JSON_BASE64` | Base64 of the service account JSON key |

Use **repository secrets**, not environment secrets: the workflow does not declare a
GitHub Environment, so environment-scoped secrets would not be visible to it.

Verify the names (values are never displayed):

```bash
gh secret list --repo Aech-f789sga/SLATE
```

---

## 7. First upload must be manual

Google Play is not able to create a brand-new app through this API, and Play generally
requires the first release to be uploaded in the Play Console UI.

1. In Play Console, create the app:
   - Name: **SLATE**
   - Package name: **com.aech.slate**
   - App / Free
2. Complete the required **App content** declarations (privacy policy, data safety,
   content rating, target audience, ads, etc.).
3. Add the **store listing** assets Play requires before a release can roll out: app icon
   (512×512 PNG), feature graphic (1024×500), phone screenshots, short/full description,
   and a privacy policy URL. The CI pipeline intentionally does not manage these.
4. Build the first AAB locally with version code `1`.

### Build the first AAB locally

macOS/Linux/WSL:

```bash
bun install
bun run build
bunx cap sync android

export ANDROID_KEYSTORE_PATH="$PWD/android/app/slate-upload.jks"
export ANDROID_KEYSTORE_PASSWORD="your-store-password"
export ANDROID_KEY_ALIAS="slate-upload"
export ANDROID_KEY_PASSWORD="your-key-password"

cd android
./gradlew bundleRelease
```

Windows PowerShell:

```powershell
bun install
bun run build
bunx cap sync android

$env:ANDROID_KEYSTORE_PATH = "$PWD\android\app\slate-upload.jks"
$env:ANDROID_KEYSTORE_PASSWORD = "your-store-password"
$env:ANDROID_KEY_ALIAS = "slate-upload"
$env:ANDROID_KEY_PASSWORD = "your-key-password"

cd android
.\gradlew.bat bundleRelease
```

The signed bundle is at:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

5. In Play Console go to **Test and release → Testing → Internal testing → Create new
   release**, upload that AAB, add release notes, save, and roll it out.
6. Add your testers and share the internal-testing opt-in link.

You only need to do this once. After the app and internal track exist, the pipeline can
publish every subsequent build.

---

## 8. Push and watch the pipeline

Before the first pipeline run, make sure the app exists in Play Console and the manual
first release from section 7 is done. The Play API cannot create an app.

Commit the workflow, Fastlane files, `Gemfile`, `capacitor.config.ts`, the Android
project, and the updated `bun.lock`. Verify no credentials are staged first:

```bash
git status --short
git check-ignore -v android/app/slate-upload.jks android/fastlane/play-service-account.json

git add .github/workflows/deploy.yml Gemfile capacitor.config.ts android package.json bun.lock

# Only if you ran `bundle install` locally and generated it:
git add Gemfile.lock

git commit -m "ci: build and deploy Android app to Play internal testing"
git push origin main
```

`git status --short` must not list a `.jks`, `.keystore`, or
`android/fastlane/play-service-account.json` file. Add `Gemfile.lock` only if it exists;
the workflow can generate it, but committing it is recommended.

Then open **GitHub → Actions → Deploy Android to Google Play (Internal)**.

The workflow:

1. Validates that all five secrets exist.
2. Installs Bun and Node 22, installs packages with a frozen lockfile, and runs
   `bun run build`.
3. Installs JDK 21 and Android SDK 36, then runs `bunx cap sync android`.
4. Computes a unique `versionCode`.
5. Installs Ruby/Fastlane and decodes the keystore and service account JSON.
6. Builds a signed AAB with `fastlane build`.
7. Verifies the AAB signature with `keytool`.
8. Saves the AAB as a workflow artifact.
9. Uploads it with `fastlane internal` to the `internal` track.

Check **Play Console → Testing → Internal testing** after the run. The release should
show the new version code.

---

## 9. Optional local Fastlane verification

Use Ruby 3.4 and run Fastlane from `android/`:

```bash
bundle install

cd android
export ANDROID_KEYSTORE_PATH="$PWD/app/slate-upload.jks"
export ANDROID_KEYSTORE_PASSWORD="your-store-password"
export ANDROID_KEY_ALIAS="slate-upload"
export ANDROID_KEY_PASSWORD="your-key-password"
export PLAY_SERVICE_ACCOUNT_JSON_PATH="$PWD/fastlane/play-service-account.json"

bundle exec fastlane build
bundle exec fastlane internal
```

`bundle exec fastlane deploy` does both in one command. Never commit
`android/fastlane/play-service-account.json` or the keystore.

---

## 10. Verify the credential ignores

The patterns are added in section 1.1. Before your first commit, run:

```bash
git status --short
git check-ignore -v android/app/slate-upload.jks android/fastlane/play-service-account.json
```

`git status` must never show a `.jks`, `.keystore`, or `play-service-account.json` entry.
Never use `git add -f` for credentials.

---

## 11. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Missing required repository secret: ...` | Add all five secrets at repository scope. Environment secrets are not used by this workflow. |
| `SDK location not found` | The workflow uses `android-actions/setup-android`; locally set `ANDROID_HOME` or create `android/local.properties` with `sdk.dir=...`. |
| `invalid source release: 21` | Use JDK 21. In CI, `setup-java` handles it; locally set `JAVA_HOME` to Android Studio's embedded JDK or a JDK 21 install. |
| `Could not find aab file` / `AAB not found` | Run `fastlane build` before `fastlane internal`, and make sure the Gradle build succeeded. |
| `Keystore file not found` / signing skipped | Confirm the workflow decoded the keystore to `android/app/release.jks` and that `ANDROID_KEYSTORE_PATH` is set. Check the signing patch in `android/app/build.gradle`. |
| `Google Play Android Developer API has not been used` | Enable **Google Play Android Developer API** in the Google Cloud project linked to Play Console. |
| `The caller does not have permission` | Invite the service account email in Play Console → Users and permissions, with access to the SLATE app and **Release to testing tracks**. Also verify the package name matches. |
| `Version code ... has already been used` | The run number was reused (e.g. re-running a successful workflow) or the base is too low. Push a new commit or raise the `+1000` base. |
| `App bundle is not signed` | The signing environment variables were not present when Gradle ran, or the signing block was not added to `android/app/build.gradle`. |
| `Could not find changelog ... default.txt` | Restore `android/fastlane/metadata/android/en-US/changelogs/default.txt`, or set `skip_upload_changelogs: true` in the Fastfile. |
| `bundle: command not found` | `ruby/setup-ruby` installs Bundler. Locally install Ruby 3.4 and run `bundle install`. |
| `fastlane: command not found` | Always use `bundle exec fastlane ...` and run from `android/`. |
| `Capacitor CLI requires Node.js 22` | Capacitor 8 requires Node 22+. The workflow installs Node 22 alongside Bun. Locally install Node 22+; `bunx` launches the CLI through its Node shebang. |
| Play shows an old/blank UI | The PWA service worker can cache the old app shell inside the WebView. Consider disabling `vite-plugin-pwa` for native builds, e.g. `disable: process.env.CAPACITOR_BUILD === 'true'`, and set `CAPACITOR_BUILD=true` in the build step. |
| `changes_not_sent_for_review` | Fastlane retries automatically by default. If it persists, use a service account with stronger Play Console release permissions. |

---

## 12. Security and release notes

- **Back up the upload keystore and passwords.** GitHub Secrets are not a backup.
  Losing the key can require an upload-key reset; losing the Google Play account access
  can block releases entirely.
- **Never commit** the `.jks`, `keystore.properties`, or the service account JSON.
- **Rotate the service account key** immediately if it is exposed.
- Grant the service account the minimum Play Console role that allows internal releases.
- The AAB artifact is retained for 14 days in the workflow and does not contain the
  signing key.
- This pipeline deploys only to **internal testing**. Promoting to closed/open/production
  is still a deliberate action in Play Console (or a separate Fastlane lane).
- For stricter supply-chain security, pin third-party GitHub Actions to full commit SHAs
  instead of major-version tags.
- The workflow uploads on every push to `main`, including documentation-only changes.
  If that is wasteful, add a `paths:` filter under `on.push` (for example `src/**`,
  `public/**`, `package.json`, `capacitor.config.ts`, `android/**`).
