import type { DiscoveryQualityFilter } from '../components/Discovery'
import type { SortOption } from '../components/SortControl'
import { isFlacUrl, isHiResFlac, type DiscoveryAudioMetadata } from '../discovery-audio-metadata'
import { resolveSpotifyImageUrl } from '../spotify-image'
import type { AppSettings, DiscoverySong, MusicTrack, SpotifyPlaylistTrack } from '../types'
import { DISCOVERY_CACHE_KEY, DISCOVERY_CACHE_TTL, DISCOVERY_LISTEN_COUNTS_KEY } from './config'

export function spotifyTrackId(id: string) { return `spotify:${id}` }

export function toSpotifyTrack(track: SpotifyPlaylistTrack, audioUrl = ''): MusicTrack {
  return { id: spotifyTrackId(track.id), title: track.title, artist: track.artist, album: track.album, genre: '', year: '', storedName: '', audioUrl, coverUrl: resolveSpotifyImageUrl(track.imageUrl), rpcCoverUrl: track.imageUrl, isOnline: true, sourceUrl: `spotify:track:${track.id}`, duration: track.durationMs / 1000, addedAt: new Date().toISOString() }
}

export function normalizeCrossFadeDuration(value: number) {
  if (!Number.isFinite(value)) return 5
  return Math.round(Math.min(Math.max(value, 1), 15) * 10) / 10
}

export function normalizeLyricsDelay(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.round(Math.min(Math.max(value, -30), 30) * 100) / 100
}

export function normalizeAudioSpeed(value: number) {
  if (!Number.isFinite(value)) return 1
  return Math.round(Math.min(Math.max(value, 0.75), 1.5) * 100) / 100
}

export function applyAudioSpeed(audio: HTMLAudioElement, speed: number, pitchEnabled: boolean) {
  const rate = normalizeAudioSpeed(speed)
  audio.preservesPitch = !pitchEnabled
  audio.defaultPlaybackRate = rate
  audio.playbackRate = rate
}

export function shouldShowVersionNotice(appVersion: string, settings: AppSettings) {
  return appVersion.length > 0 && !settings.dismissedVersionNoticeVersions.includes(versionNoticeKey(appVersion))
}

export function versionNoticeKey(appVersion: string) {
  return `${appVersion}:spotify-sidebar-playlists-2026-07-12`
}

export function compareVersions(currentVersion: string, nextVersion: string) {
  const current = currentVersion.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0)
  const next = nextVersion.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0)
  const length = Math.max(current.length, next.length)
  for (let index = 0; index < length; index += 1) {
    const diff = (next[index] ?? 0) - (current[index] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

export function shouldShowUpdateNotice(currentVersion: string, latestVersion: string) {
  return latestVersion.length > 0 && compareVersions(currentVersion, latestVersion) > 0
}

export function createShuffledSongIds(songs: MusicTrack[], currentSongId: string | null) {
  const remainingIds = songs.map((song) => song.id).filter((id) => id !== currentSongId)
  for (let index = remainingIds.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[remainingIds[index], remainingIds[swapIndex]] = [remainingIds[swapIndex], remainingIds[index]]
  }
  return currentSongId && songs.some((song) => song.id === currentSongId) ? [currentSongId, ...remainingIds] : remainingIds
}

export function discoveryId(onlineId: string) { return `discovery:${onlineId}` }

export function toDiscoveryTrack(song: DiscoverySong): MusicTrack {
  return { id: song.id, title: song.title, artist: song.artist, album: song.album, genre: song.genre, year: song.year, storedName: '', audioUrl: song.file, coverUrl: song.cover || undefined, isOnline: true, sourceUrl: song.file, lyricsUrl: song.lyrics?.trim() || undefined, lyricsDelay: normalizeLyricsDelay(song.lyricsOffset), duration: song.duration ?? 0, listenCount: song.listenCount, addedAt: '' }
}

export function readDiscoveryListenCounts(): Record<string, number> {
  try {
    const counts = JSON.parse(localStorage.getItem(DISCOVERY_LISTEN_COUNTS_KEY) ?? '{}') as Record<string, number>
    return counts && typeof counts === 'object' ? counts : {}
  } catch { return {} }
}

export function writeDiscoveryListenCounts(counts: Record<string, number>) {
  localStorage.setItem(DISCOVERY_LISTEN_COUNTS_KEY, JSON.stringify(counts))
}

export function filterDiscoverySongsByQuality(songs: DiscoverySong[], filter: DiscoveryQualityFilter, metadata: Record<string, DiscoveryAudioMetadata | null>) {
  if (filter === 'all') return songs
  if (filter === 'hq') return songs.filter((song) => isFlacUrl(song.file))
  return songs.filter((song) => isFlacUrl(song.file) && isHiResFlac(metadata[song.file] ?? null))
}

export function sortDiscoverySongs(songs: DiscoverySong[], sort: SortOption) {
  if (sort === 'oldest') return [...songs].reverse()
  if (sort === 'title') return [...songs].sort((a, b) => a.title.localeCompare(b.title))
  if (sort === 'artist') return [...songs].sort((a, b) => a.artist.localeCompare(b.artist))
  return songs
}

type DiscoveryCache = { savedAt: number, songs: DiscoverySong[] }

export function readDiscoveryCache() {
  try {
    const cache = JSON.parse(localStorage.getItem(DISCOVERY_CACHE_KEY) ?? '') as DiscoveryCache
    if (!cache || !Array.isArray(cache.songs) || Date.now() - cache.savedAt > DISCOVERY_CACHE_TTL) return null
    const counts = readDiscoveryListenCounts()
    return cache.songs.map((song) => ({ ...song, listenCount: counts[song.id] ?? song.listenCount ?? 0 }))
  } catch { return null }
}

export function writeDiscoveryCache(songs: DiscoverySong[]) {
  localStorage.setItem(DISCOVERY_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), songs }))
}
