import { describe, expect, it } from 'vitest'
import {
  DEPARTMENTS_UNAVAILABLE_MESSAGE,
  SUPPLY_STORAGE_LABEL,
  SUPPLY_STORAGE_LABEL_EL,
  UNASSIGNED_STORAGE_GROUP_ID,
  groupActiveStoragesByDepartment,
  isWorkspaceDepartmentSchemaMissing,
  validateWorkspaceDepartmentName,
} from './stockDepartmentGroups.js'

describe('validateWorkspaceDepartmentName', () => {
  it('trims a usable name and rejects empty or overlong names', () => {
    expect(validateWorkspaceDepartmentName('  Bar  ')).toEqual({
      ok: true,
      value: 'Bar',
      error: '',
    })
    expect(validateWorkspaceDepartmentName('   ').ok).toBe(false)
    expect(validateWorkspaceDepartmentName('x'.repeat(81)).ok).toBe(false)
  })
})

describe('isWorkspaceDepartmentSchemaMissing', () => {
  it('matches a missing department column or table and ignores other errors', () => {
    expect(isWorkspaceDepartmentSchemaMissing({
      code: 'PGRST204',
      message: "Could not find the 'department_id' column of 'workspace_storages' in the schema cache",
    })).toBe(true)
    expect(isWorkspaceDepartmentSchemaMissing({
      code: '42P01',
      message: 'relation "public.workspace_departments" does not exist',
    })).toBe(true)
    expect(isWorkspaceDepartmentSchemaMissing({
      code: '42703',
      message: 'column workspace_storages.is_supply does not exist',
    })).toBe(true)
    expect(isWorkspaceDepartmentSchemaMissing({
      message: 'permission denied',
    })).toBe(false)
    expect(isWorkspaceDepartmentSchemaMissing({
      code: '42703',
      message: 'column workspace_storages.not_a_department does not exist',
    })).toBe(false)
  })
})

describe('groupActiveStoragesByDepartment', () => {
  const departments = [
    { id: 'd-kitchen', name: 'Kitchen', active: true, sortOrder: 2 },
    { id: 'd-bar', name: 'Bar', active: true, sortOrder: 1 },
    { id: 'd-old', name: 'Old cellar', active: false, sortOrder: 0 },
  ]

  const storages = [
    { id: 'soft', name: 'Soft drinks', departmentId: null, isSupply: true },
    { id: 'spirits', name: 'Spirits', departmentId: 'd-bar', isSupply: true },
    { id: 'wines', name: 'Wines', departmentId: 'd-bar', isSupply: true },
    { id: 'back', name: 'Back bar', departmentId: 'd-bar', isSupply: false },
    { id: 'pastry', name: 'Pastry', departmentId: 'd-old', isSupply: false },
    { id: 'loose', name: 'Loose shelf', departmentId: null, isSupply: false },
  ]

  it('groups shelves under departments, keeps every supply storage, and leaves null in Unassigned', () => {
    const groups = groupActiveStoragesByDepartment({
      storages,
      departments,
      includeEmptyDepartments: true,
    })

    expect(groups.map((group) => group.name)).toEqual([
      'Bar',
      'Kitchen',
      'Unassigned',
      'Old cellar',
    ])
    expect(groups.find((group) => group.id === 'd-bar')?.storages.map((storage) => storage.id))
      .toEqual(['spirits', 'wines', 'back'])
    expect(groups.find((group) => group.id === 'd-bar')?.storages.filter((storage) => storage.isSupply))
      .toHaveLength(2)
    expect(groups.find((group) => group.id === 'd-kitchen')?.storages).toEqual([])
    expect(groups.find((group) => group.id === UNASSIGNED_STORAGE_GROUP_ID)?.storages.map((storage) => storage.id))
      .toEqual(['soft', 'loose'])
    expect(groups.find((group) => group.id === 'd-old')?.active).toBe(false)
    expect(groups.find((group) => group.id === 'd-old')?.storages.map((storage) => storage.id))
      .toEqual(['pastry'])
  })

  it('hides empty departments for staff and still shows Unassigned shelves', () => {
    const groups = groupActiveStoragesByDepartment({
      storages,
      departments,
      includeEmptyDepartments: false,
    })

    expect(groups.map((group) => group.name)).toEqual(['Bar', 'Unassigned', 'Old cellar'])
    expect(groups.find((group) => group.name === 'Kitchen')).toBeUndefined()
  })

  it('keeps a storage whose department is missing from the catalog', () => {
    const groups = groupActiveStoragesByDepartment({
      storages: [{ id: 'orphan', name: 'Orphan', departmentId: 'd-missing', isSupply: true }],
      departments: [],
    })

    expect(groups.map((group) => group.id)).toEqual(['d-missing'])
    expect(groups[0].storages[0].isSupply).toBe(true)
  })

  it('returns no groups when nothing is assigned and empty groups are hidden', () => {
    expect(groupActiveStoragesByDepartment({
      storages: [],
      departments,
      includeEmptyDepartments: false,
    })).toEqual([])
  })
})

describe('supply storage copy', () => {
  it('uses the venue supply label', () => {
    expect(SUPPLY_STORAGE_LABEL).toBe('Supply storage')
    expect(SUPPLY_STORAGE_LABEL_EL).toBe('Αποθήκη τροφοδοσίας')
    expect(DEPARTMENTS_UNAVAILABLE_MESSAGE).toMatch(/Storages still work/)
  })
})
