/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  RECENT_INVENTORY_IMPORT_LIMIT,
  inventoryImportStatusLabel,
  mapInventoryImportHistorySession,
} from './inventoryImportHistory.js'

describe('inventory import history rows', () => {
  it('keeps the last few sessions and reads apply evidence', () => {
    expect(RECENT_INVENTORY_IMPORT_LIMIT).toBe(5)
    const mapped = mapInventoryImportHistorySession({
      id: 'a30c6996-b628-43cb-a6f7-bce51ce03404',
      workspace_id: 'ws-1',
      status: 'completed',
      source_filename: 'one-import-test.csv',
      created_by: 'starter',
      created_at: '2026-10-26T18:00:00.000Z',
      apply_completed_at: '2026-10-26T18:05:00.000Z',
      create_rows: 0,
      link_rows: 0,
      apply_result: {
        created_count: 2,
        linked_count: 0,
        operator_user_id: 'manager-1',
      },
    })

    expect(mapped).toMatchObject({
      id: 'a30c6996-b628-43cb-a6f7-bce51ce03404',
      status: 'completed',
      statusLabel: 'Completed',
      sourceFilename: 'one-import-test.csv',
      actorId: 'manager-1',
      occurredAt: '2026-10-26T18:05:00.000Z',
      createdCount: 2,
      linkedCount: 0,
    })
  })

  it('uses the starter and column counts when apply evidence is empty', () => {
    const mapped = mapInventoryImportHistorySession({
      id: 'sess-2',
      status: 'cancelled',
      created_by: 'starter',
      created_at: '2026-10-26T12:00:00.000Z',
      create_rows: 1,
      link_rows: 4,
      apply_result: {},
    })
    expect(mapped.actorId).toBe('starter')
    expect(mapped.createdCount).toBe(1)
    expect(mapped.linkedCount).toBe(4)
    expect(mapped.statusLabel).toBe('Cancelled')
    expect(inventoryImportStatusLabel('review')).toBe('In progress')
    expect(inventoryImportStatusLabel('failed')).toBe('Failed')
  })
})
