import { Check, ChevronDown, Clock3, Download, Heart, ListEnd, ListPlus, Pause, Play, RefreshCw, Wifi } from 'lucide-react'
import { memo, useEffect, useId, useMemo, useState, type RefObject } from 'react'
import type { AudioOutputDevice } from '../audio-device'
import type { DiscoverySong, MusicTrack, PlaylistRecord } from '../types'
import { isFlacUrl, isHiResFlac, readAudioMetadataCache, readFlacMetadata, type DiscoveryAudioMetadata } from '../discovery-audio-metadata'
import { useOnlineAudioDuration } from '../online-duration'
import { SearchBar } from './SearchBar'
import { TrackCover } from './TrackCover'
import { formatTime, SongListSkeleton } from './SongList'
import { ContextMenu } from './ContextMenu'
import { Pagination } from './Pagination'
import { DROPDOWN_OPEN_EVENT, SortControl, type SortOption } from './SortControl'
import { TopbarActions } from './TopbarActions'

const PAGE_SIZE = 20
export type DiscoveryQualityFilter = 'all' | 'hq' | 'hires'

const QUALITY_OPTIONS: Array<{ value: DiscoveryQualityFilter, label: string }> = [
  { value: 'all', label: 'All quality' },
  { value: 'hq', label: 'HQ (41 kHz/16-bit)' },
  { value: 'hires', label: 'Hi-Res (96 kHz/24-bit)' },
]

type DiscoveryProps = {
  songs: MusicTrack[]
  playlists: PlaylistRecord[]
  discoverySongs: DiscoverySong[]
  featuredSongs: DiscoverySong[]
  mostListenedSongs: DiscoverySong[]
  showMostListened: boolean
  currentSongId: string | null
  query: string
  isPlaying: boolean
  loading: boolean
  error: string
  importingIds: string[]
  importProgress: Record<string, number | null>
  onlineAvailable: boolean
  onQueryChange: (query: string) => void
  onPlaySong: (id: string) => void
  onSelectPlaylist: (id: string) => void
  onTogglePlay: () => void
  onRefresh: () => void
  onImportSong: (song: DiscoverySong) => void
  onDownloadSong: (song: DiscoverySong) => void
  onAddToPlaylist: (song: DiscoverySong, playlistId: string) => void
  favoriteSongIds: string[]
  onToggleFavorite: (song: DiscoverySong) => void
  onPlayNext?: (song: DiscoverySong) => void
  onAddToQueue?: (song: DiscoverySong) => void
  sort: SortOption
  onSortChange: (sort: SortOption) => void
  qualityFilter: DiscoveryQualityFilter
  onQualityFilterChange: (filter: DiscoveryQualityFilter) => void
  audioOutput: AudioOutputDevice | null
  userName: string
  userDescription: string
  userAvatarUrl: string
  onOpenAudioOutputs: () => void
  onOpenVersionNotice: () => void
  onOpenUserSettings: () => void
  onLinkAccount: () => void
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
  searchInputRef: RefObject<HTMLInputElement>
}

export const Discovery = memo(function Discovery({ songs, playlists, discoverySongs, featuredSongs, mostListenedSongs, showMostListened, currentSongId, query, isPlaying, loading, error, importingIds, importProgress, onlineAvailable, onQueryChange, onPlaySong, onSelectPlaylist, onTogglePlay, onRefresh, onImportSong, onDownloadSong, onAddToPlaylist, favoriteSongIds, onToggleFavorite, onPlayNext, onAddToQueue, sort, onSortChange, qualityFilter, onQualityFilterChange, audioOutput, userName, userDescription, userAvatarUrl, onOpenAudioOutputs, onOpenVersionNotice, onOpenUserSettings, onLinkAccount, sidebarCollapsed, onToggleSidebar, searchInputRef }: DiscoveryProps) {
  const [page, setPage] = useState(1)
  const [featuredPage, setFeaturedPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(discoverySongs.length / PAGE_SIZE))
  const pageStart = (page - 1) * PAGE_SIZE
  const pagedDiscoverySongs = useMemo(() => discoverySongs.slice(pageStart, pageStart + PAGE_SIZE), [discoverySongs, pageStart])
  const featuredTotalPages = Math.max(1, Math.ceil(featuredSongs.length / PAGE_SIZE))
  const featuredPageStart = (featuredPage - 1) * PAGE_SIZE
  const pagedFeaturedSongs = useMemo(() => featuredSongs.slice(featuredPageStart, featuredPageStart + PAGE_SIZE), [featuredPageStart, featuredSongs])

  useEffect(() => {
    setPage(1)
  }, [qualityFilter, sort])

  useEffect(() => {
    setFeaturedPage(1)
  }, [qualityFilter])

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages))
  }, [totalPages])

  useEffect(() => {
    setFeaturedPage((current) => Math.min(current, featuredTotalPages))
  }, [featuredTotalPages])

  return (
    <main className="library discovery-view">
      <header className="topbar">
        <SearchBar ref={searchInputRef} query={query} songs={songs} playlists={playlists} onQueryChange={onQueryChange} onPlaySong={onPlaySong} onSelectPlaylist={onSelectPlaylist} collapsed={sidebarCollapsed} onToggle={onToggleSidebar} />
        <TopbarActions audioOutput={audioOutput} userName={userName} userDescription={userDescription} userAvatarUrl={userAvatarUrl} onOpenAudioOutputs={onOpenAudioOutputs} onOpenVersionNotice={onOpenVersionNotice} onOpenUserSettings={onOpenUserSettings} onLinkAccount={onLinkAccount} />
      </header>

      <section className="hero discovery-hero">
        <div>
          <span className="eyebrow">Hoshino online</span>
          <h1>Discovery</h1>
          <p>Stream songs from Hoshino Music, then download the ones you want to keep locally.</p>
          <div className="hero-meta"><span>{discoverySongs.length} online tracks</span><i /><span>Streaming ready</span></div>
        </div>
        <button className="hero-play" onClick={onRefresh} disabled={loading}><RefreshCw size={20} /> {loading ? 'Refreshing' : 'Refresh'}</button>
        <div className="hero-art"><Wifi size={56} /></div>
      </section>

      {!error && !loading && featuredSongs.length > 0 && <section className="featured-section">
        <div className="section-title">
          <div><span className="eyebrow">Editor picks</span><h2>Featured songs</h2></div>
        </div>
        <FeaturedSongList songs={songs} playlists={playlists} discoverySongs={pagedFeaturedSongs} pageStart={featuredPageStart} currentSongId={currentSongId} isPlaying={isPlaying} importingIds={importingIds} importProgress={importProgress} onlineAvailable={onlineAvailable} onPlaySong={onPlaySong} onTogglePlay={onTogglePlay} onImportSong={onImportSong} onDownloadSong={onDownloadSong} onAddToPlaylist={onAddToPlaylist} favoriteSongIds={favoriteSongIds} onToggleFavorite={onToggleFavorite} onPlayNext={onPlayNext} onAddToQueue={onAddToQueue} />
        <Pagination page={featuredPage} totalItems={featuredSongs.length} pageSize={PAGE_SIZE} onPageChange={setFeaturedPage} />
      </section>}

      {!error && !loading && showMostListened && mostListenedSongs.length > 0 && <section className="song-section most-listened-section">
        <div className="section-title">
          <div><span className="eyebrow">Your repeats</span><h2>Most listened</h2></div>
        </div>
        <DiscoverySongList songs={songs} playlists={playlists} discoverySongs={mostListenedSongs} pageStart={0} currentSongId={currentSongId} isPlaying={isPlaying} importingIds={importingIds} importProgress={importProgress} onlineAvailable={onlineAvailable} onPlaySong={onPlaySong} onImportSong={onImportSong} onDownloadSong={onDownloadSong} onAddToPlaylist={onAddToPlaylist} favoriteSongIds={favoriteSongIds} onToggleFavorite={onToggleFavorite} onPlayNext={onPlayNext} onAddToQueue={onAddToQueue} />
      </section>}

      <section className="song-section">
        <div className="section-title">
          <div><span className="eyebrow">Online catalog</span><h2>Available songs</h2></div>
          <div className="section-actions"><button className="refresh-button" onClick={onRefresh} disabled={loading}><RefreshCw size={15} /> Refresh</button><QualityFilterControl value={qualityFilter} onChange={onQualityFilterChange} /><SortControl value={sort} onChange={onSortChange} /></div>
        </div>
        {error && <div className="empty-state discovery-error">{error}</div>}
        {!error && loading && <SongListSkeleton />}
        {!error && !loading && !discoverySongs.length && <div className="empty-state">No online songs are available yet.</div>}
        {!error && !loading && discoverySongs.length > 0 && <>
          <DiscoverySongList songs={songs} playlists={playlists} discoverySongs={pagedDiscoverySongs} pageStart={pageStart} currentSongId={currentSongId} isPlaying={isPlaying} importingIds={importingIds} importProgress={importProgress} onlineAvailable={onlineAvailable} onPlaySong={onPlaySong} onImportSong={onImportSong} onDownloadSong={onDownloadSong} onAddToPlaylist={onAddToPlaylist} favoriteSongIds={favoriteSongIds} onToggleFavorite={onToggleFavorite} onPlayNext={onPlayNext} onAddToQueue={onAddToQueue} />
          <Pagination page={page} totalItems={discoverySongs.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </>}
      </section>
    </main>
  )
})

const FeaturedSongList = memo(function FeaturedSongList({ songs, playlists, discoverySongs, pageStart, currentSongId, isPlaying, importingIds, importProgress, onlineAvailable, onPlaySong, onTogglePlay, onImportSong, onDownloadSong, onAddToPlaylist, favoriteSongIds, onToggleFavorite, onPlayNext, onAddToQueue }: Pick<DiscoveryProps, 'songs' | 'playlists' | 'discoverySongs' | 'currentSongId' | 'isPlaying' | 'importingIds' | 'importProgress' | 'onlineAvailable' | 'onPlaySong' | 'onTogglePlay' | 'onImportSong' | 'onDownloadSong' | 'onAddToPlaylist' | 'favoriteSongIds' | 'onToggleFavorite' | 'onPlayNext' | 'onAddToQueue'> & { pageStart: number }) {
  const songsById = useMemo(() => new Map(songs.map((song) => [song.id, song])), [songs])
  const [contextMenu, setContextMenu] = useState<{ song: DiscoverySong, x: number, y: number } | null>(null)

  return <div className="featured-song-list">
    {discoverySongs.map((song, index) => {
      const track = songsById.get(song.id)
      const active = song.id === currentSongId
      const importing = importingIds.includes(song.id)
      const progress = importProgress[song.id]
      const progressLabel = typeof progress === 'number' ? `${Math.round(progress * 100)}%` : 'Downloading...'
      return <div className={`featured-song-item ${active ? 'active' : ''} ${!onlineAvailable ? 'disabled' : ''}`} key={song.id} role="button" tabIndex={0} aria-disabled={!onlineAvailable} onClick={() => { if (onlineAvailable) onPlaySong(song.id) }} onContextMenu={(event) => { event.preventDefault(); if (onlineAvailable) setContextMenu({ song, x: event.clientX, y: event.clientY }) }} onKeyDown={(event) => { if (onlineAvailable && event.key === 'Enter') onPlaySong(song.id) }}>
        <span className="featured-song-index">{active && isPlaying ? <span className="playing-bars"><i /><i /><i /></span> : pageStart + index + 1}</span>
        <TrackCover song={track ?? null} className="featured-song-cover" />
        <span className="featured-song-copy">
          <strong><span>{song.title}</span><DiscoveryQualityBadges file={song.file} /></strong>
          <small>{importing ? progressLabel : `${song.artist || 'Unknown artist'}${song.album ? ` - ${song.album}` : ''}`}</small>
          {importing && <span className={`discovery-progress ${typeof progress === 'number' ? '' : 'indeterminate'}`}><i style={typeof progress === 'number' ? { width: `${Math.round(progress * 100)}%` } : undefined} /></span>}
        </span>
        <DiscoveryDuration file={song.file} duration={track?.duration} />
        <span className="featured-song-actions" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="discovery-play-button" aria-label={`${active && isPlaying ? 'Pause' : 'Play'} ${song.title}`} disabled={!onlineAvailable} onClick={() => active ? onTogglePlay() : onPlaySong(song.id)}>
            {active && isPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
          </button>
        </span>
      </div>
    })}
    {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} items={[
      { label: contextMenu.song.id === currentSongId && isPlaying ? 'Pause song' : 'Play song', icon: contextMenu.song.id === currentSongId && isPlaying ? <Pause size={15} /> : <Play size={15} />, onSelect: () => contextMenu.song.id === currentSongId ? onTogglePlay() : onPlaySong(contextMenu.song.id) },
      { label: favoriteSongIds.includes(contextMenu.song.id) ? 'Remove from Liked songs' : 'Add to Liked songs', icon: <Heart size={15} fill={favoriteSongIds.includes(contextMenu.song.id) ? 'currentColor' : 'none'} />, onSelect: () => onToggleFavorite(contextMenu.song) },
      ...(onPlayNext ? [{ label: 'Play next', icon: <ListEnd size={15} />, onSelect: () => onPlayNext(contextMenu.song) }] : []),
      ...(onAddToQueue ? [{ label: 'Add to queue', icon: <ListPlus size={15} />, onSelect: () => onAddToQueue(contextMenu.song) }] : []),
      { label: 'Add to library', icon: <ListPlus size={15} />, onSelect: () => onImportSong(contextMenu.song) },
      { label: 'Add to playlist', icon: <ListPlus size={15} />, children: playlists.filter((playlist) => !playlist.songIds.includes(contextMenu.song.id)).map((playlist) => ({ label: playlist.name, icon: <ListPlus size={15} />, onSelect: () => onAddToPlaylist(contextMenu.song, playlist.id) })) },
      { label: 'Download and import', icon: <Download size={15} />, onSelect: () => onDownloadSong(contextMenu.song) },
    ]} />}
  </div>
})

const DiscoverySongList = memo(function DiscoverySongList({ songs, playlists, discoverySongs, pageStart, currentSongId, isPlaying, importingIds, importProgress, onlineAvailable, onPlaySong, onImportSong, onDownloadSong, onAddToPlaylist, favoriteSongIds, onToggleFavorite, onPlayNext, onAddToQueue }: Pick<DiscoveryProps, 'songs' | 'playlists' | 'discoverySongs' | 'currentSongId' | 'isPlaying' | 'importingIds' | 'importProgress' | 'onlineAvailable' | 'onPlaySong' | 'onImportSong' | 'onDownloadSong' | 'onAddToPlaylist' | 'favoriteSongIds' | 'onToggleFavorite' | 'onPlayNext' | 'onAddToQueue'> & { pageStart: number }) {
  const songsById = useMemo(() => new Map(songs.map((song) => [song.id, song])), [songs])
  const [contextMenu, setContextMenu] = useState<{ song: DiscoverySong, x: number, y: number } | null>(null)

  return (
    <div className="song-table discovery-table">
      <div className="song-row song-header">
        <span>#</span><span>Title</span><span>Album</span><span><Clock3 size={15} /></span><span />
      </div>
      {discoverySongs.map((song, index) => {
        const track = songsById.get(song.id)
        const active = song.id === currentSongId
        const importing = importingIds.includes(song.id)
        const progress = importProgress[song.id]
        const progressLabel = typeof progress === 'number' ? `${Math.round(progress * 100)}%` : 'Downloading...'
        return (
          <div className={`song-row ${active ? 'active' : ''} ${!onlineAvailable ? 'disabled' : ''}`} key={song.id} role="button" tabIndex={0} aria-disabled={!onlineAvailable} onClick={() => { if (onlineAvailable) onPlaySong(song.id) }} onContextMenu={(event) => { event.preventDefault(); if (onlineAvailable) setContextMenu({ song, x: event.clientX, y: event.clientY }) }} onKeyDown={(event) => { if (onlineAvailable && event.key === 'Enter') onPlaySong(song.id) }}>
            <span className="song-index">{active && isPlaying ? <span className="playing-bars"><i /><i /><i /></span> : pageStart + index + 1}</span>
            <span className="song-info">
              <TrackCover song={track ?? null} />
              <span className="discovery-song-copy">
                <strong><span>{song.title}</span><DiscoveryQualityBadges file={song.file} /></strong>
                <small>{importing ? progressLabel : song.artist || 'Unknown artist'}</small>
                {importing && <span className={`discovery-progress ${typeof progress === 'number' ? '' : 'indeterminate'}`}><i style={typeof progress === 'number' ? { width: `${Math.round(progress * 100)}%` } : undefined} /></span>}
              </span>
            </span>
            <span className="album-name">{song.album || song.title}</span>
            <DiscoveryDuration file={song.file} duration={track?.duration} />
            <span />
          </div>
        )
      })}
      {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} items={[
        { label: 'Play song', icon: <Play size={15} />, onSelect: () => onPlaySong(contextMenu.song.id) },
        { label: favoriteSongIds.includes(contextMenu.song.id) ? 'Remove from Liked songs' : 'Add to Liked songs', icon: <Heart size={15} fill={favoriteSongIds.includes(contextMenu.song.id) ? 'currentColor' : 'none'} />, onSelect: () => onToggleFavorite(contextMenu.song) },
        ...(onPlayNext ? [{ label: 'Play next', icon: <ListEnd size={15} />, onSelect: () => onPlayNext(contextMenu.song) }] : []),
        ...(onAddToQueue ? [{ label: 'Add to queue', icon: <ListPlus size={15} />, onSelect: () => onAddToQueue(contextMenu.song) }] : []),
        { label: 'Add to library', icon: <ListPlus size={15} />, onSelect: () => onImportSong(contextMenu.song) },
        { label: 'Add to playlist', icon: <ListPlus size={15} />, children: playlists.filter((playlist) => !playlist.songIds.includes(contextMenu.song.id)).map((playlist) => ({ label: playlist.name, icon: <ListPlus size={15} />, onSelect: () => onAddToPlaylist(contextMenu.song, playlist.id) })) },
        { label: 'Download and import', icon: <Download size={15} />, onSelect: () => onDownloadSong(contextMenu.song) },
      ]} />}
    </div>
  )
})

function QualityFilterControl({ value, onChange }: { value: DiscoveryQualityFilter, onChange: (value: DiscoveryQualityFilter) => void }) {
  const [open, setOpen] = useState(false)
  const dropdownId = useId()
  const active = QUALITY_OPTIONS.find((option) => option.value === value) ?? QUALITY_OPTIONS[0]

  useEffect(() => {
    const handleDropdownOpen = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== dropdownId) setOpen(false)
    }
    window.addEventListener(DROPDOWN_OPEN_EVENT, handleDropdownOpen)
    return () => window.removeEventListener(DROPDOWN_OPEN_EVENT, handleDropdownOpen)
  }, [dropdownId])

  return <div className="sort-control quality-filter-control">
    <button onClick={() => setOpen((current) => {
      const nextOpen = !current
      if (nextOpen) window.dispatchEvent(new CustomEvent(DROPDOWN_OPEN_EVENT, { detail: dropdownId }))
      return nextOpen
    })}>{active.label} <ChevronDown size={15} /></button>
    {open && <div className="sort-menu">{QUALITY_OPTIONS.map((option) => (
      <button key={option.value} onClick={() => { onChange(option.value); setOpen(false) }}>
        {option.label}{option.value === value && <Check size={14} />}
      </button>
    ))}</div>}
  </div>
}

function DiscoveryQualityBadges({ file }: { file: string }) {
  const [metadata, setMetadata] = useState<DiscoveryAudioMetadata | null>(() => readAudioMetadataCache()[file] ?? null)
  const flac = isFlacUrl(file)

  useEffect(() => {
    if (!flac) {
      setMetadata(null)
      return
    }
    let cancelled = false
    readFlacMetadata(file)
      .then((nextMetadata) => {
        if (!cancelled) setMetadata(nextMetadata)
      })
      .catch(() => {
        if (!cancelled) setMetadata(null)
      })
    return () => {
      cancelled = true
    }
  }, [file, flac])

  if (!flac) return null
  return <>
    <i className="discovery-quality-badge">HQ</i>
    {isHiResFlac(metadata) && <i className="discovery-quality-badge discovery-quality-badge-hires">Hi-Res</i>}
  </>
}

function DiscoveryDuration({ file, duration }: { file: string, duration?: number }) {
  const cachedDuration = useOnlineAudioDuration(file, duration)

  return <span className="song-duration">{cachedDuration && cachedDuration > 0 ? formatTime(cachedDuration) : '--:--'}</span>
}
