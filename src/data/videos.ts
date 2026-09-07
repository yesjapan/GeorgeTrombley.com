import raw from './videos.json';

/**
 * Typed entry point for the generated video list.
 *
 * videos.json is written by scripts/fetch-videos.mjs. Importing the JSON
 * directly gives you whatever TypeScript infers from the file's *current*
 * contents — which, while the list is empty, is `never[]`. Every property
 * access then fails to compile, and it would start compiling again only once
 * the first cron run happened to commit some data. Casting once, here, means
 * the shape is fixed by this file rather than by whatever YouTube last
 * returned.
 */
export interface Video {
  id: string;
  title: string;
  /** ISO 8601 */
  published: string;
  url: string;
  thumbnail: string;
  channelId: string;
  channelLabel: string;
}

export const videos = raw.videos as Video[];

/** ISO 8601 timestamp of the last successful refresh, or null before the first. */
export const videosUpdated = raw.updated as string | null;
