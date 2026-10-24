import type { APIRoute } from 'astro';
import { getDictionary } from '../lib/dictionary';
import { withBase } from '../lib/urls';

export const GET: APIRoute = async ({ site }) => {
  const { terms } = await getDictionary();
  const paths = [
    '',
    'browse/',
    'contribute/',
    'data/',
    ...terms.map((term) => `terms/${term.id}/`),
  ];
  const xml = paths
    .map(
      (path) =>
        `<url><loc>${new URL(withBase(path), site).href.replace(/&/g, '&amp;')}</loc></url>`,
    )
    .join('');
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${xml}</urlset>`,
    { headers: { 'Content-Type': 'application/xml' } },
  );
};
