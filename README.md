# m3u8 playlist parser

## Examples

### Filtered Playlist

```ts
const manifest = await Deno.readTextFile("playlist.m3u");
const m3u8Parser = new M3U8Parser(manifest);
const UK = m3u8Parser.getPlaylistByGroup("UK");
await Deno.writeTextFile("test.m3u", m3u8Parser.write(UK));
```
