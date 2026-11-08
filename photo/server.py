#!/usr/bin/env python3
"""Serveur local de l'éditeur de galerie.

Lancé par Galerie.app (Dock ou double-clic), ou à la main : python3 server.py
Il ne sert qu'à l'édition : le site en ligne est entièrement statique.

Port 8000 — l'éditeur. En plus des fichiers du dossier, il expose :
    POST   /upload-photo?name=…   enregistre une photo et fabrique ses dérivées
    DELETE /delete-photo?name=…   range l'original dans corbeille/, efface ses dérivées
    POST   /save-layout           remplace layout.json (écriture atomique)
    POST   /publish[?dry=1]       lance publish.sh en tâche de fond ;
                                  dry=1 construit le site sans l'envoyer
    GET    /publish-log           avancement de la publication en cours
    GET    /alive                 connexion gardée ouverte par chaque onglet
                                  de l'éditeur (voir « Arrêt automatique »)

Port 8001 — l'aperçu : le site exactement tel qu'il sera publié.

Le serveur s'arrête tout seul une minute environ après la fermeture du
dernier onglet de l'éditeur, jamais pendant une publication. L'aperçu
s'arrête avec lui.
"""

import http.server
import json
import os
import shutil
import socketserver
import subprocess
import threading
import time
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

import build_web

ROOT = Path(__file__).parent
REPO = ROOT.parent
PHOTOS = ROOT / "photos"
TRASH = ROOT / "corbeille"
LAYOUT = ROOT / "layout.json"
SITE = REPO / ".gh-pages"  # le site tel que publish.sh le construit
PORT = 8000
PREVIEW_PORT = 8001

# État de la publication, partagé entre le thread qui exécute publish.sh et
# les requêtes /publish-log de l'éditeur.
_publish = {"running": False, "log": [], "ok": None}
_publish_lock = threading.Lock()


# ── Photos ──────────────────────────────────────────────────────────────────

def build_derivatives(src: Path):
    """Fabrique vignette et version web. Lève une exception si la photo est
    illisible : une seule implémentation, celle de build_web.py, pour que
    les noms de fichiers soient cohérents partout."""
    for kind in build_web.SIZES:
        build_web.build_one(src, kind)


def delete_derivatives(name: str):
    for path in build_web.derivatives_of(PHOTOS / name):
        path.unlink(missing_ok=True)


def move_to_trash(src: Path) -> Path:
    """Range un original dans corbeille/ plutôt que de le détruire.
    En cas de nom déjà pris, on suffixe avec l'heure."""
    TRASH.mkdir(exist_ok=True)
    dest = TRASH / src.name
    if dest.exists():
        dest = TRASH / f"{src.stem}.{time.strftime('%Y%m%d-%H%M%S')}{src.suffix}"
    shutil.move(str(src), dest)
    return dest


# ── Layout ──────────────────────────────────────────────────────────────────

def write_layout(body: bytes):
    """Écrit layout.json de façon atomique : on écrit un fichier temporaire
    puis on le renomme. Si quoi que ce soit interrompt l'écriture, l'ancien
    layout reste intact au lieu d'être tronqué — c'est tout le travail de
    placement qui est en jeu."""
    data = json.loads(body)  # refuse un contenu qui ne serait pas du JSON
    if not isinstance(data, list):
        raise ValueError("le layout doit être une liste de photos")
    tmp = LAYOUT.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    os.replace(tmp, LAYOUT)


def fill_missing_dimensions():
    """Complète w/h dans layout.json pour les entrées qui n'en ont pas."""
    if not LAYOUT.exists():
        return
    from PIL import Image, ImageOps

    data = json.loads(LAYOUT.read_text())
    changed = False
    for item in data:
        if "w" in item and "h" in item:
            continue
        src = ROOT / item["file"]
        if not src.exists():
            continue
        try:
            with Image.open(src) as img:
                item["w"], item["h"] = ImageOps.exif_transpose(img).size
            changed = True
        except Exception:
            pass
    if changed:
        write_layout(json.dumps(data).encode())
        print("layout.json complété avec les dimensions manquantes")


# ── Publication ─────────────────────────────────────────────────────────────

def run_publish(dry: bool):
    """Exécute publish.sh et recopie sa sortie ligne à ligne dans _publish,
    que l'éditeur affiche au fur et à mesure.
    dry=True prépare tout et montre ce qui partirait, sans rien envoyer."""
    with _publish_lock:
        _publish.update(running=True, log=[], ok=None)

    def log(line: str):
        with _publish_lock:
            _publish["log"].append(line.rstrip())

    ok = False
    try:
        cmd = ["bash", str(REPO / "publish.sh")] + (["--dry-run"] if dry else [])
        proc = subprocess.Popen(cmd, cwd=REPO, text=True, bufsize=1,
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        for line in proc.stdout:
            log(line)
        ok = proc.wait() == 0
        log("✓ Terminé" if ok else f"✗ Échec (code {proc.returncode})")
    except Exception as e:
        log(f"✗ {e}")

    with _publish_lock:
        _publish.update(running=False, ok=ok)


# ── Arrêt automatique ───────────────────────────────────────────────────────
#
# Chaque onglet de l'éditeur garde une connexion /alive ouverte (EventSource).
# Une connexion plutôt qu'un « ping » périodique : les navigateurs ralentissent
# les minuteries des onglets en arrière-plan, pas leurs connexions — le serveur
# ne s'arrête donc pas parce qu'on a simplement changé d'onglet.
#
# Quand plus aucun onglet n'est connecté, on attend IDLE_GRACE secondes
# (le temps qu'un rechargement de page se reconnecte) avant de s'arrêter.

IDLE_GRACE = 60   # s
PING_EVERY = 15   # s ; un onglet fermé est détecté au ping suivant

_editors = 0
_last_editor_change = time.monotonic()
_editors_lock = threading.Lock()


def editors_changed(delta: int):
    global _editors, _last_editor_change
    with _editors_lock:
        _editors += delta
        _last_editor_change = time.monotonic()


def stop_when_idle(servers):
    """Tourne en tâche de fond et arrête les serveurs une fois l'éditeur fermé."""
    while True:
        time.sleep(5)
        with _editors_lock:
            idle = _editors == 0 and time.monotonic() - _last_editor_change > IDLE_GRACE
        with _publish_lock:
            publishing = _publish["running"]
        if idle and not publishing:
            print("→ Plus aucun éditeur ouvert : arrêt du serveur.")
            for server in servers:
                server.shutdown()
            return


# ── Serveur HTTP ────────────────────────────────────────────────────────────

class LocalHandler(http.server.SimpleHTTPRequestHandler):
    """Base commune à l'éditeur et à l'aperçu."""

    def end_headers(self):
        # Jamais de cache en local : sinon on modifie un fichier et le
        # navigateur continue de servir l'ancien, sans rien dire.
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def log_message(self, *args):
        pass  # pas de journal de chaque requête dans le terminal


class PreviewHandler(LocalHandler):
    """Sert le site tel que publish.sh l'a construit, sans rien y ajouter.

    Il imite GitHub Pages sur un point qui compte : la casse des noms de
    fichiers. macOS confond photo.JPG et photo.jpg, GitHub non. Sans cette
    vérification, l'aperçu afficherait des photos qui seraient cassées en
    ligne.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(SITE), **kwargs)

    def send_head(self):
        if not self._exists_with_exact_case(Path(self.translate_path(self.path))):
            self.send_error(404, "Introuvable (la casse du nom compte, comme sur GitHub)")
            return None
        return super().send_head()

    @staticmethod
    def _exists_with_exact_case(path: Path) -> bool:
        try:
            parts = path.relative_to(SITE).parts
        except ValueError:
            return False
        current = SITE
        for part in parts:
            if not current.is_dir() or part not in os.listdir(current):
                return False
            current = current / part
        return True


class Handler(LocalHandler):
    """L'éditeur : les fichiers du dossier photo/ et les routes ci-dessous."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    # ── routes ──

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/publish-log":
            with _publish_lock:
                return self._send_json(dict(_publish))
        if path == "/alive":
            return self._keep_alive()
        super().do_GET()

    def do_POST(self):
        url = urlparse(self.path)
        query = parse_qs(url.query)

        if url.path == "/publish":
            with _publish_lock:
                if _publish["running"]:
                    return self._send_json({"error": "publication déjà en cours"}, 409)
            dry = query.get("dry") == ["1"]
            threading.Thread(target=run_publish, args=(dry,), daemon=True).start()
            return self._send_json({"started": True, "dry": dry}, 202)

        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))

        if url.path == "/save-layout":
            try:
                write_layout(body)
            except Exception as e:
                return self._send_text(f"layout refusé : {e}", 400)
            return self._send_text("ok")

        if url.path == "/upload-photo":
            return self._upload(query, body)

        self.send_error(404)

    def do_DELETE(self):
        url = urlparse(self.path)
        if url.path != "/delete-photo":
            return self.send_error(404)
        name = self._photo_name(parse_qs(url.query))
        if name:
            src = PHOTOS / name
            if src.exists():
                print(f"→ {name} rangée dans {move_to_trash(src).relative_to(ROOT)}")
            delete_derivatives(name)
        self._send_text("ok")

    # ── détails ──

    def _keep_alive(self):
        """Garde la connexion d'un onglet de l'éditeur ouverte tant qu'il vit.
        Écrire dans une connexion fermée lève une erreur : c'est ainsi
        qu'on apprend que l'onglet a été fermé."""
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.end_headers()
        editors_changed(+1)
        try:
            while True:
                self.wfile.write(b": ping\n\n")  # commentaire SSE, ignoré par le navigateur
                self.wfile.flush()
                time.sleep(PING_EVERY)
        except OSError:
            pass  # onglet fermé
        finally:
            editors_changed(-1)

    def _upload(self, query, body: bytes):
        name = self._photo_name(query)
        if not name:
            return self._send_text("nom de fichier manquant", 400)
        if Path(name).suffix.lower() not in build_web.IMG_EXTS:
            return self._send_text(
                f"format {Path(name).suffix or 'inconnu'} non pris en charge — "
                "exporte la photo en JPEG", 415)

        PHOTOS.mkdir(exist_ok=True)
        dest = PHOTOS / name
        dest.write_bytes(body)
        try:
            build_derivatives(dest)
        except Exception as e:
            # Photo illisible : on ne garde rien, pour ne pas laisser sur le
            # disque un fichier qui casserait la publication.
            dest.unlink(missing_ok=True)
            delete_derivatives(name)
            print(f"  ✗ {name} refusée : {e}")  # le détail technique reste dans le terminal
            return self._send_text("fichier illisible — est-ce bien une photo ?", 415)
        self._send_text("ok")

    @staticmethod
    def _photo_name(query) -> str:
        # Path(...).name supprime tout chemin : impossible d'écrire hors de photos/
        return Path(unquote(query.get("name", [""])[0])).name

    def _send_text(self, text: str, status: int = 200):
        self._send(text.encode(), "text/plain; charset=utf-8", status)

    def _send_json(self, payload, status: int = 200):
        self._send(json.dumps(payload).encode(), "application/json", status)

    def _send(self, body: bytes, content_type: str, status: int):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


# Multi-thread obligatoire : l'éditeur demande toutes les vignettes d'un coup,
# et un serveur mono-thread en refuse une partie (ERR_CONNECTION_RESET) —
# des photos manquent alors à l'écran sans aucun message.
class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    print("→ Vérification des vignettes et versions web...")
    for src in build_web.source_photos():
        try:
            build_derivatives(src)
        except Exception as e:
            print(f"  ✗ {src.name} illisible : {e}")
    fill_missing_dimensions()

    with Server(("", PORT), Handler) as httpd:
        servers = [httpd]
        print(f"✓ Éditeur : http://localhost:{PORT}/editor.html")
        # L'aperçu est un plus : s'il ne peut pas démarrer, on édite quand même.
        try:
            preview = Server(("", PREVIEW_PORT), PreviewHandler)
            threading.Thread(target=preview.serve_forever, daemon=True).start()
            servers.append(preview)
            print(f"  Aperçu  : http://localhost:{PREVIEW_PORT}/photo/  (bouton Aperçu de l'éditeur)")
        except OSError as e:
            print(f"  ✗ Aperçu indisponible, le port {PREVIEW_PORT} est occupé ({e.strerror})")

        # Le délai de grâce part d'ici : si aucun éditeur ne se connecte (le
        # navigateur ne s'est pas ouvert), le serveur ne reste pas orphelin.
        editors_changed(0)
        threading.Thread(target=stop_when_idle, args=(servers,), daemon=True).start()
        httpd.serve_forever()


if __name__ == "__main__":
    main()
