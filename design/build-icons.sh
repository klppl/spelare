#!/bin/zsh
# Regenerates every icon PNG from the SVGs in this folder.
set -e
cd "${0:A:h}"
ROOT=..
BIN=$(mktemp -d)/render
swiftc -O render.swift -o "$BIN"

IMG=$ROOT/extension/images
for s in 48 64 96 128 256 512; do "$BIN" app-icon.svg $IMG/icon-$s.png $s; done
for s in 16 19; do "$BIN" toolbar-icon-small.svg $IMG/toolbar-icon-$s.png $s; done
for s in 32 38 48 72; do "$BIN" toolbar-icon.svg $IMG/toolbar-icon-$s.png $s; done

APP=$ROOT/xcode/SpelareDev/SpelareDev
for s in 16 32 128 256 512; do
  "$BIN" app-icon.svg $APP/Assets.xcassets/AppIcon.appiconset/mac-icon-$s@1x.png $s
  "$BIN" app-icon.svg $APP/Assets.xcassets/AppIcon.appiconset/mac-icon-$s@2x.png $((s * 2))
done
"$BIN" app-icon.svg $APP/Resources/Icon.png 512
echo "icons rebuilt"
