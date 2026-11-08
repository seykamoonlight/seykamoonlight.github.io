#!/bin/bash
# Met le site en ligne : construit le contenu de la branche gh-pages,
# l'envoie sur GitHub, puis vérifie que GitHub sert bien la nouvelle version.
#
#   ./publish.sh              publie
#   ./publish.sh --dry-run    construit le site (dans .gh-pages/) et montre ce
#                             qui changerait, sans rien envoyer — c'est ce que
#                             fait le bouton Aperçu de l'éditeur
#   ./publish.sh --check      vérifie seulement que le site en ligne est à jour
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

MODE=publish
case "${1:-}" in
  "") ;;
  --dry-run) MODE=dry ;;
  --check) MODE=check ;;
  *) echo "usage : $0 [--dry-run | --check]"; exit 1 ;;
esac

REPO=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
SITE="$REPO/.gh-pages"  # copie de travail de la branche gh-pages (ignorée par git)
cd "$REPO"

# Adresse du site, déduite du dépôt : github.com/<compte>/<compte>.github.io
OWNER=$(git remote get-url origin 2>/dev/null | sed -E 's#.*github\.com[:/]([^/]+)/.*#\1#') || OWNER=""
SITE_URL=${SITE_URL:-"https://$OWNER.github.io"}  # remplaçable pour tester en local

if [ "$MODE" != dry ] && [ -z "$OWNER" ]; then
  echo "✗ Aucun dépôt GitHub n'est configuré (remote « origin ») — voir README.md"
  exit 1
fi

# ── Vérification du site en ligne ───────────────────────────────────────────

# Le site servi par GitHub est-il identique à la dernière version publiée ?
# On compare octet pour octet les pages, le layout et une photo.
live_is_up_to_date() {
  local photo file
  photo=$(git -C "$SITE" ls-tree --name-only HEAD photo/photos/thumbs/ | sed -n 1p)
  for file in .nojekyll index.html photo/index.html photo/viewer.js \
              photo/viewer.css photo/layout.json $photo; do
    # ?v=… contourne le cache de GitHub, qui garde les fichiers 10 minutes
    curl -fsS "$SITE_URL/$file?v=$RANDOM$RANDOM" 2>/dev/null \
      | cmp -s - <(git -C "$SITE" show "HEAD:$file") || return 1
  done
}

# Attend que GitHub serve la version publiée — il lui faut en général une
# minute — puis le confirme, ou explique ce qui ne va pas.
verify_online() {
  local attempts=$1 i
  echo "→ Vérification du site en ligne..."
  for ((i = 1; i <= attempts; i++)); do
    if live_is_up_to_date; then
      echo "✓ Vérifié : $SITE_URL/photo/ est à jour"
      return 0
    fi
    [ "$i" -lt "$attempts" ] && sleep 10
  done

  # .nojekyll n'existe que sur gh-pages : s'il manque, GitHub sert une
  # autre branche (main, qui ne contient aucune photo).
  if [ "$(curl -s -o /dev/null -w '%{http_code}' "$SITE_URL/.nojekyll?v=$RANDOM")" = 404 ]; then
    echo "✗ GitHub ne sert pas la branche gh-pages : les photos ne s'afficheront pas."
    echo "  Dans les réglages du dépôt, rubrique Pages, choisis :"
    echo "  « Deploy from a branch » → gh-pages → / (root)"
    echo "  https://github.com/$OWNER/$OWNER.github.io/settings/pages"
  else
    echo "⚠ GitHub n'affiche pas encore la dernière version. Il lui faut parfois"
    echo "  quelques minutes ; pour revérifier plus tard : ./publish.sh --check"
  fi
  return 1
}

if [ "$MODE" = check ]; then
  if ! git -C "$SITE" rev-parse --quiet --verify HEAD >/dev/null 2>&1; then
    echo "✗ Rien n'a encore été publié depuis ce Mac"
    exit 1
  fi
  verify_online 1
  exit
fi

# ── Construction du site ────────────────────────────────────────────────────

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

if [ "$MODE" = dry ]; then
  if [ "$CHANGED" = 1 ]; then
    echo "→ Site construit. Par rapport à la version publiée :"
    git diff --cached --stat | tail -6
  else
    echo "✓ Site construit — identique à la version publiée"
  fi
  git reset --quiet
  exit 0
fi

# ── Envoi ───────────────────────────────────────────────────────────────────

if [ "$CHANGED" = 1 ]; then
  # Commit sans parent : il remplace l'historique au lieu de s'y ajouter.
  TREE=$(git write-tree)
  COMMIT=$(git commit-tree "$TREE" -m "Publication du $(date '+%Y-%m-%d à %H:%M')")
  git update-ref HEAD "$COMMIT"
fi

# On compare à ce que GitHub a réellement, pas seulement au dernier commit
# local : si un envoi précédent a échoué, on le retente.
REMOTE=$(git ls-remote origin refs/heads/gh-pages | cut -f1) || {
  echo "✗ Impossible de joindre le dépôt GitHub — existe-t-il, et es-tu connecté ?"
  exit 1
}
if [ "$(git rev-parse HEAD)" = "$REMOTE" ]; then
  echo "✓ Rien de nouveau à envoyer"
  verify_online 1
  exit
fi

echo "→ Envoi sur GitHub..."
git push --force --quiet origin gh-pages
verify_online 12  # jusqu'à 2 minutes
