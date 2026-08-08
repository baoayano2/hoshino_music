import { Search } from 'lucide-react'
import { forwardRef } from 'react'
import type { MusicTrack, PlaylistRecord } from '../types'
import { PlaylistCover } from './PlaylistCover'
import { SidebarToggle } from './SidebarToggle'
import { TrackCover } from './TrackCover'

type SearchBarProps = {
  query: string
  songs: MusicTrack[]
  playlists?: PlaylistRecord[]
  onQueryChange: (query: string) => void
  onPlaySong: (id: string) => void
  onSelectPlaylist?: (id: string) => void
  collapsed: boolean
  onToggle: () => void
}

export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(function SearchBar({ query, songs, playlists = [], onQueryChange, onPlaySong, onSelectPlaylist, collapsed, onToggle }, ref) {
  const normalized = query.trim().toLowerCase()
  const songResults = normalized
    ? songs.filter((song) => `${song.title} ${song.artist} ${song.album}`.toLowerCase().includes(normalized)).slice(0, 5)
    : []
  const playlistResults = normalized
    ? playlists.filter((playlist) => `${playlist.name} ${playlist.description}`.toLowerCase().includes(normalized)).slice(0, 4)
    : []

  return (
    <div className="search-wrapper">
      <SidebarToggle collapsed={collapsed} onToggle={onToggle} />
      <label className="search-box">
        <Search size={18} />
        <input
          ref={ref}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search songs, artists, albums, playlists..."
        />
      </label>
      {normalized && (
        <div className="search-tooltip">
          {songResults.length > 0 && <span className="search-result-heading">Songs</span>}
          {songResults.map((song) => (
            <button key={song.id} onClick={() => onPlaySong(song.id)}>
              <TrackCover song={song} />
              <span><strong>{song.title}</strong><small>{song.artist} - {song.album || song.title}</small></span>
            </button>
          ))}
          {playlistResults.length > 0 && <span className="search-result-heading">Playlists</span>}
          {playlistResults.map((playlist) => (
            <button key={playlist.id} onClick={() => { onSelectPlaylist?.(playlist.id); onQueryChange('') }}>
              <PlaylistCover playlist={playlist} className="search-playlist-cover" />
              <span><strong>{playlist.name}</strong><small>{playlist.songIds.length} songs</small></span>
            </button>
          ))}
          {!songResults.length && !playlistResults.length && <p>No matching songs or playlists.</p>}
        </div>
      )}
    </div>
  )
})
