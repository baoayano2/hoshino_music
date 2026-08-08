import { app } from 'electron'

export function applyStartWithWindows(enabled: boolean) {
  if (process.platform !== 'win32' || !app.isPackaged) return
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: process.execPath,
  })
}
