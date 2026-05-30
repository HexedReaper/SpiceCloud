import React, { useEffect, useState } from "react";
import "./styles/app.css";

import { useAuth } from "./hooks/useAuth";
import { AuthScreen } from "./components/AuthScreen";
import { Navigation, NavTab } from "./components/Navigation";
import { FeedView } from "./components/FeedView";
import { LikedTracksView } from "./components/LikedTracksView";
import { PlaylistsView } from "./components/PlaylistsView";
import {
  initSearchIntegration,
  destroySearchIntegration,
} from "./services/searchIntegration";
import { t } from "./i18n";

// Boot search integration as soon as Spicetify is ready — does not require
// the user to click the SpiceCloud tab first. initSearchIntegration is
// idempotent (guard inside), so the React useEffect below is safe to call it
// again after auth changes.
(function boot() {
  if (
    typeof Spicetify === "undefined" ||
    !Spicetify.Player ||
    !Spicetify.LocalStorage
  ) {
    setTimeout(boot, 100);
    return;
  }
  try {
    const raw = Spicetify.LocalStorage.get("spicecloud:settings");
    if (!raw) return;
    const { clientId, oauthToken } = JSON.parse(raw) as {
      clientId?: string;
      oauthToken?: string;
    };
    if (clientId && oauthToken) initSearchIntegration();
  } catch {}
})();

export default function App() {
  const { isAuthed, isConnecting, error, connect, disconnect } = useAuth();
  const [activeTab, setActiveTab] = useState<NavTab>("feed");

  useEffect(() => {
    if (!isAuthed) return;
    initSearchIntegration();
    return () => destroySearchIntegration();
  }, [isAuthed]);

  if (!isAuthed) {
    return (
      <div className="sc-app">
        <AuthScreen
          isConnecting={isConnecting}
          error={error}
          onConnect={connect}
        />
      </div>
    );
  }

  return (
    <div className="sc-app">
      <header className="sc-header">
        <span className="sc-header__logo">
          <svg
            className="sc-header__logo-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <rect width="24" height="24" rx="4" fill="#ff5500" />
            <path
              fill="white"
              d="M23.999 14.165c-.052 1.796-1.612 3.169-3.4 3.169h-8.18a.68.68 0 0 1-.675-.683V7.862a.747.747 0 0 1 .452-.724s.75-.513 2.333-.513a5.364 5.364 0 0 1 2.763.755 5.433 5.433 0 0 1 2.57 3.54c.282-.08.574-.121.868-.12.884 0 1.73.358 2.347.992s.948 1.49.922 2.373ZM10.721 8.421c.247 2.98.427 5.697 0 8.672a.264.264 0 0 1-.53 0c-.395-2.946-.22-5.718 0-8.672a.264.264 0 0 1 .53 0ZM9.072 9.448c.285 2.659.37 4.986-.006 7.655a.277.277 0 0 1-.55 0c-.331-2.63-.256-5.02 0-7.655a.277.277 0 0 1 .556 0Zm-1.663-.257c.27 2.726.39 5.171 0 7.904a.266.266 0 0 1-.532 0c-.38-2.69-.257-5.21 0-7.904a.266.266 0 0 1 .532 0Zm-1.647.77a26.108 26.108 0 0 1-.008 7.147.272.272 0 0 1-.542 0 27.955 27.955 0 0 1 0-7.147.275.275 0 0 1 .55 0Zm-1.67 1.769c.421 1.865.228 3.5-.029 5.388a.257.257 0 0 1-.514 0c-.21-1.858-.398-3.549 0-5.389a.272.272 0 0 1 .543 0Zm-1.655-.273c.388 1.897.26 3.508-.01 5.412-.026.28-.514.283-.54 0-.244-1.878-.347-3.54-.01-5.412a.283.283 0 0 1 .56 0Zm-1.668.911c.4 1.268.257 2.292-.026 3.572a.257.257 0 0 1-.514 0c-.241-1.262-.354-2.312-.023-3.572a.283.283 0 0 1 .563 0Z"
            />
          </svg>
          SpiceCloud
        </span>
        <button
          className="sc-header__logout"
          onClick={disconnect}
          title={t("btn_disconnect")}
        >
          {t("btn_disconnect")}
        </button>
      </header>

      <Navigation active={activeTab} onChange={setActiveTab} />

      {/*
        All views stay mounted — switching tabs uses display:none so data is
        never lost and API calls don't repeat on every tab visit.
      */}
      <div className="sc-content">
        <div className={activeTab === "feed" ? "" : "sc-hidden"}>
          <FeedView />
        </div>
        <div className={activeTab === "liked" ? "" : "sc-hidden"}>
          <LikedTracksView />
        </div>
        <div className={activeTab === "playlists" ? "" : "sc-hidden"}>
          <PlaylistsView />
        </div>
      </div>
    </div>
  );
}
