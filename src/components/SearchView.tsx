import React, { useCallback, useState } from "react";
import { SCTrack } from "../types/soundcloud";
import { fetchNextPage, searchTracks } from "../services/api";
import { player } from "../services/player";
import { usePlayer } from "../hooks/usePlayer";
import { TrackItem } from "./TrackItem";
import { t } from "../i18n";

export function SearchView() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SCTrack[]>([]);
  const [nextHref, setNextHref] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { track: activeTrack, isPlaying } = usePlayer();

  const doSearch = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const q = query.trim();
      if (!q) return;

      setIsSearching(true);
      setError(null);
      setNextHref(null);

      try {
        const data = await searchTracks(q, 30);
        setResults(data?.collection ?? []);
        setNextHref(data?.next_href ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed");
      } finally {
        setIsSearching(false);
      }
    },
    [query],
  );

  const loadMore = useCallback(async () => {
    if (!nextHref || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const more = await fetchNextPage<SCTrack>(nextHref);
      setResults((prev) => [...prev, ...(more.collection ?? [])]);
      setNextHref(more.next_href ?? null);
    } catch {
      // ignore — user can click again
    } finally {
      setIsLoadingMore(false);
    }
  }, [nextHref, isLoadingMore]);

  const handlePlay = useCallback(
    (track: SCTrack) => {
      if (activeTrack?.id === track.id) {
        player.toggle();
      } else {
        player.setQueue(results, results.indexOf(track));
        void player.loadTrack(track);
      }
    },
    [results, activeTrack],
  );

  return (
    <div className="sc-view">
      <form className="sc-search-form" onSubmit={doSearch}>
        <input
          type="search"
          className="sc-search-input"
          placeholder={t("search_placeholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t("search_placeholder")}
        />
        <button
          type="submit"
          className="sc-btn-primary sc-btn-primary--sm"
          disabled={isSearching}
        >
          {isSearching ? "…" : t("btn_search")}
        </button>
      </form>

      {error && <div className="sc-error">{error}</div>}

      <div className="sc-track-list">
        {results.map((track) => (
          <TrackItem
            key={track.id}
            track={track}
            isActive={activeTrack?.id === track.id}
            isPlaying={activeTrack?.id === track.id && isPlaying}
            onPlay={handlePlay}
          />
        ))}
        {!isSearching && results.length === 0 && query.trim() && (
          <p className="sc-empty">{t("no_results", query)}</p>
        )}
      </div>
      {nextHref && !error && (
        <div className="sc-load-more">
          <button
            className="sc-retry-btn"
            onClick={() => void loadMore()}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? "…" : t("load_more")}
          </button>
        </div>
      )}
    </div>
  );
}
