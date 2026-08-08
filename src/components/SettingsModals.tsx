import { Bug, Check, ChevronDown, ChevronRight, Code2, Download, FileText, Headphones, Image, ImagePlus, MessageCircle, Power, RefreshCw, RotateCcw, SlidersHorizontal, Speaker, Trash2, User, X } from 'lucide-react'
import { type CSSProperties, type FormEvent, useEffect, useMemo, useState } from 'react'
import { FaSpotify } from 'react-icons/fa'
import type { AudioOutputDevice } from '../audio-device'
import { EQ_BAND_COUNTS, EQ_DEFAULT_Q, EQ_MAX_FREQUENCY, EQ_MAX_GAIN, EQ_MAX_Q, EQ_MIN_FREQUENCY, EQ_MIN_GAIN, EQ_MIN_Q, clampEqFrequency, clampEqGain, clampEqQ, formatEqFrequency, getEqFrequencies, normalizeEqFrequencies, normalizeEqGains, normalizeEqQValues } from '../equalizer'
import type { AppSettings, ImageBlob } from '../types'

type BaseModalProps = { onClose: () => void }
type DiscordInputSettings = Pick<AppSettings, 'discordSmallImageUrl' | 'discordPausedSmallImageUrl' | 'discordDetailsTemplate' | 'discordStateTemplate' | 'discordLargeTextTemplate' | 'discordSmallTextTemplate' | 'discordPausedSmallTextTemplate'>
type DiscordV2InputSettings = Pick<AppSettings, 'discordRpcV2SmallImageUrl' | 'discordRpcV2PausedSmallImageUrl' | 'discordRpcV2DetailsTemplate' | 'discordRpcV2StateTemplate' | 'discordRpcV2LargeTextTemplate' | 'discordRpcV2SmallTextTemplate' | 'discordRpcV2PausedSmallTextTemplate'>
type ClientUserSettings = Pick<AppSettings, 'clientUserName' | 'clientUserDescription' | 'clientUserAvatarUrl'>
type TuneEqSettings = Pick<AppSettings, 'tuneEqEnabled' | 'tuneEqAutoSave' | 'tuneEqBandCount' | 'tuneEqFrequencies' | 'tuneEqQValues' | 'tuneEqGains' | 'tuneEqBandSettings'>
type CrossFadeSettings = Pick<AppSettings, 'crossFadeEnabled' | 'crossFadeDuration'>

function imageBlobToDataUrl(blob: ImageBlob) {
  let binary = ''
  const bytes = new Uint8Array(blob.data)
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index])
  return `data:${blob.mimeType};base64,${btoa(binary)}`
}

export function AudioOutputModal({ outputs, activeOutput, onSelect, onClose }: BaseModalProps & { outputs: AudioOutputDevice[], activeOutput: AudioOutputDevice | null, onSelect: (device: AudioOutputDevice) => Promise<void> }) {
  const [selectingId, setSelectingId] = useState<string | null>(null)
  const select = async (device: AudioOutputDevice) => {
    if (selectingId || device.id === activeOutput?.id) return
    setSelectingId(device.id)
    try {
      await onSelect(device)
    } finally {
      setSelectingId(null)
    }
  }

  return <Modal title="Audio output" subtitle="Choose where Hoshino plays your music." onClose={onClose}>
    <div className="audio-output-list">
      {outputs.length ? outputs.map((device) => {
        const active = device.id === activeOutput?.id
        return <button key={device.id} type="button" className={active ? 'active' : ''} disabled={selectingId !== null} onClick={() => void select(device)}>
          <span className="audio-output-device-icon">{device.isListeningDevice ? <Headphones size={19} /> : <Speaker size={19} />}</span>
          <span className="audio-output-device-copy"><strong>{device.label || 'Unknown audio output'}</strong><small>{device.id === 'default' ? 'System default' : device.isListeningDevice ? 'Listening device' : 'Audio device'}</small></span>
          {active && <Check size={18} />}
          {!active && selectingId === device.id && <span className="audio-output-selecting">Switching...</span>}
        </button>
      }) : <p>No audio output devices are available.</p>}
    </div>
  </Modal>
}

export function TuneEqModal({ tuneEqEnabled, tuneEqAutoSave, tuneEqBandCount, tuneEqFrequencies, tuneEqQValues, tuneEqGains, tuneEqBandSettings, onChange, onSave, onInvalidFrequency, onInvalidQ, onClose }: BaseModalProps & TuneEqSettings & { onChange: (settings: TuneEqSettings, options?: { persist?: boolean }) => void, onSave: () => Promise<void>, onInvalidFrequency: () => void, onInvalidQ: () => void }) {
  const [hasManualChanges, setHasManualChanges] = useState(false)
  const [saving, setSaving] = useState(false)
  const gains = useMemo(() => normalizeEqGains(tuneEqGains, tuneEqBandCount), [tuneEqBandCount, tuneEqGains])
  const frequencies = useMemo(() => normalizeEqFrequencies(tuneEqFrequencies, tuneEqBandCount), [tuneEqBandCount, tuneEqFrequencies])
  const qValues = useMemo(() => normalizeEqQValues(tuneEqQValues, tuneEqBandCount), [tuneEqBandCount, tuneEqQValues])
  const [frequencyInputs, setFrequencyInputs] = useState(() => frequencies.map(String))
  const [qInputs, setQInputs] = useState(() => qValues.map(String))
  const curveSamples = Array.from({ length: 160 }, (_, index) => {
    const progress = index / 159
    const hz = EQ_MIN_FREQUENCY * ((EQ_MAX_FREQUENCY / EQ_MIN_FREQUENCY) ** progress)
    const gain = gains.reduce((total, bandGain, bandIndex) => {
      if (Math.abs(bandGain) < 0.001) return total
      const center = frequencies[bandIndex] ?? hz
      const qValue = qValues[bandIndex] ?? EQ_DEFAULT_Q
      const normalizedDistance = Math.log2(hz / center)
      const bandwidth = Math.max(0.12, 1 / qValue)
      const influence = 1 / (1 + (normalizedDistance / bandwidth) ** 4)
      return total + bandGain * influence
    }, 0)
    const y = 50 - (clampEqGain(gain) / EQ_MAX_GAIN) * 42
    return { x: progress * 100, y, gain }
  })
  const curvePath = curveSamples.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ')
  const curveAreaPath = `${curvePath} L100,50 L0,50 Z`
  const getSliderFill = (gain: number) => `${((clampEqGain(gain) - EQ_MIN_GAIN) / (EQ_MAX_GAIN - EQ_MIN_GAIN)) * 100}%`

  useEffect(() => {
    setFrequencyInputs(frequencies.map(String))
  }, [frequencies])
  useEffect(() => {
    setQInputs(qValues.map(String))
  }, [qValues])

  const update = (next: Partial<TuneEqSettings>, options?: { persist?: boolean }) => {
    const nextBandCount = next.tuneEqBandCount ?? tuneEqBandCount
    const nextFrequencies = normalizeEqFrequencies(next.tuneEqFrequencies ?? frequencies, nextBandCount)
    const nextQValues = normalizeEqQValues(next.tuneEqQValues ?? qValues, nextBandCount)
    const nextGains = normalizeEqGains(next.tuneEqGains ?? gains, nextBandCount)
    const nextBandSettings = {
      ...tuneEqBandSettings,
      ...next.tuneEqBandSettings,
      [String(nextBandCount)]: {
        frequencies: nextFrequencies,
        qValues: nextQValues,
        gains: nextGains,
      },
    }
    const updated = {
      tuneEqEnabled: next.tuneEqEnabled ?? tuneEqEnabled,
      tuneEqAutoSave: next.tuneEqAutoSave ?? tuneEqAutoSave,
      tuneEqBandCount: nextBandCount,
      tuneEqFrequencies: nextFrequencies,
      tuneEqQValues: nextQValues,
      tuneEqGains: nextGains,
      tuneEqBandSettings: nextBandSettings,
    }
    const persist = options?.persist ?? updated.tuneEqAutoSave
    onChange(updated, { persist })
    setHasManualChanges(!persist)
  }
  const updateBandCount = (bandCount: number) => {
    const profile = tuneEqBandSettings[String(bandCount)]
    update({
      tuneEqBandCount: bandCount,
      tuneEqFrequencies: normalizeEqFrequencies(profile?.frequencies ?? [], bandCount),
      tuneEqQValues: normalizeEqQValues(profile?.qValues ?? [], bandCount),
      tuneEqGains: normalizeEqGains(profile?.gains ?? [], bandCount),
    })
  }
  const updateFrequency = (index: number, frequency: number) => {
    const nextFrequencies = [...frequencies]
    nextFrequencies[index] = clampEqFrequency(frequency)
    update({ tuneEqFrequencies: nextFrequencies })
  }
  const updateFrequencyInput = (index: number, value: string) => {
    setFrequencyInputs((current) => {
      const next = [...current]
      next[index] = value
      return next
    })
  }
  const commitFrequencyInput = (index: number) => {
    const rawValue = frequencyInputs[index]?.trim() ?? ''
    const frequency = Number(rawValue)
    if (!rawValue || !Number.isFinite(frequency) || frequency < EQ_MIN_FREQUENCY || frequency > EQ_MAX_FREQUENCY) {
      updateFrequencyInput(index, String(EQ_MIN_FREQUENCY))
      updateFrequency(index, EQ_MIN_FREQUENCY)
      onInvalidFrequency()
      return
    }
    const nextFrequency = clampEqFrequency(frequency)
    updateFrequencyInput(index, String(nextFrequency))
    updateFrequency(index, nextFrequency)
  }
  const updateQ = (index: number, qValue: number) => {
    const nextQValues = [...qValues]
    nextQValues[index] = clampEqQ(qValue)
    update({ tuneEqQValues: nextQValues })
  }
  const updateQInput = (index: number, value: string) => {
    setQInputs((current) => {
      const next = [...current]
      next[index] = value
      return next
    })
  }
  const commitQInput = (index: number) => {
    const rawValue = qInputs[index]?.trim() ?? ''
    const qValue = Number(rawValue)
    if (!rawValue || !Number.isFinite(qValue) || qValue < EQ_MIN_Q || qValue > EQ_MAX_Q) {
      updateQInput(index, String(EQ_DEFAULT_Q))
      updateQ(index, EQ_DEFAULT_Q)
      onInvalidQ()
      return
    }
    const nextQValue = clampEqQ(qValue)
    updateQInput(index, String(nextQValue))
    updateQ(index, nextQValue)
  }
  const updateGain = (index: number, gain: number) => {
    const nextGains = [...gains]
    nextGains[index] = clampEqGain(gain)
    update({ tuneEqGains: nextGains })
  }
  const updateAutoSave = (enabled: boolean) => {
    update({ tuneEqAutoSave: enabled }, { persist: true })
    setHasManualChanges(false)
  }
  const save = async () => {
    setSaving(true)
    try {
      await onSave()
      setHasManualChanges(false)
    } finally {
      setSaving(false)
    }
  }

  return <Modal title="Tune EQ" subtitle="Adjust playback frequencies in real time." onClose={onClose}>
    <div className="settings-list">
      <label className="setting-row">
        <span><strong>Enable Tune EQ</strong><small>Apply this equalizer to the current audio output.</small></span>
        <input className="setting-toggle" type="checkbox" checked={tuneEqEnabled} onChange={(event) => update({ tuneEqEnabled: event.target.checked })} />
      </label>
      <label className="setting-row">
        <span><strong>Auto-save changes</strong><small>{tuneEqAutoSave ? 'EQ adjustments are saved automatically.' : 'EQ adjustments apply now, then save when you are ready.'}</small></span>
        <input className="setting-toggle" type="checkbox" checked={tuneEqAutoSave} onChange={(event) => updateAutoSave(event.target.checked)} />
      </label>
      <div className="setting-layout">
        <span><strong>Frequency bands</strong><small>Choose how many vertical bands you want to tune.</small></span>
        <div className="eq-band-options">
          {EQ_BAND_COUNTS.map((bandCount) => <button key={bandCount} type="button" className={tuneEqBandCount === bandCount ? 'active' : ''} onClick={() => updateBandCount(bandCount)}>{bandCount}</button>)}
        </div>
      </div>
      <div className={`eq-panel ${tuneEqEnabled ? '' : 'disabled'}`}>
        <div className="eq-chart" aria-hidden="true">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <linearGradient id="eqCurveFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#ff7891" stopOpacity=".28" />
                <stop offset="50%" stopColor="#ff7891" stopOpacity=".1" />
                <stop offset="100%" stopColor="#ff7891" stopOpacity=".22" />
              </linearGradient>
            </defs>
            <path className="eq-grid-line" d="M0 8H100" />
            <path className="eq-grid-line" d="M0 29H100" />
            <path className="eq-zero-line" d="M0 50H100" />
            <path className="eq-grid-line" d="M0 71H100" />
            <path className="eq-grid-line" d="M0 92H100" />
            <path className="eq-curve-fill" d={curveAreaPath} />
            <path className="eq-curve" d={curvePath} />
          </svg>
          <div className="eq-chart-labels" aria-hidden="true"><span>+12</span><span>0 dB</span><span>-12</span></div>
        </div>
        <div className="eq-sliders" style={{ '--eq-band-count': frequencies.length } as CSSProperties}>
          {frequencies.map((frequency, index) => (
            <label className="eq-slider" key={index}>
              <span>{gains[index] > 0 ? `+${gains[index].toFixed(1)}` : gains[index].toFixed(1)}</span>
              <div className="eq-slider-control">
                <input style={{ '--eq-slider-fill': getSliderFill(gains[index]) } as CSSProperties} type="range" min={EQ_MIN_GAIN} max={EQ_MAX_GAIN} step="0.5" value={gains[index]} onChange={(event) => updateGain(index, Number(event.target.value))} />
              </div>
              <input
                className="eq-frequency-input"
                type="text"
                inputMode="numeric"
                value={frequencyInputs[index] ?? String(frequency)}
                aria-label={`${formatEqFrequency(frequency)} frequency`}
                onBlur={() => commitFrequencyInput(index)}
                onChange={(event) => updateFrequencyInput(index, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur()
                }}
              />
              <input
                className="eq-frequency-input"
                type="text"
                inputMode="decimal"
                value={qInputs[index] ?? String(qValues[index] ?? EQ_DEFAULT_Q)}
                aria-label={`${formatEqFrequency(frequency)} Q factor`}
                onBlur={() => commitQInput(index)}
                onChange={(event) => updateQInput(index, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur()
                }}
              />
            </label>
          ))}
        </div>
      </div>
      <button type="button" className="setting-reset" onClick={() => update({ tuneEqGains: frequencies.map(() => 0) })}><RotateCcw size={16} /> Reset EQ bands</button>
      <button type="button" className="setting-reset" onClick={() => update({ tuneEqFrequencies: getEqFrequencies(tuneEqBandCount) })}><RotateCcw size={16} /> Reset frequencies</button>
      <button type="button" className="setting-reset" onClick={() => update({ tuneEqQValues: qValues.map(() => EQ_DEFAULT_Q) })}><RotateCcw size={16} /> Reset Q factors</button>
      {!tuneEqAutoSave && <button type="button" className="setting-restart" disabled={saving || !hasManualChanges} onClick={() => void save()}>{saving ? 'Saving...' : hasManualChanges ? 'Save Tune EQ' : 'Tune EQ saved'}</button>}
    </div>
    <div className="modal-actions">
      <button className="modal-secondary" onClick={onClose}>Close</button>
    </div>
  </Modal>
}

export function DiscoveryPlatformModal({ onChooseHoshino, onChooseSpotify, onClose }: BaseModalProps & { onChooseHoshino: () => void, onChooseSpotify: () => void }) {
  return <Modal title="Choose Discovery" subtitle="Select the music platform you want to explore." onClose={onClose}>
    <div className="settings-list">
      <button type="button" className="setting-group" onClick={onChooseHoshino}><span className="setting-group-icon"><Headphones size={19} /></span><span className="setting-group-copy"><strong>Hoshino Music</strong><small>Browse Hoshino's online music catalog.</small></span><ChevronRight size={18} /></button>
      <button type="button" className="setting-group" onClick={onChooseSpotify}><span className="setting-group-icon"><FaSpotify size={19} /></span><span className="setting-group-copy"><strong>Spotify</strong><small>Use your linked Spotify account for discovery.</small></span><ChevronRight size={18} /></button>
    </div>
    <div className="modal-actions"><button className="modal-secondary" onClick={onClose}>Cancel</button></div>
  </Modal>
}

export function SpotifyLinkModal({ onLink, onClose }: BaseModalProps & { onLink: () => Promise<void> }) {
  const [linking, setLinking] = useState(false)
  const link = async () => {
    if (linking) return
    setLinking(true)
    try { await onLink() } finally { setLinking(false) }
  }
  return <Modal title="Link Spotify" subtitle="Sign in to Spotify in a dedicated window to connect your account." onClose={onClose}>
    <div className="spotify-link-brand"><FaSpotify size={42} /><span><strong>Spotify</strong><small>Connect your account to continue.</small></span></div>
    <div className="empty-state">After successful sign-in, Hoshino stores the required Spotify session cookies and refreshes the access token automatically.</div>
    <div className="modal-actions"><button className="modal-secondary" onClick={onClose}>Cancel</button><button className="modal-primary spotify-link-button" disabled={linking} onClick={() => void link()}><FaSpotify size={17} />{linking ? 'Opening Spotify…' : 'Link account'}</button></div>
  </Modal>
}

export function CrossFadeModal({ crossFadeEnabled, crossFadeDuration, onCrossFadeEnabledChange, onCrossFadeDurationChange, onClose }: BaseModalProps & CrossFadeSettings & { onCrossFadeEnabledChange: (value: boolean) => void, onCrossFadeDurationChange: (value: number) => void }) {
  return <Modal title="Cross-fade" subtitle="Blend the end of the current song into the next one." onClose={onClose}>
    <div className="settings-list">
      <label className="setting-row">
        <span><strong>Enable Cross-fade</strong><small>Start the next song slightly early and fade between both tracks.</small></span>
        <input className="setting-toggle" type="checkbox" checked={crossFadeEnabled} onChange={(event) => onCrossFadeEnabledChange(event.target.checked)} />
      </label>
      <label className="setting-field">
        <span>Duration</span>
        <input type="number" min="1" max="15" step="0.5" value={crossFadeDuration} disabled={!crossFadeEnabled} onChange={(event) => onCrossFadeDurationChange(Number(event.target.value))} />
        <small>1-15 seconds before the current song ends.</small>
      </label>
    </div>
    <div className="modal-actions">
      <button className="modal-secondary" onClick={onClose}>Close</button>
    </div>
  </Modal>
}

export function GeneralSettingsModal({ lyricsDelay, audioSpeed, audioPitchEnabled, crossFadeEnabled, crossFadeDuration, customQueueEnabled, audioOutput, onLyricsDelayChange, onAudioSpeedChange, onAudioPitchEnabledChange, onCrossFadeEnabledChange, onCrossFadeDurationChange, onCustomQueueEnabledChange, onOpenAudioOutputs, onClose }: BaseModalProps & { lyricsDelay: number, audioSpeed: number, audioPitchEnabled: boolean, crossFadeEnabled: boolean, crossFadeDuration: number, customQueueEnabled: boolean, audioOutput: AudioOutputDevice | null, onLyricsDelayChange: (value: number) => void, onAudioSpeedChange: (value: number) => void, onAudioPitchEnabledChange: (value: boolean) => void, onCrossFadeEnabledChange: (value: boolean) => void, onCrossFadeDurationChange: (value: number) => void, onCustomQueueEnabledChange: (value: boolean) => void, onOpenAudioOutputs: () => void }) {
  return <Modal title="Preferences" subtitle="Tune general music behavior." onClose={onClose}>
    <div className="settings-list preference-sections">
      <section className="preference-section">
        <div className="preference-section-heading"><strong>Lyrics</strong><small>Adjust lyric synchronization.</small></div>
        <label className="setting-field">
        <span>Lyrics delay</span>
        <input type="number" min="-30" max="30" step="0.1" value={lyricsDelay} onChange={(event) => onLyricsDelayChange(Number(event.target.value))} />
        </label>
      </section>
      <section className="preference-section">
        <div className="preference-section-heading"><strong>Audio Speed</strong><small>Control how quickly music plays.</small></div>
        <label className="setting-field audio-pitch-setting">
          <span>Speed <strong>{audioSpeed.toFixed(2)}x</strong></span>
          <input type="range" min="0.75" max="1.5" step="0.01" value={audioSpeed} onChange={(event) => onAudioSpeedChange(Number(event.target.value))} />
          <small>Slow playback down or speed it up without changing the selected track.</small>
        </label>
      </section>
      <section className="preference-section">
        <div className="preference-section-heading"><strong>Audio Pitch</strong><small>Choose whether speed also changes vocal and instrument pitch.</small></div>
        <label className="setting-row">
          <span><strong>Pitch follows speed</strong><small>{audioPitchEnabled ? 'Pitch rises or falls with speed for effects like nightcore.' : 'Preserve the song’s original pitch while changing speed.'}</small></span>
          <input className="setting-toggle" type="checkbox" checked={audioPitchEnabled} onChange={(event) => onAudioPitchEnabledChange(event.target.checked)} />
        </label>
      </section>
      <section className="preference-section preference-feature-section">
        <div className="preference-section-heading"><strong>Cross-fade</strong><small>Seamlessly blend consecutive tracks.</small></div>
        <label className="setting-row">
          <span><strong>Enable Cross-fade</strong><small>Start the next song early and blend between both tracks.</small></span>
          <input className="setting-toggle" type="checkbox" checked={crossFadeEnabled} onChange={(event) => onCrossFadeEnabledChange(event.target.checked)} />
        </label>
        <label className="setting-field">
          <span>Fade duration</span>
          <input type="number" min="1" max="15" step="0.5" value={crossFadeDuration} disabled={!crossFadeEnabled} onChange={(event) => onCrossFadeDurationChange(Number(event.target.value))} />
          <small>1-15 seconds before the current song ends.</small>
        </label>
      </section>
      <section className="preference-section preference-feature-section">
        <div className="preference-section-heading"><strong>Playback Queue</strong><small>Choose between the automatic queue and a queue you manage yourself.</small></div>
        <label className="setting-row">
          <span><strong>Enable Custom Queue</strong><small>Use Next up and Later, drag ordering, Play next and Add to queue. When disabled, the standard automatic queue remains available.</small></span>
          <input className="setting-toggle" type="checkbox" checked={customQueueEnabled} onChange={(event) => onCustomQueueEnabledChange(event.target.checked)} />
        </label>
      </section>
      <section className="preference-section">
        <div className="preference-section-heading"><strong>Audio Output</strong><small>Choose where Hoshino plays sound.</small></div>
        <button type="button" className="setting-group" onClick={onOpenAudioOutputs}>
          <span className="setting-group-icon">{audioOutput?.isListeningDevice ? <Headphones size={19} /> : <Speaker size={19} />}</span>
          <span className="setting-group-copy"><strong>Output device</strong><small>{audioOutput?.label || 'System default'}</small></span>
          <ChevronRight size={18} />
        </button>
      </section>
    </div>
    <div className="modal-actions">
      <button className="modal-secondary" onClick={onClose}>Close</button>
    </div>
  </Modal>
}

export function SettingsModal({ playInBackground, minimizeToTray, startWithWindows, fullscreenPlayerLayout, showSpotifyPlaylistsInSidebar, extendedLibraryEnabled, debuggerEnabled, customCss, tuneEqEnabled, tuneEqBandCount, discordRpcEnabled, discordRpcV2Enabled, onPlayInBackgroundChange, onMinimizeToTrayChange, onStartWithWindowsChange, onFullscreenPlayerLayoutChange, onShowSpotifyPlaylistsInSidebarChange, onExtendedLibraryEnabledChange, onOpenResetSettings, onOpenDeleteAllSongs, onOpenDeleteAllPlaylists, onRestartApp, onOpenTuneEqSettings, onOpenGeneralSettings, onOpenDebuggerSettings, onOpenCustomCssSettings, onOpenDiscordSettings, onOpenDiscordV2Settings, onClose }: BaseModalProps & { playInBackground: boolean, minimizeToTray: boolean, startWithWindows: boolean, fullscreenPlayerLayout: AppSettings['fullscreenPlayerLayout'], showSpotifyPlaylistsInSidebar: boolean, extendedLibraryEnabled: boolean, debuggerEnabled: boolean, customCss: string, tuneEqEnabled: boolean, tuneEqBandCount: number, discordRpcEnabled: boolean, discordRpcV2Enabled: boolean, onPlayInBackgroundChange: (value: boolean) => void, onMinimizeToTrayChange: (value: boolean) => void, onStartWithWindowsChange: (value: boolean) => void, onFullscreenPlayerLayoutChange: (value: AppSettings['fullscreenPlayerLayout']) => void, onShowSpotifyPlaylistsInSidebarChange: (value: boolean) => void, onExtendedLibraryEnabledChange: (value: boolean) => void, onOpenResetSettings: () => void, onOpenDeleteAllSongs: () => void, onOpenDeleteAllPlaylists: () => void, onRestartApp: () => Promise<void>, onOpenTuneEqSettings: () => void, onOpenGeneralSettings: () => void, onOpenDebuggerSettings: () => void, onOpenCustomCssSettings: () => void, onOpenDiscordSettings: () => void, onOpenDiscordV2Settings: () => void }) {
  return <Modal title="Settings" subtitle="Choose how Hoshino behaves on this computer." onClose={onClose}>
    <h3 className="settings-heading">Music</h3>
    <div className="settings-list">
      <button type="button" className="setting-group" onClick={onOpenGeneralSettings}>
        <span className="setting-group-icon"><FileText size={19} /></span>
        <span className="setting-group-copy"><strong>Preferences</strong><small>Lyrics timing and other general music options.</small></span>
        <ChevronRight size={18} />
      </button>
      <button type="button" className="setting-group" onClick={onOpenTuneEqSettings}>
        <span className="setting-group-icon"><SlidersHorizontal size={19} /></span>
        <span className="setting-group-copy"><strong>Tune EQ</strong><small>Shape playback with a {tuneEqBandCount}-band equalizer.</small></span>
        <span className={`setting-status ${tuneEqEnabled ? 'enabled' : ''}`}>{tuneEqEnabled ? 'Enabled' : 'Disabled'}</span>
        <ChevronRight size={18} />
      </button>
    </div>
    <h3 className="settings-heading">General</h3>
    <div className="settings-list">
      <label className="setting-row">
        <span><strong>Play in background</strong><small>Keep music playing when the window is closed.</small></span>
        <input className="setting-toggle" type="checkbox" checked={playInBackground} onChange={(event) => onPlayInBackgroundChange(event.target.checked)} />
      </label>
      <label className="setting-row">
        <span><strong>Minimize to tray</strong><small>Hide Hoshino in the system tray instead of the taskbar.</small></span>
        <input className="setting-toggle" type="checkbox" checked={minimizeToTray} onChange={(event) => onMinimizeToTrayChange(event.target.checked)} />
      </label>
      <label className="setting-row">
        <span><strong>Start with Windows</strong><small>Launch Hoshino automatically when you sign in to Windows.</small></span>
        <input className="setting-toggle" type="checkbox" checked={startWithWindows} onChange={(event) => onStartWithWindowsChange(event.target.checked)} />
      </label>
      <label className="setting-row">
        <span><strong>Show Spotify playlists in sidebar</strong><small>Display playlists from your linked Spotify library under Your playlists.</small></span>
        <input className="setting-toggle" type="checkbox" checked={showSpotifyPlaylistsInSidebar} onChange={(event) => onShowSpotifyPlaylistsInSidebarChange(event.target.checked)} />
      </label>
      <label className="setting-row">
        <span><strong>Extended Library</strong><small>Show favorites and recent activity under Library.</small></span>
        <input className="setting-toggle" type="checkbox" checked={extendedLibraryEnabled} onChange={(event) => onExtendedLibraryEnabledChange(event.target.checked)} />
      </label>
      <div className="setting-layout">
        <span><strong>Fullscreen Player Layout</strong><small>Choose how the fullscreen player arranges the cover and controls.</small></span>
        <div>
          <button className={fullscreenPlayerLayout === 'centered' ? 'active' : ''} onClick={() => onFullscreenPlayerLayoutChange('centered')}>Layout 1</button>
          <button className={fullscreenPlayerLayout === 'split' ? 'active' : ''} onClick={() => onFullscreenPlayerLayoutChange('split')}>Layout 2</button>
        </div>
      </div>
      <div className="settings-actions">
        <button type="button" className="setting-restart" onClick={() => void onRestartApp()}><Power size={16} /> Restart app</button>
        <button type="button" className="setting-reset" onClick={onOpenResetSettings}><RotateCcw size={16} /> Reset settings to default</button>
        <button type="button" className="setting-danger" onClick={onOpenDeleteAllSongs}><Trash2 size={16} /> Delete all songs</button>
        <button type="button" className="setting-danger" onClick={onOpenDeleteAllPlaylists}><Trash2 size={16} /> Delete all playlists</button>
      </div>
    </div>
    <h3 className="settings-heading">Integrations</h3>
    <div className="settings-list">
      <button type="button" className="setting-group" onClick={onOpenDebuggerSettings}>
        <span className="setting-group-icon"><Bug size={19} /></span>
        <span className="setting-group-copy"><strong>Debugger</strong><small>Debug tools and state reset actions.</small></span>
        <span className={`setting-status ${debuggerEnabled ? 'enabled' : ''}`}>{debuggerEnabled ? 'Enabled' : 'Disabled'}</span>
        <ChevronRight size={18} />
      </button>
      <button type="button" className="setting-group" disabled={!debuggerEnabled} onClick={onOpenCustomCssSettings}>
        <span className="setting-group-icon"><Code2 size={19} /></span>
        <span className="setting-group-copy"><strong>Custom CSS</strong><small>{debuggerEnabled ? 'Customize Hoshino with your own CSS.' : 'Enable Debugger before editing custom CSS.'}</small></span>
        <span className={`setting-status ${customCss.trim() ? 'enabled' : ''}`}>{customCss.trim() ? 'Active' : 'Empty'}</span>
        <ChevronRight size={18} />
      </button>
      <button type="button" className="setting-group" onClick={onOpenDiscordSettings}>
        <span className="setting-group-icon"><MessageCircle size={19} /></span>
        <span className="setting-group-copy"><strong>Discord Rich Presence Legacy</strong><small>Customize local RPC activity, images, and display text.</small></span>
        <span className={`setting-status ${discordRpcEnabled ? 'enabled' : ''}`}>{discordRpcEnabled ? 'Enabled' : 'Disabled'}</span>
        <ChevronRight size={18} />
      </button>
      <button type="button" className="setting-group" onClick={onOpenDiscordV2Settings}>
        <span className="setting-group-icon"><MessageCircle size={19} /></span>
        <span className="setting-group-copy"><strong>Discord Rich Presence v2</strong><small>Use OAuth2 Social SDK presence through Discord.</small></span>
        <span className={`setting-status ${discordRpcV2Enabled ? 'enabled' : ''}`}>{discordRpcV2Enabled ? 'Enabled' : 'Disabled'}</span>
        <ChevronRight size={18} />
      </button>
    </div>
  </Modal>
}

export function DebuggerSettingsModal({ debuggerEnabled, forceMostListenedSection, cookies, onDebuggerEnabledChange, onForceMostListenedSectionChange, onResetMusicState, onResetSpotifyState, onOpenDevTools, onOpenDebuggerBrowser, onRefreshCookies, onStartLoadingScreen, onStartLoadingErrorScreen, onClose }: BaseModalProps & { debuggerEnabled: boolean, forceMostListenedSection: boolean, cookies: import('../types').DebugCookie[], onDebuggerEnabledChange: (value: boolean) => void, onForceMostListenedSectionChange: (value: boolean) => void, onResetMusicState: () => Promise<void>, onResetSpotifyState: () => Promise<void>, onOpenDevTools: () => Promise<void>, onOpenDebuggerBrowser: (url: string, userAgent: string) => Promise<void>, onRefreshCookies: () => Promise<void>, onStartLoadingScreen: () => void, onStartLoadingErrorScreen: () => void }) {
  const [resetting, setResetting] = useState(false)
  const [resettingSpotify, setResettingSpotify] = useState(false)
  const [browserUrl, setBrowserUrl] = useState('https://')
  const [browserUserAgent, setBrowserUserAgent] = useState('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36')
  const [openingBrowser, setOpeningBrowser] = useState(false)
  const [browserError, setBrowserError] = useState('')
  const [refreshingCookies, setRefreshingCookies] = useState(false)
  useEffect(() => window.electronApi?.onDebuggerBrowserUrlChanged(setBrowserUrl), [])
  const resetMusicState = async () => {
    setResetting(true)
    try {
      await onResetMusicState()
    } finally {
      setResetting(false)
    }
  }
  const resetSpotifyState = async () => {
    if (resettingSpotify) return
    setResettingSpotify(true)
    try {
      await onResetSpotifyState()
    } finally {
      setResettingSpotify(false)
    }
  }
  const openBrowser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!debuggerEnabled || openingBrowser) return
    setOpeningBrowser(true)
    setBrowserError('')
    try {
      await onOpenDebuggerBrowser(browserUrl, browserUserAgent)
    } catch (error) {
      setBrowserError(error instanceof Error ? error.message : 'Could not open the browser window.')
    } finally {
      setOpeningBrowser(false)
    }
  }
  const refreshCookies = async () => {
    if (!debuggerEnabled || refreshingCookies) return
    setRefreshingCookies(true)
    try {
      await onRefreshCookies()
    } finally {
      setRefreshingCookies(false)
    }
  }

  return <Modal title="Debugger" subtitle="Debug tools for local playback and app state." onClose={onClose}>
    <div className="settings-list">
      <label className="setting-row">
        <span><strong>Enable debugger</strong><small>Show and allow debug-only actions.</small></span>
        <input className="setting-toggle" type="checkbox" checked={debuggerEnabled} onChange={(event) => onDebuggerEnabledChange(event.target.checked)} />
      </label>
      <label className="setting-row">
        <span><strong>Force Most listened</strong><small>Show the Most listened section before the 100-listen threshold.</small></span>
        <input className="setting-toggle" type="checkbox" checked={forceMostListenedSection} onChange={(event) => onForceMostListenedSectionChange(event.target.checked)} />
      </label>
      <button type="button" className="setting-reset" disabled={!debuggerEnabled} onClick={() => void onOpenDevTools()}><Bug size={16} /> Open DevTools</button>
      <form className="debug-browser-form" onSubmit={(event) => void openBrowser(event)}>
        <label className="form-field">
          <span>Custom browser URL</span>
          <input type="url" value={browserUrl} onChange={(event) => setBrowserUrl(event.target.value)} placeholder="https://example.com" disabled={!debuggerEnabled || openingBrowser} required />
        </label>
        <label className="form-field">
          <span>User-Agent <small>Defaults to Google Chrome on Windows.</small></span>
          <input value={browserUserAgent} onChange={(event) => setBrowserUserAgent(event.target.value)} disabled={!debuggerEnabled || openingBrowser} required maxLength={1024} />
        </label>
        {browserError && <small className="form-error">{browserError}</small>}
        <button type="submit" className="setting-restart" disabled={!debuggerEnabled || openingBrowser}>{openingBrowser ? 'Opening browser...' : 'Open debug browser'}</button>
      </form>
      <section className="debug-cookie-panel" aria-live="polite">
        <div className="debug-cookie-heading">
          <span><strong>Live cookies</strong><small>Updates automatically when cookies change in the debug browser.</small></span>
          <button type="button" className="debug-cookie-refresh" disabled={!debuggerEnabled || refreshingCookies} onClick={() => void refreshCookies()} title="Refresh cookies" aria-label="Refresh cookies"><RefreshCw size={15} className={refreshingCookies ? 'is-spinning' : ''} /><span>{refreshingCookies ? 'Refreshing' : 'Refresh'}</span></button>
        </div>
        {cookies.length === 0 ? <div className="empty-state">No cookies in the current Electron session.</div> : <div className="debug-cookie-list">
          {cookies.map((cookie) => <div className="debug-cookie" key={`${cookie.name}:${cookie.domain}:${cookie.path}`}>
            <strong>{cookie.name}</strong><code>{cookie.value}</code>
            <small>{cookie.domain}{cookie.path} · {cookie.httpOnly ? 'HttpOnly' : 'Script'} · {cookie.secure ? 'Secure' : 'Not secure'}</small>
          </div>)}
        </div>}
      </section>
      <div className="settings-actions">
        <button type="button" className="setting-restart" disabled={!debuggerEnabled} onClick={onStartLoadingScreen}>Start loading screen</button>
        <button type="button" className="setting-reset" disabled={!debuggerEnabled} onClick={onStartLoadingErrorScreen}>Start loading error screen</button>
      </div>
      <button type="button" className="setting-reset" disabled={!debuggerEnabled || resetting} onClick={() => void resetMusicState()}><RotateCcw size={16} /> {resetting ? 'Resetting music state...' : 'Reset music state'}</button>
      <button type="button" className="setting-danger" disabled={!debuggerEnabled || resettingSpotify} onClick={() => void resetSpotifyState()}><Trash2 size={16} /> {resettingSpotify ? 'Resetting Spotify state...' : 'Reset Spotify state'}</button>
    </div>
    <div className="modal-actions">
      <button className="modal-secondary" onClick={onClose}>Close</button>
    </div>
  </Modal>
}

export function CustomCssModal({ debuggerEnabled, customCss, onSave, onClose }: BaseModalProps & { debuggerEnabled: boolean, customCss: string, onSave: (customCss: string) => Promise<void> }) {
  const [value, setValue] = useState(customCss)
  const [saving, setSaving] = useState(false)
  const hasChanges = value !== customCss

  const save = async () => {
    if (!debuggerEnabled || saving) return
    setSaving(true)
    try {
      await onSave(value)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return <Modal title="Custom CSS" subtitle="Override Hoshino styles while Debugger is enabled." onClose={onClose}>
    <div className="settings-list">
      {!debuggerEnabled && <div className="empty-state">Enable Debugger before editing or applying custom CSS.</div>}
      <label className="form-field custom-css-field">
        <span>CSS</span>
        <textarea
          value={value}
          disabled={!debuggerEnabled || saving}
          spellCheck={false}
          placeholder={'.song-row.active {\n  background: rgba(255, 120, 145, .14);\n}'}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <button type="button" className="setting-reset" disabled={!debuggerEnabled || saving || !value} onClick={() => setValue('')}><RotateCcw size={16} /> Clear custom CSS</button>
    </div>
    <div className="modal-actions">
      <button className="modal-secondary" disabled={saving} onClick={onClose}>Cancel</button>
      <button className="modal-primary" disabled={!debuggerEnabled || saving || !hasChanges} onClick={() => void save()}>{saving ? 'Saving...' : 'Save CSS'}</button>
    </div>
  </Modal>
}

export function UserSettingsModal({ userName, userDescription, userAvatarUrl, onSyncSpotify, onSave, onClose }: BaseModalProps & { userName: string, userDescription: string, userAvatarUrl: string, onSyncSpotify: () => Promise<ClientUserSettings>, onSave: (settings: ClientUserSettings) => Promise<void> }) {
  const [name, setName] = useState(userName)
  const [description, setDescription] = useState(userDescription)
  const [avatarUrl, setAvatarUrl] = useState(userAvatarUrl)
  const [saving, setSaving] = useState(false)
  const [syncingSpotify, setSyncingSpotify] = useState(false)
  const [spotifySyncError, setSpotifySyncError] = useState('')
  const hasChanges = name !== userName || description !== userDescription || avatarUrl !== userAvatarUrl

  const chooseAvatar = async () => {
    const avatar = await window.electronApi?.selectCoverFile('song', { cropSquare: true })
    if (avatar) setAvatarUrl(imageBlobToDataUrl(avatar))
  }

  const save = async () => {
    if (saving) return
    setSaving(true)
    try {
      await onSave({
        clientUserName: name,
        clientUserDescription: description,
        clientUserAvatarUrl: avatarUrl,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }
  const syncSpotify = async () => {
    if (syncingSpotify || saving) return
    setSyncingSpotify(true)
    setSpotifySyncError('')
    try {
      const profile = await onSyncSpotify()
      setName(profile.clientUserName)
      setDescription(profile.clientUserDescription)
      setAvatarUrl(profile.clientUserAvatarUrl)
    } catch (error) {
      setSpotifySyncError(error instanceof Error ? error.message : 'Could not sync the Spotify account.')
    } finally {
      setSyncingSpotify(false)
    }
  }

  return <Modal title="User settings" subtitle="Customize the local client profile shown in Hoshino." onClose={onClose}>
    <div className="settings-list">
      <div className="user-settings-avatar-row">
        <span className="user-settings-avatar">{avatarUrl ? <img src={avatarUrl} alt="" /> : <User size={26} />}</span>
        <div>
          <button type="button" className="setting-restart" disabled={saving} onClick={() => void chooseAvatar()}><ImagePlus size={16} /> Choose avatar</button>
          <button type="button" className="setting-reset" disabled={saving || !avatarUrl} onClick={() => setAvatarUrl('')}><Trash2 size={16} /> Remove avatar</button>
        </div>
      </div>
      <label className="form-field"><span>Name</span><input value={name} maxLength={40} placeholder="Local user" disabled={saving} onChange={(event) => setName(event.target.value)} /></label>
      <label className="form-field"><span>Short description</span><textarea value={description} maxLength={120} placeholder="Client profile on this device" disabled={saving} onChange={(event) => setDescription(event.target.value)} /></label>
      <button type="button" className="setting-group" disabled={saving || syncingSpotify} onClick={() => void syncSpotify()}><span className="setting-group-icon"><FaSpotify size={19} /></span><span className="setting-group-copy"><strong>Sync Spotify Account</strong><small>{syncingSpotify ? 'Loading your Spotify profile…' : 'Import your Spotify name, username, and avatar.'}</small></span></button>
      {spotifySyncError && <small className="form-error">{spotifySyncError}</small>}
    </div>
    <div className="modal-actions">
      <button className="modal-secondary" disabled={saving} onClick={onClose}>Cancel</button>
      <button className="modal-primary" disabled={saving || !hasChanges} onClick={() => void save()}>{saving ? 'Saving...' : 'Save profile'}</button>
    </div>
  </Modal>
}

export function VersionNoticeModal({ version, onClose }: BaseModalProps & { version: string }) {
  const updates = [
    {
      heading: 'Spotify playlists in your sidebar',
      items: [
        'Playlists from your linked Spotify library now appear under Your playlists in the main sidebar.',
        'Spotify playlist entries show their cached artwork and owner, and open directly inside Spotify Discovery.',
        'Spotify playlists remain separate from local playlists and their edit, delete, folder and drag actions.',
      ]
    },
    {
      heading: 'Playlist preferences',
      items: [
        'A General setting can show or hide Spotify playlists without unlinking your account.',
        'Spotify playlist sorting remembers Title A-Z, Duration, Oldest or Newest across playlists.',
        'The saved sorting choice is restored after restarting Hoshino or re-enabling sidebar playlists.',
        'Playlist owner names are displayed as by owner beneath each sidebar entry.',
      ]
    },
    {
      heading: 'Playback reliability',
      items: [
        'Changing tracks now detaches the previous media source and resets the timeline immediately.',
        'Stale time and duration events from a paused track can no longer overwrite the new track state.',
        'Closing a sidebar Spotify playlist clears its active state consistently.',
        'Disabling sidebar playlists also closes a Spotify playlist that was opened from the sidebar.',
      ]
    },
    {
      heading: 'Polish and fixes',
      items: [
        'Duplicate React keys are avoided when a Spotify playlist contains the same track more than once.',
        'Japanese dakuten is preserved during Unicode normalization so titles such as Ano Band match correctly.',
      ]
    }
  ]

  return <Modal title="What's new" subtitle={`Hoshino v${version} is ready.`} onClose={onClose}>
    <div className="version-notice-markdown">
      {updates.map((update) => <section key={update.heading}>
        <h3>{update.heading}</h3>
        <ul>
          {update.items.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>)}
    </div>
    <div className="modal-actions">
      <button className="modal-primary" onClick={onClose}>Got it</button>
    </div>
  </Modal>
}

export function UpdateAvailableModal({ currentVersion, latestVersion, onDownload, onClose }: BaseModalProps & { currentVersion: string, latestVersion: string, onDownload: () => void }) {
  return <Modal title="Update available" subtitle={`Hoshino v${latestVersion} is ready to download.`} onClose={onClose}>
    <div className="confirm-copy">
      <strong>Current version: {currentVersion}</strong>
      <p>A newer version is available. Download the installer to update Hoshino.</p>
    </div>
    <div className="modal-actions">
      <button className="modal-secondary" onClick={onClose}>Later</button>
      <button className="modal-primary" onClick={onDownload}><Download size={16} /> Download update</button>
    </div>
  </Modal>
}

export function DiscordSettingsModal({ discordRpcEnabled, discordKeepRichPresence, discordSmallImageUrl, discordPausedSmallImageUrl, discordDetailsTemplate, discordStateTemplate, discordLargeTextTemplate, discordSmallTextTemplate, discordPausedSmallTextTemplate, onDiscordRpcEnabledChange, onDiscordKeepRichPresenceChange, onSave, onClose }: BaseModalProps & DiscordInputSettings & { discordRpcEnabled: boolean, discordKeepRichPresence: boolean, onDiscordRpcEnabledChange: (value: boolean) => void, onDiscordKeepRichPresenceChange: (value: boolean) => void, onSave: (settings: DiscordInputSettings) => Promise<void> }) {
  const [smallImageUrl, setSmallImageUrl] = useState(discordSmallImageUrl)
  const [pausedSmallImageUrl, setPausedSmallImageUrl] = useState(discordPausedSmallImageUrl)
  const [detailsTemplate, setDetailsTemplate] = useState(discordDetailsTemplate)
  const [stateTemplate, setStateTemplate] = useState(discordStateTemplate)
  const [largeTextTemplate, setLargeTextTemplate] = useState(discordLargeTextTemplate)
  const [smallTextTemplate, setSmallTextTemplate] = useState(discordSmallTextTemplate)
  const [pausedSmallTextTemplate, setPausedSmallTextTemplate] = useState(discordPausedSmallTextTemplate)
  const [assetsOpen, setAssetsOpen] = useState(false)
  const [uploadingImage, setUploadingImage] = useState<'playing' | 'paused' | null>(null)
  const [saving, setSaving] = useState(false)
  const hasChanges = smallImageUrl !== discordSmallImageUrl
    || pausedSmallImageUrl !== discordPausedSmallImageUrl
    || detailsTemplate !== discordDetailsTemplate
    || stateTemplate !== discordStateTemplate
    || largeTextTemplate !== discordLargeTextTemplate
    || smallTextTemplate !== discordSmallTextTemplate
    || pausedSmallTextTemplate !== discordPausedSmallTextTemplate
  const chooseSmallImage = async (state: 'playing' | 'paused') => {
    const image = await window.electronApi?.selectCoverFile('song', { cropSquare: true })
    if (!image) return
    setUploadingImage(state)
    try {
      const url = await window.electronApi?.uploadDiscordSmallImage(image)
      if (!url) return
      if (state === 'playing') setSmallImageUrl(url)
      else setPausedSmallImageUrl(url)
    } finally {
      setUploadingImage(null)
    }
  }
  const save = async () => {
    setSaving(true)
    try {
      const next = {
        discordSmallImageUrl: smallImageUrl.trim(),
        discordPausedSmallImageUrl: pausedSmallImageUrl.trim(),
        discordDetailsTemplate: detailsTemplate.trim(),
        discordStateTemplate: stateTemplate.trim(),
        discordLargeTextTemplate: largeTextTemplate.trim(),
        discordSmallTextTemplate: smallTextTemplate.trim(),
        discordPausedSmallTextTemplate: pausedSmallTextTemplate.trim(),
      }
      await onSave(next)
      setSmallImageUrl(next.discordSmallImageUrl)
      setPausedSmallImageUrl(next.discordPausedSmallImageUrl)
      setDetailsTemplate(next.discordDetailsTemplate)
      setStateTemplate(next.discordStateTemplate)
      setLargeTextTemplate(next.discordLargeTextTemplate)
      setSmallTextTemplate(next.discordSmallTextTemplate)
      setPausedSmallTextTemplate(next.discordPausedSmallTextTemplate)
    } finally {
      setSaving(false)
    }
  }
  return <Modal title="Discord Rich Presence Legacy" subtitle="Control how your current song appears through local Discord RPC." onClose={onClose}>
    <div className="settings-list">
      <label className="setting-row">
        <span><strong>Discord Rich Presence Legacy</strong><small>Show the currently playing song on your Discord profile.</small></span>
        <input className="setting-toggle" type="checkbox" checked={discordRpcEnabled} onChange={(event) => onDiscordRpcEnabledChange(event.target.checked)} />
      </label>
      <label className="setting-row">
        <span><strong>Keep Rich Presence</strong><small>Keep the current song visible on Discord while playback is paused.</small></span>
        <input className="setting-toggle" type="checkbox" checked={discordKeepRichPresence} disabled={!discordRpcEnabled} onChange={(event) => onDiscordKeepRichPresenceChange(event.target.checked)} />
      </label>
      <label className="setting-field"><span>Details</span><input value={detailsTemplate} disabled={!discordRpcEnabled} placeholder="%song_name%" onChange={(event) => setDetailsTemplate(event.target.value)} /></label>
      <label className="setting-field"><span>State</span><input value={stateTemplate} disabled={!discordRpcEnabled} placeholder="%artist_name%" onChange={(event) => setStateTemplate(event.target.value)} /></label>
      <div className={`setting-expand ${assetsOpen ? 'open' : ''}`}>
        <button type="button" className="setting-group setting-expand-trigger" aria-expanded={assetsOpen} onClick={() => setAssetsOpen((open) => !open)}>
          <span className="setting-group-icon"><Image size={19} /></span>
          <span className="setting-group-copy"><strong>Rich Presence assets</strong><small>Customize icons and image hover text.</small></span>
          <ChevronDown className="setting-expand-chevron" size={18} />
        </button>
        {assetsOpen && <div className="setting-expand-content">
          <button type="button" className="file-picker cover-picker" disabled={!discordRpcEnabled || uploadingImage !== null} onClick={() => void chooseSmallImage('playing')}><ImagePlus size={18} /><span>{uploadingImage === 'playing' ? 'Uploading playing icon...' : 'Choose playing small icon'}</span></button>
          <label className="setting-field"><span>Playing small icon URL</span><input value={smallImageUrl} disabled={!discordRpcEnabled} placeholder="Use default Hoshino logo" onChange={(event) => setSmallImageUrl(event.target.value)} /><small>Used while music is playing.</small></label>
          <button type="button" className="file-picker cover-picker" disabled={!discordRpcEnabled || !discordKeepRichPresence || uploadingImage !== null} onClick={() => void chooseSmallImage('paused')}><ImagePlus size={18} /><span>{uploadingImage === 'paused' ? 'Uploading paused icon...' : 'Choose paused small icon'}</span></button>
          <label className="setting-field"><span>Paused small icon URL</span><input value={pausedSmallImageUrl} disabled={!discordRpcEnabled || !discordKeepRichPresence} placeholder="Fallback to playing small icon" onChange={(event) => setPausedSmallImageUrl(event.target.value)} /><small>Used while playback is paused and Keep Rich Presence is enabled.</small></label>
          <label className="setting-field"><span>Large image text</span><input value={largeTextTemplate} disabled={!discordRpcEnabled} placeholder="%album_name%" onChange={(event) => setLargeTextTemplate(event.target.value)} /></label>
          <label className="setting-field"><span>Small image text</span><input value={smallTextTemplate} disabled={!discordRpcEnabled} placeholder="Hoshino Player" onChange={(event) => setSmallTextTemplate(event.target.value)} /><small>Available in all text fields: %song_name%, %artist_name%, %album_name%</small></label>
          <label className="setting-field"><span>Paused small image text</span><input value={pausedSmallTextTemplate} disabled={!discordRpcEnabled || !discordKeepRichPresence} placeholder="Fallback to small image text" onChange={(event) => setPausedSmallTextTemplate(event.target.value)} /><small>Used while playback is paused and Keep Rich Presence is enabled.</small></label>
        </div>}
      </div>
      <button type="button" className="modal-primary" disabled={!hasChanges || saving || uploadingImage !== null} onClick={() => void save()}>{saving ? 'Saving...' : 'Save changes'}</button>
    </div>
  </Modal>
}

export function DiscordV2SettingsModal({ discordRpcV2Enabled, discordRpcV2KeepRichPresence, discordRpcV2OauthAccessToken, discordRpcV2OauthRefreshToken, discordRpcV2SmallImageUrl, discordRpcV2PausedSmallImageUrl, discordRpcV2DetailsTemplate, discordRpcV2StateTemplate, discordRpcV2LargeTextTemplate, discordRpcV2SmallTextTemplate, discordRpcV2PausedSmallTextTemplate, onDiscordRpcV2EnabledChange, onDiscordRpcV2KeepRichPresenceChange, onLogin, onSave, onClose }: BaseModalProps & DiscordV2InputSettings & { discordRpcV2Enabled: boolean, discordRpcV2KeepRichPresence: boolean, discordRpcV2OauthAccessToken: string, discordRpcV2OauthRefreshToken: string, onDiscordRpcV2EnabledChange: (value: boolean) => void, onDiscordRpcV2KeepRichPresenceChange: (value: boolean) => void, onLogin: () => Promise<void>, onSave: (settings: DiscordV2InputSettings) => Promise<void> }) {
  const [smallImageUrl, setSmallImageUrl] = useState(discordRpcV2SmallImageUrl)
  const [pausedSmallImageUrl, setPausedSmallImageUrl] = useState(discordRpcV2PausedSmallImageUrl)
  const [detailsTemplate, setDetailsTemplate] = useState(discordRpcV2DetailsTemplate)
  const [stateTemplate, setStateTemplate] = useState(discordRpcV2StateTemplate)
  const [largeTextTemplate, setLargeTextTemplate] = useState(discordRpcV2LargeTextTemplate)
  const [smallTextTemplate, setSmallTextTemplate] = useState(discordRpcV2SmallTextTemplate)
  const [pausedSmallTextTemplate, setPausedSmallTextTemplate] = useState(discordRpcV2PausedSmallTextTemplate)
  const [assetsOpen, setAssetsOpen] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)
  const [uploadingImage, setUploadingImage] = useState<'playing' | 'paused' | null>(null)
  const [saving, setSaving] = useState(false)
  const hasToken = !!discordRpcV2OauthAccessToken && !!discordRpcV2OauthRefreshToken
  const hasChanges = smallImageUrl !== discordRpcV2SmallImageUrl
    || pausedSmallImageUrl !== discordRpcV2PausedSmallImageUrl
    || detailsTemplate !== discordRpcV2DetailsTemplate
    || stateTemplate !== discordRpcV2StateTemplate
    || largeTextTemplate !== discordRpcV2LargeTextTemplate
    || smallTextTemplate !== discordRpcV2SmallTextTemplate
    || pausedSmallTextTemplate !== discordRpcV2PausedSmallTextTemplate
  const login = async () => {
    setLoggingIn(true)
    try {
      await onLogin()
    } finally {
      setLoggingIn(false)
    }
  }
  const chooseSmallImage = async (state: 'playing' | 'paused') => {
    const image = await window.electronApi?.selectCoverFile('song', { cropSquare: true })
    if (!image) return
    setUploadingImage(state)
    try {
      const url = await window.electronApi?.uploadDiscordSmallImage(image)
      if (!url) return
      if (state === 'playing') setSmallImageUrl(url)
      else setPausedSmallImageUrl(url)
    } finally {
      setUploadingImage(null)
    }
  }
  const save = async () => {
    setSaving(true)
    try {
      const next = {
        discordRpcV2SmallImageUrl: smallImageUrl.trim(),
        discordRpcV2PausedSmallImageUrl: pausedSmallImageUrl.trim(),
        discordRpcV2DetailsTemplate: detailsTemplate.trim(),
        discordRpcV2StateTemplate: stateTemplate.trim(),
        discordRpcV2LargeTextTemplate: largeTextTemplate.trim(),
        discordRpcV2SmallTextTemplate: smallTextTemplate.trim(),
        discordRpcV2PausedSmallTextTemplate: pausedSmallTextTemplate.trim(),
      }
      await onSave(next)
      setSmallImageUrl(next.discordRpcV2SmallImageUrl)
      setPausedSmallImageUrl(next.discordRpcV2PausedSmallImageUrl)
      setDetailsTemplate(next.discordRpcV2DetailsTemplate)
      setStateTemplate(next.discordRpcV2StateTemplate)
      setLargeTextTemplate(next.discordRpcV2LargeTextTemplate)
      setSmallTextTemplate(next.discordRpcV2SmallTextTemplate)
      setPausedSmallTextTemplate(next.discordRpcV2PausedSmallTextTemplate)
    } finally {
      setSaving(false)
    }
  }

  return <Modal title="Discord Rich Presence v2" subtitle="Use Discord OAuth2 Social SDK presence." onClose={onClose}>
    {!hasToken ? <div className="settings-list">
      <div className="confirm-copy">
        <strong>Discord login required</strong>
        <p>Authorize Hoshino with Discord to use the v2 Social SDK presence flow.</p>
      </div>
      <button type="button" className={`modal-primary discord-login-button ${loggingIn ? 'loading' : ''}`} disabled={loggingIn} onClick={() => void login()}><DiscordLogo /> <span>{loggingIn ? 'Waiting for Discord...' : 'Login to Discord'}</span></button>
    </div> : <div className="settings-list">
      <label className="setting-row">
        <span><strong>Discord Rich Presence v2</strong><small>Show the currently playing song with OAuth2 Social SDK presence.</small></span>
        <input className="setting-toggle" type="checkbox" checked={discordRpcV2Enabled} onChange={(event) => onDiscordRpcV2EnabledChange(event.target.checked)} />
      </label>
      <label className="setting-row">
        <span><strong>Keep Rich Presence</strong><small>Keep the current song visible on Discord while playback is paused.</small></span>
        <input className="setting-toggle" type="checkbox" checked={discordRpcV2KeepRichPresence} disabled={!discordRpcV2Enabled} onChange={(event) => onDiscordRpcV2KeepRichPresenceChange(event.target.checked)} />
      </label>
      <label className="setting-field"><span>Details</span><input value={detailsTemplate} disabled={!discordRpcV2Enabled} placeholder="%song_name%" onChange={(event) => setDetailsTemplate(event.target.value)} /></label>
      <label className="setting-field"><span>State</span><input value={stateTemplate} disabled={!discordRpcV2Enabled} placeholder="%artist_name%" onChange={(event) => setStateTemplate(event.target.value)} /></label>
      <div className={`setting-expand ${assetsOpen ? 'open' : ''}`}>
        <button type="button" className="setting-group setting-expand-trigger" aria-expanded={assetsOpen} onClick={() => setAssetsOpen((open) => !open)}>
          <span className="setting-group-icon"><Image size={19} /></span>
          <span className="setting-group-copy"><strong>Rich Presence assets</strong><small>Customize icons and image hover text.</small></span>
          <ChevronDown className="setting-expand-chevron" size={18} />
        </button>
        {assetsOpen && <div className="setting-expand-content">
          <button type="button" className="file-picker cover-picker" disabled={!discordRpcV2Enabled || uploadingImage !== null} onClick={() => void chooseSmallImage('playing')}><ImagePlus size={18} /><span>{uploadingImage === 'playing' ? 'Uploading playing icon...' : 'Choose playing small icon'}</span></button>
          <label className="setting-field"><span>Playing small icon URL</span><input value={smallImageUrl} disabled={!discordRpcV2Enabled} placeholder="Use default Hoshino logo" onChange={(event) => setSmallImageUrl(event.target.value)} /><small>Used while music is playing.</small></label>
          <button type="button" className="file-picker cover-picker" disabled={!discordRpcV2Enabled || !discordRpcV2KeepRichPresence || uploadingImage !== null} onClick={() => void chooseSmallImage('paused')}><ImagePlus size={18} /><span>{uploadingImage === 'paused' ? 'Uploading paused icon...' : 'Choose paused small icon'}</span></button>
          <label className="setting-field"><span>Paused small icon URL</span><input value={pausedSmallImageUrl} disabled={!discordRpcV2Enabled || !discordRpcV2KeepRichPresence} placeholder="Fallback to playing small icon" onChange={(event) => setPausedSmallImageUrl(event.target.value)} /><small>Used while playback is paused and Keep Rich Presence is enabled.</small></label>
          <label className="setting-field"><span>Large image text</span><input value={largeTextTemplate} disabled={!discordRpcV2Enabled} placeholder="%album_name%" onChange={(event) => setLargeTextTemplate(event.target.value)} /></label>
          <label className="setting-field"><span>Small image text</span><input value={smallTextTemplate} disabled={!discordRpcV2Enabled} placeholder="Hoshino Player" onChange={(event) => setSmallTextTemplate(event.target.value)} /><small>Available in all text fields: %song_name%, %artist_name%, %album_name%</small></label>
          <label className="setting-field"><span>Paused small image text</span><input value={pausedSmallTextTemplate} disabled={!discordRpcV2Enabled || !discordRpcV2KeepRichPresence} placeholder="Fallback to small image text" onChange={(event) => setPausedSmallTextTemplate(event.target.value)} /></label>
        </div>}
      </div>
      <button type="button" className="modal-primary" disabled={!hasChanges || saving || uploadingImage !== null} onClick={() => void save()}>{saving ? 'Saving...' : 'Save changes'}</button>
    </div>}
  </Modal>
}

function Modal({ title, subtitle, onClose, children }: BaseModalProps & { title: string, subtitle: string, children: React.ReactNode }) {
  const [closing, setClosing] = useState(false)
  const close = () => {
    if (closing) return
    setClosing(true)
    window.setTimeout(onClose, 210)
  }
  return <div className={`modal-backdrop ${closing ? 'closing' : ''}`} onMouseDown={close}><section className="modal-card" onMouseDown={(event) => event.stopPropagation()}>
    <button className="modal-close" onClick={close}><X size={19} /></button>
    <span className="eyebrow">Hoshino music</span><h2>{title}</h2><p>{subtitle}</p>{children}
  </section></div>
}

function DiscordLogo() {
  return <svg className="discord-login-logo" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path fill="currentColor" d="M19.54 5.23A17.6 17.6 0 0 0 15.22 3.9a.07.07 0 0 0-.08.04c-.18.32-.39.75-.53 1.08a16.3 16.3 0 0 0-4.82 0 11.4 11.4 0 0 0-.54-1.08.08.08 0 0 0-.08-.04c-1.5.26-2.95.72-4.31 1.34a.06.06 0 0 0-.03.03C2.1 9.35 1.35 13.33 1.72 17.25c0 .02.01.04.03.05a17.7 17.7 0 0 0 5.3 2.68.08.08 0 0 0 .09-.03c.41-.56.78-1.15 1.09-1.77a.08.08 0 0 0-.04-.11 11.5 11.5 0 0 1-1.66-.79.08.08 0 0 1-.01-.13l.33-.25a.07.07 0 0 1 .08-.01c3.45 1.58 7.18 1.58 10.59 0a.07.07 0 0 1 .08.01l.34.25a.08.08 0 0 1-.01.13 10.9 10.9 0 0 1-1.66.79.08.08 0 0 0-.04.11c.32.62.68 1.21 1.09 1.77.02.03.06.04.09.03a17.6 17.6 0 0 0 5.31-2.68.08.08 0 0 0 .03-.05c.45-4.54-.76-8.49-3.18-11.98a.06.06 0 0 0-.03-.03ZM8.29 14.86c-1.04 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.91.96 1.89 2.12 0 1.17-.84 2.12-1.89 2.12Zm7.42 0c-1.04 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.91.96 1.89 2.12 0 1.17-.83 2.12-1.89 2.12Z" />
  </svg>
}
