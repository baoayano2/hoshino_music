import { Maximize2, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useEffect, useState } from 'react'
import type { MiniPlayerCommand, MiniPlayerState } from '../types'
import { formatTime } from './SongList'
import { TrackCover } from './TrackCover'

const EMPTY_MINI_PLAYER_STATE: MiniPlayerState = {
  song: null,
  isPlaying: false,
  shuffleEnabled: false,
  repeatEnabled: false,
  currentTime: 0,
  duration: 0,
  volume: 0.6,
}

function sendMiniCommand(command: MiniPlayerCommand) {
  void window.electronApi?.sendMiniPlayerCommand(command)
}

export function MiniPlayer() {
  const [state, setState] = useState<MiniPlayerState>(EMPTY_MINI_PLAYER_STATE)
  const { song, isPlaying, currentTime, duration, volume } = state
  const progress = duration ? Math.min(currentTime / duration, 1) * 100 : 0
  const rangeFill = (value: number) => ({ '--range-value': `${value}%` } as CSSProperties)
  const shellStyle = {
    '--mini-cover-url': song?.coverUrl ? `url("${song.coverUrl}")` : 'none',
  } as CSSProperties

  useEffect(() => {
    let disposed = false
    void window.electronApi?.getMiniPlayerState().then((next) => {
      if (!disposed && next) setState(next)
    })
    const unsubscribe = window.electronApi?.onMiniPlayerState((next) => setState(next))
    return () => {
      disposed = true
      unsubscribe?.()
    }
  }, [])

  return (
    <main className={`mini-player-shell ${song?.coverUrl ? 'has-cover' : ''}`} style={shellStyle}>
      <button className="mini-expand" aria-label="Expand player" onClick={() => sendMiniCommand({ type: 'expand' })}>
        <Maximize2 size={15} />
      </button>
      <div className="mini-cover-wrap">
        <TrackCover song={song} className="mini-cover" />
      </div>
      <section className="mini-content">
        <div className="mini-copy">
          <strong>{song?.title ?? 'Nothing playing'}</strong>
          <small>{song?.artist ?? 'Open Hoshino to play music'}</small>
        </div>
        <div className="mini-progress">
          <input
            disabled={!song}
            aria-label="Mini player progress"
            type="range"
            min="0"
            max={duration || 0}
            step="0.1"
            value={currentTime}
            style={rangeFill(progress)}
            onChange={(event) => sendMiniCommand({ type: 'seek', seconds: Number(event.target.value) })}
          />
          <span><b>{formatTime(currentTime)}</b><b>{formatTime(duration)}</b></span>
        </div>
        <div className="mini-controls">
          <button aria-label="Previous song" disabled={!song} onClick={() => sendMiniCommand({ type: 'previous' })}><SkipBack size={17} fill="currentColor" /></button>
          <button className="mini-main-play" aria-label={isPlaying ? 'Pause' : 'Play'} disabled={!song} onClick={() => sendMiniCommand({ type: 'toggle-play' })}>
            {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
          </button>
          <button aria-label="Next song" disabled={!song} onClick={() => sendMiniCommand({ type: 'next' })}><SkipForward size={17} fill="currentColor" /></button>
          <button aria-label={volume === 0 ? 'Unmute' : 'Mute'} onClick={() => sendMiniCommand({ type: 'toggle-mute' })}>
            {volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        </div>
      </section>
    </main>
  )
}
