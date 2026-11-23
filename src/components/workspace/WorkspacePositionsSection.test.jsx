/**
 * @vitest-environment jsdom
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { WorkspacePositionsSection } from './WorkspacePositionsSection'

const WAITER = { id: 'pos-waiter', name: 'Waiter', department: 'Service' }

function renderSection(props = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const onStartEdit = props.onStartEdit ?? vi.fn()
  act(() => {
    root.render(createElement(WorkspacePositionsSection, {
      positions: [WAITER],
      isLoading: false,
      noticeMessage: '',
      form: { name: '', department: 'Other' },
      isSaving: false,
      editingPositionId: null,
      onFormChange: vi.fn(),
      onSubmit: (event) => event.preventDefault(),
      onStartEdit,
      onCancelEdit: vi.fn(),
      onRequestDelete: vi.fn(),
      onMovePosition: vi.fn(),
      getUsageCount: () => 0,
      ...props,
    }))
  })
  return {
    container,
    onStartEdit,
    cleanup: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

describe('WorkspacePositionsSection rename', () => {
  it('focuses and selects the position name in the same tap that starts the edit', () => {
    const view = renderSection()
    const input = view.container.querySelector('input')
    const select = vi.spyOn(input, 'select')
    const rename = [...view.container.querySelectorAll('button')].find((button) => button.textContent === 'Rename')

    act(() => {
      rename.click()
    })

    expect(view.onStartEdit).toHaveBeenCalledWith(WAITER)
    expect(document.activeElement).toBe(input)
    expect(select).toHaveBeenCalled()
    view.cleanup()
  })

  it('keeps a row marker so cancel can return to the edited position', () => {
    const view = renderSection()
    expect(view.container.querySelector('[data-settings-row="pos-waiter"]')).not.toBeNull()
    view.cleanup()
  })
})
