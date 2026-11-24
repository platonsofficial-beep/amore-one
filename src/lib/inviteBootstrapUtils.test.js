import { describe, expect, it } from 'vitest'
import {
  buildInviteBootstrapAttemptPlan,
  normalizeInviteEmail,
  resolveInviteAcceptanceError,
  shouldAutoCreateSignupVenue,
  shouldSkipOwnerMembershipBootstrap,
} from './inviteBootstrapUtils'
import {
  shouldShowJoiningWorkspaceMessage,
  shouldSkipMembershipBootstrapAfterInviteAttempt,
} from './inviteFlowUtils'

describe('inviteBootstrapUtils', () => {
  it('normalizes invite emails for matching', () => {
    expect(normalizeInviteEmail(' Alex@Example.COM ')).toBe('alex@example.com')
  })

  it('builds token-first then email invite attempts when membership is missing', () => {
    expect(buildInviteBootstrapAttemptPlan({
      pendingToken: 'token-123',
      userEmail: 'alex@example.com',
      hasMembership: false,
    })).toEqual([
      { kind: 'token', token: 'token-123' },
      { kind: 'email', email: 'alex@example.com' },
    ])
  })

  it('skips email invite attempt when membership already exists', () => {
    expect(buildInviteBootstrapAttemptPlan({
      pendingToken: '',
      userEmail: 'alex@example.com',
      hasMembership: true,
    })).toEqual([])
  })

  it('still accepts a pending token when the user already owns a venue', () => {
    expect(buildInviteBootstrapAttemptPlan({
      pendingToken: 'token-123',
      userEmail: 'alex@example.com',
      hasMembership: true,
    })).toEqual([
      { kind: 'token', token: 'token-123' },
    ])
  })

  it('recovers from duplicate accept when membership already exists', () => {
    expect(resolveInviteAcceptanceError({
      errorMessage: 'Invite has already been accepted.',
      hasMembership: true,
    })).toMatchObject({
      recovered: true,
      shouldSurfaceError: false,
      shouldClearToken: true,
    })
  })

  it('surfaces fatal invite errors when membership is still missing', () => {
    expect(resolveInviteAcceptanceError({
      errorMessage: 'Invite has expired.',
      hasMembership: false,
    })).toMatchObject({
      recovered: false,
      shouldSurfaceError: true,
      shouldClearToken: true,
    })
  })

  it('skips owner bootstrap after successful invite even before membership hydration', () => {
    expect(shouldSkipOwnerMembershipBootstrap({
      inviteSucceeded: true,
      resolvedMembership: null,
    })).toBe(true)
  })

  it('does not skip owner bootstrap when invite was not accepted', () => {
    expect(shouldSkipMembershipBootstrapAfterInviteAttempt({
      inviteSucceeded: false,
      resolvedMembership: null,
    })).toBe(false)
  })

  it('never auto-creates a venue for a new account with no invite', () => {
    expect(shouldAutoCreateSignupVenue()).toBe(false)
    expect(shouldSkipOwnerMembershipBootstrap({
      inviteSucceeded: false,
      resolvedMembership: null,
      hasPendingInvite: false,
    })).toBe(false)
  })

  it('does not create a venue while an invite token is still pending', () => {
    expect(shouldSkipOwnerMembershipBootstrap({
      inviteSucceeded: false,
      resolvedMembership: null,
      hasPendingInvite: true,
    })).toBe(true)
  })
})

describe('invite joining workspace messaging', () => {
  it('shows joining state while invite token or bootstrap is active', () => {
    expect(shouldShowJoiningWorkspaceMessage({
      isJoiningWorkspace: true,
      membershipLoadError: null,
    })).toBe(true)

    expect(shouldShowJoiningWorkspaceMessage({
      hasPendingInviteToken: true,
      membershipLoadError: null,
    })).toBe(true)
  })

  it('does not show joining state when invite failed with an error', () => {
    expect(shouldShowJoiningWorkspaceMessage({
      isJoiningWorkspace: true,
      membershipLoadError: 'Invite has expired.',
    })).toBe(false)
  })
})
