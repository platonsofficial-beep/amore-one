import { describe, expect, it } from 'vitest'
import {
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
  {
    id: '1',
    name: 'Alex Rivera',
    department: 'Service / Front of House',
    position: 'Waiter / Server',
    phone: '+35799111222',
    email: 'alex.rivera@example.com',
  },
  {
    id: '2',
    name: 'Bailey Chen',
    department: 'Bar / Beverage',
    position: 'Bartender',
    phone: '',
    mobilePhone: '+35799333444',
    email: 'bailey@venue.com',
  },
  {
    id: '3',
    name: 'Casey Ng',
    department: 'Kitchen / Back of House',
    position: 'Commis Chef',
    mobile_phone: '99001122',
    email: null,
  },
  {
    id: '4',
    name: 'Dana Ops',
    department: 'Management',
    position: 'Manager',
    phone: null,
    email: '',
  },
]

describe('employeeMatchesPeopleSearch', () => {
  it('matches by first name', () => {
    expect(employeeMatchesPeopleSearch(ROSTER[0], 'Alex')).toBe(true)
    expect(employeeMatchesPeopleSearch(ROSTER[1], 'Alex')).toBe(false)
  })

  it('matches by surname', () => {
    expect(employeeMatchesPeopleSearch(ROSTER[0], 'rivera')).toBe(true)
    expect(employeeMatchesPeopleSearch(ROSTER[1], 'Chen')).toBe(true)
  })

  it('matches by position', () => {
    expect(employeeMatchesPeopleSearch(ROSTER[0], 'waiter')).toBe(true)
    expect(employeeMatchesPeopleSearch(ROSTER[1], 'bartender')).toBe(true)
  })

  it('matches by department', () => {
    expect(employeeMatchesPeopleSearch(ROSTER[0], 'front of house')).toBe(true)
    expect(employeeMatchesPeopleSearch(ROSTER[1], 'beverage')).toBe(true)
  })

  it('matches by phone', () => {
    expect(employeeMatchesPeopleSearch(ROSTER[0], '99111222')).toBe(true)
    expect(employeeMatchesPeopleSearch(ROSTER[0], '+35799111222')).toBe(true)
  })

  it('matches by mobile phone fields when present', () => {
    expect(employeeMatchesPeopleSearch(ROSTER[1], '99333444')).toBe(true)
    expect(employeeMatchesPeopleSearch(ROSTER[2], '99001122')).toBe(true)
  })

  it('matches by email case-insensitively', () => {
    expect(employeeMatchesPeopleSearch(ROSTER[0], 'ALEX.RIVERA@EXAMPLE.COM')).toBe(true)
    expect(employeeMatchesPeopleSearch(ROSTER[1], 'bailey@venue.com')).toBe(true)
  })

  it('handles null and empty phone/email safely', () => {
    expect(employeeMatchesPeopleSearch(ROSTER[3], 'manager')).toBe(true)
    expect(employeeMatchesPeopleSearch(ROSTER[3], '999')).toBe(false)
    expect(employeeMatchesPeopleSearch(ROSTER[2], 'casey')).toBe(true)
    expect(() => employeeMatchesPeopleSearch(ROSTER[3], 'ops')).not.toThrow()
  })

  it('returns all employees for an empty search term', () => {
    expect(employeeMatchesPeopleSearch(ROSTER[0], '')).toBe(true)
    expect(employeeMatchesPeopleSearch(ROSTER[0], '   ')).toBe(true)
  })
})

describe('People search + department filter', () => {
  it('combines phone search with department filter', () => {
    expect(filterEmployees(ROSTER, { activeFilter: 'Service', searchTerm: '99111222' }).map((entry) => entry.name))
      .toEqual(['Alex Rivera'])
    expect(filterEmployees(ROSTER, { activeFilter: 'Bar', searchTerm: '99111222' })).toEqual([])
  })

  it('combines email search with department filter', () => {
    expect(filterEmployees(ROSTER, { activeFilter: 'Bar', searchTerm: 'bailey@venue.com' }).map((entry) => entry.name))
      .toEqual(['Bailey Chen'])
  })

  it('preserves roster ordering', () => {
    expect(filterEmployees(ROSTER, { activeFilter: 'All', searchTerm: '' }).map((entry) => entry.id))
      .toEqual(['1', '2', '3', '4'])
  })
})
