/**
 * @vitest-environment jsdom
 * P8.30.7 / P8.30.7a — Signed adjustment + iPad-stable input
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  STOCK_ADJUSTMENT_REASON_OPTIONS,
  StockMovementModal,
  buildAdjustmentMovementNote,
  isAdjustmentQuantityDraftAllowed,
  isAdjustmentQuantityIntermediate,
  parseSignedAdjustmentQuantity,
} from './StockMovementModal'

describe('buildAdjustmentMovementNote', () => {
  it('composes reason and optional note for the mutation note field', () => {
    expect(buildAdjustmentMovementNote('Damage', '')).toBe('Damage')
    expect(buildAdjustmentMovementNote('Waste', 'broken glass')).toBe('Waste: broken glass')
    expect(buildAdjustmentMovementNote('Other', 'shelf recount')).toBe('shelf recount')
    expect(buildAdjustmentMovementNote('Other', '')).toBe('Other')
  })
})

describe('signed adjustment quantity parsing — P8.30.7a', () => {
  it('preserves intermediate "-" and rejects sign stripping helpers', () => {
    expect(isAdjustmentQuantityIntermediate('-')).toBe(true)
    expect(isAdjustmentQuantityDraftAllowed('-')).toBe(true)
    expect(parseSignedAdjustmentQuantity('-')).toBeNull()
    expect(parseSignedAdjustmentQuantity('-2')).toBe(-2)
    expect(parseSignedAdjustmentQuantity('2')).toBe(2)
    expect(parseSignedAdjustmentQuantity('+2')).toBe(2)
    expect(parseSignedAdjustmentQuantity('0')).toBeNull()

    const modalSource = readFileSync(
      resolve(process.cwd(), 'src/components/stock/StockMovementModal.jsx'),
      'utf8',
    )
    expect(modalSource).not.toMatch(/Math\.abs\(/)
    expect(modalSource).toContain('type="text"')
    expect(modalSource).toContain('inputMode="decimal"')
    expect(modalSource).toContain('parseSignedAdjustmentQuantity')
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
        balanceQuantity: 24,
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

  async function typeAdjustmentAmount(raw) {
    const input = container.querySelector('[data-testid="stock-adjustment-quantity"]')
    let built = ''
    for (const char of String(raw)) {
      built += char
      await act(async () => {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        )?.set
        nativeInputValueSetter?.call(input, built)
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
      })
    }
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

  it('preserves intermediate "-" while typing and keeps Save disabled', async () => {
    renderModal()
    await typeAdjustmentAmount('-')
    expect(container.querySelector('[data-testid="stock-adjustment-quantity"]')?.value).toBe('-')
    expect(container.querySelector('[data-testid="stock-adjustment-submit"]')?.disabled).toBe(true)
    expect(container.querySelector('[data-testid="stock-adjustment-cancel"]')?.disabled).toBe(false)
  })

  it('types "-2" and submits numeric -2 without sign inversion', async () => {
    const { onSubmit } = renderModal()
    await typeAdjustmentAmount('-2')
    expect(container.querySelector('[data-testid="stock-adjustment-quantity"]')?.value).toBe('-2')
    expect(container.querySelector('[data-testid="stock-adjustment-preview-delta"]')?.textContent)
      .toContain('-2')
    expect(container.querySelector('[data-testid="stock-adjustment-preview-result"]')?.textContent)
      .toContain('22')
    await selectReason('Damage')
    await submitForm()
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      type: 'adjustment',
      quantity: -2,
    }))
    expect(onSubmit.mock.calls[0][0].quantity).toBeLessThan(0)
  })

  it('submits positive 2 as +2 and previews new balance 26', async () => {
    const { onSubmit } = renderModal()
    await typeAdjustmentAmount('2')
    expect(container.querySelector('[data-testid="stock-adjustment-preview-delta"]')?.textContent)
      .toContain('+2')
    expect(container.querySelector('[data-testid="stock-adjustment-preview-result"]')?.textContent)
      .toContain('26')
    await selectReason('Found stock')
    await submitForm()
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      quantity: 2,
    }))
  })

  it('requires reason before submit', async () => {
    const { onSubmit } = renderModal()
    await setInputValue('[data-testid="stock-adjustment-quantity"]', '-1')
    await submitForm()
    expect(onSubmit).not.toHaveBeenCalled()
    expect(container.textContent).toMatch(/Choose an adjustment reason/i)
  })

  it('preserves amount when reason and Other note change', async () => {
    renderModal()
    await typeAdjustmentAmount('-2')
    await selectReason('Waste')
    expect(container.querySelector('[data-testid="stock-adjustment-quantity"]')?.value).toBe('-2')
    await selectReason('Other')
    expect(container.querySelector('[data-testid="stock-adjustment-quantity"]')?.value).toBe('-2')
    await setInputValue('[data-testid="stock-adjustment-note"]', 'shelf recount')
    expect(container.querySelector('[data-testid="stock-adjustment-quantity"]')?.value).toBe('-2')
  })

  it('blocks Save when new balance would be negative', async () => {
    const { onSubmit } = renderModal({ balanceQuantity: 1 })
    await typeAdjustmentAmount('-2')
    await selectReason('Damage')
    expect(container.querySelector('[data-testid="stock-adjustment-negative-blocker"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="stock-adjustment-submit"]')?.disabled).toBe(true)
    await submitForm()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('keeps Cancel/close responsive while amount is intermediate', async () => {
    const { onClose } = renderModal()
    await typeAdjustmentAmount('-')
    const cancel = container.querySelector('[data-testid="stock-adjustment-cancel"]')
    expect(cancel?.disabled).toBe(false)
    await act(async () => {
      cancel.click()
    })
    expect(onClose).toHaveBeenCalled()
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

describe('StockMovementModal — Receive / Dashboard regression', () => {
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

  it('keeps Receive on type=number without adjustment preview/reason', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    const onSubmit = vi.fn(async () => {})
    act(() => {
      root.render(createElement(StockMovementModal, {
        item: { id: 'i1', name: 'Vodka', unit: 'btl', currentQuantity: 10 },
        movementType: 'receive',
        destinationStorage: { id: 'stor-main', name: 'Main Storage' },
        destinationLocked: true,
        expectedQuantityVersion: 2,
        onClose: vi.fn(),
        onSubmit,
      }))
    })

    expect(container.querySelector('[data-testid="stock-receive-destination-lock"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="stock-adjustment-preview"]')).toBeNull()
    expect(container.querySelector('[data-testid="stock-adjustment-reason-select"]')).toBeNull()
    const quantityInput = container.querySelector('input[type="number"]')
    expect(quantityInput).toBeTruthy()

    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      nativeInputValueSetter?.call(quantityInput, '3')
      quantityInput.dispatchEvent(new Event('input', { bubbles: true }))
      quantityInput.dispatchEvent(new Event('change', { bubbles: true }))
      container.querySelector('[data-testid="stock-movement-modal"] form')
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      type: 'receive',
      quantity: 3,
      workspaceStorageId: 'stor-main',
    }))
  })

  it('keeps Dashboard adjustment without mandatory reason', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    const onSubmit = vi.fn(async () => {})
    act(() => {
      root.render(createElement(StockMovementModal, {
        item: { id: 'i1', name: 'Vodka', unit: 'btl', currentQuantity: 24 },
        movementType: 'adjustment',
        onClose: vi.fn(),
        onSubmit,
      }))
    })

    expect(container.querySelector('[data-testid="stock-adjustment-reason-select"]')).toBeNull()
    expect(container.querySelector('[data-testid="stock-adjustment-preview"]')).toBeTruthy()

    const quantityInput = container.querySelector('[data-testid="stock-adjustment-quantity"]')
    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      nativeInputValueSetter?.call(quantityInput, '-2')
      quantityInput.dispatchEvent(new Event('input', { bubbles: true }))
      quantityInput.dispatchEvent(new Event('change', { bubbles: true }))
      container.querySelector('[data-testid="stock-movement-modal"] form')
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      type: 'adjustment',
      quantity: -2,
    }))
  })
})
