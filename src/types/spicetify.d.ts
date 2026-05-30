// Ambient declarations for Spicetify globals not bundled by spicetify-creator.
// Only the subset used by SpiceCloud is declared here.

declare namespace Spicetify {
  namespace LocalStorage {
    function get(key: string): string | null;
    function set(key: string, value: string): void;
    function remove(key: string): void;
  }

  namespace Player {
    /** Current playback state; populated by Spicetify before any event fires. */
    const data: {
      isPaused: boolean;
      duration: number;
      position: number;
      item?: { uri: string };
    } | null;

    function addEventListener(
      event: "onplaypause" | "songchange" | string,
      callback: (event?: Event) => void,
    ): void;
    function removeEventListener(
      event: string,
      callback: (event?: Event) => void,
    ): void;
    function play(): void;
    function pause(): void;
    function seek(posMs: number): void;
    function next(): void;
    function back(): void;
    function getMute(): boolean;
    function setMute(mute: boolean): void;
    function getVolume(): number;
    function setVolume(vol: number): void;
    function isPlaying(): boolean;
  }

  /**
   * HTTP client that routes through Spotify's networking layer.
   * Unlike browser fetch(), this bypasses Chromium's CORS enforcement.
   */
  namespace CosmosAsync {
    interface Body {
      version: number;
      status: number;
      /** Array of [name, value] pairs. */
      headers: [string, string][];
      /** Parsed response body — JSON object for JSON endpoints, string otherwise. */
      body: unknown;
    }
    function get(url: string, body?: Record<string, unknown>): Promise<Body>;
    function post(url: string, body?: Record<string, unknown>): Promise<Body>;
    function put(url: string, body?: Record<string, unknown>): Promise<Body>;
    function del(url: string, body?: Record<string, unknown>): Promise<Body>;
  }

  /** Internal platform APIs; only used here as a readiness sentinel. */
  const Platform: unknown;

  const React: typeof import("react");
  const ReactDOM: typeof import("react-dom");
}

// Allow runtime guard: `if (window.Spicetify?.Player)` without a TS error.
interface Window {
  Spicetify?: typeof Spicetify;
}
