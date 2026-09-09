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
  /** The channel's own page on YouTube. */
  channelUrl?: string;
}

/** All videos, newest first, across every channel. */
export const videos = raw.videos as Video[];

/** ISO 8601 timestamp of the last successful refresh, or null before the first. */
export const videosUpdated = raw.updated as string | null;

export interface Channel {
  id: string;
  label: string;
  url: string;
  /** This channel's videos, newest first. */
  videos: Video[];
}

/**
 * The videos grouped by channel, channels ordered by their most recent upload.
 *
 * With several channels feeding one list, a merged feed is dominated by
 * whichever posts most; grouping gives every channel its own row, and putting
 * the most recently active first keeps the page feeling current at the top.
 */
export function channels(): Channel[] {
  const byId = new Map<string, Channel>();
  for (const v of videos) {
    let c = byId.get(v.channelId);
    if (!c) {
      c = {
        id: v.channelId,
        label: v.channelLabel,
        url: v.channelUrl ?? `https://www.youtube.com/channel/${v.channelId}`,
        videos: [],
      };
      byId.set(v.channelId, c);
    }
    c.videos.push(v);
  }
  for (const c of byId.values()) {
    c.videos.sort((a, b) => Date.parse(b.published) - Date.parse(a.published));
  }
  return [...byId.values()].sort(
    (a, b) => Date.parse(b.videos[0].published) - Date.parse(a.videos[0].published),
  );
}

/**
 * The newest video from each of the n most recently active channels.
 *
 * "The n newest videos" sounds right for a home-page strip but is not: one
 * channel that uploads daily fills every slot, and a visitor sees one channel
 * where there are eight. One per channel shows the breadth.
 */
export function latestPerChannel(n: number): Video[] {
  return channels()
    .slice(0, n)
    .map((c) => c.videos[0]);
}
