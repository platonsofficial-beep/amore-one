/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { TeamPeopleView } from './TeamPeopleView'
import { EMPLOYEE_TODAY_STATUS } from '../../lib/employeeTodayStatusUtils'

const EMPLOYEE = {
  id: 'emp-1',
  name: 'Alex Rivera',
  department: 'Service / Front of House',
  primaryPosition: 'Waiter / Server',
  status: 'Working',
}

function renderCard(todayStatus) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(createElement(TeamPeopleView, {
      employees: [EMPLOYEE],
      rosterEmployees: [EMPLOYEE],
      totalEmployeeCount: 1,
      employeeTodayStatusById: {
        [EMPLOYEE.id]: todayStatus,
      },
      isTodayStatusLoading: false,
      selectedEmployee: null,
      onSelectEmployee: vi.fn(),
      activeFilter: 'All',
      onFilterChange: vi.fn(),
      onOpenAddEmployee: vi.fn(),
      onOpenEditEmployee: vi.fn(),
      onRequestDeleteEmployee: vi.fn(),
      isLoading: false,
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

function getCard(container) {
  return container.querySelector('.team-people-card')
}

describe('TeamPeopleView card status deduplication', () => {
  it('shows Working now once with secondary detail and no Status row', () => {
    const { container, unmount } = renderCard({
      key: EMPLOYEE_TODAY_STATUS.working_now.key,
      label: EMPLOYEE_TODAY_STATUS.working_now.label,
      endsAt: '17:00',
      shiftsToday: [{ startTime: '09:00', endTime: '17:00' }],
    })

    const card = getCard(container)
    expect(card.querySelector('.team-people-today-status-pill')?.textContent).toBe('Working now')
    expect(card.querySelector('.team-people-card-today-secondary')?.textContent).toBe('Until 17:00')
    expect(card.textContent.match(/Working now/g)).toHaveLength(1)
    expect(card.querySelectorAll('.team-people-card-meta-row')).toHaveLength(1)
    expect(Array.from(card.querySelectorAll('dt')).map((node) => node.textContent)).toEqual(['Today'])
    expect(card.querySelector('.team-people-card-today-primary')).toBeNull()

    unmount()
  })

  it('shows Scheduled later once with start time', () => {
    const { container, unmount } = renderCard({
      key: EMPLOYEE_TODAY_STATUS.scheduled_later.key,
      label: EMPLOYEE_TODAY_STATUS.scheduled_later.label,
      startsAt: '18:00',
      shiftsToday: [{ startTime: '18:00', endTime: '23:00' }],
    })

    const card = getCard(container)
    expect(card.querySelector('.team-people-today-status-pill')?.textContent).toBe('Scheduled later')
    expect(card.querySelector('.team-people-card-today-secondary')?.textContent).toBe('Starts 18:00')
    expect(card.textContent.match(/Scheduled later/g)).toHaveLength(1)

    unmount()
  })

  it('shows Day off today once', () => {
    const { container, unmount } = renderCard({
      key: EMPLOYEE_TODAY_STATUS.day_off.key,
      label: EMPLOYEE_TODAY_STATUS.day_off.label,
      shiftsToday: [],
    })

    const card = getCard(container)
    expect(card.querySelector('.team-people-today-status-pill')?.textContent).toBe('Day off today')
    expect(card.querySelector('.team-people-card-today-secondary')?.textContent).toBe('No published shift today')
    expect(card.textContent.match(/Day off today/g)).toHaveLength(1)

    unmount()
  })

  it('shows On leave today once without a Status row', () => {
    const { container, unmount } = renderCard({
      key: EMPLOYEE_TODAY_STATUS.on_leave.key,
      label: EMPLOYEE_TODAY_STATUS.on_leave.label,
      shiftsToday: [],
    })

    const card = getCard(container)
    expect(card.querySelector('.team-people-today-status-pill')?.textContent).toBe('On leave today')
    expect(card.textContent.match(/On leave today/g)).toHaveLength(1)
    expect(Array.from(card.querySelectorAll('dt')).map((node) => node.textContent)).toEqual(['Today'])

    unmount()
  })

  it('preserves card chrome outside status meta', () => {
    const { container, unmount } = renderCard({
      key: EMPLOYEE_TODAY_STATUS.working_now.key,
      label: EMPLOYEE_TODAY_STATUS.working_now.label,
      endsAt: '17:00',
      shiftsToday: [{ startTime: '09:00', endTime: '17:00' }],
    })

    const card = getCard(container)
    expect(card.querySelector('.team-people-card-name')?.textContent).toBe('Alex Rivera')
    expect(card.querySelector('.team-people-card-action')?.textContent).toBe('Open')
    expect(card.getAttribute('aria-label')).toBe('View Alex Rivera, Working now')

    unmount()
  })
})
