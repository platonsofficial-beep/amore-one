/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { OperationsChecklistsView } from './OperationsChecklistsView'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const setValue = (input, value) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  act(() => { setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })) })
}
const btn = (c, t) => [...c.querySelectorAll('button')].find((b) => b.textContent.trim() === t)

describe('0032 create checklist keeps its tasks', () => {
  it('saves added and still-typed tasks to the new template', async () => {
    const onCreateTemplate = vi.fn(async () => ({ id: 'tpl-1' }))
    const onCreateItem = vi.fn(async () => ({ id: 'item' }))
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => root.render(createElement(OperationsChecklistsView, {
      templates: [], canManage: true, isSaving: false, isWorkspaceReady: true, onCreateTemplate, onCreateItem,
      onUpdateTemplate: vi.fn(), onDeleteTemplate: vi.fn(), onUpdateItem: vi.fn(), onDeleteItem: vi.fn(), onSaveItemOrder: vi.fn(),
    })))
    act(() => btn(container, 'Create checklist').dispatchEvent(new MouseEvent('click', { bubbles: true })))
    const [nameInput] = container.querySelectorAll('input')
    setValue(nameInput, 'Bar closing')
    const addInput = container.querySelector('.operations-checklist-add-item input')
    setValue(addInput, 'TEST item')
    act(() => btn(container, 'Add task').dispatchEvent(new MouseEvent('click', { bubbles: true })))
    setValue(container.querySelector('.operations-checklist-add-item input'), 'Typed only')
    await act(async () => {
      container.querySelector('form.operations-checklist-editor-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(onCreateTemplate).toHaveBeenCalled()
    expect(onCreateItem.mock.calls.map((c) => [c[0], c[1].title])).toEqual([['tpl-1', 'TEST item'], ['tpl-1', 'Typed only']])
    act(() => root.unmount()); container.remove()
  })
})
