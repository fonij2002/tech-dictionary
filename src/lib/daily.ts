import type { DictionaryTerm } from '../../data/types';

export function utcDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}
// Global daily selection, independent of filters, device timezone, and input order.
export function wordOfTheDay(terms: DictionaryTerm[], date = new Date()) {
  if (!terms.length) return null;
  const ordered = [...terms].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  let hash = 2166136261;
  for (const character of utcDateKey(date))
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  return ordered[hash % ordered.length];
}
