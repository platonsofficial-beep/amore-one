/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { passwordsMatch } from '../../lib/passwordConfirm'

const signUp = vi.fn(async () => ({ session: null }))
const signIn = vi.fn(async () => ({}))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ signIn, signUp, resetPassword: vi.fn() }) }))
vi.mock('../../services/inviteService', () => ({ getInvitePreview: vi.fn() }))
vi.mock('../privacy/PrivacySections', () => ({ LegalLinks: () => null }))
vi.mock('../brand/OneFullLogo', () => ({ OneFullLogo: () => null }))

const { LoginView } = await import('./LoginView')
globalThis.IS_REACT_ACT_ENVIRONMENT = true
let root, container
function render() {
  container = document.createElement('div'); document.body.appendChild(container)
  root = createRoot(container); act(() => root.render(createElement(LoginView)))
}
afterEach(() => { if (root) { act(() => root.unmount()); container.remove(); root = null } signUp.mockClear(); signIn.mockClear() })
const setValue = (input, value) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  act(() => { setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })) })
}
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
const byText = (t) => [...container.querySelectorAll('button')].find((b) => b.textContent === t)
const submit = async () => { await act(async () => { container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) }) }

describe('Create account confirm password', () => {
  it('passwordsMatch', () => {
    expect(passwordsMatch('abc', 'abc')).toBe(true)
    expect(passwordsMatch('abc', 'abd')).toBe(false)
  })

  it('sign in has a single password field', () => {
    render()
    expect(container.querySelectorAll('input[type="password"]').length).toBe(1)
  })

  it('blocks create account on mismatch with an inline error', async () => {
    render(); click(byText('Create account'))
    const [pw, confirm] = container.querySelectorAll('input[type="password"]')
    expect(confirm.closest('label').textContent).toContain('Confirm password')
    setValue(container.querySelector('input[type="email"]'), 'a@b.com')
    setValue(pw, 'secret123'); setValue(confirm, 'secret124')
    expect(container.querySelector('.auth-field-error')?.textContent).toBe('Passwords do not match.')
    await submit()
    expect(signUp).not.toHaveBeenCalled()
  })

  it('creates the account when both match', async () => {
    render(); click(byText('Create account'))
    const [pw, confirm] = container.querySelectorAll('input[type="password"]')
    setValue(container.querySelector('input[type="email"]'), 'a@b.com')
    setValue(pw, 'secret123'); setValue(confirm, 'secret123')
    expect(container.querySelector('.auth-field-error')).toBeNull()
    await submit()
    expect(signUp).toHaveBeenCalledWith('a@b.com', 'secret123')
  })
})
