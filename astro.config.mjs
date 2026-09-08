// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import remarkChat from './src/lib/remark-chat.mjs';

// https://astro.build/config
export default defineConfig({
  site: 'https://georgetrombley.com',
  trailingSlash: 'ignore',
  integrations: [
    sitemap({
      // Draft posts are filtered out of the routes themselves, but the news
      // and 404 routes carry no standalone value in a sitemap either.
      // Sample chapters are noindex; listing them in the sitemap would send a
      // mixed signal. /fiction/ itself stays.
      filter: (page) => !page.includes('/404') && !/\/fiction\/[^/]+\/?$/.test(page),
    }),
  ],
  image: {
    // Covers are the heaviest thing on the site; let Astro emit modern formats.
    responsiveStyles: true,
  },
  markdown: {
    // Turns ```chat fences into the book's text-message blocks.
    remarkPlugins: [remarkChat],
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
