#!/bin/bash
# Double-clique ce fichier dans le Finder pour ouvrir l'éditeur de la galerie.
#
# Il démarre le serveur local, ouvre l'éditeur dans le navigateur, et arrête
# le serveur quand on ferme cette fenêtre de Terminal (ou avec Ctrl+C).

cd "$(dirname "$0")/photo" || exit 1

PORT=8000
URL="http://localhost:$PORT/editor.html"

port_open() {
  lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1
}

# Déjà lancé (par une autre fenêtre) : on se contente d'ouvrir l'éditeur.
if port_open; then
  echo "Le serveur tourne déjà — ouverture de l'éditeur."
  open "$URL"
  exit 0
fi

if ! python3 -c 'import PIL' 2>/dev/null; then
  echo "Il manque Pillow, qui fabrique les vignettes. Pour l'installer :"
  echo
  echo "    pip3 install Pillow"
  echo
  read -r -p "Appuie sur Entrée pour fermer."
  exit 1
fi

python3 server.py &
SERVER_PID=$!

stop_server() {
  kill "$SERVER_PID" 2>/dev/null
  echo
  echo "Serveur arrêté."
  exit 0
}
trap stop_server INT TERM HUP EXIT

# Attendre que le serveur réponde. La première fois, il fabrique les
# vignettes de toutes les photos, ce qui peut prendre une minute.
for _ in $(seq 1 240); do
  if port_open; then
    open "$URL"
    echo
    echo "Éditeur ouvert. Ferme cette fenêtre pour arrêter le serveur."
    break
  fi
  kill -0 "$SERVER_PID" 2>/dev/null || { echo "✗ Le serveur n'a pas démarré."; break; }
  sleep 0.5
done

wait "$SERVER_PID"
