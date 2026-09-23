"""SafeScreen Windows host.

Serves the SafeScreen web app on this PC only (127.0.0.1) and runs the
Qualcomm AI Hub EasyOCR models natively with ONNX Runtime. On a
Snapdragon X Series PC with onnxruntime-qnn installed, the models run on the
Hexagon NPU through the QNN execution provider; elsewhere they run on the CPU.

The page and the host share one origin, so the app's Content Security Policy
(connect-src 'self') still holds: frames go to this local process and
nowhere else. The host never writes frames to disk.

  python host/safescreen_host.py            # opens the app in an Edge app window
  python host/safescreen_host.py --no-open  # just serve
  python host/safescreen_host.py --cpu      # skip the NPU

Endpoints (same protocol as docs/snapdragon.md, over same-origin HTTP):
  GET  /api/host      -> HostInfo
  POST /api/analyze   -> HostAnalysis   (body: PNG/JPEG bytes)
"""

from __future__ import annotations

import argparse
import io
import json
import mimetypes
import os
import platform
import shutil
import subprocess
import sys
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from PIL import Image

import easyocr_engine as ocr

VERSION = '0.2.0'
MAX_FRAME_BYTES = 25 * 1024 * 1024
HOST_META = '<meta name="safescreen-host" content="http" />'

HEADERS = {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
}


def base_dir() -> Path:
    # PyInstaller unpacks bundled files next to the executable.
    return Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parent))


def find_app_dir(arg: str | None) -> Path:
    candidates = [Path(arg)] if arg else [base_dir() / 'app', base_dir().parent / 'dist']
    for c in candidates:
        if (c / 'index.html').is_file():
            return c.resolve()
    sys.exit('SafeScreen host: built app not found. Run "npm run build" first, or pass --app <folder>.')


def processor_name() -> str:
    if sys.platform == 'win32':
        try:
            import winreg

            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r'HARDWARE\DESCRIPTION\System\CentralProcessor\0') as k:
                return str(winreg.QueryValueEx(k, 'ProcessorNameString')[0]).strip()
        except OSError:
            pass
    return platform.processor() or platform.machine()


def os_name() -> str:
    if sys.platform == 'win32':
        build = int(platform.version().split('.')[-1] or 0)
        # platform.release() reports "10" on Windows 11; the build number tells them apart.
        return f'Windows {"11" if build >= 22000 else platform.release()} (build {build}) {platform.machine()}'
    return f'{platform.system()} {platform.release()} {platform.machine()}'


class Host:
    def __init__(self, app_dir: Path, engine: ocr.Engine):
        self.app_dir = app_dir
        self.engine = engine
        self.lock = threading.Lock()  # one inference at a time
        npu = engine.provider == 'QNNExecutionProvider'
        self.info = {
            'version': VERSION,
            'executionProviders': engine.available,
            'activeProvider': engine.provider,
            'device': {
                'processor': processor_name(),
                'npu': 'Qualcomm Hexagon NPU (QNN HTP)' if npu else 'Not in use',
                'os': os_name(),
            },
            'models': [
                {'name': 'EasyOCR detector (CRAFT), Qualcomm AI Hub', 'precision': 'INT8 (w8a8)', 'provider': 'QNN' if npu else 'CPU'},
                {'name': 'EasyOCR recognizer (CRNN), Qualcomm AI Hub', 'precision': 'INT8 (w8a8)', 'provider': 'QNN' if npu else 'CPU'},
            ],
            'notes': engine.notes,
            'loadMs': round(engine.load_ms),
        }


def make_handler(host: Host, port: int):
    index_cache: dict[str, bytes] = {}
    allowed_hosts = {f'127.0.0.1:{port}', f'localhost:{port}'}

    class Handler(BaseHTTPRequestHandler):
        server_version = f'SafeScreenHost/{VERSION}'

        def log_message(self, fmt, *args):  # quiet: frames and paths are not logged
            pass

        def _send(self, status: int, body: bytes, ctype: str, cache: str = 'no-store'):
            self.send_response(status)
            for k, v in HEADERS.items():
                self.send_header(k, v)
            self.send_header('Content-Type', ctype)
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', cache)
            self.end_headers()
            self.wfile.write(body)

        def _json(self, status: int, obj) -> None:
            self._send(status, json.dumps(obj).encode(), 'application/json')

        def _index(self) -> bytes:
            if 'html' not in index_cache:
                html = (host.app_dir / 'index.html').read_text(encoding='utf-8')
                index_cache['html'] = html.replace('<head>', f'<head>\n    {HOST_META}', 1).encode()
            return index_cache['html']

        def _trusted_host(self) -> bool:
            # Blocks DNS rebinding: a page on another domain that resolves to
            # 127.0.0.1 still sends its own name in the Host header.
            if self.headers.get('Host') in allowed_hosts:
                return True
            self._json(421, {'error': 'Unexpected Host header'})
            return False

        def do_GET(self):
            if not self._trusted_host():
                return
            path = self.path.split('?', 1)[0]
            if path == '/api/host':
                return self._json(200, host.info)
            if path.startswith('/api/'):
                return self._json(404, {'error': 'Unknown endpoint'})
            rel = Path(path.lstrip('/'))
            target = (host.app_dir / rel).resolve()
            if host.app_dir in target.parents and target.is_file():
                ctype = mimetypes.guess_type(target.name)[0] or 'application/octet-stream'
                if target.suffix in ('.mjs', '.js'):
                    ctype = 'text/javascript'
                elif target.suffix == '.wasm':
                    ctype = 'application/wasm'
                if target.name == 'index.html':
                    return self._send(200, self._index(), 'text/html; charset=utf-8')
                cache = 'public, max-age=604800' if any(p in rel.parts[:1] for p in ('assets', 'models', 'ort', 'ocr')) else 'no-cache'
                return self._send(200, target.read_bytes(), ctype, cache)
            # App routes fall back to the SPA.
            return self._send(200, self._index(), 'text/html; charset=utf-8')

        def do_POST(self):
            if not self._trusted_host():
                return
            if self.path.split('?', 1)[0] != '/api/analyze':
                return self._json(404, {'error': 'Unknown endpoint'})
            # Same-origin only: reject requests another site's page could make.
            origin = self.headers.get('Origin')
            if origin and origin != f'http://{self.headers.get("Host")}':
                return self._json(403, {'error': 'Cross-origin request refused'})
            length = int(self.headers.get('Content-Length') or 0)
            if not 0 < length <= MAX_FRAME_BYTES:
                return self._json(413, {'error': 'Frame missing or too large'})
            data = self.rfile.read(length)
            try:
                img = Image.open(io.BytesIO(data))
                img.load()
            except Exception:
                return self._json(400, {'error': 'The frame could not be decoded as an image.'})
            try:
                with host.lock:
                    result = ocr.recognize(host.engine, img)
            except Exception as err:
                return self._json(500, {'error': f'Inference failed: {type(err).__name__}'})
            finally:
                del data, img
            return self._json(200, result)

    return Handler


def open_app_window(url: str) -> None:
    """Edge in app mode gives a window without browser chrome; fall back to the default browser."""
    edge = shutil.which('msedge') or next(
        (p for p in (
            os.path.expandvars(r'%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe'),
            os.path.expandvars(r'%ProgramFiles%\Microsoft\Edge\Application\msedge.exe'),
        ) if os.path.isfile(p)),
        None,
    )
    if edge:
        subprocess.Popen([edge, f'--app={url}', '--window-size=1440,900'])
    else:
        webbrowser.open(url)


def main() -> None:
    sys.stdout.reconfigure(line_buffering=True)
    ap = argparse.ArgumentParser(description='SafeScreen Windows host')
    ap.add_argument('--port', type=int, default=8787)
    ap.add_argument('--app', help='folder with the built web app (default: ./app or ../dist)')
    ap.add_argument('--cpu', action='store_true', help='do not use the NPU')
    ap.add_argument('--no-open', action='store_true', help='do not open a window')
    args = ap.parse_args()

    app_dir = find_app_dir(args.app)
    models = base_dir() / 'models'
    detector = models / 'detector.int8.onnx'
    if not detector.is_file():
        detector = app_dir / 'models' / 'easyocr' / 'detector.int8.onnx'
    recognizer = models / 'recognizer.int8.onnx'
    cache = Path(os.environ.get('LOCALAPPDATA', base_dir())) / 'SafeScreen' / 'qnn-cache'

    print(f'SafeScreen host {VERSION}')
    print(f'  ONNX Runtime {ocr.ort.__version__}; providers: {", ".join(ocr.ort.get_available_providers())}')
    engine = ocr.load(str(detector), str(recognizer), str(cache), force_cpu=args.cpu)
    print(f'  Models loaded on {engine.provider} in {engine.load_ms:.0f} ms')
    for n in engine.notes:
        print(f'  Note: {n}')

    host = Host(app_dir, engine)
    server = ThreadingHTTPServer(('127.0.0.1', args.port), make_handler(host, args.port))
    url = f'http://127.0.0.1:{args.port}/app/live-analysis'
    print(f'  Serving {app_dir} at {url}')
    print('  Press Ctrl+C to stop.')
    if not args.no_open:
        threading.Timer(0.5, open_app_window, [url]).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
