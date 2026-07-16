/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { TeamPeopleView } from './TeamPeopleView'

const EMPLOYEE = {
  id: 'emp-1',
  name: 'Alex Rivera',
  department: 'Service / Front of House',
  primaryPosition: 'Waiter / Server',
  status: 'Working',
}

function renderPeopleView(props = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(createElement(TeamPeopleView, {
      employees: [],
      rosterEmployees: [],
      totalEmployeeCount: 0,
      selectedEmployee: null,
      onSelectEmployee: vi.fn(),
      activeFilter: 'All',
      onFilterChange: vi.fn(),
      onOpenAddEmployee: vi.fn(),
      onOpenEditEmployee: vi.fn(),
      onRequestDeleteEmployee: vi.fn(),
      isLoading: false,
      ...props,
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

function getEmptyStateAddButton(container) {
  return container.querySelector('.team-people-empty-add-btn')
}

describe('TeamPeopleView empty-state Add Employee CTA', () => {
  it('renders the empty-state CTA with existing copy', () => {
    const { container, unmount } = renderPeopleView()

    expect(container.textContent).toContain('No employees yet.')
    expect(container.textContent).toContain('Add your first team member, then assign a department and position.')
    expect(getEmptyStateAddButton(container)?.textContent).toBe('+ Add Employee')

    unmount()
  })

  it('opens the existing Add Employee flow when the CTA is clicked', () => {
    const onOpenAddEmployee = vi.fn()
    const { container, unmount } = renderPeopleView({ onOpenAddEmployee })

    act(() => {
      getEmptyStateAddButton(container).click()
    })

    expect(onOpenAddEmployee).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('disables the empty-state CTA when no Add Employee handler is provided', () => {
    const { container, unmount } = renderPeopleView({ onOpenAddEmployee: undefined })

    expect(getEmptyStateAddButton(container)?.disabled).toBe(true)
    unmount()
  })

  it('does not render the empty-state CTA when the roster is populated', () => {
    const { container, unmount } = renderPeopleView({
      employees: [EMPLOYEE],
      rosterEmployees: [EMPLOYEE],
      totalEmployeeCount: 1,
    })

    expect(container.textContent).not.toContain('No employees yet.')
    expect(getEmptyStateAddButton(container)).toBeNull()
    expect(container.querySelector('.team-people-header-actions .team-people-add-btn')?.textContent)
      .toBe('+ Add Employee')

    unmount()
  })
})
