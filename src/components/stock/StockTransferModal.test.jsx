/**
 * @vitest-environment jsdom
 * P8.30.6b — missing destination balance support
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { StockTransferModal } from './StockTransferModal'

describe('StockTransferModal — P8.30.6b missing destination balance', () => {
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

  async function settle() {
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  function renderModal(props = {}) {
    const loadDestinations = props.loadDestinations ?? vi.fn(async () => ([
      { id: 'stor-main', name: 'Main Storage', active: true },
      { id: 'stor-bar', name: 'Bar', active: true },
      { id: 'stor-freezer', name: 'Freezer', active: true },
      { id: 'stor-wine', name: 'Wine Cellar', active: true },
      { id: 'stor-old', name: 'Old Cellar', active: false },
    ]))
    const loadItemBalances = props.loadItemBalances ?? vi.fn(async () => ([
      { workspaceStorageId: 'stor-bar', quantityVersion: 7, quantity: 1 },
      { workspaceStorageId: 'stor-main', quantityVersion: 2, quantity: 5 },
    ]))
    const onSubmit = props.onSubmit ?? vi.fn(async () => {})
    const onClose = props.onClose ?? vi.fn()

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root.render(createElement(StockTransferModal, {
        item: { id: 'i1', name: 'Vodka', unit: 'btl' },
        sourceStorage: { id: 'stor-main', name: 'Main Storage' },
        sourceQuantity: 5,
        sourceQuantityVersion: 2,
        workspaceId: 'ws-1',
        onClose,
        onSubmit,
        loadDestinations,
        loadItemBalances,
        ...props,
      }))
    })

    return { loadDestinations, loadItemBalances, onSubmit, onClose }
  }

  async function selectDestination(storageId) {
    const select = container.querySelector('[data-testid="stock-transfer-destination-select"]')
    await act(async () => {
      select.value = storageId
      select.dispatchEvent(new Event('change', { bubbles: true }))
      await Promise.resolve()
    })
  }

  async function setQuantity(value) {
    const quantityInput = container.querySelector('[data-testid="stock-transfer-modal"] input[type="number"]')
    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      nativeInputValueSetter?.call(quantityInput, String(value))
      quantityInput.dispatchEvent(new Event('input', { bubbles: true }))
      quantityInput.dispatchEvent(new Event('change', { bubbles: true }))
    })
  }

  async function submitForm() {
    await act(async () => {
      container.querySelector('[data-testid="stock-transfer-modal"] form')
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  it('lists every active destination except source, including storages without a balance', async () => {
    renderModal()
    await settle()

    const select = container.querySelector('[data-testid="stock-transfer-destination-select"]')
    const options = [...select.querySelectorAll('option')].filter((option) => option.value)
    const values = options.map((option) => option.value)
    const labels = options.map((option) => option.textContent)

    expect(values).toEqual(expect.arrayContaining(['stor-bar', 'stor-freezer', 'stor-wine']))
    expect(values).not.toContain('stor-main')
    expect(values).not.toContain('stor-old')
    expect(labels).toContain('Bar')
    expect(labels).toContain('Freezer (New)')
    expect(labels).toContain('Wine Cellar (New)')
  })

  it('submits expectedDestinationQuantityVersion = 1 when destination has no balance', async () => {
    const { onSubmit, loadItemBalances } = renderModal()
    await settle()

    await selectDestination('stor-freezer')
    expect(container.querySelector('[data-testid="stock-transfer-new-destination-hint"]')?.textContent)
      .toContain('First transfer to this storage will automatically create its inventory balance.')
    expect(container.querySelector('[data-testid="stock-transfer-submit"]')?.disabled).toBe(false)
    expect(container.textContent).not.toMatch(/no balance at the selected destination/i)

    await setQuantity(2)
    await submitForm()

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      destinationWorkspaceStorageId: 'stor-freezer',
      expectedDestinationQuantityVersion: 1,
      expectedSourceQuantityVersion: 2,
      quantity: 2,
    }))
    expect(loadItemBalances).toHaveBeenCalledWith('ws-1', 'i1')
    expect(loadItemBalances.mock.calls.length).toBe(1)
  })

  it('keeps the real quantityVersion when destination balance already exists', async () => {
    const { onSubmit } = renderModal()
    await settle()

    await selectDestination('stor-bar')
    expect(container.querySelector('[data-testid="stock-transfer-new-destination-hint"]')).toBeNull()
    expect([...container.querySelectorAll('option')]
      .find((option) => option.value === 'stor-bar')?.textContent).toBe('Bar')

    await setQuantity(1)
    await submitForm()

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      destinationWorkspaceStorageId: 'stor-bar',
      expectedDestinationQuantityVersion: 7,
    }))
  })

  it('does not create balances in JavaScript and does not call mutation APIs', async () => {
    const { loadDestinations, loadItemBalances, onSubmit } = renderModal()
    await settle()
    await selectDestination('stor-wine')
    await setQuantity(1)
    await submitForm()

    expect(loadDestinations).toHaveBeenCalledTimes(1)
    expect(loadItemBalances).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledTimes(1)
    const payload = onSubmit.mock.calls[0][0]
    expect(payload).not.toHaveProperty('createBalance')
    expect(payload).not.toHaveProperty('insertBalance')
    expect(JSON.stringify(payload)).not.toMatch(/insert|createBalance|patchQuantity/i)
  })
})
