import { describe, expect, it } from 'vitest'
import {
  EDITOR_EMPTY_VIEW_SIZE,
  EDITOR_TARGET_MIN_ZOOM,
  getEditorContentBounds,
  getEditorFitZoom,
  getEditorWorkspaceFitBounds,
  getResetCameraForEditorContent,
  getResetCameraForEditorWorkspace,
} from './editorViewport'

const RESTAURANT_WORKSPACE = {
  minX: 0,
  minY: 0,
  maxX: 1000,
  maxY: 700,
  width: 1000,
  height: 700,
  centerX: 500,
  centerY: 350,
}

const LEGACY_LARGE_WORKSPACE = {
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
    const bounds = getEditorWorkspaceFitBounds(RESTAURANT_WORKSPACE)

    expect(bounds).toMatchObject({
      width: 1000,
      height: 700,
      centerX: 500,
      centerY: 350,
    })
  })
})

describe('getEditorContentBounds', () => {
  it('still supports object-bounds helpers for legacy callers', () => {
    const bounds = getEditorContentBounds({
      objects: [{
        position: { x: 400, y: 300 },
        size: { width: 140, height: 140 },
      }],
      workspaceBounds: RESTAURANT_WORKSPACE,
    })

    expect(bounds.width).toBeLessThan(600)
    expect(bounds.height).toBeLessThan(600)
  })

  it('uses a practical empty-canvas region instead of the full workspace', () => {
    const bounds = getEditorContentBounds({
      objects: [],
      workspaceBounds: RESTAURANT_WORKSPACE,
    })

    expect(bounds.width).toBe(EDITOR_EMPTY_VIEW_SIZE.width)
    expect(bounds.height).toBe(EDITOR_EMPTY_VIEW_SIZE.height)
    expect(bounds.centerX).toBe(500)
    expect(bounds.centerY).toBe(350)
  })
})

describe('getEditorFitZoom', () => {
  it('targets roughly 70%-100% zoom on tablet-sized viewports for restaurant canvas', () => {
    const zoom = getEditorFitZoom(RESTAURANT_WORKSPACE, 1024, 768)

    expect(zoom).toBeGreaterThanOrEqual(0.7)
    expect(zoom).toBeLessThanOrEqual(1)
  })

  it('avoids tiny zoom on legacy oversized canvases', () => {
    const zoom = getEditorFitZoom(LEGACY_LARGE_WORKSPACE, 1024, 768)

    expect(zoom).toBeGreaterThanOrEqual(EDITOR_TARGET_MIN_ZOOM)
  })
})

describe('getResetCameraForEditorWorkspace', () => {
  it('fits the restaurant workspace at a usable scale for tablet viewports', () => {
    const camera = getResetCameraForEditorWorkspace(
      RESTAURANT_WORKSPACE,
      1024,
      768,
    )

    expect(camera.x).toBe(500)
    expect(camera.y).toBe(350)
    expect(camera.zoom).toBeGreaterThanOrEqual(0.7)
    expect(camera.zoom).toBeLessThanOrEqual(1)
  })

  it('ignores table positions when fitting editor content', () => {
    const camera = getResetCameraForEditorWorkspace(
      RESTAURANT_WORKSPACE,
      1024,
      768,
    )

    const legacyCamera = getResetCameraForEditorContent(
      [{
        position: { x: 800, y: 600 },
        size: { width: 140, height: 140 },
      }],
      RESTAURANT_WORKSPACE,
      1024,
      768,
    )

    expect(legacyCamera).toEqual(camera)
  })
})
