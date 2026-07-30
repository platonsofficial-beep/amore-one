/**
 * P8.30.4 — Storage Fast Count launch.
 *
 * Shortcut into the existing Inventory Count engine for exactly one storage.
 * No Fast Count session/workspace/snapshot/post of its own.
 */

import { createInventoryCountSessionWithSnapshot } from './inventoryCountService'

/**
 * Resolve the Inventory Count location key for a Storage Center storage row.
 * Count sessions store `location_key` strings that must match
 * `stock_items.storage_location` exactly — never workspace_storages.id.
 *
 * @param {object|null|undefined} storage
 * @returns {string}
 */
export function resolveStorageFastCountLocationKey(storage) {
  const key = storage?.locationKey ?? storage?.location_key ?? ''
  return typeof key === 'string' ? key : `${key ?? ''}`
}

/**
 * Create a normal Inventory Count session scoped to one storage and build its snapshot.
 *
 * Defaults mirror the wizard:
 * - countType: partial (single location)
 * - visibility: blind
 * - includeZeroStock: true
 * - includeInactive: false
 * - note: optional
 *
 * @param {{
 *   workspaceId?: string,
 *   storage?: object,
 *   note?: string,
 *   createSessionWithSnapshot?: typeof createInventoryCountSessionWithSnapshot,
 * }} [input]
 * @returns {Promise<{ session: object, snapshot: object, locationKey: string }>}
 */
export async function startStorageFastCountSession({
  workspaceId = '',
  storage = null,
  note = '',
  createSessionWithSnapshot = createInventoryCountSessionWithSnapshot,
} = {}) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  if (!normalizedWorkspaceId) {
    throw new Error('Workspace is required to start Fast Count.')
  }

  const locationKey = resolveStorageFastCountLocationKey(storage)
  if (locationKey.trim() === '') {
    throw new Error('Storage location is required to start Fast Count.')
  }

  const { session, snapshot } = await createSessionWithSnapshot({
    workspaceId: normalizedWorkspaceId,
    countType: 'partial',
    visibility: 'blind',
    includeZeroStock: true,
    includeInactive: false,
    note: `${note ?? ''}`,
    locations: [locationKey],
  })

  return {
    session,
    snapshot,
    locationKey,
  }
}
