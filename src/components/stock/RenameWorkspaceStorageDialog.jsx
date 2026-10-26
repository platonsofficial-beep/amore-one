import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEscapeToClose } from '../../lib/useEscapeToClose'
import {
  WORKSPACE_STORAGE_DUPLICATE_NAME_MESSAGE,
  normalizeWorkspaceStorageDisplayName,
  workspaceStorageNameKey,
} from '../../services/workspaceStorageService'

/**
 * Owner/manager rename of a storage display name.
 * The location key is shown and is not editable.
 *
 * @param {{
 *   storage: { id?: string, name?: string, locationKey?: string },
 *   takenNames?: string[],
 *   onClose: () => void,
 *   onSubmit: (name: string) => Promise<void>,
 * }} props
 */
export function RenameWorkspaceStorageDialog({
  storage,
  takenNames = [],
  onClose,
  onSubmit,
}) {
  const titleId = useId()
  const inputId = useId()
  const [name, setName] = useState(`${storage?.name ?? ''}`)
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const locationKey = `${storage?.locationKey ?? storage?.location_key ?? ''}`.trim()

  useEscapeToClose(() => {
    if (!isSaving) onClose?.()
  })

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  const handleDismiss = () => {
    if (isSaving) return
    onClose?.()
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (isSaving) return

    let nextName = ''
    try {
      nextName = normalizeWorkspaceStorageDisplayName(name)
    } catch (validationError) {
      setError(validationError?.message || 'Storage name is required.')
      return
    }

    if (workspaceStorageNameKey(nextName) === workspaceStorageNameKey(storage?.name)) {
      onClose?.()
      return
    }

    const taken = new Set(
      (Array.isArray(takenNames) ? takenNames : []).map((entry) => workspaceStorageNameKey(entry)),
    )
    if (taken.has(workspaceStorageNameKey(nextName))) {
      setError(WORKSPACE_STORAGE_DUPLICATE_NAME_MESSAGE)
      return
    }

    try {
      setError('')
      setIsSaving(true)
      await onSubmit(nextName)
    } catch (submitError) {
      setError(submitError?.message || 'Unable to rename storage right now.')
      setIsSaving(false)
    }
  }

  return createPortal(
    <div
      className="employee-modal-backdrop create-workspace-storage-backdrop"
      onClick={handleDismiss}
      data-testid="rename-storage-dialog"
    >
      <div
        className="employee-modal stock-dashboard-modal task-form-modal is-responsive-sheet create-workspace-storage-dialog stock-storage-rename-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="drawer-header">
          <div>
            <p className="eyebrow">Stock</p>
            <h3 id={titleId}>Rename</h3>
            {locationKey ? (
              <p className="stock-modal-subtitle">Key stays {locationKey}</p>
            ) : null}
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={handleDismiss}
            disabled={isSaving}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <form className="employee-form" onSubmit={handleSubmit}>
          <label htmlFor={inputId}>
            Name
            <input
              id={inputId}
              type="text"
              value={name}
              maxLength={80}
              autoFocus
              disabled={isSaving}
              onChange={(event) => {
                setName(event.target.value)
                if (error) setError('')
              }}
              aria-invalid={error ? 'true' : undefined}
            />
          </label>
          {error ? (
            <div className="staff-status-banner" role="alert">
              {error}
            </div>
          ) : null}
          <div className="modal-actions">
            <button type="button" className="ghost-btn" onClick={handleDismiss} disabled={isSaving}>
              Cancel
            </button>
            <button type="submit" className="primary-btn" disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
