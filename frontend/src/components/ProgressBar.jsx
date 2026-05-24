import clsx from 'clsx';

export default function ProgressBar({ value = 0, variant = 'accent', indeterminate = false }) {
  const pct = Math.max(0, Math.min(100, value));
  const fillColor =
    variant === 'success' ? 'bg-[var(--color-success)]' :
    variant === 'danger'  ? 'bg-[var(--color-danger)]'  :
                            'bg-[var(--color-accent)]';

  return (
    <div
      role="progressbar"
      aria-valuenow={indeterminate ? undefined : pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className="w-full h-1.5 rounded-full bg-[var(--color-line)] overflow-hidden"
    >
      <div
        className={clsx(
          'h-full rounded-full transition-[width] duration-300 ease-out',
          fillColor,
          indeterminate && 'animate-pulse',
        )}
        style={{ width: indeterminate ? '40%' : `${pct}%` }}
      />
    </div>
  );
}