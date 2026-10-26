/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  PWA_RELOAD_GUARD_KEY,
  PWA_RELOAD_GUARD_MS,
  bindPwaFormDirtyTracking,
  bindPwaUpdateChecks,
  claimPwaUpdateReload,
  decidePwaUpdateAction,
  hasOpenDialog,
  isPwaUpdateAvailable,
  markPwaUpdateAvailable,
  noteFormEdit,
  reloadPwaForUpdate,
  resetPwaUpdateSessionForTests,
  subscribePwaUpdateAvailable,
} from './pwaUpdate.js'

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  }
}

afterEach(() => {
  resetPwaUpdateSessionForTests()
  document.body.replaceChildren()
})

describe('pwa update reload guard', () => {
  it('reloads once, then ignores another update inside the guard window', () => {
    const storage = memoryStorage({ 'sb-auth-token': 'keep-me' })
    const now = 1_700_000_000_000

    expect(claimPwaUpdateReload(storage, now)).toBe(true)
    expect(claimPwaUpdateReload(storage, now + 1000)).toBe(false)
    expect(storage.getItem('sb-auth-token')).toBe('keep-me')
    expect(storage.getItem(PWA_RELOAD_GUARD_KEY)).toBe(String(now))
  })

  it('allows a later update after the guard window', () => {
    const storage = memoryStorage()
    const now = 1_700_000_000_000

    expect(claimPwaUpdateReload(storage, now)).toBe(true)
    expect(claimPwaUpdateReload(storage, now + PWA_RELOAD_GUARD_MS)).toBe(true)
  })

  it('reloads through a fake location and does not touch other storage keys', () => {
    const storage = memoryStorage({ 'one-auth': 'session' })
    const location = { reload: vi.fn() }

    expect(reloadPwaForUpdate(location, storage, { now: 50 })).toBe(true)
    expect(location.reload).toHaveBeenCalledOnce()
    expect(storage.getItem('one-auth')).toBe('session')

    location.reload.mockClear()
    expect(reloadPwaForUpdate(location, storage, { now: 60 })).toBe(false)
    expect(location.reload).not.toHaveBeenCalled()
  })

  it('still refreshes when the manager asks, inside the guard window', () => {
    const storage = memoryStorage()
    const location = { reload: vi.fn() }

    reloadPwaForUpdate(location, storage, { now: 50 })
    location.reload.mockClear()

    expect(reloadPwaForUpdate(location, storage, { force: true, now: 80 })).toBe(true)
    expect(location.reload).toHaveBeenCalledOnce()
  })
})

describe('pwa update deferral', () => {
  it('shows a banner while a dialog is open', () => {
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.appendChild(dialog)
    const storage = memoryStorage()

    expect(hasOpenDialog(document)).toBe(true)
    expect(decidePwaUpdateAction(document, storage, 10)).toBe('banner')
    expect(storage.getItem(PWA_RELOAD_GUARD_KEY)).toBeNull()
  })

  it('ignores a hidden dialog and reloads', () => {
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    dialog.hidden = true
    document.body.appendChild(dialog)

    expect(hasOpenDialog(document)).toBe(false)
    expect(decidePwaUpdateAction(document, memoryStorage(), 10)).toBe('reload')
  })

  it('shows a banner after the manager edits a field', () => {
    const unbind = bindPwaFormDirtyTracking(window)
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.dispatchEvent(new Event('input', { bubbles: true }))

    expect(decidePwaUpdateAction(document, memoryStorage(), 10)).toBe('banner')
    unbind()
  })

  it('does not treat a plain page as unsaved work', () => {
    noteFormEdit()
    resetPwaUpdateSessionForTests()
    expect(decidePwaUpdateAction(document, memoryStorage(), 10)).toBe('reload')
  })
})

describe('pwa update checks', () => {
  it('checks on load, when the app is visible, and when it regains focus', () => {
    const update = vi.fn().mockResolvedValue(undefined)
    const registration = { update, installing: null }
    const events = {}
    const targetWindow = {
      navigator: { onLine: true },
      document: {
        visibilityState: 'hidden',
        addEventListener: (name, handler) => { events[name] = handler },
        removeEventListener: () => {},
      },
      addEventListener: (name, handler) => { events[name] = handler },
      removeEventListener: () => {},
    }

    const unbind = bindPwaUpdateChecks(registration, targetWindow)
    expect(update).toHaveBeenCalledOnce()

    targetWindow.document.visibilityState = 'visible'
    events.visibilitychange()
    events.focus()
    expect(update).toHaveBeenCalledTimes(3)

    targetWindow.navigator.onLine = false
    events.focus()
    expect(update).toHaveBeenCalledTimes(3)
    unbind()
  })

  it('publishes an update without clearing storage', () => {
    const seen = []
    const unsubscribe = subscribePwaUpdateAvailable((ready) => seen.push(ready))
    markPwaUpdateAvailable()
    expect(isPwaUpdateAvailable()).toBe(true)
    expect(seen).toEqual([false, true])
    unsubscribe()
  })
})

describe('pwa update source safety', () => {
  it('keeps auth storage and the offline shell alone', () => {
    const updateSource = readFileSync(resolve(process.cwd(), 'src/lib/pwaUpdate.js'), 'utf8')
    const registerSource = readFileSync(resolve(process.cwd(), 'src/pwaRegister.js'), 'utf8')
    const combined = `${updateSource}\n${registerSource}`

    expect(combined).not.toMatch(/localStorage/)
    expect(combined).not.toMatch(/caches\.delete/)
    expect(combined).not.toMatch(/caches\.keys/)
    expect(registerSource).toContain('immediate: true')
    expect(registerSource).toContain('onNeedReload')
    expect(registerSource).toContain('onRegisteredSW')
    expect(registerSource).toContain('onOfflineReady')
  })
})
