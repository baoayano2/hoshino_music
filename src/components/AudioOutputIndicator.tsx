import { Headphones, Speaker } from 'lucide-react'
import type { AudioOutputDevice } from '../audio-device'

type AudioOutputIndicatorProps = {
  audioOutput: AudioOutputDevice | null
  onClick: () => void
}

export function AudioOutputIndicator({ audioOutput, onClick }: AudioOutputIndicatorProps) {
  const label = audioOutput?.label || 'Audio output unavailable'

  return (
    <button
      type="button"
      className={`audio-output-indicator ${audioOutput?.isListeningDevice ? 'listening-device' : ''}`}
      title={label}
      aria-label={`Change audio output. Current output: ${label}`}
      onClick={onClick}
    >
      {audioOutput?.isListeningDevice ? <Headphones size={18} /> : <Speaker size={18} />}
      <span>{label}</span>
    </button>
  )
}
