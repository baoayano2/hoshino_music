import { useEffect, useState } from 'react'
import { configureAudioCors, resolveOnlineAudioUrl } from './audio-url'

const ONLINE_DURATION_CACHE_KEY = 'hoshino:discovery-duration-cache'

export function readOnlineDurationCache(): Record<string, number> {
  try {
    const cache = JSON.parse(localStorage.getItem(ONLINE_DURATION_CACHE_KEY) ?? '{}') as Record<string, number>
    return cache && typeof cache === 'object' ? cache : {}
  } catch {
    return {}
  }
}

export function writeOnlineDurationCache(url: string, duration: number) {
  const cache = readOnlineDurationCache()
  cache[url] = duration
  localStorage.setItem(ONLINE_DURATION_CACHE_KEY, JSON.stringify(cache))
}

export function useOnlineAudioDuration(url: string, duration?: number) {
  const [cachedDuration, setCachedDuration] = useState<number | null>(() => {
    if (duration && duration > 0) return duration
    const cache = readOnlineDurationCache()
    return url && Object.prototype.hasOwnProperty.call(cache, url) ? cache[url] ?? 0 : null
  })

  useEffect(() => {
    if (duration && duration > 0) {
      setCachedDuration(duration)
      return
    }
    if (!url) {
      setCachedDuration(0)
      return
    }
    const cache = readOnlineDurationCache()
    if (Object.prototype.hasOwnProperty.call(cache, url)) {
      setCachedDuration(cache[url] ?? 0)
      return
    }

    const audio = new Audio()
    const updateDuration = () => {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) return
      writeOnlineDurationCache(url, audio.duration)
      setCachedDuration(audio.duration)
    }
    const markUnavailable = () => {
      writeOnlineDurationCache(url, 0)
      setCachedDuration(0)
    }
    const audioUrl = resolveOnlineAudioUrl(url)

    audio.preload = 'metadata'
    audio.addEventListener('loadedmetadata', updateDuration)
    audio.addEventListener('durationchange', updateDuration)
    audio.addEventListener('error', markUnavailable)
    configureAudioCors(audio, audioUrl)
    audio.src = audioUrl
    audio.load()

    return () => {
      audio.removeEventListener('loadedmetadata', updateDuration)
      audio.removeEventListener('durationchange', updateDuration)
      audio.removeEventListener('error', markUnavailable)
      audio.removeAttribute('src')
      audio.load()
    }
  }, [duration, url])

  return cachedDuration
}
