// Create account: the new password is typed twice and must match.
export const PASSWORD_MISMATCH_MESSAGE = 'Passwords do not match.'

export function passwordsMatch(password, confirmPassword) {
  return `${password ?? ''}` === `${confirmPassword ?? ''}`
}
