#!/usr/bin/env bash
# Builds a Developer ID signed, notarized DMG of Spelare plus a Sparkle appcast.
#
#   scripts/release.sh                 build, notarize, write build/release/<version>/
#   scripts/release.sh --publish       ...then create a GitHub release with the DMG and appcast
#   scripts/release.sh --skip-notarize signed but not notarized (local testing only)
#   scripts/release.sh --allow-dirty   build from a working tree with uncommitted changes
#
# The version comes from extension/manifest.json; the build number is the commit count.
# Settings live in scripts/release.config. See RELEASING.md.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
source scripts/release.config

PUBLISH=0 NOTARIZE=1 ALLOW_DIRTY=0
for arg in "$@"; do
    case "$arg" in
        --publish) PUBLISH=1 ;;
        --skip-notarize) NOTARIZE=0 ;;
        --allow-dirty) ALLOW_DIRTY=1 ;;
        *) echo "Unknown option: $arg" >&2; exit 2 ;;
    esac
done

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
fail() { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }

PROJECT="xcode/SpelareDev/SpelareDev.xcodeproj"
SCHEME="SpelareDev"
PACKAGES="$ROOT/build/SourcePackages"
SPARKLE_BIN="$PACKAGES/artifacts/sparkle/Sparkle/bin"

VERSION="$(node -p "require('./extension/manifest.json').version")"
BUILD="$(git rev-list --count HEAD)"
OUT="$ROOT/build/release/$VERSION"
FEED_URL="https://github.com/$RELEASES_REPO/releases/latest/download/appcast.xml"
DOWNLOAD_PREFIX="https://github.com/$RELEASES_REPO/releases/download/v$VERSION/"
DMG="$OUT/$DMG_NAME-$VERSION.dmg"

step "Checking prerequisites for $DMG_NAME $VERSION (build $BUILD)"
if [[ $ALLOW_DIRTY == 0 && -n "$(git status --porcelain)" ]]; then
    fail "working tree has uncommitted changes; commit them or pass --allow-dirty"
fi
IDENTITY="$(security find-identity -v -p codesigning | grep -o "Developer ID Application: [^\"]*($TEAM_ID)" | head -1 || true)"
[[ -n "$IDENTITY" ]] || fail "no 'Developer ID Application' certificate for team $TEAM_ID in the keychain"
[[ -n "$SPARKLE_PUBLIC_ED_KEY" ]] || fail "SPARKLE_PUBLIC_ED_KEY is empty in scripts/release.config"
if [[ $NOTARIZE == 1 ]]; then
    xcrun notarytool history --keychain-profile "$NOTARY_PROFILE" >/dev/null 2>&1 \
        || fail "notarytool profile '$NOTARY_PROFILE' not found; see RELEASING.md"
fi
if [[ $PUBLISH == 1 ]]; then
    command -v gh >/dev/null || fail "--publish needs the GitHub CLI (gh)"
    gh release view "v$VERSION" --repo "$RELEASES_REPO" >/dev/null 2>&1 \
        && fail "release v$VERSION already exists in $RELEASES_REPO; bump the version in extension/manifest.json"
fi

step "Checking extension build and running tests"
npm run --silent check-build
npm test --silent

rm -rf "$OUT"
mkdir -p "$OUT"

step "Archiving"
xcodebuild -project "$PROJECT" -scheme "$SCHEME" -configuration Release \
    -destination 'generic/platform=macOS' \
    -archivePath "$OUT/$SCHEME.xcarchive" \
    -clonedSourcePackagesDirPath "$PACKAGES" \
    -allowProvisioningUpdates \
    DEVELOPMENT_TEAM="$TEAM_ID" CODE_SIGN_STYLE=Automatic \
    MARKETING_VERSION="$VERSION" CURRENT_PROJECT_VERSION="$BUILD" \
    SPARKLE_FEED_URL="$FEED_URL" SPARKLE_PUBLIC_ED_KEY="$SPARKLE_PUBLIC_ED_KEY" \
    -quiet archive

step "Exporting with Developer ID"
cat > "$OUT/ExportOptions.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key><string>developer-id</string>
    <key>teamID</key><string>$TEAM_ID</string>
    <key>signingStyle</key><string>automatic</string>
</dict>
</plist>
EOF
xcodebuild -exportArchive \
    -archivePath "$OUT/$SCHEME.xcarchive" \
    -exportPath "$OUT/export" \
    -exportOptionsPlist "$OUT/ExportOptions.plist" \
    -allowProvisioningUpdates -quiet
APP="$(find "$OUT/export" -maxdepth 1 -name '*.app' | head -1)"
[[ -d "$APP" ]] || fail "export produced no .app"
codesign --verify --deep --strict "$APP"
# Captured first: grep -q exits at the first match, and codesign's write to
# the closed pipe would then fail the check under pipefail.
SIGNATURE="$(codesign -dvv "$APP" 2>&1)"
grep -q "Authority=Developer ID Application" <<<"$SIGNATURE" \
    || fail "$APP is not signed with Developer ID"

step "Building DMG"
STAGE="$OUT/dmg"
mkdir -p "$STAGE"
ditto "$APP" "$STAGE/$(basename "$APP")"
ln -s /Applications "$STAGE/Applications"
hdiutil create -volname "$DMG_NAME" -srcfolder "$STAGE" -fs HFS+ -format UDZO -ov "$DMG" -quiet
rm -rf "$STAGE"
codesign --sign "$IDENTITY" --timestamp "$DMG"

if [[ $NOTARIZE == 1 ]]; then
    step "Notarizing (usually a few minutes)"
    RESULT="$(xcrun notarytool submit "$DMG" --keychain-profile "$NOTARY_PROFILE" --wait --output-format json)"
    STATUS="$(node -p "JSON.parse(process.argv[1]).status" "$RESULT")"
    if [[ "$STATUS" != "Accepted" ]]; then
        ID="$(node -p "JSON.parse(process.argv[1]).id" "$RESULT")"
        xcrun notarytool log "$ID" --keychain-profile "$NOTARY_PROFILE" || true
        fail "notarization returned '$STATUS'"
    fi
    xcrun stapler staple "$DMG"
    spctl --assess --type open --context context:primary-signature --verbose "$DMG"
fi

step "Writing Sparkle appcast"
UPDATES="$OUT/updates"
mkdir -p "$UPDATES"
cp "$DMG" "$UPDATES/"
NOTES="release-notes/$VERSION.md"
[[ -f "$NOTES" ]] && cp "$NOTES" "$UPDATES/$(basename "$DMG" .dmg).md"
"$SPARKLE_BIN/generate_appcast" \
    --download-url-prefix "$DOWNLOAD_PREFIX" \
    --link "https://github.com/$RELEASES_REPO" \
    --embed-release-notes \
    "$UPDATES"
cp "$UPDATES/appcast.xml" "$OUT/appcast.xml"

# A copy without the version in its name, so the README's download button can
# link to releases/latest/download/<name>.dmg and always get the newest.
LATEST_DMG="$OUT/latest/$DMG_NAME.dmg"
mkdir -p "$OUT/latest"
cp "$DMG" "$LATEST_DMG"

if [[ $PUBLISH == 1 ]]; then
    step "Publishing v$VERSION to $RELEASES_REPO"
    NOTES_ARGS=(--generate-notes)
    [[ -f "$NOTES" ]] && NOTES_ARGS=(--notes-file "$NOTES")
    TARGET_ARGS=()
    [[ "$(gh repo view --json nameWithOwner -q .nameWithOwner)" == "$RELEASES_REPO" ]] \
        && TARGET_ARGS=(--target "$(git rev-parse HEAD)")
    gh release create "v$VERSION" "$DMG" "$LATEST_DMG" "$OUT/appcast.xml" \
        --repo "$RELEASES_REPO" --title "$DMG_NAME $VERSION" "${NOTES_ARGS[@]}" "${TARGET_ARGS[@]}"
fi

# Building registered the exported app and Xcode's archive working copy with
# LaunchServices, and Safari would take their extension for the installed one
# (and break once they're gone), so they're unregistered and removed.
LSREGISTER=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
STRAY_DIRS=("$OUT/export")
for DIR in "$HOME"/Library/Developer/Xcode/DerivedData/SpelareDev-*/Build/Intermediates.noindex/ArchiveIntermediates; do
    [[ -d "$DIR" ]] && STRAY_DIRS+=("$DIR")
done
for DIR in "${STRAY_DIRS[@]}"; do
    find "$DIR" -maxdepth 6 -name '*.app' -prune -exec "$LSREGISTER" -u {} \; 2>/dev/null || true
    rm -rf "$DIR"
done

step "Done"
echo "DMG:     $DMG"
echo "Appcast: $OUT/appcast.xml"
[[ $NOTARIZE == 0 ]] && echo "Not notarized: don't distribute this build."
[[ $PUBLISH == 0 ]] && echo "Publish with: gh release create v$VERSION \"$DMG\" \"$LATEST_DMG\" \"$OUT/appcast.xml\" --repo $RELEASES_REPO"
exit 0
