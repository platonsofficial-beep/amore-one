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
  department: 'Service',
  primaryPosition: 'Server',
  status: 'Working',
}

function renderPeopleView(props = {}) {
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
      ...props,
    }))
  })

  return { container, root }
}

describe('TeamPeopleView profile drawer', () => {
  it('closes the profile drawer on Escape', async () => {
    const onSelectEmployee = vi.fn()
    const { container, root } = renderPeopleView({ onSelectEmployee })

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(onSelectEmployee).toHaveBeenCalledWith(null)

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('keeps the close button above the backdrop', () => {
    const { container, root } = renderPeopleView()
    const layer = container.querySelector('.employee-profile-drawer-layer')
    const backdrop = layer?.querySelector('.drawer-backdrop')
    const drawer = layer?.querySelector('.employee-profile-drawer')
    const closeButton = drawer?.querySelector('.employee-profile-drawer-close')

    expect(layer).not.toBeNull()
    expect(backdrop).not.toBeNull()
    expect(drawer).not.toBeNull()
    expect(closeButton).not.toBeNull()
    expect(layer.children[0]).toBe(backdrop)
    expect(layer.contains(closeButton)).toBe(true)
    expect(backdrop.contains(closeButton)).toBe(false)

    act(() => {
      root.unmount()
    })
    container.remove()
  })
})
