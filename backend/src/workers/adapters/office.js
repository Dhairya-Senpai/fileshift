import path from 'path';
import fs from 'fs/promises';
import { pathToFileURL } from 'url';
import { v4 as uuidv4 } from 'uuid';

import { runCommand } from '../../utils/exec.js';
import { TOOLS } from '../../utils/tools.js';
import { config } from '../../config/index.js';

/**
 * LibreOffice headless adapter — covers documents, spreadsheets, presentations.
 *
 * The two non-obvious things:
 *
 *  1. LibreOffice writes output as `<inputBasename>.<targetExt>` into --outdir.
 *     We can't tell it our desired output filename, so we use a workdir,
 *     find the produced file, and rename it to outputPath.
 *
 *  2. LibreOffice has ONE user profile per install. If two `soffice` processes
 *     start concurrently with the same profile, the second silently attaches
 *     to the first and the conversion fails. We pass a unique
 *     `-env:UserInstallation` per invocation to give each job its own profile.
 *     This is the single most important detail for running >1 worker.
 */
export const officeAdapter = {
  name: 'libreoffice',
  async convert({ inputPath, outputPath, targetExt, onProgress }) {
    if (!TOOLS.libreoffice) {
      throw new Error('LibreOffice is not installed or not on PATH.');
    }

    // Per-job working dir, on the same filesystem as outputsDir so the final
    // rename is atomic (no cross-device EXDEV errors on Windows with project
    // on D: and tmp on C:).
    const workdir = path.join(config.storage.workDir, `office-${uuidv4()}`);
    const profileDir = path.join(workdir, 'profile');
    await fs.mkdir(profileDir, { recursive: true });

    try {
      await onProgress(10);

      // pathToFileURL produces correct file:/// URLs on both POSIX and Windows.
      const profileUrl = pathToFileURL(profileDir).href;

      await runCommand(TOOLS.libreoffice, [
        `-env:UserInstallation=${profileUrl}`,
        '--headless',
        '--norestore',
        '--nolockcheck',
        '--nodefault',
        '--nofirststartwizard',
        '--convert-to', targetExt,
        '--outdir', workdir,
        inputPath,
      ], {
        timeoutMs: config.job.timeoutMs,
      });

      await onProgress(85);

      // Find LibreOffice's output: <workdir>/<inputBase>.<targetExt>
      const inputBase = path.basename(inputPath, path.extname(inputPath));
      const loOutputPath = path.join(workdir, `${inputBase}.${targetExt}`);

      const stat = await fs.stat(loOutputPath).catch(() => null);
      if (!stat || stat.size === 0) {
        throw new Error('LibreOffice produced no output (check formats are compatible).');
      }

      // Atomic rename within the same filesystem.
      await fs.rename(loOutputPath, outputPath);

      await onProgress(100);
    } finally {
      // Always clean up workdir + profile, even on failure.
      await fs.rm(workdir, { recursive: true, force: true }).catch(() => {});
    }
  },
};
