/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ signIn: vi.fn(), signUp: vi.fn(), resetPassword: vi.fn() }) }))
vi.mock('../../services/inviteService', () => ({ getInvitePreview: vi.fn() }))
vi.mock('../privacy/PrivacySections', () => ({ LegalLinks: () => null }))
vi.mock('../brand/OneFullLogo', () => ({ OneFullLogo: () => null }))

const { LoginView } = await import('./LoginView')
globalThis.IS_REACT_ACT_ENVIRONMENT = true
let root
let container

function render() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(createElement(LoginView)))
}

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    container.remove()
    root = null
  }
})

const setValue = (input, value) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function eye(id) {
  return container.querySelector(`label[for="${id}"] .auth-password-toggle`)
}

function press(button) {
  act(() => {
    button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }))
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

function openAccountStep() {
  const create = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Create account')
  act(() => { create.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
  const [given, family] = container.querySelectorAll('input')
  setValue(given, 'Ada')
  setValue(family, 'Lovelace')
  act(() => {
    container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
}

describe('password show and hide', () => {
  it('replaces the sign-in field so iOS autofill text can show, and keeps the caret', () => {
    render()
    const hidden = container.querySelector('#auth-password')
    expect(hidden.type).toBe('password')
    expect(hidden.autocomplete).toBe('current-password')
    setValue(hidden, 'secret123')
    const filled = container.querySelector('#auth-password')
    filled.focus()
    filled.setSelectionRange(2, 5)
    press(eye('auth-password'))
    const shown = container.querySelector('#auth-password')
    expect(shown).not.toBe(filled)
    expect(shown.type).toBe('text')
    expect(shown.value).toBe('secret123')
    expect(shown.selectionStart).toBe(2)
    expect(shown.selectionEnd).toBe(5)
    expect(document.activeElement).toBe(shown)
    expect(eye('auth-password').getAttribute('aria-pressed')).toBe('true')
    expect(eye('auth-password').getAttribute('aria-label')).toBe('Hide password')
    press(eye('auth-password'))
    const masked = container.querySelector('#auth-password')
    expect(masked).not.toBe(shown)
    expect(masked.type).toBe('password')
    expect(masked.value).toBe('secret123')
    expect(eye('auth-password').getAttribute('aria-pressed')).toBe('false')
  })

  it('keeps a strong-password value that never went through onChange', () => {
    render()
    const hidden = container.querySelector('#auth-password')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(hidden, 'Autofill!9')
    expect(hidden.value).toBe('Autofill!9')
    press(eye('auth-password'))
    const shown = container.querySelector('#auth-password')
    expect(shown.type).toBe('text')
    expect(shown.value).toBe('Autofill!9')
  })

  it('toggles password and confirm separately on create account', () => {
    render()
    openAccountStep()
    const password = container.querySelector('#auth-password')
    const confirm = container.querySelector('#auth-confirm-password')
    expect(password.autocomplete).toBe('new-password')
    expect(confirm.autocomplete).toBe('new-password')
    setValue(password, 'secret123')
    setValue(confirm, 'other456')
    press(eye('auth-password'))
    expect(container.querySelector('#auth-password').type).toBe('text')
    expect(container.querySelector('#auth-password').value).toBe('secret123')
    expect(container.querySelector('#auth-confirm-password').type).toBe('password')
    expect(container.querySelector('#auth-confirm-password').value).toBe('other456')
    expect(container.querySelector('#auth-confirm-password')).toBe(confirm)
    press(eye('auth-confirm-password'))
    expect(container.querySelector('#auth-password').type).toBe('text')
    expect(container.querySelector('#auth-confirm-password').type).toBe('text')
    expect(container.querySelector('#auth-confirm-password').value).toBe('other456')
    expect(eye('auth-confirm-password').getAttribute('aria-label')).toBe('Hide password')
    expect(eye('auth-password').getAttribute('aria-pressed')).toBe('true')
  })
})
