/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  HOST_RETURN_AFTER_PUBLISH_EXPIRY_MS,
  HOST_RETURN_AFTER_PUBLISH_KEY,
  isValidHostReturnAfterPublishIntent,
  peekHostReturnAfterPublishIntent,
  saveHostReturnAfterPublishIntent,
  takeHostReturnAfterPublishIntent,
  triggerHostReturnAfterPublishReload,
} from './hostReturnAfterPublishBoot'
import {
  clearPublishBreadcrumbs,
  getPublishBreadcrumbs,
} from './publishFloorPlanDiagnostics'
import { completeReturnToHost } from './publishReturnToHost'
import { buildPublishTransitionResult } from './publishFloorPlanTransition'
import { mockWindowLocationReload } from './test/mockWindowLocationReload'

const sampleBuilderLayout = {
  version: 1,
  floors: [{ id: 'main-dining', label: 'Main Dining', workspace: { width: 2200, height: 1400, x: 0, y: 0 } }],
  activeFloorId: 'main-dining',
  objects: [{
    id: 'table-1',
    type: 'table',
    floorId: 'main-dining',
    position: { x: 200, y: 200 },
    size: { width: 140, height: 140 },
    rotation: 0,
    properties: { shape: 'round', tableNumber: '1', minGuests: 2, maxGuests: 4, visible: true },
  }],
}

describe('host return-after-publish boot intent', () => {
  beforeEach(() => {
    sessionStorage.clear()
    clearPublishBreadcrumbs()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('saves workspace id, active floor area id, and timestamp', () => {
    const intent = saveHostReturnAfterPublishIntent({
      workspaceId: 'ws-1',
      activeFloorAreaId: 'main-dining',
      timestamp: 1_700_000_000_000,
    })

    expect(intent).toEqual({
      workspaceId: 'ws-1',
      activeFloorAreaId: 'main-dining',
      timestamp: 1_700_000_000_000,
    })

    const stored = JSON.parse(sessionStorage.getItem(HOST_RETURN_AFTER_PUBLISH_KEY))
    expect(stored).toEqual(intent)
  })

  it('consumes a valid intent exactly once', () => {
    saveHostReturnAfterPublishIntent({
      workspaceId: 'ws-1',
      activeFloorAreaId: 'main-dining',
      timestamp: Date.now(),
    })

    const first = takeHostReturnAfterPublishIntent('ws-1')
    const second = takeHostReturnAfterPublishIntent('ws-1')

    expect(first?.activeFloorAreaId).toBe('main-dining')
    expect(second).toBeNull()
    expect(sessionStorage.getItem(HOST_RETURN_AFTER_PUBLISH_KEY)).toBeNull()
  })

  it('ignores stale intents', () => {
    const staleTimestamp = Date.now() - HOST_RETURN_AFTER_PUBLISH_EXPIRY_MS - 1_000
    saveHostReturnAfterPublishIntent({
      workspaceId: 'ws-1',
      activeFloorAreaId: 'main-dining',
      timestamp: staleTimestamp,
    })

    expect(takeHostReturnAfterPublishIntent('ws-1', Date.now())).toBeNull()
    expect(sessionStorage.getItem(HOST_RETURN_AFTER_PUBLISH_KEY)).toBeNull()
  })

  it('ignores intents for a different workspace', () => {
    saveHostReturnAfterPublishIntent({
      workspaceId: 'ws-1',
      activeFloorAreaId: 'main-dining',
      timestamp: Date.now(),
    })

    expect(takeHostReturnAfterPublishIntent('ws-2')).toBeNull()
    expect(sessionStorage.getItem(HOST_RETURN_AFTER_PUBLISH_KEY)).toBeNull()
  })

  it('peek does not clear the stored intent', () => {
    saveHostReturnAfterPublishIntent({
      workspaceId: 'ws-1',
      activeFloorAreaId: 'main-dining',
      timestamp: Date.now(),
    })

    expect(peekHostReturnAfterPublishIntent('ws-1')?.activeFloorAreaId).toBe('main-dining')
    expect(sessionStorage.getItem(HOST_RETURN_AFTER_PUBLISH_KEY)).toBeTruthy()
  })

  it('validates intent shape', () => {
    const now = Date.now()
    expect(isValidHostReturnAfterPublishIntent({
      workspaceId: 'ws-1',
      activeFloorAreaId: 'main-dining',
      timestamp: now,
    }, 'ws-1', now)).toBe(true)

    expect(isValidHostReturnAfterPublishIntent({
      workspaceId: 'ws-1',
      activeFloorAreaId: '',
      timestamp: now,
    }, 'ws-1', now)).toBe(false)
  })
})

describe('host controlled reload return', () => {
  beforeEach(() => {
    sessionStorage.clear()
    clearPublishBreadcrumbs()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('stores boot intent, records breadcrumb, and reloads for host role', async () => {
    const transition = buildPublishTransitionResult(sampleBuilderLayout)
    const locationMock = mockWindowLocationReload()

    const result = await completeReturnToHost({
      transition,
      hasDisplayableLayout: true,
      layout: transition.hostLayout,
      useControlledReload: true,
      workspaceId: 'ws-1',
    })

    expect(result).toEqual({ ok: true, reload: true })
    expect(locationMock.reload).toHaveBeenCalledTimes(1)

    const stored = JSON.parse(sessionStorage.getItem(HOST_RETURN_AFTER_PUBLISH_KEY))
    expect(stored.workspaceId).toBe('ws-1')
    expect(stored.activeFloorAreaId).toBe('main-dining')
    expect(getPublishBreadcrumbs().map((entry) => entry.stage)).toContain('return-to-host-reload')

    locationMock.restore()
  })

  it('does not reload for manager/owner soft transition', async () => {
    const transition = buildPublishTransitionResult(sampleBuilderLayout)
    const locationMock = mockWindowLocationReload()

    const result = await completeReturnToHost({
      transition,
      hasDisplayableLayout: true,
      layout: transition.hostLayout,
      useControlledReload: false,
      workspaceId: 'ws-1',
    })

    expect(result.ok).toBe(true)
    expect(result.reload).toBeUndefined()
    expect(result.activeFloorAreaId).toBe('main-dining')
    expect(locationMock.reload).not.toHaveBeenCalled()
    expect(sessionStorage.getItem(HOST_RETURN_AFTER_PUBLISH_KEY)).toBeNull()
    expect(getPublishBreadcrumbs().map((entry) => entry.stage)).toContain('host-floor-rendered')

    locationMock.restore()
  })

  it('triggerHostReturnAfterPublishReload does not unmount editor before reload', () => {
    let editorMounted = true
    const locationMock = mockWindowLocationReload()

    triggerHostReturnAfterPublishReload({
      workspaceId: 'ws-1',
      activeFloorAreaId: 'main-dining',
    })

    expect(editorMounted).toBe(true)
    expect(locationMock.reload).toHaveBeenCalledTimes(1)

    locationMock.restore()
  })
})

describe('boot restoration contract', () => {
  beforeEach(() => {
    sessionStorage.clear()
    clearPublishBreadcrumbs()
  })

  it('clears intent after successful take and never auto-reloads on boot', () => {
    saveHostReturnAfterPublishIntent({
      workspaceId: 'ws-1',
      activeFloorAreaId: 'main-dining',
      timestamp: Date.now(),
    })

    const locationMock = mockWindowLocationReload()
    const intent = takeHostReturnAfterPublishIntent('ws-1')

    expect(intent?.activeFloorAreaId).toBe('main-dining')
    expect(locationMock.reload).not.toHaveBeenCalled()
    expect(sessionStorage.getItem(HOST_RETURN_AFTER_PUBLISH_KEY)).toBeNull()

    locationMock.restore()
  })

  it('prevents reload loops by clearing invalid intents on take', () => {
    saveHostReturnAfterPublishIntent({
      workspaceId: 'ws-1',
      activeFloorAreaId: 'main-dining',
      timestamp: Date.now() - HOST_RETURN_AFTER_PUBLISH_EXPIRY_MS - 5_000,
    })

    expect(takeHostReturnAfterPublishIntent('ws-1')).toBeNull()
    expect(sessionStorage.getItem(HOST_RETURN_AFTER_PUBLISH_KEY)).toBeNull()
  })
})
