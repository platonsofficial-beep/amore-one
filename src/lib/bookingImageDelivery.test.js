import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { deliverImageFile } from './bookingImageDelivery'

function pngFile() {
  return new File([new Uint8Array([1, 2, 3])], 'post.png', { type: 'image/png' })
}

describe('booking image delivery', () => {
  it('starts the share sheet in the same call when files can be shared', async () => {
    const share = vi.fn(() => Promise.resolve())
    const download = vi.fn()
    const onOverlay = vi.fn()
    const file = pngFile()
    const result = deliverImageFile({
      file,
      title: 'AMORE',
      canShare: (payload) => payload.files[0] === file,
      share,
      download,
      onOverlay,
    })
    expect(result).toBe('shared')
    expect(share).toHaveBeenCalledWith({ files: [file], title: 'AMORE' })
    expect(download).not.toHaveBeenCalled()
    expect(onOverlay).not.toHaveBeenCalled()
    await Promise.resolve()
  })

  it('ignores a cancelled share and reports other share failures', async () => {
    const onShareError = vi.fn()
    deliverImageFile({
      file: pngFile(),
      canShare: () => true,
      share: () => Promise.reject(Object.assign(new Error('cancel'), { name: 'AbortError' })),
      onShareError,
    })
    deliverImageFile({
      file: pngFile(),
      canShare: () => true,
      share: () => Promise.reject(Object.assign(new Error('nope'), { name: 'NotAllowedError' })),
      onShareError,
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(onShareError).toHaveBeenCalledTimes(1)
    expect(onShareError.mock.calls[0][0].name).toBe('NotAllowedError')
  })

  it('downloads when sharing is unavailable', () => {
    const download = vi.fn()
    const file = pngFile()
    expect(deliverImageFile({
      file,
      canShare: () => false,
      download,
    })).toBe('downloaded')
    expect(download).toHaveBeenCalledWith(file, 'post.png')
  })

  it('opens the long-press overlay in a standalone app that cannot share files', () => {
    const download = vi.fn()
    const onOverlay = vi.fn()
    const file = pngFile()
    expect(deliverImageFile({
      file,
      standalone: true,
      canShare: () => false,
      download,
      onOverlay,
    })).toBe('overlay')
    expect(onOverlay).toHaveBeenCalledWith(file)
    expect(download).not.toHaveBeenCalled()
  })

  it('offers both social downloads from ready files, not a format toggle', () => {
    const source = readFileSync('src/components/workspace/OnlineReservationsSection.jsx', 'utf8')
    expect(source).toContain('t("Download social media post")')
    expect(source).toContain('t("Download story")')
    expect(source).toContain('t("Long-press the image to save")')
    expect(source).toContain('deliverImageFile')
    expect(source).not.toContain('setSocialFormat')
    expect(source).not.toContain('t("Social media image")')
  })
})
