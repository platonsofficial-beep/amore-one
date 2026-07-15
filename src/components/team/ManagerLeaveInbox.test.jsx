/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { ManagerLeaveInbox } from './ManagerLeaveInbox'
import { TeamPeopleView } from './TeamPeopleView'

const fetchPendingLeaveMock = vi.hoisted(() => vi.fn())

vi.mock('../../services/leaveService', () => ({
  fetchPendingLeaveForWorkspace: fetchPendingLeaveMock,
}))

const WORKSPACE_ID = 'ws-11111111-1111-1111-1111-111111111111'

const EMPLOYEES = [
  { id: 'emp-1', name: 'Alex Rivera', department: 'Service' },
  { id: 'emp-2', name: 'Bailey Chen', department: 'Kitchen' },
]

const PENDING_LEAVE = [
  {
    id: 'leave-1',
    workspaceId: WORKSPACE_ID,
    employeeId: 'emp-1',
    leaveType: 'vacation',
    status: 'pending',
    startDate: '2026-08-01',
    endDate: '2026-08-05',
    createdAt: '2026-07-20T09:15:00.000Z',
  },
]

function renderInbox(props = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(createElement(ManagerLeaveInbox, {
      workspaceId: WORKSPACE_ID,
      employees: EMPLOYEES,
      ...props,
    }))
  })

  return {
    container,
    cleanup: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

function renderTeamPeople(props = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(createElement(TeamPeopleView, {
      employees: EMPLOYEES,
      rosterEmployees: EMPLOYEES,
      totalEmployeeCount: EMPLOYEES.length,
      selectedEmployee: null,
      onSelectEmployee: vi.fn(),
      activeFilter: 'All',
      onFilterChange: vi.fn(),
      onOpenAddEmployee: vi.fn(),
      onOpenEditEmployee: vi.fn(),
      onRequestDeleteEmployee: vi.fn(),
      isLoading: false,
      workspaceId: WORKSPACE_ID,
      ...props,
    }))
  })

  return {
    container,
    cleanup: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

describe('ManagerLeaveInbox', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchPendingLeaveMock.mockResolvedValue(PENDING_LEAVE)
  })

  it('is visible for managers when Team People enables the inbox', async () => {
    const { container, cleanup } = renderTeamPeople({ showLeaveInbox: true })

    await act(async () => {
      await Promise.resolve()
    })

    expect(container.querySelector('.manager-leave-inbox')).not.toBeNull()
    cleanup()
  })

  it('is hidden for staff when Team People disables the inbox', async () => {
    const { container, cleanup } = renderTeamPeople({ showLeaveInbox: false })

    await act(async () => {
      await Promise.resolve()
    })

    expect(container.querySelector('.manager-leave-inbox')).toBeNull()
    cleanup()
  })

  it('shows a loading state while pending leave is fetched', () => {
    let resolveFetch
    fetchPendingLeaveMock.mockImplementation(() => new Promise((resolve) => {
      resolveFetch = resolve
    }))

    const { container, cleanup } = renderInbox()

    expect(container.textContent).toContain('Loading pending leave requests…')

    act(() => {
      resolveFetch(PENDING_LEAVE)
    })

    cleanup()
  })

  it('shows a premium empty state when there are no pending requests', async () => {
    fetchPendingLeaveMock.mockResolvedValue([])
    const { container, cleanup } = renderInbox()

    await act(async () => {
      await Promise.resolve()
    })

    expect(container.textContent).toContain('No pending leave requests.')
    cleanup()
  })

  it('renders a read-only pending leave list', async () => {
    const { container, cleanup } = renderInbox()

    await act(async () => {
      await Promise.resolve()
    })

    expect(container.textContent).toContain('Alex Rivera')
    expect(container.textContent).toContain('Vacation')
    expect(container.textContent).toContain('2026-08-01')
    expect(container.textContent).toContain('2026-08-05')
    expect(container.textContent).toContain('5 days')
    expect(container.textContent).toContain('2026-07-20')
    cleanup()
  })

  it('calls fetchPendingLeaveForWorkspace with the active workspace id', async () => {
    const { cleanup } = renderInbox()

    await act(async () => {
      await Promise.resolve()
    })

    expect(fetchPendingLeaveMock).toHaveBeenCalledWith(WORKSPACE_ID)
    expect(fetchPendingLeaveMock).toHaveBeenCalledTimes(1)
    cleanup()
  })

  it('renders a pending status badge', async () => {
    const { container, cleanup } = renderInbox()

    await act(async () => {
      await Promise.resolve()
    })

    const badge = container.querySelector('.status-pill.pending')
    expect(badge?.textContent).toBe('Pending')
    cleanup()
  })

  it('renders friendly service errors', async () => {
    fetchPendingLeaveMock.mockRejectedValue(new Error('leave_requests table is not ready yet.'))
    const { container, cleanup } = renderInbox()

    await act(async () => {
      await Promise.resolve()
    })

    expect(container.textContent).toContain('leave_requests table is not ready yet.')
    cleanup()
  })

  it('does not render any action buttons', async () => {
    const { container, cleanup } = renderInbox()

    await act(async () => {
      await Promise.resolve()
    })

    expect(container.querySelector('.primary-btn')).toBeNull()
    expect(container.querySelector('.ghost-btn')).toBeNull()
    expect(container.textContent).not.toMatch(/approve|reject|cancel|edit/i)
    cleanup()
  })

  it('keeps existing Team People behavior unchanged', async () => {
    const { container, cleanup } = renderTeamPeople({ showLeaveInbox: false })

    await act(async () => {
      await Promise.resolve()
    })

    expect(container.querySelector('.team-people-page')).not.toBeNull()
    expect(container.querySelector('.team-people-add-btn')?.textContent).toContain('Add Employee')
    expect(container.querySelectorAll('.team-people-card')).toHaveLength(2)
    cleanup()
  })
})
