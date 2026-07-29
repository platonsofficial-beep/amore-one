/**
 * @vitest-environment jsdom
 * P8.26.6 — Create Workspace Storage dialog
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import {
  CreateWorkspaceStorageDialog,
  validateCreateWorkspaceStorageName,
} from './CreateWorkspaceStorageDialog'

const { createWorkspaceStorageMock } = vi.hoisted(() => ({
  createWorkspaceStorageMock: vi.fn(),
}))

vi.mock('../../services/workspaceStorageService', () => ({
  createWorkspaceStorage: (...args) => createWorkspaceStorageMock(...args),
  listWorkspaceStorages: vi.fn(),
}))

describe('validateCreateWorkspaceStorageName', () => {
  it('trims outer spaces and enforces required / max 80', () => {
    expect(validateCreateWorkspaceStorageName('  Cellar  ')).toEqual({
      ok: true,
      value: 'Cellar',
      error: '',
    })
    expect(validateCreateWorkspaceStorageName('   ')).toMatchObject({
      ok: false,
      error: 'Storage name is required.',
    })
    expect(validateCreateWorkspaceStorageName('x'.repeat(81)).ok).toBe(false)
  })
})

describe('CreateWorkspaceStorageDialog', () => {
  let host
  let root

  beforeEach(() => {
    createWorkspaceStorageMock.mockReset()
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    host?.remove()
    document.body.innerHTML = ''
  })

  function renderDialog(props = {}) {
    act(() => {
      root.render(createElement(CreateWorkspaceStorageDialog, {
        workspaceId: 'ws-1',
        onClose: vi.fn(),
        onCreated: vi.fn(),
        ...props,
      }))
    })
  }

  it('creates storage on success and calls onCreated', async () => {
    const onCreated = vi.fn()
    const onClose = vi.fn()
    createWorkspaceStorageMock.mockResolvedValue({
      id: 'st-1',
      locationKey: 'Cellar',
      name: 'Cellar',
      active: true,
      sortOrder: 0,
    })

    renderDialog({ onCreated, onClose })

    const dialog = document.querySelector('[data-create-workspace-storage-dialog="true"]')
    const input = dialog.querySelector('input')
    const form = dialog.querySelector('form')

    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      nativeInputValueSetter?.call(input, 'Cellar')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(createWorkspaceStorageMock).toHaveBeenCalledWith('ws-1', 'Cellar')
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({
      locationKey: 'Cellar',
    }))
  })

  it('keeps dialog open and shows error on create failure', async () => {
    createWorkspaceStorageMock.mockRejectedValue(
      new Error('A storage with this name already exists in this workspace.'),
    )
    const onCreated = vi.fn()

    renderDialog({ onCreated })

    const dialog = document.querySelector('[data-create-workspace-storage-dialog="true"]')
    const input = dialog.querySelector('input')
    const form = dialog.querySelector('form')

    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      nativeInputValueSetter?.call(input, 'Bar')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onCreated).not.toHaveBeenCalled()
    expect(dialog.textContent).toContain(
      'A storage with this name already exists in this workspace.',
    )
    expect(document.querySelector('[data-create-workspace-storage-dialog="true"]')).toBeTruthy()
  })
})
