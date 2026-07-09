import { describe, expect, it } from 'vitest'
import {
  EDITOR_EMPTY_VIEW_SIZE,
  getEditorContentBounds,
  getEditorWorkspaceFitBounds,
  getResetCameraForEditorContent,
  getResetCameraForEditorWorkspace,
} from './editorViewport'

const WORKSPACE_BOUNDS = {
  minX: 0,
  minY: 0,
  maxX: 2200,
  maxY: 1400,
  width: 2200,
  height: 1400,
  centerX: 1100,
  centerY: 700,
}

describe('getEditorWorkspaceFitBounds', () => {
  it('uses the full workspace canvas instead of table bounds', () => {
    const bounds = getEditorWorkspaceFitBounds(WORKSPACE_BOUNDS)

    expect(bounds).toMatchObject({
      width: 2200,
      height: 1400,
      centerX: 1100,
      centerY: 700,
    })
  })
})

describe('getEditorContentBounds', () => {
  it('still supports object-bounds helpers for legacy callers', () => {
    const bounds = getEditorContentBounds({
      objects: [{
        position: { x: 1000, y: 700 },
        size: { width: 144, height: 144 },
      }],
      workspaceBounds: WORKSPACE_BOUNDS,
    })

    expect(bounds.width).toBeLessThan(600)
    expect(bounds.height).toBeLessThan(600)
  })

  it('uses a practical empty-canvas region instead of the full workspace', () => {
    const bounds = getEditorContentBounds({
      objects: [],
      workspaceBounds: WORKSPACE_BOUNDS,
    })

    expect(bounds.width).toBe(EDITOR_EMPTY_VIEW_SIZE.width)
    expect(bounds.height).toBe(EDITOR_EMPTY_VIEW_SIZE.height)
    expect(bounds.centerX).toBe(1100)
    expect(bounds.centerY).toBe(700)
  })
})

describe('getResetCameraForEditorWorkspace', () => {
  it('fits the full workspace for tablet-sized viewports', () => {
    const camera = getResetCameraForEditorWorkspace(
      WORKSPACE_BOUNDS,
      1024,
      768,
    )

    expect(camera.x).toBe(1100)
    expect(camera.y).toBe(700)
    expect(camera.zoom).toBeGreaterThan(0)
    expect(camera.zoom).toBeLessThan(1)
  })

  it('ignores table positions when fitting editor content', () => {
    const camera = getResetCameraForEditorWorkspace(
      WORKSPACE_BOUNDS,
      1024,
      768,
    )

    const legacyCamera = getResetCameraForEditorContent(
      [{
        position: { x: 1800, y: 1100 },
        size: { width: 144, height: 144 },
      }],
      WORKSPACE_BOUNDS,
      1024,
      768,
    )

    expect(legacyCamera).toEqual(camera)
  })
})
