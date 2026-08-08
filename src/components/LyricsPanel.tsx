import { FileText, X } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useRef, type CSSProperties } from 'react'
import type { MusicTrack } from '../types'

type LyricLine = {
  time: number
  text: string
}

type LyricsPanelProps = {
  song: MusicTrack
  currentTime: number
  lyricsDelay: number
  onClose: () => void
}

export const LyricsPanel = memo(function LyricsPanel({ song, currentTime, lyricsDelay, onClose }: LyricsPanelProps) {
  const lines = useMemo(() => parseLrc(song.lyrics ?? ''), [song.lyrics])
  const syncedTime = Math.max(0, currentTime - lyricsDelay)
  const atSongStart = currentTime <= 0.25
  const activeIndex = useMemo(() => {
    if (!lines.length || atSongStart) return -1
    let index = -1
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      if (lines[lineIndex].time <= syncedTime) index = lineIndex
      else break
    }
    return index
  }, [atSongStart, lines, syncedTime])
  const targetIndex = activeIndex >= 0 ? activeIndex : lines.length ? 0 : -1
  const targetRef = useRef<HTMLParagraphElement | null>(null)
  const panelRef = useRef<HTMLElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const centerTargetLine = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const target = targetRef.current
    const scroller = scrollRef.current
    if (!target || !scroller) return
    const targetCenter = target.offsetTop + (target.offsetHeight / 2)
    scroller.scrollTo({ top: Math.max(0, targetCenter - (scroller.clientHeight / 2)), behavior })
  }, [])

  useEffect(() => {
    centerTargetLine(atSongStart ? 'auto' : 'smooth')
  }, [activeIndex, atSongStart, centerTargetLine, song.id])

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return undefined
    const observer = new ResizeObserver(() => centerTargetLine('auto'))
    observer.observe(panel)
    return () => observer.disconnect()
  }, [centerTargetLine])

  return <section className="lyrics-panel" aria-label="Lyrics panel" ref={panelRef}>
    <div className="lyrics-panel-bg" style={{ '--lyrics-cover': song.coverUrl ? `url("${song.coverUrl}")` : 'none' } as CSSProperties} />
    <header className="lyrics-panel-header">
      <span className="lyrics-panel-icon"><FileText size={18} /></span>
      <div>
        <span className="eyebrow">Lyrics</span>
        <h2>{song.title}</h2>
        <p>{song.artist || 'Unknown artist'}</p>
      </div>
      <button className="lyrics-panel-close" aria-label="Close lyrics" onClick={onClose}><X size={20} /></button>
    </header>
    <div className="lyrics-panel-scroll" ref={scrollRef}>
      {lines.length ? lines.map((line, index) => (
        <p
          key={`${line.time}-${index}`}
          ref={index === targetIndex ? targetRef : undefined}
          className={index === activeIndex ? 'active' : index < activeIndex ? 'past' : ''}
        >
          {line.text || '...'}
        </p>
      )) : <div className="lyrics-empty"><FileText size={24} /><span>No synced lyrics found in this LRC file.</span></div>}
    </div>
  </section>
})

function parseLrc(input: string): LyricLine[] {
  const timestampPattern = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g
  const lines: LyricLine[] = []
  input.split(/\r?\n/).forEach((rawLine) => {
    const matches = [...rawLine.matchAll(timestampPattern)]
    if (!matches.length) return
    const text = rawLine.replace(timestampPattern, '').trim()
    matches.forEach((match) => {
      const minutes = Number(match[1])
      const seconds = Number(match[2])
      const fraction = match[3] ? Number(`0.${match[3].padEnd(3, '0').slice(0, 3)}`) : 0
      const time = minutes * 60 + seconds + fraction
      if (Number.isFinite(time)) lines.push({ time, text })
    })
  })
  return lines.sort((a, b) => a.time - b.time)
}
