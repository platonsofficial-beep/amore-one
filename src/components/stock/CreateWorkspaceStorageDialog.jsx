import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { createWorkspaceStorage } from '../../services/workspaceStorageService'

const STORAGE_NAME_MAX_LENGTH = 80

/**
 * Client validation for Create Storage Name.
 * Trims outer spaces; server remains authoritative.
 *
 * @param {unknown} rawName
 * @returns {{ ok: boolean, value: string, error: string }}
 */
export function validateCreateWorkspaceStorageName(rawName) {
  const trimmed = `${rawName ?? ''}`.trim()
  if (!trimmed) {
    return {
      ok: false,
      value: '',
      error: 'Storage name is required.',
    }
  }
  if (trimmed.length > STORAGE_NAME_MAX_LENGTH) {
    return {
      ok: false,
      value: trimmed,
      error: `Storage name must be ${STORAGE_NAME_MAX_LENGTH} characters or fewer.`,
    }
  }
  return { ok: true, value: trimmed, error: '' }
}

/**
 * Shared Create Storage dialog (P8.26.6).
 *
 * @param {{
 *   workspaceId: string,
 *   onClose: () => void,
 *   onCreated: (storage: { locationKey: string, name: string, id?: unknown }) => void,
 * }} props
 */
export function CreateWorkspaceStorageDialog({
  workspaceId,
  onClose,
  onCreated,
}) {
  const titleId = useId()
  const inputId = useId()
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

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

    const validation = validateCreateWorkspaceStorageName(name)
    if (!validation.ok) {
      setError(validation.error)
      return
    }

    try {
      setError('')
      setIsSaving(true)
      const created = await createWorkspaceStorage(workspaceId, validation.value)
      onCreated?.(created)
    } catch (submitError) {
      setError(submitError?.message || 'Unable to create storage right now.')
    } finally {
      setIsSaving(false)
    }
  }

  return createPortal(
    <div
      className="employee-modal-backdrop create-workspace-storage-backdrop"
      onClick={handleDismiss}
      data-create-workspace-storage-dialog="true"
    >
      <div
        className="employee-modal stock-dashboard-modal task-form-modal is-responsive-sheet create-workspace-storage-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="drawer-header">
          <div>
            <p className="eyebrow">Stock</p>
            <h3 id={titleId}>Create storage</h3>
            <p className="stock-modal-subtitle">
              Add a workspace storage location for catalog and import.
            </p>
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
            Storage Name
            <input
              id={inputId}
              type="text"
              value={name}
              maxLength={STORAGE_NAME_MAX_LENGTH}
              autoFocus
              disabled={isSaving}
              placeholder="e.g. Cellar"
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
            <button
              type="button"
              className="ghost-btn"
              onClick={handleDismiss}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary-btn"
              disabled={isSaving}
            >
              {isSaving ? 'Creating…' : 'Create Storage'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
