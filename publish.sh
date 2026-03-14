#!/bin/bash
# Déploie le viewer sur la branche gh-pages
set -e

REPO=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
REMOTE=$(git -C "$REPO" remote get-url origin)
TEMP=$(mktemp -d)

echo "→ Copie des fichiers..."
cp "$REPO/index.html"        "$TEMP/"
cp "$REPO/LICENSE"           "$TEMP/" 2>/dev/null || true
mkdir -p "$TEMP/photo"
cp "$REPO/photo/index.html"  "$TEMP/photo/"
cp "$REPO/photo/viewer.css"  "$TEMP/photo/"
cp "$REPO/photo/viewer.js"   "$TEMP/photo/"
cp "$REPO/photo/qr.svg"      "$TEMP/photo/"
cp "$REPO/photo/layout.json" "$TEMP/photo/"
cp -r "$REPO/photo/photos"   "$TEMP/photo/"

echo "→ Publication sur gh-pages..."
cd "$TEMP"
git init -b gh-pages
git add -A
git commit -q -m "deploy $(date '+%Y-%m-%d %H:%M')"
git push --force "$REMOTE" gh-pages

rm -rf "$TEMP"
echo "✓ Déployé sur gh-pages"
