import assert from "node:assert/strict";
import test from "node:test";
import { loadDataset } from "../scripts/dataset.mjs";
import { validateDataset, validateValue } from "../scripts/validate.mjs";
import { utcDateKey, wordOfTheDay } from "../src/lib/daily.ts";
import {
  createIndex,
  normalize,
  readState,
  selectTerms,
  suggestTerms,
} from "../src/lib/search.ts";

const dataset = await loadDataset();
const index = createIndex(dataset.terms);
const byId = new Map(dataset.terms.map((term) => [term.id, term]));

test("the complete source dataset conforms to the schema and has valid relationships", async () => {
  assert.deepEqual(await validateDataset(dataset), []);
  assert.ok(dataset.terms.length >= 150);
  assert.equal(dataset.categories.length, 10);
});

test("exact terms and acronym aliases outrank incidental matches", () => {
  assert.equal(selectTerms(index, { query: "api" })[0].id, "api");
  assert.equal(
    selectTerms(index, { query: "AI" })[0].id,
    "artificial-intelligence",
  );
  assert.equal(selectTerms(index, { query: "LLM" })[0].id, "llm");
  assert.equal(
    selectTerms(index, { query: "application programming interface" })[0].id,
    "api",
  );
  assert.equal(
    selectTerms(index, { query: "  MaChInE LEARNING  " })[0].id,
    "machine-learning",
  );
});

test("search supports definitions, accents, and punctuation-normalized aliases", () => {
  assert.equal(normalize("Café—CACHE"), "cafe cache");
  assert.ok(
    selectTerms(index, { query: "tamper" }).some((t) => t.id === "tls"),
  );
  assert.equal(
    selectTerms(index, { query: "retrieval-augmented generation" })[0].id,
    "rag",
  );
});

test("category, level, and letter filters combine rather than replace one another", () => {
  const filtered = selectTerms(index, {
    category: "ai",
    level: "beginner",
    letter: "T",
  });
  assert.ok(filtered.length > 0);
  assert.ok(
    filtered.every(
      (term) =>
        term.category === "ai" &&
        term.level === "beginner" &&
        term.term.startsWith("T"),
    ),
  );
  assert.equal(
    selectTerms(index, {
      query: "API",
      category: "computer-basics",
      letter: "Z",
    }).length,
    0,
  );
});

test("sort controls produce stable alphabetic and learning-level orders", () => {
  const az = selectTerms(index);
  const za = selectTerms(index, { sort: "za" });
  assert.deepEqual(
    az.map((t) => t.id),
    za.map((t) => t.id).reverse(),
  );
  const ranked = selectTerms(index, { sort: "level" });
  const ranks = ranked.map((t) =>
    ["beginner", "intermediate", "advanced"].indexOf(t.level),
  );
  assert.deepEqual(
    ranks,
    [...ranks].sort((a, b) => a - b),
  );
});

test("spelling suggestions do not silently modify the query", () => {
  assert.ok(
    suggestTerms(index, "algoritm").some((term) => term.id === "algorithm"),
  );
  assert.deepEqual(selectTerms(index, { query: "zzzzzzzzzzzzzzzz" }), []);
  assert.deepEqual(suggestTerms(index, ""), []);
});

test("URL state rejects invalid filter values and caps search length", () => {
  const state = readState(
    new URLSearchParams({
      q: "a".repeat(500),
      category: "../../oops",
      level: "expert",
      letter: "<script>",
      sort: "broken",
    }),
    dataset.categories,
  );
  assert.equal(state.query.length, 200);
  assert.deepEqual(
    { ...state, query: "" },
    { query: "", category: "all", level: "all", letter: "all", sort: "az" },
  );
  assert.equal(
    readState(
      new URLSearchParams("category=ai&level=advanced&letter=T&sort=za"),
      dataset.categories,
    ).category,
    "ai",
  );
});

test("validation catches duplicate IDs, broken relations, and entries in the wrong category file", async () => {
  const bad = structuredClone(dataset);
  const item = bad.entries[0].value[0];
  const copy = {
    ...structuredClone(item),
    term: "Unique new label",
    category: "web",
    related: ["does-not-exist"],
  };
  bad.entries[0].value.push(copy);
  bad.terms.push(copy);
  const errors = await validateDataset(bad);
  assert.ok(errors.some((error) => error.includes("duplicate ID")));
  assert.ok(errors.some((error) => error.includes("belongs in")));
  assert.ok(errors.some((error) => error.includes("unknown related term")));
});

test("schema validation rejects unsafe source protocols, extra fields, and repeated aliases", () => {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      url: { type: "string", format: "uri", pattern: "^https://" },
      aliases: { type: "array", uniqueItems: true },
    },
  };
  const errors = validateValue(
    { url: "javascript:alert(1)", aliases: ["A", "A"], script: "bad" },
    schema,
  );
  assert.ok(errors.some((error) => error.includes("must match")));
  assert.ok(errors.some((error) => error.includes("unique")));
  assert.ok(errors.some((error) => error.includes("unknown field")));
});

test("the daily word is stable for a UTC day and independent of source order", () => {
  const morning = new Date("2026-10-07T00:01:00Z");
  const evening = new Date("2026-10-07T23:59:00Z");
  assert.equal(
    wordOfTheDay(dataset.terms, morning).id,
    wordOfTheDay([...dataset.terms].reverse(), evening).id,
  );
  assert.equal(utcDateKey(new Date("2026-10-08T02:30:00+03:30")), "2026-10-07");
  assert.ok(byId.has(wordOfTheDay(dataset.terms, morning).id));
  assert.equal(wordOfTheDay([], morning), null);
});

test("the daily selection changes across dates without changing the source array", () => {
  const ids = dataset.terms.map((term) => term.id);
  const selected = new Set(
    Array.from(
      { length: 10 },
      (_, i) =>
        wordOfTheDay(dataset.terms, new Date(Date.UTC(2026, 9, i + 1))).id,
    ),
  );
  assert.ok(selected.size > 1);
  assert.deepEqual(
    dataset.terms.map((term) => term.id),
    ids,
  );
});
