import React, { useEffect, useState } from "react";
import { SCPlaylist, SCTrack } from "../types/soundcloud";
import { getPlaylist, getPlaylists } from "../services/api";
import { player } from "../services/player";
import { usePlayer } from "../hooks/usePlayer";
import { TrackItem } from "./TrackItem";
import { t } from "../i18n";

const FALLBACK_ART =
  "https://a-v2.sndcdn.com/assets/images/sc-icons/favicon-2cadd14bdb.ico";

export function PlaylistsView() {
  const [playlists, setPlaylists] = useState<SCPlaylist[]>([]);
  const [detail, setDetail] = useState<SCPlaylist | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { track: activeTrack, isPlaying } = usePlayer();

  useEffect(() => {
    void (async () => {
      try {
        const data = await getPlaylists(20);
        setPlaylists(data?.collection ?? []);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load playlists",
        );
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const openPlaylist = async (pl: SCPlaylist) => {
    setIsLoadingDetail(true);
    try {
      const full = await getPlaylist(pl.id);
      setDetail(full);
    } catch {
      // If full fetch fails, show whatever tracks we already have.
      setDetail(pl);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handlePlay = (track: SCTrack) => {
    if (!detail) return;
    if (activeTrack?.id === track.id) {
      player.toggle();
    } else {
      player.setQueue(detail.tracks, detail.tracks.indexOf(track));
      void player.loadTrack(track);
    }
  };

  // ── Playlist detail ────────────────────────────────────────────────────────
  if (detail) {
    return (
      <div className="sc-view">
        <button className="sc-back-btn" onClick={() => setDetail(null)}>
          {t("back")}
        </button>
        <h2 className="sc-view__title">{detail.title}</h2>
        <p className="sc-view__subtitle">
          {detail.user.username} ·{" "}
          {t("track_count", String(detail.tracks_count))}
        </p>
        <div className="sc-track-list">
          {detail.tracks.map((track) => (
            <TrackItem
              key={track.id}
              track={track}
              isActive={activeTrack?.id === track.id}
              isPlaying={activeTrack?.id === track.id && isPlaying}
              onPlay={handlePlay}
            />
          ))}
        </div>
      </div>
    );
  }

  // ── Playlist grid ──────────────────────────────────────────────────────────
  return (
    <div className="sc-view">
      <h2 className="sc-view__title">{t("view_sets")}</h2>
      {(isLoading || isLoadingDetail) && (
        <div className="sc-spinner">
          <span />
          <span />
          <span />
        </div>
      )}
      {error && <div className="sc-error">{error}</div>}
      {!isLoading && !error && playlists.length === 0 && (
        <p className="sc-empty">{t("empty_sets")}</p>
      )}
      <div className="sc-playlist-grid">
        {playlists.map((pl) => (
          <div
            key={pl.id}
            className="sc-playlist-card"
            onClick={() => void openPlaylist(pl)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && void openPlaylist(pl)}
            aria-label={`Open playlist ${pl.title}`}
          >
            <img
              src={
                pl.artwork_url?.replace("-large", "-t300x300") ?? FALLBACK_ART
              }
              alt=""
              className="sc-playlist-card__art"
            />
            <div className="sc-playlist-card__info">
              <span className="sc-playlist-card__title">{pl.title}</span>
              <span className="sc-playlist-card__count">
                {t("track_count", String(pl.tracks_count))}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
