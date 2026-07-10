/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { CanvasObjectNode } from './CanvasObjectNode'
import { buildTableSizePresetPatch, FLOOR_PLAN_OBJECT_TYPES } from '../models/floorPlanObject'
import { createInitialBuilderState, floorPlanBuilderReducer } from '../context/floorPlanBuilderContextState'
import { getTableHandleSize } from '../lib/tableHandleMetrics'

const tableObject = {
  id: 'table-1',
  type: FLOOR_PLAN_OBJECT_TYPES.TABLE,
  position: { x: 100, y: 120 },
  size: { width: 140, height: 140 },
  rotation: 0,
  properties: {
    shape: 'round',
    tableNumber: '1',
    minGuests: 2,
    maxGuests: 4,
    capacity: 4,
  },
}

function renderNode(props) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(createElement(CanvasObjectNode, props))
  })

  return {
    container,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

describe('CanvasObjectNode drag start', () => {
  it('starts drag from the table body but not from resize handles', () => {
    const onPointerDown = vi.fn()
    const onResizePointerDown = vi.fn()

    const { container, unmount } = renderNode({
      object: tableObject,
      isSelected: true,
      showTransformChrome: true,
      isDragging: false,
      isTransforming: false,
      activeTool: 'select',
      isEditable: true,
      onPointerDown,
      onPointerMove: vi.fn(),
      onPointerUp: vi.fn(),
      onResizePointerDown,
      onRotatePointerDown: vi.fn(),
    })

    const body = container.querySelector('.fpb-canvas-object-surface')
    body.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      pointerId: 1,
      pointerType: 'touch',
    }))
    expect(onPointerDown).toHaveBeenCalledTimes(1)
    expect(onResizePointerDown).not.toHaveBeenCalled()

    const handle = container.querySelector('.fpb-handle-nw')
    handle.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      pointerId: 2,
      pointerType: 'touch',
    }))
    expect(onPointerDown).toHaveBeenCalledTimes(1)
    expect(onResizePointerDown).toHaveBeenCalledTimes(1)

    unmount()
  })

  it('uses smaller resize handles after a table preset shrinks the table body', () => {
    const onPointerDown = vi.fn()
    const { container, unmount } = renderNode({
      object: {
        ...tableObject,
        size: { width: 90, height: 90 },
      },
      isSelected: true,
      showTransformChrome: true,
      isDragging: false,
      isTransforming: false,
      activeTool: 'select',
      isEditable: true,
      onPointerDown,
      onPointerMove: vi.fn(),
      onPointerUp: vi.fn(),
      onResizePointerDown: vi.fn(),
      onRotatePointerDown: vi.fn(),
    })

    const root = container.querySelector('.fpb-canvas-object')
    expect(root.style.getPropertyValue('--fpb-handle-size')).toBe(`${getTableHandleSize(90)}px`)

    const body = container.querySelector('.fpb-canvas-object-surface')
    body.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      pointerId: 3,
      pointerType: 'touch',
    }))
    expect(onPointerDown).toHaveBeenCalledTimes(1)

    unmount()
  })
})

describe('CanvasObjectNode preset dimensions', () => {
  it('renders width and height from object.size after a preset update', () => {
    const initialState = {
      ...createInitialBuilderState({ initialEditing: true }),
      objects: [{
        id: 'table-1',
        type: FLOOR_PLAN_OBJECT_TYPES.TABLE,
        floorId: 'main-dining',
        position: { x: 120, y: 160 },
        size: { width: 200, height: 200 },
        rotation: 0,
        properties: {
          shape: 'square',
          tableNumber: '1',
          minGuests: 4,
          maxGuests: 6,
          capacity: 6,
        },
      }],
    }

    const nextState = floorPlanBuilderReducer(initialState, {
      type: 'UPDATE_TABLE',
      payload: {
        objectId: 'table-1',
        patch: buildTableSizePresetPatch('square', 'small'),
      },
    })

    const table = nextState.objects[0]
    const { container, unmount } = renderNode({
      object: table,
      isSelected: true,
      showTransformChrome: true,
      isDragging: false,
      isTransforming: false,
      activeTool: 'select',
      isEditable: true,
      onPointerDown: vi.fn(),
      onPointerMove: vi.fn(),
      onPointerUp: vi.fn(),
      onResizePointerDown: vi.fn(),
      onRotatePointerDown: vi.fn(),
    })

    const root = container.querySelector('.fpb-canvas-object')
    expect(root.style.width).toBe('110px')
    expect(root.style.height).toBe('110px')
    expect(table.properties.minGuests).toBe(4)
    expect(table.properties.maxGuests).toBe(6)

    unmount()
  })

  it('keeps canonical position and size styles while transforming', () => {
    const { container, unmount } = renderNode({
      object: tableObject,
      isSelected: true,
      showTransformChrome: true,
      isDragging: false,
      isTransforming: true,
      activeTool: 'select',
      isEditable: true,
      onPointerDown: vi.fn(),
      onPointerMove: vi.fn(),
      onPointerUp: vi.fn(),
      onResizePointerDown: vi.fn(),
      onRotatePointerDown: vi.fn(),
    })

    const root = container.querySelector('.fpb-canvas-object')
    expect(root.style.left).toBe('100px')
    expect(root.style.top).toBe('120px')
    expect(root.style.width).toBe('140px')
    expect(root.style.height).toBe('140px')

    unmount()
  })
})

describe('CanvasObjectNode selection chrome', () => {
  it('renders handles inside the rotated object body within the positioned root', () => {
    const { container, unmount } = renderNode({
      object: {
        ...tableObject,
        rotation: 30,
      },
      isSelected: true,
      showTransformChrome: true,
      isDragging: false,
      isTransforming: false,
      activeTool: 'select',
      isEditable: true,
      cameraZoom: 1,
      onPointerDown: vi.fn(),
      onPointerMove: vi.fn(),
      onPointerUp: vi.fn(),
      onResizePointerDown: vi.fn(),
      onRotatePointerDown: vi.fn(),
    })

    const root = container.querySelector('.fpb-canvas-object')
    const body = container.querySelector('[data-fpb-object-body]')
    const chrome = container.querySelector('.fpb-selection-chrome')
    const handle = container.querySelector('.fpb-handle-nw')

    expect(root.style.transform).toBe('')
    expect(body.style.transform).toBe('rotate(30deg)')
    expect(body.contains(chrome)).toBe(true)
    expect(chrome.contains(handle)).toBe(true)

    unmount()
  })

  it('re-renders selection chrome when camera zoom changes', () => {
    const props = {
      object: tableObject,
      isSelected: true,
      showTransformChrome: true,
      isDragging: false,
      isTransforming: false,
      activeTool: 'select',
      isEditable: true,
      onPointerDown: vi.fn(),
      onPointerMove: vi.fn(),
      onPointerUp: vi.fn(),
      onResizePointerDown: vi.fn(),
      onRotatePointerDown: vi.fn(),
    }

    const { container, unmount } = renderNode({ ...props, cameraZoom: 0.52 })
    const rootAtLowZoom = container.querySelector('.fpb-canvas-object')
    expect(rootAtLowZoom.getAttribute('data-camera-zoom')).toBe('0.52')
    unmount()

    const { container: zoomedContainer, unmount: unmountZoomed } = renderNode({
      ...props,
      cameraZoom: 1.3,
    })
    const rootAtHighZoom = zoomedContainer.querySelector('.fpb-canvas-object')
    expect(rootAtHighZoom.getAttribute('data-camera-zoom')).toBe('1.3')
    expect(zoomedContainer.querySelector('.fpb-handle-nw')).not.toBeNull()
    unmountZoomed()
  })

  it('keeps selection chrome bounds aligned with object.size after resize', () => {
    const { container, unmount } = renderNode({
      object: {
        ...tableObject,
        properties: { ...tableObject.properties, shape: 'square' },
        size: { width: 240, height: 240 },
      },
      isSelected: true,
      showTransformChrome: true,
      isDragging: false,
      isTransforming: false,
      activeTool: 'select',
      isEditable: true,
      cameraZoom: 1,
      onPointerDown: vi.fn(),
      onPointerMove: vi.fn(),
      onPointerUp: vi.fn(),
      onResizePointerDown: vi.fn(),
      onRotatePointerDown: vi.fn(),
    })

    const root = container.querySelector('.fpb-canvas-object')
    const chrome = container.querySelector('.fpb-selection-chrome')

    expect(root.style.width).toBe('240px')
    expect(root.style.height).toBe('240px')
    expect(chrome.getAttribute('data-bounds-width')).toBe('240')
    expect(chrome.getAttribute('data-bounds-height')).toBe('240')
    expect(root.style.transform).toBe('')
    expect(root.querySelector('[data-fpb-object-body]').style.transform).toBe('rotate(0deg)')

    unmount()
  })

  it('normalizes mismatched square render bounds to a single square box', () => {
    const { container, unmount } = renderNode({
      object: {
        ...tableObject,
        position: { x: 100, y: 120 },
        properties: { ...tableObject.properties, shape: 'square' },
        size: { width: 200, height: 160 },
      },
      isSelected: true,
      showTransformChrome: true,
      isDragging: false,
      isTransforming: false,
      activeTool: 'select',
      isEditable: true,
      cameraZoom: 1,
      onPointerDown: vi.fn(),
      onPointerMove: vi.fn(),
      onPointerUp: vi.fn(),
      onResizePointerDown: vi.fn(),
      onRotatePointerDown: vi.fn(),
    })

    const root = container.querySelector('.fpb-canvas-object')
    const chrome = container.querySelector('.fpb-selection-chrome')

    expect(root.style.width).toBe('200px')
    expect(root.style.height).toBe('200px')
    expect(root.style.top).toBe('100px')
    expect(chrome.getAttribute('data-bounds-width')).toBe('200')
    expect(chrome.getAttribute('data-bounds-height')).toBe('200')

    unmount()
  })
})
