import { describe, expect, it } from 'vitest'
import {
  canBootstrapOwnerMembership,
  resolveBootstrapMembershipRole,
} from './membershipBootstrapUtils'

describe('membershipBootstrapUtils', () => {
  it('allows owner bootstrap only when workspace has no members', () => {
    expect(resolveBootstrapMembershipRole(0)).toBe('owner')
    expect(canBootstrapOwnerMembership(0)).toBe(true)
    expect(resolveBootstrapMembershipRole(1)).toBeNull()
    expect(canBootstrapOwnerMembership(3)).toBe(false)
  })
})
