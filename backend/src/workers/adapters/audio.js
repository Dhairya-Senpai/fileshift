import { runCommand } from '../../utils/exec.js';
import { TOOLS } from '../../utils/tools.js';
import { config } from '../../config/index.js';
import { parseDurationSeconds, parseProgressLine } from './ffmpegUtils.js';

export const audioAdapter = {
  name: 'ffmpeg-audio',
  async convert({ inputPath, outputPath, onProgress }) {
    if (!TOOLS.ffmpeg) {
      throw new Error('FFmpeg is not installed or not on PATH.');
    }

    await onProgress(5);

    // Probe duration up front so we can compute live percentage during encode.
    // Probe failure isn't fatal — we just won't have granular progress.
    let durationSec = null;
    try {
      const { stderr } = await runCommand(TOOLS.ffmpeg, [
        '-i', inputPath,
        '-hide_banner',
        '-f', 'null', '-',
      ], { timeoutMs: 30_000 });
      durationSec = parseDurationSeconds(stderr);
    } catch {
      // Some inputs make ffmpeg exit non-zero on the probe pass — that's fine,
      // we still got the duration in stderr if it was readable.
    }

    await runCommand(TOOLS.ffmpeg, [
      '-y',                       // overwrite output without prompting
      '-hide_banner',
      '-nostats',                 // suppress default stderr noise
      '-i', inputPath,
      '-progress', 'pipe:1',      // structured progress to stdout
      '-vn',                      // no video stream
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
