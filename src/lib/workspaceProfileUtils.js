import { resolveUserFirstName } from './operationalSnapshotUtils'

export function getProfileInitials(name) {
  const trimmed = `${name ?? ''}`.trim()
  if (!trimmed) return '?'

  const initials = trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

  return initials || '?'
}

export function getBrandInitial(name) {
  const trimmed = `${name ?? ''}`.trim()
  if (!trimmed) return '?'
  return trimmed[0]?.toUpperCase() ?? '?'
}

export function buildDashboardGreeting(timeGreeting, managerName) {
  const trimmedName = `${managerName ?? ''}`.trim()
  if (!trimmedName) return `${timeGreeting}.`
  const firstName = resolveUserFirstName(trimmedName)
  const formattedName = firstName
    ? `${firstName.charAt(0).toUpperCase()}${firstName.slice(1).toLowerCase()}`
    : trimmedName
  return `${timeGreeting}, ${formattedName}.`
}

export function buildProfileChipDisplay(profile) {
  const managerName = `${profile?.managerName ?? ''}`.trim()
  const managerRole = `${profile?.managerRole ?? ''}`.trim()
  const logoUrl = `${profile?.logoUrl ?? ''}`.trim()

  if (!managerName) {
    return {
      initials: '?',
      name: 'Profile not set',
      role: 'Set up in Workspace Settings',
      logoUrl: '',
      isConfigured: false,
    }
  }

  return {
    initials: getProfileInitials(managerName),
    name: managerName,
    role: managerRole || 'No role set',
    logoUrl,
    isConfigured: true,
  }
}

export function resolveDisplayBusinessName(profile, fallbackName = '') {
  const businessName = `${profile?.businessName ?? ''}`.trim()
  return businessName || `${fallbackName ?? ''}`.trim()
}

export function buildBrandDisplay(profile) {
  const businessName = `${profile?.businessName ?? ''}`.trim()
  const logoUrl = `${profile?.logoUrl ?? ''}`.trim()

  return {
    businessName,
    businessNameLabel: businessName || 'Workspace not set',
    logoUrl,
    mark: logoUrl ? '' : (businessName ? getBrandInitial(businessName) : '?'),
  }
}

const WORKSPACE_PROFILE_FIELDS = [
  'businessName',
  'managerName',
  'managerRole',
  'timezone',
  'currency',
  'logoUrl',
]

function normalizeProfileField(value) {
  return `${value ?? ''}`.trim()
}

export function areWorkspaceProfilesEqual(left = {}, right = {}) {
  return WORKSPACE_PROFILE_FIELDS.every((field) => (
    normalizeProfileField(left?.[field]) === normalizeProfileField(right?.[field])
  ))
}

export function isWorkspaceProfileConfigured(profile = {}) {
  return Boolean(
    normalizeProfileField(profile.businessName)
    || normalizeProfileField(profile.managerName),
  )
}

export function buildWorkspaceIdentityLines({
  workspaceName = '',
  businessName = '',
} = {}) {
  const technicalName = normalizeProfileField(workspaceName)
  const displayBusinessName = normalizeProfileField(businessName)
  const primary = displayBusinessName || technicalName || '—'
  const showTechnicalName = Boolean(
    technicalName
    && displayBusinessName
    && technicalName !== displayBusinessName,
  )

  return {
    primary,
    technicalName: showTechnicalName ? technicalName : '',
    hint: showTechnicalName
      ? 'Business name is shown across ONE. Update it in Business Profile.'
      : (!displayBusinessName && technicalName
        ? 'Set a business name in Business Profile for a clearer workspace label.'
        : ''),
  }
}

export function shouldInitializeWorkspaceProfileDraft(previousActiveView, nextActiveView) {
  return nextActiveView === 'settings' && previousActiveView !== 'settings'
}
