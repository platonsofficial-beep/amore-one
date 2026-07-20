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

function getButtonByText(root, text) {
  return Array.from(root.querySelectorAll('button')).find((button) => button.textContent === text)
}

describe('InventoryCountWizard foundation', () => {
  it('opens from Start new count and closes via Cancel and Close', () => {
    const { container, cleanup } = render(createElement(InventoryCountView))

    expect(container.querySelector('[role="dialog"]')).toBeNull()

    const startBtn = getButtonByText(container, 'Start new count')
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

    const cancelBtn = getButtonByText(dialog, 'Cancel')
    expect(dialog.querySelector('.inventory-count-wizard-header-actions .inventory-count-wizard-cancel-btn')).toBeNull()
    expect(Array.from(dialog.querySelectorAll('button')).filter((button) => button.textContent === 'Cancel')).toHaveLength(1)
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

    const continueBtn = getButtonByText(container, 'Continue')
    const backBtn = getButtonByText(container, 'Back')
    expect(continueBtn?.disabled).toBe(true)
    expect(backBtn?.disabled).toBe(true)

    const cards = container.querySelectorAll('[role="radio"]')
    expect(cards).toHaveLength(5)

    act(() => {
      cards[0].click()
    })
    expect(cards[0].getAttribute('aria-checked')).toBe('true')
    expect(continueBtn?.disabled).toBe(false)
    expect(container.querySelectorAll('.inventory-count-type-card-badge')).toHaveLength(1)
    expect(cards[0].querySelector('.inventory-count-type-card-badge')).not.toBeNull()

    act(() => {
      cards[2].click()
    })
    expect(cards[0].getAttribute('aria-checked')).toBe('false')
    expect(cards[2].getAttribute('aria-checked')).toBe('true')
    expect(continueBtn?.disabled).toBe(false)
    expect(container.querySelectorAll('.inventory-count-type-card-badge')).toHaveLength(1)
    expect(cards[2].querySelector('.inventory-count-type-card-badge')).not.toBeNull()
    expect(cards[0].querySelector('.inventory-count-type-card-badge')).toBeNull()

    cleanup()
  })

  it('advances to Step 2, preserves count type, and supports multi-location selection', () => {
    const onClose = vi.fn()
    const { container, cleanup } = render(
      createElement(InventoryCountWizard, { isOpen: true, onClose }),
    )

    const continueBtn = getButtonByText(container, 'Continue')
    const typeCards = container.querySelectorAll('[role="radio"]')

    act(() => {
      typeCards[1].click()
    })
    act(() => {
      continueBtn.click()
    })

    expect(container.textContent).toContain('Step 2 of 4')
    expect(container.textContent).toContain('Scope / Locations')
    expect(container.textContent).toContain(
      'Select the locations that will be included in this inventory count.',
    )

    const locationCards = container.querySelectorAll('[role="checkbox"]')
    expect(locationCards).toHaveLength(8)
    expect(continueBtn?.disabled).toBe(true)

    act(() => {
      locationCards[0].click()
    })
    act(() => {
      locationCards[2].click()
    })
    act(() => {
      locationCards[6].click()
    })

    expect(locationCards[0].getAttribute('aria-checked')).toBe('true')
    expect(locationCards[2].getAttribute('aria-checked')).toBe('true')
    expect(locationCards[6].getAttribute('aria-checked')).toBe('true')
    expect(continueBtn?.disabled).toBe(false)
    expect(container.querySelectorAll('.inventory-count-type-card-badge')).toHaveLength(3)

    act(() => {
      continueBtn.click()
    })
    expect(container.textContent).toContain('Step 3 coming next')
    expect(continueBtn?.disabled).toBe(true)
    expect(onClose).not.toHaveBeenCalled()

    const backBtn = getButtonByText(container, 'Back')
    act(() => {
      backBtn.click()
    })

    expect(container.textContent).toContain('Step 1 of 4')
    expect(container.textContent).toContain('Count Type')
    const restoredTypeCards = container.querySelectorAll('[role="radio"]')
    expect(restoredTypeCards[1].getAttribute('aria-checked')).toBe('true')

    act(() => {
      continueBtn.click()
    })
    const restoredLocationCards = container.querySelectorAll('[role="checkbox"]')
    expect(restoredLocationCards[0].getAttribute('aria-checked')).toBe('true')
    expect(restoredLocationCards[2].getAttribute('aria-checked')).toBe('true')
    expect(restoredLocationCards[6].getAttribute('aria-checked')).toBe('true')

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
