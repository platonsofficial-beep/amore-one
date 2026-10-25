/**
 * P8.30.2–P8.30.7 — Storage detail products + action launches.
 *
 * Shows products with quantity in THIS storage only.
 * Fast Count / Receive / Transfer / Adjustment reuse existing engines.
 * Reuses StockProductHistoryDrawer for product detail — no forked drawer.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { buildProductDisplayNameFromItem } from '../../lib/stockProductIdentity'
import {
  STORAGE_PAR_LABEL,
  STORAGE_PAR_UNAVAILABLE_MESSAGE,
  isBelowStoragePar,
  parseStorageParInput,
  storageParShort,
} from '../../lib/stockStoragePar'
import { formatStockInventoryValue, formatStockQuantity } from '../../lib/stockUtils'
import {
  STOCK_STORAGE_PRODUCT_SORT_OPTIONS,
  filterStorageProductRows,
  getWorkspaceStorageProducts,
  sortStorageProductRows,
} from '../../services/stockStorageCenterService'
import {
  clearStockItemStoragePar,
  setStockItemStoragePar,
} from '../../services/stockItemStorageParService'
import { startStorageFastCountSession } from '../../services/stockStorageFastCountService'
import { StockProductHistoryDrawer } from './StockProductHistoryDrawer'
import { StockStorageDetailActionBar } from './StockStorageDetailActionBar'
import { StockStorageActionPlaceholder } from './StockStorageActionPlaceholder'
import { StockMovementModal } from './StockMovementModal'
import { StockStorageReceiveProductPicker } from './StockStorageReceiveProductPicker'
import { StockTransferModal } from './StockTransferModal'

function focusNextStoragePar(input) {
  const inputs = [...document.querySelectorAll('[data-storage-par-input="true"]')]
  const index = inputs.indexOf(input)
  const next = inputs[index + 1]
  if (next instanceof HTMLElement) next.focus()
}

/**
 * @param {{
 *   row: object,
 *   disabled?: boolean,
 *   onCommit?: (row: object, parsed: { clear: boolean, value: number|null }) => Promise<void>,
 * }} props
 */
function StorageParEditor({ row, disabled = false, onCommit }) {
  const [draft, setDraft] = useState(row.parQuantity == null ? '' : `${row.parQuantity}`)
  const [error, setError] = useState('')
  const lastCommitted = useRef(row.parQuantity ?? null)

  useEffect(() => {
    lastCommitted.current = row.parQuantity ?? null
    setDraft(row.parQuantity == null ? '' : `${row.parQuantity}`)
  }, [row.stockItemId, row.parQuantity])

  const commit = async (raw, { focusNext = false, input = null } = {}) => {
    const parsed = parseStorageParInput(raw)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    const nextValue = parsed.clear ? null : parsed.value
    if (Object.is(nextValue, lastCommitted.current)) {
      setError('')
      if (focusNext && input) focusNextStoragePar(input)
      return
    }
    try {
      setError('')
      await onCommit?.(row, parsed)
      lastCommitted.current = nextValue
      if (focusNext && input) focusNextStoragePar(input)
    } catch (commitError) {
      setError(commitError?.message || 'Unable to save the shelf par.')
    }
  }

  return (
    <div className="stock-storage-par-field">
      <span>Par</span>
      <div className="stock-storage-par-edit">
        <input
          className="stock-storage-par-input"
          data-storage-par-input="true"
          inputMode="decimal"
          aria-label={`${STORAGE_PAR_LABEL} for ${row.name || 'product'}`}
          value={draft}
          disabled={disabled}
          placeholder="Not tracked"
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => {
            setDraft(event.target.value)
            if (error) setError('')
          }}
          onBlur={(event) => {
            void commit(event.target.value)
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            void commit(event.currentTarget.value, {
              focusNext: true,
              input: event.currentTarget,
            })
          }}
        />
        <button
          type="button"
          className="stock-storage-par-clear"
          data-action="clear-par"
          disabled={disabled || row.parQuantity == null}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => {
            setDraft('')
            void commit('')
          }}
        >
          Clear
        </button>
      </div>
      {error ? (
        <span className="stock-storage-par-error" role="alert">{error}</span>
      ) : null}
    </div>
  )
}

/**
 * @param {{
 *   row: object,
 *   canManage?: boolean,
 *   showPar?: boolean,
 *   parBusy?: boolean,
 *   menuOpen?: boolean,
 *   onOpenDetails?: (row: object) => void,
 *   onToggleMenu?: (row: object, anchorEl: HTMLElement|null) => void,
 *   onMenuAction?: (actionId: string, row: object) => void,
 *   onCommitPar?: (row: object, parsed: { clear: boolean, value: number|null }) => Promise<void>,
 * }} props
 */
function StorageProductRow({
  row,
  canManage = false,
  showPar = false,
  parBusy = false,
  menuOpen = false,
  onOpenDetails,
  onToggleMenu,
  onMenuAction,
  onCommitPar,
}) {
  return (
    <div
      className={`stock-storage-product-row-wrap${row.active ? '' : ' is-inactive'}${menuOpen ? ' is-menu-open' : ''}`}
      data-stock-item-id={row.stockItemId}
    >
      <button
        type="button"
        className="stock-storage-product-row"
        onClick={() => onOpenDetails?.(row)}
      >
        <div className="stock-storage-product-row-main">
          <strong className="stock-storage-product-name">{buildProductDisplayNameFromItem(row)}</strong>
          <span className="stock-storage-product-category">{row.category || 'Other'}</span>
        </div>
        <div className="stock-storage-product-row-meta">
          <span className="stock-storage-product-qty">
            {formatStockQuantity(row.quantity, row.unit)}
          </span>
          <span className={`stock-storage-product-badge tone-${row.active ? 'active' : 'inactive'}`}>
            {row.active ? 'Active' : 'Inactive'}
          </span>
        </div>
      </button>
      <button
        type="button"
        className={`ghost-btn stock-storage-product-more-btn${menuOpen ? ' is-open' : ''}`}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-label={`More actions for ${buildProductDisplayNameFromItem(row)}`}
        data-storage-product-menu-trigger="true"
        onClick={(event) => {
          event.stopPropagation()
          onToggleMenu?.(row, event.currentTarget)
        }}
      >
        ⋯
      </button>
      {menuOpen ? (
        <div
          className="stock-storage-product-menu"
          role="menu"
          aria-label={`Actions for ${buildProductDisplayNameFromItem(row)}`}
          data-testid="stock-storage-product-menu"
        >
          <button
            type="button"
            role="menuitem"
            className="stock-storage-product-menu-item"
            data-menu-action="view_details"
            onClick={() => onOpenDetails?.(row)}
          >
            View Details
          </button>
          {canManage ? (
            <>
              <button
                type="button"
                role="menuitem"
                className="stock-storage-product-menu-item"
                data-menu-action="receive"
                onClick={() => onMenuAction?.('receive', row)}
              >
                Receive
              </button>
              <button
                type="button"
                role="menuitem"
                className="stock-storage-product-menu-item"
                data-menu-action="transfer"
                onClick={() => onMenuAction?.('transfer', row)}
              >
                Transfer
              </button>
              <button
                type="button"
                role="menuitem"
                className="stock-storage-product-menu-item"
                data-menu-action="adjustment"
                onClick={() => onMenuAction?.('adjustment', row)}
              >
                Adjustment
              </button>
              <button
                type="button"
                role="menuitem"
                className="stock-storage-product-menu-item"
                data-menu-action="fast_count"
                onClick={() => onMenuAction?.('fast_count', row)}
              >
                Fast Count
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      {showPar ? (
        <div
          className={`stock-storage-product-par${isBelowStoragePar(row.parQuantity, row.quantity) ? ' is-below-par' : ''}`}
          data-testid="storage-par-line"
        >
          <div className="stock-storage-par-readout">
            <span>On hand</span>
            <strong>{formatStockQuantity(row.quantity, row.unit)}</strong>
          </div>
          {canManage ? (
            <StorageParEditor row={row} disabled={parBusy} onCommit={onCommitPar} />
          ) : (
            <div className="stock-storage-par-readout">
              <span>Par</span>
              <strong>{row.parQuantity == null ? '—' : formatStockQuantity(row.parQuantity, row.unit)}</strong>
            </div>
          )}
          <div className="stock-storage-par-readout">
            <span>Short</span>
            <strong>{row.shortQuantity == null ? '—' : formatStockQuantity(row.shortQuantity, row.unit)}</strong>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * @param {{
 *   workspaceId?: string,
 *   storage: object,
 *   searchTerm?: string,
 *   canManage?: boolean,
 *   onBack?: () => void,
 *   onOpenActiveCountSession?: (sessionId: string) => void,
 *   onStartFastCount?: (storage: object) => void|Promise<void>,
 *   onReceive?: (storage: object) => void,
 *   onRecordReceive?: (payload: object) => void|Promise<void>,
 *   onTransfer?: (storage: object) => void,
 *   onRecordTransfer?: (payload: object) => void|Promise<void>,
 *   onAdjustment?: (storage: object) => void,
 *   onRecordAdjustment?: (payload: object) => void|Promise<void>,
 *   isSavingReceive?: boolean,
 *   isSavingTransfer?: boolean,
 *   isSavingAdjustment?: boolean,
 *   loadProducts?: typeof getWorkspaceStorageProducts,
 *   startFastCountSession?: typeof startStorageFastCountSession,
 * }} props
 */
export function StockStorageDetailWorkspace({
  workspaceId = '',
  storage,
  searchTerm = '',
  canManage = false,
  onBack,
  onOpenActiveCountSession,
  onStartFastCount,
  onReceive,
  onRecordReceive,
  onTransfer,
  onRecordTransfer,
  onAdjustment,
  onRecordAdjustment,
  isSavingReceive = false,
  isSavingTransfer = false,
  isSavingAdjustment = false,
  loadProducts = getWorkspaceStorageProducts,
  startFastCountSession = startStorageFastCountSession,
  saveStoragePar = setStockItemStoragePar,
  clearStoragePar = clearStockItemStoragePar,
} = {}) {
  const [status, setStatus] = useState(/** @type {'loading'|'ready'|'empty'|'error'} */ ('loading'))
  const [errorMessage, setErrorMessage] = useState('')
  const [payload, setPayload] = useState(/** @type {Awaited<ReturnType<typeof getWorkspaceStorageProducts>>|null} */ (null))
  const [sortKey, setSortKey] = useState('name-asc')
  const [historyItem, setHistoryItem] = useState(/** @type {object|null} */ (null))
  const [reloadToken, setReloadToken] = useState(0)
  const [openMenuItemId, setOpenMenuItemId] = useState(/** @type {string|null} */ (null))
  const [placeholder, setPlaceholder] = useState(/** @type {{ actionId: string, productName?: string }|null} */ (null))
  const [isLaunchingFastCount, setIsLaunchingFastCount] = useState(false)
  const [fastCountError, setFastCountError] = useState('')
  const [receivePickerOpen, setReceivePickerOpen] = useState(false)
  const [receiveRow, setReceiveRow] = useState(/** @type {object|null} */ (null))
  const [transferPickerOpen, setTransferPickerOpen] = useState(false)
  const [transferRow, setTransferRow] = useState(/** @type {object|null} */ (null))
  const [adjustmentPickerOpen, setAdjustmentPickerOpen] = useState(false)
  const [adjustmentRow, setAdjustmentRow] = useState(/** @type {object|null} */ (null))
  const [belowParOnly, setBelowParOnly] = useState(false)
  const [parBusy, setParBusy] = useState(false)
  const [parError, setParError] = useState('')
  const listRef = useRef(/** @type {HTMLDivElement|null} */ (null))
  const fastCountRequestIdRef = useRef(0)

  const storageId = `${storage?.id ?? ''}`.trim()
  const storageTitle = storage?.name || storage?.locationKey || 'Storage'

  useEffect(() => {
    let cancelled = false
    const workspaceKey = `${workspaceId ?? ''}`.trim()

    if (!workspaceKey || !storageId) {
      setStatus('empty')
      setPayload(null)
      setErrorMessage('')
      return undefined
    }

    setStatus('loading')
    setErrorMessage('')

    ;(async () => {
      try {
        const next = await loadProducts(workspaceKey, storageId)
        if (cancelled) return
        setPayload(next)
        setStatus(next.products.length === 0 ? 'empty' : 'ready')
      } catch (error) {
        if (cancelled) return
        setPayload(null)
        setStatus('error')
        setErrorMessage(error?.message || 'Unable to load storage products right now.')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [workspaceId, storageId, loadProducts, reloadToken])

  useEffect(() => {
    if (!openMenuItemId) return undefined

    const handlePointerDown = (event) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('[data-testid="stock-storage-product-menu"]')) return
      if (target.closest('[data-storage-product-menu-trigger="true"]')) return
      setOpenMenuItemId(null)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [openMenuItemId])

  const visibleProducts = useMemo(() => {
    const rows = payload?.products ?? []
    const filtered = filterStorageProductRows(rows, searchTerm)
    const shelfFiltered = belowParOnly
      ? filtered.filter((row) => isBelowStoragePar(row?.parQuantity, row?.quantity))
      : filtered
    return sortStorageProductRows(shelfFiltered, sortKey)
  }, [payload, searchTerm, sortKey, belowParOnly])

  const summary = payload?.summary
  const parsAvailable = payload?.parsAvailable === true
  const belowParCount = (payload?.products ?? []).filter((row) => (
    isBelowStoragePar(row?.parQuantity, row?.quantity)
  )).length
  const headerProductCount = summary?.productCount ?? storage?.productCount ?? 0
  const headerQuantity = summary?.totalQuantity ?? storage?.totalQuantity ?? 0
  const headerValue = summary?.inventoryValue ?? storage?.inventoryValue ?? 0

  const openPlaceholder = (actionId, productName = '') => {
    setOpenMenuItemId(null)
    setPlaceholder({ actionId, productName })
  }

  const handleStartFastCount = async () => {
    if (isLaunchingFastCount || storage?.active === false) return

    setOpenMenuItemId(null)
    setPlaceholder(null)
    setFastCountError('')

    const requestId = fastCountRequestIdRef.current + 1
    fastCountRequestIdRef.current = requestId
    setIsLaunchingFastCount(true)

    try {
      if (typeof onStartFastCount === 'function') {
        await onStartFastCount(storage)
        return
      }

      const { session } = await startFastCountSession({
        workspaceId,
        storage,
      })
      const sessionId = `${session?.id ?? ''}`.trim()
      if (!sessionId) {
        throw new Error('Inventory count session response was empty or invalid.')
      }
      if (fastCountRequestIdRef.current !== requestId) return
      onOpenActiveCountSession?.(sessionId)
    } catch (error) {
      if (fastCountRequestIdRef.current !== requestId) return
      setFastCountError(error?.message || 'Unable to start Fast Count right now.')
    } finally {
      if (fastCountRequestIdRef.current === requestId) {
        setIsLaunchingFastCount(false)
      }
    }
  }

  const handleOpenDetails = (row) => {
    setOpenMenuItemId(null)
    setHistoryItem(row.item)
  }

  const handleStartReceive = () => {
    if (storage?.active === false) return
    setOpenMenuItemId(null)
    setPlaceholder(null)
    if (typeof onReceive === 'function') {
      onReceive(storage)
      return
    }
    setReceiveRow(null)
    setReceivePickerOpen(true)
  }

  const handleReceiveProductSelected = (row) => {
    setReceivePickerOpen(false)
    setReceiveRow(row)
  }

  const handleRecordReceiveSubmit = async ({ item, type, quantity, note, workspaceStorageId, expectedQuantityVersion }) => {
    if (typeof onRecordReceive !== 'function') {
      throw new Error('Receiving is not available right now.')
    }
    await onRecordReceive({
      item,
      type,
      quantity,
      note,
      workspaceStorageId,
      expectedQuantityVersion,
      storage,
    })
    setReceiveRow(null)
    setReloadToken((token) => token + 1)
  }

  const handleStartTransfer = () => {
    if (storage?.active === false) return
    setOpenMenuItemId(null)
    setPlaceholder(null)
    if (typeof onTransfer === 'function') {
      onTransfer(storage)
      return
    }
    setTransferRow(null)
    setTransferPickerOpen(true)
  }

  const handleTransferProductSelected = (row) => {
    setTransferPickerOpen(false)
    setTransferRow(row)
  }

  const handleRecordTransferSubmit = async (payload) => {
    if (typeof onRecordTransfer !== 'function') {
      throw new Error('Transfer is not available right now.')
    }
    await onRecordTransfer({
      ...payload,
      storage,
    })
    setTransferRow(null)
    setReloadToken((token) => token + 1)
  }

  const handleStartAdjustment = () => {
    if (storage?.active === false) return
    setOpenMenuItemId(null)
    setPlaceholder(null)
    if (typeof onAdjustment === 'function') {
      onAdjustment(storage)
      return
    }
    setAdjustmentRow(null)
    setAdjustmentPickerOpen(true)
  }

  const handleAdjustmentProductSelected = (row) => {
    setAdjustmentPickerOpen(false)
    setAdjustmentRow(row)
  }

  const handleRecordAdjustmentSubmit = async ({
    item,
    type,
    quantity,
    note,
    workspaceStorageId,
    expectedQuantityVersion,
  }) => {
    if (typeof onRecordAdjustment !== 'function') {
      throw new Error('Adjustment is not available right now.')
    }
    await onRecordAdjustment({
      item,
      type,
      quantity,
      note,
      workspaceStorageId,
      expectedQuantityVersion,
      storage,
    })
    setAdjustmentRow(null)
    setReloadToken((token) => token + 1)
  }

  const handleMenuAction = (actionId, row) => {
    if (actionId === 'fast_count') {
      void handleStartFastCount()
      return
    }
    if (actionId === 'receive') {
      setOpenMenuItemId(null)
      setPlaceholder(null)
      if (typeof onReceive === 'function') {
        onReceive(storage)
        return
      }
      setReceiveRow(row)
      return
    }
    if (actionId === 'transfer') {
      setOpenMenuItemId(null)
      setPlaceholder(null)
      if (typeof onTransfer === 'function') {
        onTransfer(storage)
        return
      }
      setTransferRow(row)
      return
    }
    if (actionId === 'adjustment') {
      setOpenMenuItemId(null)
      setPlaceholder(null)
      if (typeof onAdjustment === 'function') {
        onAdjustment(storage)
        return
      }
      setAdjustmentRow(row)
      return
    }
    openPlaceholder(actionId, row.name)
  }

  const handleCommitPar = async (row, parsed) => {
    if (parBusy) return
    const workspaceKey = `${workspaceId ?? ''}`.trim()
    if (!workspaceKey || !storageId) return
    setParError('')
    setParBusy(true)
    try {
      if (parsed.clear) {
        await clearStoragePar(workspaceKey, row.stockItemId, storageId)
      } else {
        await saveStoragePar(workspaceKey, row.stockItemId, storageId, parsed.value)
      }
      const parQuantity = parsed.clear ? null : parsed.value
      setPayload((current) => {
        if (!current) return current
        const products = current.products.map((product) => {
          if (product.stockItemId !== row.stockItemId) return product
          const shortQuantity = storageParShort(parQuantity, product.quantity)
          return {
            ...product,
            parQuantity,
            shortQuantity,
          }
        })
        return { ...current, products }
      })
    } catch (commitError) {
      const message = commitError?.message || 'Unable to save the shelf par.'
      setParError(message)
      throw commitError
    } finally {
      setParBusy(false)
    }
  }

  return (
    <section
      className="stock-storage-detail-workspace"
      aria-label={`${storageTitle} products`}
      data-testid="stock-storage-detail-workspace"
    >
      <header className="stock-storage-detail-workspace-header">
        <div className="stock-storage-detail-workspace-header-top">
          <button
            type="button"
            className="stock-storage-detail-back"
            onClick={() => onBack?.()}
            aria-label="Back to storages"
          >
            ← Storages
          </button>
          <span className={`stock-storage-center-status tone-${storage?.active !== false ? 'active' : 'archived'}`}>
            {storage?.active !== false ? 'Active' : 'Archived'}
          </span>
        </div>
        <div className="stock-storage-detail-workspace-header-copy">
          <h2 className="stock-storage-detail-workspace-title">{storageTitle}</h2>
          {storage?.locationKey && storage.locationKey !== storageTitle ? (
            <p className="stock-storage-detail-workspace-key">{storage.locationKey}</p>
          ) : null}
        </div>
        <dl className="stock-storage-detail-workspace-stats">
          <div>
            <dt>Products</dt>
            <dd>{headerProductCount}</dd>
          </div>
          <div>
            <dt>Quantity</dt>
            <dd>{formatStockQuantity(headerQuantity)}</dd>
          </div>
          {canManage ? (
            <div>
              <dt>Inventory value</dt>
              <dd>{formatStockInventoryValue(headerValue)}</dd>
            </div>
          ) : null}
          {parsAvailable ? (
            <div>
              <dt>Below par</dt>
              <dd>{belowParCount}</dd>
            </div>
          ) : null}
        </dl>
        <StockStorageDetailActionBar
          storage={storage}
          canManage={canManage}
          isLaunchingFastCount={isLaunchingFastCount}
          onStartFastCount={() => { void handleStartFastCount() }}
          onReceive={() => handleStartReceive()}
          onTransfer={() => handleStartTransfer()}
          onAdjustment={() => handleStartAdjustment()}
        />
        {isLaunchingFastCount ? (
          <div
            className="stock-storage-fast-count-status"
            role="status"
            data-testid="stock-storage-fast-count-loading"
          >
            Starting Inventory Count…
          </div>
        ) : null}
        {fastCountError ? (
          <div
            className="stock-storage-fast-count-status is-error"
            role="alert"
            data-testid="stock-storage-fast-count-error"
          >
            {fastCountError}
          </div>
        ) : null}
      </header>

      <div className="stock-storage-detail-workspace-toolbar">
        <label className="stock-storage-detail-sort">
          <span>Sort</span>
          <select
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value)}
            aria-label="Sort storage products"
          >
            {STOCK_STORAGE_PRODUCT_SORT_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
        {parsAvailable ? (
          <button
            type="button"
            className={`stock-storage-below-par-filter${belowParOnly ? ' is-on' : ''}`}
            data-action="filter-below-par"
            aria-pressed={belowParOnly}
            onClick={() => setBelowParOnly((current) => !current)}
          >
            Below par
          </button>
        ) : null}
        <p className="stock-storage-detail-result-count" role="status">
          {status === 'ready' || status === 'empty'
            ? `${visibleProducts.length} product${visibleProducts.length === 1 ? '' : 's'}`
            : null}
        </p>
      </div>

      {parsAvailable && status !== 'loading' && status !== 'error' ? (
        <p className="stock-storage-par-note" data-testid="storage-par-note">
          {STORAGE_PAR_LABEL}. A blank par means this item is not tracked on this shelf.
        </p>
      ) : null}

      {payload?.parsAvailable === false && status !== 'loading' && status !== 'error' ? (
        <div className="stock-department-banner" role="status" data-testid="storage-pars-unavailable">
          {STORAGE_PAR_UNAVAILABLE_MESSAGE}
        </div>
      ) : null}

      {parError ? (
        <div className="stock-department-banner is-error" role="alert" data-testid="storage-par-error">
          {parError}
        </div>
      ) : null}

      {status === 'loading' ? (
        <div className="stock-storage-center-state" role="status" data-testid="stock-storage-detail-loading">
          Loading products…
        </div>
      ) : null}

      {status === 'error' ? (
        <div className="stock-storage-center-state is-error" role="alert" data-testid="stock-storage-detail-error">
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

      {status === 'empty' ? (
        <div className="stock-storage-center-state" role="status" data-testid="stock-storage-detail-empty">
          <p className="stock-storage-center-empty-title">No products in this storage.</p>
          <p className="stock-storage-center-empty-copy">
            {parsAvailable
              ? 'Products appear here when they have a balance or a per-shelf par in this location.'
              : 'Products appear here when they have a balance in this location.'}
          </p>
        </div>
      ) : null}

      {status === 'ready' && visibleProducts.length === 0 ? (
        <div className="stock-storage-center-state" role="status" data-testid="stock-storage-detail-no-matches">
          {belowParOnly ? 'No products are below par on this shelf.' : 'No products match this search.'}
        </div>
      ) : null}

      {status === 'ready' && visibleProducts.length > 0 ? (
        <div
          className="stock-storage-product-list"
          role="list"
          data-testid="stock-storage-product-list"
          ref={listRef}
        >
          {visibleProducts.map((row) => (
            <div key={row.stockItemId} role="listitem">
              <StorageProductRow
                row={row}
                canManage={canManage}
                showPar={parsAvailable}
                parBusy={parBusy}
                menuOpen={openMenuItemId === row.stockItemId}
                onOpenDetails={handleOpenDetails}
                onToggleMenu={(next) => {
                  setOpenMenuItemId((current) => (
                    current === next.stockItemId ? null : next.stockItemId
                  ))
                }}
                onMenuAction={handleMenuAction}
                onCommitPar={handleCommitPar}
              />
            </div>
          ))}
        </div>
      ) : null}

      {historyItem ? (
        <StockProductHistoryDrawer
          item={historyItem}
          workspaceId={workspaceId}
          canManage={false}
          showCost={canManage}
          onClose={() => setHistoryItem(null)}
        />
      ) : null}

      {receivePickerOpen ? (
        <StockStorageReceiveProductPicker
          storage={storage}
          products={payload?.products ?? []}
          onClose={() => setReceivePickerOpen(false)}
          onSelectProduct={handleReceiveProductSelected}
        />
      ) : null}

      {receiveRow ? (
        <StockMovementModal
          item={receiveRow.item}
          movementType="receive"
          isSaving={isSavingReceive}
          destinationStorage={storage}
          destinationLocked
          expectedQuantityVersion={receiveRow.quantityVersion}
          onClose={() => setReceiveRow(null)}
          onSubmit={handleRecordReceiveSubmit}
        />
      ) : null}

      {transferPickerOpen ? (
        <StockStorageReceiveProductPicker
          storage={storage}
          products={payload?.products ?? []}
          title="Transfer stock"
          subtitlePrefix="Source"
          testId="stock-storage-transfer-product-picker"
          onClose={() => setTransferPickerOpen(false)}
          onSelectProduct={handleTransferProductSelected}
        />
      ) : null}

      {transferRow ? (
        <StockTransferModal
          item={transferRow.item}
          sourceStorage={storage}
          sourceQuantity={transferRow.quantity}
          sourceQuantityVersion={transferRow.quantityVersion}
          workspaceId={workspaceId}
          isSaving={isSavingTransfer}
          onClose={() => setTransferRow(null)}
          onSubmit={handleRecordTransferSubmit}
        />
      ) : null}

      {adjustmentPickerOpen ? (
        <StockStorageReceiveProductPicker
          storage={storage}
          products={payload?.products ?? []}
          title="Adjust stock"
          subtitlePrefix="Storage"
          testId="stock-storage-adjustment-product-picker"
          onClose={() => setAdjustmentPickerOpen(false)}
          onSelectProduct={handleAdjustmentProductSelected}
        />
      ) : null}

      {adjustmentRow ? (
        <StockMovementModal
          item={adjustmentRow.item}
          movementType="adjustment"
          isSaving={isSavingAdjustment}
          destinationStorage={storage}
          destinationLocked
          requireAdjustmentReason
          balanceQuantity={adjustmentRow.quantity}
          expectedQuantityVersion={adjustmentRow.quantityVersion}
          onClose={() => setAdjustmentRow(null)}
          onSubmit={handleRecordAdjustmentSubmit}
        />
      ) : null}

      {placeholder ? (
        <StockStorageActionPlaceholder
          actionId={placeholder.actionId}
          storageName={storageTitle}
          productName={placeholder.productName}
          onClose={() => setPlaceholder(null)}
        />
      ) : null}
    </section>
  )
}
