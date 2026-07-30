/**
 * @vitest-environment jsdom
 * P8.30.7 — Storage Adjustment reason + locked storage in shared movement modal
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import {
  STOCK_ADJUSTMENT_REASON_OPTIONS,
  StockMovementModal,
  buildAdjustmentMovementNote,
} from './StockMovementModal'

describe('buildAdjustmentMovementNote', () => {
  it('composes reason and optional note for the mutation note field', () => {
    expect(buildAdjustmentMovementNote('Damage', '')).toBe('Damage')
    expect(buildAdjustmentMovementNote('Waste', 'broken glass')).toBe('Waste: broken glass')
    expect(buildAdjustmentMovementNote('Other', 'shelf recount')).toBe('shelf recount')
    expect(buildAdjustmentMovementNote('Other', '')).toBe('Other')
  })
})

describe('StockMovementModal — P8.30.7 Storage Adjustment', () => {
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

  function renderModal(props = {}) {
    const onSubmit = props.onSubmit ?? vi.fn(async () => {})
    const onClose = props.onClose ?? vi.fn()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root.render(createElement(StockMovementModal, {
        item: { id: 'i1', name: 'Vodka', unit: 'btl', currentQuantity: 10 },
        movementType: 'adjustment',
        destinationStorage: { id: 'stor-main', name: 'Main Storage' },
        destinationLocked: true,
        requireAdjustmentReason: true,
        expectedQuantityVersion: 3,
        onClose,
        onSubmit,
        ...props,
      }))
    })
    return { onSubmit, onClose }
  }

  async function setInputValue(selector, value) {
    const input = container.querySelector(selector)
    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      nativeInputValueSetter?.call(input, String(value))
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
  }

  async function selectReason(value) {
    const select = container.querySelector('[data-testid="stock-adjustment-reason-select"]')
    await act(async () => {
      select.value = value
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
  }

  async function submitForm() {
    await act(async () => {
      container.querySelector('[data-testid="stock-movement-modal"] form')
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  it('locks storage and lists built-in adjustment reasons', () => {
    renderModal()
    expect(container.querySelector('[data-testid="stock-adjustment-storage-lock"]')?.textContent)
      .toContain('Main Storage')
    expect(container.querySelector('[data-testid="stock-adjustment-storage-lock"]')?.textContent)
      .toContain('Locked')
    const options = [...container.querySelectorAll('[data-testid="stock-adjustment-reason-select"] option')]
      .map((option) => option.value)
      .filter(Boolean)
    expect(options).toEqual([...STOCK_ADJUSTMENT_REASON_OPTIONS])
  })

  it('requires reason before submit', async () => {
    const { onSubmit } = renderModal()
    await setInputValue('[data-testid="stock-adjustment-quantity"]', '-1')
    await submitForm()
    expect(onSubmit).not.toHaveBeenCalled()
    expect(container.textContent).toMatch(/Choose an adjustment reason/i)
  })

  it('submits signed amount through shared movement payload with composed note', async () => {
    const { onSubmit } = renderModal()
    await setInputValue('[data-testid="stock-adjustment-quantity"]', '-2')
    await selectReason('Damage')
    await setInputValue('[data-testid="stock-adjustment-note"]', 'broken bottle')
    await submitForm()

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      type: 'adjustment',
      quantity: -2,
      note: 'Damage: broken bottle',
      reason: 'Damage',
      workspaceStorageId: 'stor-main',
      expectedQuantityVersion: 3,
      item: expect.objectContaining({ id: 'i1', name: 'Vodka' }),
    }))
  })

  it('requires a note when reason is Other', async () => {
    const { onSubmit } = renderModal()
    await setInputValue('[data-testid="stock-adjustment-quantity"]', '1')
    await selectReason('Other')
    await submitForm()
    expect(onSubmit).not.toHaveBeenCalled()
    expect(container.textContent).toMatch(/Enter a note for Other/i)
  })
})
