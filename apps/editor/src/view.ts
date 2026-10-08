import type { View } from './components/ViewSwitch';

/** The view named by the page's query string: `?view=cues`, or the song. */
export function viewFromSearch(search: string): View {
  return new URLSearchParams(search).get('view') === 'cues' ? 'cues' : 'song';
}

/**
 * Writes the view into the address, keeping any other parameters, so a reload
 * comes back to it. It replaces the history entry rather than adding one.
 */
export function writeViewToAddress(view: View): void {
  const url = new URL(window.location.href);
  if (view === 'cues') url.searchParams.set('view', 'cues');
  else url.searchParams.delete('view');
  window.history.replaceState(window.history.state, '', url);
}
