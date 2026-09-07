// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://georgetrombley.com',
  trailingSlash: 'ignore',
  integrations: [
    sitemap({
      // Draft posts are filtered out of the routes themselves, but the news
      // and 404 routes carry no standalone value in a sitemap either.
      filter: (page) => !page.includes('/404'),
    }),
  ],
  image: {
    // Covers are the heaviest thing on the site; let Astro emit modern formats.
    responsiveStyles: true,
  },
  markdown: {
    shikiConfig: {
      theme: 'github-light',
      wrap: true,
    },
  },
  build: {
    // One stylesheet beats a waterfall of tiny ones for a site this size.
    inlineStylesheets: 'auto',
  },
});
