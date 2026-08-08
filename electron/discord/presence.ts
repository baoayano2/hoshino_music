import type { DiscordPlaybackState, ImageBlob, MusicTrack } from '../ipc/types'
import { readAppSettings, readLibrary, saveSongRpcCoverUrl } from '../music/storage'
import { DiscordRpcClient } from './rpc-client'
import { refreshDiscordPresenceV2Settings, resetDiscordPresenceV2, updateDiscordPresenceV2 } from './v2-presence'

const CLIENT_ID = '1515717247849594940'
const COVER_UPLOAD_URL = 'https://coverprocessor.vercel.app/upload'
const SMALL_IMAGE_URL = 'https://g40lhz1blgjzvqww.public.blob.vercel-storage.com/rpc/logo.jpg'

let rpc: DiscordRpcClient | null = null
let connecting: Promise<void> | null = null
let latestPlayback: DiscordPlaybackState | null = null
let latestPlaybackReceivedAt = 0
let latestKeepRichPresence = false
let displayedSongId: string | null = null
let displayedIsPlaying: boolean | null = null
let lastActivitySignature: string | null = null
let lastSentPosition = 0
let lastSentAt = 0
const coverCache = new Map<string, Promise<string | null>>()
const resolvedCoverCache = new Map<string, string>()

export async function updateDiscordPresence(playback: DiscordPlaybackState) {
  latestPlayback = playback
  latestPlaybackReceivedAt = Date.now()
  const settings = await readAppSettings()
  if (settings.discordRpcV2Enabled) {
    resetPresence()
    await updateDiscordPresenceV2(playback, settings)
    return
  }
  resetDiscordPresenceV2()
  latestKeepRichPresence = settings.discordKeepRichPresence
  if (!settings.discordRpcEnabled) {
    resetPresence()
    return
  }
  if (!playback.songId) {
    resetPresence()
    return
  }
  if (!playback.isPlaying && !settings.discordKeepRichPresence) {
    resetPresence()
    return
  }
  if (!Number.isFinite(playback.duration) || playback.duration <= 0) return

  await ensureConnected()
  if (!rpc || latestPlayback !== playback) return

  const coverKey = playback.coverUrl ? getCoverCacheKey(playback.songId, playback.coverUrl) : null
  let knownCover = playback.rpcCoverUrl ?? (coverKey ? resolvedCoverCache.get(coverKey) : undefined)
  if (!knownCover && playback.coverUrl) {
    knownCover = await uploadCover(playback.songId, playback.coverUrl) ?? undefined
    if (!rpc || latestPlayback !== playback) return
  }
  const songChanged = displayedSongId !== playback.songId
  const playbackStateChanged = displayedIsPlaying !== playback.isPlaying

  if (songChanged || playbackStateChanged) {
    setActivity(playback, settings.discordDetailsTemplate, settings.discordStateTemplate, settings.discordLargeTextTemplate, settings.discordSmallTextTemplate, settings.discordPausedSmallTextTemplate, settings.discordSmallImageUrl, settings.discordPausedSmallImageUrl, knownCover, true)
    displayedSongId = playback.songId
    displayedIsPlaying = playback.isPlaying
  } else if (playback.isPlaying && hasPlaybackJumped(playback)) {
    setActivity(playback, settings.discordDetailsTemplate, settings.discordStateTemplate, settings.discordLargeTextTemplate, settings.discordSmallTextTemplate, settings.discordPausedSmallTextTemplate, settings.discordSmallImageUrl, settings.discordPausedSmallImageUrl, knownCover, true)
  }
}

function setActivity(playback: DiscordPlaybackState, detailsTemplate: string, stateTemplate: string, largeTextTemplate: string, smallTextTemplate: string, pausedSmallTextTemplate: string, smallImageUrl: string, pausedSmallImageUrl: string, largeImage?: string | null, force = false) {
  const now = Math.floor(Date.now() / 1000)
  const elapsed = Math.max((Date.now() - latestPlaybackReceivedAt) / 1000, 0)
  const duration = playback.duration
  const position = Math.min(Math.max(playback.position + elapsed, 0), duration)
  const start = now - Math.floor(position)
  const details = renderDiscordText(detailsTemplate, playback)
  const state = renderDiscordText(stateTemplate, playback)
  const largeText = renderDiscordText(largeTextTemplate, playback)
  const smallText = renderDiscordText(!playback.isPlaying && pausedSmallTextTemplate ? pausedSmallTextTemplate : smallTextTemplate, playback)
  const smallImage = !playback.isPlaying && pausedSmallImageUrl ? pausedSmallImageUrl : smallImageUrl || SMALL_IMAGE_URL
  const activity = {
    type: 2,
    ...(details ? { details } : {}),
    ...(state ? { state } : {}),
    ...(playback.isPlaying ? { timestamps: { start, end: start + Math.ceil(duration) } } : {}),
    assets: {
      ...(largeImage ? { large_image: largeImage } : {}),
      ...(largeText ? { large_text: largeText } : {}),
      small_image: smallImage,
      ...(smallText ? { small_text: smallText } : {}),
    },
    instance: false,
  }
  const signature = JSON.stringify(activity)
  if (!force && signature === lastActivitySignature) return
  lastActivitySignature = signature
  lastSentPosition = position
  lastSentAt = Date.now()
  rpc?.setActivity(activity)
}

export async function refreshDiscordPresenceSettings() {
  if (!latestPlayback) return
  const settings = await readAppSettings()
  if (settings.discordRpcV2Enabled) {
    resetPresence()
    await refreshDiscordPresenceV2Settings(settings)
    return
  }
  resetDiscordPresenceV2()
  displayedSongId = null
  lastActivitySignature = null
  await updateDiscordPresence(latestPlayback)
}

export function stopDiscordPresence() {
  latestPlayback = null
  resetPresence()
  resetDiscordPresenceV2()
}

export async function prepareDiscordCovers() {
  const library = await readLibrary()
  await Promise.all(library.songs.map((song) => prepareDiscordCover(song)))
}

export async function prepareDiscordCover<T extends Pick<MusicTrack, 'id' | 'coverUrl' | 'rpcCoverUrl'>>(song: T) {
  if (!song.coverUrl || song.rpcCoverUrl) return song
  const rpcCoverUrl = await uploadCover(song.id, song.coverUrl)
  if (rpcCoverUrl) song.rpcCoverUrl = rpcCoverUrl
  return song
}

export function uploadDiscordSmallImage(image: ImageBlob) {
  return uploadImage(`data:${image.mimeType};base64,${Buffer.from(image.data).toString('base64')}`)
}

async function ensureConnected() {
  if (rpc?.isAvailable()) return
  rpc?.destroy()
  rpc = null
  if (!connecting) {
    connecting = (async () => {
      const client = new DiscordRpcClient(CLIENT_ID)
      try {
        await client.connect()
        if (latestPlayback?.isPlaying || latestKeepRichPresence) rpc = client
        else client.destroy()
      } catch {
        client.destroy()
      } finally {
        connecting = null
      }
    })()
  }
  await connecting
}

function hasPlaybackJumped(playback: DiscordPlaybackState) {
  if (!lastSentAt) return false
  const expectedPosition = lastSentPosition + (Date.now() - lastSentAt) / 1000
  return Math.abs(playback.position - expectedPosition) > 2
}

function resetPresence() {
  displayedSongId = null
  displayedIsPlaying = null
  lastActivitySignature = null
  lastSentPosition = 0
  lastSentAt = 0
  rpc?.clearActivity()
  rpc?.destroy()
  rpc = null
}

function uploadCover(songId: string, image: string) {
  if (!image.startsWith('data:') && URL.canParse(image)) {
    return Promise.resolve(image)
  }

  const cacheKey = getCoverCacheKey(songId, image)
  const cached = coverCache.get(cacheKey)
  if (cached) return cached

  const upload = uploadImage(image)
    .then(async (url) => {
      if (!url) return null
      await saveSongRpcCoverUrl(songId, image, url)
      resolvedCoverCache.set(cacheKey, url)
      return url
    })
    .catch(() => {
      coverCache.delete(cacheKey)
      return null
    })

  coverCache.set(cacheKey, upload)
  return upload
}

function uploadImage(image: string) {
  return fetch(COVER_UPLOAD_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image }),
    signal: AbortSignal.timeout(15_000),
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Cover upload failed: ${response.status}`)
      const data = await response.json() as { url?: unknown }
      return typeof data.url === 'string' ? data.url : null
    })
}

function getCoverCacheKey(songId: string, image: string) {
  return `${songId}:${image}`
}

function renderDiscordText(template: string, playback: DiscordPlaybackState) {
  return (replacePlaceholder(replacePlaceholder(replacePlaceholder(
    template,
    '%song_name%',
    playback.title,
  ), '%artist_name%', playback.artist), '%album_name%', playback.album ?? '')
    .trim()).slice(0, 128)
}

function replacePlaceholder(value: string, placeholder: string, replacement: string) {
  return value.split(placeholder).join(replacement)
}
