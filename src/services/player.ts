// player.ts
import { SCTrack } from "../types/soundcloud";
import { getTrackStreams, resolveTranscodingUrl } from "./api";
import { log, warn, error as logError } from "./debug";

export interface PlayerState {
  track: SCTrack | null;
  isPlaying: boolean;
  position: number; // 0-1
  duration: number; // seconds
  volume: number;
  isMuted: boolean;
  isLoading: boolean;
  error: string | null;
  scVolMultEnabled: boolean;
  scVolumeLevel: number;
}

type Listener = (state: PlayerState) => void;

// ── Spotify DOM selectors ─────────────────────────────────────────────────────
const SEL_TITLE = [
  ".main-trackInfo-name:not([data-encore-id])", // outer layout container — correct ::before positioning
  '[data-encore-id="text"].main-trackInfo-name', // fallback: inner Encore text node
  ".main-trackInfo-name",
  '[data-testid="context-item-info-title"]',
  ".now-playing__name",
];
const SEL_ARTIST = [
  ".main-trackInfo-artists:not([data-encore-id])", // outer layout container — correct ::before positioning
  '[data-encore-id="text"].main-trackInfo-artists', // fallback: inner Encore text node
  ".main-trackInfo-artists",
  '[data-testid="context-item-info-subtitles"]',
  ".now-playing__artist",
];
const SEL_COVER = [
  ".main-coverSlotCollapsed-container img",
  '[data-testid="cover-art-image"]',
  ".cover-art-image",
];
const SEL_POS_TEXT = [
  '[data-testid="playback-position"]',
  ".playback-progressbar__time-elapsed",
];
const SEL_DUR_TEXT = [
  '[data-testid="playback-duration"]',
  ".playback-progressbar__time-total",
];
//delete SEL_PROGRESS array as it is no longer used
const SEL_VOLUME = [
  '[data-testid="volume-bar"] input[type="range"]',
  'input[aria-label*="volume" i]',
  'input[aria-label*="Lautstärke" i]',
  'input[aria-label*="Volumen" i]',
  '.volume-bar input[type="range"]',
];
const SEL_SKIP_FWD = [
  '[data-testid="control-button-skip-forward"]',
  'button[aria-label*="Next" i]',
];
const SEL_SKIP_BCK = [
  '[data-testid="control-button-skip-back"]',
  'button[aria-label*="Previous" i]',
];
const SEL_PLAYPAUSE = ['[data-testid="control-button-playpause"]'];
const SEL_PROGRESS_WRAP = [
  '[data-testid="playback-progressbar"]',
  ".playback-progressbar",
];

function q<T extends Element = Element>(sels: string[]): T | null {
  for (const s of sels) {
    const el = document.querySelector<T>(s);
    if (el) return el;
  }
  return null;
}

function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60),
    sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

//Delete the nativeRangeSet, as it is no longer used.

// Pause-icon SVG as data-URL for CSS mask (matches Spotify's icon style).
const PAUSE_ICON_URL =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M2.7 1a.7.7 0 0 0-.7.7v12.6a.7.7 0 0 0 .7.7h2.6a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7H2.7zm8 0a.7.7 0 0 0-.7.7v12.6a.7.7 0 0 0 .7.7h2.6a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7h-2.6z'/%3E%3C/svg%3E\")";

class SoundCloudPlayer {
  private audio: HTMLAudioElement;
  private _track: SCTrack | null = null;
  private _isLoading = false;
  private _error: string | null = null;
  private _loadId = 0;
  private queue: SCTrack[] = [];
  private queueIndex = -1;
  private listeners: Set<Listener> = new Set();
  private progressTimer: ReturnType<typeof setInterval> | null = null;
  // Set right before we call Spicetify.Player.pause() ourselves so the
  // resulting onplaypause echo isn't mistaken for a user/media-key toggle.
  private _ignoreNextPlayPause = false;
  private _sourceBadge: HTMLElement | null = null;
  private _tryHookSkipButtons: (() => void) | null = null;
  private _tryHookProgressBar: (() => void) | null = null;
  private _tryHookVolumeInput: (() => void) | null = null;
  // Seek guard — when user is dragging the progress bar we must not overwrite
  // the range input's value or the thumb snaps back every 250 ms.
  private _isSeeking = false;
  // Live reference to the progress-bar wrapper + a one-time flag for the
  // document-level pointer-up listener that ends a seek (see hookProgressBar).
  private _progressWrap: HTMLElement | null = null;
  private _seekDocBound = false;
  // Our own progress bar, overlaid on Spotify's (whose fill/thumb/hover-tooltip
  // are bound to Spotify's own paused track length and so can't reflect the SC
  // track). Fully driven by SC position — see ensureProgressOverlay().
  private _progressOverlay: HTMLElement | null = null;
  // Always-on interval that keeps the source badge in sync with whatever is
  // actually playing (SoundCloud vs Spotify), even when no SC track is loaded
  // and the 250 ms SC timer isn't running.
  private badgeTimer: ReturnType<typeof setInterval> | null = null;
  // Mute-state cache — avoids querySelectorAll("audio") on every 250 ms tick.
  private _spotifyMuted = false;
  private _muteCheckAt = 0;
  // Cached now-playing bar elements — re-queried only when detached.
  private _cachedTitleEl: Element | null = null;
  private _cachedArtistEl: Element | null = null;
  private _cachedCoverEl: HTMLImageElement | null = null;
  private _cachedPosEl: Element | null = null;
  private _cachedDurEl: Element | null = null;
  private _cachedRangeEl: HTMLInputElement | null = null;
  // Direct references to the SC progress-overlay children (never re-query).
  private _progressFill: HTMLElement | null = null;
  private _progressThumb: HTMLElement | null = null;

  //Allow SC tracks to be quieter than Spotify's master volume
  //Added other properties for Spotify slider to visually switch to the SC volume when SC plays, 
  //and restore Spotify volume when SC stops
  private _scVolMultEnabled: boolean = true;
  private _scVolumeLevel: number = 0.5;
  private _savedSpotifyVolume: number | null = null;
  private _isUpdatingSpotifyRange: boolean = false;

  constructor() {
    this.audio = document.createElement("audio");
    this.audio.id = "spicecloud-audio";
    document.body.appendChild(this.audio);
    log("player", "initialized, audio element created");
    this.bindAudioEvents();
    this.injectStyles();
    this.waitForSpicetify();
  }

  private waitForSpicetify(): void {
    if (
      typeof Spicetify === "undefined" ||
      !Spicetify.Player ||
      !Spicetify.Platform
    ) {
      setTimeout(() => this.waitForSpicetify(), 100);
      return;
    }
    log("player", "Spicetify ready, hooking transport");
    // load saved SC volume settings from LocalStorage
    try {
      this._scVolMultEnabled = Spicetify.LocalStorage.get("spicecloud_sc_vol_enabled") !== "false";
      const savedVol = Spicetify.LocalStorage.get("spicecloud_sc_vol_level");
      if (savedVol !== null) {
        this._scVolumeLevel = Math.max(0, Math.min(1, parseFloat(savedVol)));
      }
      log("player", "Loaded SC volume settings: enabled=%s, level=%.2f", this._scVolMultEnabled, this._scVolumeLevel);
    } catch {}
    this.hookSpotifyPlayer();
    this.hookSkipButtons();
    this.hookProgressBar();
    // Keep the source badge live even when Spotify (not SC) is the active
    // source — Spotify's own play/songchange don't always reach our handlers.
    if (this.badgeTimer === null) {
      this.badgeTimer = setInterval(() => this.refreshSourceBadge(), 2000);
    }
    this.refreshSourceBadge();
  }

  // ── Audio events ──────────────────────────────────────────────────────────

  private bindAudioEvents(): void {
    this.audio.addEventListener("play", () => {
      log("player", "audio play — track: %s", this._track?.title ?? "(none)");
      document.body.classList.add("sc-playing");
      this.startTimer();
      this.emit();
      this.refreshSourceBadge();
    });
    this.audio.addEventListener("pause", () => {
      log("player", "audio pause");
      document.body.classList.remove("sc-playing");
      // Do NOT stop the timer here — the mute loop must keep running while
      // _track is set so Spotify's audio stays silent even when SC is paused.
      // stopTimer() is called only when _track is cleared (songchange / destroy).
      this.emit();
      this.refreshSourceBadge();
    });
    this.audio.addEventListener("ended", () => {
      log(
        "player",
        "audio ended, advancing queue (%d/%d)",
        this.queueIndex + 1,
        this.queue.length,
      );
      void this.next();
      this.refreshSourceBadge();
    });
    this.audio.addEventListener("loadedmetadata", () => {
      log("player", "loadedmetadata — duration: %.1fs", this.audio.duration);
      this.emit();
    });
    this.audio.addEventListener("volumechange", () => this.emit());
    this.audio.addEventListener("error", () => {
      logError(
        "player",
        "audio error:",
        this.audio.error?.message ?? "unknown",
      );
      this._isLoading = false;
      this._error = "Stream error — track may be unavailable";
      this.emit();
    });
  }

  // ── Spotify muting ────────────────────────────────────────────────────────
  //
  // We mute every <audio> that isn't ours as a safety measure to prevent any
  // Spotify audio from leaking through. Spotify itself stays paused (so its
  // track position doesn't advance), and its button state is handled by CSS.

  private muteSpotifyAudio(muted: boolean): void {
    const now = Date.now();
    // Skip the querySelectorAll scan when we're already in the desired mute
    // state and checked recently (5 s).  Always apply unmute immediately so
    // Spotify audio is never stuck silent after SC stops.
    if (muted && this._spotifyMuted && now - this._muteCheckAt < 5000) return;
    this._spotifyMuted = muted;
    this._muteCheckAt = now;
    try {
      document.querySelectorAll<HTMLAudioElement>("audio").forEach((el) => {
        if (el !== this.audio) {
          el.muted = muted;
          //restore volume to 1 when unmuting so Spotify isn't stuck silent
          el.volume = muted ? 0 : 1;
        }
      });
    } catch {}
  }

  // Keep Spotify silent and paused while an SC track is loaded. Pausing stops
  // Spotify's position from advancing (so its progress bar stays put for us to
  // overwrite) and guarantees no audio bleed. We mark the echo to be ignored.
  private forceSpotifyPaused(): void {
    try {
      if (typeof Spicetify !== "undefined" && Spicetify.Player?.isPlaying?.()) {
        this._ignoreNextPlayPause = true;
        Spicetify.Player.pause();
      }
    } catch {}
    this.muteSpotifyAudio(true);
  }

  // Toggle ONLY our own audio element. Spotify's transport is never touched.
  private toggleSc(): void {
    if (!this._track || this._error) return;
    if (this.audio.paused) {
      this.muteSpotifyAudio(true);
      void this.audio.play().catch(() => {});
    } else {
      this.audio.pause();
    }
  }

  // ── Spotify integration ───────────────────────────────────────────────────

  private hookSpotifyPlayer(): void {
    try {
      // ── Play / Pause ──────────────────────────────────────────────────────
      //
      // The on-screen play/pause button is intercepted directly in capture
      // phase (see hookTransportButtons) so Spotify never toggles its own
      // transport from a click. This onplaypause handler is only a *fallback*
      // for external toggles we cannot intercept (media keys, headset buttons).
      //
      // For those: Spotify just flipped its own state. We force it back to the
      // paused+muted baseline and mirror the user's intent onto SC audio. The
      // _ignoreNextPlayPause guard swallows the echo from our own pause() call.
      Spicetify.Player.addEventListener("onplaypause", () => {
        try {
          if (this._ignoreNextPlayPause) {
            log("player", "onplaypause — ignored (our own echo)");
            this._ignoreNextPlayPause = false;
            return;
          }
          log(
            "player",
            "onplaypause — SC active=%s, loading=%s",
            !!this._track,
            this._isLoading,
          );
          if (this._track && !this._isLoading) {
            this.forceSpotifyPaused();
            this.toggleSc();
          }
        } catch {}
        // Reflect the new state on the badge — covers Spotify-only playback,
        // where there's no SC track and the block above is skipped.
        this.refreshSourceBadge();
      });

      //removed onvolumechange...

      // Direct input listener on the volume slider — fires on every drag step
      // so SC audio tracks the slider in real-time without waiting for the
      // 250ms timer or a Spicetify event.
      const hookVolumeInput = () => {
        // Mirror the mute button so clicking mute also silences SC audio.
        const muteBtn = document.querySelector<HTMLButtonElement>('[data-testid="volume-bar-toggle-mute-button"]');
        if (muteBtn && !(muteBtn as HTMLButtonElement & { _scMute?: boolean })._scMute) {
          (muteBtn as HTMLButtonElement & { _scMute?: boolean })._scMute = true;
          muteBtn.addEventListener("click", () => {
            if (!this._track) return;
            setTimeout(() => { this.audio.muted = !this.audio.muted; }, 50);
          });
        }
      };
      this._tryHookVolumeInput = hookVolumeInput;
      hookVolumeInput();
      [500, 1500, 4000].forEach((ms) => setTimeout(hookVolumeInput, ms));

      //Why: Spotify sometimes emits skipNext or forward events while the SC track is playing. 
      // This triggers doNext, which immediately calls next(), stopping the track prematurely. 
      // Already intersept physical skip buttons via hookSkipButtons, so 
      // these event listeners are redundant and cause race conditions.

      // ── Song change — Spotify navigated away ──────────────────────────────
      Spicetify.Player.addEventListener("songchange", () => {
        try {
          if (!this._track) return;
          log(
            "player",
            "songchange — clearing SC track '%s'",
            this._track.title,
          );
          // Increment loadId to abort any in-flight loadTrack promise.
          // Without this, a resolveStreamUrl() still in-flight would continue
          // after this handler clears _track, set sc-active again, and restart
          // SC audio on top of Spotify — causing the hard crash.
          this._loadId++;
          this.audio.pause();

          //FIX: Clear track reference BEFORE triggering setSyncedVolume input events
          this._track = null;
          this._error = null;
          this.stopTimer();
          this.muteSpotifyAudio(false);
          this.updateSourceBadge(null);
          document.body.classList.remove("sc-active", "sc-playing");

          // Restore Spotify's volume profile visually
          if (this._scVolMultEnabled && this._savedSpotifyVolume !== null) {
            this.setSyncedVolume(this._savedSpotifyVolume);
            this._savedSpotifyVolume = null;
          }

          this._cachedTitleEl = null;
          this._cachedArtistEl = null;
          this._cachedCoverEl = null;
          this._cachedPosEl = null;
          this._cachedDurEl = null;
          this._cachedRangeEl = null;
          this.emit();
        } catch {}
      });
    } catch {
      // Spicetify.Player unavailable (running outside Spicetify).
    }
  }

  // ── Skip-button intercept ─────────────────────────────────────────────────

  private hookSkipButtons(): void {
    const hookBtn = (sels: string[], handler: () => void): boolean => {
      for (const sel of sels) {
        const btn = document.querySelector<HTMLButtonElement>(sel);
        if (!btn || (btn as HTMLButtonElement & { _sc?: boolean })._sc)
          continue;
        (btn as HTMLButtonElement & { _sc?: boolean })._sc = true;
        btn.addEventListener(
          "click",
          (e) => {
            if (!this._track) return; //SC not active, let Spotify handle it

            // If we are at the end of the SC queue and user clicks Next
            if (sels === SEL_SKIP_FWD && this.queueIndex >= this.queue.length - 1) {
              this._track = null;
              this.audio.pause();
              this.stopTimer();
              this.muteSpotifyAudio(false);
              document.body.classList.remove("sc-active", "sc-playing");
              return; //Let Spotify handle the skip natively
            }

            // If we are at the first SC track and user clicks Previous (and track just started)
            if (sels === SEL_SKIP_BCK && this.queueIndex <= 0 && this.audio.currentTime <= 3) {
              this._track = null;
              this.audio.pause();
              this.stopTimer();
              this.muteSpotifyAudio(false);
              document.body.classList.remove("sc-active", "sc-playing");
              return; //Let Spotify handle the previous natively
            }

            e.stopImmediatePropagation();
            e.preventDefault();
            handler();
          },
          true,
        );
        return true;
      }
      return false;
    };
    const tryHook = () => {
      // Intercept the main play/pause button so a click controls SC audio
      // directly and Spotify never toggles its own transport (which would
      // resume Spotify's audio and invert the button's visual state).
      const pp = hookBtn(SEL_PLAYPAUSE, () => this.toggleSc());
      const fwd = hookBtn(SEL_SKIP_FWD, () => void this.next());
      const bck = hookBtn(SEL_SKIP_BCK, () => void this.prev());
      if (pp || fwd || bck)
        log("player", "transport buttons hooked (playpause/next/prev)");
    };
    this._tryHookSkipButtons = tryHook;
    tryHook();
    [500, 1500, 4000, 10000].forEach((ms) => setTimeout(tryHook, ms));
  }

  // ── Progress bar seek intercept ───────────────────────────────────────────
  //
  // syncSpotifyProgress() writes the range input's value every 250 ms via the
  // native setter.  Without a guard, a user drag would snap back immediately.
  // We hook mousedown/touchstart to set _isSeeking=true (pausing our writes),
  // and mouseup/touchend to apply the seek and release the guard.

  private hookProgressBar(): void {
    // Bind the seek-release listener ONCE on document. Previously the release
    // was handled by a `click` on the bar, but Spotify often swallows it (or the
    // pointer leaves the bar mid-drag), leaving _isSeeking stuck true forever —
    // which permanently skips our fill writes so the bar freezes on Spotify's
    // position. A document-level pointer-up always fires, so the guard clears.
    if (!this._seekDocBound) {
      this._seekDocBound = true;
      const finishSeek = (clientX: number) => {
        if (!this._isSeeking) return;
        this._isSeeking = false;
        const wrap = this._progressWrap;
        if (!this._track || !wrap) return;
        const rect = wrap.getBoundingClientRect();
        if (rect.width <= 0) return;
        const r = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        this.seek(r);
        this.syncSpotifyProgress();
      };
      document.addEventListener("mouseup", (e) => finishSeek(e.clientX), true);
      document.addEventListener(
        "touchend",
        (e) => {
          const t = e.changedTouches[0];
          if (t) finishSeek(t.clientX);
          else this._isSeeking = false;
        },
        true,
      );
    }

    // (Re)build our overlay bar inside Spotify's wrapper. Re-runs on the 250 ms
    // timer so it re-attaches whenever Spotify re-renders and drops it.
    const tryHook = () => this.ensureProgressOverlay();

    this._tryHookProgressBar = tryHook;
    tryHook();
    [500, 1500, 4000].forEach((ms) => setTimeout(tryHook, ms));
  }

  // Build (once) the SC-driven progress bar that overlays Spotify's hidden one.
  // Handles its own hover tooltip + seek so every value reflects the SC track,
  // not Spotify's paused track. Re-created automatically if Spotify wipes it.
  private ensureProgressOverlay(): void {
    let wrap = this._progressWrap;
    if (!wrap || !document.contains(wrap)) {
      wrap = q<HTMLElement>(SEL_PROGRESS_WRAP);
      if (!wrap) return;
      this._progressWrap = wrap;
    }

    let ov = this._progressOverlay;
    if (ov && !document.contains(ov)) {
      ov = null;
      this._progressFill = null;
      this._progressThumb = null;
    }
    if (ov && ov.parentElement !== wrap) {
      ov.remove();
      ov = null;
      this._progressFill = null;
      this._progressThumb = null;
    }
    if (ov) return; // already in place

    log(
      "player",
      "progress overlay %s",
      this._progressOverlay ? "recreated (Spotify re-rendered)" : "created",
    );
    ov = document.createElement("div");
    ov.id = "sc-progress";
    ov.innerHTML =
      `<div class="sc-progress__track">` +
      `<div class="sc-progress__fill"></div>` +
      `<div class="sc-progress__thumb"></div>` +
      `</div>` +
      `<div class="sc-progress__tip"></div>`;
    const fill = ov.querySelector(".sc-progress__fill") as HTMLElement;
    const thumb = ov.querySelector(".sc-progress__thumb") as HTMLElement;
    const track = ov.querySelector(".sc-progress__track") as HTMLElement;
    const tip = ov.querySelector(".sc-progress__tip") as HTMLElement;

    const ratioFromX = (clientX: number): number => {
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return 0;
      return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    };
    const scDuration = (): number => {
      const d = this.audio.duration;
      if (isFinite(d) && d > 0) return d;
      return this._track ? this._track.duration / 1000 : 0;
    };

    const overlay = ov;
    overlay.addEventListener("mousemove", (e) => {
      if (!this._track) return;
      e.stopPropagation(); // suppress Spotify's own (wrong) hover tooltip
      const ratio = ratioFromX(e.clientX);
      tip.textContent = fmtTime(ratio * scDuration());
      tip.style.left = `${ratio * 100}%`;
      overlay.classList.add("sc-progress--hover");
      if (this._isSeeking) this.updateProgressOverlay(ratio);
    });
    overlay.addEventListener("mouseleave", () => {
      overlay.classList.remove("sc-progress--hover");
    });
    overlay.addEventListener("mousedown", (e) => {
      if (!this._track) return;
      e.stopPropagation();
      this._isSeeking = true; // document mouseup (above) applies the seek
      this.updateProgressOverlay(ratioFromX(e.clientX));
    });

    wrap.appendChild(overlay);
    this._progressOverlay = overlay;
    this._progressFill = fill;
    this._progressThumb = thumb;
  }

  // Paint the overlay fill + thumb to a 0..1 fraction of the SC track.
  private updateProgressOverlay(fraction: number): void {
    if (!this._progressOverlay) return;
    const pct = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
    if (this._progressFill) this._progressFill.style.width = pct;
    if (this._progressThumb) this._progressThumb.style.left = pct;
  }

  // ── CSS injection ────────────────────────────────────────────────────────

  private injectStyles(): void {
    if (document.getElementById("spicecloud-styles")) return;
    const s = document.createElement("style");
    s.id = "spicecloud-styles";
    s.textContent = `
      /*
       * Controls that don't work when SoundCloud is active — hide them.
       * Shuffle / repeat: SC manages its own linear queue.
       * Lyrics / queue / connect / mini-player / fullscreen: Spotify-only features.
       * Like button: would add the paused Spotify track to Spotify favourites.
       */
      body.sc-active [data-testid="control-button-shuffle"],
      body.sc-active button[aria-label*="Shuffle" i],
      body.sc-active [data-testid="control-button-repeat"],
      body.sc-active [data-testid="lyrics-button"],
      body.sc-active [data-testid="control-button-queue"],
      body.sc-active [data-testid="devices-button"],
      body.sc-active [aria-describedby="connect-message-nudge"],
      body.sc-active button[aria-label*="Gerät verbinden" i],
      body.sc-active button[aria-label*="Connect to a device" i],
      body.sc-active button[aria-label*="Dispositivo" i],
      body.sc-active button[aria-label*="Appareil" i],
      body.sc-active [data-testid="pip-toggle-button"],
      body.sc-active [data-testid="fullscreen-mode-button"],
      body.sc-active .main-nowPlayingWidget-actionButtonWrapper,
      body.sc-active .main-trackList-enhanced { display: none !important; }


      /* QOL: Ensure SC progress overlay never blocks Spotify UI when SC is inactive */
      body:not(.sc-active) #sc-progress {
        display: none !important;
        pointer-events: none !important;
      }

      /*
       * Source badge — fixed so it always appears above Spotify's player bar
       * regardless of which DOM element we manage to anchor into.
       */
      #spicecloud-source-badge {
        position: fixed;
        bottom: 96px;
        left: 12px;
        display: none;
        align-items: center;
        gap: 6px;
        padding: 3px 9px 3px 7px;
        border-radius: 12px;
        font-size: 10px; font-weight: 700;
        color: #fff;
        letter-spacing: 0.04em; line-height: 1.6;
        white-space: nowrap;
        z-index: 9990;
        pointer-events: none;
        box-shadow: 0 2px 6px rgba(0,0,0,0.5);
        font-family: var(--font-family, system-ui, sans-serif);
      }
      #spicecloud-source-badge.sc-badge--soundcloud { background: #ff5500; }
      #spicecloud-source-badge.sc-badge--spotify { background: #1db954; }

      /*
       * Play/Pause button visual sync.
       * Spotify stays paused while SC is active (button shows ▶ natively).
       * When body.sc-playing: hide the SVG and overlay a ⏸ using CSS mask.
       * background-color: #000 — the large center button has a white circle
       * background; we need a dark icon to be visible against it.
       */
      body.sc-playing [data-testid="control-button-playpause"] {
        position: relative !important;
      }
      body.sc-playing [data-testid="control-button-playpause"] svg {
        visibility: hidden !important;
      }
      body.sc-playing [data-testid="control-button-playpause"]::after {
        content: '';
        position: absolute;
        top: 0; left: 0; right: 0; bottom: 0;
        -webkit-mask: ${PAUSE_ICON_URL} no-repeat center / 16px 16px;
        mask: ${PAUSE_ICON_URL} no-repeat center / 16px 16px;
        background-color: #000;
        pointer-events: none;
      }

      /*
       * Track-info overlay: data-sc-title / data-sc-artist stamped on the
       * outer track-info container divs + CSS ::before overlay that fills them.
       * Never touches textContent → no React reconciliation conflict.
       */
      body.sc-active [data-encore-id="text"].main-trackInfo-name,
      body.sc-active [data-encore-id="text"].main-trackInfo-artists,
      body.sc-active .main-trackInfo-name,
      body.sc-active .main-trackInfo-artists,
      body.sc-active [data-testid="context-item-info-title"],
      body.sc-active [data-testid="context-item-info-subtitles"],
      body.sc-active .now-playing__name,
      body.sc-active .now-playing__artist {
        color: transparent !important;
        position: relative !important;
        overflow: hidden !important;
      }
      body.sc-active [data-encore-id="text"].main-trackInfo-name *,
      body.sc-active [data-encore-id="text"].main-trackInfo-artists *,
      body.sc-active .main-trackInfo-name *,
      body.sc-active .main-trackInfo-artists *,
      body.sc-active [data-testid="context-item-info-title"] *,
      body.sc-active [data-testid="context-item-info-subtitles"] *,
      body.sc-active .now-playing__name *,
      body.sc-active .now-playing__artist * { color: transparent !important; }

      /*
       * Show the FULL SoundCloud title/artist. Spotify clips them to a measured
       * marquee window (--marquee-width, e.g. 101px for a short Spotify title),
       * so longer SC titles get cut off. Expand the whole marquee chain to the
       * track-info width and disable the marquee so our ::before overlay only
       * ellipsizes at the real edge. Scoped to sc-active → Spotify untouched
       * otherwise.
       */
      body.sc-active .main-trackInfo-name .main-trackInfo-overlay,
      body.sc-active .main-trackInfo-artists .main-trackInfo-overlay {
        width: 100% !important;
        max-width: 100% !important;
      }
      body.sc-active .main-trackInfo-name .main-trackInfo-overlay *,
      body.sc-active .main-trackInfo-artists .main-trackInfo-overlay * {
        display: block !important;
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;
        --marquee-width: 100% !important;
        transform: none !important;
        animation: none !important;
      }

      body.sc-active .main-trackInfo-name[data-sc-title]::before,
      body.sc-active [data-testid="context-item-info-title"][data-sc-title]::before,
      body.sc-active .now-playing__name[data-sc-title]::before {
        content: attr(data-sc-title);
        color: #fff;
        position: absolute;
        inset: 0;
        z-index: 9999;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font: inherit;
        display: flex; align-items: center;
      }
      body.sc-active .main-trackInfo-artists[data-sc-artist]::before,
      body.sc-active [data-testid="context-item-info-subtitles"][data-sc-artist]::before,
      body.sc-active .now-playing__artist[data-sc-artist]::before {
        content: attr(data-sc-artist);
        color: rgba(255,255,255,0.7);
        position: absolute;
        inset: 0;
        z-index: 9999;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font: inherit;
        display: flex; align-items: center;
      }

      /*
       * Time-label overlay: data-sc-time attribute + CSS ::before.
       * Never touches textContent → no React reconciliation conflict.
       */
      body.sc-active [data-testid="playback-position"],
      body.sc-active [data-testid="playback-duration"],
      body.sc-active .playback-progressbar__time-elapsed,
      body.sc-active .playback-progressbar__time-total {
        color: transparent !important;
        position: relative !important;
      }
      body.sc-active [data-testid="playback-position"]::before,
      body.sc-active [data-testid="playback-duration"]::before,
      body.sc-active .playback-progressbar__time-elapsed::before,
      body.sc-active .playback-progressbar__time-total::before {
        content: attr(data-sc-time);
        color: var(--spice-subtext, #b3b3b3);
        position: absolute;
        z-index: 1;
        top: 0; left: 0; right: 0; bottom: 0;
        display: flex; align-items: center; justify-content: center;
      }

      /*
       * Custom SoundCloud progress bar.
       * Spotify's own fill/thumb/hover-tooltip are computed from ITS paused
       * track's length, so they can't reflect the SC track. We hide Spotify's
       * inner bar and overlay our own, fully driven by the SC position. The
       * overlay sits on top with pointer events, so Spotify never sees hover or
       * clicks (and thus never shows its wrong tooltip).
       */
      body.sc-active [data-testid="playback-progressbar"] { position: relative; }
      body.sc-active [data-testid="playback-progressbar"] [data-testid="progress-bar"] {
        visibility: hidden !important;
      }
      #sc-progress { display: none; }
      body.sc-active #sc-progress {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        cursor: pointer;
        z-index: 10;
        /* Expand hitbox vertically to make dragging easier without changing visual height */
        padding: 12px 0;
        margin: -12px 0;
      }
      #sc-progress .sc-progress__track {
        position: relative;
        width: 100%;
        height: 4px;
        border-radius: 2px;
        background: var(--background-tinted-base, rgba(255,255,255,0.3));
        /* Fix: Ensure track stays visually centered in the expanded hitbox */
        margin-top: auto;
        margin-bottom: auto;
      }
      #sc-progress .sc-progress__fill {
        position: absolute;
        left: 0; top: 0; bottom: 0;
        width: 0%;
        border-radius: 2px;
        background: var(--spice-text, #fff);
      }
      #sc-progress:hover .sc-progress__fill,
      #sc-progress.sc-progress--hover .sc-progress__fill {
        background: #1ed760;
      }
      #sc-progress .sc-progress__thumb {
        position: absolute;
        top: 50%; left: 0%;
        width: 12px; height: 12px;
        margin-left: -6px;
        border-radius: 50%;
        background: #fff;
        transform: translateY(-50%);
        opacity: 0;
        transition: opacity 0.1s;
      }
      #sc-progress:hover .sc-progress__thumb,
      #sc-progress.sc-progress--hover .sc-progress__thumb {
        opacity: 1;
      }
      #sc-progress .sc-progress__tip {
        position: absolute;
        bottom: 100%;
        left: 0;
        transform: translateX(-50%);
        margin-bottom: 8px;
        padding: 3px 7px;
        border-radius: 4px;
        background: #000;
        color: #fff;
        font-size: 11px; font-weight: 600;
        white-space: nowrap;
        pointer-events: none;
        opacity: 0;
        font-family: var(--font-family, system-ui, sans-serif);
      }
      #sc-progress.sc-progress--hover .sc-progress__tip { opacity: 1; }
    `;
    document.head.appendChild(s);
  }

  // ── Volume helpers ────────────────────────────────────────────────────────

  private readSpotifyVolume(): number | null {
    try {
      const inp = q<HTMLInputElement>(SEL_VOLUME);
      if (!inp) return null;
      const max = parseFloat(inp.max);
      const val = parseFloat(inp.value);
      if (!isFinite(val)) return null;
      return isFinite(max) && max > 1 ? val / max : val;
    } catch {
      return null;
    }
  }

  private _lastCheckedVolume: number = -1;
  private checkVolumeChanges(): void {
    if (this._isUpdatingSpotifyRange) return;
    try {
      const vol = Spicetify.Player.getVolume();
      // If the volume changed since we last checked
      if (Math.abs(vol - this._lastCheckedVolume) > 0.001) {
        this._lastCheckedVolume = vol;
        if (this._track) {
          this.audio.volume = vol;
          if (this._scVolMultEnabled) {
            this._scVolumeLevel = vol;
            try { Spicetify.LocalStorage.set("spicecloud_sc_vol_level", String(vol)); } catch {}
          }
        }
      }
    } catch {}
  }

  // ── Source badge ─────────────────────────────────────────────────────────

  private updateSourceBadge(source: "soundcloud" | "spotify" | null): void {
    if (this._sourceBadge && !document.contains(this._sourceBadge)) {
      this._sourceBadge = null;
    }
    if (!this._sourceBadge) {
      const el = document.createElement("div");
      el.id = "spicecloud-source-badge";
      document.body.appendChild(el);
      this._sourceBadge = el;
    }

    if (!source) {
      this._sourceBadge.style.display = "none";
      this._sourceBadge.dataset.source = "";
      return;
    }

    // Re-render only when the source actually changes — the periodic refresh
    // calls this every tick, so dataset.source doubles as the render marker.
    if (this._sourceBadge.dataset.source !== source) {
      this._sourceBadge.dataset.source = source;
      this._sourceBadge.classList.toggle(
        "sc-badge--soundcloud",
        source === "soundcloud",
      );
      this._sourceBadge.classList.toggle(
        "sc-badge--spotify",
        source === "spotify",
      );
      const scSvg =
        `<svg viewBox="0 0 24 24" fill="white" width="16" height="16" aria-hidden="true">` +
        `<path d="M23.999 14.165c-.052 1.796-1.612 3.169-3.4 3.169h-8.18a.68.68 0 0 1-.675-.683V7.862a.747.747 0 0 1 .452-.724s.75-.513 2.333-.513a5.364 5.364 0 0 1 2.763.755 5.433 5.433 0 0 1 2.57 3.54c.282-.08.574-.121.868-.12.884 0 1.73.358 2.347.992s.948 1.49.922 2.373ZM10.721 8.421c.247 2.98.427 5.697 0 8.672a.264.264 0 0 1-.53 0c-.395-2.946-.22-5.718 0-8.672a.264.264 0 0 1 .53 0ZM9.072 9.448c.285 2.659.37 4.986-.006 7.655a.277.277 0 0 1-.55 0c-.331-2.63-.256-5.02 0-7.655a.277.277 0 0 1 .556 0Zm-1.663-.257c.27 2.726.39 5.171 0 7.904a.266.266 0 0 1-.532 0c-.38-2.69-.257-5.21 0-7.904a.266.266 0 0 1 .532 0Zm-1.647.77a26.108 26.108 0 0 1-.008 7.147.272.272 0 0 1-.542 0 27.955 27.955 0 0 1 0-7.147.275.275 0 0 1 .55 0Zm-1.67 1.769c.421 1.865.228 3.5-.029 5.388a.257.257 0 0 1-.514 0c-.21-1.858-.398-3.549 0-5.389a.272.272 0 0 1 .543 0Zm-1.655-.273c.388 1.897.26 3.508-.01 5.412-.026.28-.514.283-.54 0-.244-1.878-.347-3.54-.01-5.412a.283.283 0 0 1 .56 0Zm-1.668.911c.4 1.268.257 2.292-.026 3.572a.257.257 0 0 1-.514 0c-.241-1.262-.354-2.312-.023-3.572a.283.283 0 0 1 .563 0Z"/>` +
        `</svg>SoundCloud`;
      const spSvg =
        `<svg viewBox="0 0 24 24" fill="white" width="16" height="16" aria-hidden="true">` +
        `<path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>` +
        `</svg>Spotify`;
      this._sourceBadge.innerHTML = source === "spotify" ? spSvg : scSvg;
    }

    this._sourceBadge.style.display = "flex";
  }

  // Decide which source badge to show from current state:
  //   • SoundCloud — an SC track is actively playing or loading
  //   • Spotify    — no SC track active and Spotify is playing
  //   • none       — nothing is playing
  private refreshSourceBadge(): void {
    let source: "soundcloud" | "spotify" | null = null;
    if (this._track && (this._isLoading || !this.audio.paused)) {
      source = "soundcloud";
    } else {
      let spotifyPlaying = false;
      try {
        spotifyPlaying = !!Spicetify?.Player?.isPlaying?.();
      } catch {}
      if (spotifyPlaying) source = "spotify";
    }
    this.updateSourceBadge(source);
  }

  // ── Progress bar ─────────────────────────────────────────────────────────

  private syncSpotifyProgress(): void {
    if (
      !this._track ||
      !isFinite(this.audio.duration) ||
      this.audio.duration <= 0
    )
      return;
    const cur = this.audio.currentTime;
    const dur = this.audio.duration;
    const fraction = cur / dur;

    // Always update time labels (text changes don't interfere with drag).
    try {
      if (!this._cachedPosEl || !document.contains(this._cachedPosEl))
        this._cachedPosEl = q(SEL_POS_TEXT);
      if (this._cachedPosEl)
        this._cachedPosEl.setAttribute("data-sc-time", fmtTime(cur));
      if (!this._cachedDurEl || !document.contains(this._cachedDurEl))
        this._cachedDurEl = q(SEL_DUR_TEXT);
      if (this._cachedDurEl)
        this._cachedDurEl.setAttribute("data-sc-time", fmtTime(dur));
    } catch {}

    // Skip fill/thumb updates while the user is dragging — otherwise the
    // thumb snaps back to SC's current position every 250 ms.
    if (this._isSeeking) return;

    //paint our own overlay bar (Spotify's underlying bar is hidden via CSS),
    //so the fill exactly matches the SC track's position and length.
    this.updateProgressOverlay(fraction);

    // Fix: Do NOT update Spotify's range input value. It causes an asynchronous
    // feedback loop where Spotify thinks the user seeked, firing an onseek event
    // after our guard flag resets, and forces SC audio to jump to that position.
    // Our overlay (#sc-progress) handles the visual entirely.
  }

  // ── Now-playing metadata ──────────────────────────────────────────────────

  private updateNowPlayingBar(): void {
    document.body.classList.add("sc-active");
    this.applyTrackInfo();
    this.refreshSourceBadge();
    setTimeout(() => {
      this._tryHookSkipButtons?.();
      this._tryHookProgressBar?.();
    }, 150);
  }

  // Write the SC title / artist / cover onto Spotify's now-playing widget.
  // Runs on every timer tick (not just on load) because Spotify re-renders the
  // track-info widget (e.g. its marquee recalculation) and drops our attributes
  // — without re-applying, the bar reverts to the paused Spotify track's title.
  private applyTrackInfo(): void {
    const track = this._track;
    if (!track) return;
    try {
      if (!this._cachedTitleEl || !document.contains(this._cachedTitleEl))
        this._cachedTitleEl = q(SEL_TITLE);
      const t = this._cachedTitleEl;
      if (t && t.getAttribute("data-sc-title") !== track.title)
        t.setAttribute("data-sc-title", track.title);

      if (!this._cachedArtistEl || !document.contains(this._cachedArtistEl))
        this._cachedArtistEl = q(SEL_ARTIST);
      const a = this._cachedArtistEl;
      if (a && a.getAttribute("data-sc-artist") !== track.user.username)
        a.setAttribute("data-sc-artist", track.user.username);

      if (!this._cachedCoverEl || !document.contains(this._cachedCoverEl))
        this._cachedCoverEl = q<HTMLImageElement>(SEL_COVER);
      const c = this._cachedCoverEl;
      const art = track.artwork_url?.replace("-large", "-t500x500") ?? "";
      if (c && art && c.src !== art) c.src = art;
    } catch {}
  }

  // ── Stream URL resolution ─────────────────────────────────────────────────

  private async resolveStreamUrl(track: SCTrack): Promise<string> {
    const transcodings = track.media?.transcodings ?? [];
    log(
      "player",
      "resolveStreamUrl — %d transcodings available",
      transcodings.length,
    );
    const progressive = transcodings.find(
      (t) => t.format?.protocol === "progressive",
    );
    if (progressive?.url) {
      log("player", "trying progressive transcoding: %s", progressive.url);
      try {
        const url = await resolveTranscodingUrl(
          progressive.url,
          track.track_authorization,
        );
        if (url) {
          log("player", "progressive URL resolved: %s…", url.slice(0, 80));
          return url;
        }
      } catch (e) {
        warn(
          "player",
          "progressive transcoding failed, falling back to /streams:",
          e,
        );
      }
    } else {
      log("player", "no progressive transcoding, using /streams endpoint");
    }
    const streams = await getTrackStreams(track.id);
    if (streams.http_mp3_128_url) {
      log("player", "/streams URL: %s…", streams.http_mp3_128_url.slice(0, 80));
      return streams.http_mp3_128_url;
    }

    // /streams returned no direct MP3 URL — try resolving an HLS transcoding.
    // This covers tracks where only HLS is available (e.g. commercial releases).
    const hls =
      transcodings.find((t) => t.format?.protocol === "hls" && !t.snipped) ??
      transcodings.find((t) => t.format?.protocol === "hls");
    if (hls?.url) {
      warn(
        "player",
        "/streams had no mp3 url, trying HLS transcoding: %s",
        hls.url,
      );
      try {
        const hlsUrl = await resolveTranscodingUrl(
          hls.url,
          track.track_authorization,
        );
        if (hlsUrl) {
          log("player", "HLS fallback URL resolved: %s…", hlsUrl.slice(0, 80));
          return hlsUrl;
        }
      } catch (e) {
        warn("player", "HLS transcoding fallback failed:", e);
      }
    }

    throw new Error("No streamable URL available for this track");
  }

  // ── Timer ─────────────────────────────────────────────────────────────────

  private startTimer(): void {
    if (this.progressTimer !== null) return;
    this.progressTimer = setInterval(() => {
      this._tryHookProgressBar?.(); // re-hook if Spotify re-rendered the element
      this._tryHookSkipButtons?.(); // re-hook transport buttons too
      this._tryHookVolumeInput?.(); // re-hook volume slider if re-rendered
      this.applyTrackInfo(); // re-assert title/artist/cover across re-renders
      this.syncSpotifyProgress();
      this.forceSpotifyPaused(); // keep Spotify silent AND paused
      this.checkVolumeChanges();
      this.emit();
    }, 250);
  }

  private stopTimer(): void {
    if (this.progressTimer === null) return;
    clearInterval(this.progressTimer);
    this.progressTimer = null;
  }

  private emit(): void {
    const s = this.getState();
    this.listeners.forEach((cb) => cb(s));
  }

  // ── Public state ──────────────────────────────────────────────────────────

  getState(): PlayerState {
    const raw = this.audio.duration;
    const duration =
      isFinite(raw) && raw > 0
        ? raw
        : this._track
          ? this._track.duration / 1000
          : 0;
    return {
      track: this._track,
      isPlaying: !this.audio.paused && !this.audio.ended,
      position: duration > 0 ? this.audio.currentTime / duration : 0,
      duration,
      volume: this.audio.volume,
      isMuted: this.audio.muted,
      isLoading: this._isLoading,
      error: this._error,
      // Expose these so React components can view the settings live
      scVolMultEnabled: this._scVolMultEnabled,
      scVolumeLevel: this._scVolumeLevel,
    };
  }

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  // ── Playback ──────────────────────────────────────────────────────────────

  async loadTrack(track: SCTrack, autoPlay = true): Promise<void> {
    const loadId = ++this._loadId;
    log(
      "player",
      "loadTrack → '%s' (id:%d, autoPlay:%s)",
      track.title,
      track.id,
      autoPlay,
    );
    this._track = track;
    this._isLoading = true;
    this._error = null;
    this.startTimer(); // keep Spotify muted during stream-URL resolution
    this.emit();

    // Mute Spotify's audio immediately — belt-and-suspenders safety.
    this.muteSpotifyAudio(true);

    // Pause Spotify so its track position doesn't advance during SC playback.
    // The _isLoading guard ensures the resulting onplaypause echo is ignored.
    try {
      if (Spicetify.Player.data?.item && Spicetify.Player.isPlaying()) {
        this._ignoreNextPlayPause = true;
        Spicetify.Player.pause();
      }
    } catch {}

    try {
      const url = await this.resolveStreamUrl(track);
      if (loadId !== this._loadId) {
        log("player", "loadTrack stale (loadId mismatch), aborting");
        return;
      }

      this.audio.src = url;
      this.audio.load();
      // Fix: Save Spotify's volume and visually switch slider to SC volume profile
      if (this._scVolMultEnabled) {
        try { this._savedSpotifyVolume = Spicetify.Player.getVolume(); } catch { this._savedSpotifyVolume = 0.5; }
        log("player", "loadTrack — separate profiles enabled. savedSpotifyVolume=%.2f, applying scVolumeLevel=%.2f", this._savedSpotifyVolume, this._scVolumeLevel);
        this.setSyncedVolume(this._scVolumeLevel);
        this._lastCheckedVolume = this._scVolumeLevel;
      } else {
        try { this.audio.volume = Spicetify.Player.getVolume(); } catch { this.audio.volume = 0.5; }
        log("player", "loadTrack — shared volume. setting audio.volume to %.2f", this.audio.volume);
      }
      log("player", "audio src set, volume=%.2f", this.audio.volume);

      if (autoPlay) {
        try {
          await this.audio.play();
          log("player", "autoplay started");
        } catch (e) {
          warn("player", "autoplay blocked:", e);
        }
      }

      this.updateNowPlayingBar();
      // Prime time labels immediately so the overlay never shows "0:00/0:00".
      try {
        const pe = q(SEL_POS_TEXT);
        if (pe) pe.setAttribute("data-sc-time", "0:00");
        const de = q(SEL_DUR_TEXT);
        if (de) de.setAttribute("data-sc-time", fmtTime(track.duration / 1000));
      } catch {}
    } catch (err) {
      if (loadId !== this._loadId) return;
      logError("player", "loadTrack error:", err);
      this._error = err instanceof Error ? err.message : "Failed to load track";
    } finally {
      if (loadId === this._loadId) {
        this._isLoading = false;
        this.emit();
      }
    }
  }

  setQueue(tracks: SCTrack[], startIndex = 0): void {
    log(
      "player",
      "setQueue — %d tracks, startIndex=%d",
      tracks.length,
      startIndex,
    );
    this.queue = tracks;
    this.queueIndex = startIndex;
  }

  // play() and pause() only touch this.audio — NEVER Spicetify.Player.
  // Spicetify state is exclusively managed by the onplaypause toggle handler.
  // Mixing both causes the handler to receive an echo and toggle in the wrong
  // direction.

  async play(): Promise<void> {
    try {
      await this.audio.play();
    } catch (e) {
      console.warn("[SpiceCloud] play() blocked:", e);
    }
  }

  pause(): void {
    this.audio.pause();
  }

  toggle(): void {
    if (this.audio.paused) void this.play();
    else this.pause();
  }

  seek(ratio: number): void {
    const r = Math.max(0, Math.min(1, ratio));
    if (isFinite(this.audio.duration) && this.audio.duration > 0) {
      const t = this.audio.duration * r;
      log(
        "player",
        "seek → %.1f%% (%.1fs / %.1fs)",
        r * 100,
        t,
        this.audio.duration,
      );
      this.audio.currentTime = t;
    }
  }

  setScVolumeLevel(vol: number): void {
    this._scVolumeLevel = Math.max(0, Math.min(1, vol));
    if (this._track && this._scVolMultEnabled) {
      this.setSyncedVolume(this._scVolumeLevel);
    }
    this.emit();
  }

  setScVolumeEnabled(enabled: boolean): void {
    this._scVolMultEnabled = enabled;
    if (this._track) {
      if (enabled) {
        try { this._savedSpotifyVolume = Spicetify.Player.getVolume(); } catch { this._savedSpotifyVolume = 0.5; }
        this.setSyncedVolume(this._scVolumeLevel);
      } else if (this._savedSpotifyVolume !== null) {
        this.setSyncedVolume(this._savedSpotifyVolume);
        this._savedSpotifyVolume = null;
      }
    }
    this.emit();
  }

  setVolume(vol: number): void {
    this.audio.volume = Math.max(0, Math.min(1, vol));
  }

  mute(muted: boolean): void {
    this.audio.muted = muted;
    this.emit();
  }

  // Sets SC audio volume AND moves Spotify's DOM volume slider so that
  // syncSpotifyVolume() (which reads the slider every 250 ms) doesn't
  // immediately override the value the user set via our React slider.
  setSyncedVolume(vol: number): void {
    const v = Math.max(0, Math.min(1, vol));
    log("player", "setSyncedVolume → v=%.2f", v);
    this.audio.volume = v;
    this._isUpdatingSpotifyRange = true;
    try {
      if (typeof Spicetify !== "undefined" && Spicetify.Player) {
        Spicetify.Player.setVolume(v);
      }
    } catch (e) {
      logError("player", "Spicetify.Player.setVolume failed:", e);
    }
    setTimeout(() => { 
      this._isUpdatingSpotifyRange = false;
      this._lastCheckedVolume = v;
      log("player", "setSyncedVolume guard released");
    }, 200);
  }

  async next(): Promise<void> {
    if (this.queueIndex < this.queue.length - 1) {
      this.queueIndex++;
      log(
        "player",
        "next → queue[%d/%d] '%s'",
        this.queueIndex,
        this.queue.length - 1,
        this.queue[this.queueIndex]?.title,
      );
      await this.loadTrack(this.queue[this.queueIndex]);
    } else {
      log("player", "next — end of queue (%d tracks)", this.queue.length);
      this._loadId++;
      this.audio.pause();
      // removeAttribute instead of empty string to prevent MEDIA_ELEMENT_ERROR
      this.audio.removeAttribute("src");

      //Clear track reference BEFORE triggering setSyncedVolume input events
      this._track = null;
      this._error = null;
      this.stopTimer();
      this.muteSpotifyAudio(false);
      this.updateSourceBadge(null);
      document.body.classList.remove("sc-active", "sc-playing");

      // Restore Spotify's volume profile visually
      if (this._scVolMultEnabled && this._savedSpotifyVolume !== null) {
        this.setSyncedVolume(this._savedSpotifyVolume);
        this._savedSpotifyVolume = null;
      }

      this._cachedTitleEl = null;
      this._cachedArtistEl = null;
      this._cachedCoverEl = null;
      this._cachedPosEl = null;
      this._cachedDurEl = null;
      this._cachedRangeEl = null;
      
      //Tell Spotify to resume playback of its own queue!
      try {
        if (Spicetify.Player.data?.item) {
          Spicetify.Player.play();
        }
      } catch {}

      this.emit();
    }
  }

  async prev(): Promise<void> {
    if (this.audio.currentTime > 3 || this.queueIndex <= 0) {
      log(
        "player",
        "prev — restarting current track (t=%.1fs, idx=%d)",
        this.audio.currentTime,
        this.queueIndex,
      );
      this.audio.currentTime = 0;
      return;
    }
    this.queueIndex--;
    log(
      "player",
      "prev → queue[%d/%d] '%s'",
      this.queueIndex,
      this.queue.length - 1,
      this.queue[this.queueIndex]?.title,
    );
    await this.loadTrack(this.queue[this.queueIndex]);
  }

  destroy(): void {
    log("player", "destroy — cleaning up");
    this.stopTimer();
    if (this.badgeTimer !== null) {
      clearInterval(this.badgeTimer);
      this.badgeTimer = null;
    }
    // Restore Spotify's volume profile visually
    if (this._scVolMultEnabled && this._savedSpotifyVolume !== null) {
      this.setSyncedVolume(this._savedSpotifyVolume);
      this._savedSpotifyVolume = null;
    }
    this.audio.pause();
    // Fix: removeAttribute instead of empty string to prevent MEDIA_ELEMENT_ERROR
    this.audio.removeAttribute("src");
    //Calling load() here is fine cause we remove element immediately after
    this.audio.load();
    this.audio.remove();
    this.muteSpotifyAudio(false);
    this._sourceBadge?.remove();
    this._sourceBadge = null;
    this._progressOverlay?.remove();
    this._progressOverlay = null;
    this._progressFill = null;
    this._progressThumb = null;
    document.body.classList.remove("sc-active", "sc-playing");
    this._cachedTitleEl = null;
    this._cachedArtistEl = null;
    this._cachedCoverEl = null;
    this._cachedPosEl = null;
    this._cachedDurEl = null;
    this._cachedRangeEl = null;
    this.listeners.clear();
  }
}

// Cross-bundle singleton. The custom app and the startup extension are compiled
// into SEPARATE esbuild bundles, so a plain module-level `new` would create TWO
// players (two <audio> elements, doubled Spotify hooks). Stash the instance on
// window so whichever bundle loads first creates it and the other reuses it.
const _w = window as unknown as { __spicecloudPlayer?: SoundCloudPlayer };
export const player: SoundCloudPlayer =
  _w.__spicecloudPlayer ?? (_w.__spicecloudPlayer = new SoundCloudPlayer());
