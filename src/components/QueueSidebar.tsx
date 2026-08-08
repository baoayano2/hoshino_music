import { GripVertical, ListMusic, Music2, Repeat2, Save, Shuffle, Trash2, X } from 'lucide-react'
import { useState, type DragEvent } from 'react'
import type { MusicTrack } from '../types'
import { TrackCover } from './TrackCover'

type QueueSection = 'next' | 'later'

export function QueueSidebar({ enabled, currentSong, defaultQueue, shuffleEnabled, repeatEnabled, wrapAround, nextUp, later, onPlayDefaultSong, onPlaySong, onRemove, onReorder, onClear, onSave, onClose }: {
  enabled: boolean
  currentSong: MusicTrack | null
  defaultQueue: MusicTrack[]
  shuffleEnabled: boolean
  repeatEnabled: boolean
  wrapAround: boolean
  nextUp: MusicTrack[]
  later: MusicTrack[]
  onPlayDefaultSong: (song: MusicTrack) => void
  onPlaySong: (section: QueueSection, song: MusicTrack) => void
  onRemove: (section: QueueSection, songId: string) => void
  onReorder: (section: QueueSection, sourceId: string, targetId: string) => void
  onClear: () => void
  onSave: () => void
  onClose: () => void
}) {
  const [dragging, setDragging] = useState<{ section: QueueSection, id: string } | null>(null)
  const renderSection = (section: QueueSection, title: string, songs: MusicTrack[]) => <section className="queue-section">
    <div className="queue-section-heading"><strong>{title}</strong><span>{songs.length}</span></div>
    <div className="queue-list">
      {songs.length ? songs.map((song, index) => <div
        className={`queue-item ${dragging?.id === song.id ? 'dragging' : ''}`}
        key={`${section}:${song.id}`}
        draggable
        onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; setDragging({ section, id: song.id }) }}
        onDragEnd={() => setDragging(null)}
        onDragOver={(event: DragEvent) => { if (dragging?.section === section) { event.preventDefault(); event.dataTransfer.dropEffect = 'move' } }}
        onDrop={(event) => { event.preventDefault(); if (dragging?.section === section) onReorder(section, dragging.id, song.id); setDragging(null) }}
      >
        <GripVertical className="queue-drag-handle" size={15} />
        <button type="button" className="queue-item-main" onClick={() => onPlaySong(section, song)}>
          <span className="queue-index">{index + 1}</span><TrackCover song={song} />
          <span className="queue-copy"><strong>{song.title}</strong><small>{song.artist || 'Unknown artist'} · {song.album || song.title}</small></span>
        </button>
        <button type="button" className="queue-remove" aria-label={`Remove ${song.title} from queue`} onClick={() => onRemove(section, song.id)}><X size={15} /></button>
      </div>) : <div className="queue-empty"><Music2 size={18} /><span>No songs in this section.</span></div>}
    </div>
  </section>
  const currentIndex = currentSong ? defaultQueue.findIndex((song) => song.id === currentSong.id) : -1
  const automaticQueue = currentIndex < 0
    ? defaultQueue
    : [...defaultQueue.slice(currentIndex + 1), ...(wrapAround ? defaultQueue.slice(0, currentIndex) : [])]

  return <aside className="queue-sidebar" aria-label="Custom playback queue">
    <div className="queue-sidebar-header">
      <span className="queue-sidebar-icon"><ListMusic size={18} /></span>
      <div><span className="eyebrow">{enabled ? 'Custom queue' : 'Automatic queue'}</span><h2>Playing queue</h2></div>
      <button type="button" className="queue-close" aria-label="Close queue" onClick={onClose}><X size={19} /></button>
    </div>

    {!enabled ? <>
      {currentSong && <div className="queue-current"><TrackCover song={currentSong} /><span><small>Now playing</small><strong>{currentSong.title}</strong><em>{currentSong.artist || 'Unknown artist'}</em></span></div>}
      <div className="queue-mode-row">
        <span className={shuffleEnabled ? 'active' : ''}><Shuffle size={13} /> {shuffleEnabled ? 'Shuffle on' : 'In order'}</span>
        <span className={repeatEnabled ? 'active' : ''}><Repeat2 size={13} /> {repeatEnabled ? 'Repeat on' : 'Repeat off'}</span>
      </div>
      <section className="queue-section automatic-queue-section">
        <div className="queue-section-heading"><strong>Up next</strong><span>{automaticQueue.length}</span></div>
        <div className="queue-list">
          {automaticQueue.length ? automaticQueue.map((song, index) => <button type="button" className="queue-item queue-default-item" key={`${song.id}:${index}`} onClick={() => onPlayDefaultSong(song)}>
            <span className="queue-index">{index + 1}</span><TrackCover song={song} />
            <span className="queue-copy"><strong>{song.title}</strong><small>{song.artist || 'Unknown artist'} · {song.album || song.title}</small></span>
          </button>) : <div className="queue-empty"><Music2 size={18} /><span>No songs coming up.</span></div>}
        </div>
      </section>
    </> : <>
      {currentSong && <div className="queue-current"><TrackCover song={currentSong} /><span><small>Now playing</small><strong>{currentSong.title}</strong><em>{currentSong.artist || 'Unknown artist'}</em></span></div>}
      <div className="queue-toolbar">
        <button type="button" disabled={!currentSong && !nextUp.length && !later.length} onClick={onSave}><Save size={15} /> Save as playlist</button>
        <button type="button" disabled={!nextUp.length && !later.length} onClick={onClear}><Trash2 size={15} /> Clear</button>
      </div>
      {renderSection('next', 'Next up', nextUp)}
      {renderSection('later', 'Later', later)}
    </>}
  </aside>
}
