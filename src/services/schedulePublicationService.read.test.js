import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
vi.mock('../lib/supabaseClient', () => ({ supabase: { rpc: (...args) => rpc(...args) } }))
vi.mock('./scheduleService', () => ({ getShifts: vi.fn() }))

const { getWeekSchedulePublicationState } = await import('./schedulePublicationService')

describe('getWeekSchedulePublicationState', () => {
  beforeEach(() => {
    rpc.mockReset()
  })

  it('treats the multi-venue snapshot refusal as an unpublished week', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'schedule_publication_single_workspace_required' },
    })

    await expect(getWeekSchedulePublicationState('2026-11-23', 'ws-sentio')).resolves.toMatchObject({
      publication: { weekStartDate: '2026-11-23', status: 'draft', revision: 0 },
      publishedShifts: [],
    })
  })

  it('treats a missing publication payload as unpublished', async () => {
    rpc.mockResolvedValue({ data: { publication: null, published_shifts: [] }, error: null })

    await expect(getWeekSchedulePublicationState('2026-11-23', 'ws-sentio')).resolves.toMatchObject({
      publication: { status: 'draft' },
      publishedShifts: [],
    })
  })

  it('still throws a real snapshot error', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'schedule_publication_forbidden' },
    })

    await expect(getWeekSchedulePublicationState('2026-11-23', 'ws-sentio')).rejects.toThrow(/permission/i)
  })
})
