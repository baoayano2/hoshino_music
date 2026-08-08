import { app } from 'electron'
import { copyFile, mkdir, readFile, rename, rmdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { AddOnlineSongToPlaylistInput, AppSettings, CreatePlaylistFolderInput, CreatePlaylistInput, ImageBlob, ImportMusicInput, MusicLibrary, MusicTrack, PlayerState, PlaylistFolderRecord, PlaylistRecord, UpdateMusicInput, UpdatePlaylistFolderInput, UpdatePlaylistInput } from '../ipc/types'
import { assertImageSize, assertSupportedCoverImage, optimizeImageBlob, SONG_IMAGE_BYTES } from './image'
import { readAudioDuration } from './metadata'
import { readProtectedCredentials, writeProtectedCredentials, type ProtectedCredentials } from '../security/credential-store'

const EMPTY_LIBRARY: MusicLibrary = { songs: [], playlists: [], playlistFolders: [] }
const DEFAULT_PLAYER_STATE: PlayerState = { volume: 0.6, currentSongId: null, currentTime: 0, playbackPlaylistId: null, spotifyQueue: [], customQueueNextUp: [], customQueueLater: [] }
const EQ_FREQUENCIES: Record<number, number[]> = {
  3: [100, 1000, 10000],
  5: [60, 250, 1000, 4000, 12000],
  10: [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000],
  15: [25, 40, 63, 100, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300, 10000, 16000],
}
const DEFAULT_APP_SETTINGS: AppSettings = {
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

function normalizeEqBandCount(value: number) {
  return [3, 5, 10, 15].includes(value) ? value : 10
}

function normalizeCrossFadeDuration(value: number | undefined) {
  if (!Number.isFinite(value)) return 5
  return Math.round(Math.min(Math.max(value ?? 5, 1), 15) * 10) / 10
}

function normalizeLyricsDelay(value: number | undefined) {
  if (!Number.isFinite(value)) return 0
  return Math.round(Math.min(Math.max(value ?? 0, -30), 30) * 100) / 100
}

function normalizeAudioSpeed(value: number | undefined) {
  if (!Number.isFinite(value)) return 1
  return Math.round(Math.min(Math.max(value as number, 0.75), 1.5) * 100) / 100
}

function clampEqFrequency(value: number) {
  if (!Number.isFinite(value)) return 20
  return Math.round(Math.min(Math.max(value, 20), 20000))
}

function normalizeEqFrequencies(frequencies: number[] | undefined, bandCount: number) {
  const defaults = EQ_FREQUENCIES[normalizeEqBandCount(bandCount)]
  return defaults.map((frequency, index) => clampEqFrequency(frequencies?.[index] ?? frequency))
}

function normalizeEqGains(gains: number[] | undefined, bandCount: number) {
  const defaults = EQ_FREQUENCIES[normalizeEqBandCount(bandCount)]
  return defaults.map((_, index) => {
    const gain = gains?.[index] ?? 0
    return Number.isFinite(gain) ? Math.min(Math.max(gain, -12), 12) : 0
  })
}

function normalizeEqQValues(qValues: number[] | undefined, bandCount: number) {
  const defaults = EQ_FREQUENCIES[normalizeEqBandCount(bandCount)]
  return defaults.map((_, index) => {
    const qValue = qValues?.[index] ?? 1.1
    return Number.isFinite(qValue) ? Math.round(Math.min(Math.max(qValue, 0.1), 18) * 100) / 100 : 1.1
  })
}

function normalizeEqBandSettings(settings: Partial<AppSettings>, activeBandCount: number) {
  const source = settings.tuneEqBandSettings && typeof settings.tuneEqBandSettings === 'object' ? settings.tuneEqBandSettings : {}
  return [3, 5, 10, 15].reduce<Record<string, { frequencies: number[], qValues: number[], gains: number[] }>>((profiles, bandCount) => {
    const profile = source[String(bandCount)]
    profiles[String(bandCount)] = {
      frequencies: normalizeEqFrequencies(bandCount === activeBandCount && Array.isArray(settings.tuneEqFrequencies) ? settings.tuneEqFrequencies : profile?.frequencies, bandCount),
      qValues: normalizeEqQValues(bandCount === activeBandCount && Array.isArray(settings.tuneEqQValues) ? settings.tuneEqQValues : profile?.qValues, bandCount),
      gains: normalizeEqGains(bandCount === activeBandCount && Array.isArray(settings.tuneEqGains) ? settings.tuneEqGains : profile?.gains, bandCount),
    }
    return profiles
  }, {})
}
let libraryMutationQueue = Promise.resolve()
let settingsMutationQueue = Promise.resolve()
let playerStateSaveQueue = Promise.resolve()
let libraryTransactionActive = false

async function withLibraryMutation<T>(operation: () => Promise<T>): Promise<T> {
  const transaction = async () => {
    libraryTransactionActive = true
    try {
      return await operation()
    } finally {
      libraryTransactionActive = false
    }
  }
  const result = libraryMutationQueue.then(transaction, transaction)
  libraryMutationQueue = result.then(() => undefined, () => undefined)
  return result
}

function storagePaths() {
  const root = path.join(app.getPath('userData'), 'HoshinoMusic')
  return {
    root,
    audio: path.join(root, 'audio'),
    heroes: path.join(root, 'heroes'),
    config: path.join(root, 'library.json'),
    playerState: path.join(root, 'player-state.json'),
    settings: path.join(root, 'settings.json'),
    credentials: path.join(root, 'credentials.json'),
  }
}

export async function initializeMusicStorage() {
  const paths = storagePaths()
  await mkdir(paths.audio, { recursive: true })
  await mkdir(paths.heroes, { recursive: true })

  await withLibraryMutation(async () => {
    try {
      await readFile(paths.config, 'utf8')
    } catch {
      await writeLibrary(EMPTY_LIBRARY)
    }
    await migrateStoredCovers()
    await optimizeExistingSongCovers()
    await backfillStoredDurations()
  })
  try {
    await readFile(paths.playerState, 'utf8')
  } catch {
    await savePlayerState(DEFAULT_PLAYER_STATE)
  }
  try {
    await readFile(paths.settings, 'utf8')
  } catch {
    await saveAppSettings(DEFAULT_APP_SETTINGS)
  }
  // Rewriting once migrates legacy plaintext cookies/tokens into safeStorage and
  // removes the sensitive fields from settings.json.
  await saveAppSettings(await readAppSettings())
}

export async function readLibrary(): Promise<MusicLibrary> {
  const { config } = storagePaths()

  try {
    const library = JSON.parse(await readFile(config, 'utf8')) as Partial<MusicLibrary>
    const playlistFolders = Array.isArray(library.playlistFolders) ? library.playlistFolders : []
    const folderIds = new Set(playlistFolders.map((folder) => folder.id))
    return {
      songs: Array.isArray(library.songs) ? library.songs : [],
      playlists: Array.isArray(library.playlists)
        ? library.playlists.map((playlist) => ({
          ...playlist,
          folderId: playlist.folderId && folderIds.has(playlist.folderId) ? playlist.folderId : null,
        }))
        : [],
      playlistFolders,
    }
  } catch {
    return structuredClone(EMPTY_LIBRARY)
  }
}

async function writeLibrary(library: MusicLibrary) {
  if (!libraryTransactionActive) throw new Error('Library writes must run inside the transaction queue')
  await writeFile(storagePaths().config, JSON.stringify(library, null, 2), 'utf8')
}

async function migrateStoredCovers() {
  const library = await readLibrary()
  let changed = false
  const migrateRecord = async (record: { coverStoredName?: string, coverUrl?: string, rpcCoverUrl?: string }) => {
    if (!record.coverStoredName) return
    const coverPath = path.join(storagePaths().root, 'covers', record.coverStoredName)
    const extension = path.extname(record.coverStoredName).toLowerCase()
    const mimeType = extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : extension === '.gif' ? 'image/gif' : 'image/jpeg'
    const data = await readFile(coverPath).catch(() => null)
    if (data) {
      record.coverUrl = `data:${mimeType};base64,${data.toString('base64')}`
    } else if (record.coverUrl?.startsWith('hoshino-cover:')) {
      delete record.coverUrl
    }
    await removeFile(coverPath)
    delete record.coverStoredName
    delete record.rpcCoverUrl
    changed = true
  }

  await Promise.all([
    ...library.songs.map((song) => migrateRecord(song)),
    ...library.playlists.map((playlist) => migrateRecord(playlist)),
  ])
  if (changed) await writeLibrary(library)
  await rmdir(path.join(storagePaths().root, 'covers')).catch(() => undefined)
}

async function optimizeExistingSongCovers() {
  const library = await readLibrary()
  let changed = false

  for (const song of library.songs) {
    const match = /^data:(image\/[^;]+);base64,(.+)$/.exec(song.coverUrl ?? '')
    if (!match) continue
    const data = Buffer.from(match[2], 'base64')
    if (data.byteLength < SONG_IMAGE_BYTES) continue

    const optimized = await optimizeImageBlob({
      name: `${song.id}.${match[1].split('/')[1]}`,
      mimeType: match[1],
      data: new Uint8Array(data),
    }, 'song', { cropSquare: true })
    song.coverUrl = `data:${optimized.mimeType};base64,${Buffer.from(optimized.data).toString('base64')}`
    delete song.rpcCoverUrl
    changed = true
  }

  if (changed) await writeLibrary(library)
}

async function backfillStoredDurations() {
  const library = await readLibrary()
  let changed = false

  await Promise.all(library.songs.map(async (song) => {
    if (song.isOnline || !song.storedName || (typeof song.duration === 'number' && song.duration > 0)) return
    const duration = await readAudioDuration(path.join(storagePaths().audio, song.storedName))
    if (duration <= 0) return
    song.duration = duration
    changed = true
  }))

  if (changed) await writeLibrary(library)
}

export async function readPlayerState(): Promise<PlayerState> {
  try {
    const state = JSON.parse(await readFile(storagePaths().playerState, 'utf8')) as Partial<PlayerState>
    return {
      volume: typeof state.volume === 'number' ? state.volume : DEFAULT_PLAYER_STATE.volume,
      currentSongId: typeof state.currentSongId === 'string' ? state.currentSongId : null,
      currentTime: typeof state.currentTime === 'number' ? state.currentTime : 0,
      playbackPlaylistId: typeof state.playbackPlaylistId === 'string' ? state.playbackPlaylistId : null,
      spotifyTrack: state.spotifyTrack?.id && state.spotifyTrack.title ? state.spotifyTrack : undefined,
      spotifyQueue: Array.isArray(state.spotifyQueue) ? state.spotifyQueue.filter((track) => track?.id && track.title) : [],
      customQueueNextUp: Array.isArray(state.customQueueNextUp) ? state.customQueueNextUp.filter((track) => track?.id && track.title).slice(0, 500) : [],
      customQueueLater: Array.isArray(state.customQueueLater) ? state.customQueueLater.filter((track) => track?.id && track.title).slice(0, 500) : [],
    }
  } catch {
    return structuredClone(DEFAULT_PLAYER_STATE)
  }
}

export function savePlayerState(state: PlayerState): Promise<void> {
  const snapshot = structuredClone(state)
  const save = async () => {
  const normalized: PlayerState = {
    volume: Math.min(Math.max(snapshot.volume, 0), 1),
    currentSongId: snapshot.currentSongId,
    currentTime: Math.max(snapshot.currentTime, 0),
    playbackPlaylistId: snapshot.playbackPlaylistId,
    spotifyTrack: snapshot.spotifyTrack,
    spotifyQueue: snapshot.spotifyQueue?.slice(0, 100) ?? [],
    customQueueNextUp: snapshot.customQueueNextUp?.filter((track) => track?.id && track.title).slice(0, 500) ?? [],
    customQueueLater: snapshot.customQueueLater?.filter((track) => track?.id && track.title).slice(0, 500) ?? [],
  }
  await writeFile(storagePaths().playerState, JSON.stringify(normalized, null, 2), 'utf8')
  }
  const result = playerStateSaveQueue.then(save, save)
  playerStateSaveQueue = result.then(() => undefined, () => undefined)
  return result
}

export async function readAppSettings(): Promise<AppSettings> {
  try {
    const settings = JSON.parse(await readFile(storagePaths().settings, 'utf8')) as Partial<AppSettings> & { discordTextTemplate?: string, audioPitch?: number }
    const protectedCredentials = await readProtectedCredentials(storagePaths().credentials)
    const tuneEqBandCount = normalizeEqBandCount(settings.tuneEqBandCount ?? 0)
    const tuneEqBandSettings = normalizeEqBandSettings(settings, tuneEqBandCount)
    const activeTuneEqSettings = tuneEqBandSettings[String(tuneEqBandCount)]
    return {
      playInBackground: settings.playInBackground === true,
      minimizeToTray: settings.minimizeToTray === true,
      startWithWindows: settings.startWithWindows === true,
      fullscreenPlayerLayout: settings.fullscreenPlayerLayout === 'split' ? 'split' : 'centered',
      debuggerEnabled: settings.debuggerEnabled === true,
      spotifySpDc: protectedCredentials.spotifySpDc || (typeof settings.spotifySpDc === 'string' ? settings.spotifySpDc : ''),
      spotifySpT: protectedCredentials.spotifySpT || (typeof settings.spotifySpT === 'string' ? settings.spotifySpT : ''),
      spotifyAccessToken: protectedCredentials.spotifyAccessToken || (typeof settings.spotifyAccessToken === 'string' ? settings.spotifyAccessToken : ''),
      spotifyAccessTokenExpirationTimestampMs: typeof settings.spotifyAccessTokenExpirationTimestampMs === 'number' ? settings.spotifyAccessTokenExpirationTimestampMs : 0,
      showSpotifyPlaylistsInSidebar: settings.showSpotifyPlaylistsInSidebar !== false,
      extendedLibraryEnabled: settings.extendedLibraryEnabled === true,
      customQueueEnabled: settings.customQueueEnabled === true,
      spotifyPlaylistSort: settings.spotifyPlaylistSort === 'title' || settings.spotifyPlaylistSort === 'duration' || settings.spotifyPlaylistSort === 'newest' ? settings.spotifyPlaylistSort : 'oldest',
      forceMostListenedSection: settings.forceMostListenedSection === true,
      customCss: typeof settings.customCss === 'string' ? settings.customCss : '',
      clientUserName: typeof settings.clientUserName === 'string' ? settings.clientUserName.trim() : '',
      clientUserDescription: typeof settings.clientUserDescription === 'string' ? settings.clientUserDescription.trim() : '',
      clientUserAvatarUrl: typeof settings.clientUserAvatarUrl === 'string' ? settings.clientUserAvatarUrl.trim() : '',
      lyricsDelay: normalizeLyricsDelay(settings.lyricsDelay),
      audioSpeed: normalizeAudioSpeed(settings.audioSpeed ?? settings.audioPitch),
      audioPitchEnabled: settings.audioPitchEnabled === true || typeof settings.audioPitch === 'number' && settings.audioPitch !== 1,
      crossFadeEnabled: settings.crossFadeEnabled === true,
      crossFadeDuration: normalizeCrossFadeDuration(settings.crossFadeDuration),
      tuneEqEnabled: settings.tuneEqEnabled === true,
      tuneEqAutoSave: settings.tuneEqAutoSave !== false,
      tuneEqBandCount,
      tuneEqFrequencies: activeTuneEqSettings.frequencies,
      tuneEqQValues: activeTuneEqSettings.qValues,
      tuneEqGains: activeTuneEqSettings.gains,
      tuneEqBandSettings,
      discordRpcEnabled: settings.discordRpcEnabled !== false,
      discordKeepRichPresence: settings.discordKeepRichPresence === true,
      discordSmallImageUrl: typeof settings.discordSmallImageUrl === 'string' ? settings.discordSmallImageUrl.trim() : '',
      discordPausedSmallImageUrl: typeof settings.discordPausedSmallImageUrl === 'string' ? settings.discordPausedSmallImageUrl.trim() : '',
      discordDetailsTemplate: typeof settings.discordDetailsTemplate === 'string' ? settings.discordDetailsTemplate : settings.discordTextTemplate ?? '%song_name%',
      discordStateTemplate: typeof settings.discordStateTemplate === 'string' ? settings.discordStateTemplate : '%artist_name%',
      discordLargeTextTemplate: typeof settings.discordLargeTextTemplate === 'string' ? settings.discordLargeTextTemplate : '%album_name%',
      discordSmallTextTemplate: typeof settings.discordSmallTextTemplate === 'string' ? settings.discordSmallTextTemplate : 'Hoshino Player',
      discordPausedSmallTextTemplate: typeof settings.discordPausedSmallTextTemplate === 'string' ? settings.discordPausedSmallTextTemplate : '',
      discordRpcV2Enabled: settings.discordRpcV2Enabled === true,
      discordRpcV2KeepRichPresence: settings.discordRpcV2KeepRichPresence === true,
      discordRpcV2OauthAccessToken: protectedCredentials.discordRpcV2OauthAccessToken || (typeof settings.discordRpcV2OauthAccessToken === 'string' ? settings.discordRpcV2OauthAccessToken : ''),
      discordRpcV2OauthRefreshToken: protectedCredentials.discordRpcV2OauthRefreshToken || (typeof settings.discordRpcV2OauthRefreshToken === 'string' ? settings.discordRpcV2OauthRefreshToken : ''),
      discordRpcV2OauthExpiresAt: typeof settings.discordRpcV2OauthExpiresAt === 'number' ? settings.discordRpcV2OauthExpiresAt : 0,
      discordRpcV2SmallImageUrl: typeof settings.discordRpcV2SmallImageUrl === 'string' ? settings.discordRpcV2SmallImageUrl.trim() : '',
      discordRpcV2PausedSmallImageUrl: typeof settings.discordRpcV2PausedSmallImageUrl === 'string' ? settings.discordRpcV2PausedSmallImageUrl.trim() : '',
      discordRpcV2DetailsTemplate: typeof settings.discordRpcV2DetailsTemplate === 'string' ? settings.discordRpcV2DetailsTemplate : '%song_name%',
      discordRpcV2StateTemplate: typeof settings.discordRpcV2StateTemplate === 'string' ? settings.discordRpcV2StateTemplate : '%artist_name%',
      discordRpcV2LargeTextTemplate: typeof settings.discordRpcV2LargeTextTemplate === 'string' ? settings.discordRpcV2LargeTextTemplate : '%album_name%',
      discordRpcV2SmallTextTemplate: typeof settings.discordRpcV2SmallTextTemplate === 'string' ? settings.discordRpcV2SmallTextTemplate : 'Hoshino Player',
      discordRpcV2PausedSmallTextTemplate: typeof settings.discordRpcV2PausedSmallTextTemplate === 'string' ? settings.discordRpcV2PausedSmallTextTemplate : '',
      dismissedVersionNoticeVersions: Array.isArray(settings.dismissedVersionNoticeVersions)
        ? settings.dismissedVersionNoticeVersions.filter((version): version is string => typeof version === 'string')
        : [],
      dismissedUpdateNoticeVersions: Array.isArray(settings.dismissedUpdateNoticeVersions)
        ? settings.dismissedUpdateNoticeVersions.filter((version): version is string => typeof version === 'string')
        : [],
    }
  } catch {
    return structuredClone(DEFAULT_APP_SETTINGS)
  }
}

async function writeAppSettings(settings: AppSettings): Promise<void> {
  const tuneEqBandCount = normalizeEqBandCount(settings.tuneEqBandCount)
  const tuneEqBandSettings = normalizeEqBandSettings(settings, tuneEqBandCount)
  const activeTuneEqSettings = tuneEqBandSettings[String(tuneEqBandCount)]
  const credentials: ProtectedCredentials = {
    spotifySpDc: settings.spotifySpDc.trim(),
    spotifySpT: settings.spotifySpT.trim(),
    spotifyAccessToken: settings.spotifyAccessToken.trim(),
    discordRpcV2OauthAccessToken: settings.discordRpcV2OauthAccessToken.trim(),
    discordRpcV2OauthRefreshToken: settings.discordRpcV2OauthRefreshToken.trim(),
  }
  await writeProtectedCredentials(storagePaths().credentials, credentials)
  const serialized = JSON.stringify({
    playInBackground: settings.playInBackground === true,
    minimizeToTray: settings.minimizeToTray === true,
    startWithWindows: settings.startWithWindows === true,
    fullscreenPlayerLayout: settings.fullscreenPlayerLayout === 'split' ? 'split' : 'centered',
    debuggerEnabled: settings.debuggerEnabled === true,
    spotifyAccessTokenExpirationTimestampMs: Number.isFinite(settings.spotifyAccessTokenExpirationTimestampMs) ? settings.spotifyAccessTokenExpirationTimestampMs : 0,
    showSpotifyPlaylistsInSidebar: settings.showSpotifyPlaylistsInSidebar !== false,
    extendedLibraryEnabled: settings.extendedLibraryEnabled === true,
    customQueueEnabled: settings.customQueueEnabled === true,
    spotifyPlaylistSort: settings.spotifyPlaylistSort === 'title' || settings.spotifyPlaylistSort === 'duration' || settings.spotifyPlaylistSort === 'newest' ? settings.spotifyPlaylistSort : 'oldest',
    forceMostListenedSection: settings.forceMostListenedSection === true,
    customCss: settings.customCss,
    clientUserName: settings.clientUserName.trim(),
    clientUserDescription: settings.clientUserDescription.trim(),
    clientUserAvatarUrl: settings.clientUserAvatarUrl.trim(),
    lyricsDelay: normalizeLyricsDelay(settings.lyricsDelay),
    audioSpeed: normalizeAudioSpeed(settings.audioSpeed),
    audioPitchEnabled: settings.audioPitchEnabled === true,
    crossFadeEnabled: settings.crossFadeEnabled === true,
    crossFadeDuration: normalizeCrossFadeDuration(settings.crossFadeDuration),
    tuneEqEnabled: settings.tuneEqEnabled === true,
    tuneEqAutoSave: settings.tuneEqAutoSave !== false,
    tuneEqBandCount,
    tuneEqFrequencies: activeTuneEqSettings.frequencies,
    tuneEqQValues: activeTuneEqSettings.qValues,
    tuneEqGains: activeTuneEqSettings.gains,
    tuneEqBandSettings,
    discordRpcEnabled: settings.discordRpcEnabled !== false,
    discordKeepRichPresence: settings.discordKeepRichPresence === true,
    discordSmallImageUrl: settings.discordSmallImageUrl.trim(),
    discordPausedSmallImageUrl: settings.discordPausedSmallImageUrl.trim(),
    discordDetailsTemplate: settings.discordDetailsTemplate.trim(),
    discordStateTemplate: settings.discordStateTemplate.trim(),
    discordLargeTextTemplate: settings.discordLargeTextTemplate.trim(),
    discordSmallTextTemplate: settings.discordSmallTextTemplate.trim(),
    discordPausedSmallTextTemplate: settings.discordPausedSmallTextTemplate.trim(),
    discordRpcV2Enabled: settings.discordRpcV2Enabled === true,
    discordRpcV2KeepRichPresence: settings.discordRpcV2KeepRichPresence === true,
    discordRpcV2OauthExpiresAt: Number.isFinite(settings.discordRpcV2OauthExpiresAt) ? settings.discordRpcV2OauthExpiresAt : 0,
    discordRpcV2SmallImageUrl: settings.discordRpcV2SmallImageUrl.trim(),
    discordRpcV2PausedSmallImageUrl: settings.discordRpcV2PausedSmallImageUrl.trim(),
    discordRpcV2DetailsTemplate: settings.discordRpcV2DetailsTemplate.trim(),
    discordRpcV2StateTemplate: settings.discordRpcV2StateTemplate.trim(),
    discordRpcV2LargeTextTemplate: settings.discordRpcV2LargeTextTemplate.trim(),
    discordRpcV2SmallTextTemplate: settings.discordRpcV2SmallTextTemplate.trim(),
    discordRpcV2PausedSmallTextTemplate: settings.discordRpcV2PausedSmallTextTemplate.trim(),
    dismissedVersionNoticeVersions: [...new Set(settings.dismissedVersionNoticeVersions.map((version) => version.trim()).filter(Boolean))],
    dismissedUpdateNoticeVersions: [...new Set(settings.dismissedUpdateNoticeVersions.map((version) => version.trim()).filter(Boolean))],
  }, null, 2)
  const settingsPath = storagePaths().settings
  const temporaryPath = `${settingsPath}.${process.pid}.${crypto.randomUUID()}.tmp`
  await writeFile(temporaryPath, serialized, 'utf8')
  try {
    let renamed = false
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await rename(temporaryPath, settingsPath)
        renamed = true
        break
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code !== 'EPERM' && code !== 'EACCES' && code !== 'EBUSY') throw error
        await new Promise((resolve) => setTimeout(resolve, 35 * (attempt + 1)))
      }
    }
    if (!renamed) {
      // Some Windows scanners briefly lock the destination against rename while
      // still allowing an overwrite. The queue keeps this fallback serialized.
      await copyFile(temporaryPath, settingsPath)
    }
  } finally {
    await unlink(temporaryPath).catch(() => undefined)
  }
}

export function saveAppSettings(settings: AppSettings): Promise<void> {
  const snapshot = structuredClone(settings)
  const result = settingsMutationQueue.then(() => writeAppSettings(snapshot), () => writeAppSettings(snapshot))
  settingsMutationQueue = result.then(() => undefined, () => undefined)
  return result
}

export function saveRendererAppSettings(settings: AppSettings): Promise<void> {
  const snapshot = structuredClone(settings)
  const writeMergedSettings = async () => {
    const storedSettings = await readAppSettings()
    await writeAppSettings({
      ...snapshot,
      spotifySpDc: storedSettings.spotifySpDc,
      spotifySpT: storedSettings.spotifySpT,
      spotifyAccessToken: storedSettings.spotifyAccessToken,
      spotifyAccessTokenExpirationTimestampMs: storedSettings.spotifyAccessTokenExpirationTimestampMs,
      discordRpcV2OauthAccessToken: storedSettings.discordRpcV2OauthAccessToken,
      discordRpcV2OauthRefreshToken: storedSettings.discordRpcV2OauthRefreshToken,
      discordRpcV2OauthExpiresAt: storedSettings.discordRpcV2OauthExpiresAt,
    })
  }
  const result = settingsMutationQueue.then(writeMergedSettings, writeMergedSettings)
  settingsMutationQueue = result.then(() => undefined, () => undefined)
  return result
}

export async function resetAppSettings(): Promise<AppSettings> {
  const settings = structuredClone(DEFAULT_APP_SETTINGS)
  await saveAppSettings(settings)
  return settings
}

async function removeFile(filePath: string) {
  await unlink(filePath).catch(() => undefined)
}

async function storeImage(blob: ImageBlob, id: string, directory: string) {
  assertImageSize(blob, 'playlist')
  assertSupportedCoverImage(blob)
  const coverExtension = path.extname(blob.name).toLowerCase()
  const coverStoredName = `${id}${coverExtension}`
  await writeFile(path.join(directory, coverStoredName), blob.data)
  return coverStoredName
}

const storeHero = (blob: ImageBlob, id: string) => storeImage(blob, id, storagePaths().heroes)
const coverDataUrl = (blob: ImageBlob, purpose: 'song' | 'playlist') => {
  assertImageSize(blob, purpose)
  assertSupportedCoverImage(blob)
  return `data:${blob.mimeType};base64,${Buffer.from(blob.data).toString('base64')}`
}

export async function importMusic(input: ImportMusicInput): Promise<MusicTrack> {
  return withLibraryMutation(async () => {
    const library = await readLibrary()
    const requestedId = input.id?.trim()
    const sourceUrl = input.sourceUrl?.trim()
    const existingTrack = library.songs.find((song) => (requestedId && song.id === requestedId) || (sourceUrl && song.sourceUrl === sourceUrl))
    if (existingTrack && !existingTrack.isOnline) return existingTrack

    const id = requestedId || crypto.randomUUID()
    const extension = path.extname(input.sourcePath)
    const supportedExtensions = new Set(['.mp3', '.wav', '.flac', '.m4a', '.ogg', '.aac', '.webm'])

    if (!supportedExtensions.has(extension.toLowerCase())) throw new Error('Unsupported audio format')
    if (!input.title.trim() || !input.artist.trim()) throw new Error('Title and artist are required')

    const storedName = `${id}${extension}`
    const destination = path.join(storagePaths().audio, storedName)
    await copyFile(input.sourcePath, destination)

    const track: MusicTrack = {
      id,
      title: input.title.trim(),
      artist: input.artist.trim(),
      album: input.album.trim(),
      genre: input.genre.trim(),
      year: input.year.trim(),
      storedName,
      audioUrl: `hoshino-audio://track/${id}`,
      coverUrl: input.coverBlob ? coverDataUrl(input.coverBlob, 'song') : input.coverUrl?.trim() || undefined,
      sourceUrl: sourceUrl || undefined,
      lyrics: input.lyrics?.trim() || undefined,
      lyricsUrl: input.lyricsUrl?.trim() || undefined,
      lyricsDelay: normalizeLyricsDelay(input.lyricsDelay),
      duration: Number.isFinite(input.duration) ? input.duration : 0,
      listenCount: 0,
      addedAt: new Date().toISOString(),
    }

    if (existingTrack?.isOnline) {
      Object.assign(existingTrack, {
        ...track,
        isOnline: false,
      })
      await writeLibrary(library)
      return existingTrack
    }

    library.songs.push(track)
    await writeLibrary(library)
    return track
  })
}

export async function addOnlineSongToPlaylist(playlistId: string, input: AddOnlineSongToPlaylistInput) {
  return withLibraryMutation(async () => {
    const library = await readLibrary()
    const playlist = library.playlists.find((item) => item.id === playlistId)
    if (!playlist) throw new Error('Playlist not found')

    const track = addOnlineTrackToLibrary(library, input)
    if (!playlist.songIds.includes(track.id)) playlist.songIds.push(track.id)
    await writeLibrary(library)
    return playlist
  })
}

export async function addOnlineSongToLibrary(input: AddOnlineSongToPlaylistInput) {
  return withLibraryMutation(async () => {
    const library = await readLibrary()
    const track = addOnlineTrackToLibrary(library, input)
    await writeLibrary(library)
    return track
  })
}

function addOnlineTrackToLibrary(library: MusicLibrary, input: AddOnlineSongToPlaylistInput) {
  let track = library.songs.find((song) => song.id === input.id || song.sourceUrl === (input.sourceUrl || input.file))
  if (!track) {
    track = {
      id: input.id,
      title: input.title.trim() || 'Untitled',
      artist: input.artist.trim() || 'Unknown Artist',
      album: input.album.trim(),
      genre: input.genre.trim(),
      year: input.year.trim(),
      storedName: '',
      audioUrl: input.file,
      coverUrl: input.cover.trim() || undefined,
      isOnline: true,
      sourceUrl: input.sourceUrl?.trim() || input.file,
      rpcCoverUrl: input.rpcCoverUrl?.trim() || input.cover.trim() || undefined,
      lyricsUrl: input.lyrics?.trim() || undefined,
      lyricsDelay: normalizeLyricsDelay(input.lyricsOffset),
      duration: Number.isFinite(input.duration) ? input.duration : 0,
      listenCount: 0,
      addedAt: new Date().toISOString(),
    }
    library.songs.push(track)
  } else {
    const lyricsUrl = input.lyrics?.trim()
    if (lyricsUrl) track.lyricsUrl = lyricsUrl
    track.lyricsDelay = normalizeLyricsDelay(input.lyricsOffset ?? track.lyricsDelay)
    if (Number.isFinite(input.duration) && (track.duration ?? 0) <= 0) track.duration = input.duration
  }
  return track
}

export async function replaceOnlineMusicWithLocal(songId: string, input: ImportMusicInput): Promise<MusicTrack> {
  return withLibraryMutation(async () => {
    const library = await readLibrary()
    const track = library.songs.find((song) => song.id === songId)
    if (!track) throw new Error('Song not found')
    if (!track.isOnline || !track.sourceUrl) throw new Error('Song is already local')

    const extension = path.extname(input.sourcePath)
    const supportedExtensions = new Set(['.mp3', '.wav', '.flac', '.m4a', '.ogg', '.aac', '.webm'])
    if (!supportedExtensions.has(extension.toLowerCase())) throw new Error('Unsupported audio format')

    const storedName = `${crypto.randomUUID()}${extension}`
    await copyFile(input.sourcePath, path.join(storagePaths().audio, storedName))
    const sourceUrl = input.sourceUrl?.trim() || track.sourceUrl
    Object.assign(track, {
      title: input.title.trim() || track.title,
      artist: input.artist.trim() || track.artist,
      album: input.album.trim(),
      genre: input.genre.trim(),
      year: input.year.trim(),
      storedName,
      audioUrl: `hoshino-audio://track/${track.id}`,
      coverUrl: input.coverBlob ? coverDataUrl(input.coverBlob, 'song') : input.coverUrl?.trim() || track.coverUrl,
      lyrics: input.lyrics?.trim() || track.lyrics,
      lyricsUrl: input.lyricsUrl?.trim() || track.lyricsUrl,
      lyricsDelay: normalizeLyricsDelay(input.lyricsDelay ?? track.lyricsDelay),
      duration: Number.isFinite(input.duration) ? input.duration : track.duration ?? 0,
      listenCount: track.listenCount ?? 0,
      isOnline: false,
      sourceUrl,
      rpcCoverUrl: undefined,
    })
    await writeLibrary(library)
    return track
  })
}

function upsertActivityTrack(library: MusicLibrary, input: MusicTrack) {
  let track = library.songs.find((song) => song.id === input.id)
  if (track) return track
  if (!input.id?.trim() || !input.title?.trim()) throw new Error('Invalid history track')
  track = {
    id: input.id.trim(),
    title: input.title.trim(),
    artist: input.artist?.trim() || 'Unknown Artist',
    album: input.album?.trim() || '',
    genre: input.genre?.trim() || '',
    year: input.year?.trim() || '',
    storedName: '',
    audioUrl: input.audioUrl || input.sourceUrl || '',
    coverUrl: input.coverUrl,
    rpcCoverUrl: input.rpcCoverUrl,
    isOnline: true,
    sourceUrl: input.sourceUrl || input.audioUrl,
    lyrics: input.lyrics,
    lyricsUrl: input.lyricsUrl,
    lyricsDelay: normalizeLyricsDelay(input.lyricsDelay),
    duration: Number.isFinite(input.duration) ? input.duration : 0,
    listenCount: 0,
    playCount: 0,
    skipCount: 0,
    favorite: false,
    addedAt: input.addedAt || new Date().toISOString(),
  }
  library.songs.push(track)
  return track
}

export async function setMusicFavorite(input: MusicTrack, favorite: boolean): Promise<MusicTrack> {
  return withLibraryMutation(async () => {
    const library = await readLibrary()
    const track = upsertActivityTrack(library, input)
    track.favorite = favorite
    await writeLibrary(library)
    return track
  })
}

export async function recordMusicPlayback(input: MusicTrack): Promise<MusicTrack> {
  return withLibraryMutation(async () => {
    const library = await readLibrary()
    const track = upsertActivityTrack(library, input)
    track.playCount = (track.playCount ?? track.listenCount ?? 0) + 1
    track.listenCount = track.playCount
    track.lastPlayedAt = new Date().toISOString()
    await writeLibrary(library)
    return track
  })
}

export async function recordMusicSkip(input: MusicTrack): Promise<MusicTrack> {
  return withLibraryMutation(async () => {
    const library = await readLibrary()
    const track = upsertActivityTrack(library, input)
    track.skipCount = (track.skipCount ?? 0) + 1
    await writeLibrary(library)
    return track
  })
}

export async function createPlaylistFromQueue(name: string, songs: MusicTrack[]): Promise<PlaylistRecord> {
  return withLibraryMutation(async () => {
    const library = await readLibrary()
    const playlistName = name.trim()
    if (!playlistName) throw new Error('Playlist name is required')
    const tracks = songs.slice(0, 500).map((song) => upsertActivityTrack(library, song))
    const playlist: PlaylistRecord = {
      id: crypto.randomUUID(), name: playlistName, description: 'Saved from Custom Queue', folderId: null,
      songIds: [...new Set(tracks.map((track) => track.id))], createdAt: new Date().toISOString(),
    }
    library.playlists.push(playlist)
    await writeLibrary(library)
    return playlist
  })
}

export async function createPlaylist(input: CreatePlaylistInput): Promise<PlaylistRecord> {
  return withLibraryMutation(async () => {
    const library = await readLibrary()
    if (!input.name.trim()) throw new Error('Playlist name is required')
    const id = crypto.randomUUID()
    const heroStoredName = input.heroBlob ? await storeHero(input.heroBlob, id) : undefined

    const playlist: PlaylistRecord = {
      id,
      name: input.name.trim(),
      description: input.description.trim(),
      folderId: null,
      coverUrl: input.coverBlob ? coverDataUrl(input.coverBlob, 'playlist') : undefined,
      heroStoredName,
      heroUrl: heroStoredName ? `hoshino-hero://playlist/${id}` : undefined,
      songIds: [],
      createdAt: new Date().toISOString(),
    }

    library.playlists.push(playlist)
    await writeLibrary(library)
    return playlist
  })
}

export async function createPlaylistFolder(input: CreatePlaylistFolderInput) {
  return withLibraryMutation(async () => {
    const library = await readLibrary()
    if (!input.name.trim()) throw new Error('Folder name is required')
    const folder = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      createdAt: new Date().toISOString(),
    }
    library.playlistFolders.push(folder)
    await writeLibrary(library)
    return folder
  })
}

export async function updatePlaylistFolder(folderId: string, input: UpdatePlaylistFolderInput): Promise<PlaylistFolderRecord> {
  return withLibraryMutation(async () => {
    const library = await readLibrary()
    const folder = library.playlistFolders.find((item) => item.id === folderId)
    if (!folder) throw new Error('Folder not found')
    if (!input.name.trim()) throw new Error('Folder name is required')
    folder.name = input.name.trim()
    await writeLibrary(library)
    return folder
  })
}

export async function deletePlaylistFolder(folderId: string): Promise<void> {
  return withLibraryMutation(async () => {
    const library = await readLibrary()
    const folderIndex = library.playlistFolders.findIndex((item) => item.id === folderId)
    if (folderIndex < 0) throw new Error('Folder not found')
    library.playlists.forEach((playlist) => {
      if (playlist.folderId === folderId) playlist.folderId = null
    })
    library.playlistFolders.splice(folderIndex, 1)
    await writeLibrary(library)
  })
}

export async function movePlaylistToFolder(playlistId: string, folderId: string | null): Promise<PlaylistRecord> {
  return withLibraryMutation(async () => {
    const library = await readLibrary()
    const playlist = library.playlists.find((item) => item.id === playlistId)
    if (!playlist) throw new Error('Playlist not found')
    if (folderId && !library.playlistFolders.some((folder) => folder.id === folderId)) throw new Error('Folder not found')
    playlist.folderId = folderId
    await writeLibrary(library)
    return playlist
  })
}

export async function updatePlaylist(playlistId: string, input: UpdatePlaylistInput): Promise<PlaylistRecord> {
  return withLibraryMutation(async () => {
    const library = await readLibrary()
    const playlist = library.playlists.find((item) => item.id === playlistId)

    if (!playlist) throw new Error('Playlist not found')
    if (!input.name.trim()) throw new Error('Playlist name is required')

    if (input.coverBlob) playlist.coverUrl = coverDataUrl(input.coverBlob, 'playlist')
    if (input.heroBlob) {
      if (playlist.heroStoredName) await removeFile(path.join(storagePaths().heroes, playlist.heroStoredName))
      playlist.heroStoredName = await storeHero(input.heroBlob, playlist.id)
      playlist.heroUrl = `hoshino-hero://playlist/${playlist.id}?updated=${Date.now()}`
    }

    playlist.name = input.name.trim()
    playlist.description = input.description.trim()
    await writeLibrary(library)
    return playlist
  })
}

export async function deletePlaylist(playlistId: string): Promise<void> {
  return withLibraryMutation(async () => {
    const library = await readLibrary()
    const playlist = library.playlists.find((item) => item.id === playlistId)

    if (!playlist) throw new Error('Playlist not found')
    library.playlists = library.playlists.filter((item) => item.id !== playlistId)
    await writeLibrary(library)
    if (playlist.heroStoredName) await removeFile(path.join(storagePaths().heroes, playlist.heroStoredName))
  })
}

export async function deleteAllPlaylists(): Promise<void> {
  return withLibraryMutation(async () => {
    const library = await readLibrary()
    const heroStoredNames = library.playlists.flatMap((playlist) => playlist.heroStoredName ? [playlist.heroStoredName] : [])
    library.playlists = []
    await writeLibrary(library)
    await Promise.all(heroStoredNames.map((storedName) => removeFile(path.join(storagePaths().heroes, storedName))))
  })
}

export async function updateMusic(songId: string, input: UpdateMusicInput): Promise<MusicTrack> {
  return withLibraryMutation(async () => {
    const library = await readLibrary()
    const track = library.songs.find((song) => song.id === songId)

    if (!track) throw new Error('Song not found')
    if (!input.title.trim() || !input.artist.trim()) throw new Error('Title and artist are required')

    if (input.coverBlob) {
      track.coverUrl = coverDataUrl(input.coverBlob, 'song')
      delete track.rpcCoverUrl
    }

    Object.assign(track, {
      title: input.title.trim(), artist: input.artist.trim(), album: input.album.trim(),
      genre: input.genre.trim(), year: input.year.trim(), lyricsDelay: normalizeLyricsDelay(input.lyricsDelay),
    })
    if (input.removeLyrics) {
      delete track.lyrics
      delete track.lyricsUrl
    } else if (input.lyrics !== undefined) {
      const lyrics = input.lyrics.trim()
      if (lyrics) track.lyrics = lyrics
      else delete track.lyrics
    }
    await writeLibrary(library)
    return track
  })
}

export async function deleteMusic(songId: string): Promise<void> {
  return withLibraryMutation(async () => {
    const library = await readLibrary()
    const track = library.songs.find((song) => song.id === songId)

    if (!track) throw new Error('Song not found')
    library.songs = library.songs.filter((song) => song.id !== songId)
    library.playlists.forEach((playlist) => {
      playlist.songIds = playlist.songIds.filter((id) => id !== songId)
    })
    await writeLibrary(library)
    if (track.storedName) await removeFile(path.join(storagePaths().audio, track.storedName))
  })
}

export async function deleteAllMusic(): Promise<void> {
  return withLibraryMutation(async () => {
    const library = await readLibrary()
    const storedNames = library.songs.flatMap((song) => song.storedName ? [song.storedName] : [])
    library.songs = []
    library.playlists.forEach((playlist) => {
      playlist.songIds = []
    })
    await writeLibrary(library)
    await Promise.all(storedNames.map((storedName) => removeFile(path.join(storagePaths().audio, storedName))))
  })
}

export async function addSongToPlaylist(playlistId: string, songId: string) {
  return withLibraryMutation(async () => {
    const library = await readLibrary()
    const playlist = library.playlists.find((item) => item.id === playlistId)

    if (!playlist) throw new Error('Playlist not found')
    if (!library.songs.some((song) => song.id === songId)) throw new Error('Song not found')
    if (!playlist.songIds.includes(songId)) playlist.songIds.push(songId)

    await writeLibrary(library)
    return playlist
  })
}

export async function removeSongFromPlaylist(playlistId: string, songId: string) {
  return withLibraryMutation(async () => {
    const library = await readLibrary()
    const playlist = library.playlists.find((item) => item.id === playlistId)

    if (!playlist) throw new Error('Playlist not found')
    playlist.songIds = playlist.songIds.filter((id) => id !== songId)
    await writeLibrary(library)
    return playlist
  })
}

export async function reorderPlaylistSongs(playlistId: string, songIds: string[]) {
  return withLibraryMutation(async () => {
    const library = await readLibrary()
    const playlist = library.playlists.find((item) => item.id === playlistId)
    if (!playlist) throw new Error('Playlist not found')
    const currentIds = new Set(playlist.songIds)
    if (songIds.length !== playlist.songIds.length || new Set(songIds).size !== songIds.length || songIds.some((id) => !currentIds.has(id))) {
      throw new Error('Invalid playlist song order')
    }
    playlist.songIds = [...songIds]
    await writeLibrary(library)
    return playlist
  })
}

export async function getAudioPath(trackId: string) {
  const library = await readLibrary()
  const track = library.songs.find((song) => song.id === trackId)
  return track?.storedName ? path.join(storagePaths().audio, track.storedName) : null
}

export async function getPlaylistHeroPath(playlistId: string) {
  const library = await readLibrary()
  const playlist = library.playlists.find((item) => item.id === playlistId)
  return playlist?.heroStoredName ? path.join(storagePaths().heroes, playlist.heroStoredName) : null
}

export async function saveSongRpcCoverUrl(songId: string, coverUrl: string, rpcCoverUrl: string) {
  return withLibraryMutation(async () => {
    const library = await readLibrary()
    const song = library.songs.find((item) => item.id === songId)
    if (!song || song.coverUrl !== coverUrl) return
    song.rpcCoverUrl = rpcCoverUrl
    await writeLibrary(library)
  })
}
