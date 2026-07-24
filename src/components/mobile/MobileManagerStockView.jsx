import { useMemo, useState } from 'react'
import {
  filterStockDashboardItems,
  sortStockDashboardItems,
} from '../../lib/stockDashboardBrowse'
import { getStockDashboardEmptyState } from '../../lib/stockInsights'
import {
  buildSupplierOrderGroups,
  buildSuggestedOrderLine,
  computeOrderLineTotal,
} from '../../lib/stockOrderUtils'
import {
  getStockCategoryFilters,
  getStockStatusShortLabel,
} from '../../lib/stockUtils'
import { StockCreateOrderModal } from '../stock/StockCreateOrderModal'

function formatHumanQuantityValue(value) {
  const quantity = Number(value)
  if (!Number.isFinite(quantity)) return '0'
  return Number.isInteger(quantity)
    ? String(quantity)
    : quantity.toFixed(2).replace(/\.?0+$/, '')
}

function formatHumanUnitLabel(unit, quantity) {
  const normalized = `${unit ?? ''}`.trim().toLowerCase()
  if (!normalized) {
    return quantity === 1 ? 'unit' : 'units'
  }

  const base = normalized.split(/\s+/)[0]
  if (quantity === 1) return base
  if (base.endsWith('s')) return base
  return `${base}s`
}

function buildMobileOrderGroupsForItem(item) {
  const line = buildSuggestedOrderLine(item)
  const quantity = line.quantity > 0 ? line.quantity : 1
  const supplier = `${item.supplier ?? ''}`.trim() || 'Unassigned supplier'

  return [{
    supplier,
    items: [{
      ...line,
      quantity,
      totalPrice: computeOrderLineTotal(quantity, line.costPrice),
    }],
    notes: '',
    expectedDeliveryDate: '',
  }]
}

function MobileManagerStockItemCard({
  item,
  canManageStock,
  isWorkspaceReady,
  onAddToOrder,
}) {
  const supplierLabel = `${item.supplier ?? ''}`.trim()
  const categoryLabel = `${item.category ?? ''}`.trim() || 'Uncategorized'
  const currentQuantity = Number(item.currentQuantity) || 0
  const minimumQuantity = Number(item.minimumQuantity) || 0
  const statusLabel = getStockStatusShortLabel(item.status).toUpperCase()
  const showAddToOrder = (item.status === 'low' || item.status === 'out') && canManageStock

  return (
    <article className={`mobile-manager-stock-card tone-${item.status}`}>
      <header className="mobile-manager-stock-card-header">
        <div className="mobile-manager-stock-card-title-wrap">
          <h3 className="mobile-manager-stock-card-name">{item.name}</h3>
          <p className="mobile-manager-stock-card-category">{categoryLabel}</p>
        </div>
        <span className={`mobile-manager-stock-status-pill tone-${item.status}`}>
          {statusLabel}
        </span>
      </header>

      <div className="mobile-manager-stock-card-qty-grid">
        <div className="mobile-manager-stock-card-qty-block">
          <span className="mobile-manager-stock-card-qty-label">Current</span>
          <p className={`mobile-manager-stock-card-qty-line tone-${item.status}`}>
            <span className="mobile-manager-stock-card-qty-value">
              {formatHumanQuantityValue(currentQuantity)}
            </span>
            <span className="mobile-manager-stock-card-qty-unit">
              {formatHumanUnitLabel(item.unit, currentQuantity)}
            </span>
          </p>
        </div>
        <div className="mobile-manager-stock-card-qty-block">
          <span className="mobile-manager-stock-card-qty-label">Minimum</span>
          <p className="mobile-manager-stock-card-qty-line">
            <span className="mobile-manager-stock-card-qty-value">
              {formatHumanQuantityValue(minimumQuantity)}
            </span>
            <span className="mobile-manager-stock-card-qty-unit">
              {formatHumanUnitLabel(item.unit, minimumQuantity)}
            </span>
          </p>
        </div>
      </div>

      {supplierLabel ? (
        <div className="mobile-manager-stock-card-supplier">
          <span className="mobile-manager-stock-card-supplier-label">Supplier</span>
          <span className="mobile-manager-stock-card-supplier-name">{supplierLabel}</span>
        </div>
      ) : null}

      {showAddToOrder ? (
        <button
          type="button"
          className="mobile-manager-stock-card-order-btn"
          onClick={() => onAddToOrder?.(item)}
          disabled={!isWorkspaceReady}
        >
          Add to order
        </button>
      ) : null}
    </article>
  )
}

function MobileManagerStockEmptyState({ title, message }) {
  return (
    <div className="mobile-manager-stock-empty" role="status">
      <p className="mobile-manager-stock-empty-title">{title}</p>
      <p className="mobile-manager-stock-empty-message">{message}</p>
    </div>
  )
}

function MobileStockPendingOrdersBanner({
  stockOrdersSummary = null,
  canManageStock = false,
  onReceiveDeliveries,
  onOpenOrders,
}) {
  const pendingCount = Number(stockOrdersSummary?.pendingCount) || 0
  const awaitingCount = Number(stockOrdersSummary?.awaitingDeliveryCount) || 0
  const partialCount = Number(stockOrdersSummary?.partialCount) || 0
  const draftCount = Number(stockOrdersSummary?.draftCount) || 0

  if (pendingCount === 0) return null

  let message = ''
  if (awaitingCount > 0 && partialCount > 0) {
    message = `${awaitingCount} awaiting delivery · ${partialCount} partial`
  } else if (awaitingCount > 0) {
    message = awaitingCount === 1 ? '1 delivery awaiting receipt' : `${awaitingCount} deliveries awaiting receipt`
  } else if (partialCount > 0) {
    message = partialCount === 1 ? '1 partial order open' : `${partialCount} partial orders open`
  } else if (draftCount > 0) {
    message = draftCount === 1 ? '1 draft order to review' : `${draftCount} draft orders to review`
  }

  return (
    <section className="mobile-manager-stock-pending-banner" aria-label="Pending orders">
      <div className="mobile-manager-stock-pending-copy">
        <p className="mobile-manager-stock-pending-title">Orders need attention</p>
        {message ? <p className="mobile-manager-stock-pending-message">{message}</p> : null}
      </div>
      <div className="mobile-manager-stock-pending-actions">
        {canManageStock && awaitingCount > 0 ? (
          <button
            type="button"
            className="mobile-manager-stock-pending-btn mobile-manager-stock-pending-btn-primary"
            onClick={onReceiveDeliveries}
          >
            Receive
          </button>
        ) : null}
        <button
          type="button"
          className="mobile-manager-stock-pending-btn"
          onClick={onOpenOrders}
        >
          View orders
        </button>
      </div>
    </section>
  )
}

export function MobileManagerStockView({
  stockItems = [],
  stockSummary = null,
  stockOrdersSummary = null,
  isLoading = false,
  catalogLoadFailed = false,
  onRetryCatalogLoad,
  canManageStock = false,
  isWorkspaceReady = false,
  isSavingOrders = false,
  onCreateOrders,
  onCountStock,
  onOpenOrders,
  onReceiveDeliveries,
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [orderModalGroups, setOrderModalGroups] = useState(null)

  const totalItems = Number(stockSummary?.totalItems) || 0
  const lowCount = Number(stockSummary?.lowStock) || 0
  const outCount = Number(stockSummary?.outOfStock) || 0
  const toOrderCount = Number(stockSummary?.toOrder) || 0
  const pendingOrders = Number(stockOrdersSummary?.pendingCount) || 0

  const categoryFilters = useMemo(() => getStockCategoryFilters(stockItems), [stockItems])

  const visibleItems = useMemo(() => {
    const filtered = filterStockDashboardItems(stockItems, {
      categoryFilter,
      statusFilter,
      searchTerm,
    })
    return sortStockDashboardItems(filtered, 'low-first')
  }, [stockItems, categoryFilter, statusFilter, searchTerm])

  const hasNoItems = stockItems.length === 0
  const hasNoMatches = !hasNoItems && visibleItems.length === 0

  const emptyState = useMemo(() => {
    // P8.17.1 — Never treat a failed load as a successful empty catalog.
    if (catalogLoadFailed) return null

    const base = getStockDashboardEmptyState({
      hasNoItems,
      hasNoMatches,
      statusFilter,
      canManage: canManageStock,
    })

    if (!base) return null

    if (statusFilter === 'low' && hasNoMatches) {
      return {
        ...base,
        message: 'Everything looks good',
      }
    }

    if (statusFilter === 'out' && hasNoMatches) {
      return {
        ...base,
        message: 'Everything looks good',
      }
    }

    return base
  }, [catalogLoadFailed, hasNoItems, hasNoMatches, statusFilter, canManageStock])

  const handleStatusChip = (nextStatus) => {
    setStatusFilter(nextStatus)
    if (nextStatus !== 'all') {
      setCategoryFilter('All')
    }
  }

  const handleCategoryChip = (nextCategory) => {
    setCategoryFilter(nextCategory)
    if (nextCategory !== 'All') {
      setStatusFilter('all')
    }
  }

  const openCreateOrderModal = () => {
    const groups = buildSupplierOrderGroups(stockItems)
      .filter((group) => Array.isArray(group?.items) && group.items.length > 0)
      .map((group) => ({
        ...group,
        notes: '',
        expectedDeliveryDate: '',
      }))

    setOrderModalGroups(groups)
  }

  const handleAddItemToOrder = (item) => {
    setOrderModalGroups(buildMobileOrderGroupsForItem(item))
  }

  const handleCloseOrderModal = () => {
    if (isSavingOrders) return
    setOrderModalGroups(null)
  }

  const handleSubmitOrderModal = async (groups) => {
    await onCreateOrders?.(groups)
    setOrderModalGroups(null)
  }

  return (
    <div className="mobile-screen mobile-manager-stock mobile-manager-stock-inventory">
      <header className="mobile-manager-stock-command" aria-label="Stock overview">
        <h1 className="mobile-manager-stock-command-title">Stock</h1>
        <p className="mobile-manager-stock-command-stats">
          <span>
            <strong>{isLoading ? '—' : totalItems}</strong> items
          </span>
          <span aria-hidden="true">·</span>
          <span className={lowCount > 0 ? 'tone-warning' : ''}>
            <strong>{isLoading ? '—' : lowCount}</strong> low
          </span>
          <span aria-hidden="true">·</span>
          <span className={outCount > 0 ? 'tone-danger' : ''}>
            <strong>{isLoading ? '—' : outCount}</strong> out
          </span>
          <span aria-hidden="true">·</span>
          <span className={toOrderCount > 0 ? 'tone-warning' : ''}>
            <strong>{isLoading ? '—' : toOrderCount}</strong> to order
          </span>
          {pendingOrders > 0 ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="tone-info">
                <strong>{isLoading ? '—' : pendingOrders}</strong> pending
              </span>
            </>
          ) : null}
        </p>
      </header>

      {!isLoading && pendingOrders > 0 ? (
        <MobileStockPendingOrdersBanner
          stockOrdersSummary={stockOrdersSummary}
          canManageStock={canManageStock}
          onReceiveDeliveries={onReceiveDeliveries}
          onOpenOrders={onOpenOrders}
        />
      ) : null}

      <div className="mobile-manager-stock-sticky-tools">
        <label className="mobile-manager-stock-search">
          <span className="sr-only">Search stock items</span>
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search stock item..."
            autoComplete="off"
            enterKeyHint="search"
          />
        </label>

        <div className="mobile-manager-stock-filters">
          <div className="mobile-manager-stock-chip-scroll" role="tablist" aria-label="Stock filters">
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === 'all' && categoryFilter === 'All'}
            className={`mobile-manager-stock-chip${statusFilter === 'all' && categoryFilter === 'All' ? ' is-active' : ''}`}
            onClick={() => {
              setStatusFilter('all')
              setCategoryFilter('All')
            }}
          >
            All
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === 'low'}
            className={`mobile-manager-stock-chip${statusFilter === 'low' ? ' is-active' : ''}`}
            onClick={() => handleStatusChip('low')}
          >
            Low
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === 'out'}
            className={`mobile-manager-stock-chip${statusFilter === 'out' ? ' is-active' : ''}`}
            onClick={() => handleStatusChip('out')}
          >
            Out
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === 'order'}
            className={`mobile-manager-stock-chip${statusFilter === 'order' ? ' is-active' : ''}`}
            onClick={() => handleStatusChip('order')}
          >
            To order
          </button>
          {categoryFilters
            .filter((category) => category !== 'All')
            .map((category) => (
              <button
                key={category}
                type="button"
                role="tab"
                aria-selected={categoryFilter === category}
                className={`mobile-manager-stock-chip${categoryFilter === category ? ' is-active' : ''}`}
                onClick={() => handleCategoryChip(category)}
              >
                {category}
              </button>
            ))}
        </div>
      </div>
      </div>

      <div className="mobile-manager-stock-scroll-body">
      {isLoading ? (
        <p className="mobile-manager-stock-loading">Loading stock…</p>
      ) : catalogLoadFailed ? (
        <div className="mobile-manager-stock-empty stock-catalog-load-failed" role="alert">
          <p className="mobile-manager-stock-empty-title">Stock couldn&apos;t be loaded</p>
          <p className="mobile-manager-stock-empty-message">Check your connection and try again.</p>
          <button
            type="button"
            className="primary-btn"
            onClick={() => onRetryCatalogLoad?.()}
            disabled={typeof onRetryCatalogLoad !== 'function'}
          >
            Retry
          </button>
        </div>
      ) : emptyState ? (
        <MobileManagerStockEmptyState title={emptyState.title} message={emptyState.message} />
      ) : (
        <ul className="mobile-manager-stock-list">
          {visibleItems.map((item) => (
            <li key={item.id}>
              <MobileManagerStockItemCard
                item={item}
                canManageStock={canManageStock}
                isWorkspaceReady={isWorkspaceReady}
                onAddToOrder={handleAddItemToOrder}
              />
            </li>
          ))}
        </ul>
      )}
      </div>

      {canManageStock ? (
        <section className="mobile-manager-stock-action-bar" aria-label="Stock quick actions">
          <button
            type="button"
            className="mobile-manager-stock-quick-btn"
            onClick={onCountStock}
            disabled={!isWorkspaceReady}
          >
            Count stock
          </button>
          <button
            type="button"
            className="mobile-manager-stock-quick-btn mobile-manager-stock-quick-btn-primary"
            onClick={openCreateOrderModal}
            disabled={!isWorkspaceReady}
          >
            Create order
          </button>
        </section>
      ) : null}

      {orderModalGroups ? (
        <StockCreateOrderModal
          stockItems={stockItems}
          initialGroups={orderModalGroups}
          onClose={handleCloseOrderModal}
          onSubmit={handleSubmitOrderModal}
          isSaving={isSavingOrders}
        />
      ) : null}
    </div>
  )
}
