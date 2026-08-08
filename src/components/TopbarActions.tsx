import { Bell, Link, Settings, User } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { AudioOutputDevice } from '../audio-device'
import { AudioOutputIndicator } from './AudioOutputIndicator'

type TopbarActionsProps = {
  audioOutput: AudioOutputDevice | null
  userName: string
  userDescription: string
  userAvatarUrl: string
  onOpenAudioOutputs: () => void
  onOpenVersionNotice: () => void
  onOpenUserSettings: () => void
  onLinkAccount: () => void
}

export function TopbarActions({ audioOutput, userName, userDescription, userAvatarUrl, onOpenAudioOutputs, onOpenVersionNotice, onOpenUserSettings, onLinkAccount }: TopbarActionsProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const displayName = userName.trim() || 'Local user'
  const description = userDescription.trim() || 'Client profile on this device'

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  return <div className="topbar-actions">
    <button type="button" className="version-notice-button" aria-label="Open update notice" title="Update notice" onClick={onOpenVersionNotice}><Bell size={18} /></button>
    <AudioOutputIndicator audioOutput={audioOutput} onClick={onOpenAudioOutputs} />
    <div className="user-profile-menu" ref={rootRef}>
      <button type="button" className="user-profile-button" aria-label="Open user menu" aria-expanded={open} title={displayName} onClick={() => setOpen((current) => !current)}>
        {userAvatarUrl ? <img src={userAvatarUrl} alt="" /> : <User size={18} />}
      </button>
      {open && <div className="user-profile-dropdown">
        <div className="user-profile-summary">
          <span className="user-profile-avatar">{userAvatarUrl ? <img src={userAvatarUrl} alt="" /> : <User size={18} />}</span>
          <span><strong>{displayName}</strong><small>{description}</small></span>
        </div>
        <div className="user-divider"></div>
        <button type="button" onClick={() => { setOpen(false); onOpenUserSettings() }}><Settings size={15} /><span>User settings</span></button>
        <button type="button" onClick={() => { setOpen(false); onLinkAccount() }}><Link size={15} /><span>Link account</span></button>
      </div>}
    </div>
  </div>
}
