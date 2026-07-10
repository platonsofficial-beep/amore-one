/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import {
  createEmptyHostFloorDebugTrace,
  describeHostFloorDebugTarget,
  patchHostFloorDebugTrace,
  subscribeHostFloorDebugTrace,
} from './hostFloorDebugTrace'

describe('hostFloorDebugTrace', () => {
  it('describes debug targets with class and data id', () => {
    const node = document.createElement('div')
    node.className = 'floor-table-content'
    node.dataset.floorTableId = 'abc123'

    expect(describeHostFloorDebugTarget(node)).toContain('.floor-table-content')
    expect(describeHostFloorDebugTarget(node)).toContain('[abc123]')
  })

  it('patches trace state for subscribers in dev', () => {
    const updates = []
    const unsubscribe = subscribeHostFloorDebugTrace((trace) => updates.push(trace))

    patchHostFloorDebugTrace({ down: true, tableId: 't10' })

    expect(updates.at(-1)?.down).toBe(true)
    expect(updates.at(-1)?.tableId).toBe('t10')
    unsubscribe()
  })

  it('creates an empty trace shape', () => {
    expect(createEmptyHostFloorDebugTrace()).toMatchObject({
      down: false,
      callbackFired: false,
      dayViewState: 'closed',
    })
  })
})
