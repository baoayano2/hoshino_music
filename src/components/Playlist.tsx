import { ListPlus, Pencil, Play, RefreshCw, Trash2 } from 'lucide-react'
import { memo, useMemo, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'
import type { MusicTrack, PlaylistRecord } from '../types'
import type { AudioOutputDevice } from '../audio-device'
import { ContextMenu } from './ContextMenu'
import { SearchBar } from './SearchBar'
import { SongList, SongListSkeleton } from './SongList'
import { SortControl, sortSongs, type SortOption } from './SortControl'
import { PlaylistCover } from './PlaylistCover'
import { TopbarActions } from './TopbarActions'

type PlaylistProps = {
  playlist: PlaylistRecord
  playlists: PlaylistRecord[]
  songs: MusicTrack[]
  librarySongs: MusicTrack[]
  query: string
  currentSongId: string | null
  isPlaying: boolean
  loading: boolean
  onQueryChange: (value: string) => void
  onPlaySong: (id: string) => void
  onPlayLibrarySong: (id: string) => void
  onSelectPlaylist: (id: string) => void
  onAddSong: () => void
  onEditPlaylist: () => void
  onDeletePlaylist: () => void
  onRefresh: () => void
  onEditSong: (song: MusicTrack) => void
  onDeleteSong: (song: MusicTrack) => void
  onDownloadSong: (song: MusicTrack) => void
  onToggleFavorite: (song: MusicTrack) => void
  onPlayNext?: (song: MusicTrack) => void
  onAddToQueue?: (song: MusicTrack) => void
  onlineAvailable: boolean
  onRemoveSong: (song: MusicTrack) => void
  onEmptyPlayAll: () => void
  sort: SortOption
  onSortChange: (sort: SortOption) => void
  onReorderSongs: (songIds: string[]) => void
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

export const Playlist = memo(function Playlist({ playlist, playlists, songs, librarySongs, query, currentSongId, isPlaying, loading, onQueryChange, onPlaySong, onPlayLibrarySong, onSelectPlaylist, onAddSong, onEditPlaylist, onDeletePlaylist, onRefresh, onEditSong, onDeleteSong, onDownloadSong, onToggleFavorite, onPlayNext, onAddToQueue, onlineAvailable, onRemoveSong, onEmptyPlayAll, sort, onSortChange, onReorderSongs, audioOutput, userName, userDescription, userAvatarUrl, onOpenAudioOutputs, onOpenVersionNotice, onOpenUserSettings, onLinkAccount, sidebarCollapsed, onToggleSidebar, searchInputRef }: PlaylistProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number } | null>(null)
  const sortedSongs = useMemo(() => sortSongs(songs, sort), [songs, sort])
  const reorderSongs = (sourceId: string, targetId: string, edge: 'before' | 'after') => {
    const nextIds = sortedSongs.map((song) => song.id)
    const sourceIndex = nextIds.indexOf(sourceId)
    const targetIndex = nextIds.indexOf(targetId)
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return
    const [movedId] = nextIds.splice(sourceIndex, 1)
    const adjustedTargetIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex
    nextIds.splice(adjustedTargetIndex + (edge === 'after' ? 1 : 0), 0, movedId)
    onSortChange('custom')
    onReorderSongs(nextIds)
  }

  return <main className="library">
    <header className="topbar">
      <SearchBar ref={searchInputRef} query={query} songs={librarySongs} playlists={playlists} onQueryChange={onQueryChange} onPlaySong={onPlayLibrarySong} onSelectPlaylist={onSelectPlaylist} collapsed={sidebarCollapsed} onToggle={onToggleSidebar} />
      <TopbarActions audioOutput={audioOutput} userName={userName} userDescription={userDescription} userAvatarUrl={userAvatarUrl} onOpenAudioOutputs={onOpenAudioOutputs} onOpenVersionNotice={onOpenVersionNotice} onOpenUserSettings={onOpenUserSettings} onLinkAccount={onLinkAccount} />
    </header>
    <section className={`hero playlist-hero ${playlist.heroUrl ? 'playlist-hero-custom' : ''}`} style={playlist.heroUrl ? { '--playlist-hero-image': `url("${playlist.heroUrl}")` } as CSSProperties : undefined} onContextMenu={(event) => { event.preventDefault(); setContextMenu({ x: event.clientX, y: event.clientY }) }}>
      <PlaylistCover playlist={playlist} className="playlist-hero-cover" />
      <div className="playlist-hero-copy"><span className="eyebrow">Your playlist</span><h1>{playlist.name}</h1><p>{playlist.description || 'A personal collection made by you.'}</p><div className="hero-meta"><span>{songs.length} tracks</span><i /><span>Personal playlist</span></div></div>
      <div className="playlist-hero-actions"><button className="hero-edit" aria-label="Edit playlist" onClick={onEditPlaylist}><Pencil size={16} /> Edit</button><button className="hero-play" onClick={() => sortedSongs[0] ? onPlaySong(sortedSongs[0].id) : onEmptyPlayAll()}><Play size={20} fill="currentColor" /> Play all</button></div>
    </section>
    <section className="song-section">
      <div className="section-title"><div><span className="eyebrow">Playlist collection</span><h2>Tracks</h2></div><div className="section-actions"><button onClick={onAddSong}><ListPlus size={16} /> Add songs</button><button className="refresh-button" disabled={loading} onClick={onRefresh}><RefreshCw size={15} /> {loading ? 'Refreshing' : 'Refresh'}</button><SortControl value={sort} onChange={onSortChange} includeCustom /></div></div>
      {loading ? <SongListSkeleton /> : <SongList songs={sortedSongs} currentSongId={currentSongId} isPlaying={isPlaying} onPlaySong={onPlaySong} onEditSong={onEditSong} onDeleteSong={onDeleteSong} onDownloadSong={onDownloadSong} onToggleFavorite={onToggleFavorite} onPlayNext={onPlayNext} onAddToQueue={onAddToQueue} onlineAvailable={onlineAvailable} onRemoveSong={onRemoveSong} onReorder={reorderSongs} emptyMessage="This playlist is empty. Add an imported song to begin." />}
    </section>
    {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} items={[
      { label: 'Play playlist', icon: <Play size={15} />, onSelect: () => sortedSongs[0] ? onPlaySong(sortedSongs[0].id) : onEmptyPlayAll() },
      { label: 'Add songs', icon: <ListPlus size={15} />, onSelect: onAddSong },
      { label: 'Edit playlist', icon: <Pencil size={15} />, onSelect: onEditPlaylist },
      { label: 'Delete playlist', icon: <Trash2 size={15} />, danger: true, onSelect: onDeletePlaylist },
    ]} />}
  </main>
})
