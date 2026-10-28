/**
 * Test-only auth bypass for viewport scripts. Production builds never set this.
 * Both the phone viewport matrix and the WebKit keyboard check call this so
 * the flag lives in one place.
 */
export function enableViewportAuthBypass() {
  process.env.VITE_AUTH_DISABLED = 'true'
}
