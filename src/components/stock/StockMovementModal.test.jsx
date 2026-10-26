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

describe('StockMovementModal — location usage ceiling', () => {
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

  async function setUsageQuantity(value) {
    const quantityInput = container.querySelector('input[type="number"]')
    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      nativeInputValueSetter?.call(quantityInput, value)
      quantityInput.dispatchEvent(new Event('input', { bubbles: true }))
      quantityInput.dispatchEvent(new Event('change', { bubbles: true }))
    })
  }

  async function submitUsage() {
    await act(async () => {
      container.querySelector('[data-testid="stock-movement-modal"] form')
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await Promise.resolve()
    })
  }

  it('rejects usage above the selected storage balance and allows usage within it', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    const onSubmit = vi.fn(async () => {})
    act(() => {
      root.render(createElement(StockMovementModal, {
        item: { id: 'i1', name: 'Vodka', unit: 'btl', currentQuantity: 10 },
        movementType: 'usage',
        destinationStorage: { id: 'stor-bar', name: 'Main Bar' },
        balanceQuantity: 2,
        onClose: vi.fn(),
        onSubmit,
      }))
    })

    await setUsageQuantity('5')
    await submitUsage()

    expect(onSubmit).not.toHaveBeenCalled()
    expect(container.textContent).toContain('balance in this storage')

    await setUsageQuantity('2')
    await submitUsage()

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      type: 'usage',
      quantity: 2,
      workspaceStorageId: 'stor-bar',
    }))
  })
})

describe('StockMovementModal — dashboard storage picker', () => {
  let container
  let root

  const choices = [
    { id: 'stor-bar', name: 'Main Bar', locationKey: 'Main Bar', active: true },
    { id: 'stor-main', name: 'Main Storage', locationKey: 'Main Storage', active: true },
  ]
  const balances = [
    { workspaceStorageId: 'stor-bar', locationName: 'Main Bar', locationKey: 'Main Bar', quantity: 2, quantityVersion: 4, storageActive: true },
    { workspaceStorageId: 'stor-main', locationName: 'Main Storage', locationKey: 'Main Storage', quantity: 3, quantityVersion: 2, storageActive: true },
  ]

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    container?.remove()
    container = null
    root = null
    sessionStorage.clear()
  })

  function renderPicker(props = {}) {
    const onSubmit = props.onSubmit ?? vi.fn(async () => {})
    const onClose = props.onClose ?? vi.fn()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root.render(createElement(StockMovementModal, {
        item: {
          id: 'i1',
          name: 'Vodka',
          unit: 'btl',
          currentQuantity: 10,
          storageLocation: 'Main Bar',
        },
        movementType: 'receive',
        workspaceId: 'ws-1',
        storageChoices: choices,
        locationBalances: balances,
        onClose,
        onSubmit,
        ...props,
      }))
    })
    return { onSubmit, onClose }
  }

  async function setNumber(value) {
    const input = container.querySelector('input[type="number"]')
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

  async function submit() {
    await act(async () => {
      container.querySelector('[data-testid="stock-movement-modal"] form')
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  it('defaults to the catalog storage and can switch in the sheet', async () => {
    const { onSubmit, onClose } = renderPicker()
    const row = container.querySelector('[data-testid="stock-movement-storage-row"]')
    expect(row?.textContent).toBe('Receive into Main Bar')
    expect(row?.getBoundingClientRect).toBeTypeOf('function')

    await act(async () => {
      row.click()
    })
    const option = document.body.querySelector('[data-testid="stock-movement-storage-option-stor-main"]')
    expect(option?.textContent).toContain('Main Storage')
    await act(async () => {
      option.click()
    })
    expect(container.querySelector('[data-testid="stock-movement-storage-row"]')?.textContent)
      .toBe('Receive into Main Storage')

    await setNumber('1')
    await submit()

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      type: 'receive',
      quantity: 1,
      workspaceStorageId: 'stor-main',
      expectedQuantityVersion: 2,
    }))
    expect(onClose).toHaveBeenCalled()
    expect(sessionStorage.getItem('one.stockMovementStorage:ws-1:i1')).toBe('stor-main')
  })

  it('labels quick count with the storage and notes stock held elsewhere', async () => {
    renderPicker({ movementType: 'stock_count' })
    expect(container.querySelector('[data-testid="stock-movement-storage-row"]')?.textContent)
      .toBe('Count Main Bar')
    expect(container.querySelector('[data-testid="stock-movement-other-locations"]')?.textContent)
      .toContain('Main Storage keeps')
    const input = container.querySelector('input[type="number"]')
    expect(input.value).toBe('2')
    await setNumber('4')
    expect(container.querySelector('[data-testid="stock-movement-submit"]')?.textContent)
      .toBe('Set Main Bar to 4')
  })

  it('sends version 0 when receive starts a storage that has no balance row', async () => {
    const { onSubmit } = renderPicker({
      storageChoices: [choices[0]],
      locationBalances: [],
      lastUsedStorageId: '',
    })
    expect(container.querySelector('[data-testid="stock-movement-balance-gap"]')).toBeNull()
    expect(container.querySelector('[data-testid="stock-movement-balance-start"]')?.textContent)
      .toContain('Saving starts this storage')
    expect(container.querySelector('[data-testid="stock-movement-submit"]')?.disabled).toBe(false)
    await setNumber('5')
    await submit()
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      type: 'receive',
      quantity: 5,
      workspaceStorageId: 'stor-bar',
      expectedQuantityVersion: 0,
    }))
  })

  it('sends version 0 for a positive adjustment onto an empty shelf and blocks remove', async () => {
    const { onSubmit } = renderPicker({
      movementType: 'adjustment',
      storageChoices: [choices[0]],
      locationBalances: [],
      lastUsedStorageId: '',
    })
    expect(container.querySelector('[data-testid="stock-movement-balance-gap"]')?.textContent)
      .toContain('No balance at Main Bar')
    expect(container.querySelector('[data-testid="stock-adjustment-submit"]')?.disabled).toBe(true)

    await act(async () => {
      container.querySelector('[data-testid="stock-adjustment-operation-add"]').click()
    })
    expect(container.querySelector('[data-testid="stock-movement-balance-start"]')?.textContent)
      .toContain('Saving starts this storage')
    const input = container.querySelector('[data-testid="stock-adjustment-quantity"]')
    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      nativeInputValueSetter?.call(input, '2')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(container.querySelector('[data-testid="stock-adjustment-submit"]')?.disabled).toBe(false)
    await submit()
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      type: 'adjustment',
      quantity: 2,
      workspaceStorageId: 'stor-bar',
      expectedQuantityVersion: 0,
    }))
  })

  it('sends version 0 when a count starts a storage that has no balance row', async () => {
    const { onSubmit } = renderPicker({
      movementType: 'stock_count',
      storageChoices: [choices[0]],
      locationBalances: [],
      lastUsedStorageId: '',
    })
    expect(container.querySelector('[data-testid="stock-movement-balance-start"]')).toBeTruthy()
    await setNumber('4')
    await submit()
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      type: 'stock_count',
      quantity: 4,
      expectedQuantityVersion: 0,
    }))
  })

  it('blocks usage when the chosen storage has no balance row', async () => {
    const { onSubmit } = renderPicker({
      movementType: 'usage',
      storageChoices: [choices[0]],
      locationBalances: [],
      lastUsedStorageId: '',
    })
    expect(container.querySelector('[data-testid="stock-movement-balance-gap"]')?.textContent)
      .toContain('No balance at Main Bar')
    expect(container.querySelector('[data-testid="stock-movement-submit"]')?.disabled).toBe(true)
    await setNumber('1')
    await submit()
    expect(onSubmit).not.toHaveBeenCalled()
    expect(container.textContent).toContain('No balance at Main Bar')
  })

  it('keeps the modal open and reloads the balance when the version is stale', async () => {
    const mismatch = new Error('stock_location_balance_version_mismatch')
    const onSubmit = vi.fn(async () => {
      throw mismatch
    })
    const onClose = vi.fn()
    const onReloadBalances = vi.fn(async () => {})
    renderPicker({ onSubmit, onClose, onReloadBalances })
    await setNumber('1')
    await submit()
    expect(onReloadBalances).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
    expect(container.textContent).toContain('This balance changed')
    expect(container.querySelector('[data-testid="stock-movement-modal"]')).toBeTruthy()
  })
})

describe('StockMovementModal — waste', () => {
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

  async function setQuantity(value) {
    const quantityInput = container.querySelector('input[type="number"]')
    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      nativeInputValueSetter?.call(quantityInput, value)
      quantityInput.dispatchEvent(new Event('input', { bubbles: true }))
      quantityInput.dispatchEvent(new Event('change', { bubbles: true }))
    })
  }

  it('records waste as usage with a structured reason and refuses to exceed the shelf', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    const onSubmit = vi.fn(async () => {})
    const onClose = vi.fn()
    act(() => {
      root.render(createElement(StockMovementModal, {
        item: { id: 'i1', name: 'Vodka', unit: 'btl', currentQuantity: 10 },
        movementType: 'waste',
        destinationStorage: { id: 'stor-bar', name: 'Main Bar' },
        destinationLocked: true,
        balanceQuantity: 2,
        expectedQuantityVersion: 4,
        onClose,
        onSubmit,
      }))
    })

    expect(container.textContent).toContain('Waste')
    expect(container.textContent).toContain('Broken')
    expect(container.querySelector('[data-testid="stock-waste-storage-lock"]')?.textContent)
      .toContain('Main Bar')

    await setQuantity('1')
    await act(async () => {
      container.querySelector('[data-testid="stock-movement-modal"] form')
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await Promise.resolve()
    })
    expect(onSubmit).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Choose a reason.')

    await act(async () => {
      container.querySelector('[data-waste-reason="spilled"]').click()
    })
    await setQuantity('5')
    await act(async () => {
      container.querySelector('[data-testid="stock-movement-modal"] form')
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await Promise.resolve()
    })
    expect(onSubmit).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Waste cannot exceed')

    await setQuantity('2')
    const note = container.querySelector('input[type="text"]')
    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      nativeInputValueSetter?.call(note, 'end of night')
      note.dispatchEvent(new Event('input', { bubbles: true }))
      note.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await act(async () => {
      container.querySelector('[data-testid="stock-movement-modal"] form')
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await Promise.resolve()
    })

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      type: 'usage',
      quantity: 2,
      note: 'Waste · Spilled · end of night',
      wasteReasonId: 'spilled',
      workspaceStorageId: 'stor-bar',
      expectedQuantityVersion: 4,
    }))
    expect(onClose).toHaveBeenCalled()
  })
})
