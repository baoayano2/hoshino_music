import type { SpotifyHome, SpotifyHomeCard, SpotifyHomeSection, SpotifyPlaylistPage, SpotifyPlaylistTrack, SpotifySearchPage } from '../ipc/types'

type JsonObject = Record<string, unknown>

const object = (value: unknown): JsonObject | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : undefined

const array = (value: unknown): unknown[] => Array.isArray(value) ? value : []

function at(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (Array.isArray(current)) {
      const index = Number(key)
      return Number.isInteger(index) ? current[index] : undefined
    }
    return object(current)?.[key]
  }, value)
}

function textAt(value: unknown, ...paths: string[]) {
  for (const path of paths) {
    const candidate = at(value, path)
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  return ''
}

function labelAt(value: unknown, ...paths: string[]) {
  return textAt(value, ...paths.flatMap((path) => [
    `${path}.transformedLabel`,
    `${path}.translatedBaseText`,
    `${path}.text`,
    path,
  ]))
}

function imageFrom(value: unknown) {
  const collections = [
    'images.items.0.sources',
    'coverArt.sources',
    'albumOfTrack.coverArt.sources',
    'visuals.avatarImage.sources',
    'visuals.headerImage.sources',
    'image.sources',
  ]
  for (const path of collections) {
    const sources = array(at(value, path)).map(object).filter((source): source is JsonObject => Boolean(source))
    const best = sources
      .filter((source) => typeof source.url === 'string')
      .sort((left, right) => Number(right.width ?? 0) - Number(left.width ?? 0))[0]
    if (typeof best?.url === 'string') return best.url
  }
  return ''
}

function artistNames(value: unknown) {
  return array(at(value, 'artists.items'))
    .map((artist) => textAt(artist, 'profile.name', 'name'))
    .filter(Boolean)
    .join(', ')
}

function dateAt(value: unknown, ...paths: string[]) {
  for (const path of paths) {
    const candidate = at(value, path)
    if (typeof candidate === 'string' && !Number.isNaN(Date.parse(candidate))) return candidate
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return new Date(candidate).toISOString()
  }
  return undefined
}

function normalizeSubtitle(value: string) {
  if (/href\s*=\s*["']?spotify:/i.test(value) || /<a\b/i.test(value)) return 'By Spotify'
  return value.replace(/<[^>]+>/g, '').trim()
}

function normalizeCard(value: unknown, index: number): SpotifyHomeCard | null {
  const content = object(at(value, 'content.data')) ?? object(at(value, 'content')) ?? object(value)
  if (!content) return null
  const type = textAt(content, '__typename', 'type') || 'Spotify item'
  const title = textAt(content, 'name', 'profile.name', 'title.text', 'title')
  if (!title) return null
  const uri = textAt(content, 'uri') || textAt(value, 'uri')
  const owner = textAt(content, 'ownerV2.data.name', 'owner.name')
  const subtitle = normalizeSubtitle(artistNames(content)
    || (owner ? `By ${owner}` : '')
    || textAt(content, 'publisher.name', 'description', 'albumOfTrack.name'))
  return {
    id: uri || `${type}-${title}-${index}`,
    uri,
    title,
    subtitle,
    imageUrl: imageFrom(content),
    type,
    durationMs: Number(at(content, 'duration.totalMilliseconds') ?? at(content, 'trackDuration.totalMilliseconds')) || undefined,
    playable: at(content, 'playability.playable') !== false,
    albumUri: textAt(content, 'albumOfTrack.uri') || undefined,
    albumTitle: textAt(content, 'albumOfTrack.name') || undefined,
  }
}

export function normalizeSpotifyHome(payload: unknown): SpotifyHome {
  const home = at(payload, 'data.home') ?? at(payload, 'data.homeV2')
  const sectionItems = array(
    at(home, 'sectionContainer.sections.items')
      ?? at(home, 'homeSectionContainer.sections.items'),
  )
  const sections = sectionItems.map((section, sectionIndex): SpotifyHomeSection | null => {
    const sectionType = textAt(section, 'data.__typename')
    const title = labelAt(section, 'data.title')
      || (sectionType === 'HomeShortsSectionData' ? 'Jump back in' : '')
    const cards = array(at(section, 'sectionItems.items'))
      .map((card, cardIndex) => normalizeCard(card, cardIndex))
      .filter((card): card is SpotifyHomeCard => Boolean(card))
    if (!title || cards.length === 0) return null
    return {
      id: textAt(section, 'uri') || `spotify-home-section-${sectionIndex}`,
      title,
      cards,
    }
  }).filter((section): section is SpotifyHomeSection => Boolean(section))

  return {
    greeting: labelAt(home, 'greeting') || 'Made for you',
    sections,
  }
}

export function normalizeSpotifyPlaylist(payload: unknown, requestedOffset: number, requestedLimit: number): SpotifyPlaylistPage {
  const album = at(payload, 'data.albumUnion')
  const albumTracks = at(album, 'tracksV2')
  const content = at(payload, 'data.playlistV2.content') ?? albumTracks
  const isAlbum = Boolean(albumTracks)
  const offset = Number(at(content, 'pagingInfo.offset')) || requestedOffset
  const limit = Number(at(content, 'pagingInfo.limit')) || requestedLimit
  const items = array(at(content, 'items')).map((item, index): SpotifyPlaylistTrack | null => {
    const track = isAlbum ? at(item, 'track') : at(item, 'itemV2.data')
    const uri = textAt(track, 'uri')
    const title = textAt(track, 'name')
    if (!uri || !title || !uri.startsWith('spotify:track:')) return null
    return {
      id: textAt(item, 'uid') || `${uri}:${offset + index}`,
      uri,
      title,
      artist: artistNames(track) || 'Unknown artist',
      album: isAlbum ? textAt(album, 'name') : textAt(track, 'albumOfTrack.name'),
      imageUrl: isAlbum ? imageFrom(album) : imageFrom(at(track, 'albumOfTrack')),
      durationMs: Number(at(track, isAlbum ? 'duration.totalMilliseconds' : 'trackDuration.totalMilliseconds')) || 0,
      playable: at(track, 'playability.playable') !== false,
      addedAt: dateAt(item, 'addedAt.isoString', 'addedAt', 'addedAtTimestamp'),
      position: offset + index,
    }
  }).filter((track): track is SpotifyPlaylistTrack => Boolean(track))

  return {
    items,
    totalCount: Number(at(content, 'totalCount')) || items.length,
    offset,
    limit,
  }
}

export function normalizeSpotifySearch(payload: unknown, offset: number, limit: number): SpotifySearchPage {
  const rawItems = array(at(payload, 'data.searchV2.topResultsV2.itemsV2'))
  const items = rawItems.map((hit, index) => {
    const wrapper = at(hit, 'item')
    if (textAt(wrapper, '__typename') === 'SearchAutoCompleteEntity') return null
    return normalizeCard({ content: wrapper, uri: textAt(hit, 'uri') }, offset + index)
  }).filter((card): card is SpotifyHomeCard => Boolean(card))

  return {
    items,
    offset,
    limit,
    hasMore: rawItems.length >= limit,
  }
}
