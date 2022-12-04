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

export class M3U8Parser {
  private rawPlaylist: string;
  private filteredMap: Map<string, Playlist> = new Map();

  private items: Map<number, PlaylistItem> = new Map();
  private header: PlaylistHeader = {} as PlaylistHeader;
  private groups: string[] = [];

  constructor(rawPlaylist: string) {
    this.rawPlaylist = rawPlaylist;
    this.parse(rawPlaylist);
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
      return item?.raw ? item.raw.concat(`\r\n${line}`) : `\r\n${line}`;
    }

    return item?.raw ? item.raw.concat(`\r\n${line.raw}`) : `\r\n${line.raw}`;
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

    const group = {
      ...item?.group,
      title: this.getValue(line) ?? item?.group.title,
    };

    this.groups.push(group.title);

    this.items.set(
      index,
      PlaylistItemValidator.parse({
        ...item,
        group: group,
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

  public getPlaylist(): Playlist {
    return {
      header: this.header,
      items: Array.from(this.items.values()),
      raw: this.rawPlaylist,
    };
  }

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

  public getPlaylistsByGroups(groups: string[]): Playlist {
    const key = groups.join("-");
    const cached = this.filteredMap.get(key);

    if (cached) {
      return cached;
    }

    const items = groups.reduce((acc, group) => {
      const items = this.getPlaylistItems(group);
      return {
        ...acc,
        items,
      };
    }, []);

    const playlist = {
      header: this.header,
      items,
    };

    this.filteredMap.set(key, playlist);

    return playlist;
  }

  public get playlistGroups() {
    return this.groups;
  }

  public write(playlist: Playlist): string {
    return `${playlist.header.raw}`.concat(
      `\r\n${playlist.items.map((item) => item.raw).join(`\r\n`)}`,
    );
  }

  public updateItems(items: Map<number, PlaylistItem>): void {
    this.items = items;
  }
}
