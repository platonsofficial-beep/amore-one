/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest'
import { LEGAL_BUNDLE } from './provider'
import {
  ACCEPTANCE_STORAGE_KEY,
  buildAcceptanceRecord,
  isCurrentAcceptance,
  isMissingLegalTable,
  loadAcceptance,
  saveAcceptance,
} from './acceptance'

afterEach(() => {
  localStorage.removeItem(ACCEPTANCE_STORAGE_KEY)
})

describe('legal acceptance records', () => {
  it('blocks until the current bundle is accepted, and asks again when the version changes', () => {
    const record = buildAcceptanceRecord({ userId: 'user-1', workspaceId: 'venue-1', role: 'owner' })
    expect(isCurrentAcceptance(null, { userId: 'user-1', role: 'owner' })).toBe(false)
    expect(isCurrentAcceptance(record, { userId: 'user-1', role: 'owner' })).toBe(true)
    expect(isCurrentAcceptance(record, { userId: 'user-1', role: 'owner', bundleId: '2099-01-01.1' })).toBe(false)
    expect(isCurrentAcceptance({ ...record, includesDpa: false }, { userId: 'user-1', role: 'manager' })).toBe(false)
    expect(isCurrentAcceptance({ ...record, includesDpa: false }, { userId: 'user-1', role: 'staff' })).toBe(true)
  })

  it('keeps working when the table is missing', async () => {
    expect(isMissingLegalTable({ code: '42P01', message: 'relation "legal_acceptances" does not exist' })).toBe(true)
    const client = {
      from() {
        return {
          select() { return this },
          eq() { return this },
          insert: async () => ({ error: { code: 'PGRST205', message: 'Could not find the table legal_acceptances' } }),
          then(resolve) { resolve({ data: null, error: { code: '42P01', message: 'does not exist' } }) },
        }
      },
    }
    const loaded = await loadAcceptance({
      userId: 'user-1',
      workspaceId: 'venue-1',
      email: 'owner@venue.test',
      role: 'owner',
      client,
    })
    expect(loaded.accepted).toBe(false)
    expect(loaded.source).toBe('no-table')
    const record = buildAcceptanceRecord({ userId: 'user-1', role: 'staff' })
    const saved = await saveAcceptance(record, client)
    expect(saved.stored).toBe('local')
    expect(saved.missing).toBe(true)
    const again = await loadAcceptance({ userId: 'user-1', role: 'staff', client })
    expect(again.accepted).toBe(true)
    expect(again.source).toBe('local')
    expect(LEGAL_BUNDLE.id).toBe(record.bundleId)
  })
})

