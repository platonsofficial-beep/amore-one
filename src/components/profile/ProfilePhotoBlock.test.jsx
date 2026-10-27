/**
 * @vitest-environment jsdom
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const uploadMyAvatar = vi.fn()
const removeMyAvatar = vi.fn()
const refreshMembership = vi.fn(async () => {})
const setOptimistic = vi.fn()
const refresh = vi.fn(async () => {})
let lookupResult = null

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'mina@example.com' },
    membership: { id: 'member-1', avatarPath: lookupResult ? 'user-1/old.jpg' : null, employeeId: 'emp-1' },
    refreshMembership,
  }),
}))

vi.mock('../../context/AvatarDirectoryContext', () => ({
  useAvatarDirectory: () => ({
    lookup: () => lookupResult,
    setOptimistic,
    refresh,
  }),
}))

vi.mock('../../lib/avatarImage', () => ({
  prepareAvatarImage: vi.fn(async () => ({
    blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
    previewUrl: 'blob:preview',
  })),
}))

vi.mock('../../services/avatarService', () => ({
  uploadMyAvatar: (...args) => uploadMyAvatar(...args),
  removeMyAvatar: (...args) => removeMyAvatar(...args),
}))

import { ProfilePhotoBlock } from './ProfilePhotoBlock'

function renderBlock() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(createElement(ProfilePhotoBlock, { displayName: 'Mina Costa' }))
  })
  return {
    container,
    unmount() {
      act(() => root.unmount())
      container.remove()
    },
  }
}

function button(container, label) {
  return [...container.querySelectorAll('button')].find((node) => node.textContent === label)
}

describe('ProfilePhotoBlock', () => {
  beforeEach(() => {
    lookupResult = null
    uploadMyAvatar.mockReset()
    removeMyAvatar.mockReset()
    setOptimistic.mockReset()
    refresh.mockClear()
    refreshMembership.mockClear()
    uploadMyAvatar.mockResolvedValue({ path: 'user-1/new.jpg', updatedAt: '2026-10-27T12:00:00Z', updatedCount: 1 })
    removeMyAvatar.mockResolvedValue(1)
  })

  it('offers Add photo, then Take photo and Choose photo, then Save', async () => {
    const view = renderBlock()
    expect(button(view.container, 'Add photo')).toBeTruthy()
    expect(button(view.container, 'Remove photo')).toBeUndefined()
    expect(view.container.querySelector('input[capture="environment"]')).toBeTruthy()

    act(() => {
      button(view.container, 'Add photo').click()
    })
    expect(button(view.container, 'Take photo')).toBeTruthy()
    expect(button(view.container, 'Choose photo')).toBeTruthy()

    const input = view.container.querySelector('input[capture]')
    const file = new File(['pic'], 'pic.png', { type: 'image/png' })
    await act(async () => {
      Object.defineProperty(input, 'files', { configurable: true, value: [file] })
      input.dispatchEvent(new Event('change', { bubbles: true }))
      await Promise.resolve()
    })

    expect(view.container.querySelector('.profile-photo-circle img')?.getAttribute('src')).toBe('blob:preview')
    expect(view.container.textContent).toContain('This is how your photo will look.')

    await act(async () => {
      button(view.container, 'Save').click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(uploadMyAvatar).toHaveBeenCalledWith(expect.objectContaining({
      authUserId: 'user-1',
      previousPath: '',
    }))
    expect(setOptimistic).toHaveBeenCalledWith('user-1', expect.objectContaining({
      path: 'pending',
      url: 'blob:preview',
    }))
    expect(view.container.querySelector('[role="status"]')?.textContent).toBe('Photo updated')
    view.unmount()
  })

  it('shows Change photo and Remove photo when a photo is already saved', async () => {
    lookupResult = { url: 'https://signed.example/old.jpg', updatedAt: '1', path: 'user-1/old.jpg' }
    const view = renderBlock()
    expect(button(view.container, 'Change photo')).toBeTruthy()
    expect(button(view.container, 'Add photo')).toBeUndefined()

    await act(async () => {
      button(view.container, 'Remove photo').click()
      await Promise.resolve()
    })

    expect(removeMyAvatar).toHaveBeenCalledWith({
      authUserId: 'user-1',
      previousPath: 'user-1/old.jpg',
    })
    expect(setOptimistic).toHaveBeenCalledWith('user-1', { removed: true })
    expect(view.container.querySelector('[role="status"]')?.textContent).toBe('Photo removed')
    view.unmount()
  })
})
