/**
 * Auth events (SIGNED_IN on tab refocus, USER_UPDATED, ...) for the same
 * user must not reload the whole workspace context once it is loaded.
 */
export function shouldSkipSameUserReload({ isSameUser = false, hasLoadedContext = false } = {}) {
  return Boolean(isSameUser && hasLoadedContext)
}
