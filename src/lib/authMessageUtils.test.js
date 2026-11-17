import { describe, expect, it, vi } from 'vitest'
import { formatAuthErrorMessage } from './authMessageUtils'

describe('authMessageUtils', () => {
  it('maps session expiry errors to friendly copy', () => {
    expect(formatAuthErrorMessage('JWT expired')).toBe('Your session expired. Sign in again to continue.')
    expect(formatAuthErrorMessage('Invalid Refresh Token: Already Used')).toBe(
      'Your session expired. Sign in again to continue.',
    )
  })

  it('maps invalid credentials to friendly copy', () => {
    expect(formatAuthErrorMessage('Invalid login credentials')).toBe(
      'Email or password is incorrect. Try again or reset your password.',
    )
  })

  it('hides an unknown server error behind a generic message', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(formatAuthErrorMessage('Database error querying schema')).toBe(
      'Something went wrong. Try again in a moment.',
    )
    expect(spy).toHaveBeenCalled()
    expect(formatAuthErrorMessage('Database error querying schema')).not.toContain('Database error')
    spy.mockRestore()
  })
})
