#!/usr/bin/env python3
import http.server, socketserver
from pathlib import Path
from urllib.parse import urlparse, parse_qs, unquote

try:
    from PIL import Image, ImageOps
    HAS_PIL = True
except ImportError:
    HAS_PIL = False
    print('Pillow not installed — thumbnails disabled. Run: pip3 install Pillow')

ROOT = Path(__file__).parent
PORT = 8000
THUMB_MAX = 900  # px, longest side — enough for 2× retina on a 420px column

IMG_EXTS = {'.jpg', '.jpeg', '.png', '.webp', '.gif'}


def make_thumb(src: Path, thumbs_dir: Path):
    if not HAS_PIL:
        return
    dest = thumbs_dir / src.name
    if dest.exists():
        return
    try:
        with Image.open(src) as img:
            img = ImageOps.exif_transpose(img)  # apply EXIF rotation
            img = img.convert('RGB') if img.mode not in ('RGB', 'L') else img
            img.thumbnail((THUMB_MAX, THUMB_MAX), Image.LANCZOS)
            img.save(dest, quality=82, optimize=True)
    except Exception as e:
        print(f'Thumb failed for {src.name}: {e}')


def generate_all_thumbs():
    photos_dir = ROOT / 'photos'
    if not photos_dir.exists():
        return
    thumbs_dir = photos_dir / 'thumbs'
    thumbs_dir.mkdir(exist_ok=True)
    for f in photos_dir.iterdir():
        if f.is_file() and f.suffix.lower() in IMG_EXTS:
            make_thumb(f, thumbs_dir)


def patch_layout_dimensions():
    """Add w/h to layout.json entries that are missing them."""
    if not HAS_PIL:
        return
    import json
    layout_path = ROOT / 'layout.json'
    if not layout_path.exists():
        return
    try:
        data = json.loads(layout_path.read_text())
    except Exception:
        return
    changed = False
    for item in data:
        if 'w' not in item or 'h' not in item:
            src = ROOT / item['file']
            if not src.exists():
                continue
            try:
                with Image.open(src) as img:
                    img = ImageOps.exif_transpose(img)
                    item['w'], item['h'] = img.size
                    changed = True
            except Exception:
                pass
    if changed:
        layout_path.write_text(json.dumps(data, indent=2))
        print('layout.json patched with image dimensions')


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_DELETE(self):
        if self.path.startswith('/delete-photo'):
            query = parse_qs(urlparse(self.path).query)
            name = Path(unquote(query.get('name', [''])[0])).name
            if name:
                for p in [ROOT / 'photos' / name, ROOT / 'photos' / 'thumbs' / name]:
                    p.unlink(missing_ok=True)
            self._ok()
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length)

        if self.path == '/save-layout':
            (ROOT / 'layout.json').write_bytes(body)
            self._ok()

        elif self.path.startswith('/upload-photo'):
            query = parse_qs(urlparse(self.path).query)
            name = Path(unquote(query.get('name', ['photo.jpg'])[0])).name
            photos_dir = ROOT / 'photos'
            photos_dir.mkdir(exist_ok=True)
            dest = photos_dir / name
            dest.write_bytes(body)
            thumbs_dir = photos_dir / 'thumbs'
            thumbs_dir.mkdir(exist_ok=True)
            make_thumb(dest, thumbs_dir)
            self._ok()

        else:
            self.send_response(404)
            self.end_headers()

    def _ok(self):
        self.send_response(200)
        self.end_headers()

    def log_message(self, format, *args):
        pass  # suppress request logs


generate_all_thumbs()
patch_layout_dimensions()

with socketserver.TCPServer(('', PORT), Handler) as httpd:
    print(f'Serving at http://localhost:{PORT}')
    httpd.serve_forever()
