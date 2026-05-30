# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # install deps
npm run build        # compile + bundle via spicetify-creator → dist/
npm run watch        # rebuild on save (dev loop)
npm run start        # build + apply to Spicetify in one step
```

After the first build, register the app once:

```bash
spicetify config custom_apps spicecloud
spicetify apply
```

There are no test or lint scripts configured yet.

## Architecture

SpiceCloud is a **Spicetify Custom App** — a React app that runs inside Spotify's Electron shell as a sidebar panel. `spicetify-creator` compiles `src/app.tsx` (the default export) into the bundle Spicetify loads.

### Data flow

```
useAuth (hook)
  └── auth.ts (OAuth + LocalStorage)
      └── exchangeCode / refreshToken → SCSettings stored via Spicetify.LocalStorage

usePlayer (hook)  ←→  player.ts singleton
                         ├── SoundCloudPlayer.audio  (hidden <audio> in document.body)
                         ├── getTrackStreams()        (api.ts → SC API v2 /tracks/{id}/streams)
                         └── Spicetify.Player.addEventListener('onplaypause')  ← mirrors transport

api.ts
  └── scFetch() — injects client_id + oauth_token; calls refreshToken() automatically on 401
```

### Singleton player

`src/services/player.ts` exports a **module-level singleton** (`export const player = new SoundCloudPlayer()`). It is instantiated once when the module first loads (which is after Spicetify is initialized). All components import this same instance. The `subscribe(cb)` method returns an unsubscribe function used in `usePlayer`'s `useEffect` cleanup.

### Auth strategy

No SoundCloud app registration is required (the API registration page requires a paid Artist Pro account). Instead:

1. **`client_id` auto-extraction** — `fetchClientId()` in `auth.ts` fetches `soundcloud.com`, collects JS bundle URLs from `<script src>` tags, then scans each file for the pattern `,client_id:"..."`. The extracted id is cached in LocalStorage and refreshed automatically when any API call returns 401/403.

2. **Manual OAuth token** — users copy their `Authorization: OAuth <token>` header from browser DevTools (any request to `api-v2.soundcloud.com` while logged into SoundCloud). Pasted into the AuthScreen; `useAuth.connect()` strips the `OAuth ` prefix if present, then verifies the token by calling `/me` before persisting.

Both values are stored as `{ clientId, oauthToken }` JSON in `Spicetify.LocalStorage` under key `spicecloud:settings`.

### Now-playing bar injection

`player.updateNowPlayingBar()` queries multiple CSS selectors (see `NOW_PLAYING_*_SELECTORS` arrays in `player.ts`) to find Spotify's title, artist, and cover DOM elements and overwrites their content. These selectors change across Spotify versions — if metadata stops updating, update the selector arrays.

### SoundCloud API

All requests go to `https://api-v2.soundcloud.com` (the internal v2 API). Stream URLs come from `/tracks/{id}/streams` → `http_mp3_128_url` (direct CDN URL, no extra auth header needed for the `<audio>` element). Authenticated endpoints (`/me/*`, `/stream`) require `oauth_token` in query params.
