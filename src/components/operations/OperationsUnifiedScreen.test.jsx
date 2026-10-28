/**
 * @vitest-environment jsdom
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { OperationsUnifiedScreen } from './OperationsUnifiedScreen'

function renderScreen(props) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(createElement(OperationsUnifiedScreen, props))
  })
  return {
    container,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

describe('OperationsUnifiedScreen', () => {
  it('keeps today, boards, and checklists in one screen', () => {
    const onSectionChange = vi.fn()
    const view = renderScreen({
      sections: [
        { id: 'dashboard', label: 'Dashboard' },
        { id: 'tasks', label: 'Task boards' },
        { id: 'checklists', label: 'Checklists' },
      ],
      section: 'dashboard',
      onSectionChange,
      today: createElement('p', null, 'Today work'),
      boards: createElement('p', null, 'Boards'),
      checklists: createElement('p', null, 'Checklists'),
    })

    expect(view.container.textContent).toContain('Today work')
    expect(view.container.textContent).not.toContain('Boards')
    act(() => {
      view.container.querySelectorAll('button')[1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onSectionChange).toHaveBeenCalledWith('tasks')
    view.unmount()
  })
})
