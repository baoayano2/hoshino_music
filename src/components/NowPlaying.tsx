import { FileText, Heart, ListMusic, LoaderCircle, Minimize2, MonitorUp, Pause, Play, Repeat2, Shuffle, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useEffect, useRef, useState } from 'react'
import type { MusicTrack } from '../types'
import { formatTime } from './SongList'
import { TrackCover } from './TrackCover'

type NowPlayingProps = {
  song: MusicTrack | null
  isPlaying: boolean
  shuffleEnabled: boolean
  repeatEnabled: boolean
  currentTime: number
  duration: number
  volume: number
  onTogglePlay: () => void
  onToggleShuffle: () => void
  onToggleRepeat: () => void
  onPrevious: () => void
  onNext: () => void
  onSeek: (seconds: number) => void
  onSeekStart: () => void
  onVolumeChange: (volume: number) => void
  onToggleMute: () => void
  onOpenFullscreen: () => void
  onOpenMiniPlayer: () => void
  lyricsOpen: boolean
  lyricsAvailable: boolean
  onToggleLyrics: () => void
  queueOpen: boolean
  loading: boolean
  onToggleQueue: () => void
  onToggleFavorite: (song: MusicTrack) => void
}

export function NowPlaying({ song, isPlaying, shuffleEnabled, repeatEnabled, currentTime, duration, volume, onTogglePlay, onToggleShuffle, onToggleRepeat, onPrevious, onNext, onSeek, onSeekStart, onVolumeChange, onToggleMute, onOpenFullscreen, onOpenMiniPlayer, lyricsOpen, lyricsAvailable, onToggleLyrics, queueOpen, loading, onToggleQueue, onToggleFavorite }: NowPlayingProps) {
  const [previewTime, setPreviewTime] = useState<number | null>(null)
  const previewTimeRef = useRef<number | null>(null)
  const displayedTime = previewTime ?? currentTime
  const progress = duration ? (displayedTime / duration) * 100 : 0
  const rangeFill = (value: number) => ({ '--range-value': `${value}%` } as CSSProperties)
  const previewSeek = (seconds: number) => {
    if (previewTimeRef.current === null) onSeekStart()
    previewTimeRef.current = seconds
    setPreviewTime(seconds)
  }
  const commitSeek = () => {
    if (previewTimeRef.current === null) return
    onSeek(previewTimeRef.current)
    previewTimeRef.current = null
    setPreviewTime(null)
  }
  useEffect(() => {
    previewTimeRef.current = null
    setPreviewTime(null)
  }, [song?.id])

  return (
    <footer className={`now-playing ${song ? '' : 'player-empty'}`}>
      <div className="timeline"><input
        disabled={!song}
        style={rangeFill(progress)}
        aria-label="Song progress"
        type="range"
        min="0"
        max={duration || 0}
        step="0.1"
        value={displayedTime}
        onChange={(event) => previewSeek(Number(event.target.value))}
        onPointerUp={commitSeek}
        onPointerCancel={() => { previewTimeRef.current = null; setPreviewTime(null) }}
        onKeyUp={commitSeek}
        onBlur={commitSeek}
      /></div>
      <div className="now-song">
        <span className="now-cover-wrap"><TrackCover song={song} />{loading && <span className="now-cover-loading" aria-label="Loading Spotify stream"><LoaderCircle size={21} /></span>}</span>
        <span className="now-song-copy"><strong>{song?.title ?? 'Nothing playing'}</strong><small>{song?.artist ?? 'Import and select a song'}</small></span>
        <button className={`now-favorite ${song?.favorite ? 'active' : ''}`} disabled={!song} aria-label={song?.favorite ? 'Remove from Liked songs' : 'Add to Liked songs'} onClick={() => song && onToggleFavorite(song)}><Heart size={18} fill={song?.favorite ? 'currentColor' : 'none'} /></button>
      </div>
      <div className="player-controls">
        <button className={`secondary-control shuffle-control ${shuffleEnabled ? 'active' : ''}`} aria-label={shuffleEnabled ? 'Disable shuffle' : 'Enable shuffle'} aria-pressed={shuffleEnabled} disabled={!song} onClick={onToggleShuffle}><Shuffle size={23} /></button>
        <button aria-label="Previous song" disabled={!song} onClick={onPrevious}><SkipBack size={21} fill="currentColor" /></button>
        <button className="main-play" disabled={!song || loading} aria-label={isPlaying ? 'Pause' : 'Play'} onClick={onTogglePlay}>{isPlaying ? <Pause size={21} fill="currentColor" /> : <Play size={21} fill="currentColor" />}</button>
        <button aria-label="Next song" disabled={!song} onClick={onNext}><SkipForward size={21} fill="currentColor" /></button>
        <button className={`secondary-control repeat-control ${repeatEnabled ? 'active' : ''}`} aria-label={repeatEnabled ? 'Disable repeat' : 'Enable repeat'} aria-pressed={repeatEnabled} disabled={!song} onClick={onToggleRepeat}><Repeat2 size={23} /></button>
        <button className={`secondary-control mobile-queue-control ${queueOpen ? 'active' : ''}`} aria-label={queueOpen ? 'Close queue' : 'Open queue'} aria-pressed={queueOpen} onClick={onToggleQueue}><ListMusic size={22} /></button>
      </div>
      <div className="volume-controls">
        <div className="time-display"><span>{formatTime(displayedTime)}</span><span className="time-divider">/</span><span>{formatTime(duration)}</span></div>
        <button className={queueOpen ? 'active' : ''} aria-label={queueOpen ? 'Close queue' : 'Open queue'} aria-pressed={queueOpen} onClick={onToggleQueue}><ListMusic size={18} /></button>
        <button className={`${lyricsOpen ? 'active' : ''} ${lyricsAvailable ? '' : 'lyrics-unavailable'}`} aria-label={!lyricsAvailable ? 'Lyrics unavailable' : lyricsOpen ? 'Close lyrics' : 'Open lyrics'} aria-pressed={lyricsOpen} disabled={!song || !lyricsAvailable} title={!lyricsAvailable ? 'No lyrics for this song' : undefined} onClick={onToggleLyrics}><FileText size={17} /></button>
        <button aria-label="Open mini player" disabled={!song} onClick={onOpenMiniPlayer}><Minimize2 size={17} /></button>
        <button aria-label="Open fullscreen player" disabled={!song} onClick={onOpenFullscreen}><MonitorUp size={17} /></button>
        <button aria-label={volume === 0 ? 'Unmute' : 'Mute'} onClick={onToggleMute}>{volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
        <input style={rangeFill(volume * 100)} aria-label="Volume" type="range" min="0" max="1" step="0.01" value={volume} onChange={(event) => onVolumeChange(Number(event.target.value))} />
      </div>
    </footer>
  )
}
