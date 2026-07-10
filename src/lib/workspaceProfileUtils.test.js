import { describe, expect, it } from 'vitest'
import {
  areWorkspaceProfilesEqual,
  buildWorkspaceIdentityLines,
  isWorkspaceProfileConfigured,
  normalizeLocationDisplayValue,
  shouldInitializeWorkspaceProfileDraft,
} from './workspaceProfileUtils'

describe('workspaceProfileUtils', () => {
  it('normalizes country and city display values', () => {
    expect(normalizeLocationDisplayValue('cyprus')).toBe('Cyprus')
    expect(normalizeLocationDisplayValue('nicosia')).toBe('Nicosia')
    expect(normalizeLocationDisplayValue('  new   york  ')).toBe('New York')
  })
  it('detects configured workspace profiles', () => {
    expect(isWorkspaceProfileConfigured({ businessName: 'Amore' })).toBe(true)
    expect(isWorkspaceProfileConfigured({ managerName: 'Alex' })).toBe(true)
    expect(isWorkspaceProfileConfigured({})).toBe(false)
  })

  it('compares workspace profile drafts for dirty state', () => {
    const saved = {
      businessName: 'Amore',
      managerName: 'Alex',
      managerRole: 'GM',
      timezone: 'Europe/Nicosia',
      currency: 'EUR',
      logoUrl: '',
    }

    expect(areWorkspaceProfilesEqual(saved, { ...saved })).toBe(true)
    expect(areWorkspaceProfilesEqual(saved, { ...saved, businessName: 'Amore 2' })).toBe(false)
  })

  it('builds workspace identity lines when business and account names differ', () => {
    const identity = buildWorkspaceIdentityLines({
      workspaceName: 'amore-nicosia',
      businessName: 'Amore Nicosia',
    })

    expect(identity.primary).toBe('Amore Nicosia')
    expect(identity.technicalName).toBe('amore-nicosia')
    expect(identity.hint).toContain('Business Profile')
  })

  it('only initializes the profile draft when entering settings', () => {
    expect(shouldInitializeWorkspaceProfileDraft('today', 'settings')).toBe(true)
    expect(shouldInitializeWorkspaceProfileDraft('settings', 'settings')).toBe(false)
    expect(shouldInitializeWorkspaceProfileDraft('settings', 'team')).toBe(false)
  })
})
