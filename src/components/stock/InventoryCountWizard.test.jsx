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
  createInventoryCountSessionWithSnapshot,
  listInventoryCountStorageLocations,
} from '../../services/inventoryCountService'

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    workspace: { id: 'workspace-test-id', name: 'Test Workspace' },
  }),
}))

vi.mock('../../services/inventoryCountService', () => ({
  createInventoryCountSessionWithSnapshot: vi.fn(),
  listInventoryCountStorageLocations: vi.fn(),
  listInventoryCountHomeSessions: vi.fn(async () => ({
    active: [],
    paused: [],
    recent: [],
  })),
}))

const DEFAULT_LIVE_LOCATIONS = [
  'Back Bar',
  'Coffee Station',
  'Freezer',
  'Kitchen',
  'Main Bar',
  'Main Storage',
  'Other',
  'Wine Storage',
]

const DEFAULT_START_RESULT = {
  session: {
    id: 'session-real-1',
    workspaceId: 'workspace-test-id',
    status: 'in_progress',
    countType: 'quick',
    visibility: 'open',
    includeZeroStock: false,
    includeInactive: true,
    note: 'Month-end bar audit',
  },
  snapshot: {
    sessionId: 'session-real-1',
    itemsCreated: 12,
    snapshotCreatedAt: '2026-07-20T12:00:00.000Z',
  },
}

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

function getLocationCardByTitle(root, title) {
  return Array.from(root.querySelectorAll('[role="checkbox"]')).find((card) => (
    card.querySelector('.inventory-count-type-card-title')?.textContent === title
  ))
}

async function flushAsync() {
  await act(async () => {
    await Promise.resolve()
  })
}

async function goToStep2(container) {
  const continueBtn = getButtonByText(container, 'Continue')
  const typeCards = container.querySelectorAll('[role="radio"]')

  await act(async () => {
    typeCards[1].click()
  })
  await act(async () => {
    continueBtn.click()
  })
  await flushAsync()

  return { continueBtn }
}

async function goToStep3(container, locationTitles = ['Main Bar', 'Main Storage']) {
  const { continueBtn } = await goToStep2(container)

  for (const title of locationTitles) {
    const card = getLocationCardByTitle(container, title)
    expect(card).toBeTruthy()
    await act(async () => {
      card.click()
    })
  }

  await act(async () => {
    continueBtn.click()
  })

  return { continueBtn }
}

describe('InventoryCountWizard foundation', () => {
  beforeEach(() => {
    createInventoryCountSessionWithSnapshot.mockReset()
    listInventoryCountStorageLocations.mockReset()
    listInventoryCountStorageLocations.mockResolvedValue([...DEFAULT_LIVE_LOCATIONS])
    createInventoryCountSessionWithSnapshot.mockResolvedValue({
      session: { ...DEFAULT_START_RESULT.session },
      snapshot: { ...DEFAULT_START_RESULT.snapshot },
    })
  })

  it('opens from Start new count and closes via Cancel and Close', async () => {
    const { container, cleanup } = render(createElement(InventoryCountView))

    expect(container.querySelector('[role="dialog"]')).toBeNull()

    const startBtn = getButtonByText(container, 'Start new count')
    expect(startBtn).toBeTruthy()

    await act(async () => {
      startBtn.click()
    })
    await flushAsync()

    const dialog = container.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.textContent).toContain('Inventory Count')
    expect(dialog?.textContent).toContain('Create a new inventory counting session.')
    expect(dialog?.textContent).toContain('Step 1 of 4')
    expect(dialog?.textContent).toContain('Count Type')

    const cancelBtn = getButtonByText(dialog, 'Cancel')
    expect(dialog.querySelector('.inventory-count-wizard-header-actions .inventory-count-wizard-cancel-btn')).toBeNull()
    expect(Array.from(dialog.querySelectorAll('button')).filter((button) => button.textContent === 'Cancel')).toHaveLength(1)
    await act(async () => {
      cancelBtn.click()
    })
    expect(container.querySelector('[role="dialog"]')).toBeNull()

    await act(async () => {
      startBtn.click()
    })
    await flushAsync()
    const closeBtn = container.querySelector('[aria-label="Close"]')
    await act(async () => {
      closeBtn.click()
    })
    expect(container.querySelector('[role="dialog"]')).toBeNull()

    cleanup()
  })

  it('selects one count type at a time and enables Continue only after selection', async () => {
    const onClose = vi.fn()
    const { container, cleanup } = render(
      createElement(InventoryCountWizard, { isOpen: true, onClose }),
    )
    await flushAsync()

    const continueBtn = getButtonByText(container, 'Continue')
    const backBtn = getButtonByText(container, 'Back')
    expect(continueBtn?.disabled).toBe(true)
    expect(backBtn?.disabled).toBe(true)

    const cards = container.querySelectorAll('[role="radio"]')
    expect(cards).toHaveLength(5)

    await act(async () => {
      cards[0].click()
    })
    expect(cards[0].getAttribute('aria-checked')).toBe('true')
    expect(continueBtn?.disabled).toBe(false)
    expect(container.querySelectorAll('.inventory-count-type-card-badge')).toHaveLength(1)
    expect(cards[0].querySelector('.inventory-count-type-card-badge')).not.toBeNull()

    await act(async () => {
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

  it('advances to Step 2, preserves count type, and supports multi-location selection', async () => {
    const onClose = vi.fn()
    const { container, cleanup } = render(
      createElement(InventoryCountWizard, { isOpen: true, onClose }),
    )
    await flushAsync()

    const continueBtn = getButtonByText(container, 'Continue')
    const typeCards = container.querySelectorAll('[role="radio"]')

    await act(async () => {
      typeCards[1].click()
    })
    await act(async () => {
      continueBtn.click()
    })
    await flushAsync()

    expect(container.textContent).toContain('Step 2 of 4')
    expect(container.textContent).toContain('Scope / Locations')
    expect(container.textContent).toContain(
      'Select the locations that will be included in this inventory count.',
    )

    const locationCards = container.querySelectorAll('[role="checkbox"]')
    expect(locationCards).toHaveLength(8)
    expect(continueBtn?.disabled).toBe(true)

    const mainBar = getLocationCardByTitle(container, 'Main Bar')
    const mainStorage = getLocationCardByTitle(container, 'Main Storage')
    const freezer = getLocationCardByTitle(container, 'Freezer')

    await act(async () => {
      mainBar.click()
    })
    await act(async () => {
      mainStorage.click()
    })
    await act(async () => {
      freezer.click()
    })

    expect(mainBar.getAttribute('aria-checked')).toBe('true')
    expect(mainStorage.getAttribute('aria-checked')).toBe('true')
    expect(freezer.getAttribute('aria-checked')).toBe('true')
    expect(continueBtn?.disabled).toBe(false)
    expect(container.querySelectorAll('.inventory-count-type-card-badge')).toHaveLength(3)

    await act(async () => {
      continueBtn.click()
    })
    expect(container.textContent).toContain('Step 3 of 4')
    expect(container.textContent).toContain('Count Settings')
    expect(onClose).not.toHaveBeenCalled()

    const backBtn = getButtonByText(container, 'Back')
    await act(async () => {
      backBtn.click()
    })

    expect(container.textContent).toContain('Step 2 of 4')
    expect(container.textContent).toContain('Scope / Locations')
    expect(getLocationCardByTitle(container, 'Main Bar').getAttribute('aria-checked')).toBe('true')
    expect(getLocationCardByTitle(container, 'Main Storage').getAttribute('aria-checked')).toBe('true')
    expect(getLocationCardByTitle(container, 'Freezer').getAttribute('aria-checked')).toBe('true')

    await act(async () => {
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
    await flushAsync()

    const { continueBtn } = await goToStep3(container)

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

    await act(async () => {
      visibilityCards[1].click()
    })
    expect(visibilityCards[0].getAttribute('aria-checked')).toBe('false')
    expect(visibilityCards[1].getAttribute('aria-checked')).toBe('true')

    const toggles = container.querySelectorAll('[role="switch"]')
    expect(toggles).toHaveLength(2)
    expect(toggles[0].getAttribute('aria-checked')).toBe('true')
    expect(toggles[1].getAttribute('aria-checked')).toBe('false')

    await act(async () => {
      toggles[0].click()
    })
    await act(async () => {
      toggles[1].click()
    })
    expect(toggles[0].getAttribute('aria-checked')).toBe('false')
    expect(toggles[1].getAttribute('aria-checked')).toBe('true')

    const noteInput = container.querySelector('.inventory-count-session-note-input')
    expect(noteInput).not.toBeNull()
    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value',
      )?.set
      nativeInputValueSetter?.call(noteInput, 'Month-end bar audit')
      noteInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(noteInput.value).toBe('Month-end bar audit')

    await act(async () => {
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

    expect(createInventoryCountSessionWithSnapshot).toHaveBeenCalledTimes(1)
    expect(createInventoryCountSessionWithSnapshot).toHaveBeenCalledWith({
      workspaceId: 'workspace-test-id',
      countType: 'quick',
      visibility: 'open',
      includeZeroStock: false,
      includeInactive: true,
      note: 'Month-end bar audit',
      locations: ['Main Bar', 'Main Storage'],
    })
    expect(onStartSession).toHaveBeenCalledTimes(1)
    expect(onStartSession.mock.calls[0][0].sessionId).toBe('session-real-1')
    expect(container.textContent).not.toContain('Session creation will be added next.')
    expect(onClose).not.toHaveBeenCalled()

    cleanup()
  })

  it('hides Open Count and inactive warnings for default Blind configuration', async () => {
    const { container, cleanup } = render(
      createElement(InventoryCountWizard, { isOpen: true, onClose: vi.fn() }),
    )
    await flushAsync()

    const { continueBtn } = await goToStep3(container)
    await act(async () => {
      continueBtn.click()
    })

    expect(container.textContent).toContain('Blind Count')
    expect(container.textContent).not.toContain('Expected quantities will be visible while counting.')
    expect(container.textContent).not.toContain('Inactive inventory items will be included.')
    expect(container.textContent).not.toContain('Session note')

    cleanup()
  })

  it('stops when start fails before a usable session is returned', async () => {
    createInventoryCountSessionWithSnapshot.mockRejectedValueOnce(new Error('Create failed'))
    const onStartSession = vi.fn()
    const { container, cleanup } = render(
      createElement(InventoryCountWizard, { isOpen: true, onClose: vi.fn(), onStartSession }),
    )
    await flushAsync()

    const { continueBtn } = await goToStep3(container)
    await act(async () => {
      continueBtn.click()
    })
    const startBtn = getButtonByText(container, 'Start Inventory Count Session')

    await act(async () => {
      startBtn.click()
    })

    expect(createInventoryCountSessionWithSnapshot).toHaveBeenCalledTimes(1)
    expect(onStartSession).not.toHaveBeenCalled()
    expect(container.querySelector('.staff-status-banner')?.textContent).toBe('Create failed')
    expect(getButtonByText(container, 'Start Inventory Count Session')?.disabled).toBe(false)

    cleanup()
  })

  it('stops when snapshot fails after create succeeds', async () => {
    createInventoryCountSessionWithSnapshot.mockRejectedValueOnce(new Error('Snapshot failed'))
    const onStartSession = vi.fn()
    const { container, cleanup } = render(
      createElement(InventoryCountWizard, { isOpen: true, onClose: vi.fn(), onStartSession }),
    )
    await flushAsync()

    const { continueBtn } = await goToStep3(container)
    await act(async () => {
      continueBtn.click()
    })
    const startBtn = getButtonByText(container, 'Start Inventory Count Session')

    await act(async () => {
      startBtn.click()
    })

    expect(createInventoryCountSessionWithSnapshot).toHaveBeenCalledTimes(1)
    expect(onStartSession).not.toHaveBeenCalled()
    expect(container.querySelector('.staff-status-banner')?.textContent).toBe('Snapshot failed')
    expect(getButtonByText(container, 'Start Inventory Count Session')?.disabled).toBe(false)

    cleanup()
  })

  it('keeps the operator in the wizard when an empty snapshot is rejected (P8.21.2)', async () => {
    createInventoryCountSessionWithSnapshot.mockRejectedValueOnce(
      new Error('No inventory items were found for the selected location(s).'),
    )
    const onStartSession = vi.fn()
    const onClose = vi.fn()
    const { container, cleanup } = render(
      createElement(InventoryCountWizard, { isOpen: true, onClose, onStartSession }),
    )
    await flushAsync()

    const { continueBtn } = await goToStep3(container, ['Main Bar', 'Main Storage'])
    await act(async () => {
      continueBtn.click()
    })

    expect(container.textContent).toContain('Step 4 of 4')

    await act(async () => {
      getButtonByText(container, 'Start Inventory Count Session').click()
    })

    expect(onStartSession).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()
    expect(container.textContent).toContain('Step 4 of 4')
    expect(container.querySelector('.staff-status-banner')?.textContent)
      .toBe('No inventory items were found for the selected location(s).')
    expect(container.textContent).toContain('Main Bar')
    expect(container.textContent).toContain('Main Storage')

    const backBtn = getButtonByText(container, 'Back')
    await act(async () => {
      backBtn.click()
    })
    await act(async () => {
      backBtn.click()
    })

    expect(container.textContent).toContain('Step 2 of 4')
    expect(getLocationCardByTitle(container, 'Main Bar').getAttribute('aria-checked')).toBe('true')
    expect(getLocationCardByTitle(container, 'Main Storage').getAttribute('aria-checked')).toBe('true')

    await act(async () => {
      getLocationCardByTitle(container, 'Main Storage').click()
    })
    await act(async () => {
      getLocationCardByTitle(container, 'Freezer').click()
    })

    expect(getLocationCardByTitle(container, 'Main Storage').getAttribute('aria-checked')).toBe('false')
    expect(getLocationCardByTitle(container, 'Freezer').getAttribute('aria-checked')).toBe('true')
    expect(getButtonByText(container, 'Continue')?.disabled).toBe(false)

    cleanup()
  })

  it('shows unverified start recovery guidance without entering Active Count (P8.21.3a)', async () => {
    createInventoryCountSessionWithSnapshot.mockRejectedValueOnce(
      new Error(
        'We could not confirm whether the inventory count started. Please check the Inventory Count home before trying again.',
      ),
    )
    const onStartSession = vi.fn()
    const { container, cleanup } = render(
      createElement(InventoryCountWizard, { isOpen: true, onClose: vi.fn(), onStartSession }),
    )
    await flushAsync()

    const { continueBtn } = await goToStep3(container)
    await act(async () => {
      continueBtn.click()
    })
    await act(async () => {
      getButtonByText(container, 'Start Inventory Count Session').click()
    })

    expect(onStartSession).not.toHaveBeenCalled()
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()
    expect(container.querySelector('.staff-status-banner')?.textContent).toBe(
      'We could not confirm whether the inventory count started. Please check the Inventory Count home before trying again.',
    )
    expect(container.textContent).toContain('Main Bar')
    expect(container.textContent).toContain('Main Storage')

    cleanup()
  })

  it('prevents duplicate Start submissions while request is running', async () => {
    let resolveStart
    createInventoryCountSessionWithSnapshot.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveStart = resolve
      }),
    )
    const onStartSession = vi.fn()
    const { container, cleanup } = render(
      createElement(InventoryCountWizard, { isOpen: true, onClose: vi.fn(), onStartSession }),
    )
    await flushAsync()

    const { continueBtn } = await goToStep3(container)
    await act(async () => {
      continueBtn.click()
    })
    const startBtn = getButtonByText(container, 'Start Inventory Count Session')

    await act(async () => {
      startBtn.click()
      startBtn.click()
    })

    expect(createInventoryCountSessionWithSnapshot).toHaveBeenCalledTimes(1)
    expect(getButtonByText(container, 'Starting…')?.disabled).toBe(true)

    await act(async () => {
      resolveStart({
        session: {
          id: 'session-real-1',
          workspaceId: 'workspace-test-id',
          status: 'in_progress',
          countType: 'quick',
          visibility: 'blind',
          includeZeroStock: true,
          includeInactive: false,
          note: '',
        },
        snapshot: {
          sessionId: 'session-real-1',
          itemsCreated: 12,
          snapshotCreatedAt: '2026-07-20T12:00:00.000Z',
        },
      })
    })

    await flushAsync()
    expect(onStartSession).toHaveBeenCalledTimes(1)
    expect(onStartSession.mock.calls[0][0].sessionId).toBe('session-real-1')

    cleanup()
  })

  it('wires create-with-snapshot recovery through the inventory count service', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/stock/InventoryCountWizard.jsx'),
      'utf8',
    )

    expect(source).toContain('createInventoryCountSessionWithSnapshot')
    expect(source).toContain('listInventoryCountStorageLocations')
    expect(source).not.toContain('DEMO_LOCATIONS')
    expect(source).not.toMatch(/localStorage|recordStockMovement|postCount|fetch\(/i)
  })
})

describe('InventoryCountWizard live location scope (P8.21.1)', () => {
  beforeEach(() => {
    createInventoryCountSessionWithSnapshot.mockReset()
    listInventoryCountStorageLocations.mockReset()
    createInventoryCountSessionWithSnapshot.mockResolvedValue({
      session: {
        id: 'session-real-1',
        workspaceId: 'workspace-test-id',
        status: 'in_progress',
        countType: 'quick',
        visibility: 'blind',
        includeZeroStock: true,
        includeInactive: false,
        note: '',
      },
      snapshot: {
        sessionId: 'session-real-1',
        itemsCreated: 4,
        snapshotCreatedAt: '2026-07-20T12:00:00.000Z',
      },
    })
  })

  it('does not render demo locations and renders real workspace storage locations', async () => {
    listInventoryCountStorageLocations.mockResolvedValue(['Bar', 'Fridge', 'Main Storage'])
    const { container, cleanup } = render(
      createElement(InventoryCountWizard, { isOpen: true, onClose: vi.fn() }),
    )
    await flushAsync()
    await goToStep2(container)

    expect(listInventoryCountStorageLocations).toHaveBeenCalledWith('workspace-test-id')
    expect(container.textContent).toContain('Bar')
    expect(container.textContent).toContain('Fridge')
    expect(container.textContent).toContain('Main Storage')
    expect(container.textContent).not.toContain('Front-of-house bar stock')
    expect(container.textContent).not.toContain('Secondary bar storage')
    expect(container.textContent).not.toContain('Coffee Station')
    expect(container.textContent).not.toContain('Wine Storage')
    expect(container.querySelectorAll('[role="checkbox"]')).toHaveLength(3)

    cleanup()
  })

  it('preserves exact stored location values and passes them into create', async () => {
    listInventoryCountStorageLocations.mockResolvedValue(['Cold  Room', 'Main Storage', 'bar'])
    const onStartSession = vi.fn()
    const { container, cleanup } = render(
      createElement(InventoryCountWizard, { isOpen: true, onClose: vi.fn(), onStartSession }),
    )
    await flushAsync()
    const { continueBtn } = await goToStep3(container, ['Cold  Room', 'bar'])
    await act(async () => {
      continueBtn.click()
    })

    const startBtn = getButtonByText(container, 'Start Inventory Count Session')
    await act(async () => {
      startBtn.click()
    })

    expect(createInventoryCountSessionWithSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        locations: ['Cold  Room', 'bar'],
      }),
    )
    const passedLocations = createInventoryCountSessionWithSnapshot.mock.calls[0][0].locations
    expect(passedLocations[0]).toBe('Cold  Room')
    expect(passedLocations[1]).toBe('bar')
    expect(passedLocations[0]).not.toBe(passedLocations[0].trim().toLowerCase())
    expect(onStartSession).toHaveBeenCalledTimes(1)

    cleanup()
  })

  it('does not render outer-padded location keys when discovery returns only valid keys', async () => {
    listInventoryCountStorageLocations.mockResolvedValue(['Bar', 'Main Storage'])
    const { container, cleanup } = render(
      createElement(InventoryCountWizard, { isOpen: true, onClose: vi.fn() }),
    )
    await flushAsync()
    await goToStep2(container)

    expect(getLocationCardByTitle(container, 'Bar')).toBeTruthy()
    expect(getLocationCardByTitle(container, ' Bar')).toBeFalsy()
    expect(getLocationCardByTitle(container, 'Bar ')).toBeFalsy()
    expect(container.textContent).not.toMatch(/^\s+Bar\s+$/m)

    cleanup()
  })

  it('shows loading state while storage locations resolve', async () => {
    let resolveLocations
    listInventoryCountStorageLocations.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveLocations = resolve
      }),
    )
    const { container, cleanup } = render(
      createElement(InventoryCountWizard, { isOpen: true, onClose: vi.fn() }),
    )

    await goToStep2(container)
    expect(container.textContent).toContain('Loading storage locations…')
    expect(container.querySelectorAll('[role="checkbox"]')).toHaveLength(0)
    expect(getButtonByText(container, 'Continue')?.disabled).toBe(true)

    await act(async () => {
      resolveLocations(['Bar'])
    })
    await flushAsync()

    expect(container.textContent).not.toContain('Loading storage locations…')
    expect(getLocationCardByTitle(container, 'Bar')).toBeTruthy()

    cleanup()
  })

  it('shows a safe failure state when location loading fails', async () => {
    listInventoryCountStorageLocations.mockRejectedValueOnce(new Error('Locations unavailable'))
    const { container, cleanup } = render(
      createElement(InventoryCountWizard, { isOpen: true, onClose: vi.fn() }),
    )
    await flushAsync()
    await goToStep2(container)

    expect(container.querySelector('.staff-status-banner[role="alert"]')?.textContent)
      .toBe('Locations unavailable')
    expect(container.querySelectorAll('[role="checkbox"]')).toHaveLength(0)
    expect(getButtonByText(container, 'Continue')?.disabled).toBe(true)

    cleanup()
  })

  it('shows empty state and disables progression when no valid locations exist', async () => {
    listInventoryCountStorageLocations.mockResolvedValue([])
    const { container, cleanup } = render(
      createElement(InventoryCountWizard, { isOpen: true, onClose: vi.fn() }),
    )
    await flushAsync()
    await goToStep2(container)

    expect(container.textContent).toContain('No storage locations available')
    expect(container.textContent).toContain(
      'Stock items need a storage location before a count can begin.',
    )
    expect(container.querySelectorAll('[role="checkbox"]')).toHaveLength(0)
    expect(getButtonByText(container, 'Continue')?.disabled).toBe(true)

    cleanup()
  })
})
