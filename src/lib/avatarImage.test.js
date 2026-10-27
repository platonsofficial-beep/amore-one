/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { heic2any } = vi.hoisted(() => ({
  heic2any: vi.fn(async () => new Blob(['jpeg'], { type: 'image/jpeg' })),
}))

vi.mock('heic2any', () => ({ default: heic2any }))

import { AVATAR_EDGE, AVATAR_MAX_BYTES, prepareAvatarImage, squareCropRect } from './avatarImage'

describe('squareCropRect', () => {
  it('center-crops the long edge of a landscape photo', () => {
    expect(squareCropRect(1000, 400)).toEqual({ sx: 300, sy: 0, size: 400 })
  })

  it('center-crops the long edge of a portrait photo', () => {
    expect(squareCropRect(400, 900)).toEqual({ sx: 0, sy: 250, size: 400 })
  })

  it('keeps an already square photo', () => {
    expect(squareCropRect(512, 512)).toEqual({ sx: 0, sy: 0, size: 512 })
  })
})

describe('prepareAvatarImage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('draws a centered square and compresses under 500KB', async () => {
    const drawImage = vi.fn()
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage }),
      toBlob(callback, type, quality) {
        const size = quality >= 0.85 ? AVATAR_MAX_BYTES + 1024 : 120 * 1024
        callback(new Blob([new Uint8Array(size)], { type }))
      },
    }
    const originalCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag) => (
      tag === 'canvas' ? canvas : originalCreate(tag)
    ))
    vi.stubGlobal('createImageBitmap', async () => ({
      width: 1000,
      height: 400,
      close() {},
    }))

    const prepared = await prepareAvatarImage(new File(['photo'], 'pic.png', { type: 'image/png' }))

    expect(canvas.width).toBe(AVATAR_EDGE)
    expect(canvas.height).toBe(AVATAR_EDGE)
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 300, 0, 400, 400, 0, 0, AVATAR_EDGE, AVATAR_EDGE)
    expect(prepared.blob.type).toBe('image/jpeg')
    expect(prepared.blob.size).toBeLessThan(AVATAR_MAX_BYTES)
    expect(prepared.width).toBe(AVATAR_EDGE)
    expect(prepared.previewUrl).toContain('blob:')
  })

  it('converts HEIC to JPEG before cropping', async () => {
    heic2any.mockClear()
    const drawImage = vi.fn()
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage }),
      toBlob(callback, type) {
        callback(new Blob([new Uint8Array(1000)], { type }))
      },
    }
    const originalCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag) => (
      tag === 'canvas' ? canvas : originalCreate(tag)
    ))
    vi.stubGlobal('createImageBitmap', async (source) => {
      expect(source).toBeInstanceOf(Blob)
      expect(source.type).toBe('image/jpeg')
      return { width: 800, height: 800, close() {} }
    })

    await prepareAvatarImage(new File(['heic'], 'IMG.HEIC', { type: 'image/heic' }))
    expect(heic2any).toHaveBeenCalled()
  })
})
