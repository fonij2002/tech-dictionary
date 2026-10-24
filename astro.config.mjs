import { defineConfig } from "astro/config";
import config from "./site.config.json" with { type: "json" };

const site = new URL(
  process.env.SITE_URL ||
    config.siteUrl ||
    "https://fonij2002.github.io/tech-dictionary/",
);
if (
  !["http:", "https:"].includes(site.protocol) ||
  site.search ||
  site.hash ||
  site.username ||
  site.password
) {
  throw new Error(
    "SITE_URL must be an HTTP(S) site URL without credentials, query, or hash.",
  );
}

export default defineConfig({
  site: site.origin,
  base: site.pathname.replace(/\/$/, "") || "/",
  output: "static",
  // The catch-all data route also serves files such as data/v1/terms.json.
  // Requiring a slash makes those extensionless route patterns return 404 in dev.
  // HTML links still use directory URLs; data files keep their normal filenames.
  trailingSlash: "ignore",
  build: { format: "directory" },
});
