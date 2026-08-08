import path from 'node:path'
import { parseFile } from 'music-metadata'
import type { AudioFileSelection, ImageBlob } from '../ipc/types'
import { optimizeImageBlob } from './image'

export async function readAudioSelection(sourcePath: string): Promise<AudioFileSelection> {
  const metadata = await parseFile(sourcePath).catch(() => null)
  if (!metadata) {
    return {
      sourcePath,
      title: path.parse(sourcePath).name,
      artist: '',
      album: '',
      genre: '',
      year: '',
      duration: 0,
      coverBlob: null,
    }
  }
  const common = metadata.common
  const picture = common.picture?.[0]
  let coverBlob: ImageBlob | null = null

  if (picture) {
    coverBlob = await optimizeImageBlob({
      name: `embedded.${extensionForMime(picture.format)}`,
      mimeType: picture.format,
      data: new Uint8Array(picture.data),
    }, 'song', { cropSquare: true }).catch(() => null)
  }

  return {
    sourcePath,
    title: common.title?.trim() || path.parse(sourcePath).name,
    artist: common.artist?.trim() || '',
    album: common.album?.trim() || '',
    genre: common.genre?.[0]?.trim() || '',
    year: common.year ? String(common.year) : '',
    duration: Number.isFinite(metadata.format.duration) ? metadata.format.duration ?? 0 : 0,
    coverBlob,
  }
}

export async function readAudioDuration(sourcePath: string): Promise<number> {
  const metadata = await parseFile(sourcePath, { duration: true }).catch(() => null)
  return Number.isFinite(metadata?.format.duration) ? metadata?.format.duration ?? 0 : 0
}

function extensionForMime(mimeType: string) {
  if (mimeType.includes('png')) return 'png'
  if (mimeType.includes('webp')) return 'webp'
  if (mimeType.includes('gif')) return 'gif'
  return 'jpg'
}
