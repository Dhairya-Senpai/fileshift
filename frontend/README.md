# FileShift Frontend

React + Vite + Tailwind v4. Drag-and-drop UI that talks to the FileShift
API. Mobile-responsive, real-time progress, batch uploads.

For product-level overview see the [top-level README](../README.md). This
document covers technical internals: components, state machine, design
system, build pipeline.

---

## Table of contents

- [Stack](#stack)
- [Setup](#setup)
- [Features](#features)
- [Architecture](#architecture)
- [State machine](#job-state-machine)
- [API integration](#api-integration)
- [Design system](#design-system)
- [File layout](#file-layout)
- [Production build](#production-build)
- [Development tips](#development-tips)

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | React 18 | Industry standard, large ecosystem, hooks fit our state needs |
| Build | Vite 5 | Fast HMR, native ESM, painless config |
| Styling | Tailwind v4 | No `tailwind.config.js`, no PostCSS — design tokens live in CSS via `@theme` |
| Icons | lucide-react | Consistent stroke widths, MIT-licensed, tree-shaken |
| Utility | clsx | Tiny conditional className helper |

No state management library, no router, no UI kit. Everything's small
enough that adding those would be more weight than they're worth.

---

## Setup

### Development

Backend must be running first (see [backend/README.md](../backend/README.md)).

```bash
cd frontend
npm install
npm run dev
```

App at **http://localhost:5173**. Vite's dev proxy forwards `/api/*` to
`http://localhost:4000`, so there's no CORS dance — looks like same-origin
to the browser.

### Production

In production the frontend is served by nginx (see top-level
`Dockerfile.frontend`), which proxies `/api` to the API container. Run
the whole stack with `docker compose up`.

To preview a production build locally:
```bash
npm run build
npm run preview
```

---

## Features

- **Drag-and-drop** uploads — falls back to tap-to-browse on mobile
- **Batch conversion** — drop multiple files, "Convert all" with one click
- **Per-file format picker** — independent target format per file
- **Real-time progress** — XHR upload events for the upload phase,
  exponential-backoff polling for the conversion phase
- **Client-side validation** — rejects unsupported extensions and oversized
  files before they hit the server
- **Cancellation** — abort an in-flight upload by removing the card
- **Mobile-responsive** — thumb-first on phones, comfortable on desktops
- **Accessible** — keyboard nav, `:focus-visible` rings, ARIA labels,
  native `<select>` elements so mobile pickers and screen readers Just Work
- **No autoplay surprises** — animations are subtle, transitions are
  CSS-only, no layout shift during state changes

---

## Architecture

```
App.jsx
  ├── owns the entries[] array (one per file)
  ├── handlers: addFiles, updateEntry, removeEntry, startEntry, startAll,
  │             clearCompleted
  │
  ├── <Header />
  │
  ├── <Dropzone onFilesAdded={addFiles}>
  │     ├── HTML5 drag-drop + hidden file input
  │     ├── client-side ext + size validation
  │     └── shows rejected files inline
  │
  └── <JobList entries={entries} {...handlers}>
        └── for each entry: <JobCard entry={entry} {...handlers}>
              ├── owns its own xhr / polling lifecycle
              ├── pending: <FormatPicker /> + Convert button
              ├── uploading: progress bar driven by xhr.upload events
              ├── queued/active: progress bar driven by useJobPolling hook
              ├── completed: download <a href={tokenUrl} download={…}>
              └── failed: error message + remove
```

**State ownership policy.** App.jsx is the single source of truth for the
entries list. JobCard owns its *transient* state (current xhr, latest
upload %), but every update that's persisted (status, progress,
download token) flows back through `onUpdate(id, patch)` to App. This
keeps the data structure flat and easy to reason about.

---

## Job state machine

Each entry transitions through these states. Transitions are unidirectional
in normal flow; the only "back" is `uploading → pending` when cancelled.

```
                 ┌──── drag/drop or tap
                 ▼
            ┌────────┐
            │ pending│ ── user picks target, clicks Convert ──┐
            └────────┘                                        │
                                                              ▼
                                                       ┌───────────┐
                                                       │ uploading │── cancel ───► pending
                                                       └─────┬─────┘
                                              POST /api/upload returns 202
                                                             ▼
                                                       ┌───────────┐
                                                       │  queued   │── any failure ─┐
                                                       └─────┬─────┘                │
                                                  polling .../jobs/:id              │
                                                             ▼                      │
                                                       ┌───────────┐                │
                                                       │  active   │ ───────────────┤
                                                       └─────┬─────┘                │
                                                       progress hits 100            │
                                                             ▼                      ▼
                                                      ┌───────────┐          ┌──────────┐
                                                      │ completed │          │  failed  │
                                                      └───────────┘          └──────────┘
                                                  shows Download button   shows error msg
```

Polling is implemented in `hooks/useJobPolling.js` — exponential backoff
from 1s up to 5s. It self-terminates once a terminal state (`completed` /
`failed`) is reached. Transient network errors keep retrying — the user
sees a brief "Waiting in queue…" rather than a flapping error.

---

## API integration

`src/api/client.js` exposes:

```js
uploadFile({ file, target, onProgress, signal })  // returns { jobId, status, ... }
getJob(jobId)                                      // returns the job status payload
downloadUrl(token)                                 // returns "/api/download/<token>"
```

### Why XHR for uploads, fetch for everything else?

`fetch()` doesn't expose upload progress events — there's no way to drive
a meaningful "uploading %" bar with it. `XMLHttpRequest` does (via
`xhr.upload.onprogress`), so we use it specifically for the upload call.
The rest of the API uses `fetch()` for cleanliness.

### Why use the `download` attribute instead of programmatic download?

Browsers natively trigger a download when an `<a href download>` element
is clicked. This gives us the native filename suggestion, progress indicator
in the browser's download manager, and automatic resume on flaky networks
— all for free. The backend's `Content-Disposition` header is the
authoritative source for the filename (RFC 5987-encoded for unicode).

---

## Design system

Tailwind v4 lets us define design tokens in CSS via `@theme`, which avoids
the need for a `tailwind.config.js`. The tokens live in
`src/styles/index.css`:

```css
@theme {
  --color-bg:      oklch(0.985 0.005 264);   /* near-white, cool tint */
  --color-surface: #ffffff;
  --color-line:    oklch(0.92 0.005 264);    /* subtle borders */
  --color-ink:     oklch(0.22 0.02 264);     /* primary text */
  --color-accent:  oklch(0.55 0.22 295);     /* violet */
  --color-success: oklch(0.62 0.16 155);
  --color-danger:  oklch(0.58 0.22 25);
  ...
}
```

Colors are defined in `oklch()` for perceptually uniform palettes — this
matters for the accent variants (hover, soft) staying visually consistent.

**Typography:**
- `Inter` for UI text (system font fallback chain if not installed)
- `JetBrains Mono` for filenames, extensions, badges

**Other rules baked in:**
- `:focus-visible` only — keyboard users get rings, mouse-click users don't
- `font-size: 16px` minimum on inputs (prevents iOS Safari's zoom-on-focus)
- Custom WebKit scrollbars (slimmer, neutral color)
- All component spacing is multiples of `0.25rem` (Tailwind's default scale)

---

## File layout

```
frontend/
├── index.html                    # Vite entry, viewport meta
├── package.json
├── vite.config.js                # React + Tailwind v4 + /api proxy
├── nginx.conf                    # Production-only (used by Dockerfile.frontend)
├── README.md
└── src/
    ├── main.jsx                  # React entry
    ├── App.jsx                   # Top-level state + layout
    ├── styles/
    │   └── index.css             # Tailwind imports + theme tokens
    ├── api/
    │   └── client.js             # uploadFile (XHR), getJob, downloadUrl
    ├── lib/
    │   ├── formats.js            # Format registry (mirrors backend)
    │   └── format.js             # Tiny formatters (bytes, truncate)
    ├── hooks/
    │   └── useJobPolling.js      # Polls /api/jobs/:id with backoff
    └── components/
        ├── Header.jsx
        ├── Dropzone.jsx          # Drag-drop + tap-to-browse
        ├── FormatPicker.jsx      # Native <select>, styled
        ├── ProgressBar.jsx       # Reusable, supports indeterminate
        ├── JobCard.jsx           # One card per file, owns state machine
        └── JobList.jsx           # Container + batch actions
```

---

## Production build

`npm run build` produces `dist/`:

- Hashed asset filenames (cache-busting safe)
- Tree-shaken JS (lucide-react contributes only the icons we use)
- Inlined critical CSS, lazy-loaded the rest
- ~70 KB gzipped JS, ~5 KB gzipped CSS for the whole app

The production build is served by nginx in the Dockerized stack. See
`nginx.conf` for the production config — it adds security headers,
forwards `/api/*` to the backend container over Docker's bridge network,
and aggressively caches the hashed `/assets/*` paths.

---

## Development tips

### Backend's `MAX_FILE_SIZE` mirror

`App.jsx` has a `MAX_FILE_SIZE_BYTES` constant that mirrors the backend's
`MAX_FILE_SIZE` env var. If you change the backend value, update this too
or you'll get a confusing "server rejected an upload that passed client
validation" experience. Future improvement: have the backend expose this
via a `/api/config` endpoint.

### Format registry sync

`src/lib/formats.js` mirrors `backend/src/utils/fileTypes.js`. When adding
or removing supported formats, change both files. A `/api/formats`
endpoint would make this single-source — see the roadmap in the top-level
README.

### Adding a new component

- Keep components functional and small (under ~120 lines when possible)
- Tailwind classes inline; no CSS modules
- Use `clsx` for conditional classes
- Always check mobile viewport (Chrome devtools → iPhone SE preset is a
  good worst-case)
- Use `:focus-visible` for keyboard rings, never `:focus`

### Debugging API calls

The browser devtools Network tab is the fastest path. All requests should
go to `/api/...` (relative). In dev, watch the terminal where the API
runs — every request and rejection logs there. Tokens are JSON-base64url
encoded; you can paste the payload portion (before the dot) into a
base64 decoder to inspect contents.