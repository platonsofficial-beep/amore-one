/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { OperationsDashboardView } from './OperationsDashboardView'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

function render(props) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(createElement(OperationsDashboardView, props)))
  return { container, done: () => { act(() => root.unmount()); container.remove() } }
}

describe('0027 Operations dashboard empty states and KPI tile', () => {
  it('shows single-line empty states with inline actions and Open task boards inside the tile', () => {
    const onOpenTaskBoards = vi.fn()
    const v = render({
      tasks: [], logs: [], announcements: [], employees: [], canManage: true, canManageAnnouncements: true,
      isWorkspaceReady: true, isLoading: false, onOpenTaskBoards, role: 'owner',
    })
    const text = v.container.textContent
    expect(text).toContain('No open tasks')
    expect(text).toContain('No notes yet')
    const inline = [...v.container.querySelectorAll('.operations-empty-state.is-inline')]
    expect(inline.length).toBeGreaterThanOrEqual(2)
    const actions = [...v.container.querySelectorAll('.operations-empty-action')].map((b) => b.textContent)
    expect(actions).toEqual(expect.arrayContaining(['Create task', 'Add note']))
    const tileBtn = v.container.querySelector('.operations-summary-card.has-action .operations-summary-card-action')
    expect(tileBtn?.textContent).toBe('Open task boards')
    act(() => tileBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(onOpenTaskBoards).toHaveBeenCalled()
    v.done()
  })
})
