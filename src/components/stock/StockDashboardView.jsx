import { useEffect, useMemo, useRef, useState } from 'react'
import {
  computeSuggestedOrder,
  formatStockCategoryTypeLine,
  resolveStockItemType,
  resolveStockStorageLocation,
  resolveStockTargetQuantity,
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
} from '../../lib/stockDashboardBrowse'
import {
  getStockDashboardEmptyState,
  getStockItemInsights,
} from '../../lib/stockInsights'
import {
  buildStockDashboardSummary,
  formatStockInventoryValue,
  formatStockMovementRelativeTime,
  formatStockPurchasePrice,
  formatStockQuantity,
  getStockCategoryFilters,
  getStockMovementLabel,
  getStockStatusShortLabel,
  STOCK_MOVEMENT_TYPES,
} from '../../lib/stockUtils'
import { StockItemFormModal } from './StockItemFormModal'
import { StockImportModal } from './StockImportModal'
import { StockMovementHistoryModal } from './StockMovementHistoryModal'

function formatItemCostDisplay(costPrice) {
  const amount = Number(costPrice)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { isSet: false, value: 'Cost not set' }
  }
  return { isSet: true, value: `${formatStockPurchasePrice(amount)} / unit` }
}

function formatOrderSuggestionNeeded(quantity, unit) {
  const qty = Number(quantity)
  const formatted = Number.isFinite(qty)
    ? (Number.isInteger(qty) ? String(qty) : qty.toFixed(2).replace(/\.?0+$/, ''))
    : '0'
  const normalizedUnit = `${unit ?? ''}`.trim()
  return normalizedUnit ? `+${formatted} ${normalizedUnit} needed` : `+${formatted} units needed`
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
  onUsage,
  onAdjust,
  onEdit,
  onHistory,
}) {
  const itemType = resolveStockItemType(item)
  const location = resolveStockStorageLocation(item)
  const suggestedOrder = computeSuggestedOrder(item)
  const targetQuantity = resolveStockTargetQuantity(item)
  const lastMovement = item.lastMovement
  const lastCount = item.lastCount
  const lastMovementType = lastMovement?.type ? getStockMovementLabel(lastMovement.type) : ''
  const lastMovementWhen = lastMovement?.createdAt
    ? formatStockMovementRelativeTime(lastMovement.createdAt)
    : ''
  const lastCountWhen = lastCount?.createdAt
    ? formatStockMovementRelativeTime(lastCount.createdAt)
    : ''
  const lastCountQuantity = lastCount?.type === 'stock_count'
    ? formatStockQuantity(lastCount.quantity, item.unit)
    : ''
  const supplierLabel = `${item.supplier ?? ''}`.trim()
  const costDisplay = formatItemCostDisplay(item.costPrice)
  const insights = getStockItemInsights(item, { canManage })

  const handleCardClick = () => {
    if (selectionMode) {
      onToggleSelect?.()
    }
  }

  return (
    <article
      className={`stock-item-card panel staff-panel tone-${item.status}${item.status === 'low' || item.status === 'out' ? ' is-alert' : ''}${selectionMode ? ' is-selectable' : ''}${isSelected ? ' is-selected' : ''}`}
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
        <h3 className="stock-item-name">{item.name}</h3>
        <span className={`stock-item-status-badge tone-${item.status}`}>
          {getStockStatusShortLabel(item.status)}
        </span>
      </header>

      <p className="stock-item-category-type">
        {formatStockCategoryTypeLine(item.category, itemType)}
      </p>

      <p className="stock-item-context">
        <span>{location}</span>
        {supplierLabel ? (
          <>
            <span className="stock-item-context-separator" aria-hidden="true">·</span>
            <span>{supplierLabel}</span>
          </>
        ) : null}
      </p>

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
        <p className="stock-item-hero-qty">{formatStockQuantity(item.currentQuantity, item.unit)}</p>
      </div>

      <div className="stock-item-secondary">
        <div className="stock-item-minimum">
          <span className="stock-item-minimum-label">MINIMUM</span>
          <strong className="stock-item-minimum-value">
            {formatStockQuantity(item.minimumQuantity, item.unit)}
          </strong>
        </div>
        {targetQuantity !== null ? (
          <div className="stock-item-target">
            <span className="stock-item-target-label">TARGET</span>
            <strong className="stock-item-target-value">
              {formatStockQuantity(targetQuantity, item.unit)}
            </strong>
          </div>
        ) : null}
        {suggestedOrder > 0 ? (
          <p className="stock-item-detail-line stock-item-order-suggestion">
            Order suggestion: <strong>{formatOrderSuggestionNeeded(suggestedOrder, item.unit)}</strong>
          </p>
        ) : null}
        {canManage ? (
          <div className="stock-item-cost">
            <span className="stock-item-cost-label">Cost</span>
            <strong className={`stock-item-cost-value${costDisplay.isSet ? '' : ' is-unset'}`}>
              {costDisplay.value}
            </strong>
          </div>
        ) : null}
      </div>

      {(lastMovementType || lastCountWhen) ? (
        <div className="stock-item-activity">
          {lastMovementType ? (
            <div className="stock-item-last-movement">
              <span className="stock-item-last-movement-label">LAST MOVEMENT</span>
              <span className="stock-item-last-movement-type">{lastMovementType}</span>
              {lastMovementWhen ? (
                <span className="stock-item-last-movement-when">{lastMovementWhen}</span>
              ) : null}
            </div>
          ) : null}

          {lastCountWhen ? (
            <div className="stock-item-last-count">
              <span className="stock-item-last-count-label">LAST COUNT</span>
              {lastCountQuantity ? (
                <span className="stock-item-last-count-value">{lastCountQuantity}</span>
              ) : null}
              <span className="stock-item-last-count-when">{lastCountWhen}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {canManage ? (
        <div className="stock-item-card-footer">
          <div className="stock-item-actions-wrap">
          <div className="stock-item-actions">
            <button type="button" className="ghost-btn stock-item-action-primary" onClick={(event) => { event.stopPropagation(); onReceive() }}>
              Receive
            </button>
            <button type="button" className="ghost-btn stock-item-action-primary" onClick={(event) => { event.stopPropagation(); onCount() }}>
              Count
            </button>
            <button
              type="button"
              className={`ghost-btn stock-item-more-btn${isMenuOpen ? ' is-open' : ''}`}
              onClick={(event) => { event.stopPropagation(); onToggleMenu() }}
              aria-expanded={isMenuOpen}
              aria-haspopup="menu"
              aria-label="More stock actions"
            >
              ⋯
            </button>
          </div>

          {isMenuOpen ? (
            <div className="stock-item-more-menu" role="menu">
              <button type="button" className="stock-item-more-menu-btn" role="menuitem" onClick={(event) => { event.stopPropagation(); onUsage() }}>
                Usage
              </button>
              <button type="button" className="stock-item-more-menu-btn" role="menuitem" onClick={(event) => { event.stopPropagation(); onAdjust() }}>
                Adjust
              </button>
              <button type="button" className="stock-item-more-menu-btn" role="menuitem" onClick={(event) => { event.stopPropagation(); onEdit() }}>
                Edit
              </button>
              <button type="button" className="stock-item-more-menu-btn" role="menuitem" onClick={(event) => { event.stopPropagation(); onHistory() }}>
                History
              </button>
            </div>
          ) : null}
          </div>
        </div>
      ) : null}
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
  onUsage,
  onAdjust,
  onEdit,
  onHistory,
  onToggleMenu,
  compact = false,
}) {
  if (!canManage) return null

  return (
    <div className={`stock-row-actions-wrap${compact ? ' is-compact' : ''}`}>
      <div className={`stock-row-actions${compact ? ' is-compact' : ''}`}>
        {!compact ? (
          <button type="button" className="ghost-btn stock-row-action-btn" onClick={onReceive}>
            Receive
          </button>
        ) : null}
        <button type="button" className="ghost-btn stock-row-action-btn" onClick={onCount}>
          Count
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

      {isMenuOpen && !compact ? (
        <div className="stock-item-more-menu stock-row-more-menu" role="menu">
          <button type="button" className="stock-item-more-menu-btn" role="menuitem" onClick={onUsage}>
            Usage
          </button>
          <button type="button" className="stock-item-more-menu-btn" role="menuitem" onClick={onAdjust}>
            Adjust
          </button>
          <button type="button" className="stock-item-more-menu-btn" role="menuitem" onClick={onEdit}>
            Edit
          </button>
          <button type="button" className="stock-item-more-menu-btn" role="menuitem" onClick={onHistory}>
            History
          </button>
        </div>
      ) : null}
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
  onUsage,
  onAdjust,
  onEdit,
  onHistory,
}) {
  const itemType = resolveStockItemType(item)
  const location = resolveStockStorageLocation(item)
  const supplierLabel = `${item.supplier ?? ''}`.trim() || '—'

  return (
    <tr className={`stock-list-row tone-${item.status}${isSelected ? ' is-selected' : ''}`}>
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
      <td className="stock-list-cell stock-list-cell-qty">
        {formatStockQuantity(item.currentQuantity, item.unit)}
      </td>
      <td className="stock-list-cell stock-list-cell-qty">
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
          onUsage={onUsage}
          onAdjust={onAdjust}
          onEdit={onEdit}
          onHistory={onHistory}
          onToggleMenu={onToggleMenu}
        />
      </td>
    </tr>
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
  onUsage,
  onAdjust,
  onEdit,
  onHistory,
}) {
  return (
    <div className="stock-list-table-wrap">
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
            {canManage ? <th scope="col" className="stock-list-head-actions">Actions</th> : null}
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
              onToggleMenu={() => onToggleMenu(item.id)}
              onReceive={() => onReceive(item)}
              onCount={() => onCount(item)}
              onUsage={() => onUsage(item)}
              onAdjust={() => onAdjust(item)}
              onEdit={() => onEdit(item)}
              onHistory={() => onHistory(item)}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StockCompactRow({
  item,
  canManage,
  selectionMode,
  isSelected,
  onToggleSelect,
  onCount,
}) {
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
        <p className="stock-compact-qty">{formatStockQuantity(item.currentQuantity, item.unit)}</p>
      </div>
      {canManage ? (
        <button type="button" className="ghost-btn stock-compact-count-btn" onClick={onCount}>
          Count
        </button>
      ) : null}
    </article>
  )
}

function StockSummaryCard({
  label,
  value,
  subtitle,
  tone = 'default',
  layout = 'default',
}) {
  const isValueFirst = layout === 'value-first'

  return (
    <article className={`stock-summary-card tone-${tone}${isValueFirst ? ' layout-value-first' : ''}`}>
      {isValueFirst ? (
        <>
          <p className="stock-summary-value">{value}</p>
          <p className="stock-summary-label">{subtitle || label}</p>
        </>
      ) : (
        <>
          <p className="stock-summary-label">{label}</p>
          <p className="stock-summary-value">{value}</p>
        </>
      )}
    </article>
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

  useEffect(() => {
    if (isStockCount) {
      setQuantity(`${item.currentQuantity ?? ''}`)
    } else {
      setQuantity('')
    }
    setNote('')
    setError('')
  }, [item, movementType, isStockCount])

  const title = movementType === 'receive'
    ? 'Receive stock'
    : movementType === 'usage'
      ? 'Record usage'
      : movementType === 'stock_count'
        ? 'Stock count'
        : 'Adjust stock'

  const handleSubmit = async (event) => {
    event.preventDefault()
    const parsed = Number(quantity)

    if (isStockCount) {
      if (!Number.isFinite(parsed) || parsed < 0) {
        setError('Enter the counted quantity (zero or greater).')
        return
      }
    } else if (!Number.isFinite(parsed) || parsed === 0) {
      setError('Enter a non-zero quantity.')
      return
    }

    try {
      setError('')
      await onSubmit({
        item,
        type: movementType,
        quantity: parsed,
        note: note.trim(),
      })
      onClose()
    } catch (submitError) {
      setError(submitError?.message || 'Unable to save movement right now.')
    }
  }

  return (
    <div className="employee-modal-backdrop" onClick={onClose}>
      <div className="employee-modal stock-dashboard-modal" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <h3>{title}</h3>
            <p className="stock-modal-subtitle">{item.name}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
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
            />
          </label>
          <label>
            Note
            <input
              type="text"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={isStockCount ? 'e.g. Monday bar count' : 'Optional'}
            />
          </label>

          {error ? <div className="staff-status-banner">{error}</div> : null}

          <div className="modal-actions">
            <button type="button" className="ghost-btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary-btn" disabled={isSaving}>
              {isSaving ? 'Saving…' : isStockCount ? 'Save count' : 'Save'}
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
    const trimmed = `${value ?? ''}`.trim()

    if (!trimmed) {
      setError('Choose or enter a value.')
      return
    }

    try {
      setError('')
      await onSubmit(field, trimmed)
      onClose()
    } catch (submitError) {
      setError(submitError?.message || 'Unable to update products right now.')
    }
  }

  return (
    <div className="employee-modal-backdrop" onClick={onClose}>
      <div className="employee-modal stock-dashboard-modal" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <h3>{title}</h3>
            <p className="stock-modal-subtitle">{selectedItems.length} selected product{selectedItems.length === 1 ? '' : 's'}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
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
            <button type="button" className="ghost-btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary-btn" disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Apply to selected'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function StockDashboardView({
  stockItems = [],
  isLoading = false,
  noticeMessage = '',
  isSaving = false,
  canManage = false,
  searchTerm = '',
  workspaceId = '',
  isWorkspaceReady = false,
  workspaceSetupMessage = '',
  onCreateItem,
  onUpdateItem,
  onBulkUpdateItems,
  onImportStockItems,
  onRecordMovement,
}) {
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortKey, setSortKey] = useState('name-asc')
  const [layoutMode, setLayoutMode] = useState('cards')
  const [groupBy, setGroupBy] = useState('none')
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkModalField, setBulkModalField] = useState(null)
  const [movementModal, setMovementModal] = useState(null)
  const [historyItem, setHistoryItem] = useState(null)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [isItemModalOpen, setIsItemModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [openCardMenuId, setOpenCardMenuId] = useState(null)

  const summary = useMemo(() => buildStockDashboardSummary(stockItems), [stockItems])
  const categoryFilters = useMemo(() => getStockCategoryFilters(stockItems), [stockItems])
  const totalBrowsableCount = useMemo(() => {
    return (stockItems ?? []).filter((item) => item.active !== false).length
  }, [stockItems])

  const visibleItems = useMemo(() => {
    const filtered = filterStockDashboardItems(stockItems, {
      categoryFilter,
      statusFilter,
      searchTerm,
    })
    return sortStockDashboardItems(filtered, sortKey)
  }, [stockItems, categoryFilter, statusFilter, searchTerm, sortKey])

  const itemGroups = useMemo(() => {
    return groupStockDashboardItems(visibleItems, groupBy)
  }, [visibleItems, groupBy])

  const hasNoItems = stockItems.length === 0
  const hasNoMatches = !hasNoItems && visibleItems.length === 0

  const selectedItems = useMemo(() => {
    return visibleItems.filter((item) => selectedIds.has(item.id))
  }, [visibleItems, selectedIds])

  const emptyState = useMemo(() => getStockDashboardEmptyState({
    hasNoItems,
    hasNoMatches,
    statusFilter,
  }), [hasNoItems, hasNoMatches, statusFilter])

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
    setIsItemModalOpen(true)
  }

  const openEditItem = (item) => {
    setOpenCardMenuId(null)
    setEditingItem(item)
    setIsItemModalOpen(true)
  }

  const openHistory = (item) => {
    setOpenCardMenuId(null)
    setHistoryItem(item)
  }

  const openMovement = (item, type) => {
    setOpenCardMenuId(null)
    setMovementModal({ item, type })
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
      onToggleMenu={() => setOpenCardMenuId((current) => (current === item.id ? null : item.id))}
      onReceive={() => openMovement(item, 'receive')}
      onCount={() => openMovement(item, 'stock_count')}
      onUsage={() => openMovement(item, 'usage')}
      onAdjust={() => openMovement(item, 'adjustment')}
      onEdit={() => openEditItem(item)}
      onHistory={() => openHistory(item)}
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
                onToggleMenu={(itemId) => setOpenCardMenuId((current) => (current === itemId ? null : itemId))}
                onReceive={(item) => openMovement(item, 'receive')}
                onCount={(item) => openMovement(item, 'stock_count')}
                onUsage={(item) => openMovement(item, 'usage')}
                onAdjust={(item) => openMovement(item, 'adjustment')}
                onEdit={openEditItem}
                onHistory={openHistory}
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

  return (
    <section className="stock-dashboard-page" aria-label="Stock dashboard">
      {noticeMessage ? <div className="staff-status-banner">{noticeMessage}</div> : null}
      {!isWorkspaceReady && workspaceSetupMessage ? (
        <div className="staff-status-banner">{workspaceSetupMessage}</div>
      ) : null}
      {isLoading ? <div className="staff-status-banner">Loading stock…</div> : null}

      <section className="stock-summary-grid stock-summary-grid-five" aria-label="Stock summary">
        <StockSummaryCard label="Total items" value={summary.totalItems} />
        <StockSummaryCard label="Low stock" value={summary.lowStock} tone={summary.lowStock > 0 ? 'warning' : 'default'} />
        <StockSummaryCard label="Out of stock" value={summary.outOfStock} tone={summary.outOfStock > 0 ? 'danger' : 'default'} />
        <StockSummaryCard label="To order" value={summary.toOrder} tone={summary.toOrder > 0 ? 'warning' : 'default'} />
        <StockSummaryCard
          layout="value-first"
          value={formatStockInventoryValue(summary.totalValue)}
          subtitle="Inventory cost"
          tone="gold"
        />
      </section>

      <div className="stock-dashboard-toolbar">
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

        <div className="stock-dashboard-quick-actions">
          <button
            type="button"
            className={`stock-status-filter${statusFilter === 'all' ? ' active' : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            All
          </button>
          <button
            type="button"
            className={`stock-status-filter${statusFilter === 'low' ? ' active' : ''}`}
            onClick={() => setStatusFilter('low')}
          >
            Low
          </button>
          <button
            type="button"
            className={`stock-status-filter${statusFilter === 'out' ? ' active' : ''}`}
            onClick={() => setStatusFilter('out')}
          >
            Out
          </button>
          <button
            type="button"
            className={`stock-status-filter${statusFilter === 'order' ? ' active' : ''}`}
            onClick={() => setStatusFilter('order')}
          >
            To order
          </button>
          {canManage ? (
            <>
              <button
                type="button"
                className="ghost-btn stock-import-btn"
                onClick={() => setIsImportModalOpen(true)}
                disabled={!isWorkspaceReady}
              >
                Import CSV
              </button>
              <button
                type="button"
                className={`ghost-btn stock-select-mode-btn${selectionMode ? ' active' : ''}`}
                onClick={toggleSelectionMode}
              >
                {selectionMode ? 'Done' : 'Select'}
              </button>
              <button
                type="button"
                className="primary-btn stock-add-item-btn"
                onClick={openCreateItem}
                disabled={!isWorkspaceReady}
              >
                + Add item
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="stock-browse-controls">
        <div className="stock-browse-control stock-browse-layout">
          <span className="stock-browse-control-label" id="stock-layout-label">View</span>
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
                {mode.label}
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

        {!isLoading && totalBrowsableCount > 0 ? (
          <p className="stock-browse-result-count" aria-live="polite">
            Showing {visibleItems.length} of {totalBrowsableCount} product{totalBrowsableCount === 1 ? '' : 's'}
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
            {selectedIds.size} selected
          </span>
        </div>
      ) : null}

      {selectionMode && canManage && selectedIds.size > 0 ? (
        <div className="stock-bulk-toolbar" aria-label="Bulk actions">
          <p className="stock-bulk-toolbar-label">
            Selected: <strong>{selectedIds.size}</strong> product{selectedIds.size === 1 ? '' : 's'}
          </p>
          <div className="stock-bulk-toolbar-actions">
            <button type="button" className="ghost-btn stock-bulk-action-btn" onClick={() => setBulkModalField('supplier')}>
              Change supplier
            </button>
            <button type="button" className="ghost-btn stock-bulk-action-btn" onClick={() => setBulkModalField('storageLocation')}>
              Change location
            </button>
            <button type="button" className="ghost-btn stock-bulk-action-btn" onClick={() => setBulkModalField('category')}>
              Change category
            </button>
            <button type="button" className="ghost-btn stock-bulk-action-btn" onClick={() => setBulkModalField('itemType')}>
              Change type
            </button>
            <button type="button" className="ghost-btn stock-bulk-action-btn" onClick={handleExportSelected}>
              Export selected
            </button>
            <button type="button" className="ghost-btn stock-bulk-action-btn" onClick={() => setSelectedIds(new Set())}>
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

      {historyItem ? (
        <StockMovementHistoryModal
          item={historyItem}
          workspaceId={workspaceId}
          onClose={() => setHistoryItem(null)}
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

      {movementModal ? (
        <StockMovementModal
          item={movementModal.item}
          movementType={movementModal.type}
          onClose={() => setMovementModal(null)}
          isSaving={isSaving}
          onSubmit={onRecordMovement}
        />
      ) : null}

      {isItemModalOpen ? (
        <StockItemFormModal
          initialItem={editingItem}
          onClose={() => {
            setIsItemModalOpen(false)
            setEditingItem(null)
          }}
          isSaving={isSaving}
          workspaceId={workspaceId}
          isWorkspaceReady={isWorkspaceReady}
          workspaceSetupMessage={workspaceSetupMessage}
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
