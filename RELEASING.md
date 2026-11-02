# Releasing

Spelare ships outside the App Store: a Developer ID signed, notarized DMG on GitHub Releases, with
[Sparkle](https://sparkle-project.org) updating installed copies. `scripts/release.sh` does all of it;
settings are in `scripts/release.config`.

Release builds are `Spelare.app` (`dev.klippelism.spelare`, extension `dev.klippelism.spelare.Extension`).
Debug builds from Xcode stay `SpelareDev.app` (`dev.klippelism.spelare-dev`), so a dev copy and an
installed release never share an identity. Don't change the Release bundle IDs once a version is out:
Sparkle and Safari's per-extension settings are tied to them.

## One-time setup

1. **Developer ID certificate.** `security find-identity -v -p codesigning` should list
   `Developer ID Application: … (PGX5N2V7WQ)`. If it's missing, create one in Xcode ▸ Settings ▸
   Accounts ▸ Manage Certificates.

2. **Notarization credentials.** Create an app-specific password at
   [account.apple.com](https://account.apple.com) (Sign-In and Security ▸ App-Specific Passwords), then
   store it in the keychain:

   ```sh
   xcrun notarytool store-credentials spelare-notary --apple-id <your Apple ID> --team-id PGX5N2V7WQ
   ```

3. **Sparkle signing key.** Fetch the Sparkle tools and generate a key pair. The private key goes into
   your login keychain; the command prints the public key.

   ```sh
   xcodebuild -project xcode/SpelareDev/SpelareDev.xcodeproj -scheme SpelareDev \
       -clonedSourcePackagesDirPath build/SourcePackages -resolvePackageDependencies
   build/SourcePackages/artifacts/sparkle/Sparkle/bin/generate_keys
   ```

   Paste the public key into `SPARKLE_PUBLIC_ED_KEY` in `scripts/release.config`. Back up the private key
   (`generate_keys -x sparkle-private-key.txt`, then store that file somewhere safe and delete it). If you
   lose it, installed copies can never be updated again.

4. **A public releases repo.** Sparkle and users download from
   `https://github.com/$RELEASES_REPO/releases/`, which only works on a public repo. Either make this repo
   public or point `RELEASES_REPO` at a separate public repo that only holds releases.

## Each release

1. Bump `"version"` in `extension/manifest.json` (it becomes the app version too) and run `npm run build`.
2. Optionally write release notes in `release-notes/<version>.md`. They're shown in the Sparkle update
   window and used as the GitHub release text.
3. Commit, then:

   ```sh
   scripts/release.sh --publish
   ```

The script checks that `extension/` matches `src/`, runs the tests, archives, exports with Developer ID,
builds and signs the DMG, notarizes and staples it, writes `appcast.xml`, and creates the GitHub release
`v<version>` with both files attached. Leave out `--publish` to stop before uploading; everything ends up
in `build/release/<version>/`.

The build number (`CFBundleVersion`) is the commit count, so each release must be built from a newer
commit than the last one, or Sparkle won't treat it as an update.

## How updates reach users

The app's feed URL is `https://github.com/$RELEASES_REPO/releases/latest/download/appcast.xml`, so the
newest release always serves the current appcast. The container app checks for updates each time it
opens and has a **Check for Updates…** menu item. Safari doesn't run the container app, so users who
never open it won't get updates. Local builds from Xcode have no feed URL and never check.
