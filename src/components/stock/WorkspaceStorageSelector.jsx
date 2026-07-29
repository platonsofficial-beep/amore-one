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

/** Shared invalidation so every mounted selector reloads after Create Storage. */
let workspaceStorageListEpoch = 0
/** @type {Set<(epoch: number) => void>} */
const workspaceStorageListListeners = new Set()
/** @type {Map<string, Array<{ value: string, label: string }>>} */
const workspaceStorageOptionsCache = new Map()

/**
 * Notify all mounted WorkspaceStorageSelector instances to reload.
 * Does not introduce a second storage list — only bumps the shared reload epoch.
 */
export function notifyWorkspaceStorageListChanged() {
  workspaceStorageOptionsCache.clear()
  workspaceStorageListEpoch += 1
  workspaceStorageListListeners.forEach((listener) => {
    listener(workspaceStorageListEpoch)
  })
}

/**
 * Subscribe to shared storage-list reload notifications (Create Storage / explicit refresh).
 *
 * @param {(epoch: number) => void} listener
 * @returns {() => void}
 */
export function subscribeWorkspaceStorageListChanged(listener) {
  if (typeof listener !== 'function') return () => {}
  workspaceStorageListListeners.add(listener)
  return () => {
    workspaceStorageListListeners.delete(listener)
  }
}

/**
 * Shared workspace storage selector with Create Storage entry (P8.26.6 / P8.27.7 / P8.28.1).
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
 *   className?: string,
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
  className,
  'aria-label': ariaLabel = 'Storage location',
  'aria-invalid': ariaInvalid,
}) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  const [storageOptions, setStorageOptions] = useState(() => {
    if (!normalizedWorkspaceId) return buildFallbackOptions()
    return workspaceStorageOptionsCache.get(normalizedWorkspaceId) ?? []
  })
  const [reloadToken, setReloadToken] = useState(0)
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  useEffect(() => {
    const onSharedReload = (epoch) => {
      setReloadToken(epoch)
    }
    workspaceStorageListListeners.add(onSharedReload)
    return () => {
      workspaceStorageListListeners.delete(onSharedReload)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const workspaceKey = `${workspaceId ?? ''}`.trim()

    if (!workspaceKey) {
      setStorageOptions(buildFallbackOptions())
      return undefined
    }

    const cached = workspaceStorageOptionsCache.get(workspaceKey)
    if (cached) {
      setStorageOptions(cached)
    }

    ;(async () => {
      try {
        const storages = await listWorkspaceStorages(workspaceKey)
        if (cancelled) return
        const nextOptions = resolveCatalogStorageSelectOptions(storages)
        workspaceStorageOptionsCache.set(workspaceKey, nextOptions)
        setStorageOptions(nextOptions)
      } catch (loadError) {
        console.warn('[WorkspaceStorageSelector] listWorkspaceStorages failed:', loadError)
        if (!cancelled) {
          // Prefer cached workspace list over hardcoded STOCK_LOCATIONS.
          setStorageOptions(workspaceStorageOptionsCache.get(workspaceKey) ?? [])
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
    notifyWorkspaceStorageListChanged()
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
          className={className}
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
