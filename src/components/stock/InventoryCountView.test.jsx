/**
 * @vitest-environment jsdom
 * P8.16.27 / P8.16.28 — Inventory Count home hydration + completion actions.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { InventoryCountView } from './InventoryCountView'

const listHomeSessionsMock = vi.fn()
const getSessionMock = vi.fn()
const previewFinishMock = vi.fn()
const postFinishMock = vi.fn()
const cancelSessionMock = vi.fn()
const useAuthMock = vi.fn()

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}))

vi.mock('../../services/inventoryCountService', () => ({
  listInventoryCountHomeSessions: (...args) => listHomeSessionsMock(...args),
  getInventoryCountSession: (...args) => getSessionMock(...args),
  previewInventoryCountFinish: (...args) => previewFinishMock(...args),
  postInventoryCountFinish: (...args) => postFinishMock(...args),
  cancelInventoryCountSession: (...args) => cancelSessionMock(...args),
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

function getButtonByText(root, text) {
  return Array.from(root.querySelectorAll('button')).find((button) => button.textContent === text)
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
  getSessionMock.mockReset()
  previewFinishMock.mockReset()
  postFinishMock.mockReset()
  cancelSessionMock.mockReset()
  listHomeSessionsMock.mockResolvedValue({
    active: [],
    paused: [],
    recent: [],
  })
  getSessionMock.mockResolvedValue(sessionFixture({ id: 'session-1' }))
  previewFinishMock.mockResolvedValue({ canPost: true })
  postFinishMock.mockResolvedValue({
    sessionId: 'complete-1',
    workspaceId: 'workspace-test-id',
    status: 'posted',
    message: 'Inventory count posted successfully.',
  })
  cancelSessionMock.mockResolvedValue({
    id: 'complete-1',
    status: 'cancelled',
  })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.clearAllMocks()
  window.confirm?.mockRestore?.()
})

describe('InventoryCountView live home hydration (P8.16.27)', () => {
  it('shows empty states only after a confirmed empty dataset', async () => {
    const { container, cleanup } = render(createElement(InventoryCountView))
    await flush()

    expect(listHomeSessionsMock).toHaveBeenCalledWith({ workspaceId: 'workspace-test-id' })
    expect(container.textContent).toContain('No active counts.')
    expect(container.textContent).toContain('No paused counts.')
    expect(container.textContent).toContain('No completed counts yet.')
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
          progressLabel: '1 / 8 items counted',
        }),
        sessionFixture({
          id: 'complete-1',
          status: 'counting_complete',
          statusLabel: 'Counting complete',
          countTypeLabel: 'New Count',
          progressLabel: 'All locations completed · Waiting for Finish',
        }),
      ],
      paused: [
        sessionFixture({
          id: 'paused-1',
          status: 'paused',
          statusLabel: 'Paused',
          countTypeLabel: 'Partial Count',
          progressLabel: '0 / 2 items counted',
        }),
      ],
      recent: [
        sessionFixture({
          id: 'posted-1',
          status: 'posted',
          statusLabel: 'Posted',
          countTypeLabel: 'Emergency Count',
          postedAt: '2026-07-22T12:00:00.000Z',
          progressLabel: '8 / 8 items counted',
        }),
      ],
    })

    const { container, cleanup } = render(createElement(InventoryCountView))
    await flush()

    expect(container.textContent).toContain('Quick Count')
    expect(container.textContent).toContain('Counting complete')
    expect(container.textContent).toContain('Paused')
    expect(container.textContent).toContain('Posted')
    expect(container.textContent).toContain('1 / 8 items counted')
    expect(container.textContent).toContain('All locations completed · Waiting for Finish')
    expect(container.textContent).toContain('0 / 2 items counted')
    expect(container.querySelectorAll('.inventory-count-session-card')).toHaveLength(4)

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

    cleanup()
  })
})

describe('InventoryCountView completion actions (P8.16.28)', () => {
  it('shows Review, Post Count, and Cancel Count for counting_complete', async () => {
    listHomeSessionsMock.mockResolvedValue({
      active: [
        sessionFixture({
          id: 'complete-1',
          status: 'counting_complete',
          statusLabel: 'Counting complete',
          countTypeLabel: 'New Count',
        }),
      ],
      paused: [],
      recent: [],
    })

    const { container, cleanup } = render(createElement(InventoryCountView))
    await flush()

    expect(getButtonByText(container, 'Review')).toBeTruthy()
    expect(getButtonByText(container, 'Post Count')).toBeTruthy()
    expect(getButtonByText(container, 'Cancel Count')).toBeTruthy()

    cleanup()
  })

  it('Review opens the existing workspace', async () => {
    listHomeSessionsMock.mockResolvedValue({
      active: [
        sessionFixture({
          id: 'complete-review',
          status: 'counting_complete',
          statusLabel: 'Counting complete',
        }),
      ],
      paused: [],
      recent: [],
    })

    const { container, cleanup } = render(createElement(InventoryCountView))
    await flush()

    await act(async () => {
      getButtonByText(container, 'Review')?.click()
    })

    expect(container.querySelector('.inventory-count-session')?.getAttribute('data-session-id'))
      .toBe('complete-review')

    cleanup()
  })

  it('Post refreshes Home and moves the session to Recent', async () => {
    listHomeSessionsMock
      .mockResolvedValueOnce({
        active: [
          sessionFixture({
            id: 'complete-1',
            status: 'counting_complete',
            statusLabel: 'Counting complete',
            countTypeLabel: 'New Count',
          }),
        ],
        paused: [],
        recent: [],
      })
      .mockResolvedValueOnce({
        active: [],
        paused: [],
        recent: [
          sessionFixture({
            id: 'complete-1',
            status: 'posted',
            statusLabel: 'Posted',
            countTypeLabel: 'New Count',
          }),
        ],
      })

    const { container, cleanup } = render(createElement(InventoryCountView))
    await flush()

    await act(async () => {
      getButtonByText(container, 'Post Count')?.click()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(previewFinishMock).toHaveBeenCalledWith({
      workspaceId: 'workspace-test-id',
      sessionId: 'complete-1',
    })
    expect(postFinishMock).toHaveBeenCalledWith({
      workspaceId: 'workspace-test-id',
      sessionId: 'complete-1',
    })
    expect(listHomeSessionsMock).toHaveBeenCalledTimes(2)
    expect(container.textContent).toContain('Posted')
    expect(container.textContent).toContain('No active counts.')
    expect(container.textContent).toContain('Inventory count posted successfully.')
    expect(getButtonByText(container, 'Post Count')).toBeFalsy()

    cleanup()
  })

  it('Cancel refreshes Home and removes the session from Active and Recent', async () => {
    listHomeSessionsMock
      .mockResolvedValueOnce({
        active: [
          sessionFixture({
            id: 'complete-1',
            status: 'counting_complete',
            statusLabel: 'Counting complete',
          }),
        ],
        paused: [],
        recent: [],
      })
      .mockResolvedValueOnce({
        active: [],
        paused: [],
        recent: [],
      })

    const { container, cleanup } = render(createElement(InventoryCountView))
    await flush()

    await act(async () => {
      getButtonByText(container, 'Cancel Count')?.click()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(window.confirm).toHaveBeenCalled()
    expect(cancelSessionMock).toHaveBeenCalledWith({
      workspaceId: 'workspace-test-id',
      sessionId: 'complete-1',
    })
    expect(listHomeSessionsMock).toHaveBeenCalledTimes(2)
    expect(container.textContent).toContain('No active counts.')
    expect(container.textContent).toContain('No completed counts yet.')
    expect(container.textContent).toContain('Inventory count cancelled.')
    expect(container.textContent).not.toContain('Counting complete')

    cleanup()
  })

  it('does not cancel when confirmation is declined', async () => {
    window.confirm.mockReturnValueOnce(false)
    listHomeSessionsMock.mockResolvedValue({
      active: [
        sessionFixture({
          id: 'complete-1',
          status: 'counting_complete',
          statusLabel: 'Counting complete',
        }),
      ],
      paused: [],
      recent: [],
    })

    const { container, cleanup } = render(createElement(InventoryCountView))
    await flush()

    await act(async () => {
      getButtonByText(container, 'Cancel Count')?.click()
    })

    expect(cancelSessionMock).not.toHaveBeenCalled()
    expect(listHomeSessionsMock).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('Counting complete')

    cleanup()
  })
})

describe('InventoryCountView deep link open (P8.16.30)', () => {
  it('opens the exact session workspace from initialOpenSessionId', async () => {
    const onApplied = vi.fn()
    getSessionMock.mockResolvedValue(sessionFixture({
      id: 'deep-link-session',
      status: 'in_progress',
      workspaceId: 'workspace-test-id',
    }))

    const { container, cleanup } = render(createElement(InventoryCountView, {
      initialOpenSessionId: 'deep-link-session',
      onInitialOpenSessionApplied: onApplied,
    }))

    await flush()
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onApplied).toHaveBeenCalled()
    expect(getSessionMock).toHaveBeenCalledWith({
      workspaceId: 'workspace-test-id',
      sessionId: 'deep-link-session',
    })
    expect(container.querySelector('.inventory-count-session')?.getAttribute('data-session-id'))
      .toBe('deep-link-session')
    expect(container.querySelector('.inventory-count-page')).toBeNull()

    cleanup()
  })

  it('falls back to Inventory Count home with a notice when the session is missing', async () => {
    const onApplied = vi.fn()
    getSessionMock.mockRejectedValue(new Error('Inventory count session was not found.'))

    const { container, cleanup } = render(createElement(InventoryCountView, {
      initialOpenSessionId: 'missing-session',
      onInitialOpenSessionApplied: onApplied,
    }))

    await flush()
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onApplied).toHaveBeenCalled()
    expect(container.querySelector('.inventory-count-session')).toBeNull()
    expect(container.querySelector('.inventory-count-page')).toBeTruthy()
    expect(container.textContent).toContain(
      'That inventory count could not be found. It may already be closed.',
    )

    cleanup()
  })

  it('falls back safely when the linked session is no longer open', async () => {
    getSessionMock.mockResolvedValue(sessionFixture({
      id: 'posted-session',
      status: 'posted',
      statusLabel: 'Posted',
    }))

    const { container, cleanup } = render(createElement(InventoryCountView, {
      initialOpenSessionId: 'posted-session',
      onInitialOpenSessionApplied: vi.fn(),
    }))

    await flush()
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.querySelector('.inventory-count-session')).toBeNull()
    expect(container.textContent).toContain('That inventory count is no longer open.')

    cleanup()
  })
})
