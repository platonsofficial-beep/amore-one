/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { ManagerLeaveInbox } from './ManagerLeaveInbox'
import { ManagerLeaveDetailsDrawer } from './ManagerLeaveDetailsDrawer'
import { TeamPeopleView } from './TeamPeopleView'

const fetchPendingLeaveMock = vi.hoisted(() => vi.fn())
const approveLeaveRequestMock = vi.hoisted(() => vi.fn())
const rejectLeaveRequestMock = vi.hoisted(() => vi.fn())

vi.mock('../../services/leaveService', () => ({
  fetchPendingLeaveForWorkspace: fetchPendingLeaveMock,
  approveLeaveRequest: approveLeaveRequestMock,
  rejectLeaveRequest: rejectLeaveRequestMock,
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
    note: 'Family trip abroad',
    createdAt: '2026-07-20T09:15:00.000Z',
  },
]

const PENDING_LEAVE_WITHOUT_NOTE = [
  {
    id: 'leave-2',
    workspaceId: WORKSPACE_ID,
    employeeId: 'emp-2',
    leaveType: 'sick',
    status: 'pending',
    startDate: '2026-08-10',
    endDate: '2026-08-11',
    note: '',
    createdAt: '2026-07-21T11:00:00.000Z',
  },
]

const DECISION_NOTE = 'Coverage unavailable'

function getDrawerFooterApproveButton(container) {
  return container.querySelector('.manager-leave-details-drawer-footer .primary-btn')
}

function getDrawerFooterRejectButton(container) {
  return container.querySelector('.manager-leave-details-drawer-footer .ghost-btn')
}

function getRejectionReasonInput(container) {
  return container.querySelector('.manager-leave-rejection-reason')
}

function setNativeValue(element, value) {
  const prototype = Object.getPrototypeOf(element)
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value')
  const setValue = descriptor?.set

  if (setValue) {
    setValue.call(element, value)
  } else {
    element.value = value
  }

  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

function setRejectionReasonValue(container, value) {
  const textarea = getRejectionReasonInput(container)
  setNativeValue(textarea, value)
}

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
    approveLeaveRequestMock.mockResolvedValue({
      id: 'leave-1',
      workspaceId: WORKSPACE_ID,
      employeeId: 'emp-1',
      status: 'approved',
      leaveType: 'vacation',
      startDate: '2026-08-01',
      endDate: '2026-08-05',
    })
    rejectLeaveRequestMock.mockResolvedValue({
      id: 'leave-1',
      workspaceId: WORKSPACE_ID,
      employeeId: 'emp-1',
      status: 'rejected',
      leaveType: 'vacation',
      startDate: '2026-08-01',
      endDate: '2026-08-05',
    })
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

  it('does not render any inbox list action buttons', async () => {
    const { container, cleanup } = renderInbox()

    await act(async () => {
      await Promise.resolve()
    })

    expect(container.querySelector('.manager-leave-inbox-list .primary-btn')).toBeNull()
    expect(container.querySelector('.manager-leave-inbox-list .ghost-btn')).toBeNull()
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

describe('ManagerLeaveDetailsDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchPendingLeaveMock.mockResolvedValue(PENDING_LEAVE)
    approveLeaveRequestMock.mockResolvedValue({
      id: 'leave-1',
      workspaceId: WORKSPACE_ID,
      employeeId: 'emp-1',
      status: 'approved',
      leaveType: 'vacation',
      startDate: '2026-08-01',
      endDate: '2026-08-05',
    })
    rejectLeaveRequestMock.mockResolvedValue({
      id: 'leave-1',
      workspaceId: WORKSPACE_ID,
      employeeId: 'emp-1',
      status: 'rejected',
      leaveType: 'vacation',
      startDate: '2026-08-01',
      endDate: '2026-08-05',
    })
  })

  async function openDrawer(container) {
    await act(async () => {
      await Promise.resolve()
    })

    await act(async () => {
      container.querySelector('.manager-leave-inbox-row')?.click()
    })
  }

  it('opens the drawer from a pending leave row click', async () => {
    const { container, cleanup } = renderInbox()

    await openDrawer(container)

    expect(container.querySelector('.manager-leave-details-drawer')).not.toBeNull()
    cleanup()
  })

  it('closes the drawer from the close button, backdrop, and Escape', async () => {
    const { container, cleanup } = renderInbox()

    await openDrawer(container)
    expect(container.querySelector('.manager-leave-details-drawer')).not.toBeNull()

    await act(async () => {
      container.querySelector('.manager-leave-details-drawer .icon-btn')?.click()
    })
    expect(container.querySelector('.manager-leave-details-drawer')).toBeNull()

    await openDrawer(container)
    await act(async () => {
      container.querySelector('.drawer-backdrop')?.click()
    })
    expect(container.querySelector('.manager-leave-details-drawer')).toBeNull()

    await openDrawer(container)
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(container.querySelector('.manager-leave-details-drawer')).toBeNull()

    cleanup()
  })

  it('renders the correct leave information in the drawer', async () => {
    const { container, cleanup } = renderInbox()

    await openDrawer(container)

    const drawer = container.querySelector('.manager-leave-details-drawer')
    expect(drawer?.textContent).toContain('Alex Rivera')
    expect(drawer?.textContent).toContain('Vacation')
    expect(drawer?.textContent).toContain('2026-08-01')
    expect(drawer?.textContent).toContain('2026-08-05')
    expect(drawer?.textContent).toContain('5 days')
    expect(drawer?.textContent).toContain('2026-07-20')
    cleanup()
  })

  it('displays the note when one is present', async () => {
    const { container, cleanup } = renderInbox()

    await openDrawer(container)

    expect(container.querySelector('.manager-leave-details-drawer')?.textContent)
      .toContain('Family trip abroad')
    cleanup()
  })

  it('shows the muted placeholder when no note is provided', async () => {
    fetchPendingLeaveMock.mockResolvedValue(PENDING_LEAVE_WITHOUT_NOTE)
    const { container, cleanup } = renderInbox()

    await openDrawer(container)

    const note = container.querySelector('.manager-leave-details-drawer-note')
    expect(note?.textContent).toBe('No note provided.')
    expect(note?.className).toContain('is-empty')
    cleanup()
  })

  it('renders a pending badge in the drawer', async () => {
    const { container, cleanup } = renderInbox()

    await openDrawer(container)

    const badge = container.querySelector('.manager-leave-details-drawer .status-pill.pending')
    expect(badge?.textContent).toBe('Pending')
    cleanup()
  })

  it('does not render cancel request, edit, or delete actions in the drawer', async () => {
    const { container, cleanup } = renderInbox()

    await openDrawer(container)

    const drawer = container.querySelector('.manager-leave-details-drawer')
    expect(drawer?.textContent).toMatch(/Approve Leave/)
    expect(drawer?.textContent).toMatch(/Reject Leave/)
    expect(drawer?.textContent).not.toMatch(/cancel request|edit|delete/i)
    cleanup()
  })

  it('keeps existing inbox list behavior unchanged after adding the drawer', async () => {
    const { container, cleanup } = renderInbox()

    await act(async () => {
      await Promise.resolve()
    })

    expect(container.querySelector('.manager-leave-inbox-list')).not.toBeNull()
    expect(container.querySelectorAll('.manager-leave-inbox-row')).toHaveLength(1)
    expect(fetchPendingLeaveMock).toHaveBeenCalledTimes(1)
    cleanup()
  })

  it('maintains manager-only inbox visibility through Team People', async () => {
    const hidden = renderTeamPeople({ showLeaveInbox: false })
    await act(async () => { await Promise.resolve() })
    expect(hidden.container.querySelector('.manager-leave-inbox')).toBeNull()
    hidden.cleanup()

    const visible = renderTeamPeople({ showLeaveInbox: true })
    await act(async () => { await Promise.resolve() })
    expect(visible.container.querySelector('.manager-leave-inbox')).not.toBeNull()
    visible.cleanup()
  })

  it('does not perform any write operations when opening the drawer', async () => {
    const { container, cleanup } = renderInbox()

    await openDrawer(container)

    expect(fetchPendingLeaveMock).toHaveBeenCalledTimes(1)
    expect(approveLeaveRequestMock).not.toHaveBeenCalled()
    expect(rejectLeaveRequestMock).not.toHaveBeenCalled()
    cleanup()
  })

  it('shows the Approve Leave button for pending requests', async () => {
    const { container, cleanup } = renderInbox()

    await openDrawer(container)

    const approveButton = getDrawerFooterApproveButton(container)
    expect(approveButton?.textContent).toBe('Approve Leave')
    cleanup()
  })

  it('hides the Approve Leave button for non-pending requests', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(createElement(ManagerLeaveDetailsDrawer, {
        leaveDetail: {
          id: 'leave-approved',
          status: 'approved',
          statusLabel: 'Approved',
          employeeName: 'Alex Rivera',
          leaveTypeLabel: 'Vacation',
          startDate: '2026-08-01',
          endDate: '2026-08-05',
          durationLabel: '5 days',
          submittedDate: '2026-07-20',
          note: '',
        },
        workspaceId: WORKSPACE_ID,
        onClose: vi.fn(),
        onApproved: vi.fn(),
        onRejected: vi.fn(),
      }))
    })

    expect(container.querySelector('.manager-leave-details-drawer-footer')).toBeNull()

    act(() => root.unmount())
    container.remove()
  })

  it('opens the approval confirmation dialog', async () => {
    const { container, cleanup } = renderInbox()

    await openDrawer(container)

    await act(async () => {
      container.querySelector('.manager-leave-details-drawer-footer .primary-btn')?.click()
    })

    expect(container.querySelector('.manager-leave-approve-confirm-modal')).not.toBeNull()
    expect(container.textContent).toContain('Approve leave request?')
    expect(container.textContent).toContain(
      'This will approve the leave request and cannot be undone from this screen.',
    )
    cleanup()
  })

  it('closes the confirmation dialog when Cancel is clicked', async () => {
    const { container, cleanup } = renderInbox()

    await openDrawer(container)

    await act(async () => {
      container.querySelector('.manager-leave-details-drawer-footer .primary-btn')?.click()
    })

    await act(async () => {
      container.querySelector('.manager-leave-approve-confirm-modal .ghost-btn')?.click()
    })

    expect(container.querySelector('.manager-leave-approve-confirm-modal')).toBeNull()
    expect(container.querySelector('.manager-leave-details-drawer')).not.toBeNull()
    cleanup()
  })

  it('calls approveLeaveRequest with the active workspace and leave request ids', async () => {
    fetchPendingLeaveMock.mockResolvedValueOnce(PENDING_LEAVE)
    fetchPendingLeaveMock.mockResolvedValueOnce([])
    const { container, cleanup } = renderInbox()

    await openDrawer(container)

    await act(async () => {
      container.querySelector('.manager-leave-details-drawer-footer .primary-btn')?.click()
    })

    await act(async () => {
      container.querySelector('.manager-leave-approve-confirm-modal .primary-btn')?.click()
      await Promise.resolve()
    })

    expect(approveLeaveRequestMock).toHaveBeenCalledWith(WORKSPACE_ID, 'leave-1')
    cleanup()
  })

  it('prevents duplicate approval calls on rapid confirm clicks', async () => {
    let resolveApprove
    approveLeaveRequestMock.mockImplementation(() => new Promise((resolve) => {
      resolveApprove = resolve
    }))
    const { container, cleanup } = renderInbox()

    await openDrawer(container)

    await act(async () => {
      container.querySelector('.manager-leave-details-drawer-footer .primary-btn')?.click()
    })

    const confirmButton = container.querySelector('.manager-leave-approve-confirm-modal .primary-btn')

    await act(async () => {
      confirmButton?.click()
      confirmButton?.click()
    })

    expect(approveLeaveRequestMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveApprove({
        id: 'leave-1',
        workspaceId: WORKSPACE_ID,
        employeeId: 'emp-1',
        status: 'approved',
        leaveType: 'vacation',
        startDate: '2026-08-01',
        endDate: '2026-08-05',
      })
      await Promise.resolve()
    })

    cleanup()
  })

  it('disables drawer and confirmation controls while approval is running', async () => {
    let resolveApprove
    approveLeaveRequestMock.mockImplementation(() => new Promise((resolve) => {
      resolveApprove = resolve
    }))
    const { container, cleanup } = renderInbox()

    await openDrawer(container)

    await act(async () => {
      container.querySelector('.manager-leave-details-drawer-footer .primary-btn')?.click()
    })

    await act(async () => {
      container.querySelector('.manager-leave-approve-confirm-modal .primary-btn')?.click()
    })

    expect(container.querySelector('.manager-leave-approve-confirm-modal .primary-btn')?.textContent)
      .toBe('Approving…')
    expect(container.querySelector('.manager-leave-approve-confirm-modal .ghost-btn')?.disabled).toBe(true)
    expect(container.querySelector('.manager-leave-details-drawer .icon-btn')?.disabled).toBe(true)

    await act(async () => {
      resolveApprove({
        id: 'leave-1',
        workspaceId: WORKSPACE_ID,
        employeeId: 'emp-1',
        status: 'approved',
        leaveType: 'vacation',
        startDate: '2026-08-01',
        endDate: '2026-08-05',
      })
      await Promise.resolve()
    })

    cleanup()
  })

  it('refreshes the inbox and shows a success banner after approval', async () => {
    fetchPendingLeaveMock.mockResolvedValueOnce(PENDING_LEAVE)
    fetchPendingLeaveMock.mockResolvedValueOnce([])
    const { container, cleanup } = renderInbox()

    await openDrawer(container)

    await act(async () => {
      container.querySelector('.manager-leave-details-drawer-footer .primary-btn')?.click()
    })

    await act(async () => {
      container.querySelector('.manager-leave-approve-confirm-modal .primary-btn')?.click()
      await Promise.resolve()
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(fetchPendingLeaveMock).toHaveBeenCalledTimes(2)
    expect(container.textContent).toContain('Leave request approved.')
    cleanup()
  })

  it('closes the drawer after a successful approval', async () => {
    const { container, cleanup } = renderInbox()

    await openDrawer(container)

    await act(async () => {
      container.querySelector('.manager-leave-details-drawer-footer .primary-btn')?.click()
    })

    await act(async () => {
      container.querySelector('.manager-leave-approve-confirm-modal .primary-btn')?.click()
      await Promise.resolve()
    })

    expect(container.querySelector('.manager-leave-details-drawer')).toBeNull()
    cleanup()
  })

  it('keeps the drawer open and shows a friendly error when approval fails', async () => {
    approveLeaveRequestMock.mockRejectedValue(
      new Error('This leave request has already been approved.'),
    )
    const { container, cleanup } = renderInbox()

    await openDrawer(container)

    await act(async () => {
      container.querySelector('.manager-leave-details-drawer-footer .primary-btn')?.click()
    })

    await act(async () => {
      container.querySelector('.manager-leave-approve-confirm-modal .primary-btn')?.click()
      await Promise.resolve()
    })

    const drawer = container.querySelector('.manager-leave-details-drawer')
    expect(container.querySelector('.manager-leave-approve-confirm-modal')).toBeNull()
    expect(drawer).not.toBeNull()
    expect(drawer?.querySelector('.staff-status-banner')?.textContent)
      .toBe('This leave request has already been approved.')
    expect(drawer?.querySelector('.manager-leave-details-drawer-footer .primary-btn')?.disabled).toBe(false)
    expect(fetchPendingLeaveMock).toHaveBeenCalledTimes(1)
    expect(approveLeaveRequestMock).toHaveBeenCalledTimes(1)
    cleanup()
  })

  it('shows the Reject Leave button for pending requests', async () => {
    const { container, cleanup } = renderInbox()

    await openDrawer(container)

    expect(getDrawerFooterRejectButton(container)?.textContent).toBe('Reject Leave')
    cleanup()
  })

  it('hides reject and approve actions for non-pending requests', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(createElement(ManagerLeaveDetailsDrawer, {
        leaveDetail: {
          id: 'leave-approved',
          status: 'approved',
          statusLabel: 'Approved',
          employeeName: 'Alex Rivera',
          leaveTypeLabel: 'Vacation',
          startDate: '2026-08-01',
          endDate: '2026-08-05',
          durationLabel: '5 days',
          submittedDate: '2026-07-20',
          note: '',
        },
        workspaceId: WORKSPACE_ID,
        onClose: vi.fn(),
        onApproved: vi.fn(),
        onRejected: vi.fn(),
      }))
    })

    expect(container.querySelector('.manager-leave-details-drawer-footer')).toBeNull()
    expect(container.querySelector('.manager-leave-rejection-reason')).toBeNull()

    act(() => root.unmount())
    container.remove()
  })

  it('disables Reject Leave until a reason is provided', async () => {
    const { container, cleanup } = renderInbox()

    await openDrawer(container)

    expect(getDrawerFooterRejectButton(container)?.disabled).toBe(true)
    cleanup()
  })

  it('rejects whitespace-only rejection reasons', async () => {
    const { container, cleanup } = renderInbox()

    await openDrawer(container)

    await act(async () => {
      setRejectionReasonValue(container, '   ')
    })

    expect(getDrawerFooterRejectButton(container)?.disabled).toBe(true)
    cleanup()
  })

  it('opens the rejection confirmation dialog', async () => {
    const { container, cleanup } = renderInbox()

    await openDrawer(container)

    await act(async () => {
      setRejectionReasonValue(container, DECISION_NOTE)
    })

    await act(async () => {
      getDrawerFooterRejectButton(container)?.click()
    })

    expect(container.querySelector('.manager-leave-reject-confirm-modal')).not.toBeNull()
    expect(container.textContent).toContain('Reject leave request?')
    expect(container.textContent).toContain(
      'This will reject the leave request and cannot be undone from this screen.',
    )
    cleanup()
  })

  it('closes the rejection confirmation dialog when Cancel is clicked', async () => {
    const { container, cleanup } = renderInbox()

    await openDrawer(container)

    await act(async () => {
      setRejectionReasonValue(container, DECISION_NOTE)
      getDrawerFooterRejectButton(container)?.click()
    })

    await act(async () => {
      container.querySelector('.manager-leave-reject-confirm-modal .ghost-btn')?.click()
    })

    expect(container.querySelector('.manager-leave-reject-confirm-modal')).toBeNull()
    expect(container.querySelector('.manager-leave-details-drawer')).not.toBeNull()
    cleanup()
  })

  it('calls rejectLeaveRequest with workspace, leave request, and decision note', async () => {
    fetchPendingLeaveMock.mockResolvedValueOnce(PENDING_LEAVE)
    fetchPendingLeaveMock.mockResolvedValueOnce([])
    const { container, cleanup } = renderInbox()

    await openDrawer(container)

    await act(async () => {
      setRejectionReasonValue(container, `  ${DECISION_NOTE}  `)
      getDrawerFooterRejectButton(container)?.click()
    })

    await act(async () => {
      container.querySelector('.manager-leave-reject-confirm-modal .primary-btn')?.click()
      await Promise.resolve()
    })

    expect(rejectLeaveRequestMock).toHaveBeenCalledWith(WORKSPACE_ID, 'leave-1', DECISION_NOTE)
    cleanup()
  })

  it('prevents duplicate rejection calls on rapid confirm clicks', async () => {
    let resolveReject
    rejectLeaveRequestMock.mockImplementation(() => new Promise((resolve) => {
      resolveReject = resolve
    }))
    const { container, cleanup } = renderInbox()

    await openDrawer(container)

    await act(async () => {
      setRejectionReasonValue(container, DECISION_NOTE)
      getDrawerFooterRejectButton(container)?.click()
    })

    const confirmButton = container.querySelector('.manager-leave-reject-confirm-modal .primary-btn')

    await act(async () => {
      confirmButton?.click()
      confirmButton?.click()
    })

    expect(rejectLeaveRequestMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveReject({
        id: 'leave-1',
        workspaceId: WORKSPACE_ID,
        employeeId: 'emp-1',
        status: 'rejected',
        leaveType: 'vacation',
        startDate: '2026-08-01',
        endDate: '2026-08-05',
      })
      await Promise.resolve()
    })

    cleanup()
  })

  it('disables drawer and confirmation controls while rejection is running', async () => {
    let resolveReject
    rejectLeaveRequestMock.mockImplementation(() => new Promise((resolve) => {
      resolveReject = resolve
    }))
    const { container, cleanup } = renderInbox()

    await openDrawer(container)

    await act(async () => {
      setRejectionReasonValue(container, DECISION_NOTE)
      getDrawerFooterRejectButton(container)?.click()
    })

    await act(async () => {
      container.querySelector('.manager-leave-reject-confirm-modal .primary-btn')?.click()
    })

    expect(container.querySelector('.manager-leave-reject-confirm-modal .primary-btn')?.textContent)
      .toBe('Rejecting…')
    expect(container.querySelector('.manager-leave-reject-confirm-modal .ghost-btn')?.disabled).toBe(true)
    expect(getDrawerFooterApproveButton(container)?.disabled).toBe(true)
    expect(container.querySelector('.manager-leave-details-drawer .icon-btn')?.disabled).toBe(true)

    await act(async () => {
      resolveReject({
        id: 'leave-1',
        workspaceId: WORKSPACE_ID,
        employeeId: 'emp-1',
        status: 'rejected',
        leaveType: 'vacation',
        startDate: '2026-08-01',
        endDate: '2026-08-05',
      })
      await Promise.resolve()
    })

    cleanup()
  })

  it('refreshes the inbox and shows a success banner after rejection', async () => {
    fetchPendingLeaveMock.mockResolvedValueOnce(PENDING_LEAVE)
    fetchPendingLeaveMock.mockResolvedValueOnce([])
    const { container, cleanup } = renderInbox()

    await openDrawer(container)

    await act(async () => {
      setRejectionReasonValue(container, DECISION_NOTE)
      getDrawerFooterRejectButton(container)?.click()
    })

    await act(async () => {
      container.querySelector('.manager-leave-reject-confirm-modal .primary-btn')?.click()
      await Promise.resolve()
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(fetchPendingLeaveMock).toHaveBeenCalledTimes(2)
    expect(container.textContent).toContain('Leave request rejected.')
    cleanup()
  })

  it('closes the drawer after a successful rejection', async () => {
    const { container, cleanup } = renderInbox()

    await openDrawer(container)

    await act(async () => {
      setRejectionReasonValue(container, DECISION_NOTE)
      getDrawerFooterRejectButton(container)?.click()
    })

    await act(async () => {
      container.querySelector('.manager-leave-reject-confirm-modal .primary-btn')?.click()
      await Promise.resolve()
    })

    expect(container.querySelector('.manager-leave-details-drawer')).toBeNull()
    cleanup()
  })

  it('closes confirmation and keeps the drawer open with the reason preserved when rejection fails', async () => {
    rejectLeaveRequestMock.mockRejectedValue(
      new Error('This leave request has already been rejected.'),
    )
    const { container, cleanup } = renderInbox()

    await openDrawer(container)

    await act(async () => {
      setRejectionReasonValue(container, DECISION_NOTE)
      getDrawerFooterRejectButton(container)?.click()
    })

    await act(async () => {
      container.querySelector('.manager-leave-reject-confirm-modal .primary-btn')?.click()
      await Promise.resolve()
    })

    const drawer = container.querySelector('.manager-leave-details-drawer')
    expect(container.querySelector('.manager-leave-reject-confirm-modal')).toBeNull()
    expect(drawer).not.toBeNull()
    expect(getRejectionReasonInput(container)?.value).toBe(DECISION_NOTE)
    expect(drawer?.querySelector('.staff-status-banner')?.textContent)
      .toBe('This leave request has already been rejected.')
    expect(getDrawerFooterRejectButton(container)?.disabled).toBe(false)
    expect(getDrawerFooterApproveButton(container)?.disabled).toBe(false)
    expect(fetchPendingLeaveMock).toHaveBeenCalledTimes(1)
    expect(rejectLeaveRequestMock).toHaveBeenCalledTimes(1)
    cleanup()
  })

  it('keeps the existing approval flow unchanged', async () => {
    fetchPendingLeaveMock.mockResolvedValueOnce(PENDING_LEAVE)
    fetchPendingLeaveMock.mockResolvedValueOnce([])
    const { container, cleanup } = renderInbox()

    await openDrawer(container)

    await act(async () => {
      getDrawerFooterApproveButton(container)?.click()
    })

    await act(async () => {
      container.querySelector('.manager-leave-approve-confirm-modal .primary-btn')?.click()
      await Promise.resolve()
    })

    expect(approveLeaveRequestMock).toHaveBeenCalledWith(WORKSPACE_ID, 'leave-1')
    expect(rejectLeaveRequestMock).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Leave request approved.')
    cleanup()
  })
})
