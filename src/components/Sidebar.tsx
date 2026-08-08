import { ChevronDown, Clock3, Compass, Folder, FolderOpen, Headphones, Heart, History, Library, Pencil, Play, Plus, Settings, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { FaSpotify } from 'react-icons/fa'
import type { PlaylistFolderRecord, PlaylistRecord, SpotifyHomeCard } from '../types'
import { resolveSpotifyImageUrl } from '../spotify-image'
import { ContextMenu } from './ContextMenu'
import { PlaylistCover } from './PlaylistCover'

type SidebarProps = {
  playlists: PlaylistRecord[]
  folders: PlaylistFolderRecord[]
  spotifyPlaylists: SpotifyHomeCard[]
  activeSpotifyPlaylistUri: string | null
  activeView: 'library' | 'liked' | 'recently-played' | 'recently-added' | 'discovery' | 'spotify-discovery'
  activePlaylistId: string | null
  extendedLibraryEnabled: boolean
  likedSongsCount: number
  onSelectLibrary: () => void
  onSelectLiked: () => void
  onSelectRecentlyPlayed: () => void
  onSelectRecentlyAdded: () => void
  onSelectHoshinoDiscovery: () => void
  onSelectSpotifyDiscovery: () => void
  onSelectPlaylist: (id: string) => void
  onSelectSpotifyPlaylist: (playlist: SpotifyHomeCard) => void
  onCreatePlaylist: () => void
  onEditPlaylist: (id: string) => void
  onDeletePlaylist: (id: string) => void
  onEditFolder: (id: string) => void
  onDeleteFolder: (id: string) => void
  onPlayPlaylist: (id: string) => void
  onMovePlaylistToFolder: (playlistId: string, folderId: string | null) => void
  onOpenSettings: () => void
  settingsOpen: boolean
}

const PLAYLIST_DRAG_TYPE = 'application/x-hoshino-playlist'

export function Sidebar({ playlists, folders, spotifyPlaylists, activeSpotifyPlaylistUri, activeView, activePlaylistId, extendedLibraryEnabled, likedSongsCount, onSelectLibrary, onSelectLiked, onSelectRecentlyPlayed, onSelectRecentlyAdded, onSelectHoshinoDiscovery, onSelectSpotifyDiscovery, onSelectPlaylist, onSelectSpotifyPlaylist, onCreatePlaylist, onEditPlaylist, onDeletePlaylist, onEditFolder, onDeleteFolder, onPlayPlaylist, onMovePlaylistToFolder, onOpenSettings, settingsOpen }: SidebarProps) {
  const [contextMenu, setContextMenu] = useState<{ playlist: PlaylistRecord, x: number, y: number } | null>(null)
  const [folderContextMenu, setFolderContextMenu] = useState<{ folder: PlaylistFolderRecord, playlists: PlaylistRecord[], open: boolean, x: number, y: number } | null>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({})
  const [discoveryOpen, setDiscoveryOpen] = useState(activeView === 'discovery' || activeView === 'spotify-discovery')
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)
  const draggingPlaylistIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (activeView === 'discovery' || activeView === 'spotify-discovery') setDiscoveryOpen(true)
    if (extendedLibraryEnabled && (activeView === 'liked' || activeView === 'recently-played' || activeView === 'recently-added')) setLibraryOpen(true)
    if (!extendedLibraryEnabled) setLibraryOpen(false)
  }, [activeView, extendedLibraryEnabled])
  const rootPlaylists = useMemo(() => playlists.filter((playlist) => !playlist.folderId), [playlists])
  const playlistsByFolder = useMemo(() => new Map(folders.map((folder) => [folder.id, playlists.filter((playlist) => playlist.folderId === folder.id)])), [folders, playlists])
  const leaveFolderContext = () => setSelectedFolderId(null)
  const readDragPlaylistId = (event: DragEvent) => event.dataTransfer.getData(PLAYLIST_DRAG_TYPE) || event.dataTransfer.getData('text/plain')
  const startPlaylistDrag = (event: DragEvent, playlistId: string) => {
    draggingPlaylistIdRef.current = playlistId
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(PLAYLIST_DRAG_TYPE, playlistId)
    event.dataTransfer.setData('text/plain', playlistId)
  }
  const finishPlaylistDrag = () => {
    draggingPlaylistIdRef.current = null
    setDragOverFolderId(null)
  }
  const moveToFolder = (event: DragEvent, folderId: string | null) => {
    event.preventDefault()
    event.stopPropagation()
    const playlistId = draggingPlaylistIdRef.current || readDragPlaylistId(event)
    finishPlaylistDrag()
    if (!playlistId) return
    const playlist = playlists.find((item) => item.id === playlistId)
    if (!playlist || (playlist.folderId ?? null) === folderId) return
    onMovePlaylistToFolder(playlistId, folderId)
  }
  const allowDrop = (event: DragEvent, folderId: string | null) => {
    const playlistId = draggingPlaylistIdRef.current || readDragPlaylistId(event)
    if (!playlistId) return
    const playlist = playlists.find((item) => item.id === playlistId)
    if (!playlist || (playlist.folderId ?? null) === folderId) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }
  const renderPlaylist = (playlist: PlaylistRecord) => (
    <button
      className={`playlist-item ${activePlaylistId === playlist.id ? 'active' : ''}`}
      key={playlist.id}
      aria-label={playlist.name}
      draggable
      onDragStart={(event) => startPlaylistDrag(event, playlist.id)}
      onDragEnd={finishPlaylistDrag}
      onClick={() => {
        setSelectedFolderId((current) => {
          if (playlist.folderId) return playlist.folderId
          if (current && (openFolders[current] ?? true)) return current
          return null
        })
        onSelectPlaylist(playlist.id)
      }}
      onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); setContextMenu({ playlist, x: event.clientX, y: event.clientY }) }}
    >
      <PlaylistCover playlist={playlist} className="playlist-icon" />
      <span className="playlist-copy"><strong>{playlist.name}</strong><small>{playlist.songIds.length} songs</small></span>
    </button>
  )

  return (
    <aside className="sidebar">
      <div className="brand"><img className="brand-mark" src="./logo.jpg" alt="Hoshino Logo" /><div><strong>Hoshino</strong><span>music for your heart</span></div></div>
      <nav className="main-nav" aria-label="Main navigation">
        <button className={`nav-item ${activeView === 'library' || extendedLibraryEnabled && (activeView === 'liked' || activeView === 'recently-played' || activeView === 'recently-added') ? 'active' : ''} ${extendedLibraryEnabled && libraryOpen ? 'expanded' : ''}`} onClick={() => {
          leaveFolderContext()
          if (extendedLibraryEnabled && activeView === 'library' && activePlaylistId === null) setLibraryOpen((open) => !open)
          else setLibraryOpen(false)
          onSelectLibrary()
        }} aria-expanded={extendedLibraryEnabled ? libraryOpen : undefined} title="Library"><Library size={20} /><span className="nav-label">Library</span>{extendedLibraryEnabled && <ChevronDown className={`discovery-chevron ${libraryOpen ? 'open' : ''}`} size={16} />}</button>
        {extendedLibraryEnabled && libraryOpen && <div className="discovery-submenu">
          <button className={`discovery-submenu-item ${activeView === 'liked' ? 'active' : ''}`} onClick={onSelectLiked}><Heart size={16} fill={activeView === 'liked' ? 'currentColor' : 'none'} /><span>Liked songs</span></button>
          <button className={`discovery-submenu-item ${activeView === 'recently-played' ? 'active' : ''}`} onClick={onSelectRecentlyPlayed}><History size={16} /><span>Recently played</span></button>
          <button className={`discovery-submenu-item ${activeView === 'recently-added' ? 'active' : ''}`} onClick={onSelectRecentlyAdded}><Clock3 size={16} /><span>Recently added</span></button>
        </div>}
        <button className={`nav-item ${activeView === 'discovery' || activeView === 'spotify-discovery' ? 'active' : ''} ${discoveryOpen ? 'expanded' : ''}`} onClick={() => { leaveFolderContext(); setDiscoveryOpen((open) => !open) }} aria-expanded={discoveryOpen} title="Discovery"><Compass size={20} /><span className="nav-label">Discovery</span><ChevronDown className={`discovery-chevron ${discoveryOpen ? 'open' : ''}`} size={16} /></button>
        {discoveryOpen && <div className="discovery-submenu">
          <button className={`discovery-submenu-item ${activeView === 'discovery' ? 'active' : ''}`} onClick={onSelectHoshinoDiscovery} title="Hoshino Music"><Headphones size={16} /><span>Hoshino Music</span></button>
          <button className={`discovery-submenu-item ${activeView === 'spotify-discovery' ? 'active' : ''}`} onClick={onSelectSpotifyDiscovery} title="Spotify"><FaSpotify size={16} /><span>Spotify</span></button>
        </div>}
        <button className={`nav-item ${settingsOpen ? 'active' : ''}`} onClick={() => { leaveFolderContext(); onOpenSettings() }}><Settings size={20} /><span className="nav-label">Settings</span></button>
      </nav>
      <div className="playlist-heading"><span>Your playlists</span><button aria-label="Create playlist or folder" onClick={onCreatePlaylist}><Plus size={15} /></button></div>
      <div
        className={`playlist-list ${dragOverFolderId === 'root' ? 'drag-over' : ''}`}
        onDragOver={(event) => {
          if (event.target !== event.currentTarget) return
          allowDrop(event, null)
          if (event.defaultPrevented) setDragOverFolderId('root')
        }}
        onDragLeave={() => setDragOverFolderId(null)}
        onDrop={(event) => moveToFolder(event, null)}
      >
        {!extendedLibraryEnabled && <button type="button" className={`playlist-item liked-playlist-item ${activeView === 'liked' ? 'active' : ''}`} onClick={onSelectLiked}>
          <span className="playlist-icon liked-playlist-icon"><Heart size={19} fill="currentColor" /></span>
          <span className="playlist-copy"><strong>Liked songs</strong><small>{likedSongsCount} songs</small></span>
        </button>}
        {folders.map((folder) => {
          const folderPlaylists = playlistsByFolder.get(folder.id) ?? []
          const open = openFolders[folder.id] ?? true
          const active = open && (selectedFolderId === folder.id || folderPlaylists.some((playlist) => playlist.id === activePlaylistId))
          return <div
            className={`playlist-folder ${active ? 'active' : ''} ${open ? '' : 'collapsed'} ${dragOverFolderId === folder.id ? 'drag-over' : ''}`}
            key={folder.id}
            onDragOver={(event) => { event.stopPropagation(); allowDrop(event, folder.id); if (event.defaultPrevented) setDragOverFolderId(folder.id) }}
            onDragLeave={() => setDragOverFolderId(null)}
            onDrop={(event) => moveToFolder(event, folder.id)}
            onContextMenu={(event) => { event.preventDefault(); setFolderContextMenu({ folder, playlists: folderPlaylists, open, x: event.clientX, y: event.clientY }) }}
          >
            <button className="playlist-folder-toggle" onClick={() => { setSelectedFolderId(open ? null : folder.id); setOpenFolders((current) => ({ ...current, [folder.id]: !open })) }}>
              {open ? <FolderOpen size={18} /> : <Folder size={18} />}
              <span className="playlist-copy"><strong>{folder.name}</strong><small>{folderPlaylists.length} playlists</small></span>
            </button>
            {open && <div className="playlist-folder-items">{folderPlaylists.map(renderPlaylist)}</div>}
          </div>
        })}
        {rootPlaylists.map(renderPlaylist)}
        {spotifyPlaylists.map((playlist) => <button type="button" className={`playlist-item ${activeSpotifyPlaylistUri === playlist.uri ? 'active' : ''}`} key={`spotify:${playlist.uri}`} onClick={() => onSelectSpotifyPlaylist({ ...playlist })}>
          {playlist.imageUrl ? <img className="playlist-icon" src={resolveSpotifyImageUrl(playlist.imageUrl)} alt="" /> : <span className="playlist-icon"><FaSpotify size={18} /></span>}
          <span className="playlist-copy"><strong>{playlist.title}</strong><small>{playlist.subtitle}</small></span>
        </button>)}
      </div>
      {extendedLibraryEnabled && !playlists.length && !spotifyPlaylists.length && <div className="sidebar-card"><strong>Your space</strong><p>Import music and build playlists that stay on this computer.</p><button onClick={onCreatePlaylist}>New playlist</button></div>}
      {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} items={[
        { label: 'Open playlist', icon: <Library size={15} />, onSelect: () => onSelectPlaylist(contextMenu.playlist.id) },
        { label: 'Play playlist', icon: <Play size={15} />, onSelect: () => onPlayPlaylist(contextMenu.playlist.id) },
        ...(contextMenu.playlist.folderId ? [{ label: 'Move out of folder', icon: <FolderOpen size={15} />, onSelect: () => onMovePlaylistToFolder(contextMenu.playlist.id, null) }] : []),
        { label: 'Edit playlist', icon: <Pencil size={15} />, onSelect: () => onEditPlaylist(contextMenu.playlist.id) },
        { label: 'Delete playlist', icon: <Trash2 size={15} />, danger: true, onSelect: () => onDeletePlaylist(contextMenu.playlist.id) },
      ]} />}
      {folderContextMenu && <ContextMenu x={folderContextMenu.x} y={folderContextMenu.y} onClose={() => setFolderContextMenu(null)} items={[
        {
          label: folderContextMenu.open ? 'Collapse folder' : 'Open folder',
          icon: folderContextMenu.open ? <Folder size={15} /> : <FolderOpen size={15} />,
          onSelect: () => {
            setSelectedFolderId(folderContextMenu.open ? null : folderContextMenu.folder.id)
            setOpenFolders((current) => ({ ...current, [folderContextMenu.folder.id]: !folderContextMenu.open }))
          },
        },
        ...(folderContextMenu.playlists[0] ? [{ label: 'Play first playlist', icon: <Play size={15} />, onSelect: () => onPlayPlaylist(folderContextMenu.playlists[0].id) }] : []),
        { label: 'New playlist or folder', icon: <Plus size={15} />, onSelect: onCreatePlaylist },
        { label: 'Edit folder', icon: <Pencil size={15} />, onSelect: () => onEditFolder(folderContextMenu.folder.id) },
        ...(folderContextMenu.playlists.length ? [{
          label: 'Move playlists out',
          icon: <FolderOpen size={15} />,
          onSelect: () => folderContextMenu.playlists.forEach((playlist) => onMovePlaylistToFolder(playlist.id, null)),
        }] : []),
        { label: 'Delete folder', icon: <Trash2 size={15} />, danger: true, onSelect: () => onDeleteFolder(folderContextMenu.folder.id) },
      ]} />}
    </aside>
  )
}
