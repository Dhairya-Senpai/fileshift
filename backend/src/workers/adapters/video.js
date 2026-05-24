import { runCommand } from '../../utils/exec.js';
import { TOOLS } from '../../utils/tools.js';
import { config } from '../../config/index.js';
import { parseDurationSeconds, parseProgressLine } from './ffmpegUtils.js';

export const videoAdapter = {
  name: 'ffmpeg-video',
  async convert({ inputPath, outputPath, onProgress }) {
    if (!TOOLS.ffmpeg) {
      throw new Error('FFmpeg is not installed or not on PATH.');
    }

    await onProgress(5);

    // Duration probe so we can report meaningful progress on long encodes.
    let durationSec = null;
    try {
      const { stderr } = await runCommand(TOOLS.ffmpeg, [
        '-i', inputPath,
        '-hide_banner',
        '-f', 'null', '-',
      ], { timeoutMs: 30_000 });
      durationSec = parseDurationSeconds(stderr);
    } catch { /* probe failures are OK */ }

    // No explicit codec — let FFmpeg pick defaults based on output container.
    // For Phase 2.5 we can add codec-selection logic per target ext.
    await runCommand(TOOLS.ffmpeg, [
      '-y',
      '-hide_banner',
      '-nostats',
      '-i', inputPath,
      '-progress', 'pipe:1',
      outputPath,
    ], {
      timeoutMs: config.job.timeoutMs,
      onStdoutLine: (line) => {
        if (!durationSec) return;
        const elapsed = parseProgressLine(line);
        if (elapsed !== null) {
          const pct = Math.min(95, Math.max(5, Math.round((elapsed / durationSec) * 95)));
          onProgress(pct).catch(() => {});
        }
      },
    });

    await onProgress(100);
  },
};
