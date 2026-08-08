import { forwardRef, memo, useCallback, useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react'
import { ArrowLeft, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3, Download, Heart, ListEnd, ListPlus, Pause, Play, RefreshCw, Search } from 'lucide-react'
import { FaSpotify } from 'react-icons/fa'
import type { AudioOutputDevice } from '../audio-device'
import type { MusicTrack, PlaylistRecord, SpotifyHome, SpotifyHomeCard, SpotifyHomeSection, SpotifyPlaylistTrack } from '../types'
import { SidebarToggle } from './SidebarToggle'
import { TopbarActions } from './TopbarActions'
import { resolveSpotifyImageUrl } from '../spotify-image'
import { DROPDOWN_OPEN_EVENT } from './SortControl'
import { ContextMenu } from './ContextMenu'

type SpotifySortOption = 'title' | 'duration' | 'oldest' | 'newest'

type SpotifyDiscoveryProps = {
  selectedSidebarPlaylist: SpotifyHomeCard | null
  spotifyPlaylistSort: SpotifySortOption
  onSpotifyPlaylistSortChange: (sort: SpotifySortOption) => void
  onCloseSidebarPlaylist: () => void
  songs: MusicTrack[]
  playlists: PlaylistRecord[]
  query: string
  audioOutput: AudioOutputDevice | null
  userName: string
  userDescription: string
  userAvatarUrl: string
  sidebarCollapsed: boolean
  searchInputRef: RefObject<HTMLInputElement>
  onQueryChange: (query: string) => void
  onPlaySong: (id: string) => void
  spotifyCurrentTrackId: string | null
  spotifyLoadingTrackId: string | null
  spotifyIsPlaying: boolean
  onPlaySpotifyTrack: (track: SpotifyPlaylistTrack, queue: SpotifyPlaylistTrack[], hasMore?: boolean) => Promise<void>
  onSpotifyQueueChange: (queue: SpotifyPlaylistTrack[], hasMore: boolean) => void
  onAddSpotifyTrackToLibrary: (track: SpotifyPlaylistTrack) => void
  onAddSpotifyTrackToPlaylist: (track: SpotifyPlaylistTrack, playlistId: string) => void
  onDownloadSpotifyTrack: (track: SpotifyPlaylistTrack) => void
  onToggleSpotifyFavorite: (track: SpotifyPlaylistTrack) => void
  onPlaySpotifyNext?: (track: SpotifyPlaylistTrack) => void
  onAddSpotifyToQueue?: (track: SpotifyPlaylistTrack) => void
  importingIds: string[]
  importProgress: Record<string, number | null>
  onSelectPlaylist: (id: string) => void
  onOpenAudioOutputs: () => void
  onOpenVersionNotice: () => void
  onOpenUserSettings: () => void
  onLinkAccount: () => void
  onToggleSidebar: () => void
}

export const SpotifyDiscovery = memo(function SpotifyDiscovery({ selectedSidebarPlaylist, spotifyPlaylistSort, onSpotifyPlaylistSortChange, onCloseSidebarPlaylist, songs, playlists, importingIds, importProgress, audioOutput, userName, userDescription, userAvatarUrl, sidebarCollapsed, searchInputRef, spotifyCurrentTrackId, spotifyLoadingTrackId, spotifyIsPlaying, onPlaySpotifyTrack, onSpotifyQueueChange, onAddSpotifyTrackToLibrary, onAddSpotifyTrackToPlaylist, onDownloadSpotifyTrack, onToggleSpotifyFavorite, onPlaySpotifyNext, onAddSpotifyToQueue, onOpenAudioOutputs, onOpenVersionNotice, onOpenUserSettings, onLinkAccount, onToggleSidebar }: SpotifyDiscoveryProps) {
  const [home, setHome] = useState<SpotifyHome | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null)
  const [selectedPlaylist, setSelectedPlaylist] = useState<SpotifyHomeCard | null>(null)
  const [spotifySearchQuery, setSpotifySearchQuery] = useState('')
  const [submittedSearchQuery, setSubmittedSearchQuery] = useState('')

  useEffect(() => {
    setSelectedPlaylist(selectedSidebarPlaylist)
    if (!selectedSidebarPlaylist) return
    setSelectedSectionId(null)
    setSubmittedSearchQuery('')
    setSpotifySearchQuery('')
  }, [selectedSidebarPlaylist])

  const loadHome = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await window.electronApi?.getSpotifyHome()
      if (!result) throw new Error('Spotify Home is unavailable in this build.')
      setHome(result)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load your Spotify Home feed.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadHome() }, [loadHome])

  const selectedSection = home?.sections.find((section) => section.id === selectedSectionId) ?? null
  const searchKeyword = submittedSearchQuery.trim()
  const changeSearchQuery = (value: string) => {
    setSpotifySearchQuery(value)
    if (!value.trim()) setSubmittedSearchQuery('')
    setSelectedPlaylist(null)
    setSelectedSectionId(null)
  }
  const submitSearchQuery = () => {
    const keyword = spotifySearchQuery.trim()
    if (!keyword) return
    setSpotifySearchQuery(keyword)
    setSubmittedSearchQuery(keyword)
    setSelectedPlaylist(null)
    setSelectedSectionId(null)
  }

  return <main className="library spotify-discovery-view">
    <header className="topbar">
      <SpotifySearchBar ref={searchInputRef} value={spotifySearchQuery} collapsed={sidebarCollapsed} currentTrackId={spotifyCurrentTrackId} onChange={changeSearchQuery} onSubmit={submitSearchQuery} onOpenPlaylist={setSelectedPlaylist} onPlayTrack={onPlaySpotifyTrack} onToggleSidebar={onToggleSidebar} />
      <TopbarActions audioOutput={audioOutput} userName={userName} userDescription={userDescription} userAvatarUrl={userAvatarUrl} onOpenAudioOutputs={onOpenAudioOutputs} onOpenVersionNotice={onOpenVersionNotice} onOpenUserSettings={onOpenUserSettings} onLinkAccount={onLinkAccount} />
    </header>

    {selectedPlaylist
      ? <SpotifyPlaylistView card={selectedPlaylist} sort={spotifyPlaylistSort} onSortChange={onSpotifyPlaylistSortChange} songs={songs} playlists={playlists} importingIds={importingIds} importProgress={importProgress} onBack={() => { setSelectedPlaylist(null); onCloseSidebarPlaylist() }} currentTrackId={spotifyCurrentTrackId} loadingTrackId={spotifyLoadingTrackId} isPlaying={spotifyIsPlaying} onPlayTrack={onPlaySpotifyTrack} onQueueChange={onSpotifyQueueChange} onAddToLibrary={onAddSpotifyTrackToLibrary} onAddToPlaylist={onAddSpotifyTrackToPlaylist} onDownload={onDownloadSpotifyTrack} onToggleFavorite={onToggleSpotifyFavorite} onPlayNext={onPlaySpotifyNext} onAddToQueue={onAddSpotifyToQueue} />
      : searchKeyword ? <SpotifySearchResults query={searchKeyword} songs={songs} playlists={playlists} onOpenPlaylist={setSelectedPlaylist} currentTrackId={spotifyCurrentTrackId} loadingTrackId={spotifyLoadingTrackId} isPlaying={spotifyIsPlaying} onPlayTrack={onPlaySpotifyTrack} onAddToLibrary={onAddSpotifyTrackToLibrary} onAddToPlaylist={onAddSpotifyTrackToPlaylist} onDownload={onDownloadSpotifyTrack} onToggleFavorite={onToggleSpotifyFavorite} onPlayNext={onPlaySpotifyNext} onAddToQueue={onAddSpotifyToQueue} />
      : selectedSection ? <SpotifySectionPage section={selectedSection} onBack={() => setSelectedSectionId(null)} onOpenPlaylist={setSelectedPlaylist} /> : <><section className="hero spotify-discovery-hero">
      <div>
        <span className="eyebrow">Spotify connected</span>
        <h1>{home?.greeting || 'Spotify Discovery'}</h1>
        <p>Your personal mixes, fresh releases and recommendations from Spotify, all in one place.</p>
        <div className="hero-meta"><span>Personalized for you</span><i /><span>Updated from Spotify</span></div>
      </div>
      <div className="hero-art"><FaSpotify size={56} /></div>
    </section>

    <div className="spotify-home-content" aria-live="polite">
      <div className="spotify-home-heading">
        <div><span className="eyebrow">Listen next</span><h2>Your Spotify Home</h2></div>
        <button type="button" className="spotify-refresh-button" disabled={loading} onClick={() => void loadHome()}><RefreshCw size={15} className={loading ? 'spinning' : ''} /> Refresh</button>
      </div>

      {loading && !home && <SpotifyHomeSkeleton />}
      {error && <div className="spotify-home-error"><FaSpotify size={28} /><strong>Couldn’t load Spotify Home</strong><span>{error}</span><button type="button" onClick={() => void loadHome()}>Try again</button></div>}
      {!error && home?.sections.map((section, index, sections) => {
        const firstJumpBackIn = /^jump\s+back\s+in$/i.test(section.title)
          && sections.findIndex((candidate) => /^jump\s+back\s+in$/i.test(candidate.title)) === index
        return <SpotifySection key={section.id} section={section} firstJumpBackIn={firstJumpBackIn} onShowAll={() => setSelectedSectionId(section.id)} onOpenPlaylist={setSelectedPlaylist} />
      })}
    </div>
    </>}
  </main>
})

type SpotifySearchBarProps = {
  value: string
  collapsed: boolean
  onChange: (value: string) => void
  onSubmit: () => void
  onOpenPlaylist: (card: SpotifyHomeCard) => void
  currentTrackId: string | null
  onPlayTrack: (track: SpotifyPlaylistTrack, queue: SpotifyPlaylistTrack[]) => Promise<void>
  onToggleSidebar: () => void
}

const SpotifySearchBar = memo(forwardRef<HTMLInputElement, SpotifySearchBarProps>(function SpotifySearchBar({ value, collapsed, currentTrackId, onChange, onSubmit, onOpenPlaylist, onPlayTrack, onToggleSidebar }, ref) {
  const [items, setItems] = useState<SpotifyHomeCard[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const keyword = value.trim()
  const showPreview = Boolean(keyword) && previewOpen

  useEffect(() => {
    if (!previewOpen) return
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setPreviewOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick)
  }, [previewOpen])

  useEffect(() => {
    let cancelled = false
    setItems([])
    setError('')
    if (!showPreview) {
      setLoading(false)
      return
    }
    setLoading(true)
    const timer = window.setTimeout(() => {
      void window.electronApi?.searchSpotify(keyword, 0, 30).then((page) => {
        if (!cancelled) setItems(page?.items ?? [])
      }).catch((requestError: unknown) => {
        if (!cancelled) setError(requestError instanceof Error ? requestError.message : 'Could not preview Spotify results.')
      }).finally(() => {
        if (!cancelled) setLoading(false)
      })
    }, 260)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [keyword, showPreview])

  const openPreview = (card: SpotifyHomeCard) => {
    setPreviewOpen(false)
    if (card.type === 'Track') {
      const trackQueue = tracks.filter((item) => item.playable !== false).map(cardAsTrack)
      if (!currentTrackId) void onPlayTrack(cardAsTrack(card), trackQueue)
      if (card.albumUri && /^spotify:album:[a-zA-Z0-9]+$/.test(card.albumUri)) {
        onOpenPlaylist({ ...card, id: card.albumUri, uri: card.albumUri, title: card.albumTitle || card.title, type: 'Album' })
      } else {
        onSubmit()
      }
    } else if (/^spotify:(playlist|album):[a-zA-Z0-9]+$/.test(card.uri)) onOpenPlaylist(card)
    else if (/^spotify:(artist|episode|show|track):[a-zA-Z0-9]+$/.test(card.uri)) void window.electronApi?.openSpotifyUri(card.uri)
  }
  const playlists = items.filter((item) => item.type === 'Playlist').slice(0, 3)
  const tracks = items.filter((item) => item.type === 'Track').slice(0, 4)
  const artists = items.filter((item) => item.type === 'Artist').slice(0, 3)

  return <div className="search-wrapper spotify-search-wrapper" ref={wrapperRef}>
    <SidebarToggle collapsed={collapsed} onToggle={onToggleSidebar} />
    <label className="search-box"><Search size={18} /><input ref={ref} value={value} onFocus={() => { if (keyword) setPreviewOpen(true) }} onClick={() => { if (keyword) setPreviewOpen(true) }} onChange={(event) => { setPreviewOpen(Boolean(event.target.value.trim())); onChange(event.target.value) }} onKeyDown={(event) => {
      if (event.key === 'Enter') { setPreviewOpen(false); onSubmit() }
      if (event.key === 'Escape') { setPreviewOpen(false); onChange('') }
    }} placeholder="Search Spotify…" /></label>
    {showPreview && <div className="search-tooltip spotify-search-preview">
      {loading && <SpotifyPreviewSkeleton />}
      {!loading && <>
        <SpotifyPreviewGroup title="Playlists" items={playlists} onOpen={openPreview} />
        <SpotifyPreviewGroup title="Songs" items={tracks} onOpen={openPreview} />
        <SpotifyPreviewGroup title="Artists" items={artists} onOpen={openPreview} />
        {!error && !playlists.length && !tracks.length && !artists.length && <p>No matching Spotify results.</p>}
      </>}
      {error && <p>{error}</p>}
      <button type="button" className="spotify-preview-all" onClick={() => { setPreviewOpen(false); onSubmit() }}><Search size={14} /> See all results for “{keyword}”</button>
    </div>}
  </div>
}))

function SpotifyPreviewGroup({ title, items, onOpen }: { title: string, items: SpotifyHomeCard[], onOpen: (card: SpotifyHomeCard) => void }) {
  if (!items.length) return null
  return <><span className="search-result-heading">{title}</span>{items.map((item) => <button type="button" key={item.id} onClick={() => onOpen(item)}>
    <span className="spotify-preview-cover">{item.imageUrl ? <img src={resolveSpotifyImageUrl(item.imageUrl)} alt="" /> : <FaSpotify size={16} />}</span>
    <span><strong>{item.title}</strong><small>{item.subtitle || item.type}</small></span>
  </button>)}</>
}

function SpotifyPreviewSkeleton() {
  return <div className="spotify-preview-skeleton" aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <div key={index}><i className="song-skeleton song-skeleton-cover" /><span><i className="song-skeleton song-skeleton-title" /><i className="song-skeleton song-skeleton-artist" /></span></div>)}</div>
}

function SpotifySearchResults({ query, songs, playlists, onOpenPlaylist, currentTrackId, loadingTrackId, isPlaying, onPlayTrack, onAddToLibrary, onAddToPlaylist, onDownload, onToggleFavorite, onPlayNext, onAddToQueue }: { query: string, songs: MusicTrack[], playlists: PlaylistRecord[], onOpenPlaylist: (card: SpotifyHomeCard) => void, currentTrackId: string | null, loadingTrackId: string | null, isPlaying: boolean, onPlayTrack: (track: SpotifyPlaylistTrack, queue: SpotifyPlaylistTrack[]) => Promise<void>, onAddToLibrary: (track: SpotifyPlaylistTrack) => void, onAddToPlaylist: (track: SpotifyPlaylistTrack, playlistId: string) => void, onDownload: (track: SpotifyPlaylistTrack) => void, onToggleFavorite: (track: SpotifyPlaylistTrack) => void, onPlayNext?: (track: SpotifyPlaylistTrack) => void, onAddToQueue?: (track: SpotifyPlaylistTrack) => void }) {
  const [items, setItems] = useState<SpotifyHomeCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [contextMenu, setContextMenu] = useState<{ track: SpotifyPlaylistTrack, x: number, y: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    setItems([])
    setLoading(true)
    setError('')
    void window.electronApi?.searchSpotifyResults(query).then((page) => {
      if (!cancelled) setItems(page?.items.slice(0, 50) ?? [])
    }).catch((requestError: unknown) => {
      if (!cancelled) setError(requestError instanceof Error ? requestError.message : 'Could not search Spotify.')
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [query, reload])

  const topResult = items[0]
  const trackQueue = items.filter((item) => item.type === 'Track' && item.playable !== false).map(cardAsTrack)
  const resultGroups = [
    { title: 'Tracks', type: 'Track' },
    { title: 'Artists', type: 'Artist' },
    { title: 'Albums', type: 'Album' },
    { title: 'Playlists', type: 'Playlist' },
  ].map((group) => ({ ...group, items: items.slice(1).filter((item) => item.type === group.type) }))
  return <div className="spotify-search-page" aria-live="polite">
    <div className="spotify-search-heading"><span className="eyebrow">Spotify search</span><h1>Results for “{query}”</h1><p>{items.length ? `${items.length} results` : 'Searching albums, playlists, tracks and artists'}</p></div>
    {loading && <div className="spotify-search-result-list"><SpotifySearchResultSkeletonRows count={8} /></div>}
    {!loading && topResult && <SpotifyTopResult card={topResult} queue={trackQueue} currentTrackId={currentTrackId} loadingTrackId={loadingTrackId} isPlaying={isPlaying} onOpenPlaylist={onOpenPlaylist} onPlayTrack={onPlayTrack} onTrackContextMenu={(event, track) => { event.preventDefault(); setContextMenu({ track, x: event.clientX, y: event.clientY }) }} />}
    {!loading && resultGroups.map((group) => group.items.length > 0 && <section className="spotify-search-result-group" key={group.type}><h2>{group.title}</h2><div className="spotify-search-result-list">{group.items.map((card) => <SpotifySearchResultRow key={card.id} card={card} queue={trackQueue} currentTrackId={currentTrackId} loadingTrackId={loadingTrackId} isPlaying={isPlaying} onOpenPlaylist={onOpenPlaylist} onPlayTrack={onPlayTrack} onTrackContextMenu={(event, track) => { event.preventDefault(); setContextMenu({ track, x: event.clientX, y: event.clientY }) }} />)}</div></section>)}
    {!loading && !error && !items.length && <div className="empty-state">No Spotify results found for “{query}”.</div>}
    {error && <div className="spotify-playlist-error"><span>{error}</span><button type="button" onClick={() => setReload((current) => current + 1)}>Try again</button></div>}
    {contextMenu && <SpotifyTrackContextMenu track={contextMenu.track} songs={songs} playlists={playlists} x={contextMenu.x} y={contextMenu.y} onPlay={() => void onPlayTrack(contextMenu.track, trackQueue)} onAddToLibrary={onAddToLibrary} onAddToPlaylist={onAddToPlaylist} onDownload={onDownload} onToggleFavorite={onToggleFavorite} onPlayNext={onPlayNext} onAddToQueue={onAddToQueue} onClose={() => setContextMenu(null)} />}
  </div>
}

function openSpotifySearchResult(card: SpotifyHomeCard, onOpenPlaylist: (card: SpotifyHomeCard) => void) {
  if (/^spotify:(playlist|album):[a-zA-Z0-9]+$/.test(card.uri)) onOpenPlaylist(card)
  else if (/^spotify:(artist|episode|show|track):[a-zA-Z0-9]+$/.test(card.uri)) void window.electronApi?.openSpotifyUri(card.uri)
}

function cardAsTrack(card: SpotifyHomeCard): SpotifyPlaylistTrack {
  return { id: card.id, uri: card.uri, title: card.title, artist: card.subtitle, album: card.albumTitle ?? '', imageUrl: card.imageUrl, durationMs: card.durationMs ?? 0, playable: card.playable !== false, position: 0 }
}

function SpotifyTopResult({ card, queue, currentTrackId, loadingTrackId, isPlaying, onOpenPlaylist, onPlayTrack, onTrackContextMenu }: { card: SpotifyHomeCard, queue: SpotifyPlaylistTrack[], currentTrackId: string | null, loadingTrackId: string | null, isPlaying: boolean, onOpenPlaylist: (card: SpotifyHomeCard) => void, onPlayTrack: (track: SpotifyPlaylistTrack, queue: SpotifyPlaylistTrack[]) => Promise<void>, onTrackContextMenu: (event: React.MouseEvent, track: SpotifyPlaylistTrack) => void }) {
  const showPlay = card.type === 'Track' || card.type === 'Playlist' || card.type === 'Album' || card.type === 'Artist'
  const playDisabled = card.type === 'Artist' || card.playable === false
  return <section className="spotify-search-top-result">
    <span className="eyebrow">Top result</span>
    <div className={`spotify-top-result-row ${currentTrackId === `spotify:${card.id}` ? 'playing' : ''} ${loadingTrackId === `spotify:${card.id}` ? 'loading' : ''}`} onContextMenu={card.type === 'Track' ? (event) => onTrackContextMenu(event, cardAsTrack(card)) : undefined}>
      <button type="button" className="spotify-top-result-main" onClick={() => card.type === 'Track' ? void onPlayTrack(cardAsTrack(card), queue) : openSpotifySearchResult(card, onOpenPlaylist)}>
        <span className="spotify-top-result-cover">{card.imageUrl ? <img src={resolveSpotifyImageUrl(card.imageUrl)} alt="" /> : <FaSpotify size={28} />}</span>
        <span className="spotify-top-result-copy"><strong>{card.title}</strong><small>{card.type} · {card.subtitle || 'Spotify'}</small></span>
      </button>
      {showPlay && <button type="button" className="spotify-top-result-play" disabled={playDisabled} aria-label={playDisabled ? `Playback unavailable for ${card.title}` : currentTrackId === `spotify:${card.id}` && isPlaying ? `Pause ${card.title}` : `Play ${card.title}`} onClick={() => card.type === 'Track' ? void onPlayTrack(cardAsTrack(card), queue) : openSpotifySearchResult(card, onOpenPlaylist)}>{currentTrackId === `spotify:${card.id}` && isPlaying ? <Pause size={21} fill="currentColor" /> : <Play size={21} fill="currentColor" />}</button>}
    </div>
  </section>
}

function SpotifySearchResultRow({ card, queue, currentTrackId, loadingTrackId, isPlaying, onOpenPlaylist, onPlayTrack, onTrackContextMenu }: { card: SpotifyHomeCard, queue: SpotifyPlaylistTrack[], currentTrackId: string | null, loadingTrackId: string | null, isPlaying: boolean, onOpenPlaylist: (card: SpotifyHomeCard) => void, onPlayTrack: (track: SpotifyPlaylistTrack, queue: SpotifyPlaylistTrack[]) => Promise<void>, onTrackContextMenu: (event: React.MouseEvent, track: SpotifyPlaylistTrack) => void }) {
  const showPlay = card.type === 'Track' || card.type === 'Playlist' || card.type === 'Album' || card.type === 'Artist'
  const playDisabled = card.type === 'Artist' || card.playable === false
  const duration = card.type === 'Track' ? formatDuration(card.durationMs ?? 0) : ''
  return <div className={`spotify-search-result-row ${currentTrackId === `spotify:${card.id}` ? 'playing' : ''} ${loadingTrackId === `spotify:${card.id}` ? 'loading' : ''}`} onContextMenu={card.type === 'Track' ? (event) => onTrackContextMenu(event, cardAsTrack(card)) : undefined}>
    <button type="button" className="spotify-search-result-main" onClick={() => card.type === 'Track' ? void onPlayTrack(cardAsTrack(card), queue) : openSpotifySearchResult(card, onOpenPlaylist)}>
      <span className="spotify-search-result-cover">{card.imageUrl ? <img src={resolveSpotifyImageUrl(card.imageUrl)} alt="" loading="lazy" /> : <FaSpotify size={20} />}</span>
      <span className="spotify-search-result-copy"><span className="spotify-search-result-title"><strong>{card.title}</strong><i>{card.type}</i></span><small>{card.subtitle || card.type}</small></span>
    </button>
    <span className="spotify-search-result-duration">{duration}</span>
    {showPlay && <button type="button" className="spotify-search-result-play" disabled={playDisabled} aria-label={playDisabled ? `Playback unavailable for ${card.title}` : currentTrackId === `spotify:${card.id}` && isPlaying ? `Pause ${card.title}` : `Play ${card.title}`} onClick={() => card.type === 'Track' ? void onPlayTrack(cardAsTrack(card), queue) : openSpotifySearchResult(card, onOpenPlaylist)}>{currentTrackId === `spotify:${card.id}` && isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}</button>}
  </div>
}

function SpotifySearchResultSkeletonRows({ count }: { count: number }) {
  return <>{Array.from({ length: count }, (_, index) => <div className="spotify-search-result-row spotify-search-result-skeleton" key={`spotify-search-result-skeleton-${index}`}>
    <span className="song-skeleton song-skeleton-cover" />
    <span className="song-skeleton-copy"><span className="song-skeleton song-skeleton-title" /><span className="song-skeleton song-skeleton-artist" /></span>
    <span className="song-skeleton spotify-search-type-skeleton" />
  </div>)}</>
}

function SpotifySection({ section, firstJumpBackIn, onShowAll, onOpenPlaylist }: { section: SpotifyHomeSection, firstJumpBackIn: boolean, onShowAll: () => void, onOpenPlaylist: (card: SpotifyHomeCard) => void }) {
  const cards = section.cards.slice(0, 10)
  return <section className={`spotify-home-section ${firstJumpBackIn ? 'spotify-first-jump-section' : ''}`}>
    {!firstJumpBackIn && <div className="spotify-section-header"><h3>{section.title}</h3><button type="button" aria-label={`Show all from ${section.title}`} onClick={onShowAll}>Show all</button></div>}
    {firstJumpBackIn
      ? <div className="spotify-card-row">{cards.map((card) => <SpotifyCard key={card.id} card={card} onOpenPlaylist={onOpenPlaylist} />)}</div>
      : <SpotifyCarousel cards={cards} onOpenPlaylist={onOpenPlaylist} />}
  </section>
}

function SpotifyCarousel({ cards, onOpenPlaylist }: { cards: SpotifyHomeCard[], onOpenPlaylist: (card: SpotifyHomeCard) => void }) {
  const rowRef = useRef<HTMLDivElement>(null)
  const [canPrevious, setCanPrevious] = useState(false)
  const [canNext, setCanNext] = useState(false)

  const updateNavigation = useCallback(() => {
    const row = rowRef.current
    if (!row) return
    setCanPrevious(row.scrollLeft > 2)
    setCanNext(row.scrollLeft + row.clientWidth < row.scrollWidth - 2)
  }, [])

  useEffect(() => {
    const row = rowRef.current
    if (!row) return
    updateNavigation()
    row.addEventListener('scroll', updateNavigation, { passive: true })
    const observer = new ResizeObserver(updateNavigation)
    observer.observe(row)
    return () => {
      row.removeEventListener('scroll', updateNavigation)
      observer.disconnect()
    }
  }, [cards, updateNavigation])

  const move = (direction: -1 | 1) => {
    const row = rowRef.current
    if (!row) return
    row.scrollBy({ left: direction * Math.max(row.clientWidth * .82, 300), behavior: 'smooth' })
  }

  return <div className={`spotify-carousel ${canPrevious ? 'has-previous' : ''} ${canNext ? 'has-next' : ''}`}>
    {canPrevious && <button type="button" className="spotify-carousel-button previous" aria-label="Previous albums" onClick={() => move(-1)}><ChevronLeft size={19} /></button>}
    <div className="spotify-card-row" ref={rowRef}>
      {cards.map((card) => <SpotifyCard key={card.id} card={card} onOpenPlaylist={onOpenPlaylist} />)}
    </div>
    {canNext && <button type="button" className="spotify-carousel-button next" aria-label="Next albums" onClick={() => move(1)}><ChevronRight size={19} /></button>}
  </div>
}

function SpotifySectionPage({ section, onBack, onOpenPlaylist }: { section: SpotifyHomeSection, onBack: () => void, onOpenPlaylist: (card: SpotifyHomeCard) => void }) {
  return <div className="spotify-section-page">
    <button type="button" className="spotify-section-back" onClick={onBack}><ArrowLeft size={17} /> Spotify Home</button>
    <div className="spotify-section-page-heading">
      <span className="eyebrow">Spotify collection</span>
      <h1>{section.title}</h1>
      <p>{section.cards.length} {section.cards.length === 1 ? 'album' : 'albums'}</p>
    </div>
    <div className="spotify-section-page-grid">
      {section.cards.map((card) => <SpotifyCard key={card.id} card={card} onOpenPlaylist={onOpenPlaylist} />)}
    </div>
  </div>
}

function SpotifyCard({ card, onOpenPlaylist, allowExternal = false }: { card: SpotifyHomeCard, onOpenPlaylist: (card: SpotifyHomeCard) => void, allowExternal?: boolean }) {
  const collection = (card.type === 'Playlist' || card.type === 'Album') && /^spotify:(playlist|album):[a-zA-Z0-9]+$/.test(card.uri)
  const external = allowExternal && /^spotify:(artist|episode|show|track):[a-zA-Z0-9]+$/.test(card.uri)
  return <button type="button" className="spotify-home-card" title={collection || external ? `Open ${card.title}` : card.title} disabled={!collection && !external} onClick={(event) => {
    event.preventDefault()
    event.stopPropagation()
    if (collection) onOpenPlaylist(card)
    else if (external) void window.electronApi?.openSpotifyUri(card.uri)
  }}>
    <div className="spotify-card-cover">
      {card.imageUrl ? <img src={resolveSpotifyImageUrl(card.imageUrl)} alt="" loading="lazy" /> : <FaSpotify size={36} />}
    </div>
    <strong>{card.title}</strong>
    <span>{card.subtitle || card.type.replace(/([a-z])([A-Z])/g, '$1 $2')}</span>
  </button>
}

function SpotifyPlaylistView({ card, sort, onSortChange, songs, playlists, importingIds, importProgress, onBack, currentTrackId, loadingTrackId, isPlaying, onPlayTrack, onQueueChange, onAddToLibrary, onAddToPlaylist, onDownload, onToggleFavorite, onPlayNext, onAddToQueue }: { card: SpotifyHomeCard, sort: SpotifySortOption, onSortChange: (sort: SpotifySortOption) => void, songs: MusicTrack[], playlists: PlaylistRecord[], importingIds: string[], importProgress: Record<string, number | null>, onBack: () => void, currentTrackId: string | null, loadingTrackId: string | null, isPlaying: boolean, onPlayTrack: (track: SpotifyPlaylistTrack, queue: SpotifyPlaylistTrack[], hasMore?: boolean) => Promise<void>, onQueueChange: (queue: SpotifyPlaylistTrack[], hasMore: boolean) => void, onAddToLibrary: (track: SpotifyPlaylistTrack) => void, onAddToPlaylist: (track: SpotifyPlaylistTrack, playlistId: string) => void, onDownload: (track: SpotifyPlaylistTrack) => void, onToggleFavorite: (track: SpotifyPlaylistTrack) => void, onPlayNext?: (track: SpotifyPlaylistTrack) => void, onAddToQueue?: (track: SpotifyPlaylistTrack) => void }) {
  const [tracks, setTracks] = useState<SpotifyPlaylistTrack[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [nextOffset, setNextOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [contextMenu, setContextMenu] = useState<{ track: SpotifyPlaylistTrack, x: number, y: number } | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadingRef = useRef(false)
  const generationRef = useRef(0)
  const sortedTracks = useMemo(() => sortSpotifyTracks(tracks, sort), [sort, tracks])
  const playableQueue = useMemo(() => sortedTracks.filter((item) => item.playable), [sortedTracks])

  const loadPage = useCallback(async (offset: number, generation = generationRef.current) => {
    if (loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    setError('')
    try {
      const page = await window.electronApi?.getSpotifyPlaylist(card.uri, offset, 50)
      if (!page) throw new Error('Spotify playlist or album is unavailable in this build.')
      if (generation !== generationRef.current) return
      setTracks((current) => offset === 0 ? page.items : [...current, ...page.items])
      setTotalCount(page.totalCount)
      setNextOffset(page.offset + page.limit)
    } catch (requestError) {
      if (generation === generationRef.current) setError(requestError instanceof Error ? requestError.message : 'Could not load this Spotify collection.')
    } finally {
      if (generation === generationRef.current) {
        loadingRef.current = false
        setLoading(false)
      }
    }
  }, [card.uri])

  useEffect(() => {
    const generation = ++generationRef.current
    loadingRef.current = false
    setTracks([])
    setTotalCount(0)
    setNextOffset(0)
    void loadPage(0, generation)
    return () => {
      if (generationRef.current === generation) generationRef.current += 1
    }
  }, [card.uri, loadPage])

  const hasMore = nextOffset > 0 && nextOffset < totalCount
  const isSorting = sort !== 'oldest' && (hasMore || loading)

  useEffect(() => {
    if (isSorting || !currentTrackId || !playableQueue.some((track) => currentTrackId === `spotify:${track.id}`)) return
    onQueueChange(playableQueue, hasMore)
  }, [currentTrackId, hasMore, isSorting, onQueueChange, playableQueue])
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasMore) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadPage(nextOffset)
    }, { rootMargin: '280px 0px' })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loadPage, nextOffset])

  useEffect(() => {
    if (sort === 'oldest' || !hasMore || loading || error) return
    void loadPage(nextOffset)
  }, [error, hasMore, loadPage, loading, nextOffset, sort])

  useEffect(() => {
    if (!hasMore || loading || error || !currentTrackId) return
    const lastPlayableTrack = playableQueue[playableQueue.length - 1]
    if (lastPlayableTrack && currentTrackId === `spotify:${lastPlayableTrack.id}`) void loadPage(nextOffset)
  }, [currentTrackId, error, hasMore, loadPage, loading, nextOffset, playableQueue])

  return <div className="spotify-playlist-page">
    <button type="button" className="spotify-section-back" onClick={onBack}><ArrowLeft size={17} /> Back</button>
    <section className="hero playlist-hero spotify-playlist-hero">
      <div className={`playlist-cover playlist-hero-cover ${card.imageUrl ? 'playlist-cover-image' : ''}`}>{card.imageUrl ? <img src={resolveSpotifyImageUrl(card.imageUrl)} alt="" /> : <FaSpotify size={42} />}</div>
      <div className="playlist-hero-copy"><span className="eyebrow">Spotify {card.type.toLowerCase()}</span><h1>{card.title}</h1><p>{card.subtitle || 'By Spotify'}</p><div className="hero-meta"><span>{totalCount || '—'} tracks</span><i /><span>Spotify collection</span></div></div>
    </section>
    <div className="spotify-track-list">
      <div className="section-actions spotify-track-actions"><SpotifySortControl value={sort} onChange={onSortChange} /></div>
      <div className="song-table spotify-track-table">
        <div className="song-row song-header"><span>#</span><span>Title</span><span>Album</span><span><Clock3 size={15} /></span><span /></div>
        {!isSorting && sortedTracks.map((track, index) => <SpotifyTrackRow key={`${track.id}:${index}`} track={track} queue={playableQueue} current={currentTrackId === `spotify:${track.id}`} isPlaying={isPlaying} loading={loadingTrackId === `spotify:${track.id}`} importing={importingIds.includes(spotifyLocalTrackId(track))} importProgress={importProgress[spotifyLocalTrackId(track)]} index={index + 1} fallbackImageUrl={card.imageUrl} onPlay={(selectedTrack, queue) => onPlayTrack(selectedTrack, queue, hasMore)} onContextMenu={(event) => { event.preventDefault(); setContextMenu({ track, x: event.clientX, y: event.clientY }) }} />)}
        {(isSorting || loading) && <SpotifyTrackSkeletonRows rows={isSorting || !tracks.length ? 7 : 3} />}
      </div>
      {error && <div className="spotify-playlist-error"><span>{error}</span><button type="button" onClick={() => void loadPage(nextOffset || 0)}>Try again</button></div>}
      <div ref={sentinelRef} className="spotify-playlist-sentinel" aria-hidden="true" />
      {contextMenu && <SpotifyTrackContextMenu track={contextMenu.track} songs={songs} playlists={playlists} x={contextMenu.x} y={contextMenu.y} onPlay={() => void onPlayTrack(contextMenu.track, playableQueue, hasMore)} onAddToLibrary={onAddToLibrary} onAddToPlaylist={onAddToPlaylist} onDownload={onDownload} onToggleFavorite={onToggleFavorite} onPlayNext={onPlayNext} onAddToQueue={onAddToQueue} onClose={() => setContextMenu(null)} />}
    </div>
  </div>
}

const SPOTIFY_SORT_OPTIONS: Array<{ value: SpotifySortOption, label: string }> = [
  { value: 'title', label: 'Title A-Z' },
  { value: 'duration', label: 'Duration' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'newest', label: 'Newest' },
]

function SpotifySortControl({ value, onChange }: { value: SpotifySortOption, onChange: (value: SpotifySortOption) => void }) {
  const [open, setOpen] = useState(false)
  const dropdownId = useId()
  const active = SPOTIFY_SORT_OPTIONS.find((option) => option.value === value) ?? SPOTIFY_SORT_OPTIONS[0]
  useEffect(() => {
    const closeOtherDropdown = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== dropdownId) setOpen(false)
    }
    window.addEventListener(DROPDOWN_OPEN_EVENT, closeOtherDropdown)
    return () => window.removeEventListener(DROPDOWN_OPEN_EVENT, closeOtherDropdown)
  }, [dropdownId])
  return <div className="sort-control">
    <button type="button" onClick={() => setOpen((current) => {
      const next = !current
      if (next) window.dispatchEvent(new CustomEvent(DROPDOWN_OPEN_EVENT, { detail: dropdownId }))
      return next
    })}>{active.label} <ChevronDown size={15} /></button>
    {open && <div className="sort-menu">{SPOTIFY_SORT_OPTIONS.map((option) => <button type="button" key={option.value} onClick={() => { onChange(option.value); setOpen(false) }}>{option.label}{option.value === value && <Check size={14} />}</button>)}</div>}
  </div>
}

function sortSpotifyTracks(tracks: SpotifyPlaylistTrack[], sort: SpotifySortOption) {
  const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })
  return [...tracks].sort((left, right) => {
    if (sort === 'title') return collator.compare(left.title, right.title) || left.position - right.position
    if (sort === 'duration') return left.durationMs - right.durationMs || collator.compare(left.title, right.title) || left.position - right.position
    const leftDate = left.addedAt ? Date.parse(left.addedAt) : Number.NaN
    const rightDate = right.addedAt ? Date.parse(right.addedAt) : Number.NaN
    const leftHasDate = Number.isFinite(leftDate)
    const rightHasDate = Number.isFinite(rightDate)
    const chronological = leftHasDate && rightHasDate
      ? leftDate - rightDate
      : leftHasDate !== rightHasDate ? Number(rightHasDate) - Number(leftHasDate) : left.position - right.position
    return (sort === 'newest' ? -chronological : chronological) || left.position - right.position
  })
}

function spotifyLocalTrackId(track: SpotifyPlaylistTrack) { return `spotify-local:${track.uri.replace(/^spotify:track:/, '')}` }

function SpotifyTrackContextMenu({ track, songs, playlists, x, y, onPlay, onAddToLibrary, onAddToPlaylist, onDownload, onToggleFavorite, onPlayNext, onAddToQueue, onClose }: { track: SpotifyPlaylistTrack, songs: MusicTrack[], playlists: PlaylistRecord[], x: number, y: number, onPlay: () => void, onAddToLibrary: (track: SpotifyPlaylistTrack) => void, onAddToPlaylist: (track: SpotifyPlaylistTrack, playlistId: string) => void, onDownload: (track: SpotifyPlaylistTrack) => void, onToggleFavorite: (track: SpotifyPlaylistTrack) => void, onPlayNext?: (track: SpotifyPlaylistTrack) => void, onAddToQueue?: (track: SpotifyPlaylistTrack) => void, onClose: () => void }) {
  const availablePlaylists = playlists.filter((playlist) => !playlist.songIds.some((id) => songs.find((song) => song.id === id)?.sourceUrl === track.uri))
  const favorite = songs.some((song) => (song.id === `spotify:${track.id}` || song.sourceUrl === track.uri) && song.favorite)
  return <ContextMenu x={x} y={y} onClose={onClose} items={[
    { label: 'Play song', icon: <Play size={15} />, onSelect: onPlay },
    { label: favorite ? 'Remove from Liked songs' : 'Add to Liked songs', icon: <Heart size={15} fill={favorite ? 'currentColor' : 'none'} />, onSelect: () => onToggleFavorite(track) },
    ...(onPlayNext ? [{ label: 'Play next', icon: <ListEnd size={15} />, onSelect: () => onPlayNext(track) }] : []),
    ...(onAddToQueue ? [{ label: 'Add to queue', icon: <ListPlus size={15} />, onSelect: () => onAddToQueue(track) }] : []),
    ...(!songs.some((song) => song.sourceUrl === track.uri) ? [{ label: 'Add to library', icon: <ListPlus size={15} />, onSelect: () => onAddToLibrary(track) }] : []),
    ...(availablePlaylists.length ? [{ label: 'Add to playlist', icon: <ListPlus size={15} />, children: availablePlaylists.map((playlist) => ({ label: playlist.name, icon: <ListPlus size={15} />, onSelect: () => onAddToPlaylist(track, playlist.id) })) }] : []),
    { label: 'Download and import', icon: <Download size={15} />, onSelect: () => onDownload(track) },
  ]} />
}

function SpotifyTrackRow({ track, queue, current, isPlaying, loading, importing, importProgress, index, fallbackImageUrl, onPlay, onContextMenu }: { track: SpotifyPlaylistTrack, queue: SpotifyPlaylistTrack[], current: boolean, isPlaying: boolean, loading: boolean, importing: boolean, importProgress: number | null | undefined, index: number, fallbackImageUrl: string, onPlay: (track: SpotifyPlaylistTrack, queue: SpotifyPlaylistTrack[]) => Promise<void>, onContextMenu: (event: React.MouseEvent<HTMLButtonElement>) => void }) {
  const imageUrl = track.imageUrl || fallbackImageUrl
  const progressLabel = typeof importProgress === 'number' ? `${Math.round(importProgress * 100)}%` : 'Downloading...'
  return <button type="button" className={`song-row spotify-track-row ${track.playable ? '' : 'disabled'} ${current ? 'playing' : ''} ${loading ? 'loading' : ''}`} disabled={!track.playable} onClick={() => void onPlay(track, queue)} onContextMenu={onContextMenu}>
    <span className="song-index">{current && isPlaying ? <span className="playing-bars"><i /><i /><i /></span> : index}</span>
    <span className="song-info"><span className="cover cover-image">{imageUrl ? <img src={resolveSpotifyImageUrl(imageUrl)} alt="" loading="lazy" /> : <FaSpotify size={18} />}</span><span className="discovery-song-copy"><strong>{track.title}</strong><small>{importing ? progressLabel : track.artist}</small>{importing && <span className={`discovery-progress ${typeof importProgress === 'number' ? '' : 'indeterminate'}`}><i style={typeof importProgress === 'number' ? { width: `${Math.round(importProgress * 100)}%` } : undefined} /></span>}</span></span>
    <span className="album-name">{track.album}</span>
    <span className="song-duration">{formatDuration(track.durationMs)}</span>
    <span />
  </button>
}

function SpotifyTrackSkeletonRows({ rows }: { rows: number }) {
  return <>{Array.from({ length: rows }, (_, index) => <div className="song-row song-skeleton-row" key={`spotify-track-skeleton-${index}`}>
    <span className="song-skeleton song-skeleton-index" />
    <span className="song-info"><span className="song-skeleton song-skeleton-cover" /><span className="song-skeleton-copy"><span className="song-skeleton song-skeleton-title" /><span className="song-skeleton song-skeleton-artist" /></span></span>
    <span className="song-skeleton song-skeleton-album" />
    <span className="song-skeleton song-skeleton-duration" />
    <span />
  </div>)}</>
}

function formatDuration(durationMs: number) {
  if (!durationMs) return '—'
  const seconds = Math.floor(durationMs / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function SpotifyHomeSkeleton() {
  return <div className="spotify-home-skeleton" aria-label="Loading Spotify Home">
    {[0, 1].map((section) => <section key={section}><i className="spotify-skeleton-title" /><div className="spotify-card-row">{[0, 1, 2, 3, 4].map((card) => <div className="spotify-home-card" key={card}><i className="spotify-skeleton-cover" /><i className="spotify-skeleton-line wide" /><i className="spotify-skeleton-line" /></div>)}</div></section>)}
  </div>
}
