/**
 * @vitest-environment jsdom
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { InventoryCountView } from './InventoryCountView'
import { InventoryCountWizard } from './InventoryCountWizard'

function render(ui) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(ui)
  })

  return {
    container,
    cleanup: () => {
      act(() => {
        root.unmount()
      })
      container.remove()
    },
  }
}

describe('InventoryCountWizard foundation', () => {
  it('opens from Start new count and closes via Cancel and Close', () => {
    const { container, cleanup } = render(createElement(InventoryCountView))

    expect(container.querySelector('[role="dialog"]')).toBeNull()

    const startBtn = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Start new count',
    )
    expect(startBtn).toBeTruthy()

    act(() => {
      startBtn.click()
    })

    const dialog = container.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.textContent).toContain('Inventory Count')
    expect(dialog?.textContent).toContain('Create a new inventory counting session.')
    expect(dialog?.textContent).toContain('Step 1 of 4')
    expect(dialog?.textContent).toContain('Count Type')

    const cancelBtn = Array.from(dialog.querySelectorAll('button')).find(
      (button) => button.textContent === 'Cancel',
    )
    act(() => {
      cancelBtn.click()
    })
    expect(container.querySelector('[role="dialog"]')).toBeNull()

    act(() => {
      startBtn.click()
    })
    const closeBtn = container.querySelector('[aria-label="Close"]')
    act(() => {
      closeBtn.click()
    })
    expect(container.querySelector('[role="dialog"]')).toBeNull()

    cleanup()
  })

  it('selects one count type at a time and enables Continue only after selection', () => {
    const onClose = vi.fn()
    const { container, cleanup } = render(
      createElement(InventoryCountWizard, { isOpen: true, onClose }),
    )

    const continueBtn = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Continue',
    )
    const backBtn = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Back',
    )
    expect(continueBtn?.disabled).toBe(true)
    expect(backBtn?.disabled).toBe(true)

    const cards = container.querySelectorAll('[role="radio"]')
    expect(cards).toHaveLength(5)

    act(() => {
      cards[0].click()
    })
    expect(cards[0].getAttribute('aria-checked')).toBe('true')
    expect(continueBtn?.disabled).toBe(false)

    act(() => {
      cards[2].click()
    })
    expect(cards[0].getAttribute('aria-checked')).toBe('false')
    expect(cards[2].getAttribute('aria-checked')).toBe('true')
    expect(continueBtn?.disabled).toBe(false)

    act(() => {
      continueBtn.click()
    })
    expect(onClose).not.toHaveBeenCalled()
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()

    cleanup()
  })

  it('does not introduce persistence or service wiring in the wizard source', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/stock/InventoryCountWizard.jsx'),
      'utf8',
    )

    expect(source).not.toMatch(/localStorage|supabase|recordStockMovement|createCount|postCount|fetch\(/i)
  })
})
