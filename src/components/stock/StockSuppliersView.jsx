import { useEffect, useMemo, useRef, useState } from 'react'
import {
  filterStockSuppliers,
  getStockSuppliersEmptyState,
  sortStockSuppliers,
  STOCK_SUPPLIER_FILTERS,
  STOCK_SUPPLIER_SORT_OPTIONS,
} from '../../lib/stockSupplierBrowse'
import {
  buildSupplierMetrics,
  buildSuppliersDashboardSummary,
  formatSupplierMetricDate,
  formatSupplierStatusLabel,
  getSupplierInitials,
  getSupplierStatusTone,
  supplierHasHistory,
} from '../../lib/stockSupplierUtils'
import { formatStockPurchasePrice } from '../../lib/stockUtils'
import { StockSupplierDetailDrawer } from './StockSupplierDetailDrawer'
import { StockSupplierFormModal } from './StockSupplierFormModal'

function StockSupplierSortDropdown({ value, options, onChange }) {
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
        aria-label="Sort suppliers"
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

function StockSupplierCard({ supplier, metrics, onOpen }) {
  const statusTone = getSupplierStatusTone(supplier)

  return (
    <button
      type="button"
      className="stock-supplier-card panel staff-panel"
      onClick={() => onOpen(supplier)}
    >
      <div className="stock-supplier-card-top">
        <div className="stock-supplier-card-identity">
          <span className="stock-supplier-card-avatar" aria-hidden="true">
            {getSupplierInitials(supplier.companyName)}
          </span>
          <div className="stock-supplier-card-heading">
            <strong>{supplier.companyName || 'Unnamed supplier'}</strong>
            {supplier.contactPerson ? (
              <span className="stock-supplier-card-contact">{supplier.contactPerson}</span>
            ) : null}
          </div>
        </div>
        <span className={`stock-order-status-badge tone-${statusTone}`}>
          {formatSupplierStatusLabel(supplier)}
        </span>
      </div>

      <div className="stock-supplier-card-contact-grid">
        {supplier.phone ? <span>{supplier.phone}</span> : null}
        {supplier.email ? <span>{supplier.email}</span> : null}
      </div>

      <div className="stock-supplier-card-stats">
        <div className="stock-supplier-card-stat">
          <span className="stock-supplier-card-stat-label">Products</span>
          <span className="stock-supplier-card-stat-value">{metrics.productsCount}</span>
        </div>
        <div className="stock-supplier-card-stat">
          <span className="stock-supplier-card-stat-label">Open orders</span>
          <span className="stock-supplier-card-stat-value">{metrics.openOrdersCount}</span>
        </div>
        <div className="stock-supplier-card-stat">
          <span className="stock-supplier-card-stat-label">Last order</span>
          <span className="stock-supplier-card-stat-value stock-supplier-card-stat-value-compact">
            {metrics.lastOrderDate ? formatSupplierMetricDate(metrics.lastOrderDate) : '—'}
          </span>
        </div>
        <div className="stock-supplier-card-stat">
          <span className="stock-supplier-card-stat-label">Total spend</span>
          <span className="stock-supplier-card-stat-value stock-supplier-card-stat-value-gold">
            {formatStockPurchasePrice(metrics.totalSpend)}
          </span>
        </div>
      </div>
    </button>
  )
}

function StockSupplierDeleteModal({
  supplier,
  hasHistory,
  isSaving,
  onClose,
  onConfirmDelete,
  onConfirmDeactivate,
}) {
  if (!supplier) return null

  return (
    <div className="employee-modal-backdrop task-modal-backdrop stock-supplier-form-backdrop" onClick={onClose}>
      <div
        className="employee-modal task-form-modal is-responsive-sheet"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-supplier-delete-title"
      >
        <div className="drawer-header">
          <div>
            <p className="eyebrow">Supplier safety</p>
            <h3 id="stock-supplier-delete-title">
              {hasHistory ? 'Deactivate supplier?' : 'Delete supplier?'}
            </h3>
          </div>
          <button type="button" className="icon-btn stock-supplier-form-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="stock-supplier-delete-body">
          {hasHistory ? (
            <>
              <p>
                <strong>{supplier.companyName}</strong> has linked products or purchase orders.
              </p>
              <p>Suppliers with history cannot be deleted. You can deactivate them instead.</p>
            </>
          ) : (
            <p>This will permanently remove <strong>{supplier.companyName}</strong>. This cannot be undone.</p>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="ghost-btn stock-supplier-form-action" onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          {hasHistory ? (
            <button
              type="button"
              className="primary-btn stock-supplier-form-action"
              onClick={() => onConfirmDeactivate?.(supplier)}
              disabled={isSaving}
            >
              {isSaving ? 'Saving…' : 'Deactivate supplier'}
            </button>
          ) : (
            <button
              type="button"
              className="primary-btn stock-supplier-delete-confirm stock-supplier-form-action"
              onClick={() => onConfirmDelete?.(supplier)}
              disabled={isSaving}
            >
              {isSaving ? 'Deleting…' : 'Delete supplier'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function StockSuppliersView({
  suppliers = [],
  stockItems = [],
  stockOrders = [],
  inventoryItems = [],
  isLoading = false,
  noticeMessage = '',
  searchTerm = '',
  canManage = false,
  isSaving = false,
  onCreateSupplier,
  onUpdateSupplier,
  onDeleteSupplier,
  onDeactivateSupplier,
}) {
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortKey, setSortKey] = useState('name-az')
  const [localSearchTerm, setLocalSearchTerm] = useState('')
  const [selectedSupplier, setSelectedSupplier] = useState(null)
  const [editingSupplier, setEditingSupplier] = useState(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [pendingDeleteSupplier, setPendingDeleteSupplier] = useState(null)

  const effectiveSearchTerm = `${searchTerm || localSearchTerm}`.trim()

  const dashboardSummary = useMemo(
    () => buildSuppliersDashboardSummary(suppliers, stockItems, stockOrders),
    [suppliers, stockItems, stockOrders],
  )

  const filteredSuppliers = useMemo(() => {
    return filterStockSuppliers(suppliers, {
      statusFilter,
      searchTerm: effectiveSearchTerm,
      stockItems,
      stockOrders,
    })
  }, [suppliers, statusFilter, effectiveSearchTerm, stockItems, stockOrders])

  const visibleSuppliers = useMemo(() => {
    return sortStockSuppliers(filteredSuppliers, stockItems, stockOrders, sortKey)
  }, [filteredSuppliers, stockItems, stockOrders, sortKey])

  const selectedSupplierRecord = useMemo(() => {
    if (!selectedSupplier) return null
    return suppliers.find((supplier) => supplier.id === selectedSupplier.id) ?? selectedSupplier
  }, [suppliers, selectedSupplier])

  const metricsBySupplierId = useMemo(() => {
    const map = new Map()
    suppliers.forEach((supplier) => {
      map.set(supplier.id, buildSupplierMetrics(supplier, stockItems, stockOrders))
    })
    return map
  }, [suppliers, stockItems, stockOrders])

  const emptyState = useMemo(
    () => getStockSuppliersEmptyState(statusFilter, suppliers.length > 0),
    [statusFilter, suppliers.length],
  )

  const pendingDeleteHasHistory = pendingDeleteSupplier
    ? supplierHasHistory(pendingDeleteSupplier, { stockItems, stockOrders, inventoryItems })
    : false

  const handleOpenCreate = () => {
    setEditingSupplier(null)
    setIsFormOpen(true)
  }

  const handleOpenEdit = (supplier) => {
    setEditingSupplier(supplier)
    setIsFormOpen(true)
  }

  const handleCloseForm = () => {
    if (isSaving) return
    setIsFormOpen(false)
    setEditingSupplier(null)
  }

  const handleSubmitForm = async (payload) => {
    if (editingSupplier) {
      await onUpdateSupplier?.(editingSupplier.id, payload)
    } else {
      await onCreateSupplier?.(payload)
    }
    setIsFormOpen(false)
    setEditingSupplier(null)
  }

  const handleDeactivate = async (supplier) => {
    const nextActive = supplier?.active === false
    await onDeactivateSupplier?.(supplier, nextActive)
    setSelectedSupplier(null)
    setPendingDeleteSupplier(null)
  }

  const handleConfirmDelete = async (supplier) => {
    await onDeleteSupplier?.(supplier)
    setPendingDeleteSupplier(null)
    setSelectedSupplier(null)
  }

  return (
    <section className="stock-suppliers-page" aria-label="Stock suppliers">
      {noticeMessage ? <div className="staff-status-banner">{noticeMessage}</div> : null}
      {isLoading ? <div className="staff-status-banner">Loading suppliers…</div> : null}

      <div className="stock-suppliers-toolbar">
        <p className="stock-suppliers-toolbar-copy">
          Manage supplier contacts, linked products, and purchase history.
        </p>
        {canManage ? (
          <button
            type="button"
            className="primary-btn stock-suppliers-add-btn"
            onClick={handleOpenCreate}
            disabled={isSaving}
          >
            Add supplier
          </button>
        ) : null}
      </div>

      <div className="stock-summary-grid stock-summary-grid-five">
        <article className="stock-summary-card">
          <p className="stock-summary-label">Total suppliers</p>
          <p className="stock-summary-value">{dashboardSummary.totalSuppliers}</p>
        </article>
        <article className="stock-summary-card tone-gold">
          <p className="stock-summary-label">Active suppliers</p>
          <p className="stock-summary-value">{dashboardSummary.activeSuppliers}</p>
        </article>
        <article className="stock-summary-card">
          <p className="stock-summary-label">Products supplied</p>
          <p className="stock-summary-value">{dashboardSummary.totalProductsSupplied}</p>
        </article>
        <article className="stock-summary-card">
          <p className="stock-summary-label">Total purchase value</p>
          <p className="stock-summary-value">{formatStockPurchasePrice(dashboardSummary.totalPurchaseValue)}</p>
        </article>
        <article className="stock-summary-card tone-warning">
          <p className="stock-summary-label">Pending orders</p>
          <p className="stock-summary-value">{dashboardSummary.pendingOrders}</p>
        </article>
      </div>

      <div className="stock-suppliers-browse">
        <div className="stock-filter-group stock-filter-group-status">
          <span className="stock-filter-group-label">Filter</span>
          <div className="stock-status-filters" role="tablist" aria-label="Supplier filters">
            {STOCK_SUPPLIER_FILTERS.map((filter) => (
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

        <div className="stock-suppliers-browse-tools">
          <label className="stock-suppliers-search">
            <span className="sr-only">Search suppliers</span>
            <input
              type="search"
              className="stock-suppliers-search-input"
              value={localSearchTerm}
              onChange={(event) => setLocalSearchTerm(event.target.value)}
              placeholder="Search supplier, product, contact…"
            />
          </label>

          <div className="stock-browse-control stock-browse-sort">
            <span className="stock-browse-control-label">Sort</span>
            <StockSupplierSortDropdown
              value={sortKey}
              options={STOCK_SUPPLIER_SORT_OPTIONS}
              onChange={setSortKey}
            />
          </div>
        </div>

        {!isLoading && suppliers.length > 0 ? (
          <p className="stock-browse-result-count" aria-live="polite">
            Showing {visibleSuppliers.length} of {suppliers.length} supplier{suppliers.length === 1 ? '' : 's'}
          </p>
        ) : null}
      </div>

      {!isLoading && visibleSuppliers.length === 0 ? (
        <div className="stock-product-history-empty panel staff-panel stock-suppliers-empty">
          <h4>{emptyState.title}</h4>
          <p>{emptyState.description}</p>
          {emptyState.showCreate && canManage ? (
            <button type="button" className="primary-btn stock-suppliers-empty-btn" onClick={handleOpenCreate}>
              Add supplier
            </button>
          ) : null}
        </div>
      ) : (
        <div className="stock-supplier-card-grid">
          {visibleSuppliers.map((supplier) => (
            <StockSupplierCard
              key={supplier.id}
              supplier={supplier}
              metrics={metricsBySupplierId.get(supplier.id) ?? buildSupplierMetrics(supplier, stockItems, stockOrders)}
              onOpen={setSelectedSupplier}
            />
          ))}
        </div>
      )}

      {selectedSupplierRecord ? (
        <StockSupplierDetailDrawer
          supplier={selectedSupplierRecord}
          stockItems={stockItems}
          stockOrders={stockOrders}
          inventoryItems={inventoryItems}
          canManage={canManage}
          isSaving={isSaving}
          onClose={() => setSelectedSupplier(null)}
          onEdit={(supplier) => {
            setSelectedSupplier(null)
            handleOpenEdit(supplier)
          }}
          onDeactivate={handleDeactivate}
          onDelete={(supplier) => {
            setSelectedSupplier(null)
            setPendingDeleteSupplier(supplier)
          }}
        />
      ) : null}

      {isFormOpen ? (
        <StockSupplierFormModal
          key={editingSupplier?.id ?? 'new'}
          isOpen={isFormOpen}
          supplier={editingSupplier}
          isSaving={isSaving}
          onClose={handleCloseForm}
          onSubmit={handleSubmitForm}
        />
      ) : null}

      {pendingDeleteSupplier ? (
        <StockSupplierDeleteModal
          supplier={pendingDeleteSupplier}
          hasHistory={pendingDeleteHasHistory}
          isSaving={isSaving}
          onClose={() => {
            if (isSaving) return
            setPendingDeleteSupplier(null)
          }}
          onConfirmDelete={handleConfirmDelete}
          onConfirmDeactivate={handleDeactivate}
        />
      ) : null}
    </section>
  )
}
