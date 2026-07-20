/**
 * @vitest-environment jsdom
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InventoryCountView } from './InventoryCountView'
import { InventoryCountWizard } from './InventoryCountWizard'
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

function goToStep3(container) {
  const continueBtn = getButtonByText(container, 'Continue')
  const typeCards = container.querySelectorAll('[role="radio"]')

  act(() => {
    typeCards[1].click()
  })
  act(() => {
    continueBtn.click()
  })

  const locationCards = container.querySelectorAll('[role="checkbox"]')
  act(() => {
    locationCards[0].click()
  })
  act(() => {
    locationCards[2].click()
  })
  act(() => {
    continueBtn.click()
  })

  return { continueBtn, locationCards }
}

describe('InventoryCountWizard foundation', () => {
  beforeEach(() => {
    createInventoryCountSession.mockReset()
    buildInventoryCountSnapshot.mockReset()
    createInventoryCountSession.mockResolvedValue({
      id: 'session-real-1',
      workspaceId: 'workspace-test-id',
      status: 'in_progress',
      countType: 'quick',
      visibility: 'open',
      includeZeroStock: false,
      includeInactive: true,
      note: 'Month-end bar audit',
    })
    buildInventoryCountSnapshot.mockResolvedValue({
      sessionId: 'session-real-1',
      itemsCreated: 12,
      snapshotCreatedAt: '2026-07-20T12:00:00.000Z',
    })
  })

  it('opens from Start new count and closes via Cancel and Close', () => {
    const { container, cleanup } = render(createElement(InventoryCountView))

    expect(container.querySelector('[role="dialog"]')).toBeNull()

    const startBtn = getButtonByText(container, 'Start new count')
    expect(startBtn).toBeTruthy()

    act(() => {
      startBtn.click()
    })

    const dialog = container.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.textContent).toContain('Inventory Count')
    expect(dialog?.textContent).toContain('Create a new inventory counting session.')
    expect(dialog?.textContent).toContain('Step 1 of 4')
    expect(dialog?.textContent).toContain('Count Type')

    const cancelBtn = getButtonByText(dialog, 'Cancel')
    expect(dialog.querySelector('.inventory-count-wizard-header-actions .inventory-count-wizard-cancel-btn')).toBeNull()
    expect(Array.from(dialog.querySelectorAll('button')).filter((button) => button.textContent === 'Cancel')).toHaveLength(1)
    act(() => {
      cancelBtn.click()
    })
    expect(container.querySelector('[role="dialog"]')).toBeNull()

    act(() => {
      startBtn.click()
    })
    const closeBtn = container.querySelector('[aria-label="Close"]')
    act(() => {
      closeBtn.click()
    })
    expect(container.querySelector('[role="dialog"]')).toBeNull()

    cleanup()
  })

  it('selects one count type at a time and enables Continue only after selection', () => {
    const onClose = vi.fn()
    const { container, cleanup } = render(
      createElement(InventoryCountWizard, { isOpen: true, onClose }),
    )

    const continueBtn = getButtonByText(container, 'Continue')
    const backBtn = getButtonByText(container, 'Back')
    expect(continueBtn?.disabled).toBe(true)
    expect(backBtn?.disabled).toBe(true)

    const cards = container.querySelectorAll('[role="radio"]')
    expect(cards).toHaveLength(5)

    act(() => {
      cards[0].click()
    })
    expect(cards[0].getAttribute('aria-checked')).toBe('true')
    expect(continueBtn?.disabled).toBe(false)
    expect(container.querySelectorAll('.inventory-count-type-card-badge')).toHaveLength(1)
    expect(cards[0].querySelector('.inventory-count-type-card-badge')).not.toBeNull()

    act(() => {
      cards[2].click()
    })
    expect(cards[0].getAttribute('aria-checked')).toBe('false')
    expect(cards[2].getAttribute('aria-checked')).toBe('true')
    expect(continueBtn?.disabled).toBe(false)
    expect(container.querySelectorAll('.inventory-count-type-card-badge')).toHaveLength(1)
    expect(cards[2].querySelector('.inventory-count-type-card-badge')).not.toBeNull()
    expect(cards[0].querySelector('.inventory-count-type-card-badge')).toBeNull()

    cleanup()
  })

  it('advances to Step 2, preserves count type, and supports multi-location selection', () => {
    const onClose = vi.fn()
    const { container, cleanup } = render(
      createElement(InventoryCountWizard, { isOpen: true, onClose }),
    )

    const continueBtn = getButtonByText(container, 'Continue')
    const typeCards = container.querySelectorAll('[role="radio"]')

    act(() => {
      typeCards[1].click()
    })
    act(() => {
      continueBtn.click()
    })

    expect(container.textContent).toContain('Step 2 of 4')
    expect(container.textContent).toContain('Scope / Locations')
    expect(container.textContent).toContain(
      'Select the locations that will be included in this inventory count.',
    )

    const locationCards = container.querySelectorAll('[role="checkbox"]')
    expect(locationCards).toHaveLength(8)
    expect(continueBtn?.disabled).toBe(true)

    act(() => {
      locationCards[0].click()
    })
    act(() => {
      locationCards[2].click()
    })
    act(() => {
      locationCards[6].click()
    })

    expect(locationCards[0].getAttribute('aria-checked')).toBe('true')
    expect(locationCards[2].getAttribute('aria-checked')).toBe('true')
    expect(locationCards[6].getAttribute('aria-checked')).toBe('true')
    expect(continueBtn?.disabled).toBe(false)
    expect(container.querySelectorAll('.inventory-count-type-card-badge')).toHaveLength(3)

    act(() => {
      continueBtn.click()
    })
    expect(container.textContent).toContain('Step 3 of 4')
    expect(container.textContent).toContain('Count Settings')
    expect(onClose).not.toHaveBeenCalled()

    const backBtn = getButtonByText(container, 'Back')
    act(() => {
      backBtn.click()
    })

    expect(container.textContent).toContain('Step 2 of 4')
    expect(container.textContent).toContain('Scope / Locations')
    const restoredLocationCards = container.querySelectorAll('[role="checkbox"]')
    expect(restoredLocationCards[0].getAttribute('aria-checked')).toBe('true')
    expect(restoredLocationCards[2].getAttribute('aria-checked')).toBe('true')
    expect(restoredLocationCards[6].getAttribute('aria-checked')).toBe('true')

    act(() => {
      backBtn.click()
    })
    expect(container.textContent).toContain('Step 1 of 4')
    expect(container.textContent).toContain('Count Type')
    const restoredTypeCards = container.querySelectorAll('[role="radio"]')
    expect(restoredTypeCards[1].getAttribute('aria-checked')).toBe('true')

    cleanup()
  })

  it('configures Step 3 settings and opens Step 4 review without creating a session', async () => {
    const onClose = vi.fn()
    const onStartSession = vi.fn()
    const { container, cleanup } = render(
      createElement(InventoryCountWizard, { isOpen: true, onClose, onStartSession }),
    )

    const { continueBtn } = goToStep3(container)

    expect(container.textContent).toContain('Step 3 of 4')
    expect(container.textContent).toContain('Count Settings')
    expect(container.textContent).toContain(
      'Configure how this inventory session will be performed.',
    )

    const visibilityCards = container.querySelectorAll(
      '.inventory-count-wizard-body-visibility [role="radio"]',
    )
    expect(visibilityCards).toHaveLength(2)
    expect(visibilityCards[0].getAttribute('aria-checked')).toBe('true')
    expect(visibilityCards[0].textContent).toContain('Blind Count')
    expect(visibilityCards[0].textContent).toContain('Recommended')
    expect(continueBtn?.disabled).toBe(false)

    act(() => {
      visibilityCards[1].click()
    })
    expect(visibilityCards[0].getAttribute('aria-checked')).toBe('false')
    expect(visibilityCards[1].getAttribute('aria-checked')).toBe('true')

    const toggles = container.querySelectorAll('[role="switch"]')
    expect(toggles).toHaveLength(2)
    expect(toggles[0].getAttribute('aria-checked')).toBe('true')
    expect(toggles[1].getAttribute('aria-checked')).toBe('false')

    act(() => {
      toggles[0].click()
    })
    act(() => {
      toggles[1].click()
    })
    expect(toggles[0].getAttribute('aria-checked')).toBe('false')
    expect(toggles[1].getAttribute('aria-checked')).toBe('true')

    const noteInput = container.querySelector('.inventory-count-session-note-input')
    expect(noteInput).not.toBeNull()
    act(() => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value',
      )?.set
      nativeInputValueSetter?.call(noteInput, 'Month-end bar audit')
      noteInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(noteInput.value).toBe('Month-end bar audit')

    act(() => {
      continueBtn.click()
    })

    expect(container.textContent).toContain('Step 4 of 4')
    expect(container.textContent).toContain('Review & Start')
    expect(container.textContent).toContain('Review the session details before starting.')
    expect(container.textContent).toContain('Quick Count')
    expect(container.textContent).toContain('Main Bar')
    expect(container.textContent).toContain('Main Storage')
    expect(container.textContent).toContain('2 locations')
    expect(container.textContent).toContain('Open Count')
    expect(container.textContent).toContain('Include zero-stock items')
    expect(container.textContent).toContain('Include inactive items')
    expect(container.textContent).toContain('Yes')
    expect(container.textContent).toContain('No')
    expect(container.textContent).toContain('Month-end bar audit')
    expect(container.textContent).toContain('Estimated items')
    expect(container.textContent).toContain('—')
    expect(container.textContent).toContain(
      'The exact item total will be calculated when the session starts.',
    )
    expect(container.textContent).toContain('Current signed-in operator')
    expect(container.textContent).toContain('Starts when confirmed')
    expect(container.textContent).toContain(
      'ONE will freeze the expected stock quantities when this session starts.',
    )
    expect(container.textContent).toContain(
      'Stock received or used while counting will be reconciled against the time each item is counted, so posting will not double-count or overwrite later movements.',
    )
    expect(container.textContent).toContain('Expected quantities will be visible while counting.')
    expect(container.textContent).toContain('Inactive inventory items will be included.')
    expect(container.textContent).not.toContain('Step 4 coming next')

    const startBtn = getButtonByText(container, 'Start Inventory Count Session')
    expect(startBtn).toBeTruthy()
    expect(startBtn?.disabled).toBe(false)

    await act(async () => {
      startBtn.click()
    })

    expect(createInventoryCountSession).toHaveBeenCalledTimes(1)
    expect(buildInventoryCountSnapshot).toHaveBeenCalledTimes(1)
    expect(createInventoryCountSession.mock.invocationCallOrder[0]).toBeLessThan(
      buildInventoryCountSnapshot.mock.invocationCallOrder[0],
    )
    expect(createInventoryCountSession).toHaveBeenCalledWith({
      workspaceId: 'workspace-test-id',
      countType: 'quick',
      visibility: 'open',
      includeZeroStock: false,
      includeInactive: true,
      note: 'Month-end bar audit',
      locations: ['Main Bar', 'Main Storage'],
    })
    expect(buildInventoryCountSnapshot).toHaveBeenCalledWith({
      workspaceId: 'workspace-test-id',
      sessionId: 'session-real-1',
    })
    expect(onStartSession).toHaveBeenCalledTimes(1)
    expect(onStartSession.mock.calls[0][0].sessionId).toBe('session-real-1')
    expect(container.textContent).not.toContain('Session creation will be added next.')
    expect(onClose).not.toHaveBeenCalled()

    cleanup()
  })

  it('hides Open Count and inactive warnings for default Blind configuration', () => {
    const { container, cleanup } = render(
      createElement(InventoryCountWizard, { isOpen: true, onClose: vi.fn() }),
    )

    const { continueBtn } = goToStep3(container)
    act(() => {
      continueBtn.click()
    })

    expect(container.textContent).toContain('Blind Count')
    expect(container.textContent).not.toContain('Expected quantities will be visible while counting.')
    expect(container.textContent).not.toContain('Inactive inventory items will be included.')
    expect(container.textContent).not.toContain('Session note')

    cleanup()
  })

  it('stops when create session fails and does not build snapshot', async () => {
    createInventoryCountSession.mockRejectedValueOnce(new Error('Create failed'))
    const onStartSession = vi.fn()
    const { container, cleanup } = render(
      createElement(InventoryCountWizard, { isOpen: true, onClose: vi.fn(), onStartSession }),
    )

    const { continueBtn } = goToStep3(container)
    act(() => {
      continueBtn.click()
    })
    const startBtn = getButtonByText(container, 'Start Inventory Count Session')

    await act(async () => {
      startBtn.click()
    })

    expect(createInventoryCountSession).toHaveBeenCalledTimes(1)
    expect(buildInventoryCountSnapshot).not.toHaveBeenCalled()
    expect(onStartSession).not.toHaveBeenCalled()
    expect(container.querySelector('.staff-status-banner')?.textContent).toBe('Create failed')
    expect(getButtonByText(container, 'Start Inventory Count Session')?.disabled).toBe(false)

    cleanup()
  })

  it('stops when snapshot fails after create succeeds', async () => {
    buildInventoryCountSnapshot.mockRejectedValueOnce(new Error('Snapshot failed'))
    const onStartSession = vi.fn()
    const { container, cleanup } = render(
      createElement(InventoryCountWizard, { isOpen: true, onClose: vi.fn(), onStartSession }),
    )

    const { continueBtn } = goToStep3(container)
    act(() => {
      continueBtn.click()
    })
    const startBtn = getButtonByText(container, 'Start Inventory Count Session')

    await act(async () => {
      startBtn.click()
    })

    expect(createInventoryCountSession).toHaveBeenCalledTimes(1)
    expect(buildInventoryCountSnapshot).toHaveBeenCalledTimes(1)
    expect(onStartSession).not.toHaveBeenCalled()
    expect(container.querySelector('.staff-status-banner')?.textContent).toBe('Snapshot failed')
    expect(getButtonByText(container, 'Start Inventory Count Session')?.disabled).toBe(false)

    cleanup()
  })

  it('prevents duplicate Start submissions while request is running', async () => {
    let resolveCreate
    createInventoryCountSession.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveCreate = resolve
      }),
    )
    const onStartSession = vi.fn()
    const { container, cleanup } = render(
      createElement(InventoryCountWizard, { isOpen: true, onClose: vi.fn(), onStartSession }),
    )

    const { continueBtn } = goToStep3(container)
    act(() => {
      continueBtn.click()
    })
    const startBtn = getButtonByText(container, 'Start Inventory Count Session')

    await act(async () => {
      startBtn.click()
      startBtn.click()
    })

    expect(createInventoryCountSession).toHaveBeenCalledTimes(1)
    expect(getButtonByText(container, 'Starting…')?.disabled).toBe(true)

    await act(async () => {
      resolveCreate({
        id: 'session-real-1',
        workspaceId: 'workspace-test-id',
        status: 'in_progress',
        countType: 'quick',
        visibility: 'blind',
        includeZeroStock: true,
        includeInactive: false,
        note: '',
      })
    })

    expect(buildInventoryCountSnapshot).toHaveBeenCalledTimes(1)
    expect(onStartSession).toHaveBeenCalledTimes(1)
    expect(onStartSession.mock.calls[0][0].sessionId).toBe('session-real-1')

    cleanup()
  })

  it('wires create then snapshot through the inventory count service', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/stock/InventoryCountWizard.jsx'),
      'utf8',
    )

    expect(source).toContain('createInventoryCountSession')
    expect(source).toContain('buildInventoryCountSnapshot')
    expect(source).not.toMatch(/localStorage|recordStockMovement|postCount|fetch\(/i)
  })
})
