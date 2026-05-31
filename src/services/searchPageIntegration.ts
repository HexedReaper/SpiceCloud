import { searchTracks } from "./api";
import { player } from "./player";
import { SCTrack } from "../types/soundcloud";

const SEL_SEARCH_PAGE = "#searchPage";
const SEL_TRACKS_SECTION = 'section[data-testid="search-tracks-result"]';
const SC_SECTION_ID = "sc-sp-section";
const CLS_ROW = "sc-sp-row";

let _results: SCTrack[] = [];
let _lastQuery = "";
let _pageObs: MutationObserver | null = null;
let _searchDebounce: ReturnType<typeof setTimeout> | null = null;
let _navDebounce: ReturnType<typeof setTimeout> | null = null;
let _pollInterval: ReturnType<typeof setInterval> | null = null;
let _historyUnlisten: (() => void) | null = null;
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

const SC_SVG_SMALL =
  `<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" aria-hidden="true" style="flex-shrink:0">` +
  `<path d="M23.999 14.165c-.052 1.796-1.612 3.169-3.4 3.169h-8.18a.68.68 0 0 1-.675-.683V7.862a.747.747 0 0 1 .452-.724s.75-.513 2.333-.513a5.364 5.364 0 0 1 2.763.755 5.433 5.433 0 0 1 2.57 3.54c.282-.08.574-.121.868-.12.884 0 1.73.358 2.347.992s.948 1.49.922 2.373ZM10.721 8.421c.247 2.98.427 5.697 0 8.672a.264.264 0 0 1-.53 0c-.395-2.946-.22-5.718 0-8.672a.264.264 0 0 1 .53 0ZM9.072 9.448c.285 2.659.37 4.986-.006 7.655a.277.277 0 0 1-.55 0c-.331-2.63-.256-5.02 0-7.655a.277.277 0 0 1 .556 0Zm-1.663-.257c.27 2.726.39 5.171 0 7.904a.266.266 0 0 1-.532 0c-.38-2.69-.257-5.21 0-7.904a.266.266 0 0 1 .532 0Zm-1.647.77a26.108 26.108 0 0 1-.008 7.147.272.272 0 0 1-.542 0 27.955 27.955 0 0 1 0-7.147.275.275 0 0 1 .55 0Zm-1.67 1.769c.421 1.865.228 3.5-.029 5.388a.257.257 0 0 1-.514 0c-.21-1.858-.398-3.549 0-5.389a.272.272 0 0 1 .543 0Zm-1.655-.273c.388 1.897.26 3.508-.01 5.412-.026.28-.514.283-.54 0-.244-1.878-.347-3.54-.01-5.412a.283.283 0 0 1 .56 0Zm-1.668.911c.4 1.268.257 2.292-.026 3.572a.257.257 0 0 1-.514 0c-.241-1.262-.354-2.312-.023-3.572a.283.283 0 0 1 .563 0Z"/>` +
  `</svg>`;

const SC_SVG_HEADING =
  `<svg viewBox="0 0 24 24" fill="#ff5500" width="28" height="28" aria-hidden="true" style="flex-shrink:0">` +
  `<path d="M23.999 14.165c-.052 1.796-1.612 3.169-3.4 3.169h-8.18a.68.68 0 0 1-.675-.683V7.862a.747.747 0 0 1 .452-.724s.75-.513 2.333-.513a5.364 5.364 0 0 1 2.763.755 5.433 5.433 0 0 1 2.57 3.54c.282-.08.574-.121.868-.12.884 0 1.73.358 2.347.992s.948 1.49.922 2.373ZM10.721 8.421c.247 2.98.427 5.697 0 8.672a.264.264 0 0 1-.53 0c-.395-2.946-.22-5.718 0-8.672a.264.264 0 0 1 .53 0ZM9.072 9.448c.285 2.659.37 4.986-.006 7.655a.277.277 0 0 1-.55 0c-.331-2.63-.256-5.02 0-7.655a.277.277 0 0 1 .556 0Zm-1.663-.257c.27 2.726.39 5.171 0 7.904a.266.266 0 0 1-.532 0c-.38-2.69-.257-5.21 0-7.904a.266.266 0 0 1 .532 0Zm-1.647.77a26.108 26.108 0 0 1-.008 7.147.272.272 0 0 1-.542 0 27.955 27.955 0 0 1 0-7.147.275.275 0 0 1 .55 0Zm-1.67 1.769c.421 1.865.228 3.5-.029 5.388a.257.257 0 0 1-.514 0c-.21-1.858-.398-3.549 0-5.389a.272.272 0 0 1 .543 0Zm-1.655-.273c.388 1.897.26 3.508-.01 5.412-.026.28-.514.283-.54 0-.244-1.878-.347-3.54-.01-5.412a.283.283 0 0 1 .56 0Zm-1.668.911c.4 1.268.257 2.292-.026 3.572a.257.257 0 0 1-.514 0c-.241-1.262-.354-2.312-.023-3.572a.283.283 0 0 1 .563 0Z"/>` +
  `</svg>`;

const PLAY_ICON_SVG =
  `<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" aria-hidden="true">` +
  `<path d="m7.05 3.606 13.49 7.788a.7.7 0 0 1 0 1.212L7.05 20.394A.7.7 0 0 1 6 19.788V4.212a.7.7 0 0 1 1.05-.606"/>` +
  `</svg>`;

// ── CSS ───────────────────────────────────────────────────────────────────────

function injectStyles(): void {
  if (document.getElementById("sc-sp-styles")) return;
  const s = document.createElement("style");
  s.id = "sc-sp-styles";
  s.textContent = `
    /* Section title — make the h2 span flex so the SC logo aligns with the text */
    .sc-sp-title-span {
      display: flex !important;
      align-items: center;
      gap: 10px;
    }

    /* Image + play-button container (replaces Spotify's hashed wrapper div) */
    .sc-sp-img-wrap {
      position: relative;
      flex-shrink: 0;
      display: inline-flex;
    }
    .sc-sp-img-wrap img {
      display: block;
      transition: filter 0.15s;
    }
    .sc-sp-row:hover .sc-sp-img-wrap img {
      filter: brightness(0.55);
    }
    .sc-sp-img-blank {
      width: 40px;
      height: 40px;
      background: var(--background-tinted-base, rgba(255,255,255,0.1));
      border-radius: var(--encore-corner-radius-base, 4px);
    }

    /* Play button — absolute over artwork, same as Spotify's rowImagePlayButton */
    .sc-sp-play-btn {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      cursor: pointer;
      color: #fff;
      padding: 0;
      opacity: 0;
      transition: opacity 0.15s;
    }
    .sc-sp-row:hover .sc-sp-play-btn {
      opacity: 1;
    }

    /* Inline SC logo inside the track title */
    .sc-sp-inline-icon {
      display: inline-flex;
      vertical-align: middle;
      color: #ff5500;
      margin-right: 3px;
      flex-shrink: 0;
    }
  `;
  document.head.appendChild(s);
}

// ── Row + Section builders ────────────────────────────────────────────────────

function buildRow(track: SCTrack, idx: number): HTMLElement {
  // Outer row wrapper — matches Spotify's [role="row"] div
  const rowWrap = document.createElement("div");
  rowWrap.setAttribute("role", "row");
  rowWrap.setAttribute("aria-rowindex", String(idx + 1));
  rowWrap.setAttribute("aria-selected", "false");

  // Inner row — uses Spotify's trackListRow + grid classes for layout
  const row = document.createElement("div");
  row.className = `main-trackList-trackListRow main-trackList-trackListRowGrid sc-sp-row`;
  row.setAttribute("role", "presentation");
  row.setAttribute("tabindex", "0");
  // Set the grid column template the same way Spotify does inline
  row.style.cssText =
    "--grid-template-columns:[first] minmax(var(--first-min-width,180px),4fr) " +
    "[last] minmax(var(--last-min-width,120px),1fr);";

  // ── Left cell: artwork + play btn + title + artist ──
  const leftCell = document.createElement("div");
  leftCell.className = "main-trackList-rowSectionStart";
  leftCell.setAttribute("role", "gridcell");
  leftCell.setAttribute("aria-colindex", "1");

  const art = track.artwork_url?.replace("-large", "-t50x50") ?? "";
  const imgWrap = document.createElement("div");
  imgWrap.className = "sc-sp-img-wrap";
  if (art) {
    imgWrap.innerHTML =
      `<img class="main-image-image main-trackList-rowImage" src="${esc(art)}" ` +
      `alt="" width="40" height="40" style="border-radius:4px" loading="lazy" ` +
      `onerror="this.style.display='none'">` +
      `<button class="sc-sp-play-btn" ` +
      `aria-label="${esc(track.title)} (SoundCloud)" tabindex="-1">` +
      PLAY_ICON_SVG +
      `</button>`;
  } else {
    imgWrap.innerHTML = `<div class="sc-sp-img-blank"></div>`;
  }

  const content = document.createElement("div");
  content.className = "main-trackList-rowMainContent";
  content.innerHTML =
    `<div class="e-10451-text encore-text-body-medium encore-internal-color-text-base ` +
    `main-trackList-rowMainContentTitle standalone-ellipsis-one-line" data-encore-id="text" dir="auto">` +
    `<span class="sc-sp-inline-icon">${SC_SVG_SMALL}</span>${esc(track.title)}` +
    `</div>` +
    `<span class="e-10451-text encore-text-body-small encore-internal-color-text-subdued ` +
    `main-trackList-rowMainContentSubTitle standalone-ellipsis-one-line" data-encore-id="text">` +
    esc(track.user.username) +
    `</span>`;

  leftCell.appendChild(imgWrap);
  leftCell.appendChild(content);

  // ── Right cell: duration ──
  const rightCell = document.createElement("div");
  rightCell.className = "main-trackList-rowSectionEnd";
  rightCell.setAttribute("role", "gridcell");
  rightCell.setAttribute("aria-colindex", "2");
  rightCell.innerHTML =
    `<div class="e-10451-text encore-text-body-small encore-internal-color-text-subdued ` +
    `main-trackList-duration" data-encore-id="text">${fmt(track.duration)}</div>`;

  row.appendChild(leftCell);
  row.appendChild(rightCell);
  rowWrap.appendChild(row);

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

  return rowWrap;
}

function buildSection(): HTMLElement {
  // Outer section — mirrors Spotify's jj8JMZICtAa6ni2Y inner section
  const section = document.createElement("section");
  section.id = SC_SECTION_ID;
  section.setAttribute("aria-label", "SoundCloud");

  // Title header — mirrors Spotify's main-shelf-titleWrapper structure exactly
  const titleArea = document.createElement("div");
  titleArea.innerHTML =
    `<div class="e-10451-box e-10451-box--naked main-shelf-titleWrapper" ` +
    `style="--box-padding-block-start:var(--encore-spacing-tighter-2);` +
    `--box-padding-block-end:var(--encore-spacing-tighter-2);` +
    `--box-padding-inline-start:none;--box-padding-inline-end:none;` +
    `--box-min-block-size:var(--encore-control-size-larger);">` +
    `<div class="e-10451-legacy-list-row__header">` +
    `<div class="e-10451-legacy-list-row__column e-10451-legacy-list-row__interactive">` +
    `<h2 class="e-10451-text encore-text-title-small encore-internal-color-text-base ` +
    `e-10451-overflow-wrap-anywhere main-shelf-title" data-encore-id="listRowTitle" aria-hidden="true">` +
    `<span class="e-10451-line-clamp sc-sp-title-span" style="--encore-line-clamp:1;">` +
    `${SC_SVG_HEADING}SoundCloud` +
    `</span></h2>` +
    `</div></div></div>`;

  // Track list — mirrors Spotify's main-trackList-trackListContainer structure
  const gridWrap = document.createElement("div");
  gridWrap.setAttribute("role", "presentation");
  gridWrap.className = "main-gridContainer-gridContainer";
  gridWrap.style.setProperty("--min-column-width", "180px");

  const listContainer = document.createElement("div");
  const trackList = document.createElement("div");
  trackList.setAttribute("role", "grid");
  trackList.setAttribute("aria-rowcount", String(_results.length));
  trackList.setAttribute("aria-colcount", "2");
  trackList.setAttribute("aria-label", "SoundCloud");
  trackList.className = "main-trackList-trackList";
  trackList.style.cssText =
    "--row-height:56px;" +
    "--first-min-width:180px;--last-min-width:120px;" +
    "--grid-template-columns:[first] minmax(180px,4fr) [last] minmax(120px,1fr);";

  const rowsWrap = document.createElement("div");
  rowsWrap.setAttribute("role", "presentation");
  rowsWrap.style.transform = "translateY(0px)";
  _results.forEach((track, i) => rowsWrap.appendChild(buildRow(track, i)));

  trackList.appendChild(rowsWrap);
  listContainer.appendChild(trackList);
  gridWrap.appendChild(listContainer);

  section.appendChild(titleArea);
  section.appendChild(gridWrap);
  return section;
}

function injectSection(): void {
  document.getElementById(SC_SECTION_ID)?.remove();
  if (_results.length === 0 || _destroyed) return;

  const tracksSection = document.querySelector(SEL_TRACKS_SECTION);
  if (!tracksSection) return;

  // Insert after the songs section's parent wrapper (same grid level as other sections)
  const wrapper = tracksSection.parentElement ?? tracksSection;
  wrapper.parentElement?.insertBefore(buildSection(), wrapper.nextSibling);
}

// ── Search ────────────────────────────────────────────────────────────────────

function getQueryFromUrl(): string | null {
  const m = window.location.pathname.match(
    /\/(?:intl-[a-z]{2}\/)?search\/([^/?#]+)/,
  );
  return m ? decodeURIComponent(m[1]) : null;
}

async function doSearch(query: string): Promise<void> {
  try {
    const data = await searchTracks(query.trim(), 10);
    _results = data?.collection ?? [];
  } catch {
    _results = [];
  }
  if (!_destroyed) injectSection();
}

// ── Route change handler ──────────────────────────────────────────────────────

function onRouteChange(): void {
  if (_destroyed) return;

  const page = document.querySelector(SEL_SEARCH_PAGE);

  if (!page) {
    // Navigated away from search results
    if (_pageObs) {
      _pageObs.disconnect();
      _pageObs = null;
    }
    document.getElementById(SC_SECTION_ID)?.remove();
    _results = [];
    _lastQuery = "";
    return;
  }

  // Attach inner observer to catch React re-renders of page content
  if (!_pageObs) {
    _pageObs = new MutationObserver(() => {
      if (
        !_destroyed &&
        !document.getElementById(SC_SECTION_ID) &&
        _results.length > 0
      ) {
        injectSection();
      }
    });
    _pageObs.observe(page, { childList: true, subtree: true });
  }

  const query = getQueryFromUrl();
  if (!query) return;

  if (query !== _lastQuery) {
    _lastQuery = query;
    _results = [];
    document.getElementById(SC_SECTION_ID)?.remove();
    if (_searchDebounce !== null) clearTimeout(_searchDebounce);
    _searchDebounce = setTimeout(() => void doSearch(query), 350);
  } else if (!document.getElementById(SC_SECTION_ID) && _results.length > 0) {
    injectSection();
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

const _scWin = window as unknown as { __scPageSearchInited?: boolean };

export function initSearchPageIntegration(): void {
  if (_scWin.__scPageSearchInited) return;
  _scWin.__scPageSearchInited = true;
  _destroyed = false;
  injectStyles();

  // Primary: hook Spicetify's SPA router so we hear every navigation immediately
  const hist = (
    Spicetify as unknown as {
      Platform?: { History?: { listen?: (cb: () => void) => () => void } };
    }
  )?.Platform?.History;
  if (hist?.listen) {
    _historyUnlisten = hist.listen(() => {
      // Give React a tick to render the new page before querying the DOM
      if (_navDebounce !== null) clearTimeout(_navDebounce);
      _navDebounce = setTimeout(onRouteChange, 150);
    });
  }

  // Safety-net poll: catches re-injection needs if React replaces #searchPage
  // and acts as a fallback when History isn't available.  2 s is fine — the
  // History listener handles navigation instantly when present.
  _pollInterval = setInterval(onRouteChange, 2000);

  onRouteChange();
}

export function destroySearchPageIntegration(): void {
  if (!_scWin.__scPageSearchInited) return;
  _scWin.__scPageSearchInited = false;
  _destroyed = true;
  _historyUnlisten?.();
  _historyUnlisten = null;
  if (_pollInterval !== null) {
    clearInterval(_pollInterval);
    _pollInterval = null;
  }
  _pageObs?.disconnect();
  _pageObs = null;
  if (_searchDebounce !== null) {
    clearTimeout(_searchDebounce);
    _searchDebounce = null;
  }
  if (_navDebounce !== null) {
    clearTimeout(_navDebounce);
    _navDebounce = null;
  }
  document.getElementById(SC_SECTION_ID)?.remove();
  _results = [];
  _lastQuery = "";
}
