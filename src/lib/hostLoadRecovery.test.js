import { describe, expect, it } from 'vitest'
import { replaceReservationInCollection } from './hostFloorReservationState'
import { buildHostQueueEmptyState } from './hostQueuePipeline'
import {
  resolveFloorPlanEmptyPresentation,
  resolveListAfterRefresh,
  resolvePublishedLayoutApply,
  resolveScopedReservationRead,
  seatingHoursPanelKind,
} from './hostLoadRecovery'

const CREATED = {
  id: 'test-one',
  guestName: 'Test One Check0811',
  guests: 1,
  date: '2026-11-08',
  time: '19:00',
  status: 'Pending',
  seatingId: 'dinner-1',
}

describe('reservation refresh recovery', () => {
  it('keeps the previous list when a refresh fails', () => {
    const previous = [CREATED]
    const decision = resolveListAfterRefresh({
      previous,
      next: [],
      failed: true,
      stale: false,
    })

    expect(decision.apply).toBe(false)
    expect(decision.list).toEqual(previous)
  })

  it('ignores a stale failure after a newer success', () => {
    const newer = [CREATED]
    const decision = resolveListAfterRefresh({
      previous: newer,
      next: [],
      failed: true,
      stale: true,
    })

    expect(decision.apply).toBe(false)
    expect(decision.list).toEqual(newer)
  })

  it('replaces the list only when a newer refresh succeeds', () => {
    const serverRows = [{ ...CREATED, status: 'Pending', guestName: 'Test One Check0811 Edited' }]
    const decision = resolveListAfterRefresh({
      previous: [CREATED],
      next: serverRows,
      failed: false,
      stale: false,
    })

    expect(decision.apply).toBe(true)
    expect(decision.list).toEqual(serverRows)
  })

  it('does not let a stale success overwrite a newer list', () => {
    const newer = [{ ...CREATED, status: 'Seated' }]
    const decision = resolveListAfterRefresh({
      previous: newer,
      next: [CREATED],
      failed: false,
      stale: true,
    })

    expect(decision.apply).toBe(false)
    expect(decision.list).toEqual(newer)
  })

  it('keeps create, edit, seat, and finish records when the following reload fails', () => {
    let list = replaceReservationInCollection([], CREATED)
    list = replaceReservationInCollection(list, {
      ...CREATED,
      guestName: 'Test One Check0811 Edited',
    })
    list = replaceReservationInCollection(list, { ...list[0], status: 'Seated' })
    list = replaceReservationInCollection(list, { ...list[0], status: 'Completed' })

    const afterFailedReload = resolveListAfterRefresh({
      previous: list,
      next: [],
      failed: true,
      stale: false,
    })

    expect(afterFailedReload.list).toEqual([
      expect.objectContaining({
        id: 'test-one',
        guestName: 'Test One Check0811 Edited',
        status: 'Completed',
      }),
    ])
  })
})

describe('floor and seating load presentation', () => {
  it('distinguishes a floor that is loading, failed, or confirmed empty', () => {
    expect(resolveFloorPlanEmptyPresentation({
      hasDisplayableLayout: false,
      isLoading: true,
    })).toBe('loading')
    expect(resolveFloorPlanEmptyPresentation({
      hasDisplayableLayout: false,
      isRefreshing: true,
    })).toBe('loading')
    expect(resolveFloorPlanEmptyPresentation({
      hasDisplayableLayout: false,
      loadError: "Couldn't load",
    })).toBe('error')
    expect(resolveFloorPlanEmptyPresentation({
      hasDisplayableLayout: false,
    })).toBe('empty')
    expect(resolveFloorPlanEmptyPresentation({
      hasDisplayableLayout: true,
      loadError: "Couldn't load",
    })).toBe('floor')
  })

  it('keeps a previous layout when a refresh fails without a replacement', () => {
    expect(resolvePublishedLayoutApply({
      hasPrevious: true,
      hasIncoming: false,
      error: "Couldn't load",
      stale: false,
    })).toBe('keep-error')
  })

  it('ignores a stale layout response', () => {
    expect(resolvePublishedLayoutApply({
      hasPrevious: true,
      hasIncoming: false,
      error: null,
      stale: true,
    })).toBe('ignore')
  })

  it('clears the layout only when an empty response succeeds', () => {
    expect(resolvePublishedLayoutApply({
      hasPrevious: true,
      hasIncoming: false,
      error: null,
      stale: false,
    })).toBe('clear')
  })

  it('does not describe a failed reservation load as an empty queue', () => {
    const failed = buildHostQueueEmptyState({
      loadFailed: true,
      searchTerm: 'TEST ONE CHECK0811',
      activeFilterCount: 1,
    })
    const empty = buildHostQueueEmptyState({})

    expect(failed.title).toBe("Couldn't load reservations")
    expect(failed.copy).not.toMatch(/empty queue|No reservations/i)
    expect(failed.loadFailed).toBe(true)
    expect(empty.title).toBe('No reservations in this queue')
  })

  it('keeps a same-scope booking after a failed reload and does not call it current', () => {
    const scope = { workspaceId: 'ws', dateKey: '2026-11-08' }
    const booked = [{ ...CREATED, tableNumber: 'T101' }]
    const decision = resolveScopedReservationRead({
      previous: booked,
      previousScope: scope,
      next: [],
      failed: true,
      requestScope: scope,
      currentScope: scope,
      requestId: 2,
      currentRequestId: 2,
    })

    expect(decision.list).toEqual(booked)
    expect(decision.certainty).toBe('stale')
    expect(decision.apply).toBe(false)
  })

  it('does not keep another workspace or date when that read fails', () => {
    const decision = resolveScopedReservationRead({
      previous: [{ ...CREATED, tableNumber: 'T101' }],
      previousScope: { workspaceId: 'ws-a', dateKey: '2026-11-08' },
      next: [],
      failed: true,
      requestScope: { workspaceId: 'ws-b', dateKey: '2026-11-09' },
      currentScope: { workspaceId: 'ws-b', dateKey: '2026-11-09' },
      requestId: 3,
      currentRequestId: 3,
    })

    expect(decision.apply).toBe(true)
    expect(decision.list).toEqual([])
    expect(decision.certainty).toBe('unknown')
  })

  it('does not apply a stale date response onto the date now on screen', () => {
    const decision = resolveScopedReservationRead({
      previous: [],
      previousScope: null,
      next: [CREATED],
      failed: false,
      requestScope: { workspaceId: 'ws', dateKey: '2026-11-08' },
      currentScope: { workspaceId: 'ws', dateKey: '2026-11-09' },
      requestId: 4,
      currentRequestId: 4,
    })

    expect(decision.list).toEqual([])
    expect(decision.certainty).toBe('unknown')
    expect(decision.list).not.toContainEqual(expect.objectContaining({ date: '2026-11-08' }))
  })

  it('shows seating hours as loading, failed, empty, or ready', () => {
    expect(seatingHoursPanelKind({ activeCount: 0, isLoading: true })).toBe('loading')
    expect(seatingHoursPanelKind({ activeCount: 0, loadFailed: true })).toBe('error')
    expect(seatingHoursPanelKind({ activeCount: 0 })).toBe('empty')
    expect(seatingHoursPanelKind({ activeCount: 2, loadFailed: true })).toBe('list')
  })
})
