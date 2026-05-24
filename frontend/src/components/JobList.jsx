import { Play, Trash2 } from 'lucide-react';
import JobCard from './JobCard.jsx';

/**
 * Renders the list of files + batch actions. Pure presentational — all state
 * mutation goes through the callbacks owned by App.
 */
export default function JobList({ entries, onUpdate, onRemove, onStart, onStartAll, onClearCompleted }) {
  if (entries.length === 0) return null;

  const hasPending = entries.some((e) => e.status === 'pending');
  const hasCompleted = entries.some((e) => e.status === 'completed' || e.status === 'failed');

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-[var(--color-ink)]">
          {entries.length} {entries.length === 1 ? 'file' : 'files'}
        </h2>
        <div className="flex gap-2">
          {hasCompleted && (
            <button
              onClick={onClearCompleted}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-line)] transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              Clear done
            </button>
          )}
          {hasPending && (
            <button
              onClick={onStartAll}
              className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] transition-colors"
            >
              <Play className="w-3.5 h-3.5" aria-hidden="true" />
              Convert all
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {entries.map((entry) => (
          <JobCard
            key={entry.id}
            entry={entry}
            onUpdate={onUpdate}
            onRemove={onRemove}
            onStart={onStart}
          />
        ))}
      </div>
    </section>
  );
}