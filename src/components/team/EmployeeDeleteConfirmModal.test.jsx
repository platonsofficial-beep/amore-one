/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import {
  EmployeeDeleteConfirmModal,
  getEmployeeDeleteConfirmName,
} from './EmployeeDeleteConfirmModal'

function renderModal(props = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(createElement(EmployeeDeleteConfirmModal, {
      employee: { id: 'emp-1', name: 'John Smith' },
      isDeleting: false,
      onCancel: vi.fn(),
      onConfirm: vi.fn(),
      ...props,
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

describe('getEmployeeDeleteConfirmName', () => {
  it('returns the employee name when present', () => {
    expect(getEmployeeDeleteConfirmName({ name: 'John Smith' })).toBe('John Smith')
  })

  it('falls back safely when the name is missing', () => {
    expect(getEmployeeDeleteConfirmName({ name: '' })).toBe('this employee')
    expect(getEmployeeDeleteConfirmName(null)).toBe('this employee')
  })
})

describe('EmployeeDeleteConfirmModal', () => {
  it('displays the named delete confirmation copy', () => {
    const { container, unmount } = renderModal()

    expect(container.querySelector('h3')?.textContent).toBe('Delete employee')
    expect(container.querySelector('strong')?.textContent).toBe('John Smith')
    expect(container.textContent).toContain('Are you sure you want to permanently delete')
    expect(container.textContent).toContain('This action cannot be undone.')
    expect(container.textContent).not.toContain('delete this employee')

    unmount()
  })

  it('keeps Cancel wired to onCancel', () => {
    const onCancel = vi.fn()
    const { container, unmount } = renderModal({ onCancel })

    const cancelButton = Array.from(container.querySelectorAll('button'))
      .find((node) => node.textContent === 'Cancel')

    act(() => {
      cancelButton.click()
    })

    expect(onCancel).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('keeps Delete Employee wired to onConfirm', () => {
    const onConfirm = vi.fn()
    const { container, unmount } = renderModal({ onConfirm })

    const deleteButton = Array.from(container.querySelectorAll('button'))
      .find((node) => node.textContent === 'Delete Employee')

    act(() => {
      deleteButton.click()
    })

    expect(onConfirm).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('shows deleting state without changing handlers', () => {
    const onConfirm = vi.fn()
    const { container, unmount } = renderModal({ isDeleting: true, onConfirm })

    const deleteButton = Array.from(container.querySelectorAll('button'))
      .find((node) => node.textContent === 'Deleting…')

    expect(deleteButton).toBeTruthy()
    expect(deleteButton.disabled).toBe(true)

    unmount()
  })
})
