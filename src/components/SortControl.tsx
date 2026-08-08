import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useId, useState } from 'react'

export type SortOption = 'custom' | 'recent' | 'oldest' | 'title' | 'artist'
export const DROPDOWN_OPEN_EVENT = 'hoshino:dropdown-open'

const OPTIONS: Array<{ value: SortOption, label: string }> = [
  { value: 'recent', label: 'Recently added' },
  { value: 'oldest', label: 'Oldest added' },
  { value: 'title', label: 'Title A-Z' },
  { value: 'artist', label: 'Artist A-Z' },
]

export function SortControl({ value, onChange, includeCustom = false }: { value: SortOption, onChange: (value: SortOption) => void, includeCustom?: boolean }) {
  const [open, setOpen] = useState(false)
  const dropdownId = useId()
  const options = includeCustom ? [{ value: 'custom' as const, label: 'Custom order' }, ...OPTIONS] : OPTIONS
  const active = options.find((option) => option.value === value) ?? options[0]

  useEffect(() => {
    const handleDropdownOpen = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== dropdownId) setOpen(false)
    }
    window.addEventListener(DROPDOWN_OPEN_EVENT, handleDropdownOpen)
    return () => window.removeEventListener(DROPDOWN_OPEN_EVENT, handleDropdownOpen)
  }, [dropdownId])

  return <div className="sort-control">
    <button onClick={() => setOpen((current) => {
      const nextOpen = !current
      if (nextOpen) window.dispatchEvent(new CustomEvent(DROPDOWN_OPEN_EVENT, { detail: dropdownId }))
      return nextOpen
    })}>{active.label} <ChevronDown size={15} /></button>
    {open && <div className="sort-menu">{options.map((option) => (
      <button key={option.value} onClick={() => { onChange(option.value); setOpen(false) }}>
        {option.label}{option.value === value && <Check size={14} />}
      </button>
    ))}</div>}
  </div>
}

export function sortSongs<T extends { title: string, artist: string, addedAt: string }>(songs: T[], sort: SortOption) {
  if (sort === 'custom') return [...songs]
  return [...songs].sort((a, b) => {
    if (sort === 'oldest') return a.addedAt.localeCompare(b.addedAt)
    if (sort === 'title') return a.title.localeCompare(b.title)
    if (sort === 'artist') return a.artist.localeCompare(b.artist)
    return b.addedAt.localeCompare(a.addedAt)
  })
}
