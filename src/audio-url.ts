export function resolveOnlineAudioUrl(url: string) {
  try {
    const parsed = new URL(url, window.location.href)
    if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname !== 'cdn.shizuku.tech' && parsed.origin !== window.location.origin) {
      return `hoshino-online-audio://stream?url=${encodeURIComponent(parsed.href)}`
    }
    return parsed.href
  } catch {
    return url
  }
}

export function canUseCorsAudio(url: string) {
  try {
    const parsed = new URL(url, window.location.href)
    return parsed.protocol === 'hoshino-audio:'
      || parsed.protocol === 'hoshino-online-audio:'
      || parsed.protocol === 'data:'
      || parsed.protocol === 'blob:'
      || parsed.origin === window.location.origin
      || parsed.hostname === 'cdn.shizuku.tech'
  } catch {
    return false
  }
}

export function configureAudioCors(audio: HTMLAudioElement, url: string) {
  if (canUseCorsAudio(url)) audio.crossOrigin = 'anonymous'
  else audio.removeAttribute('crossorigin')
}
