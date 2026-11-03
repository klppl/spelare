#!/bin/zsh
# Renders the README's screenshots from the mockups in this folder into
# design/screenshots/. The mockups use the extension's real CSS, and the popup
# its real popup.html and popup.js, so run this again after changing them.
set -e
cd "${0:A:h}"
OUT=../screenshots
mkdir -p $OUT
BIN=$(mktemp -d)/render-page
swiftc -O render-page.swift -o $BIN

# The popup, as extension/popup.html draws it, with stand-in browser APIs.
# popup.js loads as a classic script: WebKit won't load modules from file://.
sed -e 's|href="popup.css"|href="../../extension/popup.css"|' \
    -e 's|<script type="module" src="popup.js"></script>|<script src="popup-stub.js"></script>\n    <script src="../../extension/popup.js"></script>|' \
    -e 's|</head>|    <link rel="stylesheet" href="popup-frame.css">\n</head>|' \
    ../../extension/popup.html > popup-frame.html

for shot in player menu popup; do
    $BIN $shot.html $OUT/$shot.png 1280 820
    # The README shows them about 880 points wide: 1920 pixels stays sharp on
    # Retina screens at about half the file size.
    sips -Z 1920 $OUT/$shot.png >/dev/null
done
rm popup-frame.html
echo "screenshots rendered into design/screenshots/"
