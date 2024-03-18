import { z } from "npm:zod";

export interface PlaylistHeader {
  attrs: {
    "x-tvg-url": string;
  };
  raw: string;
}

export type PlaylistItemTvg = {
  id: string;
  name: string;
  url: string;
  logo: string;
  rec: string;
}

export const PlaylistItemTvgValidator: z.Schema<PlaylistItemTvg> = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  logo: z.string(),
  rec: z.string(),
});

// export type PlaylistItemTvg = z.infer<typeof PlaylistItemTvgValidator>;

export type PlaylistItem = {
  name: string;
  index: number;
  tvg: PlaylistItemTvg;
  group: {
    title: string;
  };
  http: {
    referrer: string;
    "user-agent": string;
  };
  url?: string;
  raw: string;
  timeshift: string;
  catchup: {
    type: string;
    source: string;
    days: string;
  };

}

export const PlaylistItemValidator: z.Schema<PlaylistItem> = z.object({
  name: z.string(),
  index: z.number(),
  tvg: PlaylistItemTvgValidator,
  group: z.object({
    title: z.string(),
  }),
  http: z.object({
    referrer: z.string(),
    "user-agent": z.string(),
  }),
  url: z.string().optional(),
  raw: z.string(),
  timeshift: z.string(),
  catchup: z.object({
    type: z.string(),
    source: z.string(),
    days: z.string(),
  }),
});


export interface Playlist {
  header: PlaylistHeader;
  items: PlaylistItem[];
  raw?: string;
}

export type ParsedLine = {
  index: number;
  raw: string;
};

export enum Attributes {
  TVG_ID = "tvg-id",
  X_TVG_URL = "x-tvg-url",
  URL_TVG = "url-tvg",
  TVG_NAME = "tvg-name",
  TVG_LOGO = "tvg-logo",
  TVG_URL = "tvg-url",
  TVG_REC = "tvg-rec",
  GROUP_TITLE = "group-title",
  USER_AGENT = "user-agent",
  CATCHUP = "catchup",
  CATCHUP_DAYS = "catchup-days",
  CATCHUP_SOURCE = "catchup-source",
  TIMESHIFT = "timeshift",
}

export enum Options {
  HTTP_REFERRER = "http-referrer",
  HTTP_USER_AGENT = "http-user-agent",
}

export enum Parameters {
  USER_AGENT = "user-agent",
  REFERER = "referer",
}
