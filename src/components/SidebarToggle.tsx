import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'

type SidebarToggleProps = {
  collapsed: boolean
  onToggle: () => void
}

export function SidebarToggle({ collapsed, onToggle }: SidebarToggleProps) {
  const label = collapsed ? 'Expand sidebar' : 'Collapse sidebar'

  return (
    <button className="sidebar-toggle" aria-label={label} title={label} onClick={onToggle}>
      {collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
    </button>
  )
}
