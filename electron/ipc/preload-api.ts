import { ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { IPC_CHANNELS } from './channels'
import type { AddOnlineSongToPlaylistInput, AppInfo, AppSettings, AudioFileSelection, CreatePlaylistFolderInput, CreatePlaylistInput, DebugCookie, DiscordPlaybackState, ElectronApi, ImageBlob, ImageOptimizeOptions, ImagePurpose, ImportMusicInput, ImportOnlineMusicInput, ImportOnlineMusicProgress, MiniPlayerCommand, MiniPlayerState, MusicLibrary, MusicTrack, PlayerState, PlaylistFolderRecord, PlaylistRecord, SpotifyHome, SpotifyHomeCard, SpotifyPlaybackInput, SpotifyPlaybackResult, SpotifyPlaylistPage, SpotifyProfileSync, SpotifySearchPage, UpdateMusicInput, UpdatePlaylistFolderInput, UpdatePlaylistInput } from './types'

/**
 * A narrow, typed bridge is safer than exposing Electron's raw ipcRenderer.
 */
export const electronApi: ElectronApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC_CHANNELS.getAppInfo) as Promise<AppInfo>,
  getLibrary: () => ipcRenderer.invoke(IPC_CHANNELS.getLibrary) as Promise<MusicLibrary>,
  getPlayerState: () => ipcRenderer.invoke(IPC_CHANNELS.getPlayerState) as Promise<PlayerState>,
  savePlayerState: (state: PlayerState) =>
    ipcRenderer.invoke(IPC_CHANNELS.savePlayerState, state) as Promise<void>,
  getAppSettings: () => ipcRenderer.invoke(IPC_CHANNELS.getAppSettings) as Promise<AppSettings>,
  saveAppSettings: (settings: AppSettings) =>
    ipcRenderer.invoke(IPC_CHANNELS.saveAppSettings, settings) as Promise<void>,
  resetAppSettings: () => ipcRenderer.invoke(IPC_CHANNELS.resetAppSettings) as Promise<AppSettings>,
  loginDiscordRpcV2: () => ipcRenderer.invoke(IPC_CHANNELS.loginDiscordRpcV2) as Promise<AppSettings>,
  validateDiscordRpcV2Token: () => ipcRenderer.invoke(IPC_CHANNELS.validateDiscordRpcV2Token) as Promise<AppSettings>,
  uploadDiscordSmallImage: (image: ImageBlob) =>
    ipcRenderer.invoke(IPC_CHANNELS.uploadDiscordSmallImage, image) as Promise<string | null>,
  updateDiscordPresence: (state: DiscordPlaybackState) =>
    ipcRenderer.invoke(IPC_CHANNELS.updateDiscordPresence, state) as Promise<void>,
  getDroppedFilePaths: (files: File[]) =>
    files.map((file) => webUtils.getPathForFile(file)).filter(Boolean),
  selectAudioFile: () => ipcRenderer.invoke(IPC_CHANNELS.selectAudioFile) as Promise<AudioFileSelection | null>,
  selectAudioFiles: () => ipcRenderer.invoke(IPC_CHANNELS.selectAudioFiles) as Promise<AudioFileSelection[]>,
  readDroppedAudioFiles: (paths: string[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.readDroppedAudioFiles, paths) as Promise<AudioFileSelection[]>,
  selectCoverFile: (purpose: ImagePurpose, options?: ImageOptimizeOptions) =>
    ipcRenderer.invoke(IPC_CHANNELS.selectCoverFile, purpose, options) as Promise<ImageBlob | null>,
  readDroppedCoverFile: (path: string, purpose: ImagePurpose, options?: ImageOptimizeOptions) =>
    ipcRenderer.invoke(IPC_CHANNELS.readDroppedCoverFile, path, purpose, options) as Promise<ImageBlob | null>,
  selectLyricsFile: () =>
    ipcRenderer.invoke(IPC_CHANNELS.selectLyricsFile) as Promise<string | null>,
  readDroppedLyricsFile: (path: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.readDroppedLyricsFile, path) as Promise<string | null>,
  importMusic: (input: ImportMusicInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.importMusic, input) as Promise<MusicTrack>,
  importOnlineMusic: (input: ImportOnlineMusicInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.importOnlineMusic, input) as Promise<MusicTrack>,
  setMusicFavorite: (song: MusicTrack, favorite: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.setMusicFavorite, song, favorite) as Promise<MusicTrack>,
  recordMusicPlayback: (song: MusicTrack) =>
    ipcRenderer.invoke(IPC_CHANNELS.recordMusicPlayback, song) as Promise<MusicTrack>,
  recordMusicSkip: (song: MusicTrack) =>
    ipcRenderer.invoke(IPC_CHANNELS.recordMusicSkip, song) as Promise<MusicTrack>,
  addOnlineSongToLibrary: (input: AddOnlineSongToPlaylistInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.addOnlineSongToLibrary, input) as Promise<MusicTrack>,
  addOnlineSongToPlaylist: (playlistId: string, input: AddOnlineSongToPlaylistInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.addOnlineSongToPlaylist, playlistId, input) as Promise<PlaylistRecord>,
  downloadOnlineMusic: (songId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.downloadOnlineMusic, songId) as Promise<MusicTrack>,
  updateMusic: (songId: string, input: UpdateMusicInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.updateMusic, songId, input) as Promise<MusicTrack>,
  deleteMusic: (songId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.deleteMusic, songId) as Promise<void>,
  deleteAllMusic: () =>
    ipcRenderer.invoke(IPC_CHANNELS.deleteAllMusic) as Promise<void>,
  createPlaylist: (input: CreatePlaylistInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.createPlaylist, input) as Promise<PlaylistRecord>,
  createPlaylistFromQueue: (name: string, songs: MusicTrack[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.createPlaylistFromQueue, name, songs) as Promise<PlaylistRecord>,
  createPlaylistFolder: (input: CreatePlaylistFolderInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.createPlaylistFolder, input) as Promise<PlaylistFolderRecord>,
  updatePlaylistFolder: (folderId: string, input: UpdatePlaylistFolderInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.updatePlaylistFolder, folderId, input) as Promise<PlaylistFolderRecord>,
  deletePlaylistFolder: (folderId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.deletePlaylistFolder, folderId) as Promise<void>,
  movePlaylistToFolder: (playlistId: string, folderId: string | null) =>
    ipcRenderer.invoke(IPC_CHANNELS.movePlaylistToFolder, playlistId, folderId) as Promise<PlaylistRecord>,
  updatePlaylist: (playlistId: string, input: UpdatePlaylistInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.updatePlaylist, playlistId, input) as Promise<PlaylistRecord>,
  deletePlaylist: (playlistId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.deletePlaylist, playlistId) as Promise<void>,
  deleteAllPlaylists: () =>
    ipcRenderer.invoke(IPC_CHANNELS.deleteAllPlaylists) as Promise<void>,
  addSongToPlaylist: (playlistId: string, songId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.addSongToPlaylist, playlistId, songId) as Promise<PlaylistRecord>,
  removeSongFromPlaylist: (playlistId: string, songId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.removeSongFromPlaylist, playlistId, songId) as Promise<PlaylistRecord>,
  reorderPlaylistSongs: (playlistId: string, songIds: string[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.reorderPlaylistSongs, playlistId, songIds) as Promise<PlaylistRecord>,
  hideWindow: () => ipcRenderer.invoke(IPC_CHANNELS.hideWindow) as Promise<void>,
  minimizeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.minimizeWindow) as Promise<void>,
  toggleMaximizeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.toggleMaximizeWindow) as Promise<boolean>,
  closeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.closeWindow) as Promise<void>,
  openMiniPlayer: () => ipcRenderer.invoke(IPC_CHANNELS.openMiniPlayer) as Promise<void>,
  expandMiniPlayer: () => ipcRenderer.invoke(IPC_CHANNELS.expandMiniPlayer) as Promise<void>,
  restartApp: () => ipcRenderer.invoke(IPC_CHANNELS.restartApp) as Promise<void>,
  openDevTools: () => ipcRenderer.invoke(IPC_CHANNELS.openDevTools) as Promise<void>,
  startSpotifyLogin: () => ipcRenderer.invoke(IPC_CHANNELS.startSpotifyLogin) as Promise<void>,
  ensureSpotifyAccessToken: () => ipcRenderer.invoke(IPC_CHANNELS.ensureSpotifyAccessToken) as Promise<{ linked: boolean, accessToken: string, accessTokenExpirationTimestampMs: number, stateCleared: boolean }>,
  resetSpotifyState: () => ipcRenderer.invoke(IPC_CHANNELS.resetSpotifyState) as Promise<AppSettings>,
  syncSpotifyAccount: () => ipcRenderer.invoke(IPC_CHANNELS.syncSpotifyAccount) as Promise<SpotifyProfileSync>,
  getSpotifyHome: () => ipcRenderer.invoke(IPC_CHANNELS.getSpotifyHome) as Promise<SpotifyHome>,
  getSpotifyLibraryPlaylists: () => ipcRenderer.invoke(IPC_CHANNELS.getSpotifyLibraryPlaylists) as Promise<SpotifyHomeCard[]>,
  getSpotifyPlaylist: (uri: string, offset: number, limit: number) => ipcRenderer.invoke(IPC_CHANNELS.getSpotifyPlaylist, uri, offset, limit) as Promise<SpotifyPlaylistPage>,
  searchSpotify: (query: string, offset: number, limit: number) => ipcRenderer.invoke(IPC_CHANNELS.searchSpotify, query, offset, limit) as Promise<SpotifySearchPage>,
  searchSpotifyResults: (query: string) => ipcRenderer.invoke(IPC_CHANNELS.searchSpotifyResults, query) as Promise<SpotifySearchPage>,
  resolveSpotifyPlayback: (input: SpotifyPlaybackInput) => ipcRenderer.invoke(IPC_CHANNELS.resolveSpotifyPlayback, input) as Promise<SpotifyPlaybackResult>,
  openSpotifyUri: (uri: string) => ipcRenderer.invoke(IPC_CHANNELS.openSpotifyUri, uri) as Promise<void>,
  openDebuggerBrowser: (url: string, userAgent: string) => ipcRenderer.invoke(IPC_CHANNELS.openDebuggerBrowser, url, userAgent) as Promise<DebugCookie[]>,
  getDebuggerCookies: () => ipcRenderer.invoke(IPC_CHANNELS.getDebuggerCookies) as Promise<DebugCookie[]>,
  getMiniPlayerState: () => ipcRenderer.invoke(IPC_CHANNELS.getMiniPlayerState) as Promise<MiniPlayerState | null>,
  sendMiniPlayerState: (state: MiniPlayerState) =>
    ipcRenderer.invoke(IPC_CHANNELS.sendMiniPlayerState, state) as Promise<void>,
  sendMiniPlayerCommand: (command: MiniPlayerCommand) =>
    ipcRenderer.invoke(IPC_CHANNELS.sendMiniPlayerCommand, command) as Promise<void>,

  onAppReady: (listener) => {
    const handler = (_event: IpcRendererEvent, timestamp: string) => listener(timestamp)

    ipcRenderer.on(IPC_CHANNELS.appReady, handler)

    // Call the returned function when the renderer no longer needs the subscription.
    return () => ipcRenderer.removeListener(IPC_CHANNELS.appReady, handler)
  },
  onOnlineMusicImportProgress: (listener) => {
    const handler = (_event: IpcRendererEvent, progress: ImportOnlineMusicProgress) => listener(progress)

    ipcRenderer.on(IPC_CHANNELS.importOnlineMusicProgress, handler)

    return () => ipcRenderer.removeListener(IPC_CHANNELS.importOnlineMusicProgress, handler)
  },
  onMiniPlayerState: (listener) => {
    const handler = (_event: IpcRendererEvent, state: MiniPlayerState) => listener(state)

    ipcRenderer.on(IPC_CHANNELS.miniPlayerStateChanged, handler)

    return () => ipcRenderer.removeListener(IPC_CHANNELS.miniPlayerStateChanged, handler)
  },
  onMiniPlayerCommand: (listener) => {
    const handler = (_event: IpcRendererEvent, command: MiniPlayerCommand) => listener(command)

    ipcRenderer.on(IPC_CHANNELS.miniPlayerCommand, handler)

    return () => ipcRenderer.removeListener(IPC_CHANNELS.miniPlayerCommand, handler)
  },
  onDebuggerCookiesChanged: (listener) => {
    const handler = (_event: IpcRendererEvent, cookies: DebugCookie[]) => listener(cookies)

    ipcRenderer.on(IPC_CHANNELS.debuggerCookiesChanged, handler)

    return () => ipcRenderer.removeListener(IPC_CHANNELS.debuggerCookiesChanged, handler)
  },
  onDebuggerBrowserUrlChanged: (listener) => {
    const handler = (_event: IpcRendererEvent, url: string) => listener(url)

    ipcRenderer.on(IPC_CHANNELS.debuggerBrowserUrlChanged, handler)

    return () => ipcRenderer.removeListener(IPC_CHANNELS.debuggerBrowserUrlChanged, handler)
  },
  onSpotifyLinked: (listener) => {
    const handler = (_event: IpcRendererEvent, settings: AppSettings) => listener(settings)
    ipcRenderer.on(IPC_CHANNELS.spotifyLinked, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.spotifyLinked, handler)
  },
  onSpotifyLinkError: (listener) => {
    const handler = (_event: IpcRendererEvent, message: string) => listener(message)
    ipcRenderer.on(IPC_CHANNELS.spotifyLinkError, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.spotifyLinkError, handler)
  },
}
