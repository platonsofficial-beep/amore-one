/**
 * P8.16.8 — Read-only workspace stock catalog loader for operational import.
 */

import { useEffect, useState } from 'react'
import {
  WorkspaceStockCatalogError,
  getWorkspaceStockCatalogItems,
} from '../services/stockItemService'

/**
 * @param {unknown} error
 * @returns {string}
 */
function getCatalogErrorMessage(error) {
  if (error instanceof WorkspaceStockCatalogError) return error.message
  if (error instanceof Error && error.message) return error.message
  return 'Unable to load workspace stock items.'
}

/**
 * @param {{
 *   workspaceId?: string,
 *   enabled?: boolean,
 *   loadItems?: (workspaceId: string) => Promise<Array<{
 *     id: unknown,
 *     name: string,
 *     category: string|null,
 *     unit: string,
 *     sku: unknown,
 *     active: boolean,
 *   }>>,
 * }} [options]
 */
export function useWorkspaceStockCatalog({
  workspaceId = '',
  enabled = false,
  loadItems = getWorkspaceStockCatalogItems,
} = {}) {
  const [status, setStatus] = useState('idle')
  const [items, setItems] = useState([])
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (!enabled) {
      setStatus('idle')
      setItems([])
      setErrorMessage('')
      return undefined
    }

    let cancelled = false

    async function loadCatalog() {
      setStatus('loading')
      setErrorMessage('')
      setItems([])

      try {
        const nextItems = await loadItems(`${workspaceId ?? ''}`.trim())
        if (cancelled) return
        setItems(Array.isArray(nextItems) ? nextItems : [])
        setStatus('success')
      } catch (error) {
        if (cancelled) return
        setItems([])
        setErrorMessage(getCatalogErrorMessage(error))
        setStatus('error')
      }
    }

    loadCatalog()

    return () => {
      cancelled = true
    }
  }, [enabled, workspaceId, loadItems])

  return {
    status,
    items,
    errorMessage,
    productCount: items.length,
  }
}
