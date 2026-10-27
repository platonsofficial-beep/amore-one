import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { validateReservationSeatingForm } from '../lib/reservationSeatings'
import { createReservationSeating, getReservationSeatings } from './reservationSeatingService'

const POPULATED_FORM = {
  name: 'Brunch',
  startTime: '10:00',
  durationMinutes: 120,
  daysOfWeek: [1, 2, 3, 4, 5, 6],
  isActive: true,
}

describe('reservation seating viewport fixture', () => {
  const store = new Map()

  beforeAll(() => {
    globalThis.localStorage = {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    }
  })

  afterEach(() => {
    store.clear()
  })

  it('reads harness seatings from localStorage only when Supabase is not configured', async () => {
    localStorage.setItem('amore-viewport-seatings-v1', JSON.stringify([
      {
        id: 'preview-brunch',
        name: 'Brunch',
        start_time: '10:00',
        duration_minutes: 120,
        days_of_week: [0, 1, 2, 3, 4, 5, 6],
        sort_order: 0,
        is_active: true,
      },
    ]))

    const seatings = await getReservationSeatings('dev-workspace-id')
    expect(seatings.map((seating) => seating.name)).toEqual(['Brunch'])
  })
})

describe('reservation seating create path', () => {
  it('passes a non-null seating object from populated form validation', () => {
    const validation = validateReservationSeatingForm(POPULATED_FORM)

    expect(validation.ok).toBe(true)
    expect(validation.seating).toBeTruthy()
    expect(validation.seating.name).toBe('Brunch')
    expect(validation.seating.daysOfWeek).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('uses canonical createReservationSeating object signature', async () => {
    await expect(createReservationSeating({
      workspaceId: '',
      seating: POPULATED_FORM,
    })).rejects.toThrow('Workspace is required for reservation seatings.')
  })

  it('rejects missing seating details before database call', async () => {
    await expect(createReservationSeating({
      workspaceId: 'ws-1',
      seating: null,
    })).rejects.toThrow('Seating details are required.')
  })

  it('shows workspace-specific error when workspace id is missing', async () => {
    const validation = validateReservationSeatingForm(POPULATED_FORM)
    expect(validation.ok).toBe(true)

    await expect(createReservationSeating({
      workspaceId: '   ',
      seating: validation.seating,
    })).rejects.toThrow('Workspace is required for reservation seatings.')
  })

  it('preserves selected days in validated payload', () => {
    const validation = validateReservationSeatingForm({
      ...POPULATED_FORM,
      daysOfWeek: [0, 6],
    })

    expect(validation.ok).toBe(true)
    expect(validation.seating.daysOfWeek).toEqual([0, 6])
  })

  it('does not report generic seating required for populated form serialization', () => {
    const validation = validateReservationSeatingForm(POPULATED_FORM)
    expect(validation.error).toBeUndefined()
    expect(validation.seating).toMatchObject({
      name: 'Brunch',
      startTime: '10:00',
      durationMinutes: 120,
    })
  })
})

describe('reservation seating submit flow contract', () => {
  it('keeps form data on service failure and surfaces safe error message', async () => {
    const form = { ...POPULATED_FORM }
    const validation = validateReservationSeatingForm(form)
    let notice = ''
    let isSaving = true

    try {
      await createReservationSeating({
        workspaceId: '',
        seating: validation.seating,
      })
    } catch (error) {
      notice = error.message || 'Unable to save seating right now.'
    } finally {
      isSaving = false
    }

    expect(form.name).toBe('Brunch')
    expect(form.daysOfWeek).toEqual([1, 2, 3, 4, 5, 6])
    expect(notice).toBe('Workspace is required for reservation seatings.')
    expect(isSaving).toBe(false)
  })
})
