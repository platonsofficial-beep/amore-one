import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const HANDLERS = [
  './api/online-booking-reminders.js',
  './api/online-booking-notify.js',
  './api/workspace-invite-mail.js',
]

describe('booking API handlers load in plain Node ESM', () => {
  it.each(HANDLERS)('%s resolves relative imports with extensions', (specifier) => {
    const result = spawnSync(
      process.execPath,
      ['-e', `await import(${JSON.stringify(specifier)})`],
      { cwd: process.cwd(), encoding: 'utf8' },
    )
    expect(result.stderr, result.stdout).not.toMatch(/ERR_MODULE_NOT_FOUND/)
    expect(result.status).toBe(0)
  })
})
