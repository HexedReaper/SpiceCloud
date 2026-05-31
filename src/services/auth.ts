import { SCSettings } from "../types/soundcloud";
import { log, warn } from "./debug";

const STORAGE_KEY = "spicecloud:settings";

export function loadSettings(): SCSettings {
  try {
    const raw = Spicetify.LocalStorage.get(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as SCSettings;
  } catch {}
  return { clientId: "", oauthToken: "" };
}

export function saveSettings(settings: SCSettings): void {
  Spicetify.LocalStorage.set(STORAGE_KEY, JSON.stringify(settings));
}

// ── client_id auto-extraction ──────────────────────────────────────────────
//
// SoundCloud has no public app registration, and its anonymous client_id
// rotates. We scrape a fresh one the way the website ships it: fetch
// soundcloud.com, find its JS bundles, and scan them for `client_id:"…"`.
//
// fetch() is CORS-blocked in Spotify's renderer and window.require is absent,
// so everything goes through Spicetify's networking via the CORS proxy.

const CORS_PROXY = "https://cors-proxy.spicetify.app/";

async function fetchText(url: string): Promise<string> {
  if (typeof Spicetify === "undefined" || !Spicetify.CosmosAsync) {
    throw new Error("Spicetify.CosmosAsync unavailable");
  }
  const raw = (await Spicetify.CosmosAsync.get(CORS_PROXY + url)) as unknown;
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object" && "body" in raw) {
    const body = (raw as { body: unknown }).body;
    return typeof body === "string" ? body : JSON.stringify(body);
  }
  return typeof raw === "object" ? JSON.stringify(raw) : String(raw);
}

/**
 * Scrape a working anonymous `client_id` from soundcloud.com's JS bundles.
 * Returns null on failure (network/CORS/parse) — callers fall back gracefully.
 */
export async function fetchClientId(): Promise<string | null> {
  log("auth", "scraping SoundCloud bundles for client_id...");
  try {
    const html = await fetchText("https://soundcloud.com/");
    const scripts = Array.from(
      html.matchAll(/<script[^>]+src="([^"]+)"/g),
      (m) => m[1],
    ).filter((u) => u.startsWith("http"));
    log("auth", "found %d script bundles to scan", scripts.length);

    // The client_id usually lives in one of the later bundles — scan from the
    // end and return the first match.
    for (const url of scripts.reverse()) {
      try {
        const js = await fetchText(url);
        const m =
          js.match(/client_id:"([a-zA-Z0-9]{16,})"/) ??
          js.match(/client_id=([a-zA-Z0-9]{16,})/);
        if (m && m[1]) {
          log(
            "auth",
            "client_id found: %s… (in %s)",
            m[1].slice(0, 8),
            url.split("/").pop(),
          );
          return m[1];
        }
      } catch {
        // ignore a single bad bundle and keep scanning
      }
    }
    warn("auth", "client_id not found in any of %d bundles", scripts.length);
  } catch (e) {
    warn("auth", "fetchClientId failed:", e);
  }
  return null;
}
