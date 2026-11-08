import { describe, expect, it } from 'vitest'
import { replaceReservationInCollection } from './hostFloorReservationState'
import { buildHostQueueEmptyState } from './hostQueuePipeline'
import {
  resolveFloorPlanEmptyPresentation,
  resolveListAfterRefresh,
  resolvePublishedLayoutApply,
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

  it('shows seating hours as loading, failed, empty, or ready', () => {
    expect(seatingHoursPanelKind({ activeCount: 0, isLoading: true })).toBe('loading')
    expect(seatingHoursPanelKind({ activeCount: 0, loadFailed: true })).toBe('error')
    expect(seatingHoursPanelKind({ activeCount: 0 })).toBe('empty')
    expect(seatingHoursPanelKind({ activeCount: 2, loadFailed: true })).toBe('list')
  })
})
