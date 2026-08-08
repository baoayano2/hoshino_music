import { app, BrowserWindow, screen, type Rectangle } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

type WindowState = {
  bounds?: Rectangle
  maximized: boolean
  fullscreen: boolean
}

const DEFAULT_STATE: WindowState = {
  maximized: false,
  fullscreen: false,
}

let saveTimer: NodeJS.Timeout | null = null

function statePath() {
  return path.join(app.getPath('userData'), 'HoshinoMusic', 'window-state.json')
}

export async function restoreWindowState(): Promise<WindowState> {
  try {
    const state = JSON.parse(await readFile(statePath(), 'utf8')) as WindowState
    return {
      bounds: state.bounds && isVisible(state.bounds) ? state.bounds : undefined,
      maximized: state.maximized === true,
      fullscreen: state.fullscreen === true,
    }
  } catch {
    return DEFAULT_STATE
  }
}

export function trackWindowState(window: BrowserWindow) {
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      void saveWindowState(window)
    }, 250)
  }

  window.on('move', scheduleSave)
  window.on('resize', scheduleSave)
  window.on('maximize', scheduleSave)
  window.on('unmaximize', scheduleSave)
  window.on('enter-full-screen', scheduleSave)
  window.on('leave-full-screen', scheduleSave)
  window.on('close', () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = null
    void saveWindowState(window)
  })
}

async function saveWindowState(window: BrowserWindow) {
  if (window.isDestroyed()) return
  const state: WindowState = {
    bounds: window.getNormalBounds(),
    maximized: window.isMaximized(),
    fullscreen: window.isFullScreen(),
  }
  await writeFile(statePath(), JSON.stringify(state, null, 2), 'utf8').catch(() => undefined)
}

function isVisible(bounds: Rectangle) {
  return screen.getAllDisplays().some(({ workArea }) => {
    const horizontalOverlap = Math.min(bounds.x + bounds.width, workArea.x + workArea.width) - Math.max(bounds.x, workArea.x)
    const verticalOverlap = Math.min(bounds.y + bounds.height, workArea.y + workArea.height) - Math.max(bounds.y, workArea.y)
    return horizontalOverlap >= 100 && verticalOverlap >= 100
  })
}
