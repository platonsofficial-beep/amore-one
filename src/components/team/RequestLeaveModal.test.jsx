/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { RequestLeaveActionButton, RequestLeaveModal } from './RequestLeaveModal'

const requestLeaveMock = vi.hoisted(() => vi.fn())
const fetchEmployeeLeaveHistoryMock = vi.hoisted(() => vi.fn())
const approveLeaveRequestMock = vi.hoisted(() => vi.fn())
const rejectLeaveRequestMock = vi.hoisted(() => vi.fn())
const useAuthMock = vi.hoisted(() => vi.fn())

vi.mock('../../services/leaveService', () => ({
  requestLeave: requestLeaveMock,
  fetchEmployeeLeaveHistory: fetchEmployeeLeaveHistoryMock,
  approveLeaveRequest: approveLeaveRequestMock,
  rejectLeaveRequest: rejectLeaveRequestMock,
}))

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}))

const WORKSPACE_ID = 'ws-11111111-1111-1111-1111-111111111111'
const EMPLOYEE_ID = 'emp-1'

const LEAVE_HISTORY = [
  {
    id: 'leave-new',
    workspaceId: WORKSPACE_ID,
    employeeId: EMPLOYEE_ID,
    leaveType: 'vacation',
    status: 'approved',
    startDate: '2026-08-01',
    endDate: '2026-08-05',
    note: 'Family trip',
    createdAt: '2026-07-20T10:00:00.000Z',
  },
  {
    id: 'leave-old',
    workspaceId: WORKSPACE_ID,
    employeeId: EMPLOYEE_ID,
    leaveType: 'sick',
    status: 'pending',
    startDate: '2026-06-01',
    endDate: '2026-06-02',
    note: '',
    createdAt: '2026-05-15T09:00:00.000Z',
  },
]

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

function renderActionButton(props = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const onOpen = vi.fn()

  act(() => {
    root.render(createElement(RequestLeaveActionButton, {
      isVisible: true,
      onOpen,
      ...props,
    }))
  })

  return {
    container,
    onOpen,
    cleanup: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

function renderModal(props = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const onClose = vi.fn()

  act(() => {
    root.render(createElement(RequestLeaveModal, {
      isOpen: true,
      workspaceId: WORKSPACE_ID,
      onClose,
      ...props,
    }))
  })

  return {
    container,
    onClose,
    cleanup: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

function fillValidForm(container) {
  const leaveType = container.querySelector('select')
  const startDate = container.querySelector('input[type="date"]')
  const endDate = container.querySelectorAll('input[type="date"]')[1]
  const note = container.querySelector('textarea')

  act(() => {
    setNativeValue(leaveType, 'vacation')
    setNativeValue(startDate, '2026-08-01')
    setNativeValue(endDate, '2026-08-05')
    setNativeValue(note, 'Family trip')
  })
}

async function submitForm(container) {
  await act(async () => {
    container.querySelector('.primary-btn')?.click()
    await Promise.resolve()
  })
}

describe('RequestLeave staff UI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthMock.mockReturnValue({
      membership: { employeeId: EMPLOYEE_ID },
    })
    fetchEmployeeLeaveHistoryMock.mockResolvedValue([])
    requestLeaveMock.mockResolvedValue({
      id: 'leave-1',
      workspaceId: WORKSPACE_ID,
      employeeId: 'emp-1',
      status: 'pending',
      leaveType: 'vacation',
      startDate: '2026-08-01',
      endDate: '2026-08-05',
    })
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the Request Leave action only when visible', () => {
    const visible = renderActionButton({ isVisible: true })
    expect(visible.container.querySelector('.schedule-request-leave-btn')?.textContent).toBe('Request Leave')
    visible.cleanup()

    const hidden = renderActionButton({ isVisible: false })
    expect(hidden.container.querySelector('.schedule-request-leave-btn')).toBeNull()
    hidden.cleanup()
  })

  it('opens the dialog from the action button', () => {
    const { container, onOpen, cleanup } = renderActionButton()

    act(() => {
      container.querySelector('.schedule-request-leave-btn')?.click()
    })

    expect(onOpen).toHaveBeenCalledTimes(1)
    cleanup()
  })

  it('renders the request leave dialog when open', () => {
    const { container, cleanup } = renderModal()
    expect(container.querySelector('.request-leave-modal')).not.toBeNull()
    expect(container.querySelector('#request-leave-title')?.textContent).toBe('Request Leave')
    cleanup()
  })

  it('closes the dialog from cancel', () => {
    const { container, onClose, cleanup } = renderModal()

    act(() => {
      container.querySelector('.ghost-btn')?.click()
    })

    expect(onClose).toHaveBeenCalledTimes(1)
    cleanup()
  })

  it('blocks submit when required fields are missing', async () => {
    const { container, cleanup } = renderModal()

    await submitForm(container)

    expect(requestLeaveMock).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Leave type is required.')
    expect(container.textContent).toContain('Start date is required.')
    expect(container.textContent).toContain('End date is required.')
    cleanup()
  })

  it('blocks submit for invalid date ranges', async () => {
    const { container, cleanup } = renderModal()
    const leaveType = container.querySelector('select')
    const startDate = container.querySelector('input[type="date"]')
    const endDate = container.querySelectorAll('input[type="date"]')[1]

    act(() => {
      setNativeValue(leaveType, 'vacation')
      setNativeValue(startDate, '2026-08-10')
      setNativeValue(endDate, '2026-08-05')
    })

    await submitForm(container)

    expect(requestLeaveMock).not.toHaveBeenCalled()
    expect(container.textContent).toContain('End date must be on or after start date.')
    cleanup()
  })

  it('passes the active workspace id to requestLeave', async () => {
    const { container, cleanup } = renderModal()
    fillValidForm(container)

    await submitForm(container)

    expect(requestLeaveMock).toHaveBeenCalledWith(WORKSPACE_ID, expect.any(Object))
    cleanup()
  })

  it('passes the expected requestLeave payload', async () => {
    const { container, cleanup } = renderModal()
    fillValidForm(container)

    await submitForm(container)

    expect(requestLeaveMock).toHaveBeenCalledWith(WORKSPACE_ID, {
      leaveType: 'vacation',
      startDate: '2026-08-01',
      endDate: '2026-08-05',
      note: 'Family trip',
    })
    cleanup()
  })

  it('does not pass employee or actor fields to requestLeave', async () => {
    const { container, cleanup } = renderModal()
    fillValidForm(container)

    await submitForm(container)

    const [, payload] = requestLeaveMock.mock.calls[0]
    expect(payload).toEqual({
      leaveType: 'vacation',
      startDate: '2026-08-01',
      endDate: '2026-08-05',
      note: 'Family trip',
    })
    expect(payload).not.toHaveProperty('employeeId')
    expect(payload).not.toHaveProperty('createdBy')
    expect(payload).not.toHaveProperty('status')
    cleanup()
  })

  it('shows a loading state while submitting', async () => {
    let resolveRequest
    requestLeaveMock.mockImplementation(() => new Promise((resolve) => {
      resolveRequest = resolve
    }))

    const { container, cleanup } = renderModal()
    fillValidForm(container)

    await act(async () => {
      container.querySelector('.primary-btn')?.click()
      await Promise.resolve()
    })

    const submitButton = container.querySelector('.primary-btn')
    expect(submitButton?.textContent).toBe('Submitting…')
    expect(submitButton?.disabled).toBe(true)

    await act(async () => {
      resolveRequest({
        id: 'leave-1',
        workspaceId: WORKSPACE_ID,
        employeeId: 'emp-1',
        status: 'pending',
        leaveType: 'vacation',
        startDate: '2026-08-01',
        endDate: '2026-08-05',
      })
      await Promise.resolve()
    })

    cleanup()
  })

  it('prevents duplicate submit while the first request is in flight', async () => {
    let resolveRequest
    requestLeaveMock.mockImplementation(() => new Promise((resolve) => {
      resolveRequest = resolve
    }))

    const { container, cleanup } = renderModal()
    fillValidForm(container)

    await act(async () => {
      container.querySelector('.primary-btn')?.click()
      container.querySelector('.primary-btn')?.click()
      await Promise.resolve()
    })

    expect(requestLeaveMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveRequest({
        id: 'leave-1',
        workspaceId: WORKSPACE_ID,
        employeeId: 'emp-1',
        status: 'pending',
        leaveType: 'vacation',
        startDate: '2026-08-01',
        endDate: '2026-08-05',
      })
      await Promise.resolve()
    })

    cleanup()
  })

  it('shows pending-approval success confirmation and closes after completion', async () => {
    const { container, onClose, cleanup } = renderModal()
    fillValidForm(container)

    await submitForm(container)

    expect(container.textContent).toContain('Leave request submitted and pending approval.')

    await act(async () => {
      vi.advanceTimersByTime(1200)
    })

    expect(onClose).toHaveBeenCalledTimes(1)
    cleanup()
  })

  it('renders friendly service errors', async () => {
    requestLeaveMock.mockRejectedValue(new Error('Leave cannot be requested for past dates.'))

    const { container, cleanup } = renderModal()
    fillValidForm(container)

    await submitForm(container)

    expect(container.querySelector('.request-leave-error')?.textContent)
      .toBe('Leave cannot be requested for past dates.')
    cleanup()
  })

  it('clears stale state when reopened', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const onClose = vi.fn()

    act(() => {
      root.render(createElement(RequestLeaveModal, {
        isOpen: true,
        workspaceId: WORKSPACE_ID,
        onClose,
      }))
    })

    const leaveType = container.querySelector('select')
    const note = container.querySelector('textarea')

    act(() => {
      setNativeValue(leaveType, 'sick')
      setNativeValue(note, 'Doctor visit')
    })

    act(() => {
      root.render(createElement(RequestLeaveModal, {
        isOpen: false,
        workspaceId: WORKSPACE_ID,
        onClose,
      }))
    })

    act(() => {
      root.render(createElement(RequestLeaveModal, {
        isOpen: true,
        workspaceId: WORKSPACE_ID,
        onClose,
      }))
    })

    expect(container.querySelector('select')?.value).toBe('')
    expect(container.querySelector('textarea')?.value).toBe('')
    expect(container.querySelector('.request-leave-error')).toBeNull()

    act(() => root.unmount())
    container.remove()
  })

  it('keeps existing team utility behavior unchanged', async () => {
    const { resolveTeamMemberShiftState } = await import('../../lib/teamViewUtils')

    expect(resolveTeamMemberShiftState({
      startMinutes: null,
      endMinutes: null,
      nowMinutes: 10 * 60,
    })).toMatchObject({
      shiftState: 'scheduled',
      shiftStateLabel: 'Scheduled',
    })
  })

  it('shows a loading banner while leave history is loading', async () => {
    let resolveHistory
    fetchEmployeeLeaveHistoryMock.mockImplementation(() => new Promise((resolve) => {
      resolveHistory = resolve
    }))

    const { container, cleanup } = renderModal()

    expect(container.textContent).toContain('Loading leave history…')

    await act(async () => {
      resolveHistory([])
      await Promise.resolve()
    })

    cleanup()
  })

  it('shows the empty leave history state', async () => {
    fetchEmployeeLeaveHistoryMock.mockResolvedValue([])
    const { container, cleanup } = renderModal()

    await act(async () => {
      await Promise.resolve()
    })

    expect(container.textContent).toContain('You haven\'t submitted any leave requests yet.')
    cleanup()
  })

  it('shows a friendly error when leave history fails to load', async () => {
    fetchEmployeeLeaveHistoryMock.mockRejectedValue(new Error('leave_requests table is not ready yet.'))
    const { container, cleanup } = renderModal()

    await act(async () => {
      await Promise.resolve()
    })

    expect(container.querySelector('.leave-history-panel .staff-status-banner')?.textContent)
      .toBe('leave_requests table is not ready yet.')
    cleanup()
  })

  it('renders leave history rows newest first', async () => {
    fetchEmployeeLeaveHistoryMock.mockResolvedValue(LEAVE_HISTORY)
    const { container, cleanup } = renderModal()

    await act(async () => {
      await Promise.resolve()
    })

    const rows = container.querySelectorAll('.leave-history-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.textContent).toContain('Vacation')
    expect(rows[0]?.textContent).toContain('2026-08-01')
    expect(rows[1]?.textContent).toContain('Sick')
    expect(rows[1]?.textContent).toContain('2026-06-01')
    cleanup()
  })

  it('renders a pending status badge in leave history', async () => {
    fetchEmployeeLeaveHistoryMock.mockResolvedValue([
      {
        ...LEAVE_HISTORY[1],
        status: 'pending',
      },
    ])
    const { container, cleanup } = renderModal()

    await act(async () => {
      await Promise.resolve()
    })

    const badge = container.querySelector('.leave-history-panel .status-pill.pending')
    expect(badge?.textContent).toBe('Pending')
    cleanup()
  })

  it('renders an approved status badge in leave history', async () => {
    fetchEmployeeLeaveHistoryMock.mockResolvedValue([
      {
        ...LEAVE_HISTORY[0],
        status: 'approved',
      },
    ])
    const { container, cleanup } = renderModal()

    await act(async () => {
      await Promise.resolve()
    })

    const badge = container.querySelector('.leave-history-panel .status-pill.approved')
    expect(badge?.textContent).toBe('Approved')
    cleanup()
  })

  it('renders a rejected status badge in leave history', async () => {
    fetchEmployeeLeaveHistoryMock.mockResolvedValue([
      {
        ...LEAVE_HISTORY[0],
        status: 'rejected',
      },
    ])
    const { container, cleanup } = renderModal()

    await act(async () => {
      await Promise.resolve()
    })

    const badge = container.querySelector('.leave-history-panel .status-pill.rejected')
    expect(badge?.textContent).toBe('Rejected')
    cleanup()
  })

  it('renders a cancelled status badge in leave history', async () => {
    fetchEmployeeLeaveHistoryMock.mockResolvedValue([
      {
        ...LEAVE_HISTORY[0],
        status: 'cancelled',
      },
    ])
    const { container, cleanup } = renderModal()

    await act(async () => {
      await Promise.resolve()
    })

    const badge = container.querySelector('.leave-history-panel .status-pill.cancelled')
    expect(badge?.textContent).toBe('Cancelled')
    cleanup()
  })

  it('loads leave history using the authenticated membership employee id without calling write services', async () => {
    fetchEmployeeLeaveHistoryMock.mockResolvedValue(LEAVE_HISTORY)
    const { container, cleanup } = renderModal()

    await act(async () => {
      await Promise.resolve()
    })

    expect(fetchEmployeeLeaveHistoryMock).toHaveBeenCalledWith(WORKSPACE_ID, EMPLOYEE_ID)
    expect(fetchEmployeeLeaveHistoryMock).toHaveBeenCalledTimes(1)
    expect(requestLeaveMock).not.toHaveBeenCalled()
    expect(approveLeaveRequestMock).not.toHaveBeenCalled()
    expect(rejectLeaveRequestMock).not.toHaveBeenCalled()
    expect(container.textContent).not.toContain('leave-new')
    expect(container.textContent).not.toContain('leave-old')
    cleanup()
  })

  it('does not fetch leave history when the authenticated membership has no linked employee', async () => {
    useAuthMock.mockReturnValue({
      membership: { employeeId: null },
    })

    const { container, cleanup } = renderModal()

    await act(async () => {
      await Promise.resolve()
    })

    expect(fetchEmployeeLeaveHistoryMock).not.toHaveBeenCalled()
    expect(container.textContent).toContain('You haven\'t submitted any leave requests yet.')
    cleanup()
  })

  it('does not accept an employee id prop for leave history', async () => {
    fetchEmployeeLeaveHistoryMock.mockResolvedValue(LEAVE_HISTORY)

    const { container, cleanup } = renderModal({
      employeeId: 'emp-other',
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(fetchEmployeeLeaveHistoryMock).toHaveBeenCalledWith(WORKSPACE_ID, EMPLOYEE_ID)
    expect(fetchEmployeeLeaveHistoryMock).not.toHaveBeenCalledWith(WORKSPACE_ID, 'emp-other')
    cleanup()
  })

  it('keeps the existing request submission flow unchanged with history present', async () => {
    fetchEmployeeLeaveHistoryMock.mockResolvedValue(LEAVE_HISTORY)
    const { container, cleanup } = renderModal()
    fillValidForm(container)

    await act(async () => {
      await Promise.resolve()
    })

    await submitForm(container)

    expect(requestLeaveMock).toHaveBeenCalledWith(WORKSPACE_ID, {
      leaveType: 'vacation',
      startDate: '2026-08-01',
      endDate: '2026-08-05',
      note: 'Family trip',
    })
    expect(container.textContent).toContain('Leave request submitted and pending approval.')
    cleanup()
  })
})
