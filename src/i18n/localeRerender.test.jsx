/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { setLocale, t, useLocale } from './i18n'
import { LanguagePicker } from './LanguagePicker'

function Screen() {
  return createElement('h1', null, t('Settings'))
}

function OwnedTree() {
  useLocale()
  return createElement('div', null, createElement(LanguagePicker), createElement(Screen))
}

function PassThrough({ children }) {
  useLocale()
  return children
}

function mount(node) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(node) })
  return {
    container,
    unmount() {
      act(() => { root.unmount() })
      container.remove()
    },
  }
}

afterEach(() => {
  setLocale('en')
  localStorage.removeItem('one.locale')
})

describe('language switch', () => {
  it('rewrites the current screen as soon as English is tapped', () => {
    setLocale('el')
    const view = mount(createElement(OwnedTree))
    expect(view.container.querySelector('h1').textContent).toBe('Ρυθμίσεις')
    const english = [...view.container.querySelectorAll('button')].find((button) => button.textContent === 'English')
    act(() => { english.click() })
    expect(view.container.querySelector('h1').textContent).toBe('Settings')
    view.unmount()
  })

  it('stays stale when the subscriber only returns children', () => {
    setLocale('en')
    const view = mount(createElement(PassThrough, null, createElement(Screen)))
    expect(view.container.querySelector('h1').textContent).toBe('Settings')
    act(() => { setLocale('el') })
    expect(view.container.querySelector('h1').textContent).toBe('Settings')
    view.unmount()
  })

  it('the app entry owns the screen instead of forwarding children', () => {
    const entry = readFileSync(resolve(process.cwd(), 'src/appEntry.jsx'), 'utf8')
    expect(entry).toMatch(/function LocaleRoot\(\)/)
    expect(entry).not.toMatch(/return children/)
  })
})
