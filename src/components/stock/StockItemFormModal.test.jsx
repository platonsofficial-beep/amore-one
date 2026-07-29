/**
 * @vitest-environment jsdom
 * P8.26.5 / P8.26.6 — Inventory Catalog workspace storage selector + create
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import {
  STOCK_CREATE_STORAGE_OPTION_VALUE,
  STOCK_LOCATIONS,
  mapWorkspaceStoragesToSelectOptions,
  resolveCatalogStorageSelectOptions,
  withPreservedStorageSelection,
} from '../../lib/stockCatalog'
import { StockItemFormModal } from './StockItemFormModal'

const { listWorkspaceStoragesMock, createWorkspaceStorageMock } = vi.hoisted(() => ({
  listWorkspaceStoragesMock: vi.fn(),
  createWorkspaceStorageMock: vi.fn(),
}))

vi.mock('../../services/workspaceStorageService', () => ({
  listWorkspaceStorages: (...args) => listWorkspaceStoragesMock(...args),
  createWorkspaceStorage: (...args) => createWorkspaceStorageMock(...args),
}))

function renderModal(props = {}) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)

  act(() => {
    root.render(createElement(StockItemFormModal, {
      onClose: vi.fn(),
      onSubmit: vi.fn(),
      isSaving: false,
      workspaceId: 'ws-1',
      isWorkspaceReady: true,
      ...props,
    }))
  })

  return {
    host,
    cleanup: () => {
      act(() => {
        root.unmount()
      })
      host.remove()
    },
  }
}

describe('catalog storage option helpers', () => {
  it('maps locationKey as value and name as label in service order', () => {
    expect(mapWorkspaceStoragesToSelectOptions([
      { locationKey: 'Cellar', name: 'Cellar', sortOrder: 0 },
      { locationKey: 'Bar', name: 'Front Bar', sortOrder: 1 },
    ])).toEqual([
      { value: 'Cellar', label: 'Cellar' },
      { value: 'Bar', label: 'Front Bar' },
    ])
  })

  it('falls back to STOCK_LOCATIONS when workspace list is empty', () => {
    expect(resolveCatalogStorageSelectOptions([])).toEqual(
      STOCK_LOCATIONS.map((location) => ({ value: location, label: location })),
    )
  })

  it('preserves an existing selection missing from the catalog list', () => {
    expect(withPreservedStorageSelection(
      [{ value: 'Bar', label: 'Bar' }],
      'Legacy Cellar',
    )).toEqual([
      { value: 'Bar', label: 'Bar' },
      { value: 'Legacy Cellar', label: 'Legacy Cellar' },
    ])
  })
})

describe('StockItemFormModal workspace storage integration', () => {
  beforeEach(() => {
    listWorkspaceStoragesMock.mockReset()
    createWorkspaceStorageMock.mockReset()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('loads workspace storages and stores locationKey on select', async () => {
    listWorkspaceStoragesMock.mockResolvedValue([
      { id: 's1', locationKey: 'Cellar', name: 'Cellar', active: true, sortOrder: 0 },
      { id: 's2', locationKey: 'Bar', name: 'Bar', active: true, sortOrder: 1 },
    ])
    const onSubmit = vi.fn().mockResolvedValue(undefined)

    const { host, cleanup } = renderModal({
      onSubmit,
      initialItem: {
        id: 'item-1',
        name: 'Ketel One',
        category: 'Spirits',
        itemType: 'Vodka',
        supplier: '',
        storageLocation: 'Bar',
        unit: 'Bottle',
        currentQuantity: 2,
        minimumQuantity: 0,
        costPrice: 0,
      },
    })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(listWorkspaceStoragesMock).toHaveBeenCalledWith('ws-1')

    const buttons = [...host.querySelectorAll('.stock-location-preset')]
      .filter((button) => !button.dataset.stockCreateStorage)
    expect(buttons.map((button) => button.textContent)).toEqual(['Cellar', 'Bar'])

    await act(async () => {
      buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(host.querySelector('.stock-location-preset.active')?.textContent).toBe('Cellar')

    await act(async () => {
      host.querySelector('form.stock-item-form').dispatchEvent(new Event('submit', {
        bubbles: true,
        cancelable: true,
      }))
      await Promise.resolve()
    })

    expect(onSubmit).toHaveBeenCalled()
    expect(onSubmit.mock.calls[0][0].storageLocation).toBe('Cellar')

    cleanup()
  })

  it('preserves an existing item location not present in workspace storages', async () => {
    listWorkspaceStoragesMock.mockResolvedValue([
      { id: 's1', locationKey: 'Bar', name: 'Bar', active: true, sortOrder: 0 },
    ])

    const { host, cleanup } = renderModal({
      initialItem: {
        id: 'item-1',
        name: 'Legacy Gin',
        category: 'Spirits',
        itemType: 'Gin',
        supplier: '',
        storageLocation: 'Old Cellar',
        unit: 'Bottle',
        currentQuantity: 1,
        minimumQuantity: 0,
        costPrice: 0,
      },
    })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const labels = [...host.querySelectorAll('.stock-location-preset')]
      .filter((button) => !button.dataset.stockCreateStorage)
      .map((button) => button.textContent)
    expect(labels).toContain('Bar')
    expect(labels).toContain('Old Cellar')
    expect(host.querySelector('.stock-location-preset.active')?.textContent).toBe('Old Cellar')

    cleanup()
  })

  it('falls back to STOCK_LOCATIONS when workspace storages are empty', async () => {
    listWorkspaceStoragesMock.mockResolvedValue([])

    const { host, cleanup } = renderModal()

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const labels = [...host.querySelectorAll('.stock-location-preset')]
      .filter((button) => !button.dataset.stockCreateStorage)
      .map((button) => button.textContent)
    expect(labels).toEqual([...STOCK_LOCATIONS])

    cleanup()
  })

  it('opens create dialog, reloads list, and auto-selects the new storage', async () => {
    listWorkspaceStoragesMock
      .mockResolvedValueOnce([
        { id: 's1', locationKey: 'Bar', name: 'Bar', active: true, sortOrder: 0 },
      ])
      .mockResolvedValueOnce([
        { id: 's1', locationKey: 'Bar', name: 'Bar', active: true, sortOrder: 0 },
        { id: 's2', locationKey: 'Cellar', name: 'Cellar', active: true, sortOrder: 1 },
      ])
    createWorkspaceStorageMock.mockResolvedValue({
      id: 's2',
      locationKey: 'Cellar',
      name: 'Cellar',
      active: true,
      sortOrder: 1,
    })

    const { host, cleanup } = renderModal({
      initialItem: {
        id: 'item-1',
        name: 'Vodka',
        category: 'Spirits',
        itemType: 'Vodka',
        supplier: '',
        storageLocation: 'Bar',
        unit: 'Bottle',
        currentQuantity: 1,
        minimumQuantity: 0,
        costPrice: 0,
      },
    })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const createButton = host.querySelector('[data-stock-create-storage="true"]')
    expect(createButton?.dataset.value).toBe(STOCK_CREATE_STORAGE_OPTION_VALUE)

    await act(async () => {
      createButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const dialog = document.querySelector('[data-create-workspace-storage-dialog="true"]')
    expect(dialog).toBeTruthy()
    const input = dialog.querySelector('input')
    const form = dialog.querySelector('form')

    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      nativeInputValueSetter?.call(input, 'Cellar')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(createWorkspaceStorageMock).toHaveBeenCalledWith('ws-1', 'Cellar')
    expect(listWorkspaceStoragesMock.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(host.querySelector('.stock-location-preset.active')?.textContent).toBe('Cellar')
    expect(document.querySelector('[data-create-workspace-storage-dialog="true"]')).toBeNull()

    cleanup()
  })
})
