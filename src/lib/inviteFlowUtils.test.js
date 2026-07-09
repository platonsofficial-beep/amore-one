import { describe, expect, it } from 'vitest'
import {
  buildInviteAcceptedNotice,
  buildInvitePreviewSummary,
  formatInviteErrorMessage,
  isFatalInviteError,
  shouldSkipMembershipBootstrapAfterInviteAttempt,
} from './inviteFlowUtils'

describe('inviteFlowUtils', () => {
  it('formats expired, revoked, and accepted invite errors', () => {
    expect(formatInviteErrorMessage('Invite has expired')).toContain('expired')
    expect(formatInviteErrorMessage('Invite was revoked')).toContain('revoked')
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

  it('builds an accepted notice with workspace name', () => {
    expect(buildInviteAcceptedNotice('Amore Nicosia')).toContain('Amore Nicosia')
    expect(buildInviteAcceptedNotice('')).toContain('Welcome to ONE')
  })

  it('detects fatal invite errors and bootstrap skip rules', () => {
    expect(isFatalInviteError('Invite has expired')).toBe(true)
    expect(isFatalInviteError('Invite already accepted')).toBe(true)
    expect(isFatalInviteError('Network timeout')).toBe(false)

    expect(shouldSkipMembershipBootstrapAfterInviteAttempt({
      inviteAttempted: false,
    })).toBe(false)

    expect(shouldSkipMembershipBootstrapAfterInviteAttempt({
      inviteAttempted: true,
    })).toBe(true)
  })
})
