import React, { useState } from "react";
import { loadSettings, saveSettings, fetchClientId } from "../services/auth";
import { updateApiSettings } from "../services/api";
import { player } from "../services/player";
import { usePlayer } from "../hooks/usePlayer";

interface Props {
  onDisconnect: () => void;
}

export function SettingsView({ onDisconnect }: Props) {
  // Pull live state from the player so the UI is always in sync with the Spotify volume bar
  const { scVolMultEnabled, scVolumeLevel } = usePlayer();

  const [settings, setSettings] = useState(loadSettings);
  const [showToken, setShowToken] = useState(false);
  const [saved, setSaved] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  const handleToggleVolMult = (enabled: boolean) => {
    try {
      Spicetify.LocalStorage.set("spicecloud_sc_vol_enabled", String(enabled));
    } catch {}
    player.setScVolumeEnabled(enabled);
  };

  const handleVolChange = (val: number) => {
    try {
      Spicetify.LocalStorage.set("spicecloud_sc_vol_level", String(val));
    } catch {}
    player.setScVolumeLevel(val);
  };

  const save = () => {
    const clean = {
      clientId: settings.clientId.trim(),
      oauthToken: settings.oauthToken.trim().replace(/^OAuth\s+/i, ""),
    };
    saveSettings(clean);
    updateApiSettings(clean);
    setSettings(clean);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const refreshId = async () => {
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      const id = await fetchClientId();
      if (id) {
        const updated = { ...settings, clientId: id };
        setSettings(updated);
        saveSettings(updated);
        updateApiSettings(updated);
        setRefreshMsg("Client ID refreshed!");
      } else {
        setRefreshMsg("Could not auto-detect — try copying it manually.");
      }
    } catch {
      setRefreshMsg("Refresh failed. Check your connection.");
    } finally {
      setRefreshing(false);
      setTimeout(() => setRefreshMsg(null), 4000);
    }
  };

  return (
    <div className="sc-settings">
      <section className="sc-settings__section">
        <h3 className="sc-settings__section-title">Credentials</h3>

        <div className="sc-settings__field">
          <span className="sc-label">OAuth Token</span>
          <p className="sc-settings__hint">
            Open DevTools on soundcloud.com, go to Network, filter by XHR, find
            any request to api-v2.soundcloud.com, and copy the Authorization
            header value (with or without the "OAuth " prefix).
          </p>
          <div className="sc-settings__input-row">
            <input
              type={showToken ? "text" : "password"}
              className="sc-input"
              value={settings.oauthToken}
              onChange={(e) =>
                setSettings((s) => ({ ...s, oauthToken: e.target.value }))
              }
              placeholder="2-123456-7890123-xxxxxxxx"
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
            />
            <button
              className="sc-btn-icon"
              type="button"
              onClick={() => setShowToken((v) => !v)}
              title={showToken ? "Hide token" : "Show token"}
            >
              {showToken ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        </div>

        <div className="sc-settings__field">
          <span className="sc-label">Client ID</span>
          <p className="sc-settings__hint">
            The client_id query parameter from any api-v2.soundcloud.com request
            URL. Use Auto-refresh to extract it automatically from
            soundcloud.com.
          </p>
          <div className="sc-settings__input-row">
            <input
              type="text"
              className="sc-input"
              value={settings.clientId}
              onChange={(e) =>
                setSettings((s) => ({ ...s, clientId: e.target.value }))
              }
              placeholder="IRnK0myxxLJdwXXjybXQo71m…"
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
            />
            <button
              className="sc-btn-secondary"
              type="button"
              onClick={() => void refreshId()}
              disabled={refreshing}
            >
              {refreshing ? "…" : "Auto-refresh"}
            </button>
          </div>
          {refreshMsg && <p className="sc-settings__msg">{refreshMsg}</p>}
        </div>

        <button className="sc-btn-primary" type="button" onClick={save}>
          {saved ? "✓ Saved" : "Save Changes"}
        </button>
      </section>

      <div className="sc-settings__divider" />
      
      <section className="sc-settings__section">
        <h3 className="sc-settings__section-title">Playback</h3>
        
        <div className="sc-settings__field">
          <span className="sc-label">Separate Volume Profiles</span>
          <p className="sc-settings__hint">
            Enable to give SoundCloud tracks their own volume level. The Spotify volume slider will visually switch between profiles. Disable to share the same volume level.
          </p>
          <label className="sc-toggle-row" style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={scVolMultEnabled}
              onChange={(e) => handleToggleVolMult(e.target.checked)}
            />
            <span>{scVolMultEnabled ? "Enabled" : "Disabled"}</span>
          </label>
        </div>

        {scVolMultEnabled && (
          <div className="sc-settings__field">
            <span className="sc-label">SoundCloud Volume Level</span>
            <div className="sc-settings__input-row" style={{ alignItems: "center" }}>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                className="sc-input"
                value={scVolumeLevel}
                onChange={(e) => handleVolChange(parseFloat(e.target.value))}
                style={{ width: "100%", cursor: "pointer" }}
              />
              <span style={{ marginLeft: "12px", minWidth: "40px", textAlign: "right", fontWeight: "bold" }}>
                {Math.round(scVolumeLevel * 100)}%
              </span>
            </div>
          </div>
        )}
      </section>

      <div className="sc-settings__divider" />

      <section className="sc-settings__section">
        <h3 className="sc-settings__section-title sc-settings__section-title--danger">
          Danger Zone
        </h3>
        <p className="sc-settings__hint">
          Remove your credentials from Spotify. You'll need to enter them again
          to use SpiceCloud.
        </p>
        <button className="sc-btn-danger" type="button" onClick={onDisconnect}>
          Disconnect from SoundCloud
        </button>
      </section>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      width="16"
      height="16"
      aria-hidden="true"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      width="16"
      height="16"
      aria-hidden="true"
    >
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}