import { z } from "astro/zod";
import { defineCollection } from "astro:content";
import termSchema from "../data/term.schema.json";
import type { DictionaryCategory, DictionaryTerm } from "../data/types";
import { validateValue } from "../scripts/validate.mjs";
import { dictionaryLoader } from "./lib/content-loader";

// The public JSON Schema remains the single term contract. The loader reports
// detailed field errors; this schema also supplies Astro's typed query results.
const terms = defineCollection({
  loader: dictionaryLoader("terms"),
  schema: z.custom<DictionaryTerm>(
    (value) => validateValue(value, termSchema).length === 0,
  ),
});
const categories = defineCollection({
  loader: dictionaryLoader("categories"),
  schema: z.custom<DictionaryCategory>(),
});
export const collections = { terms, categories };
