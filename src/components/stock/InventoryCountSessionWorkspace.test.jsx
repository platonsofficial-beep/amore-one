/**
 * @vitest-environment jsdom
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InventoryCountView } from './InventoryCountView'
import { InventoryCountSessionWorkspace } from './InventoryCountSessionWorkspace'
import {
  buildInventoryCountSnapshot,
  createInventoryCountSession,
  getInventoryCountSessionItems,
  getInventoryCountSessionLocations,
} from '../../services/inventoryCountService'

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    workspace: { id: 'workspace-test-id', name: 'Test Workspace' },
  }),
}))

vi.mock('../../services/inventoryCountService', () => ({
  createInventoryCountSession: vi.fn(),
  buildInventoryCountSnapshot: vi.fn(),
  getInventoryCountSessionLocations: vi.fn(),
  getInventoryCountSessionItems: vi.fn(),
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
}) {
  return {
    id,
    sessionId: 'session-real-1',
    workspaceId: 'workspace-test-id',
    itemId: `stock-${id}`,
    itemName,
    category: 'Other',
    itemType: 'Other',
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
    countedQuantity: null,
    lineStatus: 'pending',
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
    getInventoryCountSessionLocations.mockReset()
    getInventoryCountSessionItems.mockReset()

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
    getInventoryCountSessionLocations.mockResolvedValue(FIXTURE_LOCATIONS)
    getInventoryCountSessionItems.mockResolvedValue(FIXTURE_ITEMS)
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
    expect(container.querySelectorAll('.inventory-count-session-table tbody tr')).toHaveLength(2)

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

  it('completes the selected location, advances current, and updates progress', async () => {
    const { container, cleanup } = await renderWorkspace()

    expect(getProgressSnapshot(container)).toContain('2 / 5 counted')
    expect(getProgressSnapshot(container)).toContain('1 / 3 locations complete')
    expect(container.textContent).toContain('All changes saved')

    const completeBtn = getButtonByText(container, 'Complete Location')
    expect(completeBtn?.disabled).toBe(false)

    act(() => {
      completeBtn.click()
    })

    expect(getRailButton(container, 'Main Storage')?.className).toContain('is-completed')
    expect(getRailButton(container, 'Main Storage')?.textContent).toContain('2 / 2')
    expect(getRailButton(container, 'Coffee Station')?.className).toContain('is-current')
    expect(countCurrentLocations(container)).toBe(1)
    expect(container.textContent).toContain('Espresso Beans')
    expect(getProgressSnapshot(container)).toContain('3 / 5 counted')
    expect(getProgressSnapshot(container)).toContain('2 / 3 locations complete')

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

    expect(workspaceSource).toContain('getInventoryCountSessionItems')
    expect(workspaceSource).not.toContain('getLatestInProgressInventoryCountSession')
    expect(serviceSource).not.toContain('getLatestInProgressInventoryCountSession')
    expect(viewSource).toContain('sessionId={activeSessionId}')
    expect(viewSource).toContain('workspaceId={activeWorkspaceId}')
    expect(workspaceSource).not.toMatch(/localStorage|sessionStorage|recordStockMovement|postCount|fetch\(/i)
  })
})
