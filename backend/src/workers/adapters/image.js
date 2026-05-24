import { runCommand } from '../../utils/exec.js';
import { TOOLS } from '../../utils/tools.js';
import { config } from '../../config/index.js';

/**
 * ImageMagick adapter. Handles all image-category conversions.
 *
 * Security notes:
 *  - inputPath and outputPath are absolute paths to UUID.ext filenames we
 *    generated — no user-controlled characters, no risk of `|cmd` injection
 *    via the historical ImageMagick filename-as-command vulnerability.
 *  - Hardcoded timeout — runaway operations (huge TIFFs, recursive SVG bombs)
 *    get killed.
 *  - Note: PDF-related ImageMagick conversions require relaxing /etc/ImageMagick-*
 *    /policy.xml; we deliberately don't include PDF in the image category for that
 *    reason. PDFs go through LibreOffice instead.
 */
export const imageAdapter = {
  name: 'imagemagick',
  async convert({ inputPath, outputPath, onProgress }) {
    if (!TOOLS.imagemagick) {
      throw new Error('ImageMagick is not installed or not on PATH.');
    }

    await onProgress(10);

    // Single invocation: `magick input output` (v7) or `convert input output` (v6).
    // Both binaries accept this same simple syntax.
    await runCommand(TOOLS.imagemagick, [inputPath, outputPath], {
      timeoutMs: config.job.timeoutMs,
    });

    await onProgress(100);
  },
};
