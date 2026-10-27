import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  formatStockCategoryTypeLine,
  resolveStockItemType,
  resolveStockStorageLocation,
  stockItemToDuplicateForm,
  STOCK_CATEGORIES,
} from '../../lib/stockCatalog'
import { buildProductDisplayNameFromItem, formatProductSizeDetail } from '../../lib/stockProductIdentity'
import {
  buildStockItemUpdatePayload,
  exportStockItemsToCsv,
  getBulkTypeOptionsForItems,
} from '../../lib/stockBulkActions'
import {
  filterStockDashboardItems,
  getStockStatusFilterLabel,
  groupStockDashboardItems,
  sortStockDashboardItems,
  STOCK_GROUP_BY_OPTIONS,
  STOCK_LAYOUT_MODES,
  STOCK_SORT_OPTIONS,
  STOCK_VISIBILITY_OPTIONS,
} from '../../lib/stockDashboardBrowse'
import {
  persistStockBrowsePreferences,
  readStockBrowsePreferences,
} from '../../lib/stockBrowsePersistence'
import {
  buildToCountStorageGroups,
  buildToOrderSupplierGroups,
  formatToOrderBreakdown,
  getStockDashboardEmptyState,
  getStockItemInsights,
} from '../../lib/stockInsights'
import { StockUsageCostReport } from './StockUsageCostReport'
import {
  buildStockDashboardSummary,
  buildTodayStockActivitySummary,
  formatStockInactiveNote,
  formatStockInventoryValue,
  formatStockMovementRelativeTime,
  formatStockPurchasePrice,
  formatStockQuantity,
  formatTodayStockActivityLine,
  getStockCategoryFilters,
  getStockMovementLabel,
  getStockStatusShortLabel,
  STOCK_MOVEMENT_TYPES,
} from '../../lib/stockUtils'
import { getCurrentDateKey } from '../../lib/currentDateUtils'
import { useEscapeToClose } from '../../lib/useEscapeToClose'
import { buildStockOrdersOperationsSummary, sumSuggestedOrderCost } from '../../lib/stockOrderUtils'
import { StockCreateOrderModal } from './StockCreateOrderModal'
import { StockItemFormModal } from './StockItemFormModal'
import { StockActionIcon } from './StockActionIcon'
import { StockItemMoreMenu } from './StockItemMoreMenu'
import { formatInventoryQuantityNumber, formatInventoryUnitLabel } from '../../lib/inventoryUnitDisplay'
import { StockDashboardMovementDialog } from './StockDashboardMovementDialog'
import { StockItemPermanentDeleteDialog } from './StockItemPermanentDeleteDialog'
import { StockProductHistoryDrawer } from './StockProductHistoryDrawer'
import { WorkspaceStorageSelector } from './WorkspaceStorageSelector'

function StockLayoutModeIcon({ icon }) {
  if (icon === 'grid') {
    return (
      <svg className="stock-layout-mode-icon" viewBox="0 0 16 16" aria-hidden="true">
        <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1" />
        <rect x="9" y="1.5" width="5.5" height="5.5" rx="1" />
        <rect x="1.5" y="9" width="5.5" height="5.5" rx="1" />
        <rect x="9" y="9" width="5.5" height="5.5" rx="1" />
      </svg>
    )
  }

  if (icon === 'list') {
    return (
      <svg className="stock-layout-mode-icon" viewBox="0 0 16 16" aria-hidden="true">
        <rect x="1.5" y="2.5" width="13" height="2" rx="1" />
        <rect x="1.5" y="7" width="13" height="2" rx="1" />
        <rect x="1.5" y="11.5" width="13" height="2" rx="1" />
      </svg>
    )
  }

  return (
    <svg className="stock-layout-mode-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="1.5" y="1.5" width="13" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

function StockSortDropdown({
  value,
  options,
  onChange,
  ariaLabel = 'Sort stock items',
}) {
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
        aria-label={ariaLabel}
        title={selectedOption?.label}
      >
        <span className="stock-sort-dropdown-value">{selectedOption?.label}</span>
        <span className="stock-sort-dropdown-chevron" aria-hidden="true">▾</span>
      </button>

      {isOpen ? (
        <ul className="stock-sort-dropdown-menu" role="listbox" aria-label={ariaLabel}>
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

function stockLevelPercent(item) {
  const qty = Number(item?.currentQuantity)
  const minimum = Number(item?.minimumQuantity)
  const target = Number(item?.targetQuantity)
  const safeQty = Number.isFinite(qty) ? Math.max(0, qty) : 0
  const goal = Math.max(
    Number.isFinite(target) && target > 0 ? target : 0,
    Number.isFinite(minimum) && minimum > 0 ? minimum : 0,
    safeQty,
    1,
  )
  return Math.max(0, Math.min(100, Math.round((safeQty / goal) * 100)))
}

function StockItemCard({
  item,
  canManage,
  isMenuOpen,
  selectionMode = false,
  isSelected = false,
  onToggleSelect,
  onToggleMenu,
  onReceive,
  onCount,
  onOpenHistory,
}) {
  const itemType = resolveStockItemType(item)
  const location = resolveStockStorageLocation(item)
  const supplierLabel = `${item.supplier ?? ''}`.trim()
  const insights = getStockItemInsights(item, { canManage })
  const staleCount = insights.find((insight) => insight.id === 'not-counted')
  const displayTitle = buildProductDisplayNameFromItem(item)
  const sizeDetail = formatProductSizeDetail(item)
  const needsDelivery = item.status === 'out' || item.status === 'low'
  const level = stockLevelPercent(item)
  const metaLine = [supplierLabel || 'No supplier', location].filter(Boolean).join(' · ')

  const handleCardClick = () => {
    if (selectionMode) {
      onToggleSelect?.()
      return
    }
    onOpenHistory?.()
  }

  return (
    <article
      className={`stock-item-card panel staff-panel tone-${item.status}${item.status === 'low' || item.status === 'out' ? ' is-alert' : ''}${item.active === false ? ' is-inactive' : ''}${selectionMode ? ' is-selectable' : ''}${isSelected ? ' is-selected' : ''}${isMenuOpen ? ' is-menu-open' : ''}`}
      onClick={handleCardClick}
    >
      <header className="stock-item-card-header">
        {selectionMode ? (
          <button
            type="button"
            className={`stock-item-select-btn${isSelected ? ' is-selected' : ''}`}
            onClick={(event) => {
              event.stopPropagation()
              onToggleSelect?.()
            }}
            aria-pressed={isSelected}
            aria-label={isSelected ? `Deselect ${displayTitle}` : `Select ${displayTitle}`}
          >
            {isSelected ? '✓' : ''}
          </button>
        ) : null}
        <div className="stock-item-card-title-block">
          <h3 className="stock-item-name" title={displayTitle || undefined}>
            {displayTitle}
          </h3>
          {sizeDetail ? <p className="stock-item-size-detail">{sizeDetail}</p> : null}
          {item.active === false ? (
            <span className="stock-item-status-badge tone-muted">Inactive</span>
          ) : (
            <span className={`stock-item-status-badge tone-${item.status}`}>
              {getStockStatusShortLabel(item.status)}
            </span>
          )}
        </div>
      </header>

      <p className="stock-item-quiet-meta">
        {metaLine}
        {staleCount ? ` · ${staleCount.label}` : ''}
      </p>

      <p className={`stock-item-qty-figure tone-${item.status}`}>
        <span className="stock-item-qty-number">{formatInventoryQuantityNumber(item.currentQuantity)}</span>
        <span className="stock-item-qty-unit">{formatInventoryUnitLabel(item.unit) || itemType}</span>
      </p>
      <div className="stock-item-level" aria-hidden="true">
        <span className={`stock-item-level-fill tone-${item.status}`} style={{ width: `${level}%` }} />
      </div>
      <p className="stock-item-level-caption">
        Minimum {formatStockQuantity(item.minimumQuantity, item.unit)}
      </p>

      {canManage ? (
        <div className="stock-item-card-footer">
          <div className={`stock-item-actions-wrap${isMenuOpen ? ' is-menu-open' : ''}`}>
          <div className="stock-item-actions">
            <button
              type="button"
              className={`ghost-btn stock-item-action-primary ${needsDelivery ? 'is-receive' : 'is-count'}`}
              onClick={(event) => {
                event.stopPropagation()
                if (needsDelivery) onReceive()
                else onCount()
              }}
            >
              <StockActionIcon name={needsDelivery ? 'box' : 'clipboard'} />
              <span>{needsDelivery ? 'Receive delivery' : 'Count'}</span>
            </button>
            <button
              type="button"
              className={`ghost-btn stock-item-more-btn is-more${isMenuOpen ? ' is-open' : ''}`}
              onClick={(event) => { event.stopPropagation(); onToggleMenu(event) }}
              aria-expanded={isMenuOpen}
              aria-haspopup="menu"
              aria-label="More stock actions"
            >
              ⋯
            </button>
          </div>
          </div>
        </div>
      ) : (
        <div className="stock-item-card-footer">
          <button
            type="button"
            className="ghost-btn stock-item-action-primary"
            onClick={(event) => {
              event.stopPropagation()
              onOpenHistory?.()
            }}
          >
            Details
          </button>
        </div>
      )}
    </article>
  )
}

function formatLastMovementCell(item, timeZone = '') {
  const movement = item.lastMovement
  if (!movement?.type) return '—'
  const label = getStockMovementLabel(movement)
  const when = movement.createdAt ? formatStockListUpdatedWhen(movement.createdAt, timeZone) : ''
  return when ? `${label} · ${when}` : label
}

/** Presentation-only Updated timestamp: "24 Jul · 15:35" / "Today · 15:35". */
function formatStockListUpdatedWhen(value, timeZone = '') {
  const raw = formatStockMovementRelativeTime(value, new Date(), timeZone)
  if (!raw) return ''
  return raw.replace(/^(.+?)\s+(\d{1,2}:\d{2})$/u, '$1 · $2')
}

function StockListUpdatedCell({ item, timeZone = '' }) {
  const movement = item.lastMovement
  if (!movement?.type) {
    return <span className="stock-list-updated is-empty">—</span>
  }

  const label = getStockMovementLabel(movement)
  const when = movement.createdAt ? formatStockListUpdatedWhen(movement.createdAt, timeZone) : ''

  return (
    <div className="stock-list-updated" title={when ? `${label} · ${when}` : label}>
      <span className="stock-list-updated-type">{label}</span>
      {when ? <span className="stock-list-updated-when">{when}</span> : null}
    </div>
  )
}

function StockItemRowActions({
  item,
  canManage,
  isMenuOpen,
  onReceive,
  onCount,
  onToggleMenu,
  onOpenHistory,
  compact = false,
}) {
  const keepRow = (handler) => (event) => {
    event.stopPropagation()
    handler?.(event)
  }

  if (!canManage) {
    return (
      <button type="button" className="ghost-btn stock-row-action-btn" onClick={keepRow(onOpenHistory)}>
        Details
      </button>
    )
  }

  return (
    <div className={`stock-row-actions-wrap${isMenuOpen ? ' is-menu-open' : ''}${compact ? ' is-compact' : ''}`}>
      <div className={`stock-row-actions${compact ? ' is-compact' : ''}`}>
        <button
          type="button"
          className="ghost-btn stock-row-action-btn is-receive"
          onClick={keepRow(onReceive)}
          aria-label="Receive delivery"
        >
          Receive delivery
        </button>
        <button
          type="button"
          className="ghost-btn stock-row-action-btn is-count"
          onClick={keepRow(onCount)}
          aria-label="Count"
          data-stock-row-count-action="true"
        >
          Count
        </button>
        <button
          type="button"
          className={`ghost-btn stock-row-more-btn is-more${isMenuOpen ? ' is-open' : ''}`}
          onClick={keepRow(onToggleMenu)}
          aria-expanded={isMenuOpen}
          aria-haspopup="menu"
          aria-label={`More actions for ${buildProductDisplayNameFromItem(item)}`}
        >
          {compact ? '⋯' : 'More'}
        </button>
      </div>
    </div>
  )
}

function StockListRow({
  item,
  canManage,
  selectionMode,
  isSelected,
  isMenuOpen,
  onToggleSelect,
  onToggleMenu,
  onReceive,
  onCount,
  onOpenHistory,
  timeZone = '',
}) {
  const itemType = resolveStockItemType(item)
  const location = resolveStockStorageLocation(item)
  const supplierLabel = `${item.supplier ?? ''}`.trim() || '—'
  const displayTitle = buildProductDisplayNameFromItem(item)
  const sizeDetail = formatProductSizeDetail(item)
  const handleRowClick = () => {
    if (selectionMode) {
      onToggleSelect?.()
      return
    }
    onOpenHistory?.()
  }

  return (
    <tr
      className={`stock-list-row tone-${item.status}${item.active === false ? ' is-inactive' : ''}${isSelected ? ' is-selected' : ''}${isMenuOpen ? ' is-menu-open' : ''}`}
      onClick={handleRowClick}
    >
      {selectionMode && canManage ? (
        <td className="stock-list-cell stock-list-cell-select">
          <button
            type="button"
            className={`stock-item-select-btn stock-list-select-btn${isSelected ? ' is-selected' : ''}`}
            onClick={(event) => {
              event.stopPropagation()
              onToggleSelect?.()
            }}
            aria-pressed={isSelected}
            aria-label={isSelected ? `Deselect ${displayTitle}` : `Select ${displayTitle}`}
          >
            {isSelected ? '✓' : ''}
          </button>
        </td>
      ) : null}
      <th scope="row" className="stock-list-cell stock-list-cell-product">
        <div className="stock-list-product-block">
          <span className="stock-list-product-name" title={displayTitle || undefined}>
            {displayTitle}
          </span>
          {sizeDetail ? <span className="stock-item-size-detail">{sizeDetail}</span> : null}
          {item.active === false ? (
            <span className="stock-item-status-badge tone-muted stock-list-product-inactive">
              Inactive
            </span>
          ) : null}
        </div>
      </th>
      <td className="stock-list-cell stock-list-cell-details">
        <div className="stock-list-details">
          <p className="stock-list-details-line is-category" title={formatStockCategoryTypeLine(item.category, itemType)}>
            {formatStockCategoryTypeLine(item.category, itemType)}
          </p>
          <p className="stock-list-details-line is-supplier" title={supplierLabel === '—' ? undefined : supplierLabel}>
            {supplierLabel}
          </p>
          <p className="stock-list-details-line is-location" title={location === '—' ? undefined : location}>
            {location}
          </p>
        </div>
      </td>
      <td className={`stock-list-cell stock-list-cell-stock${item.status === 'out' || item.status === 'low' ? ` is-${item.status}` : ''}`}>
        <div className="stock-list-stock">
          <span className="stock-list-stock-current">
            {formatStockQuantity(item.currentQuantity, item.unit)}
          </span>
          <span className="stock-list-stock-min">
            Min {formatStockQuantity(item.minimumQuantity, item.unit)}
          </span>
        </div>
      </td>
      <td className="stock-list-cell stock-list-cell-status">
        <span className={`stock-item-status-badge tone-${item.status}`}>
          {getStockStatusShortLabel(item.status)}
        </span>
      </td>
      <td className="stock-list-cell stock-list-cell-movement">
        <StockListUpdatedCell item={item} timeZone={timeZone} />
      </td>
      <td className="stock-list-cell stock-list-cell-actions">
        <StockItemRowActions
          item={item}
          canManage={canManage}
          isMenuOpen={isMenuOpen}
          compact
          onReceive={onReceive}
          onCount={onCount}
          onToggleMenu={(event) => onToggleMenu(item.id, event.currentTarget)}
          onOpenHistory={onOpenHistory}
        />
      </td>
    </tr>
  )
}

function StockListMobileCard({
  item,
  canManage,
  selectionMode,
  isSelected,
  isMenuOpen,
  onToggleSelect,
  onToggleMenu,
  onReceive,
  onCount,
  onOpenHistory,
  timeZone = '',
}) {
  const itemType = resolveStockItemType(item)
  const location = resolveStockStorageLocation(item)
  const supplierLabel = `${item.supplier ?? ''}`.trim() || '—'
  const displayTitle = buildProductDisplayNameFromItem(item)
  const sizeDetail = formatProductSizeDetail(item)

  const handleRowClick = () => {
    if (selectionMode) {
      onToggleSelect?.()
      return
    }
    onOpenHistory?.()
  }

  return (
    <article
      className={`stock-list-mobile-card panel staff-panel tone-${item.status}${isSelected ? ' is-selected' : ''}`}
      onClick={handleRowClick}
    >
      <header className="stock-list-mobile-header">
        {selectionMode && canManage ? (
          <button
            type="button"
            className={`stock-item-select-btn${isSelected ? ' is-selected' : ''}`}
            onClick={(event) => {
              event.stopPropagation()
              onToggleSelect?.()
            }}
            aria-pressed={isSelected}
            aria-label={isSelected ? `Deselect ${displayTitle}` : `Select ${displayTitle}`}
          >
            {isSelected ? '✓' : ''}
          </button>
        ) : null}
        <div className="stock-list-mobile-title-wrap">
          <h3 className="stock-list-mobile-name">{displayTitle}</h3>
          {sizeDetail ? <p className="stock-item-size-detail">{sizeDetail}</p> : null}
          <span className={`stock-item-status-badge stock-list-mobile-status-badge tone-${item.status}`}>
            {getStockStatusShortLabel(item.status)}
          </span>
        </div>
      </header>

      <dl className="stock-list-mobile-meta">
        <div className="stock-list-mobile-meta-row">
          <dt>Category / Type</dt>
          <dd>{formatStockCategoryTypeLine(item.category, itemType)}</dd>
        </div>
        <div className="stock-list-mobile-meta-row">
          <dt>Supplier</dt>
          <dd>{supplierLabel}</dd>
        </div>
        <div className="stock-list-mobile-meta-row">
          <dt>Location</dt>
          <dd>{location}</dd>
        </div>
        <div className="stock-list-mobile-meta-row stock-list-mobile-meta-row-qty">
          <dt>On hand / Min</dt>
          <dd>
            <span className={`stock-list-mobile-qty-current${item.status === 'out' || item.status === 'low' ? ` tone-${item.status}` : ''}`}>
              {formatStockQuantity(item.currentQuantity, item.unit)}
            </span>
            <span className="stock-list-mobile-qty-separator" aria-hidden="true">/</span>
            <span>{formatStockQuantity(item.minimumQuantity, item.unit)}</span>
          </dd>
        </div>
        <div className="stock-list-mobile-meta-row">
          <dt>Last movement</dt>
          <dd>{formatLastMovementCell(item, timeZone)}</dd>
        </div>
      </dl>

      <div
        className="stock-list-mobile-actions"
        onClick={(event) => event.stopPropagation()}
      >
        <StockItemRowActions
          item={item}
          canManage={canManage}
          isMenuOpen={isMenuOpen}
          onReceive={onReceive}
          onCount={onCount}
          onToggleMenu={(event) => onToggleMenu(item.id, event.currentTarget)}
          onOpenHistory={onOpenHistory}
        />
      </div>
    </article>
  )
}

function StockListTable({
  items,
  canManage,
  selectionMode,
  selectedIds,
  openCardMenuId,
  onToggleSelect,
  onToggleMenu,
  onReceive,
  onCount,
  onOpenHistory,
  timeZone = '',
}) {
  return (
    <>
      <div className="stock-list-table-wrap stock-list-desktop">
        <table className={`stock-list-table${selectionMode && canManage ? ' is-selection-mode' : ''}`}>
          <thead>
            <tr>
              {selectionMode && canManage ? (
                <th scope="col" className="stock-list-head-select"><span className="sr-only">Select</span></th>
              ) : null}
              <th scope="col" className="stock-list-head-product">Product</th>
              <th scope="col" className="stock-list-head-details">Details</th>
              <th scope="col" className="stock-list-head-stock">Stock</th>
              <th scope="col" className="stock-list-head-status">Status</th>
              <th scope="col" className="stock-list-head-updated">Updated</th>
              <th scope="col" className="stock-list-head-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <StockListRow
                key={item.id}
                item={item}
                canManage={canManage}
                selectionMode={selectionMode}
                isSelected={selectedIds.has(item.id)}
                isMenuOpen={openCardMenuId === item.id}
                onToggleSelect={() => onToggleSelect(item.id)}
                onToggleMenu={onToggleMenu}
                onReceive={() => onReceive(item)}
                onCount={() => onCount(item)}
                onOpenHistory={() => onOpenHistory(item)}
                timeZone={timeZone}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="stock-list-mobile-wrap">
        {items.map((item) => (
          <StockListMobileCard
            key={item.id}
            item={item}
            canManage={canManage}
            selectionMode={selectionMode}
            isSelected={selectedIds.has(item.id)}
            isMenuOpen={openCardMenuId === item.id}
            onToggleSelect={() => onToggleSelect(item.id)}
            onToggleMenu={onToggleMenu}
            onReceive={() => onReceive(item)}
            onCount={() => onCount(item)}
            onOpenHistory={() => onOpenHistory(item)}
            timeZone={timeZone}
          />
        ))}
      </div>
    </>
  )
}

function StockCompactRow({
  item,
  canManage,
  selectionMode,
  isSelected,
  onToggleSelect,
  onCount,
  onOpenHistory,
}) {
  const location = resolveStockStorageLocation(item)
  const supplierLabel = `${item.supplier ?? ''}`.trim() || '—'
  const displayTitle = buildProductDisplayNameFromItem(item)
  const sizeDetail = formatProductSizeDetail(item)

  const handleRowClick = () => {
    if (selectionMode) {
      onToggleSelect?.()
      return
    }
    onOpenHistory?.()
  }

  return (
    <article
      className={`stock-compact-row panel staff-panel tone-${item.status}${isSelected ? ' is-selected' : ''}`}
      onClick={handleRowClick}
    >
      {selectionMode && canManage ? (
        <button
          type="button"
          className={`stock-item-select-btn${isSelected ? ' is-selected' : ''}`}
          onClick={(event) => {
            event.stopPropagation()
            onToggleSelect?.()
          }}
          aria-pressed={isSelected}
          aria-label={isSelected ? `Deselect ${displayTitle}` : `Select ${displayTitle}`}
        >
          {isSelected ? '✓' : ''}
        </button>
      ) : null}
      <div className="stock-compact-copy">
        <h3 className="stock-compact-name">{displayTitle}</h3>
        {sizeDetail ? <p className="stock-item-size-detail">{sizeDetail}</p> : null}
        <span className={`stock-item-status-badge stock-compact-status-badge tone-${item.status}`}>
          {getStockStatusShortLabel(item.status)}
        </span>
        <p className="stock-compact-meta">{supplierLabel} · {location}</p>
        <p className="stock-compact-qty">
          <span className={item.status === 'out' || item.status === 'low' ? `tone-${item.status}` : ''}>
            {formatStockQuantity(item.currentQuantity, item.unit)}
          </span>
          <span className="stock-compact-qty-separator" aria-hidden="true">/</span>
          <span className="stock-compact-qty-min">min {formatStockQuantity(item.minimumQuantity, item.unit)}</span>
        </p>
      </div>
      <div className="stock-compact-actions" onClick={(event) => event.stopPropagation()}>
        {canManage ? (
          <button type="button" className="ghost-btn stock-compact-count-btn" onClick={onCount}>
            Count
          </button>
        ) : (
          <button type="button" className="ghost-btn stock-compact-count-btn" onClick={onOpenHistory}>
            Details
          </button>
        )}
      </div>
    </article>
  )
}

function StockSummaryCard({
  label,
  value,
  subtitle,
  tone = 'default',
  layout = 'default',
  isInteractive = false,
  isSelected = false,
  onClick,
}) {
  const isValueFirst = layout === 'value-first'
  const className = `stock-summary-card tone-${tone}${isValueFirst ? ' layout-value-first' : ''}${isInteractive ? ' is-interactive' : ''}${isSelected ? ' is-selected' : ''}`

  // P8.17.3a — Use phrasing content only inside <button>. Nested <p> is invalid HTML and
  // WebKit/iPad may hoist those nodes outside the button so taps never reach onClick.
  const content = isValueFirst ? (
    <>
      <span className="stock-summary-value">{value}</span>
      <span className="stock-summary-label">{subtitle || label}</span>
    </>
  ) : (
    <>
      <span className="stock-summary-label">{label}</span>
      <span className="stock-summary-value">{value}</span>
    </>
  )

  if (isInteractive) {
    return (
      <button
        type="button"
        className={className}
        onClick={onClick}
        aria-pressed={isSelected}
      >
        {content}
      </button>
    )
  }

  return (
    <article className={className}>
      {content}
    </article>
  )
}


function StockTodayActivitySection({ activityLine }) {
  if (!activityLine) return null
  const isEmpty = activityLine === 'No stock updates today'

  return (
    <section
      className={`stock-today-activity panel staff-panel is-dense${isEmpty ? ' is-empty' : ''}`}
      aria-label="Today's stock activity"
      data-stock-widget-density="dense"
    >
      <header className="stock-today-activity-header">
        <h3 className="stock-today-activity-title">What changed today</h3>
        <p className="stock-today-activity-line">{isEmpty ? 'Nothing moved today' : activityLine}</p>
      </header>
    </section>
  )
}



function StockBulkFieldModal({
  field,
  selectedItems,
  onClose,
  onSubmit,
  isSaving,
  workspaceId = '',
}) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isBusy = isSaving || isSubmitting

  const title = field === 'supplier'
    ? 'Change supplier'
    : field === 'storageLocation'
      ? 'Change location'
      : field === 'category'
        ? 'Change category'
        : 'Change type'

  const typeOptions = useMemo(() => getBulkTypeOptionsForItems(selectedItems), [selectedItems])

  useEffect(() => {
    setValue('')
    setError('')
  }, [field])

  useEscapeToClose(() => {
    if (isBusy) return
    onClose?.()
  })

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (isBusy) return
    const trimmed = `${value ?? ''}`.trim()

    if (!trimmed) {
      setError('Choose or enter a value.')
      return
    }

    try {
      setError('')
      setIsSubmitting(true)
      await onSubmit(field, trimmed)
      onClose()
    } catch (submitError) {
      setError(submitError?.message || 'Unable to update products right now.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDismiss = () => {
    if (isBusy) return
    onClose()
  }

  return (
    <div className="employee-modal-backdrop task-modal-backdrop" onClick={handleDismiss}>
      <div className="employee-modal stock-dashboard-modal task-form-modal is-responsive-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <h3>{title}</h3>
            <p className="stock-modal-subtitle">{selectedItems.length} selected product{selectedItems.length === 1 ? '' : 's'}</p>
          </div>
          <button type="button" className="icon-btn" onClick={handleDismiss} disabled={isBusy} aria-label="Close">✕</button>
        </div>

        <form className="employee-form" onSubmit={handleSubmit}>
          {field === 'supplier' ? (
            <label>
              Supplier
              <input
                type="text"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder="e.g. Malakakos"
                required
              />
            </label>
          ) : null}

          {field === 'storageLocation' ? (
            <label>
              Storage location
              <WorkspaceStorageSelector
                workspaceId={workspaceId}
                value={value}
                variant="select"
                disabled={isBusy}
                required
                emptyLabel="Select location"
                onChange={setValue}
              />
            </label>
          ) : null}

          {field === 'category' ? (
            <label>
              Category
              <select value={value} onChange={(event) => setValue(event.target.value)} required>
                <option value="">Select category</option>
                {STOCK_CATEGORIES.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </label>
          ) : null}

          {field === 'itemType' ? (
            <label>
              Type
              <select value={value} onChange={(event) => setValue(event.target.value)} required>
                <option value="">Select type</option>
                {typeOptions.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </label>
          ) : null}

          {error ? <div className="staff-status-banner">{error}</div> : null}

          <div className="modal-actions">
            <button type="button" className="ghost-btn" onClick={handleDismiss} disabled={isBusy}>Cancel</button>
            <button type="submit" className="primary-btn" disabled={isBusy}>
              {isBusy ? 'Saving…' : 'Apply to selected'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function StockItemDeactivateConfirmModal({
  item,
  isSaving = false,
  onClose,
  onConfirm,
}) {
  const [canDismiss, setCanDismiss] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    // Ignore the same pointer/click that opened this modal from the ⋯ menu
    // (menu unmounts under the cursor; a ghost click can hit the new backdrop).
    const timer = window.setTimeout(() => setCanDismiss(true), 0)
    return () => window.clearTimeout(timer)
  }, [])

  useEscapeToClose(() => {
    if (isSaving || isSubmitting || !canDismiss) return
    onClose?.()
  }, { enabled: Boolean(item) })

  if (!item || typeof document === 'undefined') return null

  const isBusy = isSaving || isSubmitting

  const handleDismiss = () => {
    if (isBusy || !canDismiss) return
    onClose?.()
  }

  const handleConfirm = async (event) => {
    event?.preventDefault?.()
    event?.stopPropagation?.()
    if (isBusy || !canDismiss || !item?.id) return

    setSubmitError('')
    setIsSubmitting(true)
    try {
      await onConfirm?.(item)
    } catch (error) {
      setSubmitError(error?.message || 'Unable to deactivate right now.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return createPortal(
    <div
      className="employee-modal-backdrop task-modal-backdrop stock-item-deactivate-backdrop"
      onClick={handleDismiss}
    >
      <div
        className="employee-modal stock-dashboard-modal task-form-modal is-responsive-sheet"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-item-deactivate-title"
        aria-busy={isBusy}
      >
        <div className="drawer-header">
          <div>
            <h3 id="stock-item-deactivate-title">Deactivate Product?</h3>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={handleDismiss}
            disabled={isBusy || !canDismiss}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="stock-supplier-delete-body">
          <p>
            This product will become inactive and will no longer appear in active Stock views or dashboard alerts.
          </p>
          {item.name ? (
            <p>
              <strong>{buildProductDisplayNameFromItem(item)}</strong>
            </p>
          ) : null}
          {submitError ? (
            <p className="staff-status-banner" role="alert">{submitError}</p>
          ) : null}
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="ghost-btn"
            onClick={handleDismiss}
            disabled={isBusy || !canDismiss}
          >
            Cancel
          </button>
          <button
            type="button"
            className="primary-btn"
            onClick={handleConfirm}
            disabled={isBusy || !canDismiss}
          >
            {isBusy ? 'Saving…' : 'Deactivate'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function StockDashboardView({
  stockItems = [],
  stockOrders = [],
  isLoading = false,
  catalogLoadFailed = false,
  onRetryCatalogLoad,
  noticeMessage = '',
  isSaving = false,
  canManage = false,
  searchTerm = '',
  workspaceId = '',
  isWorkspaceReady = false,
  workspaceSetupMessage = '',
  suppliers = [],
  supplierPrefill = '',
  onSupplierPrefillApplied,
  onOpenAddSupplier,
  onItemModalOpenChange,
  onCreateItem,
  onUpdateItem,
  onDeactivateItem,
  onReactivateItem,
  onStockItemsChanged,
  onBulkUpdateItems,
  onRecordMovement,
  onCreateOrders,
  onPrepareDrafts,
  onOpenOrders,
  stockLiveSnapshot = null,
  onOpenBelowPar,
  onOpenDrafts,
  onOpenCounts,
  onOpenInventoryCountSession,
  isSavingOrders = false,
  timeZone = '',
}) {
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('all')
  const [visibilityFilter, setVisibilityFilter] = useState(
    () => readStockBrowsePreferences().visibilityFilter,
  )
  const [sortKey, setSortKey] = useState(() => readStockBrowsePreferences().sortKey)
  const [layoutMode, setLayoutMode] = useState(() => readStockBrowsePreferences().layoutMode)
  const [groupBy, setGroupBy] = useState(() => readStockBrowsePreferences().groupBy)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkModalField, setBulkModalField] = useState(null)
  const [movementModal, setMovementModal] = useState(null)
  const [historyItem, setHistoryItem] = useState(null)
  const [isCreateOrderModalOpen, setIsCreateOrderModalOpen] = useState(false)
  const [usageReportOpen, setUsageReportOpen] = useState(false)
  const [catalogMoreOpen, setCatalogMoreOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [isItemModalOpen, setIsItemModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [duplicateForm, setDuplicateForm] = useState(null)
  const [openCardMenuId, setOpenCardMenuId] = useState(null)
  const [menuAnchorEl, setMenuAnchorEl] = useState(null)
  const [pendingDeactivateItem, setPendingDeactivateItem] = useState(null)
  const [pendingPermanentDeleteItem, setPendingPermanentDeleteItem] = useState(null)
  const [permanentDeleteFocusEl, setPermanentDeleteFocusEl] = useState(null)
  const [removedItemIds, setRemovedItemIds] = useState(() => new Set())

  useEffect(() => {
    persistStockBrowsePreferences({ layoutMode, groupBy, sortKey, visibilityFilter })
  }, [layoutMode, groupBy, sortKey, visibilityFilter])

  useEffect(() => {
    if (!catalogMoreOpen) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setCatalogMoreOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [catalogMoreOpen])

  useEffect(() => {
    if (!canManage && visibilityFilter !== 'active') {
      setVisibilityFilter('active')
    }
  }, [canManage, visibilityFilter])

  useEffect(() => {
    onItemModalOpenChange?.(isItemModalOpen)
  }, [isItemModalOpen, onItemModalOpenChange])

  const catalogItems = useMemo(
    () => stockItems.filter((entry) => !removedItemIds.has(entry.id)),
    [stockItems, removedItemIds],
  )
  const activeCatalogItems = useMemo(
    () => catalogItems.filter((entry) => entry.active !== false),
    [catalogItems],
  )
  const hasInactiveProducts = useMemo(
    () => catalogItems.some((entry) => entry.active === false),
    [catalogItems],
  )
  const effectiveVisibilityFilter = canManage ? visibilityFilter : 'active'

  // KPIs / needs-attention stay on active catalog only (unchanged dashboard math).
  const summary = useMemo(() => buildStockDashboardSummary(activeCatalogItems), [activeCatalogItems])
  const ordersSummary = useMemo(() => buildStockOrdersOperationsSummary(stockOrders), [stockOrders])
  const todayActivityLine = useMemo(() => {
    const activity = buildTodayStockActivitySummary(activeCatalogItems, getCurrentDateKey())
    return formatTodayStockActivityLine(activity)
  }, [activeCatalogItems])
  const toOrderGroups = useMemo(
    () => buildToOrderSupplierGroups(activeCatalogItems),
    [activeCatalogItems],
  )
  const toCountGroups = useMemo(
    () => buildToCountStorageGroups(activeCatalogItems, { canManage }),
    [activeCatalogItems, canManage],
  )
  const categoryFilters = useMemo(() => getStockCategoryFilters(catalogItems), [catalogItems])

  const visibleItems = useMemo(() => {
    const filtered = filterStockDashboardItems(catalogItems, {
      categoryFilter,
      statusFilter,
      visibilityFilter: effectiveVisibilityFilter,
      searchTerm,
    })
    return sortStockDashboardItems(filtered, sortKey)
  }, [catalogItems, categoryFilter, statusFilter, effectiveVisibilityFilter, searchTerm, sortKey])

  const browseMatchCount = useMemo(() => {
    return filterStockDashboardItems(catalogItems, {
      categoryFilter,
      statusFilter: 'all',
      visibilityFilter: effectiveVisibilityFilter,
      searchTerm,
    }).length
  }, [catalogItems, categoryFilter, effectiveVisibilityFilter, searchTerm])

  const itemGroups = useMemo(() => {
    return groupStockDashboardItems(visibleItems, groupBy)
  }, [visibleItems, groupBy])

  const activeMenuItem = useMemo(() => {
    if (!openCardMenuId) return null
    return catalogItems.find((item) => item.id === openCardMenuId) ?? null
  }, [openCardMenuId, catalogItems])

  const hasNoItems = catalogItems.length === 0
  const hasNoMatches = !hasNoItems && visibleItems.length === 0

  const selectedItems = useMemo(() => {
    return visibleItems.filter((item) => selectedIds.has(item.id))
  }, [visibleItems, selectedIds])

  const activeHistoryItem = useMemo(() => {
    if (!historyItem?.id) return null
    return stockItems.find((item) => item.id === historyItem.id) ?? historyItem
  }, [historyItem, stockItems])

  const emptyState = useMemo(() => {
    // P8.17.1 — Never treat a failed load as a successful empty catalog.
    if (catalogLoadFailed) return null

    return getStockDashboardEmptyState({
      hasNoItems,
      hasNoMatches,
      statusFilter,
      visibilityFilter: effectiveVisibilityFilter,
      hasInactiveProducts,
      canManage,
    })
  }, [
    catalogLoadFailed,
    hasNoItems,
    hasNoMatches,
    statusFilter,
    effectiveVisibilityFilter,
    hasInactiveProducts,
    canManage,
  ])

  const exitSelectionMode = () => {
    setSelectionMode(false)
    setSelectedIds(new Set())
    setBulkModalField(null)
  }

  const toggleSelectionMode = () => {
    if (selectionMode) {
      exitSelectionMode()
      return
    }
    setOpenCardMenuId(null)
    setMenuAnchorEl(null)
    setSelectionMode(true)
  }

  const toggleItemSelection = (itemId) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(itemId)) {
        next.delete(itemId)
      } else {
        next.add(itemId)
      }
      return next
    })
  }

  const toggleSelectAllVisible = () => {
    setSelectedIds((current) => {
      const allVisibleSelected = visibleItems.every((item) => current.has(item.id))
      if (allVisibleSelected) return new Set()
      return new Set(visibleItems.map((item) => item.id))
    })
  }

  const handleBulkFieldSubmit = async (field, value) => {
    const updates = selectedItems.map((item) => ({
      id: item.id,
      payload: buildStockItemUpdatePayload(item, { [field]: value }),
    }))

    if (onBulkUpdateItems) {
      await onBulkUpdateItems(updates)
    } else {
      for (const update of updates) {
        await onUpdateItem(update.id, update.payload)
      }
    }

    setSelectedIds(new Set())
    setBulkModalField(null)
  }

  const handleExportSelected = () => {
    exportStockItemsToCsv(selectedItems)
  }

  const openCreateItem = () => {
    setEditingItem(null)
    setDuplicateForm(null)
    setIsItemModalOpen(true)
  }

  const openEditItem = (item) => {
    closeStockItemMenu()
    setEditingItem(item)
    setDuplicateForm(null)
    setIsItemModalOpen(true)
  }

  const openDuplicateItem = (item) => {
    closeStockItemMenu()
    setEditingItem(null)
    setDuplicateForm(stockItemToDuplicateForm(item))
    setIsItemModalOpen(true)
  }

  const openHistory = (item) => {
    closeStockItemMenu()
    setHistoryItem(item)
  }

  const openDeactivateItem = (item) => {
    if (!item?.id) return
    // Reactivate inactive products immediately (no deactivate confirm).
    if (item.active === false) {
      closeStockItemMenu()
      if (onReactivateItem) {
        Promise.resolve(onReactivateItem(item.id)).catch((error) => {
          console.warn('[StockDashboardView] Reactivate failed:', error)
        })
      }
      return
    }
    // Store the immutable selection before clearing menu state so confirm
    // does not depend on activeMenuItem (derived from openCardMenuId).
    setPendingDeactivateItem(item)
    closeStockItemMenu()
  }

  const openPermanentDeleteItem = (item) => {
    if (!item?.id || !canManage) return
    setPermanentDeleteFocusEl(menuAnchorEl)
    setPendingPermanentDeleteItem(item)
    closeStockItemMenu()
  }

  const handlePermanentDeleteCompleted = async (deleteResult) => {
    const deletedId = `${deleteResult?.deleted?.product?.id ?? pendingPermanentDeleteItem?.id ?? ''}`.trim()
    if (deletedId) {
      setRemovedItemIds((current) => {
        const next = new Set(current)
        next.add(deletedId)
        return next
      })
    }

    try {
      await onStockItemsChanged?.(deleteResult)
    } catch (refreshError) {
      console.warn('[StockDashboardView] Stock refresh after permanent delete failed:', refreshError)
    }
  }

  const handleConfirmDeactivateItem = async (item) => {
    if (!item?.id) {
      throw new Error('Unable to deactivate this product right now.')
    }
    if (!onDeactivateItem) {
      throw new Error('Unable to deactivate stock items right now.')
    }

    await onDeactivateItem(item.id)
    setPendingDeactivateItem(null)
  }

  const openMovement = (item, type) => {
    closeStockItemMenu()
    setMovementModal({ item, type })
  }

  const closeStockItemMenu = () => {
    setOpenCardMenuId(null)
    setMenuAnchorEl(null)
  }

  const toggleStockItemMenu = (itemId, anchorEl) => {
    if (openCardMenuId === itemId) {
      closeStockItemMenu()
      return
    }

    setMenuAnchorEl(anchorEl ?? null)
    setOpenCardMenuId(itemId)
  }

  const renderItemCard = (item) => (
    <StockItemCard
      key={item.id}
      item={item}
      canManage={canManage}
      selectionMode={selectionMode && canManage}
      isSelected={selectedIds.has(item.id)}
      onToggleSelect={() => toggleItemSelection(item.id)}
      isMenuOpen={openCardMenuId === item.id}
      onToggleMenu={(event) => toggleStockItemMenu(item.id, event.currentTarget)}
      onReceive={() => openMovement(item, 'receive')}
      onCount={() => openMovement(item, 'stock_count')}
      onOpenHistory={() => openHistory(item)}
    />
  )

  const renderGroupedItems = () => {
    if (visibleItems.length === 0) return null

    return (
      <div className={`stock-layout-output layout-${layoutMode}${groupBy !== 'none' ? ' is-grouped' : ''}`}>
        {itemGroups.map((group) => (
          <section
            key={group.key || 'all'}
            className="stock-group-section"
            aria-label={group.label || 'Stock products'}
          >
            {group.label ? (
              <header className="stock-group-header">
                <h3 className="stock-group-title">
                  {group.label}
                  <span className="stock-group-count">({group.items.length})</span>
                </h3>
              </header>
            ) : null}

            {layoutMode === 'cards' ? (
              <div className="stock-item-grid stock-item-grid-grouped">
                {group.items.map((item) => renderItemCard(item))}
              </div>
            ) : null}

            {layoutMode === 'list' ? (
              <StockListTable
                items={group.items}
                canManage={canManage}
                selectionMode={selectionMode}
                selectedIds={selectedIds}
                openCardMenuId={openCardMenuId}
                onToggleSelect={toggleItemSelection}
                onToggleMenu={toggleStockItemMenu}
                onReceive={(item) => openMovement(item, 'receive')}
                onCount={(item) => openMovement(item, 'stock_count')}
                onOpenHistory={openHistory}
                timeZone={timeZone}
              />
            ) : null}

            {layoutMode === 'compact' ? (
              <div className="stock-compact-list">
                {group.items.map((item) => (
                  <StockCompactRow
                    key={item.id}
                    item={item}
                    canManage={canManage}
                    selectionMode={selectionMode}
                    isSelected={selectedIds.has(item.id)}
                    onToggleSelect={() => toggleItemSelection(item.id)}
                    onCount={() => openMovement(item, 'stock_count')}
                    onOpenHistory={() => openHistory(item)}
                  />
                ))}
              </div>
            ) : null}
          </section>
        ))}
      </div>
    )
  }

  const allVisibleSelected = visibleItems.length > 0 && visibleItems.every((item) => selectedIds.has(item.id))
  const isStockActionBusy = isSaving || isSavingOrders

  // P8.17.3a / P8.17.3b / P8.17.3c — KPI cards toggle the same statusFilter used by All Products.
  // Scroll lands on the filtered-context header so the title/count stay visible on iPad.
  const applyKpiStatusFilter = (nextStatus) => {
    const nextFilter = statusFilter === nextStatus ? 'all' : nextStatus
    setCategoryFilter('All')
    setStatusFilter(nextFilter)
    if (nextFilter === 'all') return
    queueMicrotask(() => {
      document.getElementById('stock-filtered-context')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })
  }

  const clearStatusFilter = () => {
    setStatusFilter('all')
  }

  const isFilteredMode = statusFilter !== 'all'
  const filteredContextLabel = getStockStatusFilterLabel(statusFilter)
  const filteredProductCount = visibleItems.length

  const toCountTotal = toCountGroups.reduce((sum, group) => sum + group.count, 0)
  const visibleCountGroups = toCountGroups.slice(0, 4)
  const visibleCountSum = visibleCountGroups.reduce((sum, group) => sum + group.count, 0)
  const hiddenCountItems = Math.max(0, toCountTotal - visibleCountSum)
  const visibleOrderGroups = toOrderGroups.slice(0, 4)
  const hiddenOrderGroups = Math.max(0, toOrderGroups.length - visibleOrderGroups.length)
  const toOrderEstimate = sumSuggestedOrderCost(activeCatalogItems)
  const inactiveCount = catalogItems.filter((entry) => entry.active === false).length
  const inactiveNote = formatStockInactiveNote(inactiveCount)

  const categoryOptions = useMemo(
    () => categoryFilters.map((category) => ({ id: category, label: category })),
    [categoryFilters],
  )

  const compactBrowseToolbar = (
    <div
      className="stock-compact-browse-toolbar"
      data-stock-compact-browse-toolbar="true"
      aria-label="Stock catalog controls"
    >
      <button
        type="button"
        className="ghost-btn stock-browse-filters-toggle"
        aria-expanded={filtersOpen}
        aria-controls="stock-compact-browse-row"
        onClick={() => setFiltersOpen((open) => !open)}
      >
        Filters
      </button>
      <div
        id="stock-compact-browse-row"
        className={`stock-compact-browse-row${filtersOpen ? ' is-open' : ''}`}
        data-stock-compact-browse-row="true"
      >
        <div className="stock-browse-control stock-browse-category">
          <span className="stock-browse-control-label">Category</span>
          <StockSortDropdown
            value={categoryFilter}
            options={categoryOptions}
            onChange={setCategoryFilter}
            ariaLabel="Stock categories"
          />
        </div>

        {canManage ? (
          <div className="stock-browse-control stock-browse-visibility">
            <span className="stock-browse-control-label">Visibility</span>
            <div className="stock-status-filters stock-visibility-segment" role="tablist" aria-label="Product visibility">
              {STOCK_VISIBILITY_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="tab"
                  aria-selected={visibilityFilter === option.id}
                  className={`stock-status-filter stock-visibility-filter${visibilityFilter === option.id ? ' active' : ''}`}
                  onClick={() => setVisibilityFilter(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="stock-browse-control stock-browse-layout">
          <span className="sr-only" id="stock-layout-label">View</span>
          <div
            className="stock-layout-mode-control"
            role="group"
            aria-labelledby="stock-layout-label"
          >
            {STOCK_LAYOUT_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={`stock-layout-mode-btn${layoutMode === mode.id ? ' active' : ''}`}
                aria-pressed={layoutMode === mode.id}
                aria-label={mode.label}
                title={mode.label}
                onClick={() => setLayoutMode(mode.id)}
              >
                <StockLayoutModeIcon icon={mode.icon} />
                <span>{mode.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div
          className="stock-browse-refine-cluster"
          data-stock-browse-refine-cluster="true"
        >
          <div className="stock-browse-control stock-browse-group">
            <span className="stock-browse-control-label">Group by</span>
            <StockSortDropdown
              value={groupBy}
              options={STOCK_GROUP_BY_OPTIONS}
              onChange={setGroupBy}
              ariaLabel="Group stock items"
            />
          </div>

          <div className="stock-browse-control stock-browse-sort">
            <span className="stock-browse-control-label">Sort</span>
            <StockSortDropdown
              value={sortKey}
              options={STOCK_SORT_OPTIONS}
              onChange={setSortKey}
              ariaLabel="Sort stock items"
            />
          </div>

          {!isLoading && browseMatchCount > 0 ? (
            <p className="stock-browse-result-count" aria-live="polite">
              Showing {visibleItems.length} of {browseMatchCount} product{browseMatchCount === 1 ? '' : 's'}
            </p>
          ) : null}
        </div>
      </div>

      {canManage ? (
        <div className="stock-compact-actions-row stock-toolbar-actions" data-stock-compact-actions-row="true">
          {onPrepareDrafts ? (
            <button
              type="button"
              className="primary-btn stock-prepare-drafts-btn"
              onClick={() => { void onPrepareDrafts() }}
              disabled={!isWorkspaceReady || isStockActionBusy}
            >
              <StockActionIcon name="bag" />
              <span>{isSavingOrders ? 'Saving…' : 'Suggest order'}</span>
            </button>
          ) : null}
          <button
            type="button"
            className={`${onPrepareDrafts ? 'secondary-btn' : 'primary-btn'} stock-add-item-btn`}
            onClick={openCreateItem}
            disabled={!isWorkspaceReady || isStockActionBusy}
          >
            <StockActionIcon name="plus" />
            <span>Add item</span>
          </button>
          {selectionMode ? (
            <button
              type="button"
              className="secondary-btn stock-select-mode-btn active"
              onClick={toggleSelectionMode}
              disabled={isStockActionBusy}
            >
              Done
            </button>
          ) : null}
          <div className="stock-catalog-more">
            <button
              type="button"
              className="ghost-btn stock-catalog-more-btn"
              aria-label="More catalog actions"
              aria-expanded={catalogMoreOpen}
              aria-haspopup="menu"
              onClick={() => setCatalogMoreOpen((open) => !open)}
              disabled={isStockActionBusy}
            >
              <StockActionIcon name="more" />
            </button>
            {catalogMoreOpen ? (
              <>
                <button
                  type="button"
                  className="stock-catalog-more-backdrop"
                  aria-label="Close catalog menu"
                  onClick={() => setCatalogMoreOpen(false)}
                />
                <div className="stock-catalog-more-menu" role="menu">
                  <button
                    type="button"
                    className="stock-catalog-more-option stock-create-order-btn"
                    role="menuitem"
                    onClick={() => {
                      setCatalogMoreOpen(false)
                      setIsCreateOrderModalOpen(true)
                    }}
                    disabled={!isWorkspaceReady || isStockActionBusy}
                  >
                    {isSavingOrders ? 'Saving…' : 'Create order'}
                  </button>
                  <button
                    type="button"
                    className="stock-catalog-more-option stock-usage-report-btn"
                    role="menuitem"
                    onClick={() => {
                      setCatalogMoreOpen(false)
                      setUsageReportOpen(true)
                    }}
                    disabled={!isWorkspaceReady || isStockActionBusy}
                  >
                    Usage report
                  </button>
                  <button
                    type="button"
                    className="stock-catalog-more-option stock-select-mode-btn"
                    role="menuitem"
                    onClick={() => {
                      setCatalogMoreOpen(false)
                      toggleSelectionMode()
                    }}
                    disabled={isStockActionBusy}
                  >
                    {selectionMode ? 'Done' : 'Select'}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )

  return (
    <section className="stock-dashboard-page" aria-label="Stock dashboard">
      {noticeMessage && !catalogLoadFailed ? <div className="staff-status-banner">{noticeMessage}</div> : null}
      {!isWorkspaceReady && workspaceSetupMessage ? (
        <div className="staff-status-banner">{workspaceSetupMessage}</div>
      ) : null}
      {isLoading ? (
        <div className="stock-loading-skeleton" role="status" aria-busy="true">
          <span className="stock-loading-skeleton-bar" />
          <span className="stock-loading-skeleton-bar is-short" />
          <span className="sr-only">Loading stock…</span>
        </div>
      ) : null}

      {catalogLoadFailed && !isLoading ? (
        <div className="stock-empty-state panel staff-panel stock-catalog-load-failed" role="alert">
          <h4>Stock couldn&apos;t be loaded</h4>
          <p>Check your connection and try again.</p>
          <button
            type="button"
            className="primary-btn"
            onClick={() => onRetryCatalogLoad?.()}
            disabled={typeof onRetryCatalogLoad !== 'function'}
          >
            Retry
          </button>
        </div>
      ) : null}

      <header className="stock-calm-header">
        <div>
          <p className="stock-calm-kicker">Inventory</p>
          <h2 className="stock-calm-title">
            {isLoading ? '—' : summary.totalItems}
            <span> items</span>
          </h2>
          {!isLoading && inactiveNote ? (
            <p className="stock-calm-inactive-note">{inactiveNote}</p>
          ) : null}
        </div>
        {canManage ? (
          <p className="stock-calm-value">
            <strong>{isLoading ? '—' : formatStockInventoryValue(summary.totalValue)}</strong>
            <span>inventory value</span>
          </p>
        ) : null}
      </header>

      {!isLoading && !catalogLoadFailed ? (
        <section className="stock-today-board" aria-label="What to do today" data-stock-widget-density="dense">
          <div className="stock-today-kpis">
            <StockSummaryCard
              label="Low"
              value={summary.lowStock}
              tone={summary.lowStock > 0 ? 'warning' : 'default'}
              isInteractive
              isSelected={statusFilter === 'low'}
              onClick={() => applyKpiStatusFilter('low')}
            />
            <StockSummaryCard
              label="Out of stock"
              value={summary.outOfStock}
              tone={summary.outOfStock > 0 ? 'danger' : 'default'}
              isInteractive
              isSelected={statusFilter === 'out'}
              onClick={() => applyKpiStatusFilter('out')}
            />
            <StockSummaryCard
              label="To order"
              value={summary.toOrder}
              tone={summary.toOrder > 0 ? 'warning' : 'default'}
              isInteractive
              isSelected={statusFilter === 'order'}
              onClick={() => applyKpiStatusFilter('order')}
            />
          </div>
          <article className="stock-today-card" aria-label="To order">
            <header className="stock-today-card-header">
              <h3>To order</h3>
              <p>
                {formatToOrderBreakdown(activeCatalogItems, summary)}
                {toOrderEstimate > 0 ? ` · Est. ${formatStockPurchasePrice(toOrderEstimate)}` : ''}
              </p>
            </header>
            {visibleOrderGroups.length > 0 ? (
              <ul className="stock-today-groups">
                {visibleOrderGroups.map((group) => (
                  <li key={group.supplier}>
                    <span>{group.supplier}</span>
                    <span>{group.count}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="stock-today-card-empty">Nothing to order.</p>
            )}
            {hiddenOrderGroups > 0 ? (
              <p className="stock-today-card-more">+{hiddenOrderGroups} more supplier{hiddenOrderGroups === 1 ? '' : 's'}</p>
            ) : null}
            <div className="stock-today-links">
              {stockLiveSnapshot?.parsReady && Number(stockLiveSnapshot.belowParCount) > 0 ? (
                <button type="button" className="stock-text-btn" onClick={onOpenBelowPar}>
                  Shelf levels
                </button>
              ) : null}
              {ordersSummary.draftCount > 0 && typeof onOpenDrafts === 'function' ? (
                <button type="button" className="stock-text-btn" onClick={onOpenDrafts}>
                  Review order
                </button>
              ) : null}
              {ordersSummary.pendingCount > 0 && typeof onOpenOrders === 'function' ? (
                <button type="button" className="stock-text-btn" onClick={() => onOpenOrders('all')}>
                  View orders
                </button>
              ) : null}
            </div>
          </article>

          <article className="stock-today-card" aria-label="To count">
            <header className="stock-today-card-header">
              <h3>To count</h3>
              <p>
                {toCountTotal === 0
                  ? 'Nothing waiting'
                  : `${toCountTotal} ${toCountTotal === 1 ? 'item' : 'items'} to count`}
              </p>
            </header>
            {visibleCountGroups.length > 0 ? (
              <ul className="stock-today-groups">
                {visibleCountGroups.map((group) => (
                  <li key={group.storage}>
                    <span>{group.storage}</span>
                    <span>{group.count}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="stock-today-card-empty">Only items not counted in the last 14 days show here.</p>
            )}
            {hiddenCountItems > 0 ? (
              <p className="stock-today-card-more">+{hiddenCountItems} in other storages</p>
            ) : null}
            {typeof onOpenCounts === 'function' && toCountTotal > 0 ? (
              <button type="button" className="stock-text-btn" onClick={onOpenCounts}>
                <StockActionIcon name="clipboard" />
                <span>Start count</span>
              </button>
            ) : null}
          </article>

          {!isFilteredMode && stockItems.length > 0 ? (
            <StockTodayActivitySection activityLine={todayActivityLine} />
          ) : null}
        </section>
      ) : null}

      <div
        id="stock-all-products-catalog"
        className={`stock-all-products-catalog${isFilteredMode ? ' is-filtered-mode' : ''}`}
        aria-label="All products catalog"
      >
      {isFilteredMode ? (
        <header
          id="stock-filtered-context"
          className="stock-filtered-context"
          aria-label="Filtered stock results"
        >
          <div className="stock-filtered-context-main">
            <div className="stock-filtered-context-copy">
              <h3 className="stock-filtered-context-title">{filteredContextLabel}</h3>
              <p className="stock-filtered-context-count">
                {filteredProductCount} product{filteredProductCount === 1 ? '' : 's'}
              </p>
            </div>
            <button
              type="button"
              className="ghost-btn stock-filtered-context-clear"
              onClick={clearStatusFilter}
            >
              Clear filter
            </button>
          </div>
        </header>
      ) : null}

      {/*
        P8.24.3 — Shared compact ≤2-row browse toolbar (filtered + unfiltered).
        Status path remains KPI cards + filtered context Clear filter.
      */}
      {compactBrowseToolbar}

      {selectionMode && canManage ? (
        <div className="stock-selection-bar">
          <button
            type="button"
            className="ghost-btn stock-selection-bar-btn"
            onClick={toggleSelectAllVisible}
          >
            {allVisibleSelected ? 'Deselect all' : 'Select all visible'}
          </button>
          <span className="stock-selection-bar-count">
            {selectedItems.length} selected
          </span>
        </div>
      ) : null}

      {selectionMode && canManage && selectedItems.length > 0 ? (
        <div className="stock-bulk-toolbar" aria-label="Bulk actions">
          <p className="stock-bulk-toolbar-label">
            Selected: <strong>{selectedItems.length}</strong> product{selectedItems.length === 1 ? '' : 's'}
          </p>
          <div className="stock-bulk-toolbar-actions">
            <div
              className="stock-bulk-action-cluster"
              data-stock-bulk-edit-cluster="true"
              aria-label="Bulk edit fields"
            >
              <button type="button" className="ghost-btn stock-bulk-action-btn" onClick={() => setBulkModalField('supplier')} disabled={isStockActionBusy}>
                Change supplier
              </button>
              <button type="button" className="ghost-btn stock-bulk-action-btn" onClick={() => setBulkModalField('storageLocation')} disabled={isStockActionBusy}>
                Change location
              </button>
              <button type="button" className="ghost-btn stock-bulk-action-btn" onClick={() => setBulkModalField('category')} disabled={isStockActionBusy}>
                Change category
              </button>
              <button type="button" className="ghost-btn stock-bulk-action-btn" onClick={() => setBulkModalField('itemType')} disabled={isStockActionBusy}>
                Change type
              </button>
            </div>
            <div
              className="stock-bulk-action-cluster is-utility"
              data-stock-bulk-utility-cluster="true"
              aria-label="Bulk utilities"
            >
              <button type="button" className="ghost-btn stock-bulk-action-btn" onClick={handleExportSelected} disabled={isStockActionBusy}>
                Export selected
              </button>
              <button type="button" className="ghost-btn stock-bulk-action-btn" onClick={() => setSelectedIds(new Set())} disabled={isStockActionBusy}>
                Clear
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {emptyState && !isLoading ? (
        <div className="stock-empty-state panel staff-panel">
          <h4>{emptyState.title}</h4>
          <p>{emptyState.message}</p>
          {emptyState.showAddButton && canManage ? (
            <button
              type="button"
              className="primary-btn"
              onClick={openCreateItem}
              disabled={!isWorkspaceReady}
            >
              <StockActionIcon name="plus" />
              <span>Add item</span>
            </button>
          ) : null}
        </div>
      ) : null}

      {!isFilteredMode && !emptyState && visibleItems.length > 0 && !isLoading ? (
        <header className="stock-all-products-header">
          <h3 className="stock-all-products-title">All products</h3>
        </header>
      ) : null}

      {renderGroupedItems()}
      </div>


      {bulkModalField ? (
        <StockBulkFieldModal
          field={bulkModalField}
          selectedItems={selectedItems}
          workspaceId={workspaceId}
          onClose={() => setBulkModalField(null)}
          isSaving={isSaving}
          onSubmit={handleBulkFieldSubmit}
        />
      ) : null}

      {activeHistoryItem ? (
        <StockProductHistoryDrawer
          item={activeHistoryItem}
          workspaceId={workspaceId}
          timeZone={timeZone}
          canManage={canManage}
          showCost={canManage}
          onClose={() => setHistoryItem(null)}
          onReceive={() => {
            const item = activeHistoryItem
            setHistoryItem(null)
            openMovement(item, 'receive')
          }}
          onStockCount={() => {
            const item = activeHistoryItem
            setHistoryItem(null)
            openMovement(item, 'stock_count')
          }}
          onEdit={() => {
            const item = activeHistoryItem
            setHistoryItem(null)
            openEditItem(item)
          }}
        />
      ) : null}

      {usageReportOpen && canManage ? (
        <StockUsageCostReport
          workspaceId={workspaceId}
          items={catalogItems}
          timeZone={timeZone}
          onClose={() => setUsageReportOpen(false)}
        />
      ) : null}

      {movementModal ? (
        <StockDashboardMovementDialog
          item={movementModal.item}
          movementType={movementModal.type}
          workspaceId={workspaceId}
          onClose={() => setMovementModal(null)}
          isSaving={isSaving}
          onSubmit={onRecordMovement}
        />
      ) : null}

      {activeMenuItem && menuAnchorEl ? (
        <StockItemMoreMenu
          isOpen
          anchorEl={menuAnchorEl}
          onClose={closeStockItemMenu}
          item={activeMenuItem}
          itemName={buildProductDisplayNameFromItem(activeMenuItem) || activeMenuItem.name}
          onUsage={() => openMovement(activeMenuItem, 'usage')}
          onWaste={() => openMovement(activeMenuItem, 'waste')}
          onAdjust={() => openMovement(activeMenuItem, 'adjustment')}
          onEdit={() => openEditItem(activeMenuItem)}
          onDuplicate={() => openDuplicateItem(activeMenuItem)}
          onHistory={() => openHistory(activeMenuItem)}
          onDeactivate={openDeactivateItem}
          onPermanentlyDelete={openPermanentDeleteItem}
          onReceive={() => openMovement(activeMenuItem, 'receive')}
          onCount={() => openMovement(activeMenuItem, 'stock_count')}
        />
      ) : null}

      {pendingDeactivateItem ? (
        <StockItemDeactivateConfirmModal
          item={pendingDeactivateItem}
          isSaving={isSaving}
          onClose={() => {
            if (isSaving) return
            setPendingDeactivateItem(null)
          }}
          onConfirm={handleConfirmDeactivateItem}
        />
      ) : null}

      {pendingPermanentDeleteItem && canManage && workspaceId ? (
        <StockItemPermanentDeleteDialog
          workspaceId={workspaceId}
          item={pendingPermanentDeleteItem}
          returnFocusEl={permanentDeleteFocusEl}
          onClose={() => {
            setPendingPermanentDeleteItem(null)
            setPermanentDeleteFocusEl(null)
          }}
          onCompleted={handlePermanentDeleteCompleted}
          onOpenBlockingInventoryCount={onOpenInventoryCountSession}
        />
      ) : null}

      {isCreateOrderModalOpen && onCreateOrders ? (
        <StockCreateOrderModal
          stockItems={stockItems}
          onClose={() => setIsCreateOrderModalOpen(false)}
          onSubmit={onCreateOrders}
          isSaving={isSavingOrders}
        />
      ) : null}

      {isItemModalOpen ? (
        <StockItemFormModal
          initialItem={editingItem}
          initialForm={duplicateForm}
          onClose={() => {
            setIsItemModalOpen(false)
            setEditingItem(null)
            setDuplicateForm(null)
          }}
          isSaving={isSaving}
          workspaceId={workspaceId}
          isWorkspaceReady={isWorkspaceReady}
          workspaceSetupMessage={workspaceSetupMessage}
          suppliers={suppliers}
          canManage={canManage}
          onOpenAddSupplier={onOpenAddSupplier}
          supplierPrefill={supplierPrefill}
          onSupplierPrefillApplied={onSupplierPrefillApplied}
          onSubmit={async (payload, extras) => {
            if (editingItem?.id) {
              await onUpdateItem(editingItem.id, payload)
            } else {
              await onCreateItem(payload, extras)
            }
          }}
        />
      ) : null}
    </section>
  )
}

export { STOCK_MOVEMENT_TYPES }
