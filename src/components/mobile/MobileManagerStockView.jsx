import { useMemo, useState } from 'react'
import {
  filterStockDashboardItems,
  sortStockDashboardItems,
} from '../../lib/stockDashboardBrowse'
import { getStockDashboardEmptyState } from '../../lib/stockInsights'
import {
  formatStockQuantity,
  getStockCategoryFilters,
  getStockStatusShortLabel,
} from '../../lib/stockUtils'

function formatQuantityParts(value, unit = '') {
  const formatted = formatStockQuantity(value, unit)
  const normalizedUnit = `${unit ?? ''}`.trim()

  if (!normalizedUnit) {
    return { amount: formatted, unit: '' }
  }

  const amount = formatted.replace(new RegExp(`\\s*${normalizedUnit}$`), '')
  return { amount, unit: normalizedUnit }
}

function MobileManagerStockItemCard({ item }) {
  const supplierLabel = `${item.supplier ?? ''}`.trim()
  const categoryLabel = `${item.category ?? ''}`.trim() || 'Uncategorized'
  const current = formatQuantityParts(item.currentQuantity, item.unit)
  const minimum = formatQuantityParts(item.minimumQuantity, item.unit)
  const statusLabel = getStockStatusShortLabel(item.status).toUpperCase()

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

      <div className="mobile-manager-stock-card-qty-row">
        <div className="mobile-manager-stock-card-qty">
          <span className="mobile-manager-stock-card-qty-value">{current.amount}</span>
          {current.unit ? <span className="mobile-manager-stock-card-qty-unit">{current.unit}</span> : null}
        </div>
        <div className="mobile-manager-stock-card-min">
          <span className="mobile-manager-stock-card-min-label">Min</span>
          <span className="mobile-manager-stock-card-min-value">
            {minimum.amount}
            {minimum.unit ? ` ${minimum.unit}` : ''}
          </span>
        </div>
      </div>

      {supplierLabel ? (
        <p className="mobile-manager-stock-card-supplier">
          <span className="mobile-manager-stock-card-supplier-label">Supplier</span>
          <span>{supplierLabel}</span>
        </p>
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
  onCreateOrder,
  onCountStock,
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('All')

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

      {isLoading ? (
        <p className="mobile-manager-stock-loading">Loading stock…</p>
      ) : emptyState ? (
        <MobileManagerStockEmptyState title={emptyState.title} message={emptyState.message} />
      ) : (
        <ul className="mobile-manager-stock-list">
          {visibleItems.map((item) => (
            <li key={item.id}>
              <MobileManagerStockItemCard item={item} />
            </li>
          ))}
        </ul>
      )}

      <section className="mobile-manager-stock-quick-bar" aria-label="Stock quick actions">
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
          onClick={onCreateOrder}
          disabled={!canManageStock || !isWorkspaceReady}
        >
          Create order
        </button>
      </section>
    </div>
  )
}
