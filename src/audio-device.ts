export type AudioOutputSnapshot = {
  active: AudioOutputDevice | null
  outputs: AudioOutputDevice[]
}

export type AudioOutputDevice = {
  id: string
  label: string
  isListeningDevice: boolean
}

const LISTENING_DEVICE_PATTERN = /\b(headphones?|headsets?|earphones?|earbuds?|airpods?|buds|bluetooth|bt speaker|wireless speaker)\b/i

export async function readAudioOutputSnapshot(activeOutputId = 'default'): Promise<AudioOutputSnapshot> {
  if (!navigator.mediaDevices?.enumerateDevices) return { active: null, outputs: [] }
  const devices = await navigator.mediaDevices.enumerateDevices()
  const outputs = devices
    .filter((device) => device.kind === 'audiooutput')
    .map((device) => ({
      id: device.deviceId,
      label: normalizeOutputLabel(device.label),
      isListeningDevice: LISTENING_DEVICE_PATTERN.test(device.label),
    }))
  const defaultOutput = outputs.find((device) => device.id === 'default') ?? null
  return {
    active: outputs.find((device) => device.id === activeOutputId) ?? defaultOutput,
    outputs,
  }
}

export function sameAudioOutput(a: AudioOutputDevice | null, b: AudioOutputDevice | null) {
  return a?.id === b?.id && a?.label === b?.label && a?.isListeningDevice === b?.isListeningDevice
}

function normalizeOutputLabel(label: string) {
  return label.replace(/^default\s*[-–—:]\s*/i, '').trim()
}
