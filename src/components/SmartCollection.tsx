import { Clock3, Heart, History } from 'lucide-react'
import { useEffect, useState, type RefObject } from 'react'
import type { AudioOutputDevice } from '../audio-device'
import type { MusicTrack, PlaylistRecord } from '../types'
import { SearchBar } from './SearchBar'
import { SongList } from './SongList'
import { TopbarActions } from './TopbarActions'
import { Pagination } from './Pagination'

type SmartCollectionKind = 'liked' | 'recently-played' | 'recently-added'
const PAGE_SIZE = 20

const COPY: Record<SmartCollectionKind, { eyebrow: string, title: string, description: string, empty: string }> = {
  liked: { eyebrow: 'Your favorites', title: 'Liked songs', description: 'Every song you have saved with a heart.', empty: 'Songs you like will appear here.' },
  'recently-played': { eyebrow: 'Listening history', title: 'Recently played', description: 'Local and online songs you recently listened to.', empty: 'Qualified plays will appear here.' },
  'recently-added': { eyebrow: 'Your collection', title: 'Recently added', description: 'The newest local and online songs in your library.', empty: 'Newly added songs will appear here.' },
}

export function SmartCollection({ kind, songs, librarySongs, playlists, currentSongId, isPlaying, query, onlineAvailable, onQueryChange, onPlaySong, onPlaySearchSong, onSelectPlaylist, onEditSong, onDeleteSong, onDownloadSong, onAddToPlaylist, onToggleFavorite, onPlayNext, onAddToQueue, audioOutput, userName, userDescription, userAvatarUrl, onOpenAudioOutputs, onOpenVersionNotice, onOpenUserSettings, onLinkAccount, sidebarCollapsed, onToggleSidebar, searchInputRef }: {
  kind: SmartCollectionKind
  songs: MusicTrack[]
  librarySongs: MusicTrack[]
  playlists: PlaylistRecord[]
  currentSongId: string | null
  isPlaying: boolean
  query: string
  onlineAvailable: boolean
  onQueryChange: (query: string) => void
  onPlaySong: (id: string) => void
  onPlaySearchSong: (id: string) => void
  onSelectPlaylist: (id: string) => void
  onEditSong: (song: MusicTrack) => void
  onDeleteSong: (song: MusicTrack) => void
  onDownloadSong: (song: MusicTrack) => void
  onAddToPlaylist: (song: MusicTrack, playlistId: string) => void
  onToggleFavorite: (song: MusicTrack) => void
  onPlayNext?: (song: MusicTrack) => void
  onAddToQueue?: (song: MusicTrack) => void
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
}) {
  const copy = COPY[kind]
  const Icon = kind === 'liked' ? Heart : kind === 'recently-played' ? History : Clock3
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(songs.length / PAGE_SIZE))
  useEffect(() => setPage(1), [kind])
  useEffect(() => setPage((current) => Math.min(current, totalPages)), [totalPages])
  const pagedSongs = songs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  return <main className="library smart-collection-view">
    <header className="topbar">
      <SearchBar ref={searchInputRef} query={query} songs={librarySongs} playlists={playlists} onQueryChange={onQueryChange} onPlaySong={onPlaySearchSong} onSelectPlaylist={onSelectPlaylist} collapsed={sidebarCollapsed} onToggle={onToggleSidebar} />
      <TopbarActions audioOutput={audioOutput} userName={userName} userDescription={userDescription} userAvatarUrl={userAvatarUrl} onOpenAudioOutputs={onOpenAudioOutputs} onOpenVersionNotice={onOpenVersionNotice} onOpenUserSettings={onOpenUserSettings} onLinkAccount={onLinkAccount} />
    </header>
    <section className="hero smart-collection-hero">
      <div><span className="eyebrow">{copy.eyebrow}</span><h1>{copy.title}</h1><p>{copy.description}</p><div className="hero-meta"><span>{songs.length} tracks</span></div></div>
      <div className="hero-art"><Icon size={54} fill={kind === 'liked' ? 'currentColor' : 'none'} /></div>
    </section>
    <section className="song-section">
      <div className="section-title"><div><span className="eyebrow">{copy.eyebrow}</span><h2>Tracks</h2></div></div>
      <SongList songs={pagedSongs} currentSongId={currentSongId} isPlaying={isPlaying} onPlaySong={onPlaySong} onEditSong={onEditSong} onDeleteSong={onDeleteSong} onDownloadSong={onDownloadSong} playlists={playlists} onAddToPlaylist={onAddToPlaylist} onToggleFavorite={onToggleFavorite} onPlayNext={onPlayNext} onAddToQueue={onAddToQueue} onlineAvailable={onlineAvailable} emptyMessage={copy.empty} />
      <Pagination page={page} totalItems={songs.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </section>
  </main>
}
