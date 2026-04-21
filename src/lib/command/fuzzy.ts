/**
 * Subsequence-based fuzzy match. Returns a numeric score where higher is a
 * better match, or `null` when `query` is not a subsequence of `title`.
 *
 * Ranking rules:
 * - Empty query matches everything with a neutral score of 0.
 * - Earlier matches score higher (first-match position is penalized).
 * - Contiguous matches score higher (gaps between matched chars are penalized).
 * - Matches on word boundaries (start, after space/-/_//) get a small bonus.
 */
export function score(query: string, title: string): number | null {
  if (query.length === 0) return 0;

  const q = query.toLowerCase();
  const t = title.toLowerCase();

  const positions: number[] = [];
  let ti = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi];
    let found = -1;
    while (ti < t.length) {
      if (t[ti] === ch) {
        found = ti;
        ti++;
        break;
      }
      ti++;
    }
    if (found === -1) return null;
    positions.push(found);
  }

  let s = -positions[0];
  for (let i = 1; i < positions.length; i++) {
    const gap = positions[i] - positions[i - 1] - 1;
    s -= gap;
  }

  for (const pos of positions) {
    if (pos === 0) {
      s += 5;
      continue;
    }
    const prev = title[pos - 1];
    if (prev === ' ' || prev === '-' || prev === '_' || prev === '/') s += 2;
  }

  return s;
}
