import Modal from 'bootstrap/js/dist/modal';
import type { DictionaryDataset, DictionaryTerm, DictionaryCategory } from '../../data/types';
import {
  createIndex,
  selectTerms,
  suggestTerms,
  readState,
  normalize,
  type SearchState,
} from '../lib/search';
import { wordOfTheDay, utcDateKey } from '../lib/daily';
import { copyTermLink } from './copy';

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing dictionary element: ${id}`);
  return found as T;
}
function clone<T extends HTMLElement = HTMLElement>(id: string): T {
  return (element<HTMLTemplateElement>(id).content.firstElementChild as T).cloneNode(true) as T;
}
function fill(scope: ParentNode, name: string, text: string) {
  const field = scope.querySelector<HTMLElement>(`[data-field="${name}"]`);
  if (field) field.textContent = text;
}

const root = document.querySelector<HTMLElement>('[data-dictionary]')!;
const rootURL = new URL(root.dataset.base!, location.origin);
const search = element<HTMLInputElement>('search');
const grid = element('term-grid');
const modalElement = element('term-modal');
const modal = new Modal(modalElement);
// Match Bootstrap's md breakpoint; use real links on smaller viewports.
const desktopView = window.matchMedia('(min-width: 768px)');
const cards = new Map(
  [...grid.querySelectorAll<HTMLAnchorElement>('a[data-term]')].map((card) => [
    card.dataset.term!,
    card,
  ]),
);
let dataset: DictionaryDataset;
let index: ReturnType<typeof createIndex>;
let byId: Map<string, DictionaryTerm>;
let catById: Map<string, DictionaryCategory>;
let state: SearchState;
let activeTerm: string | null = null;
let returnFocus: HTMLElement | null = null;
let suppressCloseURL = false;
let eventsBound = false;
let searchTimer: ReturnType<typeof setTimeout>;
let dailyTimer: ReturnType<typeof setTimeout>;
let dailyKey = '';

function writeURL(push = false) {
  const url = new URL(location.href);
  for (const key of ['q', 'category', 'level', 'letter', 'sort', 'term'])
    url.searchParams.delete(key);
  if (state.query.trim()) url.searchParams.set('q', state.query.trim());
  for (const key of ['category', 'level', 'letter'] as const)
    if (state[key] !== 'all') url.searchParams.set(key, state[key]);
  if (state.sort !== 'az') url.searchParams.set('sort', state.sort);
  if (activeTerm) url.searchParams.set('term', activeTerm);
  if (url.href !== location.href) history[push ? 'pushState' : 'replaceState'](null, '', url);
}

function termAnchor(term: DictionaryTerm) {
  const link = clone<HTMLAnchorElement>('related-template');
  link.href = new URL(`terms/${term.id}/`, rootURL).href;
  link.dataset.term = term.id;
  link.textContent = term.term;
  return link;
}

function renderChips() {
  const labels = new Map<keyof SearchState, string>();
  if (state.query.trim()) labels.set('query', `Search: ${state.query.trim()}`);
  if (state.category !== 'all') labels.set('category', catById.get(state.category)!.name);
  if (state.level !== 'all') labels.set('level', state.level);
  if (state.letter !== 'all') labels.set('letter', `Starts with ${state.letter}`);
  const chips = [...labels].map(([key, label]) => {
    const chip = clone<HTMLButtonElement>('filter-template');
    chip.dataset.clear = key;
    chip.querySelector('[data-label]')!.textContent = label;
    chip.setAttribute('aria-label', `Remove filter: ${label}`);
    return chip;
  });
  element('active-filters').replaceChildren(...chips);
  element('active-filters').hidden = !chips.length;
}

function applyState(updateURL = true) {
  const results = selectTerms(index, state);
  search.value = state.query;
  element('clear-search').hidden = !state.query;
  element<HTMLSelectElement>('level').value = state.level;
  element<HTMLSelectElement>('sort').value = state.sort;
  document.querySelectorAll<HTMLButtonElement>('[data-category]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.category === state.category));
  });
  const available = new Set(
    selectTerms(index, { ...state, query: '', letter: 'all' }).map((term) =>
      normalize(term.term)[0]?.toUpperCase(),
    ),
  );
  document.querySelectorAll<HTMLButtonElement>('[data-letter]').forEach((button) => {
    const letter = button.dataset.letter!;
    button.setAttribute('aria-pressed', String(letter === state.letter));
    button.disabled = letter !== 'all' && letter !== state.letter && !available.has(letter);
  });
  const visible = new Set(results.map((term) => term.id));
  cards.forEach((card, id) => {
    card.hidden = !visible.has(id);
  });
  results.forEach((term, i) => {
    const card = cards.get(term.id)!;
    card.querySelector('[data-card-number]')!.textContent = String(i + 1).padStart(3, '0');
    grid.append(card);
  });
  element('result-count').textContent = String(results.length);
  element('results-label').textContent =
    state.category === 'all' ? 'All terms' : catById.get(state.category)!.shortName;
  const summary = `Showing ${results.length} of ${dataset.terms.length} terms`;
  // This visible counter is optional; compact layouts keep only the live announcement.
  const shownCount = document.getElementById('shown-count');
  if (shownCount) shownCount.textContent = summary;
  element('search-announcement').textContent = summary;
  element('empty-state').hidden = Boolean(results.length);
  element('empty-message').textContent = state.query
    ? 'Try another spelling or clear a filter.'
    : 'Try a different topic, letter, or learning level.';
  element('suggestions').replaceChildren(
    ...(!results.length ? suggestTerms(index, state.query).map(termAnchor) : []),
  );
  renderChips();
  if (updateURL) writeURL();
}

function openTerm(id: string, trigger?: HTMLElement, push = true) {
  const term = byId.get(id);
  if (!term) return;
  if (!desktopView.matches) {
    // Also handle shared ?term= URLs and history without a mobile modal.
    window.location.replace(new URL(`terms/${term.id}/`, rootURL).href);
    return;
  }
  const wasOpen = activeTerm !== null;
  if (!wasOpen) returnFocus = trigger || search;
  const detail = clone('detail-template');
  for (const name of ['term', 'definition', 'analogy', 'example', 'caveat'] as const)
    fill(detail, name, term[name]);
  const category = catById.get(term.category)!;
  fill(detail, 'category', category.shortName);
  const tag = detail.querySelector<HTMLElement>('[data-field="category"]')!;
  tag.className = `category-tag color-${category.color}`;
  fill(detail, 'level', term.level[0].toUpperCase() + term.level.slice(1));
  fill(detail, 'aliases', term.aliases.join(' · '));
  detail.querySelector<HTMLElement>('[data-section="aliases"]')!.hidden = !term.aliases.length;
  detail.querySelector<HTMLElement>('[data-section="caveat"]')!.hidden = !term.caveat;
  detail.querySelector<HTMLElement>('[data-section="related"]')!.hidden = !term.related.length;
  detail
    .querySelector('[data-field="related"]')!
    .replaceChildren(...term.related.map((related) => termAnchor(byId.get(related)!)));
  detail.querySelector('[data-field="sources"]')!.replaceChildren(
    ...term.sources.map((source) => {
      const item = clone<HTMLLIElement>('source-template');
      item.querySelector('a')!.href = source.url;
      item.querySelector('[data-source-title]')!.textContent = source.title;
      return item;
    }),
  );
  detail.querySelector<HTMLAnchorElement>('[data-field="edit"]')!.href =
    `${root.dataset.repository}/edit/${encodeURIComponent(root.dataset.branch!)}/data/terms/${term.category}.yaml`;
  const copy = detail.querySelector<HTMLButtonElement>('[data-copy-term]')!;
  copy.dataset.copyTerm = term.id;
  copy.hidden = false;
  element('modal-detail').replaceChildren(detail);
  activeTerm = id;
  writeURL(push);
  modal.show();
  element('modal-detail').scrollTop = 0;
  if (wasOpen) modalElement.querySelector<HTMLButtonElement>('.btn-close')!.focus();
}

function updateDailyWord() {
  const now = new Date();
  if (utcDateKey(now) !== dailyKey) {
    const term = wordOfTheDay(dataset.terms, now)!;
    const link = element<HTMLAnchorElement>('word-of-day');
    link.dataset.term = term.id;
    link.href = new URL(`terms/${term.id}/`, rootURL).href;
    link.setAttribute('aria-label', `Word of the day: ${term.term}. Open definition.`);
    element('daily-term').textContent = term.term;
    dailyKey = utcDateKey(now);
  }
  clearTimeout(dailyTimer);
  dailyTimer = setTimeout(
    updateDailyWord,
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime() + 100,
  );
}

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;
  element('search-form').addEventListener('submit', (event) => {
    event.preventDefault();
    clearTimeout(searchTimer);
    state.query = search.value;
    applyState();
  });
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query = search.value;
      applyState();
    }, 100);
  });
  element('clear-search').addEventListener('click', () => {
    clearTimeout(searchTimer);
    state.query = '';
    applyState();
    search.focus();
  });
  element('reset-filters').addEventListener('click', () => {
    clearTimeout(searchTimer);
    state = readState(new URLSearchParams(), dataset.categories);
    applyState();
    search.focus();
  });
  element<HTMLSelectElement>('level').addEventListener('change', (event) => {
    state.level = (event.target as HTMLSelectElement).value as SearchState['level'];
    applyState();
  });
  element<HTMLSelectElement>('sort').addEventListener('change', (event) => {
    state.sort = (event.target as HTMLSelectElement).value as SearchState['sort'];
    applyState();
  });
  document.addEventListener('click', (event) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      !(event.target instanceof Element)
    )
      return;
    const link = event.target.closest<HTMLAnchorElement>('a[data-term]');
    if (link && byId.has(link.dataset.term!)) {
      if (!desktopView.matches) return;
      event.preventDefault();
      openTerm(link.dataset.term!, link);
      return;
    }
    const category = event.target.closest<HTMLButtonElement>('[data-category]');
    const letter = event.target.closest<HTMLButtonElement>('[data-letter]');
    const query = event.target.closest<HTMLButtonElement>('[data-query]');
    const chip = event.target.closest<HTMLButtonElement>('[data-clear]');
    const copy = event.target.closest<HTMLButtonElement>('[data-copy-term]');
    if (copy) {
      copyTermLink(copy, rootURL);
      return;
    }
    if (category || letter || query || chip) {
      clearTimeout(searchTimer);
      state.query = search.value;
      if (category) {
        state.category = category.dataset.category!;
        state.letter = 'all';
      }
      if (letter) state.letter = letter.dataset.letter!;
      if (query) state.query = query.dataset.query!;
      if (chip) {
        const key = chip.dataset.clear;
        if (key === 'query') state.query = '';
        else if (key === 'category' || key === 'letter' || key === 'level') state[key] = 'all';
      }
      applyState();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (
      event.key === '/' &&
      !activeTerm &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      event.target instanceof Element &&
      !event.target.closest('input,textarea,select,[contenteditable]')
    ) {
      event.preventDefault();
      search.focus();
    }
  });
  modalElement.addEventListener('shown.bs.modal', () =>
    modalElement.querySelector<HTMLButtonElement>('.btn-close')!.focus(),
  );
  modalElement.addEventListener('hidden.bs.modal', () => {
    activeTerm = null;
    if (!suppressCloseURL) writeURL();
    suppressCloseURL = false;
    (returnFocus?.isConnected ? returnFocus : search).focus();
    returnFocus = null;
  });
  window.addEventListener('popstate', () => {
    clearTimeout(searchTimer);
    state = readState(new URLSearchParams(location.search), dataset.categories);
    applyState(false);
    const id = new URLSearchParams(location.search).get('term');
    if (id && byId.has(id)) openTerm(id, undefined, false);
    else if (activeTerm) {
      suppressCloseURL = true;
      modal.hide();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) updateDailyWord();
  });
}

async function init() {
  element('retry-load').hidden = true;
  try {
    const response = await fetch(new URL('data/v1/terms.json', rootURL));
    if (!response.ok)
      throw new Error(`Cannot load search data: HTTP ${response.status} at ${response.url}`);
    dataset = await response.json();
    index = createIndex(dataset.terms);
    byId = new Map(dataset.terms.map((term) => [term.id, term]));
    catById = new Map(dataset.categories.map((category) => [category.id, category]));
    state = readState(new URLSearchParams(location.search), dataset.categories);
    document
      .querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>('[data-enhance]')
      .forEach((control) => {
        control.disabled = false;
      });
    bindEvents();
    applyState(false);
    updateDailyWord();
    element('load-status').hidden = true;
    const id = new URLSearchParams(location.search).get('term');
    if (id && byId.has(id)) openTerm(id, undefined, false);
  } catch (error) {
    console.error('Dictionary initialization failed:', error);
    element('load-status').firstChild!.textContent =
      'Search could not load. You can still open every definition below. ';
    element('retry-load').hidden = false;
  }
}
element('retry-load').addEventListener('click', init);
init();
