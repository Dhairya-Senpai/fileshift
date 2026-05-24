import { useCallback, useRef, useState } from 'react';
import { UploadCloud, FileWarning } from 'lucide-react';
import clsx from 'clsx';
import { ACCEPT_ATTRIBUTE, getExtension, isSupportedExtension } from '../lib/formats.js';

/**
 * Drag-drop + click/tap-to-open file picker.
 *
 * Mobile considerations:
 *  - The hidden file input is wired to a button label, so taps anywhere on
 *    the zone open the native picker. Drag-drop is a no-op on mobile but
 *    doesn't get in the way.
 *  - Touch target is generously sized — Apple's HIG calls for ≥44pt.
 *  - File type validation happens client-side as a fast first pass.
 *    Backend still does magic-byte verification — defense in depth.
 */
export default function Dropzone({ onFilesAdded, maxFileSizeBytes }) {
  const [isDragging, setIsDragging] = useState(false);
  const [rejected, setRejected] = useState([]);
  const inputRef = useRef(null);

  const handleFiles = useCallback((files) => {
    const list = Array.from(files);
    const accepted = [];
    const reasons = [];

    for (const file of list) {
      const ext = getExtension(file.name);
      if (!ext) {
        reasons.push(`${file.name}: no extension`);
        continue;
      }
      if (!isSupportedExtension(ext)) {
        reasons.push(`${file.name}: unsupported .${ext}`);
        continue;
      }
      if (maxFileSizeBytes && file.size > maxFileSizeBytes) {
        reasons.push(`${file.name}: too large`);
        continue;
      }
      accepted.push(file);
    }

    setRejected(reasons);
    if (accepted.length) onFilesAdded(accepted);
  }, [onFilesAdded, maxFileSizeBytes]);

  const onDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const onDragLeave = (e) => {
    // dragleave fires when entering child elements — only clear when truly leaving.
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setIsDragging(false);
  };
  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
  };
  const onChange = (e) => {
    if (e.target.files?.length) handleFiles(e.target.files);
    // Reset so picking the same file twice still triggers onChange.
    e.target.value = '';
  };

  return (
    <div>
      <label
        htmlFor="file-input"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={clsx(
          'relative flex flex-col items-center justify-center gap-3',
          'rounded-2xl border-2 border-dashed p-8 sm:p-12 cursor-pointer transition-all',
          'min-h-[180px] sm:min-h-[220px]',
          isDragging
            ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] scale-[1.01]'
            : 'border-[var(--color-line-strong)] bg-[var(--color-surface)] hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]/50',
        )}
      >
        <div className={clsx(
          'grid place-items-center w-14 h-14 rounded-full transition-colors',
          isDragging
            ? 'bg-[var(--color-accent)] text-white'
            : 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]',
        )}>
          <UploadCloud className="w-7 h-7" strokeWidth={2} aria-hidden="true" />
        </div>
        <div className="text-center">
          <p className="font-medium text-[var(--color-ink)]">
            {isDragging ? 'Drop to add files' : 'Drop files here or tap to browse'}
          </p>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Images, documents, audio, video — up to 500 MB each
          </p>
        </div>
        <input
          id="file-input"
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
          onChange={onChange}
          className="sr-only"
        />
      </label>

      {rejected.length > 0 && (
        <div
          role="alert"
          className="mt-3 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)] flex gap-2 items-start"
        >
          <FileWarning className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <ul className="space-y-0.5 min-w-0 break-words">
            {rejected.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}