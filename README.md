# SpiceCloud

> SoundCloud inside Spotify — a [Spicetify](https://spicetify.app) custom app that brings full SoundCloud playback into Spotify's desktop client.

---

## Features

- **Full playback** — play SoundCloud tracks through Spotify's native now-playing bar (title, artist, artwork, progress bar, volume, skip controls)
- **Search integration** — SoundCloud results appear directly in Spotify's search dropdown alongside Spotify results
- **Feed** — browse your SoundCloud stream
- **Liked tracks** — your SoundCloud likes, in Spotify's UI
- **Playlists** — your SoundCloud playlists
- **Source badge** — orange SC badge in the corner when SoundCloud is playing
- **Auto client\_id** — no manual API key setup; extracts the `client_id` automatically from SoundCloud's own bundles

---

## Requirements

- [Spotify desktop app](https://www.spotify.com/download)
- [Spicetify](https://spicetify.app/docs/getting-started) v2.x or later
- Node.js 18+

---

## Installation

```bash
# 1. Clone
git clone https://github.com/5djr/SpiceCloud.git
cd SpiceCloud

# 2. Install dependencies
npm install

# 3. Build
npm run build

# 4. Register with Spicetify (once)
spicetify config custom_apps spicecloud
spicetify apply
```

---

## Authentication

SpiceCloud does not require a registered SoundCloud developer app.

1. Open [soundcloud.com](https://soundcloud.com) in your browser while logged in
2. Open DevTools → Network tab → filter by `api-v2.soundcloud.com`
3. Click any request and copy the `Authorization` header value (e.g. `OAuth 2-123456-...`)
4. Open the SpiceCloud panel inside Spotify and paste the token

The `client_id` is extracted automatically. Both values are stored in `Spicetify.LocalStorage` and refreshed when they expire.

---

## Development

```bash
npm run watch   # rebuild on save
npm run start   # build + apply to Spicetify in one step
```

Source lives in `src/`. The entry point is `src/app.tsx`. `spicetify-creator` compiles and bundles everything into `dist/`.

### Key files

| File | Purpose |
|---|---|
| `src/services/player.ts` | SoundCloudPlayer singleton — audio, now-playing bar, Spotify hooks |
| `src/services/api.ts` | SoundCloud API v2 wrapper (`scFetch`) |
| `src/services/auth.ts` | OAuth + client\_id extraction, LocalStorage persistence |
| `src/services/searchIntegration.ts` | Injects SC results into Spotify's search dropdown |
| `src/hooks/usePlayer.ts` | React hook for player state |
| `src/hooks/useAuth.ts` | React hook for auth state |

---

## How it works

```
useAuth  ──►  auth.ts  (OAuth + client_id → LocalStorage)
                │
usePlayer ──►  player.ts  (singleton)
                ├── <audio>  hidden element in document.body
                ├── api.ts → /tracks/{id}/streams → http_mp3_128_url
                └── Spicetify.Player events (songchange, onplaypause, seek)
                     └── now-playing bar overwritten via CSS data-attribute overlays
```

The now-playing bar is never mutated with `textContent` (which crashes React's reconciliation). Instead, `data-sc-title` / `data-sc-artist` attributes are set and CSS `::before` overlays display the SC values transparently.

---

## Limitations

- Requires a valid SoundCloud OAuth token (no browser-based login flow inside Electron)
- Token must be refreshed manually when it expires
- Spotify's `songchange` event is the only reliable hook for detecting track navigation — there is no song-change event for playlist changes without navigation
- Lyrics, shuffle, repeat, queue, connect-to-device, mini-player and fullscreen are hidden during SC playback (Spotify-only features)

---

## License

MIT — see [LICENSE](LICENSE)
