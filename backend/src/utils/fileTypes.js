// Format registry. Single source of truth for what FileShift accepts.
// Workers (Phase 2) will key off `getCategory()` to pick the right adapter.

export const CATEGORY = {
  IMAGE: 'image',
  DOCUMENT: 'document',
  SPREADSHEET: 'spreadsheet',
  PRESENTATION: 'presentation',
  AUDIO: 'audio',
  VIDEO: 'video',
  ARCHIVE: 'archive',
  EBOOK: 'ebook',
};

export const FORMATS = {
  [CATEGORY.IMAGE]: {
    extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff', 'avif', 'heic', 'svg'],
  },
  [CATEGORY.DOCUMENT]: {
    extensions: ['pdf', 'docx', 'doc', 'odt', 'rtf', 'txt', 'html', 'md'],
  },
  [CATEGORY.SPREADSHEET]: {
    extensions: ['xlsx', 'xls', 'ods', 'csv', 'tsv'],
  },
  [CATEGORY.PRESENTATION]: {
    extensions: ['pptx', 'ppt', 'odp'],
  },
  [CATEGORY.AUDIO]: {
    extensions: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'opus'],
  },
  [CATEGORY.VIDEO]: {
    extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv', 'm4v'],
  },
  [CATEGORY.ARCHIVE]: {
    extensions: ['zip', 'tar', 'gz', 'bz2', '7z'],
  },
  [CATEGORY.EBOOK]: {
    extensions: ['epub', 'mobi', 'azw3', 'fb2'],
  },
};

// Reverse lookup: extension -> category
const extToCategory = new Map();
for (const [cat, def] of Object.entries(FORMATS)) {
  for (const ext of def.extensions) extToCategory.set(ext.toLowerCase(), cat);
}

export function getCategory(ext) {
  return extToCategory.get(String(ext).toLowerCase()) || null;
}

export function isSupportedExtension(ext) {
  return extToCategory.has(String(ext).toLowerCase());
}

/**
 * We only allow conversions WITHIN a category (e.g. png↔jpg, mp4↔webm,
 * docx↔pdf). Cross-category conversions like mp4→pdf are blocked — they're
 * either nonsense or imply chaining adapters, which is a security surface
 * we don't want by default.
 */
export function canConvert(sourceExt, targetExt) {
  const s = getCategory(sourceExt);
  const t = getCategory(targetExt);
  return !!s && s === t;
}

/**
 * Clean a user-supplied target extension. Strips dots, non-alphanumerics,
 * and rejects anything not in our allow-list. NEVER use the raw input as
 * part of a filename or shell argument.
 */
export function sanitizeTargetExtension(ext) {
  if (typeof ext !== 'string') return null;
  const clean = ext.toLowerCase().replace(/^\./, '').replace(/[^a-z0-9]/g, '');
  return isSupportedExtension(clean) ? clean : null;
}

// Text-y formats won't be detected by magic bytes — accept those by extension.
export const TEXT_EXTENSIONS = new Set(['txt', 'md', 'csv', 'tsv', 'html', 'svg']);
