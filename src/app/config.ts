import type { AppSettings, MusicLibrary } from '../types'

export const EMPTY_LIBRARY: MusicLibrary = { songs: [], playlists: [], playlistFolders: [] }
export const DISCOVERY_API_URL = 'https://cdn.shizuku.tech/list.json'
export const DISCOVERY_CACHE_KEY = 'hoshino:discovery-cache'
export const DISCOVERY_LISTEN_COUNTS_KEY = 'hoshino:discovery-listen-counts'
export const DISCOVERY_CACHE_TTL = 5 * 60 * 1000
export const VERSION_API_URL = 'https://cdn.shizuku.tech/v'
export const UPDATE_DOWNLOAD_URL = 'https://cdn.shizuku.tech/setup.exe'
export const DISCOVERY_PLAYLIST_ID = '__hoshino_discovery__'
export const SPOTIFY_PLAYLIST_ID = '__spotify_discovery__'
export const LIKED_PLAYLIST_ID = '__liked_songs__'
export const RECENTLY_PLAYED_PLAYLIST_ID = '__recently_played__'
export const RECENTLY_ADDED_PLAYLIST_ID = '__recently_added__'
export const STARTUP_LOADING_MIN_MS = 2000

export const DEFAULT_APP_SETTINGS: AppSettings = {
  playInBackground: false,
  minimizeToTray: false,
  startWithWindows: false,
  fullscreenPlayerLayout: 'centered',
  debuggerEnabled: false,
  spotifySpDc: '',
  spotifySpT: '',
  spotifyAccessToken: '',
  spotifyAccessTokenExpirationTimestampMs: 0,
  showSpotifyPlaylistsInSidebar: true,
  extendedLibraryEnabled: false,
  customQueueEnabled: false,
  spotifyPlaylistSort: 'oldest',
  forceMostListenedSection: false,
  customCss: '',
  clientUserName: '',
  clientUserDescription: '',
  clientUserAvatarUrl: '',
  lyricsDelay: 0,
  audioSpeed: 1,
  audioPitchEnabled: false,
  crossFadeEnabled: false,
  crossFadeDuration: 5,
  tuneEqEnabled: false,
  tuneEqAutoSave: true,
  tuneEqBandCount: 10,
  tuneEqFrequencies: [],
  tuneEqQValues: [],
  tuneEqGains: [],
  tuneEqBandSettings: {},
  discordRpcEnabled: true,
  discordKeepRichPresence: false,
  discordSmallImageUrl: '',
  discordPausedSmallImageUrl: '',
  discordDetailsTemplate: '%song_name%',
  discordStateTemplate: '%artist_name%',
  discordLargeTextTemplate: '%album_name%',
  discordSmallTextTemplate: 'Hoshino Player',
  discordPausedSmallTextTemplate: '',
  discordRpcV2Enabled: false,
  discordRpcV2KeepRichPresence: false,
  discordRpcV2OauthAccessToken: '',
  discordRpcV2OauthRefreshToken: '',
  discordRpcV2OauthExpiresAt: 0,
  discordRpcV2SmallImageUrl: '',
  discordRpcV2PausedSmallImageUrl: '',
  discordRpcV2DetailsTemplate: '%song_name%',
  discordRpcV2StateTemplate: '%artist_name%',
  discordRpcV2LargeTextTemplate: '%album_name%',
  discordRpcV2SmallTextTemplate: 'Hoshino Player',
  discordRpcV2PausedSmallTextTemplate: '',
  dismissedVersionNoticeVersions: [],
  dismissedUpdateNoticeVersions: [],
}
