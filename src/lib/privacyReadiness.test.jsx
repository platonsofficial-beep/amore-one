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

import { setLocale } from '../i18n/i18n'
import {
  DELETE_ACCOUNT_CONFIRM_WORD,
  acceptsDeleteConfirmation,
  buildExportFilename,
  closeVenue,
  deleteConfirmWord,
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
    setLocale('en')
    await expect(deleteMyAccount('nope')).rejects.toThrow('Type DELETE to confirm')
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('accepts DELETE in any case and still sends the live Greek token', async () => {
    setLocale('en')
    rpcMock.mockResolvedValue({ data: { deleted: true }, error: null })
    await deleteMyAccount('  delete  ')
    expect(rpcMock).toHaveBeenCalledWith('delete_my_account', { p_confirm: 'ΔΙΑΓΡΑΦΗ' })
    expect(acceptsDeleteConfirmation('Delete')).toBe(true)
    expect(acceptsDeleteConfirmation('διαγραφή')).toBe(true)
    expect(acceptsDeleteConfirmation('nope')).toBe(false)
  })

  it('asks for ΔΙΑΓΡΑΦΗ in Greek', async () => {
    setLocale('el')
    expect(deleteConfirmWord()).toBe('ΔΙΑΓΡΑΦΗ')
    await expect(deleteMyAccount('nope')).rejects.toThrow('Γράψε «ΔΙΑΓΡΑΦΗ» για επιβεβαίωση')
    setLocale('en')
    expect(deleteConfirmWord()).toBe('DELETE')
  })

  it('deletes the account first, then removes the avatar', async () => {
    rpcMock.mockResolvedValue({ data: { deleted: true }, error: null })
    await deleteMyAccount(DELETE_ACCOUNT_CONFIRM_WORD, { avatarPath: 'u/a.jpg' })
    expect(rpcMock).toHaveBeenCalledWith('delete_my_account', { p_confirm: 'ΔΙΑΓΡΑΦΗ' })
    expect(removeMock).toHaveBeenCalledWith(['u/a.jpg'])
  })

  it('keeps the unapplied SQL ready to accept either word', () => {
    const sql = readFileSync(join(__dirname, '../../supabase/privacy_03_delete_confirm_word.sql'), 'utf8')
    expect(sql).toMatch(/NOT APPLIED/)
    expect(sql).toContain("v_confirm <> 'ΔΙΑΓΡΑΦΗ' and upper(v_confirm) <> 'DELETE'")
  })

  it('keeps the avatar when deletion is blocked for a sole owner', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'sole_owner', details: 'SENTIO' } })
    await expect(deleteMyAccount(DELETE_ACCOUNT_CONFIRM_WORD, { avatarPath: 'u/a.jpg' })).rejects.toThrow(/only owner.*SENTIO/)
    expect(removeMock).not.toHaveBeenCalled()
  })

  it('maps close-venue errors to English', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'confirmation_mismatch' } })
    await expect(closeVenue('ws', 'x')).rejects.toThrow(/does not match/)
    expect(formatPrivacyError({ message: 'not_reopenable' })).toMatch(/reopen period/)
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
    expect(document.querySelector('.permission-notice h3').textContent).toMatch(/Location for clock-in/)
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
    expect(resolveLegalRoute('/dpa')).toBe('/dpa')
    expect(resolveLegalRoute('/cookies')).toBe('/cookies')
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

  it('ships both languages with the same sections and the confirmed provider', async () => {
    const { legalDocument, legalSectionIds } = await import('../legal/documents')
    for (const id of ['terms', 'privacy', 'dpa', 'cookies']) {
      expect(legalSectionIds(id, 'en')).toEqual(legalSectionIds(id, 'el'))
      const english = legalDocument(id, 'en').markdown
      const greek = legalDocument(id, 'el').markdown
      expect(english).toContain('Spyrou Hadjiyiakoumi 20A')
      expect(greek).toContain('Σπύρου Χατζηγιακούμη 20Α')
      expect(greek).not.toMatch(/\bblacklist\b|\bclock in\b|\bgeneral manager\b/i)
      expect(english).toContain('not VAT-registered')
      expect(english).not.toMatch(/FILL IN|company number|registration no/i)
    }
    expect(legalDocument('privacy', 'el').markdown).toContain('Επίτροπο Προστασίας Δεδομένων')
  })
})

describe('privacy UI', () => {
  it('keeps privacy controls at 44px inside the safe area', () => {
    const css = readFileSync(join(__dirname, '../components/privacy/privacy.css'), 'utf8')
    const legal = readFileSync(join(__dirname, '../legal/legal.css'), 'utf8')
    expect(css).toContain('min-height: 44px')
    expect(css).toContain('--safe-l')
    expect(css).toContain('calc(var(--safe-l, 0px) + var(--one-landscape-rail, 104px))')
    expect(legal).toContain('--one-safe-top-chrome')
    expect(legal).toContain('--safe-l')
  })

  it('shows legal links', () => {
    const container = render(<LegalLinks />)
    expect([...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual([
      '/terms?lang=en',
      '/privacy?lang=en',
      '/dpa?lang=en',
      '/cookies?lang=en',
    ])
  })

  it('profile shows export and delete actions in English', () => {
    setLocale('en')
    const container = render(<PrivacyAccountSection />)
    expect(container.textContent).toContain('Download my data')
    expect(container.textContent).toContain('Delete account')
    expect(container.textContent).not.toMatch(/Απόρρητο|Λήψη|Διαγραφή/)
  })

  function openDeleteSheet() {
    const open = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Delete account' || button.textContent === 'Διαγραφή λογαριασμού')
    act(() => open.click())
    return document.querySelector('[role="dialog"]')
  }

  function typeConfirm(dialog, value) {
    const input = dialog.querySelector('input')
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    act(() => {
      set.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    return dialog.querySelector('button[type="submit"]')
  }

  it('enables English deletion only after DELETE', () => {
    setLocale('en')
    document.body.innerHTML = ''
    render(<PrivacyAccountSection />)
    const dialog = openDeleteSheet()
    expect(dialog.textContent).toContain('Type DELETE to confirm')
    expect(dialog.textContent).not.toContain('ΔΙΑΓΡΑΦΗ')
    expect(dialog.querySelector('button[type="submit"]').disabled).toBe(true)
    expect(typeConfirm(dialog, 'ΔΙΑΓΡΑΦΗ').disabled).toBe(true)
    expect(typeConfirm(dialog, ' delete ').disabled).toBe(false)
  })

  it('keeps the Greek confirmation on ΔΙΑΓΡΑΦΗ', () => {
    setLocale('el')
    document.body.innerHTML = ''
    render(<PrivacyAccountSection />)
    const dialog = openDeleteSheet()
    expect(dialog.textContent).toContain('Γράψε «ΔΙΑΓΡΑΦΗ» για επιβεβαίωση')
    expect(dialog.textContent).not.toContain('DELETE')
    expect(typeConfirm(dialog, 'DELETE').disabled).toBe(true)
    expect(typeConfirm(dialog, ' ΔΙΑΓΡΑΦΗ ').disabled).toBe(false)
    setLocale('en')
  })

  it('tells the English delete page to type DELETE', () => {
    const english = readFileSync(join(__dirname, '../legal/delete-account-en.md'), 'utf8')
    const greek = readFileSync(join(__dirname, '../legal/delete-account-el.md'), 'utf8')
    expect(english).toContain('type **DELETE** to confirm')
    expect(english).not.toContain('ΔΙΑΓΡΑΦΗ')
    expect(greek).toContain('γράψτε **ΔΙΑΓΡΑΦΗ**')
    expect(greek).not.toContain('DELETE')
  })

  it('blocks closed venues for non-owners only', () => {
    expect(isVenueClosedForMember({ closedAt: '2026-10-29' }, { role: 'staff' })).toBe(true)
    expect(isVenueClosedForMember({ closedAt: '2026-10-29' }, { role: 'owner' })).toBe(false)
    expect(isVenueClosedForMember({ closedAt: null }, { role: 'staff' })).toBe(false)
  })
})
