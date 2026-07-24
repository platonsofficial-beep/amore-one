import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  formatStockCategoryTypeLine,
  resolveStockItemType,
  resolveStockStorageLocation,
  stockItemToDuplicateForm,
  STOCK_CATEGORIES,
  STOCK_LOCATIONS,
} from '../../lib/stockCatalog'
import {
  buildStockItemUpdatePayload,
  exportStockItemsToCsv,
  getBulkTypeOptionsForItems,
} from '../../lib/stockBulkActions'
import {
  filterStockDashboardItems,
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
  buildStockNeedsAttentionGroups,
  getStockDashboardEmptyState,
  getStockItemInsights,
  sliceStockNeedsAttentionGroupItems,
  STOCK_NEEDS_ATTENTION_PREVIEW_LIMIT,
} from '../../lib/stockInsights'
import {
  buildStockDashboardSummary,
  buildTodayStockActivitySummary,
  formatStockInventoryValue,
  formatStockMovementRelativeTime,
  formatStockQuantity,
  formatTodayStockActivityLine,
  getStockCategoryFilters,
  getStockMovementLabel,
  getStockStatusLabel,
  getStockStatusShortLabel,
  STOCK_MOVEMENT_TYPES,
} from '../../lib/stockUtils'
import { getCurrentDateKey } from '../../lib/currentDateUtils'
import { buildStockOrdersOperationsSummary } from '../../lib/stockOrderUtils'
import { StockCreateOrderModal } from './StockCreateOrderModal'
import { StockItemFormModal } from './StockItemFormModal'
import { StockImportModal } from './StockImportModal'
import { InventoryImportWizardShell } from './InventoryImportWizardShell'
import { StockItemMoreMenu } from './StockItemMoreMenu'
import { StockItemPermanentDeleteDialog } from './StockItemPermanentDeleteDialog'
import { StockProductHistoryDrawer } from './StockProductHistoryDrawer'

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

function StockSortDropdown({ value, options, onChange }) {
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
        aria-label="Sort stock items"
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

  const handleCardClick = () => {
    if (selectionMode) {
      onToggleSelect?.()
    }
  }

  return (
    <article
      className={`stock-item-card panel staff-panel tone-${item.status}${item.status === 'low' || item.status === 'out' ? ' is-alert' : ''}${item.active === false ? ' is-inactive' : ''}${selectionMode ? ' is-selectable' : ''}${isSelected ? ' is-selected' : ''}${isMenuOpen ? ' is-menu-open' : ''}`}
      onClick={selectionMode ? handleCardClick : undefined}
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
            aria-label={isSelected ? `Deselect ${item.name}` : `Select ${item.name}`}
          >
            {isSelected ? '✓' : ''}
          </button>
        ) : null}
        <div className="stock-item-card-title-block">
          <h3 className="stock-item-name">{item.name}</h3>
          {item.active === false ? (
            <span className="stock-item-status-badge tone-muted">Inactive</span>
          ) : (
            <span className={`stock-item-status-badge tone-${item.status}`}>
              {getStockStatusShortLabel(item.status)}
            </span>
          )}
        </div>
      </header>

      <p className="stock-item-category-type">
        {formatStockCategoryTypeLine(item.category, itemType)}
      </p>

      <div className="stock-item-meta-lines">
        <p className="stock-item-meta-line">
          <span className="stock-item-meta-label">Supplier</span>
          <span>{supplierLabel || '—'}</span>
        </p>
        <p className="stock-item-meta-line">
          <span className="stock-item-meta-label">Location</span>
          <span>{location}</span>
        </p>
      </div>

      {insights.length > 0 ? (
        <div className="stock-item-insights" aria-label="Stock insights">
          {insights.map((insight) => (
            <span key={insight.id} className={`stock-item-insight tone-${insight.tone}`}>
              {insight.label}
            </span>
          ))}
        </div>
      ) : null}

      <div className="stock-item-hero">
        <span className="stock-item-hero-label">On hand</span>
        <p className={`stock-item-hero-qty${item.status === 'out' || item.status === 'low' ? ` tone-${item.status}` : ''}`}>
          {formatStockQuantity(item.currentQuantity, item.unit)}
        </p>
        {item.status === 'low' || item.status === 'out' ? (
          <p className="stock-item-qty-context">
            Min {formatStockQuantity(item.minimumQuantity, item.unit)}
            {item.status === 'out' ? ' · needs restock' : ' · below minimum'}
          </p>
        ) : null}
      </div>

      <div className="stock-item-secondary">
        <div className="stock-item-minimum">
          <span className="stock-item-minimum-label">MINIMUM</span>
          <strong className="stock-item-minimum-value">
            {formatStockQuantity(item.minimumQuantity, item.unit)}
          </strong>
        </div>
      </div>

      {canManage ? (
        <div className="stock-item-card-footer">
          <div className={`stock-item-actions-wrap${isMenuOpen ? ' is-menu-open' : ''}`}>
          <div className="stock-item-actions">
            <button type="button" className="ghost-btn stock-item-action-primary" onClick={(event) => { event.stopPropagation(); onReceive() }}>
              Receive
            </button>
            <button type="button" className="ghost-btn stock-item-action-primary" onClick={(event) => { event.stopPropagation(); onCount() }}>
              Stock count
            </button>
            <button
              type="button"
              className={`ghost-btn stock-item-more-btn${isMenuOpen ? ' is-open' : ''}`}
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

function formatLastMovementCell(item) {
  const movement = item.lastMovement
  if (!movement?.type) return '—'
  const label = getStockMovementLabel(movement.type)
  const when = movement.createdAt ? formatStockMovementRelativeTime(movement.createdAt) : ''
  return when ? `${label} · ${when}` : label
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
  if (!canManage) {
    return (
      <button type="button" className="ghost-btn stock-row-action-btn" onClick={onOpenHistory}>
        Details
      </button>
    )
  }

  return (
    <div className={`stock-row-actions-wrap${isMenuOpen ? ' is-menu-open' : ''}${compact ? ' is-compact' : ''}`}>
      <div className={`stock-row-actions${compact ? ' is-compact' : ''}`}>
        {!compact ? (
          <button type="button" className="ghost-btn stock-row-action-btn" onClick={onReceive}>
            Receive
          </button>
        ) : null}
        <button type="button" className="ghost-btn stock-row-action-btn" onClick={onCount}>
          Stock count
        </button>
        {!compact ? (
          <button
            type="button"
            className={`ghost-btn stock-row-more-btn${isMenuOpen ? ' is-open' : ''}`}
            onClick={onToggleMenu}
            aria-expanded={isMenuOpen}
            aria-haspopup="menu"
            aria-label={`More actions for ${item.name}`}
          >
            ⋯
          </button>
        ) : null}
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
}) {
  const itemType = resolveStockItemType(item)
  const location = resolveStockStorageLocation(item)
  const supplierLabel = `${item.supplier ?? ''}`.trim() || '—'

  return (
    <tr className={`stock-list-row tone-${item.status}${item.active === false ? ' is-inactive' : ''}${isSelected ? ' is-selected' : ''}${isMenuOpen ? ' is-menu-open' : ''}`}>
      {selectionMode && canManage ? (
        <td className="stock-list-cell stock-list-cell-select">
          <button
            type="button"
            className={`stock-item-select-btn stock-list-select-btn${isSelected ? ' is-selected' : ''}`}
            onClick={onToggleSelect}
            aria-pressed={isSelected}
            aria-label={isSelected ? `Deselect ${item.name}` : `Select ${item.name}`}
          >
            {isSelected ? '✓' : ''}
          </button>
        </td>
      ) : null}
      <th scope="row" className="stock-list-cell stock-list-cell-product">
        <span className="stock-list-product-name">{item.name}</span>
      </th>
      <td className="stock-list-cell">{formatStockCategoryTypeLine(item.category, itemType)}</td>
      <td className="stock-list-cell">{supplierLabel}</td>
      <td className="stock-list-cell">{location}</td>
      <td className={`stock-list-cell stock-list-cell-qty${item.status === 'out' || item.status === 'low' ? ` is-${item.status}` : ''}`}>
        <strong>{formatStockQuantity(item.currentQuantity, item.unit)}</strong>
      </td>
      <td className="stock-list-cell stock-list-cell-qty stock-list-cell-min">
        {formatStockQuantity(item.minimumQuantity, item.unit)}
      </td>
      <td className="stock-list-cell">
        <span className={`stock-item-status-badge tone-${item.status}`}>
          {getStockStatusShortLabel(item.status)}
        </span>
      </td>
      <td className="stock-list-cell stock-list-cell-movement">{formatLastMovementCell(item)}</td>
      <td className="stock-list-cell stock-list-cell-actions">
        <StockItemRowActions
          item={item}
          canManage={canManage}
          isMenuOpen={isMenuOpen}
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
}) {
  const itemType = resolveStockItemType(item)
  const location = resolveStockStorageLocation(item)
  const supplierLabel = `${item.supplier ?? ''}`.trim() || '—'

  return (
    <article className={`stock-list-mobile-card panel staff-panel tone-${item.status}${isSelected ? ' is-selected' : ''}`}>
      <header className="stock-list-mobile-header">
        {selectionMode && canManage ? (
          <button
            type="button"
            className={`stock-item-select-btn${isSelected ? ' is-selected' : ''}`}
            onClick={onToggleSelect}
            aria-pressed={isSelected}
            aria-label={isSelected ? `Deselect ${item.name}` : `Select ${item.name}`}
          >
            {isSelected ? '✓' : ''}
          </button>
        ) : null}
        <div className="stock-list-mobile-title-wrap">
          <h3 className="stock-list-mobile-name">{item.name}</h3>
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
          <dd>{formatLastMovementCell(item)}</dd>
        </div>
      </dl>

      <div className="stock-list-mobile-actions">
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
}) {
  return (
    <>
      <div className="stock-list-table-wrap stock-list-desktop">
        <table className="stock-list-table">
          <thead>
            <tr>
              {selectionMode && canManage ? (
                <th scope="col" className="stock-list-head-select"><span className="sr-only">Select</span></th>
              ) : null}
              <th scope="col">Product</th>
              <th scope="col">Category / Type</th>
              <th scope="col">Supplier</th>
              <th scope="col">Location</th>
              <th scope="col">Current stock</th>
              <th scope="col">Minimum</th>
              <th scope="col">Status</th>
              <th scope="col">Last movement</th>
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

  return (
    <article
      className={`stock-compact-row panel staff-panel tone-${item.status}${isSelected ? ' is-selected' : ''}`}
    >
      {selectionMode && canManage ? (
        <button
          type="button"
          className={`stock-item-select-btn${isSelected ? ' is-selected' : ''}`}
          onClick={onToggleSelect}
          aria-pressed={isSelected}
          aria-label={isSelected ? `Deselect ${item.name}` : `Select ${item.name}`}
        >
          {isSelected ? '✓' : ''}
        </button>
      ) : null}
      <div className="stock-compact-copy">
        <h3 className="stock-compact-name">{item.name}</h3>
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
      <div className="stock-compact-actions">
        {canManage ? (
          <button type="button" className="ghost-btn stock-compact-count-btn" onClick={onCount}>
            Quick stock count
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

function StockAttentionRow({
  item,
  groupId,
  canManage,
  onReceive,
  onCount,
  onEdit,
}) {
  const itemType = resolveStockItemType(item)
  const location = resolveStockStorageLocation(item)
  const showReceive = groupId === 'out' || groupId === 'low'
  const showCount = groupId === 'out' || groupId === 'low' || groupId === 'count'
  const showEdit = groupId === 'data'
  const showStockLevels = groupId === 'out' || groupId === 'low'

  return (
    <li className={`stock-attention-row tone-${item.status}`}>
      <div className="stock-attention-copy">
        <p className="stock-attention-name">{item.name}</p>
        {showStockLevels ? (
          <span className={`stock-item-status-badge stock-attention-status-badge tone-${item.status}`}>
            {getStockStatusLabel(item.status)}
          </span>
        ) : null}
        <p className="stock-attention-meta">
          {formatStockCategoryTypeLine(item.category, itemType)} · {location}
        </p>
        {showStockLevels ? (
          <p className="stock-attention-qty">
            <span className={`stock-attention-qty-current tone-${item.status}`}>
              {formatStockQuantity(item.currentQuantity, item.unit)}
            </span>
            <span className="stock-attention-qty-separator" aria-hidden="true">/</span>
            <span className="stock-attention-qty-min">
              min {formatStockQuantity(item.minimumQuantity, item.unit)}
            </span>
          </p>
        ) : (
          <p className="stock-attention-qty">
            {formatStockQuantity(item.currentQuantity, item.unit)}
          </p>
        )}
      </div>

      {canManage ? (
        <div className="stock-attention-actions" aria-label={`Actions for ${item.name}`}>
          {showReceive ? (
            <button type="button" className="ghost-btn stock-attention-action-btn" onClick={onReceive}>
              Receive
            </button>
          ) : null}
          {showCount ? (
            <button type="button" className="ghost-btn stock-attention-action-btn" onClick={onCount}>
              Stock count
            </button>
          ) : null}
          {showEdit ? (
            <button type="button" className="ghost-btn stock-attention-action-btn" onClick={onEdit}>
              Edit
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

function StockTodayActivitySection({ activityLine }) {
  if (!activityLine) return null

  return (
    <section className="stock-today-activity panel staff-panel" aria-label="Today's stock activity">
      <header className="stock-today-activity-header">
        <h3 className="stock-today-activity-title">What changed today</h3>
        <p className="stock-today-activity-line">{activityLine}</p>
      </header>
    </section>
  )
}

function StockOperationsBanner({
  ordersSummary,
  criticalStockCount,
  canManage = false,
  onOpenOrders,
}) {
  const { draftCount, awaitingDeliveryCount, partialCount, pendingCount } = ordersSummary
  const hasCriticalStock = criticalStockCount > 0
  const hasPendingOrders = pendingCount > 0

  if (!hasCriticalStock && !hasPendingOrders) return null

  return (
    <section className="stock-operations-banner panel staff-panel" aria-label="Today's stock actions">
      <header className="stock-operations-banner-header">
        <h3 className="stock-operations-banner-title">Today&apos;s stock actions</h3>
        <p className="stock-operations-banner-subtitle">
          {hasCriticalStock && hasPendingOrders
            ? `${criticalStockCount} critical item${criticalStockCount === 1 ? '' : 's'} · ${pendingCount} open order${pendingCount === 1 ? '' : 's'}`
            : hasCriticalStock
              ? `${criticalStockCount} item${criticalStockCount === 1 ? '' : 's'} need restocking`
              : `${pendingCount} supplier order${pendingCount === 1 ? '' : 's'} need attention`}
        </p>
      </header>

      <div className="stock-operations-banner-actions">
        {canManage && awaitingDeliveryCount > 0 ? (
          <button
            type="button"
            className="primary-btn stock-operations-action-btn"
            onClick={() => onOpenOrders?.('sent')}
          >
            Receive {awaitingDeliveryCount} deliver{awaitingDeliveryCount === 1 ? 'y' : 'ies'}
          </button>
        ) : null}
        {canManage && partialCount > 0 ? (
          <button
            type="button"
            className="primary-btn stock-operations-action-btn"
            onClick={() => onOpenOrders?.('sent')}
          >
            Continue {partialCount} partial order{partialCount === 1 ? '' : 's'}
          </button>
        ) : null}
        {canManage && draftCount > 0 ? (
          <button
            type="button"
            className="ghost-btn stock-operations-action-btn"
            onClick={() => onOpenOrders?.('draft')}
          >
            Review {draftCount} draft{draftCount === 1 ? '' : 's'}
          </button>
        ) : null}
        {hasPendingOrders ? (
          <button
            type="button"
            className="ghost-btn stock-operations-action-btn"
            onClick={() => onOpenOrders?.('all')}
          >
            View all orders
          </button>
        ) : null}
      </div>
    </section>
  )
}

function StockNeedsAttentionSection({
  groups,
  canManage,
  onReceive,
  onCount,
  onEdit,
}) {
  // P8.17.3 — each attention group owns its own expand/collapse state.
  const [expandedGroupIds, setExpandedGroupIds] = useState(() => new Set())
  const totalCount = groups.reduce((sum, group) => sum + group.items.length, 0)

  const toggleGroupExpanded = (groupId) => {
    setExpandedGroupIds((current) => {
      const next = new Set(current)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  const presentedGroups = groups.map((group) => {
    const expanded = expandedGroupIds.has(group.id)
    const { visibleItems, hiddenCount } = sliceStockNeedsAttentionGroupItems(group.items, {
      limit: STOCK_NEEDS_ATTENTION_PREVIEW_LIMIT,
      expanded,
    })
    const canToggle = (group.items?.length ?? 0) > STOCK_NEEDS_ATTENTION_PREVIEW_LIMIT
    return {
      ...group,
      expanded,
      visibleItems,
      hiddenCount,
      canToggle,
    }
  })

  const anyCollapsedWithHidden = presentedGroups.some(
    (group) => !group.expanded && group.hiddenCount > 0,
  )

  return (
    <section className="stock-needs-attention panel staff-panel" aria-label="Needs attention">
      <header className="stock-needs-attention-header">
        <div>
          <h3 className="stock-needs-attention-title">Needs attention</h3>
          <p className="stock-needs-attention-subtitle">
            {totalCount} product{totalCount === 1 ? '' : 's'} may need attention.
            {anyCollapsedWithHidden
              ? ` Showing top ${STOCK_NEEDS_ATTENTION_PREVIEW_LIMIT} per group.`
              : ''}
          </p>
        </div>
      </header>

      <div className="stock-attention-groups">
        {presentedGroups.map((group) => (
          <section key={group.id} className={`stock-attention-group tone-${group.tone}`} aria-label={group.label}>
            <h4 className="stock-attention-group-title">
              {group.label}
              <span className="stock-attention-group-count">({group.items.length})</span>
            </h4>
            <ul className="stock-attention-list">
              {group.visibleItems.map((item) => (
                <StockAttentionRow
                  key={item.id}
                  item={item}
                  groupId={group.id}
                  canManage={canManage}
                  onReceive={() => onReceive(item)}
                  onCount={() => onCount(item)}
                  onEdit={() => onEdit(item)}
                />
              ))}
            </ul>
            {group.canToggle ? (
              <button
                type="button"
                className="ghost-btn stock-attention-group-toggle"
                aria-expanded={group.expanded}
                onClick={() => toggleGroupExpanded(group.id)}
              >
                {group.expanded
                  ? 'Show less'
                  : `Show all ${group.items.length}`}
              </button>
            ) : null}
          </section>
        ))}
      </div>
    </section>
  )
}

function StockMovementModal({
  item,
  movementType,
  onClose,
  onSubmit,
  isSaving,
}) {
  const isStockCount = movementType === 'stock_count'
  const [quantity, setQuantity] = useState(
    () => (isStockCount ? `${item.currentQuantity ?? ''}` : ''),
  )
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isBusy = isSaving || isSubmitting

  useEffect(() => {
    if (isStockCount) {
      setQuantity(`${item.currentQuantity ?? ''}`)
    } else {
      setQuantity('')
    }
    setNote('')
    setError('')
  }, [item, movementType, isStockCount])

  const handleDismiss = () => {
    if (isBusy) return
    onClose()
  }

  const title = movementType === 'receive'
    ? 'Receive stock'
    : movementType === 'usage'
      ? 'Record usage'
      : movementType === 'stock_count'
        ? 'Stock count'
        : 'Adjust stock'

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (isBusy) return
    const parsed = Number(quantity)

    if (isStockCount) {
      if (!Number.isFinite(parsed) || parsed < 0) {
        setError('Enter the counted quantity (zero or greater).')
        return
      }
    } else if (movementType === 'receive') {
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setError('Enter a positive quantity to receive.')
        return
      }
    } else if (movementType === 'usage') {
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setError('Enter a positive usage quantity.')
        return
      }
      const onHand = Number(item.currentQuantity) || 0
      if (parsed > onHand) {
        setError(`Usage cannot exceed on-hand quantity (${formatStockQuantity(onHand, item.unit)}).`)
        return
      }
    } else if (!Number.isFinite(parsed) || parsed === 0) {
      setError('Enter a non-zero quantity.')
      return
    }

    try {
      setError('')
      setIsSubmitting(true)
      await onSubmit({
        item,
        type: movementType,
        quantity: parsed,
        note: note.trim(),
      })
      onClose()
    } catch (submitError) {
      setError(submitError?.message || 'Unable to save movement right now.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="employee-modal-backdrop task-modal-backdrop" onClick={handleDismiss}>
      <div className="employee-modal stock-dashboard-modal task-form-modal is-responsive-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <h3>{title}</h3>
            <p className="stock-modal-subtitle">{item.name}</p>
          </div>
          <button type="button" className="icon-btn" onClick={handleDismiss} disabled={isBusy} aria-label="Close">✕</button>
        </div>

        <form className="employee-form" onSubmit={handleSubmit}>
          <label>
            {isStockCount ? 'Counted quantity' : 'Quantity'}
            <input
              type="number"
              step="any"
              min={isStockCount ? '0' : undefined}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              placeholder={isStockCount ? `${item.currentQuantity ?? 0}` : movementType === 'adjustment' ? 'Use negative to reduce' : '0'}
              required
              disabled={isBusy}
            />
          </label>
          <label>
            Note
            <input
              type="text"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={isStockCount ? 'e.g. Monday bar count' : 'Optional'}
              disabled={isBusy}
            />
          </label>

          {error ? <div className="staff-status-banner">{error}</div> : null}

          <div className="modal-actions">
            <button type="button" className="ghost-btn" onClick={handleDismiss} disabled={isBusy}>Cancel</button>
            <button type="submit" className="primary-btn" disabled={isBusy}>
              {isBusy ? 'Saving…' : isStockCount ? 'Save stock count' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function StockBulkFieldModal({
  field,
  selectedItems,
  onClose,
  onSubmit,
  isSaving,
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
              <select value={value} onChange={(event) => setValue(event.target.value)} required>
                <option value="">Select location</option>
                {STOCK_LOCATIONS.map((location) => (
                  <option key={location} value={location}>{location}</option>
                ))}
              </select>
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
              <strong>{item.name}</strong>
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
  onImportStockItems,
  onRecordMovement,
  onCreateOrders,
  onOpenOrders,
  onOpenInventoryCountSession,
  isSavingOrders = false,
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
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [isInventoryImportWizardOpen, setIsInventoryImportWizardOpen] = useState(false)
  const [isCreateOrderModalOpen, setIsCreateOrderModalOpen] = useState(false)
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
  const criticalStockCount = summary.lowStock + summary.outOfStock
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

  const needsAttentionGroups = useMemo(() => {
    return buildStockNeedsAttentionGroups(activeCatalogItems, { canManage, searchTerm })
  }, [activeCatalogItems, canManage, searchTerm])

  const hasNeedsAttention = needsAttentionGroups.length > 0

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

  // P8.17.3a — KPI cards toggle the same statusFilter used by All Products.
  // Use the current render value (not a functional flip) so a single tap maps
  // deterministically: inactive → activate, active → clear to all.
  const applyKpiStatusFilter = (nextStatus) => {
    setCategoryFilter('All')
    setStatusFilter(statusFilter === nextStatus ? 'all' : nextStatus)
  }

  return (
    <section className="stock-dashboard-page" aria-label="Stock dashboard">
      {noticeMessage && !catalogLoadFailed ? <div className="staff-status-banner">{noticeMessage}</div> : null}
      {!isWorkspaceReady && workspaceSetupMessage ? (
        <div className="staff-status-banner">{workspaceSetupMessage}</div>
      ) : null}
      {isLoading ? <div className="staff-status-banner">Loading stock…</div> : null}

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

      <section className={`stock-summary-grid${canManage ? ' stock-summary-grid-five' : ''}`} aria-label="Stock summary">
        <StockSummaryCard
          label="Total items"
          value={summary.totalItems}
          isInteractive
          isSelected={categoryFilter === 'All' && statusFilter === 'all'}
          onClick={() => {
            setCategoryFilter('All')
            setStatusFilter('all')
          }}
        />
        <StockSummaryCard
          label="Low stock"
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
        {canManage ? (
          <StockSummaryCard
            layout="value-first"
            value={formatStockInventoryValue(summary.totalValue)}
            subtitle="Inventory cost"
            tone="gold"
          />
        ) : null}
      </section>

      {!isLoading && (criticalStockCount > 0 || ordersSummary.pendingCount > 0) ? (
        <StockOperationsBanner
          ordersSummary={ordersSummary}
          criticalStockCount={criticalStockCount}
          canManage={canManage}
          onOpenOrders={onOpenOrders}
        />
      ) : null}

      {!isLoading && stockItems.length > 0 ? (
        <StockTodayActivitySection activityLine={todayActivityLine} />
      ) : null}

      {hasNeedsAttention && !isLoading ? (
        <StockNeedsAttentionSection
          groups={needsAttentionGroups}
          canManage={canManage}
          onReceive={(item) => openMovement(item, 'receive')}
          onCount={(item) => openMovement(item, 'stock_count')}
          onEdit={openEditItem}
        />
      ) : null}

      <div className={`stock-dashboard-toolbar${canManage ? ' has-visibility' : ''}`}>
        <div className="stock-filter-group stock-filter-group-category">
          <span className="stock-filter-group-label">Category</span>
          <div className="stock-category-filters" role="tablist" aria-label="Stock categories">
            {categoryFilters.map((category) => (
              <button
                key={category}
                type="button"
                role="tab"
                aria-selected={categoryFilter === category}
                className={`stock-category-filter${categoryFilter === category ? ' active' : ''}`}
                onClick={() => setCategoryFilter(category)}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        <div className="stock-filter-group stock-filter-group-status">
          <span className="stock-filter-group-label">Status</span>
          <div className="stock-status-filters" role="tablist" aria-label="Stock status">
            <button
              type="button"
              role="tab"
              aria-selected={statusFilter === 'all'}
              className={`stock-status-filter${statusFilter === 'all' ? ' active' : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              All
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={statusFilter === 'low'}
              className={`stock-status-filter${statusFilter === 'low' ? ' active' : ''}`}
              onClick={() => setStatusFilter('low')}
            >
              Low
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={statusFilter === 'out'}
              className={`stock-status-filter${statusFilter === 'out' ? ' active' : ''}`}
              onClick={() => setStatusFilter('out')}
            >
              Out
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={statusFilter === 'order'}
              className={`stock-status-filter${statusFilter === 'order' ? ' active' : ''}`}
              onClick={() => setStatusFilter('order')}
            >
              To order
            </button>
          </div>
        </div>

        {canManage ? (
          <div className="stock-filter-group stock-filter-group-visibility">
            <span className="stock-filter-group-label">Visibility</span>
            <div className="stock-status-filters" role="tablist" aria-label="Product visibility">
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

        {canManage ? (
          <div className="stock-toolbar-actions">
            <button
              type="button"
              className="ghost-btn stock-create-order-btn"
              onClick={() => setIsCreateOrderModalOpen(true)}
              disabled={!isWorkspaceReady || isStockActionBusy}
            >
              {isSavingOrders ? 'Creating…' : 'Create order'}
            </button>
            <button
              type="button"
              className="ghost-btn stock-import-btn"
              onClick={() => setIsImportModalOpen(true)}
              disabled={!isWorkspaceReady || isStockActionBusy}
            >
              Import CSV
            </button>
            <button
              type="button"
              className="ghost-btn stock-inventory-import-btn"
              onClick={() => setIsInventoryImportWizardOpen(true)}
              disabled={!isWorkspaceReady || isStockActionBusy}
            >
              Inventory Import
            </button>
            <button
              type="button"
              className={`ghost-btn stock-select-mode-btn${selectionMode ? ' active' : ''}`}
              onClick={toggleSelectionMode}
              disabled={isStockActionBusy}
            >
              {selectionMode ? 'Done' : 'Select'}
            </button>
            <button
              type="button"
              className="primary-btn stock-add-item-btn"
              onClick={openCreateItem}
              disabled={!isWorkspaceReady || isStockActionBusy}
            >
              + Add item
            </button>
          </div>
        ) : null}
      </div>

      <div className="stock-browse-controls">
        <div className="stock-browse-control stock-browse-layout">
          <span className="stock-browse-control-label" id="stock-layout-label">View mode</span>
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
                onClick={() => setLayoutMode(mode.id)}
              >
                <StockLayoutModeIcon icon={mode.icon} />
                <span>{mode.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="stock-browse-control stock-browse-group">
          <span className="stock-browse-control-label">Group by</span>
          <StockSortDropdown
            value={groupBy}
            options={STOCK_GROUP_BY_OPTIONS}
            onChange={setGroupBy}
          />
        </div>

        <div className="stock-browse-control stock-browse-sort">
          <span className="stock-browse-control-label">Sort</span>
          <StockSortDropdown
            value={sortKey}
            options={STOCK_SORT_OPTIONS}
            onChange={setSortKey}
          />
        </div>

        {!isLoading && browseMatchCount > 0 ? (
          <p className="stock-browse-result-count" aria-live="polite">
            Showing {visibleItems.length} of {browseMatchCount} product{browseMatchCount === 1 ? '' : 's'}
          </p>
        ) : null}
      </div>

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
            <button type="button" className="ghost-btn stock-bulk-action-btn" onClick={handleExportSelected} disabled={isStockActionBusy}>
              Export selected
            </button>
            <button type="button" className="ghost-btn stock-bulk-action-btn" onClick={() => setSelectedIds(new Set())} disabled={isStockActionBusy}>
              Clear
            </button>
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
              + Add item
            </button>
          ) : null}
        </div>
      ) : null}

      {!emptyState && visibleItems.length > 0 && !isLoading ? (
        <header className="stock-all-products-header">
          <h3 className="stock-all-products-title">All products</h3>
        </header>
      ) : null}

      {renderGroupedItems()}

      {bulkModalField ? (
        <StockBulkFieldModal
          field={bulkModalField}
          selectedItems={selectedItems}
          onClose={() => setBulkModalField(null)}
          isSaving={isSaving}
          onSubmit={handleBulkFieldSubmit}
        />
      ) : null}

      {activeHistoryItem ? (
        <StockProductHistoryDrawer
          item={activeHistoryItem}
          workspaceId={workspaceId}
          canManage={canManage}
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

      {isImportModalOpen ? (
        <StockImportModal
          stockItems={stockItems}
          isSaving={isSaving}
          onClose={() => setIsImportModalOpen(false)}
          onImport={onImportStockItems}
        />
      ) : null}

      {isInventoryImportWizardOpen ? (
        <InventoryImportWizardShell
          workspaceId={workspaceId}
          onClose={() => setIsInventoryImportWizardOpen(false)}
        />
      ) : null}

      {movementModal ? (
        <StockMovementModal
          item={movementModal.item}
          movementType={movementModal.type}
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
          itemName={activeMenuItem.name}
          onUsage={() => openMovement(activeMenuItem, 'usage')}
          onAdjust={() => openMovement(activeMenuItem, 'adjustment')}
          onEdit={() => openEditItem(activeMenuItem)}
          onDuplicate={() => openDuplicateItem(activeMenuItem)}
          onHistory={() => openHistory(activeMenuItem)}
          onDeactivate={openDeactivateItem}
          onPermanentlyDelete={openPermanentDeleteItem}
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
          onSubmit={async (payload) => {
            if (editingItem?.id) {
              await onUpdateItem(editingItem.id, payload)
            } else {
              await onCreateItem(payload)
            }
          }}
        />
      ) : null}
    </section>
  )
}

export { STOCK_MOVEMENT_TYPES }
