export const EQ_BAND_COUNTS = [3, 5, 10, 15] as const
export const EQ_MIN_GAIN = -12
export const EQ_MAX_GAIN = 12
export const EQ_MIN_FREQUENCY = 20
export const EQ_MAX_FREQUENCY = 20000
export const EQ_DEFAULT_Q = 1.1
export const EQ_MIN_Q = 0.1
export const EQ_MAX_Q = 18

const EQ_FREQUENCIES: Record<number, number[]> = {
  3: [100, 1000, 10000],
  5: [60, 250, 1000, 4000, 12000],
  10: [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000],
  15: [25, 40, 63, 100, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300, 10000, 16000],
}

export function normalizeEqBandCount(value: number) {
  return EQ_BAND_COUNTS.includes(value as typeof EQ_BAND_COUNTS[number]) ? value : 10
}

export function getEqFrequencies(bandCount: number) {
  return EQ_FREQUENCIES[normalizeEqBandCount(bandCount)]
}

export function clampEqFrequency(value: number) {
  if (!Number.isFinite(value)) return EQ_MIN_FREQUENCY
  return Math.round(Math.min(Math.max(value, EQ_MIN_FREQUENCY), EQ_MAX_FREQUENCY))
}

export function clampEqQ(value: number) {
  if (!Number.isFinite(value)) return EQ_DEFAULT_Q
  return Math.round(Math.min(Math.max(value, EQ_MIN_Q), EQ_MAX_Q) * 100) / 100
}

export function clampEqGain(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(value, EQ_MIN_GAIN), EQ_MAX_GAIN)
}

export function normalizeEqGains(gains: number[], bandCount: number) {
  const frequencies = getEqFrequencies(bandCount)
  return frequencies.map((_, index) => clampEqGain(gains[index] ?? 0))
}

export function normalizeEqFrequencies(frequencies: number[], bandCount: number) {
  const defaults = getEqFrequencies(bandCount)
  return defaults.map((frequency, index) => clampEqFrequency(frequencies[index] ?? frequency))
}

export function normalizeEqQValues(qValues: number[], bandCount: number) {
  const frequencies = getEqFrequencies(bandCount)
  return frequencies.map((_, index) => clampEqQ(qValues[index] ?? EQ_DEFAULT_Q))
}

export function formatEqFrequency(frequency: number) {
  return frequency >= 1000 ? `${frequency / 1000}k` : String(frequency)
}
