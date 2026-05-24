import { execFile } from 'child_process';
import { promises as fsp } from 'fs';
import path from 'path';
import { logger } from './logger.js';

/**
 * Resolved paths to external conversion tools.
 * Populated by initTools() at worker startup; null if not found.
 */
export const TOOLS = {
  imagemagick: null,
  ffmpeg: null,
  libreoffice: null,
};

const candidates = {
  imagemagick: [
    process.env.IMAGEMAGICK_PATH,
    'magick',          // ImageMagick v7 — preferred
    'convert',         // ImageMagick v6 — must validate (NOT Windows convert.exe!)
  ],
  ffmpeg: [
    process.env.FFMPEG_PATH,
    'ffmpeg',
  ],
  libreoffice: [
    process.env.LIBREOFFICE_PATH,
    'soffice',
    'libreoffice',
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  ],
};

/**
 * Markers each tool must print during --version. Protects against
 * look-alike binaries (notably Windows' built-in convert.exe).
 * Only applied when probing PATH-relative names — see detect() below.
 */
const expectedMarkers = {
  imagemagick: /imagemagick/i,
  ffmpeg: /ffmpeg/i,
  libreoffice: /libreoffice/i,
};

function tryCommand(cmd, args, marker) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 10_000, windowsHide: true }, (err, stdout, stderr) => {
      const output = `${stdout || ''}${stderr || ''}`;
      if (marker && !marker.test(output)) return resolve(false);
      if (!err) return resolve(true);
      if (output) return resolve(true);
      resolve(false);
    });
  });
}

async function fileExists(p) {
  try { await fsp.access(p); return true; } catch { return false; }
}

/**
 * Detection strategy:
 *
 *   - ABSOLUTE PATHS (env vars or hardcoded Windows fallbacks): trust file
 *     existence. soffice.exe on Windows doesn't reliably emit --version
 *     output when invoked via execFile (GUI-subsystem binary), so the
 *     marker check would give false negatives. If the user pointed us at
 *     a specific binary, that's an explicit opt-in.
 *
 *   - PATH-RELATIVE NAMES ('magick', 'convert', 'ffmpeg', 'soffice'): probe
 *     with --version AND require the expected marker in the output. This
 *     is what rejects Windows' convert.exe (FAT→NTFS tool) when it's first
 *     in PATH on a system without ImageMagick installed.
 */
async function detect(name, versionArgs) {
  const marker = expectedMarkers[name];
  for (const cmd of candidates[name]) {
    if (!cmd) continue;
    if (path.isAbsolute(cmd)) {
      if (await fileExists(cmd)) return cmd;
      continue;
    }
    if (await tryCommand(cmd, versionArgs, marker)) return cmd;
  }
  return null;
}

export async function initTools() {
  TOOLS.imagemagick = await detect('imagemagick', ['-version']);
  TOOLS.ffmpeg      = await detect('ffmpeg', ['-version']);
  TOOLS.libreoffice = await detect('libreoffice', ['--version']);

  const missing = Object.entries(TOOLS)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) {
    logger.warn('Some conversion tools were not found on PATH', {
      missing,
      hint: 'Set IMAGEMAGICK_PATH / FFMPEG_PATH / LIBREOFFICE_PATH in .env, or restart your shell after install.',
    });
  }
}