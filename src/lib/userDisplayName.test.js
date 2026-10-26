import { describe, expect, it } from 'vitest'
import { resolveStoredUserDisplayName, resolveUserDisplayName } from './userDisplayName'

describe('resolveStoredUserDisplayName', () => {
  it('uses the linked employee name, then the membership display name', () => {
    const employees = [
      { id: 'emp-1', name: 'Platon Sachinis' },
      { id: 'emp-2', name: 'Someone Else' },
    ]
    expect(resolveStoredUserDisplayName({
      membership: { employeeId: 'emp-1', displayName: 'Chip Name' },
      employees,
    })).toBe('Platon Sachinis')
    expect(resolveStoredUserDisplayName({
      membership: { employeeId: 'missing', displayName: 'Chip Name' },
      employees,
    })).toBe('Chip Name')
    expect(resolveStoredUserDisplayName({
      membership: { display_name: 'From Column' },
    })).toBe('From Column')
  })

  it('does not invent a name from the email address', () => {
    const membership = { displayName: '', email: 'platon@example.com' }
    expect(resolveStoredUserDisplayName({ membership, user: { email: 'platon@example.com' } })).toBe('')
    expect(resolveUserDisplayName({ membership, user: { email: 'platon@example.com' } })).toBe('platon')
  })
})
