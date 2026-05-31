import React, {
  useState,
  useEffect,
  useCallback,
  createContext,
  useContext,
} from "react";
import { getLikedTrackIds, likeTrack, unlikeTrack } from "../services/api";

interface LikedTracksValue {
  likedIds: Set<number>;
  toggleLike: (trackId: number) => Promise<boolean>;
}

const LikedTracksContext = createContext<LikedTracksValue | null>(null);

// Shared provider — mount once in app.tsx so all views share one fetch + one
// state. Without this, every view that calls useLikedTracks() would trigger its
// own getLikedTrackIds() request and maintain an independent copy of likedIds,
// meaning a like in FeedView wouldn't reflect in SearchView (and vice versa).
export function LikedTracksProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [likedIds, setLikedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    void (async () => {
      try {
        const ids = await getLikedTrackIds();
        setLikedIds(ids);
      } catch {
        // non-fatal — like buttons just won't show filled state
      }
    })();
  }, []);

  const toggleLike = useCallback(
    async (trackId: number): Promise<boolean> => {
      const wasLiked = likedIds.has(trackId);
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (wasLiked) next.delete(trackId);
        else next.add(trackId);
        return next;
      });
      try {
        if (wasLiked) {
          await unlikeTrack(trackId);
        } else {
          await likeTrack(trackId);
        }
        return true;
      } catch (err) {
        console.warn("[SpiceCloud] toggleLike failed:", err);
        // Revert on error
        setLikedIds((prev) => {
          const next = new Set(prev);
          if (wasLiked) next.add(trackId);
          else next.delete(trackId);
          return next;
        });
        return false;
      }
    },
    [likedIds],
  );

  // React.createElement avoids JSX in a .ts file
  return React.createElement(
    LikedTracksContext.Provider,
    { value: { likedIds, toggleLike } },
    children,
  );
}

export function useLikedTracks(): LikedTracksValue {
  const ctx = useContext(LikedTracksContext);
  if (!ctx)
    throw new Error(
      "useLikedTracks must be rendered inside LikedTracksProvider",
    );
  return ctx;
}
