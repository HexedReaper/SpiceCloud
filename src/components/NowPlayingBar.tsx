import React, { useRef } from "react";
import { usePlayer } from "../hooks/usePlayer";
import { useLikedTracks } from "../hooks/useLikedTracks";

const FALLBACK_ART =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 56 56'%3E%3Crect width='56' height='56' fill='%23292929'/%3E%3Cpath d='M14 14h28v28.389a7 7 0 1 1-7-7H33V18H19v24.389a7 7 0 1 1-7-7H14zm0 27.389H12a5 5 0 1 0 2 0zm19 0h-2a5 5 0 1 0 2 0z' fill='%23666'/%3E%3C/svg%3E";

const PrevIcon = () => (
  <svg
    viewBox="0 0 16 16"
    fill="currentColor"
    width="16"
    height="16"
    aria-hidden="true"
  >
    <path d="M3.3 1a.7.7 0 0 1 .7.7v5.15l9.95-5.744a.7.7 0 0 1 1.05.606v12.575a.7.7 0 0 1-1.05.607L4 9.149V14.3a.7.7 0 0 1-.7.7H1.7a.7.7 0 0 1-.7-.7V1.7a.7.7 0 0 1 .7-.7z" />
  </svg>
);

const NextIcon = () => (
  <svg
    viewBox="0 0 16 16"
    fill="currentColor"
    width="16"
    height="16"
    aria-hidden="true"
  >
    <path d="M12.7 1a.7.7 0 0 0-.7.7v5.15L2.05 1.107A.7.7 0 0 0 1 1.712v12.575a.7.7 0 0 0 1.05.607L12 9.149V14.3a.7.7 0 0 0 .7.7h1.6a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7z" />
  </svg>
);

const PlayIcon = () => (
  <svg
    viewBox="0 0 16 16"
    fill="currentColor"
    width="16"
    height="16"
    aria-hidden="true"
  >
    <path d="M3 1.713a.7.7 0 0 1 1.05-.607l10.89 6.288a.7.7 0 0 1 0 1.212L4.05 14.894A.7.7 0 0 1 3 14.288z" />
  </svg>
);

const PauseIcon = () => (
  <svg
    viewBox="0 0 16 16"
    fill="currentColor"
    width="16"
    height="16"
    aria-hidden="true"
  >
    <path d="M2.7 1a.7.7 0 0 0-.7.7v12.6a.7.7 0 0 0 .7.7h2.6a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7zm8 0a.7.7 0 0 0-.7.7v12.6a.7.7 0 0 0 .7.7h2.6a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7z" />
  </svg>
);

// Spotify's "Add to library" icon: circle-plus (not saved) / circle-checkmark (saved)
const SaveIcon = ({ saved }: { saved: boolean }) => (
  <svg
    viewBox="0 0 16 16"
    fill="currentColor"
    width="16"
    height="16"
    aria-hidden="true"
  >
    {saved ? (
      <path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8m11.748-1.97a.7.7 0 0 0-1.06-1.06l-4.47 4.47-1.405-1.406a.7.7 0 1 0-1.061 1.06l2.466 2.467 5.53-5.53z" />
    ) : (
      <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8m8-3.25a.75.75 0 0 1 .75.75v1.75H10.5a.75.75 0 0 1 0 1.5H8.75v1.75a.75.75 0 0 1-1.5 0V8.75H5.5a.75.75 0 0 1 0-1.5h1.75V5.5A.75.75 0 0 1 8 4.75z" />
    )}
  </svg>
);

// Spotify's volume icon: speaker body + small arc when active, speaker + X when muted.
// The active path is the exact path from Spotify's live DOM (aria-label="Niedrige Lautstärke").
const VolumeIcon = ({ muted }: { muted: boolean }) => (
  <svg
    viewBox="0 0 16 16"
    fill="currentColor"
    width="16"
    height="16"
    aria-hidden="true"
  >
    {muted ? (
      <>
        {/* Speaker body only */}
        <path d="M9.741.85a.75.75 0 0 1 .375.65v13a.75.75 0 0 1-1.125.65l-6.925-4a3.64 3.64 0 0 1-1.33-4.967 3.64 3.64 0 0 1 1.33-1.332l6.925-4a.75.75 0 0 1 .75 0zm-6.924 5.3a2.14 2.14 0 0 0 0 3.7l5.8 3.35V2.8z" />
        {/* X marks */}
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          d="M11.5 6L14.5 10M14.5 6L11.5 10"
        />
      </>
    ) : (
      // Speaker + arc — exact Spotify path
      <path d="M9.741.85a.75.75 0 0 1 .375.65v13a.75.75 0 0 1-1.125.65l-6.925-4a3.64 3.64 0 0 1-1.33-4.967 3.64 3.64 0 0 1 1.33-1.332l6.925-4a.75.75 0 0 1 .75 0zm-6.924 5.3a2.14 2.14 0 0 0 0 3.7l5.8 3.35V2.8zm8.683 4.29V5.56a2.75 2.75 0 0 1 0 4.88" />
    )}
  </svg>
);

export function NowPlayingBar() {
  const {
    track,
    isPlaying,
    volume,
    isMuted,
    toggle,
    next,
    prev,
    setSyncedVolume,
    mute,
  } = usePlayer();
  const { likedIds, toggleLike } = useLikedTracks();
  // Saved pre-mute volume so unmuting restores the last non-zero level.
  const preMuteVol = useRef(0.5);

  if (!track) return null;

  const isLiked = likedIds.has(track.id);
  const art = track.artwork_url?.replace("-large", "-t200x200") ?? FALLBACK_ART;

  const toggleMute = () => {
    if (isMuted) {
      mute(false);
    } else {
      if (volume > 0) preMuteVol.current = volume;
      mute(true);
    }
  };

  return (
    <div className="sc-now-playing">
      {/* Cover — spans both rows */}
      <div className="sc-now-playing__cover-slot">
        <div className="sc-now-playing__cover-wrap">
          <img
            className="sc-now-playing__cover"
            src={art}
            alt=""
            onError={(e) => {
              (e.target as HTMLImageElement).src = FALLBACK_ART;
            }}
          />
        </div>
      </div>

      {/* Row 1: track info + save button */}
      <div className="sc-now-playing__top">
        <div className="sc-now-playing__track-info">
          <span className="sc-now-playing__title">{track.title}</span>
          <span className="sc-now-playing__artist">{track.user.username}</span>
        </div>
        <button
          className={`sc-now-playing__like${isLiked ? " sc-now-playing__like--active" : ""}`}
          onClick={() => void toggleLike(track.id)}
          aria-label={
            isLiked ? "Remove from liked songs" : "Save to liked songs"
          }
          aria-checked={isLiked}
          type="button"
        >
          <SaveIcon saved={isLiked} />
        </button>
      </div>

      {/* Row 2: transport controls + volume bar */}
      <div className="sc-now-playing__bottom">
        <div className="sc-now-playing__transport">
          <button
            className="sc-now-playing__ctrl"
            onClick={prev}
            aria-label="Previous"
            type="button"
          >
            <PrevIcon />
          </button>
          <button
            className="sc-now-playing__ctrl sc-now-playing__ctrl--play"
            onClick={toggle}
            aria-label={isPlaying ? "Pause" : "Play"}
            type="button"
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button
            className="sc-now-playing__ctrl"
            onClick={next}
            aria-label="Next"
            type="button"
          >
            <NextIcon />
          </button>
        </div>

        <div className="sc-now-playing__volume" data-testid="volume-bar">
          <button
            className="sc-now-playing__mute"
            onClick={toggleMute}
            aria-label={isMuted ? "Unmute" : "Mute"}
            type="button"
          >
            <VolumeIcon muted={isMuted} />
          </button>
          <div className="sc-now-playing__vol-track">
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={isMuted ? 0 : volume}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (isMuted && v > 0) mute(false);
                setSyncedVolume(v);
              }}
              className="sc-now-playing__vol-input"
              style={
                {
                  "--vol-pct": `${(isMuted ? 0 : volume) * 100}%`,
                } as React.CSSProperties
              }
              aria-label="Volume"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
