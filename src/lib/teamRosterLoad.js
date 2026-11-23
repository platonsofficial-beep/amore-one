export const TEAM_ROSTER_TIMEOUT_MS = 8000
export const TEAM_ROSTER_FAILURE = "Couldn't load"

function asRoster(rows) {
  return Array.isArray(rows) ? rows : null
}

/**
 * A new venue has no employee rows. That list is a success, even when it
 * arrives after the wait we use to avoid spinning forever. A timeout must
 * not stick as a connection error once the empty roster shows up.
 */
export function loadTeamRoster(request, { timeoutMs = TEAM_ROSTER_TIMEOUT_MS, isCurrent = () => true, onRoster, onFailure } = {}) {
  let applied = false
  function deliver(rows) {
    if (applied || !isCurrent()) return false
    applied = true
    onRoster?.(rows)
    return true
  }

  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(TEAM_ROSTER_FAILURE)), timeoutMs)
  })

  const tracked = Promise.resolve(request).then((rows) => {
    const roster = asRoster(rows)
    if (roster) deliver(roster)
    return roster
  })

  return Promise.race([tracked, timeout]).catch((error) => {
    tracked.then((roster) => {
      if (roster) deliver(roster)
    }).catch(() => {})
    if (!applied && isCurrent()) onFailure?.(error)
  })
}
