import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { Discovery, type DiscoveryQualityFilter } from './components/Discovery'
import { MusicLibrary } from './components/MusicLibrary'
import { FullscreenPlayer } from './components/FullscreenPlayer'
import { MiniPlayer } from './components/MiniPlayer'
import { NowPlaying } from './components/NowPlaying'
import { LyricsPanel } from './components/LyricsPanel'
import { Playlist } from './components/Playlist'
import { QueueSidebar } from './components/QueueSidebar'
import { Sidebar } from './components/Sidebar'
import { SpotifyDiscovery } from './components/SpotifyDiscovery'
import { SmartCollection } from './components/SmartCollection'
import { sortSongs, type SortOption } from './components/SortControl'
import { Toasts, type ToastItem } from './components/Toasts'
import { WindowBar } from './components/WindowBar'
import { readAudioOutputSnapshot, sameAudioOutput, type AudioOutputDevice, type AudioOutputSnapshot } from './audio-device'
import { canUseCorsAudio, configureAudioCors, resolveOnlineAudioUrl } from './audio-url'
import { isFlacUrl, readAudioMetadataCache, readFlacMetadata, type DiscoveryAudioMetadata } from './discovery-audio-metadata'
import { normalizeEqFrequencies, normalizeEqGains, normalizeEqQValues } from './equalizer'
import { resolveSpotifyImageUrl } from './spotify-image'
import type { AppSettings, CreatePlaylistFolderInput, CreatePlaylistInput, DebugCookie, DiscoverySong, ImportMusicInput, ImportOnlineMusicInput, ImportOnlineMusicProgress, MiniPlayerCommand, MiniPlayerState, MusicLibrary as MusicLibraryData, MusicTrack, PlayerState, PlaylistFolderRecord, PlaylistRecord, SpotifyHomeCard, SpotifyPlaylistTrack, UpdateMusicInput, UpdatePlaylistFolderInput, UpdatePlaylistInput } from './types'
import { DEFAULT_APP_SETTINGS, DISCOVERY_API_URL, DISCOVERY_PLAYLIST_ID, EMPTY_LIBRARY, LIKED_PLAYLIST_ID, RECENTLY_ADDED_PLAYLIST_ID, RECENTLY_PLAYED_PLAYLIST_ID, SPOTIFY_PLAYLIST_ID, STARTUP_LOADING_MIN_MS, UPDATE_DOWNLOAD_URL, VERSION_API_URL } from './app/config'
import { applyAudioSpeed, createShuffledSongIds, discoveryId, filterDiscoverySongsByQuality, normalizeAudioSpeed, normalizeCrossFadeDuration, normalizeLyricsDelay, readDiscoveryCache, readDiscoveryListenCounts, shouldShowUpdateNotice, shouldShowVersionNotice, sortDiscoverySongs, spotifyTrackId, toDiscoveryTrack, toSpotifyTrack, versionNoticeKey, writeDiscoveryCache, writeDiscoveryListenCounts } from './app/discovery'
import { usePlaybackShortcuts } from './app/usePlaybackShortcuts'
import { usePlaybackHistory } from './app/usePlaybackHistory'
import { AddSongModal, AudioOutputModal, CreatePlaylistModal, CustomCssModal, DebuggerSettingsModal, DeleteAllPlaylistsModal, DeleteAllSongsModal, DeletePlaylistFolderModal, DeletePlaylistModal, DeleteSongModal, DiscordSettingsModal, DiscordV2SettingsModal, DownloadDiscoverySongModal, DownloadOnlineSongModal, EditMusicModal, EditPlaylistFolderModal, EditPlaylistModal, GeneralSettingsModal, ImportMusicModal, ResetSettingsModal, SaveQueuePlaylistModal, SettingsModal, SpotifyLinkModal, TuneEqModal, UpdateAvailableModal, UserSettingsModal, VersionNoticeModal } from './app/lazyModals'
import './App.css'

function App() {
  if (new URLSearchParams(window.location.search).get('mini') === '1') return <MiniPlayer />

  return <MainApp />
}

function MainApp() {
  const audioRef = useRef(new Audio())
  const crossFadeAudioRef = useRef(new Audio())
  const crossFadeTimerRef = useRef<number | null>(null)
  const crossFadeCleanupTimerRef = useRef<number | null>(null)
  const eqReconnectDeferredUntilRef = useRef(0)
  const crossFadeTargetRef = useRef<MusicTrack | null>(null)
  const startCrossFadeRef = useRef<(song: MusicTrack, remainingMs?: number) => void>(() => undefined)
  const preloadSpotifyTrackRef = useRef<(id: string) => void>(() => undefined)
  const spotifyPreloadPendingRef = useRef(new Set<string>())
  const offlineToastAtRef = useRef(0)
  const mainFadeLevelRef = useRef(1)
  const nextFadeLevelRef = useRef(0)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioSourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const eqFiltersRef = useRef<BiquadFilterNode[]>([])
  const mainGainRef = useRef<GainNode | null>(null)
  const crossFadeAudioSourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const crossFadeEqFiltersRef = useRef<BiquadFilterNode[]>([])
  const crossFadeGainRef = useRef<GainNode | null>(null)
  const audioCorsSafeRef = useRef(true)
  const loadedSongIdRef = useRef<string | null>(null)
  const seekingRef = useRef(false)
  const playbackFailureRef = useRef(false)
  const playbackAuthorizationRef = useRef({ isPlaying: false, currentSongId: null as string | null })
  const pendingRestoreTimeRef = useRef<number | null>(null)
  const shuffleSourceRef = useRef<string>()
  const playerStateRef = useRef<PlayerState>({ volume: 0.6, currentSongId: null, currentTime: 0, playbackPlaylistId: null, spotifyQueue: [], customQueueNextUp: [], customQueueLater: [] })
  const volumeRef = useRef(0.6)
  const volumeBeforeMuteRef = useRef(0.6)
  const toastTimerRef = useRef<number | null>(null)
  const eqSettingsSaveTimerRef = useRef<number | null>(null)
  const audioOutputSnapshotRef = useRef<AudioOutputSnapshot | null>(null)
  const selectedAudioOutputIdRef = useRef('default')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [library, setLibrary] = useState<MusicLibraryData>(EMPTY_LIBRARY)
  const [libraryLoading, setLibraryLoading] = useState(true)
  const [activeView, setActiveView] = useState<'library' | 'liked' | 'recently-played' | 'recently-added' | 'discovery' | 'spotify-discovery'>('library')
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null)
  const [currentSongId, setCurrentSongId] = useState<string | null>(null)
  const [spotifyPlaybackTrack, setSpotifyPlaybackTrack] = useState<MusicTrack | null>(null)
  const [spotifyPlaybackQueue, setSpotifyPlaybackQueue] = useState<SpotifyPlaylistTrack[]>([])
  const [spotifyQueueHasMore, setSpotifyQueueHasMore] = useState(false)
  const updateSpotifyPlaybackQueue = useCallback((queue: SpotifyPlaylistTrack[], hasMore: boolean) => {
    setSpotifyPlaybackQueue(queue)
    setSpotifyQueueHasMore(hasMore)
  }, [])
  const [spotifyPlaybackLoadingId, setSpotifyPlaybackLoadingId] = useState<string | null>(null)
  const spotifyPlaybackCacheRef = useRef(new Map<string, MusicTrack>())
  const spotifyPlaybackGenerationRef = useRef(0)
  const localSpotifyPlaybackGenerationRef = useRef(0)
  const [playbackPlaylistId, setPlaybackPlaylistId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [isPlaying, setIsPlaying] = useState(false)
  const [shuffleEnabled, setShuffleEnabled] = useState(false)
  const [repeatEnabled, setRepeatEnabled] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [fullscreenPlayerOpen, setFullscreenPlayerOpen] = useState(false)
  const [lyricsPanelOpen, setLyricsPanelOpen] = useState(false)
  const [queueSidebarOpen, setQueueSidebarOpen] = useState(false)
  const [customQueueNextUp, setCustomQueueNextUp] = useState<MusicTrack[]>([])
  const [customQueueLater, setCustomQueueLater] = useState<MusicTrack[]>([])
  const [queuedPlaybackTrack, setQueuedPlaybackTrack] = useState<MusicTrack | null>(null)
  const [shuffledSongIds, setShuffledSongIds] = useState<string[]>([])
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(0.6)
  const [activeAudioOutput, setActiveAudioOutput] = useState<AudioOutputDevice | null>(null)
  const [audioOutputs, setAudioOutputs] = useState<AudioOutputDevice[]>([])
  const [modal, setModal] = useState<'version-notice' | 'update-available' | 'import' | 'playlist' | 'save-queue-playlist' | 'edit-playlist' | 'delete-playlist' | 'edit-folder' | 'delete-folder' | 'add-song' | 'edit-song' | 'delete-song' | 'delete-all-songs' | 'delete-all-playlists' | 'settings' | 'reset-settings' | 'tune-eq' | 'general-settings' | 'debugger-settings' | 'custom-css' | 'user-settings' | 'discord-settings' | 'discord-v2-settings' | 'audio-output' | 'download-discovery' | 'download-online' | 'spotify-link' | null>(null)
  const [editingPlaylist, setEditingPlaylist] = useState<PlaylistRecord | null>(null)
  const [deletingPlaylist, setDeletingPlaylist] = useState<PlaylistRecord | null>(null)
  const [editingFolder, setEditingFolder] = useState<PlaylistFolderRecord | null>(null)
  const [deletingFolder, setDeletingFolder] = useState<PlaylistFolderRecord | null>(null)
  const [editingSong, setEditingSong] = useState<MusicTrack | null>(null)
  const [deletingSong, setDeletingSong] = useState<MusicTrack | null>(null)
  const [downloadingDiscoverySong, setDownloadingDiscoverySong] = useState<DiscoverySong | null>(null)
  const [downloadingOnlineSong, setDownloadingOnlineSong] = useState<MusicTrack | null>(null)
  const [onlineDownloadStatus, setOnlineDownloadStatus] = useState<Record<string, 'downloading' | 'complete'>>({})
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [onlineAvailable, setOnlineAvailable] = useState(true)
  const [appVersion, setAppVersion] = useState('')
  const [latestAppVersion, setLatestAppVersion] = useState('')
  const [playerStateReady, setPlayerStateReady] = useState(false)
  const [debugLoadingScreen, setDebugLoadingScreen] = useState<'loading' | 'error' | null>(null)
  const [debuggerCookies, setDebuggerCookies] = useState<DebugCookie[]>([])
  const [librarySort, setLibrarySort] = useState<SortOption>('recent')
  const [playlistSort, setPlaylistSort] = useState<SortOption>('custom')
  const [discoverySort, setDiscoverySort] = useState<SortOption>('recent')
  const [discoveryQualityFilter, setDiscoveryQualityFilter] = useState<DiscoveryQualityFilter>('all')
  const [discoverySongs, setDiscoverySongs] = useState<DiscoverySong[]>([])
  const [onlineLyricsCache, setOnlineLyricsCache] = useState<Record<string, string | null>>({})
  const [discoveryAudioMetadata, setDiscoveryAudioMetadata] = useState<Record<string, DiscoveryAudioMetadata | null>>(() => readAudioMetadataCache())
  const [discoveryLoading, setDiscoveryLoading] = useState(false)
  const [discoveryError, setDiscoveryError] = useState('')
  const [importingDiscoveryIds, setImportingDiscoveryIds] = useState<string[]>([])
  const [discoveryImportProgress, setDiscoveryImportProgress] = useState<Record<string, number | null>>({})
  const [spotifySidebarPlaylists, setSpotifySidebarPlaylists] = useState<SpotifyHomeCard[]>([])
  const [selectedSpotifySidebarPlaylist, setSelectedSpotifySidebarPlaylist] = useState<SpotifyHomeCard | null>(null)
  const [settings, setSettings] = useState<AppSettings>(() => structuredClone(DEFAULT_APP_SETTINGS))

  const activePlaylist = library.playlists.find((playlist) => playlist.id === activePlaylistId) ?? null
  const filteredDiscoverySongs = useMemo(() => filterDiscoverySongsByQuality(discoverySongs, discoveryQualityFilter, discoveryAudioMetadata), [discoveryAudioMetadata, discoveryQualityFilter, discoverySongs])
  const featuredDiscoverySongs = useMemo(() => filteredDiscoverySongs.filter((song) => song.featured), [filteredDiscoverySongs])
  const visibleDiscoverySongs = useMemo(() => sortDiscoverySongs(filteredDiscoverySongs, discoverySort), [discoverySort, filteredDiscoverySongs])
  const discoveryTracks = useMemo(() => visibleDiscoverySongs.map(toDiscoveryTrack), [visibleDiscoverySongs])
  const allDiscoveryTracks = useMemo(() => discoverySongs.map(toDiscoveryTrack), [discoverySongs])
  const libraryListenTotal = useMemo(() => library.songs.reduce((total, song) => total + (song.listenCount ?? 0), 0), [library.songs])
  const discoveryListenTotal = useMemo(() => discoverySongs.reduce((total, song) => total + (song.listenCount ?? 0), 0), [discoverySongs])
  const mostListenedLibrarySongs = useMemo(
    () => [...library.songs].sort((a, b) => (b.listenCount ?? 0) - (a.listenCount ?? 0)).slice(0, 10),
    [library.songs],
  )
  const mostListenedDiscoverySongs = useMemo(
    () => [...discoverySongs].sort((a, b) => (b.listenCount ?? 0) - (a.listenCount ?? 0)).slice(0, 10),
    [discoverySongs],
  )
  const likedSongs = useMemo(() => library.songs.filter((song) => song.favorite).sort((a, b) => (b.lastPlayedAt ?? b.addedAt).localeCompare(a.lastPlayedAt ?? a.addedAt)), [library.songs])
  const favoriteSongIds = useMemo(() => library.songs.filter((song) => song.favorite).map((song) => song.id), [library.songs])
  const recentlyPlayedSongs = useMemo(() => library.songs.filter((song) => song.lastPlayedAt).sort((a, b) => (b.lastPlayedAt ?? '').localeCompare(a.lastPlayedAt ?? '')).slice(0, 100), [library.songs])
  const recentlyAddedSongs = useMemo(() => [...library.songs].sort((a, b) => b.addedAt.localeCompare(a.addedAt)).slice(0, 100), [library.songs])
  const currentSong = useMemo(() => {
    const persisted = library.songs.find((song) => song.id === currentSongId) ?? null
    const live = playbackPlaylistId === SPOTIFY_PLAYLIST_ID && spotifyPlaybackTrack?.id === currentSongId
      ? spotifyPlaybackTrack
      : playbackPlaylistId === DISCOVERY_PLAYLIST_ID
        ? allDiscoveryTracks.find((song) => song.id === currentSongId) ?? null
        : queuedPlaybackTrack?.id === currentSongId ? queuedPlaybackTrack : null
    return live && persisted
      ? { ...live, favorite: persisted.favorite, lastPlayedAt: persisted.lastPlayedAt, playCount: persisted.playCount, skipCount: persisted.skipCount, listenCount: persisted.listenCount }
      : live ?? persisted
  }, [allDiscoveryTracks, currentSongId, library.songs, playbackPlaylistId, queuedPlaybackTrack, spotifyPlaybackTrack])
  const currentSongLyricsUrl = currentSong?.lyricsUrl?.trim() || ''
  const currentSongWithLyrics = useMemo(() => {
    if (!currentSong) return null
    if (currentSong.lyrics?.trim()) return currentSong
    const onlineLyrics = currentSongLyricsUrl ? onlineLyricsCache[currentSongLyricsUrl] : undefined
    return onlineLyrics ? { ...currentSong, lyrics: onlineLyrics } : null
  }, [currentSong, currentSongLyricsUrl, onlineLyricsCache])
  const lyricsAvailable = Boolean(currentSong && (currentSong.lyrics?.trim() || currentSongLyricsUrl && onlineLyricsCache[currentSongLyricsUrl] !== null))
  const playbackPlaylist = library.playlists.find((playlist) => playlist.id === playbackPlaylistId) ?? null
  const activeSongs = useMemo(
    () => {
      if (!activePlaylist) return sortSongs(library.songs, librarySort)
      const playlistSongs = activePlaylist.songIds.flatMap((id) => library.songs.find((song) => song.id === id) ?? [])
      return sortSongs(playlistSongs, playlistSort)
    },
    [activePlaylist, library.songs, librarySort, playlistSort],
  )
  const playbackSongs = useMemo(
    () => {
      if (playbackPlaylistId === DISCOVERY_PLAYLIST_ID) return discoveryTracks
      if (playbackPlaylistId === SPOTIFY_PLAYLIST_ID) return spotifyPlaybackQueue.map((track) => spotifyPlaybackCacheRef.current.get(track.id) ?? toSpotifyTrack(track))
      if (playbackPlaylistId === LIKED_PLAYLIST_ID) return likedSongs
      if (playbackPlaylistId === RECENTLY_PLAYED_PLAYLIST_ID) return recentlyPlayedSongs
      if (playbackPlaylistId === RECENTLY_ADDED_PLAYLIST_ID) return recentlyAddedSongs
      if (!playbackPlaylist) return sortSongs(library.songs, librarySort)
      const playlistSongs = playbackPlaylist.songIds.flatMap((id) => library.songs.find((song) => song.id === id) ?? [])
      return sortSongs(playlistSongs, playlistSort)
    },
    [discoveryTracks, library.songs, librarySort, likedSongs, playbackPlaylist, playbackPlaylistId, playlistSort, recentlyAddedSongs, recentlyPlayedSongs, spotifyPlaybackQueue],
  )
  const playbackQueue = useMemo(() => {
    if (settings.customQueueEnabled && (customQueueNextUp.length || customQueueLater.length)) {
      const queued = [...customQueueNextUp, ...customQueueLater]
      return currentSong ? [currentSong, ...queued.filter((song) => song.id !== currentSong.id)] : queued
    }
    if (!shuffleEnabled || !shuffledSongIds.length) return playbackSongs
    const songsById = new Map(playbackSongs.map((song) => [song.id, song]))
    return shuffledSongIds.flatMap((id) => songsById.get(id) ?? [])
  }, [currentSong, customQueueLater, customQueueNextUp, playbackSongs, settings.customQueueEnabled, shuffleEnabled, shuffledSongIds])
  const visibleCurrentSongId = activeView === 'discovery'
    ? playbackPlaylistId === DISCOVERY_PLAYLIST_ID ? currentSongId : null
    : activeView === 'spotify-discovery'
      ? playbackPlaylistId === SPOTIFY_PLAYLIST_ID ? currentSongId : null
    : activeView === 'liked' || activeView === 'recently-played' || activeView === 'recently-added'
      ? currentSongId
    : activePlaylistId === playbackPlaylistId ? currentSongId : null
  const miniPlayerState = useMemo<MiniPlayerState>(() => ({
    song: currentSong,
    isPlaying,
    shuffleEnabled,
    repeatEnabled,
    currentTime,
    duration,
    volume,
  }), [currentSong, currentTime, duration, isPlaying, repeatEnabled, shuffleEnabled, volume])
  playbackAuthorizationRef.current = { isPlaying, currentSongId }

  useEffect(() => {
    if (!settings.extendedLibraryEnabled && (activeView === 'recently-played' || activeView === 'recently-added')) {
      setActiveView('library')
      setActivePlaylistId(null)
    }
  }, [activeView, settings.extendedLibraryEnabled])

  useEffect(() => {
    if (!lyricsAvailable) setLyricsPanelOpen(false)
  }, [lyricsAvailable, currentSongId])

  useEffect(() => window.electronApi?.onDebuggerCookiesChanged(setDebuggerCookies), [])

  useEffect(() => {
    if (!currentSongLyricsUrl || currentSong?.lyrics?.trim() || Object.prototype.hasOwnProperty.call(onlineLyricsCache, currentSongLyricsUrl)) return
    let cancelled = false
    const loadLyrics = async () => {
      try {
        const response = await fetch(currentSongLyricsUrl, { cache: 'force-cache' })
        if (!response.ok) throw new Error(`Lyrics returned ${response.status}`)
        const lyrics = (await response.text()).trim()
        if (!cancelled) setOnlineLyricsCache((current) => ({ ...current, [currentSongLyricsUrl]: lyrics || null }))
      } catch {
        if (!cancelled) setOnlineLyricsCache((current) => ({ ...current, [currentSongLyricsUrl]: null }))
      }
    }
    void loadLyrics()
    return () => {
      cancelled = true
    }
  }, [currentSong?.lyrics, currentSongLyricsUrl, onlineLyricsCache])

  const setEqAudioOutput = useCallback(async (sinkId: string) => {
    const context = audioContextRef.current as (AudioContext & { setSinkId?: (sinkId: string) => Promise<void> }) | null
    if (!context?.setSinkId) return false
    try {
      await context.setSinkId(sinkId)
      return true
    } catch {
      return false
    }
  }, [])

  const setAudioElementOutput = useCallback(async (audio: HTMLAudioElement, sinkId: string) => {
    const sinkableAudio = audio as HTMLAudioElement & { setSinkId?: (sinkId: string) => Promise<void> }
    if (!sinkableAudio.setSinkId) return false
    try {
      await sinkableAudio.setSinkId(sinkId)
      return true
    } catch {
      return false
    }
  }, [])

  const setGainLevel = useCallback((gainNode: GainNode | null, level: number, exact = false) => {
    if (!gainNode) return
    const now = gainNode.context.currentTime
    gainNode.gain.cancelScheduledValues(now)
    if (exact) {
      gainNode.gain.setValueAtTime(level, now)
      return
    }
    gainNode.gain.setTargetAtTime(level, now, 0.025)
  }, [])

  const applyPlaybackVolumes = useCallback(() => {
    const baseVolume = Math.pow(volumeRef.current, 2.4)
    audioRef.current.volume = mainGainRef.current ? baseVolume : baseVolume * mainFadeLevelRef.current
    crossFadeAudioRef.current.volume = crossFadeGainRef.current ? baseVolume : baseVolume * nextFadeLevelRef.current
    setGainLevel(mainGainRef.current, mainFadeLevelRef.current)
    setGainLevel(crossFadeGainRef.current, nextFadeLevelRef.current)
  }, [setGainLevel])

  const connectAudioSourceGraph = useCallback((
    source: MediaElementAudioSourceNode,
    gainNode: GainNode,
    filterStore: MutableRefObject<BiquadFilterNode[]>,
    corsSafe: boolean,
    fadeLevel: number,
  ) => {
    const context = source.context
    source.disconnect()
    filterStore.current.forEach((filter) => filter.disconnect())
    filterStore.current = []
    gainNode.disconnect()
    gainNode.gain.setValueAtTime(fadeLevel, context.currentTime)

    let previousNode: AudioNode = source
    if (settings.tuneEqEnabled && corsSafe) {
      const gains = normalizeEqGains(settings.tuneEqGains, settings.tuneEqBandCount)
      const frequencies = normalizeEqFrequencies(settings.tuneEqFrequencies, settings.tuneEqBandCount)
      const qValues = normalizeEqQValues(settings.tuneEqQValues, settings.tuneEqBandCount)
      filterStore.current = frequencies.map((frequency, index) => {
        const filter = context.createBiquadFilter()
        filter.type = 'peaking'
        filter.frequency.setValueAtTime(frequency, context.currentTime)
        filter.Q.setValueAtTime(qValues[index] ?? 1.1, context.currentTime)
        filter.gain.setValueAtTime(gains[index] ?? 0, context.currentTime)
        return filter
      })
      filterStore.current.forEach((filter) => {
        previousNode.connect(filter)
        previousNode = filter
      })
    }

    previousNode.connect(gainNode)
    gainNode.connect(context.destination)
  }, [settings.tuneEqBandCount, settings.tuneEqEnabled, settings.tuneEqFrequencies, settings.tuneEqGains, settings.tuneEqQValues])

  const resetEqGraph = useCallback(() => {
    audioSourceRef.current?.disconnect()
    eqFiltersRef.current.forEach((filter) => filter.disconnect())
    mainGainRef.current?.disconnect()
    crossFadeAudioSourceRef.current?.disconnect()
    crossFadeEqFiltersRef.current.forEach((filter) => filter.disconnect())
    crossFadeGainRef.current?.disconnect()
    audioSourceRef.current = null
    eqFiltersRef.current = []
    mainGainRef.current = null
    crossFadeAudioSourceRef.current = null
    crossFadeEqFiltersRef.current = []
    crossFadeGainRef.current = null
  }, [])

  const cancelCrossFade = useCallback(() => {
    if (crossFadeTimerRef.current !== null) {
      window.clearInterval(crossFadeTimerRef.current)
      crossFadeTimerRef.current = null
    }
    if (crossFadeCleanupTimerRef.current !== null) {
      window.clearTimeout(crossFadeCleanupTimerRef.current)
      crossFadeCleanupTimerRef.current = null
    }
    eqReconnectDeferredUntilRef.current = 0
    crossFadeTargetRef.current = null
    mainFadeLevelRef.current = 1
    nextFadeLevelRef.current = 0
    crossFadeAudioSourceRef.current?.disconnect()
    crossFadeEqFiltersRef.current.forEach((filter) => filter.disconnect())
    crossFadeGainRef.current?.disconnect()
    crossFadeAudioSourceRef.current = null
    crossFadeEqFiltersRef.current = []
    crossFadeGainRef.current = null
    crossFadeAudioRef.current.pause()
    crossFadeAudioRef.current.removeAttribute('src')
    crossFadeAudioRef.current.load()
    applyPlaybackVolumes()
  }, [applyPlaybackVolumes])

  const configureEqGraph = useCallback(() => {
    if (performance.now() < eqReconnectDeferredUntilRef.current) return
    const shouldCreateGraph = settings.tuneEqEnabled || audioSourceRef.current !== null
    if (!shouldCreateGraph) return

    const AudioContextConstructor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextConstructor) return
    const context = audioContextRef.current ?? new AudioContextConstructor()
    audioContextRef.current = context
    if (!audioCorsSafeRef.current && !audioSourceRef.current) return
    if (!audioSourceRef.current) audioSourceRef.current = context.createMediaElementSource(audioRef.current)
    if (!mainGainRef.current) mainGainRef.current = context.createGain()
    connectAudioSourceGraph(audioSourceRef.current, mainGainRef.current, eqFiltersRef, audioCorsSafeRef.current, mainFadeLevelRef.current)
    applyPlaybackVolumes()
    void setEqAudioOutput(selectedAudioOutputIdRef.current)
  }, [applyPlaybackVolumes, connectAudioSourceGraph, setEqAudioOutput, settings.tuneEqEnabled])

  useEffect(() => {
    if (!shuffleEnabled) {
      shuffleSourceRef.current = undefined
      return
    }
    const source = `${playbackPlaylistId ?? 'library'}:${playbackSongs.map((song) => song.id).join(',')}`
    if (shuffleSourceRef.current === source) return
    shuffleSourceRef.current = source
    setShuffledSongIds(createShuffledSongIds(playbackSongs, currentSongId))
  }, [currentSongId, playbackPlaylistId, playbackSongs, shuffleEnabled])

  useEffect(() => {
    configureEqGraph()
  }, [configureEqGraph])

  useEffect(() => {
    applyAudioSpeed(audioRef.current, settings.audioSpeed, settings.audioPitchEnabled)
    applyAudioSpeed(crossFadeAudioRef.current, settings.audioSpeed, settings.audioPitchEnabled)
  }, [settings.audioPitchEnabled, settings.audioSpeed])

  const showToast = useCallback((message: string, tone: ToastItem['tone'] = 'success') => {
    const id = crypto.randomUUID()
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
    setToasts([{ id, message, tone }])
    toastTimerRef.current = window.setTimeout(() => {
      setToasts((items) => items.filter((toast) => toast.id !== id))
      toastTimerRef.current = null
    }, 3400)
  }, [])
  useEffect(() => window.electronApi?.onSpotifyLinked((nextSettings) => {
    setSettings(nextSettings)
    setActiveView('spotify-discovery')
    setActivePlaylistId(null)
    setModal(null)
    showToast('Spotify account linked.', 'info')
  }), [showToast])
  useEffect(() => window.electronApi?.onSpotifyLinkError((message) => {
    showToast(message, 'info')
  }), [showToast])
  useEffect(() => {
    if (!settings.spotifySpDc || !settings.showSpotifyPlaylistsInSidebar) {
      setSpotifySidebarPlaylists([])
      setSelectedSpotifySidebarPlaylist(null)
      return
    }
    let cancelled = false
    void window.electronApi?.getSpotifyLibraryPlaylists().then((playlists) => {
      if (!cancelled) setSpotifySidebarPlaylists(playlists)
    }).catch(() => {
      if (!cancelled) setSpotifySidebarPlaylists([])
    })
    return () => { cancelled = true }
  }, [settings.showSpotifyPlaylistsInSidebar, settings.spotifySpDc])
  const clearSpotifyClientState = useCallback(() => {
    setSettings((current) => ({
      ...current,
      spotifySpDc: '',
      spotifySpT: '',
      spotifyAccessToken: '',
      spotifyAccessTokenExpirationTimestampMs: 0,
    }))
    setActiveView((current) => current === 'spotify-discovery' ? 'library' : current)
  }, [])
  useEffect(() => {
    if (!settings.spotifySpDc) return undefined
    let cancelled = false
    let retryTimer: number | null = null
    const refreshToken = async () => {
      try {
        const result = await window.electronApi?.ensureSpotifyAccessToken()
        if (cancelled || !result) return
        if (result.stateCleared) {
          clearSpotifyClientState()
          showToast('Spotify session expired and was disconnected.', 'info')
          return
        }
        if (result.linked) {
          setSettings((current) => ({
            ...current,
            spotifyAccessToken: result.accessToken,
            spotifyAccessTokenExpirationTimestampMs: result.accessTokenExpirationTimestampMs,
          }))
          return
        }
      } catch {
        // A temporary IPC/network failure should not disconnect a valid Spotify session.
      }
      if (!cancelled) retryTimer = window.setTimeout(() => void refreshToken(), 60_000)
    }
    const refreshAt = Math.max(0, settings.spotifyAccessTokenExpirationTimestampMs - Date.now() + 250)
    retryTimer = window.setTimeout(() => void refreshToken(), refreshAt)
    return () => {
      cancelled = true
      if (retryTimer !== null) window.clearTimeout(retryTimer)
    }
  }, [clearSpotifyClientState, settings.spotifyAccessTokenExpirationTimestampMs, settings.spotifySpDc, showToast])
  const dismissToast = useCallback((id: string) => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current)
      toastTimerRef.current = null
    }
    setToasts((items) => items.filter((toast) => toast.id !== id))
  }, [])
  const refreshLibrary = useCallback(async (notify = false) => {
    if (notify) setLibraryLoading(true)
    try {
      const nextLibrary = await window.electronApi?.getLibrary()
      if (nextLibrary) setLibrary(nextLibrary)
      if (notify) showToast('Music library refreshed.', 'info')
    } finally {
      if (notify) setLibraryLoading(false)
    }
  }, [showToast])
  const refreshDiscovery = useCallback(async (notify = false) => {
    setDiscoveryLoading(true)
    setDiscoveryError('')
    try {
      if (!notify) {
        const cachedSongs = readDiscoveryCache()
        if (cachedSongs) {
          setDiscoverySongs(cachedSongs)
          return
        }
      }
      const response = await fetch(DISCOVERY_API_URL, { cache: 'no-store' })
      if (!response.ok) throw new Error(`Discovery API returned ${response.status}.`)
      const data = await response.json()
      if (!Array.isArray(data)) throw new Error('Discovery API returned invalid data.')
      const counts = readDiscoveryListenCounts()
      const nextSongs = data.flatMap((item): DiscoverySong[] => {
        if (!item || typeof item !== 'object') return []
        const record = item as Partial<Record<'online_id' | 'featured' | 'title' | 'artist' | 'album' | 'genre' | 'year' | 'file' | 'cover' | 'lyrics' | 'lyrics_offset', unknown>>
        if (typeof record.file !== 'string' || !record.file.trim()) return []
        const file = record.file.trim()
        const onlineId = typeof record.online_id === 'string' && record.online_id.trim() ? record.online_id.trim() : file
        const title = typeof record.title === 'string' && record.title.trim() ? record.title.trim() : file.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'Unknown title'
        const rawLyricsOffset = typeof record.lyrics_offset === 'number'
          ? record.lyrics_offset
          : typeof record.lyrics_offset === 'string'
            ? Number(record.lyrics_offset)
            : 0
        return [{
          id: discoveryId(onlineId),
          onlineId,
          featured: record.featured === '1' || record.featured === 1,
          title,
          artist: typeof record.artist === 'string' ? record.artist.trim() : '',
          album: typeof record.album === 'string' ? record.album.trim() : '',
          genre: typeof record.genre === 'string' ? record.genre.trim() : '',
          year: typeof record.year === 'string' ? record.year.trim() : '',
          file,
          cover: typeof record.cover === 'string' ? record.cover.trim() : '',
          lyrics: typeof record.lyrics === 'string' ? record.lyrics.trim() : '',
          lyricsOffset: normalizeLyricsDelay(rawLyricsOffset),
          listenCount: counts[discoveryId(onlineId)] ?? 0,
        }]
      })
      setDiscoverySongs(nextSongs)
      writeDiscoveryCache(nextSongs)
      if (notify) showToast(`Discovery refreshed: ${nextSongs.length} online songs.`, 'info')
    } catch (error) {
      setDiscoveryError(error instanceof Error ? error.message : 'Could not load Discovery songs.')
      if (notify) showToast('Could not refresh Discovery.', 'info')
    } finally {
      setDiscoveryLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    setDiscoveryAudioMetadata(readAudioMetadataCache())
    if (discoveryQualityFilter !== 'hires') return

    let cancelled = false
    const cached = readAudioMetadataCache()
    const flacUrls = Array.from(new Set(discoverySongs.map((song) => song.file).filter(isFlacUrl)))
    const missingUrls = flacUrls.filter((url) => !Object.prototype.hasOwnProperty.call(cached, url))
    if (!missingUrls.length) return

    const loadMetadata = async () => {
      for (let index = 0; index < missingUrls.length; index += 4) {
        const batch = missingUrls.slice(index, index + 4)
        const entries = await Promise.all(batch.map(async (url) => [url, await readFlacMetadata(url)] as const))
        if (cancelled) return
        setDiscoveryAudioMetadata((current) => {
          const next = { ...current }
          entries.forEach(([url, metadata]) => {
            next[url] = metadata
          })
          return next
        })
      }
    }

    void loadMetadata()
    return () => {
      cancelled = true
    }
  }, [discoveryQualityFilter, discoverySongs])

  const checkForUpdate = useCallback(async (currentVersion: string) => {
    try {
      const response = await fetch(VERSION_API_URL, { cache: 'no-store' })
      if (!response.ok) {
        showToast('Could not find a new update.', 'info')
        return
      }
      const data = await response.json()
      if (!data || typeof data !== 'object') {
        showToast('Could not find a new update.', 'info')
        return
      }
      const latestVersion = typeof (data as { version?: unknown }).version === 'string'
        ? (data as { version: string }).version.trim()
        : ''
      if (!latestVersion) {
        showToast('Could not find a new update.', 'info')
        return
      }
      setLatestAppVersion(latestVersion)
      if (shouldShowUpdateNotice(currentVersion, latestVersion)) setModal('update-available')
    } catch {
      showToast('Could not find a new update.', 'info')
    }
  }, [showToast])

  useEffect(() => {
    if (!playerStateReady || !navigator.mediaDevices?.enumerateDevices) return
    let disposed = false
    let checking = false
    const checkAudioOutput = async () => {
      if (checking) return
      checking = true
      try {
        let next = await readAudioOutputSnapshot(selectedAudioOutputIdRef.current)
        if (disposed) return
        if (selectedAudioOutputIdRef.current !== 'default' && !next.outputs.some((device) => device.id === selectedAudioOutputIdRef.current)) {
          selectedAudioOutputIdRef.current = 'default'
          await Promise.all([
            setAudioElementOutput(audioRef.current, 'default'),
            setAudioElementOutput(crossFadeAudioRef.current, 'default'),
            setEqAudioOutput('default'),
          ])
          next = await readAudioOutputSnapshot()
          if (disposed) return
        }
        const previous = audioOutputSnapshotRef.current
        audioOutputSnapshotRef.current = next
        setActiveAudioOutput(next.active)
        setAudioOutputs(next.outputs)
        if (!previous || sameAudioOutput(previous.active, next.active)) return

        const stoppedListening = previous.active?.isListeningDevice && !next.active?.isListeningDevice
        if (stoppedListening) {
          if (playbackAuthorizationRef.current.isPlaying) setIsPlaying(false)
          showToast(`${previous.active?.label || 'Listening device'} disconnected. Playback paused.`, 'info')
          return
        }
        if (next.active) {
          showToast(`Audio output changed to ${next.active.label}.`, 'info')
        }
      } finally {
        checking = false
      }
    }
    const handleDeviceChange = () => void checkAudioOutput()
    void checkAudioOutput()
    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange)
    const interval = window.setInterval(checkAudioOutput, 1500)
    return () => {
      disposed = true
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange)
      window.clearInterval(interval)
    }
  }, [playerStateReady, setAudioElementOutput, setEqAudioOutput, showToast])

  useEffect(() => {
    const minimumLoading = new Promise((resolve) => window.setTimeout(resolve, STARTUP_LOADING_MIN_MS))
    const loadAppState = Promise.all([window.electronApi?.getLibrary(), window.electronApi?.getPlayerState(), window.electronApi?.getAppSettings(), window.electronApi?.getAppInfo()])
      .then(([nextLibrary, savedPlayer, settings, appInfo]) => {
        if (nextLibrary) setLibrary(nextLibrary)
        if (savedPlayer) {
          setCustomQueueNextUp(savedPlayer.customQueueNextUp ?? [])
          setCustomQueueLater(savedPlayer.customQueueLater ?? [])
          const savedSpotifyTrack = savedPlayer.spotifyTrack
          const restoringSpotify = savedPlayer.playbackPlaylistId === SPOTIFY_PLAYLIST_ID
            && savedPlayer.currentSongId === (savedSpotifyTrack ? spotifyTrackId(savedSpotifyTrack.id) : null)
          const validSongId = restoringSpotify
            ? savedPlayer.currentSongId
            : nextLibrary?.songs.some((song) => song.id === savedPlayer.currentSongId) ? savedPlayer.currentSongId : null
          setVolume(savedPlayer.volume)
          setCurrentSongId(validSongId)
          const validPlaybackPlaylistId = restoringSpotify
            ? SPOTIFY_PLAYLIST_ID
            : savedPlayer.playbackPlaylistId === LIKED_PLAYLIST_ID || savedPlayer.playbackPlaylistId === RECENTLY_PLAYED_PLAYLIST_ID || savedPlayer.playbackPlaylistId === RECENTLY_ADDED_PLAYLIST_ID
              ? savedPlayer.playbackPlaylistId
              : nextLibrary?.playlists.some((playlist) => playlist.id === savedPlayer.playbackPlaylistId) ? savedPlayer.playbackPlaylistId : null
          setPlaybackPlaylistId(validPlaybackPlaylistId)
          pendingRestoreTimeRef.current = validSongId ? savedPlayer.currentTime : null
          setCurrentTime(validSongId ? savedPlayer.currentTime : 0)
          if (restoringSpotify && savedSpotifyTrack) {
            const savedQueue = savedPlayer.spotifyQueue?.length ? savedPlayer.spotifyQueue : [savedSpotifyTrack]
            setSpotifyPlaybackQueue(savedQueue)
            setSpotifyPlaybackTrack(toSpotifyTrack(savedSpotifyTrack))
            setSpotifyPlaybackLoadingId(validSongId)
            void window.electronApi?.resolveSpotifyPlayback(savedSpotifyTrack).then((result) => {
              if (!result) return
              const playable = toSpotifyTrack(savedSpotifyTrack, result.audioUrl)
              playable.duration = result.duration
              spotifyPlaybackCacheRef.current.set(savedSpotifyTrack.id, playable)
              setSpotifyPlaybackTrack(playable)
              setSpotifyPlaybackLoadingId(null)
            }).catch(() => setSpotifyPlaybackLoadingId(null))
          }
        }
        if (settings) {
          setSettings(settings)
          if (appInfo) setAppVersion(appInfo.version)
          if (appInfo && shouldShowVersionNotice(appInfo.version, settings)) setModal('version-notice')
          if (appInfo) void checkForUpdate(appInfo.version)
          if (settings.discordRpcV2OauthAccessToken && settings.discordRpcV2OauthRefreshToken) {
            void window.electronApi?.validateDiscordRpcV2Token().then((next) => {
              if (next) setSettings(next)
            }).catch(() => undefined)
          }
        }
      })
      .catch(() => undefined)
    void Promise.all([loadAppState, minimumLoading])
      .finally(() => {
        setPlayerStateReady(true)
        setLibraryLoading(false)
      })
    return () => {
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
    }
  }, [checkForUpdate])

  useEffect(() => {
    void refreshDiscovery()
  }, [refreshDiscovery])

  useEffect(() => () => {
    if (eqSettingsSaveTimerRef.current !== null) window.clearTimeout(eqSettingsSaveTimerRef.current)
  }, [])

  useEffect(() => {
    let cancelled = false
    let checking = false
    const ping = async () => {
      if (checking) return
      checking = true
      const controller = new AbortController()
      const timeout = window.setTimeout(() => controller.abort(), 5000)
      try {
        const response = await fetch('https://cdn.shizuku.tech/ping', { cache: 'no-store', signal: controller.signal })
        if (!cancelled) setOnlineAvailable(response.ok)
      } catch {
        if (!cancelled) setOnlineAvailable(false)
      } finally {
        checking = false
        window.clearTimeout(timeout)
      }
    }
    void ping()
    const interval = window.setInterval(() => void ping(), 12_000)
    return () => { cancelled = true; window.clearInterval(interval) }
  }, [])

  const handleOnlinePlaybackOutage = useCallback((song: MusicTrack) => {
    void song
    return false
  }, [])

  useEffect(() => {
    return window.electronApi?.onOnlineMusicImportProgress((progress: ImportOnlineMusicProgress) => {
      setDiscoveryImportProgress((current) => ({ ...current, [progress.requestId]: progress.progress }))
    })
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    let stalledTimer: number | null = null
    const updateTime = () => {
      if (loadedSongIdRef.current !== playbackAuthorizationRef.current.currentSongId) return
      const nextTime = audio.currentTime
      setCurrentTime(nextTime)
      if (!settings.crossFadeEnabled || !isPlaying || repeatEnabled || seekingRef.current || crossFadeTargetRef.current) return
      const audioDuration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0
      if (!audioDuration || playbackQueue.length <= 1 || !currentSongId) return
      const remainingMs = Math.max((audioDuration - nextTime) * 1000, 0)
      const fadeDuration = Math.min(normalizeCrossFadeDuration(settings.crossFadeDuration), Math.max(audioDuration - 0.5, 0))
      if (fadeDuration <= 0) return
      const currentIndex = playbackQueue.findIndex((song) => song.id === currentSongId)
      if (currentIndex < 0) return
      const atIncompleteSpotifyQueueEnd = playbackPlaylistId === SPOTIFY_PLAYLIST_ID && spotifyQueueHasMore && currentIndex === playbackQueue.length - 1
      const nextSong = atIncompleteSpotifyQueueEnd ? undefined : playbackQueue[(currentIndex + 1) % playbackQueue.length]
      if (!nextSong || nextSong.id === currentSongId) return
      if (remainingMs <= fadeDuration * 1000 + 3000 && nextSong.id.startsWith('spotify:') && !nextSong.audioUrl) {
        preloadSpotifyTrackRef.current(nextSong.id)
      }
      if (remainingMs > fadeDuration * 1000 || remainingMs < 350 || !nextSong.audioUrl) return
      startCrossFadeRef.current(nextSong, remainingMs)
    }
    const updateDuration = () => {
      if (loadedSongIdRef.current !== playbackAuthorizationRef.current.currentSongId) return
      // Browsers may briefly report NaN or Infinity while seeking streamed audio.
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration)
        if (pendingRestoreTimeRef.current !== null) {
          const restoredTime = Math.min(pendingRestoreTimeRef.current, audio.duration)
          audio.currentTime = restoredTime
          setCurrentTime(restoredTime)
          pendingRestoreTimeRef.current = null
        }
      }
    }
    const handleSeeking = () => {
      seekingRef.current = true
      // Also cover native/programmatic timeline changes that do not pass
      // through the React seek handler while a transition is in progress.
      if (crossFadeTargetRef.current) cancelCrossFade()
    }
    const handleSeeked = () => { seekingRef.current = false }
    const finishSong = () => {
      if (playbackFailureRef.current) return
      playbackFailureRef.current = true
      if (repeatEnabled || playbackQueue.length === 1) {
        audio.currentTime = 0
        setCurrentTime(0)
        if (currentSong) {
          void window.electronApi?.updateDiscordPresence({
            songId: currentSong.id,
            isPlaying: true,
            title: currentSong.title,
            artist: currentSong.artist,
            position: 0,
            duration: Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0,
            coverUrl: currentSong.coverUrl,
            rpcCoverUrl: currentSong.rpcCoverUrl,
            album: currentSong.album,
          })
        }
        void audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false))
      } else {
        moveSong(1)
      }
      window.setTimeout(() => { playbackFailureRef.current = false }, 500)
    }
    const isActiveAudio = () => loadedSongIdRef.current !== null
      && loadedSongIdRef.current === playbackAuthorizationRef.current.currentSongId
    const handleEnded = () => { if (isActiveAudio() && !seekingRef.current && !crossFadeTargetRef.current) finishSong() }
    const handleError = () => {
      if (!isActiveAudio() || !currentSong || crossFadeTargetRef.current) return
      if (handleOnlinePlaybackOutage(currentSong)) return
      if (isPlaying) finishSong()
    }
    const handleStalled = () => {
      if (!isActiveAudio()) return
      const stalledAt = audio.currentTime
      if (stalledTimer !== null) window.clearTimeout(stalledTimer)
      stalledTimer = window.setTimeout(() => {
        if (!isActiveAudio() || !isPlaying || Math.abs(audio.currentTime - stalledAt) >= 0.1) return
        if (currentSong && handleOnlinePlaybackOutage(currentSong)) return
        finishSong()
      }, 4000)
    }
    const clearStalled = () => {
      if (stalledTimer !== null) window.clearTimeout(stalledTimer)
      stalledTimer = null
    }
    const stopUnauthorizedPlayback = () => {
      const authorization = playbackAuthorizationRef.current
      const playbackConfirmed = authorization.isPlaying
        && authorization.currentSongId !== null
        && loadedSongIdRef.current === authorization.currentSongId
      if (!audio.paused && !playbackConfirmed) audio.pause()
    }
    const handlePlaying = () => {
      clearStalled()
      stopUnauthorizedPlayback()
    }
    const playbackGuard = window.setInterval(stopUnauthorizedPlayback, 500)
    audio.addEventListener('timeupdate', updateTime)
    audio.addEventListener('loadedmetadata', updateDuration)
    audio.addEventListener('durationchange', updateDuration)
    audio.addEventListener('seeking', handleSeeking)
    audio.addEventListener('seeked', handleSeeked)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('error', handleError)
    audio.addEventListener('stalled', handleStalled)
    audio.addEventListener('playing', handlePlaying)
    return () => {
      audio.removeEventListener('timeupdate', updateTime)
      audio.removeEventListener('loadedmetadata', updateDuration)
      audio.removeEventListener('durationchange', updateDuration)
      audio.removeEventListener('seeking', handleSeeking)
      audio.removeEventListener('seeked', handleSeeked)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('error', handleError)
      audio.removeEventListener('stalled', handleStalled)
      audio.removeEventListener('playing', handlePlaying)
      window.clearInterval(playbackGuard)
      clearStalled()
    }
  })

  useEffect(() => {
    if (!currentSong) return
    if (!currentSong.audioUrl) return
    if (loadedSongIdRef.current !== currentSong.id) {
      const playbackUrl = resolveOnlineAudioUrl(currentSong.audioUrl)
      const corsSafe = canUseCorsAudio(playbackUrl)
      if (!corsSafe && audioSourceRef.current) {
        const previousAudio = audioRef.current
        previousAudio.pause()
        resetEqGraph()
        audioRef.current = new Audio()
        applyPlaybackVolumes()
        void setAudioElementOutput(audioRef.current, selectedAudioOutputIdRef.current)
      }
      const audio = audioRef.current
      playbackFailureRef.current = false
      loadedSongIdRef.current = currentSong.id
      audioCorsSafeRef.current = corsSafe
      configureAudioCors(audio, playbackUrl)
      audio.src = playbackUrl
      audio.load()
      setCurrentTime(0)
      setDuration(0)
    }
  }, [applyPlaybackVolumes, currentSong, resetEqGraph, setAudioElementOutput])

  useEffect(() => {
    const audio = audioRef.current
    if (isPlaying) {
      configureEqGraph()
      void audioContextRef.current?.resume().catch(() => undefined)
      void audio.play().catch(() => {
        if (currentSong && handleOnlinePlaybackOutage(currentSong)) return
        setIsPlaying(false)
      })
    } else {
      cancelCrossFade()
      audio.pause()
    }
  }, [cancelCrossFade, configureEqGraph, currentSong, handleOnlinePlaybackOutage, isPlaying])

  useEffect(() => {
    // A power curve gives the lower half of the slider finer, more natural control.
    volumeRef.current = volume
    applyPlaybackVolumes()
    if (volume > 0) volumeBeforeMuteRef.current = volume
  }, [applyPlaybackVolumes, volume])

  useEffect(() => {
    const spotifyTrack = playbackPlaylistId === SPOTIFY_PLAYLIST_ID && currentSongId
      ? spotifyPlaybackQueue.find((track) => spotifyTrackId(track.id) === currentSongId)
      : undefined
    playerStateRef.current = {
      volume,
      currentSongId,
      currentTime,
      playbackPlaylistId,
      spotifyTrack,
      spotifyQueue: playbackPlaylistId === SPOTIFY_PLAYLIST_ID ? spotifyPlaybackQueue : [],
      customQueueNextUp,
      customQueueLater,
    }
  }, [customQueueLater, customQueueNextUp, volume, currentSongId, currentTime, playbackPlaylistId, spotifyPlaybackQueue])

  useEffect(() => {
    void window.electronApi?.sendMiniPlayerState(miniPlayerState)
  }, [miniPlayerState])

  useEffect(() => {
    if (!playerStateReady) return
    const save = () => void window.electronApi?.savePlayerState(playerStateRef.current)
    save()
    const interval = window.setInterval(save, 2000)
    return () => window.clearInterval(interval)
  }, [customQueueLater, customQueueNextUp, playerStateReady, currentSongId, playbackPlaylistId, spotifyPlaybackQueue, volume])

  useEffect(() => {
    const syncPresence = () => {
      const audio = audioRef.current
      void window.electronApi?.updateDiscordPresence({
        songId: currentSong?.id ?? '',
        isPlaying: isPlaying && !!currentSong,
        title: currentSong?.title ?? '',
        artist: currentSong?.artist ?? '',
        position: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
        duration: Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0,
        coverUrl: currentSong?.coverUrl,
        rpcCoverUrl: currentSong?.rpcCoverUrl,
        album: currentSong?.album,
      })
    }

    syncPresence()
  }, [currentSong, duration, isPlaying])

  const mergeActivityTrack = useCallback((track: MusicTrack) => {
    setLibrary((current) => current.songs.some((song) => song.id === track.id)
      ? { ...current, songs: current.songs.map((song) => song.id === track.id ? track : song) }
      : { ...current, songs: [...current.songs, track] })
  }, [])
  const recordQualifiedPlay = useCallback((song: MusicTrack) => {
    void window.electronApi?.recordMusicPlayback(song).then((track) => {
      if (!track) return
      mergeActivityTrack(track)
      if (song.id.startsWith('discovery:')) {
        const counts = readDiscoveryListenCounts()
        writeDiscoveryListenCounts({ ...counts, [song.id]: track.playCount ?? track.listenCount ?? 0 })
        setDiscoverySongs((current) => current.map((item) => item.id === song.id ? { ...item, listenCount: track.playCount ?? track.listenCount ?? 0 } : item))
      }
    }).catch(() => undefined)
  }, [mergeActivityTrack])
  const recordSkippedTrack = useCallback((song: MusicTrack) => {
    void window.electronApi?.recordMusicSkip(song).then((track) => track && mergeActivityTrack(track)).catch(() => undefined)
  }, [mergeActivityTrack])
  usePlaybackHistory({ song: currentSong, isPlaying, currentTime, duration, onQualifiedPlay: recordQualifiedPlay, onSkip: recordSkippedTrack })

  const startCrossFade = useCallback((nextSong: MusicTrack, remainingMs?: number) => {
    if (crossFadeTargetRef.current || nextSong.isOnline && !onlineAvailable) return
    const nextAudio = crossFadeAudioRef.current
    applyAudioSpeed(nextAudio, settings.audioSpeed, settings.audioPitchEnabled)
    const configuredDurationMs = normalizeCrossFadeDuration(settings.crossFadeDuration) * 1000
    const fadeDurationMs = Math.max(250, Math.min(configuredDurationMs, Math.max((remainingMs ?? configuredDurationMs) - 180, 250)))
    const playbackUrl = resolveOnlineAudioUrl(nextSong.audioUrl)
    const nextCorsSafe = canUseCorsAudio(playbackUrl)
    crossFadeTargetRef.current = nextSong
    nextFadeLevelRef.current = 0
    nextAudio.pause()
    configureAudioCors(nextAudio, playbackUrl)
    nextAudio.src = playbackUrl
    nextAudio.currentTime = 0
    nextAudio.load()
    applyPlaybackVolumes()
    void setAudioElementOutput(nextAudio, selectedAudioOutputIdRef.current)
    try {
      const shouldUseAudioGraph = nextCorsSafe && (settings.tuneEqEnabled || audioSourceRef.current !== null)
      if (shouldUseAudioGraph) {
        const AudioContextConstructor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (AudioContextConstructor) {
          const context = audioContextRef.current ?? new AudioContextConstructor()
          audioContextRef.current = context
          if (!audioSourceRef.current && audioCorsSafeRef.current) audioSourceRef.current = context.createMediaElementSource(audioRef.current)
          if (audioSourceRef.current && !mainGainRef.current) mainGainRef.current = context.createGain()
          if (audioSourceRef.current && mainGainRef.current) {
            connectAudioSourceGraph(audioSourceRef.current, mainGainRef.current, eqFiltersRef, audioCorsSafeRef.current, mainFadeLevelRef.current)
          }
          crossFadeAudioSourceRef.current = context.createMediaElementSource(nextAudio)
          crossFadeGainRef.current = context.createGain()
          connectAudioSourceGraph(crossFadeAudioSourceRef.current, crossFadeGainRef.current, crossFadeEqFiltersRef, nextCorsSafe, 0)
          void setEqAudioOutput(selectedAudioOutputIdRef.current)
          applyPlaybackVolumes()
        }
      }
    } catch {
      crossFadeAudioSourceRef.current?.disconnect()
      crossFadeEqFiltersRef.current.forEach((filter) => filter.disconnect())
      crossFadeGainRef.current?.disconnect()
      crossFadeAudioSourceRef.current = null
      crossFadeEqFiltersRef.current = []
      crossFadeGainRef.current = null
      applyPlaybackVolumes()
    }

    const startedAt = performance.now()
    const finish = () => {
      if (!crossFadeTargetRef.current) return
      if (crossFadeTimerRef.current !== null) {
        window.clearInterval(crossFadeTimerRef.current)
        crossFadeTimerRef.current = null
      }
      const oldAudio = audioRef.current
      const oldSource = audioSourceRef.current
      const oldFilters = eqFiltersRef.current
      const oldGain = mainGainRef.current
      const promotedSource = crossFadeAudioSourceRef.current
      const promotedFilters = crossFadeEqFiltersRef.current
      const promotedGain = crossFadeGainRef.current
      audioRef.current = nextAudio
      crossFadeAudioRef.current = new Audio()
      applyAudioSpeed(crossFadeAudioRef.current, settings.audioSpeed, settings.audioPitchEnabled)
      oldAudio.volume = 0
      if (promotedSource && promotedGain) {
        audioSourceRef.current = promotedSource
        eqFiltersRef.current = promotedFilters
        mainGainRef.current = promotedGain
        crossFadeAudioSourceRef.current = null
        crossFadeEqFiltersRef.current = []
        crossFadeGainRef.current = null
        eqReconnectDeferredUntilRef.current = performance.now() + 300
      } else {
        audioSourceRef.current = null
        eqFiltersRef.current = []
        mainGainRef.current = null
        eqReconnectDeferredUntilRef.current = performance.now() + 1600
      }
      if (crossFadeCleanupTimerRef.current !== null) window.clearTimeout(crossFadeCleanupTimerRef.current)
      crossFadeCleanupTimerRef.current = window.setTimeout(() => {
        crossFadeCleanupTimerRef.current = null
        eqReconnectDeferredUntilRef.current = 0
        oldSource?.disconnect()
        oldFilters.forEach((filter) => filter.disconnect())
        oldGain?.disconnect()
        oldAudio.pause()
        oldAudio.removeAttribute('src')
        oldAudio.load()
      }, 1200)
      mainFadeLevelRef.current = 1
      nextFadeLevelRef.current = 0
      loadedSongIdRef.current = nextSong.id
      audioCorsSafeRef.current = canUseCorsAudio(playbackUrl)
      playbackFailureRef.current = false
      if (nextSong.id.startsWith('spotify:')) setSpotifyPlaybackTrack(nextSong)
      if (settings.customQueueEnabled && (customQueueNextUp.some((song) => song.id === nextSong.id) || customQueueLater.some((song) => song.id === nextSong.id))) {
        setQueuedPlaybackTrack(nextSong)
        setCustomQueueNextUp((current) => current.filter((song) => song.id !== nextSong.id))
        setCustomQueueLater((current) => current.filter((song) => song.id !== nextSong.id))
      }
      setCurrentSongId(nextSong.id)
      setCurrentTime(Number.isFinite(nextAudio.currentTime) ? nextAudio.currentTime : 0)
      setDuration(Number.isFinite(nextAudio.duration) && nextAudio.duration > 0 ? nextAudio.duration : 0)
      setGainLevel(mainGainRef.current, 1, true)
      applyPlaybackVolumes()
      crossFadeTargetRef.current = null
    }
    const step = (now = performance.now()) => {
      const progress = Math.min(Math.max((now - startedAt) / fadeDurationMs, 0), 1)
      mainFadeLevelRef.current = 1 - progress
      nextFadeLevelRef.current = progress
      applyPlaybackVolumes()
      if (progress >= 1) {
        finish()
        return
      }
    }

    void nextAudio.play().then(() => {
      step()
      crossFadeTimerRef.current = window.setInterval(step, 80)
    }).catch(() => {
      cancelCrossFade()
      handleOnlinePlaybackOutage(nextSong)
    })
  }, [applyPlaybackVolumes, cancelCrossFade, connectAudioSourceGraph, customQueueLater, customQueueNextUp, handleOnlinePlaybackOutage, onlineAvailable, setAudioElementOutput, setEqAudioOutput, setGainLevel, settings.audioPitchEnabled, settings.audioSpeed, settings.crossFadeDuration, settings.customQueueEnabled, settings.tuneEqEnabled])
  startCrossFadeRef.current = startCrossFade

  const resetAudioForTrackChange = useCallback(() => {
    const audio = audioRef.current
    audio.pause()
    loadedSongIdRef.current = null
    pendingRestoreTimeRef.current = null
    try { audio.currentTime = 0 } catch { /* The previous stream may already be detached. */ }
    audio.removeAttribute('src')
    audio.load()
    setCurrentTime(0)
    setDuration(0)
  }, [])

  const resolveAndPlaySpotifyTrack = useCallback(async (track: SpotifyPlaylistTrack, queue = spotifyPlaybackQueue) => {
    const id = spotifyTrackId(track.id)
    setSpotifyPlaybackQueue(queue.length ? queue : [track])
    setPlaybackPlaylistId(SPOTIFY_PLAYLIST_ID)
    if (currentSongId === id && spotifyPlaybackLoadingId === id) return

    const cached = spotifyPlaybackCacheRef.current.get(track.id)
    if (currentSongId === id && cached) {
      setIsPlaying((playing) => !playing)
      return
    }
    const generation = ++spotifyPlaybackGenerationRef.current
    if (cached) {
      cancelCrossFade()
      resetAudioForTrackChange()
      setDuration(cached.duration ?? track.durationMs / 1000)
      setSpotifyPlaybackTrack(cached)
      setCurrentSongId(id)
      setSpotifyPlaybackLoadingId(null)
      setIsPlaying(true)
      return
    }
    cancelCrossFade()
    resetAudioForTrackChange()
    setIsPlaying(false)
    setDuration(track.durationMs / 1000)
    setSpotifyPlaybackTrack(toSpotifyTrack(track))
    setCurrentSongId(id)
    setSpotifyPlaybackLoadingId(id)
    try {
      const result = await window.electronApi?.resolveSpotifyPlayback({ id: track.id, title: track.title, artist: track.artist, album: track.album, imageUrl: track.imageUrl, durationMs: track.durationMs })
      if (!result || generation !== spotifyPlaybackGenerationRef.current) return
      if (result.debugSearch) {
        console.groupCollapsed(`[Spotify playback] YouTube Music search: ${result.debugSearch.query}`)
        console.debug('Search results:', result.debugSearch.results)
        console.groupEnd()
      }
      const playable = toSpotifyTrack(track, result.audioUrl)
      playable.duration = result.duration
      spotifyPlaybackCacheRef.current.set(track.id, playable)
      setSpotifyPlaybackTrack(playable)
      setSpotifyPlaybackLoadingId(null)
      setIsPlaying(true)
    } catch {
      if (generation === spotifyPlaybackGenerationRef.current) setSpotifyPlaybackLoadingId(null)
    }
  }, [cancelCrossFade, currentSongId, resetAudioForTrackChange, spotifyPlaybackLoadingId, spotifyPlaybackQueue])

  const preloadSpotifyTrack = useCallback((id: string) => {
    const rawId = id.replace(/^spotify:/, '')
    if (spotifyPlaybackCacheRef.current.has(rawId) || spotifyPreloadPendingRef.current.has(rawId)) return
    const track = spotifyPlaybackQueue.find((candidate) => candidate.id === rawId)
    if (!track) return
    spotifyPreloadPendingRef.current.add(rawId)
    void window.electronApi?.resolveSpotifyPlayback({ id: track.id, title: track.title, artist: track.artist, album: track.album, imageUrl: track.imageUrl, durationMs: track.durationMs })
      .then((result) => {
        if (!result) return
        const playable = toSpotifyTrack(track, result.audioUrl)
        playable.duration = result.duration
        spotifyPlaybackCacheRef.current.set(rawId, playable)
        setSpotifyPlaybackQueue((current) => [...current])
      })
      .finally(() => spotifyPreloadPendingRef.current.delete(rawId))
  }, [spotifyPlaybackQueue])
  preloadSpotifyTrackRef.current = preloadSpotifyTrack

  const playSong = useCallback((id: string, sourcePlaylistId: string | null) => {
    const localSpotifyGeneration = ++localSpotifyPlaybackGenerationRef.current
    const queuedTarget = [...customQueueNextUp, ...customQueueLater].find((song) => song.id === id)
    setQueuedPlaybackTrack(queuedTarget ?? null)
    if (sourcePlaylistId === SPOTIFY_PLAYLIST_ID || id.startsWith('spotify:')) {
      const rawId = id.replace(/^spotify:/, '')
      const track = spotifyPlaybackQueue.find((candidate) => candidate.id === rawId) ?? (queuedTarget ? {
        id: rawId, uri: queuedTarget.sourceUrl || `spotify:track:${rawId}`, title: queuedTarget.title, artist: queuedTarget.artist,
        album: queuedTarget.album, imageUrl: queuedTarget.rpcCoverUrl ?? queuedTarget.coverUrl ?? '', durationMs: Math.round((queuedTarget.duration ?? 0) * 1000), playable: true, position: 0,
      } : undefined)
      if (track) void resolveAndPlaySpotifyTrack(track, spotifyPlaybackQueue)
      return
    }
    const targetSong = library.songs.find((song) => song.id === id) ?? allDiscoveryTracks.find((song) => song.id === id) ?? queuedTarget
    if (targetSong?.isOnline && !onlineAvailable) {
      const now = Date.now()
      if (now - offlineToastAtRef.current > 2500) {
        offlineToastAtRef.current = now
        showToast('This online song is unavailable while offline.', 'info')
      }
      return
    }
    if (targetSong?.isOnline && targetSong.sourceUrl?.startsWith('spotify:track:')) {
      cancelCrossFade()
      resetAudioForTrackChange()
      setPlaybackPlaylistId(sourcePlaylistId)
      setCurrentSongId(id)
      setCurrentTime(0)
      setDuration(targetSong.duration ?? 0)
      setSpotifyPlaybackLoadingId(id)
      setIsPlaying(false)
      void window.electronApi?.resolveSpotifyPlayback({ id: targetSong.id, title: targetSong.title, artist: targetSong.artist, album: targetSong.album, imageUrl: targetSong.rpcCoverUrl ?? targetSong.coverUrl ?? '', durationMs: Math.round((targetSong.duration ?? 0) * 1000) }).then((result) => {
        if (!result || localSpotifyGeneration !== localSpotifyPlaybackGenerationRef.current) return
        setLibrary((current) => ({ ...current, songs: current.songs.map((song) => song.id === id ? { ...song, audioUrl: result.audioUrl, duration: result.duration } : song) }))
        loadedSongIdRef.current = null
        setSpotifyPlaybackLoadingId(null)
        setIsPlaying(true)
      }).catch(() => {
        if (localSpotifyGeneration !== localSpotifyPlaybackGenerationRef.current) return
        setSpotifyPlaybackLoadingId(null)
        setIsPlaying(false)
        showToast(`Could not prepare ${targetSong.title} for playback.`, 'info')
      })
      return
    }
    cancelCrossFade()
    pendingRestoreTimeRef.current = null
    if (id !== currentSongId) resetAudioForTrackChange()
    if (id === currentSongId && sourcePlaylistId !== playbackPlaylistId) {
      audioRef.current.currentTime = 0
      setCurrentTime(0)
    }
    setPlaybackPlaylistId(sourcePlaylistId)
    setCurrentSongId(id)
    setIsPlaying(true)
  }, [allDiscoveryTracks, cancelCrossFade, currentSongId, customQueueLater, customQueueNextUp, library.songs, onlineAvailable, playbackPlaylistId, resetAudioForTrackChange, resolveAndPlaySpotifyTrack, showToast, spotifyPlaybackQueue])
  const moveSong = useCallback((direction: number) => {
    if (settings.customQueueEnabled && direction > 0 && (customQueueNextUp.length || customQueueLater.length)) {
      const nextSong = customQueueNextUp[0] ?? customQueueLater[0]
      if (customQueueNextUp.length) setCustomQueueNextUp((current) => current.slice(1))
      else setCustomQueueLater((current) => current.slice(1))
      playSong(nextSong.id, null)
      return
    }
    if (!playbackQueue.length) return
    const currentIndex = playbackQueue.findIndex((song) => song.id === currentSongId)
    if (playbackPlaylistId === SPOTIFY_PLAYLIST_ID && spotifyQueueHasMore && direction > 0 && currentIndex === playbackQueue.length - 1) {
      setIsPlaying(false)
      return
    }
    const nextIndex = (Math.max(currentIndex, 0) + direction + playbackQueue.length) % playbackQueue.length
    playSong(playbackQueue[nextIndex].id, playbackPlaylistId)
  }, [currentSongId, customQueueLater, customQueueNextUp, playbackPlaylistId, playbackQueue, playSong, settings.customQueueEnabled, spotifyQueueHasMore])
  const toggleShuffle = useCallback(() => {
    setShuffleEnabled((enabled) => !enabled)
  }, [])
  const importMusic = async (input: ImportMusicInput) => {
    await window.electronApi?.importMusic(input); await refreshLibrary(); setModal(null); showToast('Song imported successfully.')
  }
  const importMusicBatch = async (inputs: ImportMusicInput[]) => {
    for (const input of inputs) {
      await window.electronApi?.importMusic(input)
    }
    await refreshLibrary()
    setModal(null)
    showToast(`${inputs.length} songs imported successfully.`)
  }
  const importDiscoverySong = async (song: DiscoverySong) => {
    if (importingDiscoveryIds.includes(song.id)) return
    setImportingDiscoveryIds((current) => current.includes(song.id) ? current : [...current, song.id])
    try {
      const input: ImportOnlineMusicInput = {
        requestId: song.id,
        id: song.id,
        url: song.file,
        title: song.title,
        artist: song.artist,
        album: song.album,
        genre: song.genre,
        year: song.year,
        cover: song.cover,
        lyrics: song.lyrics,
        lyricsOffset: song.lyricsOffset,
        duration: song.duration,
      }
      setDiscoveryImportProgress((current) => ({ ...current, [song.id]: 0 }))
      showToast(`Downloading ${song.title}...`, 'info')
      await window.electronApi?.importOnlineMusic(input)
      await refreshLibrary()
      showToast(`${song.title} imported successfully.`)
    } catch {
      showToast(`Could not import ${song.title}.`, 'info')
    } finally {
      setImportingDiscoveryIds((current) => current.filter((id) => id !== song.id))
      setDiscoveryImportProgress((current) => {
        const next = { ...current }
        delete next[song.id]
        return next
      })
    }
  }
  const openDownloadDiscoverySong = useCallback((song: DiscoverySong) => {
    if (importingDiscoveryIds.includes(song.id)) return
    setDownloadingDiscoverySong(song)
    setModal('download-discovery')
  }, [importingDiscoveryIds])
  const addDiscoveryToLibrary = useCallback(async (song: DiscoverySong) => {
    const existingTrack = library.songs.find((track) => track.id === song.id || track.sourceUrl === song.file)
    if (existingTrack) {
      showToast(`${song.title} is already in your library.`, 'info')
      return
    }
    await window.electronApi?.addOnlineSongToLibrary({
      id: song.id,
      title: song.title,
      artist: song.artist,
      album: song.album,
      genre: song.genre,
      year: song.year,
      file: song.file,
      cover: song.cover,
      lyrics: song.lyrics,
      lyricsOffset: song.lyricsOffset,
    })
    await refreshLibrary()
    showToast(`${song.title} added to library.`)
  }, [library.songs, refreshLibrary, showToast])
  const addDiscoveryToPlaylist = useCallback(async (song: DiscoverySong, playlistId: string) => {
    await window.electronApi?.addOnlineSongToPlaylist(playlistId, {
      id: song.id,
      title: song.title,
      artist: song.artist,
      album: song.album,
      genre: song.genre,
      year: song.year,
      file: song.file,
      cover: song.cover,
      lyrics: song.lyrics,
      lyricsOffset: song.lyricsOffset,
    })
    await refreshLibrary()
    showToast(`${song.title} added to playlist.`)
  }, [refreshLibrary, showToast])
  const addLibrarySongToPlaylist = useCallback(async (song: MusicTrack, playlistId: string) => {
    await window.electronApi?.addSongToPlaylist(playlistId, song.id)
    await refreshLibrary()
    showToast(`${song.title} added to playlist.`)
  }, [refreshLibrary, showToast])
  const closeDownloadOnlineSong = () => {
    if (downloadingOnlineSong && onlineDownloadStatus[downloadingOnlineSong.id] !== 'downloading') {
      setDiscoveryImportProgress((current) => {
        const next = { ...current }
        delete next[downloadingOnlineSong.id]
        return next
      })
      setOnlineDownloadStatus((current) => {
        const next = { ...current }
        delete next[downloadingOnlineSong.id]
        return next
      })
    }
    setModal(null)
    setDownloadingOnlineSong(null)
  }
  const openDownloadOnlineSong = useCallback((song: MusicTrack) => {
    if (!song.isOnline || onlineDownloadStatus[song.id] === 'downloading') return
    setDownloadingOnlineSong(song)
    setModal('download-online')
  }, [onlineDownloadStatus])
  const downloadOnlineSong = async (song: MusicTrack) => {
    if (!song.isOnline || onlineDownloadStatus[song.id] === 'downloading') return
    setOnlineDownloadStatus((current) => ({ ...current, [song.id]: 'downloading' }))
    setDiscoveryImportProgress((current) => ({ ...current, [song.id]: 0 }))
    showToast(`Downloading ${song.title}...`, 'info')
    try {
      await window.electronApi?.downloadOnlineMusic(song.id)
      await refreshLibrary()
      setDiscoveryImportProgress((current) => ({ ...current, [song.id]: 1 }))
      setOnlineDownloadStatus((current) => ({ ...current, [song.id]: 'complete' }))
      showToast(`${song.title} downloaded successfully.`)
    } catch {
      setOnlineDownloadStatus((current) => {
        const next = { ...current }
        delete next[song.id]
        return next
      })
      showToast(`Could not download ${song.title}.`, 'info')
      setDiscoveryImportProgress((current) => {
        const next = { ...current }
        delete next[song.id]
        return next
      })
    }
  }
  const confirmDownloadDiscoverySong = () => {
    if (!downloadingDiscoverySong) return
    const song = downloadingDiscoverySong
    setModal(null)
    setDownloadingDiscoverySong(null)
    void importDiscoverySong(song)
  }
  const createPlaylist = async (input: CreatePlaylistInput) => {
    const created = await window.electronApi?.createPlaylist(input); await refreshLibrary(); setModal(null)
    if (created) setActivePlaylistId(created.id)
    showToast('Playlist created successfully.')
  }
  const createPlaylistFolder = async (input: CreatePlaylistFolderInput) => {
    await window.electronApi?.createPlaylistFolder(input)
    await refreshLibrary()
    setModal(null)
    showToast('Folder created successfully.')
  }
  const movePlaylistToFolder = useCallback(async (playlistId: string, folderId: string | null) => {
    await window.electronApi?.movePlaylistToFolder(playlistId, folderId)
    await refreshLibrary()
  }, [refreshLibrary])
  const editPlaylistFolder = async (input: UpdatePlaylistFolderInput) => {
    if (!editingFolder) return
    await window.electronApi?.updatePlaylistFolder(editingFolder.id, input)
    await refreshLibrary()
    setModal(null)
    setEditingFolder(null)
    showToast('Folder updated successfully.')
  }
  const deletePlaylistFolder = async () => {
    if (!deletingFolder) return
    await window.electronApi?.deletePlaylistFolder(deletingFolder.id)
    await refreshLibrary()
    setModal(null)
    setDeletingFolder(null)
    showToast('Folder deleted successfully.')
  }
  const editPlaylist = async (input: UpdatePlaylistInput) => {
    if (!editingPlaylist) return
    await window.electronApi?.updatePlaylist(editingPlaylist.id, input)
    await refreshLibrary()
    setModal(null)
    setEditingPlaylist(null)
    showToast('Playlist updated successfully.')
  }
  const deletePlaylist = async () => {
    if (!deletingPlaylist) return
    await window.electronApi?.deletePlaylist(deletingPlaylist.id)
    if (activePlaylistId === deletingPlaylist.id) setActivePlaylistId(null)
    if (playbackPlaylistId === deletingPlaylist.id) setPlaybackPlaylistId(null)
    await refreshLibrary()
    setModal(null)
    setDeletingPlaylist(null)
    showToast('Playlist deleted successfully.')
  }
  const addSong = async (songId: string) => {
    if (!activePlaylist) return
    await window.electronApi?.addSongToPlaylist(activePlaylist.id, songId); await refreshLibrary(); setModal(null); showToast('Song added to playlist.')
  }
  const editSong = async (input: UpdateMusicInput) => {
    if (!editingSong) return
    await window.electronApi?.updateMusic(editingSong.id, input); await refreshLibrary(); setModal(null); setEditingSong(null); showToast('Song updated successfully.')
  }
  const deleteSong = async () => {
    if (!deletingSong) return
    await window.electronApi?.deleteMusic(deletingSong.id)
    if (currentSongId === deletingSong.id) {
      cancelCrossFade()
      audioRef.current.pause()
      audioRef.current.removeAttribute('src')
      loadedSongIdRef.current = null
      setCurrentSongId(null)
      setPlaybackPlaylistId(null)
      setFullscreenPlayerOpen(false)
      setIsPlaying(false)
      setCurrentTime(0)
      setDuration(0)
    }
    await refreshLibrary()
    setModal(null)
    setDeletingSong(null)
    showToast('Song deleted successfully.')
  }
  const deleteAllSongs = async () => {
    await window.electronApi?.deleteAllMusic()
    cancelCrossFade()
    audioRef.current.pause()
    audioRef.current.removeAttribute('src')
    audioRef.current.load()
    loadedSongIdRef.current = null
    pendingRestoreTimeRef.current = null
    playbackFailureRef.current = false
    const nextPlayerState = {
      volume,
      currentSongId: null,
      currentTime: 0,
      playbackPlaylistId: null,
      customQueueNextUp: [],
      customQueueLater: [],
    }
    playerStateRef.current = nextPlayerState
    setCurrentSongId(null)
    setPlaybackPlaylistId(null)
    setCurrentTime(0)
    setDuration(0)
    setCustomQueueNextUp([])
    setCustomQueueLater([])
    setQueuedPlaybackTrack(null)
    setFullscreenPlayerOpen(false)
    setQueueSidebarOpen(false)
    setIsPlaying(false)
    await window.electronApi?.savePlayerState(nextPlayerState)
    await window.electronApi?.updateDiscordPresence({
      songId: '',
      isPlaying: false,
      title: '',
      artist: '',
      position: 0,
      duration: 0,
    })
    await refreshLibrary()
    setModal('settings')
    showToast('All songs deleted.', 'info')
  }
  const deleteAllPlaylists = async () => {
    await window.electronApi?.deleteAllPlaylists()
    if (activePlaylistId) setActivePlaylistId(null)
    if (playbackPlaylistId && playbackPlaylistId !== DISCOVERY_PLAYLIST_ID && playbackPlaylistId !== SPOTIFY_PLAYLIST_ID && playbackPlaylistId !== LIKED_PLAYLIST_ID && playbackPlaylistId !== RECENTLY_PLAYED_PLAYLIST_ID && playbackPlaylistId !== RECENTLY_ADDED_PLAYLIST_ID) {
      const nextPlayerState = {
        volume,
        currentSongId,
        currentTime,
        playbackPlaylistId: null,
        customQueueNextUp,
        customQueueLater,
      }
      playerStateRef.current = nextPlayerState
      setPlaybackPlaylistId(null)
      await window.electronApi?.savePlayerState(nextPlayerState)
    }
    await refreshLibrary()
    setModal('settings')
    showToast('All playlists deleted.', 'info')
  }
  const removeSongFromPlaylist = useCallback(async (song: MusicTrack) => {
    if (!activePlaylist) return
    await window.electronApi?.removeSongFromPlaylist(activePlaylist.id, song.id)
    await refreshLibrary()
    showToast('Song removed from playlist.', 'info')
  }, [activePlaylist, refreshLibrary, showToast])
  const openEditSong = useCallback((song: MusicTrack) => { setEditingSong(song); setModal('edit-song') }, [])
  const openDeleteSong = useCallback((song: MusicTrack) => { setDeletingSong(song); setModal('delete-song') }, [])
  const openEditPlaylist = useCallback((playlistId: string) => {
    const playlist = library.playlists.find((item) => item.id === playlistId)
    if (!playlist) return
    setEditingPlaylist(playlist)
    setModal('edit-playlist')
  }, [library.playlists])
  const openDeletePlaylist = useCallback((playlistId: string) => {
    const playlist = library.playlists.find((item) => item.id === playlistId)
    if (!playlist) return
    setDeletingPlaylist(playlist)
    setModal('delete-playlist')
  }, [library.playlists])
  const openEditPlaylistFolder = useCallback((folderId: string) => {
    const folder = library.playlistFolders.find((item) => item.id === folderId)
    if (!folder) return
    setEditingFolder(folder)
    setModal('edit-folder')
  }, [library.playlistFolders])
  const openDeletePlaylistFolder = useCallback((folderId: string) => {
    const folder = library.playlistFolders.find((item) => item.id === folderId)
    if (!folder) return
    setDeletingFolder(folder)
    setModal('delete-folder')
  }, [library.playlistFolders])
  const playPlaylist = (playlistId: string) => {
    const playlist = library.playlists.find((item) => item.id === playlistId)
    const playlistSongs = playlist?.songIds.flatMap((id) => library.songs.find((song) => song.id === id) ?? []) ?? []
    const firstSong = sortSongs(playlistSongs, playlistSort)[0]
    setActiveView('library')
    setActivePlaylistId(playlistId)
    if (firstSong) playSong(firstSong.id, playlistId)
    else showToast('This playlist has no songs to play.', 'info')
  }
  const selectLibrary = () => {
    setActiveView('library')
    setActivePlaylistId(null)
  }
  const selectPlaylist = useCallback((playlistId: string) => {
    setActiveView('library')
    setActivePlaylistId(playlistId)
  }, [])
  const chooseHoshinoDiscovery = () => {
    setActiveView('discovery')
    setActivePlaylistId(null)
    setModal(null)
  }
  const chooseSpotifyDiscovery = () => {
    if (!settings.spotifySpDc) {
      setModal('spotify-link')
      return
    }
    setActiveView('spotify-discovery')
    setSelectedSpotifySidebarPlaylist(null)
    setActivePlaylistId(null)
    setModal(null)

    const isExpired = Date.now() >= settings.spotifyAccessTokenExpirationTimestampMs
    if (!settings.spotifyAccessToken || isExpired) {
      void window.electronApi?.ensureSpotifyAccessToken().then((result) => {
        if (result.stateCleared) {
          clearSpotifyClientState()
          showToast('Spotify session expired and was disconnected.', 'info')
          return
        }
        if (!result.linked) {
          showToast('Could not refresh Spotify yet. Hoshino will retry automatically.', 'info')
          return
        }
        setSettings((current) => ({
          ...current,
          spotifyAccessToken: result.accessToken,
          spotifyAccessTokenExpirationTimestampMs: result.accessTokenExpirationTimestampMs,
        }))
      })
    }
  }
  const selectSpotifySidebarPlaylist = (playlist: SpotifyHomeCard) => {
    setSelectedSpotifySidebarPlaylist(playlist)
    setActiveView('spotify-discovery')
    setActivePlaylistId(null)
    setModal(null)
  }
  const startSpotifyLogin = async () => {
    await window.electronApi?.startSpotifyLogin()
  }
  const handleTopbarLinkAccount = () => {
    if (settings.spotifySpDc) {
      showToast('Spotify account linked successfully.', 'info')
      return
    }
    setModal('spotify-link')
  }
  const seekSong = useCallback((seconds: number) => {
    // Seeking expresses intent to remain on the current track. Stop and unload
    // any next-track audio that may already be playing during a cross-fade.
    if (crossFadeTargetRef.current) cancelCrossFade()
    const audio = audioRef.current
    const nextTime = Math.min(Math.max(seconds, 0), duration)
    try {
      audio.currentTime = nextTime
      if (isPlaying && audio.paused) void audio.play().catch(() => {
        if (playbackQueue.length === 1) {
          audio.currentTime = 0
          void audio.play().catch(() => setIsPlaying(false))
        } else moveSong(1)
      })
    } catch {
      if (playbackQueue.length === 1) {
        audio.currentTime = 0
        void audio.play().catch(() => setIsPlaying(false))
      } else moveSong(1)
      return
    }
    setCurrentTime(nextTime)
    playerStateRef.current = { ...playerStateRef.current, currentTime: nextTime }
    void window.electronApi?.savePlayerState(playerStateRef.current)
    if (currentSong && isPlaying) {
      void window.electronApi?.updateDiscordPresence({
        songId: currentSong.id,
        isPlaying: true,
        title: currentSong.title,
        artist: currentSong.artist,
        position: nextTime,
        duration: Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0,
        coverUrl: currentSong.coverUrl,
        rpcCoverUrl: currentSong.rpcCoverUrl,
        album: currentSong.album,
      })
    }
  }, [cancelCrossFade, currentSong, duration, isPlaying, moveSong, playbackQueue.length])
  const startSeekingSong = useCallback(() => {
    if (crossFadeTargetRef.current) cancelCrossFade()
  }, [cancelCrossFade])
  const toggleMute = useCallback(() => setVolume((current) => current === 0 ? volumeBeforeMuteRef.current : 0), [])
  const selectAudioOutput = async (device: AudioOutputDevice) => {
    try {
      const [mainChanged, crossFadeChanged, eqChanged] = await Promise.all([
        setAudioElementOutput(audioRef.current, device.id),
        setAudioElementOutput(crossFadeAudioRef.current, device.id),
        setEqAudioOutput(device.id),
      ])
      const hasSinkTarget = Boolean((audioRef.current as HTMLAudioElement & { setSinkId?: (sinkId: string) => Promise<void> }).setSinkId)
        || Boolean((crossFadeAudioRef.current as HTMLAudioElement & { setSinkId?: (sinkId: string) => Promise<void> }).setSinkId)
        || Boolean((audioContextRef.current as (AudioContext & { setSinkId?: (sinkId: string) => Promise<void> }) | null)?.setSinkId)
      if (hasSinkTarget && !mainChanged && !crossFadeChanged && !eqChanged) throw new Error('No audio output target accepted sinkId.')
      selectedAudioOutputIdRef.current = device.id
      const next = await readAudioOutputSnapshot(device.id)
      audioOutputSnapshotRef.current = next
      setActiveAudioOutput(next.active)
      setAudioOutputs(next.outputs)
      setModal(null)
      showToast(`Audio output changed to ${device.label || 'selected device'}.`, 'info')
    } catch {
      showToast(`Could not switch audio output to ${device.label || 'selected device'}.`, 'info')
    }
  }
  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((current) => {
      const next = { ...current, [key]: typeof value === 'string' ? value.trim() : value }
      void window.electronApi?.saveAppSettings(next)
      return next
    })
  }
  const updateTuneEq = (input: Pick<AppSettings, 'tuneEqEnabled' | 'tuneEqAutoSave' | 'tuneEqBandCount' | 'tuneEqFrequencies' | 'tuneEqQValues' | 'tuneEqGains' | 'tuneEqBandSettings'>, options?: { persist?: boolean }) => {
    setSettings((current) => {
      const tuneEqFrequencies = normalizeEqFrequencies(input.tuneEqFrequencies, input.tuneEqBandCount)
      const tuneEqQValues = normalizeEqQValues(input.tuneEqQValues, input.tuneEqBandCount)
      const tuneEqGains = normalizeEqGains(input.tuneEqGains, input.tuneEqBandCount)
      const next = {
        ...current,
        tuneEqEnabled: input.tuneEqEnabled,
        tuneEqAutoSave: input.tuneEqAutoSave,
        tuneEqBandCount: input.tuneEqBandCount,
        tuneEqFrequencies,
        tuneEqQValues,
        tuneEqGains,
        tuneEqBandSettings: {
          ...current.tuneEqBandSettings,
          ...input.tuneEqBandSettings,
          [String(input.tuneEqBandCount)]: {
            frequencies: tuneEqFrequencies,
            qValues: tuneEqQValues,
            gains: tuneEqGains,
          },
        },
      }
      if (options?.persist ?? next.tuneEqAutoSave) {
        if (eqSettingsSaveTimerRef.current !== null) window.clearTimeout(eqSettingsSaveTimerRef.current)
        eqSettingsSaveTimerRef.current = window.setTimeout(() => {
          eqSettingsSaveTimerRef.current = null
          void window.electronApi?.saveAppSettings(next).catch(() => undefined)
        }, 250)
      }
      return next
    })
  }
  const saveTuneEq = async () => {
    await window.electronApi?.saveAppSettings(settings)
  }
  const updateToggle = (key: 'playInBackground' | 'minimizeToTray' | 'startWithWindows' | 'discordRpcEnabled' | 'discordKeepRichPresence', value: boolean, label: string) => {
    updateSetting(key, value)
    showToast(`${label} ${value ? 'enabled' : 'disabled'}.`)
  }
  const updateDiscordLegacyEnabled = (value: boolean) => {
    setSettings((current) => {
      const next = { ...current, discordRpcEnabled: value, discordRpcV2Enabled: value ? false : current.discordRpcV2Enabled }
      void window.electronApi?.saveAppSettings(next)
      return next
    })
    showToast(`Discord Rich Presence Legacy ${value ? 'enabled' : 'disabled'}.`)
  }
  const updateDiscordV2Enabled = (value: boolean) => {
    setSettings((current) => {
      const next = { ...current, discordRpcV2Enabled: value, discordRpcEnabled: value ? false : current.discordRpcEnabled }
      void window.electronApi?.saveAppSettings(next)
      return next
    })
    showToast(`Discord Rich Presence v2 ${value ? 'enabled' : 'disabled'}.`)
  }
  const saveDiscordInputs = async (inputs: Pick<AppSettings, 'discordSmallImageUrl' | 'discordPausedSmallImageUrl' | 'discordDetailsTemplate' | 'discordStateTemplate' | 'discordLargeTextTemplate' | 'discordSmallTextTemplate' | 'discordPausedSmallTextTemplate'>) => {
    const next = {
      ...settings,
      ...Object.fromEntries(Object.entries(inputs).map(([key, value]) => [key, value.trim()])),
    } as AppSettings
    await window.electronApi?.saveAppSettings(next)
    setSettings(next)
    showToast('Discord Rich Presence settings saved.')
  }
  const saveDiscordV2Inputs = async (inputs: Pick<AppSettings, 'discordRpcV2SmallImageUrl' | 'discordRpcV2PausedSmallImageUrl' | 'discordRpcV2DetailsTemplate' | 'discordRpcV2StateTemplate' | 'discordRpcV2LargeTextTemplate' | 'discordRpcV2SmallTextTemplate' | 'discordRpcV2PausedSmallTextTemplate'>) => {
    const next = {
      ...settings,
      ...Object.fromEntries(Object.entries(inputs).map(([key, value]) => [key, value.trim()])),
    } as AppSettings
    await window.electronApi?.saveAppSettings(next)
    setSettings(next)
    showToast('Discord Rich Presence v2 settings saved.')
  }
  const saveCustomCss = async (customCss: string) => {
    const next = { ...settings, customCss }
    await window.electronApi?.saveAppSettings(next)
    setSettings(next)
    showToast('Custom CSS saved.')
  }
  const saveClientUserProfile = async (profile: Pick<AppSettings, 'clientUserName' | 'clientUserDescription' | 'clientUserAvatarUrl'>) => {
    const next = {
      ...settings,
      clientUserName: profile.clientUserName.trim(),
      clientUserDescription: profile.clientUserDescription.trim(),
      clientUserAvatarUrl: profile.clientUserAvatarUrl.trim(),
    }
    await window.electronApi?.saveAppSettings(next)
    setSettings(next)
    showToast('User profile saved.')
  }
  const syncSpotifyAccount = async () => {
    if (!settings.spotifySpDc) {
      setModal('spotify-link')
      throw new Error('Spotify account is not linked.')
    }
    const profile = await window.electronApi?.syncSpotifyAccount()
    if (!profile) throw new Error('Spotify profile sync is unavailable.')
    showToast('Spotify profile loaded.', 'info')
    return profile
  }
  const loginDiscordV2 = async () => {
    const next = await window.electronApi?.loginDiscordRpcV2()
    if (!next) return
    setSettings(next)
    showToast('Discord Rich Presence v2 connected.')
  }
  const resetSettings = async () => {
    const defaults = await window.electronApi?.resetAppSettings()
    if (!defaults) return
    setSettings(defaults)
    setModal('settings')
    showToast('Settings reset to default.', 'info')
  }
  const resetMusicState = async () => {
    cancelCrossFade()
    audioRef.current.pause()
    audioRef.current.removeAttribute('src')
    audioRef.current.load()
    loadedSongIdRef.current = null
    pendingRestoreTimeRef.current = null
    playbackFailureRef.current = false
    const nextPlayerState = {
      volume,
      currentSongId: null,
      currentTime: 0,
      playbackPlaylistId: null,
      customQueueNextUp: [],
      customQueueLater: [],
    }
    playerStateRef.current = nextPlayerState
    setCurrentSongId(null)
    setPlaybackPlaylistId(null)
    setCurrentTime(0)
    setDuration(0)
    setCustomQueueNextUp([])
    setCustomQueueLater([])
    setQueuedPlaybackTrack(null)
    setFullscreenPlayerOpen(false)
    setQueueSidebarOpen(false)
    setIsPlaying(false)
    await window.electronApi?.savePlayerState(nextPlayerState)
    await window.electronApi?.updateDiscordPresence({
      songId: '',
      isPlaying: false,
      title: '',
      artist: '',
      position: 0,
      duration: 0,
    })
    showToast('Music state reset.', 'info')
  }
  const resetSpotifyState = async () => {
    const next = await window.electronApi?.resetSpotifyState()
    if (!next) return
    setSettings(next)
    if (activeView === 'spotify-discovery') {
      setActiveView('library')
      setActivePlaylistId(null)
    }
    showToast('Spotify state reset.', 'info')
  }
  const startDebugLoadingScreen = useCallback((type: 'loading' | 'error') => {
    setModal(null)
    setDebugLoadingScreen(type)
    window.setTimeout(() => setDebugLoadingScreen((current) => current === type ? null : current), 2000)
  }, [])
  const openDevTools = async () => {
    await window.electronApi?.openDevTools()
    showToast('DevTools opened.', 'info')
  }
  const openDebuggerBrowser = async (url: string, userAgent: string) => {
    const cookies = await window.electronApi?.openDebuggerBrowser(url, userAgent)
    setDebuggerCookies(cookies ?? [])
    showToast('Debug browser opened.', 'info')
  }
  const refreshDebuggerCookies = async () => {
    const cookies = await window.electronApi?.getDebuggerCookies()
    setDebuggerCookies(cookies ?? [])
  }
  const restartApp = async () => {
    await window.electronApi?.savePlayerState(playerStateRef.current)
    await window.electronApi?.restartApp()
  }
  const dismissVersionNotice = async () => {
    if (!appVersion) {
      setModal(null)
      return
    }
    const dismissedVersionNoticeVersions = [...new Set([...settings.dismissedVersionNoticeVersions, versionNoticeKey(appVersion)])]
    const next = { ...settings, dismissedVersionNoticeVersions }
    await window.electronApi?.saveAppSettings(next)
    setSettings(next)
    setModal(null)
  }
  const dismissUpdateNotice = async () => {
    setModal(null)
  }
  const downloadUpdate = () => {
    window.open(UPDATE_DOWNLOAD_URL, '_blank', 'noopener,noreferrer')
    void dismissUpdateNotice()
  }

  usePlaybackShortcuts({ blocked: modal !== null, currentSong, currentTime, audioRef, searchInputRef, moveSong, seekSong, toggleShuffle, setVolume, setIsPlaying, setRepeatEnabled })

  const playDiscoverySong = useCallback((id: string) => playSong(id, DISCOVERY_PLAYLIST_ID), [playSong])
  const playLibrarySong = useCallback((id: string) => playSong(id, null), [playSong])
  const playSmartCollectionSong = useCallback((id: string, kind: 'liked' | 'recently-played' | 'recently-added') => {
    const sourceId = kind === 'liked' ? LIKED_PLAYLIST_ID : kind === 'recently-played' ? RECENTLY_PLAYED_PLAYLIST_ID : RECENTLY_ADDED_PLAYLIST_ID
    playSong(id, sourceId)
  }, [playSong])
  const playSpotifyTrack = useCallback((track: SpotifyPlaylistTrack, queue: SpotifyPlaylistTrack[], hasMore = false) => {
    setSpotifyQueueHasMore(hasMore)
    return resolveAndPlaySpotifyTrack(track, queue)
  }, [resolveAndPlaySpotifyTrack])
  const playActivePlaylistSong = useCallback((id: string) => playSong(id, activePlaylist?.id ?? null), [activePlaylist?.id, playSong])
  const toggleFavorite = useCallback((song: MusicTrack) => {
    void window.electronApi?.setMusicFavorite(song, !song.favorite).then((track) => {
      if (!track) return
      mergeActivityTrack(track)
      setSpotifyPlaybackTrack((current) => current?.id === track.id ? { ...current, favorite: track.favorite } : current)
      showToast(track.favorite ? 'Added to Liked songs.' : 'Removed from Liked songs.', 'info')
    }).catch(() => showToast('Could not update Liked songs.', 'info'))
  }, [mergeActivityTrack, showToast])
  const playNextInCustomQueue = useCallback((song: MusicTrack) => {
    if (!settings.customQueueEnabled) return
    setCustomQueueLater((current) => current.filter((item) => item.id !== song.id))
    setCustomQueueNextUp((current) => [song, ...current.filter((item) => item.id !== song.id)])
    showToast(`${song.title} will play next.`, 'info')
  }, [settings.customQueueEnabled, showToast])
  const addToCustomQueue = useCallback((song: MusicTrack) => {
    if (!settings.customQueueEnabled) return
    setCustomQueueNextUp((current) => current.filter((item) => item.id !== song.id))
    setCustomQueueLater((current) => [...current.filter((item) => item.id !== song.id), song])
    showToast(`${song.title} added to queue.`, 'info')
  }, [settings.customQueueEnabled, showToast])
  const removeFromCustomQueue = useCallback((section: 'next' | 'later', songId: string) => {
    if (section === 'next') setCustomQueueNextUp((current) => current.filter((song) => song.id !== songId))
    else setCustomQueueLater((current) => current.filter((song) => song.id !== songId))
  }, [])
  const reorderCustomQueue = useCallback((section: 'next' | 'later', sourceId: string, targetId: string) => {
    const reorder = (songs: MusicTrack[]) => {
      const sourceIndex = songs.findIndex((song) => song.id === sourceId)
      const targetIndex = songs.findIndex((song) => song.id === targetId)
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return songs
      const next = [...songs]
      const [moved] = next.splice(sourceIndex, 1)
      next.splice(targetIndex, 0, moved)
      return next
    }
    if (section === 'next') setCustomQueueNextUp(reorder)
    else setCustomQueueLater(reorder)
  }, [])
  const clearCustomQueue = useCallback(() => {
    setCustomQueueNextUp([])
    setCustomQueueLater([])
    showToast('Queue cleared.', 'info')
  }, [showToast])
  const saveCustomQueueAsPlaylist = useCallback(() => {
    const songs = [currentSong, ...customQueueNextUp, ...customQueueLater].filter((song): song is MusicTrack => Boolean(song))
    if (!songs.length) {
      showToast('There are no songs to save.', 'info')
      return
    }
    setModal('save-queue-playlist')
  }, [currentSong, customQueueLater, customQueueNextUp, showToast])
  const confirmSaveCustomQueueAsPlaylist = async (name: string) => {
    const songs = [currentSong, ...customQueueNextUp, ...customQueueLater].filter((song): song is MusicTrack => Boolean(song))
    if (!songs.length) {
      setModal(null)
      showToast('There are no songs to save.', 'info')
      return
    }
    try {
      await window.electronApi?.createPlaylistFromQueue(name, songs)
      await refreshLibrary()
      setModal(null)
      showToast(`Saved queue as ${name}.`)
    } catch {
      showToast('Could not save queue as a playlist.', 'info')
    }
  }
  const refreshLibraryWithToast = useCallback(() => { void refreshLibrary(true) }, [refreshLibrary])
  const refreshDiscoveryWithToast = useCallback(() => { void refreshDiscovery(true) }, [refreshDiscovery])
  const openImportModal = useCallback(() => setModal('import'), [])
  const openAudioOutputModal = useCallback(() => setModal('audio-output'), [])
  const openVersionNoticeModal = useCallback(() => setModal('version-notice'), [])
  const openAddSongModal = useCallback(() => setModal('add-song'), [])
  const toggleSidebarCollapsed = useCallback(() => setSidebarCollapsed((collapsed) => !collapsed), [])
  const toggleQueueSidebar = useCallback(() => setQueueSidebarOpen((open) => !open), [])
  const togglePlayState = useCallback(() => setIsPlaying((value) => !value), [])
  const toggleRepeat = useCallback(() => setRepeatEnabled((enabled) => !enabled), [])
  const playPreviousSong = useCallback(() => moveSong(-1), [moveSong])
  const playNextSong = useCallback(() => moveSong(1), [moveSong])
  const openMiniPlayer = useCallback(() => {
    void window.electronApi?.sendMiniPlayerState(miniPlayerState)
    void window.electronApi?.openMiniPlayer()
  }, [miniPlayerState])
  useEffect(() => {
    const handleMiniPlayerCommand = (command: MiniPlayerCommand) => {
      switch (command.type) {
        case 'toggle-play':
          togglePlayState()
          break
        case 'previous':
          playPreviousSong()
          break
        case 'next':
          playNextSong()
          break
        case 'toggle-shuffle':
          toggleShuffle()
          break
        case 'toggle-repeat':
          toggleRepeat()
          break
        case 'toggle-mute':
          toggleMute()
          break
        case 'seek':
          seekSong(command.seconds)
          break
        case 'volume':
          setVolume(Math.min(Math.max(command.volume, 0), 1))
          break
        case 'expand':
          void window.electronApi?.expandMiniPlayer()
          break
      }
    }
    return window.electronApi?.onMiniPlayerCommand(handleMiniPlayerCommand)
  }, [playNextSong, playPreviousSong, seekSong, toggleMute, togglePlayState, toggleRepeat, toggleShuffle])
  const openActivePlaylistEditor = useCallback(() => {
    if (activePlaylist) openEditPlaylist(activePlaylist.id)
  }, [activePlaylist, openEditPlaylist])
  const openActivePlaylistDelete = useCallback(() => {
    if (activePlaylist) openDeletePlaylist(activePlaylist.id)
  }, [activePlaylist, openDeletePlaylist])
  const removeSongFromActivePlaylist = useCallback((song: MusicTrack) => { void removeSongFromPlaylist(song) }, [removeSongFromPlaylist])
  const showEmptyPlaylistToast = useCallback(() => showToast('This playlist has no songs to play.', 'info'), [showToast])
  const addDiscoveryToPlaylistAction = useCallback((song: DiscoverySong, playlistId: string) => { void addDiscoveryToPlaylist(song, playlistId) }, [addDiscoveryToPlaylist])
  const addLibrarySongToPlaylistAction = useCallback((song: MusicTrack, playlistId: string) => { void addLibrarySongToPlaylist(song, playlistId) }, [addLibrarySongToPlaylist])
  const reorderActivePlaylistSongs = useCallback((songIds: string[]) => {
    if (!activePlaylist) return
    const playlistId = activePlaylist.id
    setLibrary((current) => ({ ...current, playlists: current.playlists.map((playlist) => playlist.id === playlistId ? { ...playlist, songIds } : playlist) }))
    void window.electronApi?.reorderPlaylistSongs(playlistId, songIds).catch(() => {
      void refreshLibrary()
      showToast('Could not save the playlist order.', 'info')
    })
  }, [activePlaylist, refreshLibrary, showToast])
  const resolveSpotifyTrackForLibrary = useCallback(async (track: SpotifyPlaylistTrack) => {
    const result = await window.electronApi?.resolveSpotifyPlayback({ id: track.id, title: track.title, artist: track.artist, album: track.album, imageUrl: track.imageUrl, durationMs: track.durationMs })
    if (!result) throw new Error('Could not resolve Spotify audio.')
    return result
  }, [])
  const spotifyLibraryId = useCallback((track: SpotifyPlaylistTrack) => `spotify-local:${track.uri.replace(/^spotify:track:/, '')}`, [])
  const addSpotifyTrackToLibrary = useCallback(async (track: SpotifyPlaylistTrack) => {
    try {
      if (library.songs.some((song) => song.sourceUrl === track.uri)) {
        showToast(`${track.title} is already in your library.`, 'info')
        return
      }
      await window.electronApi?.addOnlineSongToLibrary({ id: spotifyLibraryId(track), title: track.title, artist: track.artist, album: track.album, genre: '', year: '', file: track.uri, sourceUrl: track.uri, cover: resolveSpotifyImageUrl(track.imageUrl), rpcCoverUrl: track.imageUrl, duration: track.durationMs / 1000 })
      await refreshLibrary()
      showToast(`${track.title} added to library.`)
    } catch {
      showToast(`Could not add ${track.title} to library.`, 'info')
    }
  }, [library.songs, refreshLibrary, showToast, spotifyLibraryId])
  const addSpotifyTrackToPlaylist = useCallback(async (track: SpotifyPlaylistTrack, playlistId: string) => {
    try {
      const existing = library.songs.find((song) => song.sourceUrl === track.uri)
      if (existing) await window.electronApi?.addSongToPlaylist(playlistId, existing.id)
      else {
        await window.electronApi?.addOnlineSongToPlaylist(playlistId, { id: spotifyLibraryId(track), title: track.title, artist: track.artist, album: track.album, genre: '', year: '', file: track.uri, sourceUrl: track.uri, cover: resolveSpotifyImageUrl(track.imageUrl), rpcCoverUrl: track.imageUrl, duration: track.durationMs / 1000 })
      }
      await refreshLibrary()
      showToast(`${track.title} added to playlist.`)
    } catch {
      showToast(`Could not add ${track.title} to playlist.`, 'info')
    }
  }, [library.songs, refreshLibrary, showToast, spotifyLibraryId])
  const downloadSpotifyTrack = useCallback(async (track: SpotifyPlaylistTrack) => {
    const existing = library.songs.find((song) => song.sourceUrl === track.uri)
    if (existing) {
      openDownloadOnlineSong(existing)
      return
    }
    try {
      showToast(`Preparing ${track.title}...`, 'info')
      const resolved = await resolveSpotifyTrackForLibrary(track)
      setDownloadingDiscoverySong({ id: spotifyLibraryId(track), onlineId: track.uri, title: track.title, artist: track.artist, album: track.album, genre: '', year: '', file: resolved.audioUrl, cover: track.imageUrl, lyrics: '', lyricsOffset: 0, featured: false, listenCount: 0, duration: resolved.duration || track.durationMs / 1000 })
      setModal('download-discovery')
    } catch {
      showToast(`Could not prepare ${track.title} for download.`, 'info')
    }
  }, [library.songs, openDownloadOnlineSong, resolveSpotifyTrackForLibrary, showToast, spotifyLibraryId])

  return <div className="app-shell">{settings.debuggerEnabled && settings.customCss.trim() && <style>{settings.customCss}</style>}
    {(!playerStateReady || debugLoadingScreen) && <div className={`startup-loading-screen ${debugLoadingScreen === 'error' ? 'error' : ''}`}>
      <div className="startup-loading-logo-wrap">
        <img src="./logo.jpg" alt="Hoshino" />
      </div>
      <strong>{debugLoadingScreen === 'error' ? 'Something went wrong' : 'Hoshino'}</strong>
      <span>{debugLoadingScreen === 'error' ? 'Could not prepare your music.' : 'Loading your music...'}</span>
    </div>}
    <div className={`app-frame ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${queueSidebarOpen ? 'queue-open' : ''}`}>
    <WindowBar />
    <Sidebar playlists={library.playlists} folders={library.playlistFolders} spotifyPlaylists={spotifySidebarPlaylists} activeSpotifyPlaylistUri={activeView === 'spotify-discovery' ? selectedSpotifySidebarPlaylist?.uri ?? null : null} activeView={activeView} activePlaylistId={activePlaylistId} extendedLibraryEnabled={settings.extendedLibraryEnabled} likedSongsCount={likedSongs.length} onSelectLibrary={selectLibrary} onSelectLiked={() => { setActiveView('liked'); setActivePlaylistId(null) }} onSelectRecentlyPlayed={() => { setActiveView('recently-played'); setActivePlaylistId(null) }} onSelectRecentlyAdded={() => { setActiveView('recently-added'); setActivePlaylistId(null) }} onSelectHoshinoDiscovery={chooseHoshinoDiscovery} onSelectSpotifyDiscovery={() => void chooseSpotifyDiscovery()} onSelectPlaylist={selectPlaylist} onSelectSpotifyPlaylist={selectSpotifySidebarPlaylist} onCreatePlaylist={() => setModal('playlist')} onEditPlaylist={openEditPlaylist} onDeletePlaylist={openDeletePlaylist} onEditFolder={openEditPlaylistFolder} onDeleteFolder={openDeletePlaylistFolder} onPlayPlaylist={playPlaylist} onMovePlaylistToFolder={movePlaylistToFolder} onOpenSettings={() => setModal('settings')} settingsOpen={modal === 'settings' || modal === 'tune-eq' || modal === 'general-settings' || modal === 'delete-all-songs' || modal === 'delete-all-playlists' || modal === 'debugger-settings' || modal === 'custom-css' || modal === 'user-settings' || modal === 'discord-settings' || modal === 'discord-v2-settings'} />
    {activeView === 'spotify-discovery'
      ? <SpotifyDiscovery selectedSidebarPlaylist={selectedSpotifySidebarPlaylist} spotifyPlaylistSort={settings.spotifyPlaylistSort} onSpotifyPlaylistSortChange={(sort) => updateSetting('spotifyPlaylistSort', sort)} onCloseSidebarPlaylist={() => setSelectedSpotifySidebarPlaylist(null)} songs={library.songs} playlists={library.playlists} importingIds={importingDiscoveryIds} importProgress={discoveryImportProgress} query={query} audioOutput={activeAudioOutput} userName={settings.clientUserName} userDescription={settings.clientUserDescription} userAvatarUrl={settings.clientUserAvatarUrl} sidebarCollapsed={sidebarCollapsed} searchInputRef={searchInputRef} onQueryChange={setQuery} onPlaySong={playLibrarySong} spotifyCurrentTrackId={playbackPlaylistId === SPOTIFY_PLAYLIST_ID ? currentSongId : null} spotifyLoadingTrackId={spotifyPlaybackLoadingId} spotifyIsPlaying={playbackPlaylistId === SPOTIFY_PLAYLIST_ID && isPlaying} onPlaySpotifyTrack={playSpotifyTrack} onSpotifyQueueChange={updateSpotifyPlaybackQueue} onAddSpotifyTrackToLibrary={(track) => void addSpotifyTrackToLibrary(track)} onAddSpotifyTrackToPlaylist={(track, playlistId) => void addSpotifyTrackToPlaylist(track, playlistId)} onDownloadSpotifyTrack={(track) => void downloadSpotifyTrack(track)} onToggleSpotifyFavorite={(track) => toggleFavorite(toSpotifyTrack(track))} onPlaySpotifyNext={settings.customQueueEnabled ? (track) => playNextInCustomQueue(toSpotifyTrack(track)) : undefined} onAddSpotifyToQueue={settings.customQueueEnabled ? (track) => addToCustomQueue(toSpotifyTrack(track)) : undefined} onSelectPlaylist={selectPlaylist} onOpenAudioOutputs={openAudioOutputModal} onOpenVersionNotice={openVersionNoticeModal} onOpenUserSettings={() => setModal('user-settings')} onLinkAccount={handleTopbarLinkAccount} onToggleSidebar={toggleSidebarCollapsed} />
      : activeView === 'discovery'
      ? <Discovery songs={discoveryTracks} playlists={library.playlists} discoverySongs={visibleDiscoverySongs} featuredSongs={featuredDiscoverySongs} mostListenedSongs={mostListenedDiscoverySongs} showMostListened={settings.forceMostListenedSection || discoveryListenTotal >= 100} currentSongId={visibleCurrentSongId} query={query} isPlaying={isPlaying} loading={discoveryLoading} error={discoveryError} importingIds={importingDiscoveryIds} importProgress={discoveryImportProgress} onlineAvailable={onlineAvailable} onQueryChange={setQuery} onPlaySong={playDiscoverySong} onSelectPlaylist={selectPlaylist} onTogglePlay={togglePlayState} onRefresh={refreshDiscoveryWithToast} onImportSong={addDiscoveryToLibrary} onDownloadSong={openDownloadDiscoverySong} onAddToPlaylist={addDiscoveryToPlaylistAction} favoriteSongIds={favoriteSongIds} onToggleFavorite={(song) => toggleFavorite(toDiscoveryTrack(song))} onPlayNext={settings.customQueueEnabled ? (song) => playNextInCustomQueue(toDiscoveryTrack(song)) : undefined} onAddToQueue={settings.customQueueEnabled ? (song) => addToCustomQueue(toDiscoveryTrack(song)) : undefined} sort={discoverySort} onSortChange={setDiscoverySort} qualityFilter={discoveryQualityFilter} onQualityFilterChange={setDiscoveryQualityFilter} audioOutput={activeAudioOutput} userName={settings.clientUserName} userDescription={settings.clientUserDescription} userAvatarUrl={settings.clientUserAvatarUrl} onOpenAudioOutputs={openAudioOutputModal} onOpenVersionNotice={openVersionNoticeModal} onOpenUserSettings={() => setModal('user-settings')} onLinkAccount={handleTopbarLinkAccount} sidebarCollapsed={sidebarCollapsed} onToggleSidebar={toggleSidebarCollapsed} searchInputRef={searchInputRef} />
      : activeView === 'liked' || activeView === 'recently-played' || activeView === 'recently-added'
      ? <SmartCollection kind={activeView} songs={activeView === 'liked' ? likedSongs : activeView === 'recently-played' ? recentlyPlayedSongs : recentlyAddedSongs} librarySongs={library.songs} playlists={library.playlists} currentSongId={visibleCurrentSongId} isPlaying={isPlaying} query={query} onlineAvailable={onlineAvailable} onQueryChange={setQuery} onPlaySong={(id) => playSmartCollectionSong(id, activeView)} onPlaySearchSong={playLibrarySong} onSelectPlaylist={selectPlaylist} onEditSong={openEditSong} onDeleteSong={openDeleteSong} onDownloadSong={openDownloadOnlineSong} onAddToPlaylist={addLibrarySongToPlaylistAction} onToggleFavorite={toggleFavorite} onPlayNext={settings.customQueueEnabled ? playNextInCustomQueue : undefined} onAddToQueue={settings.customQueueEnabled ? addToCustomQueue : undefined} audioOutput={activeAudioOutput} userName={settings.clientUserName} userDescription={settings.clientUserDescription} userAvatarUrl={settings.clientUserAvatarUrl} onOpenAudioOutputs={openAudioOutputModal} onOpenVersionNotice={openVersionNoticeModal} onOpenUserSettings={() => setModal('user-settings')} onLinkAccount={handleTopbarLinkAccount} sidebarCollapsed={sidebarCollapsed} onToggleSidebar={toggleSidebarCollapsed} searchInputRef={searchInputRef} />
      : activePlaylist
      ? <Playlist playlist={activePlaylist} playlists={library.playlists} songs={activeSongs} librarySongs={library.songs} query={query} currentSongId={visibleCurrentSongId} isPlaying={isPlaying} loading={libraryLoading} onQueryChange={setQuery} onPlaySong={playActivePlaylistSong} onPlayLibrarySong={playLibrarySong} onSelectPlaylist={selectPlaylist} onAddSong={openAddSongModal} onEditPlaylist={openActivePlaylistEditor} onDeletePlaylist={openActivePlaylistDelete} onRefresh={refreshLibraryWithToast} onEditSong={openEditSong} onDeleteSong={openDeleteSong} onDownloadSong={openDownloadOnlineSong} onToggleFavorite={toggleFavorite} onPlayNext={settings.customQueueEnabled ? playNextInCustomQueue : undefined} onAddToQueue={settings.customQueueEnabled ? addToCustomQueue : undefined} onlineAvailable={onlineAvailable} onRemoveSong={removeSongFromActivePlaylist} onEmptyPlayAll={showEmptyPlaylistToast} sort={playlistSort} onSortChange={setPlaylistSort} onReorderSongs={reorderActivePlaylistSongs} audioOutput={activeAudioOutput} userName={settings.clientUserName} userDescription={settings.clientUserDescription} userAvatarUrl={settings.clientUserAvatarUrl} onOpenAudioOutputs={openAudioOutputModal} onOpenVersionNotice={openVersionNoticeModal} onOpenUserSettings={() => setModal('user-settings')} onLinkAccount={handleTopbarLinkAccount} sidebarCollapsed={sidebarCollapsed} onToggleSidebar={toggleSidebarCollapsed} searchInputRef={searchInputRef} />
      : <MusicLibrary songs={activeSongs} playlists={library.playlists} mostListenedSongs={mostListenedLibrarySongs} showMostListened={settings.forceMostListenedSection || libraryListenTotal >= 100} currentSongId={visibleCurrentSongId} query={query} isPlaying={isPlaying} loading={libraryLoading} onQueryChange={setQuery} onPlaySong={playLibrarySong} onSelectPlaylist={selectPlaylist} onImport={openImportModal} onExploreDiscovery={chooseHoshinoDiscovery} onRefresh={refreshLibraryWithToast} onEditSong={openEditSong} onDeleteSong={openDeleteSong} onDownloadSong={openDownloadOnlineSong} onAddToPlaylist={addLibrarySongToPlaylistAction} onToggleFavorite={toggleFavorite} onPlayNext={settings.customQueueEnabled ? playNextInCustomQueue : undefined} onAddToQueue={settings.customQueueEnabled ? addToCustomQueue : undefined} onlineAvailable={onlineAvailable} sort={librarySort} onSortChange={setLibrarySort} audioOutput={activeAudioOutput} userName={settings.clientUserName} userDescription={settings.clientUserDescription} userAvatarUrl={settings.clientUserAvatarUrl} onOpenAudioOutputs={openAudioOutputModal} onOpenVersionNotice={openVersionNoticeModal} onOpenUserSettings={() => setModal('user-settings')} onLinkAccount={handleTopbarLinkAccount} sidebarCollapsed={sidebarCollapsed} onToggleSidebar={toggleSidebarCollapsed} searchInputRef={searchInputRef} />}
    <NowPlaying song={currentSong} isPlaying={isPlaying} shuffleEnabled={shuffleEnabled} repeatEnabled={repeatEnabled} currentTime={currentTime} duration={duration} volume={volume} lyricsOpen={lyricsPanelOpen && Boolean(currentSongWithLyrics)} lyricsAvailable={lyricsAvailable} onToggleLyrics={() => setLyricsPanelOpen((open) => !open)} onOpenFullscreen={() => setFullscreenPlayerOpen(true)} onOpenMiniPlayer={openMiniPlayer} queueOpen={queueSidebarOpen} loading={Boolean(currentSongId && spotifyPlaybackLoadingId === currentSongId)} onToggleQueue={toggleQueueSidebar} onToggleFavorite={toggleFavorite} onToggleShuffle={toggleShuffle} onToggleRepeat={toggleRepeat} onTogglePlay={togglePlayState} onPrevious={playPreviousSong} onNext={playNextSong} onSeek={seekSong} onSeekStart={startSeekingSong} onVolumeChange={setVolume} onToggleMute={toggleMute} />
    {lyricsPanelOpen && currentSongWithLyrics && lyricsAvailable && <LyricsPanel key={currentSongWithLyrics.id} song={currentSongWithLyrics} currentTime={currentTime} lyricsDelay={settings.lyricsDelay + (currentSongWithLyrics.lyricsDelay ?? 0)} onClose={() => setLyricsPanelOpen(false)} />}
    {fullscreenPlayerOpen && currentSong && <FullscreenPlayer song={currentSong} layout={settings.fullscreenPlayerLayout} isPlaying={isPlaying} shuffleEnabled={shuffleEnabled} repeatEnabled={repeatEnabled} currentTime={currentTime} duration={duration} volume={volume} onClose={() => setFullscreenPlayerOpen(false)} onToggleShuffle={toggleShuffle} onToggleRepeat={toggleRepeat} onTogglePlay={togglePlayState} onPrevious={playPreviousSong} onNext={playNextSong} onSeek={seekSong} onVolumeChange={setVolume} onToggleMute={toggleMute} />}
    <Suspense fallback={null}>
      {modal === 'import' && <ImportMusicModal onClose={() => setModal(null)} onSubmit={importMusic} onBulkSubmit={importMusicBatch} />}
      {modal === 'spotify-link' && <SpotifyLinkModal onLink={startSpotifyLogin} onClose={() => setModal(null)} />}
      {modal === 'version-notice' && <VersionNoticeModal version={appVersion || 'current'} onClose={() => void dismissVersionNotice()} />}
      {modal === 'update-available' && <UpdateAvailableModal currentVersion={appVersion || 'current'} latestVersion={latestAppVersion} onDownload={downloadUpdate} onClose={() => void dismissUpdateNotice()} />}
      {modal === 'playlist' && <CreatePlaylistModal onClose={() => setModal(null)} onSubmit={createPlaylist} onCreateFolder={createPlaylistFolder} />}
      {modal === 'save-queue-playlist' && <SaveQueuePlaylistModal defaultName={`Queue ${new Date().toLocaleDateString()}`} onClose={() => setModal(null)} onSubmit={confirmSaveCustomQueueAsPlaylist} />}
      {modal === 'edit-playlist' && editingPlaylist && <EditPlaylistModal playlist={editingPlaylist} onClose={() => { setModal(null); setEditingPlaylist(null) }} onSubmit={editPlaylist} />}
      {modal === 'delete-playlist' && deletingPlaylist && <DeletePlaylistModal playlist={deletingPlaylist} onClose={() => { setModal(null); setDeletingPlaylist(null) }} onConfirm={deletePlaylist} />}
      {modal === 'edit-folder' && editingFolder && <EditPlaylistFolderModal folder={editingFolder} onClose={() => { setModal(null); setEditingFolder(null) }} onSubmit={editPlaylistFolder} />}
      {modal === 'delete-folder' && deletingFolder && <DeletePlaylistFolderModal folder={deletingFolder} playlistCount={library.playlists.filter((playlist) => playlist.folderId === deletingFolder.id).length} onClose={() => { setModal(null); setDeletingFolder(null) }} onConfirm={deletePlaylistFolder} />}
      {modal === 'add-song' && activePlaylist && <AddSongModal songs={library.songs} playlist={activePlaylist} onClose={() => setModal(null)} onSubmit={addSong} />}
      {modal === 'edit-song' && editingSong && <EditMusicModal song={editingSong} onClose={() => { setModal(null); setEditingSong(null) }} onSubmit={editSong} />}
      {modal === 'delete-song' && deletingSong && <DeleteSongModal song={deletingSong} onClose={() => { setModal(null); setDeletingSong(null) }} onConfirm={deleteSong} />}
      {modal === 'settings' && <SettingsModal {...settings} onPlayInBackgroundChange={(value) => updateToggle('playInBackground', value, 'Play in background')} onMinimizeToTrayChange={(value) => updateToggle('minimizeToTray', value, 'Minimize to tray')} onStartWithWindowsChange={(value) => updateToggle('startWithWindows', value, 'Start with Windows')} onFullscreenPlayerLayoutChange={(value) => updateSetting('fullscreenPlayerLayout', value)} onShowSpotifyPlaylistsInSidebarChange={(value) => updateSetting('showSpotifyPlaylistsInSidebar', value)} onExtendedLibraryEnabledChange={(value) => updateSetting('extendedLibraryEnabled', value)} onOpenResetSettings={() => setModal('reset-settings')} onOpenDeleteAllSongs={() => setModal('delete-all-songs')} onOpenDeleteAllPlaylists={() => setModal('delete-all-playlists')} onRestartApp={restartApp} onOpenTuneEqSettings={() => setModal('tune-eq')} onOpenGeneralSettings={() => setModal('general-settings')} onOpenDebuggerSettings={() => setModal('debugger-settings')} onOpenCustomCssSettings={() => setModal('custom-css')} onOpenDiscordSettings={() => setModal('discord-settings')} onOpenDiscordV2Settings={() => setModal('discord-v2-settings')} onClose={() => setModal(null)} />}
      {modal === 'reset-settings' && <ResetSettingsModal onConfirm={resetSettings} onClose={() => setModal('settings')} />}
      {modal === 'delete-all-songs' && <DeleteAllSongsModal songCount={library.songs.length} onConfirm={deleteAllSongs} onClose={() => setModal('settings')} />}
      {modal === 'delete-all-playlists' && <DeleteAllPlaylistsModal playlistCount={library.playlists.length} onConfirm={deleteAllPlaylists} onClose={() => setModal('settings')} />}
      {modal === 'tune-eq' && <TuneEqModal tuneEqEnabled={settings.tuneEqEnabled} tuneEqAutoSave={settings.tuneEqAutoSave} tuneEqBandCount={settings.tuneEqBandCount} tuneEqFrequencies={settings.tuneEqFrequencies} tuneEqQValues={settings.tuneEqQValues} tuneEqGains={settings.tuneEqGains} tuneEqBandSettings={settings.tuneEqBandSettings} onChange={updateTuneEq} onSave={saveTuneEq} onInvalidFrequency={() => showToast('Frequency must be between 20 Hz and 20,000 Hz.', 'info')} onInvalidQ={() => showToast('Q must be between 0.1 and 18.', 'info')} onClose={() => setModal('settings')} />}
      {modal === 'general-settings' && <GeneralSettingsModal lyricsDelay={settings.lyricsDelay} audioSpeed={settings.audioSpeed} audioPitchEnabled={settings.audioPitchEnabled} crossFadeEnabled={settings.crossFadeEnabled} crossFadeDuration={settings.crossFadeDuration} customQueueEnabled={settings.customQueueEnabled} audioOutput={activeAudioOutput} onLyricsDelayChange={(value) => updateSetting('lyricsDelay', normalizeLyricsDelay(value))} onAudioSpeedChange={(value) => updateSetting('audioSpeed', normalizeAudioSpeed(value))} onAudioPitchEnabledChange={(value) => updateSetting('audioPitchEnabled', value)} onCrossFadeEnabledChange={(value) => updateSetting('crossFadeEnabled', value)} onCrossFadeDurationChange={(value) => updateSetting('crossFadeDuration', normalizeCrossFadeDuration(value))} onCustomQueueEnabledChange={(value) => updateSetting('customQueueEnabled', value)} onOpenAudioOutputs={openAudioOutputModal} onClose={() => setModal('settings')} />}
      {modal === 'debugger-settings' && <DebuggerSettingsModal debuggerEnabled={settings.debuggerEnabled} forceMostListenedSection={settings.forceMostListenedSection} cookies={debuggerCookies} onDebuggerEnabledChange={(value) => updateSetting('debuggerEnabled', value)} onForceMostListenedSectionChange={(value) => updateSetting('forceMostListenedSection', value)} onResetMusicState={resetMusicState} onResetSpotifyState={resetSpotifyState} onOpenDevTools={openDevTools} onOpenDebuggerBrowser={openDebuggerBrowser} onRefreshCookies={refreshDebuggerCookies} onStartLoadingScreen={() => startDebugLoadingScreen('loading')} onStartLoadingErrorScreen={() => startDebugLoadingScreen('error')} onClose={() => setModal('settings')} />}
      {modal === 'custom-css' && <CustomCssModal debuggerEnabled={settings.debuggerEnabled} customCss={settings.customCss} onSave={saveCustomCss} onClose={() => setModal('settings')} />}
      {modal === 'user-settings' && <UserSettingsModal userName={settings.clientUserName} userDescription={settings.clientUserDescription} userAvatarUrl={settings.clientUserAvatarUrl} onSyncSpotify={syncSpotifyAccount} onSave={saveClientUserProfile} onClose={() => setModal(null)} />}
      {modal === 'discord-settings' && <DiscordSettingsModal {...settings} onDiscordRpcEnabledChange={updateDiscordLegacyEnabled} onDiscordKeepRichPresenceChange={(value) => updateToggle('discordKeepRichPresence', value, 'Keep Rich Presence')} onSave={saveDiscordInputs} onClose={() => setModal('settings')} />}
      {modal === 'discord-v2-settings' && <DiscordV2SettingsModal {...settings} onDiscordRpcV2EnabledChange={updateDiscordV2Enabled} onDiscordRpcV2KeepRichPresenceChange={(value) => updateSetting('discordRpcV2KeepRichPresence', value)} onLogin={loginDiscordV2} onSave={saveDiscordV2Inputs} onClose={() => setModal('settings')} />}
      {modal === 'audio-output' && <AudioOutputModal outputs={audioOutputs} activeOutput={activeAudioOutput} onSelect={selectAudioOutput} onClose={() => setModal(null)} />}
      {modal === 'download-discovery' && downloadingDiscoverySong && <DownloadDiscoverySongModal song={downloadingDiscoverySong} onConfirm={confirmDownloadDiscoverySong} onClose={() => { setModal(null); setDownloadingDiscoverySong(null) }} />}
      {modal === 'download-online' && downloadingOnlineSong && <DownloadOnlineSongModal song={downloadingOnlineSong} progress={discoveryImportProgress[downloadingOnlineSong.id]} status={onlineDownloadStatus[downloadingOnlineSong.id] ?? 'idle'} onConfirm={() => void downloadOnlineSong(downloadingOnlineSong)} onClose={closeDownloadOnlineSong} />}
    </Suspense>
    <Toasts items={toasts} onDismiss={dismissToast} />
    {queueSidebarOpen && <>
      <button type="button" className="queue-backdrop" aria-label="Close queue" onClick={() => setQueueSidebarOpen(false)} />
      <QueueSidebar enabled={settings.customQueueEnabled} currentSong={currentSong} defaultQueue={playbackQueue} shuffleEnabled={shuffleEnabled} repeatEnabled={repeatEnabled} wrapAround={playbackPlaylistId !== SPOTIFY_PLAYLIST_ID} nextUp={customQueueNextUp} later={customQueueLater} onPlayDefaultSong={(song) => playSong(song.id, playbackPlaylistId)} onPlaySong={(section, song) => { removeFromCustomQueue(section, song.id); playSong(song.id, null) }} onRemove={removeFromCustomQueue} onReorder={reorderCustomQueue} onClear={clearCustomQueue} onSave={saveCustomQueueAsPlaylist} onClose={() => setQueueSidebarOpen(false)} />
    </>}
  </div></div>
}

export default App
