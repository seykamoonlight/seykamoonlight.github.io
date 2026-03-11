#!/usr/bin/env python3
import http.server, socketserver
from pathlib import Path
from urllib.parse import urlparse, parse_qs, unquote

ROOT = Path(__file__).parent
PORT = 8000

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length)

        if self.path == '/save-layout':
            (ROOT / 'layout.json').write_bytes(body)
            self._ok()

        elif self.path.startswith('/upload-photo'):
            query = parse_qs(urlparse(self.path).query)
            name = Path(unquote(query.get('name', ['photo.jpg'])[0])).name  # strip any path
            photos_dir = ROOT / 'photos'
            photos_dir.mkdir(exist_ok=True)
            (photos_dir / name).write_bytes(body)
            self._ok()

        else:
            self.send_response(404)
            self.end_headers()

    def _ok(self):
        self.send_response(200)
        self.end_headers()

    def log_message(self, format, *args):
        pass  # suppress request logs

with socketserver.TCPServer(('', PORT), Handler) as httpd:
    print(f'Serving at http://localhost:{PORT}')
    httpd.serve_forever()
