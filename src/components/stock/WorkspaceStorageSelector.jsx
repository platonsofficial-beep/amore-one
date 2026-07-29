import { useEffect, useMemo, useState } from 'react'
import {
  STOCK_CREATE_STORAGE_OPTION_VALUE,
  STOCK_LOCATIONS,
  resolveCatalogStorageSelectOptions,
  withPreservedStorageSelection,
} from '../../lib/stockCatalog'
import { listWorkspaceStorages } from '../../services/workspaceStorageService'
import { CreateWorkspaceStorageDialog } from './CreateWorkspaceStorageDialog'

function buildFallbackOptions() {
  return STOCK_LOCATIONS.map((location) => ({ value: location, label: location }))
}

/**
 * Shared workspace storage selector with Create Storage entry (P8.26.6).
 *
 * @param {{
 *   workspaceId?: string,
 *   value?: string,
 *   onChange?: (locationKey: string) => void,
 *   variant?: 'select' | 'grid',
 *   disabled?: boolean,
 *   required?: boolean,
 *   id?: string,
 *   emptyLabel?: string,
 *   'aria-label'?: string,
 *   'aria-invalid'?: string,
 * }} props
 */
export function WorkspaceStorageSelector({
  workspaceId = '',
  value = '',
  onChange,
  variant = 'select',
  disabled = false,
  required = false,
  id,
  emptyLabel = 'Select location',
  'aria-label': ariaLabel = 'Storage location',
  'aria-invalid': ariaInvalid,
}) {
  const [storageOptions, setStorageOptions] = useState(buildFallbackOptions)
  const [reloadToken, setReloadToken] = useState(0)
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()

    if (!normalizedWorkspaceId) {
      setStorageOptions(buildFallbackOptions())
      return undefined
    }

    ;(async () => {
      try {
        const storages = await listWorkspaceStorages(normalizedWorkspaceId)
        if (cancelled) return
        setStorageOptions(resolveCatalogStorageSelectOptions(storages))
      } catch (loadError) {
        console.warn('[WorkspaceStorageSelector] listWorkspaceStorages failed:', loadError)
        if (!cancelled) {
          setStorageOptions(buildFallbackOptions())
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [workspaceId, reloadToken])

  const locationOptions = useMemo(
    () => withPreservedStorageSelection(storageOptions, value),
    [storageOptions, value],
  )

  const openCreateDialog = () => {
    if (disabled) return
    setIsCreateOpen(true)
  }

  const handleCreated = (storage) => {
    const locationKey = `${storage?.locationKey ?? ''}`.trim()
    setIsCreateOpen(false)
    setReloadToken((token) => token + 1)
    if (locationKey) {
      onChange?.(locationKey)
    }
  }

  const handleSelectChange = (event) => {
    const nextValue = event.target.value
    if (nextValue === STOCK_CREATE_STORAGE_OPTION_VALUE) {
      openCreateDialog()
      return
    }
    onChange?.(nextValue)
  }

  return (
    <>
      {variant === 'grid' ? (
        <div className="stock-location-grid" role="group" aria-label={ariaLabel}>
          {locationOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              className={`stock-location-preset${value === option.value ? ' active' : ''}`}
              onClick={() => onChange?.(option.value)}
            >
              {option.label}
            </button>
          ))}
          <button
            type="button"
            disabled={disabled}
            className="stock-location-preset stock-location-create"
            data-stock-create-storage="true"
            data-value={STOCK_CREATE_STORAGE_OPTION_VALUE}
            onClick={openCreateDialog}
          >
            + Create storage...
          </button>
        </div>
      ) : (
        <select
          id={id}
          value={value}
          disabled={disabled}
          required={required}
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          onChange={handleSelectChange}
        >
          <option value="">{emptyLabel}</option>
          {locationOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
          <option value={STOCK_CREATE_STORAGE_OPTION_VALUE}>+ Create storage...</option>
        </select>
      )}

      {isCreateOpen ? (
        <CreateWorkspaceStorageDialog
          workspaceId={workspaceId}
          onClose={() => setIsCreateOpen(false)}
          onCreated={handleCreated}
        />
      ) : null}
    </>
  )
}
