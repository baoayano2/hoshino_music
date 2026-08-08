export type AppInfo = {
  name: string
  version: string
  platform: NodeJS.Platform
}

export type DebugCookie = {
  name: string
  value: string
  domain: string
  path: string
  expirationDate?: number
  httpOnly: boolean
  secure: boolean
  sameSite: string
}

export type SpotifyProfileSync = {
  clientUserName: string
  clientUserDescription: string
  clientUserAvatarUrl: string
}

export type SpotifyHomeCard = {
  id: string
  uri: string
  title: string
  subtitle: string
  imageUrl: string
  type: string
  durationMs?: number
  playable?: boolean
  albumUri?: string
  albumTitle?: string
}

export type SpotifyHomeSection = {
  id: string
  title: string
  cards: SpotifyHomeCard[]
}

export type SpotifyHome = {
  greeting: string
  sections: SpotifyHomeSection[]
}

export type SpotifyPlaylistTrack = {
  id: string
  uri: string
  title: string
  artist: string
  album: string
  imageUrl: string
  durationMs: number
  playable: boolean
  addedAt?: string
  position: number
}

export type SpotifyPlaylistPage = {
  items: SpotifyPlaylistTrack[]
  totalCount: number
  offset: number
  limit: number
}

export type SpotifySearchPage = {
  items: SpotifyHomeCard[]
  offset: number
  limit: number
  hasMore: boolean
}

export type SpotifyPlaybackInput = {
  id: string
  title: string
  artist: string
  album: string
  imageUrl: string
  durationMs: number
}

export type SpotifyPlaybackResult = SpotifyPlaybackInput & {
  videoId: string
  audioUrl: string
  duration: number
  debugSearch?: { query: string, results: unknown[] }
}

export type MusicTrack = {
  id: string
  title: string
  artist: string
  album: string
  genre: string
  year: string
  storedName: string
  audioUrl: string
  coverUrl?: string
  rpcCoverUrl?: string
  isOnline?: boolean
  sourceUrl?: string
  lyrics?: string
  lyricsUrl?: string
  lyricsDelay?: number
  duration?: number
  listenCount?: number
  favorite?: boolean
  lastPlayedAt?: string
  playCount?: number
  skipCount?: number
  addedAt: string
}

export type PlaylistRecord = {
  id: string
  name: string
  description: string
  folderId?: string | null
  coverUrl?: string
  heroStoredName?: string
  heroUrl?: string
  songIds: string[]
  createdAt: string
}

export type PlaylistFolderRecord = {
  id: string
  name: string
  createdAt: string
}

export type MusicLibrary = {
  songs: MusicTrack[]
  playlists: PlaylistRecord[]
  playlistFolders: PlaylistFolderRecord[]
}

export type PlayerState = {
  volume: number
  currentSongId: string | null
  currentTime: number
  playbackPlaylistId: string | null
  spotifyTrack?: SpotifyPlaylistTrack
  spotifyQueue?: SpotifyPlaylistTrack[]
  customQueueNextUp?: MusicTrack[]
  customQueueLater?: MusicTrack[]
}

export type MiniPlayerState = {
  song: MusicTrack | null
  isPlaying: boolean
  shuffleEnabled: boolean
  repeatEnabled: boolean
  currentTime: number
  duration: number
  volume: number
}

export type MiniPlayerCommand =
  | { type: 'toggle-play' }
  | { type: 'previous' }
  | { type: 'next' }
  | { type: 'toggle-shuffle' }
  | { type: 'toggle-repeat' }
  | { type: 'toggle-mute' }
  | { type: 'seek', seconds: number }
  | { type: 'volume', volume: number }
  | { type: 'expand' }

export type AppSettings = {
  playInBackground: boolean
  minimizeToTray: boolean
  startWithWindows: boolean
  fullscreenPlayerLayout: 'centered' | 'split'
  debuggerEnabled: boolean
  spotifySpDc: string
  spotifySpT: string
  spotifyAccessToken: string
  spotifyAccessTokenExpirationTimestampMs: number
  showSpotifyPlaylistsInSidebar: boolean
  extendedLibraryEnabled: boolean
  customQueueEnabled: boolean
  spotifyPlaylistSort: 'title' | 'duration' | 'oldest' | 'newest'
  forceMostListenedSection: boolean
  customCss: string
  clientUserName: string
  clientUserDescription: string
  clientUserAvatarUrl: string
  lyricsDelay: number
  audioSpeed: number
  audioPitchEnabled: boolean
  crossFadeEnabled: boolean
  crossFadeDuration: number
  tuneEqEnabled: boolean
  tuneEqAutoSave: boolean
  tuneEqBandCount: number
  tuneEqFrequencies: number[]
  tuneEqQValues: number[]
  tuneEqGains: number[]
  tuneEqBandSettings: Record<string, { frequencies: number[], qValues: number[], gains: number[] }>
  discordRpcEnabled: boolean
  discordKeepRichPresence: boolean
  discordSmallImageUrl: string
  discordPausedSmallImageUrl: string
  discordDetailsTemplate: string
  discordStateTemplate: string
  discordLargeTextTemplate: string
  discordSmallTextTemplate: string
  discordPausedSmallTextTemplate: string
  discordRpcV2Enabled: boolean
  discordRpcV2KeepRichPresence: boolean
  discordRpcV2OauthAccessToken: string
  discordRpcV2OauthRefreshToken: string
  discordRpcV2OauthExpiresAt: number
  discordRpcV2SmallImageUrl: string
  discordRpcV2PausedSmallImageUrl: string
  discordRpcV2DetailsTemplate: string
  discordRpcV2StateTemplate: string
  discordRpcV2LargeTextTemplate: string
  discordRpcV2SmallTextTemplate: string
  discordRpcV2PausedSmallTextTemplate: string
  dismissedVersionNoticeVersions: string[]
  dismissedUpdateNoticeVersions: string[]
}

export type DiscordPlaybackState = {
  songId: string
  isPlaying: boolean
  title: string
  artist: string
  position: number
  duration: number
  coverUrl?: string
  rpcCoverUrl?: string
  album?: string
}

export type ImageBlob = {
  name: string
  mimeType: string
  data: Uint8Array
}

export type ImagePurpose = 'song' | 'playlist'
export type ImageOptimizeOptions = {
  cropSquare?: boolean
}

export type AudioFileSelection = {
  sourcePath: string
  title: string
  artist: string
  album: string
  genre: string
  year: string
  duration: number
  coverBlob: ImageBlob | null
}

export type ImportMusicInput = {
  id?: string
  sourceUrl?: string
  sourcePath: string
  coverBlob: ImageBlob | null
  coverUrl?: string
  title: string
  artist: string
  album: string
  genre: string
  year: string
  lyrics?: string
  lyricsUrl?: string
  lyricsDelay?: number
  duration?: number
}

export type ImportOnlineMusicInput = {
  requestId: string
  id?: string
  url: string
  title: string
  artist: string
  album: string
  genre: string
  year: string
  cover?: string
  lyrics?: string
  lyricsOffset?: number
  duration?: number
}

export type AddOnlineSongToPlaylistInput = {
  id: string
  title: string
  artist: string
  album: string
  genre: string
  year: string
  file: string
  sourceUrl?: string
  cover: string
  rpcCoverUrl?: string
  duration?: number
  lyrics?: string
  lyricsOffset?: number
}

export type ImportOnlineMusicProgress = {
  requestId: string
  progress: number | null
  receivedBytes: number
  totalBytes: number | null
}

export type CreatePlaylistInput = {
  name: string
  description: string
  coverBlob: ImageBlob | null
  heroBlob: ImageBlob | null
}

export type CreatePlaylistFolderInput = {
  name: string
}

export type UpdatePlaylistFolderInput = {
  name: string
}

export type UpdatePlaylistInput = {
  name: string
  description: string
  coverBlob: ImageBlob | null
  heroBlob: ImageBlob | null
}

export type UpdateMusicInput = {
  title: string
  artist: string
  album: string
  genre: string
  year: string
  coverBlob: ImageBlob | null
  lyrics?: string
  removeLyrics?: boolean
  lyricsDelay?: number
}

/**
 * The only Electron capabilities exposed to the renderer process.
 * Add new renderer-facing IPC methods to this contract first.
 */
export type ElectronApi = {
  getAppInfo: () => Promise<AppInfo>
  getLibrary: () => Promise<MusicLibrary>
  getPlayerState: () => Promise<PlayerState>
  savePlayerState: (state: PlayerState) => Promise<void>
  getAppSettings: () => Promise<AppSettings>
  saveAppSettings: (settings: AppSettings) => Promise<void>
  resetAppSettings: () => Promise<AppSettings>
  loginDiscordRpcV2: () => Promise<AppSettings>
  validateDiscordRpcV2Token: () => Promise<AppSettings>
  uploadDiscordSmallImage: (image: ImageBlob) => Promise<string | null>
  updateDiscordPresence: (state: DiscordPlaybackState) => Promise<void>
  getDroppedFilePaths: (files: File[]) => string[]
  selectAudioFile: () => Promise<AudioFileSelection | null>
  selectAudioFiles: () => Promise<AudioFileSelection[]>
  readDroppedAudioFiles: (paths: string[]) => Promise<AudioFileSelection[]>
  selectCoverFile: (purpose: ImagePurpose, options?: ImageOptimizeOptions) => Promise<ImageBlob | null>
  readDroppedCoverFile: (path: string, purpose: ImagePurpose, options?: ImageOptimizeOptions) => Promise<ImageBlob | null>
  selectLyricsFile: () => Promise<string | null>
  readDroppedLyricsFile: (path: string) => Promise<string | null>
  importMusic: (input: ImportMusicInput) => Promise<MusicTrack>
  importOnlineMusic: (input: ImportOnlineMusicInput) => Promise<MusicTrack>
  setMusicFavorite: (song: MusicTrack, favorite: boolean) => Promise<MusicTrack>
  recordMusicPlayback: (song: MusicTrack) => Promise<MusicTrack>
  recordMusicSkip: (song: MusicTrack) => Promise<MusicTrack>
  createPlaylistFromQueue: (name: string, songs: MusicTrack[]) => Promise<PlaylistRecord>
  addOnlineSongToLibrary: (input: AddOnlineSongToPlaylistInput) => Promise<MusicTrack>
  addOnlineSongToPlaylist: (playlistId: string, input: AddOnlineSongToPlaylistInput) => Promise<PlaylistRecord>
  downloadOnlineMusic: (songId: string) => Promise<MusicTrack>
  updateMusic: (songId: string, input: UpdateMusicInput) => Promise<MusicTrack>
  deleteMusic: (songId: string) => Promise<void>
  deleteAllMusic: () => Promise<void>
  createPlaylist: (input: CreatePlaylistInput) => Promise<PlaylistRecord>
  createPlaylistFolder: (input: CreatePlaylistFolderInput) => Promise<PlaylistFolderRecord>
  updatePlaylistFolder: (folderId: string, input: UpdatePlaylistFolderInput) => Promise<PlaylistFolderRecord>
  deletePlaylistFolder: (folderId: string) => Promise<void>
  movePlaylistToFolder: (playlistId: string, folderId: string | null) => Promise<PlaylistRecord>
  updatePlaylist: (playlistId: string, input: UpdatePlaylistInput) => Promise<PlaylistRecord>
  deletePlaylist: (playlistId: string) => Promise<void>
  deleteAllPlaylists: () => Promise<void>
  addSongToPlaylist: (playlistId: string, songId: string) => Promise<PlaylistRecord>
  removeSongFromPlaylist: (playlistId: string, songId: string) => Promise<PlaylistRecord>
  reorderPlaylistSongs: (playlistId: string, songIds: string[]) => Promise<PlaylistRecord>
  hideWindow: () => Promise<void>
  minimizeWindow: () => Promise<void>
  toggleMaximizeWindow: () => Promise<boolean>
  closeWindow: () => Promise<void>
  openMiniPlayer: () => Promise<void>
  expandMiniPlayer: () => Promise<void>
  restartApp: () => Promise<void>
  openDevTools: () => Promise<void>
  startSpotifyLogin: () => Promise<void>
  ensureSpotifyAccessToken: () => Promise<{ linked: boolean, accessToken: string, accessTokenExpirationTimestampMs: number, stateCleared: boolean }>
  resetSpotifyState: () => Promise<AppSettings>
  syncSpotifyAccount: () => Promise<SpotifyProfileSync>
  getSpotifyHome: () => Promise<SpotifyHome>
  getSpotifyLibraryPlaylists: () => Promise<SpotifyHomeCard[]>
  getSpotifyPlaylist: (uri: string, offset: number, limit: number) => Promise<SpotifyPlaylistPage>
  searchSpotify: (query: string, offset: number, limit: number) => Promise<SpotifySearchPage>
  searchSpotifyResults: (query: string) => Promise<SpotifySearchPage>
  resolveSpotifyPlayback: (input: SpotifyPlaybackInput) => Promise<SpotifyPlaybackResult>
  openSpotifyUri: (uri: string) => Promise<void>
  openDebuggerBrowser: (url: string, userAgent: string) => Promise<DebugCookie[]>
  getDebuggerCookies: () => Promise<DebugCookie[]>
  getMiniPlayerState: () => Promise<MiniPlayerState | null>
  sendMiniPlayerState: (state: MiniPlayerState) => Promise<void>
  sendMiniPlayerCommand: (command: MiniPlayerCommand) => Promise<void>
  onAppReady: (listener: (timestamp: string) => void) => () => void
  onOnlineMusicImportProgress: (listener: (progress: ImportOnlineMusicProgress) => void) => () => void
  onMiniPlayerState: (listener: (state: MiniPlayerState) => void) => () => void
  onMiniPlayerCommand: (listener: (command: MiniPlayerCommand) => void) => () => void
  onDebuggerCookiesChanged: (listener: (cookies: DebugCookie[]) => void) => () => void
  onDebuggerBrowserUrlChanged: (listener: (url: string) => void) => () => void
  onSpotifyLinked: (listener: (settings: AppSettings) => void) => () => void
  onSpotifyLinkError: (listener: (message: string) => void) => () => void
}
