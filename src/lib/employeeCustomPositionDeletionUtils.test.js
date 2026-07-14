// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  cancelPendingEmployeePositionDeletion,
  clearPendingEmployeePositionDeletions,
  createPendingEmployeePositionDeletionEntry,
  employeeReferencesWorkspacePosition,
  getPendingEmployeePositionDeletionsForCatalogCleanup,
  isEmployeePositionPendingDeletion,
  prunePendingEmployeePositionDeletionsForSelection,
  queuePendingEmployeePositionDeletion,
} from './employeeCustomPositionDeletionUtils'

describe('employeeCustomPositionDeletionUtils', () => {
  it('queues workspace position deletions by stable ID without duplicates', () => {
    const first = queuePendingEmployeePositionDeletion([], { id: 12, name: 'Lolo' })
    const second = queuePendingEmployeePositionDeletion(first, { id: 12, name: 'Lolo' })

    expect(first).toEqual([{ id: 12, name: 'Lolo' }])
    expect(second).toEqual(first)
  })

  it('does not queue legacy no-ID values', () => {
    expect(createPendingEmployeePositionDeletionEntry({ id: null, name: 'Lolo' })).toBeNull()
    expect(queuePendingEmployeePositionDeletion([], { id: null, name: 'Lolo' })).toEqual([])
  })

  it('cancels pending deletion when a position is re-selected', () => {
    const pending = [{ id: 12, name: 'Lolo' }]
    const labelsMatch = (left, right) => `${left}`.trim().toLowerCase() === `${right}`.trim().toLowerCase()

    expect(prunePendingEmployeePositionDeletionsForSelection(pending, ['Lolo'], labelsMatch)).toEqual([])
    expect(prunePendingEmployeePositionDeletionsForSelection(pending, ['Sommelier'], labelsMatch)).toEqual(pending)
  })

  it('clears pending deletions', () => {
    expect(clearPendingEmployeePositionDeletions()).toEqual([])
  })

  it('blocks canonical positions from catalog cleanup candidates', () => {
    const pending = [{ id: 1, name: 'Bartender' }]
    const employees = []

    expect(getPendingEmployeePositionDeletionsForCatalogCleanup(
      pending,
      employees,
      (name) => name === 'Bartender',
    )).toEqual([])
  })

  it('skips catalog cleanup when another employee still references the position', () => {
    const pending = [{ id: 12, name: 'Lolo' }]
    const employees = [{
      id: 'emp-2',
      primaryPosition: '',
      additionalPositions: ['Lolo'],
      positions: [{ id: 12, name: 'Lolo' }],
    }]

    expect(getPendingEmployeePositionDeletionsForCatalogCleanup(
      pending,
      employees,
      () => false,
    )).toEqual([])
  })

  it('returns cleanup candidates only after employee synchronization would leave them unused', () => {
    const pending = [{ id: 12, name: 'Lolo' }]
    const employees = [{
      id: 'emp-1',
      primaryPosition: 'Host',
      additionalPositions: [],
      positions: [{ id: 3, name: 'Host' }],
    }]

    expect(getPendingEmployeePositionDeletionsForCatalogCleanup(
      pending,
      employees,
      () => false,
    )).toEqual(pending)
  })

  it('detects employee usage across primary, additional, and junction positions', () => {
    expect(employeeReferencesWorkspacePosition({
      primaryPosition: 'Lolo',
      additionalPositions: [],
      positions: [],
    }, 12, 'Lolo')).toBe(true)

    expect(employeeReferencesWorkspacePosition({
      primaryPosition: 'Host',
      additionalPositions: ['Lolo'],
      positions: [],
    }, 12, 'Lolo')).toBe(true)

    expect(employeeReferencesWorkspacePosition({
      primaryPosition: 'Host',
      additionalPositions: [],
      positions: [{ id: 12, name: 'Lolo' }],
    }, 12, 'Lolo')).toBe(true)
  })

  it('cancels pending deletion by ID or name', () => {
    const pending = [{ id: 12, name: 'Lolo' }]

    expect(cancelPendingEmployeePositionDeletion(pending, { id: 12 })).toEqual([])
    expect(cancelPendingEmployeePositionDeletion(pending, { name: 'Lolo' })).toEqual([])
    expect(isEmployeePositionPendingDeletion(pending, { id: 12 })).toBe(true)
  })
})
