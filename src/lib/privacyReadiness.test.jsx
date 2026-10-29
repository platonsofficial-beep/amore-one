/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rpcMock, removeMock } = vi.hoisted(() => ({ rpcMock: vi.fn(), removeMock: vi.fn() }))
vi.mock('./supabaseClient', () => ({
  supabase: {
    rpc: (...args) => rpcMock(...args),
    from: vi.fn(),
    storage: { from: () => ({ remove: (...args) => removeMock(...args) }) },
    auth: { getSession: vi.fn() },
  },
}))

import {
  DELETE_ACCOUNT_CONFIRM_WORD,
  buildExportFilename,
  closeVenue,
  deleteMyAccount,
  exportMyData,
  formatPrivacyError,
} from '../services/privacyService'
import { explainBeforePermission, hasSeenPermissionNotice } from './permissionNotice'
import { renderLegalMarkdown } from '../legal/markdown'
import { resolveLegalRoute } from '../legal/LegalPage'
import { LegalLinks, PrivacyAccountSection } from '../components/privacy/PrivacySections'
import { isVenueClosedForMember } from '../components/workspace/WorkspaceKeyedApp'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
function render(element) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  act(() => createRoot(container).render(element))
  return container
}

describe('privacyService', () => {
  beforeEach(() => { rpcMock.mockReset(); removeMock.mockReset() })

  it('exports my data via RPC', async () => {
    rpcMock.mockResolvedValue({ data: { account: {} }, error: null })
    await expect(exportMyData()).resolves.toEqual({ account: {} })
    expect(rpcMock).toHaveBeenCalledWith('export_my_data', undefined)
  })

  it('requires the confirmation word before deleting', async () => {
    await expect(deleteMyAccount('nope')).rejects.toThrow(DELETE_ACCOUNT_CONFIRM_WORD)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('deletes the account first, then removes the avatar', async () => {
    rpcMock.mockResolvedValue({ data: { deleted: true }, error: null })
    await deleteMyAccount(DELETE_ACCOUNT_CONFIRM_WORD, { avatarPath: 'u/a.jpg' })
    expect(rpcMock).toHaveBeenCalledWith('delete_my_account', { p_confirm: 'ΔΙΑΓΡΑΦΗ' })
    expect(removeMock).toHaveBeenCalledWith(['u/a.jpg'])
  })

  it('keeps the avatar when deletion is blocked for a sole owner', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'sole_owner', details: 'SENTIO' } })
    await expect(deleteMyAccount(DELETE_ACCOUNT_CONFIRM_WORD, { avatarPath: 'u/a.jpg' })).rejects.toThrow(/μοναδικός ιδιοκτήτης.*SENTIO/)
    expect(removeMock).not.toHaveBeenCalled()
  })

  it('maps close-venue errors to Greek', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'confirmation_mismatch' } })
    await expect(closeVenue('ws', 'x')).rejects.toThrow(/δεν ταιριάζει/)
    expect(formatPrivacyError({ message: 'not_reopenable' })).toMatch(/επαναφοράς/)
  })

  it('builds dated export filenames', () => {
    expect(buildExportFilename('One Venue', new Date('2026-10-29T10:00:00Z'))).toBe('one-venue-2026-10-29.json')
  })
})

describe('permission notice', () => {
  beforeEach(() => { localStorage.clear(); document.body.innerHTML = '' })

  it('shows once, then remembers acceptance', async () => {
    const pending = explainBeforePermission('location')
    const ok = document.querySelector('.permission-notice .primary-btn')
    expect(document.querySelector('.permission-notice h3').textContent).toMatch(/Τοποθεσία/)
    ok.click()
    await expect(pending).resolves.toBe(true)
    expect(hasSeenPermissionNotice('location')).toBe(true)
    await expect(explainBeforePermission('location')).resolves.toBe(true)
    expect(document.querySelector('.permission-notice')).toBeNull()
  })

  it('resolves false when the user declines', async () => {
    const pending = explainBeforePermission('push')
    document.querySelector('.permission-notice .ghost-btn').click()
    await expect(pending).resolves.toBe(false)
    expect(hasSeenPermissionNotice('push')).toBe(false)
  })
})

describe('legal pages', () => {
  it('resolves public routes', () => {
    expect(resolveLegalRoute('/privacy')).toBe('/privacy')
    expect(resolveLegalRoute('/terms/')).toBe('/terms')
    expect(resolveLegalRoute('/delete-account')).toBe('/delete-account')
    expect(resolveLegalRoute('/settings')).toBeNull()
  })

  it('renders markdown safely and highlights placeholders', () => {
    const html = renderLegalMarkdown('# T\n\n- **a** [ΣΥΜΠΛΗΡΩΣΤΕ: email]\n\n| A | B |\n|---|---|\n| 1 | <script> |')
    expect(html).toContain('<h1>T</h1>')
    expect(html).toContain('<mark class="legal-placeholder">[ΣΥΜΠΛΗΡΩΣΤΕ: email]</mark>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
  })

  it('bundled policies keep their visible placeholders', () => {
    const el = readFileSync(join(__dirname, '../legal/privacy-policy-el.md'), 'utf8')
    expect(el).toContain('[ΣΥΜΠΛΗΡΩΣΤΕ:')
    expect(el).toContain('Επίτροπο Προστασίας Δεδομένων')
  })
})

describe('privacy UI', () => {
  it('keeps privacy controls at 44px inside the safe area', () => {
    const css = readFileSync(join(__dirname, '../components/privacy/privacy.css'), 'utf8')
    const legal = readFileSync(join(__dirname, '../legal/legal.css'), 'utf8')
    expect(css).toContain('min-height: 44px')
    expect(css).toContain('--safe-l')
    expect(css).toContain('calc(var(--safe-l, 0px) + 78px)')
    expect(legal).toContain('--one-safe-area-top')
    expect(legal).toContain('--safe-l')
  })

  it('shows legal links', () => {
    const container = render(<LegalLinks />)
    expect([...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['/privacy', '/terms'])
  })

  it('profile shows export and delete actions in Greek', () => {
    const container = render(<PrivacyAccountSection />)
    expect(container.textContent).toContain('Λήψη των δεδομένων μου')
    expect(container.textContent).toContain('Διαγραφή λογαριασμού')
  })

  it('blocks closed venues for non-owners only', () => {
    expect(isVenueClosedForMember({ closedAt: '2026-10-29' }, { role: 'staff' })).toBe(true)
    expect(isVenueClosedForMember({ closedAt: '2026-10-29' }, { role: 'owner' })).toBe(false)
    expect(isVenueClosedForMember({ closedAt: null }, { role: 'staff' })).toBe(false)
  })
})
