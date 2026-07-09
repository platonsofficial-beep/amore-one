import { describe, expect, it } from 'vitest'
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
})
