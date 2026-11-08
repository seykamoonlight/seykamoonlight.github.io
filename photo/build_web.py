#!/usr/bin/env python3
"""Fabrique les versions publiables des photos.

Les originaux (jusqu'à 15 Mo pièce) restent sur ce Mac et ne sont JAMAIS mis
en ligne. On en dérive deux tailles :

    photos/thumbs/<nom>.jpg    900 px   la grille de la galerie
    photos/web/<nom>.jpg      2000 px   le lightbox

Le réencodage efface toutes les métadonnées EXIF, dont les coordonnées GPS.
L'orientation EXIF est appliquée avant, pour qu'une photo prise à la
verticale reste à la verticale.

Usage :
    python3 build_web.py                       fabrique ce qui manque
    python3 build_web.py --force               refabrique tout
    python3 build_web.py --publish-into DIR    fabrique, vérifie le layout,
                                               puis copie dans DIR/photos/
                                               les seules photos du layout
                                               (utilisé par publish.sh)
"""

import argparse
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).parent
PHOTOS = ROOT / "photos"
LAYOUT = ROOT / "layout.json"

# 900 px suffit pour un écran rétine sur une colonne de 420 px ;
# 2000 px couvre le lightbox en plein écran.
SIZES = {"thumbs": 900, "web": 2000}
QUALITY = 82

IMG_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff", ".gif"}


def source_photos() -> list[Path]:
    """Les originaux présents dans photos/ (sans les sous-dossiers)."""
    if not PHOTOS.exists():
        return []
    return sorted(p for p in PHOTOS.iterdir()
                  if p.is_file() and p.suffix.lower() in IMG_EXTS)


def derivative(src: Path, kind: str) -> Path:
    # Toujours .jpg en minuscules : un BMP de 10 Mo n'a rien à faire sur le
    # web, et une casse unique évite les liens cassés sur GitHub Pages.
    return PHOTOS / kind / f"{src.stem}.jpg"


def derivatives_of(src: Path) -> list[Path]:
    return [derivative(src, kind) for kind in SIZES]


def build_one(src: Path, kind: str, force: bool = False) -> bool:
    """Fabrique une dérivée si elle manque ou date d'avant l'original.
    Renvoie True si un fichier a été écrit."""
    from PIL import Image, ImageOps

    dest = derivative(src, kind)
    if not force and dest.exists() and dest.stat().st_mtime >= src.stat().st_mtime:
        return False

    dest.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(src) as img:
        img = ImageOps.exif_transpose(img)  # redresser AVANT de perdre l'EXIF
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        img.thumbnail((SIZES[kind], SIZES[kind]), Image.LANCZOS)
        # sans argument exif= : aucune métadonnée (GPS compris) n'est recopiée
        img.save(dest, "JPEG", quality=QUALITY, optimize=True, progressive=True)
    return True


def build_all(force: bool = False) -> int:
    built = 0
    for src in source_photos():
        for kind in SIZES:
            try:
                built += build_one(src, kind, force)
            except Exception as e:
                sys.exit(f"✗ {src.name} illisible : {e}")
    return built


def publish_into(dest_dir: Path):
    """Copie dans dest_dir/photos/ les dérivées des seules photos du layout.

    Une photo présente dans photos/ mais pas dans le layout n'est donc pas
    mise en ligne — sinon elle serait accessible à qui devine son adresse.
    S'il manque quoi que ce soit, on s'arrête avant de copier un seul
    fichier : publish.sh s'interrompt alors et rien n'est envoyé.
    """
    layout = json.loads(LAYOUT.read_text())
    sources = [ROOT / item["file"] for item in layout]

    problems = []
    stems = {}
    for src in sources:
        if not src.exists():
            problems.append(f"original introuvable : {src.relative_to(ROOT)}")
            continue
        for path in derivatives_of(src):
            if not path.exists():
                problems.append(f"dérivée manquante : {path.relative_to(ROOT)}")
        key = src.stem.lower()
        if key in stems:
            problems.append(f"{stems[key]} et {src.name} donneraient le même fichier en ligne")
        stems[key] = src.name
    if problems:
        sys.exit("✗ Publication annulée :\n  " + "\n  ".join(problems))

    target = dest_dir / "photos"
    shutil.rmtree(target, ignore_errors=True)  # repartir de zéro : aucun reste
    for kind in SIZES:
        (target / kind).mkdir(parents=True)
    for src in sources:
        for kind in SIZES:
            shutil.copy2(derivative(src, kind), target / kind)

    placed = {s.name for s in sources}
    unplaced = [p.name for p in source_photos() if p.name not in placed]
    if unplaced:
        print(f"  {len(unplaced)} photo(s) de photos/ absente(s) du layout, "
              f"donc non publiée(s) : {', '.join(unplaced[:5])}"
              + (" …" if len(unplaced) > 5 else ""))

    print(f"  {len(sources)} photos publiées : {human(dir_size(target))} "
          f"(originaux gardés en local : {human(sum(s.stat().st_size for s in sources))})")


def dir_size(path: Path) -> int:
    return sum(p.stat().st_size for p in path.rglob("*") if p.is_file())


def human(n: int) -> str:
    return f"{n / 1048576:.0f} Mo" if n >= 1048576 else f"{n / 1024:.0f} Ko"


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--force", action="store_true", help="refabriquer toutes les dérivées")
    ap.add_argument("--publish-into", type=Path, metavar="DIR",
                    help="copier les photos du layout dans DIR/photos/")
    args = ap.parse_args()

    try:
        import PIL  # noqa: F401
    except ImportError:
        sys.exit("Pillow manquant. Installe-le avec : pip3 install Pillow")

    built = build_all(args.force)
    print(f"  {len(source_photos())} originaux, {built} dérivée(s) fabriquée(s)")

    if args.publish_into:
        publish_into(args.publish_into)


if __name__ == "__main__":
    main()
