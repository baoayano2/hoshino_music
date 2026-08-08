import { useEffect, useRef } from 'react'
import type { MusicTrack } from '../types'

type PlaybackSession = {
  song: MusicTrack
  listenedSeconds: number
  lastPosition: number
  qualified: boolean
}

export function usePlaybackHistory({ song, isPlaying, currentTime, duration, onQualifiedPlay, onSkip }: {
  song: MusicTrack | null
  isPlaying: boolean
  currentTime: number
  duration: number
  onQualifiedPlay: (song: MusicTrack) => void
  onSkip: (song: MusicTrack) => void
}) {
  const sessionRef = useRef<PlaybackSession | null>(null)

  useEffect(() => {
    const current = sessionRef.current
    if (current && song && current.song.id === song.id) {
      current.song = song
      return
    }
    if (current && !current.qualified) onSkip(current.song)
    sessionRef.current = song ? { song, listenedSeconds: 0, lastPosition: 0, qualified: false } : null
  }, [onSkip, song])

  useEffect(() => {
    const session = sessionRef.current
    if (!session || session.song.id !== song?.id) return
    const delta = currentTime - session.lastPosition
    session.lastPosition = currentTime
    if (session.qualified && delta < -2) {
      session.listenedSeconds = 0
      session.qualified = false
      return
    }
    if (!isPlaying || delta <= 0 || delta > 2.5 || session.qualified) return
    session.listenedSeconds += delta
    const knownDuration = duration > 0 ? duration : song.duration ?? 0
    const threshold = knownDuration > 0 ? Math.min(30, knownDuration * 0.5) : 30
    if (session.listenedSeconds < threshold) return
    session.qualified = true
    onQualifiedPlay(session.song)
  }, [currentTime, duration, isPlaying, onQualifiedPlay, song])
}
