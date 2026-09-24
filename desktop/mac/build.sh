#!/bin/sh
# Builds Clearline.app for this Mac. Needs only the Command Line Tools
# (xcode-select --install), not Xcode.
#
#   desktop/mac/build.sh                 # -> desktop/mac/build/Clearline.app
#   desktop/mac/build.sh --install       # and copy it to ~/Applications
set -eu
cd "$(dirname "$0")"
APP=build/Clearline.app
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp Info.plist "$APP/Contents/Info.plist"
swiftc -O -target "$(uname -m)-apple-macos13" \
  -framework AppKit -framework WebKit -framework CryptoTokenKit \
  Sources/*.swift -o "$APP/Contents/MacOS/Clearline"
# Ad-hoc signature carrying the smart-card entitlement. Good for this Mac;
# handing it to other Macs needs a Developer ID signature and notarization.
codesign --force --sign - --entitlements Clearline.entitlements "$APP"
echo "Built $APP"
if [ "${1:-}" = "--install" ]; then
  mkdir -p "$HOME/Applications"
  rm -rf "$HOME/Applications/Clearline.app"
  cp -R "$APP" "$HOME/Applications/"
  echo "Installed to ~/Applications/Clearline.app"
fi
