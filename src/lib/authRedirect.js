import { publicShareOrigin } from './publicAppUrl.js'
import { readPendingInviteToken } from './inviteTokenStorage.js'

/** Confirmation links must keep the invite. Gmail and in-app browsers do not share localStorage. */
export function buildAuthEmailRedirect(location) {
  const origin = publicShareOrigin(location)
  const url = new URL(`${origin}/`)
  const token = readPendingInviteToken()
  if (token) url.searchParams.set('invite', token)
  return url.toString()
}
