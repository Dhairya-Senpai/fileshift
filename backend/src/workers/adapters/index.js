import { CATEGORY } from '../../utils/fileTypes.js';
import { imageAdapter } from './image.js';
import { officeAdapter } from './office.js';
import { audioAdapter } from './audio.js';
import { videoAdapter } from './video.js';
import { unsupportedAdapter } from './unsupported.js';

/**
 * Map: file category -> adapter that handles it.
 *
 * Office documents, spreadsheets, and presentations all share the LibreOffice
 * adapter — it routes the right way internally based on input/output extension.
 */
export const adapters = {
  [CATEGORY.IMAGE]:        imageAdapter,
  [CATEGORY.DOCUMENT]:     officeAdapter,
  [CATEGORY.SPREADSHEET]:  officeAdapter,
  [CATEGORY.PRESENTATION]: officeAdapter,
  [CATEGORY.AUDIO]:        audioAdapter,
  [CATEGORY.VIDEO]:        videoAdapter,
  [CATEGORY.ARCHIVE]:      unsupportedAdapter('archive'),
  [CATEGORY.EBOOK]:        unsupportedAdapter('ebook'),
};

export function getAdapter(category) {
  return adapters[category] || null;
}
