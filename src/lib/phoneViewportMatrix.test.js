import { describe, expect, it } from 'vitest'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { access } from 'node:fs/promises'
import { runPhoneViewportMatrix } from '../../scripts/phone-viewport-matrix.mjs'

const chromePath = process.env.CHROME_PATH || '/usr/bin/google-chrome'

describe('phone viewport matrix', () => {
  it('keeps reservations, schedule, stock, and the shell inside every phone size', async () => {
    await access(chromePath)
    const screenshotDir = process.env.ONE_VIEWPORT_SCREENSHOTS
      || await mkdtemp(join(tmpdir(), 'one-phone-viewport-shots-'))
    const report = await runPhoneViewportMatrix({ screenshotDir })
    const summary = report.failures
      .map((failure) => `${failure.page} ${failure.size} ${failure.mode}: ${failure.failures.join(', ')}`)
      .join('\n')
    expect(summary, summary).toBe('')
  }, 600000)
})
