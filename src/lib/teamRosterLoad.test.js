import { describe, expect, it, vi } from 'vitest'
import { loadTeamRoster, TEAM_ROSTER_FAILURE } from './teamRosterLoad'

describe('loadTeamRoster', () => {
  it('treats an empty employee list as a loaded roster', async () => {
    const onRoster = vi.fn()
    const onFailure = vi.fn()

    await loadTeamRoster(Promise.resolve([]), { onRoster, onFailure, timeoutMs: 50 })

    expect(onRoster).toHaveBeenCalledWith([])
    expect(onFailure).not.toHaveBeenCalled()
  })

  it('clears a timeout once the empty roster arrives', async () => {
    vi.useFakeTimers()
    const onRoster = vi.fn()
    const onFailure = vi.fn()
    let resolveRoster
    const request = new Promise((resolve) => {
      resolveRoster = resolve
    })

    const pending = loadTeamRoster(request, { onRoster, onFailure, timeoutMs: 20 })
    await vi.advanceTimersByTimeAsync(25)
    expect(onFailure).toHaveBeenCalledTimes(1)
    expect(onFailure.mock.calls[0][0].message).toBe(TEAM_ROSTER_FAILURE)

    resolveRoster([])
    await pending
    await vi.advanceTimersByTimeAsync(0)

    expect(onRoster).toHaveBeenCalledWith([])
    vi.useRealTimers()
  })

  it('keeps the failure when the roster never arrives', async () => {
    vi.useFakeTimers()
    const onRoster = vi.fn()
    const onFailure = vi.fn()
    const request = new Promise(() => {})

    const pending = loadTeamRoster(request, { onRoster, onFailure, timeoutMs: 20 })
    await vi.advanceTimersByTimeAsync(25)
    await pending

    expect(onRoster).not.toHaveBeenCalled()
    expect(onFailure).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
