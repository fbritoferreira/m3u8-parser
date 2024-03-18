import { PlaylistItem } from "./types.ts";
import { M3U8Parser } from "./parser.ts";
import { assertEquals } from "@std/assert";
import * as mf from "mock_fetch/mod.ts";

const sharedPlaylist = `#EXTM3U
#EXTINF:-1 tvg-id="ABC" group-title="News" tvg-logo="http://example.com/logo.png", News Channel
http://example.com/news.m3u8
#EXTINF:-1 tvg-id="DEF" group-title="Sports" tvg-logo="http://example.com/logo.png", Sports Channel
http://example.com/sports.m3u8`;

Deno.test("M3U8Parser parses an M3U8 playlist correctly", () => {
  const parser = new M3U8Parser({
    playlist: sharedPlaylist,
  });

  const expected = {
    header: {
      attrs: {},
      raw: "#EXTM3U",
    },
    groups: new Set(["News", "Sports"]),
    items: new Map([
      [
        0,
        {
          "name": "News Channel",
          "index": 2,
          "tvg": {
            "id": "ABC",
            "name": "",
            "url": "",
            "logo": "http://example.com/logo.png",
            "rec": "",
          },
          "group": {
            "title": "News",
          },
          "http": {
            "referrer": "",
            "user-agent": "",
          },
          "url": "http://example.com/news.m3u8",
          "raw":
            '#EXTINF:-1 tvg-id="ABC" group-title="News" tvg-logo="http://example.com/logo.png", News Channel\nhttp://example.com/news.m3u8',
          "timeshift": "",
          "catchup": {
            "type": "",
            "source": "",
            "days": "",
          },
        } satisfies PlaylistItem,
      ],
      [
        1,
        {
          "name": "Sports Channel",
          "index": 4,
          "tvg": {
            "id": "DEF",
            "name": "",
            "url": "",
            "logo": "http://example.com/logo.png",
            "rec": "",
          },
          "group": {
            "title": "Sports",
          },
          "http": {
            "referrer": "",
            "user-agent": "",
          },
          "url": "http://example.com/sports.m3u8",
          "raw":
            '#EXTINF:-1 tvg-id="DEF" group-title="Sports" tvg-logo="http://example.com/logo.png", Sports Channel\nhttp://example.com/sports.m3u8',
          "timeshift": "",
          "catchup": {
            "type": "",
            "source": "",
            "days": "",
          },
        } satisfies PlaylistItem,
      ],
    ]),
  };

  assertEquals(parser.header, expected.header);
  assertEquals(parser.groups, expected.groups);
  assertEquals(parser.items, expected.items);
});

Deno.test("fetchPlaylist should fetch and parse a playlist", async () => {
  const playlistContent = `#EXTM3U
      #EXTINF:-1 tvg-id="abc" tvg-name="ABC" tvg-logo="abc.png" group-title="News",ABC News
      http://example.com/abc
      #EXTINF:-1 tvg-id="def" tvg-name="DEF" tvg-logo="def.png" group-title="News",DEF News
      http://example.com/def`;

  mf.install();
  mf.mock(`GET@/:playlist/playlist.m3u`, () => {
    return new Response(playlistContent, {
      status: 200,
    });
  });

  const parser = new M3U8Parser({ playlist: "" });
  await parser.fetchPlaylist({ url: `https://example.com/test/playlist.m3u` });
  const playlist: PlaylistItem[] = Array.from(parser.items, (entry) => {
    return entry[1] satisfies PlaylistItem;
  });
  mf.uninstall();

  assertEquals(parser.rawPlaylist, playlistContent);

  assertEquals(playlist.length, 2);
  assertEquals(playlist[0].name, "ABC News");
  assertEquals(playlist[0].url, "http://example.com/abc");
  assertEquals(playlist[1].name, "DEF News");
  assertEquals(playlist[1].url, "http://example.com/def");
});

Deno.test("Playlist write method", () => {
  const playlist = new M3U8Parser({ playlist: sharedPlaylist });
  const actualOutput = playlist.write();

  assertEquals(actualOutput, sharedPlaylist);
});

Deno.test("filterPlaylist filters playlist by group", () => {
  const playlist = new M3U8Parser({ playlist: sharedPlaylist });

  playlist.filterPlaylist(["sports"]);

  assertEquals(
    playlist.write(),
    `#EXTM3U
#EXTINF:-1 tvg-id="DEF" group-title="Sports" tvg-logo="http://example.com/logo.png", Sports Channel
http://example.com/sports.m3u8`,
  );
});
