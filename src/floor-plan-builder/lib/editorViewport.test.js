import { describe, expect, it } from 'vitest'
import {
  EDITOR_EMPTY_VIEW_SIZE,
  getEditorContentBounds,
  getResetCameraForEditorContent,
} from './editorViewport'

describe('getEditorContentBounds', () => {
  it('fits to placed tables instead of the full workspace canvas', () => {
    const bounds = getEditorContentBounds({
      objects: [{
        position: { x: 1000, y: 700 },
        size: { width: 144, height: 144 },
      }],
      workspaceBounds: {
        width: 2200,
        height: 1400,
        centerX: 1100,
        centerY: 700,
      },
    })

    expect(bounds.width).toBeLessThan(600)
    expect(bounds.height).toBeLessThan(600)
    expect(bounds.centerX).toBeCloseTo(1072, 0)
    expect(bounds.centerY).toBeCloseTo(772, 0)
  })

  it('uses a practical empty-canvas region instead of the full workspace', () => {
    const bounds = getEditorContentBounds({
      objects: [],
      workspaceBounds: {
        width: 2200,
        height: 1400,
        centerX: 1100,
        centerY: 700,
      },
    })

    expect(bounds.width).toBe(EDITOR_EMPTY_VIEW_SIZE.width)
    expect(bounds.height).toBe(EDITOR_EMPTY_VIEW_SIZE.height)
    expect(bounds.centerX).toBe(1100)
    expect(bounds.centerY).toBe(700)
  })
})

describe('getResetCameraForEditorContent', () => {
  it('starts with a usable zoom for tablet-sized viewports', () => {
    const camera = getResetCameraForEditorContent(
      [{
        position: { x: 1000, y: 700 },
        size: { width: 144, height: 144 },
      }],
      {
        width: 2200,
        height: 1400,
        centerX: 1100,
        centerY: 700,
      },
      1024,
      768,
    )

    expect(camera.zoom).toBeGreaterThanOrEqual(0.42)
    expect(camera.x).toBeCloseTo(1072, 0)
    expect(camera.y).toBeCloseTo(772, 0)
  })
})
