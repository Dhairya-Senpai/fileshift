import { ChevronDown } from 'lucide-react';
import { getTargetFormats } from '../lib/formats.js';

/**
 * Native <select> styled to match the design. Native is correct here:
 *   - Best mobile UX (system picker on iOS/Android)
 *   - Free a11y (keyboard, screen reader)
 *   - Tiny bundle impact (no JS dropdown lib)
 */
export default function FormatPicker({ sourceExt, value, onChange, disabled }) {
  const options = getTargetFormats(sourceExt);

  return (
    <div className="relative inline-block">
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || options.length === 0}
        className="appearance-none bg-[var(--color-surface)] border border-[var(--color-line-strong)] rounded-lg pl-3 pr-9 py-1.5 text-sm font-mono text-[var(--color-ink)] hover:border-[var(--color-accent)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        aria-label={`Convert to format`}
      >
        {options.length === 0 ? (
          <option value="">—</option>
        ) : (
          options.map((opt) => (
            <option key={opt} value={opt}>.{opt}</option>
          ))
        )}
      </select>
      <ChevronDown
        className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--color-ink-faint)]"
        aria-hidden="true"
      />
    </div>
  );
}