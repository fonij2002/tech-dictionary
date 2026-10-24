import type { APIRoute, GetStaticPaths } from "astro";
import termSchema from "../../../data/term.schema.json";
import types from "../../../data/types.ts?raw";
import { getDictionary } from "../../lib/dictionary";

export const getStaticPaths: GetStaticPaths = async () => {
  const dataset = await getDictionary();
  const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
  const outputs = [
    { path: "terms.json", body: json(dataset.terms), type: "application/json" },
    {
      path: "categories.json",
      body: json(dataset.categories),
      type: "application/json",
    },
    { path: "v1/terms.json", body: json(dataset), type: "application/json" },
    {
      path: "term.schema.json",
      body: json(termSchema),
      type: "application/json",
    },
    { path: "types.ts", body: types, type: "text/plain" },
  ];
  return outputs.map((output) => ({
    params: { path: output.path },
    props: output,
  }));
};

export const GET: APIRoute = ({ props }) =>
  new Response(props.body, {
    headers: { "Content-Type": `${props.type}; charset=utf-8` },
  });
