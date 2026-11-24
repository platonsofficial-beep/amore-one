import { describe, expect, it } from 'vitest'
import { setLocale, t } from '../i18n/i18n'
import {
  buildInviteAcceptedNotice,
  buildInvitePreviewSummary,
  formatInviteErrorMessage,
  isFatalInviteError,
  parseInviteTokenInput,
  pastedInviteDecision,
  shouldSkipMembershipBootstrapAfterInviteAttempt,
} from './inviteFlowUtils'

describe('inviteFlowUtils', () => {
  it('formats expired, revoked, and accepted invite errors', () => {
    expect(formatInviteErrorMessage('Invite has expired')).toContain('expired')
    expect(formatInviteErrorMessage('Invite was revoked')).toContain('cancelled')
    expect(formatInviteErrorMessage('Invite has already been accepted')).toContain('already used')
    expect(formatInviteErrorMessage('Invite not found')).toContain('not found')
  })

  it('builds a join banner for valid invites', () => {
    const summary = buildInvitePreviewSummary({
      found: true,
      workspaceName: 'Amore Nicosia',
      employeeName: 'Alex Smith',
      email: 'alex@example.com',
      isExpired: false,
      isRevoked: false,
      isAccepted: false,
    })

    expect(summary.canJoin).toBe(true)
    expect(summary.title).toBe('Join Amore Nicosia')
    expect(summary.message).toContain('Alex Smith')
    expect(summary.message).toContain('alex@example.com')
  })

  it('blocks join messaging for invalid invite previews', () => {
    const expired = buildInvitePreviewSummary({
      found: true,
      workspaceName: 'Amore',
      isExpired: true,
      isRevoked: false,
      isAccepted: false,
    })

    expect(expired.canJoin).toBe(false)
    expect(expired.title).toBe('Invite expired')
  })

  it('builds an accepted notice with the venue and role', () => {
    expect(buildInviteAcceptedNotice('SENTIO NICOSIA', 'Manager')).toBe('You joined SENTIO NICOSIA as Manager.')
    expect(buildInviteAcceptedNotice('SENTIO NICOSIA')).toBe('You joined SENTIO NICOSIA.')
    expect(buildInviteAcceptedNotice('')).toBe('You joined the venue.')
  })

  it('talks about the invite link in English and Greek', () => {
    setLocale('en')
    expect(t("Paste the link you received to join the venue.")).toBe('Paste the link you received to join the venue.')
    expect(t("Start screen invite link")).toBe('Invite link')
    expect(t("https://app.onehospitality.app/...")).toBe('https://app.onehospitality.app/...')
    setLocale('el')
    expect(t("Paste the link you received to join the venue.")).toBe('Επικόλλησε το link που σου ήρθε για να μπεις στο μαγαζί.')
    expect(t("Start screen invite link")).toBe('Link πρόσκλησης')
    expect(t("https://app.onehospitality.app/...")).toBe('https://app.onehospitality.app/...')
    expect(t("Start screen invite link")).not.toMatch(/κωδικ/i)
    setLocale('en')
  })

  it('reads an invite token from a link, a path, or a bare token', () => {
    expect(parseInviteTokenInput('https://app.onehospitality.app/?invite=abc-123')).toBe('abc-123')
    expect(parseInviteTokenInput('https://app.onehospitality.app/invite/path-token')).toBe('path-token')
    expect(parseInviteTokenInput('  bare-token  ')).toBe('bare-token')
    expect(parseInviteTokenInput('https://app.onehospitality.app/today')).toBe('')
    expect(parseInviteTokenInput('')).toBe('')
  })

  it('rejects a pasted invite that belongs to another email and keeps valid ones', () => {
    const preview = {
      found: true,
      workspaceName: 'SENTIO NICOSIA',
      email: 'guest@example.com',
      isExpired: false,
      isRevoked: false,
      isAccepted: false,
    }
    expect(pastedInviteDecision({ preview, userEmail: 'owner@example.com' }).ok).toBe(false)
    expect(pastedInviteDecision({ preview, userEmail: 'owner@example.com' }).message).toContain('guest@example.com')
    expect(pastedInviteDecision({ preview, userEmail: 'Guest@Example.com' }).ok).toBe(true)
    expect(pastedInviteDecision({
      preview: { ...preview, isExpired: true },
      userEmail: 'guest@example.com',
    }).message).toContain('expired')
    expect(pastedInviteDecision({
      preview: { found: false },
      userEmail: 'guest@example.com',
    }).ok).toBe(false)
  })

  it('detects fatal invite errors and bootstrap skip rules', () => {
    expect(isFatalInviteError('Invite has expired')).toBe(true)
    expect(isFatalInviteError('Invite already accepted')).toBe(true)
    expect(isFatalInviteError('Network timeout')).toBe(false)

    expect(shouldSkipMembershipBootstrapAfterInviteAttempt({
      inviteSucceeded: false,
      resolvedMembership: null,
    })).toBe(false)

    expect(shouldSkipMembershipBootstrapAfterInviteAttempt({
      inviteSucceeded: true,
      resolvedMembership: null,
    })).toBe(true)

    expect(shouldSkipMembershipBootstrapAfterInviteAttempt({
      inviteSucceeded: false,
      resolvedMembership: { id: 'm1' },
    })).toBe(true)
  })
})
