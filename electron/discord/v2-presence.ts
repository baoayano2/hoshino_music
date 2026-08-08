import type { AppSettings, DiscordPlaybackState } from '../ipc/types'
import { getDiscordRpcV2AccessToken, DISCORD_V2_CLIENT_ID } from './v2-oauth'

const GATEWAY_URL = 'wss://gateway.gaming-sdk.com/?v=9&encoding=json'
const API_BASE = 'https://gaming-sdk.com/api'
const SMALL_IMAGE_URL = 'https://g40lhz1blgjzvqww.public.blob.vercel-storage.com/rpc/logo.jpg'
const GatewayOp = { dispatch: 0, heartbeat: 1, identify: 2, presenceUpdate: 3, resume: 6, reconnect: 7, invalidSession: 9, hello: 10, heartbeatAck: 11 } as const

let gateway: DiscordV2Gateway | null = null
let connecting: Promise<DiscordV2Gateway | null> | null = null
let latestPlayback: DiscordPlaybackState | null = null
let latestPlaybackReceivedAt = 0
let lastActivitySignature: string | null = null
let lastSentPosition = 0
let lastSentAt = 0
let presenceUpdateTimer: ReturnType<typeof setTimeout> | null = null
const MIN_PRESENCE_UPDATE_INTERVAL_MS = 1800
const externalAssetCache = new Map<string, Promise<string | null>>()

export async function updateDiscordPresenceV2(playback: DiscordPlaybackState, settings: AppSettings) {
  latestPlayback = playback
  latestPlaybackReceivedAt = Date.now()
  if (!settings.discordRpcV2Enabled || !settings.discordRpcV2OauthAccessToken || !settings.discordRpcV2OauthRefreshToken) {
    resetDiscordPresenceV2()
    return
  }
  if (!playback.songId || (!playback.isPlaying && !settings.discordRpcV2KeepRichPresence)) {
    clearDiscordPresenceV2()
    return
  }
  if (!Number.isFinite(playback.duration) || playback.duration <= 0) return

  const client = await ensureGateway()
  if (!client || latestPlayback !== playback) return

  const largeImage = playback.rpcCoverUrl || playback.coverUrl
    ? await resolveExternalAsset(playback.rpcCoverUrl || playback.coverUrl || '')
    : null
  if (latestPlayback !== playback) return
  const smallImage = await resolveExternalAsset(!playback.isPlaying && settings.discordRpcV2PausedSmallImageUrl
    ? settings.discordRpcV2PausedSmallImageUrl
    : settings.discordRpcV2SmallImageUrl || SMALL_IMAGE_URL)
  if (latestPlayback !== playback) return

  const force = lastActivitySignature === null || (playback.isPlaying && hasPlaybackJumped(playback))
  setDiscordPresenceV2Activity(playback, settings, largeImage, smallImage, force)
}

export function resetDiscordPresenceV2() {
  latestPlayback = null
  clearDiscordPresenceV2()
  gateway?.destroy()
  gateway = null
}

export async function refreshDiscordPresenceV2Settings(settings: AppSettings) {
  lastActivitySignature = null
  if (latestPlayback) await updateDiscordPresenceV2(latestPlayback, settings)
}

function clearDiscordPresenceV2() {
  if (presenceUpdateTimer) clearTimeout(presenceUpdateTimer)
  presenceUpdateTimer = null
  lastActivitySignature = null
  lastSentPosition = 0
  lastSentAt = 0
  gateway?.sendPresence([])
}

function setDiscordPresenceV2Activity(playback: DiscordPlaybackState, settings: AppSettings, largeImage: string | null, smallImage: string | null, force = false) {
  const elapsed = Math.max((Date.now() - latestPlaybackReceivedAt), 0)
  const durationMs = playback.duration * 1000
  const positionMs = Math.min(Math.max(playback.position * 1000 + elapsed, 0), durationMs)
  const start = Date.now() - Math.floor(positionMs)
  const details = renderDiscordText(settings.discordRpcV2DetailsTemplate, playback)
  const state = renderDiscordText(settings.discordRpcV2StateTemplate, playback)
  const largeText = renderDiscordText(settings.discordRpcV2LargeTextTemplate, playback)
  const smallText = renderDiscordText(!playback.isPlaying && settings.discordRpcV2PausedSmallTextTemplate ? settings.discordRpcV2PausedSmallTextTemplate : settings.discordRpcV2SmallTextTemplate, playback)
  const activity = cleanObject({
    name: 'Hoshino',
    type: 2,
    application_id: DISCORD_V2_CLIENT_ID,
    details,
    state,
    timestamps: playback.isPlaying ? { start, end: start + Math.ceil(durationMs) } : undefined,
    assets: cleanObject({
      large_image: largeImage,
      large_text: largeText,
      small_image: smallImage,
      small_text: smallText,
    }),
    platform: 'desktop',
    created_at: Date.now(),
    session_id: gateway?.sessionId,
  })
  const signature = JSON.stringify(activity)
  if (!force && signature === lastActivitySignature) return
  const send = () => {
    presenceUpdateTimer = null
    lastActivitySignature = signature
    lastSentPosition = playback.position
    lastSentAt = Date.now()
    gateway?.sendPresence([activity])
  }
  const remainingDelay = MIN_PRESENCE_UPDATE_INTERVAL_MS - (Date.now() - lastSentAt)
  if (lastSentAt && remainingDelay > 0) {
    if (presenceUpdateTimer) clearTimeout(presenceUpdateTimer)
    presenceUpdateTimer = setTimeout(send, remainingDelay)
    return
  }
  send()
}

async function ensureGateway() {
  if (gateway?.isOpen()) return gateway
  gateway?.destroy()
  gateway = null
  if (!connecting) {
    connecting = (async () => {
      const accessToken = await getDiscordRpcV2AccessToken().catch(() => null)
      if (!accessToken) return null
      const client = new DiscordV2Gateway(`Bearer ${accessToken}`)
      try {
        await client.connect()
        gateway = client
        return client
      } catch {
        client.destroy()
        return null
      } finally {
        connecting = null
      }
    })()
  }
  return connecting
}

async function resolveExternalAsset(image: string) {
  if (!image) return null
  if (!URL.canParse(image)) return image
  const cached = externalAssetCache.get(image)
  if (cached) return cached
  const upload = (async () => {
    const token = await getDiscordRpcV2AccessToken()
    if (!token) return null
    const response = await fetch(`${API_BASE}/applications/${DISCORD_V2_CLIENT_ID}/external-assets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: [image] }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) return null
    const data = await response.json() as Array<{ external_asset_path?: unknown }>
    const path = data[0]?.external_asset_path
    return typeof path === 'string' ? path.startsWith('mp:') ? path : `mp:${path}` : null
  })().catch(() => null)
  externalAssetCache.set(image, upload)
  return upload
}

function hasPlaybackJumped(playback: DiscordPlaybackState) {
  if (!lastSentAt) return false
  const expectedPosition = lastSentPosition + (Date.now() - lastSentAt) / 1000
  return Math.abs(playback.position - expectedPosition) > 2
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

function cleanObject<T extends Record<string, unknown>>(object: T): Partial<T> {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => {
    if (value === undefined || value === null || value === '') return false
    if (Array.isArray(value) && !value.length) return false
    if (typeof value === 'object' && !Array.isArray(value) && !Object.keys(value).length) return false
    return true
  })) as Partial<T>
}

class DiscordV2Gateway {
  private socket: WebSocket | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private seq: number | null = null
  private ready = false
  sessionId: string | null = null

  constructor(private readonly token: string) {}

  isOpen() {
    return this.socket?.readyState === WebSocket.OPEN && this.ready
  }

  connect() {
    return new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(GATEWAY_URL)
      this.socket = socket
      const timeout = setTimeout(() => reject(new Error('Discord RPC v2 gateway timeout')), 20_000)
      socket.addEventListener('message', (event) => {
        const packet = JSON.parse(String(event.data)) as { op: number, d: unknown, s?: number | null, t?: string | null }
        if (typeof packet.s === 'number') this.seq = packet.s
        if (packet.op === GatewayOp.hello) {
          const data = packet.d as { heartbeat_interval?: unknown }
          this.startHeartbeat(typeof data.heartbeat_interval === 'number' ? data.heartbeat_interval : 45_000)
          this.send(GatewayOp.identify, {
            token: this.token,
            capabilities: 0,
            properties: {
              os: 'Windows',
              browser: 'Hoshino',
              device: 'Hoshino',
            },
          })
        } else if (packet.op === GatewayOp.dispatch && packet.t === 'READY') {
          const data = packet.d as { session_id?: unknown }
          this.ready = true
          this.sessionId = typeof data.session_id === 'string' ? data.session_id : null
          clearTimeout(timeout)
          resolve()
        } else if (packet.op === GatewayOp.reconnect || packet.op === GatewayOp.invalidSession) {
          this.destroy()
        }
      })
      socket.addEventListener('error', () => {
        clearTimeout(timeout)
        reject(new Error('Discord RPC v2 gateway connection failed'))
      }, { once: true })
      socket.addEventListener('close', () => this.destroy(), { once: true })
    })
  }

  sendPresence(activities: unknown[]) {
    this.send(GatewayOp.presenceUpdate, {
      activities,
      afk: false,
      since: 0,
      status: 'online',
    })
  }

  destroy() {
    this.ready = false
    this.sessionId = null
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    const socket = this.socket
    this.socket = null
    if (socket && socket.readyState !== WebSocket.CLOSED) socket.close()
  }

  private startHeartbeat(interval: number) {
    this.heartbeatTimer = setInterval(() => this.send(GatewayOp.heartbeat, this.seq), interval)
  }

  private send(op: number, d: unknown) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ op, d }))
  }
}
