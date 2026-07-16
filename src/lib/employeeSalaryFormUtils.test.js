import { describe, expect, it } from 'vitest'
import { canAssignManagerInviteRole } from './permissions'
import { resolveEmployeeSalaryForSave } from './employeeSalaryFormUtils'

describe('employee salary form privacy', () => {
  it('reuses the existing Owner/GM gate for form salary visibility', () => {
    expect(canAssignManagerInviteRole('owner')).toBe(true)
    expect(canAssignManagerInviteRole('general_manager')).toBe(true)
    expect(canAssignManagerInviteRole('manager')).toBe(false)
    expect(canAssignManagerInviteRole('host')).toBe(false)
    expect(canAssignManagerInviteRole('staff')).toBe(false)
  })

  it('submits the form salary for authorized editors', () => {
    expect(resolveEmployeeSalaryForSave({
      canViewSalary: true,
      formSalary: '42000',
      existingSalary: '10000',
      isEditing: true,
    })).toBe(42000)

    expect(resolveEmployeeSalaryForSave({
      canViewSalary: true,
      formSalary: '',
      existingSalary: '10000',
      isEditing: false,
    })).toBe(null)
  })

  it('preserves the existing salary when an unauthorized editor saves', () => {
    expect(resolveEmployeeSalaryForSave({
      canViewSalary: false,
      formSalary: '',
      existingSalary: '42000',
      isEditing: true,
    })).toBe(42000)

    expect(resolveEmployeeSalaryForSave({
      canViewSalary: false,
      formSalary: '999',
      existingSalary: '42000',
      isEditing: true,
    })).toBe(42000)
  })

  it('does not invent a salary on unauthorized create', () => {
    expect(resolveEmployeeSalaryForSave({
      canViewSalary: false,
      formSalary: '999',
      existingSalary: '',
      isEditing: false,
    })).toBe(null)
  })
})
