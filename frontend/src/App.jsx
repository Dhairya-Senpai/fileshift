import { useCallback, useState } from 'react';
import Header from './components/Header.jsx';
import Dropzone from './components/Dropzone.jsx';
import JobList from './components/JobList.jsx';
import { getExtension, getDefaultTarget } from './lib/formats.js';

// Backend's max file size mirror — protects the user from a wasted upload
// of a too-large file. Backend enforces the real limit; this is just UX.
const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024;

let nextId = 1;
const makeId = () => `e${nextId++}`;

/**
 * Single source of truth for the file queue. Each entry tracks:
 *   id          local UI key
 *   file        the File object the browser gave us
 *   sourceExt   derived from filename, lowercased
 *   targetExt   user-selectable; defaulted from category
 *   status      'pending' | 'uploading' | 'queued' | 'active' | 'completed' | 'failed'
 *   jobId       set once /api/upload succeeds (server-side BullMQ id)
 *   progress    0-100 from server polling
 *   uploadPct   handled inside JobCard via xhr.upload progress
 *   downloadToken / outputSize / error  populated on completion / failure
 */
export default function App() {
  const [entries, setEntries] = useState([]);

  const addFiles = useCallback((files) => {
    setEntries((prev) => {
      const additions = files.map((file) => {
        const sourceExt = getExtension(file.name);
        return {
          id: makeId(),
          file,
          sourceExt,
          targetExt: getDefaultTarget(sourceExt),
          status: 'pending',
          progress: 0,
        };
      });
      return [...prev, ...additions];
    });
  }, []);

  const updateEntry = useCallback((id, patch) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, []);

  const removeEntry = useCallback((id) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const startEntry = useCallback((id) => {
    setEntries((prev) => prev.map((e) =>
      e.id === id && e.status === 'pending' && e.targetExt
        ? { ...e, status: 'uploading' }
        : e,
    ));
  }, []);

  const startAll = useCallback(() => {
    setEntries((prev) => prev.map((e) =>
      e.status === 'pending' && e.targetExt
        ? { ...e, status: 'uploading' }
        : e,
    ));
  }, []);

  const clearCompleted = useCallback(() => {
    setEntries((prev) => prev.filter((e) => e.status !== 'completed' && e.status !== 'failed'));
  }, []);

  return (
    <div className="min-h-full flex flex-col">
      <Header />
      <main className="flex-1 mx-auto w-full max-w-3xl px-4 sm:px-6 py-6 sm:py-10">
        <Dropzone onFilesAdded={addFiles} maxFileSizeBytes={MAX_FILE_SIZE_BYTES} />
        <JobList
          entries={entries}
          onUpdate={updateEntry}
          onRemove={removeEntry}
          onStart={startEntry}
          onStartAll={startAll}
          onClearCompleted={clearCompleted}
        />
      </main>
      <footer className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-6 text-center text-xs text-[var(--color-ink-faint)]">
        Self-hosted conversion · No third-party APIs
      </footer>
    </div>
  );
}