#!/bin/bash
# Met le site en ligne : construit le contenu de la branche gh-pages et
# l'envoie sur GitHub, qui la sert sur https://seykamoonlight.github.io/
#
#   ./publish.sh              publie
#   ./publish.sh --dry-run    prépare tout et montre ce qui changerait,
#                             sans rien envoyer
#
# Deux règles :
#
#  1. Les originaux ne partent jamais en ligne. Seules les deux tailles
#     fabriquées par photo/build_web.py sont publiées, et uniquement pour
#     les photos présentes dans le layout.
#
#  2. La branche gh-pages ne contient toujours QU'UN SEUL commit : la
#     version actuelle du site. Chaque publication remplace la précédente
#     au lieu de s'y ajouter, si bien que le dépôt ne grossit pas au fil
#     des mises à jour. L'envoi reste rapide : git ne transmet que les
#     fichiers que GitHub n'a pas déjà.
set -euo pipefail

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

REPO=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
SITE="$REPO/.gh-pages"  # copie de travail de la branche gh-pages (ignorée par git)
cd "$REPO"

if [ "$DRY_RUN" = 0 ] && ! git remote get-url origin >/dev/null 2>&1; then
  echo "✗ Aucun dépôt GitHub n'est configuré (remote « origin ») — voir README.md"
  exit 1
fi

# La copie de travail de gh-pages est créée à la première publication.
if [ ! -d "$SITE" ]; then
  echo "→ Préparation de la branche gh-pages..."
  git worktree prune
  if git show-ref --quiet refs/heads/gh-pages; then
    git worktree add --quiet "$SITE" gh-pages
  else
    git worktree add --quiet --orphan -b gh-pages "$SITE"
  fi
fi

# On reconstruit le site de zéro à chaque fois : ce qui est publié est
# exactement ce qui est construit ici, sans reste d'une version précédente.
find "$SITE" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +

echo "→ Photos..."
mkdir -p "$SITE/photo"
python3 "$REPO/photo/build_web.py" --publish-into "$SITE/photo"

echo "→ Pages..."
cp "$REPO/index.html" "$REPO/LICENSE" "$SITE/"
cp "$REPO/photo/"{index.html,viewer.css,viewer.js,qr.svg,layout.json} "$SITE/photo/"
# Le site est déjà prêt : on dit à GitHub de ne pas le passer dans Jekyll.
touch "$SITE/.nojekyll"

cd "$SITE"
git add --all
if git rev-parse --quiet --verify HEAD >/dev/null && git diff --cached --quiet HEAD; then
  CHANGED=0
else
  CHANGED=1
fi

if [ "$DRY_RUN" = 1 ]; then
  if [ "$CHANGED" = 1 ]; then
    echo "→ Essai à blanc — voici ce qui changerait en ligne :"
    git diff --cached --stat | tail -6
  else
    echo "✓ Essai à blanc — rien n'a changé depuis la dernière publication"
  fi
  git reset --quiet
  exit 0
fi

if [ "$CHANGED" = 1 ]; then
  # Commit sans parent : il remplace l'historique au lieu de s'y ajouter.
  TREE=$(git write-tree)
  COMMIT=$(git commit-tree "$TREE" -m "Publication du $(date '+%Y-%m-%d à %H:%M')")
  git update-ref HEAD "$COMMIT"
fi

# On compare à ce qui est réellement en ligne, pas seulement au dernier
# commit local : si un envoi précédent a échoué, on le retente.
REMOTE=$(git ls-remote origin refs/heads/gh-pages | cut -f1) || {
  echo "✗ Impossible de joindre le dépôt GitHub — existe-t-il, et es-tu connecté ?"
  exit 1
}
if [ "$(git rev-parse HEAD)" = "$REMOTE" ]; then
  echo "✓ Déjà en ligne, rien à envoyer"
  exit 0
fi

echo "→ Envoi sur GitHub..."
git push --force --quiet origin gh-pages
echo "✓ En ligne : https://seykamoonlight.github.io/photo/"
echo "  (GitHub met environ une minute à rafraîchir le site)"
