import { useCallback, useState } from "react";
import { SCSettings } from "../types/soundcloud";
import { loadSettings, saveSettings } from "../services/auth";
import { getMe, updateApiSettings } from "../services/api";
import { t } from "../i18n";

export function useAuth() {
  const [settings, setSettings] = useState<SCSettings>(loadSettings);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applySettings = useCallback((updated: SCSettings) => {
    saveSettings(updated);
    updateApiSettings(updated);
    setSettings(updated);
  }, []);

  /**
   * Validate and persist credentials.
   * Both values come from DevTools on soundcloud.com:
   *   clientId  — the ?client_id= param in any api-v2.soundcloud.com request URL
   *   rawToken  — the Authorization header value (with or without "OAuth " prefix)
   */
  const connect = useCallback(
    async (rawClientId: string, rawToken: string) => {
      const clientId = rawClientId.trim();
      const oauthToken = rawToken.trim().replace(/^OAuth\s+/i, "");

      if (!clientId || !oauthToken) {
        setError(t("err_credentials"));
        return;
      }

      setIsConnecting(true);
      setError(null);

      try {
        updateApiSettings({ clientId, oauthToken });
        await getMe(); // throws on wrong credentials
        applySettings({ clientId, oauthToken });
      } catch (err) {
        setError(err instanceof Error ? err.message : t("err_connection"));
        updateApiSettings(settings); // roll back
      } finally {
        setIsConnecting(false);
      }
    },
    [settings, applySettings],
  );

  const disconnect = useCallback(() => {
    applySettings({ clientId: "", oauthToken: "" });
  }, [applySettings]);

  return {
    isAuthed: Boolean(settings.oauthToken && settings.clientId),
    isConnecting,
    error,
    connect,
    disconnect,
  };
}
