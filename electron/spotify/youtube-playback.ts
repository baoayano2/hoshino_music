import YTMusic from 'ytmusic-api'
import type { SongDetailed, VideoDetailed } from 'ytmusic-api'
import { Innertube, Platform } from 'youtubei.js'
import Kuroshiro from 'kuroshiro'
import KuromojiAnalyzer from 'kuroshiro-analyzer-kuromoji'
import { createRequire } from 'node:module'
import path from 'node:path'
import { toKatakana } from 'wanakana'

export type SpotifyPlaybackInput = { id: string, title: string, artist: string, album: string, imageUrl: string, durationMs: number }
export type SpotifyPlaybackResult = SpotifyPlaybackInput & { videoId: string, audioUrl: string, duration: number, debugSearch?: { query: string, results: unknown[] } }
type Candidate = { videoId: string, name: string, artistName: string, type: 'SONG' | 'VIDEO', sourceIndex: number, duration: number | null }

const CLIENTS = ['ANDROID_VR', 'ANDROID', 'IOS', 'WEB', 'WEB_REMIX', 'MWEB', 'TV'] as const
let ytMusicPromise: Promise<YTMusic> | null = null
let innertubePromise: ReturnType<typeof Innertube.create> | null = null
let kuroshiroPromise: Promise<Kuroshiro> | null = null
Platform.shim.eval = async (data) => new Function(data.output)()

function getYTMusic() {
  if (!ytMusicPromise) ytMusicPromise = (async () => { const client = new YTMusic(); await client.initialize(); return client })().catch((error) => { ytMusicPromise = null; throw error })
  return ytMusicPromise
}

function getInnertube() {
  if (!innertubePromise) innertubePromise = Innertube.create().catch((error) => { innertubePromise = null; throw error })
  return innertubePromise
}

function getKuroshiro() {
  if (!kuroshiroPromise) kuroshiroPromise = (async () => {
    const require = createRequire(import.meta.url)
    const analyzerRequire = createRequire(require.resolve('kuroshiro-analyzer-kuromoji'))
    const dictionary = path.join(path.dirname(analyzerRequire.resolve('kuromoji/package.json')), 'dict')
    const KuroshiroConstructor = (Kuroshiro as unknown as { default?: typeof Kuroshiro }).default ?? Kuroshiro
    const converter = new KuroshiroConstructor()
    await converter.init(new KuromojiAnalyzer({ dictPath: dictionary }))
    return converter
  })().catch((error) => { kuroshiroPromise = null; throw error })
  return kuroshiroPromise
}

function containsJapanese(value: string) {
  return /[\u3040-\u30ff\u3400-\u9fff]/u.test(value)
}

function katakanaVariant(value: string) {
  const converted = toKatakana(value).trim()
  return converted && /[\u30a0-\u30ff]/u.test(converted) && !/[a-z]/i.test(converted) ? converted : ''
}

function normalize(value: string) {
  return toKatakana(value, { passRomaji: true }).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').normalize('NFC').toLocaleLowerCase()
    .replace(/(?:\[|【|\(|（).*?(opening|ending|op|ed|anime|theme).*?(?:\]|】|\)|）)/giu, ' ')
    .replace(/\b(feat|ft)\.?\b.*$/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

function normalizeCredits(value: string) {
  return toKatakana(value, { passRomaji: true }).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').normalize('NFC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

function canonicalCredits(value: string) {
  return normalizeCredits(value.replace(/nightcord\s+at\s+25(?::?00)?/giu, '25時 ナイトコード'))
}

function creditAliasMatch(expected: string, actualArtist: string) {
  const expectedCompact = canonicalCredits(expected).replace(/\s+/g, '')
  const actualCompact = canonicalCredits(actualArtist).replace(/\s+/g, '')
  return Boolean(expectedCompact && actualCompact && (expectedCompact.includes(actualCompact) || actualCompact.includes(expectedCompact)))
}

function alternatives(values: string[]) {
  return values.flatMap((value) => value.split('|')).map((value) => value.trim()).filter(Boolean)
}

function matches(expected: string, actual: string) {
  const left = normalize(expected); const right = normalize(actual)
  return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)))
}

function titleScore(expected: string, actual: string) {
  const left = normalize(expected); const right = normalize(actual)
  if (!left || !right) return 0
  if (left === right) return 1
  const leftTokens = new Set(left.split(' ')); const rightTokens = new Set(right.split(' '))
  if (right.includes(left)) return .88
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length
  const coverage = overlap / Math.max(1, Math.max(leftTokens.size, rightTokens.size))
  if (left.includes(right) && rightTokens.size >= 2 && overlap / leftTokens.size >= .6) return .88
  return coverage
}

function oneEditApart(left: string, right: string) {
  if (left === right) return true
  if (!/^[a-z0-9]+$/.test(left) || !/^[a-z0-9]+$/.test(right)) return false
  if (Math.abs(left.length - right.length) > 1 || Math.min(left.length, right.length) < 3) return false
  if (left.length === right.length) {
    return [...left].filter((character, index) => character !== right[index]).length <= 1
  }
  const [shorter, longer] = left.length < right.length ? [left, right] : [right, left]
  for (let index = 0; index < longer.length; index += 1) {
    if (longer.slice(0, index) + longer.slice(index + 1) === shorter) return true
  }
  return false
}

function creditScore(expected: string, ...actualParts: string[]) {
  const normalizedExpected = normalizeCredits(expected)
  const normalizedActual = normalizeCredits(actualParts.join(' '))
  const compactExpected = normalizedExpected.replace(/\s+/g, '')
  const compactActual = normalizedActual.replace(/\s+/g, '')
  if (compactExpected && compactActual && (compactExpected === compactActual || compactActual.includes(compactExpected))) return 1
  const expectedTokens = new Set(normalizedExpected.split(' ').filter((token) => token.length > 1))
  const actualTokens = new Set(normalizedActual.split(' ').filter((token) => token.length > 1))
  return expectedTokens.size
    ? [...expectedTokens].filter((token) => [...actualTokens].some((actual) => oneEditApart(token, actual))).length / expectedTokens.size
    : 0
}

function durationMatches(expectedMs: number, actualSeconds: number | null | undefined) {
  if (!expectedMs || !actualSeconds) return true
  const expectedSeconds = expectedMs / 1000
  return Math.abs(expectedSeconds - actualSeconds) <= Math.max(15, expectedSeconds * .1)
}

function isLive(title: string) {
  return /\b(live|concert|performance|stage|tour|festival|showcase|session)\b|ライブ|公演|コンサート/i.test(title)
}

const INSTRUMENTAL_PATTERN = /\b(instrumental|off[ -]?vocal|karaoke)\b|カラオケ|オフ[ -]?ボーカル|インスト(?:ゥルメンタル)?/iu
const REMIX_PATTERN = /\b(remix|rework|mix edit|club mix|extended mix)\b/i
const IMITATION_PATTERN = /\b(no guide melody|music box|original(?:ly performed)? by)\b|原曲歌手/iu

function cleanVersionTitle(value: string) {
  return value
    .replace(/[[(（【][^\])）】]*(?:instrumental|off[ -]?vocal|karaoke|remix|rework|mix edit|club mix|extended mix)[^\])）】]*[\])）】]/giu, ' ')
    .replace(/\s*[-–—~〜]\s*[^-–—~〜]{0,60}\b(?:instrumental|off[ -]?vocal|karaoke|remix|rework|mix edit|club mix|extended mix)\b.*$/iu, ' ')
    .replace(/\b(?:instrumental|off[ -]?vocal|karaoke|remix|rework|mix edit|club mix|extended mix)\b/giu, ' ')
    .replace(/[\s\-–—~〜|:]+$/u, '').replace(/\s{2,}/g, ' ').trim()
}

async function findCandidates(input: SpotifyPlaybackInput, debug: boolean, type: 'SONG' | 'VIDEO') {
  const album = matches(input.title, input.album) ? '' : input.album
  const primaryArtist = alternatives([input.artist])[0] || input.artist
  const query = [input.title, primaryArtist].filter((part) => part.trim()).join(' - ')
  const ytmusic = await getYTMusic()
  let romajiTitle = ''
  let romajiArtist = ''
  let katakanaTitle = ''
  let katakanaArtist = ''
  const search = (value: string): Promise<Array<SongDetailed | VideoDetailed>> => type === 'SONG'
    ? ytmusic.searchSongs(value)
    : ytmusic.searchVideos(value)
  if (containsJapanese(`${input.title} ${input.artist}`)) {
    try {
      const converter = await getKuroshiro()
      ;[romajiTitle, romajiArtist, katakanaTitle, katakanaArtist] = await Promise.all([
        converter.convert(input.title, { to: 'romaji', mode: 'spaced' }),
        converter.convert(input.artist, { to: 'romaji', mode: 'spaced' }),
        converter.convert(input.title, { to: 'katakana', mode: 'spaced' }),
        converter.convert(input.artist, { to: 'katakana', mode: 'spaced' }),
      ])
    } catch (error) {
      if (debug) console.debug('[Spotify playback] Japanese conversion failed:', error)
    }
  } else {
    romajiTitle = input.title
    romajiArtist = input.artist
    katakanaTitle = katakanaVariant(input.title)
    katakanaArtist = katakanaVariant(input.artist)
  }
  // YouTube Music ranking degrades when several spellings of the same credit are
  // concatenated into one query. Search each script independently and merge later.
  const romajiQuery = [romajiTitle || input.title, alternatives([romajiArtist])[0] || primaryArtist].filter((part) => part.trim()).join(' - ')
  const katakanaQuery = [katakanaTitle || input.title, alternatives([katakanaArtist])[0] || primaryArtist].filter((part) => part.trim()).join(' - ')
  const degreeQuery = /^360(?:\s*(?:°|degrees?))?$/i.test(input.title.trim())
    ? `360 degree - ${alternatives([romajiArtist])[0] || primaryArtist}`
    : ''
  const searchedQueries = new Set<string>()
  const searchOnce = async (searchQuery: string, label: string) => {
    const key = normalizeCredits(searchQuery)
    if (!key || searchedQueries.has(key)) return []
    searchedQueries.add(key)
    try {
      const results = await search(searchQuery)
      if (debug) console.debug(`[Spotify playback] ${label}:`, { query: searchQuery, results })
      return results
    } catch (error) {
      if (debug) console.debug(`[Spotify playback] ${label} failed:`, { query: searchQuery, error })
      return []
    }
  }
  const romajiResults = await searchOnce(romajiQuery, 'Preferred romaji search')
  const primaryResults = await searchOnce(query, 'Original metadata search')
  const katakanaResults = await searchOnce(katakanaQuery, 'Supplemental Katakana search')
  const degreeResults = await searchOnce(degreeQuery, 'Supplemental degree-symbol search')
  if (debug) {
    console.groupCollapsed(`[Spotify playback] YouTube Music search: ${query}`)
    console.debug('Spotify metadata:', { title: input.title, artist: input.artist, album: input.album, durationMs: input.durationMs })
    console.debug('Search results:', primaryResults)
    console.groupEnd()
  }
  const wantsInstrumental = INSTRUMENTAL_PATTERN.test(`${input.title} ${input.album}`)
  const wantsRemix = REMIX_PATTERN.test(`${input.title} ${input.album}`)
  const allowed = (item: SongDetailed | VideoDetailed) =>
    (wantsInstrumental || !INSTRUMENTAL_PATTERN.test(item.name))
    && (wantsInstrumental || !IMITATION_PATTERN.test(item.name))
    && (wantsRemix || !REMIX_PATTERN.test(item.name))
    && durationMatches(input.durationMs, item.duration)
  const playable = (items: Array<SongDetailed | VideoDetailed>) => items.filter(allowed)
  const primaryPlayable = playable(primaryResults)
  let allResults = [...romajiResults, ...primaryResults, ...katakanaResults, ...degreeResults]
  const rank = (items: Array<SongDetailed | VideoDetailed>, requireTitle: boolean, expectedTitles = [input.title], expectedArtists = [input.artist]) => items.map((item) => ({
    item,
    sourceIndex: allResults.indexOf(item),
    title: Math.max(...alternatives(expectedTitles).map((title) => titleScore(title, item.name))),
    artist: Math.max(...alternatives(expectedArtists).flatMap((artist) => [Number(matches(artist, item.artist.name) || creditAliasMatch(artist, item.artist.name)), creditScore(artist, item.artist.name, item.name)])),
    crossScript: !containsJapanese(input.title) && containsJapanese(item.name),
    live: isLive(item.name),
  })).filter((entry) => !requireTitle || entry.title >= .72 || (entry.crossScript && entry.artist >= .6 && entry.sourceIndex >= 0 && entry.sourceIndex <= 2))
    .sort((left, right) => Number(left.live) - Number(right.live) || right.artist - left.artist || right.title - left.title || left.sourceIndex - right.sourceIndex)
    .map(({ item, sourceIndex }): Candidate => ({ videoId: item.videoId, name: item.name, artistName: item.artist.name, type: item.type, sourceIndex, duration: item.duration }))

  const primaryMatched = rank(primaryPlayable, true)
  const romajiMatched = romajiResults.length
    ? rank(playable(romajiResults), true, [input.title, katakanaTitle, romajiTitle], [input.artist, katakanaArtist, romajiArtist])
    : []
  const katakanaMatched = katakanaResults.length
    ? rank(playable(katakanaResults), true, [input.title, katakanaTitle, romajiTitle], [input.artist, katakanaArtist, romajiArtist])
    : []
  const degreeMatched = degreeResults.length
    ? rank(playable(degreeResults), true, [input.title, '360°', '360 degrees'], [input.artist, katakanaArtist, romajiArtist])
    : []
  let recoveryMatched: Candidate[] = []
  let albumMatched: Candidate[] = []
  const hasOriginalMatch = [...degreeMatched, ...romajiMatched, ...primaryMatched, ...katakanaMatched].some((candidate) =>
    alternatives([input.artist]).some((artist) => Math.max(
      Number(matches(artist, candidate.artistName) || creditAliasMatch(artist, candidate.artistName)),
      creditScore(artist, candidate.artistName, candidate.name),
    ) >= .6))

  if (!hasOriginalMatch && !wantsInstrumental && !wantsRemix) {
    const unwantedVersions = allResults.filter((item) =>
      (INSTRUMENTAL_PATTERN.test(item.name) || IMITATION_PATTERN.test(item.name) || REMIX_PATTERN.test(item.name))
      && durationMatches(input.durationMs, item.duration))
    const recoverySource = rank(unwantedVersions, true)[0]
    if (recoverySource) {
      const cleanTitle = cleanVersionTitle(recoverySource.name)
      const recoveryQuery = [cleanTitle, recoverySource.artistName].filter(Boolean).join(' - ')
      const recoveryResults = await searchOnce(recoveryQuery, 'Original-version recovery search')
      allResults = [...allResults, ...recoveryResults]
      recoveryMatched = rank(playable(recoveryResults), true, [input.title, cleanTitle], [input.artist, recoverySource.artistName])
    }
  }

  if (!romajiMatched.length && !primaryMatched.length && !katakanaMatched.length && !degreeMatched.length && !recoveryMatched.length && album) {
    const albumQuery = [input.title, input.artist, album].join(' - ')
    const albumResults = await search(albumQuery)
    allResults = [...allResults, ...albumResults]
    albumMatched = rank(playable(albumResults), true)
    if (debug) console.debug('[Spotify playback] Low-priority album search:', { query: albumQuery, results: albumResults })
  }

  const allPlayable = playable(allResults)
  const candidates = [...recoveryMatched, ...degreeMatched, ...romajiMatched, ...primaryMatched, ...katakanaMatched, ...albumMatched]
    .filter((candidate, index, all) => all.findIndex((item) => item.videoId === candidate.videoId) === index).slice(0, 12)
  const fallback = rank(allPlayable, false)
    .filter((candidate, index, all) => all.findIndex((item) => item.videoId === candidate.videoId) === index).slice(0, 12)
  return { candidates, fallback, query: [...searchedQueries].join(' | '), results: allResults }
}

async function findAudio(videoId: string) {
  const yt = await getInnertube()
  for (const client of CLIENTS) {
    try {
      const info = client === 'WEB_REMIX' ? await yt.music.getInfo(videoId) : await yt.getInfo(videoId, { client })
      const audio = [...(info.streaming_data?.adaptive_formats ?? [])].filter((format) => format.has_audio && !format.has_video)
        .sort((left, right) => (right.bitrate ?? 0) - (left.bitrate ?? 0))[0]
      if (!audio) continue
      const url = await audio.decipher(yt.session.player)
      if (url) return url
    } catch { /* Try the next YouTube client. */ }
  }
  throw new Error('Không lấy được stream audio từ YouTube.')
}

export async function resolveSpotifyPlayback(input: SpotifyPlaybackInput, debug = false): Promise<SpotifyPlaybackResult> {
  const allDebugResults: unknown[] = []
  const fallbackCandidates: Candidate[] = []
  let lastQuery = `${input.title} - ${input.artist}`
  const permitsInstrumental = INSTRUMENTAL_PATTERN.test(`${input.title} ${input.album}`)
  const permitsRemix = REMIX_PATTERN.test(`${input.title} ${input.album}`)
  const tryCandidate = async (candidate: Candidate) => {
    if ((!permitsInstrumental && (INSTRUMENTAL_PATTERN.test(candidate.name) || IMITATION_PATTERN.test(candidate.name)))
      || (!permitsRemix && REMIX_PATTERN.test(candidate.name))) {
      if (debug) console.debug('[Spotify playback] Rejected alternate version before streaming:', candidate)
      return null
    }
    try {
      const audioUrl = await findAudio(candidate.videoId)
      if (debug) console.debug('[Spotify playback] Selected candidate:', candidate)
      return { ...input, videoId: candidate.videoId, audioUrl, duration: candidate.duration ?? input.durationMs / 1000, debugSearch: debug ? { query: lastQuery, results: allDebugResults } : undefined }
    } catch (error) {
      if (debug) console.debug('[Spotify playback] Candidate unavailable:', candidate, error)
      return null
    }
  }
  for (const type of ['SONG', 'VIDEO'] as const) {
    const { candidates, fallback, query, results } = await findCandidates(input, debug, type)
    lastQuery = query
    allDebugResults.push(...results)
    fallbackCandidates.push(...fallback)
    for (const candidate of candidates) {
      const resolved = await tryCandidate(candidate)
      if (resolved) return resolved
    }
    if (debug && type === 'SONG') console.debug('[Spotify playback] No usable SONG; falling back to searchVideos().')
  }
  for (const candidate of fallbackCandidates.filter((item, index, all) => all.findIndex((other) => other.videoId === item.videoId) === index)) {
    const resolved = await tryCandidate(candidate)
    if (resolved) return resolved
  }
  throw new Error(`Không tìm thấy stream có độ dài phù hợp cho “${input.title}” — ${input.artist}.`)
}
