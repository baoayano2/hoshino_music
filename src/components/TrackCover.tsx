import type { MusicTrack } from '../types'

type TrackCoverProps = {
  song: MusicTrack | null
  className?: string
}

function initials(value: string) {
  return value.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase()
}

export function TrackCover({ song, className = '' }: TrackCoverProps) {
  return (
    <span className={`cover cover-coral ${song?.coverUrl ? 'cover-image' : ''} ${className}`}>
      {song?.coverUrl ? <img src={song.coverUrl} alt={`${song.title} cover`} /> : song ? initials(song.title) : '--'}
    </span>
  )
}
