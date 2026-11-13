/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const signedMock = vi.hoisted(() => vi.fn())

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    storage: {
      from: () => ({
        createSignedUrls: (...args) => signedMock(...args),
      }),
    },
  },
}))

import { resolveInvoiceUrls } from './stockInvoiceService'

beforeEach(() => {
  signedMock.mockReset()
  localStorage.clear()
})

describe('invoice signed urls', () => {
  it('reuses a cached signed url instead of asking storage again', async () => {
    signedMock.mockResolvedValue({
      data: [{ path: 'ws/order/page.jpg', signedUrl: 'https://signed.example/page.jpg', error: null }],
      error: null,
    })
    const first = await resolveInvoiceUrls(['ws/order/page.jpg'])
    const second = await resolveInvoiceUrls(['ws/order/page.jpg'])
    expect(first.get('ws/order/page.jpg')).toBe('https://signed.example/page.jpg')
    expect(second.get('ws/order/page.jpg')).toBe('https://signed.example/page.jpg')
    expect(signedMock).toHaveBeenCalledTimes(1)
  })
})
