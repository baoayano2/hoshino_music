import path from 'node:path'
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'
import type { ImageBlob, ImageOptimizeOptions, ImagePurpose } from '../ipc/types'

export const SONG_IMAGE_BYTES = 1 * 1024 * 1024
export const PLAYLIST_IMAGE_BYTES = 4 * 1024 * 1024
export const SUPPORTED_COVER_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'] as const
export const SUPPORTED_COVER_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const

const QUALITY_STEPS = [86, 78, 70, 62, 54, 46, 38]
const MAX_DIMENSIONS: Record<ImagePurpose, number> = { song: 1600, playlist: 2400 }

export async function optimizeImage(filePath: string, purpose: ImagePurpose, options?: ImageOptimizeOptions): Promise<ImageBlob> {
  return optimizeSource(filePath, path.parse(filePath).name, purpose, options, path.extname(filePath))
}

export async function optimizeImageBlob(blob: ImageBlob, purpose: ImagePurpose, options?: ImageOptimizeOptions): Promise<ImageBlob> {
  return optimizeSource(Buffer.from(blob.data), path.parse(blob.name).name, purpose, options, blob.mimeType || path.extname(blob.name))
}

async function optimizeSource(source: string | Buffer, name: string, purpose: ImagePurpose, options?: ImageOptimizeOptions, formatHint = ''): Promise<ImageBlob> {
  const maxBytes = purpose === 'song' ? SONG_IMAGE_BYTES : PLAYLIST_IMAGE_BYTES
  const maxDimension = MAX_DIMENSIONS[purpose]

  if (isGifFormat(formatHint)) {
    return preserveGif(source, name, maxBytes)
  }

  return optimizeWithSharp(source, name, maxBytes, maxDimension, options)
}

async function optimizeWithSharp(input: string | Buffer, name: string, maxBytes: number, maxDimension: number, options?: ImageOptimizeOptions): Promise<ImageBlob> {
  let dimension = maxDimension
  for (let resizeAttempt = 0; resizeAttempt < 4; resizeAttempt += 1) {
    for (const quality of QUALITY_STEPS) {
      const data = await sharp(input)
        .rotate()
        .resize({
          width: dimension,
          height: options?.cropSquare ? dimension : undefined,
          fit: options?.cropSquare ? 'cover' : 'inside',
          position: 'centre',
          withoutEnlargement: true,
        })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer()

      if (data.byteLength < maxBytes) {
        return {
          name: `${name}.jpg`,
          mimeType: 'image/jpeg',
          data: new Uint8Array(data),
        }
      }
    }
    dimension = Math.max(Math.floor(dimension * 0.75), 320)
  }

  throw new Error(`Image could not be optimized below ${formatLimit(maxBytes)}`)
}

export function assertImageSize(blob: ImageBlob, purpose: ImagePurpose) {
  const maxBytes = purpose === 'song' ? SONG_IMAGE_BYTES : PLAYLIST_IMAGE_BYTES
  if (blob.data.byteLength >= maxBytes) {
    throw new Error(`Image must be smaller than ${formatLimit(maxBytes)}`)
  }
}

export function assertSupportedCoverImage(blob: ImageBlob) {
  const extension = path.extname(blob.name).toLowerCase()
  const mimeType = blob.mimeType.toLowerCase()
  if (!SUPPORTED_COVER_EXTENSIONS.includes(extension as typeof SUPPORTED_COVER_EXTENSIONS[number])
    || !SUPPORTED_COVER_MIME_TYPES.includes(mimeType as typeof SUPPORTED_COVER_MIME_TYPES[number])) {
    throw new Error('Unsupported cover format')
  }
}

async function preserveGif(source: string | Buffer, name: string, maxBytes: number): Promise<ImageBlob> {
  const data = typeof source === 'string' ? await readFile(source) : source
  if (!isGifData(data)) throw new Error('Unsupported cover format')
  if (data.byteLength >= maxBytes) {
    throw new Error(`Image must be smaller than ${formatLimit(maxBytes)}`)
  }

  return {
    name: `${name}.gif`,
    mimeType: 'image/gif',
    data: new Uint8Array(data),
  }
}

function isGifFormat(formatHint: string) {
  const normalized = formatHint.toLowerCase()
  return normalized === '.gif' || normalized === 'image/gif'
}

function isGifData(data: Buffer) {
  if (data.byteLength < 6) return false
  const signature = data.subarray(0, 6).toString('ascii')
  return signature === 'GIF87a' || signature === 'GIF89a'
}

const formatLimit = (bytes: number) => `${bytes / 1024 / 1024} MB`
