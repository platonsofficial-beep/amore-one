import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolveUserDisplayName } from './userDisplayName'
import { buildEmployeeStatusOptions, planEmployeeStatusSave } from './employeeStatusSave'
import { countActivePeople } from '../components/team/TeamPeopleView'

const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8')

describe('0036 (1) display name', () => {
  const membership = { employeeId: 'e1', displayName: 'one-test+manager', email: 'one-test+manager@example.com' }
  it('prefers the linked employee name over an email-derived display name', () => {
    expect(resolveUserDisplayName({ membership, employees: [{ id: 'e1', name: 'TEST Role Manager' }] })).toBe('TEST Role Manager')
    expect(resolveUserDisplayName({ membership, employees: [{ id: 'e1', full_name: 'TEST Role Staff' }] })).toBe('TEST Role Staff')
  })
  it('then profile full_name, then the email', () => {
    expect(resolveUserDisplayName({ membership, employees: [], user: { user_metadata: { full_name: 'Real Name' } } })).toBe('Real Name')
    expect(resolveUserDisplayName({ membership, employees: [], user: {} })).toBe('one-test+manager')
    expect(resolveUserDisplayName({ membership: { displayName: 'Chip Name' }, employees: [] })).toBe('Chip Name')
  })
  it('profile screens use the resolved name', () => {
    expect(app).not.toContain("displayName: `${membership?.displayName ?? ''}`.trim() || resolvedUserDisplayName")
  })
})

describe('0036 (2) people count', () => {
  it('counts active people only', () => {
    expect(countActivePeople([{ id: 1 }, { id: 2, active: false }, { id: 3, status: 'Disabled' }])).toBe(1)
  })
})

describe('0036 (3) Disabled in the edit form', () => {
  it('offers Disabled only when editing', () => {
    expect(buildEmployeeStatusOptions([{ value: 'Working' }], { isEditing: true }).map((o) => o.value)).toEqual(['Working', 'Disabled'])
    expect(buildEmployeeStatusOptions([{ value: 'Working' }]).map((o) => o.value)).toEqual(['Working'])
  })
  it('Disabled uses the Disable action (with confirm), other statuses re-enable', () => {
    expect(planEmployeeStatusSave({ editingEmployee: { status: 'Working' }, formStatus: 'Disabled' }))
      .toEqual({ payloadStatus: 'Working', accessChange: 'disable', needsConfirm: true })
    expect(planEmployeeStatusSave({ editingEmployee: { active: false, status: 'Disabled' }, formStatus: 'Working' }).accessChange).toBe('enable')
    expect(planEmployeeStatusSave({ editingEmployee: { status: 'Working' }, formStatus: 'Break' }).accessChange).toBeNull()
    expect(planEmployeeStatusSave({ formStatus: 'Disabled' }).payloadStatus).toBe('Working')
  })
  it('the save path calls setEmployeeEnabled', () => {
    expect(app).toContain("if (statusPlan.accessChange === 'disable') {\n        await setEmployeeEnabled(activeWorkspaceId, editingEmployee.id, false)")
  })
})
