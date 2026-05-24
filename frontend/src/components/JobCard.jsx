import { useEffect, useRef, useState } from 'react';
import {
  FileText, Image, Music, Video, FileArchive, FileSpreadsheet, FileType, BookOpen,
  Download, X, AlertCircle, CheckCircle2, Loader2, ArrowRight,
} from 'lucide-react';
import clsx from 'clsx';

import { uploadFile, downloadUrl } from '../api/client.js';
import { useJobPolling } from '../hooks/useJobPolling.js';
import { CATEGORY, getCategory } from '../lib/formats.js';
import { formatBytes, truncateFilename } from '../lib/format.js';
import ProgressBar from './ProgressBar.jsx';
import FormatPicker from './FormatPicker.jsx';

/**
 * One row per file. Owns its own state machine:
 *
 *   pending   → user-configurable (target format picker shown)
 *   uploading → file is being POSTed; upload progress 0-100
 *   queued    → server accepted, waiting for worker
 *   active    → worker is converting; job.progress drives the bar
 *   completed → download button shown
 *   failed    → error shown, retry button
 *
 * Why per-card state vs centralized? Keeps the React tree simple — no
 * global store needed yet, and cards never need to coordinate with siblings.
 * If we later add features like "convert all to PDF", lift state up then.
 */
export default function JobCard({ entry, onUpdate, onRemove, onStart }) {
  const { id, file, sourceExt, targetExt, status } = entry;
  const [uploadPct, setUploadPct] = useState(0);
  const abortRef = useRef(null);

  // Kick off upload when status transitions to "uploading".
  useEffect(() => {
    if (status !== 'uploading') return;

    const controller = new AbortController();
    abortRef.current = controller;
    setUploadPct(0);

    uploadFile({
      file,
      target: targetExt,
      signal: controller.signal,
      onProgress: (p) => setUploadPct(p),
    })
      .then((res) => {
        onUpdate(id, { status: res.status || 'queued', jobId: res.jobId });
      })
      .catch((err) => {
        if (err?.message === 'Upload cancelled') {
          onUpdate(id, { status: 'pending' });
        } else {
          onUpdate(id, { status: 'failed', error: err.message || 'Upload failed' });
        }
      });

    return () => controller.abort();
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll server-side job status once we have a jobId.
  const polling = entry.jobId && (status === 'queued' || status === 'active');
  useJobPolling(entry.jobId, polling, (data) => {
    onUpdate(id, {
      status: data.status,
      progress: data.progress,
      outputSize: data.outputSize,
      downloadToken: data.downloadToken,
      error: data.error,
    });
  }, () => { /* silent; transient errors are fine */ });

  const cancel = () => {
    if (abortRef.current) abortRef.current.abort();
    onRemove(id);
  };

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-xl p-4 transition-shadow hover:shadow-sm">
      <div className="flex items-start gap-3">
        <CategoryIcon ext={sourceExt} />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-sm text-[var(--color-ink)] truncate" title={file.name}>
                {truncateFilename(file.name, 48)}
              </p>
              <p className="text-xs text-[var(--color-ink-muted)] mt-0.5">
                {formatBytes(file.size)}
              </p>
            </div>
            <RemoveButton onClick={cancel} />
          </div>

          {/* Format conversion row — pending shows picker; otherwise static */}
          <div className="mt-3 flex items-center gap-2 text-sm">
            <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-[var(--color-line)] text-[var(--color-ink-muted)]">
              .{sourceExt}
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-[var(--color-ink-faint)]" aria-hidden="true" />
            {status === 'pending' ? (
              <FormatPicker
                sourceExt={sourceExt}
                value={targetExt}
                onChange={(v) => onUpdate(id, { targetExt: v })}
              />
            ) : (
              <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-[var(--color-line)] text-[var(--color-ink-muted)]">
                .{targetExt}
              </span>
            )}

            {status === 'pending' && (
              <button
                onClick={() => onStart(id)}
                className="ml-auto px-3 py-1 text-xs font-medium rounded-md bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] transition-colors"
              >
                Convert
              </button>
            )}
          </div>

          <StatusRow entry={entry} uploadPct={uploadPct} />
        </div>
      </div>
    </div>
  );
}

function RemoveButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label="Remove file"
      className="text-[var(--color-ink-faint)] hover:text-[var(--color-danger)] rounded-md p-1 -m-1 transition-colors"
    >
      <X className="w-4 h-4" aria-hidden="true" />
    </button>
  );
}

function StatusRow({ entry, uploadPct }) {
  const { status, progress, downloadToken, outputSize, error, file } = entry;

  if (status === 'pending') return null;

  if (status === 'uploading') {
    return (
      <div className="mt-3">
        <div className="flex items-center gap-2 text-xs text-[var(--color-ink-muted)] mb-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          <span>Uploading… {uploadPct}%</span>
        </div>
        <ProgressBar value={uploadPct} />
      </div>
    );
  }

  if (status === 'queued') {
    return (
      <div className="mt-3">
        <div className="flex items-center gap-2 text-xs text-[var(--color-ink-muted)] mb-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          <span>Waiting in queue…</span>
        </div>
        <ProgressBar indeterminate />
      </div>
    );
  }

  if (status === 'active') {
    return (
      <div className="mt-3">
        <div className="flex items-center gap-2 text-xs text-[var(--color-ink-muted)] mb-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          <span>Converting… {progress || 0}%</span>
        </div>
        <ProgressBar value={progress || 0} />
      </div>
    );
  }

  if (status === 'completed') {
    // Pretty download filename: original-stem + new extension
    const stem = file.name.replace(/\.[^.]+$/, '') || 'converted';
    const downloadName = `${stem}.${entry.targetExt}`;

    return (
      <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-xs text-[var(--color-success)]">
          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Ready · {formatBytes(outputSize)}</span>
        </div>
        <a
          href={downloadUrl(downloadToken)}
          download={downloadName}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-[var(--color-success)] text-white hover:opacity-90 transition-opacity"
        >
          <Download className="w-3.5 h-3.5" aria-hidden="true" />
          Download
        </a>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="mt-3 flex items-start gap-2 text-xs text-[var(--color-danger)]">
        <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" aria-hidden="true" />
        <span className="break-words">{error || 'Conversion failed'}</span>
      </div>
    );
  }

  return null;
}

function CategoryIcon({ ext }) {
  const cat = getCategory(ext);
  const Icon =
    cat === CATEGORY.IMAGE        ? Image :
    cat === CATEGORY.AUDIO        ? Music :
    cat === CATEGORY.VIDEO        ? Video :
    cat === CATEGORY.ARCHIVE      ? FileArchive :
    cat === CATEGORY.SPREADSHEET  ? FileSpreadsheet :
    cat === CATEGORY.PRESENTATION ? FileType :
    cat === CATEGORY.EBOOK        ? BookOpen :
                                    FileText;
  return (
    <div className="grid place-items-center w-10 h-10 rounded-lg bg-[var(--color-accent-soft)] text-[var(--color-accent)] flex-shrink-0">
      <Icon className="w-5 h-5" strokeWidth={2} aria-hidden="true" />
    </div>
  );
}