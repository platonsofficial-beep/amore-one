import { describe, expect, it } from 'vitest'
import { fitChatImageSize, isHeicFile } from './chatImage'

describe('chat photos', () => {
  it('fits the long edge to 1600 pixels', () => {
    expect(fitChatImageSize(3200, 1600)).toEqual({ width: 1600, height: 800 })
    expect(fitChatImageSize(800, 600)).toEqual({ width: 800, height: 600 })
  })

  it('recognises iPhone HEIC files', () => {
    expect(isHeicFile({ name: 'IMG.HEIC', type: '' })).toBe(true)
    expect(isHeicFile({ name: 'photo.jpg', type: 'image/jpeg' })).toBe(false)
    expect(isHeicFile({ name: 'photo', type: 'image/heif' })).toBe(true)
  })
})
