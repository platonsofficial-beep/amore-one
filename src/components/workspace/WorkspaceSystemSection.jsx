import { useState } from 'react'

const APP_NAME = typeof __APP_NAME__ !== 'undefined' ? __APP_NAME__ : 'ONE'
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'v1.0.0-core'

const MODULE_ROWS = [
  { key: 'reservations', label: 'Reservations' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'suppliers', label: 'Suppliers' },
  { key: 'stock', label: 'Stock / F&B' },
  { key: 'reports', label: 'Reports' },
]

function resolveModuleStatus(connected) {
  if (connected === true) return { label: 'Connected', tone: 'connected' }
  if (connected === false) return { label: 'Not connected', tone: 'disconnected' }
  return { label: 'Available', tone: 'available' }
}

function BuildInfoBadge() {
  const [copyMessage, setCopyMessage] = useState('')

  const handleCopyBuildInfo = async () => {
    const copyText = [
      APP_NAME,
      `Version ${APP_VERSION}`,
    ].join('\n')

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(copyText)
      } else {
        const fallbackTextArea = document.createElement('textarea')
        fallbackTextArea.value = copyText
        document.body.appendChild(fallbackTextArea)
        fallbackTextArea.select()
        document.execCommand('copy')
        document.body.removeChild(fallbackTextArea)
      }

      setCopyMessage('Copied')
      setTimeout(() => setCopyMessage(''), 1800)
    } catch {
      setCopyMessage('Copy failed')
      setTimeout(() => setCopyMessage(''), 1800)
    }
  }

  return (
    <div className="build-info-badge workspace-build-info">
      <div>
        <p className="build-info-name">{APP_NAME}</p>
        <p className="build-info-version">Version {APP_VERSION}</p>
      </div>
      <button type="button" className="ghost-btn small build-copy-btn workspace-action-btn" onClick={handleCopyBuildInfo}>
        Copy Build Info
      </button>
      {copyMessage ? <small className="build-copy-note">{copyMessage}</small> : null}
    </div>
  )
}

export function WorkspaceSystemSection({ moduleConnections = {} }) {
  return (
    <>
      <div className="workspace-section-header">
        <div>
          <p className="eyebrow">Workspace</p>
          <h3 className="workspace-section-heading">
            <span className="workspace-section-icon" aria-hidden="true">⚙️</span>
            System
          </h3>
          <p className="workspace-section-subtitle">
            Application build information and connected module status.
          </p>
        </div>
      </div>

      <div className="panel staff-panel workspace-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Application</p>
            <h3>Build info</h3>
          </div>
        </div>
        <BuildInfoBadge />
      </div>

      <div className="panel staff-panel workspace-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Modules</p>
            <h3>Connection status</h3>
          </div>
        </div>
        <ul className="workspace-module-list">
          {MODULE_ROWS.map(({ key, label }) => {
            const status = resolveModuleStatus(moduleConnections[key])

            return (
              <li key={key} className="workspace-module-row">
                <span className="workspace-module-label">{label}</span>
                <span className={`workspace-module-status workspace-module-status-${status.tone}`}>
                  {status.label}
                </span>
              </li>
            )
          })}
        </ul>
      </div>

      <p className="workspace-dev-note">
        Development mode — auth and permissions are not configured yet.
      </p>
    </>
  )
}
