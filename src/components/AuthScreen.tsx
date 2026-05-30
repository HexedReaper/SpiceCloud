import React, { useState } from "react";
import { t, tWithKbd } from "../i18n";

interface Props {
  isConnecting: boolean;
  error: string | null;
  onConnect: (clientId: string, token: string) => void;
}

function renderKbd(key: string) {
  return tWithKbd(key).map((part, i) =>
    typeof part === "string" ? (
      part
    ) : (
      <kbd key={i} className="sc-kbd">
        {part.kbd}
      </kbd>
    ),
  );
}

export function AuthScreen({ isConnecting, error, onConnect }: Props) {
  const [clientId, setClientId] = useState("");
  const [token, setToken] = useState("");

  return (
    <div className="sc-auth">
      <div className="sc-auth__logo">
        <svg viewBox="0 0 24 24" width="56" height="56" aria-hidden="true">
          <rect width="24" height="24" rx="4" fill="#ff5500" />
          <path
            fill="white"
            d="M23.999 14.165c-.052 1.796-1.612 3.169-3.4 3.169h-8.18a.68.68 0 0 1-.675-.683V7.862a.747.747 0 0 1 .452-.724s.75-.513 2.333-.513a5.364 5.364 0 0 1 2.763.755 5.433 5.433 0 0 1 2.57 3.54c.282-.08.574-.121.868-.12.884 0 1.73.358 2.347.992s.948 1.49.922 2.373ZM10.721 8.421c.247 2.98.427 5.697 0 8.672a.264.264 0 0 1-.53 0c-.395-2.946-.22-5.718 0-8.672a.264.264 0 0 1 .53 0ZM9.072 9.448c.285 2.659.37 4.986-.006 7.655a.277.277 0 0 1-.55 0c-.331-2.63-.256-5.02 0-7.655a.277.277 0 0 1 .556 0Zm-1.663-.257c.27 2.726.39 5.171 0 7.904a.266.266 0 0 1-.532 0c-.38-2.69-.257-5.21 0-7.904a.266.266 0 0 1 .532 0Zm-1.647.77a26.108 26.108 0 0 1-.008 7.147.272.272 0 0 1-.542 0 27.955 27.955 0 0 1 0-7.147.275.275 0 0 1 .55 0Zm-1.67 1.769c.421 1.865.228 3.5-.029 5.388a.257.257 0 0 1-.514 0c-.21-1.858-.398-3.549 0-5.389a.272.272 0 0 1 .543 0Zm-1.655-.273c.388 1.897.26 3.508-.01 5.412-.026.28-.514.283-.54 0-.244-1.878-.347-3.54-.01-5.412a.283.283 0 0 1 .56 0Zm-1.668.911c.4 1.268.257 2.292-.026 3.572a.257.257 0 0 1-.514 0c-.241-1.262-.354-2.312-.023-3.572a.283.283 0 0 1 .563 0Z"
          />
        </svg>
        <h1 className="sc-auth__title">{t("auth_title")}</h1>
        <p className="sc-auth__subtitle">{t("auth_subtitle")}</p>
      </div>

      <div className="sc-auth__form">
        <p className="sc-auth__section-title">{t("auth_section")}</p>

        <ol className="sc-auth__steps">
          <li>{t("auth_step1")}</li>
          <li>{renderKbd("auth_step2")}</li>
          <li>{t("auth_step3")}</li>
          <li>{t("auth_step4")}</li>
          <li>{t("auth_step5")}</li>
        </ol>

        <label className="sc-label" htmlFor="sc-clientid-input">
          {t("auth_client_id")}
        </label>
        <input
          id="sc-clientid-input"
          type="text"
          className="sc-input"
          placeholder="e.g. IRnK0myxxLJdwXXjybXQo71m…"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
        />

        <label className="sc-label" htmlFor="sc-token-input">
          {t("auth_token")}
        </label>
        <input
          id="sc-token-input"
          type="password"
          className="sc-input"
          placeholder="e.g. 2-123456-7890123-xxxxxxxx"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
        />
        <p className="sc-auth__small">{t("auth_token_hint")}</p>

        {error && <div className="sc-error">{error}</div>}

        <button
          className="sc-btn-primary"
          onClick={() => onConnect(clientId, token)}
          disabled={isConnecting || !clientId.trim() || !token.trim()}
        >
          {isConnecting ? t("btn_connecting") : t("btn_connect")}
        </button>
      </div>
    </div>
  );
}
