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
    !Spicetify.LocalStorage
  ) {
    setTimeout(boot, 200);
    return;
  }

  // Touch the singleton so its constructor runs now and hooks Spotify's
  // transport at startup (the reference also keeps the import from being
  // tree-shaken away).
  void player;

  // Boot/tear down the search integration as credentials come and go, so it
  // starts working the moment the user connects in the app — no tab click and
  // no Spotify restart required — and stops if they disconnect.
  const sync = () => {
    if (hasCredentials()) initSearchIntegration();
    else destroySearchIntegration();
  };
  sync();
  setInterval(sync, 2000);
}

boot();
