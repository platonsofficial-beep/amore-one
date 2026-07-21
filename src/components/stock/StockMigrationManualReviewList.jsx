/**
 * Left rail: searchable manual-review row list (read-only selection).
 */
export function StockMigrationManualReviewList({
  rows = [],
  selectedId = null,
  searchQuery = '',
  onSearchChange,
  onSelectRow,
}) {
  const list = Array.isArray(rows) ? rows : []
  const query = `${searchQuery ?? ''}`

  return (
    <div className="stock-migration-review-rail">
      <div className="stock-migration-review-rail-sticky">
        <div className="stock-migration-review-rail-heading">
          <h3 className="stock-migration-review-rail-title">Manual rows</h3>
          <p className="stock-migration-review-rail-count" aria-live="polite">
            {list.length === 1 ? '1 row' : `${list.length} rows`}
            {query.trim() ? ' matching' : ''}
          </p>
        </div>

        <label className="stock-migration-review-search">
          <span className="stock-migration-review-search-label">Search manual rows</span>
          <input
            type="search"
            className="stock-migration-review-search-input"
            value={query}
            onChange={(event) => onSearchChange?.(event.target.value)}
            placeholder="Search name, category, conflict…"
            autoComplete="off"
          />
        </label>
      </div>

      {list.length === 0 ? (
        <div className="stock-empty-state stock-migration-review-empty stock-migration-review-empty--rail">
          <h4>No matching rows</h4>
          <p>Try a different search term.</p>
        </div>
      ) : (
        <ul className="stock-migration-review-list" role="listbox" aria-label="Manual review rows">
          {list.map((row) => {
            const id = row?.id ?? null
            const selected = id != null && `${id}` === `${selectedId}`
            const conflictPreview = `${row?.conflictReason ?? ''}`.trim()
            const showConflict = conflictPreview && conflictPreview !== '—'

            return (
              <li key={id ?? `${row?.legacyItemId}-${row?.createdAt}`} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`stock-migration-review-row${selected ? ' is-selected' : ''}`}
                  onClick={() => onSelectRow?.(row)}
                >
                  <div className="stock-migration-review-row-top">
                    <span className="stock-migration-review-row-name">
                      {row?.legacyName ?? '—'}
                    </span>
                    <span className="stock-migration-review-badge">Manual</span>
                  </div>
                  <div className="stock-migration-review-row-meta">
                    <span>{row?.category ?? '—'}</span>
                    <span className="stock-migration-review-row-resolution">
                      {row?.currentResolution ?? '—'}
                    </span>
                  </div>
                  {showConflict ? (
                    <p className="stock-migration-review-row-conflict">{conflictPreview}</p>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
