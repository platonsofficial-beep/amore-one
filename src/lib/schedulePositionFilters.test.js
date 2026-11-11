import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  buildSchedulePositionFilterOptions,
  employeeMatchesScheduleDepartment,
  employeeMatchesSchedulePosition,
  filterScheduleStaffEmployees,
} from './scheduleDropUtils'

describe('buildSchedulePositionFilterOptions', () => {
  it('includes positions in use on employees even when they are missing from the catalog', () => {
    const options = buildSchedulePositionFilterOptions({
      positions: [{ name: 'Waiter' }],
      shifts: [],
      employees: [{
        primaryPosition: 'Bartender',
        positions: [{ name: 'Bartender' }],
      }],
    })

    expect(options).toEqual(['All', 'Bartender', 'Waiter'])
  })
})

const ana = { name: 'Ana Ribeiro', department: 'Kitchen', position: 'Line Cook', positions: [{ name: 'Line Cook' }], primaryPosition: 'Line Cook' }
const andreas = { name: 'Andreas Georgiou', department: 'Bar / Beverage', position: 'Head Bartender', positions: [{ name: 'Head Bartender' }], primaryPosition: 'Head Bartender' }
const elena = { name: 'Elena Christodoulou', department: 'Bar', position: 'Bartender', positions: [{ name: 'Bartender' }], primaryPosition: 'Bartender' }
const evie = { name: 'Evie S.', department: 'Service / Front of House', position: 'Waiter / Server', positions: [{ name: 'Waiter / Server' }], primaryPosition: 'Waiter / Server' }
const roster = [ana, andreas, elena, evie]

describe('staff availability department and position filters', () => {
  it('keeps the full list when both filters are cleared', () => {
    const visible = roster.filter((employee) => (
      employeeMatchesScheduleDepartment(employee, 'All')
      && employeeMatchesSchedulePosition(employee, 'All')
    ))
    expect(visible.map((employee) => employee.name)).toEqual([
      'Ana Ribeiro',
      'Andreas Georgiou',
      'Elena Christodoulou',
      'Evie S.',
    ])
  })

  it('ANDs department and position, and can match nobody', () => {
    const kitchenManager = roster.filter((employee) => (
      employeeMatchesScheduleDepartment(employee, 'Kitchen')
      && employeeMatchesSchedulePosition(employee, 'General Manager')
    ))
    expect(kitchenManager).toEqual([])

    const barBartender = roster.filter((employee) => (
      employeeMatchesScheduleDepartment(employee, 'Bar')
      && employeeMatchesSchedulePosition(employee, 'Bartender')
    ))
    expect(barBartender.map((employee) => employee.name)).toEqual(['Elena Christodoulou'])
  })

  it('does not treat Head Bartender as Bartender', () => {
    expect(employeeMatchesSchedulePosition(andreas, 'Bartender')).toBe(false)
    expect(employeeMatchesSchedulePosition(elena, 'Bartender')).toBe(true)
    expect(employeeMatchesScheduleDepartment(andreas, 'Bar')).toBe(true)
    expect(employeeMatchesScheduleDepartment(evie, 'Bar')).toBe(false)
  })

  it('matches a catalog alias such as GM to General Manager', () => {
    const manager = { name: 'Alex', department: 'Management', position: 'GM', primaryPosition: 'GM' }
    expect(employeeMatchesSchedulePosition(manager, 'General Manager')).toBe(true)
    expect(employeeMatchesScheduleDepartment(manager, 'Management')).toBe(true)
    expect(employeeMatchesScheduleDepartment(manager, 'Kitchen')).toBe(false)
  })

  it('filters the assign-card list by department, position, and search together', () => {
    const visible = (filters) => filterScheduleStaffEmployees(roster, filters).map((employee) => employee.name)
    expect(visible({})).toEqual([
      'Ana Ribeiro',
      'Andreas Georgiou',
      'Elena Christodoulou',
      'Evie S.',
    ])
    expect(visible({ department: 'Kitchen', position: 'General Manager' })).toEqual([])
    expect(visible({ department: 'Bar', position: 'Bartender' })).toEqual(['Elena Christodoulou'])
    expect(visible({ department: 'Bar', position: 'Bartender', search: 'andreas' })).toEqual([])
    expect(visible({ department: 'Bar', search: 'elena' })).toEqual(['Elena Christodoulou'])
  })

  it('renders the staff strip from the filtered list', () => {
    const source = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8')
    const strip = source.slice(source.indexOf('schedule-staff-strip'), source.indexOf('schedule-staff-strip') + 900)
    expect(strip).toContain('visibleStaffMembers.map')
    expect(strip).toContain('No employees match these filters.')
    expect(source).toContain('employeeMatchesScheduleDepartment')
    expect(source).toContain('employeeMatchesSchedulePosition')
  })
})