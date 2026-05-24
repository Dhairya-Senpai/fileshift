// Shared FFmpeg output parsers — used by both audio and video adapters.

/**
 * Pull "Duration: HH:MM:SS.xx" out of FFmpeg's probe-pass stderr.
 * Returns seconds (float) or null if not found.
 */
export function parseDurationSeconds(stderr) {
  const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) return null;
  return (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
}

/**
 * Parse a single line of `-progress pipe:1` output. FFmpeg emits key=value
 * lines like:
 *   out_time_ms=4100000
 *   frame=123
 *   speed=1.2x
 *   progress=continue
 *
 * Returns elapsed seconds for `out_time_ms` lines, null otherwise.
 */
export function parseProgressLine(line) {
  const m = line.match(/^out_time_ms=(\d+)/);
  if (!m) return null;
  return parseInt(m[1], 10) / 1_000_000;
}
