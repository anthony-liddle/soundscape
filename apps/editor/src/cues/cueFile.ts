import { serializeCueDocument } from 'soundscape-engine';
import type { CueDocument } from 'soundscape-engine';

/** Downloads the document in its canonical form, so an unchanged file saves as the same bytes. */
export function downloadCueDocument(doc: CueDocument, fileName: string): void {
  const blob = new Blob([serializeCueDocument(doc)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
