import { SCSettings } from "../types/soundcloud";

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
