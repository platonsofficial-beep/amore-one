import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rpcMock, fromMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  fromMock: vi.fn(),
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: (...args) => rpcMock(...args),
    from: (...args) => fromMock(...args),
  },
}))

import {
  clockIn,
  clockOut,
  decideException,
  editEntry,
  endBreak,
  loadAttendanceEntries,
  requestEdit,
  setAttendanceSettings,
  startBreak,
} from './attendanceService'

function query(result) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    or: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    in: vi.fn(() => builder),
    order: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
  }
  return builder
}

describe('attendance RPCs', () => {
  beforeEach(() => {
    rpcMock.mockReset()
    fromMock.mockReset()
    rpcMock.mockResolvedValue({ data: { ok: true }, error: null })
  })

  it('calls clock in and clock out with location and an optional note', async () => {
    await clockIn({
      workspaceId: 'ws-1',
      lat: 35.1,
      lng: 33.3,
      accuracy: 12,
      note: null,
    })
    await clockOut({
      workspaceId: 'ws-1',
      lat: 35.1,
      lng: 33.3,
      accuracy: 40,
      note: 'GPS is weak inside',
    })

    expect(rpcMock).toHaveBeenNthCalledWith(1, 'attendance_clock_in', {
      p_workspace_id: 'ws-1',
      p_lat: 35.1,
      p_lng: 33.3,
      p_accuracy: 12,
      p_note: null,
    })
    expect(rpcMock).toHaveBeenNthCalledWith(2, 'attendance_clock_out', {
      p_workspace_id: 'ws-1',
      p_lat: 35.1,
      p_lng: 33.3,
      p_accuracy: 40,
      p_note: 'GPS is weak inside',
    })
  })

  it('calls break, edit, decide, and settings RPCs by their live names', async () => {
    await startBreak('ws-1')
    await endBreak('ws-1')
    await requestEdit({
      entryId: 'entry-1',
      clockInAt: '2026-10-27T18:04:00.000Z',
      clockOutAt: '2026-10-28T02:00:00.000Z',
      reason: 'Forgot to clock out',
    })
    await decideException({ exceptionId: 'ex-1', approve: true, note: 'Looks right' })
    await editEntry({
      entryId: 'entry-1',
      clockInAt: '2026-10-27T18:00:00.000Z',
      clockOutAt: '2026-10-28T02:00:00.000Z',
      note: 'Fixed from the timesheet',
    })
    await setAttendanceSettings({
      workspaceId: 'ws-1',
      lat: 35.18,
      lng: 33.38,
      radiusM: 50,
      lateGraceMinutes: 10,
      requireLocation: true,
      timezone: 'Europe/Nicosia',
    })

    expect(rpcMock.mock.calls.map((call) => call[0])).toEqual([
      'attendance_break_start',
      'attendance_break_end',
      'attendance_request_edit',
      'attendance_decide_exception',
      'attendance_edit_entry',
      'attendance_set_settings',
    ])
    expect(rpcMock).toHaveBeenCalledWith('attendance_set_settings', {
      p_workspace_id: 'ws-1',
      p_lat: 35.18,
      p_lng: 33.38,
      p_radius_m: 50,
      p_late_grace_minutes: 10,
      p_require_location: true,
      p_timezone: 'Europe/Nicosia',
    })
  })

  it('reads attendance entries and does not write the table', async () => {
    const builder = query({ data: [], error: null })
    fromMock.mockReturnValue(builder)

    await loadAttendanceEntries('ws-1', {
      fromDate: '2026-10-26',
      toDate: '2026-11-01',
      memberId: 'member-1',
    })

    expect(fromMock).toHaveBeenCalledWith('attendance_entries')
    expect(builder.eq).toHaveBeenCalledWith('workspace_id', 'ws-1')
    expect(builder.eq).toHaveBeenCalledWith('member_id', 'member-1')
    expect(rpcMock).not.toHaveBeenCalled()
  })
})
