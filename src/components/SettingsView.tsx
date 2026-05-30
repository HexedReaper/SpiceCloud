import React, { useState } from "react";
import { loadSettings, saveSettings, fetchClientId } from "../services/auth";
import { updateApiSettings } from "../services/api";

interface Props {
  onDisconnect: () => void;
}

export function SettingsView({ onDisconnect }: Props) {
  const [settings, setSettings] = useState(loadSettings);
  const [showToken, setShowToken] = useState(false);
  const [saved, setSaved] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

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
