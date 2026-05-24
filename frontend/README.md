# FileShift — Frontend

React + Vite + Tailwind v4. Drag-and-drop file conversion UI that talks to
the FileShift backend.

## Requirements

- **Node.js 20+**
- Backend running on `http://localhost:4000` (Vite proxies `/api` to it)

## Setup

```bash
cd frontend
npm install
npm run dev
```

App is at **http://localhost:5173**. Hot-reload included.

For production build:
```bash
npm run build
npm run preview   # serves dist/ for local testing
```

---

## Features

- **Drag-and-drop** uploads — falls back to tap-to-browse on mobile
- **Batch conversion** — drop many files, convert them all in one click
- **Per-file format picker** — choose the target format for each file
- **Real-time progress** — upload % from XHR; server-side conversion %
  from polling `/api/jobs/:id` with exponential backoff
- **Client-side validation** — rejects unsupported extensions and oversized
  files before they hit the server
- **Mobile-responsive** — works thumbs-first on phones up through desktop
- **Accessible** — keyboard nav, `:focus-visible` rings, ARIA labels,
  native `<select>` so screen readers and mobile pickers Just Work

## Why these choices

| Choice | Reason |
|---|---|
| Tailwind v4 | No `tailwind.config.js` / `postcss.config.js` — theme tokens live in CSS via `@theme`; less ceremony |
| Vite dev proxy | Same-origin in dev = no CORS preflights; production can serve frontend+backend behind one host |
| XHR for uploads | `fetch()` has no upload progress events. XHR is the only way to drive a real "uploading %" bar |
| Polling with backoff | Simpler than WebSockets; backoff (1s → 5s) keeps the server kind on long jobs |
| Per-card state | No global store needed yet — each JobCard owns its own machine. Lift later if sibling coordination is needed |
| Native `<select>` | Best mobile UX (system pickers), free accessibility, tiny bundle |

## File layout

```
frontend/
├── index.html
├── package.json
├── vite.config.js               # Vite + React + Tailwind v4 + /api proxy
├── src/
│   ├── main.jsx                 # React entry
│   ├── App.jsx                  # Top-level state, layout
│   ├── styles/index.css         # Tailwind imports + theme tokens
│   ├── api/client.js            # uploadFile (XHR), getJob, downloadUrl
│   ├── lib/
│   │   ├── formats.js           # Format registry (mirrors backend)
│   │   └── format.js            # Tiny formatters (bytes, truncate)
│   ├── hooks/
│   │   └── useJobPolling.js     # Polls /api/jobs/:id with backoff
│   └── components/
│       ├── Header.jsx
│       ├── Dropzone.jsx         # Drag-drop + tap-to-browse
│       ├── FormatPicker.jsx     # Native select
│       ├── ProgressBar.jsx
│       ├── JobCard.jsx          # One card per file, owns its state machine
│       └── JobList.jsx          # Batch actions
└── README.md
```

## Job lifecycle, per card

```
pending  → user picks target, clicks Convert (or Convert all)
   ↓
uploading  ← XHR upload, progress drives bar
   ↓
queued     ← server accepted; polling starts
   ↓
active     ← worker picked it up; job.progress drives bar
   ↓
completed  → Download button shown
   ↓
failed     ← any step can land here; Remove to dismiss
```