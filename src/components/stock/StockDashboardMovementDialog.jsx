import { useEffect, useState } from 'react'
import { readLastUsedStockMovementStorage } from '../../lib/stockMovementStorage'
import { getStockItemLocationBalances } from '../../services/stockLocationBalanceService'
import { listWorkspaceStorages } from '../../services/workspaceStorageService'
import { StockMovementModal } from './StockMovementModal'

function loadMovementBalances(workspaceId, itemId) {
  return getStockItemLocationBalances(workspaceId, itemId, { includeZeroBalances: true })
}

/**
 * Dashboard receive / usage / adjust / quick count.
 * Loads active storages and this item's balances, then the shared modal
 * sends the location RPC a storage id and quantity_version.
 */
export function StockDashboardMovementDialog({
  item,
  movementType,
  workspaceId = '',
  isSaving = false,
  onClose,
  onSubmit,
  loadStorages = listWorkspaceStorages,
  loadBalances = loadMovementBalances,
}) {
  const [storages, setStorages] = useState([])
  const [balances, setBalances] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [requestKey, setRequestKey] = useState(0)
  const itemId = `${item?.id ?? ''}`

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError('')
    Promise.all([
      loadStorages(workspaceId),
      loadBalances(workspaceId, itemId),
    ]).then(([nextStorages, nextBalances]) => {
      if (cancelled) return
      setStorages(Array.isArray(nextStorages) ? nextStorages : [])
      setBalances(Array.isArray(nextBalances) ? nextBalances : [])
      setLoading(false)
    }).catch((error) => {
      if (cancelled) return
      setStorages([])
      setBalances([])
      setLoadError(error?.message || 'Unable to load storages.')
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [workspaceId, itemId, requestKey, loadStorages, loadBalances])

  return (
    <StockMovementModal
      item={item}
      movementType={movementType}
      workspaceId={workspaceId}
      onClose={onClose}
      onSubmit={onSubmit}
      isSaving={isSaving}
      storageChoices={storages}
      locationBalances={balances}
      lastUsedStorageId={readLastUsedStockMovementStorage(workspaceId, itemId)}
      storagesLoading={loading}
      storagesError={loadError}
      onRetryStorages={() => setRequestKey((key) => key + 1)}
      onReloadBalances={async () => {
        const nextBalances = await loadBalances(workspaceId, itemId)
        setBalances(Array.isArray(nextBalances) ? nextBalances : [])
      }}
    />
  )
}
