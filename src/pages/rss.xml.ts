import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';
import { site } from '../data/site';

export async function GET(context: APIContext) {
  const posts = (await getCollection('posts'))
    .filter((p) => !p.data.draft)
    .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());

  return rss({
    title: `${site.name} — Writing`,
    description:
      'Essays by George Trombley — short, irregular, and mostly about the things he notices rather than the things he knows.',
    // context.site comes from `site` in astro.config.mjs.
    site: context.site ?? site.url,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.date,
      // Always the copy on this site, even for imported posts. Someone who
      // subscribes to georgetrombley.com/rss.xml should land on
      // georgetrombley.com — sending every item off to Substack would defeat
      // the point of the site hosting the writing. SEO de-duplication is the
      // job of the <link rel="canonical"> tag on the post page, not of this
      // feed.
      link: `/writing/${post.id}`,
      categories: post.data.tags,
    })),
    customData: '<language>en-us</language>',
  });
}
