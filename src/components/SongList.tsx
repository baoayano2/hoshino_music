import { Clock3, Download, Heart, ListPlus, MoreHorizontal, Pencil, Play, Trash2, XCircle } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { MusicTrack, PlaylistRecord } from '../types'
import { useOnlineAudioDuration } from '../online-duration'
import { ContextMenu } from './ContextMenu'
import { TrackCover } from './TrackCover'

const VIRTUAL_ROW_HEIGHT = 62
const VIRTUAL_OVERSCAN = 5
const VIRTUAL_THRESHOLD = 40

type SongListProps = {
  songs: MusicTrack[]
  currentSongId: string | null
  isPlaying: boolean
  emptyMessage: string
  onPlaySong: (id: string) => void
  onEditSong: (song: MusicTrack) => void
  onDeleteSong: (song: MusicTrack) => void
  onRemoveSong?: (song: MusicTrack) => void
  onDownloadSong?: (song: MusicTrack) => void
  playlists?: PlaylistRecord[]
  onAddToPlaylist?: (song: MusicTrack, playlistId: string) => void
  onlineAvailable?: boolean
  showOnlineLabel?: boolean
  onReorder?: (sourceId: string, targetId: string, edge: 'before' | 'after') => void
  onToggleFavorite?: (song: MusicTrack) => void
  onPlayNext?: (song: MusicTrack) => void
  onAddToQueue?: (song: MusicTrack) => void
}

export function SongList({ songs, currentSongId, isPlaying, emptyMessage, onPlaySong, onEditSong, onDeleteSong, onRemoveSong, onDownloadSong, playlists = [], onAddToPlaylist, onlineAvailable = true, showOnlineLabel = true, onReorder, onToggleFavorite, onPlayNext, onAddToQueue }: SongListProps) {
  const [openSongId, setOpenSongId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ song: MusicTrack, x: number, y: number } | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string, edge: 'before' | 'after' } | null>(null)
  const virtual = songs.length > VIRTUAL_THRESHOLD
  const viewportHeight = Math.min(620, songs.length * VIRTUAL_ROW_HEIGHT)
  const virtualRange = useMemo(() => {
    if (!virtual) return { start: 0, end: songs.length }
    const visibleRows = Math.ceil(viewportHeight / VIRTUAL_ROW_HEIGHT)
    const start = Math.max(0, Math.floor(scrollTop / VIRTUAL_ROW_HEIGHT) - VIRTUAL_OVERSCAN)
    const end = Math.min(songs.length, start + visibleRows + VIRTUAL_OVERSCAN * 2)
    return { start, end }
  }, [scrollTop, songs.length, viewportHeight, virtual])
  const visibleSongs = virtual ? songs.slice(virtualRange.start, virtualRange.end) : songs

  useEffect(() => {
    const closeMenu = () => setOpenSongId(null)
    window.addEventListener('click', closeMenu)
    return () => window.removeEventListener('click', closeMenu)
  }, [])

  useEffect(() => {
    setScrollTop(0)
  }, [songs])

  const toggleSongMenu = useCallback((id: string) => setOpenSongId((current) => current === id ? null : id), [])
  const closeSongMenu = useCallback(() => setOpenSongId(null), [])
  const openContextMenu = useCallback((song: MusicTrack, x: number, y: number) => {
    setOpenSongId(null)
    setContextMenu({ song, x, y })
  }, [])

  if (!songs.length) return <div className="empty-state">{emptyMessage}</div>

  return (
    <div className="song-table">
      <div className="song-row song-header">
        <span>#</span><span>Title</span><span>Album</span><span><Clock3 size={15} /></span><span />
      </div>
      <div className={virtual ? 'song-virtual-scroll' : undefined} style={virtual ? { height: viewportHeight } : undefined} onScroll={virtual ? (event) => setScrollTop(event.currentTarget.scrollTop) : undefined}>
        <div className={virtual ? 'song-virtual-spacer' : undefined} style={virtual ? { height: songs.length * VIRTUAL_ROW_HEIGHT } : undefined}>
          {visibleSongs.map((song, visibleIndex) => {
            const index = virtualRange.start + visibleIndex
            return <SongRow
              key={song.id}
              song={song}
              index={index}
              active={song.id === currentSongId}
              isPlaying={isPlaying}
              disabledOnline={song.isOnline === true && !onlineAvailable}
              menuOpen={openSongId === song.id}
              virtualStyle={virtual ? { transform: `translateY(${index * VIRTUAL_ROW_HEIGHT}px)` } : undefined}
              onPlaySong={onPlaySong}
              onEditSong={onEditSong}
              onDeleteSong={onDeleteSong}
              onRemoveSong={onRemoveSong}
              onDownloadSong={onDownloadSong}
              showOnlineLabel={showOnlineLabel}
              onToggleMenu={toggleSongMenu}
              onCloseMenu={closeSongMenu}
              onContextMenu={openContextMenu}
              draggable={Boolean(onReorder)}
              dragging={draggingId === song.id}
              dropEdge={dropTarget?.id === song.id ? dropTarget.edge : null}
              onDragStart={() => setDraggingId(song.id)}
              onDragEnd={() => { setDraggingId(null); setDropTarget(null) }}
              onDragOver={(edge) => setDropTarget({ id: song.id, edge })}
              onDrop={() => {
                if (draggingId && draggingId !== song.id) onReorder?.(draggingId, song.id, dropTarget?.id === song.id ? dropTarget.edge : 'before')
                setDraggingId(null)
                setDropTarget(null)
              }}
              onToggleFavorite={onToggleFavorite}
            />
          })}
        </div>
      </div>
      {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} items={[
        { label: 'Play song', icon: <span className="context-play-icon">▶</span>, onSelect: () => onPlaySong(contextMenu.song.id) },
        ...(onPlayNext ? [{ label: 'Play next', icon: <Play size={15} />, onSelect: () => onPlayNext(contextMenu.song) }] : []),
        ...(onAddToQueue ? [{ label: 'Add to queue', icon: <ListPlus size={15} />, onSelect: () => onAddToQueue(contextMenu.song) }] : []),
        ...(onToggleFavorite ? [{ label: contextMenu.song.favorite ? 'Remove from Liked songs' : 'Add to Liked songs', icon: <Heart size={15} fill={contextMenu.song.favorite ? 'currentColor' : 'none'} />, onSelect: () => onToggleFavorite(contextMenu.song) }] : []),
        ...(contextMenu.song.isOnline && onDownloadSong ? [{ label: 'Download', icon: <Download size={15} />, onSelect: () => onDownloadSong(contextMenu.song) }] : []),
        ...(onAddToPlaylist ? [{
          label: 'Add to playlist',
          icon: <ListPlus size={15} />,
          children: playlists
            .filter((playlist) => !playlist.songIds.includes(contextMenu.song.id))
            .map((playlist) => ({ label: playlist.name, icon: <ListPlus size={15} />, onSelect: () => onAddToPlaylist(contextMenu.song, playlist.id) })),
        }] : []),
        { label: 'Edit song', icon: <Pencil size={15} />, onSelect: () => onEditSong(contextMenu.song) },
        ...(onRemoveSong ? [{ label: 'Remove from playlist', icon: <XCircle size={15} />, onSelect: () => onRemoveSong(contextMenu.song) }] : []),
        { label: 'Delete song', icon: <Trash2 size={15} />, danger: true, onSelect: () => onDeleteSong(contextMenu.song) },
      ]} />}
    </div>
  )
}

type SongRowProps = {
  song: MusicTrack
  index: number
  active: boolean
  isPlaying: boolean
  disabledOnline: boolean
  menuOpen: boolean
  virtualStyle?: CSSProperties
  onPlaySong: (id: string) => void
  onEditSong: (song: MusicTrack) => void
  onDeleteSong: (song: MusicTrack) => void
  onRemoveSong?: (song: MusicTrack) => void
  onDownloadSong?: (song: MusicTrack) => void
  showOnlineLabel: boolean
  onToggleMenu: (id: string) => void
  onCloseMenu: () => void
  onContextMenu: (song: MusicTrack, x: number, y: number) => void
  draggable: boolean
  dragging: boolean
  dropEdge: 'before' | 'after' | null
  onDragStart: () => void
  onDragEnd: () => void
  onDragOver: (edge: 'before' | 'after') => void
  onDrop: () => void
  onToggleFavorite?: (song: MusicTrack) => void
}

const SongRow = memo(function SongRow({ song, index, active, isPlaying, disabledOnline, menuOpen, virtualStyle, onPlaySong, onEditSong, onDeleteSong, onRemoveSong, onDownloadSong, showOnlineLabel, onToggleMenu, onCloseMenu, onContextMenu, draggable, dragging, dropEdge, onDragStart, onDragEnd, onDragOver, onDrop, onToggleFavorite }: SongRowProps) {
  const playSong = () => { if (!disabledOnline) onPlaySong(song.id) }

  return (
    <div className={`song-row ${virtualStyle ? 'virtualized' : ''} ${active ? 'active' : ''} ${disabledOnline ? 'disabled' : ''} ${draggable ? 'reorderable' : ''} ${dragging ? 'dragging' : ''} ${dropEdge ? `drop-${dropEdge}` : ''}`} style={virtualStyle} role="button" tabIndex={0} aria-disabled={disabledOnline} draggable={draggable} onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', song.id); onDragStart() }} onDragEnd={onDragEnd} onDragOver={(event) => { if (draggable) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; const bounds = event.currentTarget.getBoundingClientRect(); onDragOver(event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after') } }} onDrop={(event) => { event.preventDefault(); onDrop() }} onClick={playSong} onContextMenu={(event) => { event.preventDefault(); onContextMenu(song, event.clientX, event.clientY) }} onKeyDown={(event) => { if (event.key === 'Enter') playSong() }}>
      <span className="song-index">{active && isPlaying ? <span className="playing-bars"><i /><i /><i /></span> : index + 1}</span>
      <span className="song-info">
        <TrackCover song={song} />
        <span>
          <strong className="song-title-line"><span className="song-title-text">{song.title}</span>{song.isOnline && showOnlineLabel && <i className="song-online-badge">Online</i>}</strong>
          <small>{disabledOnline ? 'Offline unavailable' : song.artist || 'Unknown artist'}</small>
        </span>
      </span>
      <span className="album-name">{song.album || song.title}</span>
      <SongDuration song={song} />
      <span className="song-actions" onClick={(event) => event.stopPropagation()}>
        {onToggleFavorite && <button className={`song-favorite-button ${song.favorite ? 'active' : ''}`} aria-label={song.favorite ? `Remove ${song.title} from Liked songs` : `Add ${song.title} to Liked songs`} onClick={() => onToggleFavorite(song)}><Heart size={17} fill={song.favorite ? 'currentColor' : 'none'} /></button>}
        <button aria-label={`Actions for ${song.title}`} onClick={(event) => { event.stopPropagation(); onToggleMenu(song.id) }}><MoreHorizontal size={19} /></button>
        {menuOpen && <span className="song-action-menu" onClick={(event) => event.stopPropagation()}>
          {song.isOnline && onDownloadSong && <button onClick={() => { onCloseMenu(); onDownloadSong(song) }}><Download size={14} /> Download</button>}
          <button onClick={() => { onCloseMenu(); onEditSong(song) }}><Pencil size={14} /> Edit song</button>
          {onRemoveSong && <button onClick={() => { onCloseMenu(); onRemoveSong(song) }}><XCircle size={14} /> Remove from playlist</button>}
          <button className="danger" onClick={() => { onCloseMenu(); onDeleteSong(song) }}><Trash2 size={14} /> Delete song</button>
        </span>}
      </span>
    </div>
  )
})

function SongDuration({ song }: { song: MusicTrack }) {
  const onlineUrl = song.isOnline ? song.sourceUrl || song.audioUrl : ''
  const onlineDuration = useOnlineAudioDuration(onlineUrl, song.duration)
  const duration = song.duration && song.duration > 0 ? song.duration : onlineDuration
  return <span className="song-duration">{duration && duration > 0 ? formatTime(duration) : '--:--'}</span>
}

export function SongListSkeleton({ rows = 7 }: { rows?: number }) {
  return (
    <div className="song-table song-table-loading" aria-hidden="true">
      <div className="song-row song-header">
        <span>#</span><span>Title</span><span>Album</span><span><Clock3 size={15} /></span><span />
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div className="song-row song-skeleton-row" key={index}>
          <span className="song-skeleton song-skeleton-index" />
          <span className="song-info">
            <span className="song-skeleton song-skeleton-cover" />
            <span className="song-skeleton-copy">
              <span className="song-skeleton song-skeleton-title" />
              <span className="song-skeleton song-skeleton-artist" />
            </span>
          </span>
          <span className="song-skeleton song-skeleton-album" />
          <span className="song-skeleton song-skeleton-duration" />
          <span />
        </div>
      ))}
    </div>
  )
}

export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`
}
