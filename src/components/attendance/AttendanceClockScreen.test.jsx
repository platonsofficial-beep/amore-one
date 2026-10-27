/**
 * @vitest-environment jsdom
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LOCATION_CONSENT_STORAGE_KEY } from '../../lib/attendance'
import { AttendanceClockScreen } from './AttendanceClockScreen'

const { clockInMock, settingsMock } = vi.hoisted(() => ({
  clockInMock: vi.fn(),
  settingsMock: vi.fn(),
}))

vi.mock('../../services/attendanceService', () => ({
  loadAttendanceSettings: (...args) => settingsMock(...args),
  loadAttendanceEntries: vi.fn(async () => []),
  loadAttendanceShifts: vi.fn(async () => [{
    employee_id: 'emp-1',
    shift_date: '2026-10-27',
    start_time: '18:00',
    end_time: '02:00',
    area: 'Bar',
  }]),
  loadAttendanceBreaks: vi.fn(async () => []),
  clockIn: (...args) => clockInMock(...args),
  clockOut: vi.fn(),
  startBreak: vi.fn(),
  endBreak: vi.fn(),
  requestEdit: vi.fn(),
  attendanceRange: () => ({
    weekStart: '2026-10-26',
    dates: ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'],
    fromDate: '2026-10-25',
    toDate: '2026-11-01',
  }),
}))

function renderClock() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(createElement(AttendanceClockScreen, {
      workspaceId: 'ws-1',
      memberId: 'member-1',
      employeeId: 'emp-1',
      employeeName: 'Alex',
      timeZone: 'UTC',
    }))
  })
  return {
    container,
    async flush() {
      await act(async () => {
        await Promise.resolve()
        await Promise.resolve()
      })
    },
    unmount() {
      act(() => root.unmount())
      container.remove()
    },
  }
}

describe('AttendanceClockScreen', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
    clockInMock.mockReset()
    settingsMock.mockReset()
    delete navigator.geolocation
  })

  it('shows the shift and a large clock in button', async () => {
    settingsMock.mockResolvedValue({ venue_lat: null, venue_lng: null, radius_m: 50, late_grace_minutes: 10 })
    const view = renderClock()
    await view.flush()

    expect(view.container.textContent).toContain('▶ Clock in')
    expect(view.container.textContent).toContain('Venue location is not set yet')
    expect(view.container.querySelector('.attendance-action-in').textContent).toContain('Clock in')
    view.unmount()
  })

  it('asks for agreement, then offers send to manager when outside the radius', async () => {
    settingsMock.mockResolvedValue({ venue_lat: 35, venue_lng: 33, radius_m: 50, late_grace_minutes: 10 })
    clockInMock
      .mockResolvedValueOnce({ ok: false, reason: 'outside', distance_m: 350, radius_m: 50 })
      .mockResolvedValueOnce({ ok: true, is_late: false, pending_approval: true })
    navigator.geolocation = {
      getCurrentPosition(success) {
        success({ coords: { latitude: 35.2, longitude: 33.4, accuracy: 8 } })
      },
    }

    const view = renderClock()
    await view.flush()
    const clockIn = view.container.querySelector('.attendance-action-in')
    await act(async () => {
      clockIn.click()
    })

    expect(view.container.textContent).toContain('✓ I agree')
    const agree = [...view.container.querySelectorAll('button')].find((button) => button.textContent.includes('I agree'))
    await act(async () => {
      agree.click()
      await Promise.resolve()
    })
    await view.flush()

    expect(clockInMock).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'ws-1',
      lat: 35.2,
      lng: 33.4,
      accuracy: 8,
      note: null,
    }))
    expect(view.container.textContent).toContain("You're not at the venue (about 350 m away).")
    const note = view.container.querySelector('textarea')
    const send = [...view.container.querySelectorAll('button')].find((button) => button.textContent.includes('Send to manager'))
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
    await act(async () => {
      setValue.call(note, 'GPS is weak inside')
      note.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      send.click()
      await Promise.resolve()
    })
    await view.flush()

    expect(clockInMock).toHaveBeenLastCalledWith(expect.objectContaining({
      note: 'GPS is weak inside',
    }))
    expect(localStorage.getItem(LOCATION_CONSENT_STORAGE_KEY)).toBe('agreed')
    view.unmount()
  })
})
