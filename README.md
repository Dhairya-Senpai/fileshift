<div align="center">

# FileShift

### Self-hosted universal file conversion.
### Your files. Your server. Zero third parties.

[![Status](https://img.shields.io/badge/status-stable-success)](#)
[![Docker](https://img.shields.io/badge/docker-compose%20up-2496ED?logo=docker&logoColor=white)](#quick-start)
</div>

---

## Convert files without giving them away.

Every "free" online converter is a deal with the devil. Upload a tax return,
a client contract, or a family photo, and you've handed it to a stranger's
server that may train models on it, scan it, sell aggregate metadata about
it, or simply leak it in their next breach. Paid APIs charge per conversion
and disappear the moment their pricing page changes.

**FileShift is the alternative you run yourself.** Drop files in, get them
back in a different format. No accounts. No upload limits. No telemetry.
No data ever leaving your infrastructure.

```bash
docker compose up
```

That's the install. You're now running a production-grade conversion service
on your own machine.

---

## What you can convert

| | Formats |
|---|---|
| 🖼️  **Images** | `jpg` `png` `webp` `gif` `bmp` `tiff` `avif` `heic` `svg` |
| 📄  **Documents** | `pdf` `docx` `doc` `odt` `rtf` `txt` `html` `md` |
| 📊  **Spreadsheets** | `xlsx` `xls` `ods` `csv` `tsv` |
| 🎞️  **Presentations** | `pptx` `ppt` `odp` |
| 🎵  **Audio** | `mp3` `wav` `flac` `aac` `ogg` `m4a` `wma` `opus` |
| 🎬  **Video** | `mp4` `mov` `avi` `mkv` `webm` `flv` `wmv` `m4v` |

Any-to-any within a category. Engine choices are sane defaults — FFmpeg for
media, LibreOffice for documents, ImageMagick for images — and the worker
container has all three pre-installed.

---

## Quick start

You need [Docker](https://www.docker.com/products/docker-desktop/). That's it.

```bash
git clone https://github.com/Dhairya-Senpai/fileshift
cd fileshift

# Generate a signing secret for download tokens
cp .env.example .env
echo "DOWNLOAD_TOKEN_SECRET=$(openssl rand -hex 32)" >> .env

# Build + start the whole stack
docker compose up -d --build

# Open the app
# → http://localhost:8080
```

The first build takes a few minutes, the worker container bakes in FFmpeg,
LibreOffice, and ImageMagick. Subsequent rebuilds are seconds.

**To scale up under load**, just spin up more workers:
```bash
docker compose up -d --scale worker=8
```

Redis distributes jobs across them automatically. No code changes, no
load balancer config.

---

## How it works

```
                       ┌──────────────────────────────────────┐
                       │              your server             │
                       │                                      │
   ┌─────────┐  HTTP   │  ┌──────────┐    BullMQ   ┌────────┐ │
   │ browser │ ──────► │  │   API    │ ──────────► │ worker │ │
   │ or curl │   ◄──── │  │ (node)   │   ◄──────── │ pool   │ │
   └─────────┘         │  └────┬─────┘             └────────┘ │
                       │       │       ┌───────┐    ▲         │
                       │       └─────► │ redis │ ───┘         │
                       │               └───────┘              │
                       │                                      │
                       │   nothing leaves this box. ever.     │
                       └──────────────────────────────────────┘
```

- **API** — accepts uploads, verifies file types via magic bytes (not just
  extension), queues conversion jobs, hands out signed download tokens.
- **Workers** — pull jobs from Redis, run the appropriate engine (FFmpeg /
  LibreOffice / ImageMagick) in an isolated process with a hard timeout,
  report progress back. Scale them horizontally.
- **Frontend** — drag-and-drop UI with real-time progress, batch uploads,
  mobile-responsive. Or skip it entirely and hit the REST API directly.
- **Cleanup** — files auto-delete after a configurable retention window.
  Nothing lingers on disk past its welcome.

---

## What's in the box

- ✨ **Drag-and-drop UI** with batch upload and real-time progress
- 📱 **Mobile-responsive** — works thumbs-first on phones
- 🔌 **REST API** — automate from anywhere
- 🚦 **Job queue** with retries, timeouts, and horizontal worker scaling
- 🔒 **HMAC-signed downloads** — short-lived, tamper-proof, expire automatically
- 🧹 **Auto-cleanup** — files don't outlive their TTL
- 🛡️  **Hardened by default** — non-root containers, magic-byte file validation,
   helmet headers, rate limiting, path-traversal protection, no shell injection
   surfaces in conversion engines
- 🎯 **No vendor lock-in** — the whole stack is yours, MIT-licensed

---

## Use cases

- **Internal tools** — let your team convert files without IT review of yet
  another SaaS contract.
- **Privacy-first products** — bake conversion into your app without sending
  user data to third parties.
- **Compliance-heavy environments** — healthcare, finance, legal — where
  "we never uploaded it anywhere" is the answer auditors want.
- **Air-gapped networks** — runs entirely offline once the images are built.
- **Cost reduction** — replace per-conversion API bills with a fixed-cost VM.
- **Hobby projects** — your home server probably has the spare cycles already.

---
<div align="center">
<sub>Built with care. Runs anywhere. Owes nothing to anyone.</sub>
</div>