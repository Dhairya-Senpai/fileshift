// Tiny formatting helpers shared across UI components.

export function formatBytes(bytes) {
  if (bytes == null || isNaN(bytes)) return '—';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const v = bytes / Math.pow(1024, i);
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

// Truncate a filename keeping its extension visible.
// "very-long-filename-here.docx" -> "very-long-fi…here.docx"
export function truncateFilename(name, maxLen = 32) {
  if (typeof name !== 'string' || name.length <= maxLen) return name;
  const dot = name.lastIndexOf('.');
  if (dot === -1) return name.slice(0, maxLen - 1) + '…';
  const ext = name.slice(dot);
  const stem = name.slice(0, dot);
  const keep = maxLen - ext.length - 1;
  if (keep < 4) return name.slice(0, maxLen - 1) + '…';
  return stem.slice(0, Math.ceil(keep / 2)) + '…' + stem.slice(-Math.floor(keep / 2)) + ext;
}