#!/usr/bin/env python3
from __future__ import annotations

import http.server
import socket
import socketserver
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent


def is_port_free(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind((host, port))
            return True
        except OSError:
            return False


def pick_port(start: int = 5173, end: int = 5190) -> int:
    for p in range(start, end + 1):
        if is_port_free(p):
            return p
    raise RuntimeError(f"No free port found in range {start}-{end}")


def main() -> int:
    port = pick_port()
    handler = http.server.SimpleHTTPRequestHandler
    socketserver.TCPServer.allow_reuse_address = True

    with socketserver.TCPServer(("127.0.0.1", port), handler) as httpd:
        url = f"http://localhost:{port}/index.html"
        print(f"Serving {ROOT}")
        print(f"Open: {url}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")
            return 0


if __name__ == "__main__":
    raise SystemExit(main())

