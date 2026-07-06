import { useEffect, useState } from 'react'
import {
  formatStockHistoryTimestamp,
  formatStockMovementHistoryType,
  formatStockMovementQuantityLine,
} from '../../lib/stockMovementDisplay'
import { getStockMovementsWithAuthors } from '../../services/stockMovementService'

export function StockMovementHistoryModal({
  item,
  workspaceId,
  onClose,
}) {
  const [movements, setMovements] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true

    const loadHistory = async () => {
      setIsLoading(true)
      setError('')

      try {
        const records = await getStockMovementsWithAuthors(workspaceId, {
          itemId: item.id,
          limit: 50,
        })
        if (isMounted) {
          setMovements(records)
        }
      } catch (loadError) {
        if (isMounted) {
          setError(loadError?.message || 'Unable to load movement history right now.')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadHistory()

    return () => {
      isMounted = false
    }
  }, [item.id, workspaceId])

  return (
    <div className="employee-modal-backdrop" onClick={onClose}>
      <div
        className="employee-modal stock-dashboard-modal stock-history-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-history-title"
      >
        <div className="drawer-header">
          <div>
            <h3 id="stock-history-title">Movement history</h3>
            <p className="stock-modal-subtitle">{item.name}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="stock-history-body">
          {isLoading ? <div className="staff-status-banner">Loading history…</div> : null}
          {error ? <div className="staff-status-banner">{error}</div> : null}

          {!isLoading && !error && movements.length === 0 ? (
            <div className="stock-empty-state panel staff-panel stock-history-empty">
              <h4>No movements yet</h4>
              <p>Receive, count, or adjust stock to build history.</p>
            </div>
          ) : null}

          {!isLoading && !error && movements.length > 0 ? (
            <ul className="stock-history-list">
              {movements.map((movement) => (
                <li key={movement.id} className="stock-history-item">
                  <div className="stock-history-item-main">
                    <strong>{formatStockMovementHistoryType(movement.type)}</strong>
                    <span className="stock-history-quantity">
                      {formatStockMovementQuantityLine(movement, item.unit)}
                    </span>
                  </div>
                  <div className="stock-history-item-meta">
                    <span>{formatStockHistoryTimestamp(movement.createdAt)}</span>
                    <span>by {movement.createdByName}</span>
                  </div>
                  {movement.note ? (
                    <p className="stock-history-note">{movement.note}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  )
}
