import { contextBridge } from 'electron'
import { electronApi } from './ipc/preload-api'

// Expose only the explicitly supported application API to the renderer.
contextBridge.exposeInMainWorld('electronApi', electronApi)
