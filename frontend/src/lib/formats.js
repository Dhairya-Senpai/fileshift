// Mirror of backend's format registry. Keeps in sync manually for now —
// a /api/formats endpoint would be cleaner if formats start changing often.

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
  [CATEGORY.IMAGE]:        ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff', 'avif', 'heic', 'svg'],
  [CATEGORY.DOCUMENT]:     ['pdf', 'docx', 'doc', 'odt', 'rtf', 'txt', 'html', 'md'],
  [CATEGORY.SPREADSHEET]:  ['xlsx', 'xls', 'ods', 'csv', 'tsv'],
  [CATEGORY.PRESENTATION]: ['pptx', 'ppt', 'odp'],
  [CATEGORY.AUDIO]:        ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'opus'],
  [CATEGORY.VIDEO]:        ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv', 'm4v'],
  [CATEGORY.ARCHIVE]:      ['zip', 'tar', 'gz', 'bz2', '7z'],
  [CATEGORY.EBOOK]:        ['epub', 'mobi', 'azw3', 'fb2'],
};

// extension -> category lookup
const extToCategory = new Map();
for (const [cat, exts] of Object.entries(FORMATS)) {
  for (const ext of exts) extToCategory.set(ext.toLowerCase(), cat);
}

export function getExtension(filename) {
  if (typeof filename !== 'string') return '';
  const i = filename.lastIndexOf('.');
  return i >= 0 ? filename.slice(i + 1).toLowerCase() : '';
}

export function getCategory(ext) {
  return extToCategory.get(String(ext).toLowerCase()) || null;
}

export function isSupportedExtension(ext) {
  return extToCategory.has(String(ext).toLowerCase());
}

// All valid target formats for a given source extension —
// same category, minus the source format itself.
export function getTargetFormats(sourceExt) {
  const cat = getCategory(sourceExt);
  if (!cat) return [];
  return FORMATS[cat].filter((e) => e !== sourceExt.toLowerCase());
}

// Default target for newly-added files. Picks a sensible "popular" target
// per category — better UX than alphabetically-first.
const DEFAULT_TARGETS = {
  [CATEGORY.IMAGE]: 'png',
  [CATEGORY.DOCUMENT]: 'pdf',
  [CATEGORY.SPREADSHEET]: 'csv',
  [CATEGORY.PRESENTATION]: 'pdf',
  [CATEGORY.AUDIO]: 'mp3',
  [CATEGORY.VIDEO]: 'mp4',
  [CATEGORY.ARCHIVE]: 'zip',
  [CATEGORY.EBOOK]: 'epub',
};

export function getDefaultTarget(sourceExt) {
  const cat = getCategory(sourceExt);
  if (!cat) return null;
  const preferred = DEFAULT_TARGETS[cat];
  // If the source IS the default (e.g. PNG image), pick the second-best option.
  if (preferred === sourceExt.toLowerCase()) {
    const targets = getTargetFormats(sourceExt);
    return targets[0] || null;
  }
  return preferred;
}

// All accepted extensions for the file input's `accept` attribute.
export const ACCEPTED_EXTENSIONS = Object.values(FORMATS).flat();
export const ACCEPT_ATTRIBUTE = ACCEPTED_EXTENSIONS.map((e) => `.${e}`).join(',');