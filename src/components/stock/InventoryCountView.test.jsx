/**
 * @vitest-environment jsdom
 * P8.16.27 — Inventory Count home live session hydration.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { InventoryCountView } from './InventoryCountView'

const listHomeSessionsMock = vi.fn()
const useAuthMock = vi.fn()

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}))

vi.mock('../../services/inventoryCountService', () => ({
  listInventoryCountHomeSessions: (...args) => listHomeSessionsMock(...args),
  createInventoryCountSession: vi.fn(),
  buildInventoryCountSnapshot: vi.fn(),
  getInventoryCountSessionLocations: vi.fn(async () => []),
  getInventoryCountSessionItems: vi.fn(async () => []),
}))

vi.mock('./InventoryCountWizard', () => ({
  InventoryCountWizard: () => null,
}))

vi.mock('./InventoryCountSessionWorkspace', () => ({
  InventoryCountSessionWorkspace: ({ sessionId }) => createElement(
    'div',
    { className: 'inventory-count-session', 'data-session-id': sessionId },
    'Inventory Count Session',
  ),
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
      act(() => root.unmount())
      container.remove()
    },
  }
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

function sessionFixture(overrides = {}) {
  return {
    id: 'session-1',
    workspaceId: 'workspace-test-id',
    status: 'in_progress',
    statusLabel: 'In progress',
    countType: 'quick',
    countTypeLabel: 'Quick Count',
    startedBy: 'user-1',
    startedAt: '2026-07-21T10:00:00.000Z',
    updatedAt: '2026-07-21T11:00:00.000Z',
    operatorName: 'Alex Manager',
    locations: ['Main Storage', 'Bar'],
    completedLocations: 1,
    totalLocations: 2,
    ...overrides,
  }
}

beforeEach(() => {
  useAuthMock.mockReturnValue({
    workspace: { id: 'workspace-test-id', name: 'Test Workspace' },
  })
  listHomeSessionsMock.mockReset()
  listHomeSessionsMock.mockResolvedValue({
    active: [],
    paused: [],
    recent: [],
  })
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('InventoryCountView live home hydration (P8.16.27)', () => {
  it('shows empty states only after a confirmed empty dataset', async () => {
    const { container, cleanup } = render(createElement(InventoryCountView))
    await flush()

    expect(listHomeSessionsMock).toHaveBeenCalledWith({ workspaceId: 'workspace-test-id' })
    expect(container.textContent).toContain('No active counts.')
    expect(container.textContent).toContain('No paused counts.')
    expect(container.textContent).toContain('No completed counts yet.')
    expect(container.textContent).not.toContain('No counts are currently in progress.')
    expect(container.textContent).not.toContain('Completed inventory counts will appear here.')
    expect(container.querySelector('.inventory-count-session-card')).toBeNull()

    cleanup()
  })

  it('renders active, paused, and posted sessions with status mapping', async () => {
    listHomeSessionsMock.mockResolvedValue({
      active: [
        sessionFixture({
          id: 'active-1',
          status: 'in_progress',
          statusLabel: 'In progress',
          countTypeLabel: 'Quick Count',
        }),
        sessionFixture({
          id: 'complete-1',
          status: 'counting_complete',
          statusLabel: 'Counting complete',
          countTypeLabel: 'New Count',
        }),
      ],
      paused: [
        sessionFixture({
          id: 'paused-1',
          status: 'paused',
          statusLabel: 'Paused',
          countTypeLabel: 'Partial Count',
        }),
      ],
      recent: [
        sessionFixture({
          id: 'posted-1',
          status: 'posted',
          statusLabel: 'Posted',
          countTypeLabel: 'Emergency Count',
          postedAt: '2026-07-22T12:00:00.000Z',
        }),
      ],
    })

    const { container, cleanup } = render(createElement(InventoryCountView))
    await flush()

    expect(container.textContent).toContain('Quick Count')
    expect(container.textContent).toContain('In progress')
    expect(container.textContent).toContain('Counting complete')
    expect(container.textContent).toContain('Partial Count')
    expect(container.textContent).toContain('Paused')
    expect(container.textContent).toContain('Emergency Count')
    expect(container.textContent).toContain('Posted')
    expect(container.textContent).toContain('Alex Manager')
    expect(container.textContent).toContain('1 / 2 locations')
    expect(container.textContent).not.toContain('No active counts.')
    expect(container.textContent).not.toContain('No paused counts.')
    expect(container.textContent).not.toContain('No completed counts yet.')

    const cards = container.querySelectorAll('.inventory-count-session-card')
    expect(cards).toHaveLength(4)

    cleanup()
  })

  it('does not show placeholder empty copy when live sessions exist', async () => {
    listHomeSessionsMock.mockResolvedValue({
      active: [sessionFixture()],
      paused: [],
      recent: [],
    })

    const { container, cleanup } = render(createElement(InventoryCountView))
    await flush()

    expect(container.querySelector('.inventory-count-session-card')).toBeTruthy()
    expect(container.textContent).not.toContain('No active counts.')
    expect(container.textContent).toContain('No paused counts.')
    expect(container.textContent).toContain('No completed counts yet.')

    cleanup()
  })

  it('opens an active session through the existing workspace flow', async () => {
    listHomeSessionsMock.mockResolvedValue({
      active: [sessionFixture({ id: 'active-open' })],
      paused: [],
      recent: [],
    })

    const { container, cleanup } = render(createElement(InventoryCountView))
    await flush()

    await act(async () => {
      container.querySelector('.inventory-count-session-card')?.click()
    })

    expect(container.querySelector('.inventory-count-session')?.getAttribute('data-session-id'))
      .toBe('active-open')

    cleanup()
  })

  it('keeps posted sessions read-only on the home card', async () => {
    listHomeSessionsMock.mockResolvedValue({
      active: [],
      paused: [],
      recent: [sessionFixture({ id: 'posted-1', status: 'posted', statusLabel: 'Posted' })],
    })

    const { container, cleanup } = render(createElement(InventoryCountView))
    await flush()

    const card = container.querySelector('.inventory-count-session-card')
    expect(card?.disabled).toBe(true)

    await act(async () => {
      card?.click()
    })
    expect(container.querySelector('.inventory-count-session')).toBeNull()

    cleanup()
  })

  it('does not load sessions without a workspace', async () => {
    useAuthMock.mockReturnValue({ workspace: null })
    const { container, cleanup } = render(createElement(InventoryCountView))
    await flush()

    expect(listHomeSessionsMock).not.toHaveBeenCalled()
    expect(container.textContent).toContain('No active counts.')

    cleanup()
  })
})
