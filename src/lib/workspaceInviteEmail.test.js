import { describe, expect, it } from 'vitest'
import { buildWorkspaceInviteEmail, workspaceInviteUrl } from './workspaceInviteEmail'

describe('workspace invite email', () => {
  it('builds an English accept link for the app', () => {
    expect(workspaceInviteUrl('abc 1', 'https://app.onehospitality.app/')).toBe(
      'https://app.onehospitality.app/?invite=abc%201',
    )
    const mail = buildWorkspaceInviteEmail({
      venueName: 'SENTIO NICOSIA',
      employeeName: 'Platon',
      role: 'staff',
      email: 'desk@example.com',
      expiresAt: '2026-11-30T21:45:00.000Z',
      inviteUrl: workspaceInviteUrl('tok'),
    })
    expect(mail.subject).toBe("You're invited to SENTIO NICOSIA")
    expect(mail.html).toContain('Accept invite')
    expect(mail.html).toContain('https://app.onehospitality.app/?invite=tok')
    expect(mail.html).toContain('SENTIO NICOSIA')
    expect(mail.html).toContain('30 Nov 2026')
    expect(mail.html).not.toContain('<script')
  })
})
