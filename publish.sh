#!/bin/bash
# Déploie le viewer sur la branche gh-pages (delta push — rapide)
set -e

REPO=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
WORKTREE="$REPO/.gh-pages"

# Créer la branche gh-pages si elle n'existe pas encore
if ! git -C "$REPO" show-ref --quiet refs/heads/gh-pages; then
  echo "→ Création de la branche gh-pages..."
  CURRENT=$(git -C "$REPO" rev-parse --abbrev-ref HEAD)
  git -C "$REPO" checkout --orphan gh-pages
  git -C "$REPO" rm -rf . --quiet
  git -C "$REPO" commit --allow-empty -q -m "init gh-pages"
  git -C "$REPO" checkout "$CURRENT"
fi

# Créer le worktree si absent
if [ ! -d "$WORKTREE" ]; then
  echo "→ Initialisation du worktree..."
  git -C "$REPO" worktree add "$WORKTREE" gh-pages
fi

echo "→ Synchronisation des fichiers..."
rsync -a "$REPO/index.html" "$WORKTREE/"
cp "$REPO/LICENSE" "$WORKTREE/" 2>/dev/null || true

mkdir -p "$WORKTREE/photo"
rsync -a \
  "$REPO/photo/index.html" \
  "$REPO/photo/viewer.css" \
  "$REPO/photo/viewer.js" \
  "$REPO/photo/qr.svg" \
  "$REPO/photo/layout.json" \
  "$WORKTREE/photo/"

rsync -a --delete "$REPO/photo/photos/" "$WORKTREE/photo/photos/"

echo "→ Commit..."
cd "$WORKTREE"
git add -A
if git diff --cached --quiet; then
  echo "✓ Rien à publier (aucun changement détecté)"
  exit 0
fi
git commit -q -m "deploy $(date '+%Y-%m-%d %H:%M')"

echo "→ Push..."
git push --force origin gh-pages

echo "✓ Déployé sur gh-pages"
