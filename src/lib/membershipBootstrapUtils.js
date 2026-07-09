export {
  resolveBootstrapMembershipRole,
} from '../services/membershipService'

export function canBootstrapOwnerMembership(memberCount) {
  return Number(memberCount) === 0
}
