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

function goToStep3(container) {
  const continueBtn = getButtonByText(container, 'Continue')
  const typeCards = container.querySelectorAll('[role="radio"]')

  act(() => {
    typeCards[1].click()
  })
  act(() => {
    continueBtn.click()
  })

  const locationCards = container.querySelectorAll('[role="checkbox"]')
  act(() => {
    locationCards[0].click()
  })
  act(() => {
    locationCards[2].click()
  })
  act(() => {
    continueBtn.click()
  })

  return { continueBtn, locationCards }
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
    expect(container.textContent).toContain('Step 3 of 4')
    expect(container.textContent).toContain('Count Settings')
    expect(onClose).not.toHaveBeenCalled()

    const backBtn = getButtonByText(container, 'Back')
    act(() => {
      backBtn.click()
    })

    expect(container.textContent).toContain('Step 2 of 4')
    expect(container.textContent).toContain('Scope / Locations')
    const restoredLocationCards = container.querySelectorAll('[role="checkbox"]')
    expect(restoredLocationCards[0].getAttribute('aria-checked')).toBe('true')
    expect(restoredLocationCards[2].getAttribute('aria-checked')).toBe('true')
    expect(restoredLocationCards[6].getAttribute('aria-checked')).toBe('true')

    act(() => {
      backBtn.click()
    })
    expect(container.textContent).toContain('Step 1 of 4')
    expect(container.textContent).toContain('Count Type')
    const restoredTypeCards = container.querySelectorAll('[role="radio"]')
    expect(restoredTypeCards[1].getAttribute('aria-checked')).toBe('true')

    cleanup()
  })

  it('configures Step 3 settings and opens Step 4 placeholder without creating a session', () => {
    const onClose = vi.fn()
    const { container, cleanup } = render(
      createElement(InventoryCountWizard, { isOpen: true, onClose }),
    )

    const { continueBtn } = goToStep3(container)

    expect(container.textContent).toContain('Step 3 of 4')
    expect(container.textContent).toContain('Count Settings')
    expect(container.textContent).toContain(
      'Configure how this inventory session will be performed.',
    )

    const visibilityCards = container.querySelectorAll(
      '.inventory-count-wizard-body-visibility [role="radio"]',
    )
    expect(visibilityCards).toHaveLength(2)
    expect(visibilityCards[0].getAttribute('aria-checked')).toBe('true')
    expect(visibilityCards[0].textContent).toContain('Blind Count')
    expect(visibilityCards[0].textContent).toContain('Recommended')
    expect(continueBtn?.disabled).toBe(false)

    act(() => {
      visibilityCards[1].click()
    })
    expect(visibilityCards[0].getAttribute('aria-checked')).toBe('false')
    expect(visibilityCards[1].getAttribute('aria-checked')).toBe('true')

    const toggles = container.querySelectorAll('[role="switch"]')
    expect(toggles).toHaveLength(2)
    expect(toggles[0].getAttribute('aria-checked')).toBe('true')
    expect(toggles[1].getAttribute('aria-checked')).toBe('false')

    act(() => {
      toggles[0].click()
    })
    act(() => {
      toggles[1].click()
    })
    expect(toggles[0].getAttribute('aria-checked')).toBe('false')
    expect(toggles[1].getAttribute('aria-checked')).toBe('true')

    const noteInput = container.querySelector('.inventory-count-session-note-input')
    expect(noteInput).not.toBeNull()
    act(() => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value',
      )?.set
      nativeInputValueSetter?.call(noteInput, 'Month-end bar audit')
      noteInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(noteInput.value).toBe('Month-end bar audit')

    act(() => {
      continueBtn.click()
    })
    expect(container.textContent).toContain('Step 4 of 4')
    expect(container.textContent).toContain('Step 4 coming next')
    expect(continueBtn?.disabled).toBe(true)
    expect(onClose).not.toHaveBeenCalled()

    const backBtn = getButtonByText(container, 'Back')
    act(() => {
      backBtn.click()
    })
    expect(container.textContent).toContain('Step 3 of 4')
    expect(container.querySelector('.inventory-count-session-note-input')?.value).toBe('Month-end bar audit')
    expect(container.querySelectorAll('[role="switch"]')[0].getAttribute('aria-checked')).toBe('false')
    expect(container.querySelectorAll('[role="switch"]')[1].getAttribute('aria-checked')).toBe('true')
    expect(
      container.querySelectorAll('.inventory-count-wizard-body-visibility [role="radio"]')[1]
        .getAttribute('aria-checked'),
    ).toBe('true')

    act(() => {
      backBtn.click()
    })
    const restoredLocations = container.querySelectorAll('[role="checkbox"]')
    expect(restoredLocations[0].getAttribute('aria-checked')).toBe('true')
    expect(restoredLocations[2].getAttribute('aria-checked')).toBe('true')

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
