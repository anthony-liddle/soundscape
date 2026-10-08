// The pass rule, shared by bar.mjs and judge.mjs: the ways a spread between a
// reference and a render breaks a bar, in words, and none for a pass.
const EPSILON = 1e-9;

export function breaks(spread, bar) {
  const out = [];
  const db = Math.max(spread.db, spread.windowDbfs);
  if (spread.seconds > bar.seconds + EPSILON) out.push(`${(spread.seconds * 1000).toFixed(2)} ms`);
  if (db > bar.db + EPSILON) out.push(`${db.toFixed(2)} dB`);
  if (spread.hz > bar.hz + EPSILON) out.push(`${spread.hz.toFixed(2)} Hz`);
  if (spread.partialHz > bar.partialHz + EPSILON) out.push(`a partial ${spread.partialHz.toFixed(2)} Hz off`);
  if (spread.partialDb > bar.partialDb + EPSILON) out.push(`a partial ${spread.partialDb.toFixed(2)} dB off`);
  if (spread.membershipChanges) out.push(`${spread.membershipChanges} partials gained or lost`);
  if (spread.strongestChanges) out.push(`${spread.strongestChanges} windows' strongest changed`);
  return out;
}

/** The single largest gap of a spread, for a table cell, in the bar's units. */
export function worstGap(spread, bar) {
  const ratios = [
    ['seconds', spread.seconds / bar.seconds, `${(spread.seconds * 1000).toFixed(2)} ms`],
    ['db', Math.max(spread.db, spread.windowDbfs) / bar.db, `${Math.max(spread.db, spread.windowDbfs).toFixed(2)} dB`],
    ['hz', spread.hz / bar.hz, `${spread.hz.toFixed(2)} Hz`],
    ['partialHz', spread.partialHz / bar.partialHz, `partial ${spread.partialHz.toFixed(2)} Hz`],
    ['partialDb', spread.partialDb / bar.partialDb, `partial ${spread.partialDb.toFixed(2)} dB`],
  ];
  ratios.sort((a, b) => b[1] - a[1]);
  if (ratios[0][1] === 0) return { ratio: 0, text: 'no gap' };
  return { ratio: ratios[0][1], text: ratios[0][2] };
}
