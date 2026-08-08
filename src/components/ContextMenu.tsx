import { createPortal } from 'react-dom'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export type ContextMenuItem = {
  label: string
  icon: ReactNode
  danger?: boolean
  onSelect?: () => void
  children?: ContextMenuItem[]
}

type ContextMenuProps = {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

const MENU_WIDTH = 210
const SUBMENU_WIDTH = 210
const SUBMENU_GAP = 12
const VIEWPORT_PADDING = 8
const ROW_HEIGHT = 42
const MENU_VERTICAL_OFFSET = 20

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null)
  const submenuCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const menuLeft = Math.max(VIEWPORT_PADDING, Math.min(x, window.innerWidth - MENU_WIDTH - VIEWPORT_PADDING))
  const menuTop = Math.max(VIEWPORT_PADDING, Math.min(y, window.innerHeight - items.length * ROW_HEIGHT - MENU_VERTICAL_OFFSET))
  const rightRoom = window.innerWidth - menuLeft - MENU_WIDTH - VIEWPORT_PADDING
  const leftRoom = menuLeft - VIEWPORT_PADDING
  const submenuOpensLeft = rightRoom < SUBMENU_WIDTH + SUBMENU_GAP && leftRoom > rightRoom

  const clearSubmenuCloseTimer = () => {
    if (!submenuCloseTimer.current) return
    clearTimeout(submenuCloseTimer.current)
    submenuCloseTimer.current = null
  }

  const openSubmenu = (label: string) => {
    clearSubmenuCloseTimer()
    setActiveSubmenu(label)
  }

  const closeSubmenuSoon = () => {
    clearSubmenuCloseTimer()
    submenuCloseTimer.current = setTimeout(() => {
      setActiveSubmenu(null)
      submenuCloseTimer.current = null
    }, 280)
  }

  useEffect(() => {
    const close = () => onClose()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('click', close)
    window.addEventListener('pointerdown', close)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('keydown', closeOnEscape)
      clearSubmenuCloseTimer()
    }
  }, [onClose])

  return createPortal(
    <div
      className="context-menu"
      role="menu"
      style={{ left: menuLeft, top: menuTop }}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => { event.preventDefault(); event.stopPropagation() }}
    >
      {items.map((item) => (
        <div
          className={`context-menu-item-wrap ${item.children?.length ? 'has-submenu' : ''} ${submenuOpensLeft ? 'submenu-left' : ''}`}
          key={item.label}
          onPointerEnter={() => { if (item.children?.length) openSubmenu(item.label) }}
          onPointerLeave={() => { if (item.children?.length) closeSubmenuSoon() }}
          onFocus={() => { if (item.children?.length) openSubmenu(item.label) }}
        >
          <button
            className={`${item.danger ? 'danger' : ''} ${item.children?.length ? 'has-submenu' : ''}`}
            role="menuitem"
            onClick={() => {
              if (item.children?.length) return
              item.onSelect?.()
              onClose()
            }}
          >
            {item.icon}<span>{item.label}</span>{item.children?.length ? (submenuOpensLeft ? <ChevronLeft className="context-submenu-angle" size={15} /> : <ChevronRight className="context-submenu-angle" size={15} />) : null}
          </button>
          {item.children?.length ? <div
            className={`context-submenu ${submenuOpensLeft ? 'submenu-left' : ''} ${activeSubmenu === item.label ? 'open' : ''}`}
            role="menu"
            onPointerEnter={() => openSubmenu(item.label)}
            onPointerLeave={closeSubmenuSoon}
          >
            {item.children.map((child) => (
              <button
                className={child.danger ? 'danger' : ''}
                key={child.label}
                role="menuitem"
                onClick={() => { child.onSelect?.(); onClose() }}
              >
                {child.icon}<span>{child.label}</span>
              </button>
            ))}
          </div> : null}
        </div>
      ))}
    </div>,
    document.body,
  )
}
