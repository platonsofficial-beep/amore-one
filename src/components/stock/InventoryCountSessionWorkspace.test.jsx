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
} from '../../services/inventoryCountService'

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    workspace: { id: 'workspace-test-id', name: 'Test Workspace' },
  }),
}))

vi.mock('../../services/inventoryCountService', () => ({
  createInventoryCountSession: vi.fn(),
  buildInventoryCountSnapshot: vi.fn(),
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
}

describe('InventoryCountSessionWorkspace interactive foundation', () => {
  beforeEach(() => {
    createInventoryCountSession.mockReset()
    buildInventoryCountSnapshot.mockReset()
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
  })

  it('opens from the wizard Start CTA and exits back to Inventory Count foundation', async () => {
    const { container, cleanup } = render(createElement(InventoryCountView))

    expect(container.querySelector('.inventory-count-session')).toBeNull()
    await advanceWizardToSession(container)

    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(container.querySelector('.inventory-count-session')).not.toBeNull()
    expect(container.textContent).toContain('Inventory Count Session')
    expect(container.textContent).toContain('Coca-Cola')

    act(() => {
      getButtonByText(container, 'Exit').click()
    })
    expect(container.querySelector('.inventory-count-session')).toBeNull()
    expect(container.textContent).toContain('Start new count')

    cleanup()
  })

  it('renders all demo locations and switches location datasets on tap', () => {
    const { container, cleanup } = render(
      createElement(InventoryCountSessionWorkspace, { onExit: vi.fn() }),
    )

    const locationNames = [
      'Main Bar',
      'Main Storage',
      'Coffee Station',
      'Wine Storage',
      'Kitchen',
      'Freezer',
      'Other',
    ]
    locationNames.forEach((name) => {
      expect(getRailButton(container, name)).toBeTruthy()
    })

    const searchInput = container.querySelector('.inventory-count-session-search-input')
    expect(searchInput?.getAttribute('placeholder')).toBe('Search Main Storage items...')
    expect(container.textContent).toContain('Coca-Cola')
    expect(container.textContent).toContain('Paper Straws')
    expect(container.querySelectorAll('.inventory-count-session-table tbody tr')).toHaveLength(5)

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
    expect(getRailButton(container, 'Main Storage')?.className).toContain('is-current')
    expect(getRailButton(container, 'Coffee Station')?.className).not.toContain('is-current')

    act(() => {
      getRailButton(container, 'Main Bar').click()
    })
    expect(searchInput?.getAttribute('placeholder')).toBe('Search Main Bar items...')
    expect(container.textContent).toContain('Absolut Vodka')
    expect(container.textContent).toContain('Lime Juice')
    expect(getRailButton(container, 'Main Bar')?.className).toContain('is-completed')
    expect(getRailButton(container, 'Main Bar')?.className).not.toContain('is-current')
    expect(getProgressSnapshot(container)).toBe(progressBefore)

    cleanup()
  })

  it('navigates with Previous and Next without changing location statuses', () => {
    const { container, cleanup } = render(
      createElement(InventoryCountSessionWorkspace, { onExit: vi.fn() }),
    )

    const previousBtn = getButtonByText(container, 'Previous')
    const nextBtn = getButtonByText(container, 'Next')

    expect(previousBtn?.disabled).toBe(false)
    expect(nextBtn?.disabled).toBe(false)

    act(() => {
      getRailButton(container, 'Main Bar').click()
    })
    expect(previousBtn?.disabled).toBe(true)
    expect(container.querySelector('.inventory-count-session-search-input')?.getAttribute('placeholder'))
      .toBe('Search Main Bar items...')

    act(() => {
      nextBtn.click()
    })
    expect(container.querySelector('.inventory-count-session-search-input')?.getAttribute('placeholder'))
      .toBe('Search Main Storage items...')
    expect(container.textContent).toContain('Coca-Cola')
    expect(getRailButton(container, 'Main Storage')?.className).toContain('is-current')

    act(() => {
      getRailButton(container, 'Other').click()
    })
    expect(nextBtn?.disabled).toBe(true)
    expect(previousBtn?.disabled).toBe(false)

    act(() => {
      previousBtn.click()
    })
    expect(container.querySelector('.inventory-count-session-search-input')?.getAttribute('placeholder'))
      .toBe('Search Freezer items...')
    expect(container.textContent).toContain('Frozen Berries')

    cleanup()
  })

  it('completes the selected location, advances current, and updates progress', () => {
    const { container, cleanup } = render(
      createElement(InventoryCountSessionWorkspace, { onExit: vi.fn() }),
    )

    expect(getProgressSnapshot(container)).toContain('17 / 35 counted')
    expect(getProgressSnapshot(container)).toContain('49%')
    expect(getProgressSnapshot(container)).toContain('3 / 7 locations complete')
    expect(getProgressSnapshot(container)).toContain('0 skipped')
    expect(container.textContent).toContain('All changes saved')

    const completeBtn = getButtonByText(container, 'Complete Location')
    expect(completeBtn?.disabled).toBe(false)

    act(() => {
      completeBtn.click()
    })

    expect(getRailButton(container, 'Main Storage')?.className).toContain('is-completed')
    expect(getRailButton(container, 'Main Storage')?.textContent).toContain('5 / 5')
    expect(getRailButton(container, 'Coffee Station')?.className).toContain('is-current')
    expect(getRailButton(container, 'Coffee Station')?.getAttribute('aria-pressed')).toBe('true')
    expect(countCurrentLocations(container)).toBe(1)
    expect(container.querySelector('.inventory-count-session-search-input')?.getAttribute('placeholder'))
      .toBe('Search Coffee Station items...')
    expect(container.textContent).toContain('Espresso Beans')
    expect(getProgressSnapshot(container)).toContain('20 / 35 counted')
    expect(getProgressSnapshot(container)).toContain('57%')
    expect(getProgressSnapshot(container)).toContain('4 / 7 locations complete')

    act(() => {
      getRailButton(container, 'Main Storage').click()
    })
    expect(getButtonByText(container, 'Complete Location')?.disabled).toBe(true)

    cleanup()
  })

  it('shows the final completion message when all locations are complete', () => {
    const { container, cleanup } = render(
      createElement(InventoryCountSessionWorkspace, { onExit: vi.fn() }),
    )

    const completeBtn = getButtonByText(container, 'Complete Location')

    act(() => {
      completeBtn.click()
    })
    act(() => {
      completeBtn.click()
    })
    act(() => {
      completeBtn.click()
    })
    act(() => {
      completeBtn.click()
    })

    expect(getProgressSnapshot(container)).toContain('35 / 35 counted')
    expect(getProgressSnapshot(container)).toContain('100%')
    expect(getProgressSnapshot(container)).toContain('7 / 7 locations complete')
    expect(countCurrentLocations(container)).toBe(0)
    expect(container.textContent).toContain(
      'All locations are complete. Finish Count will be added next.',
    )
    expect(getButtonByText(container, 'Complete Location')?.disabled).toBe(true)

    cleanup()
  })

  it('does not introduce persistence or service wiring in the workspace source', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/stock/InventoryCountSessionWorkspace.jsx'),
      'utf8',
    )

    expect(source).not.toMatch(/localStorage|sessionStorage|supabase|recordStockMovement|createCount|postCount|fetch\(/i)
  })
})
