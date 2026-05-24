import { Shuffle } from 'lucide-react';

export default function Header() {
  return (
    <header className="border-b border-[var(--color-line)] bg-[var(--color-surface)]">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-4 flex items-center gap-3">
        <div className="grid place-items-center w-9 h-9 rounded-lg bg-[var(--color-accent)] text-white shadow-sm">
          <Shuffle className="w-5 h-5" strokeWidth={2.5} aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-[var(--color-ink)]">
            FileShift
          </h1>
          <p className="text-xs sm:text-sm text-[var(--color-ink-muted)] -mt-0.5">
            Universal file conversion — your files never leave the server
          </p>
        </div>
      </div>
    </header>
  );
}