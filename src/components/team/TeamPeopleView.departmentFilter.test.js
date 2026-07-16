import { describe, expect, it } from 'vitest'
import {
  DEPARTMENT_FILTERS,
  employeeMatchesPeopleDepartmentFilter,
  employeeMatchesPeopleSearch,
} from './TeamPeopleView'

function filterEmployees(employees, { activeFilter = 'All', searchTerm = '' } = {}) {
  return employees.filter((employee) => {
    const matchesSearch = employeeMatchesPeopleSearch(employee, searchTerm)
    const matchesFilter = employeeMatchesPeopleDepartmentFilter(employee.department, activeFilter)
    return matchesSearch && matchesFilter
  })
}

const ROSTER = [
  { id: '1', name: 'Alex Bar', department: 'Bar / Beverage', position: 'Bartender' },
  { id: '2', name: 'Sam Service', department: 'Service / Front of House', position: 'Waiter' },
  { id: '3', name: 'Kim Kitchen', department: 'Kitchen / Back of House', position: 'Chef' },
  { id: '4', name: 'Morgan Mgmt', department: 'Management', position: 'Manager' },
  { id: '5', name: 'Legacy Bar', department: 'Bar', position: 'Barback' },
  { id: '6', name: 'Legacy Service', department: 'Service', position: 'Host' },
  { id: '7', name: 'Legacy Kitchen', department: 'Kitchen', position: 'Commis' },
  { id: '8', name: 'No Dept', department: '', position: 'Floater' },
  { id: '9', name: 'Null Dept', department: null, position: 'Temp' },
  { id: '10', name: 'Custom Ops', department: 'Custom Ops', position: 'Runner' },
]

describe('People department filter chips', () => {
  it('keeps the existing People filter chip values', () => {
    expect(DEPARTMENT_FILTERS).toEqual(['All', 'Bar', 'Service', 'Kitchen', 'Management'])
  })
})

describe('employeeMatchesPeopleDepartmentFilter', () => {
  it('matches All for every department including empty and unknown', () => {
    expect(employeeMatchesPeopleDepartmentFilter('Bar / Beverage', 'All')).toBe(true)
    expect(employeeMatchesPeopleDepartmentFilter('', 'All')).toBe(true)
    expect(employeeMatchesPeopleDepartmentFilter(null, 'All')).toBe(true)
    expect(employeeMatchesPeopleDepartmentFilter('Custom Ops', 'All')).toBe(true)
  })

  it('matches Bar filter to Bar / Beverage and Bar alias values', () => {
    expect(employeeMatchesPeopleDepartmentFilter('Bar / Beverage', 'Bar')).toBe(true)
    expect(employeeMatchesPeopleDepartmentFilter('Bar', 'Bar')).toBe(true)
    expect(employeeMatchesPeopleDepartmentFilter('Service / Front of House', 'Bar')).toBe(false)
  })

  it('matches Service filter to Service / Front of House and Service alias values', () => {
    expect(employeeMatchesPeopleDepartmentFilter('Service / Front of House', 'Service')).toBe(true)
    expect(employeeMatchesPeopleDepartmentFilter('Service', 'Service')).toBe(true)
    expect(employeeMatchesPeopleDepartmentFilter('Bar / Beverage', 'Service')).toBe(false)
  })

  it('matches Kitchen filter to Kitchen / Back of House and Kitchen alias values', () => {
    expect(employeeMatchesPeopleDepartmentFilter('Kitchen / Back of House', 'Kitchen')).toBe(true)
    expect(employeeMatchesPeopleDepartmentFilter('Kitchen', 'Kitchen')).toBe(true)
    expect(employeeMatchesPeopleDepartmentFilter('Management', 'Kitchen')).toBe(false)
  })

  it('matches Management filter to Management', () => {
    expect(employeeMatchesPeopleDepartmentFilter('Management', 'Management')).toBe(true)
    expect(employeeMatchesPeopleDepartmentFilter('Bar / Beverage', 'Management')).toBe(false)
  })

  it('handles null and empty departments without crashing', () => {
    expect(employeeMatchesPeopleDepartmentFilter(null, 'Bar')).toBe(false)
    expect(employeeMatchesPeopleDepartmentFilter(undefined, 'Service')).toBe(false)
    expect(employeeMatchesPeopleDepartmentFilter('', 'Kitchen')).toBe(false)
  })

  it('does not assign unknown departments to known filters', () => {
    expect(employeeMatchesPeopleDepartmentFilter('Custom Ops', 'Bar')).toBe(false)
    expect(employeeMatchesPeopleDepartmentFilter('Custom Ops', 'Service')).toBe(false)
    expect(employeeMatchesPeopleDepartmentFilter('Custom Ops', 'Kitchen')).toBe(false)
    expect(employeeMatchesPeopleDepartmentFilter('Custom Ops', 'Management')).toBe(false)
  })

  it('rejects false-positive substring matches', () => {
    expect(employeeMatchesPeopleDepartmentFilter('Bar Manager', 'Bar')).toBe(false)
    expect(employeeMatchesPeopleDepartmentFilter('Guest Service Manager', 'Service')).toBe(false)
  })
})

describe('People roster filter path', () => {
  it('All returns every employee', () => {
    expect(filterEmployees(ROSTER, { activeFilter: 'All' }).map((entry) => entry.id))
      .toEqual(ROSTER.map((entry) => entry.id))
  })

  it('Bar includes confirmed Bar variants only', () => {
    expect(filterEmployees(ROSTER, { activeFilter: 'Bar' }).map((entry) => entry.name))
      .toEqual(['Alex Bar', 'Legacy Bar'])
  })

  it('Service includes confirmed Service variants only', () => {
    expect(filterEmployees(ROSTER, { activeFilter: 'Service' }).map((entry) => entry.name))
      .toEqual(['Sam Service', 'Legacy Service'])
  })

  it('Kitchen matching remains correct', () => {
    expect(filterEmployees(ROSTER, { activeFilter: 'Kitchen' }).map((entry) => entry.name))
      .toEqual(['Kim Kitchen', 'Legacy Kitchen'])
  })

  it('Management matching remains correct', () => {
    expect(filterEmployees(ROSTER, { activeFilter: 'Management' }).map((entry) => entry.name))
      .toEqual(['Morgan Mgmt'])
  })

  it('unknown and empty departments remain visible under All only', () => {
    const allNames = filterEmployees(ROSTER, { activeFilter: 'All' }).map((entry) => entry.name)
    expect(allNames).toContain('No Dept')
    expect(allNames).toContain('Null Dept')
    expect(allNames).toContain('Custom Ops')

    for (const activeFilter of ['Bar', 'Service', 'Kitchen', 'Management']) {
      const names = filterEmployees(ROSTER, { activeFilter }).map((entry) => entry.name)
      expect(names).not.toContain('No Dept')
      expect(names).not.toContain('Null Dept')
      expect(names).not.toContain('Custom Ops')
    }
  })

  it('search combined with department filtering continues to work', () => {
    expect(filterEmployees(ROSTER, { activeFilter: 'Bar', searchTerm: 'Alex' }).map((entry) => entry.name))
      .toEqual(['Alex Bar'])
    expect(filterEmployees(ROSTER, { activeFilter: 'Bar', searchTerm: 'Sam' })).toEqual([])
    expect(filterEmployees(ROSTER, { activeFilter: 'All', searchTerm: 'Custom' }).map((entry) => entry.name))
      .toEqual(['Custom Ops'])
  })

  it('preserves roster ordering', () => {
    expect(filterEmployees(ROSTER, { activeFilter: 'All' }).map((entry) => entry.id))
      .toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'])
  })
})
