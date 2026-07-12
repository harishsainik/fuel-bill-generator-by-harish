# Fuel Slip Generator (MVP)

Minimal, static site to generate a **Bharat Petroleum** (BP) sample fuel slip PDF matching the provided preview.

## Run

Run a tiny local server (recommended, avoids browser file restrictions):

```bash
cd /Users/harishsaini/Projects/FuelGenerator
python3 serve.py
```

It will print a URL like `http://localhost:5173/index.html` (or the next free port if 5173 is busy).

### If you prefer `http.server`
If you see a traceback when binding, that usually means **the port is already in use**. Pick another port:

```bash
python3 -m http.server 5174
```

## What’s included

- Simple input form (no fancy UI)
- Live preview of the slip
- **Download PDF** (generated in-browser, no library “Producer” metadata)
- BP receipt font + logo aligned with `freeforonline.com` assets (stored under `assets/vendor/`)

