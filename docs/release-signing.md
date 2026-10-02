# Release signing key (created 2026-10-02)

> ## ⚠️ Signature change — 2026-10-02
>
> The app's signing identity changed from **`CN=Vega`** to **`CN=CineBD`**.
>
> | | Old key | New key (current) |
> |---|---|---|
> | DN | `CN=Vega, OU=Custom, O=Custom, L=Dhaka, ST=Dhaka, C=BD` | `CN=CineBD, O=Cinepix, C=BD` |
> | SHA-256 | `968166b5554f0a280f0ce2579393714021595872892dcba980985e6cd75618ea` | see below |
> | Where it lives | only inside the (now replaced) `KEYSTORE_BASE64` GitHub secret — the file was never in the repo, git history, or on this machine | `cinebd-release.keystore` |
>
> **Consequence:** every APK previously downloaded from GitHub Releases was
> signed with the old key. Those installs **cannot update** to a `CN=CineBD`
> build — Android rejects it as a signature mismatch. Users must **uninstall,
> then install fresh** (all app data is lost on uninstall).
>
> Do this once, knowingly, before publishing the next release. Going back to
> the old key is **impossible** unless the original keystore file is recovered.

Context: **local** builds used to be debug-signed (`debug.keystore` /
alias `androiddebugkey`) — that is what Google Play Protect flags. CI was
always release-signed with the old `CN=Vega` key, so CI builds never had a
signature problem; they carried `MANAGE_EXTERNAL_STORAGE` and "not on Play"
as the remaining Play Protect triggers instead.

## Files (all gitignored — `git status` must never show them)

| File | What it is |
|---|---|
| `cinebd-release.keystore` | The signing key itself (JKS, RSA 2048, valid to 2054) |
| `.keystore-secret` | Passwords + alias, human-readable |
| `.keystore-base64.txt` | Base64 of the keystore, for the GitHub `KEYSTORE_BASE64` secret |

**Back all three up to a password manager / offline drive NOW.**
Losing the keystore or its password means the app can never be updated again —
every future release would have to be published under a different signature.

## Identity

```
Alias:    cinebd
Owner:    CN=CineBD, O=Cinepix, C=BD
SHA1:     81:73:B4:E5:D7:7D:07:BF:F7:45:3B:27:82:81:B6:4C:E4:BF:DE:60
SHA256:   A6:43:46:17:BA:00:C6:55:D6:0F:0A:C0:3B:B5:BA:AF:B9:C0:1F:C9:40:
          92:AC:11:C8:5C:29:CB:D6:83:0C:18
Valid:    2026-10-02 → 2054-02-17
```

Verify on any APK:

```
E:\Androidstudio\jbr\bin\keytool.exe -printcert -jarfile app-release.apk
```

Owner must read `CN=CineBD` — if it still says `CN=Android Debug`, the build
fell back to the debug key.

## Local build

`run-release-build.bat` already sets the four `MYAPP_UPLOAD_*` variables to this
key, so `cmd /c run-release-build.bat` produces a properly signed APK.

## Building from Android Studio

`android/app/with-signing.gradle` reads the signing config from **environment
variables** (`System.getenv`), not from `gradle.properties`. Android Studio
inherits the Windows user environment, so the four variables are persisted
user-level with `setx`:

```
MYAPP_UPLOAD_STORE_FILE      E:\cinepix project\CineBD\cinebd-release.keystore
MYAPP_UPLOAD_STORE_PASSWORD  (from .keystore-secret)
MYAPP_UPLOAD_KEY_ALIAS       cinebd
MYAPP_UPLOAD_KEY_PASSWORD    (same)
```

Check them with:

```powershell
[Environment]::GetEnvironmentVariable('MYAPP_UPLOAD_KEY_ALIAS','User')
```

**Android Studio must be fully restarted** (File > Exit, then reopen) to pick
up newly set user variables — a Gradle sync alone is not enough.

Without them the build prints

```
❌ Release signing config not applied, using debug keystore
```

and silently produces a **debug-signed** APK.

### Open the right folder

`File > Open` → **`<repo>\android`** (the Android subproject, not the repo
root). Opening the repo root makes Android Studio treat it as a plain folder.

### Verify the signature afterwards — every time

```
E:\Androidstudio\jbr\bin\keytool.exe -printcert -jarfile <apk>
```

Owner must be `CN=CineBD`. If it says `CN=Android Debug`, the env vars were
not visible to that build (usually: Android Studio was not restarted).

### JDK 17 applies here too

Android Studio's bundled `jbr` is JDK 25, which triggers the prefab/JNA stderr
trap. `android/gradle/gradle-daemon-jvm.properties` pins the **daemon** to
`toolchainVersion=17`, so Studio's launcher can stay on 25 while Gradle and the
prefab child process still run on 17. See `docs/android-build.md`.

If a Studio-side Gradle action (`updateDaemonJvm`) resets that file to `25`,
builds start failing again with the `WARNING: A restricted method in
java.lang.System has been called` message — reset it to `17`.

## CI build (GitHub Actions)

`main.yml` and `release-all.yml` already read these — only the **secrets** are
missing. Create them once:

- Settings → Secrets and variables → Actions → New repository secret

| Secret name | Value |
|---|---|
| `KEYSTORE_BASE64` | contents of `.keystore-base64.txt` |
| `KEYSTORE_PASSWORD` | from `.keystore-secret` |
| `KEY_ALIAS` | `cinebd` |
| `KEY_PASSWORD` | same as `KEYSTORE_PASSWORD` |

Without them the workflows silently build a **debug** APK
(`No KEYSTORE_BASE64 secret found, will build debug APK`).

## 🚨 If an old debug-signed build is already installed

Different signature = Android refuses the update. Existing installs must be
**uninstalled** first, then the new APK installed. No data survives an
uninstall, so warn users before pushing the first release-key build.
