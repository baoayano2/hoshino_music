export type {
  CreatePlaylistInput,
  CreatePlaylistFolderInput,
  DebugCookie,
  AddOnlineSongToPlaylistInput,
  AudioFileSelection,
  AppSettings,
  DiscordPlaybackState,
  ImageBlob,
  ImageOptimizeOptions,
  ImagePurpose,
  ImportMusicInput,
  ImportOnlineMusicInput,
  ImportOnlineMusicProgress,
  MiniPlayerCommand,
  MiniPlayerState,
  MusicLibrary,
  MusicTrack,
  PlayerState,
  PlaylistRecord,
  PlaylistFolderRecord,
  SpotifyProfileSync,
  SpotifyHome,
  SpotifyHomeCard,
  SpotifyHomeSection,
  SpotifyPlaylistPage,
  SpotifyPlaylistTrack,
  SpotifyPlaybackInput,
  SpotifyPlaybackResult,
  SpotifySearchPage,
  UpdateMusicInput,
  UpdatePlaylistFolderInput,
  UpdatePlaylistInput,
} from '../electron/ipc/types'

export type DiscoverySong = {
  id: string
  onlineId: string
  featured: boolean
  title: string
  artist: string
  album: string
  genre: string
  year: string
  file: string
  cover: string
  lyrics: string
  lyricsOffset: number
  listenCount: number
  duration?: number
}
