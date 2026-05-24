import { spawn } from 'child_process';

/**
 * Error thrown by runCommand. Captures exit code & last bit of stderr
 * for actionable error messages without leaking entire stack traces.
 */
export class CommandError extends Error {
  constructor(message, { code, stdout, stderr } = {}) {
    super(message);
    this.name = 'CommandError';
    this.code = code;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}

/**
 * Run a command safely.
 *
 *   - `shell: false` — never expand metacharacters. User-controlled args
 *     (extensions) are already sanitized, but this is belt-and-braces.
 *   - Hard timeout, then SIGKILL. Default 60s; pass timeoutMs for longer jobs.
 *   - Per-line callbacks so adapters can parse FFmpeg's `-progress` output.
 *
 * @param {string}   command       Absolute path or PATH-resolvable command
 * @param {string[]} args          Array — NEVER concatenate user input into one string
 * @param {object}   options
 * @param {number}   options.timeoutMs   Kill after this many ms (default 60_000)
 * @param {function} options.onStdoutLine (line) => void
 * @param {function} options.onStderrLine (line) => void
 * @param {object}   options.env   Extra env vars merged with process.env
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
export function runCommand(command, args, options = {}) {
  const {
    timeoutMs = 60_000,
    onStdoutLine,
    onStderrLine,
    env,
  } = options;

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let stdoutBuf = '';
    let stderrBuf = '';

    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      env: env ? { ...process.env, ...env } : process.env,
    });

    const timer = setTimeout(() => {
      timedOut = true;
      // SIGKILL because SIGTERM may be ignored by stuck child processes
      // (LibreOffice in particular is known to hang).
      try { child.kill('SIGKILL'); } catch { /* already dead */ }
    }, timeoutMs);

    child.stdout?.on('data', (chunk) => {
      const s = chunk.toString();
      stdout += s;
      if (onStdoutLine) {
        stdoutBuf += s;
        const lines = stdoutBuf.split(/\r?\n/);
        stdoutBuf = lines.pop() ?? '';
        for (const line of lines) onStdoutLine(line);
      }
    });

    child.stderr?.on('data', (chunk) => {
      const s = chunk.toString();
      stderr += s;
      if (onStderrLine) {
        stderrBuf += s;
        const lines = stderrBuf.split(/\r?\n/);
        stderrBuf = lines.pop() ?? '';
        for (const line of lines) onStderrLine(line);
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new CommandError(`Failed to start "${command}": ${err.message}`, {
        code: 'SPAWN_FAILED', stdout, stderr,
      }));
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        return reject(new CommandError(
          `Command "${command}" timed out after ${timeoutMs}ms`,
          { code: 'TIMEOUT', stdout, stderr },
        ));
      }
      if (code !== 0) {
        // Slice the tail of stderr — full output goes to logger, not the error.
        return reject(new CommandError(
          `Command "${command}" exited with code ${code}. ${stderr.slice(-400).trim()}`,
          { code, stdout, stderr },
        ));
      }
      resolve({ stdout, stderr });
    });
  });
}
