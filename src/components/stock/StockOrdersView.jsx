import { useEffect, useMemo, useRef, useState } from 'react'
import {
  filterStockOrders,
  getStockOrdersEmptyState,
  sortStockOrders,
  STOCK_ORDER_SORT_OPTIONS,
  STOCK_ORDER_STATUS_FILTERS,
} from '../../lib/stockOrderBrowse'
import {
  formatStockOrderDate,
  formatStockOrderDeliveryDate,
  formatStockOrderNumber,
  getStockOrderStatusLabel,
  getStockOrderStatusTone,
  isOrderPartiallyReceived,
} from '../../lib/stockOrderUtils'
import { formatStockPurchasePrice } from '../../lib/stockUtils'
import { StockCreateOrderModal } from './StockCreateOrderModal'
import { StockOrderDetailDrawer } from './StockOrderDetailDrawer'

function StockOrderSortDropdown({ value, options, onChange }) {
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef(null)
  const selectedOption = options.find((option) => option.id === value) ?? options[0]

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown, { passive: true })
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
    }
  }, [])

  return (
    <div className={`stock-sort-dropdown${isOpen ? ' is-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="stock-sort-dropdown-trigger"
        onClick={() => setIsOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Sort orders"
      >
        <span className="stock-sort-dropdown-value">{selectedOption?.label}</span>
        <span className="stock-sort-dropdown-chevron" aria-hidden="true">▾</span>
      </button>

      {isOpen ? (
        <ul className="stock-sort-dropdown-menu" role="listbox" aria-label="Sort options">
          {options.map((option) => (
            <li key={option.id} role="presentation">
              <button
                type="button"
                role="option"
                className={`stock-sort-dropdown-option${option.id === value ? ' is-selected' : ''}`}
                aria-selected={option.id === value}
                onClick={() => {
                  onChange(option.id)
                  setIsOpen(false)
                }}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function StockOrderCard({ order, onOpen }) {
  const statusTone = getStockOrderStatusTone(order.status)
  const itemCount = order.items?.length ?? 0
  const deliveryLabel = formatStockOrderDeliveryDate(order.expectedDeliveryDate)
  const showPartialBadge = isOrderPartiallyReceived(order)

  return (
    <button
      type="button"
      className="stock-order-card panel staff-panel"
      onClick={() => onOpen(order)}
    >
      <div className="stock-order-card-top">
        <div className="stock-order-card-heading">
          <span className="stock-order-card-number">
            {formatStockOrderNumber(order.orderNumber)}
          </span>
          <strong className="stock-order-card-supplier">{order.supplier || '—'}</strong>
        </div>
        <div className="stock-order-card-badges">
          {showPartialBadge ? (
            <span className="stock-order-status-badge tone-info">Partial</span>
          ) : null}
          <span className={`stock-order-status-badge tone-${statusTone}`}>
            {getStockOrderStatusLabel(order.status)}
          </span>
        </div>
      </div>

      <div className="stock-order-card-stats">
        <div className="stock-order-card-stat">
          <span className="stock-order-card-stat-label">Products</span>
          <span className="stock-order-card-stat-value">{itemCount}</span>
        </div>
        <div className="stock-order-card-stat">
          <span className="stock-order-card-stat-label">Est. total</span>
          <span className="stock-order-card-stat-value stock-order-card-stat-value-gold">
            {formatStockPurchasePrice(order.totalCost)}
          </span>
        </div>
      </div>

      <div className="stock-order-card-footer-meta">
        <p className="stock-order-card-created">
          <span>{order.createdByName || 'System'}</span>
          <span aria-hidden="true">·</span>
          <span>{formatStockOrderDate(order.createdAt)}</span>
        </p>
        {deliveryLabel ? (
          <p className="stock-order-card-delivery">
            Expected {deliveryLabel}
          </p>
        ) : null}
      </div>
    </button>
  )
}

export function StockOrdersView({
  orders = [],
  stockItems = [],
  isLoading = false,
  noticeMessage = '',
  searchTerm = '',
  canManage = false,
  isSaving = false,
  isWorkspaceReady = false,
  onCreateOrders,
  onSaveDraft,
  onMarkSent,
  onReceiveOrder,
  onCancelOrder,
}) {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortKey, setSortKey] = useState('newest')
  const [localSearchTerm, setLocalSearchTerm] = useState('')

  const effectiveSearchTerm = `${searchTerm || localSearchTerm}`.trim()

  const filteredOrders = useMemo(() => {
    return filterStockOrders(orders, {
      statusFilter,
      searchTerm: effectiveSearchTerm,
    })
  }, [orders, statusFilter, effectiveSearchTerm])

  const visibleOrders = useMemo(() => {
    return sortStockOrders(filteredOrders, sortKey)
  }, [filteredOrders, sortKey])

  const selectedOrderRecord = useMemo(() => {
    if (!selectedOrder) return null
    return orders.find((order) => order.id === selectedOrder.id) ?? selectedOrder
  }, [orders, selectedOrder])

  const emptyState = useMemo(() => {
    return getStockOrdersEmptyState(statusFilter, orders.length > 0)
  }, [statusFilter, orders.length])

  const handleCreateOrders = async (groups) => {
    if (isSaving) return
    await onCreateOrders(groups)
    setIsCreateModalOpen(false)
  }

  const isActionBusy = isSaving || isLoading

  return (
    <section className="stock-orders-page" aria-label="Stock orders">
      {noticeMessage ? <div className="staff-status-banner">{noticeMessage}</div> : null}
      {isLoading ? <div className="staff-status-banner">Loading orders…</div> : null}

      <div className="stock-orders-toolbar">
        <p className="stock-orders-toolbar-copy">
          Track supplier orders from draft through receiving.
        </p>
        {canManage ? (
          <button
            type="button"
            className="primary-btn stock-create-order-btn"
            onClick={() => setIsCreateModalOpen(true)}
            disabled={!isWorkspaceReady || isActionBusy}
          >
            {isSaving ? 'Creating…' : 'Create order'}
          </button>
        ) : null}
      </div>

      <div className="stock-orders-browse">
        <div className="stock-filter-group stock-filter-group-status">
          <span className="stock-filter-group-label">Status</span>
          <div className="stock-status-filters" role="tablist" aria-label="Order status">
            {STOCK_ORDER_STATUS_FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                role="tab"
                aria-selected={statusFilter === filter.id}
                className={`stock-status-filter${statusFilter === filter.id ? ' active' : ''}`}
                onClick={() => setStatusFilter(filter.id)}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <div className="stock-orders-browse-tools">
          <label className="stock-orders-search">
            <span className="sr-only">Search orders</span>
            <input
              type="search"
              className="stock-orders-search-input"
              value={localSearchTerm}
              onChange={(event) => setLocalSearchTerm(event.target.value)}
              placeholder="Search order #, supplier, product, creator…"
            />
          </label>

          <div className="stock-browse-control stock-browse-sort">
            <span className="stock-browse-control-label">Sort</span>
            <StockOrderSortDropdown
              value={sortKey}
              options={STOCK_ORDER_SORT_OPTIONS}
              onChange={setSortKey}
            />
          </div>
        </div>

        {!isLoading && orders.length > 0 ? (
          <p className="stock-browse-result-count" aria-live="polite">
            Showing {visibleOrders.length} of {orders.length} order{orders.length === 1 ? '' : 's'}
          </p>
        ) : null}
      </div>

      {!isLoading && visibleOrders.length === 0 ? (
        <div className="stock-empty-state panel staff-panel stock-orders-empty">
          <h4>{emptyState.title}</h4>
          <p>{emptyState.description}</p>
          {canManage && emptyState.showCreate ? (
            <button
              type="button"
              className="primary-btn"
              onClick={() => setIsCreateModalOpen(true)}
              disabled={!isWorkspaceReady || isActionBusy}
            >
              {isSaving ? 'Creating…' : 'Create order'}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="stock-orders-grid">
          {visibleOrders.map((order) => (
            <StockOrderCard
              key={order.id}
              order={order}
              onOpen={setSelectedOrder}
            />
          ))}
        </div>
      )}

      {isCreateModalOpen ? (
        <StockCreateOrderModal
          stockItems={stockItems}
          onClose={() => setIsCreateModalOpen(false)}
          onSubmit={handleCreateOrders}
          isSaving={isSaving}
        />
      ) : null}

      {selectedOrderRecord ? (
        <StockOrderDetailDrawer
          order={selectedOrderRecord}
          onClose={() => setSelectedOrder(null)}
          canManage={canManage}
          isSaving={isSaving}
          onSaveDraft={(payload) => onSaveDraft(selectedOrderRecord.id, payload)}
          onMarkSent={() => onMarkSent(selectedOrderRecord.id)}
          onReceiveOrder={(payload) => onReceiveOrder(selectedOrderRecord.id, {
            ...payload,
            orderNumber: selectedOrderRecord.orderNumber,
          })}
          onCancel={() => onCancelOrder(selectedOrderRecord.id)}
        />
      ) : null}
    </section>
  )
}
