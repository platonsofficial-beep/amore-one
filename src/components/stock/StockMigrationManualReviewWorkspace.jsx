import { useEffect, useMemo, useState } from 'react'
import { StockMigrationManualReviewInspector } from './StockMigrationManualReviewInspector'
import { StockMigrationManualReviewList } from './StockMigrationManualReviewList'

function normalizeSearchValue(value) {
  return `${value ?? ''}`.trim().toLowerCase()
}

function rowMatchesQuery(row, query) {
  const q = normalizeSearchValue(query)
  if (!q) return true

  const haystack = [
    row?.legacyName,
    row?.category,
    row?.conflictReason,
    row?.currentResolution,
    row?.legacyItemId,
    row?.id,
    row?.stockItemId,
    row?.candidateStockId,
    row?.candidateStockName,
    row?.supplier,
    row?.unit,
  ]
    .map((part) => normalizeSearchValue(part))
    .join(' ')

  return haystack.includes(q)
}

/**
 * Read-only Manual Resolution Review Workspace.
 * Presentation only — no mutation controls or RPC calls.
 */
export function StockMigrationManualReviewWorkspace({
  rows = [],
  metricsAvailable = false,
  isLoading = false,
}) {
  const list = Array.isArray(rows) ? rows : []
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedId, setSelectedId] = useState(null)

  const filteredRows = useMemo(
    () => list.filter((row) => rowMatchesQuery(row, searchQuery)),
    [list, searchQuery],
  )

  useEffect(() => {
    if (selectedId == null) return
    const stillVisible = filteredRows.some((row) => `${row?.id}` === `${selectedId}`)
    if (!stillVisible) {
      setSelectedId(null)
    }
  }, [filteredRows, selectedId])

  const selectedRow = useMemo(() => {
    if (selectedId == null) return null
    return filteredRows.find((row) => `${row?.id}` === `${selectedId}`) ?? null
  }, [filteredRows, selectedId])

  if (isLoading) {
    return (
      <section
        className="panel staff-panel stock-migration-panel stock-migration-review-workspace"
        aria-label="Manual resolution review"
        aria-busy="true"
      >
        <div className="stock-empty-state stock-migration-review-empty">
          <h4>Loading manual review</h4>
          <p>Fetching manual map rows for this workspace…</p>
        </div>
      </section>
    )
  }

  if (!metricsAvailable) {
    return (
      <section
        className="panel staff-panel stock-migration-panel stock-migration-review-workspace"
        aria-label="Manual resolution review"
      >
        <div className="stock-migration-panel-header">
          <h3 className="stock-migration-panel-title">Manual Resolution Review</h3>
          <p className="stock-migration-panel-copy">
            Read-only inspection of map rows with status manual.
          </p>
        </div>
        <div className="stock-empty-state stock-migration-review-empty">
          <h4>Manual review unavailable</h4>
          <p>Migration map metrics are not available for this workspace yet.</p>
        </div>
      </section>
    )
  }

  if (list.length === 0) {
    return (
      <section
        className="panel staff-panel stock-migration-panel stock-migration-review-workspace"
        aria-label="Manual resolution review"
      >
        <div className="stock-migration-panel-header">
          <h3 className="stock-migration-panel-title">Manual Resolution Review</h3>
          <p className="stock-migration-panel-copy">
            Read-only inspection of map rows with status manual.
          </p>
        </div>
        <div className="stock-empty-state stock-migration-review-empty">
          <h4>No manual review items</h4>
          <p>There are no map rows currently classified as manual.</p>
        </div>
      </section>
    )
  }

  return (
    <section
      className="panel staff-panel stock-migration-panel stock-migration-review-workspace"
      aria-label="Manual resolution review"
    >
      <div className="stock-migration-panel-header stock-migration-review-workspace-header">
        <div>
          <h3 className="stock-migration-panel-title">Manual Resolution Review</h3>
          <p className="stock-migration-panel-copy">
            Read-only split workspace for inspecting manual map rows.
            {' '}
            {list.length === 1 ? '1 item' : `${list.length} items`}
            .
          </p>
        </div>
      </div>

      <div className="stock-migration-review-split">
        <StockMigrationManualReviewList
          rows={filteredRows}
          selectedId={selectedId}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSelectRow={(row) => setSelectedId(row?.id ?? null)}
        />
        <StockMigrationManualReviewInspector row={selectedRow} />
      </div>
    </section>
  )
}
