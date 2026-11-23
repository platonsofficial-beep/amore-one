import { afterEach, describe, expect, it } from 'vitest'
import { buildInviteUrl } from '../services/inviteService'
import {
  CANONICAL_APP_ORIGIN,
  canonicalPublicAppUrl,
  publicShareOrigin,
} from './publicAppUrl'

const ORIGINAL_PUBLIC = process.env.VITE_PUBLIC_APP_URL
const ORIGINAL_INVITE = process.env.INVITE_APP_URL

afterEach(() => {
  if (ORIGINAL_PUBLIC === undefined) delete process.env.VITE_PUBLIC_APP_URL
  else process.env.VITE_PUBLIC_APP_URL = ORIGINAL_PUBLIC
  if (ORIGINAL_INVITE === undefined) delete process.env.INVITE_APP_URL
  else process.env.INVITE_APP_URL = ORIGINAL_INVITE
})

describe('public share origin', () => {
  it('uses the canonical app host for the installed vercel.app origin', () => {
    const origin = publicShareOrigin(
      { hostname: 'amore-one-sandy.vercel.app', origin: 'https://amore-one-sandy.vercel.app' },
      { dev: false },
    )
    expect(origin).toBe(CANONICAL_APP_ORIGIN)
    expect(canonicalPublicAppUrl()).toBe('https://app.onehospitality.app')
    expect(buildInviteUrl('abc 1', origin)).toBe('https://app.onehospitality.app/?invite=abc%201')
    expect(buildInviteUrl('abc 1')).toBe('https://app.onehospitality.app/?invite=abc%201')
  })

  it('keeps localhost only while developing', () => {
    const local = { hostname: 'localhost', origin: 'http://localhost:5173' }
    expect(publicShareOrigin(local, { dev: true })).toBe('http://localhost:5173')
    expect(publicShareOrigin(local, { dev: false })).toBe(CANONICAL_APP_ORIGIN)
  })

  it('does not keep a deployed preview host', () => {
    const preview = {
      hostname: 'amore-one-git-cursor-invi-example.vercel.app',
      origin: 'https://amore-one-git-cursor-invi-example.vercel.app',
    }
    expect(publicShareOrigin(preview, { dev: false })).toBe(CANONICAL_APP_ORIGIN)
    expect(publicShareOrigin(preview, { dev: true })).toBe(CANONICAL_APP_ORIGIN)
  })

  it('prefers VITE_PUBLIC_APP_URL when it is set', () => {
    process.env.VITE_PUBLIC_APP_URL = 'https://app.example.test/'
    expect(publicShareOrigin(
      { hostname: 'amore-one-sandy.vercel.app', origin: 'https://amore-one-sandy.vercel.app' },
      { dev: false },
    )).toBe('https://app.example.test')
    expect(canonicalPublicAppUrl()).toBe('https://app.example.test')
  })
})
