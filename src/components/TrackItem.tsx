import React from "react";
import { SCTrack } from "../types/soundcloud";

const FALLBACK_ART =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 44 44'%3E%3Crect width='44' height='44' fill='%23333'/%3E%3Ccircle cx='22' cy='22' r='8' fill='%23ff5500' opacity='.6'/%3E%3Ccircle cx='22' cy='22' r='3' fill='%23ff5500'/%3E%3C/svg%3E";

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

interface Props {
  track: SCTrack;
  isActive: boolean;
  isPlaying: boolean;
  onPlay: (track: SCTrack) => void;
}

export function TrackItem({ track, isActive, isPlaying, onPlay }: Props) {
  const artwork =
    track.artwork_url?.replace("-large", "-t67x67") ?? FALLBACK_ART;

  return (
    <div
      className={`sc-track${isActive ? " sc-track--active" : ""}`}
      onClick={() => onPlay(track)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onPlay(track)}
      aria-label={`${isActive && isPlaying ? "Pause" : "Play"} ${track.title} by ${track.user.username}`}
    >
      <div className="sc-track__art-wrap">
        <img
          src={artwork}
          alt=""
          className="sc-track__art"
          onError={(e) => {
            (e.target as HTMLImageElement).src = FALLBACK_ART;
          }}
        />
        {isActive && (
          <div
            className={`sc-track__indicator${isPlaying ? " sc-track__indicator--playing" : ""}`}
            aria-hidden="true"
          >
            {isPlaying ? (
              <>
                <span />
                <span />
                <span />
              </>
            ) : (
              <svg viewBox="0 0 10 12" fill="currentColor" width="10" height="12">
                <path d="M1 1.5L9 6 1 10.5V1.5Z" />
              </svg>
            )}
          </div>
        )}
      </div>

      <div className="sc-track__info">
        <span className="sc-track__title">{track.title}</span>
        <span className="sc-track__artist">{track.user.username}</span>
      </div>

      <span className="sc-track__duration">{fmtDuration(track.duration)}</span>
    </div>
  );
}
