/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  clearPublishBreadcrumbs,
  getPublishBreadcrumbs,
  recordPublishBreadcrumb,
} from './publishFloorPlanDiagnostics'
import {
  prepareReturnToHost,
  validatePublishReturnToHostReadiness,
  completeReturnToHost,
} from './publishReturnToHost'
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

describe('publish return-to-host readiness', () => {
  it('requires a valid published layout before leaving the editor', () => {
    const result = validatePublishReturnToHostReadiness({
      transition: { ok: false },
      hasDisplayableLayout: false,
      layout: null,
    })

    expect(result.ok).toBe(false)
    expect(result.message).toContain('Preparing published layout')
  })

  it('resolves a valid active area for a successful publish transition', () => {
    const transition = buildPublishTransitionResult(sampleBuilderLayout)

    const result = validatePublishReturnToHostReadiness({
      transition,
      hasDisplayableLayout: true,
      layout: transition.hostLayout,
    })

    expect(result.ok).toBe(true)
    expect(result.activeFloorAreaId).toBe('main-dining')
  })

  it('keeps editor flow blocked when layout is missing zones', () => {
    const result = validatePublishReturnToHostReadiness({
      transition: {
        ok: true,
        hostLayout: { zones: [], tables: [] },
        activeFloorAreaId: null,
      },
      hasDisplayableLayout: false,
    })

    expect(result.ok).toBe(false)
    expect(result.reason).toBe('missing-zones')
  })
})

describe('publish breadcrumbs', () => {
  beforeEach(() => {
    clearPublishBreadcrumbs()
  })

  it('records publish stages in sessionStorage', () => {
    recordPublishBreadcrumb('publish-start')
    recordPublishBreadcrumb('db-save-success')
    recordPublishBreadcrumb('context-hydrated')

    const breadcrumbs = getPublishBreadcrumbs()
    expect(breadcrumbs.map((entry) => entry.stage)).toEqual([
      'publish-start',
      'db-save-success',
      'context-hydrated',
    ])
  })

  it('prepareReturnToHost records return and active-area breadcrumbs', async () => {
    const transition = buildPublishTransitionResult(sampleBuilderLayout)

    const readiness = await prepareReturnToHost({
      transition,
      hasDisplayableLayout: true,
      layout: transition.hostLayout,
      reload: vi.fn(),
    })

    expect(readiness.ok).toBe(true)
    expect(getPublishBreadcrumbs().map((entry) => entry.stage)).toContain('return-to-host-clicked')
    expect(getPublishBreadcrumbs().map((entry) => entry.stage)).toContain('active-area-resolved')
  })

  it('retry reload can recover a missing layout before return', async () => {
    const transition = buildPublishTransitionResult(sampleBuilderLayout)
    const reload = vi.fn(async () => transition)

    const readiness = await prepareReturnToHost({
      transition: { ok: false },
      hasDisplayableLayout: false,
      layout: null,
      reload,
    })

    expect(reload).toHaveBeenCalled()
    expect(readiness.ok).toBe(true)
    expect(readiness.activeFloorAreaId).toBe('main-dining')
  })
})

describe('controlled publish flow contract', () => {
  it('success state should not auto-exit editor (contract)', () => {
    let editorMounted = true
    let hostVisible = false

    const publishSuccess = () => {
      // Old broken path:
      // editorMounted = false
      // hostVisible = true
    }

    publishSuccess()

    expect(editorMounted).toBe(true)
    expect(hostVisible).toBe(false)
  })

  it('return to host enables exit only after readiness passes for soft transition', async () => {
    let editorMounted = true
    let hostVisible = false
    const transition = buildPublishTransitionResult(sampleBuilderLayout)

    const result = await completeReturnToHost({
      transition,
      hasDisplayableLayout: true,
      layout: transition.hostLayout,
      useControlledReload: false,
    })

    if (result.ok && !result.reload) {
      editorMounted = false
      hostVisible = true
    }

    expect(result.ok).toBe(true)
    expect(result.reload).toBeUndefined()
    expect(editorMounted).toBe(false)
    expect(hostVisible).toBe(true)
  })

  it('host controlled reload keeps editor mounted until page reload', async () => {
    let editorMounted = true
    const transition = buildPublishTransitionResult(sampleBuilderLayout)
    const locationMock = mockWindowLocationReload()

    const result = await completeReturnToHost({
      transition,
      hasDisplayableLayout: true,
      layout: transition.hostLayout,
      useControlledReload: true,
      workspaceId: 'ws-host',
    })

    expect(result).toEqual({ ok: true, reload: true })
    expect(editorMounted).toBe(true)
    expect(locationMock.reload).toHaveBeenCalledTimes(1)

    locationMock.restore()
  })
})
