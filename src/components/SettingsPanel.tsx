import { useState } from 'react'
import type { FormEvent } from 'react'
import type { PlayerProfile } from '../game/playerProfile'
import { decodePlayerProfile, encodePlayerProfile, DIFFICULTIES } from '../game/playerProfile'

type Props = {
  open: boolean
  profile: PlayerProfile
  devMode: boolean
  onToggleDevMode: () => void
  onClose: () => void
  onImport: (profile: PlayerProfile) => void
}

export function SettingsPanel({ open, profile, devMode, onToggleDevMode, onClose, onImport }: Props) {
  const [importCode, setImportCode] = useState('')
  const [message, setMessage] = useState('')
  const profileCode = encodePlayerProfile(profile)
  if (!open) return null
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(profileCode)
      setMessage('Progress code copied.')
    } catch {
      setMessage('Copy is unavailable. Select and copy the code below.')
    }
  }

  const importProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const imported = decodePlayerProfile(importCode)
    if (!imported) {
      setMessage('That code is invalid or corrupted. Your current profile was not changed.')
      return
    }
    onImport(imported)
    setImportCode('')
    setMessage('Profile imported.')
  }

  return (
    <div className="settings-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header className="settings-panel__header">
          <div>
            <span className={`badge badge--${profile.difficulty}`}>{profile.difficulty.replace('-', ' ')}</span>
            <h2 id="settings-title">Settings &amp; progress</h2>
          </div>
          <button className="circle-btn" onClick={onClose} aria-label="Close settings">×</button>
        </header>
        <p className="settings-panel__summary">Completed puzzles</p>
        <ul className="settings-panel__progress">
          {DIFFICULTIES.map((difficulty) => (
            <li key={difficulty}>
              <span className={`badge badge--${difficulty}`}>{difficulty.replace('-', ' ')}</span>
              <strong>{profile.completed[difficulty]}</strong>
            </li>
          ))}
        </ul>
        <label className="toggle settings-panel__dev-toggle"><input type="checkbox" checked={devMode} onChange={onToggleDevMode} /><span>Show developer panel</span></label>
        <label className="settings-panel__label" htmlFor="profile-code">Your portable progress code</label>
        <textarea id="profile-code" className="settings-panel__code" readOnly value={profileCode} onFocus={(event) => event.currentTarget.select()} />
        <button className="btn btn--primary" onClick={copyCode}>Copy progress code</button>
        <form className="settings-panel__import" onSubmit={importProfile}>
          <label className="settings-panel__label" htmlFor="import-code">Import progress code</label>
          <textarea
            id="import-code"
            className="settings-panel__code"
            value={importCode}
            onChange={(event) => setImportCode(event.target.value)}
            placeholder="Paste a PD1-… progress code"
            rows={3}
          />
          <button className="btn" type="submit">Validate and import</button>
        </form>
        <p className="settings-panel__notice">This local code detects accidental edits, but isn’t a secure signature: a determined user can modify progress in an offline, open-source game.</p>
        {message && <p className="settings-panel__message" role="status">{message}</p>}
      </section>
    </div>
  )
}
