import { Pause, Play, Repeat2, Shuffle, SkipBack, SkipForward, Volume2, VolumeX, X } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useEffect, useRef, useState } from 'react'
import type { MusicTrack } from '../types'
import { formatTime } from './SongList'
import { TrackCover } from './TrackCover'

type FullscreenPlayerProps = {
  song: MusicTrack
  layout: 'centered' | 'split'
  isPlaying: boolean
  shuffleEnabled: boolean
  repeatEnabled: boolean
  currentTime: number
  duration: number
  volume: number
  onClose: () => void
  onTogglePlay: () => void
  onToggleShuffle: () => void
  onToggleRepeat: () => void
  onPrevious: () => void
  onNext: () => void
  onSeek: (seconds: number) => void
  onVolumeChange: (volume: number) => void
  onToggleMute: () => void
}

export function FullscreenPlayer({ song, layout, isPlaying, shuffleEnabled, repeatEnabled, currentTime, duration, volume, onClose, onTogglePlay, onToggleShuffle, onToggleRepeat, onPrevious, onNext, onSeek, onVolumeChange, onToggleMute }: FullscreenPlayerProps) {
  const [previewTime, setPreviewTime] = useState<number | null>(null)
  const previewTimeRef = useRef<number | null>(null)
  const displayedTime = previewTime ?? currentTime
  const progress = duration ? (displayedTime / duration) * 100 : 0
  const style = {
    '--fullscreen-cover': song.coverUrl ? `url("${song.coverUrl}")` : 'none',
    '--range-value': `${progress}%`,
  } as CSSProperties
  const commitSeek = () => {
    if (previewTimeRef.current === null) return
    onSeek(previewTimeRef.current)
    previewTimeRef.current = null
    setPreviewTime(null)
  }

  useEffect(() => {
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeWithEscape)
    return () => window.removeEventListener('keydown', closeWithEscape)
  }, [onClose])

  useEffect(() => {
    previewTimeRef.current = null
    setPreviewTime(null)
  }, [song.id])

  return <section className={`fullscreen-player fullscreen-player-${layout} ${song.coverUrl ? 'has-cover' : ''}`} style={style}>
    <div className="fullscreen-player-background" />
    <div className="fullscreen-player-shade" />
    <button className="fullscreen-player-close" aria-label="Exit fullscreen player" onClick={onClose}><X size={23} /></button>
    <div className="fullscreen-player-content">
      <span className="fullscreen-player-eyebrow">Now playing</span>
      <div className="fullscreen-player-volume">
        <button aria-label={volume === 0 ? 'Unmute' : 'Mute'} onClick={onToggleMute}>{volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
        <input aria-label="Fullscreen volume" type="range" min="0" max="1" step="0.01" value={volume} style={{ '--range-value': `${volume * 100}%` } as CSSProperties} onChange={(event) => onVolumeChange(Number(event.target.value))} />
      </div>
      <TrackCover song={song} className="fullscreen-player-cover" />
      <div className="fullscreen-player-details">
        <div className="fullscreen-player-copy">
          <h1>{song.title}</h1>
          <p>{song.artist || 'Unknown artist'}</p>
          <span>{song.album}</span>
        </div>
        <div className="fullscreen-player-progress">
          <input
            aria-label="Fullscreen song progress"
            type="range"
            min="0"
            max={duration || 0}
            step="0.1"
            value={displayedTime}
            onChange={(event) => {
              const seconds = Number(event.target.value)
              previewTimeRef.current = seconds
              setPreviewTime(seconds)
            }}
            onPointerUp={commitSeek}
            onPointerCancel={() => { previewTimeRef.current = null; setPreviewTime(null) }}
            onKeyUp={commitSeek}
            onBlur={commitSeek}
          />
          <div><span>{formatTime(displayedTime)}</span><span>{formatTime(duration)}</span></div>
        </div>
        <div className="fullscreen-player-controls">
          <button className={`fullscreen-secondary ${shuffleEnabled ? 'active' : ''}`} aria-label={shuffleEnabled ? 'Disable shuffle' : 'Enable shuffle'} aria-pressed={shuffleEnabled} onClick={onToggleShuffle}><Shuffle size={23} /></button>
          <button aria-label="Previous song" onClick={onPrevious}><SkipBack size={27} fill="currentColor" /></button>
          <button className="fullscreen-main-play" aria-label={isPlaying ? 'Pause' : 'Play'} onClick={onTogglePlay}>{isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" />}</button>
          <button aria-label="Next song" onClick={onNext}><SkipForward size={27} fill="currentColor" /></button>
          <button className={`fullscreen-secondary ${repeatEnabled ? 'active' : ''}`} aria-label={repeatEnabled ? 'Disable repeat' : 'Enable repeat'} aria-pressed={repeatEnabled} onClick={onToggleRepeat}><Repeat2 size={23} /></button>
        </div>
      </div>
    </div>
  </section>
}
