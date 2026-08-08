export function resolveSpotifyImageUrl(url: string) {
  return url ? `hoshino-spotify-image://cache?url=${encodeURIComponent(url)}` : ''
}
