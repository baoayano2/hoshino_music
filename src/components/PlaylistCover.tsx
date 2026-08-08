import { ListMusic } from 'lucide-react'
import type { PlaylistRecord } from '../types'

type PlaylistCoverProps = {
  playlist: PlaylistRecord
  className?: string
}

export function PlaylistCover({ playlist, className = '' }: PlaylistCoverProps) {
  return (
    <span className={`playlist-cover ${playlist.coverUrl ? 'playlist-cover-image' : ''} ${className}`}>
      {playlist.coverUrl ? <img src={playlist.coverUrl} alt={`${playlist.name} cover`} /> : <ListMusic size={18} />}
    </span>
  )
}
