/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { TeamPeopleView } from './TeamPeopleView'

const BASE_EMPLOYEE = {
  id: 'emp-1',
  name: 'Alex Rivera',
  department: 'Service / Front of House',
  primaryPosition: 'Waiter / Server',
  status: 'Working',
  hireDate: '2025-01-10',
  salary: '42000',
  weeklyHours: '40',
  phone: '+35700000000',
  email: 'alex@example.com',
  emergencyContact: 'Not provided',
  notes: 'No notes yet.',
}

function renderPeopleDrawer(employeeOverrides = {}) {
  const employee = { ...BASE_EMPLOYEE, ...employeeOverrides }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(createElement(TeamPeopleView, {
      employees: [employee],
      rosterEmployees: [employee],
      totalEmployeeCount: 1,
      selectedEmployee: employee,
      onSelectEmployee: vi.fn(),
      activeFilter: 'All',
      onFilterChange: vi.fn(),
      onOpenAddEmployee: vi.fn(),
      onOpenEditEmployee: vi.fn(),
      onRequestDeleteEmployee: vi.fn(),
      isLoading: false,
      canViewSalary: false,
    }))
  })

  return {
    container,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

function getEmploymentFieldMap(container) {
  const employmentSection = Array.from(container.querySelectorAll('.employee-profile-drawer-section'))
    .find((section) => section.querySelector('.employee-profile-drawer-section-title')?.textContent === 'Employment')

  const rows = Array.from(employmentSection?.querySelectorAll('.employee-profile-drawer-field') ?? [])
  return Object.fromEntries(rows.map((row) => [
    row.querySelector('dt')?.textContent,
    row.querySelector('dd')?.textContent,
  ]))
}

describe('TeamPeopleView preferred shift', () => {
  it('shows Morning preferred shift', () => {
    const { container, unmount } = renderPeopleDrawer({ shift: 'Morning' })
    expect(getEmploymentFieldMap(container)['Preferred Shift']).toBe('Morning')
    unmount()
  })

  it('shows Evening preferred shift', () => {
    const { container, unmount } = renderPeopleDrawer({ shift: 'Evening' })
    expect(getEmploymentFieldMap(container)['Preferred Shift']).toBe('Evening')
    unmount()
  })

  it('shows Night preferred shift', () => {
    const { container, unmount } = renderPeopleDrawer({ shift: 'Night' })
    expect(getEmploymentFieldMap(container)['Preferred Shift']).toBe('Night')
    unmount()
  })

  it('shows Flexible / Rotating preferred shift', () => {
    const { container, unmount } = renderPeopleDrawer({ shift: 'Flexible / Rotating' })
    expect(getEmploymentFieldMap(container)['Preferred Shift']).toBe('Flexible / Rotating')
    unmount()
  })

  it('shows an em dash when preferred shift is empty or null', () => {
    const empty = renderPeopleDrawer({ shift: '' })
    expect(getEmploymentFieldMap(empty.container)['Preferred Shift']).toBe('—')
    empty.unmount()

    const missing = renderPeopleDrawer({ shift: null })
    expect(getEmploymentFieldMap(missing.container)['Preferred Shift']).toBe('—')
    missing.unmount()
  })

  it('keeps Preferred Shift after Weekly hours in Employment', () => {
    const { container, unmount } = renderPeopleDrawer({ shift: 'Morning' })
    const labels = Object.keys(getEmploymentFieldMap(container))
    expect(labels).toEqual(['Start date', 'Weekly hours', 'Preferred Shift'])
    unmount()
  })
})
