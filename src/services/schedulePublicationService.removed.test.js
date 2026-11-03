import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
const getShifts = vi.fn()
vi.mock('../lib/supabaseClient', () => ({ supabase: { rpc: (...args) => rpc(...args) } }))
vi.mock('./scheduleService', () => ({ getShifts: (...args) => getShifts(...args) }))

const { publishWeekSchedule } = await import('./schedulePublicationService')
const { setDisabledEmployeeIds } = await import('../lib/removedEmployeeShifts')

const base = { role: 'Server', area: 'Floor', startTime: '10:00', endTime: '18:00', status: 'Scheduled', notes: '' }

describe('publishWeekSchedule with hidden shifts of disabled people', () => {
  beforeEach(() => {
    rpc.mockReset()
    getShifts.mockReset()
    rpc.mockResolvedValue({ data: { publication: { id: 'p', week_start_date: '2099-01-05', status: 'published', revision: 1 }, published_shifts: [] }, error: null })
  })

  it('re-reads the week and sends hidden draft rows unchanged', async () => {
    setDisabledEmployeeIds(['e-off'])
    const visible = { ...base, id: 'a', employeeId: 'e1', date: '2099-01-06' }
    const hidden = { ...base, id: 'b', employeeId: 'e-off', date: '2099-01-07' }
    getShifts.mockResolvedValue([visible, hidden])

    await publishWeekSchedule({ workspaceId: 'w', weekStartDate: '2099-01-05', draftShifts: [visible], expectedRevision: 0, requestId: 'r' })

    expect(getShifts).toHaveBeenCalledWith('w', { startDate: '2099-01-05', endDate: '2099-01-11', includeRemoved: true })
    const sent = rpc.mock.calls[0][1].p_draft_shifts.map((shift) => shift.id)
    expect(sent).toEqual(['a', 'b'])
    setDisabledEmployeeIds([])
  })

  it('does not add shifts that are simply not in view (other people)', async () => {
    const visible = { ...base, id: 'a', employeeId: 'e1', date: '2099-01-06' }
    const other = { ...base, id: 'c', employeeId: 'e2', date: '2099-01-08' }
    getShifts.mockResolvedValue([visible, other])
    await publishWeekSchedule({ workspaceId: 'w', weekStartDate: '2099-01-05', draftShifts: [visible], expectedRevision: 0, requestId: 'r' })
    expect(rpc.mock.calls[0][1].p_draft_shifts.map((shift) => shift.id)).toEqual(['a'])
  })
})
