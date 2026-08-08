import { app, BrowserWindow, dialog, ipcMain, Menu, shell, Tray, session, type WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, stat, unlink } from 'node:fs/promises'
import path from 'node:path'
import { prepareDiscordCover, refreshDiscordPresenceSettings, updateDiscordPresence, uploadDiscordSmallImage } from '../discord/presence'
import { loginDiscordRpcV2, validateDiscordRpcV2Token } from '../discord/v2-oauth'
import { optimizeImage } from '../music/image'
import { readAudioSelection } from '../music/metadata'
import { addOnlineSongToLibrary, addOnlineSongToPlaylist, addSongToPlaylist, createPlaylist, createPlaylistFolder, createPlaylistFromQueue, deleteAllMusic, deleteAllPlaylists, deleteMusic, deletePlaylist, deletePlaylistFolder, importMusic, movePlaylistToFolder, readAppSettings, readLibrary, readPlayerState, recordMusicPlayback, recordMusicSkip, removeSongFromPlaylist, reorderPlaylistSongs, replaceOnlineMusicWithLocal, resetAppSettings, saveAppSettings, savePlayerState, saveRendererAppSettings, setMusicFavorite, updateMusic, updatePlaylist, updatePlaylistFolder } from '../music/storage'
import { IPC_CHANNELS } from './channels'
import type { AddOnlineSongToPlaylistInput, AppInfo, AppSettings, CreatePlaylistFolderInput, CreatePlaylistInput, DebugCookie, DiscordPlaybackState, ImageBlob, ImageOptimizeOptions, ImagePurpose, ImportMusicInput, ImportOnlineMusicInput, MiniPlayerCommand, MiniPlayerState, MusicTrack, PlayerState, UpdateMusicInput, UpdatePlaylistFolderInput, UpdatePlaylistInput } from './types'
import { applyStartWithWindows } from '../startup'
import { getSpotifyAccessToken, SpotifyInvalidCookieError } from '../spotify/token'
import { normalizeSpotifyHome, normalizeSpotifyPlaylist, normalizeSpotifySearch } from '../spotify/home'
import { resolveSpotifyPlayback } from '../spotify/youtube-playback'

let backgroundTray: Tray | null = null
let latestMiniPlayerState: MiniPlayerState | null = null
let debuggerBrowserWindow: BrowserWindow | null = null
let debuggerCookieRecipient: WebContents | null = null
let debuggerCookieListenerRegistered = false
let spotifyLoginWindow: BrowserWindow | null = null
let spotifyLinkGeneration = 0
let spotifyLinkAbortController: AbortController | null = null
let spotifyLinkingPromise: Promise<void> | null = null
let spotifyInvalidCookieFailures = 0
let spotifyTokenRefreshPromise: Promise<{ settings: AppSettings, linked: boolean, accessToken: string }> | null = null
let spotifyTokenRefreshAbortController: AbortController | null = null
let spotifyEnsurePromise: Promise<{ linked: boolean, accessToken: string, accessTokenExpirationTimestampMs: number, stateCleared: boolean }> | null = null

const CHROME_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
const SPOTIFY_LOGIN_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36'

function serializeCookies(cookies: Electron.Cookie[]): DebugCookie[] {
  return cookies.map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain ?? '',
    path: cookie.path ?? '/',
    expirationDate: cookie.expirationDate,
    httpOnly: cookie.httpOnly ?? false,
    secure: cookie.secure ?? false,
    sameSite: cookie.sameSite,
  }))
}

async function sendDebuggerCookies() {
  if (!debuggerCookieRecipient || debuggerCookieRecipient.isDestroyed()) return
  const cookies = serializeCookies(await session.defaultSession.cookies.get({}))
  debuggerCookieRecipient.send(IPC_CHANNELS.debuggerCookiesChanged, cookies)
}

function sendDebuggerBrowserUrl(url: string) {
  if (!debuggerCookieRecipient || debuggerCookieRecipient.isDestroyed()) return
  debuggerCookieRecipient.send(IPC_CHANNELS.debuggerBrowserUrlChanged, url)
}

async function refreshSpotifyAccessToken(signal?: AbortSignal) {
  const settings = await readAppSettings()
  if (!settings.spotifySpDc) return { settings, linked: false, accessToken: '' }
  if (Date.now() < settings.spotifyAccessTokenExpirationTimestampMs && settings.spotifyAccessToken) {
    spotifyInvalidCookieFailures = 0
    return { settings, linked: true, accessToken: settings.spotifyAccessToken }
  }
  const token = await getSpotifyAccessToken(settings.spotifySpDc, signal)
  const next = { ...settings, ...token }
  await saveAppSettings(next)
  spotifyInvalidCookieFailures = 0
  return { settings: next, linked: true, accessToken: next.spotifyAccessToken }
}

async function runSpotifyAccessTokenRefresh() {
  if (spotifyTokenRefreshPromise) return spotifyTokenRefreshPromise
  const abortController = new AbortController()
  spotifyTokenRefreshAbortController = abortController
  const task = refreshSpotifyAccessToken(abortController.signal)
  spotifyTokenRefreshPromise = task
  try {
    return await task
  } finally {
    if (spotifyTokenRefreshPromise === task) spotifyTokenRefreshPromise = null
    if (spotifyTokenRefreshAbortController === abortController) spotifyTokenRefreshAbortController = null
  }
}

async function fetchSpotifyProfile() {
  const tokenResult = await runSpotifyAccessTokenRefresh()
  if (!tokenResult.linked || !tokenResult.accessToken) throw new Error('Link Spotify before syncing your account.')
  const { spotifySpDc, spotifySpT } = tokenResult.settings
  if (!spotifySpT) throw new Error('Spotify session is missing sp_t. Link your account again.')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new Error('Spotify profile request timed out.')), 15_000)
  try {
    const response = await fetch('https://api-partner.spotify.com/pathfinder/v2/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenResult.accessToken}`,
        'User-Agent': CHROME_USER_AGENT,
        Cookie: `sp_dc=${spotifySpDc}; sp_t=${spotifySpT}`,
      },
      body: JSON.stringify({
        variables: {},
        operationName: 'profileAttributes',
        extensions: { persistedQuery: { version: 1, sha256Hash: 'b197b5adb4b761690f76ad9d9fb278c14c14e7331f357c04a56e7001af7106e0' } },
      }),
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`Spotify profile request failed (${response.status}).`)
    const payload = await response.json() as {
      data?: { me?: { profile?: { name?: string, username?: string, avatar?: { sources?: Array<{ url?: string, width?: number, height?: number }> } } } }
    }
    const profile = payload.data?.me?.profile
    if (!profile?.name) throw new Error('Spotify returned an invalid profile.')
    const avatar = [...(profile.avatar?.sources ?? [])]
      .filter((source) => typeof source.url === 'string')
      .sort((left, right) => (right.width ?? 0) * (right.height ?? 0) - (left.width ?? 0) * (left.height ?? 0))[0]?.url ?? ''
    return {
      clientUserName: profile.name,
      clientUserDescription: profile.username ? `Spotify · @${profile.username}` : 'Spotify account',
      clientUserAvatarUrl: avatar,
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchSpotifyHome() {
  const tokenResult = await runSpotifyAccessTokenRefresh()
  if (!tokenResult.linked || !tokenResult.accessToken) throw new Error('Link Spotify before opening Spotify Discovery.')
  const { spotifySpDc, spotifySpT } = tokenResult.settings
  if (!spotifySpT) throw new Error('Spotify session is missing sp_t. Link your account again.')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new Error('Spotify home request timed out.')), 15_000)
  try {
    const response = await fetch('https://api-partner.spotify.com/pathfinder/v2/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenResult.accessToken}`,
        'User-Agent': CHROME_USER_AGENT,
        Cookie: `sp_dc=${spotifySpDc}; sp_t=${spotifySpT}`,
      },
      body: JSON.stringify({
        extensions: {
          persistedQuery: {
            sha256Hash: '5366cbf1f73f8c813dd0f1addc6934950f0dd529cec907107c85851e645c2d16',
            version: 1,
          },
        },
        operationName: 'home',
        variables: {
          facet: '',
          homeEndUserIntegration: 'INTEGRATION_WEB_PLAYER',
          includeEpisodeContentRatingsV2: true,
          sectionItemsLimit: 50,
          sp_t: spotifySpT,
          timeZone: 'Asia/Ho_Chi_Minh',
        },
      }),
      signal: controller.signal,
    })
    if (response.status === 401 || response.status === 403) throw new SpotifyInvalidCookieError()
    if (!response.ok) throw new Error(`Spotify home request failed (${response.status}).`)
    const payload = await response.json() as { errors?: Array<{ message?: string }> }
    const graphQlError = payload.errors?.map((error) => error.message).filter(Boolean).join('; ')
    if (graphQlError) throw new Error(`Spotify Home rejected the request: ${graphQlError}`)
    const home = normalizeSpotifyHome(payload)
    if (home.sections.length === 0) throw new Error('Spotify returned a Home response with no supported sections.')
    return home
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchSpotifyLibraryPlaylists() {
  const tokenResult = await runSpotifyAccessTokenRefresh()
  if (!tokenResult.linked || !tokenResult.accessToken) return []
  const { spotifySpDc, spotifySpT } = tokenResult.settings
  if (!spotifySpT) throw new Error('Spotify session is missing sp_t. Link your account again.')
  const response = await fetch('https://api-partner.spotify.com/pathfinder/v2/query', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenResult.accessToken}`,
      'User-Agent': CHROME_USER_AGENT,
      Cookie: `sp_dc=${spotifySpDc}; sp_t=${spotifySpT}`,
    },
    body: JSON.stringify({
      operationName: 'libraryV3',
      variables: { filters: ['Playlists'], limit: 100, offset: 0 },
      extensions: { persistedQuery: { version: 1, sha256Hash: '973e511ca44261fda7eebac8b653155e7caee3675abb4fb110cc1b8c78b091c3' } },
    }),
  })
  if (response.status === 401 || response.status === 403) throw new SpotifyInvalidCookieError()
  if (!response.ok) throw new Error(`Spotify library request failed (${response.status}).`)
  const payload = await response.json() as { data?: { me?: { libraryV3?: { items?: Array<{ item?: { data?: { uri?: string, name?: string, ownerV2?: { data?: { name?: string } }, images?: { items?: Array<{ sources?: Array<{ url?: string }> }> } } } }> } } }, errors?: Array<{ message?: string }> }
  const graphQlError = payload.errors?.map((error) => error.message).filter(Boolean).join('; ')
  if (graphQlError) throw new Error(`Spotify library rejected the request: ${graphQlError}`)
  return (payload.data?.me?.libraryV3?.items ?? []).flatMap(({ item }) => {
    const playlist = item?.data
    if (!playlist?.uri?.startsWith('spotify:playlist:') || !playlist.name) return []
    return [{
      id: playlist.uri.slice('spotify:playlist:'.length),
      uri: playlist.uri,
      title: playlist.name,
      subtitle: `by ${playlist.ownerV2?.data?.name?.trim() || 'Spotify'}`,
      imageUrl: playlist.images?.items?.[0]?.sources?.[0]?.url ?? '',
      type: 'Playlist',
    }]
  })
}

async function fetchSpotifyPlaylist(uri: string, offset: number, limit: number) {
  const collectionMatch = /^spotify:(playlist|album):[a-zA-Z0-9]+$/.exec(uri)
  if (!collectionMatch) throw new Error('Spotify returned an invalid playlist or album link.')
  const album = collectionMatch[1] === 'album'
  const safeOffset = Math.max(0, Math.floor(Number(offset) || 0))
  const safeLimit = Math.min(50, Math.max(1, Math.floor(Number(limit) || 50)))
  const tokenResult = await runSpotifyAccessTokenRefresh()
  if (!tokenResult.linked || !tokenResult.accessToken) throw new Error('Link Spotify before opening this playlist.')
  const { spotifySpDc, spotifySpT } = tokenResult.settings
  if (!spotifySpT) throw new Error('Spotify session is missing sp_t. Link your account again.')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new Error('Spotify playlist request timed out.')), 15_000)
  try {
    const response = await fetch('https://api-partner.spotify.com/pathfinder/v2/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenResult.accessToken}`,
        'User-Agent': CHROME_USER_AGENT,
        Cookie: `sp_dc=${spotifySpDc}; sp_t=${spotifySpT}`,
      },
      body: JSON.stringify({
        extensions: {
          persistedQuery: {
            sha256Hash: album
              ? 'b9bfabef66ed756e5e13f68a942deb60bd4125ec1f1be8cc42769dc0259b4b10'
              : 'a65e12194ed5fc443a1cdebed5fabe33ca5b07b987185d63c72483867ad13cb4',
            version: 1,
          },
        },
        operationName: album ? 'getAlbum' : 'fetchPlaylistContents',
        variables: album
          ? { limit: safeLimit, locale: '', offset: safeOffset, uri }
          : { includeEpisodeContentRatingsV2: true, limit: safeLimit, offset: safeOffset, uri },
      }),
      signal: controller.signal,
    })
    if (response.status === 401 || response.status === 403) throw new SpotifyInvalidCookieError()
    if (!response.ok) throw new Error(`Spotify collection request failed (${response.status}).`)
    const payload = await response.json() as { errors?: Array<{ message?: string }> }
    const graphQlError = payload.errors?.map((error) => error.message).filter(Boolean).join('; ')
    if (graphQlError) throw new Error(`Spotify rejected the collection request: ${graphQlError}`)
    return normalizeSpotifyPlaylist(payload, safeOffset, safeLimit)
  } finally {
    clearTimeout(timeout)
  }
}

async function searchSpotify(query: string, offset: number, limit: number) {
  const keyword = String(query ?? '').trim().slice(0, 200)
  if (!keyword) return normalizeSpotifySearch({}, 0, 30)
  const safeOffset = Math.max(0, Math.floor(Number(offset) || 0))
  const safeLimit = Math.min(50, Math.max(1, Math.floor(Number(limit) || 30)))
  const tokenResult = await runSpotifyAccessTokenRefresh()
  if (!tokenResult.linked || !tokenResult.accessToken) throw new Error('Link Spotify before searching.')
  const { spotifySpDc, spotifySpT } = tokenResult.settings
  if (!spotifySpT) throw new Error('Spotify session is missing sp_t. Link your account again.')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new Error('Spotify search request timed out.')), 15_000)
  try {
    const response = await fetch('https://api-partner.spotify.com/pathfinder/v2/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenResult.accessToken}`,
        'User-Agent': CHROME_USER_AGENT,
        Cookie: `sp_dc=${spotifySpDc}; sp_t=${spotifySpT}`,
      },
      body: JSON.stringify({
        extensions: {
          persistedQuery: {
            sha256Hash: '556f5a15b2fdd3a7113ffd377ad9805e38a3a27b8bb1ca7d6d76bad54aa8ee12',
            version: 1,
          },
        },
        operationName: 'searchSuggestions',
        variables: {
          includeAlbumPreReleases: true,
          includeAuthors: false,
          includeEpisodeContentRatingsV2: true,
          limit: safeLimit,
          numberOfTopResults: safeLimit,
          offset: safeOffset,
          query: keyword,
        },
      }),
      signal: controller.signal,
    })
    if (response.status === 401 || response.status === 403) throw new SpotifyInvalidCookieError()
    if (!response.ok) throw new Error(`Spotify search request failed (${response.status}).`)
    const payload = await response.json() as { errors?: Array<{ message?: string }> }
    const graphQlError = payload.errors?.map((error) => error.message).filter(Boolean).join('; ')
    if (graphQlError) throw new Error(`Spotify rejected the search request: ${graphQlError}`)
    return normalizeSpotifySearch(payload, safeOffset, safeLimit)
  } finally {
    clearTimeout(timeout)
  }
}

async function searchSpotifyResults(query: string) {
  const keyword = String(query ?? '').trim().slice(0, 200)
  if (!keyword) return normalizeSpotifySearch({}, 0, 50)
  const tokenResult = await runSpotifyAccessTokenRefresh()
  if (!tokenResult.linked || !tokenResult.accessToken) throw new Error('Link Spotify before searching.')
  const { spotifySpDc, spotifySpT } = tokenResult.settings
  if (!spotifySpT) throw new Error('Spotify session is missing sp_t. Link your account again.')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new Error('Spotify search request timed out.')), 15_000)
  try {
    const response = await fetch('https://api-partner.spotify.com/pathfinder/v2/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenResult.accessToken}`,
        'User-Agent': CHROME_USER_AGENT,
        Cookie: `sp_dc=${spotifySpDc}; sp_t=${spotifySpT}`,
      },
      body: JSON.stringify({
        extensions: {
          persistedQuery: {
            sha256Hash: '63a93cc04f6d8dea84a85de315e43f396a76cb681500de9ac5ccf5fc618c84cb',
            version: 1,
          },
        },
        operationName: 'searchTopResultsList',
        variables: {
          includeAlbumPreReleases: true,
          includeArtistHasConcertsField: false,
          includeAudiobooks: true,
          includeAuthors: false,
          includeEpisodeContentRatingsV2: true,
          includePreReleases: true,
          isPrefix: null,
          limit: 50,
          numberOfTopResults: 50,
          offset: 0,
          query: keyword,
          sectionFilters: ['GENERIC', 'VIDEO_CONTENT'],
        },
      }),
      signal: controller.signal,
    })
    if (response.status === 401 || response.status === 403) throw new SpotifyInvalidCookieError()
    if (!response.ok) throw new Error(`Spotify search request failed (${response.status}).`)
    const payload = await response.json() as { errors?: Array<{ message?: string }> }
    const graphQlError = payload.errors?.map((error) => error.message).filter(Boolean).join('; ')
    if (graphQlError) throw new Error(`Spotify rejected the search request: ${graphQlError}`)
    return { ...normalizeSpotifySearch(payload, 0, 50), hasMore: false }
  } finally {
    clearTimeout(timeout)
  }
}

async function removeSpotifyCredentialCookies() {
  const spotifyCookies = (await session.defaultSession.cookies.get({})).filter((cookie) =>
    (cookie.name === 'sp_dc' || cookie.name === 'sp_t') && cookie.domain?.includes('spotify.com'),
  )
  await Promise.all(spotifyCookies.map((cookie) => {
    const domain = cookie.domain?.replace(/^\./, '') ?? 'spotify.com'
    return session.defaultSession.cookies.remove(`https://${domain}${cookie.path ?? '/'}`, cookie.name)
  }))
}

async function clearExpiredSpotifyState() {
  const settings = await readAppSettings()
  const next = {
    ...settings,
    spotifySpDc: '',
    spotifySpT: '',
    spotifyAccessToken: '',
    spotifyAccessTokenExpirationTimestampMs: 0,
  }
  await saveAppSettings(next)
  await removeSpotifyCredentialCookies()
}

type IpcHandlerOptions = {
  openMiniPlayer: (sourceWindow: BrowserWindow) => Promise<void>
  expandMiniPlayer: () => void
  getMainWindow: () => BrowserWindow | null
  getMiniPlayerWindow: () => BrowserWindow | null
}

async function readLyricsFile(filePath: string) {
  if (path.extname(filePath).toLowerCase() !== '.lrc') return null
  const info = await stat(filePath).catch(() => null)
  if (!info || info.size > 512 * 1024) return null
  return readFile(filePath, 'utf8')
}

/**
 * Register request/response IPC handlers owned by the main process.
 * Removing an existing handler keeps development reloads from registering it twice.
 */
export function registerIpcHandlers(options: IpcHandlerOptions) {
  if (!debuggerCookieListenerRegistered) {
    session.defaultSession.cookies.on('changed', () => void sendDebuggerCookies())
    debuggerCookieListenerRegistered = true
  }
  Object.values(IPC_CHANNELS).forEach((channel) => ipcMain.removeHandler(channel))

  ipcMain.handle(IPC_CHANNELS.getAppInfo, (): AppInfo => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
  }))
  ipcMain.handle(IPC_CHANNELS.getLibrary, () => readLibrary())
  ipcMain.handle(IPC_CHANNELS.getPlayerState, () => readPlayerState())
  ipcMain.handle(IPC_CHANNELS.savePlayerState, (_event, state: PlayerState) => savePlayerState(state))
  ipcMain.handle(IPC_CHANNELS.getAppSettings, () => readAppSettings())
  ipcMain.handle(IPC_CHANNELS.saveAppSettings, async (_event, settings: AppSettings) => {
    await saveRendererAppSettings(settings)
    applyStartWithWindows(settings.startWithWindows)
    await refreshDiscordPresenceSettings()
  })
  ipcMain.handle(IPC_CHANNELS.resetAppSettings, async () => {
    const settings = await resetAppSettings()
    applyStartWithWindows(settings.startWithWindows)
    await refreshDiscordPresenceSettings()
    return settings
  })
  ipcMain.handle(IPC_CHANNELS.loginDiscordRpcV2, async () => {
    const settings = await loginDiscordRpcV2()
    await refreshDiscordPresenceSettings()
    return settings
  })
  ipcMain.handle(IPC_CHANNELS.validateDiscordRpcV2Token, async () => {
    const settings = await validateDiscordRpcV2Token()
    await refreshDiscordPresenceSettings()
    return settings
  })
  ipcMain.handle(IPC_CHANNELS.uploadDiscordSmallImage, (_event, image: ImageBlob) => uploadDiscordSmallImage(image))
  ipcMain.handle(IPC_CHANNELS.updateDiscordPresence, (_event, state: DiscordPlaybackState) => updateDiscordPresence(state))
  ipcMain.handle(IPC_CHANNELS.selectAudioFile, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Audio files', extensions: ['mp3', 'wav', 'flac', 'm4a', 'ogg', 'aac'] }],
    })
    return result.canceled ? null : readAudioSelection(result.filePaths[0])
  })
  ipcMain.handle(IPC_CHANNELS.selectAudioFiles, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Audio files', extensions: ['mp3', 'wav', 'flac', 'm4a', 'ogg', 'aac'] }],
    })
    if (result.canceled) return []
    return Promise.all(result.filePaths.map((filePath) => readAudioSelection(filePath)))
  })
  ipcMain.handle(IPC_CHANNELS.readDroppedAudioFiles, async (_event, filePaths: string[]) => {
    const supportedExtensions = new Set(['.mp3', '.wav', '.flac', '.m4a', '.ogg', '.aac', '.webm'])
    const audioPaths = filePaths.filter((filePath) => supportedExtensions.has(path.extname(filePath).toLowerCase()))
    return Promise.all(audioPaths.map((filePath) => readAudioSelection(filePath)))
  })
  ipcMain.handle(IPC_CHANNELS.selectCoverFile, async (_event, purpose: ImagePurpose, options?: ImageOptimizeOptions) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Cover images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }],
    })
    if (result.canceled) return null
    return optimizeImage(result.filePaths[0], purpose, options)
  })
  ipcMain.handle(IPC_CHANNELS.readDroppedCoverFile, async (_event, filePath: string, purpose: ImagePurpose, options?: ImageOptimizeOptions) => {
    const supportedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])
    if (!supportedExtensions.has(path.extname(filePath).toLowerCase())) return null
    return optimizeImage(filePath, purpose, options)
  })
  ipcMain.handle(IPC_CHANNELS.selectLyricsFile, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Lyrics files', extensions: ['lrc'] }],
    })
    if (result.canceled) return null
    return readLyricsFile(result.filePaths[0])
  })
  ipcMain.handle(IPC_CHANNELS.readDroppedLyricsFile, (_event, filePath: string) => readLyricsFile(filePath))
  ipcMain.handle(IPC_CHANNELS.importMusic, async (_event, input: ImportMusicInput) =>
    prepareDiscordCover(await importMusic(input)),
  )
  ipcMain.handle(IPC_CHANNELS.importOnlineMusic, async (event, input: ImportOnlineMusicInput) =>
    prepareDiscordCover(await importOnlineMusic(input, event.sender)),
  )
  ipcMain.handle(IPC_CHANNELS.setMusicFavorite, (_event, song: MusicTrack, favorite: boolean) => setMusicFavorite(song, favorite === true))
  ipcMain.handle(IPC_CHANNELS.recordMusicPlayback, (_event, song: MusicTrack) => recordMusicPlayback(song))
  ipcMain.handle(IPC_CHANNELS.recordMusicSkip, (_event, song: MusicTrack) => recordMusicSkip(song))
  ipcMain.handle(IPC_CHANNELS.downloadOnlineMusic, async (event, songId: string) =>
    prepareDiscordCover(await downloadOnlineMusic(songId, event.sender)),
  )
  ipcMain.handle(IPC_CHANNELS.updateMusic, async (_event, songId: string, input: UpdateMusicInput) =>
    prepareDiscordCover(await updateMusic(songId, input)),
  )
  ipcMain.handle(IPC_CHANNELS.deleteMusic, (_event, songId: string) => deleteMusic(songId))
  ipcMain.handle(IPC_CHANNELS.deleteAllMusic, () => deleteAllMusic())
  ipcMain.handle(IPC_CHANNELS.createPlaylist, (_event, input: CreatePlaylistInput) => createPlaylist(input))
  ipcMain.handle(IPC_CHANNELS.createPlaylistFromQueue, (_event, name: string, songs: MusicTrack[]) => createPlaylistFromQueue(name, Array.isArray(songs) ? songs : []))
  ipcMain.handle(IPC_CHANNELS.createPlaylistFolder, (_event, input: CreatePlaylistFolderInput) => createPlaylistFolder(input))
  ipcMain.handle(IPC_CHANNELS.updatePlaylistFolder, (_event, folderId: string, input: UpdatePlaylistFolderInput) =>
    updatePlaylistFolder(folderId, input),
  )
  ipcMain.handle(IPC_CHANNELS.deletePlaylistFolder, (_event, folderId: string) => deletePlaylistFolder(folderId))
  ipcMain.handle(IPC_CHANNELS.movePlaylistToFolder, (_event, playlistId: string, folderId: string | null) =>
    movePlaylistToFolder(playlistId, folderId),
  )
  ipcMain.handle(IPC_CHANNELS.updatePlaylist, (_event, playlistId: string, input: UpdatePlaylistInput) =>
    updatePlaylist(playlistId, input),
  )
  ipcMain.handle(IPC_CHANNELS.deletePlaylist, (_event, playlistId: string) => deletePlaylist(playlistId))
  ipcMain.handle(IPC_CHANNELS.deleteAllPlaylists, () => deleteAllPlaylists())
  ipcMain.handle(IPC_CHANNELS.addSongToPlaylist, (_event, playlistId: string, songId: string) =>
    addSongToPlaylist(playlistId, songId),
  )
  ipcMain.handle(IPC_CHANNELS.addOnlineSongToPlaylist, (_event, playlistId: string, input: AddOnlineSongToPlaylistInput) =>
    addOnlineSongToPlaylist(playlistId, input),
  )
  ipcMain.handle(IPC_CHANNELS.addOnlineSongToLibrary, async (_event, input: AddOnlineSongToPlaylistInput) =>
    prepareDiscordCover(await addOnlineSongToLibrary(input)),
  )
  ipcMain.handle(IPC_CHANNELS.removeSongFromPlaylist, (_event, playlistId: string, songId: string) =>
    removeSongFromPlaylist(playlistId, songId),
  )
  ipcMain.handle(IPC_CHANNELS.reorderPlaylistSongs, (_event, playlistId: string, songIds: string[]) =>
    reorderPlaylistSongs(playlistId, songIds),
  )
  ipcMain.handle(IPC_CHANNELS.hideWindow, (event) => BrowserWindow.fromWebContents(event.sender)?.hide())
  ipcMain.handle(IPC_CHANNELS.minimizeWindow, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return
    if ((await readAppSettings()).minimizeToTray) hideToTray(window)
    else window.minimize()
  })
  ipcMain.handle(IPC_CHANNELS.toggleMaximizeWindow, (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return false
    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
    return window.isMaximized()
  })
  ipcMain.handle(IPC_CHANNELS.closeWindow, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return
    if ((await readAppSettings()).playInBackground) {
      hideToTray(window)
    }
    else window.close()
  })
  ipcMain.handle(IPC_CHANNELS.openMiniPlayer, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window) await options.openMiniPlayer(window)
  })
  ipcMain.handle(IPC_CHANNELS.expandMiniPlayer, () => options.expandMiniPlayer())
  ipcMain.handle(IPC_CHANNELS.getMiniPlayerState, () => latestMiniPlayerState)
  ipcMain.handle(IPC_CHANNELS.sendMiniPlayerState, (_event, state: MiniPlayerState) => {
    latestMiniPlayerState = state
    options.getMiniPlayerWindow()?.webContents.send(IPC_CHANNELS.miniPlayerStateChanged, state)
  })
  ipcMain.handle(IPC_CHANNELS.sendMiniPlayerCommand, (_event, command: MiniPlayerCommand) => {
    if (command.type === 'expand') {
      options.expandMiniPlayer()
      return
    }
    options.getMainWindow()?.webContents.send(IPC_CHANNELS.miniPlayerCommand, command)
  })
  ipcMain.handle(IPC_CHANNELS.restartApp, () => {
    app.relaunch()
    app.exit(0)
  })
  ipcMain.handle(IPC_CHANNELS.openDevTools, async (event) => {
    if (!(await readAppSettings()).debuggerEnabled) return
    BrowserWindow.fromWebContents(event.sender)?.webContents.openDevTools({ mode: 'detach' })
  })
  ipcMain.handle(IPC_CHANNELS.openDebuggerBrowser, async (event, rawUrl: string, rawUserAgent: string) => {
    if (!(await readAppSettings()).debuggerEnabled) throw new Error('Enable Debugger before opening a browser window.')

    let url: URL
    try {
      url = new URL(rawUrl.trim())
    } catch {
      throw new Error('Enter a valid URL.')
    }
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS URLs are supported.')
    const userAgent = rawUserAgent.trim()
    if (!userAgent) throw new Error('Enter a user-agent.')
    if (userAgent.length > 1024) throw new Error('User-agent must be 1024 characters or fewer.')

    debuggerCookieRecipient = event.sender
    if (debuggerBrowserWindow?.isDestroyed()) debuggerBrowserWindow = null
    if (!debuggerBrowserWindow) {
      debuggerBrowserWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 720,
        minHeight: 480,
        title: 'Hoshino Debug Browser',
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
      })
      debuggerBrowserWindow.on('closed', () => { debuggerBrowserWindow = null })
      debuggerBrowserWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      debuggerBrowserWindow.webContents.on('did-navigate', (_event, navigatedUrl) => sendDebuggerBrowserUrl(navigatedUrl))
      debuggerBrowserWindow.webContents.on('did-navigate-in-page', (_event, navigatedUrl) => sendDebuggerBrowserUrl(navigatedUrl))
    }
    debuggerBrowserWindow.webContents.setUserAgent(userAgent)
    await debuggerBrowserWindow.loadURL(url.toString())
    debuggerBrowserWindow.show()
    debuggerBrowserWindow.focus()
    return serializeCookies(await session.defaultSession.cookies.get({}))
  })
  ipcMain.handle(IPC_CHANNELS.getDebuggerCookies, async () => {
    if (!(await readAppSettings()).debuggerEnabled) return []
    return serializeCookies(await session.defaultSession.cookies.get({}))
  })
  ipcMain.handle(IPC_CHANNELS.ensureSpotifyAccessToken, async () => {
    if (spotifyEnsurePromise) return spotifyEnsurePromise
    const task = (async () => {
      try {
        const result = await runSpotifyAccessTokenRefresh()
        return { linked: result.linked, accessToken: result.accessToken, accessTokenExpirationTimestampMs: result.settings.spotifyAccessTokenExpirationTimestampMs, stateCleared: false }
      } catch (error) {
        if (error instanceof SpotifyInvalidCookieError) {
          spotifyInvalidCookieFailures += 1
          if (spotifyInvalidCookieFailures >= 2) {
            spotifyInvalidCookieFailures = 0
            await clearExpiredSpotifyState()
            return { linked: false, accessToken: '', accessTokenExpirationTimestampMs: 0, stateCleared: true }
          }
        }
        return { linked: false, accessToken: '', accessTokenExpirationTimestampMs: 0, stateCleared: false }
      }
    })()
    spotifyEnsurePromise = task
    try {
      return await task
    } finally {
      if (spotifyEnsurePromise === task) spotifyEnsurePromise = null
    }
  })
  ipcMain.handle(IPC_CHANNELS.resetSpotifyState, async () => {
    const currentSettings = await readAppSettings()
    if (!currentSettings.debuggerEnabled) throw new Error('Enable Debugger before resetting Spotify state.')

    spotifyLinkGeneration += 1
    spotifyLinkAbortController?.abort()
    spotifyLinkAbortController = null
    spotifyTokenRefreshAbortController?.abort()
    spotifyLoginWindow?.close()
    const inFlightLink = spotifyLinkingPromise
    const inFlightRefresh = spotifyTokenRefreshPromise
    if (inFlightLink) await inFlightLink.catch(() => undefined)
    if (inFlightRefresh) await inFlightRefresh.catch(() => undefined)
    spotifyInvalidCookieFailures = 0
    const settings = await readAppSettings()
    const next = {
      ...settings,
      spotifySpDc: '',
      spotifySpT: '',
      spotifyAccessToken: '',
      spotifyAccessTokenExpirationTimestampMs: 0,
    }
    await saveAppSettings(next)

    await removeSpotifyCredentialCookies()
    return next
  })
  ipcMain.handle(IPC_CHANNELS.syncSpotifyAccount, async () => {
    return fetchSpotifyProfile()
  })
  ipcMain.handle(IPC_CHANNELS.getSpotifyHome, async () => {
    try {
      return await fetchSpotifyHome()
    } catch (error) {
      if (error instanceof SpotifyInvalidCookieError) await clearExpiredSpotifyState()
      throw error
    }
  })
  ipcMain.handle(IPC_CHANNELS.getSpotifyLibraryPlaylists, async () => {
    try {
      return await fetchSpotifyLibraryPlaylists()
    } catch (error) {
      if (error instanceof SpotifyInvalidCookieError) await clearExpiredSpotifyState()
      throw error
    }
  })
  ipcMain.handle(IPC_CHANNELS.getSpotifyPlaylist, async (_event, uri: string, offset: number, limit: number) => {
    try {
      return await fetchSpotifyPlaylist(uri, offset, limit)
    } catch (error) {
      if (error instanceof SpotifyInvalidCookieError) await clearExpiredSpotifyState()
      throw error
    }
  })
  ipcMain.handle(IPC_CHANNELS.searchSpotify, async (_event, query: string, offset: number, limit: number) => {
    try {
      return await searchSpotify(query, offset, limit)
    } catch (error) {
      if (error instanceof SpotifyInvalidCookieError) await clearExpiredSpotifyState()
      throw error
    }
  })
  ipcMain.handle(IPC_CHANNELS.searchSpotifyResults, async (_event, query: string) => {
    try {
      return await searchSpotifyResults(query)
    } catch (error) {
      if (error instanceof SpotifyInvalidCookieError) await clearExpiredSpotifyState()
      throw error
    }
  })
  ipcMain.handle(IPC_CHANNELS.resolveSpotifyPlayback, async (_event, input) => {
    const { debuggerEnabled } = await readAppSettings()
    return resolveSpotifyPlayback(input, debuggerEnabled)
  })
  ipcMain.handle(IPC_CHANNELS.openSpotifyUri, async (_event, uri: string) => {
    const match = /^spotify:(album|artist|episode|playlist|show|track):([a-zA-Z0-9]+)$/.exec(uri)
    if (!match) throw new Error('Spotify returned an unsupported link.')
    await shell.openExternal(`https://open.spotify.com/${match[1]}/${match[2]}`)
  })
  ipcMain.handle(IPC_CHANNELS.startSpotifyLogin, async (event) => {
    if (spotifyLoginWindow?.isDestroyed()) spotifyLoginWindow = null
    if (spotifyLoginWindow) {
      spotifyLoginWindow.focus()
      return
    }
    const generation = ++spotifyLinkGeneration
    const abortController = new AbortController()
    spotifyLinkAbortController = abortController
    const loginWindow = new BrowserWindow({
      width: 1100,
      height: 760,
      minWidth: 720,
      minHeight: 500,
      title: 'Link Spotify account',
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    })
    spotifyLoginWindow = loginWindow
    const loginSession = loginWindow.webContents.session
    loginWindow.webContents.setUserAgent(SPOTIFY_LOGIN_USER_AGENT)
    loginWindow.webContents.setWindowOpenHandler(({ url }) => {
      void spotifyLoginWindow?.loadURL(url)
      return { action: 'deny' }
    })
    let cookieChangedHandler: ((_event: Electron.Event, cookie: Electron.Cookie) => void) | null = null
    let cookieSettleTimer: ReturnType<typeof setTimeout> | null = null
    let linkAttemptPromise: Promise<void> | null = null
    const isActive = () => spotifyLinkGeneration === generation && !abortController.signal.aborted && !loginWindow.isDestroyed()
    loginWindow.on('closed', () => {
      if (cookieSettleTimer) clearTimeout(cookieSettleTimer)
      if (cookieChangedHandler) loginSession.cookies.removeListener('changed', cookieChangedHandler)
      if (spotifyLinkGeneration === generation) spotifyLinkGeneration += 1
      abortController.abort()
      if (spotifyLinkAbortController === abortController) spotifyLinkAbortController = null
      if (spotifyLoginWindow === loginWindow) spotifyLoginWindow = null
    })
    const finishLinking = async () => {
      if (linkAttemptPromise || !isActive()) return
      const task = (async () => {
        let cookies = await loginSession.cookies.get({})
        const spDc = cookies.find((cookie) => cookie.name === 'sp_dc' && cookie.domain?.includes('spotify.com'))?.value
        if (!spDc || !isActive()) return

        let spT = cookies.find((cookie) => cookie.name === 'sp_t' && cookie.domain?.includes('spotify.com'))?.value ?? ''
        if (!spT) {
          await new Promise((resolve) => setTimeout(resolve, 500))
          if (!isActive()) return
          cookies = await loginSession.cookies.get({})
          spT = cookies.find((cookie) => cookie.name === 'sp_t' && cookie.domain?.includes('spotify.com'))?.value ?? ''
        }
        if (!isActive()) return

        const cookieSettings = { ...(await readAppSettings()), spotifySpDc: spDc, spotifySpT: spT }
        if (!isActive()) return
        await saveAppSettings(cookieSettings)
        if (!isActive()) return
        const token = await getSpotifyAccessToken(spDc, abortController.signal)
        if (!isActive()) return
        const settings = { ...cookieSettings, ...token }
        await saveAppSettings(settings)
        if (!isActive()) return
        if (!event.sender.isDestroyed()) event.sender.send(IPC_CHANNELS.spotifyLinked, settings)
        loginWindow.close()
      })()
      linkAttemptPromise = task
      spotifyLinkingPromise = task
      try {
        await task
      } catch (error) {
        if (isActive() && !event.sender.isDestroyed()) {
          const detail = error instanceof Error && error.message ? error.message : 'Unknown Spotify error.'
          event.sender.send(IPC_CHANNELS.spotifyLinkError, `Could not link Spotify: ${detail}`)
        }
      } finally {
        linkAttemptPromise = null
        if (spotifyLinkingPromise === task) spotifyLinkingPromise = null
      }
    }
    const scheduleFinishLinking = () => {
      if (cookieSettleTimer) clearTimeout(cookieSettleTimer)
      cookieSettleTimer = setTimeout(() => {
        cookieSettleTimer = null
        void finishLinking()
      }, 350)
    }
    cookieChangedHandler = (_event, cookie) => {
      if (cookie.name === 'sp_dc' || cookie.name === 'sp_t') scheduleFinishLinking()
    }
    loginSession.cookies.on('changed', cookieChangedHandler)
    try {
      await loginWindow.loadURL('https://accounts.spotify.com/en/login')
      scheduleFinishLinking()
    } catch (error) {
      if (isActive() && !event.sender.isDestroyed()) {
        const detail = error instanceof Error && error.message ? error.message : 'Could not load Spotify login.'
        event.sender.send(IPC_CHANNELS.spotifyLinkError, `Could not open Spotify login: ${detail}`)
      }
    }
  })
}

function onlineAudioFile(url: URL) {
  const mime = (url.searchParams.get('mime') ?? '').toLowerCase()
  const pathExtension = path.extname(url.pathname).toLowerCase()
  const extension = pathExtension
    || (mime.includes('webm') ? '.webm' : mime.includes('mp4') ? '.m4a' : mime.includes('ogg') ? '.ogg' : mime.includes('aac') ? '.aac' : '.mp3')
  const rawName = path.basename(decodeURIComponent(url.pathname))
  const fileName = rawName && path.extname(rawName) ? rawName : `${rawName || 'hoshino-online'}${extension}`
  return { extension, fileName }
}

async function importOnlineMusic(input: ImportOnlineMusicInput, webContents: WebContents) {
  const library = await readLibrary()
  const existingTrack = library.songs.find((song) => (input.id && song.id === input.id) || song.sourceUrl === input.url)
  if (existingTrack && !existingTrack.isOnline) return existingTrack

  const url = new URL(input.url)
  const { fileName } = onlineAudioFile(url)
  const tempDirectory = path.join(app.getPath('temp'), 'hoshino-online-imports')
  const tempPath = path.join(tempDirectory, `${randomUUID()}-${fileName}`)
  await mkdir(tempDirectory, { recursive: true })

  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Could not download online music: ${response.status}`)
    await downloadResponseToFile(response, tempPath, input.requestId, webContents)

    const selection = await readAudioSelection(tempPath)
    const downloaded = {
      id: input.id,
      sourceUrl: input.url,
      sourcePath: tempPath,
      coverBlob: selection.coverBlob,
      coverUrl: input.cover?.trim() || undefined,
      title: input.title || selection.title || path.parse(fileName).name,
      artist: selection.artist || input.artist || 'Unknown artist',
      album: selection.album || input.album,
      genre: selection.genre || input.genre,
      year: selection.year || input.year,
      lyricsUrl: input.lyrics?.trim() || undefined,
      lyricsDelay: input.lyricsOffset,
      duration: selection.duration > 0 ? selection.duration : input.duration,
    }
    return existingTrack?.isOnline
      ? await replaceOnlineMusicWithLocal(existingTrack.id, downloaded)
      : await importMusic(downloaded)
  } finally {
    await unlink(tempPath).catch(() => undefined)
  }
}

async function downloadOnlineMusic(songId: string, webContents: WebContents) {
  const library = await readLibrary()
  const track = library.songs.find((song) => song.id === songId)
  if (!track?.sourceUrl) throw new Error('Online song not found')
  let downloadUrl = track.sourceUrl
  if (track.sourceUrl.startsWith('spotify:track:')) {
    const resolved = await resolveSpotifyPlayback({
      id: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      imageUrl: track.rpcCoverUrl ?? track.coverUrl ?? '',
      durationMs: Math.round((track.duration ?? 0) * 1000),
    }, false)
    downloadUrl = resolved.audioUrl
  }
  const downloaded = await downloadOnlineMusicToTemp({
    requestId: songId,
    id: track.id,
    url: downloadUrl,
    title: track.title,
    artist: track.artist,
    album: track.album,
    genre: track.genre,
    year: track.year,
    cover: track.coverUrl ?? '',
    lyrics: track.lyricsUrl ?? '',
    lyricsOffset: track.lyricsDelay ?? 0,
    duration: track.duration,
  }, webContents)
  try {
    return await replaceOnlineMusicWithLocal(songId, downloaded)
  } finally {
    await unlink(downloaded.sourcePath).catch(() => undefined)
  }
}

async function downloadOnlineMusicToTemp(input: ImportOnlineMusicInput, webContents: WebContents): Promise<ImportMusicInput> {
  const url = new URL(input.url)
  const { fileName } = onlineAudioFile(url)
  const tempDirectory = path.join(app.getPath('temp'), 'hoshino-online-imports')
  const tempPath = path.join(tempDirectory, `${randomUUID()}-${fileName}`)
  await mkdir(tempDirectory, { recursive: true })

  const response = await fetch(url)
  if (!response.ok) throw new Error(`Could not download online music: ${response.status}`)
  await downloadResponseToFile(response, tempPath, input.requestId, webContents)

  const selection = await readAudioSelection(tempPath)
  return {
    id: input.id,
    sourceUrl: input.url,
    sourcePath: tempPath,
    coverBlob: selection.coverBlob,
    coverUrl: input.cover?.trim() || undefined,
    title: input.title || selection.title || path.parse(fileName).name,
    artist: selection.artist || input.artist || 'Unknown artist',
    album: selection.album || input.album,
    genre: selection.genre || input.genre,
    year: selection.year || input.year,
    lyricsUrl: input.lyrics?.trim() || undefined,
    lyricsDelay: input.lyricsOffset,
    duration: selection.duration > 0 ? selection.duration : input.duration,
  }
}

async function downloadResponseToFile(response: Response, destination: string, requestId: string, webContents: WebContents) {
  const WRITE_BATCH_BYTES = 1024 * 1024
  const PROGRESS_INTERVAL_MS = 125
  const totalBytes = Number(response.headers.get('content-length')) || null
  const reader = response.body?.getReader()
  let receivedBytes = 0
  let lastProgressAt = 0

  const sendProgress = (force = false) => {
    const now = Date.now()
    if (!force && now - lastProgressAt < PROGRESS_INTERVAL_MS) return
    lastProgressAt = now
    if (webContents.isDestroyed()) return
    webContents.send(IPC_CHANNELS.importOnlineMusicProgress, {
      requestId,
      progress: totalBytes ? Math.min(receivedBytes / totalBytes, 1) : null,
      receivedBytes,
      totalBytes,
    })
  }

  sendProgress(true)
  const supportsParallelRanges = totalBytes !== null
    && totalBytes >= 1024 * 1024
    && response.headers.get('accept-ranges')?.toLowerCase() === 'bytes'
    && Boolean(response.url)
  if (supportsParallelRanges) {
    const connectionCount = 4
    const rangeSize = Math.ceil(totalBytes / connectionCount)
    const ranges = Array.from({ length: connectionCount }, (_, index) => ({
      start: index * rangeSize,
      end: Math.min(totalBytes - 1, (index + 1) * rangeSize - 1),
    })).filter((range) => range.start <= range.end)
    const rangeResponses = await Promise.all(ranges.map((range) => fetch(response.url, {
      headers: { Range: `bytes=${range.start}-${range.end}` },
    }).catch(() => null)))
    const canUseRanges = rangeResponses.every((rangeResponse, index) => {
      const range = ranges[index]
      if (!rangeResponse?.body || rangeResponse.status !== 206 || !range) return false
      const contentRange = rangeResponse.headers.get('content-range') ?? ''
      return contentRange.startsWith(`bytes ${range.start}-${range.end}/`)
    })
    if (canUseRanges) {
      await response.body?.cancel().catch(() => undefined)
      const file = await open(destination, 'w')
      try {
        await file.truncate(totalBytes)
        await Promise.all(rangeResponses.map(async (rangeResponse, index) => {
          const range = ranges[index]
          if (!rangeResponse?.body || !range) return
          const rangeReader = rangeResponse.body.getReader()
          let position = range.start
          while (true) {
            const { done, value } = await rangeReader.read()
            if (done) break
            let offset = 0
            while (offset < value.byteLength) {
              const { bytesWritten } = await file.write(value, offset, value.byteLength - offset, position + offset)
              if (!bytesWritten) throw new Error('Could not write downloaded audio range to disk.')
              offset += bytesWritten
            }
            position += value.byteLength
            receivedBytes += value.byteLength
            sendProgress()
          }
        }))
        sendProgress(true)
        return
      } finally {
        await file.close()
      }
    }
    await Promise.all(rangeResponses.map((rangeResponse) => rangeResponse?.body?.cancel().catch(() => undefined)))
  }
  if (!reader) {
    const buffer = Buffer.from(await response.arrayBuffer())
    await open(destination, 'w').then(async (file) => {
      try {
        await file.write(buffer)
      } finally {
        await file.close()
      }
    })
    receivedBytes = buffer.byteLength
    sendProgress(true)
    return
  }

  const file = await open(destination, 'w')
  let chunks: Buffer[] = []
  let bufferedBytes = 0
  const flush = async () => {
    if (!bufferedBytes) return
    const batch = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks, bufferedBytes)
    chunks = []
    bufferedBytes = 0
    let offset = 0
    while (offset < batch.byteLength) {
      const { bytesWritten } = await file.write(batch.subarray(offset))
      if (!bytesWritten) throw new Error('Could not write downloaded audio to disk.')
      offset += bytesWritten
    }
  }
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      receivedBytes += value.byteLength
      chunks.push(Buffer.from(value))
      bufferedBytes += value.byteLength
      if (bufferedBytes >= WRITE_BATCH_BYTES) await flush()
      sendProgress()
    }
    await flush()
    sendProgress(true)
  } finally {
    await file.close()
  }
}

function hideToTray(window: BrowserWindow) {
  window.hide()
  if (backgroundTray) return
  backgroundTray = new Tray(path.join(process.env.VITE_PUBLIC ?? '', 'logo.jpg'))
  const showWindow = () => {
    window.show()
    window.focus()
    backgroundTray?.destroy()
    backgroundTray = null
  }
  backgroundTray.setToolTip('Hoshino Music is playing in the background')
  backgroundTray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show Hoshino Music', click: showWindow },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]))
  backgroundTray.on('click', showWindow)
}

/**
 * Send a one-way event to a renderer after its window has finished loading.
 */
export function sendAppReady(webContents: WebContents) {
  webContents.send(IPC_CHANNELS.appReady, new Date().toISOString())
}
