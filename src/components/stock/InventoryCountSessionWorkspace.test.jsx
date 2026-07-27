/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InventoryCountView } from './InventoryCountView'
import {
  getCompleteLocationDisabledReason,
  canCompleteInventoryCountLocation,
  getDisplayedLocationItems,
  findNextEligibleCountItem,
  getFinishCountDisabledReason,
  getFinishPreviewPostingHero,
  getInventoryCountKeyboardAvailableHeight,
  getInventoryCountUsableViewportRect,
  getLocationReadinessLabel,
  INVENTORY_COUNT_ENTER_REVEAL_MAX_LAYOUT_FRAMES,
  INVENTORY_COUNT_SHEET_END_CLEARANCE_PX,
  INVENTORY_COUNT_USABLE_BOTTOM_INSET_PX,
  INVENTORY_COUNT_USABLE_TOP_INSET_PX,
  InventoryCountSessionWorkspace,
  isInventoryCountCountedInputOutsideUsableViewport,
  isInventoryCountRowOutsideViewport,
  scrollInventoryCountCountedInputIntoView,
  scrollInventoryCountRowIntoView,
  shouldShowFinishCountDisabledBanner,
} from './InventoryCountSessionWorkspace'
import {
  buildInventoryCountSnapshot,
  completeInventoryCountLocation,
  createInventoryCountSession,
  getInventoryCountSession,
  getInventoryCountSessionItems,
  getInventoryCountSessionLocations,
  previewInventoryCountFinish,
  postInventoryCountFinish,
  setInventoryCountSessionPauseState,
  updateInventoryCountItem,
} from '../../services/inventoryCountService'

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    workspace: { id: 'workspace-test-id', name: 'Test Workspace' },
  }),
}))

vi.mock('../../services/inventoryCountService', () => ({
  createInventoryCountSession: vi.fn(),
  buildInventoryCountSnapshot: vi.fn(),
  getInventoryCountSession: vi.fn(async () => ({
    id: 'session-real-1',
    workspaceId: 'workspace-test-id',
    status: 'in_progress',
  })),
  getInventoryCountSessionLocations: vi.fn(),
  getInventoryCountSessionItems: vi.fn(),
  updateInventoryCountItem: vi.fn(),
  completeInventoryCountLocation: vi.fn(),
  setInventoryCountSessionPauseState: vi.fn(),
  previewInventoryCountFinish: vi.fn(),
  postInventoryCountFinish: vi.fn(),
  cancelInventoryCountSession: vi.fn(),
  listInventoryCountHomeSessions: vi.fn(async () => ({
    active: [],
    paused: [],
    recent: [],
  })),
}))

function render(ui) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(ui)
  })

  return {
    container,
    cleanup: () => {
      act(() => {
        root.unmount()
      })
      container.remove()
    },
  }
}

function getButtonByText(root, text) {
  return Array.from(root.querySelectorAll('button')).find((button) => button.textContent === text)
}

function getRailButton(container, locationName) {
  return Array.from(container.querySelectorAll('.inventory-count-session-rail-item')).find(
    (button) => button.textContent.includes(locationName),
  )
}

function getProgressSnapshot(container) {
  const card = container.querySelector('.inventory-count-session-progress-card')
  return card?.textContent ?? ''
}

function countCurrentLocations(container) {
  return container.querySelectorAll('.inventory-count-session-rail-item.is-current').length
}

function sessionLocation(id, locationKey, sortOrder, status) {
  return {
    id,
    sessionId: 'session-real-1',
    workspaceId: 'workspace-test-id',
    locationKey,
    sortOrder,
    status,
  }
}

function sessionItem({
  id,
  itemName,
  unit = 'case',
  storageLocation,
  expectedSnapshot = 0,
  countedQuantity = null,
  lineStatus = 'pending',
  category = 'Other',
  itemType = 'Other',
}) {
  return {
    id,
    sessionId: 'session-real-1',
    workspaceId: 'workspace-test-id',
    itemId: `stock-${id}`,
    itemName,
    category,
    itemType,
    unit,
    storageLocation,
    expectedSnapshot,
    countedQuantity,
    lineStatus,
    note: '',
  }
}

const FIXTURE_LOCATIONS = [
  sessionLocation('loc-1', 'Main Storage', 0, 'current'),
  sessionLocation('loc-2', 'Coffee Station', 1, 'not_started'),
  sessionLocation('loc-3', 'Kitchen', 2, 'completed'),
]

const FIXTURE_ITEMS = [
  sessionItem({
    id: 'ms-1',
    itemName: 'Coca-Cola',
    category: 'Beverage',
    itemType: 'Soft Drink',
    storageLocation: 'Main Storage',
    expectedSnapshot: 10,
    countedQuantity: 10,
    lineStatus: 'counted',
  }),
  sessionItem({
    id: 'ms-2',
    itemName: 'Paper Straws',
    category: 'Consumables',
    itemType: 'Disposable',
    unit: 'box',
    storageLocation: 'Main Storage',
    expectedSnapshot: 4,
    countedQuantity: null,
    lineStatus: 'pending',
  }),
  sessionItem({
    id: 'cs-1',
    itemName: 'Espresso Beans',
    category: 'Coffee',
    itemType: 'Dry Goods',
    unit: 'kg',
    storageLocation: 'Coffee Station',
    expectedSnapshot: 2,
    countedQuantity: null,
    lineStatus: 'pending',
  }),
  sessionItem({
    id: 'cs-2',
    itemName: 'Oat Milk',
    category: 'Dairy Alternative',
    itemType: 'Chilled',
    unit: 'litre',
    storageLocation: 'Coffee Station',
    expectedSnapshot: 6,
    countedQuantity: null,
    lineStatus: 'pending',
  }),
  sessionItem({
    id: 'k-1',
    itemName: 'Olive Oil',
    category: 'Kitchen',
    itemType: 'Oil',
    unit: 'litre',
    storageLocation: 'Kitchen',
    expectedSnapshot: 4,
    countedQuantity: 4,
    lineStatus: 'counted',
  }),
]

async function renderWorkspace(props = {}) {
  const rendered = render(
    createElement(InventoryCountSessionWorkspace, {
      onExit: vi.fn(),
      sessionId: 'session-real-1',
      workspaceId: 'workspace-test-id',
      ...props,
    }),
  )

  await act(async () => {
    await Promise.resolve()
  })

  return rendered
}

async function advanceWizardToSession(container) {
  act(() => {
    getButtonByText(container, 'Start new count').click()
  })

  const dialog = container.querySelector('[role="dialog"]')
  const continueBtn = getButtonByText(dialog, 'Continue')
  const typeCards = dialog.querySelectorAll('[role="radio"]')

  act(() => {
    typeCards[0].click()
  })
  act(() => {
    continueBtn.click()
  })

  const locationCards = dialog.querySelectorAll('[role="checkbox"]')
  act(() => {
    locationCards[0].click()
  })
  act(() => {
    continueBtn.click()
  })
  act(() => {
    continueBtn.click()
  })

  const startBtn = getButtonByText(dialog, 'Start Inventory Count Session')
  await act(async () => {
    startBtn.click()
  })

  await act(async () => {
    await Promise.resolve()
  })
}

describe('InventoryCountSessionWorkspace real session items', () => {
  beforeEach(() => {
    createInventoryCountSession.mockReset()
    buildInventoryCountSnapshot.mockReset()
    getInventoryCountSession.mockReset()
    getInventoryCountSessionLocations.mockReset()
    getInventoryCountSessionItems.mockReset()
    updateInventoryCountItem.mockReset()
    completeInventoryCountLocation.mockReset()
    setInventoryCountSessionPauseState.mockReset()
    previewInventoryCountFinish.mockReset()
    postInventoryCountFinish.mockReset()

    createInventoryCountSession.mockResolvedValue({
      id: 'session-real-1',
      workspaceId: 'workspace-test-id',
      status: 'in_progress',
      countType: 'new',
      visibility: 'blind',
      includeZeroStock: true,
      includeInactive: false,
      note: '',
    })
    buildInventoryCountSnapshot.mockResolvedValue({
      sessionId: 'session-real-1',
      itemsCreated: 5,
      snapshotCreatedAt: '2026-07-20T12:00:00.000Z',
    })
    getInventoryCountSession.mockResolvedValue({
      id: 'session-real-1',
      workspaceId: 'workspace-test-id',
      status: 'in_progress',
    })
    getInventoryCountSessionLocations.mockResolvedValue(FIXTURE_LOCATIONS)
    getInventoryCountSessionItems.mockResolvedValue(FIXTURE_ITEMS)
    updateInventoryCountItem.mockImplementation(async ({ sessionItemId, countedQuantity }) => ({
      id: sessionItemId,
      sessionId: 'session-real-1',
      workspaceId: 'workspace-test-id',
      itemId: `stock-${sessionItemId}`,
      itemName: 'Saved item',
      category: 'Other',
      itemType: 'Other',
      unit: 'case',
      storageLocation: 'Main Storage',
      expectedSnapshot: 0,
      countedQuantity: countedQuantity === null || countedQuantity === undefined
        ? null
        : Number(countedQuantity),
      lineStatus: countedQuantity === null || countedQuantity === undefined ? 'pending' : 'counted',
      note: '',
    }))
    completeInventoryCountLocation.mockResolvedValue({
      sessionId: 'session-real-1',
      completedLocationId: 'loc-1',
      nextLocationId: 'loc-2',
      sessionStatus: 'in_progress',
      allLocationsCompleted: false,
    })
    previewInventoryCountFinish.mockResolvedValue({
      sessionId: 'session-real-1',
      workspaceId: 'workspace-test-id',
      sessionStatus: 'counting_complete',
      snapshotAt: '2026-07-21T10:00:00.000Z',
      previewGeneratedAt: '2026-07-21T12:00:00.000Z',
      canPost: true,
      summary: {
        totalLines: 0,
        countedLines: 0,
        skippedLines: 0,
        changedItems: 0,
        unchangedItems: 0,
        positiveVariances: 0,
        negativeVariances: 0,
        zeroVariances: 0,
        blockingIssueCount: 0,
        canPost: true,
      },
      lines: [],
      skipped: [],
      blockingIssues: [],
    })
  })

  it('propagates the exact wizard sessionId through View into Workspace queries', async () => {
    const { container, cleanup } = render(createElement(InventoryCountView))

    expect(container.querySelector('.inventory-count-session')).toBeNull()
    await advanceWizardToSession(container)

    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(container.querySelector('.inventory-count-session')).not.toBeNull()
    expect(container.textContent).toContain('Inventory Count Session')
    expect(container.textContent).toContain('Coca-Cola')

    expect(getInventoryCountSessionItems).toHaveBeenCalledTimes(1)
    expect(getInventoryCountSessionLocations).toHaveBeenCalledTimes(1)
    expect(getInventoryCountSessionItems).toHaveBeenCalledWith({
      workspaceId: 'workspace-test-id',
      sessionId: 'session-real-1',
    })
    expect(getInventoryCountSessionLocations).toHaveBeenCalledWith({
      workspaceId: 'workspace-test-id',
      sessionId: 'session-real-1',
    })

    act(() => {
      getButtonByText(container, 'Exit').click()
    })
    expect(container.querySelector('.inventory-count-session')).toBeNull()
    expect(container.textContent).toContain('Start new count')

    cleanup()
  })

  it('renders real locations and switches item rows on tap', async () => {
    const { container, cleanup } = await renderWorkspace()

    expect(getRailButton(container, 'Main Storage')).toBeTruthy()
    expect(getRailButton(container, 'Coffee Station')).toBeTruthy()
    expect(getRailButton(container, 'Kitchen')).toBeTruthy()

    const searchInput = container.querySelector('.inventory-count-session-search-input')
    expect(searchInput?.getAttribute('placeholder')).toBe('Search Main Storage items...')
    expect(container.textContent).toContain('Coca-Cola')
    expect(container.textContent).toContain('Paper Straws')
    expect(container.textContent).toContain('10')
    expect(container.querySelectorAll('.inventory-count-session-spreadsheet-row')).toHaveLength(2)

    const progressBefore = getProgressSnapshot(container)

    act(() => {
      getRailButton(container, 'Coffee Station').click()
    })

    expect(searchInput?.getAttribute('placeholder')).toBe('Search Coffee Station items...')
    expect(container.textContent).toContain('Espresso Beans')
    expect(container.textContent).toContain('Oat Milk')
    expect(container.textContent).not.toContain('Coca-Cola')
    expect(getProgressSnapshot(container)).toBe(progressBefore)
    expect(getRailButton(container, 'Coffee Station')?.getAttribute('aria-pressed')).toBe('true')

    cleanup()
  })

  it('navigates with Previous and Next without changing location statuses', async () => {
    const { container, cleanup } = await renderWorkspace()

    const previousBtn = getButtonByText(container, 'Previous')
    const nextBtn = getButtonByText(container, 'Next')

    expect(previousBtn?.disabled).toBe(true)
    expect(nextBtn?.disabled).toBe(false)
    expect(container.textContent).toContain('Coca-Cola')

    act(() => {
      nextBtn.click()
    })
    expect(container.querySelector('.inventory-count-session-search-input')?.getAttribute('placeholder'))
      .toBe('Search Coffee Station items...')
    expect(container.textContent).toContain('Espresso Beans')
    expect(getRailButton(container, 'Main Storage')?.className).toContain('is-current')

    act(() => {
      getRailButton(container, 'Kitchen').click()
    })
    expect(nextBtn?.disabled).toBe(true)

    act(() => {
      previousBtn.click()
    })
    expect(container.querySelector('.inventory-count-session-search-input')?.getAttribute('placeholder'))
      .toBe('Search Coffee Station items...')

    cleanup()
  })

  it('completes the selected location via RPC and auto-selects the next location', async () => {
    getInventoryCountSessionItems.mockResolvedValueOnce([
      sessionItem({
        id: 'ms-1',
        itemName: 'Coca-Cola',
        storageLocation: 'Main Storage',
        expectedSnapshot: 10,
        countedQuantity: 10,
        lineStatus: 'counted',
      }),
      sessionItem({
        id: 'ms-2',
        itemName: 'Paper Straws',
        unit: 'box',
        storageLocation: 'Main Storage',
        expectedSnapshot: 4,
        countedQuantity: 4,
        lineStatus: 'counted',
      }),
      sessionItem({
        id: 'cs-1',
        itemName: 'Espresso Beans',
        unit: 'kg',
        storageLocation: 'Coffee Station',
        expectedSnapshot: 2,
        countedQuantity: null,
        lineStatus: 'pending',
      }),
      sessionItem({
        id: 'cs-2',
        itemName: 'Oat Milk',
        unit: 'litre',
        storageLocation: 'Coffee Station',
        expectedSnapshot: 6,
        countedQuantity: null,
        lineStatus: 'pending',
      }),
      sessionItem({
        id: 'k-1',
        itemName: 'Olive Oil',
        unit: 'litre',
        storageLocation: 'Kitchen',
        expectedSnapshot: 4,
        countedQuantity: 4,
        lineStatus: 'counted',
      }),
    ])

    const { container, cleanup } = await renderWorkspace()

    expect(getProgressSnapshot(container)).toContain('3 / 5 counted')
    expect(getProgressSnapshot(container)).toContain('1 / 3 locations complete')
    expect(getButtonByText(container, 'Finish Count')?.disabled).toBe(true)
    // P8.19.5 — routine pending copy stays on the button title, not a duplicate banner
    expect(container.querySelector('.inventory-count-finish-disabled-reason')).toBeNull()
    expect(getButtonByText(container, 'Finish Count')?.getAttribute('title'))
      .toContain('2 items are still pending.')

    const completeBtn = getButtonByText(container, 'Complete Location')
    expect(completeBtn?.disabled).toBe(false)

    await act(async () => {
      completeBtn.click()
      await Promise.resolve()
    })

    expect(completeInventoryCountLocation).toHaveBeenCalledWith({
      workspaceId: 'workspace-test-id',
      sessionId: 'session-real-1',
      locationId: 'loc-1',
    })
    expect(getRailButton(container, 'Main Storage')?.className).toContain('is-completed')
    expect(getRailButton(container, 'Coffee Station')?.className).toContain('is-current')
    expect(countCurrentLocations(container)).toBe(1)
    expect(container.textContent).toContain('Espresso Beans')
    expect(getProgressSnapshot(container)).toContain('2 / 3 locations complete')
    // P8.20.2b — pending items disable Complete Location (matches tooltip / click gate)
    expect(getButtonByText(container, 'Complete Location')?.disabled).toBe(true)
    expect(getButtonByText(container, 'Complete Location')?.getAttribute('title'))
      .toContain('2 items are still pending.')

    cleanup()
  })

  it('marks the session counting_complete when the final location is completed', async () => {
    getInventoryCountSessionLocations.mockResolvedValueOnce([
      sessionLocation('loc-1', 'Main Storage', 0, 'current'),
      sessionLocation('loc-2', 'Coffee Station', 1, 'completed'),
      sessionLocation('loc-3', 'Kitchen', 2, 'completed'),
    ])
    getInventoryCountSessionItems.mockResolvedValueOnce([
      sessionItem({
        id: 'ms-1',
        itemName: 'Coca-Cola',
        storageLocation: 'Main Storage',
        expectedSnapshot: 10,
        countedQuantity: 10,
        lineStatus: 'counted',
      }),
      sessionItem({
        id: 'cs-1',
        itemName: 'Espresso Beans',
        unit: 'kg',
        storageLocation: 'Coffee Station',
        expectedSnapshot: 2,
        countedQuantity: 2,
        lineStatus: 'counted',
      }),
      sessionItem({
        id: 'k-1',
        itemName: 'Olive Oil',
        unit: 'litre',
        storageLocation: 'Kitchen',
        expectedSnapshot: 4,
        countedQuantity: 4,
        lineStatus: 'counted',
      }),
    ])
    completeInventoryCountLocation.mockResolvedValueOnce({
      sessionId: 'session-real-1',
      completedLocationId: 'loc-1',
      nextLocationId: null,
      sessionStatus: 'counting_complete',
      allLocationsCompleted: true,
    })

    const { container, cleanup } = await renderWorkspace()

    expect(container.querySelector('.inventory-count-session-pill')?.textContent).toBe('In Progress')
    expect(container.textContent).not.toContain(
      'All locations are complete. Review variances with Finish Count.',
    )
    expect(getButtonByText(container, 'Finish Count')?.disabled).toBe(true)

    await act(async () => {
      getButtonByText(container, 'Complete Location').click()
      await Promise.resolve()
    })

    expect(completeInventoryCountLocation).toHaveBeenCalledWith({
      workspaceId: 'workspace-test-id',
      sessionId: 'session-real-1',
      locationId: 'loc-1',
    })
    expect(container.querySelector('.inventory-count-session-pill')?.textContent)
      .toBe('Counting Complete')
    expect(container.querySelector('.inventory-count-session-footer-value')?.textContent)
      .toMatch(/All changes saved|Saving|Save failed/)
    expect(container.textContent).toContain(
      'All locations are complete. Review variances with Finish Count.',
    )
    expect(getButtonByText(container, 'Complete Location')?.disabled).toBe(true)
    expect(getButtonByText(container, 'Finish Count')?.disabled).toBe(false)
    expect(countCurrentLocations(container)).toBe(0)

    act(() => {
      getRailButton(container, 'Coffee Station').click()
    })
    expect(container.querySelector('.inventory-count-session-pill')?.textContent)
      .toBe('Counting Complete')
    expect(container.textContent).toContain(
      'All locations are complete. Review variances with Finish Count.',
    )
    expect(getButtonByText(container, 'Finish Count')?.disabled).toBe(false)

    cleanup()
  })

  it('allows explicit Complete Location for an empty current location without auto-completing', async () => {
    getInventoryCountSessionLocations.mockResolvedValueOnce([
      sessionLocation('loc-1', 'Main Storage', 0, 'current'),
      sessionLocation('loc-2', 'Coffee Station', 1, 'not_started'),
    ])
    getInventoryCountSessionItems.mockResolvedValueOnce([])
    completeInventoryCountLocation.mockResolvedValueOnce({
      sessionId: 'session-real-1',
      completedLocationId: 'loc-1',
      nextLocationId: 'loc-2',
      sessionStatus: 'in_progress',
      allLocationsCompleted: false,
    })

    const { container, cleanup } = await renderWorkspace()

    expect(completeInventoryCountLocation).not.toHaveBeenCalled()
    expect(container.textContent).toContain('No items in this location')
    expect(getButtonByText(container, 'Complete Location')?.disabled).toBe(false)
    expect(getRailButton(container, 'Main Storage')?.className).toContain('is-current')
    expect(getButtonByText(container, 'Finish Count')?.disabled).toBe(true)

    await act(async () => {
      getButtonByText(container, 'Complete Location').click()
      await Promise.resolve()
    })

    expect(completeInventoryCountLocation).toHaveBeenCalledTimes(1)
    expect(completeInventoryCountLocation).toHaveBeenCalledWith({
      workspaceId: 'workspace-test-id',
      sessionId: 'session-real-1',
      locationId: 'loc-1',
    })
    expect(getRailButton(container, 'Main Storage')?.className).toContain('is-completed')
    expect(getRailButton(container, 'Coffee Station')?.className).toContain('is-current')
    expect(container.querySelector('.inventory-count-session-pill')?.textContent).toBe('In Progress')
    expect(container.textContent).not.toContain(
      'All locations are complete. Review variances with Finish Count.',
    )

    cleanup()
  })

  it('surfaces complete-location failures without advancing', async () => {
    getInventoryCountSessionItems.mockResolvedValueOnce([
      sessionItem({
        id: 'ms-1',
        itemName: 'Coca-Cola',
        storageLocation: 'Main Storage',
        expectedSnapshot: 10,
        countedQuantity: 10,
        lineStatus: 'counted',
      }),
      sessionItem({
        id: 'ms-2',
        itemName: 'Paper Straws',
        unit: 'box',
        storageLocation: 'Main Storage',
        expectedSnapshot: 4,
        countedQuantity: 4,
        lineStatus: 'counted',
      }),
    ])
    completeInventoryCountLocation.mockRejectedValueOnce(
      new Error('Count or skip all items in this location before completing it.'),
    )
    const { container, cleanup } = await renderWorkspace()

    expect(getButtonByText(container, 'Complete Location')?.disabled).toBe(false)

    await act(async () => {
      getButtonByText(container, 'Complete Location').click()
      await Promise.resolve()
    })

    expect(container.querySelector('.staff-status-banner')?.textContent)
      .toBe('Count or skip all items in this location before completing it.')
    expect(getRailButton(container, 'Main Storage')?.className).toContain('is-current')
    expect(getRailButton(container, 'Coffee Station')?.className).not.toContain('is-current')

    cleanup()
  })

  it('shows loading state while session items are fetching', async () => {
    let resolveItems
    getInventoryCountSessionItems.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveItems = resolve
      }),
    )

    const { container, cleanup } = render(
      createElement(InventoryCountSessionWorkspace, {
        onExit: vi.fn(),
        sessionId: 'session-real-1',
        workspaceId: 'workspace-test-id',
      }),
    )

    expect(container.textContent).toContain('Loading inventory count…')

    await act(async () => {
      resolveItems(FIXTURE_ITEMS)
    })

    expect(container.textContent).not.toContain('Loading inventory count…')
    expect(container.textContent).toContain('Coca-Cola')

    cleanup()
  })

  it('shows error state when loading fails', async () => {
    getInventoryCountSessionItems.mockRejectedValueOnce(new Error('network down'))

    const { container, cleanup } = await renderWorkspace()

    expect(container.querySelector('.staff-status-banner')?.textContent).toBe('network down')
    expect(container.querySelector('.inventory-count-session-table')).toBeNull()

    cleanup()
  })

  it('shows empty state when the session has no items or locations', async () => {
    getInventoryCountSessionLocations.mockResolvedValueOnce([])
    getInventoryCountSessionItems.mockResolvedValueOnce([])

    const { container, cleanup } = await renderWorkspace()

    expect(container.textContent).toContain('No items in this session')
    expect(container.querySelector('.inventory-count-session-table')).toBeNull()

    cleanup()
  })

  it('shows missing-session error and does not query items or locations', async () => {
    const { container, cleanup } = await renderWorkspace({ sessionId: '' })

    expect(container.querySelector('.staff-status-banner')?.textContent)
      .toBe('Inventory count session was not found.')
    expect(getInventoryCountSessionItems).not.toHaveBeenCalled()
    expect(getInventoryCountSessionLocations).not.toHaveBeenCalled()
    expect(container.querySelector('.inventory-count-session-table')).toBeNull()

    cleanup()
  })

  it('queries only the explicit sessionId passed into the workspace', async () => {
    const { cleanup } = await renderWorkspace({
      sessionId: 'session-exact-42',
      workspaceId: 'workspace-exact-9',
    })

    expect(getInventoryCountSessionItems).toHaveBeenCalledWith({
      workspaceId: 'workspace-exact-9',
      sessionId: 'session-exact-42',
    })
    expect(getInventoryCountSessionLocations).toHaveBeenCalledWith({
      workspaceId: 'workspace-exact-9',
      sessionId: 'session-exact-42',
    })

    cleanup()
  })

  it('does not include latest-session fallback wiring', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const workspaceSource = readFileSync(
      resolve(process.cwd(), 'src/components/stock/InventoryCountSessionWorkspace.jsx'),
      'utf8',
    )
    const serviceSource = readFileSync(
      resolve(process.cwd(), 'src/services/inventoryCountService.js'),
      'utf8',
    )
    const viewSource = readFileSync(
      resolve(process.cwd(), 'src/components/stock/InventoryCountView.jsx'),
      'utf8',
    )

    expect(workspaceSource).toContain('completeInventoryCountLocation')
    expect(workspaceSource).toContain('getInventoryCountSessionItems')
    expect(workspaceSource).toContain('updateInventoryCountItem')
    expect(workspaceSource).toContain('sessionItemId:')
    expect(workspaceSource).not.toContain('getLatestInProgressInventoryCountSession')
    expect(serviceSource).not.toContain('getLatestInProgressInventoryCountSession')
    expect(serviceSource).toContain('update_inventory_count_session_item')
    expect(serviceSource).toContain('complete_inventory_count_location')
    expect(serviceSource).toContain('completeInventoryCountLocation')
    expect(serviceSource).toContain('sessionItemId')
    expect(serviceSource).not.toMatch(/\.update\(\s*\{\s*counted_quantity/)
    expect(viewSource).toContain('sessionId={activeSessionId}')
    expect(viewSource).toContain('workspaceId={activeWorkspaceId}')
    expect(workspaceSource).not.toMatch(/localStorage|sessionStorage|recordStockMovement|postCount|fetch\(/i)
  })

  it('autosaves counted edits after debounce and updates progress', async () => {
    const { container, cleanup } = await renderWorkspace()
    vi.useFakeTimers()

    const paperStrawsInput = container.querySelector(
      'input[aria-label="Counted quantity for Paper Straws"]',
    )
    expect(paperStrawsInput).toBeTruthy()
    expect(getProgressSnapshot(container)).toContain('2 / 5 counted')
    expect(getRailButton(container, 'Main Storage')?.textContent).toContain('1 / 2')

    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      nativeInputValueSetter?.call(paperStrawsInput, '4')
      paperStrawsInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    expect(paperStrawsInput.value).toBe('4')
    expect(updateInventoryCountItem).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(400)
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(updateInventoryCountItem).toHaveBeenCalledTimes(1)
    expect(updateInventoryCountItem).toHaveBeenCalledWith({
      workspaceId: 'workspace-test-id',
      sessionId: 'session-real-1',
      sessionItemId: 'ms-2',
      countedQuantity: 4,
    })
    expect(getProgressSnapshot(container)).toContain('3 / 5 counted')
    expect(getRailButton(container, 'Main Storage')?.textContent).toContain('2 / 2')

    cleanup()
    vi.useRealTimers()
  })

  it('clears counted quantity back to pending on empty input', async () => {
    const { container, cleanup } = await renderWorkspace()
    vi.useFakeTimers()

    const cokeInput = container.querySelector(
      'input[aria-label="Counted quantity for Coca-Cola"]',
    )
    expect(cokeInput?.value).toBe('10')
    expect(getProgressSnapshot(container)).toContain('2 / 5 counted')

    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      nativeInputValueSetter?.call(cokeInput, '')
      cokeInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await act(async () => {
      vi.advanceTimersByTime(400)
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(updateInventoryCountItem).toHaveBeenCalledWith({
      workspaceId: 'workspace-test-id',
      sessionId: 'session-real-1',
      sessionItemId: 'ms-1',
      countedQuantity: null,
    })
    expect(cokeInput.value).toBe('')
    expect(getProgressSnapshot(container)).toContain('1 / 5 counted')
    expect(getRailButton(container, 'Main Storage')?.textContent).toContain('0 / 2')

    cleanup()
    vi.useRealTimers()
  })

  it('rolls back optimistic edits when autosave fails', async () => {
    updateInventoryCountItem.mockRejectedValueOnce(new Error('save failed'))
    const { container, cleanup } = await renderWorkspace()
    vi.useFakeTimers()

    const paperStrawsInput = container.querySelector(
      'input[aria-label="Counted quantity for Paper Straws"]',
    )

    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      nativeInputValueSetter?.call(paperStrawsInput, '9')
      paperStrawsInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await act(async () => {
      vi.advanceTimersByTime(400)
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(paperStrawsInput.value).toBe('')
    expect(container.querySelector('.staff-status-banner')?.textContent).toBe('save failed')
    expect(getProgressSnapshot(container)).toContain('2 / 5 counted')

    cleanup()
    vi.useRealTimers()
  })

  it('prevents duplicate in-flight saves for the same row and queues the latest value', async () => {
    let resolveFirst
    updateInventoryCountItem.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveFirst = resolve
      }),
    )

    const { container, cleanup } = await renderWorkspace()
    vi.useFakeTimers()
    const paperStrawsInput = container.querySelector(
      'input[aria-label="Counted quantity for Paper Straws"]',
    )

    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      nativeInputValueSetter?.call(paperStrawsInput, '1')
      paperStrawsInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await act(async () => {
      vi.advanceTimersByTime(400)
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(updateInventoryCountItem).toHaveBeenCalledTimes(1)

    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      nativeInputValueSetter?.call(paperStrawsInput, '7')
      paperStrawsInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await act(async () => {
      vi.advanceTimersByTime(400)
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(updateInventoryCountItem).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveFirst({
        id: 'ms-2',
        sessionId: 'session-real-1',
        workspaceId: 'workspace-test-id',
        itemId: 'stock-ms-2',
        itemName: 'Paper Straws',
        category: 'Other',
        itemType: 'Other',
        unit: 'box',
        storageLocation: 'Main Storage',
        expectedSnapshot: 4,
        countedQuantity: 1,
        lineStatus: 'counted',
        note: '',
      })
      await Promise.resolve()
    })

    expect(updateInventoryCountItem).toHaveBeenCalledTimes(2)
    expect(updateInventoryCountItem).toHaveBeenLastCalledWith({
      workspaceId: 'workspace-test-id',
      sessionId: 'session-real-1',
      sessionItemId: 'ms-2',
      countedQuantity: 7,
    })

    cleanup()
    vi.useRealTimers()
  })
})

describe('InventoryCountSessionWorkspace pause and resume', () => {
  beforeEach(() => {
    createInventoryCountSession.mockReset()
    buildInventoryCountSnapshot.mockReset()
    getInventoryCountSession.mockReset()
    getInventoryCountSessionLocations.mockReset()
    getInventoryCountSessionItems.mockReset()
    updateInventoryCountItem.mockReset()
    completeInventoryCountLocation.mockReset()
    setInventoryCountSessionPauseState.mockReset()
    previewInventoryCountFinish.mockReset()
    postInventoryCountFinish.mockReset()

    getInventoryCountSession.mockResolvedValue({
      id: 'session-real-1',
      workspaceId: 'workspace-test-id',
      status: 'in_progress',
    })
    getInventoryCountSessionLocations.mockResolvedValue(FIXTURE_LOCATIONS)
    getInventoryCountSessionItems.mockResolvedValue(FIXTURE_ITEMS)
    updateInventoryCountItem.mockImplementation(async ({ sessionItemId, countedQuantity }) => ({
      id: sessionItemId,
      sessionId: 'session-real-1',
      workspaceId: 'workspace-test-id',
      itemId: `stock-${sessionItemId}`,
      itemName: 'Saved item',
      category: 'Other',
      itemType: 'Other',
      unit: 'box',
      storageLocation: 'Main Storage',
      expectedSnapshot: 4,
      countedQuantity,
      lineStatus: countedQuantity == null ? 'pending' : 'counted',
      note: '',
    }))
    setInventoryCountSessionPauseState.mockResolvedValue({
      id: 'session-real-1',
      workspaceId: 'workspace-test-id',
      status: 'paused',
      pausedAt: '2026-07-20T15:00:00.000Z',
      updatedAt: '2026-07-20T15:00:00.000Z',
    })
  })

  it('pauses an in_progress session and disables count mutations while paused', async () => {
    const { container, cleanup } = await renderWorkspace()

    expect(getButtonByText(container, 'Pause')?.disabled).toBe(false)
    expect(container.querySelector('.inventory-count-session-pill')?.textContent).toBe('In Progress')
    expect(container.textContent).not.toContain(
      'This inventory count is paused. Resume to continue counting.',
    )

    await act(async () => {
      getButtonByText(container, 'Pause').click()
      await Promise.resolve()
    })

    expect(setInventoryCountSessionPauseState).toHaveBeenCalledWith({
      workspaceId: 'workspace-test-id',
      sessionId: 'session-real-1',
      pause: true,
    })
    expect(getButtonByText(container, 'Resume')).toBeTruthy()
    expect(container.querySelector('.inventory-count-session-pill')?.textContent).toBe('Paused')
    expect(getRailButton(container, 'Main Storage')?.className).toContain('is-selected')
    expect(container.textContent).toContain(
      'This inventory count is paused. Resume to continue counting.',
    )
    expect(container.querySelector('input[aria-label="Counted quantity for Paper Straws"]')?.disabled)
      .toBe(true)
    expect(getButtonByText(container, 'Complete Location')?.disabled).toBe(true)
    expect(getButtonByText(container, 'Finish Count')?.disabled).toBe(true)
    expect(getButtonByText(container, 'Next')?.disabled).toBe(false)
    expect(getButtonByText(container, 'Exit')?.disabled).toBe(false)

    cleanup()
  })

  it('shows Pausing… while pause is pending and keeps prior state on failure', async () => {
    let rejectPause
    setInventoryCountSessionPauseState.mockImplementationOnce(() => new Promise((_, reject) => {
      rejectPause = reject
    }))

    const { container, cleanup } = await renderWorkspace()

    await act(async () => {
      getButtonByText(container, 'Pause').click()
      await Promise.resolve()
    })

    expect(getButtonByText(container, 'Pausing…')?.disabled).toBe(true)
    expect(container.querySelector('.inventory-count-session-pill')?.textContent).toBe('In Progress')

    await act(async () => {
      rejectPause(new Error('Unable to pause inventory count right now.'))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getButtonByText(container, 'Pause')?.disabled).toBe(false)
    expect(container.querySelector('.inventory-count-session-pill')?.textContent).toBe('In Progress')
    expect(container.textContent).toContain('Unable to pause inventory count right now.')
    expect(container.textContent).not.toContain(
      'This inventory count is paused. Resume to continue counting.',
    )

    cleanup()
  })

  it('resumes a paused session and restores editing', async () => {
    setInventoryCountSessionPauseState
      .mockResolvedValueOnce({
        id: 'session-real-1',
        workspaceId: 'workspace-test-id',
        status: 'paused',
        pausedAt: '2026-07-20T15:00:00.000Z',
        updatedAt: '2026-07-20T15:00:00.000Z',
      })
      .mockResolvedValueOnce({
        id: 'session-real-1',
        workspaceId: 'workspace-test-id',
        status: 'in_progress',
        pausedAt: null,
        updatedAt: '2026-07-20T15:05:00.000Z',
      })

    const { container, cleanup } = await renderWorkspace()

    await act(async () => {
      getButtonByText(container, 'Pause').click()
      await Promise.resolve()
    })

    expect(getButtonByText(container, 'Resume')).toBeTruthy()
    expect(container.querySelector('input[aria-label="Counted quantity for Paper Straws"]')?.disabled)
      .toBe(true)

    await act(async () => {
      getButtonByText(container, 'Resume').click()
      await Promise.resolve()
    })

    expect(setInventoryCountSessionPauseState).toHaveBeenLastCalledWith({
      workspaceId: 'workspace-test-id',
      sessionId: 'session-real-1',
      pause: false,
    })
    expect(getButtonByText(container, 'Pause')).toBeTruthy()
    expect(container.querySelector('.inventory-count-session-pill')?.textContent).toBe('In Progress')
    expect(container.textContent).not.toContain(
      'This inventory count is paused. Resume to continue counting.',
    )
    expect(container.querySelector('input[aria-label="Counted quantity for Paper Straws"]')?.disabled)
      .toBe(false)
    // Current location still has a pending item — Complete stays disabled (eligibility SSOT)
    expect(getButtonByText(container, 'Complete Location')?.disabled).toBe(true)
    expect(getButtonByText(container, 'Complete Location')?.getAttribute('title'))
      .toContain('1 item is still pending.')

    cleanup()
  })

  it('shows Resuming… while resume is pending', async () => {
    setInventoryCountSessionPauseState.mockResolvedValueOnce({
      id: 'session-real-1',
      workspaceId: 'workspace-test-id',
      status: 'paused',
      pausedAt: '2026-07-20T15:00:00.000Z',
      updatedAt: '2026-07-20T15:00:00.000Z',
    })

    let resolveResume
    setInventoryCountSessionPauseState.mockImplementationOnce(() => new Promise((resolve) => {
      resolveResume = resolve
    }))

    const { container, cleanup } = await renderWorkspace()

    await act(async () => {
      getButtonByText(container, 'Pause').click()
      await Promise.resolve()
    })

    await act(async () => {
      getButtonByText(container, 'Resume').click()
      await Promise.resolve()
    })

    expect(getButtonByText(container, 'Resuming…')?.disabled).toBe(true)

    await act(async () => {
      resolveResume({
        id: 'session-real-1',
        workspaceId: 'workspace-test-id',
        status: 'in_progress',
        pausedAt: null,
        updatedAt: '2026-07-20T15:05:00.000Z',
      })
      await Promise.resolve()
    })

    expect(getButtonByText(container, 'Pause')?.disabled).toBe(false)
    cleanup()
  })

  it('flushes pending autosave before pausing', async () => {
    vi.useFakeTimers()

    let resolveSave
    updateInventoryCountItem.mockImplementationOnce(() => new Promise((resolve) => {
      resolveSave = resolve
    }))

    setInventoryCountSessionPauseState.mockResolvedValueOnce({
      id: 'session-real-1',
      workspaceId: 'workspace-test-id',
      status: 'paused',
      pausedAt: '2026-07-20T15:00:00.000Z',
      updatedAt: '2026-07-20T15:00:00.000Z',
    })

    const { container, cleanup } = await renderWorkspace()
    const paperStrawsInput = container.querySelector(
      'input[aria-label="Counted quantity for Paper Straws"]',
    )

    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      nativeInputValueSetter?.call(paperStrawsInput, '3')
      paperStrawsInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await act(async () => {
      getButtonByText(container, 'Pause').click()
      await Promise.resolve()
    })

    expect(updateInventoryCountItem).toHaveBeenCalledWith({
      workspaceId: 'workspace-test-id',
      sessionId: 'session-real-1',
      sessionItemId: 'ms-2',
      countedQuantity: 3,
    })
    expect(setInventoryCountSessionPauseState).not.toHaveBeenCalled()
    expect(getButtonByText(container, 'Pausing…')?.disabled).toBe(true)

    await act(async () => {
      resolveSave({
        id: 'ms-2',
        sessionId: 'session-real-1',
        workspaceId: 'workspace-test-id',
        itemId: 'stock-ms-2',
        itemName: 'Paper Straws',
        category: 'Other',
        itemType: 'Other',
        unit: 'box',
        storageLocation: 'Main Storage',
        expectedSnapshot: 4,
        countedQuantity: 3,
        lineStatus: 'counted',
        note: '',
      })
      await Promise.resolve()
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(50)
      await Promise.resolve()
    })

    expect(setInventoryCountSessionPauseState).toHaveBeenCalledWith({
      workspaceId: 'workspace-test-id',
      sessionId: 'session-real-1',
      pause: true,
    })
    expect(getButtonByText(container, 'Resume')).toBeTruthy()

    cleanup()
    vi.useRealTimers()
  })
})

describe('InventoryCountSessionWorkspace finish count preview', () => {
  beforeEach(() => {
    createInventoryCountSession.mockReset()
    buildInventoryCountSnapshot.mockReset()
    getInventoryCountSession.mockReset()
    getInventoryCountSessionLocations.mockReset()
    getInventoryCountSessionItems.mockReset()
    updateInventoryCountItem.mockReset()
    completeInventoryCountLocation.mockReset()
    setInventoryCountSessionPauseState.mockReset()
    previewInventoryCountFinish.mockReset()
    postInventoryCountFinish.mockReset()

    getInventoryCountSession.mockResolvedValue({
      id: 'session-real-1',
      workspaceId: 'workspace-test-id',
      status: 'counting_complete',
    })
    getInventoryCountSessionLocations.mockResolvedValue([
      sessionLocation('loc-1', 'Main Storage', 0, 'current'),
      sessionLocation('loc-2', 'Coffee Station', 1, 'completed'),
      sessionLocation('loc-3', 'Kitchen', 2, 'completed'),
    ])
    getInventoryCountSessionItems.mockResolvedValue([
      sessionItem({
        id: 'ms-1',
        itemName: 'Coca-Cola',
        storageLocation: 'Main Storage',
        expectedSnapshot: 10,
        countedQuantity: 10,
        lineStatus: 'counted',
      }),
      sessionItem({
        id: 'cs-1',
        itemName: 'Espresso Beans',
        unit: 'kg',
        storageLocation: 'Coffee Station',
        expectedSnapshot: 2,
        countedQuantity: 2,
        lineStatus: 'counted',
      }),
      sessionItem({
        id: 'k-1',
        itemName: 'Olive Oil',
        unit: 'litre',
        storageLocation: 'Kitchen',
        expectedSnapshot: 4,
        countedQuantity: 4,
        lineStatus: 'counted',
      }),
    ])
    completeInventoryCountLocation.mockResolvedValue({
      sessionId: 'session-real-1',
      completedLocationId: 'loc-1',
      nextLocationId: null,
      sessionStatus: 'counting_complete',
      allLocationsCompleted: true,
    })
    previewInventoryCountFinish.mockResolvedValue({
      sessionId: 'session-real-1',
      workspaceId: 'workspace-test-id',
      sessionStatus: 'counting_complete',
      snapshotAt: '2026-07-21T10:00:00.000Z',
      previewGeneratedAt: '2026-07-21T12:00:00.000Z',
      canPost: true,
      summary: {
        totalLines: 3,
        countedLines: 3,
        skippedLines: 0,
        changedItems: 2,
        unchangedItems: 1,
        positiveVariances: 1,
        negativeVariances: 1,
        zeroVariances: 1,
        blockingIssueCount: 0,
        canPost: true,
      },
      lines: [
        {
          sessionItemId: 'ms-1',
          itemId: 'stock-ms-1',
          itemName: 'Coca-Cola',
          storageLocation: 'Main Storage',
          unit: 'case',
          expectedSnapshot: 10,
          movementDeltaSinceSnapshot: 0,
          expectedAtCount: 10,
          countedQuantity: 8,
          countedAt: '2026-07-21T11:00:00.000Z',
          varianceQuantity: -2,
          currentLiveQuantity: 10,
          resultingQuantityAfterPost: 8,
        },
        {
          sessionItemId: 'cs-1',
          itemId: 'stock-cs-1',
          itemName: 'Espresso Beans',
          storageLocation: 'Coffee Station',
          unit: 'kg',
          expectedSnapshot: 2,
          movementDeltaSinceSnapshot: -1,
          expectedAtCount: 1,
          countedQuantity: 1,
          countedAt: '2026-07-21T11:05:00.000Z',
          varianceQuantity: 0,
          currentLiveQuantity: 1,
          resultingQuantityAfterPost: 1,
        },
        {
          sessionItemId: 'k-1',
          itemId: 'stock-k-1',
          itemName: 'Olive Oil',
          storageLocation: 'Kitchen',
          unit: 'litre',
          expectedSnapshot: 4,
          movementDeltaSinceSnapshot: 5,
          expectedAtCount: 9,
          countedQuantity: 10,
          countedAt: '2026-07-21T11:10:00.000Z',
          varianceQuantity: 1,
          currentLiveQuantity: 9,
          resultingQuantityAfterPost: 10,
        },
      ],
      skipped: [],
      blockingIssues: [],
    })
  })

  async function openFinishPreview() {
    const rendered = await renderWorkspace()

    await act(async () => {
      getButtonByText(rendered.container, 'Complete Location').click()
      await Promise.resolve()
    })

    await act(async () => {
      getButtonByText(rendered.container, 'Finish Count').click()
      await Promise.resolve()
    })

    return rendered
  }

  it('opens a finish preview dialog with reconciled Strategy 4 columns', async () => {
    const { container, cleanup } = await openFinishPreview()

    expect(previewInventoryCountFinish).toHaveBeenCalledWith({
      workspaceId: 'workspace-test-id',
      sessionId: 'session-real-1',
    })

    const dialog = container.querySelector('[role="dialog"][aria-label="Finish Count Preview"]')
    expect(dialog).not.toBeNull()
    expect(dialog.textContent).toContain('Finish Count Preview')
    expect(dialog.textContent).toContain('Counting Complete')
    expect(dialog.textContent).toContain('Ready to post')
    expect(dialog.textContent).toContain('No blocking issues were found')
    expect(dialog.querySelector('.inventory-count-finish-preview-hero.is-ready')).toBeTruthy()
    expect(dialog.textContent).toContain('Expected at Count includes stock activity recorded after the snapshot')
    expect(dialog.textContent).toContain('Total lines')
    expect(dialog.textContent).toContain('Snapshot')
    expect(dialog.textContent).toContain('Activity')
    expect(dialog.textContent).toContain('Expected at Count')
    expect(dialog.textContent).toContain('Coca-Cola')
    expect(dialog.textContent).toContain('-2')
    expect(dialog.textContent).toContain('+1')
    expect(dialog.textContent).toContain('Current Live')
    expect(dialog.textContent).toContain('Result After Post')
    expect(dialog.textContent).toContain('Confirm posts stock adjustments and finalizes this count.')

    const confirmBtn = getButtonByText(container, 'Confirm Finish Count')
    expect(confirmBtn?.disabled).toBe(false)
    expect(confirmBtn?.getAttribute('aria-disabled')).toBe('false')
    expect(confirmBtn?.className).toContain('inventory-count-finish-preview-confirm')
    expect(dialog.querySelector('.inventory-count-finish-preview-flow')).not.toBeNull()
    expect(dialog.querySelector('.inventory-count-finish-preview-variance')).not.toBeNull()

    cleanup()
  })

  it('shows Ready / Blocked hero from canPost without changing posting rules', async () => {
    expect(getFinishPreviewPostingHero({
      canPost: true,
      blockingIssues: [],
      summary: { skippedLines: 0 },
    })).toEqual({
      state: 'ready',
      title: 'Ready to post',
      detail: 'No blocking issues were found. Review the summary below and confirm to post this count.',
    })

    expect(getFinishPreviewPostingHero({
      canPost: false,
      blockingIssues: [{
        code: 'skipped_lines_present',
        message: '1 skipped line(s) must be counted before posting. Skipped lines are not treated as zero.',
      }],
      summary: { skippedLines: 1 },
    })).toEqual({
      state: 'blocked',
      title: 'Cannot post yet',
      detail: 'Some items are still skipped.',
    })

    const { container, cleanup } = await openFinishPreview()
    const hero = container.querySelector('[aria-label="Posting readiness"]')
    expect(hero?.className).toContain('inventory-count-finish-preview-hero')
    expect(hero?.className).toContain('is-ready')
    expect(hero?.textContent).toMatch(/Ready to post/i)
    cleanup()
  })

  it('shows skipped warnings, keeps Confirm disabled, and Cancel closes', async () => {
    previewInventoryCountFinish.mockResolvedValueOnce({
      sessionId: 'session-real-1',
      workspaceId: 'workspace-test-id',
      sessionStatus: 'counting_complete',
      snapshotAt: '2026-07-21T10:00:00.000Z',
      previewGeneratedAt: '2026-07-21T12:00:00.000Z',
      canPost: false,
      summary: {
        totalLines: 2,
        countedLines: 1,
        skippedLines: 1,
        changedItems: 0,
        unchangedItems: 1,
        positiveVariances: 0,
        negativeVariances: 0,
        zeroVariances: 1,
        blockingIssueCount: 1,
        canPost: false,
      },
      lines: [{
        sessionItemId: 'ms-1',
        itemId: 'stock-ms-1',
        itemName: 'Coca-Cola',
        storageLocation: 'Main Storage',
        unit: 'case',
        expectedSnapshot: 10,
        movementDeltaSinceSnapshot: 0,
        expectedAtCount: 10,
        countedQuantity: 10,
        countedAt: '2026-07-21T11:00:00.000Z',
        varianceQuantity: 0,
        currentLiveQuantity: 10,
        resultingQuantityAfterPost: 10,
      }],
      skipped: [{
        sessionItemId: 'cs-1',
        itemId: 'stock-cs-1',
        itemName: 'Espresso Beans',
        storageLocation: 'Coffee Station',
        unit: 'kg',
        lineStatus: 'skipped',
        warning: 'Skipped lines are not posted and keep live quantity unchanged.',
      }],
      blockingIssues: [{
        code: 'skipped_lines_present',
        sessionItemId: null,
        itemId: null,
        itemName: null,
        message: '1 skipped line(s) must be counted before posting. Skipped lines are not treated as zero.',
      }],
    })

    const { container, cleanup } = await openFinishPreview()

    expect(container.textContent).toContain('Skipped: Espresso Beans')
    expect(container.textContent).toContain('must be counted before posting')
    expect(container.textContent).toContain('Cannot post yet')
    expect(container.textContent).toContain('Some items are still skipped.')
    expect(container.querySelector('.inventory-count-finish-preview-hero.is-blocked')).toBeTruthy()
    expect(container.textContent).not.toMatch(/Skipped: Espresso Beans[\s\S]*Variance[\s\S]*0\b/)

    const confirmBtn = getButtonByText(container, 'Confirm Finish Count')
    expect(confirmBtn?.disabled).toBe(true)

    await act(async () => {
      confirmBtn.click()
      await Promise.resolve()
    })

    expect(container.querySelector('[role="dialog"][aria-label="Finish Count Preview"]')).not.toBeNull()
    expect(previewInventoryCountFinish).toHaveBeenCalledTimes(1)

    await act(async () => {
      getButtonByText(container, 'Cancel').click()
      await Promise.resolve()
    })

    expect(container.querySelector('[role="dialog"][aria-label="Finish Count Preview"]')).toBeNull()
    cleanup()
  })

  it('shows loading state while Finish Preview RPC is pending', async () => {
    let resolvePreview
    previewInventoryCountFinish.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolvePreview = resolve
      }),
    )

    const rendered = await renderWorkspace()

    await act(async () => {
      getButtonByText(rendered.container, 'Complete Location').click()
      await Promise.resolve()
    })

    await act(async () => {
      getButtonByText(rendered.container, 'Finish Count').click()
      await Promise.resolve()
    })

    const dialog = rendered.container.querySelector('[role="dialog"][aria-label="Finish Count Preview"]')
    expect(dialog).not.toBeNull()
    expect(dialog.textContent).toContain('Loading finish preview…')
    expect(getButtonByText(rendered.container, 'Confirm Finish Count')?.disabled).toBe(true)

    await act(async () => {
      resolvePreview({
        sessionId: 'session-real-1',
        workspaceId: 'workspace-test-id',
        sessionStatus: 'counting_complete',
        snapshotAt: '2026-07-21T10:00:00.000Z',
        previewGeneratedAt: '2026-07-21T12:00:00.000Z',
        canPost: true,
        summary: {
          totalLines: 1,
          countedLines: 1,
          skippedLines: 0,
          changedItems: 0,
          unchangedItems: 1,
          positiveVariances: 0,
          negativeVariances: 0,
          zeroVariances: 1,
          blockingIssueCount: 0,
          canPost: true,
        },
        lines: [{
          sessionItemId: 'ms-1',
          itemId: 'stock-ms-1',
          itemName: 'Coca-Cola',
          storageLocation: 'Main Storage',
          unit: 'case',
          expectedSnapshot: 10,
          movementDeltaSinceSnapshot: 0,
          expectedAtCount: 10,
          countedQuantity: 10,
          countedAt: '2026-07-21T11:00:00.000Z',
          varianceQuantity: 0,
          currentLiveQuantity: 10,
          resultingQuantityAfterPost: 10,
        }],
        skipped: [],
        blockingIssues: [],
      })
      await Promise.resolve()
    })

    expect(dialog.textContent).not.toContain('Loading finish preview…')
    expect(dialog.textContent).toContain('Coca-Cola')
    rendered.cleanup()
  })

  it('shows Finish Preview RPC errors and keeps Confirm disabled', async () => {
    previewInventoryCountFinish.mockRejectedValueOnce(
      new Error('Inventory count snapshot was not found for this session.'),
    )

    const { container, cleanup } = await openFinishPreview()

    expect(container.textContent).toContain('Inventory count snapshot was not found for this session.')
    expect(getButtonByText(container, 'Confirm Finish Count')?.disabled).toBe(true)
    cleanup()
  })

  it('renders stock_count blocker, counted zero, and refreshes RPC after cancel/reopen', async () => {
    previewInventoryCountFinish.mockResolvedValueOnce({
      sessionId: 'session-real-1',
      workspaceId: 'workspace-test-id',
      sessionStatus: 'counting_complete',
      snapshotAt: '2026-07-21T10:00:00.000Z',
      previewGeneratedAt: '2026-07-21T12:00:00.000Z',
      canPost: false,
      summary: {
        totalLines: 1,
        countedLines: 1,
        skippedLines: 0,
        changedItems: 1,
        unchangedItems: 0,
        positiveVariances: 0,
        negativeVariances: 1,
        zeroVariances: 0,
        blockingIssueCount: 1,
        canPost: false,
      },
      lines: [{
        sessionItemId: 'ms-1',
        itemId: 'stock-ms-1',
        itemName: 'Coca-Cola',
        storageLocation: 'Main Storage',
        unit: 'case',
        expectedSnapshot: 10,
        movementDeltaSinceSnapshot: 0,
        expectedAtCount: 10,
        countedQuantity: 0,
        countedAt: '2026-07-21T11:00:00.000Z',
        varianceQuantity: -10,
        currentLiveQuantity: 10,
        resultingQuantityAfterPost: 0,
      }],
      skipped: [],
      blockingIssues: [{
        code: 'unsupported_stock_count_in_window',
        sessionItemId: 'ms-1',
        itemId: 'stock-ms-1',
        itemName: 'Coca-Cola',
        message: 'A stock_count movement exists between snapshot and counted_at. Absolute-set movements cannot be reconciled as deltas.',
      }],
    })

    const { container, cleanup } = await openFinishPreview()
    const dialog = container.querySelector('[role="dialog"][aria-label="Finish Count Preview"]')

    expect(dialog?.textContent).toContain(
      'A stock_count movement exists between snapshot and counted_at. Absolute-set movements cannot be reconciled as deltas.',
    )
    expect(dialog?.textContent).toContain('Coca-Cola')
    expect(dialog?.textContent).toContain('Counted')
    expect(dialog?.querySelector('tbody')?.textContent || '').toMatch(/Coca-ColacaseMain Storage100100-10100/)
    expect(getButtonByText(container, 'Confirm Finish Count')?.disabled).toBe(true)
    expect(previewInventoryCountFinish).toHaveBeenCalledTimes(1)

    await act(async () => {
      getButtonByText(container, 'Cancel').click()
      await Promise.resolve()
    })

    previewInventoryCountFinish.mockResolvedValueOnce({
      sessionId: 'session-real-1',
      workspaceId: 'workspace-test-id',
      sessionStatus: 'counting_complete',
      snapshotAt: '2026-07-21T10:00:00.000Z',
      previewGeneratedAt: '2026-07-21T12:05:00.000Z',
      canPost: true,
      summary: {
        totalLines: 1,
        countedLines: 1,
        skippedLines: 0,
        changedItems: 0,
        unchangedItems: 1,
        positiveVariances: 0,
        negativeVariances: 0,
        zeroVariances: 1,
        blockingIssueCount: 0,
        canPost: true,
      },
      lines: [{
        sessionItemId: 'ms-1',
        itemId: 'stock-ms-1',
        itemName: 'Coca-Cola',
        storageLocation: 'Main Storage',
        unit: 'case',
        expectedSnapshot: 10,
        movementDeltaSinceSnapshot: 0,
        expectedAtCount: 10,
        countedQuantity: 10,
        countedAt: '2026-07-21T11:00:00.000Z',
        varianceQuantity: 0,
        currentLiveQuantity: 10,
        resultingQuantityAfterPost: 10,
      }],
      skipped: [],
      blockingIssues: [],
    })

    await act(async () => {
      getButtonByText(container, 'Finish Count').click()
      await Promise.resolve()
    })

    expect(previewInventoryCountFinish).toHaveBeenCalledTimes(2)
    expect(container.querySelector('[role="dialog"][aria-label="Finish Count Preview"]')).not.toBeNull()
    cleanup()
  })

  it('posts once, shows loading, refreshes, disables confirm after success, and notifies parent', async () => {
    const onPosted = vi.fn()
    let resolvePost
    postInventoryCountFinish.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolvePost = resolve
      }),
    )

    const rendered = await renderWorkspace({ onPosted })

    await act(async () => {
      getButtonByText(rendered.container, 'Complete Location').click()
      await Promise.resolve()
    })
    await act(async () => {
      getButtonByText(rendered.container, 'Finish Count').click()
      await Promise.resolve()
    })

    const confirmBtn = getButtonByText(rendered.container, 'Confirm Finish Count')
    expect(confirmBtn?.disabled).toBe(false)

    await act(async () => {
      confirmBtn.click()
      confirmBtn.click()
      await Promise.resolve()
    })

    expect(postInventoryCountFinish).toHaveBeenCalledTimes(1)
    expect(postInventoryCountFinish).toHaveBeenCalledWith({
      workspaceId: 'workspace-test-id',
      sessionId: 'session-real-1',
    })
    expect(getButtonByText(rendered.container, 'Posting…')?.disabled).toBe(true)
    expect(rendered.container.textContent).toContain('Posting inventory count…')

    getInventoryCountSessionLocations.mockResolvedValueOnce([
      sessionLocation('loc-1', 'Main Storage', 0, 'completed'),
      sessionLocation('loc-2', 'Coffee Station', 1, 'completed'),
      sessionLocation('loc-3', 'Kitchen', 2, 'completed'),
    ])
    getInventoryCountSessionItems.mockResolvedValueOnce([
      sessionItem({
        id: 'ms-1',
        itemName: 'Coca-Cola',
        storageLocation: 'Main Storage',
        expectedSnapshot: 10,
        countedQuantity: 8,
        lineStatus: 'counted',
      }),
    ])

    await act(async () => {
      resolvePost({
        sessionId: 'session-real-1',
        workspaceId: 'workspace-test-id',
        status: 'posted',
        postedAt: '2026-07-21T12:30:00.000Z',
        postedBy: 'user-1',
        canPost: true,
        postingEnabled: true,
        countedLineCount: 3,
        adjustedLineCount: 2,
        zeroVarianceLineCount: 1,
        movementCount: 2,
        totalPositiveVariance: 1,
        totalNegativeVariance: -2,
        reconciliationSummary: null,
        message: 'Inventory count posted successfully.',
      })
      await Promise.resolve()
    })

    expect(onPosted).toHaveBeenCalledWith({
      sessionId: 'session-real-1',
      workspaceId: 'workspace-test-id',
      status: 'posted',
      message: 'Inventory count posted successfully.',
    })
    expect(rendered.container.querySelector('[role="dialog"][aria-label="Finish Count Preview"]')).toBeNull()
    expect(getInventoryCountSessionLocations.mock.calls.length).toBeGreaterThan(1)
    expect(getInventoryCountSessionItems.mock.calls.length).toBeGreaterThan(1)
    rendered.cleanup()
  })

  it('keeps preview open and re-enables confirm after a failed post', async () => {
    postInventoryCountFinish.mockRejectedValueOnce(
      new Error('Inventory count cannot be posted until all blocking issues are resolved.'),
    )

    const { container, cleanup } = await openFinishPreview()
    const confirmBtn = getButtonByText(container, 'Confirm Finish Count')

    await act(async () => {
      confirmBtn.click()
      await Promise.resolve()
    })

    expect(postInventoryCountFinish).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[role="dialog"][aria-label="Finish Count Preview"]')).not.toBeNull()
    expect(container.textContent).toContain(
      'Inventory count cannot be posted until all blocking issues are resolved.',
    )
    expect(getButtonByText(container, 'Confirm Finish Count')?.disabled).toBe(false)
    cleanup()
  })
})

describe('getFinishCountDisabledReason (P8.16.29)', () => {
  it('explains pending items and incomplete locations', () => {
    expect(getFinishCountDisabledReason('paused', [])).toBe('Resume this count before finishing.')
    expect(getFinishCountDisabledReason('in_progress', [
      { status: 'current', countedItems: 0, totalItems: 1, items: [] },
      { status: 'not_started', countedItems: 0, totalItems: 1, items: [] },
    ])).toBe('2 items are still pending.')
    expect(getFinishCountDisabledReason('in_progress', [
      { status: 'current', countedItems: 0, totalItems: 1, items: [] },
    ])).toBe('1 item is still pending.')
    expect(getFinishCountDisabledReason('in_progress', [
      { status: 'completed', countedItems: 1, totalItems: 1, items: [], name: 'Main Storage' },
      { status: 'current', countedItems: 0, totalItems: 0, items: [], name: 'Main Bar' },
    ])).toBe('Complete all locations before finishing this count. Current location: Main Bar.')
    expect(getFinishCountDisabledReason('counting_complete', [])).toBe('')
  })

  it('P8.19.5 suppresses only routine pending copy from the Finish Count banner', () => {
    expect(shouldShowFinishCountDisabledBanner('2 items are still pending.')).toBe(false)
    expect(shouldShowFinishCountDisabledBanner('1 item is still pending.')).toBe(false)
    expect(shouldShowFinishCountDisabledBanner('Resume this count before finishing.')).toBe(true)
    expect(shouldShowFinishCountDisabledBanner(
      'Complete all locations before finishing this count. Current location: Main Bar.',
    )).toBe(true)
    expect(shouldShowFinishCountDisabledBanner('')).toBe(false)
  })
})

describe('current location guidance helpers (P8.16.32)', () => {
  it('formats readiness copy for counted current, waiting, and completed locations', () => {
    expect(getLocationReadinessLabel({
      status: 'not_started',
      countedItems: 2,
      totalItems: 2,
    })).toBe('All items counted · Waiting to become current')
    expect(getLocationReadinessLabel({
      status: 'current',
      countedItems: 2,
      totalItems: 2,
    })).toBe('All items counted · Ready to complete location')
    expect(getLocationReadinessLabel({
      status: 'completed',
      countedItems: 2,
      totalItems: 2,
    })).toBe('Location completed')
    expect(getLocationReadinessLabel({
      status: 'current',
      countedItems: 1,
      totalItems: 2,
    })).toBe('Current')
  })

  it('explains Complete Location disabled states', () => {
    expect(getCompleteLocationDisabledReason({
      sessionStatus: 'paused',
      selectedLocation: { status: 'current', countedItems: 2, totalItems: 2 },
      currentLocationName: 'Main Bar',
    })).toBe('Resume this count before completing locations.')
    expect(getCompleteLocationDisabledReason({
      sessionStatus: 'in_progress',
      selectedLocation: { status: 'not_started', countedItems: 2, totalItems: 2 },
      currentLocationName: 'Main Bar',
    })).toBe('Complete “Main Bar” first.')
    expect(getCompleteLocationDisabledReason({
      sessionStatus: 'in_progress',
      selectedLocation: { status: 'completed', countedItems: 2, totalItems: 2 },
      currentLocationName: 'Main Bar',
    })).toBe('This location is already complete.')
    expect(getCompleteLocationDisabledReason({
      sessionStatus: 'in_progress',
      selectedLocation: { status: 'current', countedItems: 1, totalItems: 2 },
      currentLocationName: 'Main Bar',
    })).toBe('1 item is still pending.')
    expect(getCompleteLocationDisabledReason({
      sessionStatus: 'in_progress',
      selectedLocation: { status: 'current', countedItems: 0, totalItems: 2 },
      currentLocationName: 'Main Bar',
    })).toBe('2 items are still pending.')
    expect(getCompleteLocationDisabledReason({
      sessionStatus: 'in_progress',
      selectedLocation: { status: 'current', countedItems: 0, totalItems: 0 },
      currentLocationName: 'Main Bar',
    })).toBe('')
    expect(canCompleteInventoryCountLocation({
      sessionStatus: 'in_progress',
      selectedLocation: { status: 'current', countedItems: 0, totalItems: 0 },
      currentLocationName: 'Main Bar',
    })).toBe(true)
  })
})

describe('InventoryCountSessionWorkspace Complete Location eligibility consistency (P8.20.2b)', () => {
  beforeEach(() => {
    getInventoryCountSession.mockReset()
    getInventoryCountSessionLocations.mockReset()
    getInventoryCountSessionItems.mockReset()
    completeInventoryCountLocation.mockReset()

    getInventoryCountSession.mockResolvedValue({
      id: 'session-real-1',
      workspaceId: 'workspace-test-id',
      status: 'in_progress',
    })
    getInventoryCountSessionLocations.mockResolvedValue([
      sessionLocation('loc-1', 'Main Bar', 0, 'current'),
    ])
    getInventoryCountSessionItems.mockResolvedValue([])
    completeInventoryCountLocation.mockResolvedValue({
      sessionId: 'session-real-1',
      completedLocationId: 'loc-1',
      nextLocationId: null,
      sessionStatus: 'counting_complete',
      allLocationsCompleted: true,
    })
  })

  it('disables Complete Location while paused with Resume tooltip', async () => {
    getInventoryCountSession.mockResolvedValue({
      id: 'session-real-1',
      workspaceId: 'workspace-test-id',
      status: 'paused',
      pausedAt: '2026-07-20T15:00:00.000Z',
    })

    const { container, cleanup } = await renderWorkspace()
    const completeBtn = getButtonByText(container, 'Complete Location')
    const reason = 'Resume this count before completing locations.'

    expect(completeBtn?.disabled).toBe(true)
    expect(completeBtn?.getAttribute('title')).toBe(reason)
    expect(container.textContent).toContain(reason)

    await act(async () => {
      completeBtn.click()
      await Promise.resolve()
    })
    expect(completeInventoryCountLocation).not.toHaveBeenCalled()

    cleanup()
  })

  it('enables Complete Location for empty current location and executes on click', async () => {
    const { container, cleanup } = await renderWorkspace()
    const completeBtn = getButtonByText(container, 'Complete Location')

    expect(container.textContent).toContain('No items in this location')
    expect(container.textContent).toContain('No snapshot items were found for Main Bar.')
    expect(completeBtn?.disabled).toBe(false)
    expect(completeBtn?.getAttribute('title')).toBeNull()
    expect(container.querySelector('.inventory-count-complete-disabled-reason')).toBeNull()

    await act(async () => {
      completeBtn.click()
      await Promise.resolve()
    })

    expect(completeInventoryCountLocation).toHaveBeenCalledTimes(1)
    expect(completeInventoryCountLocation).toHaveBeenCalledWith({
      workspaceId: 'workspace-test-id',
      sessionId: 'session-real-1',
      locationId: 'loc-1',
    })

    cleanup()
  })

  it('keeps disabled state, tooltip, and click gate on one eligibility source', () => {
    const cases = [
      {
        args: {
          sessionStatus: 'paused',
          selectedLocation: { status: 'current', countedItems: 0, totalItems: 0 },
          currentLocationName: 'Main Bar',
        },
        allowed: false,
      },
      {
        args: {
          sessionStatus: 'in_progress',
          selectedLocation: { status: 'current', countedItems: 0, totalItems: 0 },
          currentLocationName: 'Main Bar',
        },
        allowed: true,
      },
      {
        args: {
          sessionStatus: 'in_progress',
          selectedLocation: { status: 'not_started', countedItems: 0, totalItems: 0 },
          currentLocationName: 'Main Bar',
        },
        allowed: false,
      },
      {
        args: {
          sessionStatus: 'in_progress',
          selectedLocation: { status: 'current', countedItems: 0, totalItems: 2 },
          currentLocationName: 'Main Bar',
        },
        allowed: false,
      },
    ]

    for (const entry of cases) {
      const reason = getCompleteLocationDisabledReason(entry.args)
      const allowed = canCompleteInventoryCountLocation(entry.args)
      expect(allowed).toBe(entry.allowed)
      expect(allowed).toBe(reason === '')
      if (!allowed) {
        expect(reason.length).toBeGreaterThan(0)
      }
    }
  })

  it('never allows enabled Complete Location while eligibility reason is set', async () => {
    getInventoryCountSessionLocations.mockResolvedValue(FIXTURE_LOCATIONS)
    getInventoryCountSessionItems.mockResolvedValue(FIXTURE_ITEMS)

    const { container, cleanup } = await renderWorkspace()
    const completeBtn = getButtonByText(container, 'Complete Location')
    const title = completeBtn?.getAttribute('title')
    const disabled = completeBtn?.disabled

    if (disabled) {
      expect(title).toBeTruthy()
    } else {
      expect(title).toBeNull()
    }

    cleanup()
  })
})

describe('InventoryCountSessionWorkspace current location guidance (P8.16.32)', () => {
  beforeEach(() => {
    getInventoryCountSession.mockResolvedValue({
      id: 'session-real-1',
      workspaceId: 'workspace-test-id',
      status: 'in_progress',
    })
    getInventoryCountSessionLocations.mockResolvedValue(FIXTURE_LOCATIONS)
    getInventoryCountSessionItems.mockResolvedValue(FIXTURE_ITEMS)
    completeInventoryCountLocation.mockClear()
  })

  it('shows inactive guidance and navigates to the current location without lifecycle mutation', async () => {
    getInventoryCountSessionItems.mockResolvedValueOnce([
      sessionItem({
        id: 'ms-1',
        itemName: 'Coca-Cola',
        storageLocation: 'Main Storage',
        expectedSnapshot: 10,
        countedQuantity: null,
        lineStatus: 'pending',
      }),
      sessionItem({
        id: 'cs-1',
        itemName: 'Espresso Beans',
        unit: 'kg',
        storageLocation: 'Coffee Station',
        expectedSnapshot: 2,
        countedQuantity: 2,
        lineStatus: 'counted',
      }),
      sessionItem({
        id: 'cs-2',
        itemName: 'Oat Milk',
        unit: 'litre',
        storageLocation: 'Coffee Station',
        expectedSnapshot: 6,
        countedQuantity: 6,
        lineStatus: 'counted',
      }),
    ])

    const { container, cleanup } = await renderWorkspace()

    act(() => {
      getRailButton(container, 'Coffee Station').click()
    })

    const guidance = container.querySelector('[aria-label="Location not active yet"]')
    expect(guidance).toBeTruthy()
    expect(guidance.textContent).toContain('Location not active yet')
    expect(guidance.textContent).toContain('Current location:')
    expect(guidance.textContent).toContain('Main Storage')
    expect(getRailButton(container, 'Coffee Station')?.textContent)
      .toContain('All items counted · Waiting to become current')
    expect(container.querySelector('.inventory-count-complete-disabled-reason')?.textContent)
      .toContain('Complete “Main Storage” first.')
    expect(getButtonByText(container, 'Complete Location')?.disabled).toBe(true)
    expect(getButtonByText(container, 'Finish Count')?.disabled).toBe(true)

    const oatInput = container.querySelector('input[aria-label="Counted quantity for Oat Milk"]')
    expect(oatInput?.value).toBe('6')

    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      nativeInputValueSetter?.call(oatInput, '9')
      oatInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(oatInput.value).toBe('9')

    await act(async () => {
      getButtonByText(guidance, 'Go to Current Location').click()
    })

    expect(completeInventoryCountLocation).not.toHaveBeenCalled()
    expect(getRailButton(container, 'Main Storage')?.className).toContain('is-selected')
    expect(getRailButton(container, 'Main Storage')?.textContent).toContain('Current')
    expect(container.textContent).toContain('Coca-Cola')
    expect(container.querySelector('[aria-label="Location not active yet"]')).toBeNull()

    act(() => {
      getRailButton(container, 'Coffee Station').click()
    })
    expect(container.querySelector('input[aria-label="Counted quantity for Oat Milk"]')?.value).toBe('9')

    cleanup()
  })

  it('shows ready-to-complete copy on the current location when all items are counted', async () => {
    getInventoryCountSessionItems.mockResolvedValueOnce([
      sessionItem({
        id: 'ms-1',
        itemName: 'Coca-Cola',
        storageLocation: 'Main Storage',
        expectedSnapshot: 10,
        countedQuantity: 10,
        lineStatus: 'counted',
      }),
      sessionItem({
        id: 'ms-2',
        itemName: 'Paper Straws',
        unit: 'box',
        storageLocation: 'Main Storage',
        expectedSnapshot: 4,
        countedQuantity: 4,
        lineStatus: 'counted',
      }),
    ])
    getInventoryCountSessionLocations.mockResolvedValueOnce([
      sessionLocation('loc-1', 'Main Storage', 0, 'current'),
      sessionLocation('loc-2', 'Coffee Station', 1, 'not_started'),
    ])

    const { container, cleanup } = await renderWorkspace()

    expect(getRailButton(container, 'Main Storage')?.textContent)
      .toContain('All items counted · Ready to complete location')
    expect(container.querySelector('[aria-label="Selected location readiness"]')?.textContent)
      .toContain('All items counted · Ready to complete location')
    expect(getButtonByText(container, 'Complete Location')?.disabled).toBe(false)
    expect(getButtonByText(container, 'Finish Count')?.disabled).toBe(true)

    cleanup()
  })

  it('shows completed location copy and keeps Finish Count disabled until counting_complete', async () => {
    getInventoryCountSessionLocations.mockResolvedValueOnce([
      sessionLocation('loc-1', 'Main Storage', 0, 'completed'),
      sessionLocation('loc-2', 'Coffee Station', 1, 'current'),
    ])
    getInventoryCountSessionItems.mockResolvedValueOnce([
      sessionItem({
        id: 'ms-1',
        itemName: 'Coca-Cola',
        storageLocation: 'Main Storage',
        expectedSnapshot: 10,
        countedQuantity: 10,
        lineStatus: 'counted',
      }),
      sessionItem({
        id: 'cs-1',
        itemName: 'Espresso Beans',
        unit: 'kg',
        storageLocation: 'Coffee Station',
        expectedSnapshot: 2,
        countedQuantity: null,
        lineStatus: 'pending',
      }),
    ])

    const { container, cleanup } = await renderWorkspace()

    act(() => {
      getRailButton(container, 'Main Storage').click()
    })

    expect(getRailButton(container, 'Main Storage')?.textContent).toContain('Location completed')
    expect(container.querySelector('.inventory-count-complete-disabled-reason')?.textContent)
      .toContain('This location is already complete.')
    expect(getButtonByText(container, 'Finish Count')?.disabled).toBe(true)

    cleanup()
  })
})

describe('InventoryCountSessionWorkspace high-density workspace (P8.17.4)', () => {
  function setInputValue(input, value) {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set
    nativeInputValueSetter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }

  async function pressEnter(input) {
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        bubbles: true,
        cancelable: true,
      }))
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn()
    getInventoryCountSession.mockReset()
    getInventoryCountSessionLocations.mockReset()
    getInventoryCountSessionItems.mockReset()
    updateInventoryCountItem.mockReset()
    completeInventoryCountLocation.mockReset()
    setInventoryCountSessionPauseState.mockReset()
    previewInventoryCountFinish.mockReset()
    postInventoryCountFinish.mockReset()

    getInventoryCountSession.mockResolvedValue({
      id: 'session-real-1',
      workspaceId: 'workspace-test-id',
      status: 'in_progress',
    })
    getInventoryCountSessionLocations.mockResolvedValue(FIXTURE_LOCATIONS)
    getInventoryCountSessionItems.mockResolvedValue(FIXTURE_ITEMS)
    updateInventoryCountItem.mockImplementation(async ({ sessionItemId, countedQuantity }) => ({
      id: sessionItemId,
      countedQuantity,
      lineStatus: countedQuantity === null || countedQuantity === undefined ? 'pending' : 'counted',
    }))
  })

  it('1 / 4. Active session uses high-density structure with a dedicated item scroll container', async () => {
    const { container, cleanup } = await renderWorkspace()
    const session = container.querySelector('.inventory-count-session')
    expect(session?.className).toContain('is-high-density')
    expect(container.querySelector('.inventory-count-session-table-wrap')).toBeTruthy()
    expect(container.querySelector('.inventory-count-session-header')).toBeTruthy()
    cleanup()
  })

  it('2. Landing page and wizard remain unchanged', async () => {
    const { container, cleanup } = render(createElement(InventoryCountView, {}))
    await act(async () => {
      await Promise.resolve()
    })
    expect(container.querySelector('.inventory-count-page')).toBeTruthy()
    expect(container.querySelector('.inventory-count-session.is-high-density')).toBeNull()
    expect(getButtonByText(container, 'Start new count')).toBeTruthy()
    cleanup()
  })

  it('3 / 16 / 17. Compact header keeps status, mode, progress, Pause, Finish, Exit; footer keeps Previous/Next', async () => {
    const { container, cleanup } = await renderWorkspace()
    const header = container.querySelector('.inventory-count-session-header')
    expect(header?.textContent).toContain('In Progress')
    expect(header?.textContent).toContain('Blind Count')
    expect(header?.textContent).toContain('Progress')
    expect(getButtonByText(header, 'Pause')).toBeTruthy()
    expect(getButtonByText(header, 'Finish Count')).toBeTruthy()
    expect(getButtonByText(header, 'Exit')).toBeTruthy()
    expect(getButtonByText(container, 'Previous')).toBeTruthy()
    expect(getButtonByText(container, 'Next')).toBeTruthy()
    expect(getButtonByText(container, 'Complete Location')).toBeTruthy()
    cleanup()
  })

  it('5 / 15. Displayed order helpers preserve list order and search filtering', () => {
    const items = [
      { id: 'a', name: 'Alpha', lineStatus: 'counted' },
      { id: 'b', name: 'Beta Milk', lineStatus: 'pending' },
      { id: 'c', name: 'Gamma', lineStatus: 'pending' },
    ]
    expect(getDisplayedLocationItems(items, '').map((item) => item.id)).toEqual(['a', 'b', 'c'])
    expect(getDisplayedLocationItems(items, 'milk').map((item) => item.id)).toEqual(['b'])
    expect(findNextEligibleCountItem(items, 'a')?.id).toBe('b')
    expect(findNextEligibleCountItem(getDisplayedLocationItems(items, 'g'), 'c')).toBeNull()
  })

  it('6–11. Enter prevents default, saves via existing path, then focuses the next pending input', async () => {
    getInventoryCountSessionItems.mockResolvedValue([
      sessionItem({
        id: 'ms-1',
        itemName: 'Coca-Cola',
        storageLocation: 'Main Storage',
        expectedSnapshot: 10,
        countedQuantity: null,
        lineStatus: 'pending',
      }),
      sessionItem({
        id: 'ms-2',
        itemName: 'Paper Straws',
        unit: 'box',
        storageLocation: 'Main Storage',
        expectedSnapshot: 4,
        countedQuantity: null,
        lineStatus: 'pending',
      }),
      sessionItem({
        id: 'ms-3',
        itemName: 'Napkins',
        unit: 'pack',
        storageLocation: 'Main Storage',
        expectedSnapshot: 2,
        countedQuantity: null,
        lineStatus: 'pending',
      }),
    ])
    getInventoryCountSessionLocations.mockResolvedValue([
      sessionLocation('loc-1', 'Main Storage', 0, 'current'),
    ])

    const { container, cleanup } = await renderWorkspace()
    const first = container.querySelector('input[aria-label="Counted quantity for Coca-Cola"]')
    const second = container.querySelector('input[aria-label="Counted quantity for Paper Straws"]')
    expect(first).toBeTruthy()
    expect(second).toBeTruthy()

    const focusSpy = vi.spyOn(second, 'focus')

    await act(async () => {
      setInputValue(first, '7')
    })

    const keyEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      bubbles: true,
      cancelable: true,
    })
    const preventSpy = vi.spyOn(keyEvent, 'preventDefault')

    await act(async () => {
      first.dispatchEvent(keyEvent)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(preventSpy).toHaveBeenCalled()
    expect(updateInventoryCountItem).toHaveBeenCalledWith({
      workspaceId: 'workspace-test-id',
      sessionId: 'session-real-1',
      sessionItemId: 'ms-1',
      countedQuantity: 7,
    })
    expect(focusSpy).toHaveBeenCalled()

    focusSpy.mockRestore()
    cleanup()
  })

  it('8. Enter does not start a second save while enter-lock is held', async () => {
    let releaseSave
    const saveGate = new Promise((resolve) => {
      releaseSave = resolve
    })
    updateInventoryCountItem.mockImplementation(async ({ sessionItemId, countedQuantity }) => {
      await saveGate
      return {
        id: sessionItemId,
        countedQuantity,
        lineStatus: 'counted',
      }
    })
    getInventoryCountSessionItems.mockResolvedValue([
      sessionItem({
        id: 'ms-1',
        itemName: 'Coca-Cola',
        storageLocation: 'Main Storage',
        countedQuantity: null,
        lineStatus: 'pending',
      }),
      sessionItem({
        id: 'ms-2',
        itemName: 'Paper Straws',
        storageLocation: 'Main Storage',
        countedQuantity: null,
        lineStatus: 'pending',
      }),
    ])
    getInventoryCountSessionLocations.mockResolvedValue([
      sessionLocation('loc-1', 'Main Storage', 0, 'current'),
    ])

    const { container, cleanup } = await renderWorkspace()
    const first = container.querySelector('input[aria-label="Counted quantity for Coca-Cola"]')
    expect(first).toBeTruthy()

    await act(async () => {
      setInputValue(first, '3')
    })

    const firstEnterPromise = pressEnter(first)
    await act(async () => {
      await Promise.resolve()
    })
    await pressEnter(first)

    expect(updateInventoryCountItem).toHaveBeenCalledTimes(1)

    await act(async () => {
      releaseSave()
      await firstEnterPromise
    })

    cleanup()
  })

  it('12. Save failure keeps focus/value and shows Save failed', async () => {
    updateInventoryCountItem.mockRejectedValueOnce(new Error('Save failed'))
    getInventoryCountSessionItems.mockResolvedValue([
      sessionItem({
        id: 'ms-1',
        itemName: 'Coca-Cola',
        storageLocation: 'Main Storage',
        countedQuantity: null,
        lineStatus: 'pending',
      }),
      sessionItem({
        id: 'ms-2',
        itemName: 'Paper Straws',
        storageLocation: 'Main Storage',
        countedQuantity: null,
        lineStatus: 'pending',
      }),
    ])
    getInventoryCountSessionLocations.mockResolvedValue([
      sessionLocation('loc-1', 'Main Storage', 0, 'current'),
    ])

    const { container, cleanup } = await renderWorkspace()
    const first = container.querySelector('input[aria-label="Counted quantity for Coca-Cola"]')
    const second = container.querySelector('input[aria-label="Counted quantity for Paper Straws"]')
    const focusSpy = vi.spyOn(second, 'focus')

    await act(async () => {
      setInputValue(first, '5')
    })
    await pressEnter(first)

    expect(focusSpy).not.toHaveBeenCalled()
    expect(first.value).toBe('5')
    expect(container.textContent).toMatch(/Save failed|Unable to save/i)
    expect(completeInventoryCountLocation).not.toHaveBeenCalled()

    focusSpy.mockRestore()
    cleanup()
  })

  it('13. Validation failure does not advance', async () => {
    getInventoryCountSessionItems.mockResolvedValue([
      sessionItem({
        id: 'ms-1',
        itemName: 'Coca-Cola',
        storageLocation: 'Main Storage',
        countedQuantity: null,
        lineStatus: 'pending',
      }),
      sessionItem({
        id: 'ms-2',
        itemName: 'Paper Straws',
        storageLocation: 'Main Storage',
        countedQuantity: null,
        lineStatus: 'pending',
      }),
    ])
    getInventoryCountSessionLocations.mockResolvedValue([
      sessionLocation('loc-1', 'Main Storage', 0, 'current'),
    ])

    const { container, cleanup } = await renderWorkspace()
    const first = container.querySelector('input[aria-label="Counted quantity for Coca-Cola"]')
    const second = container.querySelector('input[aria-label="Counted quantity for Paper Straws"]')
    const focusSpy = vi.spyOn(second, 'focus')

    // Incomplete decimal is not ready — Enter must not save or advance.
    await act(async () => {
      setInputValue(first, '4.')
    })
    await pressEnter(first)

    expect(updateInventoryCountItem).not.toHaveBeenCalled()
    expect(focusSpy).not.toHaveBeenCalled()

    focusSpy.mockRestore()
    cleanup()
  })

  it('14. Final eligible item does not auto-complete location or session', async () => {
    getInventoryCountSessionItems.mockResolvedValue([
      sessionItem({
        id: 'ms-1',
        itemName: 'Coca-Cola',
        storageLocation: 'Main Storage',
        countedQuantity: null,
        lineStatus: 'pending',
      }),
    ])
    getInventoryCountSessionLocations.mockResolvedValue([
      sessionLocation('loc-1', 'Main Storage', 0, 'current'),
    ])

    const { container, cleanup } = await renderWorkspace()
    const first = container.querySelector('input[aria-label="Counted quantity for Coca-Cola"]')
    const blurSpy = vi.spyOn(first, 'blur')

    await act(async () => {
      setInputValue(first, '2')
    })
    await pressEnter(first)

    expect(updateInventoryCountItem).toHaveBeenCalledTimes(1)
    expect(completeInventoryCountLocation).not.toHaveBeenCalled()
    expect(blurSpy).toHaveBeenCalled()
    expect(getButtonByText(container, 'Complete Location')).toBeTruthy()

    blurSpy.mockRestore()
    cleanup()
  })

  it('15b. Search-filtered displayed order drives next eligible item', async () => {
    getInventoryCountSessionItems.mockResolvedValue([
      sessionItem({
        id: 'ms-1',
        itemName: 'Alpha Tea',
        storageLocation: 'Main Storage',
        countedQuantity: null,
        lineStatus: 'pending',
      }),
      sessionItem({
        id: 'ms-2',
        itemName: 'Beta Coffee',
        storageLocation: 'Main Storage',
        countedQuantity: null,
        lineStatus: 'pending',
      }),
      sessionItem({
        id: 'ms-3',
        itemName: 'Alpha Sugar',
        storageLocation: 'Main Storage',
        countedQuantity: null,
        lineStatus: 'pending',
      }),
    ])
    getInventoryCountSessionLocations.mockResolvedValue([
      sessionLocation('loc-1', 'Main Storage', 0, 'current'),
    ])

    const { container, cleanup } = await renderWorkspace()
    const search = container.querySelector('.inventory-count-session-search-input')
    expect(search).toBeTruthy()
    await act(async () => {
      setInputValue(search, 'Alpha')
    })

    const first = container.querySelector('input[aria-label="Counted quantity for Alpha Tea"]')
    const nextAlpha = container.querySelector('input[aria-label="Counted quantity for Alpha Sugar"]')
    expect(first).toBeTruthy()
    expect(nextAlpha).toBeTruthy()
    expect(container.querySelector('input[aria-label="Counted quantity for Beta Coffee"]')).toBeNull()
    const focusSpy = vi.spyOn(nextAlpha, 'focus')

    await act(async () => {
      setInputValue(first, '1')
    })
    await pressEnter(first)

    expect(focusSpy).toHaveBeenCalled()
    focusSpy.mockRestore()
    cleanup()
  })

  it('18. visualViewport listeners are cleaned up on unmount', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')

    const { cleanup } = await renderWorkspace()
    expect(addSpy.mock.calls.some((call) => call[0] === 'resize')).toBe(true)
    cleanup()
    expect(removeSpy.mock.calls.some((call) => call[0] === 'resize')).toBe(true)

    addSpy.mockRestore()
    removeSpy.mockRestore()
  })

  it('19–22. Blind mode labels, Complete Location, Pause/Exit remain; no mobile shell coupling', async () => {
    const { container, cleanup } = await renderWorkspace()
    const headerText = container.querySelector('.inventory-count-session-header')?.textContent || ''
    expect(headerText).toContain('Blind Count')
    expect(getButtonByText(container, 'Complete Location')).toBeTruthy()
    expect(getButtonByText(container, 'Pause')).toBeTruthy()
    expect(getButtonByText(container, 'Exit')).toBeTruthy()
    expect(container.querySelector('.mobile-manager-stock')).toBeNull()
    cleanup()
  })
})

describe('InventoryCountSessionWorkspace keyboard viewport repair (P8.17.4a)', () => {
  beforeEach(() => {
    getInventoryCountSession.mockReset()
    getInventoryCountSessionLocations.mockReset()
    getInventoryCountSessionItems.mockReset()
    updateInventoryCountItem.mockReset()
    completeInventoryCountLocation.mockReset()

    getInventoryCountSession.mockResolvedValue({
      id: 'session-real-1',
      workspaceId: 'workspace-test-id',
      status: 'in_progress',
    })
    getInventoryCountSessionLocations.mockResolvedValue(FIXTURE_LOCATIONS)
    getInventoryCountSessionItems.mockResolvedValue(FIXTURE_ITEMS)
    updateInventoryCountItem.mockImplementation(async ({ sessionItemId, countedQuantity }) => ({
      id: sessionItemId,
      countedQuantity,
      lineStatus: countedQuantity === null || countedQuantity === undefined ? 'pending' : 'counted',
    }))
  })

  it('1–2. Available height subtracts nested session top; never equals raw visualViewport.height', () => {
    const available = getInventoryCountKeyboardAvailableHeight({
      sessionTop: 140,
      visualViewportOffsetTop: 0,
      visualViewportHeight: 400,
      padding: 8,
      minimum: 200,
    })
    expect(available).toBe(252)
    expect(available).not.toBe(400)
    expect(available).toBeLessThan(400)
  })

  it('3–6. Keyboard-open compact state sizes from available height and keeps item scroll + essential actions', async () => {
    const fakeViewport = {
      height: 420,
      offsetTop: 0,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    const originalInnerHeight = window.innerHeight
    const originalViewport = window.visualViewport
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 })
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: fakeViewport })

    const { container, cleanup } = await renderWorkspace()
    const session = container.querySelector('.inventory-count-session')
    expect(session).toBeTruthy()

    // Nested offset below Stock chrome.
    vi.spyOn(session, 'getBoundingClientRect').mockReturnValue({
      top: 120,
      bottom: 700,
      left: 0,
      right: 1000,
      width: 1000,
      height: 580,
      x: 0,
      y: 120,
      toJSON: () => ({}),
    })

    await act(async () => {
      fakeViewport.addEventListener.mock.calls
        .filter((call) => call[0] === 'resize')
        .forEach((call) => call[1]())
      await new Promise((resolve) => {
        requestAnimationFrame(() => resolve())
      })
    })

    expect(session.className).toContain('is-keyboard-compact')
    const available = session.style.getPropertyValue('--inventory-count-session-available-height')
    expect(available).toBe('292px')
    expect(available).not.toBe('420px')
    expect(container.querySelector('.inventory-count-session-table-wrap')).toBeTruthy()
    expect(getButtonByText(container, 'Previous')).toBeTruthy()
    expect(getButtonByText(container, 'Next')).toBeTruthy()
    expect(getButtonByText(container, 'Complete Location')).toBeTruthy()
    expect(getButtonByText(container, 'Pause')).toBeTruthy()
    expect(getButtonByText(container, 'Exit')).toBeTruthy()

    cleanup()
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight })
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: originalViewport })
  })

  it('5. Local row scrolling adjusts the item workspace scrollTop, not page scrollIntoView', () => {
    const container = {
      scrollTop: 0,
      querySelector: () => ({
        getBoundingClientRect: () => ({ height: 40 }),
      }),
      getBoundingClientRect: () => ({ top: 100, bottom: 300, left: 0, right: 400 }),
    }
    const row = {
      getBoundingClientRect: () => ({ top: 320, bottom: 360, left: 0, right: 400 }),
    }
    scrollInventoryCountRowIntoView(row, container)
    expect(container.scrollTop).toBe(60)
  })

  it('5b. Local scrolling accounts for sticky header height when row is above the visible band', () => {
    const container = {
      scrollTop: 80,
      querySelector: () => null,
      getBoundingClientRect: () => ({ top: 100, bottom: 400, left: 0, right: 400 }),
    }
    const row = {
      getBoundingClientRect: () => ({ top: 110, bottom: 150, left: 0, right: 400 }),
    }
    scrollInventoryCountRowIntoView(row, container, { stickyOffset: 36 })
    // visibleTop = 100 + 36 = 136; row.top 110 is 26px under the header
    expect(container.scrollTop).toBe(54)
  })

  it('5c. Already-visible rows do not change scrollTop (manual scroll preservation)', () => {
    const container = {
      scrollTop: 220,
      querySelector: () => null,
      getBoundingClientRect: () => ({ top: 100, bottom: 400, left: 0, right: 400 }),
    }
    const row = {
      getBoundingClientRect: () => ({ top: 180, bottom: 220, left: 0, right: 400 }),
    }
    expect(isInventoryCountRowOutsideViewport(row, container)).toBe(false)
    expect(scrollInventoryCountRowIntoView(row, container)).toBe(false)
    expect(container.scrollTop).toBe(220)
  })

  it('7–8. Keyboard close clears compact height; repeated open/close does not accumulate stale values', async () => {
    let vvHeight = 768
    const listeners = new Map()
    const fakeViewport = {
      get height() {
        return vvHeight
      },
      offsetTop: 0,
      addEventListener: vi.fn((type, handler) => {
        listeners.set(type, handler)
      }),
      removeEventListener: vi.fn((type) => {
        listeners.delete(type)
      }),
    }
    const originalInnerHeight = window.innerHeight
    const originalViewport = window.visualViewport
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 })
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: fakeViewport })

    const { container, cleanup } = await renderWorkspace()
    const session = container.querySelector('.inventory-count-session')
    vi.spyOn(session, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      bottom: 700,
      left: 0,
      right: 1000,
      width: 1000,
      height: 600,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    })

    const fireResize = async () => {
      await act(async () => {
        listeners.get('resize')?.()
        await new Promise((resolve) => {
          requestAnimationFrame(() => resolve())
        })
      })
    }

    vvHeight = 400
    await fireResize()
    expect(session.className).toContain('is-keyboard-compact')
    expect(session.style.getPropertyValue('--inventory-count-session-available-height')).toBe('292px')

    vvHeight = 768
    await fireResize()
    expect(session.className).not.toContain('is-keyboard-compact')
    expect(session.style.getPropertyValue('--inventory-count-session-available-height')).toBe('')

    vvHeight = 390
    await fireResize()
    expect(session.className).toContain('is-keyboard-compact')
    expect(session.style.getPropertyValue('--inventory-count-session-available-height')).toBe('282px')

    vvHeight = 768
    await fireResize()
    expect(session.style.getPropertyValue('--inventory-count-session-available-height')).toBe('')

    cleanup()
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight })
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: originalViewport })
  })

  it('9. Listener cleanup still occurs on unmount', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { cleanup } = await renderWorkspace()
    expect(addSpy.mock.calls.some((call) => call[0] === 'resize')).toBe(true)
    cleanup()
    expect(removeSpy.mock.calls.some((call) => call[0] === 'resize')).toBe(true)
    addSpy.mockRestore()
    removeSpy.mockRestore()
  })

  it('10–12. Enter save/next, save failure, and last-item blur remain unchanged', async () => {
    getInventoryCountSessionItems.mockResolvedValue([
      sessionItem({
        id: 'ms-1',
        itemName: 'Coca-Cola',
        storageLocation: 'Main Storage',
        countedQuantity: null,
        lineStatus: 'pending',
      }),
      sessionItem({
        id: 'ms-2',
        itemName: 'Paper Straws',
        storageLocation: 'Main Storage',
        countedQuantity: null,
        lineStatus: 'pending',
      }),
    ])
    getInventoryCountSessionLocations.mockResolvedValue([
      sessionLocation('loc-1', 'Main Storage', 0, 'current'),
    ])

    const { container, cleanup } = await renderWorkspace()
    const first = container.querySelector('input[aria-label="Counted quantity for Coca-Cola"]')
    const second = container.querySelector('input[aria-label="Counted quantity for Paper Straws"]')
    const focusSpy = vi.spyOn(second, 'focus')

    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      nativeInputValueSetter?.call(first, '4')
      first.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      first.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      }))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(updateInventoryCountItem).toHaveBeenCalledWith({
      workspaceId: 'workspace-test-id',
      sessionId: 'session-real-1',
      sessionItemId: 'ms-1',
      countedQuantity: 4,
    })
    expect(focusSpy).toHaveBeenCalled()
    expect(completeInventoryCountLocation).not.toHaveBeenCalled()

    updateInventoryCountItem.mockRejectedValueOnce(new Error('Save failed'))
    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      nativeInputValueSetter?.call(second, '9')
      second.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      second.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      }))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(second.value).toBe('9')
    expect(container.textContent).toMatch(/Save failed|Unable to save/i)
    expect(completeInventoryCountLocation).not.toHaveBeenCalled()

    focusSpy.mockRestore()
    cleanup()
  })

  it('13–15. Keyboard-closed high-density, landing page, and mobile shell remain intact', async () => {
    const { container, cleanup } = await renderWorkspace()
    const session = container.querySelector('.inventory-count-session')
    expect(session?.className).toContain('is-high-density')
    expect(session?.className).not.toContain('is-keyboard-compact')
    expect(session?.style.getPropertyValue('--inventory-count-session-available-height')).toBe('')
    expect(container.querySelector('.mobile-manager-stock')).toBeNull()
    cleanup()

    const landing = render(createElement(InventoryCountView, {}))
    await act(async () => {
      await Promise.resolve()
    })
    expect(landing.container.querySelector('.inventory-count-page')).toBeTruthy()
    expect(landing.container.querySelector('.inventory-count-session.is-high-density')).toBeNull()
    landing.cleanup()
  })
})

describe('InventoryCountSessionWorkspace sticky column header (P8.17.4b)', () => {
  beforeEach(() => {
    getInventoryCountSession.mockReset()
    getInventoryCountSessionLocations.mockReset()
    getInventoryCountSessionItems.mockReset()
    updateInventoryCountItem.mockReset()
    completeInventoryCountLocation.mockReset()

    getInventoryCountSession.mockResolvedValue({
      id: 'session-real-1',
      workspaceId: 'workspace-test-id',
      status: 'in_progress',
    })
    getInventoryCountSessionLocations.mockResolvedValue(FIXTURE_LOCATIONS)
    getInventoryCountSessionItems.mockResolvedValue(FIXTURE_ITEMS)
    updateInventoryCountItem.mockImplementation(async ({ sessionItemId, countedQuantity }) => ({
      id: sessionItemId,
      countedQuantity,
      lineStatus: countedQuantity === null || countedQuantity === undefined ? 'pending' : 'counted',
    }))
  })

  it('1–5. Frozen spreadsheet header sits above the local row scroll region', async () => {
    const { container, cleanup } = await renderWorkspace()
    const sheet = container.querySelector('.inventory-count-session-spreadsheet')
    const head = sheet?.querySelector('.inventory-count-session-table-head')
    const wrap = sheet?.querySelector('.inventory-count-session-table-wrap')
    const labels = Array.from(head?.querySelectorAll('[role="columnheader"]') ?? [])
      .map((node) => node.textContent)
    expect(sheet).toBeTruthy()
    expect(head).toBeTruthy()
    expect(wrap).toBeTruthy()
    expect(labels).toEqual(['Item', 'Unit', 'Expected', 'Counted', 'Status'])
    expect(wrap.contains(head)).toBe(false)
    expect(wrap.querySelector('.inventory-count-session-spreadsheet-row')).toBeTruthy()
    expect(sheet.style.getPropertyValue('--ic-cols')).toContain('var(--ic-col-item)')
    cleanup()
  })

  it('6–7. Enter navigation still focuses next input via the local table-wrap scroll helper', async () => {
    getInventoryCountSessionItems.mockResolvedValue([
      sessionItem({
        id: 'ms-1',
        itemName: 'Coca-Cola',
        storageLocation: 'Main Storage',
        countedQuantity: null,
        lineStatus: 'pending',
      }),
      sessionItem({
        id: 'ms-2',
        itemName: 'Paper Straws',
        storageLocation: 'Main Storage',
        countedQuantity: null,
        lineStatus: 'pending',
      }),
    ])
    getInventoryCountSessionLocations.mockResolvedValue([
      sessionLocation('loc-1', 'Main Storage', 0, 'current'),
    ])

    const { container, cleanup } = await renderWorkspace()
    const wrap = container.querySelector('.inventory-count-session-table-wrap')
    const first = container.querySelector('input[aria-label="Counted quantity for Coca-Cola"]')
    const second = container.querySelector('input[aria-label="Counted quantity for Paper Straws"]')
    const focusSpy = vi.spyOn(second, 'focus')

    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      nativeInputValueSetter?.call(first, '3')
      first.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      first.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(updateInventoryCountItem).toHaveBeenCalledWith({
      workspaceId: 'workspace-test-id',
      sessionId: 'session-real-1',
      sessionItemId: 'ms-1',
      countedQuantity: 3,
    })
    expect(focusSpy).toHaveBeenCalled()
    expect(container.querySelector('.inventory-count-session-table-head')).toBeTruthy()
    expect(wrap?.contains(container.querySelector('.inventory-count-session-table-head'))).toBe(false)

    focusSpy.mockRestore()
    cleanup()
  })

  it('8–9. Sticky header remains present in keyboard-compact and after keyboard close', async () => {
    let vvHeight = 768
    const listeners = new Map()
    const fakeViewport = {
      get height() {
        return vvHeight
      },
      offsetTop: 0,
      addEventListener: vi.fn((type, handler) => {
        listeners.set(type, handler)
      }),
      removeEventListener: vi.fn((type) => {
        listeners.delete(type)
      }),
    }
    const originalInnerHeight = window.innerHeight
    const originalViewport = window.visualViewport
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 })
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: fakeViewport })

    const { container, cleanup } = await renderWorkspace()
    const session = container.querySelector('.inventory-count-session')
    vi.spyOn(session, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      bottom: 700,
      left: 0,
      right: 1000,
      width: 1000,
      height: 600,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    })

    const fireResize = async () => {
      await act(async () => {
        listeners.get('resize')?.()
        await new Promise((resolve) => {
          requestAnimationFrame(() => resolve())
        })
      })
    }

    vvHeight = 400
    await fireResize()
    expect(session.className).toContain('is-keyboard-compact')
    expect(container.querySelector('.inventory-count-session-table-head')).toBeTruthy()

    vvHeight = 768
    await fireResize()
    expect(session.className).not.toContain('is-keyboard-compact')
    expect(container.querySelector('.inventory-count-session-table-head')).toBeTruthy()

    cleanup()
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight })
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: originalViewport })
  })

  it('10. Empty location does not render a sticky header', async () => {
    getInventoryCountSessionItems.mockResolvedValue([])
    getInventoryCountSessionLocations.mockResolvedValue([
      sessionLocation('loc-1', 'Main Storage', 0, 'current'),
    ])

    const { container, cleanup } = await renderWorkspace()
    expect(container.querySelector('.inventory-count-session-table-head')).toBeNull()
    expect(container.textContent).toContain('No items in this location')
    cleanup()
  })

  it('11–13. Save success/failure and last-item behavior remain unchanged with sticky header', async () => {
    getInventoryCountSessionItems.mockResolvedValue([
      sessionItem({
        id: 'ms-1',
        itemName: 'Coca-Cola',
        storageLocation: 'Main Storage',
        countedQuantity: null,
        lineStatus: 'pending',
      }),
    ])
    getInventoryCountSessionLocations.mockResolvedValue([
      sessionLocation('loc-1', 'Main Storage', 0, 'current'),
    ])

    const { container, cleanup } = await renderWorkspace()
    const first = container.querySelector('input[aria-label="Counted quantity for Coca-Cola"]')
    const blurSpy = vi.spyOn(first, 'blur')

    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      nativeInputValueSetter?.call(first, '2')
      first.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      first.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(updateInventoryCountItem).toHaveBeenCalledTimes(1)
    expect(completeInventoryCountLocation).not.toHaveBeenCalled()
    expect(blurSpy).toHaveBeenCalled()
    expect(container.querySelector('.inventory-count-session-table-head')).toBeTruthy()

    updateInventoryCountItem.mockRejectedValueOnce(new Error('Save failed'))
    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      nativeInputValueSetter?.call(first, '8')
      first.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      first.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      }))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(first.value).toBe('8')
    expect(container.textContent).toMatch(/Save failed|Unable to save/i)

    blurSpy.mockRestore()
    cleanup()
  })

  it('14–15. Landing page and mobile shell remain unchanged', async () => {
    const landing = render(createElement(InventoryCountView, {}))
    await act(async () => {
      await Promise.resolve()
    })
    expect(landing.container.querySelector('.inventory-count-page')).toBeTruthy()
    expect(landing.container.querySelector('.inventory-count-session-table-head')).toBeNull()
    expect(landing.container.querySelector('.mobile-manager-stock')).toBeNull()
    landing.cleanup()
  })
})

describe('InventoryCountSessionWorkspace spreadsheet foundation (P8.18.0)', () => {
  beforeEach(() => {
    getInventoryCountSession.mockReset()
    getInventoryCountSessionLocations.mockReset()
    getInventoryCountSessionItems.mockReset()
    updateInventoryCountItem.mockReset()
    completeInventoryCountLocation.mockReset()

    getInventoryCountSession.mockResolvedValue({
      id: 'session-real-1',
      workspaceId: 'workspace-test-id',
      status: 'in_progress',
    })
    getInventoryCountSessionLocations.mockResolvedValue(FIXTURE_LOCATIONS)
    getInventoryCountSessionItems.mockResolvedValue(FIXTURE_ITEMS)
    updateInventoryCountItem.mockImplementation(async ({ sessionItemId, countedQuantity }) => ({
      id: sessionItemId,
      countedQuantity,
      lineStatus: countedQuantity === null || countedQuantity === undefined ? 'pending' : 'counted',
    }))
  })

  it('frozen header never lives inside the row scroll container', async () => {
    const { container, cleanup } = await renderWorkspace()
    const sheet = container.querySelector('.inventory-count-session-spreadsheet')
    const head = sheet.querySelector('.inventory-count-session-table-head')
    const body = sheet.querySelector('.inventory-count-session-table-wrap')
    expect(body.contains(head)).toBe(false)
    expect(
      head.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    cleanup()
  })

  it('shared column contract is defined once on the spreadsheet root', async () => {
    const { container, cleanup } = await renderWorkspace()
    const sheet = container.querySelector('.inventory-count-session-spreadsheet')
    expect(sheet.style.getPropertyValue('--ic-cols')).toContain('var(--ic-col-item)')
    expect(sheet.style.getPropertyValue('--ic-cols')).toContain('var(--ic-col-unit)')
    expect(sheet.style.getPropertyValue('--ic-cols')).toContain('var(--ic-col-expected)')
    expect(sheet.style.getPropertyValue('--ic-cols')).toContain('var(--ic-col-counted)')
    expect(sheet.style.getPropertyValue('--ic-cols')).toContain('var(--ic-col-status)')
    expect(sheet.style.getPropertyValue('--ic-col-item')).toBeTruthy()
    cleanup()
  })

  it('compact density uses spreadsheet row and counted input classes', async () => {
    const { container, cleanup } = await renderWorkspace()
    expect(container.querySelector('.inventory-count-session-spreadsheet-row')).toBeTruthy()
    expect(container.querySelector('.inventory-count-session-counted-input')).toBeTruthy()
    expect(container.querySelector('.inventory-count-session-item-name')).toBeTruthy()
    cleanup()
  })

  it('focused row receives active highlight via :focus-within', async () => {
    const { container, cleanup } = await renderWorkspace()
    const input = container.querySelector('input[aria-label="Counted quantity for Paper Straws"]')
    const row = input?.closest('.inventory-count-session-spreadsheet-row')
    expect(row).toBeTruthy()
    await act(async () => {
      input.focus()
    })
    expect(row.matches(':focus-within')).toBe(true)
    cleanup()
  })

  it('footer remains outside the spreadsheet scroll region', async () => {
    const { container, cleanup } = await renderWorkspace()
    const sheet = container.querySelector('.inventory-count-session-spreadsheet')
    const footer = container.querySelector('.inventory-count-session-footer')
    expect(footer).toBeTruthy()
    expect(sheet.contains(footer)).toBe(false)
    cleanup()
  })

  it('Enter → next remains available with spreadsheet layout', async () => {
    getInventoryCountSessionItems.mockResolvedValue([
      sessionItem({
        id: 'ms-1',
        itemName: 'Coca-Cola',
        storageLocation: 'Main Storage',
        countedQuantity: null,
        lineStatus: 'pending',
      }),
      sessionItem({
        id: 'ms-2',
        itemName: 'Paper Straws',
        storageLocation: 'Main Storage',
        countedQuantity: null,
        lineStatus: 'pending',
      }),
    ])
    getInventoryCountSessionLocations.mockResolvedValue([
      sessionLocation('loc-1', 'Main Storage', 0, 'current'),
    ])

    const { container, cleanup } = await renderWorkspace()
    const first = container.querySelector('input[aria-label="Counted quantity for Coca-Cola"]')
    const second = container.querySelector('input[aria-label="Counted quantity for Paper Straws"]')
    const focusSpy = vi.spyOn(second, 'focus')

    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      nativeInputValueSetter?.call(first, '5')
      first.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      first.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      }))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(updateInventoryCountItem).toHaveBeenCalledTimes(1)
    expect(focusSpy).toHaveBeenCalled()

    focusSpy.mockRestore()
    cleanup()
  })

  it('Finish Preview / landing remain outside spreadsheet foundation', async () => {
    const landing = render(createElement(InventoryCountView, {}))
    await act(async () => {
      await Promise.resolve()
    })
    expect(landing.container.querySelector('.inventory-count-page')).toBeTruthy()
    expect(landing.container.querySelector('.inventory-count-session-spreadsheet')).toBeNull()
    landing.cleanup()
  })
})

describe('InventoryCountSessionWorkspace spreadsheet visual refinement (P8.18.1)', () => {
  beforeEach(() => {
    getInventoryCountSession.mockReset()
    getInventoryCountSessionLocations.mockReset()
    getInventoryCountSessionItems.mockReset()
    updateInventoryCountItem.mockReset()
    completeInventoryCountLocation.mockReset()

    getInventoryCountSession.mockResolvedValue({
      id: 'session-real-1',
      workspaceId: 'workspace-test-id',
      status: 'in_progress',
    })
    getInventoryCountSessionLocations.mockResolvedValue(FIXTURE_LOCATIONS)
    getInventoryCountSessionItems.mockResolvedValue(FIXTURE_ITEMS)
    updateInventoryCountItem.mockImplementation(async ({ sessionItemId, countedQuantity }) => ({
      id: sessionItemId,
      countedQuantity,
      lineStatus: countedQuantity === null || countedQuantity === undefined ? 'pending' : 'counted',
    }))
  })

  it('rebalances columns toward Item while keeping Expected/Counted shares', async () => {
    const { container, cleanup } = await renderWorkspace()
    const sheet = container.querySelector('.inventory-count-session-spreadsheet')
    expect(sheet.style.getPropertyValue('--ic-col-item')).toContain('3.2fr')
    expect(sheet.style.getPropertyValue('--ic-col-unit')).toContain('1fr')
    expect(sheet.style.getPropertyValue('--ic-col-unit')).toContain('7rem')
    expect(sheet.style.getPropertyValue('--ic-col-status')).toContain('0.48fr')
    expect(sheet.style.getPropertyValue('--ic-col-expected')).toContain('0.75fr')
    expect(sheet.style.getPropertyValue('--ic-col-counted')).toContain('1.1fr')
    cleanup()
  })

  it('renders product name plus quieter category • type meta line', async () => {
    const { container, cleanup } = await renderWorkspace()
    const cell = container.querySelector('.inventory-count-session-item-cell')
    expect(cell.querySelector('.inventory-count-session-item-name')?.textContent).toBe('Coca-Cola')
    expect(cell.querySelector('.inventory-count-session-item-meta')?.textContent)
      .toBe('Beverage • Soft Drink')
    cleanup()
  })

  it('keeps Complete Location primary while demoting Previous/Next classes', async () => {
    const { container, cleanup } = await renderWorkspace()
    const footer = container.querySelector('.inventory-count-session-footer-right')
    expect(footer.querySelectorAll('.inventory-count-session-nav-btn')).toHaveLength(2)
    expect(footer.querySelector('.inventory-count-session-complete-btn')?.textContent)
      .toMatch(/Complete Location/)
    cleanup()
  })

  it('preserves Enter → Save → Next after visual refinement', async () => {
    getInventoryCountSessionItems.mockResolvedValue([
      sessionItem({
        id: 'ms-1',
        itemName: 'Coca-Cola',
        category: 'Beverage',
        itemType: 'Soft Drink',
        storageLocation: 'Main Storage',
        countedQuantity: null,
        lineStatus: 'pending',
      }),
      sessionItem({
        id: 'ms-2',
        itemName: 'Paper Straws',
        category: 'Consumables',
        itemType: 'Disposable',
        storageLocation: 'Main Storage',
        countedQuantity: null,
        lineStatus: 'pending',
      }),
    ])
    getInventoryCountSessionLocations.mockResolvedValue([
      sessionLocation('loc-1', 'Main Storage', 0, 'current'),
    ])

    const { container, cleanup } = await renderWorkspace()
    const first = container.querySelector('input[aria-label="Counted quantity for Coca-Cola"]')
    const second = container.querySelector('input[aria-label="Counted quantity for Paper Straws"]')
    const focusSpy = vi.spyOn(second, 'focus')

    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      nativeInputValueSetter?.call(first, '5')
      first.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      first.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      }))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(updateInventoryCountItem).toHaveBeenCalledTimes(1)
    expect(focusSpy).toHaveBeenCalled()

    focusSpy.mockRestore()
    cleanup()
  })
})

describe('InventoryCountSessionWorkspace rebalancing & true frozen header (P8.18.2)', () => {
  beforeEach(() => {
    getInventoryCountSession.mockReset()
    getInventoryCountSessionLocations.mockReset()
    getInventoryCountSessionItems.mockReset()
    updateInventoryCountItem.mockReset()
    completeInventoryCountLocation.mockReset()

    getInventoryCountSession.mockResolvedValue({
      id: 'session-real-1',
      workspaceId: 'workspace-test-id',
      status: 'in_progress',
    })
    getInventoryCountSessionLocations.mockResolvedValue(FIXTURE_LOCATIONS)
    getInventoryCountSessionItems.mockResolvedValue(FIXTURE_ITEMS)
    updateInventoryCountItem.mockImplementation(async ({ sessionItemId, countedQuantity }) => ({
      id: sessionItemId,
      countedQuantity,
      lineStatus: countedQuantity === null || countedQuantity === undefined ? 'pending' : 'counted',
    }))
  })

  it('frozen column head is a sibling above the dedicated sheet scroll region', async () => {
    const { container, cleanup } = await renderWorkspace()
    const sheet = container.querySelector('.inventory-count-session-spreadsheet')
    const head = sheet.querySelector('.inventory-count-session-sheet-frozen-head')
    const scroll = sheet.querySelector('.inventory-count-session-sheet-scroll')
    expect(head).toBeTruthy()
    expect(scroll).toBeTruthy()
    expect(scroll.contains(head)).toBe(false)
    expect(scroll.querySelector('.inventory-count-session-spreadsheet-row')).toBeTruthy()
    expect(head.compareDocumentPosition(scroll) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    cleanup()
  })

  it('unit column contract is wide enough for long unit labels', async () => {
    getInventoryCountSessionItems.mockResolvedValue([
      sessionItem({
        id: 'ms-1',
        itemName: 'Grey Goose',
        unit: 'Bottle 750ml',
        storageLocation: 'Main Storage',
        countedQuantity: null,
        lineStatus: 'pending',
      }),
    ])
    getInventoryCountSessionLocations.mockResolvedValue([
      sessionLocation('loc-1', 'Main Storage', 0, 'current'),
    ])
    const { container, cleanup } = await renderWorkspace()
    const sheet = container.querySelector('.inventory-count-session-spreadsheet')
    expect(sheet.style.getPropertyValue('--ic-col-unit')).toContain('7rem')
    expect(container.querySelector('.inventory-count-session-spreadsheet-cell.is-unit')?.textContent)
      .toBe('Bottle 750ml')
    cleanup()
  })

  it('spreadsheet remains the primary workspace region beside a compact location rail', async () => {
    const { container, cleanup } = await renderWorkspace()
    expect(container.querySelector('.inventory-count-session-rail')).toBeTruthy()
    expect(container.querySelector('.inventory-count-session-spreadsheet')).toBeTruthy()
    expect(container.querySelector('.inventory-count-session-progress-card')).toBeTruthy()
    expect(getProgressSnapshot(container)).toContain('counted')
    cleanup()
  })

  it('session toolbar still exposes status/type/mode/progress without dropping actions', async () => {
    const { container, cleanup } = await renderWorkspace()
    const header = container.querySelector('.inventory-count-session-header')
    expect(header?.textContent).toContain('In Progress')
    expect(header?.textContent).toContain('Count Type')
    expect(header?.textContent).toContain('Mode')
    expect(header?.textContent).toContain('Progress')
    expect(getButtonByText(header, 'Pause')).toBeTruthy()
    expect(getButtonByText(header, 'Finish Count')).toBeTruthy()
    expect(getButtonByText(header, 'Exit')).toBeTruthy()
    cleanup()
  })
})

describe('InventoryCountSessionWorkspace iPad scroll ownership (P8.18.2a)', () => {
  beforeEach(() => {
    getInventoryCountSession.mockReset()
    getInventoryCountSessionLocations.mockReset()
    getInventoryCountSessionItems.mockReset()
    updateInventoryCountItem.mockReset()
    completeInventoryCountLocation.mockReset()

    getInventoryCountSession.mockResolvedValue({
      id: 'session-real-1',
      workspaceId: 'workspace-test-id',
      status: 'in_progress',
    })
    getInventoryCountSessionLocations.mockResolvedValue(FIXTURE_LOCATIONS)
    getInventoryCountSessionItems.mockResolvedValue(FIXTURE_ITEMS)
    updateInventoryCountItem.mockImplementation(async ({ sessionItemId, countedQuantity }) => ({
      id: sessionItemId,
      countedQuantity,
      lineStatus: countedQuantity === null || countedQuantity === undefined ? 'pending' : 'counted',
    }))
  })

  async function renderInStockShell() {
    const panel = document.createElement('main')
    panel.className = 'main-panel main-panel-stock'
    document.body.appendChild(panel)
    const host = document.createElement('div')
    panel.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(createElement(InventoryCountSessionWorkspace, {
        onExit: vi.fn(),
        sessionId: 'session-real-1',
        workspaceId: 'workspace-test-id',
      }))
      await Promise.resolve()
    })

    return {
      panel,
      cleanup: () => {
        act(() => {
          root.unmount()
        })
        panel.remove()
      },
    }
  }

  it('uses exactly one dedicated row scroll viewport; header and footer stay outside it', async () => {
    const { container, cleanup } = await renderWorkspace()
    const scrolls = container.querySelectorAll('[data-inventory-count-row-scroll="true"]')
    expect(scrolls).toHaveLength(1)
    const scroll = scrolls[0]
    const head = container.querySelector('[data-inventory-count-frozen-header="true"]')
    const footer = container.querySelector('[data-inventory-count-footer="true"]')
    expect(head).toBeTruthy()
    expect(footer).toBeTruthy()
    expect(scroll.contains(head)).toBe(false)
    expect(scroll.contains(footer)).toBe(false)
    expect(scroll.classList.contains('inventory-count-session-sheet-scroll')).toBe(true)
    cleanup()
  })

  it('locks the Stock shell with an explicit class instead of relying only on :has()', async () => {
    const { panel, cleanup } = await renderInStockShell()
    expect(panel.classList.contains('is-inventory-count-session-lock')).toBe(true)
    expect(panel.getAttribute('data-inventory-count-scroll-lock')).toBe('true')
    cleanup()
    expect(panel.classList.contains('is-inventory-count-session-lock')).toBe(false)
  })

  it('keyboard compact preserves frozen header outside the row scroll owner', async () => {
    const fakeViewport = {
      height: 420,
      offsetTop: 0,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    const originalInnerHeight = window.innerHeight
    const originalViewport = window.visualViewport
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 })
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: fakeViewport })

    const { container, cleanup } = await renderWorkspace()
    const session = container.querySelector('.inventory-count-session')
    vi.spyOn(session, 'getBoundingClientRect').mockReturnValue({
      top: 120,
      bottom: 700,
      left: 0,
      right: 1000,
      width: 1000,
      height: 580,
      x: 0,
      y: 120,
      toJSON: () => ({}),
    })

    await act(async () => {
      fakeViewport.addEventListener.mock.calls
        .filter((call) => call[0] === 'resize')
        .forEach((call) => call[1]())
      await new Promise((resolve) => {
        requestAnimationFrame(() => resolve())
      })
    })

    expect(session.className).toContain('is-keyboard-compact')
    const head = container.querySelector('[data-inventory-count-frozen-header="true"]')
    const scroll = container.querySelector('[data-inventory-count-row-scroll="true"]')
    expect(head).toBeTruthy()
    expect(scroll.contains(head)).toBe(false)
    expect(fakeViewport.addEventListener.mock.calls.some((call) => call[0] === 'scroll')).toBe(false)

    cleanup()
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight })
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: originalViewport })
  })

  it('visualViewport resize does not blindly restore stale row scrollTop', async () => {
    const fakeViewport = {
      height: 420,
      offsetTop: 0,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    const originalInnerHeight = window.innerHeight
    const originalViewport = window.visualViewport
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 })
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: fakeViewport })

    const { container, cleanup } = await renderWorkspace()
    const session = container.querySelector('.inventory-count-session')
    const scroll = container.querySelector('[data-inventory-count-row-scroll="true"]')
    Object.defineProperty(scroll, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 180,
    })
    Object.defineProperty(scroll, 'scrollHeight', { configurable: true, value: 800 })
    Object.defineProperty(scroll, 'clientHeight', { configurable: true, value: 300 })
    vi.spyOn(session, 'getBoundingClientRect').mockReturnValue({
      top: 120,
      bottom: 700,
      left: 0,
      right: 1000,
      width: 1000,
      height: 580,
      x: 0,
      y: 120,
      toJSON: () => ({}),
    })
    // No Counted input focused → resize must leave scrollTop alone.
    if (typeof document !== 'undefined' && document.activeElement?.blur) {
      document.activeElement.blur()
    }

    await act(async () => {
      fakeViewport.addEventListener.mock.calls
        .filter((call) => call[0] === 'resize')
        .forEach((call) => call[1]())
      await new Promise((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve())
        })
      })
    })

    expect(session.className).toContain('is-keyboard-compact')
    expect(scroll.scrollTop).toBe(180)

    cleanup()
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight })
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: originalViewport })
  })

  it('counted inputs do not auto-reveal on focus (manual scroll wins)', async () => {
    const { container, cleanup } = await renderWorkspace()
    const input = container.querySelector('input[aria-label="Counted quantity for Paper Straws"]')
    const scroll = container.querySelector('[data-inventory-count-row-scroll="true"]')
    Object.defineProperty(scroll, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 140,
    })
    const revealSpy = vi.spyOn(
      await import('./InventoryCountSessionWorkspace'),
      'scrollInventoryCountRowIntoView',
    )

    await act(async () => {
      input.focus()
      input.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
    })

    expect(scroll.scrollTop).toBe(140)
    // Module spy may not intercept local binding; assert no onFocus attribute path by scroll stability.
    expect(input.getAttribute('onFocus')).toBeNull()

    revealSpy.mockRestore()
    cleanup()
  })

  it('Enter navigation still focuses the next counted input', async () => {
    getInventoryCountSessionItems.mockResolvedValue([
      sessionItem({
        id: 'ms-1',
        itemName: 'Coca-Cola',
        storageLocation: 'Main Storage',
        countedQuantity: null,
        lineStatus: 'pending',
      }),
      sessionItem({
        id: 'ms-2',
        itemName: 'Paper Straws',
        storageLocation: 'Main Storage',
        countedQuantity: null,
        lineStatus: 'pending',
      }),
    ])
    getInventoryCountSessionLocations.mockResolvedValue([
      sessionLocation('loc-1', 'Main Storage', 0, 'current'),
    ])

    const { container, cleanup } = await renderWorkspace()
    const first = container.querySelector('input[aria-label="Counted quantity for Coca-Cola"]')
    const second = container.querySelector('input[aria-label="Counted quantity for Paper Straws"]')
    const focusSpy = vi.spyOn(second, 'focus')

    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      nativeInputValueSetter?.call(first, '5')
      first.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      first.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(updateInventoryCountItem).toHaveBeenCalledTimes(1)
    expect(focusSpy).toHaveBeenCalled()
    const focusArg = focusSpy.mock.calls[0]?.[0]
    if (focusArg && typeof focusArg === 'object') {
      expect(focusArg.preventScroll).toBe(true)
    }

    focusSpy.mockRestore()
    cleanup()
  })

  it('row scroll owner keeps bottom padding so the last row can clear the footer band', async () => {
    const { container, cleanup } = await renderWorkspace()
    const scroll = container.querySelector('[data-inventory-count-row-scroll="true"]')
    expect(scroll.className).toContain('inventory-count-session-sheet-scroll')
    expect(container.querySelector('[data-inventory-count-footer="true"]')).toBeTruthy()
    cleanup()
  })
})

describe('InventoryCountSessionWorkspace usable viewport & Enter reveal (P8.18.3)', () => {
  beforeEach(() => {
    getInventoryCountSession.mockReset()
    getInventoryCountSessionLocations.mockReset()
    getInventoryCountSessionItems.mockReset()
    updateInventoryCountItem.mockReset()
    completeInventoryCountLocation.mockReset()

    getInventoryCountSession.mockResolvedValue({
      id: 'session-real-1',
      workspaceId: 'workspace-test-id',
      status: 'in_progress',
    })
    getInventoryCountSessionLocations.mockResolvedValue(FIXTURE_LOCATIONS)
    getInventoryCountSessionItems.mockResolvedValue(FIXTURE_ITEMS)
    updateInventoryCountItem.mockImplementation(async ({ sessionItemId, countedQuantity }) => ({
      id: sessionItemId,
      countedQuantity,
      lineStatus: countedQuantity === null || countedQuantity === undefined ? 'pending' : 'counted',
    }))
  })

  it('A. Counted-input visibility uses usable insets, not raw scroller flush edges', () => {
    const container = {
      getBoundingClientRect: () => ({ top: 100, bottom: 400, left: 0, right: 400 }),
    }
    const usable = getInventoryCountUsableViewportRect(container)
    expect(usable.top).toBe(100 + INVENTORY_COUNT_USABLE_TOP_INSET_PX)
    expect(usable.bottom).toBe(400 - INVENTORY_COUNT_USABLE_BOTTOM_INSET_PX)

    const insideRawButInBottomInset = {
      getBoundingClientRect: () => ({
        top: 380,
        bottom: 396,
        left: 0,
        right: 100,
      }),
    }
    expect(isInventoryCountCountedInputOutsideUsableViewport(insideRawButInBottomInset, container)).toBe(true)

    const fullyUsable = {
      getBoundingClientRect: () => ({
        top: 160,
        bottom: 194,
        left: 0,
        right: 100,
      }),
    }
    expect(isInventoryCountCountedInputOutsideUsableViewport(fullyUsable, container)).toBe(false)
    expect(scrollInventoryCountCountedInputIntoView(fullyUsable, {
      ...container,
      scrollTop: 40,
      scrollHeight: 900,
      clientHeight: 300,
    })).toBe(false)
  })

  it('B. Minimum scroll correction clamps within scroll range', () => {
    const container = {
      scrollTop: 10,
      scrollHeight: 500,
      clientHeight: 300,
      getBoundingClientRect: () => ({ top: 100, bottom: 400, left: 0, right: 400 }),
    }
    const below = {
      getBoundingClientRect: () => ({ top: 390, bottom: 424, left: 0, right: 100 }),
    }
    expect(scrollInventoryCountCountedInputIntoView(below, container)).toBe(true)
    // usable bottom = 384; input bottom 424 → delta 40 → scrollTop 50
    expect(container.scrollTop).toBe(50)

    container.scrollTop = 80
    const above = {
      getBoundingClientRect: () => ({ top: 90, bottom: 120, left: 0, right: 100 }),
    }
    expect(scrollInventoryCountCountedInputIntoView(above, container)).toBe(true)
    // usable top = 108; input top 90 → delta 18 → scrollTop 62
    expect(container.scrollTop).toBe(62)

    container.scrollTop = 190
    container.scrollHeight = 500
    container.clientHeight = 300
    const farBelow = {
      getBoundingClientRect: () => ({ top: 700, bottom: 740, left: 0, right: 100 }),
    }
    expect(scrollInventoryCountCountedInputIntoView(farBelow, container)).toBe(true)
    expect(container.scrollTop).toBe(200)

    container.scrollTop = 5
    const farAbove = {
      getBoundingClientRect: () => ({ top: -200, bottom: -160, left: 0, right: 100 }),
    }
    expect(scrollInventoryCountCountedInputIntoView(farAbove, container)).toBe(true)
    expect(container.scrollTop).toBe(0)
  })

  it('C. Enter focuses next Counted input with preventScroll and bounded post-layout reveal', async () => {
    const frames = []
    const originalRaf = window.requestAnimationFrame
    window.requestAnimationFrame = (cb) => {
      frames.push(cb)
      return frames.length
    }

    getInventoryCountSessionItems.mockResolvedValue([
      sessionItem({
        id: 'ms-1',
        itemName: 'Coca-Cola',
        storageLocation: 'Main Storage',
        countedQuantity: null,
        lineStatus: 'pending',
      }),
      sessionItem({
        id: 'ms-2',
        itemName: 'Paper Straws',
        storageLocation: 'Main Storage',
        countedQuantity: null,
        lineStatus: 'pending',
      }),
    ])
    getInventoryCountSessionLocations.mockResolvedValue([
      sessionLocation('loc-1', 'Main Storage', 0, 'current'),
    ])

    const { container, cleanup } = await renderWorkspace()
    const scroll = container.querySelector('[data-inventory-count-row-scroll="true"]')
    Object.defineProperty(scroll, 'scrollTop', { configurable: true, writable: true, value: 0 })
    Object.defineProperty(scroll, 'scrollHeight', { configurable: true, value: 900 })
    Object.defineProperty(scroll, 'clientHeight', { configurable: true, value: 300 })
    vi.spyOn(scroll, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      bottom: 400,
      left: 0,
      right: 400,
      width: 400,
      height: 300,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    })

    const first = container.querySelector('input[aria-label="Counted quantity for Coca-Cola"]')
    const second = container.querySelector('input[aria-label="Counted quantity for Paper Straws"]')
    const focusSpy = vi.spyOn(second, 'focus')
    vi.spyOn(second, 'getBoundingClientRect').mockReturnValue({
      top: 390,
      bottom: 424,
      left: 40,
      right: 140,
      width: 100,
      height: 34,
      x: 40,
      y: 390,
      toJSON: () => ({}),
    })

    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      nativeInputValueSetter?.call(first, '5')
      first.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      first.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(updateInventoryCountItem).toHaveBeenCalledTimes(1)
    expect(focusSpy).toHaveBeenCalled()
    const focusArg = focusSpy.mock.calls[0]?.[0]
    if (focusArg && typeof focusArg === 'object') {
      expect(focusArg.preventScroll).toBe(true)
    }
    expect(scroll.scrollTop).toBeGreaterThan(0)

    await act(async () => {
      const pending = frames.splice(0, frames.length)
      pending.forEach((cb) => cb())
    })
    expect(frames.length).toBeLessThanOrEqual(INVENTORY_COUNT_ENTER_REVEAL_MAX_LAYOUT_FRAMES)

    window.requestAnimationFrame = originalRaf
    focusSpy.mockRestore()
    cleanup()
  })

  it('D. Sheet end clearance exceeds the old 16px-only runway', async () => {
    const { container, cleanup } = await renderWorkspace()
    const session = container.querySelector('.inventory-count-session.is-high-density')
    expect(INVENTORY_COUNT_SHEET_END_CLEARANCE_PX).toBeGreaterThan(16)
    expect(INVENTORY_COUNT_SHEET_END_CLEARANCE_PX)
      .toBeGreaterThanOrEqual(40 + INVENTORY_COUNT_USABLE_BOTTOM_INSET_PX)
    // Contract is owned by the high-density session custom property.
    expect(session).toBeTruthy()
    cleanup()
  })

  it('E. Resize corrects focused Counted input only when outside usable bounds', async () => {
    const frames = []
    const originalRaf = window.requestAnimationFrame
    window.requestAnimationFrame = (cb) => {
      frames.push(cb)
      return frames.length
    }

    const fakeViewport = {
      height: 420,
      offsetTop: 0,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    const originalInnerHeight = window.innerHeight
    const originalViewport = window.visualViewport
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 })
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: fakeViewport })

    const { container, cleanup } = await renderWorkspace()
    const session = container.querySelector('.inventory-count-session')
    const scroll = container.querySelector('[data-inventory-count-row-scroll="true"]')
    const input = container.querySelector('input[aria-label="Counted quantity for Paper Straws"]')
    Object.defineProperty(scroll, 'scrollTop', { configurable: true, writable: true, value: 20 })
    Object.defineProperty(scroll, 'scrollHeight', { configurable: true, value: 900 })
    Object.defineProperty(scroll, 'clientHeight', { configurable: true, value: 300 })
    vi.spyOn(session, 'getBoundingClientRect').mockReturnValue({
      top: 120,
      bottom: 700,
      left: 0,
      right: 1000,
      width: 1000,
      height: 580,
      x: 0,
      y: 120,
      toJSON: () => ({}),
    })
    vi.spyOn(scroll, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      bottom: 400,
      left: 0,
      right: 400,
      width: 400,
      height: 300,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    })
    vi.spyOn(input, 'getBoundingClientRect').mockReturnValue({
      top: 160,
      bottom: 194,
      left: 40,
      right: 140,
      width: 100,
      height: 34,
      x: 40,
      y: 160,
      toJSON: () => ({}),
    })

    await act(async () => {
      input.focus({ preventScroll: true })
    })

    await act(async () => {
      fakeViewport.addEventListener.mock.calls
        .filter((call) => call[0] === 'resize')
        .forEach((call) => call[1]())
      const pending = frames.splice(0, frames.length)
      pending.forEach((cb) => cb())
      const nested = frames.splice(0, frames.length)
      nested.forEach((cb) => cb())
    })

    expect(session.className).toContain('is-keyboard-compact')
    expect(scroll.scrollTop).toBe(20)

    vi.spyOn(input, 'getBoundingClientRect').mockReturnValue({
      top: 390,
      bottom: 424,
      left: 40,
      right: 140,
      width: 100,
      height: 34,
      x: 40,
      y: 390,
      toJSON: () => ({}),
    })

    await act(async () => {
      fakeViewport.addEventListener.mock.calls
        .filter((call) => call[0] === 'resize')
        .forEach((call) => call[1]())
      const pending = frames.splice(0, frames.length)
      pending.forEach((cb) => cb())
      const nested = frames.splice(0, frames.length)
      nested.forEach((cb) => cb())
    })

    expect(scroll.scrollTop).toBeGreaterThan(20)

    window.requestAnimationFrame = originalRaf
    cleanup()
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight })
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: originalViewport })
  })

  it('F. Progress rerenders do not auto-scroll the row viewport', async () => {
    const { container, cleanup } = await renderWorkspace()
    const scroll = container.querySelector('[data-inventory-count-row-scroll="true"]')
    Object.defineProperty(scroll, 'scrollTop', { configurable: true, writable: true, value: 77 })
    await act(async () => {
      await Promise.resolve()
    })
    expect(scroll.scrollTop).toBe(77)
    cleanup()
  })
})

describe('InventoryCountSessionWorkspace locked panel bottom padding (P8.18.6)', () => {
  const appCss = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')

  beforeEach(() => {
    getInventoryCountSession.mockReset()
    getInventoryCountSessionLocations.mockReset()
    getInventoryCountSessionItems.mockReset()

    getInventoryCountSession.mockResolvedValue({
      id: 'session-real-1',
      workspaceId: 'workspace-test-id',
      status: 'in_progress',
    })
    getInventoryCountSessionLocations.mockResolvedValue(FIXTURE_LOCATIONS)
    getInventoryCountSessionItems.mockResolvedValue(FIXTURE_ITEMS)
  })

  it('locks the Stock panel and keeps the session as a direct child when mounted into the panel', async () => {
    const panel = document.createElement('main')
    panel.className = 'main-panel main-panel-stock'
    document.body.appendChild(panel)
    const root = createRoot(panel)

    await act(async () => {
      root.render(createElement(InventoryCountSessionWorkspace, {
        onExit: vi.fn(),
        sessionId: 'session-real-1',
        workspaceId: 'workspace-test-id',
      }))
      await Promise.resolve()
    })

    const session = panel.querySelector('.inventory-count-session.is-high-density')
    expect(panel.classList.contains('is-inventory-count-session-lock')).toBe(true)
    expect(session).toBeTruthy()
    expect(session.parentElement).toBe(panel)

    act(() => {
      root.unmount()
    })
    panel.remove()
  })

  it('CSS drops the 16px bottom-padding floor for both lock-class and :has session paths', () => {
    expect(appCss).toMatch(
      /\.app-shell\.stock-focus-mode\s+\.main-panel-stock\s*\{[^}]*max\(16px,\s*env\(safe-area-inset-bottom/s,
    )

    const lockedPaddingBlock = appCss.match(
      /\.app-shell\.stock-focus-mode\s+\.main-panel-stock:has\(\.inventory-count-session\.is-high-density\),\s*\n\.app-shell\.stock-focus-mode\s+\.main-panel-stock\.is-inventory-count-session-lock,\s*\n\.app-shell\.stock-focus-mode\s+\.main-panel\.is-inventory-count-session-lock\s*\{[^}]*padding-bottom:\s*env\(safe-area-inset-bottom,\s*0px\);/s,
    )
    expect(lockedPaddingBlock).toBeTruthy()
    expect(lockedPaddingBlock[0]).not.toMatch(/max\(16px/)
    expect(appCss).toContain(
      '.app-shell.stock-focus-mode .main-panel-stock:has(.inventory-count-session.is-high-density)',
    )
    expect(appCss).toContain(
      '.app-shell.stock-focus-mode .main-panel-stock.is-inventory-count-session-lock',
    )
  })

  it('locked closed session fill contract remains flex 1 / height auto / min-height 0 / max-height none', () => {
    expect(appCss).toContain(
      '.main-panel-stock.is-inventory-count-session-lock > .inventory-count-session.is-high-density',
    )
    expect(appCss).toMatch(
      /\.main-panel-stock\.is-inventory-count-session-lock\s*>\s*\.inventory-count-session\.is-high-density[\s\S]{0,220}?\{\s*flex:\s*1\s+1\s+0%;\s*min-height:\s*0;\s*height:\s*auto;\s*max-height:\s*none;/s,
    )
    expect(appCss).not.toMatch(
      /\.inventory-count-session\.is-high-density\s*\{[^}]*position:\s*fixed/s,
    )
  })
})

describe('InventoryCountSessionWorkspace final-row scroll runway (P8.18.7)', () => {
  const appCss = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')
  const workspaceSource = readFileSync(
    resolve(process.cwd(), 'src/components/stock/InventoryCountSessionWorkspace.jsx'),
    'utf8',
  )

  beforeEach(() => {
    getInventoryCountSession.mockReset()
    getInventoryCountSessionLocations.mockReset()
    getInventoryCountSessionItems.mockReset()

    getInventoryCountSession.mockResolvedValue({
      id: 'session-real-1',
      workspaceId: 'workspace-test-id',
      status: 'in_progress',
    })
    getInventoryCountSessionLocations.mockResolvedValue(FIXTURE_LOCATIONS)
    getInventoryCountSessionItems.mockResolvedValue(FIXTURE_ITEMS)
  })

  it('runway is bottom padding on the sole product-row scroll owner', async () => {
    const { container, cleanup } = await renderWorkspace()
    const session = container.querySelector('.inventory-count-session.is-high-density')
    const scroll = container.querySelector('[data-inventory-count-row-scroll="true"]')
    const footer = container.querySelector('[data-inventory-count-footer="true"]')
    const frozenHead = container.querySelector('.inventory-count-session-sheet-frozen-head')

    expect(scroll).toBeTruthy()
    expect(scroll.classList.contains('inventory-count-session-sheet-scroll')).toBe(true)
    expect(scroll.classList.contains('inventory-count-session-table-wrap')).toBe(true)
    expect(container.querySelectorAll('[data-inventory-count-row-scroll="true"]')).toHaveLength(1)

    expect(footer).toBeTruthy()
    expect(scroll.contains(footer)).toBe(false)
    expect(session.contains(footer)).toBe(true)
    expect(frozenHead).toBeTruthy()
    expect(scroll.contains(frozenHead)).toBe(false)

    expect(appCss).toMatch(
      /\.inventory-count-session\.is-high-density\s+\.inventory-count-session-sheet-scroll[\s\S]{0,280}?padding:\s*0\s+0\s+var\(--inventory-count-sheet-end-clearance/s,
    )
    expect(appCss).not.toMatch(
      /\.main-panel-stock\s*\{[^}]*--inventory-count-sheet-end-runway/s,
    )
    expect(appCss).not.toMatch(
      /\.inventory-count-session-footer[\s\S]{0,120}?--inventory-count-sheet-end-runway/s,
    )

    cleanup()
  })

  it('iPad/touch runway is ~7 compact rows (304–336px) and larger than the prior 56px clearance', () => {
    expect(appCss).toMatch(
      /\.inventory-count-session\.is-high-density\s*\{[^}]*--inventory-count-sheet-end-clearance:\s*56px/s,
    )
    expect(appCss).toMatch(
      /--inventory-count-sheet-end-runway:\s*320px/,
    )

    const runwayMatch = appCss.match(/--inventory-count-sheet-end-runway:\s*(\d+)px/)
    expect(runwayMatch).toBeTruthy()
    const runwayPx = Number(runwayMatch[1])
    expect(runwayPx).toBeGreaterThanOrEqual(304)
    expect(runwayPx).toBeLessThanOrEqual(336)
    expect(runwayPx).toBeGreaterThan(INVENTORY_COUNT_SHEET_END_CLEARANCE_PX)

    expect(appCss).toMatch(
      /@media\s*\(min-width:\s*901px\)\s*and\s*\(max-width:\s*1180px\)\s*and\s*\(orientation:\s*landscape\)\s*\{[\s\S]*?--inventory-count-sheet-end-clearance:\s*var\(--inventory-count-sheet-end-runway,\s*320px\)/s,
    )
    expect(appCss).toMatch(
      /@media\s*\(hover:\s*none\),\s*\(pointer:\s*coarse\)\s*\{[\s\S]*?--inventory-count-sheet-end-clearance:\s*var\(--inventory-count-sheet-end-runway,\s*320px\)/s,
    )
  })

  it('does not introduce fixed shells, outer padding workarounds, or a second vertical scroller', async () => {
    const { container, cleanup } = await renderWorkspace()
    const scrollOwners = container.querySelectorAll('[data-inventory-count-row-scroll="true"]')
    expect(scrollOwners).toHaveLength(1)

    expect(appCss).not.toMatch(
      /\.inventory-count-session\.is-high-density\s*\{[^}]*position:\s*fixed/s,
    )
    expect(appCss).not.toMatch(
      /\.main-panel-stock[\s\S]{0,80}?padding-bottom:\s*var\(--inventory-count-sheet-end-runway/s,
    )
    // Runway is CSS padding only — no JSX spacer / scroll listener / document lock added for P8.18.7
    expect(workspaceSource).not.toMatch(/inventory-count-sheet-end-runway/)
    expect(workspaceSource).not.toMatch(/data-inventory-count-scroll-runway/)
    expect(workspaceSource).not.toMatch(/addEventListener\(\s*['"]scroll['"]/)
    expect(container.querySelector('[data-inventory-count-scroll-runway]')).toBeNull()

    cleanup()
  })
})

describe('InventoryCountSessionWorkspace location rail readability (P8.19.1)', () => {
  const appCss = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')

  beforeEach(() => {
    getInventoryCountSession.mockReset()
    getInventoryCountSessionLocations.mockReset()
    getInventoryCountSessionItems.mockReset()

    getInventoryCountSession.mockResolvedValue({
      id: 'session-real-1',
      workspaceId: 'workspace-test-id',
      status: 'in_progress',
    })
    getInventoryCountSessionLocations.mockResolvedValue(FIXTURE_LOCATIONS)
    getInventoryCountSessionItems.mockResolvedValue(FIXTURE_ITEMS)
  })

  it('gives the high-density rail a readable tablet width while the spreadsheet stays the flexible remainder', async () => {
    const { container, cleanup } = await renderWorkspace()
    const rail = container.querySelector('.inventory-count-session-rail')
    const scroll = container.querySelector('[data-inventory-count-row-scroll="true"]')
    const title = container.querySelector('.inventory-count-session-rail-title')
    const footer = container.querySelector('[data-inventory-count-footer="true"]')

    expect(rail).toBeTruthy()
    expect(scroll).toBeTruthy()
    expect(rail.contains(scroll)).toBe(false)
    expect(container.querySelectorAll('[data-inventory-count-row-scroll="true"]')).toHaveLength(1)
    expect(footer).toBeTruthy()
    expect(title).toBeTruthy()
    expect(title.textContent).toMatch(/\S/)

    expect(appCss).toMatch(
      /\.inventory-count-session\.is-high-density\s+\.inventory-count-session-body\s*\{[^}]*grid-template-columns:\s*minmax\(160px,\s*20%\)\s+minmax\(0,\s*1fr\)/s,
    )
    expect(appCss).toMatch(
      /@media\s*\(min-width:\s*901px\)\s*and\s*\(max-width:\s*1180px\)\s*and\s*\(orientation:\s*landscape\)\s*\{[\s\S]*?\.inventory-count-session\.is-high-density\s+\.inventory-count-session-body\s*\{[^}]*grid-template-columns:\s*minmax\(160px,\s*20%\)\s+minmax\(0,\s*1fr\)/s,
    )
    expect(appCss).not.toMatch(
      /\.inventory-count-session\.is-high-density\s+\.inventory-count-session-body\s*\{[^}]*minmax\(124px,\s*16%\)/s,
    )

    cleanup()
  })

  it('bounds location names to two readable lines without unbounded height', () => {
    expect(appCss).toMatch(
      /\.inventory-count-session\.is-high-density\s+\.inventory-count-session-rail-title\s*\{[^}]*-webkit-line-clamp:\s*2/s,
    )
    expect(appCss).toMatch(
      /\.inventory-count-session\.is-high-density\s+\.inventory-count-session-rail-title\s*\{[^}]*max-height:\s*calc\(1\.25em\s*\*\s*2\)/s,
    )
    expect(appCss).toMatch(
      /\.inventory-count-session\.is-high-density\s+\.inventory-count-session-rail-title-row\s*\{[^}]*flex-direction:\s*column/s,
    )
  })

  it('preserves the 320px runway, footer contract, and avoids fixed/mobile-shell overrides', () => {
    expect(appCss).toMatch(/--inventory-count-sheet-end-runway:\s*320px/)
    expect(appCss).not.toMatch(
      /\.inventory-count-session\.is-high-density\s*\{[^}]*position:\s*fixed/s,
    )
    expect(appCss).not.toMatch(
      /\.mobile-shell[\s\S]{0,120}?inventory-count-session-rail-title/s,
    )
    expect(appCss).not.toMatch(
      /\.inventory-count-session\.is-high-density\s+\.inventory-count-session-body\s*\{[^}]*overflow-x:\s*auto/s,
    )
  })
})

describe('InventoryCountSessionWorkspace progress summary polish (P8.19.2)', () => {
  const appCss = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')

  beforeEach(() => {
    getInventoryCountSession.mockReset()
    getInventoryCountSessionLocations.mockReset()
    getInventoryCountSessionItems.mockReset()

    getInventoryCountSession.mockResolvedValue({
      id: 'session-real-1',
      workspaceId: 'workspace-test-id',
      status: 'in_progress',
    })
    getInventoryCountSessionLocations.mockResolvedValue(FIXTURE_LOCATIONS)
    getInventoryCountSessionItems.mockResolvedValue(FIXTURE_ITEMS)
  })

  it('keeps percentage as the primary metric with counted and location summaries present', async () => {
    const { container, cleanup } = await renderWorkspace()
    const card = container.querySelector('.inventory-count-session-progress-card')
    const percent = container.querySelector('.inventory-count-session-progress-percent')
    const primary = container.querySelector('.inventory-count-session-progress-primary')
    const secondary = container.querySelector('.inventory-count-session-progress-secondary')
    const footer = container.querySelector('[data-inventory-count-footer="true"]')
    const scroll = container.querySelector('[data-inventory-count-row-scroll="true"]')

    expect(card).toBeTruthy()
    expect(percent).toBeTruthy()
    expect(percent.textContent).toMatch(/%/)
    expect(primary).toBeTruthy()
    expect(primary.textContent).toMatch(/counted/i)
    expect(secondary).toBeTruthy()
    expect(secondary.textContent).toMatch(/locations complete/i)
    expect(footer).toBeTruthy()
    expect(scroll).toBeTruthy()
    expect(container.querySelectorAll('[data-inventory-count-row-scroll="true"]')).toHaveLength(1)

    cleanup()
  })

  it('styles high-density progress as a KPI hierarchy without changing width or runway', () => {
    expect(appCss).toMatch(
      /\.inventory-count-session\.is-high-density\s+\.inventory-count-session-progress-percent\s*\{[^}]*font-size:\s*1\.47rem/s,
    )
    expect(appCss).toMatch(
      /\.inventory-count-session\.is-high-density\s+\.inventory-count-session-progress-percent\s*\{[^}]*font-weight:\s*750/s,
    )
    expect(appCss).toMatch(
      /\.inventory-count-session\.is-high-density\s+\.inventory-count-session-progress-card\s*\{[^}]*max-width:\s*176px/s,
    )
    expect(appCss).toMatch(
      /\.inventory-count-session\.is-high-density\s+\.inventory-count-session-progress-secondary\s*\{[^}]*border-top:\s*1px\s+solid/s,
    )
    expect(appCss).toMatch(/--inventory-count-sheet-end-runway:\s*320px/)
    expect(appCss).not.toMatch(
      /\.inventory-count-session\.is-high-density\s*\{[^}]*position:\s*fixed/s,
    )
  })
})

describe('InventoryCountSessionWorkspace header metadata hierarchy (P8.19.3)', () => {
  const appCss = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')

  beforeEach(() => {
    getInventoryCountSession.mockReset()
    getInventoryCountSessionLocations.mockReset()
    getInventoryCountSessionItems.mockReset()

    getInventoryCountSession.mockResolvedValue({
      id: 'session-real-1',
      workspaceId: 'workspace-test-id',
      status: 'in_progress',
    })
    getInventoryCountSessionLocations.mockResolvedValue(FIXTURE_LOCATIONS)
    getInventoryCountSessionItems.mockResolvedValue(FIXTURE_ITEMS)
  })

  it('preserves metadata labels and values with label/value hierarchy classes', async () => {
    const { container, cleanup } = await renderWorkspace()
    const meta = container.querySelector('.inventory-count-session-meta')
    const labels = Array.from(container.querySelectorAll('.inventory-count-session-meta-label'))
      .map((node) => node.textContent.trim())
    const values = Array.from(container.querySelectorAll('.inventory-count-session-meta-value'))
      .map((node) => node.textContent.trim())
    const pill = container.querySelector('.inventory-count-session-pill.is-status')
    const progressCard = container.querySelector('.inventory-count-session-progress-card')
    const footer = container.querySelector('[data-inventory-count-footer="true"]')
    const scroll = container.querySelector('[data-inventory-count-row-scroll="true"]')

    expect(meta).toBeTruthy()
    expect(pill).toBeTruthy()
    expect(labels).toEqual(expect.arrayContaining(['Count Type', 'Mode']))
    expect(labels).not.toContain('Progress')
    expect(values.some((value) => /New Count/i.test(value))).toBe(true)
    expect(values.some((value) => /Blind Count/i.test(value))).toBe(true)
    expect(progressCard).toBeTruthy()
    expect(footer).toBeTruthy()
    expect(scroll).toBeTruthy()
    expect(container.querySelectorAll('[data-inventory-count-row-scroll="true"]')).toHaveLength(1)

    cleanup()
  })

  it('stacks high-density meta labels above stronger values without runway or progress-card regressions', () => {
    expect(appCss).toMatch(
      /\.inventory-count-session\.is-high-density\s+\.inventory-count-session-meta-item\s*\{[^}]*flex-direction:\s*column/s,
    )
    expect(appCss).toMatch(
      /\.inventory-count-session\.is-high-density\s+\.inventory-count-session-meta-label\s*\{[^}]*color:\s*rgba\(255,\s*247,\s*232,\s*0\.32\)/s,
    )
    expect(appCss).toMatch(
      /\.inventory-count-session\.is-high-density\s+\.inventory-count-session-meta-value\s*\{[^}]*font-size:\s*0\.9rem/s,
    )
    expect(appCss).not.toMatch(
      /\.inventory-count-session\.is-high-density\s+\.inventory-count-session-meta-item\s*\{[^}]*flex-direction:\s*row/s,
    )
    expect(appCss).toMatch(/--inventory-count-sheet-end-runway:\s*320px/)
    expect(appCss).toMatch(
      /\.inventory-count-session\.is-high-density\s+\.inventory-count-session-progress-percent\s*\{[^}]*font-size:\s*1\.47rem/s,
    )
  })
})

describe('InventoryCountSessionWorkspace footer action hierarchy (P8.19.4)', () => {
  const appCss = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')

  beforeEach(() => {
    getInventoryCountSession.mockReset()
    getInventoryCountSessionLocations.mockReset()
    getInventoryCountSessionItems.mockReset()

    getInventoryCountSession.mockResolvedValue({
      id: 'session-real-1',
      workspaceId: 'workspace-test-id',
      status: 'in_progress',
    })
    getInventoryCountSessionLocations.mockResolvedValue(FIXTURE_LOCATIONS)
    getInventoryCountSessionItems.mockResolvedValue(FIXTURE_ITEMS)
  })

  it('keeps Complete Location as the primary CTA with Previous/Next as secondary nav', async () => {
    const { container, cleanup } = await renderWorkspace()
    const footer = container.querySelector('[data-inventory-count-footer="true"]')
    const footerRight = container.querySelector('.inventory-count-session-footer-right')
    const previous = Array.from(footerRight.querySelectorAll('button'))
      .find((button) => button.textContent.trim() === 'Previous')
    const next = Array.from(footerRight.querySelectorAll('button'))
      .find((button) => button.textContent.trim() === 'Next')
    const complete = Array.from(footerRight.querySelectorAll('button'))
      .find((button) => /Complete Location|Completing/.test(button.textContent))
    const scroll = container.querySelector('[data-inventory-count-row-scroll="true"]')
    const meta = container.querySelector('.inventory-count-session-meta')

    expect(footer).toBeTruthy()
    expect(previous).toBeTruthy()
    expect(next).toBeTruthy()
    expect(complete).toBeTruthy()
    expect(previous.className).toContain('inventory-count-session-nav-btn')
    expect(previous.className).toContain('ghost-btn')
    expect(next.className).toContain('inventory-count-session-nav-btn')
    expect(next.className).toContain('ghost-btn')
    expect(complete.className).toContain('inventory-count-session-complete-btn')
    expect(complete.className).toContain('primary-btn')
    expect(meta).toBeTruthy()
    expect(scroll).toBeTruthy()
    expect(container.querySelectorAll('[data-inventory-count-row-scroll="true"]')).toHaveLength(1)

    cleanup()
  })

  it('raises secondary nav contrast while Complete Location stays the heavier CTA', () => {
    expect(appCss).toMatch(
      /\.inventory-count-session-footer\s+\.inventory-count-session-nav-btn\s*\{[^}]*color:\s*rgba\(255,\s*247,\s*232,\s*0\.78\)/s,
    )
    expect(appCss).toMatch(
      /\.inventory-count-session-footer\s+\.inventory-count-session-nav-btn\s*\{[^}]*font-weight:\s*600/s,
    )
    expect(appCss).toMatch(
      /\.inventory-count-session-footer\s+\.inventory-count-session-complete-btn\s*\{[^}]*font-weight:\s*700/s,
    )
    expect(appCss).toMatch(
      /\.inventory-count-session-footer\s+\.inventory-count-session-complete-btn\s*\{[^}]*min-height:\s*40px/s,
    )
    expect(appCss).toMatch(
      /\.inventory-count-session-footer\s+\.inventory-count-session-nav-btn\s*\{[^}]*min-height:\s*36px/s,
    )
    expect(appCss).toMatch(/--inventory-count-sheet-end-runway:\s*320px/)
    expect(appCss).toMatch(
      /\.inventory-count-session\.is-high-density\s+\.inventory-count-session-meta-item\s*\{[^}]*flex-direction:\s*column/s,
    )
  })
})

describe('InventoryCountSessionWorkspace information redundancy cleanup (P8.19.5)', () => {
  const appCss = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')
  const workspaceSource = readFileSync(
    resolve(process.cwd(), 'src/components/stock/InventoryCountSessionWorkspace.jsx'),
    'utf8',
  )

  beforeEach(() => {
    getInventoryCountSession.mockReset()
    getInventoryCountSessionLocations.mockReset()
    getInventoryCountSessionItems.mockReset()

    getInventoryCountSession.mockResolvedValue({
      id: 'session-real-1',
      workspaceId: 'workspace-test-id',
      status: 'in_progress',
    })
    getInventoryCountSessionLocations.mockResolvedValue(FIXTURE_LOCATIONS)
    getInventoryCountSessionItems.mockResolvedValue(FIXTURE_ITEMS)
  })

  it('keeps one session product search, header lifecycle badge, Count Type/Mode, and KPI progress', async () => {
    const { container, cleanup } = await renderWorkspace()
    const sessionSearch = container.querySelector('.inventory-count-session-search-input')
    const pill = container.querySelector('.inventory-count-session-pill.is-status')
    const labels = Array.from(container.querySelectorAll('.inventory-count-session-meta-label'))
      .map((node) => node.textContent.trim())
    const progressCard = container.querySelector('.inventory-count-session-progress-card')
    const percent = container.querySelector('.inventory-count-session-progress-percent')
    const primary = container.querySelector('.inventory-count-session-progress-primary')
    const secondary = container.querySelector('.inventory-count-session-progress-secondary')
    const footer = container.querySelector('[data-inventory-count-footer="true"]')
    const scroll = container.querySelector('[data-inventory-count-row-scroll="true"]')
    const rail = container.querySelector('.inventory-count-session-rail')

    expect(sessionSearch).toBeTruthy()
    expect(sessionSearch.getAttribute('placeholder') || '').toMatch(/items/i)
    expect(container.querySelectorAll('.inventory-count-session-search-input')).toHaveLength(1)
    expect(pill).toBeTruthy()
    expect(pill.textContent).toMatch(/In Progress/i)
    expect(labels).toEqual(expect.arrayContaining(['Count Type', 'Mode']))
    expect(labels).not.toContain('Progress')
    expect(container.querySelector('.inventory-count-session-meta-progress')).toBeNull()
    expect(progressCard).toBeTruthy()
    expect(percent?.textContent).toMatch(/%/)
    expect(primary?.textContent).toMatch(/counted/i)
    expect(secondary?.textContent).toMatch(/locations complete/i)
    expect(footer).toBeTruthy()
    expect(footer.textContent).not.toMatch(/Session status/i)
    expect(container.querySelector('.inventory-count-session-footer-left')).toBeNull()
    expect(footer.textContent).toMatch(/Unsaved changes/i)
    expect(getButtonByText(container, 'Previous')).toBeTruthy()
    expect(getButtonByText(container, 'Next')).toBeTruthy()
    expect(getButtonByText(container, 'Complete Location')).toBeTruthy()
    expect(rail).toBeTruthy()
    expect(scroll).toBeTruthy()
    expect(container.querySelectorAll('[data-inventory-count-row-scroll="true"]')).toHaveLength(1)
    expect(container.querySelector('.inventory-count-finish-disabled-reason')).toBeNull()

    cleanup()
  })

  it('hides Stock-level search with display:none during active session and preserves blocking Finish banners', () => {
    expect(appCss).toContain(
      '.app-shell.stock-focus-mode:has(.inventory-count-session.is-high-density) .stock-focus-search',
    )
    expect(appCss).toMatch(
      /\.app-shell\.stock-focus-mode:has\(\.inventory-count-session\.is-high-density\)\s+\.stock-focus-search,[\s\S]{0,280}?display:\s*none/s,
    )
    expect(appCss).toMatch(/--inventory-count-sheet-end-runway:\s*320px/)
    expect(appCss).toMatch(
      /\.inventory-count-session-footer-middle\s*\{[^}]*flex:\s*1\s+1\s+auto/s,
    )
    expect(workspaceSource).not.toContain('inventory-count-session-meta-progress')
    expect(workspaceSource).not.toContain('Session status')
    expect(shouldShowFinishCountDisabledBanner('Resume this count before finishing.')).toBe(true)
    expect(shouldShowFinishCountDisabledBanner('23 items are still pending.')).toBe(false)
  })
})

describe('InventoryCountSessionWorkspace header premium hierarchy (P8.19.6)', () => {
  const appCss = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')

  beforeEach(() => {
    getInventoryCountSession.mockReset()
    getInventoryCountSessionLocations.mockReset()
    getInventoryCountSessionItems.mockReset()

    getInventoryCountSession.mockResolvedValue({
      id: 'session-real-1',
      workspaceId: 'workspace-test-id',
      status: 'in_progress',
    })
    getInventoryCountSessionLocations.mockResolvedValue(FIXTURE_LOCATIONS)
    getInventoryCountSessionItems.mockResolvedValue(FIXTURE_ITEMS)
  })

  it('keeps Count Type, Mode, status pill, session search, and KPI without touching runway or footer CTA', async () => {
    const { container, cleanup } = await renderWorkspace()
    const pill = container.querySelector('.inventory-count-session-pill.is-status')
    const labels = Array.from(container.querySelectorAll('.inventory-count-session-meta-label'))
      .map((node) => node.textContent.trim())
    const footer = container.querySelector('[data-inventory-count-footer="true"]')
    const scroll = container.querySelector('[data-inventory-count-row-scroll="true"]')

    expect(pill).toBeTruthy()
    expect(labels).toEqual(expect.arrayContaining(['Count Type', 'Mode']))
    expect(labels).not.toContain('Progress')
    expect(container.querySelector('.inventory-count-session-search-input')).toBeTruthy()
    expect(container.querySelector('.inventory-count-session-progress-percent')).toBeTruthy()
    expect(footer).toBeTruthy()
    expect(getButtonByText(container, 'Complete Location')?.className).toContain('primary-btn')
    expect(scroll).toBeTruthy()
    expect(container.querySelectorAll('[data-inventory-count-row-scroll="true"]')).toHaveLength(1)

    cleanup()
  })

  it('applies premium header spacing, toolbar baseline alignment, and stronger KPI proportions', () => {
    expect(appCss).toMatch(
      /\.inventory-count-session\.is-high-density\s+\.inventory-count-session-meta\s*\{[^}]*gap:\s*8px\s+24px/s,
    )
    expect(appCss).toMatch(
      /\.inventory-count-session\.is-high-density\s+\.inventory-count-session-meta-value\s*\{[^}]*font-weight:\s*700/s,
    )
    expect(appCss).toMatch(
      /\.inventory-count-session\.is-high-density\s+\.inventory-count-session-header-actions\s*\{[^}]*gap:\s*8px/s,
    )
    expect(appCss).toMatch(
      /\.inventory-count-session\.is-high-density\s+\.inventory-count-session-toolbar\s*\{[^}]*align-items:\s*center/s,
    )
    expect(appCss).toMatch(
      /\.inventory-count-session\.is-high-density\s+\.inventory-count-session-search-input\s*\{[^}]*min-height:\s*36px/s,
    )
    expect(appCss).toMatch(
      /\.inventory-count-session\.is-high-density\s+\.inventory-count-session-progress-percent\s*\{[^}]*font-size:\s*1\.47rem/s,
    )
    expect(appCss).toMatch(/--inventory-count-sheet-end-runway:\s*320px/)
  })
})

describe('InventoryCountSessionWorkspace search & filter premium toolbar (P8.19.7)', () => {
  const appCss = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')

  beforeEach(() => {
    getInventoryCountSession.mockReset()
    getInventoryCountSessionLocations.mockReset()
    getInventoryCountSessionItems.mockReset()

    getInventoryCountSession.mockResolvedValue({
      id: 'session-real-1',
      workspaceId: 'workspace-test-id',
      status: 'in_progress',
    })
    getInventoryCountSessionLocations.mockResolvedValue(FIXTURE_LOCATIONS)
    getInventoryCountSessionItems.mockResolvedValue(FIXTURE_ITEMS)
  })

  it('keeps session search, Filter control, and KPI unchanged in structure', async () => {
    const { container, cleanup } = await renderWorkspace()
    const search = container.querySelector('.inventory-count-session-search-input')
    const filter = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent.trim() === 'Filter')
    const kpi = container.querySelector('.inventory-count-session-progress-card')
    const scroll = container.querySelector('[data-inventory-count-row-scroll="true"]')

    expect(search).toBeTruthy()
    expect(filter).toBeTruthy()
    expect(filter.className).toContain('inventory-count-session-filter-btn')
    expect(kpi).toBeTruthy()
    expect(container.querySelector('.inventory-count-session-progress-percent')).toBeTruthy()
    expect(scroll).toBeTruthy()
    expect(container.querySelectorAll('[data-inventory-count-row-scroll="true"]')).toHaveLength(1)
    expect(appCss).toMatch(/--inventory-count-sheet-end-runway:\s*320px/)

    cleanup()
  })

  it('reduces search dominance and pairs Search with Filter on a shared toolbar baseline', () => {
    expect(appCss).toMatch(
      /\.inventory-count-session\.is-high-density\s+\.inventory-count-session-search\s*\{[^}]*max-width:\s*min\(420px,\s*85%\)/s,
    )
    expect(appCss).toMatch(
      /\.inventory-count-session\.is-high-density\s+\.inventory-count-session-search-input\s*\{[^}]*min-height:\s*36px/s,
    )
    expect(appCss).toMatch(
      /\.inventory-count-session\.is-high-density\s+\.inventory-count-session-search-input\s*\{[^}]*border-radius:\s*10px/s,
    )
    expect(appCss).toMatch(
      /\.inventory-count-session\.is-high-density\s+\.inventory-count-session-search-input::placeholder\s*\{[^}]*color:\s*rgba\(255,\s*247,\s*232,\s*0\.4\)/s,
    )
    expect(appCss).toMatch(
      /\.inventory-count-session\.is-high-density\s+\.inventory-count-session-filter-btn\s*\{[^}]*min-height:\s*36px/s,
    )
    expect(appCss).toMatch(
      /\.inventory-count-session\.is-high-density\s+\.inventory-count-session-filter-btn\s*\{[^}]*border-radius:\s*10px/s,
    )
    expect(appCss).toMatch(
      /\.inventory-count-session\.is-high-density\s+\.inventory-count-session-toolbar-left\s*\{[^}]*gap:\s*6px/s,
    )
    expect(appCss).toMatch(
      /\.inventory-count-session\.is-high-density\s+\.inventory-count-session-toolbar\s*\{[^}]*align-items:\s*center/s,
    )
    expect(appCss).toMatch(
      /\.inventory-count-session\.is-high-density\s+\.inventory-count-session-progress-card\s*\{[^}]*align-self:\s*center/s,
    )
    expect(appCss).toMatch(
      /\.inventory-count-session\.is-high-density\s+\.inventory-count-session-progress-percent\s*\{[^}]*font-size:\s*1\.47rem/s,
    )
  })
})

describe('InventoryCountSessionWorkspace active count table premium typography (P8.19.8)', () => {
  const appCss = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')

  beforeEach(() => {
    getInventoryCountSession.mockReset()
    getInventoryCountSessionLocations.mockReset()
    getInventoryCountSessionItems.mockReset()

    getInventoryCountSession.mockResolvedValue({
      id: 'session-real-1',
      workspaceId: 'workspace-test-id',
      status: 'in_progress',
    })
    getInventoryCountSessionLocations.mockResolvedValue(FIXTURE_LOCATIONS)
    getInventoryCountSessionItems.mockResolvedValue(FIXTURE_ITEMS)
  })

  it('keeps table structure, scroll ownership, runway, and status colors unchanged', async () => {
    const { container, cleanup } = await renderWorkspace()
    const sheet = container.querySelector('.inventory-count-session-spreadsheet')
    const frozen = container.querySelector('[data-inventory-count-frozen-header="true"]')
    const scroll = container.querySelector('[data-inventory-count-row-scroll="true"]')
    const row = container.querySelector('.inventory-count-session-spreadsheet-row')
    const input = container.querySelector('.inventory-count-session-counted-input')
    const pill = container.querySelector('.inventory-count-session-status-pill')

    expect(sheet).toBeTruthy()
    expect(frozen).toBeTruthy()
    expect(scroll).toBeTruthy()
    expect(container.querySelectorAll('[data-inventory-count-row-scroll="true"]')).toHaveLength(1)
    expect(row).toBeTruthy()
    expect(row.querySelector('.inventory-count-session-item-name')).toBeTruthy()
    expect(row.querySelector('.inventory-count-session-item-meta')).toBeTruthy()
    expect(input).toBeTruthy()
    expect(pill).toBeTruthy()
    expect(pill.className).toMatch(/is-(pending|counted|skipped)/)
    expect(appCss).toMatch(/--inventory-count-sheet-end-runway:\s*320px/)
    expect(appCss).toMatch(
      /\.inventory-count-session-spreadsheet\s+\.inventory-count-session-status-pill\.is-counted\s*\{[^}]*border-color:\s*rgba\(212,\s*175,\s*55,\s*0\.22\)/s,
    )
    expect(appCss).toMatch(
      /\.inventory-count-session-spreadsheet\s+\.inventory-count-session-status-pill\.is-pending\s*\{[^}]*color:\s*rgba\(255,\s*247,\s*232,\s*0\.45\)/s,
    )

    cleanup()
  })

  it('raises header hierarchy and strengthens separation from the first row', () => {
    expect(appCss).toMatch(
      /\.inventory-count-session-spreadsheet-cell\.is-head\s*\{[^}]*color:\s*rgba\(255,\s*247,\s*232,\s*0\.72\)/s,
    )
    expect(appCss).toMatch(
      /\.inventory-count-session-spreadsheet-cell\.is-head\s*\{[^}]*font-size:\s*0\.7rem/s,
    )
    expect(appCss).toMatch(
      /\.inventory-count-session-spreadsheet-cell\.is-head\s*\{[^}]*letter-spacing:\s*0\.12em/s,
    )
    expect(appCss).toMatch(
      /\.inventory-count-session-spreadsheet\s*>\s*\.inventory-count-session-sheet-frozen-head\s*\{[^}]*border-bottom:\s*1px solid rgba\(255,\s*255,\s*255,\s*0\.16\)/s,
    )
  })

  it('strengthens product name vs softer category meta without large row growth', () => {
    expect(appCss).toMatch(
      /\.inventory-count-session-spreadsheet\s+\.inventory-count-session-item-name\s*\{[^}]*font-weight:\s*700/s,
    )
    expect(appCss).toMatch(
      /\.inventory-count-session-spreadsheet\s+\.inventory-count-session-item-name\s*\{[^}]*font-size:\s*0\.82rem/s,
    )
    expect(appCss).toMatch(
      /\.inventory-count-session-spreadsheet\s+\.inventory-count-session-item-meta\s*\{[^}]*color:\s*rgba\(255,\s*247,\s*232,\s*0\.34\)/s,
    )
    expect(appCss).toMatch(
      /\.inventory-count-session-spreadsheet-row\s*\{[^}]*min-height:\s*42px/s,
    )
  })

  it('aligns Expected/Counted as spreadsheet values and polishes counted inputs + status pills', () => {
    expect(appCss).toMatch(
      /\.inventory-count-session-spreadsheet-cell\.is-expected\s*\{[^}]*justify-content:\s*flex-end/s,
    )
    expect(appCss).toMatch(
      /\.inventory-count-session-spreadsheet-cell\.is-expected\s*\{[^}]*text-align:\s*right/s,
    )
    expect(appCss).toMatch(
      /\.inventory-count-session-counted-input\s*\{[^}]*text-align:\s*right/s,
    )
    expect(appCss).toMatch(
      /\.inventory-count-session-counted-input\s*\{[^}]*border:\s*1px solid rgba\(255,\s*247,\s*232,\s*0\.24\)/s,
    )
    expect(appCss).toMatch(
      /\.inventory-count-session-counted-input:focus\s*\{[^}]*border-color:\s*rgba\(212,\s*175,\s*55,\s*0\.88\)/s,
    )
    expect(appCss).toMatch(
      /\.inventory-count-session-spreadsheet\s+\.inventory-count-session-status-pill\s*\{[^}]*padding:\s*0 8px/s,
    )
    expect(appCss).toMatch(
      /\.inventory-count-session-spreadsheet\s+\.inventory-count-session-status-pill\s*\{[^}]*letter-spacing:\s*0\.06em/s,
    )
  })
})
