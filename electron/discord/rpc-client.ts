import crypto from 'node:crypto'
import net from 'node:net'
import { decodeFrames, encodeFrame } from './frame'

const OPCODE = { handshake: 0, frame: 1, ping: 3, pong: 4 } as const

export class DiscordRpcClient {
  private socket: net.Socket | null = null
  private buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0)
  private connected = false
  private currentActivity: unknown = null

  constructor(private readonly clientId: string) {}

  isAvailable() {
    return this.socket !== null
  }

  async connect() {
    if (this.socket) return
    const socket = await findDiscordPipe()
    this.socket = socket
    socket.on('data', (chunk) => this.handleData(chunk))
    socket.on('close', () => this.handleClose())
    socket.on('error', () => this.handleClose())
    this.send(OPCODE.handshake, { v: 1, client_id: this.clientId })
  }

  setActivity(activity: unknown) {
    this.currentActivity = activity
    if (this.connected) this.sendActivity(activity)
  }

  clearActivity() {
    this.currentActivity = null
    if (this.connected) this.sendActivity(null)
  }

  destroy() {
    this.socket?.destroy()
    this.handleClose()
  }

  private handleData(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk])
    const { frames, rest } = decodeFrames(this.buffer)
    this.buffer = rest

    for (const { opcode, payload } of frames) {
      if (opcode === OPCODE.ping) {
        this.send(OPCODE.pong, payload)
      } else if (payload.evt === 'READY') {
        this.connected = true
        if (this.currentActivity) this.sendActivity(this.currentActivity)
      }
    }
  }

  private sendActivity(activity: unknown) {
    this.send(OPCODE.frame, {
      cmd: 'SET_ACTIVITY',
      args: { pid: process.pid, activity },
      nonce: crypto.randomUUID(),
    })
  }

  private send(opcode: number, payload: unknown) {
    this.socket?.write(encodeFrame(opcode, payload))
  }

  private handleClose() {
    this.connected = false
    this.socket = null
    this.buffer = Buffer.alloc(0)
  }
}

function findDiscordPipe(): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    let index = 0
    const tryNext = () => {
      if (index >= 10) {
        reject(new Error('Discord is not running'))
        return
      }

      const socket = net.createConnection(`\\\\?\\pipe\\discord-ipc-${index}`)
      const handleError = () => {
        socket.destroy()
        index += 1
        tryNext()
      }
      socket.once('connect', () => {
        socket.removeListener('error', handleError)
        resolve(socket)
      })
      socket.once('error', handleError)
    }
    tryNext()
  })
}
