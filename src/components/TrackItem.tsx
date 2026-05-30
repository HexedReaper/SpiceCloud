import React from "react";
import { SCTrack } from "../types/soundcloud";

const FALLBACK_ART =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 44 44'%3E%3Crect width='44' height='44' fill='%23333'/%3E%3Ccircle cx='22' cy='22' r='8' fill='%23ff5500' opacity='.6'/%3E%3Ccircle cx='22' cy='22' r='3' fill='%23ff5500'/%3E%3C/svg%3E";

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const PlayIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    width="20"
    height="20"
    aria-hidden="true"
  >
    <path d="m7.05 3.606 13.49 7.788a.7.7 0 0 1 0 1.212L7.05 20.394A.7.7 0 0 1 6 19.788V4.212a.7.7 0 0 1 1.05-.606" />
  </svg>
);

const HeartIcon = ({ filled }: { filled: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    fill={filled ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth={filled ? 0 : 1.5}
    width="16"
    height="16"
    aria-hidden="true"
  >
    <path d="M12 21.593c-.425-.396-8.5-7.662-8.5-12.476C3.5 5.683 5.5 4 8 4c1.572 0 3.072.82 4 2.133C12.928 4.82 14.428 4 16 4c2.5 0 4.5 1.683 4.5 5.117 0 4.814-8.075 12.08-8.5 12.476z" />
  </svg>
);

interface Props {
  track: SCTrack;
  isActive: boolean;
  isPlaying: boolean;
  isLiked?: boolean;
  onPlay: (track: SCTrack) => void;
  onLike?: (track: SCTrack) => void;
}

export function TrackItem({
  track,
  isActive,
  isPlaying,
  isLiked,
  onPlay,
  onLike,
}: Props) {
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
        {isActive ? (
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
              <PlayIcon />
            )}
          </div>
        ) : (
          <div className="sc-track__hover-play" aria-hidden="true">
            <PlayIcon />
          </div>
        )}
      </div>

      <div className="sc-track__info">
        <span className="sc-track__title">{track.title}</span>
        <span className="sc-track__artist">{track.user.username}</span>
      </div>

      <span className="sc-track__duration">{fmtDuration(track.duration)}</span>

      {onLike && (
        <button
          className={`sc-track__like-btn${isLiked ? " sc-track__like-btn--liked" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onLike(track);
          }}
          aria-label={isLiked ? "Unlike" : "Like"}
          title={isLiked ? "Unlike" : "Like"}
          type="button"
        >
          <HeartIcon filled={isLiked ?? false} />
        </button>
      )}
    </div>
  );
}
