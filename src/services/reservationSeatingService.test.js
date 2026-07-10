import { describe, expect, it } from 'vitest'
import { validateReservationSeatingForm } from '../lib/reservationSeatings'
import { createReservationSeating } from './reservationSeatingService'

const POPULATED_FORM = {
  name: 'Brunch',
  startTime: '10:00',
  durationMinutes: 120,
  daysOfWeek: [1, 2, 3, 4, 5, 6],
  isActive: true,
}

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
