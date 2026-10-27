/**
 * Storage Center. Active storages group by department once the departments
 * update is applied. Supply storages are a per-storage flag, with no
 * one-per-venue limit. Quantity summaries are unchanged.
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEscapeToClose } from '../../lib/useEscapeToClose'
import {
  DEPARTMENTS_UNAVAILABLE_MESSAGE,
  SUPPLY_STORAGE_LABEL,
  SUPPLY_STORAGE_LABEL_EL,
  groupActiveStoragesByDepartment,
  isWorkspaceDepartmentSchemaMissing,
  validateWorkspaceDepartmentName,
} from '../../lib/stockDepartmentGroups'
import { formatStockInventoryValue, formatStockQuantity } from '../../lib/stockUtils'
import { formatItemsBelowPar } from '../../lib/stockStoragePar'
import { getWorkspaceStorageSummaries } from '../../services/stockStorageCenterService'
import {
  assignWorkspaceStorageDepartment,
  createWorkspaceDepartment,
  listWorkspaceDepartments,
  renameWorkspaceDepartment,
  setWorkspaceDepartmentActive,
  setWorkspaceStorageBuying,
  setWorkspaceStorageSupply,
} from '../../services/workspaceDepartmentService'
import { renameWorkspaceStorage } from '../../services/workspaceStorageService'
import { RenameWorkspaceStorageDialog } from './RenameWorkspaceStorageDialog'
import { StockStorageDetailWorkspace } from './StockStorageDetailWorkspace'

const defaultDepartmentActions = {
  createDepartment: createWorkspaceDepartment,
  renameDepartment: renameWorkspaceDepartment,
  setDepartmentActive: setWorkspaceDepartmentActive,
  assignStorageDepartment: assignWorkspaceStorageDepartment,
  setStorageSupply: setWorkspaceStorageSupply,
  setStorageBuying: setWorkspaceStorageBuying,
}

const EMPTY_DEPARTMENTS = Object.freeze([])

/**
 * @param {{
 *   storage: object,
 *   selected?: boolean,
 *   onSelect?: (storage: object) => void,
 *   showValue?: boolean,
 *   departmentName?: string,
 *   canAssign?: boolean,
 *   departments?: Array<{ id: string, name: string, active?: boolean }>,
 *   actionsDisabled?: boolean,
 *   onAssignDepartment?: (storage: object, departmentId: string) => void,
 *   onToggleSupply?: (storage: object) => void,
 *   showBuyingToggle?: boolean,
 *   onToggleBuying?: (storage: object) => void,
 *   canRename?: boolean,
 *   onRename?: (storage: object) => void,
 * }} props
 */
function StorageSummaryCard({
  storage,
  selected = false,
  onSelect,
  showValue = true,
  departmentName = '',
  canAssign = false,
  departments = [],
  actionsDisabled = false,
  showBuyingToggle = false,
  onAssignDepartment,
  onToggleSupply,
  onToggleBuying,
  canRename = false,
  onRename,
}) {
  const currentDepartmentId = `${storage.departmentId ?? ''}`
  const knownIds = new Set(departments.map((department) => department.id))
  const options = departments.filter((department) => (
    department.active !== false || department.id === currentDepartmentId
  ))

  return (
    <article
      className={`stock-storage-center-card${selected ? ' is-selected' : ''}${storage.active ? '' : ' is-archived'}${storage.isSupply ? ' is-supply' : ''}`}
      data-storage-card={storage.id}
      data-storage-status={storage.status}
    >
      <div
        role="button"
        tabIndex={0}
        className="stock-storage-center-card-open"
        data-storage-id={storage.id}
        aria-pressed={selected}
        onClick={() => onSelect?.(storage)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          onSelect?.(storage)
        }}
      >
        <div className="stock-storage-center-card-top">
          <div>
            <strong className="stock-storage-center-card-name">
              {storage.name || storage.locationKey || 'Unnamed storage'}
            </strong>
            {storage.locationKey && storage.locationKey !== storage.name ? (
              <span className="stock-storage-center-card-key">{storage.locationKey}</span>
            ) : null}
            {departmentName ? (
              <span className="stock-storage-center-card-key">{departmentName}</span>
            ) : null}
          </div>
          <span className="stock-storage-center-card-badges">
            {storage.isSupply ? (
              <span
                className="stock-storage-supply-pill"
                data-testid="supply-storage-pill"
                title={`${SUPPLY_STORAGE_LABEL} · ${SUPPLY_STORAGE_LABEL_EL}`}
                aria-label={`${SUPPLY_STORAGE_LABEL}. ${SUPPLY_STORAGE_LABEL_EL}`}
              >
                Supply
              </span>
            ) : null}
            <span className={`stock-storage-center-status tone-${storage.active ? 'active' : 'archived'}`}>
              {storage.active ? 'Active' : 'Archived'}
            </span>
          </span>
        </div>
        <div className="stock-storage-center-card-stats">
          <div>
            <span className="stock-storage-stat-label">Products</span>
            <strong className="stock-storage-stat-value">{storage.productCount}</strong>
          </div>
          <div>
            <span className="stock-storage-stat-label">Total qty</span>
            <strong className="stock-storage-stat-value">{formatStockQuantity(storage.totalQuantity)}</strong>
          </div>
          <div>
            <span className="stock-storage-stat-label">Non-zero</span>
            <strong className="stock-storage-stat-value">{storage.nonZeroBalanceCount}</strong>
          </div>
          {showValue ? (
            <div>
              <span className="stock-storage-stat-label">Value</span>
              <strong className="stock-storage-stat-value">{formatStockInventoryValue(storage.inventoryValue)}</strong>
            </div>
          ) : null}
        </div>
        {typeof storage.belowParCount === 'number' ? (
          <p
            className={`stock-storage-below-par${storage.belowParCount > 0 ? ' is-short' : ''}`}
            data-testid="storage-below-par"
          >
            {formatItemsBelowPar(storage.belowParCount)}
          </p>
        ) : null}
      </div>
      {canAssign || canRename ? (
        <details className="stock-storage-edit">
          <summary>
            <svg className="stock-action-icon" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9.4 3.1 12.9 6.6M2.8 13.2l.7-3.1L10.2 3.4l2.4 2.4-6.7 6.7z" />
            </svg>
            Edit
          </summary>
        <div className="stock-storage-center-card-actions">
          {canAssign ? (
          <>
          <label className="stock-storage-department-field">
            <span>Department</span>
            <select
              className="stock-storage-department-select"
              data-action="assign-department"
              aria-label={`Department for ${storage.name || 'storage'}`}
              value={knownIds.has(currentDepartmentId) ? currentDepartmentId : ''}
              disabled={actionsDisabled}
              onChange={(event) => onAssignDepartment?.(storage, event.target.value)}
            >
              <option value="">Unassigned</option>
              {options.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.active === false ? `${department.name} · archived` : department.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="stock-storage-supply-toggle"
            data-action="toggle-supply"
            aria-pressed={storage.isSupply === true}
            disabled={actionsDisabled}
            onClick={() => onToggleSupply?.(storage)}
          >
            {storage.isSupply ? 'Unmark supply' : 'Mark as supply'}
          </button>
          {showBuyingToggle ? (
            <button
              type="button"
              className="stock-storage-buying-toggle"
              data-action="toggle-buying"
              aria-pressed={storage.isBuying === true}
              disabled={actionsDisabled}
              onClick={() => onToggleBuying?.(storage)}
            >
              {storage.isBuying ? 'Unmark buying' : 'Mark as buying'}
            </button>
          ) : null}
          </>
          ) : null}
          {canRename ? (
            <button
              type="button"
              className="stock-storage-rename-btn"
              data-action="rename-storage"
              disabled={actionsDisabled}
              onClick={() => onRename?.(storage)}
            >
              Rename
            </button>
          ) : null}
          <button
            type="button"
            className="stock-storage-edit-cancel"
            onClick={(event) => {
              const details = event.currentTarget.closest('details')
              if (details) details.open = false
            }}
          >
            Cancel
          </button>
        </div>
        </details>
      ) : null}
    </article>
  )
}

/**
 * @param {{
 *   mode: 'create'|'rename',
 *   initialName?: string,
 *   onClose: () => void,
 *   onSubmit: (name: string) => Promise<void>,
 * }} props
 */
function DepartmentNameDialog({ mode, initialName = '', onClose, onSubmit }) {
  const titleId = useId()
  const inputId = useId()
  const [name, setName] = useState(initialName)
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const title = mode === 'rename' ? 'Rename department' : 'New department'

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
    const validation = validateWorkspaceDepartmentName(name)
    if (!validation.ok) {
      setError(validation.error)
      return
    }
    try {
      setError('')
      setIsSaving(true)
      await onSubmit(validation.value)
    } catch (submitError) {
      setError(submitError?.message || 'Unable to save the department right now.')
      setIsSaving(false)
    }
  }

  return createPortal(
    <div
      className="employee-modal-backdrop create-workspace-storage-backdrop"
      onClick={handleDismiss}
      data-testid="stock-department-name-dialog"
    >
      <div
        className="employee-modal stock-dashboard-modal task-form-modal is-responsive-sheet create-workspace-storage-dialog stock-department-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="drawer-header">
          <div>
            <p className="eyebrow">Stock</p>
            <h3 id={titleId}>{title}</h3>
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
            Department name
            <input
              id={inputId}
              type="text"
              value={name}
              maxLength={80}
              autoFocus
              disabled={isSaving}
              placeholder="e.g. Bar"
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
              {isSaving ? 'Saving…' : 'Save department'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}

/**
 * @param {{
 *   workspaceId?: string,
 *   searchTerm?: string,
 *   role?: string,
 *   canManage?: boolean,
 *   onOpenActiveCountSession?: (sessionId: string) => void,
 *   onStartFastCount?: (storage: object) => void|Promise<void>,
 *   onReceive?: (storage: object) => void,
 *   onRecordReceive?: (payload: object) => void|Promise<void>,
 *   onTransfer?: (storage: object) => void,
 *   onRecordTransfer?: (payload: object) => void|Promise<void>,
 *   onAdjustment?: (storage: object) => void,
 *   onRecordAdjustment?: (payload: object) => void|Promise<void>,
 *   onRecordWaste?: (payload: object) => void|Promise<void>,
 *   isSavingReceive?: boolean,
 *   isSavingTransfer?: boolean,
 *   isSavingAdjustment?: boolean,
 *   onSupplyRefillComplete?: () => void|Promise<void>,
 *   loadSummaries?: typeof getWorkspaceStorageSummaries,
 *   loadDepartments?: typeof listWorkspaceDepartments,
 *   departmentActions?: typeof defaultDepartmentActions,
 *   renameStorage?: typeof renameWorkspaceStorage,
 * }} props
 */
export function StockStorageCenter({
  workspaceId = '',
  searchTerm = '',
  role = '',
  canManage = false,
  onOpenActiveCountSession,
  onStartFastCount,
  onReceive,
  onRecordReceive,
  onTransfer,
  onRecordTransfer,
  onAdjustment,
  onRecordAdjustment,
  onRecordWaste,
  isSavingReceive = false,
  isSavingTransfer = false,
  isSavingAdjustment = false,
  onSupplyRefillComplete,
  loadSummaries = getWorkspaceStorageSummaries,
  loadDepartments = listWorkspaceDepartments,
  departmentActions = defaultDepartmentActions,
  renameStorage = renameWorkspaceStorage,
  timeZone = '',
} = {}) {
  const [status, setStatus] = useState(/** @type {'loading'|'ready'|'empty'|'error'} */ ('loading'))
  const [errorMessage, setErrorMessage] = useState('')
  const [payload, setPayload] = useState(/** @type {Awaited<ReturnType<typeof getWorkspaceStorageSummaries>>|null} */ (null))
  const [departmentCatalog, setDepartmentCatalog] = useState(
    /** @type {{ available: boolean, departments: Array<{ id: string, name: string, active: boolean, sortOrder: number }> }|null} */ (null),
  )
  const [selectedId, setSelectedId] = useState(/** @type {string|null} */ (null))
  const [reloadToken, setReloadToken] = useState(0)
  const [departmentError, setDepartmentError] = useState('')
  const [departmentBusy, setDepartmentBusy] = useState(false)
  const [nameDialog, setNameDialog] = useState(
    /** @type {null|{ mode: 'create' }|{ mode: 'rename', departmentId: string, name: string }} */ (null),
  )
  const [pendingArchiveId, setPendingArchiveId] = useState(/** @type {string|null} */ (null))
  const [renameTarget, setRenameTarget] = useState(/** @type {object|null} */ (null))
  const loadedWorkspaceRef = useRef('')

  useEffect(() => {
    let cancelled = false
    const workspaceKey = `${workspaceId ?? ''}`.trim()

    if (!workspaceKey) {
      loadedWorkspaceRef.current = ''
      setStatus('empty')
      setPayload(null)
      setDepartmentCatalog(null)
      setErrorMessage('')
      return undefined
    }

    const workspaceChanged = loadedWorkspaceRef.current !== workspaceKey
    loadedWorkspaceRef.current = workspaceKey
    if (workspaceChanged) {
      setStatus('loading')
      setPayload(null)
      setDepartmentCatalog(null)
    }
    setErrorMessage('')
    setDepartmentError('')

    ;(async () => {
      try {
        const next = await loadSummaries(workspaceKey)
        if (cancelled) return
        let catalog = /** @type {{ available: boolean, departments: Array<{ id: string, name: string, active: boolean, sortOrder: number }> }|null} */ (null)
        if (next.departmentsAvailable === true) {
          try {
            catalog = await loadDepartments(workspaceKey)
          } catch (departmentLoadError) {
            if (!isWorkspaceDepartmentSchemaMissing(departmentLoadError)) throw departmentLoadError
            catalog = { available: false, departments: [] }
          }
        }
        if (cancelled) return
        setPayload(next)
        setDepartmentCatalog(catalog)
        setStatus(next.storages.length === 0 ? 'empty' : 'ready')
        setSelectedId((current) => {
          if (current && next.storages.some((storage) => storage.id === current)) return current
          return null
        })
      } catch (error) {
        if (cancelled) return
        setPayload(null)
        setDepartmentCatalog(null)
        setSelectedId(null)
        setStatus('error')
        setErrorMessage(error?.message || 'Unable to load storages right now.')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [workspaceId, loadSummaries, loadDepartments, reloadToken])

  const selectedStorage = useMemo(() => {
    if (!selectedId || !payload) return null
    return payload.storages.find((storage) => storage.id === selectedId) ?? null
  }, [payload, selectedId])

  const filteredActiveStorages = useMemo(() => {
    const needle = `${searchTerm ?? ''}`.trim().toLowerCase()
    const list = payload?.activeStorages ?? []
    if (!needle || selectedStorage) return list
    return list.filter((storage) => {
      const haystack = `${storage.name ?? ''} ${storage.locationKey ?? ''}`.toLowerCase()
      return haystack.includes(needle)
    })
  }, [payload, searchTerm, selectedStorage])

  const filteredArchivedStorages = useMemo(() => {
    const needle = `${searchTerm ?? ''}`.trim().toLowerCase()
    const list = payload?.archivedStorages ?? []
    if (!needle || selectedStorage) return list
    return list.filter((storage) => {
      const haystack = `${storage.name ?? ''} ${storage.locationKey ?? ''}`.toLowerCase()
      return haystack.includes(needle)
    })
  }, [payload, searchTerm, selectedStorage])

  const departmentsReady = payload?.departmentsAvailable === true && departmentCatalog?.available === true
  const showUnavailable = payload?.departmentsAvailable === false || departmentCatalog?.available === false
  const departments = departmentCatalog?.departments ?? EMPTY_DEPARTMENTS

  const departmentGroups = useMemo(() => {
    if (!departmentsReady) return []
    return groupActiveStoragesByDepartment({
      storages: filteredActiveStorages,
      departments,
      includeEmptyDepartments: canManage && !`${searchTerm ?? ''}`.trim(),
    })
  }, [departmentsReady, filteredActiveStorages, departments, canManage, searchTerm])

  const summary = payload?.summary

  const runDepartmentAction = async (action) => {
    if (departmentBusy) return
    setDepartmentError('')
    setDepartmentBusy(true)
    try {
      await action()
      setNameDialog(null)
      setPendingArchiveId(null)
      setReloadToken((token) => token + 1)
    } catch (actionError) {
      const message = actionError?.message || 'Unable to update departments right now.'
      setDepartmentError(message)
      throw actionError
    } finally {
      setDepartmentBusy(false)
    }
  }

  const departmentNameById = useMemo(() => {
    const names = new Map()
    for (const department of departments) names.set(department.id, department.name)
    return names
  }, [departments])

  const openRename = (storage) => {
    if (!canManage || !storage) return
    setRenameTarget(storage)
  }

  const takenStorageNames = (payload?.storages ?? [])
    .filter((storage) => storage.id !== renameTarget?.id)
    .map((storage) => storage.name)

  const renameDialog = renameTarget ? (
    <RenameWorkspaceStorageDialog
      storage={renameTarget}
      takenNames={takenStorageNames}
      onClose={() => setRenameTarget(null)}
      onSubmit={async (name) => {
        await renameStorage(workspaceId, renameTarget.id, name)
        setRenameTarget(null)
        setReloadToken((token) => token + 1)
      }}
    />
  ) : null

  if (selectedStorage) {
    return (
      <>
      <StockStorageDetailWorkspace
        workspaceId={workspaceId}
        storage={selectedStorage}
        searchTerm={searchTerm}
        role={role}
        canManage={canManage}
        onRename={canManage ? openRename : undefined}
        onBack={() => {
          setSelectedId(null)
          setReloadToken((token) => token + 1)
        }}
        onOpenActiveCountSession={onOpenActiveCountSession}
        onStartFastCount={onStartFastCount}
        onReceive={onReceive}
        onRecordReceive={onRecordReceive}
        onTransfer={onTransfer}
        onRecordTransfer={onRecordTransfer}
        onAdjustment={onAdjustment}
        onRecordAdjustment={onRecordAdjustment}
        onRecordWaste={onRecordWaste}
        isSavingReceive={isSavingReceive}
        isSavingTransfer={isSavingTransfer}
        isSavingAdjustment={isSavingAdjustment}
        onSupplyRefillComplete={async () => {
          setReloadToken((token) => token + 1)
          await onSupplyRefillComplete?.()
        }}
        timeZone={timeZone}
      />
      {renameDialog}
      </>
    )
  }

  const renderCard = (storage, { showDepartmentOnCard = false } = {}) => (
    <StorageSummaryCard
      key={storage.id}
      storage={storage}
      showValue={canManage}
      selected={selectedId === storage.id}
      departmentName={showDepartmentOnCard ? (departmentNameById.get(storage.departmentId) || '') : ''}
      canAssign={canManage && departmentsReady}
      canRename={canManage}
      departments={departments}
      actionsDisabled={departmentBusy}
      showBuyingToggle={payload?.buyingAvailable === true}
      onSelect={(next) => setSelectedId(next.id)}
      onAssignDepartment={(next, departmentId) => {
        runDepartmentAction(() => departmentActions.assignStorageDepartment(
          workspaceId,
          next.id,
          departmentId,
        )).catch(() => {})
      }}
      onToggleSupply={(next) => {
        runDepartmentAction(() => departmentActions.setStorageSupply(
          workspaceId,
          next.id,
          next.isSupply !== true,
        )).catch(() => {})
      }}
      onToggleBuying={(next) => {
        runDepartmentAction(() => departmentActions.setStorageBuying(
          workspaceId,
          next.id,
          next.isBuying !== true,
        )).catch(() => {})
      }}
      onRename={openRename}
    />
  )

  return (
    <section className="stock-storage-center-page" aria-label="Storages">
      <header className="stock-storage-center-header">
        <div className="stock-storage-center-header-copy">
          <h2 className="stock-storage-center-title">Storages</h2>
          <p className="stock-storage-center-subtitle">
            Understand and manage stock by physical location.
          </p>
        </div>
        {canManage && departmentsReady ? (
          <div className="stock-department-toolbar">
            <button
              type="button"
              className="stock-department-toolbar-btn"
              data-action="new-department"
              disabled={departmentBusy}
              onClick={() => setNameDialog({ mode: 'create' })}
            >
              New department
            </button>
          </div>
        ) : null}
      </header>

      {showUnavailable && status !== 'loading' && status !== 'error' ? (
        <div className="stock-department-banner" role="status" data-testid="stock-departments-unavailable">
          {DEPARTMENTS_UNAVAILABLE_MESSAGE}
        </div>
      ) : null}

      {departmentError ? (
        <div className="stock-department-banner is-error" role="alert" data-testid="stock-department-error">
          {departmentError}
        </div>
      ) : null}

      {status === 'ready' && summary ? (
        <div className="stock-storage-center-overview" role="status">
          <div className="stock-storage-center-overview-stat">
            <span className="stock-storage-center-overview-label">
              <span className="stock-storage-center-overview-label-full">Active storages</span>
              <span className="stock-storage-center-overview-label-short">Storages</span>
            </span>
            <strong>{summary.activeStorageCount}</strong>
          </div>
          <div className="stock-storage-center-overview-stat">
            <span className="stock-storage-center-overview-label">
              <span className="stock-storage-center-overview-label-full">Products with balances</span>
              <span className="stock-storage-center-overview-label-short">Products</span>
            </span>
            <strong>{summary.totalProductsWithBalances}</strong>
          </div>
          <div className="stock-storage-center-overview-stat">
            <span className="stock-storage-center-overview-label">
              <span className="stock-storage-center-overview-label-full">Total quantity</span>
              <span className="stock-storage-center-overview-label-short">Total qty</span>
            </span>
            <strong>{formatStockQuantity(summary.totalQuantity)}</strong>
          </div>
        </div>
      ) : null}

      {status === 'loading' ? (
        <div className="stock-storage-center-state" role="status" data-testid="stock-storage-center-loading">
          Loading storages…
        </div>
      ) : null}

      {status === 'error' ? (
        <div className="stock-storage-center-state is-error" role="alert" data-testid="stock-storage-center-error">
          <p>{errorMessage}</p>
          <button
            type="button"
            className="stock-storage-center-retry"
            onClick={() => setReloadToken((token) => token + 1)}
          >
            Retry
          </button>
        </div>
      ) : null}

      {status === 'empty' && departmentGroups.length === 0 ? (
        <div className="stock-storage-center-state" role="status" data-testid="stock-storage-center-empty">
          <p className="stock-storage-center-empty-title">No storages yet.</p>
          <p className="stock-storage-center-empty-copy">
            Workspace storages will appear here once they are available.
          </p>
        </div>
      ) : null}

      {payload && (status === 'ready' || departmentGroups.length > 0) ? (
        <div className="stock-storage-center-list">
          {departmentsReady ? (
            departmentGroups.map((group) => (
              <section
                key={group.id}
                className="stock-department-group"
                data-department-group={group.id}
                aria-label={group.name}
              >
                <div className="stock-department-group-header">
                  {group.storages.length === 1
                    && `${group.storages[0]?.name || group.storages[0]?.locationKey || ''}`.trim().toLowerCase()
                      === `${group.name || ''}`.trim().toLowerCase() ? (
                      <span className="sr-only">{group.name}</span>
                    ) : (
                      <h3 className="stock-storage-center-section-title">
                        {group.active ? group.name : `${group.name} · archived`}
                      </h3>
                    )}
                  {canManage && !group.isUnassigned ? (
                    <div className="stock-department-group-actions">
                      <button
                        type="button"
                        className="stock-department-toolbar-btn"
                        data-action="rename-department"
                        disabled={departmentBusy}
                        onClick={() => setNameDialog({
                          mode: 'rename',
                          departmentId: group.id,
                          name: group.name,
                        })}
                      >
                        Rename
                      </button>
                      {group.active ? (
                        pendingArchiveId === group.id ? (
                          <>
                            <button
                              type="button"
                              className="stock-department-toolbar-btn"
                              data-action="confirm-archive-department"
                              disabled={departmentBusy}
                              onClick={() => {
                                runDepartmentAction(() => departmentActions.setDepartmentActive(
                                  workspaceId,
                                  group.id,
                                  false,
                                )).catch(() => {})
                              }}
                            >
                              Confirm archive
                            </button>
                            <button
                              type="button"
                              className="stock-department-toolbar-btn"
                              disabled={departmentBusy}
                              onClick={() => setPendingArchiveId(null)}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="stock-department-toolbar-btn"
                            data-action="archive-department"
                            disabled={departmentBusy}
                            onClick={() => setPendingArchiveId(group.id)}
                          >
                            Archive
                          </button>
                        )
                      ) : (
                        <button
                          type="button"
                          className="stock-department-toolbar-btn"
                          data-action="restore-department"
                          disabled={departmentBusy}
                          onClick={() => {
                            runDepartmentAction(() => departmentActions.setDepartmentActive(
                              workspaceId,
                              group.id,
                              true,
                            )).catch(() => {})
                          }}
                        >
                          Restore
                        </button>
                      )}
                    </div>
                  ) : null}
                </div>
                {group.storages.length === 0 ? (
                  <p className="stock-storage-center-section-empty">No storages in this department.</p>
                ) : (
                  <div className="stock-storage-center-grid">
                    {group.storages.map((storage) => renderCard(storage))}
                  </div>
                )}
              </section>
            ))
          ) : status === 'ready' ? (
            <>
              <h3 className="stock-storage-center-section-title">Active</h3>
              {filteredActiveStorages.length === 0 ? (
                <p className="stock-storage-center-section-empty">
                  {`${searchTerm ?? ''}`.trim() ? 'No active storages match this search.' : 'No active storages.'}
                </p>
              ) : (
                <div className="stock-storage-center-grid">
                  {filteredActiveStorages.map((storage) => renderCard(storage))}
                </div>
              )}
            </>
          ) : null}

          {payload.archivedStorages.length > 0 ? (
            <div className="stock-storage-center-archived">
              <h3 className="stock-storage-center-section-title">Archived</h3>
              {filteredArchivedStorages.length === 0 ? (
                <p className="stock-storage-center-section-empty">No archived storages match this search.</p>
              ) : (
                <div className="stock-storage-center-grid is-archived">
                  {filteredArchivedStorages.map((storage) => renderCard(storage, {
                    showDepartmentOnCard: departmentsReady,
                  }))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {renameDialog}
      {nameDialog ? (
        <DepartmentNameDialog
          mode={nameDialog.mode}
          initialName={nameDialog.mode === 'rename' ? nameDialog.name : ''}
          onClose={() => {
            if (departmentBusy) return
            setNameDialog(null)
          }}
          onSubmit={async (name) => {
            if (nameDialog.mode === 'rename') {
              await runDepartmentAction(() => departmentActions.renameDepartment(
                workspaceId,
                nameDialog.departmentId,
                name,
              ))
              return
            }
            await runDepartmentAction(() => departmentActions.createDepartment(workspaceId, name))
          }}
        />
      ) : null}
    </section>
  )
}
