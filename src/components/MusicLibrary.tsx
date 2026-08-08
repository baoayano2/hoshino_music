import { Compass, Import, RefreshCw } from 'lucide-react'
import { memo, useEffect, useMemo, useState, type RefObject } from 'react'
import type { MusicTrack, PlaylistRecord } from '../types'
import type { AudioOutputDevice } from '../audio-device'
import { Pagination } from './Pagination'
import { SearchBar } from './SearchBar'
import { SongList, SongListSkeleton } from './SongList'
import { SortControl, type SortOption } from './SortControl'
import { TopbarActions } from './TopbarActions'

const PAGE_SIZE = 20

type MusicLibraryProps = {
  songs: MusicTrack[]
  playlists: PlaylistRecord[]
  mostListenedSongs: MusicTrack[]
  showMostListened: boolean
  currentSongId: string | null
  query: string
  isPlaying: boolean
  loading: boolean
  onQueryChange: (query: string) => void
  onPlaySong: (id: string) => void
  onSelectPlaylist: (id: string) => void
  onImport: () => void
  onExploreDiscovery: () => void
  onRefresh: () => void
  onEditSong: (song: MusicTrack) => void
  onDeleteSong: (song: MusicTrack) => void
  onDownloadSong: (song: MusicTrack) => void
  onAddToPlaylist: (song: MusicTrack, playlistId: string) => void
  onToggleFavorite: (song: MusicTrack) => void
  onPlayNext?: (song: MusicTrack) => void
  onAddToQueue?: (song: MusicTrack) => void
  onlineAvailable: boolean
  sort: SortOption
  onSortChange: (sort: SortOption) => void
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

export const MusicLibrary = memo(function MusicLibrary({ songs, playlists, mostListenedSongs, showMostListened, currentSongId, query, isPlaying, loading, onQueryChange, onPlaySong, onSelectPlaylist, onImport, onExploreDiscovery, onRefresh, onEditSong, onDeleteSong, onDownloadSong, onAddToPlaylist, onToggleFavorite, onPlayNext, onAddToQueue, onlineAvailable, sort, onSortChange, audioOutput, userName, userDescription, userAvatarUrl, onOpenAudioOutputs, onOpenVersionNotice, onOpenUserSettings, onLinkAccount, sidebarCollapsed, onToggleSidebar, searchInputRef }: MusicLibraryProps) {
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(songs.length / PAGE_SIZE))
  const pagedSongs = useMemo(() => songs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [page, songs])

  useEffect(() => {
    setPage(1)
  }, [sort])

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages))
  }, [totalPages])

  return (
    <main className="library">
      <header className="topbar">
        {/* <SidebarToggle collapsed={sidebarCollapsed} onToggle={onToggleSidebar} /> */}
        <SearchBar ref={searchInputRef} query={query} songs={songs} playlists={playlists} onQueryChange={onQueryChange} onPlaySong={onPlaySong} onSelectPlaylist={onSelectPlaylist} collapsed={sidebarCollapsed} onToggle={onToggleSidebar} />
        <TopbarActions audioOutput={audioOutput} userName={userName} userDescription={userDescription} userAvatarUrl={userAvatarUrl} onOpenAudioOutputs={onOpenAudioOutputs} onOpenVersionNotice={onOpenVersionNotice} onOpenUserSettings={onOpenUserSettings} onLinkAccount={onLinkAccount} />
      </header>

      <section className="hero library-hero">
        <div>
          <span className="eyebrow">Local music library</span>
          <h1>Import your music</h1>
          <p>Bring your favorite songs into Hoshino and keep your collection close.</p>
          <div className="hero-meta"><span>{songs.length} tracks</span><i /><span>Local collection</span></div>
        </div>
        <div className="library-hero-actions">
          <button className="hero-explore" onClick={onExploreDiscovery}><Compass size={18} /> Explore Discovery</button>
          <button className="hero-play" onClick={onImport}><Import size={20} /> Import</button>
        </div>
        <div className="hero-art"><span>H</span></div>
      </section>

      {showMostListened && mostListenedSongs.length > 0 && <section className="song-section most-listened-section">
        <div className="section-title">
          <div><span className="eyebrow">Your repeats</span><h2>Most listened</h2></div>
        </div>
        <SongList
          songs={mostListenedSongs}
          currentSongId={currentSongId}
          isPlaying={isPlaying}
          onPlaySong={onPlaySong}
          onEditSong={onEditSong}
          onDeleteSong={onDeleteSong}
          onDownloadSong={onDownloadSong}
          playlists={playlists}
          onAddToPlaylist={onAddToPlaylist}
          onToggleFavorite={onToggleFavorite}
          onPlayNext={onPlayNext}
          onAddToQueue={onAddToQueue}
          onlineAvailable={onlineAvailable}
          emptyMessage="No listening history yet."
        />
      </section>}

      <section className="song-section">
        <div className="section-title">
          <div><span className="eyebrow">Your collection</span><h2>Library songs</h2></div>
          <div className="section-actions"><button className="refresh-button" disabled={loading} onClick={onRefresh}><RefreshCw size={15} /> {loading ? 'Refreshing' : 'Refresh'}</button><SortControl value={sort} onChange={onSortChange} /></div>
        </div>
        {loading ? <SongListSkeleton /> : <>
          <SongList
            songs={pagedSongs}
            currentSongId={currentSongId}
            isPlaying={isPlaying}
            onPlaySong={onPlaySong}
            onEditSong={onEditSong}
            onDeleteSong={onDeleteSong}
            onDownloadSong={onDownloadSong}
            playlists={playlists}
            onAddToPlaylist={onAddToPlaylist}
            onToggleFavorite={onToggleFavorite}
            onPlayNext={onPlayNext}
            onAddToQueue={onAddToQueue}
            onlineAvailable={onlineAvailable}
            emptyMessage="No music has been imported yet. Use the Import button to add your first track."
          />
          <Pagination page={page} totalItems={songs.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </>}
      </section>
    </main>
  )
})
