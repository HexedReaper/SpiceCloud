import {
  SCCollection,
  SCPlaylist,
  SCSearchResult,
  SCSettings,
  SCStreamItem,
  SCStreamUrls,
  SCTrack,
} from "../types/soundcloud";
import { loadSettings } from "./auth";
import { httpGet } from "./http";

const API_BASE = "https://api-v2.soundcloud.com";

// Required params SoundCloud expects on every v2 request.
const SC_BASE_PARAMS: Record<string, string> = {
  app_version: "1779975447",
  app_locale: "en",
  linked_partitioning: "1",
};

let _settings: SCSettings = loadSettings();

// Cached SC user ID — populated by getMe() so that getLikedTracks() and
// getPlaylists() can use /users/{id}/… paths instead of /me/… paths.
// Spicetify's CORS proxy (cors-proxy.spicetify.app) blocks /me/{sub-path}
// routes but allows /users/{id}/… equivalents.
let _userId: number | null = null;
let _userIdPromise: Promise<number> | null = null;

export function updateApiSettings(settings: Partial<SCSettings>): void {
  _settings = { ..._settings, ...settings };
  _userId = null;
  _userIdPromise = null;
}

// ── Debug log ─────────────────────────────────────────────────────────────────

export interface DebugEntry {
  ts: number;
  endpoint: string;
  url: string;
  raw: unknown;
}

const _debugLog: DebugEntry[] = [];
const MAX_DEBUG_ENTRIES = 30;

export function getDebugLog(): DebugEntry[] {
  return [..._debugLog];
}

export function clearDebugLog(): void {
  _debugLog.length = 0;
}

function logDebug(endpoint: string, url: string, raw: unknown): void {
  _debugLog.unshift({ ts: Date.now(), endpoint, url, raw });
  if (_debugLog.length > MAX_DEBUG_ENTRIES) _debugLog.pop();
}

// ── Core fetch ────────────────────────────────────────────────────────────────
//
// Strategy (in order):
//   1. Spicetify.CosmosAsync.get() — routes through Spotify's main-process
//      networking layer, bypassing Chromium's CORS enforcement.
//   2. httpGet() — Node.js https (no CORS) or browser fetch (CORS will apply).
//
// SoundCloud v2 accepts the OAuth token as ?oauth_token=... in the query string
// because CosmosAsync does not support sending custom request headers.

async function scFetch<T>(
  endpoint: string,
  extra: Record<string, string> = {},
): Promise<T> {
  const params: Record<string, string> = {
    client_id: _settings.clientId,
    ...SC_BASE_PARAMS,
    ...extra,
  };
  if (_settings.oauthToken) params["oauth_token"] = _settings.oauthToken;

  // Build the final URL. Full URLs (next_href, transcoding) may already carry
  // query params — use URL() so we append without doubling the '?'.
  const base = endpoint.startsWith("https://")
    ? endpoint
    : `${API_BASE}${endpoint}`;
  const urlObj = new URL(base);
  Object.entries(params).forEach(([k, v]) => urlObj.searchParams.set(k, v));
  const url = urlObj.toString();

  // ── 1. CosmosAsync (preferred) ─────────────────────────────────────────────
  if (typeof Spicetify !== "undefined" && Spicetify.CosmosAsync) {
    try {
      // CosmosAsync.get() has two possible return shapes:
      //
      //   (A) Wrapped:  { version: number, status: number, headers: [...], body: <data> }
      //   (B) Direct:   <data>  — the parsed JSON body itself  (modern Spicetify)
      //
      // Detect (A): the wrapper always has a numeric `status` AND a `body` key.
      // SoundCloud API payloads never carry both of those top-level fields.
      const raw = (await Spicetify.CosmosAsync.get(url)) as unknown;

      let httpStatus = 200;
      let data: unknown;

      if (
        raw !== null &&
        typeof raw === "object" &&
        typeof (raw as Record<string, unknown>)["status"] === "number" &&
        "body" in (raw as object)
      ) {
        httpStatus = (raw as { status: number }).status;
        data = (raw as { body: unknown }).body;
      } else {
        data = raw;
      }

      // Parse raw-string bodies (edge case in some CosmosAsync versions).
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch {
          throw new Error(`SoundCloud returned invalid JSON on ${endpoint}`);
        }
      }

      logDebug(endpoint, url, data);

      if (httpStatus < 400) {
        return data as T;
      }
      // Any HTTP error from CosmosAsync may be the CORS proxy rejecting the
      // request rather than a real SC error — fall through to httpGet.
      throw new Error(`CosmosAsync HTTP ${httpStatus} on ${endpoint}`);
    } catch (err) {
      console.warn(
        "[SpiceCloud] CosmosAsync failed, falling back to httpGet:",
        err,
      );
    }
  }

  // ── 2. httpGet fallback ─────────────────────────────────────────────────────
  const res = await httpGet(url, { Accept: "application/json; charset=utf-8" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `SoundCloud ${res.status} on ${endpoint}: ${body.slice(0, 200)}`,
    );
  }
  const data = await res.json<T>();
  logDebug(endpoint, url, data);
  return data;
}

// ── User ID resolution ────────────────────────────────────────────────────────
// Spicetify's CORS proxy blocks /me/{sub-path} endpoints (track_likes,
// playlists). The /users/{id}/… equivalents go through fine.  We fetch the
// user ID once (via /me which the proxy allows) and cache it for the session.

async function ensureUserId(): Promise<number> {
  if (_userId !== null) return _userId;
  if (!_userIdPromise) {
    _userIdPromise = getMe().then((me) => {
      _userId = me.id;
      _userIdPromise = null;
      return me.id;
    });
  }
  return _userIdPromise;
}

// ── Endpoints ─────────────────────────────────────────────────────────────────

export async function searchTracks(
  query: string,
  limit = 20,
): Promise<SCSearchResult> {
  return scFetch<SCSearchResult>("/search/tracks", {
    q: query,
    limit: String(limit),
  });
}

export async function getTrackStreams(trackId: number): Promise<SCStreamUrls> {
  return scFetch<SCStreamUrls>(`/tracks/${trackId}/streams`);
}

/**
 * Resolve a SoundCloud transcoding API URL to the actual CDN stream URL.
 *
 * SoundCloud v2 tracks carry `media.transcodings[].url` — an API endpoint that,
 * when fetched, returns `{ url: "https://cf-media.sndcdn.com/..." }`.
 * This second request is required; the transcoding URL is NOT a playable URL itself.
 */
export async function resolveTranscodingUrl(
  transcodingApiUrl: string,
): Promise<string> {
  const data = await scFetch<{ url: string }>(transcodingApiUrl);
  if (!data?.url) throw new Error("Transcoding resolution returned no URL");
  return data.url;
}

export async function getLikedTracks(
  limit = 50,
): Promise<SCCollection<{ track: SCTrack; created_at: string }>> {
  const id = await ensureUserId();
  return scFetch(`/users/${id}/track_likes`, { limit: String(limit) });
}

export async function getPlaylists(
  limit = 20,
): Promise<SCCollection<SCPlaylist>> {
  const id = await ensureUserId();
  return scFetch(`/users/${id}/playlists`, { limit: String(limit) });
}

export async function getPlaylist(id: number): Promise<SCPlaylist> {
  return scFetch<SCPlaylist>(`/playlists/${id}`);
}

export async function getFeed(limit = 30): Promise<SCCollection<SCStreamItem>> {
  return scFetch("/stream", { limit: String(limit) });
}

export async function fetchNextPage<T>(
  nextHref: string,
): Promise<{ collection: T[]; next_href: string | null }> {
  return scFetch<{ collection: T[]; next_href: string | null }>(nextHref);
}

export async function getMe(): Promise<{
  id: number;
  username: string;
  avatar_url: string;
}> {
  const me = await scFetch<{ id: number; username: string; avatar_url: string }>("/me");
  _userId = me.id;
  return me;
}
