import { Maximize2, Minus, X } from 'lucide-react'

export function WindowBar() {
  return <header className="window-bar">
    <div className="window-title"><img src="./logo.jpg" alt="" /><strong>Hoshino Music</strong></div>
    <div className="window-actions">
      <button aria-label="Minimize window" onClick={() => void window.electronApi?.minimizeWindow()}><Minus size={16} /></button>
      <button aria-label="Maximize or restore window" onClick={() => void window.electronApi?.toggleMaximizeWindow()}><Maximize2 size={14} /></button>
      <button className="window-close" aria-label="Close window" onClick={() => void window.electronApi?.closeWindow()}><X size={17} /></button>
    </div>
  </header>
}
