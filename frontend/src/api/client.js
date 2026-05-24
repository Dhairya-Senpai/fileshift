// Tiny API client. Uses relative URLs so Vite's dev proxy handles
// localhost:4000, and production deployments can serve frontend+backend
// behind the same host with no code changes.

const BASE = '/api';

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function readError(res) {
  try {
    const body = await res.json();
    return body?.error || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

/**
 * Upload a file for conversion.
 *
 * Why XMLHttpRequest and not fetch? Because fetch() doesn't expose upload
 * progress events. For multi-megabyte files we want the "uploading" %
 * bar to actually move — that requires xhr.upload.onprogress.
 */
export function uploadFile({ file, target, onProgress, signal }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);
    formData.append('target', target);

    xhr.open('POST', `${BASE}/upload`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      let body;
      try { body = JSON.parse(xhr.responseText); } catch { body = null; }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body);
      } else {
        reject(new ApiError(body?.error || `Upload failed (HTTP ${xhr.status})`, xhr.status));
      }
    };

    xhr.onerror = () => reject(new ApiError('Network error during upload', 0));
    xhr.onabort = () => reject(new ApiError('Upload cancelled', 0));

    // AbortController support — lets users cancel an in-flight upload.
    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        return;
      }
      signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }

    xhr.send(formData);
  });
}

export async function getJob(jobId) {
  const res = await fetch(`${BASE}/jobs/${encodeURIComponent(jobId)}`);
  if (!res.ok) throw new ApiError(await readError(res), res.status);
  return res.json();
}

// Build a download URL from a token. Returned as a string so the caller
// can use it in an <a href> for a real browser-triggered download.
export function downloadUrl(token) {
  return `${BASE}/download/${encodeURIComponent(token)}`;
}

export { ApiError };