import { net } from 'electron'
import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rename, stat, unlink, utimes, writeFile } from 'node:fs/promises'
import path from 'node:path'

const MAX_FILES = 96
const MAX_BYTES = 48 * 1024 * 1024
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const pending = new Map<string, Promise<Response>>()

function extension(type: string) {
  if (type.includes('png')) return 'png'
  if (type.includes('webp')) return 'webp'
  if (type.includes('gif')) return 'gif'
  if (type.includes('avif')) return 'avif'
  return 'jpg'
}

function contentType(filePath: string) {
  const ext = path.extname(filePath).slice(1)
  return ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
}

async function findCached(cacheDir: string, key: string) {
  const name = (await readdir(cacheDir)).find((candidate) => candidate.startsWith(`${key}.`) && !candidate.endsWith('.tmp'))
  return name ? path.join(cacheDir, name) : null
}

async function trimCache(cacheDir: string) {
  const entries = (await Promise.all((await readdir(cacheDir).catch(() => [])).filter((name) => !name.endsWith('.tmp')).map(async (name) => {
    const filePath = path.join(cacheDir, name)
    const info = await stat(filePath).catch(() => null)
    return info ? { filePath, size: info.size, usedAt: info.mtimeMs } : null
  }))).filter((entry): entry is { filePath: string, size: number, usedAt: number } => entry !== null)
  entries.sort((left, right) => right.usedAt - left.usedAt)
  let bytes = 0
  await Promise.all(entries.map(async (entry, index) => {
    bytes += entry.size
    if (index >= MAX_FILES || bytes > MAX_BYTES) await unlink(entry.filePath).catch(() => undefined)
  }))
}

export async function spotifyImageResponse(request: Request, cacheDir: string) {
  const source = new URL(request.url).searchParams.get('url') ?? ''
  let url: URL
  try { url = new URL(source) } catch { return new Response(null, { status: 400 }) }
  if (!['http:', 'https:'].includes(url.protocol)) return new Response(null, { status: 400 })
  await mkdir(cacheDir, { recursive: true })
  const key = createHash('sha256').update(url.href).digest('hex')
  const cached = await findCached(cacheDir, key)
  if (cached) {
    // Cache trimming can remove a file between readdir() and readFile(). Treat
    // that race as a cache miss instead of rejecting the protocol request.
    const bytes = await readFile(cached).catch(() => null)
    if (bytes) {
      const now = new Date()
      await utimes(cached, now, now).catch(() => undefined)
      return new Response(bytes, { headers: { 'Content-Type': contentType(cached), 'Cache-Control': 'public, max-age=31536000, immutable' } })
    }
  }
  const existing = pending.get(key)
  if (existing) return existing
  const task = (async () => {
    const upstream = await net.fetch(url.href)
    const type = upstream.headers.get('content-type') ?? ''
    if (!upstream.ok || !type.startsWith('image/')) return upstream
    if (Number(upstream.headers.get('content-length') ?? 0) > MAX_IMAGE_BYTES) return upstream
    const bytes = new Uint8Array(await upstream.arrayBuffer())
    if (bytes.byteLength > MAX_IMAGE_BYTES) return new Response(bytes, { headers: { 'Content-Type': type } })
    const target = path.join(cacheDir, `${key}.${extension(type)}`)
    const temporary = `${target}.tmp`
    await writeFile(temporary, bytes)
    await rename(temporary, target).catch(async () => unlink(temporary).catch(() => undefined))
    void trimCache(cacheDir).catch(() => undefined)
    return new Response(bytes, { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, immutable' } })
  })().finally(() => pending.delete(key))
  pending.set(key, task)
  return task
}
