import { safeStorage } from 'electron'
import { copyFile, readFile, rename, unlink, writeFile } from 'node:fs/promises'

export type ProtectedCredentials = {
  spotifySpDc: string
  spotifySpT: string
  spotifyAccessToken: string
  discordRpcV2OauthAccessToken: string
  discordRpcV2OauthRefreshToken: string
}

const EMPTY_CREDENTIALS: ProtectedCredentials = {
  spotifySpDc: '',
  spotifySpT: '',
  spotifyAccessToken: '',
  discordRpcV2OauthAccessToken: '',
  discordRpcV2OauthRefreshToken: '',
}

type CredentialEnvelope = {
  version: 1
  ciphertext: string
}

function normalizeCredentials(value: unknown): ProtectedCredentials {
  const record = value && typeof value === 'object' ? value as Partial<Record<keyof ProtectedCredentials, unknown>> : {}
  return Object.fromEntries(Object.keys(EMPTY_CREDENTIALS).map((key) => [key, typeof record[key as keyof ProtectedCredentials] === 'string' ? (record[key as keyof ProtectedCredentials] as string).trim() : ''])) as ProtectedCredentials
}

async function encryptionAvailable() {
  if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text') return false
  return safeStorage.isAsyncEncryptionAvailable()
}

export async function readProtectedCredentials(filePath: string): Promise<ProtectedCredentials> {
  try {
    if (!(await encryptionAvailable())) return structuredClone(EMPTY_CREDENTIALS)
    const envelope = JSON.parse(await readFile(filePath, 'utf8')) as CredentialEnvelope
    if (envelope.version !== 1 || typeof envelope.ciphertext !== 'string') return structuredClone(EMPTY_CREDENTIALS)
    const decrypted = await safeStorage.decryptStringAsync(Buffer.from(envelope.ciphertext, 'base64'))
    const credentials = normalizeCredentials(JSON.parse(decrypted.result))
    if (decrypted.shouldReEncrypt) await writeProtectedCredentials(filePath, credentials)
    return credentials
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') console.error('Could not read protected credentials:', error)
    return structuredClone(EMPTY_CREDENTIALS)
  }
}

export async function writeProtectedCredentials(filePath: string, credentials: ProtectedCredentials): Promise<boolean> {
  const normalized = normalizeCredentials(credentials)
  if (!Object.values(normalized).some(Boolean)) {
    await unlink(filePath).catch(() => undefined)
    return true
  }
  if (!(await encryptionAvailable())) {
    console.warn('OS credential encryption is unavailable; sensitive credentials will not be persisted.')
    return false
  }

  const encrypted = await safeStorage.encryptStringAsync(JSON.stringify(normalized))
  const envelope: CredentialEnvelope = { version: 1, ciphertext: encrypted.toString('base64') }
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`
  await writeFile(temporaryPath, JSON.stringify(envelope, null, 2), 'utf8')
  try {
    try {
      await rename(temporaryPath, filePath)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'EPERM' && code !== 'EACCES' && code !== 'EBUSY') throw error
      await copyFile(temporaryPath, filePath)
    }
  } finally {
    await unlink(temporaryPath).catch(() => undefined)
  }
  return true
}
