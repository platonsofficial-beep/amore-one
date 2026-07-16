/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { canAssignManagerInviteRole } from '../../lib/permissions'
import { TeamPeopleView } from './TeamPeopleView'

const EMPLOYEE = {
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

function renderPeopleDrawer({ canViewSalary = false } = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(createElement(TeamPeopleView, {
      employees: [EMPLOYEE],
      rosterEmployees: [EMPLOYEE],
      totalEmployeeCount: 1,
      selectedEmployee: EMPLOYEE,
      onSelectEmployee: vi.fn(),
      activeFilter: 'All',
      onFilterChange: vi.fn(),
      onOpenAddEmployee: vi.fn(),
      onOpenEditEmployee: vi.fn(),
      onRequestDeleteEmployee: vi.fn(),
      isLoading: false,
      canViewSalary,
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

function getEmploymentFieldLabels(container) {
  const employmentSection = Array.from(container.querySelectorAll('.employee-profile-drawer-section'))
    .find((section) => section.querySelector('.employee-profile-drawer-section-title')?.textContent === 'Employment')

  return Array.from(employmentSection?.querySelectorAll('dt') ?? [])
    .map((node) => node.textContent)
}

describe('TeamPeopleView salary privacy', () => {
  it('shows the Salary row for Owner/GM when canViewSalary is true', () => {
    const { container, unmount } = renderPeopleDrawer({ canViewSalary: true })

    expect(getEmploymentFieldLabels(container)).toEqual([
      'Start date',
      'Salary',
      'Weekly hours',
    ])
    expect(container.textContent).toContain('42000')

    unmount()
  })

  it('removes the Salary row entirely when canViewSalary is false', () => {
    const { container, unmount } = renderPeopleDrawer({ canViewSalary: false })
    const labels = getEmploymentFieldLabels(container)

    expect(labels).toEqual([
      'Start date',
      'Weekly hours',
    ])
    expect(labels).not.toContain('Salary')
    expect(container.textContent).not.toContain('42000')
    expect(container.textContent).not.toContain('*****')
    expect(container.textContent).not.toContain('€0')

    unmount()
  })

  it('reuses the existing Owner/GM permission gate for salary visibility', () => {
    expect(canAssignManagerInviteRole('owner')).toBe(true)
    expect(canAssignManagerInviteRole('general_manager')).toBe(true)
    expect(canAssignManagerInviteRole('manager')).toBe(false)
    expect(canAssignManagerInviteRole('host')).toBe(false)
    expect(canAssignManagerInviteRole('staff')).toBe(false)
  })
})
