import { shell } from 'electron'
import http from 'node:http'
import crypto from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { AppSettings } from '../ipc/types'
import { readAppSettings, saveAppSettings } from '../music/storage'

export const DISCORD_V2_CLIENT_ID = '1515717247849594940'
const DISCORD_V2_SCOPE = 'openid sdk.social_layer_presence'
const PRIVATE_SOCIAL_SDK_URL = 'https://private-social-sdk.vercel.app'
const USER_URL = 'https://discord.com/api/users/@me'

type TokenData = {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type?: string
}

export async function loginDiscordRpcV2(): Promise<AppSettings> {
  const state = crypto.randomUUID()
  const { server, port, waitForCode } = await createCallbackServer(state)
  const redirectUri = `http://127.0.0.1:${port}/callback`
  const url = new URL('https://discord.com/oauth2/authorize')
  url.searchParams.set('client_id', DISCORD_V2_CLIENT_ID)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', DISCORD_V2_SCOPE)
  url.searchParams.set('state', state)

  try {
    await shell.openExternal(url.toString())
    const code = await waitForCode
    const tokenData = await requestPrivateTokenApi('/api/exchange', {
      code,
      redirect_uri: redirectUri,
    })
    return saveDiscordRpcV2Token(tokenData)
  } finally {
    server.close()
  }
}

export async function validateDiscordRpcV2Token(): Promise<AppSettings> {
  await getDiscordRpcV2AccessToken()
  return readAppSettings()
}

export async function getDiscordRpcV2AccessToken(): Promise<string | null> {
  const settings = await readAppSettings()
  if (!settings.discordRpcV2OauthAccessToken || !settings.discordRpcV2OauthRefreshToken) return null
  const token = Date.now() >= settings.discordRpcV2OauthExpiresAt
    ? await refreshDiscordRpcV2Token(settings)
    : settings.discordRpcV2OauthAccessToken

  const response = await fetch(USER_URL, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null)
  if (response?.status === 401) return refreshDiscordRpcV2Token(await readAppSettings())
  return response?.ok ? token : null
}

async function refreshDiscordRpcV2Token(settings: AppSettings) {
  if (!settings.discordRpcV2OauthRefreshToken) throw new Error('Discord RPC v2 refresh token is missing')
  const tokenData = await requestPrivateTokenApi('/api/refresh', {
    refresh_token: settings.discordRpcV2OauthRefreshToken,
  })
  const saved = await saveDiscordRpcV2Token(tokenData)
  return saved.discordRpcV2OauthAccessToken
}

async function saveDiscordRpcV2Token(tokenData: TokenData) {
  const settings = await readAppSettings()
  const next: AppSettings = {
    ...settings,
    discordRpcEnabled: false,
    discordRpcV2Enabled: true,
    discordRpcV2OauthAccessToken: tokenData.access_token,
    discordRpcV2OauthRefreshToken: tokenData.refresh_token,
    discordRpcV2OauthExpiresAt: Date.now() + Math.max(tokenData.expires_in - 30, 0) * 1000,
  }
  await saveAppSettings(next)
  return next
}

async function requestPrivateTokenApi(path: '/api/exchange' | '/api/refresh', body: Record<string, string>) {
  const response = await fetch(`${PRIVATE_SOCIAL_SDK_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`Private Social SDK token request failed: ${response.status} ${await response.text()}`)
  const data = await response.json() as Partial<TokenData>
  if (!data.access_token || !data.refresh_token || typeof data.expires_in !== 'number') {
    throw new Error('Discord OAuth2 token response is missing required fields')
  }
  return data as TokenData
}

function createCallbackServer(expectedState: string): Promise<{ server: http.Server, port: number, waitForCode: Promise<string> }> {
  return new Promise((resolve, reject) => {
    let settleCode: (code: string) => void
    let settleError: (error: Error) => void
    const waitForCode = new Promise<string>((codeResolve, codeReject) => {
      settleCode = codeResolve
      settleError = codeReject
    })
    const server = http.createServer((request, response) => {
      const url = new URL(request.url ?? '/', `http://${request.headers.host}`)
      if (url.pathname !== '/callback') {
        response.writeHead(404).end('Not found')
        return
      }
      const state = url.searchParams.get('state')
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')
      if (state !== expectedState) {
        response.writeHead(400).end('Invalid state. You can close this window.')
        settleError(new Error('Invalid Discord OAuth2 state'))
        return
      }
      if (error || !code) {
        response.writeHead(400).end('Discord login failed. You can close this window.')
        settleError(new Error(error || 'Discord OAuth2 code is missing'))
        return
      }
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end('<p>Discord login complete. You can close this window.</p>')
      settleCode(code)
    })
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject)
      const address = server.address() as AddressInfo
      resolve({ server, port: address.port, waitForCode })
    })
  })
}
