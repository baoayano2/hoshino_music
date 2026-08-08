import { Check, Download, FileText, Image, ImagePlus, Pencil, Plus, RotateCcw, Trash2, Upload, X } from 'lucide-react'
import { type DragEvent, type FormEvent, useState } from 'react'
import type { AudioFileSelection, CreatePlaylistFolderInput, CreatePlaylistInput, DiscoverySong, ImageBlob, ImageOptimizeOptions, ImagePurpose, ImportMusicInput, MusicTrack, PlaylistFolderRecord, PlaylistRecord, UpdateMusicInput, UpdatePlaylistFolderInput, UpdatePlaylistInput } from '../types'

type BaseModalProps = { onClose: () => void }

export function ImportMusicModal({ onClose, onSubmit, onBulkSubmit }: BaseModalProps & { onSubmit: (input: ImportMusicInput) => Promise<void>, onBulkSubmit: (inputs: ImportMusicInput[]) => Promise<void> }) {
  const [mode, setMode] = useState<'single' | 'multiple'>('single')
  const [form, setForm] = useState<ImportMusicInput>({ sourcePath: '', coverBlob: null, title: '', artist: '', album: '', genre: '', year: '', lyrics: '', duration: 0 })
  const [bulkFiles, setBulkFiles] = useState<AudioFileSelection[]>([])
  const [draggingFiles, setDraggingFiles] = useState(false)
  const [saving, setSaving] = useState(false)

  const applySingleSelection = (selection: AudioFileSelection) => {
    setForm((value) => ({
      ...value,
      sourcePath: selection.sourcePath,
      title: value.title || selection.title,
      artist: value.artist || selection.artist,
      album: value.album || selection.album,
      genre: value.genre || selection.genre,
      year: value.year || selection.year,
      coverBlob: value.coverBlob || selection.coverBlob,
    }))
  }
  const applyDroppedSelections = (selections: AudioFileSelection[]) => {
    if (!selections.length) return
    if (selections.length === 1 && mode === 'single') {
      applySingleSelection(selections[0])
      return
    }
    setMode('multiple')
    setBulkFiles(selections)
  }
  const chooseFile = async () => {
    const selection = await window.electronApi?.selectAudioFile()
    if (selection) applySingleSelection(selection)
  }
  const chooseCover = async () => {
    const coverBlob = await window.electronApi?.selectCoverFile('song', { cropSquare: true })
    if (coverBlob) setForm((value) => ({ ...value, coverBlob }))
  }
  const dropCover = async (paths: string[]) => {
    const coverBlob = await readDroppedCover(paths, 'song', { cropSquare: true })
    if (coverBlob) setForm((value) => ({ ...value, coverBlob }))
  }
  const chooseLyrics = async () => {
    const lyrics = await window.electronApi?.selectLyricsFile()
    if (lyrics) setForm((value) => ({ ...value, lyrics }))
  }
  const dropLyrics = async (paths: string[]) => {
    const firstPath = paths.find((filePath) => filePath.toLowerCase().endsWith('.lrc'))
    if (!firstPath) return
    const lyrics = await window.electronApi?.readDroppedLyricsFile(firstPath)
    if (lyrics) setForm((value) => ({ ...value, lyrics }))
  }
  const chooseFiles = async () => {
    const selections = await window.electronApi?.selectAudioFiles()
    if (selections?.length) setBulkFiles(selections)
  }
  const readDroppedFiles = async (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    setDraggingFiles(false)
    const paths = window.electronApi?.getDroppedFilePaths([...event.dataTransfer.files]) ?? []
    if (!paths.length) return
    const selections = await window.electronApi?.readDroppedAudioFiles(paths)
    if (selections?.length) applyDroppedSelections(selections)
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      await onSubmit(form)
    } finally {
      setSaving(false)
    }
  }
  const submitBulk = async (event: FormEvent) => {
    event.preventDefault()
    const inputs = bulkFiles.map(selectionToImportInput)
    setSaving(true)
    try {
      await onBulkSubmit(inputs)
    } finally {
      setSaving(false)
    }
  }

  return <Modal title="Import music" subtitle="Add the track file and its metadata." onClose={onClose}>
    <div className="import-modal-layout">
    <div className="modal-segmented" role="tablist" aria-label="Import mode">
      <button type="button" className={mode === 'single' ? 'active' : ''} aria-selected={mode === 'single'} onClick={() => setMode('single')}>Single file</button>
      <button type="button" className={mode === 'multiple' ? 'active' : ''} aria-selected={mode === 'multiple'} onClick={() => setMode('multiple')}>Multiple files</button>
    </div>
    <button
      type="button"
      className={`import-drop-zone ${draggingFiles ? 'dragging' : ''}`}
      onClick={() => void (mode === 'single' ? chooseFile() : chooseFiles())}
      onDragEnter={(event) => { event.preventDefault(); setDraggingFiles(true) }}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDraggingFiles(false) }}
      onDrop={(event) => void readDroppedFiles(event)}
    >
      <Upload size={20} />
      <span>{mode === 'single' ? form.sourcePath || 'Choose or drag an audio file' : bulkFiles.length ? `${bulkFiles.length} audio files selected` : 'Choose or drag audio files'}</span>
      <small>Drop one file for Single file, or multiple files to switch to Multiple files.</small>
    </button>
    {mode === 'single'
      ? <form className="modal-form" onSubmit={submit}>
        <DropFileButton className="cover-drop-zone" icon={<ImagePlus size={20} />} label={form.coverBlob?.name || 'Choose or drag an optional cover image'} hint="Drop a JPG, PNG, WEBP, or GIF cover here." onClick={chooseCover} onDropFiles={dropCover} />
        <DropFileButton className="cover-drop-zone" icon={<FileText size={20} />} label={form.lyrics ? 'LRC lyrics attached' : 'Choose or drag optional LRC lyrics'} hint="Drop a .lrc file to sync lyrics with playback." onClick={chooseLyrics} onDropFiles={dropLyrics} />
        <Field label="Song title" value={form.title} required onChange={(title) => setForm({ ...form, title })} />
        <Field label="Artist" value={form.artist} required onChange={(artist) => setForm({ ...form, artist })} />
        <Field label="Album" value={form.album} onChange={(album) => setForm({ ...form, album })} />
        <div className="field-grid">
          <Field label="Genre" value={form.genre} onChange={(genre) => setForm({ ...form, genre })} />
          <Field label="Year" value={form.year} onChange={(year) => setForm({ ...form, year })} />
        </div>
        <button className="modal-primary" disabled={saving || !form.sourcePath || !form.title || !form.artist}>{saving ? 'Importing...' : 'Import track'}</button>
      </form>
      : <form className="modal-form" onSubmit={submitBulk}>
        <div className="bulk-import-list">
          {bulkFiles.length ? bulkFiles.map((file) => <div key={file.sourcePath} className="bulk-import-item">
            <span><strong>{file.title}</strong><small>{file.artist || 'Unknown Artist'}{file.album ? ` • ${file.album}` : ''}</small></span>
            {file.coverBlob && <Image size={16} />}
          </div>) : <p>Selected files will be imported with detected metadata and embedded covers.</p>}
        </div>
        <button className="modal-primary" disabled={saving || !bulkFiles.length}>{saving ? `Importing ${bulkFiles.length} tracks...` : 'Import all tracks'}</button>
      </form>}
    </div>
  </Modal>
}

function selectionToImportInput(selection: AudioFileSelection): ImportMusicInput {
  return {
    sourcePath: selection.sourcePath,
    coverBlob: selection.coverBlob,
    title: selection.title.trim() || selection.sourcePath.split(/[\\/]/).pop() || 'Untitled',
    artist: selection.artist.trim() || 'Unknown Artist',
    album: selection.album,
    genre: selection.genre,
    year: selection.year,
    duration: selection.duration,
  }
}

function DropFileButton({ icon, label, hint, className = '', onClick, onDropFiles }: { icon: React.ReactNode, label: string, hint: string, className?: string, onClick: () => void, onDropFiles: (paths: string[]) => Promise<void> | void }) {
  const [dragging, setDragging] = useState(false)
  const dropFiles = async (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    setDragging(false)
    const paths = window.electronApi?.getDroppedFilePaths([...event.dataTransfer.files]) ?? []
    if (paths.length) await onDropFiles(paths)
  }

  return <button
    type="button"
    className={`import-drop-zone ${className} ${dragging ? 'dragging' : ''}`}
    onClick={onClick}
    onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
    onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' }}
    onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false) }}
    onDrop={(event) => void dropFiles(event)}
  >
    {icon}
    <span>{label}</span>
    <small>{hint}</small>
  </button>
}

async function readDroppedCover(paths: string[], purpose: ImagePurpose, options?: ImageOptimizeOptions): Promise<ImageBlob | null> {
  const firstPath = paths[0]
  if (!firstPath) return null
  return window.electronApi?.readDroppedCoverFile(firstPath, purpose, options) ?? null
}

export function CreatePlaylistModal({ onClose, onSubmit, onCreateFolder }: BaseModalProps & { onSubmit: (input: CreatePlaylistInput) => Promise<void>, onCreateFolder: (input: CreatePlaylistFolderInput) => Promise<void> }) {
  const [mode, setMode] = useState<'playlist' | 'folder'>('playlist')
  const [form, setForm] = useState<CreatePlaylistInput>({ name: '', description: '', coverBlob: null, heroBlob: null })
  const [saving, setSaving] = useState(false)
  const chooseCover = async () => {
    const coverBlob = await window.electronApi?.selectCoverFile('playlist', { cropSquare: true })
    if (coverBlob) setForm((value) => ({ ...value, coverBlob }))
  }
  const chooseHero = async () => {
    const heroBlob = await window.electronApi?.selectCoverFile('playlist')
    if (heroBlob) setForm((value) => ({ ...value, heroBlob }))
  }
  const dropCover = async (paths: string[]) => {
    const coverBlob = await readDroppedCover(paths, 'playlist', { cropSquare: true })
    if (coverBlob) setForm((value) => ({ ...value, coverBlob }))
  }
  const dropHero = async (paths: string[]) => {
    const heroBlob = await readDroppedCover(paths, 'playlist')
    if (heroBlob) setForm((value) => ({ ...value, heroBlob }))
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    if (mode === 'folder') await onCreateFolder({ name: form.name })
    else await onSubmit(form)
    setSaving(false)
  }
  return <Modal title="New playlist" subtitle="Create a playlist or folder to organize your collection." onClose={onClose}>
    <form className="modal-form" onSubmit={submit}>
      <div className="modal-segmented">
        <button type="button" className={mode === 'playlist' ? 'active' : ''} onClick={() => setMode('playlist')}>Playlist</button>
        <button type="button" className={mode === 'folder' ? 'active' : ''} onClick={() => setMode('folder')}>Folder</button>
      </div>
      {mode === 'playlist' && <>
        <DropFileButton className="cover-drop-zone" icon={<ImagePlus size={20} />} label={form.coverBlob?.name || 'Choose or drag an optional playlist cover'} hint="Drop a square cover image here." onClick={chooseCover} onDropFiles={dropCover} />
        <DropFileButton className="cover-drop-zone" icon={<ImagePlus size={20} />} label={form.heroBlob?.name || 'Choose or drag an optional wide hero image'} hint="Drop a wide hero image here." onClick={chooseHero} onDropFiles={dropHero} />
      </>}
      <Field label={mode === 'folder' ? 'Folder name' : 'Playlist name'} value={form.name} required onChange={(name) => setForm({ ...form, name })} />
      {mode === 'playlist' && <label className="form-field"><span>Description</span><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>}
      <button className="modal-primary" disabled={saving || !form.name}><Plus size={18} /> {saving ? 'Creating...' : mode === 'folder' ? 'Create folder' : 'Create playlist'}</button>
    </form>
  </Modal>
}

export function SaveQueuePlaylistModal({ defaultName, onClose, onSubmit }: BaseModalProps & { defaultName: string, onSubmit: (name: string) => Promise<void> }) {
  const [name, setName] = useState(defaultName)
  const [saving, setSaving] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const playlistName = name.trim()
    if (!playlistName) return
    setSaving(true)
    await onSubmit(playlistName)
    setSaving(false)
  }
  return <Modal title="Save queue as playlist" subtitle="Create a playlist from the current song and every queued track." onClose={onClose}>
    <form className="modal-form" onSubmit={submit}>
      <Field label="Playlist name" value={name} required onChange={setName} />
      <button className="modal-primary" disabled={saving || !name.trim()}><Plus size={18} /> {saving ? 'Saving...' : 'Save playlist'}</button>
    </form>
  </Modal>
}

export function EditPlaylistFolderModal({ folder, onClose, onSubmit }: BaseModalProps & { folder: PlaylistFolderRecord, onSubmit: (input: UpdatePlaylistFolderInput) => Promise<void> }) {
  const [name, setName] = useState(folder.name)
  const [saving, setSaving] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    await onSubmit({ name })
    setSaving(false)
  }

  return <Modal title="Edit folder" subtitle="Rename this playlist folder." onClose={onClose}>
    <form className="modal-form" onSubmit={submit}>
      <Field label="Folder name" value={name} required onChange={setName} />
      <button className="modal-primary" disabled={saving || !name.trim()}><Pencil size={18} /> {saving ? 'Saving...' : 'Save folder'}</button>
    </form>
  </Modal>
}

export function EditPlaylistModal({ playlist, onClose, onSubmit }: BaseModalProps & { playlist: PlaylistRecord, onSubmit: (input: UpdatePlaylistInput) => Promise<void> }) {
  const [form, setForm] = useState<UpdatePlaylistInput>({ name: playlist.name, description: playlist.description, coverBlob: null, heroBlob: null })
  const [saving, setSaving] = useState(false)
  const chooseCover = async () => {
    const coverBlob = await window.electronApi?.selectCoverFile('playlist', { cropSquare: true })
    if (coverBlob) setForm((value) => ({ ...value, coverBlob }))
  }
  const chooseHero = async () => {
    const heroBlob = await window.electronApi?.selectCoverFile('playlist')
    if (heroBlob) setForm((value) => ({ ...value, heroBlob }))
  }
  const dropCover = async (paths: string[]) => {
    const coverBlob = await readDroppedCover(paths, 'playlist', { cropSquare: true })
    if (coverBlob) setForm((value) => ({ ...value, coverBlob }))
  }
  const dropHero = async (paths: string[]) => {
    const heroBlob = await readDroppedCover(paths, 'playlist')
    if (heroBlob) setForm((value) => ({ ...value, heroBlob }))
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    await onSubmit(form)
    setSaving(false)
  }

  return <Modal title="Edit playlist" subtitle="Update this playlist's details and cover." onClose={onClose}>
    <form className="modal-form" onSubmit={submit}>
      <DropFileButton className="cover-drop-zone" icon={<ImagePlus size={20} />} label={form.coverBlob?.name || 'Keep current cover or choose/drag a new image'} hint="Drop a square cover image here." onClick={chooseCover} onDropFiles={dropCover} />
      <DropFileButton className="cover-drop-zone" icon={<ImagePlus size={20} />} label={form.heroBlob?.name || 'Keep current hero or choose/drag a new wide image'} hint="Drop a wide hero image here." onClick={chooseHero} onDropFiles={dropHero} />
      <Field label="Playlist name" value={form.name} required onChange={(name) => setForm({ ...form, name })} />
      <label className="form-field"><span>Description</span><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
      <button className="modal-primary" disabled={saving || !form.name}>{saving ? 'Saving...' : 'Save changes'}</button>
    </form>
  </Modal>
}

export function EditMusicModal({ song, onClose, onSubmit }: BaseModalProps & { song: MusicTrack, onSubmit: (input: UpdateMusicInput) => Promise<void> }) {
  const [form, setForm] = useState<UpdateMusicInput>({ title: song.title, artist: song.artist, album: song.album, genre: song.genre, year: song.year, coverBlob: null, lyricsDelay: song.lyricsDelay ?? 0 })
  const [lyricsMode, setLyricsMode] = useState<'keep' | 'replace' | 'remove'>('keep')
  const [saving, setSaving] = useState(false)
  const hasLyrics = Boolean(song.lyrics?.trim() || song.lyricsUrl?.trim())
  const canTuneLyricsDelay = lyricsMode !== 'remove' && (hasLyrics || lyricsMode === 'replace')
  const lyricsLabel = lyricsMode === 'replace'
    ? 'New LRC lyrics attached'
    : lyricsMode === 'remove'
      ? 'Lyrics will be removed'
      : hasLyrics
        ? 'Keep current LRC lyrics or choose/drag a new file'
        : 'Choose or drag optional LRC lyrics'
  const chooseCover = async () => {
    const coverBlob = await window.electronApi?.selectCoverFile('song', { cropSquare: true })
    if (coverBlob) setForm((value) => ({ ...value, coverBlob }))
  }
  const chooseLyrics = async () => {
    const lyrics = await window.electronApi?.selectLyricsFile()
    if (lyrics) {
      setLyricsMode('replace')
      setForm((value) => ({ ...value, lyrics, removeLyrics: false }))
    }
  }
  const dropCover = async (paths: string[]) => {
    const coverBlob = await readDroppedCover(paths, 'song', { cropSquare: true })
    if (coverBlob) setForm((value) => ({ ...value, coverBlob }))
  }
  const dropLyrics = async (paths: string[]) => {
    const firstPath = paths[0]
    if (!firstPath) return
    const lyrics = await window.electronApi?.readDroppedLyricsFile(firstPath)
    if (lyrics) {
      setLyricsMode('replace')
      setForm((value) => ({ ...value, lyrics, removeLyrics: false }))
    }
  }
  const removeLyrics = () => {
    setLyricsMode('remove')
    setForm((value) => ({ ...value, lyrics: undefined, removeLyrics: true }))
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    await onSubmit(form)
    setSaving(false)
  }

  return <Modal title="Edit song" subtitle="Update this track's metadata and cover." onClose={onClose}>
    <form className="modal-form" onSubmit={submit}>
      <DropFileButton className="cover-drop-zone" icon={<ImagePlus size={20} />} label={form.coverBlob?.name || 'Keep current cover or choose/drag a new image'} hint="Drop a JPG, PNG, WEBP, or GIF cover here." onClick={chooseCover} onDropFiles={dropCover} />
      <div className="lyrics-edit-field">
        <DropFileButton className="cover-drop-zone lyrics-drop-zone" icon={<FileText size={20} />} label={lyricsLabel} hint="Drop a .lrc file to sync lyrics with playback." onClick={chooseLyrics} onDropFiles={dropLyrics} />
        {lyricsMode !== 'remove' && (hasLyrics || lyricsMode === 'replace') && <button type="button" className="lyrics-remove-button" aria-label="Remove lyrics" title="Remove lyrics" disabled={saving} onClick={removeLyrics}><Trash2 size={15} /></button>}
      </div>
      <Field label="Song title" value={form.title} required onChange={(title) => setForm({ ...form, title })} />
      <Field label="Artist" value={form.artist} required onChange={(artist) => setForm({ ...form, artist })} />
      <Field label="Album" value={form.album} onChange={(album) => setForm({ ...form, album })} />
      <div className="field-grid">
        <Field label="Genre" value={form.genre} onChange={(genre) => setForm({ ...form, genre })} />
        <Field label="Year" value={form.year} onChange={(year) => setForm({ ...form, year })} />
      </div>
      {canTuneLyricsDelay && <label className="form-field">
        <span>Lyrics delay</span>
        <input type="number" min="-30" max="30" step="0.1" value={form.lyricsDelay ?? 0} onChange={(event) => setForm({ ...form, lyricsDelay: Number(event.target.value) })} />
      </label>}
      <button className="modal-primary" disabled={saving || !form.title || !form.artist}>{saving ? 'Saving...' : 'Save changes'}</button>
    </form>
  </Modal>
}

export function AddSongModal({ songs, playlist, onClose, onSubmit }: BaseModalProps & { songs: MusicTrack[], playlist: PlaylistRecord, onSubmit: (songId: string) => Promise<void> }) {
  const available = songs.filter((song) => !playlist.songIds.includes(song.id))
  return <Modal title="Add songs" subtitle={`Add music to ${playlist.name}.`} onClose={onClose}>
    <div className="add-song-list">
      {available.length ? available.map((song) => <button key={song.id} onClick={() => onSubmit(song.id)}><span><strong>{song.title}</strong><small>{song.artist}</small></span><Plus size={18} /></button>) : <p>Every imported song is already in this playlist.</p>}
    </div>
  </Modal>
}

export function AddDiscoveryToPlaylistModal({ song, playlists, onClose, onSubmit }: BaseModalProps & { song: DiscoverySong, playlists: PlaylistRecord[], onSubmit: (playlistId: string) => Promise<void> }) {
  const [addingId, setAddingId] = useState<string | null>(null)
  const add = async (playlistId: string) => {
    setAddingId(playlistId)
    try {
      await onSubmit(playlistId)
    } finally {
      setAddingId(null)
    }
  }

  return <Modal title="Add to playlist" subtitle={`Choose where to save ${song.title}.`} onClose={onClose}>
    <div className="add-song-list">
      {playlists.length ? playlists.map((playlist) => <button key={playlist.id} disabled={addingId !== null} onClick={() => void add(playlist.id)}><span><strong>{playlist.name}</strong><small>{playlist.songIds.length} songs</small></span><Plus size={18} /></button>) : <p>Create a playlist first, then add this online song.</p>}
    </div>
  </Modal>
}

export function DeleteSongModal({ song, onClose, onConfirm }: BaseModalProps & { song: MusicTrack, onConfirm: () => Promise<void> }) {
  const [deleting, setDeleting] = useState(false)
  const confirmDelete = async () => {
    setDeleting(true)
    await onConfirm()
    setDeleting(false)
  }

  return <Modal title="Delete song?" subtitle="This action cannot be undone." onClose={onClose}>
    <div className="confirm-copy">
      <strong>{song.title}</strong>
      <p>The audio file, cover image, and every playlist reference will be permanently removed from this computer.</p>
    </div>
    <div className="modal-actions">
      <button className="modal-secondary" disabled={deleting} onClick={onClose}>Cancel</button>
      <button className="modal-danger" disabled={deleting} onClick={() => void confirmDelete()}><Trash2 size={16} /> {deleting ? 'Deleting...' : 'Delete song'}</button>
    </div>
  </Modal>
}

export function DeleteAllSongsModal({ songCount, onClose, onConfirm }: BaseModalProps & { songCount: number, onConfirm: () => Promise<void> }) {
  const [deleting, setDeleting] = useState(false)
  const confirmDelete = async () => {
    setDeleting(true)
    await onConfirm()
    setDeleting(false)
  }

  return <Modal title="Delete all songs?" subtitle="This action cannot be undone." onClose={onClose}>
    <div className="confirm-copy">
      <strong>{songCount} song{songCount === 1 ? '' : 's'} will be deleted</strong>
      <p>All library songs, online song records, local audio files, and playlist song references will be permanently removed. Playlists and folders will stay.</p>
    </div>
    <div className="modal-actions">
      <button className="modal-secondary" disabled={deleting} onClick={onClose}>Cancel</button>
      <button className="modal-danger" disabled={deleting || songCount === 0} onClick={() => void confirmDelete()}><Trash2 size={16} /> {deleting ? 'Deleting...' : 'Delete all songs'}</button>
    </div>
  </Modal>
}

export function DeleteAllPlaylistsModal({ playlistCount, onClose, onConfirm }: BaseModalProps & { playlistCount: number, onConfirm: () => Promise<void> }) {
  const [deleting, setDeleting] = useState(false)
  const confirmDelete = async () => {
    setDeleting(true)
    await onConfirm()
    setDeleting(false)
  }

  return <Modal title="Delete all playlists?" subtitle="This action cannot be undone." onClose={onClose}>
    <div className="confirm-copy">
      <strong>{playlistCount} playlist{playlistCount === 1 ? '' : 's'} will be deleted</strong>
      <p>All playlists and playlist hero images will be permanently removed. Songs and folders will stay in your library.</p>
    </div>
    <div className="modal-actions">
      <button className="modal-secondary" disabled={deleting} onClick={onClose}>Cancel</button>
      <button className="modal-danger" disabled={deleting || playlistCount === 0} onClick={() => void confirmDelete()}><Trash2 size={16} /> {deleting ? 'Deleting...' : 'Delete all playlists'}</button>
    </div>
  </Modal>
}

export function DeletePlaylistModal({ playlist, onClose, onConfirm }: BaseModalProps & { playlist: PlaylistRecord, onConfirm: () => Promise<void> }) {
  const [deleting, setDeleting] = useState(false)
  const confirmDelete = async () => {
    setDeleting(true)
    await onConfirm()
    setDeleting(false)
  }

  return <Modal title="Delete playlist?" subtitle="This action cannot be undone." onClose={onClose}>
    <div className="confirm-copy">
      <strong>{playlist.name}</strong>
      <p>The playlist and its cover will be permanently removed. Your imported songs will stay in the library.</p>
    </div>
    <div className="modal-actions">
      <button className="modal-secondary" disabled={deleting} onClick={onClose}>Cancel</button>
      <button className="modal-danger" disabled={deleting} onClick={() => void confirmDelete()}><Trash2 size={16} /> {deleting ? 'Deleting...' : 'Delete playlist'}</button>
    </div>
  </Modal>
}

export function DeletePlaylistFolderModal({ folder, playlistCount, onClose, onConfirm }: BaseModalProps & { folder: PlaylistFolderRecord, playlistCount: number, onConfirm: () => Promise<void> }) {
  const [deleting, setDeleting] = useState(false)
  const confirmDelete = async () => {
    setDeleting(true)
    await onConfirm()
    setDeleting(false)
  }

  return <Modal title="Delete folder?" subtitle="Playlists inside this folder will be kept." onClose={onClose}>
    <div className="confirm-copy">
      <strong>{folder.name}</strong>
      <p>{playlistCount > 0 ? `${playlistCount} playlist${playlistCount === 1 ? '' : 's'} will be moved out of this folder.` : 'This empty folder will be removed.'}</p>
    </div>
    <div className="modal-actions">
      <button className="modal-secondary" disabled={deleting} onClick={onClose}>Cancel</button>
      <button className="modal-danger" disabled={deleting} onClick={() => void confirmDelete()}><Trash2 size={16} /> {deleting ? 'Deleting...' : 'Delete folder'}</button>
    </div>
  </Modal>
}

export function ResetSettingsModal({ onClose, onConfirm }: BaseModalProps & { onConfirm: () => Promise<void> }) {
  const [resetting, setResetting] = useState(false)
  const confirmReset = async () => {
    setResetting(true)
    await onConfirm()
    setResetting(false)
  }

  return <Modal title="Reset settings?" subtitle="Your preferences will return to their defaults." onClose={onClose}>
    <div className="confirm-copy">
      <strong>Reset all settings</strong>
      <p>This resets general settings and Discord Rich Presence customization. Your music, playlists, and player state will stay unchanged.</p>
    </div>
    <div className="modal-actions">
      <button className="modal-secondary" disabled={resetting} onClick={onClose}>Cancel</button>
      <button className="modal-danger" disabled={resetting} onClick={() => void confirmReset()}><RotateCcw size={16} /> {resetting ? 'Resetting...' : 'Reset settings'}</button>
    </div>
  </Modal>
}

export function DownloadDiscoverySongModal({ song, onClose, onConfirm }: BaseModalProps & { song: DiscoverySong, onConfirm: () => void }) {
  return <Modal title="Download this song?" subtitle="Hoshino will download the audio and import it into your local library." onClose={onClose}>
    <div className="confirm-copy">
      <strong>{song.title}</strong>
      <p>{song.artist || 'Unknown artist'}{song.album ? ` · ${song.album}` : ''}</p>
    </div>
    <div className="modal-actions">
      <button className="modal-secondary" onClick={onClose}>Cancel</button>
      <button className="modal-primary" onClick={onConfirm}><Download size={16} /> Download and import</button>
    </div>
  </Modal>
}

export function DownloadOnlineSongModal({ song, progress, status, onClose, onConfirm }: BaseModalProps & { song: MusicTrack, progress?: number | null, status: 'idle' | 'downloading' | 'complete', onConfirm: () => void }) {
  const downloading = status === 'downloading'
  const complete = status === 'complete'
  const progressValue = complete ? 1 : progress
  const progressLabel = typeof progressValue === 'number' ? `${Math.round(progressValue * 100)}%` : 'Downloading...'

  return <Modal title={complete ? 'Download complete' : 'Download this song?'} subtitle={complete ? 'The online track is now available locally.' : 'Hoshino will download the online audio and replace it with a local copy.'} onClose={onClose}>
    <div className="confirm-copy">
      <strong>{song.title}</strong>
      <p>{song.artist || 'Unknown artist'}{song.album ? ` · ${song.album}` : ''}</p>
      {(downloading || complete) && <div className="modal-download-progress">
        <span>{complete ? 'Completed' : progressLabel}</span>
        <i className={typeof progressValue === 'number' ? '' : 'indeterminate'}><b style={typeof progressValue === 'number' ? { width: `${Math.round(progressValue * 100)}%` } : undefined} /></i>
      </div>}
    </div>
    <div className="modal-actions">
      {!complete && <button className="modal-secondary" onClick={onClose}>{downloading ? 'Close' : 'Cancel'}</button>}
      {complete
        ? <button className="modal-primary" onClick={onClose}><Check size={16} /> Done</button>
        : <button className="modal-primary" disabled={downloading} onClick={onConfirm}><Download size={16} /> {downloading ? 'Downloading...' : 'Download'}</button>}
    </div>
  </Modal>
}

function Modal({ title, subtitle, onClose, children }: BaseModalProps & { title: string, subtitle: string, children: React.ReactNode }) {
  const [closing, setClosing] = useState(false)
  const close = () => {
    if (closing) return
    setClosing(true)
    window.setTimeout(onClose, 210)
  }
  return <div className={`modal-backdrop ${closing ? 'closing' : ''}`} onMouseDown={close}><section className="modal-card" onMouseDown={(event) => event.stopPropagation()}>
    <button className="modal-close" onClick={close}><X size={19} /></button>
    <span className="eyebrow">Hoshino music</span><h2>{title}</h2><p>{subtitle}</p>{children}
  </section></div>
}

function Field({ label, value, onChange, required, type = 'text' }: { label: string, value: string, onChange: (value: string) => void, required?: boolean, type?: string }) {
  return <label className="form-field"><span>{label}</span><input type={type} required={required} value={value} onChange={(event) => onChange(event.target.value)} /></label>
}
