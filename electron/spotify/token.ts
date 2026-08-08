import { createHmac } from 'node:crypto'

const SECRET_CIPHER = [44, 55, 47, 42, 70, 40, 34, 114, 76, 74, 50, 111, 120, 97, 75, 76, 94, 102, 43, 69, 49, 120, 118, 80, 64, 78]

export class SpotifyInvalidCookieError extends Error {
  constructor() {
    super('Spotify session cookie is no longer valid.')
    this.name = 'SpotifyInvalidCookieError'
  }
}

function generateTotp() {
  const transformed = SECRET_CIPHER.map((value, index) => value ^ ((index % 33) + 9)).join('')
  const key = Buffer.from(Buffer.from(transformed).toString('hex'), 'hex')
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)))
  const digest = createHmac('sha1', key).update(counter).digest()
  const offset = digest[digest.length - 1] & 0x0f
  const code = (((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3]) % 1_000_000
  return String(code).padStart(6, '0')
}

export async function getSpotifyAccessToken(spDc: string, signal?: AbortSignal): Promise<{ spotifyAccessToken: string, spotifyAccessTokenExpirationTimestampMs: number }> {
  const totp = generateTotp()
  const params = new URLSearchParams({ reason: 'init', productType: 'web-player', totp, totpServer: totp, totpVer: '61' })
  const controller = new AbortController()
  const abort = () => controller.abort(signal?.reason)
  const timeout = setTimeout(() => controller.abort(new Error('Spotify token request timed out.')), 15_000)
  signal?.addEventListener('abort', abort, { once: true })
  try {
    const response = await fetch(`https://open.spotify.com/api/token?${params}`, {
      headers: {
        Cookie: `sp_dc=${spDc}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
      },
      signal: controller.signal,
    })
    if (response.status === 401 || response.status === 403) throw new SpotifyInvalidCookieError()
    if (!response.ok) throw new Error(`Spotify token request failed (${response.status}).`)
    const data = await response.json() as { accessToken?: string, accessTokenExpirationTimestampMs?: number, isAnonymous?: boolean }
    if (data.isAnonymous === true) throw new SpotifyInvalidCookieError()
    if (!data.accessToken || !data.accessTokenExpirationTimestampMs) throw new Error('Spotify returned an invalid access token.')
    return {
      spotifyAccessToken: data.accessToken,
      spotifyAccessTokenExpirationTimestampMs: data.accessTokenExpirationTimestampMs,
    }
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}
