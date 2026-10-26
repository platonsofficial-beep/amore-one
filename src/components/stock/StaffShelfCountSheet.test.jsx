/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { StaffShelfCountSheet } from './StaffShelfCountSheet'

const products = [
  {
    stockItemId: 'cola',
    name: 'Cola',
    unit: 'Piece',
    quantity: 4,
    quantityVersion: 2,
    parQuantity: 6,
    active: true,
    costPrice: 12,
    lineValue: 48,
  },
  {
    stockItemId: 'napkins',
    name: 'Napkins',
    unit: 'Pack',
    quantity: 0,
    quantityVersion: 0,
    parQuantity: 2,
    active: true,
    costPrice: 3,
    lineValue: 0,
  },
]

function renderSheet(props = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const countAvailable = props.countAvailable ?? vi.fn(async () => true)
  const submitCount = props.submitCount ?? vi.fn(async () => ({ sessionId: 'session-1' }))
  act(() => {
    root.render(createElement(StaffShelfCountSheet, {
      workspaceId: 'ws-1',
      storage: { id: 'shelf-1', name: 'Back bar' },
      products,
      parsAvailable: true,
      onClose: vi.fn(),
      countAvailable,
      submitCount,
      ...props,
    }))
  })
  return {
    container,
    countAvailable,
    submitCount,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('StaffShelfCountSheet', () => {
  it('shows quantities and par, and never shows cost', async () => {
    const { container, unmount } = renderSheet()
    await flush()

    expect(container.textContent).toContain('Count shelf')
    expect(container.textContent).toContain('Back bar')
    expect(container.textContent).toContain('Cola')
    expect(container.textContent).toContain('Par')
    expect(container.textContent).not.toContain('12')
    expect(container.textContent).not.toContain('48')
    expect(container.textContent).not.toContain('€')
    expect(container.textContent).not.toContain('cost')
    expect(container.querySelector('[aria-label="Counted quantity for Cola"]').value).toBe('4')
    expect(container.textContent).toContain('Napkins')
    expect(container.querySelector('[aria-label="Counted quantity for Napkins"]')).toBeNull()

    unmount()
  })

  it('submits the counted quantities for manager approval', async () => {
    const submitCount = vi.fn(async () => ({ sessionId: 'session-1' }))
    const { container, unmount } = renderSheet({ submitCount })
    await flush()

    await act(async () => {
      container.querySelector('[data-testid="staff-shelf-count-submit"]').click()
      await Promise.resolve()
    })

    expect(submitCount).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      workspaceStorageId: 'shelf-1',
      lines: [{ stock_item_id: 'cola', counted_quantity: 4 }],
    })
    expect(container.textContent).toContain('Sent to a manager')

    unmount()
  })

  it('does not save when the function is not available yet', async () => {
    const submitCount = vi.fn()
    const { container, unmount } = renderSheet({
      countAvailable: vi.fn(async () => false),
      submitCount,
    })
    await flush()

    expect(container.querySelector('[data-testid="staff-shelf-count-unavailable"]')?.textContent)
      .toMatch(/not available yet/i)
    expect(container.querySelector('[data-testid="staff-shelf-count-submit"]').disabled).toBe(true)
    expect(submitCount).not.toHaveBeenCalled()

    unmount()
  })
})
