/**
 * @vitest-environment jsdom
 * P8.30.7b — Adjustment UX simplification (operation + positive qty)
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  StockMovementModal,
  isPositiveAdjustmentQuantityDraftAllowed,
  parsePositiveAdjustmentQuantity,
  toSignedAdjustmentQuantity,
} from './StockMovementModal'

describe('adjustment quantity helpers — P8.30.7b', () => {
  it('accepts positive drafts only and maps operation to signed quantity', () => {
    expect(isPositiveAdjustmentQuantityDraftAllowed('2')).toBe(true)
    expect(isPositiveAdjustmentQuantityDraftAllowed('2.5')).toBe(true)
    expect(isPositiveAdjustmentQuantityDraftAllowed('-2')).toBe(false)
    expect(isPositiveAdjustmentQuantityDraftAllowed('+2')).toBe(false)
    expect(parsePositiveAdjustmentQuantity('2')).toBe(2)
    expect(parsePositiveAdjustmentQuantity('0')).toBeNull()
    expect(parsePositiveAdjustmentQuantity('-2')).toBeNull()
    expect(toSignedAdjustmentQuantity('remove', 2)).toBe(-2)
    expect(toSignedAdjustmentQuantity('add', 2)).toBe(2)

    const modalSource = readFileSync(
      resolve(process.cwd(), 'src/components/stock/StockMovementModal.jsx'),
      'utf8',
    )
    expect(modalSource).not.toMatch(/Math\.abs\(/)
    expect(modalSource).not.toContain('STOCK_ADJUSTMENT_REASON_OPTIONS')
    expect(modalSource).not.toContain('Damage')
    expect(modalSource).toContain('Apply Adjustment')
    expect(modalSource).toContain('toSignedAdjustmentQuantity')
  })
})

describe('StockMovementModal — P8.30.7b Storage Adjustment', () => {
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
        expectedQuantityVersion: 3,
        balanceQuantity: 58,
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

  async function chooseOperation(operation) {
    const testId = operation === 'add'
      ? 'stock-adjustment-operation-add'
      : 'stock-adjustment-operation-remove'
    await act(async () => {
      container.querySelector(`[data-testid="${testId}"]`).click()
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

  it('locks storage and shows Remove/Add operation control', () => {
    renderModal()
    expect(container.querySelector('[data-testid="stock-adjustment-storage-lock"]')?.textContent)
      .toContain('Main Storage')
    expect(container.querySelector('[data-testid="stock-adjustment-operation"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="stock-adjustment-reason-select"]')).toBeNull()
    expect(container.querySelector('[data-testid="stock-adjustment-submit"]')?.textContent)
      .toContain('Apply Adjustment')
  })

  it('Remove + 2 submits quantity -2 and previews new balance 56', async () => {
    const { onSubmit } = renderModal()
    await chooseOperation('remove')
    await setInputValue('[data-testid="stock-adjustment-quantity"]', '2')
    expect(container.querySelector('[data-testid="stock-adjustment-preview-delta"]')?.textContent)
      .toContain('2')
    expect(container.querySelector('[data-testid="stock-adjustment-preview"]')?.textContent)
      .toContain('Remove')
    expect(container.querySelector('[data-testid="stock-adjustment-preview-result"]')?.textContent)
      .toContain('56')
    await submitForm()
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      type: 'adjustment',
      quantity: -2,
      operation: 'remove',
    }))
  })

  it('Add + 2 submits quantity +2 and previews new balance 60', async () => {
    const { onSubmit } = renderModal()
    await chooseOperation('add')
    await setInputValue('[data-testid="stock-adjustment-quantity"]', '2')
    expect(container.querySelector('[data-testid="stock-adjustment-preview"]')?.textContent)
      .toContain('Add')
    expect(container.querySelector('[data-testid="stock-adjustment-preview-result"]')?.textContent)
      .toContain('60')
    await submitForm()
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      quantity: 2,
      operation: 'add',
    }))
  })

  it('rejects typed negative characters and keeps notes preserved', async () => {
    renderModal()
    await setInputValue('[data-testid="stock-adjustment-quantity"]', '2')
    await setInputValue('[data-testid="stock-adjustment-note"]', 'Broken bottle')
    await setInputValue('[data-testid="stock-adjustment-quantity"]', '-2')
    expect(container.querySelector('[data-testid="stock-adjustment-quantity"]')?.value).toBe('2')
    expect(container.querySelector('[data-testid="stock-adjustment-note"]')?.value).toBe('Broken bottle')
    await chooseOperation('add')
    expect(container.querySelector('[data-testid="stock-adjustment-quantity"]')?.value).toBe('2')
    expect(container.querySelector('[data-testid="stock-adjustment-note"]')?.value).toBe('Broken bottle')
  })

  it('blocks Apply Adjustment when Remove would go negative', async () => {
    const { onSubmit } = renderModal({ balanceQuantity: 1 })
    await chooseOperation('remove')
    await setInputValue('[data-testid="stock-adjustment-quantity"]', '2')
    expect(container.querySelector('[data-testid="stock-adjustment-negative-blocker"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="stock-adjustment-submit"]')?.disabled).toBe(true)
    await submitForm()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits free-text notes without predefined reasons', async () => {
    const { onSubmit } = renderModal()
    await chooseOperation('remove')
    await setInputValue('[data-testid="stock-adjustment-quantity"]', '1')
    await setInputValue('[data-testid="stock-adjustment-note"]', 'Transferred to Seline')
    await submitForm()
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      quantity: -1,
      note: 'Transferred to Seline',
    }))
    expect(onSubmit.mock.calls[0][0].reason).toBeUndefined()
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

  it('keeps Receive on type=number without adjustment controls', async () => {
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
    expect(container.querySelector('[data-testid="stock-adjustment-operation"]')).toBeNull()
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

  it('keeps Dashboard adjustment on shared operation UX without Storage lock', async () => {
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

    expect(container.querySelector('[data-testid="stock-adjustment-storage-lock"]')).toBeNull()
    expect(container.querySelector('[data-testid="stock-adjustment-operation"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="stock-adjustment-submit"]')?.textContent)
      .toContain('Apply Adjustment')

    await act(async () => {
      container.querySelector('[data-testid="stock-adjustment-operation-remove"]').click()
    })
    const quantityInput = container.querySelector('[data-testid="stock-adjustment-quantity"]')
    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      nativeInputValueSetter?.call(quantityInput, '2')
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
      operation: 'remove',
    }))
  })
})
