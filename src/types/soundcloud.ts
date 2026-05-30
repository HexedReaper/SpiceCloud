export interface SCUser {
  id: number;
  username: string;
  avatar_url: string;
  permalink_url: string;
}

export interface SCTranscoding {
  /** SoundCloud API URL — needs a second GET to resolve the real CDN URL. */
  url: string;
  preset: string;
  duration: number;
  snipped: boolean;
  format: {
    protocol: "progressive" | "hls";
    mime_type: string;
  };
  quality: string;
}

export interface SCTrack {
  id: number;
  title: string;
  duration: number; // milliseconds
  user: SCUser;
  artwork_url: string | null;
  permalink_url: string;
  kind: "track";
  likes_count: number;
  playback_count: number;
  description: string | null;
  /** Populated by the SoundCloud v2 API on most track endpoints. */
  media?: {
    transcodings: SCTranscoding[];
  };
}

export interface SCPlaylist {
  id: number;
  title: string;
  user: SCUser;
  artwork_url: string | null;
  tracks: SCTrack[];
  tracks_count: number;
  duration: number;
  kind: "playlist";
  permalink_url: string;
}

export interface SCStreamItem {
  type: string;
  created_at: string;
  uuid: string;
  track?: SCTrack;
  playlist?: SCPlaylist;
}

export interface SCCollection<T> {
  collection: T[];
  next_href: string | null;
  query_urn: string | null;
}

export interface SCSearchResult {
  collection: SCTrack[];
  next_href: string | null;
  total_results: number;
}

export interface SCStreamUrls {
  http_mp3_128_url: string | null;
  hls_mp3_128_url?: string | null;
}

export interface SCSettings {
  clientId: string;
  oauthToken: string;
}
