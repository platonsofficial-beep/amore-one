import { describe, expect, it, vi } from 'vitest'
import {
  formatUserFacingLoadError,
  isLoadFailureMessage,
  presentLoadFailure,
  presentUserError,
  unavailableFigure,
} from './userFacingLoadError'

const RAW = "Cannot read properties of null (reading 'from')"

describe('userFacingLoadError', () => {
  it('never returns a raw JavaScript exception', () => {
    const error = new TypeError(RAW)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const message = presentLoadFailure(error, 'the schedule')

    expect(message).toBe("Couldn't load the schedule. Check your connection and try again.")
    expect(message).not.toContain('Cannot read properties')
    expect(message).not.toContain('from')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('keeps a product sentence and replaces a technical one', () => {
    expect(presentUserError(new Error('Only staff can submit a shelf count.'), 'Try again.')).toBe(
      'Only staff can submit a shelf count.',
    )
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(presentUserError(new TypeError(RAW), 'Try again.')).toBe('Try again.')
    spy.mockRestore()
  })

  it('treats our plain load copy as a failure and hides fake figures', () => {
    expect(isLoadFailureMessage(formatUserFacingLoadError('operations'))).toBe(true)
    expect(isLoadFailureMessage('Schedule published for employees.')).toBe(false)
    expect(unavailableFigure(true, 0)).toBe('—')
    expect(unavailableFigure(false, 0)).toBe(0)
  })
})
