import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rpcMock, uploadMock, removeMock, signedMock, fromMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  uploadMock: vi.fn(),
  removeMock: vi.fn(),
  signedMock: vi.fn(),
  fromMock: vi.fn(),
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: (...args) => rpcMock(...args),
    from: (...args) => fromMock(...args),
    storage: {
      from: () => ({
        upload: (...args) => uploadMock(...args),
        remove: (...args) => removeMock(...args),
        createSignedUrls: (...args) => signedMock(...args),
      }),
    },
  },
}))

import {
  avatarErrorMessage,
  buildAvatarPath,
  clearAvatarUrlCache,
  isOwnAvatarPath,
  removeMyAvatar,
  resolveAvatarUrls,
  uploadMyAvatar,
} from './avatarService'

describe('avatar paths', () => {
  it('builds a new jpeg path inside the signed-in user folder', () => {
    expect(buildAvatarPath('user-1', 'abc')).toBe('user-1/abc.jpg')
    expect(isOwnAvatarPath('user-1', 'user-1/abc.jpg')).toBe(true)
    expect(isOwnAvatarPath('user-1', 'other/abc.jpg')).toBe(false)
    expect(isOwnAvatarPath('user-1', 'user-1/nested/abc.jpg')).toBe(false)
  })

  it('explains bad_avatar_path in plain English', () => {
    expect(avatarErrorMessage({ message: 'bad_avatar_path' })).toMatch(/could not be saved/i)
  })
})

describe('avatar upload', () => {
  beforeEach(() => {
    rpcMock.mockReset()
    uploadMock.mockReset()
    removeMock.mockReset()
    signedMock.mockReset()
    clearAvatarUrlCache()
    uploadMock.mockResolvedValue({ error: null })
    removeMock.mockResolvedValue({ error: null })
    rpcMock.mockResolvedValue({ data: 2, error: null })
  })

  it('uploads jpeg and calls set_my_avatar with the new path', async () => {
    const blob = new Blob(['jpeg'], { type: 'image/jpeg' })
    const result = await uploadMyAvatar({
      authUserId: 'user-1',
      blob,
      previousPath: 'user-1/old.jpg',
    })

    expect(result.path).toMatch(/^user-1\/[0-9a-f-]+\.jpg$/)
    expect(uploadMock).toHaveBeenCalledWith(result.path, blob, {
      contentType: 'image/jpeg',
      upsert: false,
    })
    expect(rpcMock).toHaveBeenCalledWith('set_my_avatar', { p_path: result.path })
    expect(removeMock).toHaveBeenCalledWith(['user-1/old.jpg'])
    expect(result.updatedCount).toBe(2)
  })

  it('removes the photo by passing a null path', async () => {
    await removeMyAvatar({ authUserId: 'user-1', previousPath: 'user-1/old.jpg' })
    expect(rpcMock).toHaveBeenCalledWith('set_my_avatar', { p_path: null })
    expect(removeMock).toHaveBeenCalledWith(['user-1/old.jpg'])
  })

  it('does not leave the new file in place when set_my_avatar rejects the path', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'bad_avatar_path' } })
    await expect(uploadMyAvatar({
      authUserId: 'user-1',
      blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
    })).rejects.toThrow(/could not be saved/i)
    expect(removeMock).toHaveBeenCalled()
  })
})

describe('resolveAvatarUrls', () => {
  beforeEach(() => {
    signedMock.mockReset()
    clearAvatarUrlCache()
  })

  it('signs a batch once and refreshes before the hour ends', async () => {
    let now = 1_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    signedMock.mockImplementation(async (paths) => ({
      data: paths.map((path) => ({ path, signedUrl: `https://signed.example/${path}`, error: null })),
      error: null,
    }))

    try {
      const first = await resolveAvatarUrls(['user-1/a.jpg', 'user-2/b.jpg', 'user-1/a.jpg'])
      expect(signedMock).toHaveBeenCalledTimes(1)
      expect(signedMock).toHaveBeenCalledWith(['user-1/a.jpg', 'user-2/b.jpg'], 3600)
      expect(first.get('user-2/b.jpg')).toBe('https://signed.example/user-2/b.jpg')

      await resolveAvatarUrls(['user-1/a.jpg'])
      expect(signedMock).toHaveBeenCalledTimes(1)

      now += (3600 * 1000) - 30_000
      await resolveAvatarUrls(['user-1/a.jpg'])
      expect(signedMock).toHaveBeenCalledTimes(2)
    } finally {
      vi.restoreAllMocks()
    }
  })
})
