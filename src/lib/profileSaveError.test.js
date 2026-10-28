import { describe, expect, it } from 'vitest'
import { formatProfileSaveError } from './profileSaveError'
import { resolveSupplierOrderVenueName } from './stockOrderSend'

describe('formatProfileSaveError', () => {
  it('maps the employee venue mismatch to plain English', () => {
    expect(formatProfileSaveError({
      message: 'membership_employee_workspace_mismatch',
      code: 'P0001',
    })).toBe('That employee belongs to a different venue, so the profile was not saved.')
  })

  it('hides an unknown raw code', () => {
    expect(formatProfileSaveError({ message: 'some_other_trigger_code' }))
      .toBe('Unable to save profile right now.')
  })

  it('keeps a sentence that is already written for a person', () => {
    expect(formatProfileSaveError(new Error('Display name is required.')))
      .toBe('Display name is required.')
  })
})

describe('profile venue name', () => {
  it('skips the Workspace placeholder and uses the business name', () => {
    expect(resolveSupplierOrderVenueName('Workspace', 'SENTIO.NICOSIA', '')).toBe('SENTIO.NICOSIA')
  })
})
