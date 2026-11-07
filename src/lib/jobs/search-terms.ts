/**
 * Pick `per` search terms from many users' lists: the most shared first, and
 * on later rounds the next batch, so everyone's terms get a turn.
 */
export function searchTerms(lists: string[][], per: number, round: number) {
  const freq = new Map<string, { term: string; n: number }>();
  for (const list of lists) {
    const mine = new Map(list.map((t) => t.trim()).filter(Boolean).map((t) => [t.toLowerCase(), t]));
    for (const [k, term] of mine) {
      const e = freq.get(k) ?? { term, n: 0 };
      e.n += 1;
      freq.set(k, e);
    }
  }
  const all = [...freq.values()].sort((a, b) => b.n - a.n || a.term.localeCompare(b.term)).map((e) => e.term);
  if (all.length <= per) return all;
  const start = (round * per) % all.length;
  return [...all, ...all].slice(start, start + per);
}
