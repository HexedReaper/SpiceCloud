import { useEffect, useState } from "react";
import { SCTrack } from "../types/soundcloud";
import { player, PlayerState } from "../services/player";

export function usePlayer() {
  const [state, setState] = useState(() => player.getState());

  useEffect(() => {
    const unsub = player.subscribe(setState);
    return unsub;
  }, []);

  return {
    ...state,
    play: () => void player.play(),
    pause: () => player.pause(),
    toggle: () => player.toggle(),
    seek: (r: number) => player.seek(r),
    setVolume: (v: number) => player.setVolume(v),
    setSyncedVolume: (v: number) => player.setSyncedVolume(v),
    setScVolumeLevel: (m: number) => player.setScVolumeLevel(m),
    mute: (v: boolean) => player.mute(v),
    next: () => void player.next(),
    prev: () => void player.prev(),
    loadTrack: (track: SCTrack, autoPlay?: boolean) =>
      void player.loadTrack(track, autoPlay),
    setQueue: (tracks: SCTrack[], idx?: number) => player.setQueue(tracks, idx),
  };
}
