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
    expect(mail.html).toContain('Role: Staff')
    expect(mail.html).toContain('30 Nov 2026')
    expect(mail.html).toContain('bgcolor="#0f1b2d"')
    expect(mail.html).toContain('name="color-scheme" content="light dark"')
    expect(mail.html).toContain('ONE · onehospitality.app')
    expect(mail.html).not.toContain('<script')
    expect(mail.text).toContain('Role: Staff')
    expect(mail.text).toContain('https://app.onehospitality.app/?invite=tok')
    expect(mail.text).toContain('ONE · onehospitality.app')
  })

  it('states the invited role on its own line', () => {
    const mail = buildWorkspaceInviteEmail({
      venueName: 'SENTIO NICOSIA',
      role: 'manager',
      inviteUrl: 'https://app.onehospitality.app/?invite=tok',
    })
    expect(mail.html).toContain('Role: Manager')
    expect(mail.text).toContain('Role: Manager')
    expect(mail.html).toContain("You're invited to SENTIO NICOSIA")
  })
})
