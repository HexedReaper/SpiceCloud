// SpiceCloud startup extension.
//
// Spicetify loads a *custom app's* JS only when you navigate to its page, which
// is why playback hooks and the SoundCloud search integration used to require
// first clicking the SpiceCloud tab. This file is built as a separate Spicetify
// *extension* (listed in settings.json → subfiles_extension) that Spotify loads
// at startup, so everything works immediately without opening the tab.
//
// NOTE: the app and this extension are separate esbuild bundles. The player and
// search integration both guard against double-instantiation via window-level
// singletons, so importing them here AND in the app is safe — one instance wins.

import { player } from "../services/player";
import {
  initSearchIntegration,
  destroySearchIntegration,
} from "../services/searchIntegration";
import {
  initSearchPageIntegration,
  destroySearchPageIntegration,
} from "../services/searchPageIntegration";
import { getDebugLog, clearDebugLog } from "../services/api";
import { log } from "../services/debug";

const SETTINGS_KEY = "spicecloud:settings";

function hasCredentials(): boolean {
  try {
    const raw = Spicetify?.LocalStorage?.get(SETTINGS_KEY);
    if (!raw) return false;
    const { clientId, oauthToken } = JSON.parse(raw) as {
      clientId?: string;
      oauthToken?: string;
    };
    return Boolean(clientId && oauthToken);
  } catch {
    return false;
  }
}

function boot(): void {
  if (
    typeof Spicetify === "undefined" ||
    !Spicetify.Player ||
    !Spicetify.LocalStorage ||
    !Spicetify.Platform
  ) {
    setTimeout(boot, 200);
    return;
  }

  log("ext", "Spicetify ready — booting SpiceCloud extension");

  // Touch the singleton so its constructor runs now and hooks Spotify's
  // transport at startup (the reference also keeps the import from being
  // tree-shaken away).
  void player;

  // Expose debug namespace on window for devtools inspection.
  // Usage: __sc.player.getState(), __sc.apiLog(), __sc.clearApiLog()
  (window as unknown as Record<string, unknown>).__sc = {
    player,
    apiLog: getDebugLog,
    clearApiLog: clearDebugLog,
    help: () => {
      console.log(
        "%c[SC] window.__sc debug API\n%c" +
          "  __sc.player          — SoundCloudPlayer instance\n" +
          "  __sc.player.getState()  — current player state\n" +
          "  __sc.apiLog()        — last 30 API calls (endpoint, url, response)\n" +
          "  __sc.clearApiLog()   — clear the API call log\n" +
          "\nFilter console by '[SC' to see all SpiceCloud log messages.",
        "color:#ff5500;font-weight:bold",
        "color:inherit",
      );
    },
  };
  log("ext", "window.__sc exposed — type __sc.help() for API docs");

  // Boot/tear down the search integration as credentials come and go, so it
  // starts working the moment the user connects in the app — no tab click and
  // no Spotify restart required — and stops if they disconnect.
  let _prevHadCreds: boolean | null = null;
  const sync = () => {
    const hasCreds = hasCredentials();
    if (hasCreds !== _prevHadCreds) {
      log(
        "ext",
        "credentials: %s → %s integrations",
        hasCreds ? "found" : "missing",
        hasCreds ? "init" : "destroy",
      );
      _prevHadCreds = hasCreds;
    }
    if (hasCreds) {
      initSearchIntegration();
      initSearchPageIntegration();
    } else {
      destroySearchIntegration();
      destroySearchPageIntegration();
    }
  };
  sync();
  setInterval(sync, 2000);
}

log("ext", "script loaded, waiting for Spicetify...");
boot();
