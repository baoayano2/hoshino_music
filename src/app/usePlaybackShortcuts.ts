import { useEffect, type Dispatch, type RefObject, type SetStateAction } from 'react'
import type { MusicTrack } from '../types'

type PlaybackShortcutsOptions = {
  blocked: boolean
  currentSong: MusicTrack | null
  currentTime: number
  audioRef: RefObject<HTMLAudioElement>
  searchInputRef: RefObject<HTMLInputElement>
  moveSong: (direction: -1 | 1) => void
  seekSong: (time: number) => void
  toggleShuffle: () => void
  setVolume: Dispatch<SetStateAction<number>>
  setIsPlaying: Dispatch<SetStateAction<boolean>>
  setRepeatEnabled: Dispatch<SetStateAction<boolean>>
}

export function usePlaybackShortcuts({ blocked, currentSong, currentTime, audioRef, searchInputRef, moveSong, seekSong, toggleShuffle, setVolume, setIsPlaying, setRepeatEnabled }: PlaybackShortcutsOptions) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.metaKey || blocked) return

      const target = event.target
      if (target instanceof HTMLElement) {
        const isTimeline = target instanceof HTMLInputElement && target.getAttribute('aria-label') === 'Song progress'
        const isEditable = target.isContentEditable || target.matches('input, textarea, select')
        if (isEditable && !isTimeline && !(event.ctrlKey && event.key.toLowerCase() === 'l')) return
      }

      if (event.ctrlKey) {
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
          event.preventDefault()
          moveSong(event.key === 'ArrowRight' ? 1 : -1)
          return
        }
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault()
          setVolume((value) => event.key === 'ArrowUp' ? Math.min(value + 0.05, 1) : event.shiftKey ? 0 : Math.max(value - 0.05, 0))
          return
        }
        if (event.key.toLowerCase() === 'l') {
          event.preventDefault()
          searchInputRef.current?.focus()
          searchInputRef.current?.select()
          return
        }
        if (event.key.toLowerCase() === 's') {
          event.preventDefault()
          toggleShuffle()
          return
        }
        if (event.key.toLowerCase() === 'r') {
          event.preventDefault()
          setRepeatEnabled((enabled) => !enabled)
          return
        }
      }

      if (event.key === ' ' || event.code === 'Space') {
        if (!currentSong) return
        event.preventDefault()
        setIsPlaying((playing) => !playing)
        return
      }

      if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && currentSong) {
        event.preventDefault()
        const currentAudioTime = audioRef.current?.currentTime
        const baseTime = Number.isFinite(currentAudioTime) ? currentAudioTime as number : currentTime
        seekSong(baseTime + (event.key === 'ArrowRight' ? 5 : -5))
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [audioRef, blocked, currentSong, currentTime, moveSong, searchInputRef, seekSong, setIsPlaying, setRepeatEnabled, setVolume, toggleShuffle])
}
