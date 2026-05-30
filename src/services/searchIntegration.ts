import { searchTracks } from "./api";
import { player } from "./player";
import { SCTrack } from "../types/soundcloud";

// Exact selectors from Spotify's live DOM.
const SEL_INPUT = '[data-top-bar-search="true"]';
const SEL_DROPDOWN = "#search-dropdown";
const SEL_GRID = 'ul[role="grid"]';
const CLS_DIVIDER = "sc-si-divider";
const CLS_ROW = "sc-si-row";

// ── State ─────────────────────────────────────────────────────────────────────

let _results: SCTrack[] = [];
let _debounce: ReturnType<typeof setTimeout> | null = null;
let _inputEl: HTMLInputElement | null = null;
let _bodyObs: MutationObserver | null = null;   // watches for dropdown appearing
let _gridObs: MutationObserver | null = null;   // watches dropdown internals
let _destroyed = false;

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Official SoundCloud logo (Simple Icons / simpleicons.org)
const SC_SVG =
  `<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" aria-hidden="true" style="flex-shrink:0">` +
  `<path d="M23.999 14.165c-.052 1.796-1.612 3.169-3.4 3.169h-8.18a.68.68 0 0 1-.675-.683V7.862a.747.747 0 0 1 .452-.724s.75-.513 2.333-.513a5.364 5.364 0 0 1 2.763.755 5.433 5.433 0 0 1 2.57 3.54c.282-.08.574-.121.868-.12.884 0 1.73.358 2.347.992s.948 1.49.922 2.373ZM10.721 8.421c.247 2.98.427 5.697 0 8.672a.264.264 0 0 1-.53 0c-.395-2.946-.22-5.718 0-8.672a.264.264 0 0 1 .53 0ZM9.072 9.448c.285 2.659.37 4.986-.006 7.655a.277.277 0 0 1-.55 0c-.331-2.63-.256-5.02 0-7.655a.277.277 0 0 1 .556 0Zm-1.663-.257c.27 2.726.39 5.171 0 7.904a.266.266 0 0 1-.532 0c-.38-2.69-.257-5.21 0-7.904a.266.266 0 0 1 .532 0Zm-1.647.77a26.108 26.108 0 0 1-.008 7.147.272.272 0 0 1-.542 0 27.955 27.955 0 0 1 0-7.147.275.275 0 0 1 .55 0Zm-1.67 1.769c.421 1.865.228 3.5-.029 5.388a.257.257 0 0 1-.514 0c-.21-1.858-.398-3.549 0-5.389a.272.272 0 0 1 .543 0Zm-1.655-.273c.388 1.897.26 3.508-.01 5.412-.026.28-.514.283-.54 0-.244-1.878-.347-3.54-.01-5.412a.283.283 0 0 1 .56 0Zm-1.668.911c.4 1.268.257 2.292-.026 3.572a.257.257 0 0 1-.514 0c-.241-1.262-.354-2.312-.023-3.572a.283.283 0 0 1 .563 0Z"/>` +
  `</svg>`;

// Official Spotify logo (Simple Icons / simpleicons.org)
const SPOTIFY_SVG_INLINE =
  `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" ` +
  `style="display:inline-block;flex-shrink:0;vertical-align:middle">` +
  `<path fill="#1DB954" d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>` +
  `</svg>`;

// ── CSS ───────────────────────────────────────────────────────────────────────

function injectStyles(): void {
  if (document.getElementById("sc-si-styles")) return;
  const s = document.createElement("style");
  s.id = "sc-si-styles";
  s.textContent = `
    /* ── Spotify badge wrapper (set flex on the link so icon + text align) ── */
    ${SEL_DROPDOWN} a[data-sc-sp] {
      display: inline-flex !important;
      align-items: center;
      gap: 5px;
    }

    /* ── SC divider ────────────────────────────────────────────────────────── */
    .${CLS_DIVIDER} {
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 10px 8px 5px;
      color: #ff5500;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.08em;
      font-family: var(--font-family, system-ui, sans-serif);
      border-top: 1px solid rgba(255,255,255,0.07);
      margin-top: 4px;
      pointer-events: none;
    }

    /* ── Injected SC track rows ─────────────────────────────────────────────── */
    .${CLS_ROW} {
      display: flex;
      align-items: center;
      gap: 0;
      padding: var(--encore-spacing-tighter-4, 6px) var(--encore-spacing-tighter, 8px);
      cursor: pointer;
      border-radius: 4px;
      min-height: var(--encore-control-size-smaller, 48px);
      font-family: var(--font-family, system-ui, sans-serif);
    }
    .${CLS_ROW}:hover, .${CLS_ROW}:focus {
      background: var(--background-tinted-highlight, rgba(255,255,255,0.08));
      outline: none;
    }
    .sc-si-art {
      width: 48px; height: 48px;
      border-radius: 3px;
      object-fit: cover;
      flex-shrink: 0;
      margin-right: 10px;
    }
    .sc-si-art-blank {
      width: 48px; height: 48px;
      border-radius: 3px;
      background: #333;
      flex-shrink: 0;
      margin-right: 10px;
    }
    .sc-si-meta {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .sc-si-title {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      color: var(--text-base, #fff);
      font-size: 14px;
      font-weight: 400;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }
    .sc-si-artist {
      color: var(--text-subdued, rgba(255,255,255,0.5));
      font-size: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sc-si-dur {
      flex-shrink: 0;
      color: var(--text-subdued, rgba(255,255,255,0.35));
      font-size: 12px;
      margin-left: 8px;
    }
  `;
  document.head.appendChild(s);
}

// ── Grid injection ────────────────────────────────────────────────────────────

function clearScItems(grid: Element): void {
  grid.querySelectorAll(`.${CLS_DIVIDER}, .${CLS_ROW}`).forEach((el) => el.remove());
}

function buildRow(track: SCTrack, idx: number): HTMLElement {
  const row = document.createElement("div");
  row.className = CLS_ROW;
  row.setAttribute("role", "row");
  row.setAttribute("tabindex", "0");
  row.setAttribute("aria-label", `${track.title} – ${track.user.username} (SoundCloud)`);

  const art = track.artwork_url?.replace("-large", "-t50x50") ?? "";
  const artHtml = art
    ? `<img class="sc-si-art" src="${esc(art)}" alt="" loading="lazy" onerror="this.style.display='none'">`
    : `<div class="sc-si-art-blank"></div>`;

  row.innerHTML =
    artHtml +
    `<div class="sc-si-meta">` +
      `<span class="sc-si-title">${SC_SVG}${esc(track.title)}</span>` +
      `<span class="sc-si-artist">${esc(track.user.username)}</span>` +
    `</div>` +
    `<span class="sc-si-dur">${fmt(track.duration)}</span>`;

  // mousedown keeps input focused; click plays the track.
  row.addEventListener("mousedown", (e) => e.preventDefault());
  row.addEventListener("click", () => {
    player.setQueue(_results, idx);
    void player.loadTrack(_results[idx]);
  });
  row.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      player.setQueue(_results, idx);
      void player.loadTrack(_results[idx]);
    }
  });

  return row;
}

function injectIntoGrid(grid: Element): void {
  clearScItems(grid);
  if (_results.length === 0) return;

  const divider = document.createElement("div");
  divider.className = CLS_DIVIDER;
  divider.innerHTML = `${SC_SVG} SoundCloud`;
  grid.appendChild(divider);

  _results.forEach((t, i) => grid.appendChild(buildRow(t, i)));
}

// Inject Spotify logo into native Spotify track title links.
// Uses data-sc-sp attribute as an idempotency marker — links already processed
// are skipped, so repeated calls (on every observer tick) are cheap.
// When Spotify re-renders a row it creates a fresh <a> without the attribute,
// so the badge is re-injected on the very next observer callback.
function addSpotifyBadges(grid: Element): void {
  grid
    .querySelectorAll<HTMLAnchorElement>(
      `[role="row"][draggable="true"] .e-10451-legacy-list-row__interactive ` +
      `a[href*="/track/"]:not([data-sc-sp])`,
    )
    .forEach((a) => {
      a.setAttribute("data-sc-sp", "1");
      const badge = document.createElement("span");
      badge.innerHTML = SPOTIFY_SVG_INLINE;
      a.insertBefore(badge, a.firstChild);
    });
}

// Re-inject if our items are missing or stale — called from the grid observer.
// The count-match check breaks the mutation→inject→mutation loop:
// after we inject N rows, the observer fires again but count matches → skip.
// addSpotifyBadges always runs (it's idempotent via data-sc-sp).
function syncGrid(): void {
  const grid = document.querySelector(`${SEL_DROPDOWN} ${SEL_GRID}`);
  if (!grid) return;
  if (_results.length === 0) {
    clearScItems(grid);
  } else {
    const have = grid.querySelectorAll(`.${CLS_ROW}`).length;
    if (have !== _results.length) injectIntoGrid(grid);
  }
  addSpotifyBadges(grid);
}

// ── Dropdown observer ─────────────────────────────────────────────────────────

function attachGridObserver(): void {
  const dropdown = document.querySelector(SEL_DROPDOWN);
  if (!dropdown) return;

  _gridObs?.disconnect();
  _gridObs = new MutationObserver(() => {
    // Skip mutations caused by our own injections (count will already match).
    syncGrid();
  });
  _gridObs.observe(dropdown, { childList: true, subtree: true });
}

function onBodyMutation(): void {
  const dropdown = document.querySelector(SEL_DROPDOWN);
  if (dropdown) {
    // Dropdown just appeared (or we hadn't attached yet).
    if (!_gridObs) attachGridObserver();
    syncGrid();
  } else {
    // Dropdown closed — tear down grid observer.
    _gridObs?.disconnect();
    _gridObs = null;
    _results = [];
  }
}

// ── Search ────────────────────────────────────────────────────────────────────

async function doSearch(query: string): Promise<void> {
  if (!query.trim()) {
    _results = [];
    syncGrid();
    return;
  }
  try {
    const data = await searchTracks(query.trim(), 20);
    _results = data?.collection ?? [];
  } catch {
    _results = [];
  }
  syncGrid();
}

// ── Input detection ───────────────────────────────────────────────────────────
// Use document-level capture (focusin + input) so we catch the input regardless
// of when Spotify renders it.  The exact class / data-attribute is now confirmed.

function isSearchInput(el: EventTarget | null): el is HTMLInputElement {
  if (!(el instanceof HTMLInputElement)) return false;
  if (el.closest(".sc-app, .sc-auth, #sc-search-overlay")) return false;
  return (
    el.getAttribute("data-top-bar-search") === "true" ||
    el.classList.contains("main-topBar-searchBar") ||
    (el.getAttribute("role") === "combobox" && el.type === "search")
  );
}

function onCaptureInput(e: Event): void {
  if (_destroyed || !isSearchInput(e.target)) return;
  _inputEl = e.target as HTMLInputElement;
  const q = _inputEl.value;
  if (_debounce !== null) clearTimeout(_debounce);
  _debounce = setTimeout(() => void doSearch(q), 350);
}

function onCaptureFocus(e: FocusEvent): void {
  if (_destroyed || !isSearchInput(e.target)) return;
  _inputEl = e.target as HTMLInputElement;
  // Attach grid observer as soon as the input is focused (dropdown may already
  // be open from a previous query).
  attachGridObserver();
  syncGrid();
}

function onCaptureKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    _results = [];
    syncGrid();
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function initSearchIntegration(): void {
  _destroyed = false;
  injectStyles();

  // Watch for #search-dropdown appearing/disappearing.
  _bodyObs = new MutationObserver(onBodyMutation);
  _bodyObs.observe(document.body, { childList: true, subtree: false });

  document.addEventListener("input", onCaptureInput, true);
  document.addEventListener("focusin", onCaptureFocus, true);
  document.addEventListener("keydown", onCaptureKeydown, true);
}

export function destroySearchIntegration(): void {
  _destroyed = true;
  _bodyObs?.disconnect(); _bodyObs = null;
  _gridObs?.disconnect(); _gridObs = null;
  if (_debounce !== null) clearTimeout(_debounce);
  document.removeEventListener("input", onCaptureInput, true);
  document.removeEventListener("focusin", onCaptureFocus, true);
  document.removeEventListener("keydown", onCaptureKeydown, true);
  _results = [];
  _inputEl = null;
}
