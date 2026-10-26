/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { WORKSPACE_STORAGE_DUPLICATE_NAME_MESSAGE } from '../../services/workspaceStorageService'
import { RenameWorkspaceStorageDialog } from './RenameWorkspaceStorageDialog'

describe('RenameWorkspaceStorageDialog', () => {
  let container
  let root

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    container?.remove()
    container = null
    root = null
  })

  function renderDialog(props) {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root.render(createElement(RenameWorkspaceStorageDialog, props))
    })
  }

  it('saves a new display name and shows the location key', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    renderDialog({
      storage: { id: 's-main', name: 'Main Storage', locationKey: 'Main Storage' },
      takenNames: ['Bar'],
      onClose,
      onSubmit,
    })

    const dialog = document.body.querySelector('[data-testid="rename-storage-dialog"]')
    expect(dialog.textContent).toContain('Rename')
    expect(dialog.textContent).toContain('Key stays Main Storage')
    const input = dialog.querySelector('input')
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, 'Cellar')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      dialog.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(onSubmit).toHaveBeenCalledWith('Cellar')
  })

  it('keeps the duplicate-name check before writing', async () => {
    const onSubmit = vi.fn()
    renderDialog({
      storage: { id: 's-main', name: 'Main Storage', locationKey: 'Main Storage' },
      takenNames: ['Cellar'],
      onClose: vi.fn(),
      onSubmit,
    })
    const dialog = document.body.querySelector('[data-testid="rename-storage-dialog"]')
    const input = dialog.querySelector('input')
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, 'cellar')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      dialog.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await Promise.resolve()
    })
    expect(onSubmit).not.toHaveBeenCalled()
    expect(dialog.textContent).toContain(WORKSPACE_STORAGE_DUPLICATE_NAME_MESSAGE)
  })
})
