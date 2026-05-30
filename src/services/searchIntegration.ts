import { searchTracks } from "./api";
import { player } from "./player";
import { SCTrack } from "../types/soundcloud";

// Exact selectors from Spotify's live DOM.
const SEL_DROPDOWN = "#search-dropdown";
const SEL_GRID = 'ul[role="grid"]';
const CLS_ROW = "sc-si-row";

// ── State ─────────────────────────────────────────────────────────────────────

let _results: SCTrack[] = [];
let _debounce: ReturnType<typeof setTimeout> | null = null;
let _inputEl: HTMLInputElement | null = null;
let _bodyObs: MutationObserver | null = null; // watches for dropdown appearing
let _gridObs: MutationObserver | null = null; // watches dropdown internals
let _destroyed = false;

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

    /*
     * Injected SC track rows — styled to match Spotify's own list rows using
     * its Encore CSS variables (spacing / radius / colors / fonts), so the
     * interleaved SoundCloud results are visually indistinguishable from
     * Spotify's, apart from the orange SoundCloud logo before the title.
     */
    .${CLS_ROW} {
      display: flex;
      align-items: center;
      gap: var(--encore-spacing-tighter, 12px);
      padding-block: var(--encore-spacing-tighter-4, 4px);
      padding-inline: var(--encore-spacing-tighter-2, 8px) var(--encore-spacing-tighter-4, 4px);
      min-block-size: var(--encore-control-size-smaller, 32px);
      border-radius: var(--encore-corner-radius-larger, 6px);
      cursor: pointer;
      user-select: none;
      color: var(--text-base, #fff);
      font-family: var(--encore-body-font-stack, var(--font-family, system-ui, sans-serif));
    }
    .${CLS_ROW}:hover, .${CLS_ROW}:focus-visible {
      background: var(--background-tinted-highlight, rgba(255,255,255,0.14));
      outline: none;
    }
    .sc-si-art, .sc-si-art-blank {
      width: 48px; height: 48px;
      flex-shrink: 0;
      border-radius: var(--encore-corner-radius-base, 4px);
    }
    .sc-si-art { object-fit: cover; }
    .sc-si-art-blank { background: var(--background-tinted-base, rgba(255,255,255,0.1)); }
    .sc-si-meta {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: var(--encore-spacing-tighter-5, 2px);
    }
    .sc-si-title {
      display: flex;
      align-items: center;
      gap: 5px;
      color: var(--text-base, #fff);
      font-size: var(--encore-text-size-smaller, 0.875rem);
      font-weight: 400;
      line-height: 1.4;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }
    .sc-si-title svg { flex-shrink: 0; color: #ff5500; }
    .sc-si-artist {
      color: var(--text-subdued, #b3b3b3);
      font-size: var(--encore-text-size-smaller-2, 0.75rem);
      line-height: 1.4;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sc-si-dur {
      flex-shrink: 0;
      color: var(--text-subdued, #b3b3b3);
      font-size: var(--encore-text-size-smaller-2, 0.75rem);
      margin-left: var(--encore-spacing-tighter-2, 8px);
    }
  `;
  document.head.appendChild(s);
}

// ── SoundCloud rows (mixed into Spotify's results) ──────────────────────────
//
// SoundCloud tracks are interleaved among Spotify's track rows inside the SAME
// results grid, each tagged with the SoundCloud logo. Per the DOM safety rules
// we only insert OUR OWN nodes (never move/remove Spotify's), and the observer
// re-injects them whenever React wipes the grid.

function clearScRows(root: ParentNode): void {
  root.querySelectorAll(`.${CLS_ROW}`).forEach((el) => el.remove());
}

function buildRow(track: SCTrack, idx: number): HTMLElement {
  const row = document.createElement("div");
  row.className = CLS_ROW;
  row.setAttribute("role", "button");
  row.setAttribute("tabindex", "0");
  row.setAttribute(
    "aria-label",
    `${track.title} – ${track.user.username} (SoundCloud)`,
  );

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

// Fill the section's list with the current results. A signature guard prevents
// re-rendering (and losing hover/focus) when nothing actually changed.
// (Re)build the SC rows, interleaved 1:1 after each Spotify TRACK row (the
// draggable ones — not the query suggestions at the top). Any SC rows beyond
// the number of Spotify track rows are appended at the end, in order.
function interleaveRows(grid: Element): void {
  clearScRows(grid);
  if (_results.length === 0) return;
  const spotifyRows = Array.from(
    grid.querySelectorAll(':scope > [role="row"][draggable="true"]'),
  );
  _results.forEach((track, i) => {
    const row = buildRow(track, i);
    const anchor = spotifyRows[i];
    grid.insertBefore(row, anchor ? anchor.nextSibling : null);
  });
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
    clearScRows(grid);
  } else {
    // Rebuild only when our row count is off (Spotify wiped/re-rendered them).
    // The count match also breaks the mutation→inject→mutation observer loop.
    const have = grid.querySelectorAll(`.${CLS_ROW}`).length;
    if (have !== _results.length) interleaveRows(grid);
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
  const aria = (el.getAttribute("aria-label") || "").toLowerCase();
  return (
    // Strongest signal: the combobox input that owns the autocomplete listbox.
    el.getAttribute("aria-controls") === "search-dropdown" ||
    el.getAttribute("aria-owns") === "search-dropdown" ||
    el.getAttribute("data-top-bar-search") === "true" ||
    el.getAttribute("data-testid") === "search-input" ||
    el.classList.contains("main-topBar-searchBar") ||
    // role=combobox covers the search field whether its type is search OR text.
    (el.getAttribute("role") === "combobox" &&
      (el.type === "search" || el.type === "text")) ||
    // Last resort: aria-label in any supported language ("Search", "Suchen"…).
    /search|such|recher|busca|cerca|ricerca|szuka|搜索|検索/.test(aria)
  );
}

function onCaptureInput(e: Event): void {
  if (_destroyed || !isSearchInput(e.target)) return;
  _inputEl = e.target as HTMLInputElement;
  // Make sure the dropdown observer is live so our section survives re-renders,
  // even if the dropdown mounted before init or deeper than the body observer.
  attachGridObserver();
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

// Window flag so the app bundle and the startup-extension bundle (separate
// esbuild outputs, each with its own module state) can't both attach observers.
const _scWin = window as unknown as { __scSearchInited?: boolean };

export function initSearchIntegration(): void {
  if (_bodyObs || _scWin.__scSearchInited) return; // already running anywhere
  _scWin.__scSearchInited = true;
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
  if (!_bodyObs && !_scWin.__scSearchInited) return; // nothing to tear down
  _scWin.__scSearchInited = false;
  _destroyed = true;
  _bodyObs?.disconnect();
  _bodyObs = null;
  _gridObs?.disconnect();
  _gridObs = null;
  if (_debounce !== null) clearTimeout(_debounce);
  document.removeEventListener("input", onCaptureInput, true);
  document.removeEventListener("focusin", onCaptureFocus, true);
  document.removeEventListener("keydown", onCaptureKeydown, true);
  clearScRows(document);
  _results = [];
  _inputEl = null;
}
