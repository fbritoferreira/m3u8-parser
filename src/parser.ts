import {
  Attributes,
  Options,
  Parameters,
  ParsedLine,
  Playlist,
  PlaylistHeader,
  PlaylistItem,
  PlaylistItemValidator,
} from "./types.ts";


/**
 * M3U8Parser
 * @class
 * @classdesc M3U8Parser class is responsible for parsing and filtering m3u8 playlists
 * @param {string} playlist - m3u8 playlist
 * @param {string} url - url to fetch m3u8 playlist
 * @example
 * const parser = new M3U8Parser({ playlist: "./playlist.m3u8" });
 * const parser = new M3U8Parser({ url: "http://example.com/playlist.m3u8" });
 * @returns {M3U8Parser}
 * @throws {Error} - if playlist is not valid
 * @throws {Error} - if failed to fetch playlist
 */
export class M3U8Parser {
  public rawPlaylist = "";
  public filteredMap: Map<string, Playlist> = new Map();

  public items: Map<number, PlaylistItem> = new Map();
  public header: PlaylistHeader = {} as PlaylistHeader;
  public groups: Set<string> = new Set();

  constructor({ playlist, url }: { playlist?: string; url?: string }) {
    if (playlist) {
      this.rawPlaylist = playlist;
      this.parse(playlist);
    }

    if (url) {
      this.fetchPlaylist({ url });
    }
  }

  private parse(raw: string): void {
    let i = 0;
    const lines = raw.split("\n").map(this.parseLine);
    const firstLine = lines.find((l) => l.index === 0);

    if (!firstLine || !/^#EXTM3U/.test(firstLine.raw)) {
      throw new Error("Playlist is not valid");
    }

    this.parseHeader(firstLine?.raw);

    for (const line of lines) {
      if (line.index === 0) continue;
      const string = line.raw.toString().trim();

      if (string.startsWith("#EXTINF:")) {
        this.items.set(i, this.handleEXTINF(line));
      } else if (string.startsWith("#EXTVLCOPT:")) {
        if (!this.items.get(i)) continue;
        this.handleEXTVLCOPT(string, i);
      } else if (string.startsWith("#EXTGRP:")) {
        if (!this.items.get(i)) continue;
        this.handleEXTGRP(string, i);
      } else {
        const item = this.items.get(i);
        if (!item) continue;
        const url = this.getUrl(string);
        const user_agent = this.getParameter(string, Parameters.USER_AGENT);
        const referrer = this.getParameter(string, Parameters.REFERER);
        this.groups.add(item.group.title);

        if (url) {
          this.items.set(
            i,
            PlaylistItemValidator.parse({
              ...item,
              url,
              http: {
                ...item.http,
                user_agent,
                referrer,
              },
              raw: this.mergeRaw(item, line),
            }),
          );
          i++;
        } else {
          this.items.set(
            i,
            PlaylistItemValidator.parse({
              ...item,
              raw: this.mergeRaw(item, line),
            }),
          );
        }
      }
    }
  }

  private mergeRaw(item: PlaylistItem, line: ParsedLine | string) {
    if (typeof line === "string") {
      return item?.raw ? item.raw.concat(`\n${line}`) : `${line}`;
    }

    return item?.raw ? item.raw.concat(`\n${line.raw}`) : `${line.raw}`;
  }

  parseLine(line: string, index: number): ParsedLine {
    return {
      index,
      raw: line,
    };
  }

  parseHeader(line: string) {
    const supportedAttrs = [Attributes.X_TVG_URL, Attributes.URL_TVG];
    const attrs = new Map();

    for (const attrName of supportedAttrs) {
      const tvgUrl = this.getAttribute(attrName, line);
      if (tvgUrl) {
        attrs.set(attrName, tvgUrl);
      }
    }

    this.header = {
      attrs: Object.fromEntries(attrs.entries()),
      raw: line,
    };
  }
  private handleEXTGRP(line: string, index: number) {
    const item = this.items.get(index);
    if (!item) {
      return;
    }

    this.items.set(
      index,
      PlaylistItemValidator.parse({
        ...item,
        group: {
          ...item.group,
          title: this.getValue(line) ?? item?.group.title,
        },
        raw: this.mergeRaw(item, line),
      }),
    );
  }

  private handleEXTVLCOPT(line: string, index: number) {
    const item = this.items.get(index);

    this.items.set(
      index,
      PlaylistItemValidator.parse({
        ...item,
        http: {
          ...item?.http,
          "user-agent": this.getOption(line, Options.HTTP_USER_AGENT) ??
            item?.http["user-agent"],
          referrer: this.getOption(line, Options.HTTP_REFERRER) ??
            item?.http.referrer,
        },
        raw: `\r\n${line}`,
      }),
    );
  }

  private handleEXTINF(line: ParsedLine): PlaylistItem {
    return PlaylistItemValidator.parse({
      name: this.getName(line.raw),
      tvg: {
        id: this.getAttribute(Attributes.TVG_ID, line.raw),
        name: this.getAttribute(Attributes.TVG_NAME, line.raw),
        logo: this.getAttribute(Attributes.TVG_LOGO, line.raw),
        url: this.getAttribute(Attributes.TVG_URL, line.raw),
        rec: this.getAttribute(Attributes.TVG_REC, line.raw),
      },
      group: {
        title: this.getAttribute(Attributes.GROUP_TITLE, line.raw),
      },
      http: {
        referrer: "",
        "user-agent": this.getAttribute(Attributes.USER_AGENT, line.raw),
      },
      url: undefined,
      raw: line.raw,
      index: line.index + 1,
      catchup: {
        type: this.getAttribute(Attributes.CATCHUP, line.raw),
        days: this.getAttribute(Attributes.CATCHUP_DAYS, line.raw),
        source: this.getAttribute(Attributes.CATCHUP_SOURCE, line.raw),
      },
      timeshift: this.getAttribute(Attributes.TIMESHIFT, line.raw),
    });
  }

  private getAttribute(name: Attributes, line: string) {
    const regex = new RegExp(name + '="(.*?)"', "gi");
    const match = regex.exec(line);

    return (match && match[1] ? match[1] : "")?.trimStart()?.trimEnd();
  }

  private getName(line: string) {
    const name = line?.split(/[\r\n]+/)?.shift()?.split(",")
      .pop()?.trimStart()?.trimEnd();
    return name || "";
  }

  private getOption(line: string, name: Options) {
    const regex = new RegExp(":" + name + "=(.*)", "gi");
    const match = regex.exec(line);

    return match && match[1] && typeof match[1] === "string"
      ? match[1].replace(/\"/g, "")
      : "";
  }
  private getValue(line: string) {
    const regex = new RegExp(":(.*)", "gi");
    const match = regex.exec(line);

    return match && match[1] && typeof match[1] === "string"
      ? match[1].replace(/\"/g, "")
      : "";
  }

  private getUrl(line: string) {
    return line.split("|")[0] || "";
  }

  private getParameter(line: string, name: Parameters) {
    const params = line.replace(/^(.*)\|/, "");
    const regex = new RegExp(name + "=(\\w[^&]*)", "gi");
    const match = regex.exec(params);

    return match && match[1] ? match[1] : "";
  }

  /**
   * getPlaylist
   * @description returns parsed playlist
   * @example
   * const playlist = parser.getPlaylist();
   * @returns {Playlist} - returns parsed playlist
   */
  public getPlaylist(): Playlist {
    return {
      header: this.header,
      items: Array.from(this.items.values()),
      raw: this.rawPlaylist,
    };
  }

  /**
   * getPlaylistByGroup
   * @description returns parsed playlist by group
   * @param {string} group - group name
   * @example
   * const playlist = parser.getPlaylistByGroup("group");
   * @returns {Playlist} - returns parsed playlist by group
   */
  public getPlaylistByGroup(group: string): Playlist {
    const key = group.split("").join("-");
    const cached = this.filteredMap.get(key);

    if (cached) {
      return cached;
    }

    const playlist = {
      header: this.header,
      items: this.getPlaylistItems(group),
    };

    this.filteredMap.set(key, playlist);

    return playlist;
  }

  private getPlaylistItems(group: string): PlaylistItem[] {
    return Array.from(this.items.values()).filter((item) =>
      item?.group?.title?.toLowerCase().startsWith(group.toLowerCase())
    );
  }

  /**
   * getPlaylistsByGroups
   * @description returns parsed playlist by groups
   * @param {string[]} groups - array of group names
   * @example
   * const playlist = parser.getPlaylistsByGroups(["group1", "group2"]);
   * @returns {Playlist} - returns parsed playlist by groups
   */
  public getPlaylistsByGroups(groups: string[]): Playlist {
    const key = groups.join("-");
    const cached = this.filteredMap.get(key);

    if (cached) {
      return cached;
    }

    const items = groups.reduce((acc: PlaylistItem[], group: string) => {
      const playlistItems = this.getPlaylistItems(group);

      return [
        ...acc,
        ...playlistItems,
      ];
    }, []);

    const playlist = {
      header: this.header,
      items,
    };

    this.filteredMap.set(key, playlist);

    return playlist;
  }

  /**
   * playlistGroups
   * @description returns array of group names
   * @example
   * const groups = parser.playlistGroups;
   * @returns {string[]} - returns array of group names
   */
  public get playlistGroups(): string[] {
    return Array.from(this.groups);
  }


  /**
   * write
   * @description returns stringified playlist
   * @example
   * const playlist = parser.write();
   * @returns {string} - returns stringified playlist
   */
  public write(): string {
    const playlist = this.getPlaylist();

    return `${playlist.header.raw}\n`.concat(
      `${playlist.items.map((item) => item.raw).join("\n")}`,
    );
  }
  /**
   * updateItems
   * @description Updates the playlist items
   * @param {Map<number, PlaylistItem>} items - map of playlist items
   * @example
   * parser.updateItems(new Map());
   * @returns {void}
   */
  public updateItems(items: Map<number, PlaylistItem>) {
    this.items = items;
  }

  /**
   * updatePlaylist
   * @description Updates the playlist
   * @param {Playlist} playlist - playlist
   * @example
   * parser.updatePlaylist({ header: {}, items: [] });
   * @returns {void}
   */
  public updatePlaylist(playlist: Playlist) {
    const items = new Map();
    let i = 0;

    if (playlist.items) {
      playlist.items.forEach((item) => {
        items.set(i, PlaylistItemValidator.parse(item));
        i++;
      });
    }

    this.items = items;
  }


  /**
   * fetchPlaylist
   * @description Fetches m3u8 playlist from url
   * @param {string} url - url to fetch m3u8 playlist
   * @example
   * parser.fetchPlaylist({ url: "http://example.com/playlist.m3u8" });
   * @returns {Promise<void>}
   * @throws {Error} - if failed to fetch playlist
   */
  public async fetchPlaylist({ url }: { url: string }) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch playlist: ${response.status}`);
    }

    const playlist = await response.text();
    this.rawPlaylist = playlist;
    this.parse(playlist);
  }

  /**
   * filterPlaylist
   * @description Filters the playlist by group
   * @param {string[]} filters - array of group names
   * @example
   * parser.filterPlaylist(["group1", "group2"]);
   * @returns {void}
   */
  public filterPlaylist(
    filters?: string[],
  ) {
    const groupsToFilter = filters?.map((filter) =>
      this.playlistGroups.filter((p) =>
        p.toLowerCase().startsWith(filter.toLowerCase())
      )
    ).flat();

    if (groupsToFilter) {
      const filteredItems = this.getPlaylistsByGroups(groupsToFilter);
      this.updatePlaylist(filteredItems);
    }
  }
}
