import { describe, it, expect } from 'vitest'
import { isPhoneLandscape, applyPhoneLandscapeClass } from './phoneLandscapeClass.js'

const win = (iw, ih, sw, sh, touch = 5) => ({ innerWidth: iw, innerHeight: ih, screen: { width: sw, height: sh }, navigator: { maxTouchPoints: touch }, matchMedia: () => ({ matches: touch > 0 }) })

describe('isPhoneLandscape', () => {
  it('iPhone landscape matches, including a tall standalone viewport', () => {
    expect(isPhoneLandscape(win(852, 393, 393, 852))).toBe(true)
    expect(isPhoneLandscape(win(956, 440, 440, 956))).toBe(true)
    expect(isPhoneLandscape(win(956, 520, 440, 956))).toBe(true)
  })
  it('portrait phone, iPad and desktop do not', () => {
    expect(isPhoneLandscape(win(393, 852, 393, 852))).toBe(false)
    expect(isPhoneLandscape(win(1180, 820, 820, 1180))).toBe(false)
    expect(isPhoneLandscape(win(820, 1180, 820, 1180))).toBe(false)
    expect(isPhoneLandscape(win(1440, 900, 1440, 900, 0))).toBe(false)
    expect(isPhoneLandscape(win(900, 400, 1440, 900, 0))).toBe(false)
  })
  it('toggles the html class', () => {
    const cls = new Set(); const doc = { documentElement: { classList: { toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)) } } }
    applyPhoneLandscapeClass(win(852, 393, 393, 852), doc); expect(cls.has('one-phone-landscape')).toBe(true)
    applyPhoneLandscapeClass(win(393, 852, 393, 852), doc); expect(cls.has('one-phone-landscape')).toBe(false)
  })
})
