import type { CueProblem } from 'soundscape-engine';

/** Where a problem is: its cue, or its instrument, by the first two parts of its path. */
function placeOf(problem: CueProblem): string {
  const [section, name] = problem.path.split('.');
  if (section === 'cues' && name) return name;
  if (section === 'instruments' && name) return `instrument ${name}`;
  return 'the document';
}

/** How many problems one cue's notes have. */
export function problemsInCue(problems: CueProblem[], cue: string): number {
  return problems.filter((p) => placeOf(p) === cue).length;
}

/**
 * Why Play is off, naming where the problems are: loadCues refuses a document
 * with any problem, so one problem anywhere stops every cue. Null when valid.
 */
export function playOffReason(problems: CueProblem[]): string | null {
  if (problems.length === 0) return null;
  const places = [...new Set(problems.map(placeOf))];
  const count = problems.length === 1 ? '1 problem is' : `${problems.length} problems are`;
  return `Play is off until ${count} fixed, in ${places.join(', ')}.`;
}
