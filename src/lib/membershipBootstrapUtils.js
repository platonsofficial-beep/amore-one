export function resolveBootstrapMembershipRole(memberCount) {
  return Number(memberCount) === 0 ? 'owner' : null
}

export function canBootstrapOwnerMembership(memberCount) {
  return resolveBootstrapMembershipRole(memberCount) === 'owner'
}
