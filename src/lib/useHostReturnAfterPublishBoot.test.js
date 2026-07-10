/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import {
  clearPublishBreadcrumbs,
  getPublishBreadcrumbs,
} from './publishFloorPlanDiagnostics'
import {
  HOST_RETURN_AFTER_PUBLISH_KEY,
  saveHostReturnAfterPublishIntent,
} from './hostReturnAfterPublishBoot'
import { useHostReturnAfterPublishBoot } from './useHostReturnAfterPublishBoot'
import { mockWindowLocationReload } from './test/mockWindowLocationReload'

function BootProbe({
  enabled,
  workspaceId,
  hasDisplayableLayout,
  isLoading,
  loadError,
  setActiveFloorAreaId,
  setFloorPlanMode,
  onReady,
}) {
  const state = useHostReturnAfterPublishBoot({
    enabled,
    workspaceId,
    hasDisplayableLayout,
    isLoading,
    loadError,
    setActiveFloorAreaId,
    setFloorPlanMode,
  })

  onReady(state)
  return createElement('div', { 'data-testid': 'boot-probe' }, state.isBootRestoring ? 'restoring' : 'idle')
}

function renderBootProbe(props) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  let latestState = null

  const renderWith = (nextProps) => {
    act(() => {
      root.render(createElement(BootProbe, {
        ...nextProps,
        onReady: (state) => {
          latestState = state
        },
      }))
    })
  }

  renderWith(props)

  return {
    container,
    getState: () => latestState,
    rerender: renderWith,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

describe('useHostReturnAfterPublishBoot', () => {
  beforeEach(() => {
    sessionStorage.clear()
    clearPublishBreadcrumbs()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('consumes valid boot intent and records boot breadcrumbs', () => {
    saveHostReturnAfterPublishIntent({
      workspaceId: 'ws-1',
      activeFloorAreaId: 'main-dining',
      timestamp: Date.now(),
    })

    const setActiveFloorAreaId = vi.fn()
    const setFloorPlanMode = vi.fn()
    const { getState, unmount } = renderBootProbe({
      enabled: true,
      workspaceId: 'ws-1',
      hasDisplayableLayout: false,
      isLoading: true,
      loadError: null,
      setActiveFloorAreaId,
      setFloorPlanMode,
    })

    expect(setFloorPlanMode).toHaveBeenCalledWith('view')
    expect(setActiveFloorAreaId).toHaveBeenCalledWith('main-dining')
    expect(getPublishBreadcrumbs().map((entry) => entry.stage)).toContain('boot-intent-found')
    expect(getState()?.isBootRestoring).toBe(true)
    expect(sessionStorage.getItem(HOST_RETURN_AFTER_PUBLISH_KEY)).toBeNull()

    unmount()
  })

  it('clears boot intent after successful hydration', () => {
    saveHostReturnAfterPublishIntent({
      workspaceId: 'ws-1',
      activeFloorAreaId: 'main-dining',
      timestamp: Date.now(),
    })

    const setActiveFloorAreaId = vi.fn()
    const setFloorPlanMode = vi.fn()
    const { rerender, getState, unmount } = renderBootProbe({
      enabled: true,
      workspaceId: 'ws-1',
      hasDisplayableLayout: false,
      isLoading: true,
      loadError: null,
      setActiveFloorAreaId,
      setFloorPlanMode,
    })

    rerender({
      enabled: true,
      workspaceId: 'ws-1',
      hasDisplayableLayout: true,
      isLoading: false,
      loadError: null,
      setActiveFloorAreaId,
      setFloorPlanMode,
    })

    const stages = getPublishBreadcrumbs().map((entry) => entry.stage)
    expect(stages).toContain('boot-layout-hydrated')
    expect(stages).toContain('boot-intent-cleared')
    expect(getState()?.bootRestoreFailed).toBe(false)

    unmount()
  })

  it('marks boot failure when hydration fails instead of a blank screen', () => {
    saveHostReturnAfterPublishIntent({
      workspaceId: 'ws-1',
      activeFloorAreaId: 'main-dining',
      timestamp: Date.now(),
    })

    const setActiveFloorAreaId = vi.fn()
    const setFloorPlanMode = vi.fn()
    const { rerender, getState, unmount } = renderBootProbe({
      enabled: true,
      workspaceId: 'ws-1',
      hasDisplayableLayout: false,
      isLoading: true,
      loadError: null,
      setActiveFloorAreaId,
      setFloorPlanMode,
    })

    rerender({
      enabled: true,
      workspaceId: 'ws-1',
      hasDisplayableLayout: false,
      isLoading: false,
      loadError: 'Unable to load layout',
      setActiveFloorAreaId,
      setFloorPlanMode,
    })

    expect(getPublishBreadcrumbs().map((entry) => entry.stage)).toContain('boot-layout-error')
    expect(getState()?.bootRestoreFailed).toBe(true)

    unmount()
  })

  it('never reloads automatically during boot', () => {
    const locationMock = mockWindowLocationReload()

    saveHostReturnAfterPublishIntent({
      workspaceId: 'ws-1',
      activeFloorAreaId: 'main-dining',
      timestamp: Date.now(),
    })

    const { unmount } = renderBootProbe({
      enabled: true,
      workspaceId: 'ws-1',
      hasDisplayableLayout: false,
      isLoading: true,
      loadError: null,
      setActiveFloorAreaId: vi.fn(),
      setFloorPlanMode: vi.fn(),
    })

    expect(locationMock.reload).not.toHaveBeenCalled()
    unmount()
    locationMock.restore()
  })
})
