import { app, BrowserWindow, net, protocol, session } from 'electron'
import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { prepareDiscordCovers, stopDiscordPresence } from './discord/presence'
import { registerIpcHandlers, sendAppReady } from './ipc'
import { getAudioPath, getPlaylistHeroPath, initializeMusicStorage, readAppSettings } from './music/storage'
import { applyStartWithWindows } from './startup'
import { spotifyImageResponse } from './spotify/image-cache'
import { restoreWindowState, trackWindowState } from './window-state'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
const IS_DEVELOPMENT = Boolean(VITE_DEV_SERVER_URL)

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null
let miniPlayerWindow: BrowserWindow | null
// Main-process HMR starts the replacement before the previous dev process has
// fully released its lock. Enforcing a single instance here leaves the stale
// process alive and makes it continue running an outdated dist-electron bundle.
const hasSingleInstanceLock = IS_DEVELOPMENT || app.requestSingleInstanceLock()

const AUDIO_CONTENT_TYPES: Record<string, string> = {
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'hoshino-audio', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  { scheme: 'hoshino-online-audio', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  { scheme: 'hoshino-hero', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  { scheme: 'hoshino-spotify-image', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
])

async function createWindow() {
  const windowState = await restoreWindowState()
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'logo.jpg'),
    autoHideMenuBar: true,
    frame: false,
    minWidth: 640,
    minHeight: 620,
    ...windowState.bounds,
    webPreferences: {
      devTools: true,
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })
  win.setMenuBarVisibility(false)
  if (!IS_DEVELOPMENT) {
    win.webContents.on('devtools-opened', async () => {
      if (!(await readAppSettings()).debuggerEnabled) win?.webContents.closeDevTools()
    })
  }
  trackWindowState(win)
  if (windowState.maximized) win.maximize()
  if (windowState.fullscreen) win.setFullScreen(true)

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    if (win) sendAppReady(win.webContents)
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

async function createMiniPlayerWindow() {
  if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
    miniPlayerWindow.show()
    miniPlayerWindow.focus()
    return
  }

  miniPlayerWindow = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'logo.jpg'),
    autoHideMenuBar: true,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    width: 360,
    height: 134,
    minWidth: 360,
    minHeight: 134,
    webPreferences: {
      devTools: true,
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })
  miniPlayerWindow.setMenuBarVisibility(false)
  if (!IS_DEVELOPMENT) {
    miniPlayerWindow.webContents.on('devtools-opened', async () => {
      if (!(await readAppSettings()).debuggerEnabled) miniPlayerWindow?.webContents.closeDevTools()
    })
  }
  miniPlayerWindow.on('closed', () => {
    miniPlayerWindow = null
    if (win && !win.isDestroyed() && !win.isVisible()) {
      win.show()
      win.focus()
    }
  })

  if (VITE_DEV_SERVER_URL) {
    await miniPlayerWindow.loadURL(`${VITE_DEV_SERVER_URL}?mini=1`)
  } else {
    await miniPlayerWindow.loadFile(path.join(RENDERER_DIST, 'index.html'), { query: { mini: '1' } })
  }
}

async function openMiniPlayer(sourceWindow: BrowserWindow) {
  await createMiniPlayerWindow()
  sourceWindow.hide()
}

function focusWindow(window: BrowserWindow) {
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}

function focusExistingInstance() {
  if (win && !win.isDestroyed() && win.isVisible()) {
    focusWindow(win)
    return
  }
  if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
    focusWindow(miniPlayerWindow)
    return
  }
  if (win && !win.isDestroyed()) focusWindow(win)
}

function expandMiniPlayer() {
  if (win && !win.isDestroyed()) {
    win.show()
    win.focus()
  }
  if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
    miniPlayerWindow.close()
    miniPlayerWindow = null
  }
}

async function audioResponse(request: Request, audioPath: string) {
  const fileSize = (await stat(audioPath)).size
  const contentType = AUDIO_CONTENT_TYPES[path.extname(audioPath).toLowerCase()] ?? 'application/octet-stream'
  const range = request.headers.get('range')
  const commonHeaders = {
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Headers': 'Range',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Origin': '*',
    'Content-Type': contentType,
  }

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: commonHeaders })

  if (!range) {
    const data = request.method === 'HEAD' ? null : await readFile(audioPath)
    return new Response(data ? Uint8Array.from(data).buffer : null, {
      headers: { ...commonHeaders, 'Content-Length': String(fileSize) },
    })
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range)
  if (!match) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${fileSize}` } })

  const suffixLength = !match[1] && match[2] ? Number(match[2]) : null
  const requestedStart = suffixLength === null ? Number(match[1]) : Math.max(fileSize - suffixLength, 0)
  const requestedEnd = suffixLength === null && match[2] ? Number(match[2]) : fileSize - 1
  if (requestedStart >= fileSize) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${fileSize}` } })
  }
  const start = Math.max(requestedStart, 0)
  const end = Math.min(Math.max(requestedEnd, start), fileSize - 1)
  const data = request.method === 'HEAD' ? null : (await readFile(audioPath)).subarray(start, end + 1)

  return new Response(data ? Uint8Array.from(data).buffer : null, {
    status: 206,
    headers: {
      ...commonHeaders,
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
    },
  })
}

async function onlineAudioResponse(request: Request) {
  const sourceUrl = new URL(request.url).searchParams.get('url') ?? ''
  let parsedSourceUrl: URL
  try {
    parsedSourceUrl = new URL(sourceUrl)
  } catch {
    return new Response(null, { status: 400 })
  }
  if (!['http:', 'https:'].includes(parsedSourceUrl.protocol)) return new Response(null, { status: 400 })

  const commonHeaders = {
    'Access-Control-Allow-Headers': 'Range',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Origin': '*',
  }
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: commonHeaders })

  const headers = new Headers()
  const range = request.headers.get('range')
  if (range) headers.set('Range', range)
  const upstream = await net.fetch(parsedSourceUrl.href, { method: request.method, headers })
  const responseHeaders = new Headers(upstream.headers)
  Object.entries(commonHeaders).forEach(([key, value]) => responseHeaders.set(key, value))
  if (!responseHeaders.has('Accept-Ranges')) responseHeaders.set('Accept-Ranges', 'bytes')

  return new Response(request.method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  })
}

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', focusExistingInstance)
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  stopDiscordPresence()
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow()
  }
})

if (hasSingleInstanceLock) app.whenReady().then(async () => {
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => String(permission) === 'speaker-selection')
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(String(permission) === 'speaker-selection')
  })
  await initializeMusicStorage()
  applyStartWithWindows((await readAppSettings()).startWithWindows)
  await prepareDiscordCovers()
  protocol.handle('hoshino-audio', async (request) => {
    const trackId = new URL(request.url).pathname.slice(1)
    const audioPath = await getAudioPath(trackId)
    return audioPath ? audioResponse(request, audioPath) : new Response(null, { status: 404 })
  })
  protocol.handle('hoshino-online-audio', onlineAudioResponse)
  protocol.handle('hoshino-spotify-image', (request) => spotifyImageResponse(request, path.join(app.getPath('userData'), 'Cache', 'spotify-images')))
  protocol.handle('hoshino-hero', async (request) => {
    const playlistId = new URL(request.url).pathname.slice(1)
    const heroPath = await getPlaylistHeroPath(playlistId)
    return heroPath ? net.fetch(pathToFileURL(heroPath).href) : new Response(null, { status: 404 })
  })
  registerIpcHandlers({
    openMiniPlayer,
    expandMiniPlayer,
    getMainWindow: () => win,
    getMiniPlayerWindow: () => miniPlayerWindow,
  })
  await createWindow()
})
