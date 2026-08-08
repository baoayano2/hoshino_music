import { resolveOnlineAudioUrl } from './audio-url'

const DISCOVERY_AUDIO_METADATA_CACHE_KEY = 'hoshino:discovery-audio-metadata-cache'
const MAX_FLAC_METADATA_BYTES = 96 * 1024

export type DiscoveryAudioMetadata = {
  bitsPerSample: number
  sampleRate: number
}

export function readAudioMetadataCache(): Record<string, DiscoveryAudioMetadata | null> {
  try {
    const cache = JSON.parse(localStorage.getItem(DISCOVERY_AUDIO_METADATA_CACHE_KEY) ?? '{}') as Record<string, DiscoveryAudioMetadata | null>
    return cache && typeof cache === 'object' ? cache : {}
  } catch {
    return {}
  }
}

function writeAudioMetadataCache(url: string, metadata: DiscoveryAudioMetadata | null) {
  const cache = readAudioMetadataCache()
  cache[url] = metadata
  localStorage.setItem(DISCOVERY_AUDIO_METADATA_CACHE_KEY, JSON.stringify(cache))
}

export function isFlacUrl(url: string) {
  try {
    return new URL(url).pathname.toLowerCase().endsWith('.flac')
  } catch {
    return url.split(/[?#]/)[0].toLowerCase().endsWith('.flac')
  }
}

function parseFlacMetadata(buffer: Uint8Array): DiscoveryAudioMetadata | null {
  let cursor = buffer.findIndex((byte, index) => byte === 0x66 && buffer[index + 1] === 0x4c && buffer[index + 2] === 0x61 && buffer[index + 3] === 0x43)
  if (cursor < 0) return null
  cursor += 4

  while (cursor + 4 <= buffer.length) {
    const header = buffer[cursor]
    const blockType = header & 0x7f
    const blockLength = (buffer[cursor + 1] << 16) | (buffer[cursor + 2] << 8) | buffer[cursor + 3]
    const blockStart = cursor + 4
    const blockEnd = blockStart + blockLength
    if (blockEnd > buffer.length) return null
    if (blockType === 0 && blockLength >= 18) {
      const infoStart = blockStart + 10
      const sampleRate = (buffer[infoStart] << 12) | (buffer[infoStart + 1] << 4) | (buffer[infoStart + 2] >> 4)
      const bitsPerSample = (((buffer[infoStart + 2] & 0x01) << 4) | (buffer[infoStart + 3] >> 4)) + 1
      return { bitsPerSample, sampleRate }
    }
    cursor = blockEnd
  }

  return null
}

export async function readFlacMetadata(url: string): Promise<DiscoveryAudioMetadata | null> {
  const cached = readAudioMetadataCache()
  if (Object.prototype.hasOwnProperty.call(cached, url)) return cached[url] ?? null

  const controller = new AbortController()
  const response = await fetch(resolveOnlineAudioUrl(url), {
    headers: { Range: `bytes=0-${MAX_FLAC_METADATA_BYTES - 1}` },
    signal: controller.signal,
  })
  if (!response.ok) {
    writeAudioMetadataCache(url, null)
    return null
  }

  const reader = response.body?.getReader()
  if (!reader) {
    const metadata = parseFlacMetadata(new Uint8Array(await response.arrayBuffer()))
    writeAudioMetadataCache(url, metadata)
    return metadata
  }

  const chunks: Uint8Array[] = []
  let totalLength = 0
  while (totalLength < MAX_FLAC_METADATA_BYTES) {
    const { done, value } = await reader.read()
    if (done || !value) break
    chunks.push(value)
    totalLength += value.byteLength
    const partial = new Uint8Array(totalLength)
    let offset = 0
    chunks.forEach((chunk) => {
      partial.set(chunk, offset)
      offset += chunk.byteLength
    })
    const metadata = parseFlacMetadata(partial)
    if (metadata) {
      await reader.cancel().catch(() => undefined)
      controller.abort()
      writeAudioMetadataCache(url, metadata)
      return metadata
    }
  }

  await reader.cancel().catch(() => undefined)
  controller.abort()
  writeAudioMetadataCache(url, null)
  return null
}

export function isHiResFlac(metadata: DiscoveryAudioMetadata | null) {
  return metadata ? metadata.bitsPerSample >= 24 && metadata.sampleRate >= 96000 : false
}
