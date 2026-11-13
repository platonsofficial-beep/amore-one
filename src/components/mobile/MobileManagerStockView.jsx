import { useEffect, useMemo, useState } from 'react'
import {
  filterStockDashboardItems,
  groupStockItemsByCategoryStatus,
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
import { StockDashboardMovementDialog } from '../stock/StockDashboardMovementDialog'
import { StockItemFormModal } from '../stock/StockItemFormModal'
import { formatInventoryUnit } from '../../lib/inventoryUnitDisplay'
import { buildProductDisplayNameFromItem, formatProductSizeDetail } from '../../lib/stockProductIdentity'
import { t } from '../../i18n/i18n'

function buildMobileOrderGroupsForItem(item) {
  const line = buildSuggestedOrderLine(item)
  const quantity = line.quantity > 0 ? line.quantity : 1
  const supplier = `${item.supplier ?? ''}`.trim() || t("No supplier")

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
  const displayTitle = buildProductDisplayNameFromItem(item)
  const sizeDetail = formatProductSizeDetail(item, displayTitle)

  return (
    <button
      type="button"
      className={`mobile-manager-stock-card mobile-manager-stock-row tone-${item.status}`}
      onClick={() => onOpen?.(item)}
    >
      <span className="mobile-manager-stock-card-name">
        {displayTitle}
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
  onCount = null,
  onReceive = null,
  onEdit = null,
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
      <button type="button" className="mobile-stock-detail-backdrop" aria-label={t("Close product")} onClick={onClose} />
      <section className="mobile-stock-detail-card" role="dialog" aria-modal="true" aria-labelledby="mobile-stock-detail-title">
        <header className="mobile-stock-detail-header">
          <div>
            <h2 id="mobile-stock-detail-title">{buildProductDisplayNameFromItem(item)}</h2>
            {formatProductSizeDetail(item) ? (
              <p className="stock-item-size-detail">{formatProductSizeDetail(item)}</p>
            ) : null}
            <p>{categoryLabel}</p>
          </div>
          <button type="button" className="ghost-btn" onClick={onClose}>{t("Close")}</button>
        </header>
        <dl>
          <div>
            <dt>{t("On hand")}</dt>
            <dd>{formatInventoryUnit(currentQuantity, item.unit)}</dd>
          </div>
          <div>
            <dt>{t("Minimum")}</dt>
            <dd>{formatInventoryUnit(minimumQuantity, item.unit)}</dd>
          </div>
          <div>
            <dt>{t("Status")}</dt>
            <dd>{getStockStatusShortLabel(item.status)}</dd>
          </div>
          {supplierLabel ? (
            <div>
              <dt>{t("Supplier")}</dt>
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
            {t("Add to order")}
          </button>
        ) : null}
        {/* S-08: same per-product actions as landscape (Count, Receive, Edit). */}
        {canManageStock && (onCount || onReceive || onEdit) ? (
          <div className="mobile-stock-detail-actions" role="group" aria-label={t("Product actions")}>
            {onCount ? (
              <button type="button" className="ghost-btn" onClick={() => onCount(item)} disabled={!isWorkspaceReady}>{t("Count")}</button>
            ) : null}
            {onReceive ? (
              <button type="button" className="ghost-btn" onClick={() => onReceive(item)} disabled={!isWorkspaceReady} aria-label={t("Receive delivery")}>{t("Receive")}</button>
            ) : null}
            {onEdit ? (
              <button type="button" className="ghost-btn" onClick={() => onEdit(item)} disabled={!isWorkspaceReady}>{t("Edit")}</button>
            ) : null}
          </div>
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
    message = `${t('{{count}} awaiting delivery', { count: awaitingCount })} · ${t('{{count}} partial', { count: partialCount })}`
  } else if (awaitingCount > 0) {
    message = t('{{count}} delivery awaiting receipt', { count: awaitingCount })
  } else if (partialCount > 0) {
    message = t('{{count}} partial order open', { count: partialCount })
  } else if (draftCount > 0) {
    message = t('{{count}} order to review', { count: draftCount })
  }

  return (
    <section className="mobile-manager-stock-pending-banner" aria-label={t("Pending orders")}>
      <div className="mobile-manager-stock-pending-copy">
        <p className="mobile-manager-stock-pending-title">{t("Orders need attention")}</p>
        {message ? <p className="mobile-manager-stock-pending-message">{message}</p> : null}
      </div>
      <div className="mobile-manager-stock-pending-actions">
        {canManageStock && awaitingCount > 0 ? (
          <button
            type="button"
            className="mobile-manager-stock-pending-btn mobile-manager-stock-pending-btn-primary"
            onClick={onReceiveDeliveries}
          >
            {t("Receive delivery")}
          </button>
        ) : null}
        <button
          type="button"
          className="mobile-manager-stock-pending-btn"
          onClick={onOpenOrders}
        >
          {t("View orders")}
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
  suppliers = [],
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
  workspaceId = '',
  isSavingStock = false,
  onRecordMovement = null,
  onUpdateItem = null,
}) {
  const [movementModal, setMovementModal] = useState(null)
  const [editingItem, setEditingItem] = useState(null)
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
    return groupStockItemsByCategoryStatus(filtered)
  }, [stockItems, categoryFilter, statusFilter, searchTerm])

  const hasNoItems = stockItems.length === 0
  const hasNoMatches = !hasNoItems && visibleItems.every((group) => group.items.length === 0)

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
        message: t("Everything looks good"),
      }
    }

    if (statusFilter === 'out' && hasNoMatches) {
      return {
        ...base,
        message: t("Everything looks good"),
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
    const groups = buildSupplierOrderGroups(stockItems, suppliers)
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
    <section className="mobile-manager-stock-action-bar is-compact" aria-label={t("Stock quick actions")}>
      <button
        type="button"
        className="mobile-manager-stock-quick-btn"
        onClick={onCountStock}
        data-help="stock.count-now"
        disabled={!isWorkspaceReady}
      >
        {t("Count")}
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
              <span className="mobile-manager-stock-quick-label-full">{t("Suggest order")}</span>
              <span className="mobile-manager-stock-quick-label-short">{t("Suggest")}</span>
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
        {t("Create order")}
      </button>
    </section>
  ) : null

  return (
    <div className={`mobile-screen mobile-manager-stock mobile-manager-stock-inventory${detailItem ? ' is-detail-open' : ''}`}>
      <div className="mobile-manager-stock-top">
      <header className="mobile-manager-stock-command" aria-label={t("Stock overview")}>
        <h1 className="mobile-manager-stock-command-title">{t("Stock")}</h1>
        <p className="mobile-manager-stock-command-stats">
          <span>
            <strong>{isLoading || catalogLoadFailed ? '—' : totalItems}</strong> {t("items")}
          </span>
          <span aria-hidden="true">·</span>
          <span className={lowCount > 0 ? 'tone-warning' : ''}>
            <strong>{isLoading || catalogLoadFailed ? '—' : lowCount}</strong> {t("low")}
          </span>
          <span aria-hidden="true">·</span>
          <span className={outCount > 0 ? 'tone-danger' : ''}>
            <strong>{isLoading || catalogLoadFailed ? '—' : outCount}</strong> {t("out")}
          </span>
          <span aria-hidden="true">·</span>
          <span className={toOrderCount > 0 ? 'tone-warning' : ''}>
            <strong>{isLoading || catalogLoadFailed ? '—' : toOrderCount}</strong> {t("to order")}
          </span>
          {pendingOrders > 0 ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="tone-info">
                <strong>{isLoading ? '0' : pendingOrders}</strong> {t('order pending', { count: pendingOrders })}
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
          <span className="sr-only">{t("Search stock items")}</span>
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder={t("Search stock item...")}
            autoComplete="off"
            enterKeyHint="search"
          />
        </label>

        <div className="mobile-manager-stock-filters">
          <div className="mobile-manager-stock-chip-scroll" role="tablist" aria-label={t("Stock filters")}>
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
            {t("All")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === 'low'}
            className={`mobile-manager-stock-chip${statusFilter === 'low' ? ' is-active' : ''}`}
            onClick={() => handleStatusChip('low')}
          >
            {t("Low")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === 'out'}
            className={`mobile-manager-stock-chip${statusFilter === 'out' ? ' is-active' : ''}`}
            onClick={() => handleStatusChip('out')}
          >
            {t("Out")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === 'order'}
            className={`mobile-manager-stock-chip${statusFilter === 'order' ? ' is-active' : ''}`}
            onClick={() => handleStatusChip('order')}
          >
            {t("To order")}
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
        <p className="mobile-manager-stock-loading">{t("Loading stock…")}</p>
      ) : catalogLoadFailed ? (
        <div className="mobile-manager-stock-empty stock-catalog-load-failed" role="alert">
          <p className="mobile-manager-stock-empty-title">{t("Stock couldn't be loaded")}</p>
          <p className="mobile-manager-stock-empty-message">{t("Check your connection and try again.")}</p>
          <button
            type="button"
            className="primary-btn"
            onClick={() => onRetryCatalogLoad?.()}
            disabled={typeof onRetryCatalogLoad !== 'function'}
          >
            {t("Retry")}
          </button>
        </div>
      ) : emptyState ? (
        <MobileManagerStockEmptyState title={emptyState.title} message={emptyState.message} />
      ) : (
        <div className="mobile-manager-stock-list">
          {visibleItems.map((group) => (
            <section key={group.key} className="mobile-manager-stock-group" aria-label={group.label}>
              <h3 className="mobile-manager-stock-group-title">{group.label}</h3>
              <ul>
                {group.items.map((item) => (
                  <li key={item.id}>
                    <MobileManagerStockItemCard
                      item={item}
                      onOpen={setDetailItem}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
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
          onCount={typeof onRecordMovement === 'function' ? (item) => { setDetailItem(null); setMovementModal({ item, type: 'stock_count' }) } : null}
          onReceive={typeof onRecordMovement === 'function' ? (item) => { setDetailItem(null); setMovementModal({ item, type: 'receive' }) } : null}
          onEdit={typeof onUpdateItem === 'function' ? (item) => { setDetailItem(null); setEditingItem(item) } : null}
        />
      ) : null}
      </div>

      {movementModal ? (
        <StockDashboardMovementDialog
          item={movementModal.item}
          movementType={movementModal.type}
          workspaceId={workspaceId}
          isSaving={isSavingStock}
          onClose={() => setMovementModal(null)}
          onSubmit={onRecordMovement}
        />
      ) : null}

      {editingItem ? (
        <StockItemFormModal
          initialItem={editingItem}
          onClose={() => setEditingItem(null)}
          isSaving={isSavingStock}
          workspaceId={workspaceId}
          isWorkspaceReady={isWorkspaceReady}
          suppliers={suppliers}
          canManage={canManageStock}
          onSubmit={async (payload) => {
            await onUpdateItem(editingItem.id, payload)
          }}
        />
      ) : null}

      {orderModalGroups ? (
        <StockCreateOrderModal
          stockItems={stockItems}
          suppliers={suppliers}
          initialGroups={orderModalGroups}
          onClose={handleCloseOrderModal}
          onSubmit={handleSubmitOrderModal}
          isSaving={isSavingOrders}
        />
      ) : null}
    </div>
  )
}
