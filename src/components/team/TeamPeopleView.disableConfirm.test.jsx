/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { TeamPeopleView } from './TeamPeopleView'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

function render(employee, onToggleEmployeeEnabled) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(createElement(TeamPeopleView, {
      employees: [employee], rosterEmployees: [employee], totalEmployeeCount: 1,
      selectedEmployee: employee, onSelectEmployee: vi.fn(), activeFilter: 'All', onFilterChange: vi.fn(),
      onOpenAddEmployee: vi.fn(), onOpenEditEmployee: vi.fn(), onRequestDeleteEmployee: vi.fn(),
      onToggleEmployeeEnabled, isLoading: false,
    }))
  })
  return { container, done: () => { act(() => root.unmount()); container.remove() } }
}
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
const btn = (c, text) => [...c.querySelectorAll('button')].find((b) => b.textContent.trim() === text)

describe('Disable asks first, Enable is instant', () => {
  it('Disable opens a confirm; Cancel does nothing; confirming disables', () => {
    const toggle = vi.fn()
    const v = render({ id: 'e1', name: 'Evie', status: 'Working', active: true }, toggle)
    click(v.container.querySelector('.employee-profile-drawer-disable-btn'))
    expect(toggle).not.toHaveBeenCalled()
    expect(v.container.querySelector('[data-testid="employee-disable-confirm"]')).not.toBeNull()
    click(btn(v.container.querySelector('[data-testid="employee-disable-confirm"]'), 'Cancel'))
    expect(v.container.querySelector('[data-testid="employee-disable-confirm"]')).toBeNull()
    expect(toggle).not.toHaveBeenCalled()
    click(v.container.querySelector('.employee-profile-drawer-disable-btn'))
    click(v.container.querySelector('.employee-disable-confirm-btn'))
    expect(toggle).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }), false)
    v.done()
  })
  it('Enable runs straight away', () => {
    const toggle = vi.fn()
    const v = render({ id: 'e2', name: 'Off', status: 'Disabled', active: false }, toggle)
    click(v.container.querySelector('.employee-profile-drawer-disable-btn'))
    expect(toggle).toHaveBeenCalledWith(expect.objectContaining({ id: 'e2' }), true)
    expect(v.container.querySelector('[data-testid="employee-disable-confirm"]')).toBeNull()
    v.done()
  })
})
