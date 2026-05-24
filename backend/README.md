# FileShift Backend

Node.js + Express API and BullMQ workers. Self-hosted file conversion using
FFmpeg, LibreOffice, and ImageMagick. No third-party conversion APIs.

For product-level overview see the [top-level README](../README.md). This
document is a technical reference: API, configuration, internals, security.

---

## Table of contents

- [Architecture](#architecture)
- [Requirements](#requirements)
- [Setup](#setup)
- [API reference](#api-reference)
- [Configuration](#configuration)
- [Conversion engine map](#conversion-engine-map)
- [Security architecture](#security-architecture)
- [File layout](#file-layout)
- [Development](#development)
- [Troubleshooting](#troubleshooting)

---

## Architecture

```
                          ┌─────────────┐
   POST /api/upload  ───► │  API (8080) │ ───► multer + magic-byte verify
                          │             │ ───► BullMQ.add('convert', …)
                          └──────┬──────┘
                                 │ Redis (BullMQ)
                          ┌──────▼──────┐
                          │   Worker    │ ◄── job picked up
                          │   process   │ ◄── adapter dispatched (image / office / audio / video)
                          │             │ ◄── spawn() with shell:false + timeout
                          │             │ ──► writes /storage/outputs/<uuid>.<ext>
                          └─────────────┘
                                 │ result persisted
                          ┌──────▼──────┐
   GET /api/jobs/:id ───► │  API        │ ───► returns HMAC-signed download token
   GET /api/download/:t ► │             │ ───► verifies, streams file
                          └─────────────┘
```

Three processes:

1. **`server.js`** — HTTP API. Owns no conversion logic, only request
   handling, queue dispatch, and cleanup cron.
2. **`worker.js`** — Long-running consumer. Detects tools on PATH at boot,
   pulls jobs from Redis, calls the right adapter.
3. **`redis`** — BullMQ's queue store. Survives API restarts.

The API and worker can be scaled independently. Multiple workers split jobs
automatically (BullMQ handles distribution).

---

## Requirements

- **Node.js 20+**
- **Redis 6+** (provided by docker-compose if you use it)
- **At least one** of:
  - **FFmpeg** — audio + video
  - **LibreOffice** — documents, spreadsheets, presentations
  - **ImageMagick** — images

The worker logs which tools were found at startup. Anything missing means
that category's conversions will fail with a clear error — other categories
keep working.

### Installing tools (manual setup only)

The Docker worker image already has all three. Skip this section if using
`docker compose`.

**Windows (PowerShell as admin):**
```powershell
winget install Gyan.FFmpeg
winget install ImageMagick.ImageMagick
winget install TheDocumentFoundation.LibreOffice
```
LibreOffice doesn't add itself to PATH on Windows. Set in `.env`:
```
LIBREOFFICE_PATH=C:\Program Files\LibreOffice\program\soffice.exe
```

**macOS (Homebrew):**
```bash
brew install ffmpeg imagemagick libreoffice
```

**Debian / Ubuntu:**
```bash
sudo apt install -y ffmpeg imagemagick libreoffice
```

---

## Setup

### Option A — Docker (recommended)

From the **project root** (not this directory):
```bash
cp .env.example .env
# Edit .env, set DOWNLOAD_TOKEN_SECRET
docker compose up --build -d
```

The API is exposed via the frontend's nginx at `http://localhost:8080`.
For direct API access during dev, uncomment the `ports:` block in
`docker-compose.yml`.

### Option B — Local development

```bash
cd backend
cp .env.example .env
npm install

# In a separate terminal
docker run -d --name fileshift-redis --restart unless-stopped -p 6379:6379 redis:7-alpine

# Terminal 1 — API (hot-reload via nodemon)
npm run dev

# Terminal 2 — worker
npm run worker
```

API at `http://localhost:4000`. The worker prints which conversion tools it
resolved at startup — verify all the ones you need are present.

---

## API reference

All endpoints return JSON. Errors come back as `{ "error": "<message>" }`
with an appropriate HTTP status.

### `POST /api/upload`

Submit a file for conversion. **Rate-limited** (20 requests / 15 minutes / IP).

**Request** — `multipart/form-data`

| Field | Type | Required | Description |
|---|---|---|---|
| `file` | binary | yes | The source file |
| `target` | string | yes | Target extension, e.g. `png`, `pdf`, `mp3` |

**Responses**

- `202 Accepted` — job queued
  ```json
  {
    "jobId": "12",
    "status": "queued",
    "sourceExt": "jpg",
    "targetExt": "png",
    "displayName": "photo.jpg"
  }
  ```
- `400` — unsupported extension, mismatched magic bytes, invalid target,
  cross-category conversion attempt
- `413` — file exceeds `MAX_FILE_SIZE`
- `429` — rate limit exceeded

**Example**
```bash
curl -X POST http://localhost:8080/api/upload \
  -F "file=@photo.jpg" \
  -F "target=png"
```

---

### `GET /api/jobs/:id`

Poll a job's current status. Poll frequency is up to the client; the
frontend uses exponential backoff from 1s to 5s.

**Response**

| Field | Type | When present |
|---|---|---|
| `jobId` | string | always |
| `status` | string | always — one of `queued`, `active`, `completed`, `failed`, `waiting`, `delayed` |
| `progress` | number (0–100) | always |
| `sourceExt`, `targetExt`, `displayName` | string | always |
| `outputSize` | number (bytes) | only when `status === "completed"` |
| `downloadToken` | string | only when `status === "completed"` |
| `error` | string | only when `status === "failed"` |

**Example**
```bash
curl http://localhost:8080/api/jobs/12
```

---

### `GET /api/download/:token`

Stream the converted file. The token is short-lived and embeds the output
filename, friendly name, and expiry — all HMAC-signed.

**Response**

- `200 OK` — binary file with `Content-Disposition: attachment; filename="<original>.<targetExt>"`
- `403` — token invalid, expired, or tampered with
- `404` — output file no longer exists (probably cleaned up)

The friendly download filename is RFC 5987-encoded, so unicode names
(`家族.png`, `résumé.pdf`) survive intact in modern browsers.

---

### `GET /health`

Liveness probe.
```json
{ "status": "ok", "timestamp": "2026-05-24T20:54:52.173Z" }
```

---

## Configuration

All settings are environment variables. The `.env` file at `backend/.env`
is loaded automatically. In Docker, values come from the compose file (which
reads the project-root `.env`).

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | API listen port |
| `NODE_ENV` | `development` | Set to `production` in prod (enables stricter error handling) |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed origin for browser requests |
| `REDIS_HOST` | `localhost` | Redis hostname |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | _(empty)_ | Optional Redis AUTH password |
| `MAX_FILE_SIZE` | `524288000` (500 MB) | Hard upload limit, enforced by multer |
| `RETENTION_HOURS` | `2` | Files older than this get deleted by cleanup cron |
| `CLEANUP_INTERVAL_MINUTES` | `15` | How often cleanup runs |
| `JOB_TIMEOUT_MS` | `600000` (10 min) | Per-job hard timeout (SIGKILL after) |
| `JOB_MAX_ATTEMPTS` | `2` | Retry count on transient failure |
| `WORKER_CONCURRENCY` | `2` | Parallel jobs per worker process |
| `DOWNLOAD_TOKEN_SECRET` | _(required)_ | HMAC secret. **Refuses to start in prod with default value.** |
| `DOWNLOAD_TOKEN_TTL` | `3600` (1h) | Download token lifetime in seconds |
| `IMAGEMAGICK_PATH` | _(auto-detect)_ | Override path if not on PATH |
| `FFMPEG_PATH` | _(auto-detect)_ | Override path if not on PATH |
| `LIBREOFFICE_PATH` | _(auto-detect)_ | Override path (commonly needed on Windows) |

Generate a strong secret:
```bash
# Linux / macOS
openssl rand -hex 32

# Windows PowerShell
-join ((1..64) | % { '{0:x}' -f (Get-Random -Max 16) })
```

---

## Conversion engine map

The job processor in `src/workers/processor.js` routes by category:

| Category | Adapter | Engine | Notes |
|---|---|---|---|
| image | `image.js` | ImageMagick | `magick <in> <out>` for v7, `convert` for v6 |
| document | `office.js` | LibreOffice | Headless, isolated profile per job |
| spreadsheet | `office.js` | LibreOffice | Same adapter, format inferred from target ext |
| presentation | `office.js` | LibreOffice | Same adapter |
| audio | `audio.js` | FFmpeg | Duration probe → progress reporting via `-progress pipe:1` |
| video | `video.js` | FFmpeg | Same as audio, keeps video stream |
| archive | _(stub)_ | — | Returns clear "not yet supported" error |
| ebook | _(stub)_ | — | Returns clear "not yet supported" error |

**Important LibreOffice detail** — every invocation gets a unique
`-env:UserInstallation` so concurrent jobs don't clobber each other's
profile. Without this, two simultaneous `soffice` processes silently
attach to the same profile and the second one fails. This is the single
most important piece of trivia when running >1 worker.

---

## Security architecture

| Concern | Mitigation | Where |
|---|---|---|
| Path traversal in uploads | Random UUID filenames, original name never touches disk | `routes/upload.js` |
| Path traversal in downloads | Resolved path must start with `outputsDir + sep` | `routes/download.js` |
| File-type spoofing | `file-type` magic-byte check, mismatch rejected | `routes/upload.js` |
| Cross-category abuse (e.g. mp4 → pdf) | `canConvert()` checks category equality | `utils/fileTypes.js` |
| Shell injection in adapters | `spawn(cmd, [args], { shell: false })` always | `utils/exec.js` |
| Concurrent LibreOffice clobber | `-env:UserInstallation=<unique>` per job | `workers/adapters/office.js` |
| Runaway conversions | Per-job hard timeout, SIGKILL on hang | `utils/exec.js` |
| DoS via huge uploads | `MAX_FILE_SIZE` enforced by multer | `routes/upload.js` |
| DoS via request flood | `express-rate-limit`: 300/15min global, 20/15min on `/upload` | `middleware/security.js` |
| Token forgery | HMAC-SHA256, `crypto.timingSafeEqual` | `routes/download.js` |
| Token replay after file deletion | TTL matched to retention | configuration |
| Browser content sniffing | `Content-Disposition: attachment` + `X-Content-Type-Options: nosniff` | `routes/download.js` |
| Header injection via filename | Display names sanitized at upload; control chars stripped | `routes/upload.js` |
| Output validation | Post-conversion `stat` — 0-byte outputs fail the job | `workers/processor.js` |
| Error info leak | Production hides stack traces, sends generic 500 | `middleware/errorHandler.js` |
| Container privilege | All Docker images run as UID 1001, not root | `Dockerfile.api` / `.worker` |
| Default-secret production boot | App refuses to start if `DOWNLOAD_TOKEN_SECRET` is the dev default and `NODE_ENV=production` | `config/index.js` |

---

## File layout

```
backend/
├── package.json
├── .env.example
├── README.md
└── src/
    ├── server.js                    # Express app entry
    ├── worker.js                    # BullMQ worker entry
    ├── config/
    │   └── index.js                 # Env loader + prod safety checks
    ├── routes/
    │   ├── upload.js                # POST /api/upload
    │   ├── jobs.js                  # GET  /api/jobs/:id  (also signs tokens)
    │   └── download.js              # GET  /api/download/:token
    ├── middleware/
    │   ├── security.js              # Rate limiters
    │   └── errorHandler.js          # Central error handler
    ├── queue/
    │   └── queue.js                 # BullMQ queue + Redis connection
    ├── workers/
    │   ├── processor.js             # Job router → adapter dispatch
    │   └── adapters/
    │       ├── index.js             # Category → adapter registry
    │       ├── image.js             # ImageMagick
    │       ├── office.js            # LibreOffice (doc/sheet/slide)
    │       ├── audio.js             # FFmpeg audio
    │       ├── video.js             # FFmpeg video
    │       ├── ffmpegUtils.js       # Duration + progress parsing
    │       └── unsupported.js       # Stub for archive/ebook
    ├── cron/
    │   └── cleanup.js               # Storage TTL sweeper
    └── utils/
        ├── fileTypes.js             # Format registry + validators
        ├── exec.js                  # Safe spawn wrapper w/ timeout
        ├── tools.js                 # Startup tool detection
        └── logger.js                # Winston logger
```

---

## Development

### Adding a new adapter

1. Create `src/workers/adapters/<category>.js` exporting:
   ```js
   export const myAdapter = {
     name: 'my-adapter',
     async convert({ inputPath, outputPath, sourceExt, targetExt, onProgress }) {
       await onProgress(10);
       await runCommand(toolPath, [inputPath, outputPath], { timeoutMs });
       await onProgress(100);
     },
   };
   ```
2. Register it in `adapters/index.js`.
3. Add the category and its extensions to `utils/fileTypes.js`.
4. Mirror the format additions in `frontend/src/lib/formats.js`.

### Adding a new format to an existing category

Just add the extension to `FORMATS[category].extensions` in both
`utils/fileTypes.js` (backend) and `lib/formats.js` (frontend). The
adapter handles it automatically as long as the underlying engine
supports the format.

### Logs

`winston` writes JSON to stdout in production, colorized text in dev.
Pipe to your log aggregator of choice; the structured format plays well
with Loki, Datadog, CloudWatch, etc.

---

## Troubleshooting

**Worker logs `Some conversion tools were not found on PATH`**
Either install the missing tool, or set its path via env var
(`FFMPEG_PATH`, `IMAGEMAGICK_PATH`, `LIBREOFFICE_PATH`). On Windows,
LibreOffice almost always needs `LIBREOFFICE_PATH` set explicitly.

**Job stuck at `waiting`**
Means the worker isn't running or can't reach Redis. Check:
- `docker compose ps` — is the worker container up?
- `docker compose logs worker` — any startup errors?
- `docker compose logs redis` — connection refused?

**`Cannot convert .X to .Y (different file categories)`**
You're trying a cross-category conversion (e.g. mp4 → pdf). Not supported
by design; the safer path forward is to chain calls explicitly.

**Conversion succeeds but output is empty / corrupt**
The job processor checks output size before marking success, so an empty
file would have produced a `failed` status. If you're seeing this, please
file an issue with the input file type and target.

**LibreOffice hangs forever**
Almost always means two `soffice` processes are competing for the same
user profile. Verify the office adapter's `-env:UserInstallation` flag
is present in the spawn args. If you've modified the adapter, this is
the first thing to re-check.