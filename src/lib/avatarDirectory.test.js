import { describe, expect, it } from 'vitest'
import { resolveAvatarPhoto } from './avatarDirectory'

const records = [{
  memberId: 'member-1',
  employeeId: 'emp-1',
  authUserId: 'user-1',
  avatarPath: 'user-1/old.jpg',
  avatarUpdatedAt: '2026-10-27T10:00:00Z',
}]

describe('resolveAvatarPhoto', () => {
  it('returns the signed url for an employee', () => {
    expect(resolveAvatarPhoto({
      records,
      urls: { 'user-1/old.jpg': 'https://signed.example/old' },
      employeeId: 'emp-1',
    })).toEqual({
      url: 'https://signed.example/old',
      updatedAt: '2026-10-27T10:00:00Z',
      path: 'user-1/old.jpg',
    })
  })

  it('returns null when there is no photo', () => {
    expect(resolveAvatarPhoto({
      records: [{ ...records[0], avatarPath: '' }],
      employeeId: 'emp-1',
    })).toBeNull()
  })

  it('shows an optimistic upload before the signed url arrives', () => {
    expect(resolveAvatarPhoto({
      records,
      urls: { 'user-1/old.jpg': 'https://signed.example/old' },
      optimistic: {
        'user-1': { url: 'blob:new', path: 'user-1/new.jpg', updatedAt: '2026-10-27T11:00:00Z' },
      },
      authUserId: 'user-1',
    }).url).toBe('blob:new')
  })

  it('hides the photo while a removal is in flight', () => {
    expect(resolveAvatarPhoto({
      records,
      urls: { 'user-1/old.jpg': 'https://signed.example/old' },
      optimistic: { 'user-1': { removed: true } },
      memberId: 'member-1',
    })).toBeNull()
  })
})
