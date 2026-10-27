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
  formatMissingCostLineNote,
  formatStockOrderNumber,
  getStockOrderNextAction,
  resolveDisplayedOrderTotal,
  getStockOrderStatusLabel,
  getStockOrderStatusTone,
  isOrderPartiallyReceived,
  normalizeStockOrderStatus,
} from '../../lib/stockOrderUtils'
import { formatStockPurchasePrice } from '../../lib/stockUtils'
import { StockCreateOrderModal } from './StockCreateOrderModal'
import { StockOrderCleanupDialog } from './StockOrderCleanupDialog'
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

function StockOrderCard({ order, stockItems = [], onOpen, showCost = true, timeZone = '' }) {
  const status = normalizeStockOrderStatus(order.status)
  const statusTone = getStockOrderStatusTone(order.status)
  const nextAction = getStockOrderNextAction(order)
  const itemCount = order.items?.length ?? 0
  const estimate = resolveDisplayedOrderTotal(order, stockItems)
  const deliveryLabel = formatStockOrderDeliveryDate(order.expectedDeliveryDate, timeZone)
  const showPartialBadge = isOrderPartiallyReceived(order)
  const isActionable = status === 'draft' || status === 'sent'

  return (
    <button
      type="button"
      className={`stock-order-card panel staff-panel${isActionable ? ' is-actionable' : ''}${status === 'sent' ? ' is-awaiting-delivery' : ''}`}
      onClick={() => onOpen(order)}
    >
      <div className="stock-order-card-top">
        <div className="stock-order-card-heading">
          <span className="stock-order-card-number">
            {formatStockOrderNumber(order.orderNumber)}
          </span>
          <strong className="stock-order-card-supplier" title={order.supplier || undefined}>
            {order.supplier || '—'}
          </strong>
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

      {nextAction?.hint && isActionable ? (
        <p className={`stock-order-card-next-action tone-${nextAction.tone}`}>
          <span className="stock-order-card-next-action-label">Next:</span>
          {nextAction.hint}
        </p>
      ) : null}

      <div className="stock-order-card-stats">
        <div className="stock-order-card-stat">
          <span className="stock-order-card-stat-label">Products</span>
          <span className="stock-order-card-stat-value">{itemCount}</span>
        </div>
        {showCost ? (
          <div className="stock-order-card-stat">
            <span className="stock-order-card-stat-label">Est. total</span>
            <span className="stock-order-card-stat-value stock-order-card-stat-value-gold">
              {estimate.total > 0
                ? formatStockPurchasePrice(estimate.total)
                : 'No cost on file'}
            </span>
            {estimate.missingCostLines > 0 ? (
              <span className="stock-order-card-stat-label">
                {formatMissingCostLineNote(estimate.missingCostLines)}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="stock-order-card-footer-meta">
        <p className="stock-order-card-created">
          <span>{order.createdByName || 'System'}</span>
          <span aria-hidden="true">·</span>
          <span>{formatStockOrderDate(order.createdAt, timeZone)}</span>
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
  suppliers = [],
  venueName = '',
  senderName = '',
  isLoading = false,
  noticeMessage = '',
  searchTerm = '',
  canManage = false,
  isSaving = false,
  isPreparingDrafts = false,
  isWorkspaceReady = false,
  workspaceId = '',
  initialStatusFilter = null,
  onStatusFilterApplied,
  onCreateOrders,
  onPrepareDrafts,
  onSaveDraft,
  onMarkSent,
  onReceiveOrder,
  onCancelOrder,
  onOrdersChanged,
  timeZone = '',
}) {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isCleanupDialogOpen, setIsCleanupDialogOpen] = useState(false)
  const [ordersMenuOpen, setOrdersMenuOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortKey, setSortKey] = useState('newest')

  useEffect(() => {
    if (!initialStatusFilter) return
    setStatusFilter(initialStatusFilter)
    onStatusFilterApplied?.()
  }, [initialStatusFilter, onStatusFilterApplied])

  const effectiveSearchTerm = `${searchTerm}`.trim()

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

  const statusFilterCounts = useMemo(() => {
    const counts = { all: orders.length }

    STOCK_ORDER_STATUS_FILTERS.forEach((filter) => {
      if (filter.id === 'all') return
      counts[filter.id] = orders.filter(
        (order) => normalizeStockOrderStatus(order.status) === filter.id,
      ).length
    })

    return counts
  }, [orders])

  const handleCreateOrders = async (groups) => {
    if (isSaving) return
    await onCreateOrders(groups)
    setIsCreateModalOpen(false)
  }

  const isActionBusy = isSaving || isLoading || isPreparingDrafts

  return (
    <section className="stock-orders-page" aria-label="Stock orders">
      {noticeMessage ? <div className="staff-status-banner">{noticeMessage}</div> : null}

      <header className="stock-orders-header">
        <div className="stock-orders-header-copy">
          <h2 className="stock-orders-title">Orders</h2>
          <p className="stock-orders-toolbar-copy">
            Track supplier orders from draft through receiving.
          </p>
        </div>
        {canManage ? (
          <div className="stock-orders-toolbar-actions">
            <div className="stock-orders-overflow">
              <button
                type="button"
                className="ghost-btn"
                aria-expanded={ordersMenuOpen}
                aria-haspopup="menu"
                aria-label="Order actions"
                onClick={() => setOrdersMenuOpen((open) => !open)}
                disabled={!isWorkspaceReady || isActionBusy}
              >
                Order actions
              </button>
              {ordersMenuOpen ? (
                <div className="stock-orders-more-menu" role="menu">
                  <button
                    type="button"
                    className="ghost-btn danger-text stock-order-cleanup-open-btn"
                    role="menuitem"
                    onClick={() => {
                      setOrdersMenuOpen(false)
                      setIsCleanupDialogOpen(true)
                    }}
                    disabled={!isWorkspaceReady || isActionBusy || !workspaceId}
                  >
                    Delete orders
                  </button>
                </div>
              ) : null}
            </div>
            {onPrepareDrafts ? (
              <button
                type="button"
                className="primary-btn stock-prepare-drafts-btn"
                onClick={() => { void onPrepareDrafts() }}
                disabled={!isWorkspaceReady || isActionBusy}
              >
                {isPreparingDrafts ? 'Preparing…' : (isSaving ? 'Saving…' : 'Suggest order')}
              </button>
            ) : null}
            <button
              type="button"
              className="ghost-btn stock-create-order-btn"
              onClick={() => setIsCreateModalOpen(true)}
              disabled={!isWorkspaceReady || isActionBusy}
            >
              {isSaving ? 'Creating…' : 'Create order'}
            </button>
          </div>
        ) : null}
      </header>

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
                <span className="stock-status-filter-count">
                  {isLoading ? '—' : statusFilterCounts[filter.id] ?? 0}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="stock-orders-browse-tools">
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

      {isLoading ? (
        <div className="stock-orders-grid" aria-busy="true" aria-label="Loading orders">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="stock-list-skeleton-card panel staff-panel">
              <span className="stock-loading-skeleton-bar" />
              <span className="stock-loading-skeleton-bar is-short" />
              <span className="stock-loading-skeleton-bar" />
            </div>
          ))}
        </div>
      ) : visibleOrders.length === 0 ? (
        <div className="stock-empty-state panel staff-panel stock-orders-empty">
          <h4>{emptyState.title}</h4>
          <p>{emptyState.description}</p>
          {canManage && emptyState.showCreate ? (
            <div className="stock-orders-toolbar-actions">
              {onPrepareDrafts ? (
                <button
                  type="button"
                  className="primary-btn stock-prepare-drafts-btn"
                  onClick={() => { void onPrepareDrafts() }}
                  disabled={!isWorkspaceReady || isActionBusy}
                >
                  {isPreparingDrafts ? 'Preparing…' : (isSaving ? 'Saving…' : 'Suggest order')}
                </button>
              ) : null}
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setIsCreateModalOpen(true)}
                disabled={!isWorkspaceReady || isActionBusy}
              >
                {isSaving ? 'Creating…' : 'Create order'}
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="stock-orders-grid">
          {visibleOrders.map((order) => (
            <StockOrderCard
              key={order.id}
              order={order}
              stockItems={stockItems}
              showCost={canManage}
              timeZone={timeZone}
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
          stockItems={stockItems}
          suppliers={suppliers}
          venueName={venueName}
          senderName={senderName}
          timeZone={timeZone}
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

      {isCleanupDialogOpen && canManage && workspaceId ? (
        <StockOrderCleanupDialog
          workspaceId={workspaceId}
          onClose={() => setIsCleanupDialogOpen(false)}
          onCompleted={async () => {
            setSelectedOrder(null)
            await onOrdersChanged?.()
          }}
        />
      ) : null}
    </section>
  )
}
