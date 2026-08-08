export function encodeFrame(opcode: number, data: unknown) {
  const body = Buffer.from(JSON.stringify(data), 'utf8')
  const header = Buffer.alloc(8)
  header.writeInt32LE(opcode, 0)
  header.writeInt32LE(body.length, 4)
  return Buffer.concat([header, body])
}

export function decodeFrames(buffer: Buffer) {
  const frames: Array<{ opcode: number, payload: Record<string, unknown> }> = []
  let offset = 0

  while (buffer.length - offset >= 8) {
    const opcode = buffer.readInt32LE(offset)
    const length = buffer.readInt32LE(offset + 4)
    if (buffer.length - offset - 8 < length) break

    const body = buffer.subarray(offset + 8, offset + 8 + length).toString('utf8')
    frames.push({ opcode, payload: JSON.parse(body) as Record<string, unknown> })
    offset += 8 + length
  }

  return { frames, rest: buffer.subarray(offset) }
}
