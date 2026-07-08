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

export function MobileManagerStockView({
  stockItems = [],
  stockSummary = null,
  stockOrdersSummary = null,
  isLoading = false,
  canManageStock = false,
  isWorkspaceReady = false,
  isSavingOrders = false,
  onCreateOrders,
  onCountStock,
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [orderModalGroups, setOrderModalGroups] = useState(null)

  const totalItems = Number(stockSummary?.totalItems) || 0
  const lowCount = Number(stockSummary?.lowStock) || 0
  const draftCount = Number(stockOrdersSummary?.draftCount) || 0

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
    const base = getStockDashboardEmptyState({
      hasNoItems,
      hasNoMatches,
      statusFilter,
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
  }, [hasNoItems, hasNoMatches, statusFilter])

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
          <span>
            <strong>{isLoading ? '—' : lowCount}</strong> low
          </span>
          <span aria-hidden="true">·</span>
          <span className={draftCount > 0 ? 'tone-warning' : ''}>
            <strong>{isLoading ? '—' : draftCount}</strong> draft{draftCount === 1 ? '' : 's'}
          </span>
        </p>
      </header>

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

      <section className="mobile-manager-stock-action-bar" aria-label="Stock quick actions">
        <button
          type="button"
          className="mobile-manager-stock-quick-btn"
          onClick={onCountStock}
          disabled={!canManageStock || !isWorkspaceReady}
        >
          Count stock
        </button>
        <button
          type="button"
          className="mobile-manager-stock-quick-btn mobile-manager-stock-quick-btn-primary"
          onClick={openCreateOrderModal}
          disabled={!canManageStock || !isWorkspaceReady}
        >
          Create order
        </button>
      </section>

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
