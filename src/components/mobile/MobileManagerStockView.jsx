import { useEffect, useMemo, useState } from 'react'
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
import { formatInventoryUnit } from '../../lib/inventoryUnitDisplay'
import { formatProductSizeDetail } from '../../lib/stockProductIdentity'

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
  onOpen,
}) {
  const currentQuantity = Number(item.currentQuantity) || 0
  const statusLabel = getStockStatusShortLabel(item.status)
  const sizeDetail = formatProductSizeDetail(item, item.name)

  return (
    <button
      type="button"
      className={`mobile-manager-stock-card mobile-manager-stock-row tone-${item.status}`}
      onClick={() => onOpen?.(item)}
    >
      <span className="mobile-manager-stock-card-name">
        {item.name}
        {sizeDetail ? <span className="stock-item-size-detail">{sizeDetail}</span> : null}
      </span>
      <span className={`mobile-manager-stock-row-qty tone-${item.status}`}>
        {formatInventoryUnit(currentQuantity, item.unit)}
      </span>
      <span className={`mobile-manager-stock-status-pill tone-${item.status}`}>
        {statusLabel}
      </span>
    </button>
  )
}

function MobileStockDetailSheet({
  item,
  canManageStock,
  isWorkspaceReady,
  onClose,
  onAddToOrder,
}) {
  useEffect(() => {
    if (!item) return undefined
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose?.()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [item, onClose])

  if (!item) return null
  const supplierLabel = `${item.supplier ?? ''}`.trim()
  const categoryLabel = `${item.category ?? ''}`.trim() || 'Uncategorized'
  const currentQuantity = Number(item.currentQuantity) || 0
  const minimumQuantity = Number(item.minimumQuantity) || 0
  const showAddToOrder = (item.status === 'low' || item.status === 'out') && canManageStock

  return (
    <div className="mobile-stock-detail-sheet" role="presentation">
      <button type="button" className="mobile-stock-detail-backdrop" aria-label="Close product" onClick={onClose} />
      <section className="mobile-stock-detail-card" role="dialog" aria-modal="true" aria-labelledby="mobile-stock-detail-title">
        <header className="mobile-stock-detail-header">
          <div>
            <h2 id="mobile-stock-detail-title">{item.name}</h2>
            {formatProductSizeDetail(item, item.name) ? (
              <p className="stock-item-size-detail">{formatProductSizeDetail(item, item.name)}</p>
            ) : null}
            <p>{categoryLabel}</p>
          </div>
          <button type="button" className="ghost-btn" onClick={onClose}>Close</button>
        </header>
        <dl>
          <div>
            <dt>On hand</dt>
            <dd>{formatInventoryUnit(currentQuantity, item.unit)}</dd>
          </div>
          <div>
            <dt>Minimum</dt>
            <dd>{formatInventoryUnit(minimumQuantity, item.unit)}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{getStockStatusShortLabel(item.status)}</dd>
          </div>
          {supplierLabel ? (
            <div>
              <dt>Supplier</dt>
              <dd>{supplierLabel}</dd>
            </div>
          ) : null}
        </dl>
        {showAddToOrder ? (
          <button
            type="button"
            className="primary-btn"
            onClick={() => onAddToOrder?.(item)}
            disabled={!isWorkspaceReady}
          >
            Add to order
          </button>
        ) : null}
      </section>
    </div>
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
    message = draftCount === 1 ? '1 order to review' : `${draftCount} orders to review`
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
            Receive delivery
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
  isPreparingDrafts = false,
  onCreateOrders,
  onPrepareDrafts,
  onCountStock,
  onOpenOrders,
  onReceiveDeliveries,
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [orderModalGroups, setOrderModalGroups] = useState(null)
  const [detailItem, setDetailItem] = useState(null)

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

  const quickActions = canManageStock ? (
    <section className="mobile-manager-stock-action-bar is-compact" aria-label="Stock quick actions">
      <button
        type="button"
        className="mobile-manager-stock-quick-btn"
        onClick={onCountStock}
        data-help="stock.count-now"
        disabled={!isWorkspaceReady}
      >
        Count
      </button>
      {onPrepareDrafts ? (
        <button
          type="button"
          className="mobile-manager-stock-quick-btn mobile-manager-stock-quick-btn-primary"
          onClick={() => { void onPrepareDrafts() }}
          disabled={!isWorkspaceReady || isSavingOrders || isPreparingDrafts}
          aria-busy={isPreparingDrafts || undefined}
          data-help="stock.suggest"
        >
          {isPreparingDrafts ? 'Preparing…' : (isSavingOrders ? 'Saving…' : (
            <>
              <span className="mobile-manager-stock-quick-label-full">Suggest order</span>
              <span className="mobile-manager-stock-quick-label-short">Suggest</span>
            </>
          ))}
        </button>
      ) : null}
      <button
        type="button"
        className="mobile-manager-stock-quick-btn"
        onClick={openCreateOrderModal}
        data-help="stock.create-order"
        disabled={!isWorkspaceReady}
      >
        Create order
      </button>
    </section>
  ) : null

  return (
    <div className={`mobile-screen mobile-manager-stock mobile-manager-stock-inventory${detailItem ? ' is-detail-open' : ''}`}>
      <div className="mobile-manager-stock-top">
      <header className="mobile-manager-stock-command" aria-label="Stock overview">
        <h1 className="mobile-manager-stock-command-title">Stock</h1>
        <p className="mobile-manager-stock-command-stats">
          <span>
            <strong>{isLoading ? '0' : totalItems}</strong> items
          </span>
          <span aria-hidden="true">·</span>
          <span className={lowCount > 0 ? 'tone-warning' : ''}>
            <strong>{isLoading ? '0' : lowCount}</strong> low
          </span>
          <span aria-hidden="true">·</span>
          <span className={outCount > 0 ? 'tone-danger' : ''}>
            <strong>{isLoading ? '0' : outCount}</strong> out
          </span>
          <span aria-hidden="true">·</span>
          <span className={toOrderCount > 0 ? 'tone-warning' : ''}>
            <strong>{isLoading ? '0' : toOrderCount}</strong> to order
          </span>
          {pendingOrders > 0 ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="tone-info">
                <strong>{isLoading ? '0' : pendingOrders}</strong> pending
              </span>
            </>
          ) : null}
        </p>
      </header>
      {quickActions}
      </div>

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

      <div className="mobile-manager-stock-stage">
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
                onOpen={setDetailItem}
              />
            </li>
          ))}
        </ul>
      )}
      </div>

      {detailItem ? (
        <MobileStockDetailSheet
          item={detailItem}
          canManageStock={canManageStock}
          isWorkspaceReady={isWorkspaceReady}
          onClose={() => setDetailItem(null)}
          onAddToOrder={(item) => {
            setDetailItem(null)
            handleAddItemToOrder(item)
          }}
        />
      ) : null}
      </div>

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
