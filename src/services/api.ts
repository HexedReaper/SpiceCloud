import {
  SCCollection,
  SCPlaylist,
  SCSearchResult,
  SCSettings,
  SCStreamItem,
  SCStreamUrls,
  SCTrack,
} from "../types/soundcloud";
import { fetchClientId, loadSettings, saveSettings } from "./auth";
import { httpGet, httpRequest } from "./http";

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

// Re-extract a fresh client_id (SoundCloud rotates them) and persist it.
// Returns true only if the id actually changed, so a retry is worthwhile.
let _refreshInFlight: Promise<boolean> | null = null;
async function refreshClientId(): Promise<boolean> {
  if (_refreshInFlight) return _refreshInFlight;
  _refreshInFlight = (async () => {
    try {
      const id = await fetchClientId();
      if (!id) return false;
      const changed = id !== _settings.clientId;
      _settings = { ..._settings, clientId: id };
      saveSettings(_settings);
      return changed;
    } catch (e) {
      console.warn("[SpiceCloud] client_id refresh failed:", e);
      return false;
    }
  })();
  try {
    return await _refreshInFlight;
  } finally {
    _refreshInFlight = null;
  }
}

async function scFetch<T>(
  endpoint: string,
  extra: Record<string, string> = {},
  attempt = 0,
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
  trackAuthorization?: string,
): Promise<string> {
  // SoundCloud's progressive media endpoint requires the track's
  // track_authorization token; without it the request 404/401s.
  const extra: Record<string, string> = {};
  if (trackAuthorization) extra.track_authorization = trackAuthorization;
  const data = await scFetch<{ url: string }>(transcodingApiUrl, extra);
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
  const me = await scFetch<{
    id: number;
    username: string;
    avatar_url: string;
  }>("/me");
  _userId = me.id;
  return me;
}

// ── Like / Unlike ─────────────────────────────────────────────────────────────
//
// SoundCloud's mutation endpoints (PUT/DELETE track_likes) are guarded by
// DataDome bot-protection.  When DataDome intercepts a request it returns
// HTTP 403 with a JSON body like { "url": "https://geo.captcha-delivery.com/..." }.
//
// Strategy:
//   1. Try Spicetify.CosmosAsync.put/del — routes through Spotify's main
//      process, which is session-aware (shares Electron cookies).  If the
//      user has already solved the CAPTCHA the datadome cookie for
//      soundcloud.com travels with this request and it succeeds.
//   2. If step 1 returns a DataDome 403, open the CAPTCHA URL in a popup
//      window.  Electron shares one cookie store across all windows, so
//      solving the challenge sets the datadome cookie for .soundcloud.com
//      in the same session.  Then retry once via CosmosAsync — this time
//      the main-process request carries the cookie.
//   3. If CosmosAsync is unavailable, fall back to browser fetch via the
//      Spicetify CORS proxy.  Apply the same CAPTCHA-popup logic on 403.

function parseCaptchaUrl(body: unknown): string | null {
  const check = (b: unknown): string | null => {
    if (typeof b !== "object" || b === null) return null;
    const url = (b as Record<string, unknown>)["url"];
    return typeof url === "string" && url.includes("captcha-delivery.com")
      ? url
      : null;
  };
  if (typeof body === "string") {
    try {
      return check(JSON.parse(body));
    } catch {
      return null;
    }
  }
  return check(body);
}

function openCaptchaAndWait(captchaUrl: string): Promise<void> {
  return new Promise<void>((resolve) => {
    const popup = window.open(
      captchaUrl,
      "sc-datadome",
      "width=620,height=520",
    );
    if (!popup) {
      // Pop-up blocked — tell the user and give up; they will need to solve it
      // manually before liking works.
      Spicetify?.showNotification?.(
        "SoundCloud requires a CAPTCHA. Open this URL in your browser to unblock likes: " +
          captchaUrl,
        true,
      );
      resolve();
      return;
    }
    const timer = window.setInterval(() => {
      if (popup.closed) {
        clearInterval(timer);
        resolve();
      }
    }, 500);
    // Time-out after 2 minutes whether or not the user solved it.
    window.setTimeout(() => {
      clearInterval(timer);
      try {
        popup.close();
      } catch {
        // ignore
      }
      resolve();
    }, 120_000);
  });
}

async function scMutate(
  method: "put" | "del",
  endpoint: string,
  attempt = 0,
): Promise<void> {
  const params: Record<string, string> = {
    client_id: _settings.clientId,
    ...SC_BASE_PARAMS,
  };
  if (_settings.oauthToken) params["oauth_token"] = _settings.oauthToken;

  const urlObj = new URL(`${API_BASE}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => urlObj.searchParams.set(k, v));
  const targetUrl = urlObj.toString();
  const httpMethod = method === "put" ? "PUT" : "DELETE";

  // ── 1. CosmosAsync (Spotify main-process, session-aware) ───────────────────
  if (typeof Spicetify !== "undefined" && Spicetify.CosmosAsync) {
    try {
      const raw =
        method === "put"
          ? await Spicetify.CosmosAsync.put(targetUrl)
          : await Spicetify.CosmosAsync.del(targetUrl);

      // CosmosAsync may return a wrapped { status, body } object (older builds).
      let status = 200;
      let responseBody: unknown = raw;
      if (
        raw !== null &&
        typeof raw === "object" &&
        typeof (raw as Record<string, unknown>)["status"] === "number" &&
        "body" in (raw as object)
      ) {
        status = (raw as { status: number }).status;
        responseBody = (raw as { body: unknown }).body;
      }

      if (status < 400) return;

      if (status === 403 && attempt === 0) {
        const captchaUrl = parseCaptchaUrl(responseBody);
        if (captchaUrl) {
          await openCaptchaAndWait(captchaUrl);
          return scMutate(method, endpoint, 1);
        }
      }
      throw new Error(`CosmosAsync HTTP ${status} on ${endpoint}`);
    } catch (err) {
      if (attempt > 0) throw err;
      console.warn(
        "[SpiceCloud] CosmosAsync mutate failed, falling back to proxy:",
        err,
      );
    }
  }

  // ── 2. Browser fetch via CORS proxy ────────────────────────────────────────
  const headers: Record<string, string> = { Accept: "application/json" };
  if (_settings.oauthToken)
    headers["Authorization"] = `OAuth ${_settings.oauthToken}`;

  const proxyUrl = `https://cors-proxy.spicetify.app/${targetUrl}`;
  const res = await httpRequest(proxyUrl, httpMethod, headers);
  if (res.ok) return;

  const bodyText = await res.text().catch(() => "");

  if (res.status === 403 && attempt === 0) {
    const captchaUrl = parseCaptchaUrl(bodyText);
    if (captchaUrl) {
      await openCaptchaAndWait(captchaUrl);
      return scMutate(method, endpoint, 1);
    }
  }

  throw new Error(
    `SoundCloud ${res.status} on ${httpMethod} ${endpoint}: ${bodyText.slice(0, 200)}`,
  );
}

export async function likeTrack(trackId: number): Promise<void> {
  const id = await ensureUserId();
  await scMutate("put", `/users/${id}/track_likes/${trackId}`);
}

export async function unlikeTrack(trackId: number): Promise<void> {
  const id = await ensureUserId();
  await scMutate("del", `/users/${id}/track_likes/${trackId}`);
}

export async function getLikedTrackIds(): Promise<Set<number>> {
  const userId = await ensureUserId();
  const ids = new Set<number>();
  // /track_likes/ids doesn't exist in the SC v2 API — paginate /track_likes instead.
  let next: string | null = `/users/${userId}/track_likes`;
  let extra: Record<string, string> = { limit: "200" };
  while (next) {
    const page = await scFetch<{
      collection: Array<{ track: { id: number } }>;
      next_href: string | null;
    }>(next, extra);
    extra = {};
    for (const item of page.collection ?? []) {
      if (item?.track?.id) ids.add(item.track.id);
    }
    next = page.next_href ?? null;
  }
  return ids;
}
