import type { DictionaryTerm, DictionaryCategory, LearningLevel } from '../../data/types';

export interface SearchState {
  query: string;
  category: string;
  level: LearningLevel | 'all';
  letter: string;
  sort: 'az' | 'za' | 'level';
}
interface IndexedTerm {
  term: DictionaryTerm;
  name: string;
  aliases: string[];
  text: string;
}

export const levels: LearningLevel[] = ['beginner', 'intermediate', 'advanced'];
export const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

export function normalize(value: string = '') {
  return String(value)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function createIndex(terms: DictionaryTerm[]): IndexedTerm[] {
  return terms.map((term) => ({
    term,
    name: normalize(term.term),
    aliases: term.aliases.map(normalize),
    text: normalize(
      [term.term, ...term.aliases, ...term.tags, term.definition, term.analogy, term.example].join(
        ' ',
      ),
    ),
  }));
}

export function selectTerms(
  index: IndexedTerm[],
  {
    query = '',
    category = 'all',
    level = 'all',
    letter = 'all',
    sort = 'az',
  }: Partial<SearchState> = {},
) {
  const q = normalize(query);
  const words = q.split(' ').filter(Boolean);
  return index
    .filter(
      ({ term, name, text }) =>
        (category === 'all' || term.category === category) &&
        (level === 'all' || term.level === level) &&
        (letter === 'all' || name.startsWith(letter.toLowerCase())) &&
        words.every((word) => text.includes(word)),
    )
    .map((item) => {
      let score = 0;
      if (q) {
        score =
          item.name === q
            ? 100
            : item.aliases.includes(q)
              ? 90
              : item.name.startsWith(q)
                ? 75
                : item.aliases.some((a) => a.startsWith(q))
                  ? 65
                  : item.name.includes(q)
                    ? 55
                    : item.aliases.some((a) => a.includes(q))
                      ? 45
                      : 10;
      }
      return { ...item, score };
    })
    .sort((a, b) => {
      if (q && a.score !== b.score) return b.score - a.score;
      if (sort === 'level') {
        const difference = levels.indexOf(a.term.level) - levels.indexOf(b.term.level);
        if (difference) return difference;
      }
      return collator.compare(a.term.term, b.term.term) * (sort === 'za' ? -1 : 1);
    })
    .map(({ term }) => term);
}

// Only suggest spelling corrections; do not silently change the user's query.
function distance(a: string, b: string) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}

export function suggestTerms(index: IndexedTerm[], query: string) {
  const q = normalize(query).slice(0, 60);
  if (q.length < 3) return [];
  return index
    .map(({ term, name, aliases }) => ({
      term,
      distance: Math.min(
        ...[name, ...aliases].map((candidate) => distance(q, candidate.slice(0, 100))),
      ),
    }))
    .filter((x) => x.distance <= (q.length > 6 ? 2 : 1))
    .sort((a, b) => a.distance - b.distance || collator.compare(a.term.term, b.term.term))
    .slice(0, 3)
    .map((x) => x.term);
}

export function readState(params: URLSearchParams, categories: DictionaryCategory[]): SearchState {
  const cat = params.get('category');
  const level = params.get('level');
  const letter = params.get('letter');
  const sort = params.get('sort');
  return {
    query: (params.get('q') ?? '').slice(0, 200),
    category: cat && categories.some((c) => c.id === cat) ? cat : 'all',
    level: levels.includes(level as LearningLevel) ? (level as LearningLevel) : 'all',
    letter: letter && /^[A-Z]$/.test(letter) ? letter : 'all',
    sort: sort === 'az' || sort === 'za' || sort === 'level' ? sort : 'az',
  };
}
