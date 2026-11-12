/**
 * @vitest-environment jsdom
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { describe, expect, it } from 'vitest'
import { TeamPeopleView } from '../team/TeamPeopleView'
import TasksView from '../tasks/TasksView'
import { LoadFailureBanner } from './LoadFailureBanner'

const RAW = "Cannot read properties of null (reading 'from')"

function render(node) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(node)
  })
  return {
    container,
    unmount() {
      act(() => root.unmount())
      container.remove()
    },
  }
}

describe('failed load screens', () => {
  it('does not show a raw exception in the banner', () => {
    const view = render(createElement(LoadFailureBanner, {
      message: RAW,
      subject: 'the schedule',
      onRetry: () => {},
    }))
    expect(view.container.textContent).toContain("Couldn't load the schedule. Check your connection and try again.")
    expect(view.container.textContent).not.toContain('Cannot read properties')
    expect(view.container.textContent).toContain('Retry')
    view.unmount()
  })

  it('does not paint a fake empty team when the directory failed', () => {
    const view = render(createElement(TeamPeopleView, {
      employees: [],
      totalEmployeeCount: 0,
      isLoading: false,
      noticeMessage: RAW,
      activeFilter: 'All',
      searchTerm: '',
      onSearchTermChange: () => {},
    }))
    expect(view.container.textContent).toContain('Team size unavailable')
    expect(view.container.textContent).not.toContain('0 Employees')
    expect(view.container.textContent).not.toContain('No employees yet')
    expect(view.container.textContent).not.toContain('Cannot read properties')
    expect(view.container.querySelector('input[placeholder="Search employee"]')).not.toBeNull()
    view.unmount()
  })

  it('does not paint 0% task metrics when the board failed', () => {
    const view = render(createElement(TasksView, {
      tasks: [],
      isLoading: false,
      isMobileLayout: true,
      errorMessage: RAW,
      todayKey: '2026-11-12',
    }))
    expect(view.container.textContent).not.toContain('0%')
    expect(view.container.textContent).not.toContain('Active tasks')
    expect(view.container.textContent).not.toContain('No tasks need attention right now')
    expect(view.container.textContent).not.toContain('Cannot read properties')
    expect(view.container.textContent).toContain("Couldn't load operations")
    view.unmount()
  })
})
