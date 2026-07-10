import { supabase } from '../lib/supabaseClient'
import {
  getDefaultWorkspaceCurrency,
  getDefaultWorkspaceTimezone,
} from '../lib/workspaceProfileOptions'
import { normalizeLocationDisplayValue } from '../lib/workspaceProfileUtils'

const WORKSPACE_PROFILES_TABLE = 'workspace_profiles'
const WORKSPACE_KEY = 'default'

export const EMPTY_WORKSPACE_PROFILE = {
  id: null,
  businessName: '',
  managerName: '',
  managerRole: '',
  timezone: '',
  currency: '',
  logoUrl: '',
  countryCode: '',
  countryName: '',
  city: '',
  defaultPhoneCountryCode: '',
}

function isTableUnavailableError(error) {
  const message = error?.message?.toLowerCase() ?? ''
  return message.includes('does not exist')
    || message.includes('relation')
    || message.includes('could not find the table')
}

function isMissingColumnError(error) {
  const message = error?.message?.toLowerCase() ?? ''
  return message.includes('schema cache')
    && message.includes('column')
}

function getWorkspaceProfileErrorMessage(error, action = 'load') {
  if (isTableUnavailableError(error)) {
    return 'Workspace profile table is not ready yet.'
  }

  if (isMissingColumnError(error)) {
    return 'Workspace profile schema is out of date. Run supabase/workspace_profiles_venue_location.sql in the Supabase SQL editor, then reload schema cache if needed.'
  }

  return error.message || `Unable to ${action} workspace profile right now.`
}

function normalizeProfile(profile = {}) {
  return {
    id: profile.id ?? null,
    businessName: `${profile.businessName ?? ''}`.trim(),
    managerName: `${profile.managerName ?? ''}`.trim(),
    managerRole: `${profile.managerRole ?? ''}`.trim(),
    timezone: `${profile.timezone ?? ''}`.trim(),
    currency: `${profile.currency ?? ''}`.trim(),
    logoUrl: `${profile.logoUrl ?? ''}`.trim(),
    countryCode: `${profile.countryCode ?? profile.country_code ?? ''}`.trim().toUpperCase(),
    countryName: normalizeLocationDisplayValue(profile.countryName ?? profile.country_name ?? ''),
    city: normalizeLocationDisplayValue(profile.city ?? ''),
    defaultPhoneCountryCode: `${profile.defaultPhoneCountryCode ?? profile.default_phone_country_code ?? ''}`.trim(),
  }
}

function mapWorkspaceProfile(record) {
  if (!record) return { ...EMPTY_WORKSPACE_PROFILE }

  return normalizeProfile({
    id: record.id ?? null,
    businessName: record.business_name ?? record.businessName ?? '',
    managerName: record.manager_name ?? record.managerName ?? '',
    managerRole: record.manager_role ?? record.managerRole ?? '',
    timezone: record.timezone ?? '',
    currency: record.currency ?? '',
    logoUrl: record.logo_url ?? record.logoUrl ?? '',
    countryCode: record.country_code ?? record.countryCode ?? '',
    countryName: record.country_name ?? record.countryName ?? '',
    city: record.city ?? '',
    defaultPhoneCountryCode: record.default_phone_country_code ?? record.defaultPhoneCountryCode ?? '',
  })
}

function serializeWorkspaceProfile(profile) {
  const normalized = normalizeProfile(profile)

  return {
    workspace_key: WORKSPACE_KEY,
    business_name: normalized.businessName,
    manager_name: normalized.managerName,
    manager_role: normalized.managerRole,
    timezone: normalized.timezone,
    currency: normalized.currency,
    logo_url: normalized.logoUrl,
    country_code: normalized.countryCode,
    country_name: normalized.countryName,
    city: normalized.city,
    default_phone_country_code: normalized.defaultPhoneCountryCode,
  }
}

export function buildWorkspaceProfileDraft() {
  return normalizeProfile({
    ...EMPTY_WORKSPACE_PROFILE,
    timezone: getDefaultWorkspaceTimezone(),
    currency: getDefaultWorkspaceCurrency(),
  })
}

export async function getWorkspaceProfile() {
  const { data, error } = await supabase
    .from(WORKSPACE_PROFILES_TABLE)
    .select('*')
    .eq('workspace_key', WORKSPACE_KEY)
    .maybeSingle()

  if (error) {
    console.error('[workspaceProfileService] getWorkspaceProfile error:', error)

    if (isTableUnavailableError(error)) {
      throw new Error('Workspace profile table is not ready yet.')
    }

    throw new Error(getWorkspaceProfileErrorMessage(error, 'load'))
  }

  if (data) {
    return mapWorkspaceProfile(data)
  }

  return buildWorkspaceProfileDraft()
}

export async function saveWorkspaceProfile(profile) {
  const normalized = normalizeProfile(profile)
  const payload = serializeWorkspaceProfile(normalized)

  const { data: existing, error: existingError } = await supabase
    .from(WORKSPACE_PROFILES_TABLE)
    .select('id')
    .eq('workspace_key', WORKSPACE_KEY)
    .maybeSingle()

  if (existingError) {
    console.error('[workspaceProfileService] saveWorkspaceProfile lookup error:', existingError)

    if (isTableUnavailableError(existingError)) {
      throw new Error('Workspace profile table is not ready yet.')
    }

    throw new Error(getWorkspaceProfileErrorMessage(existingError, 'save'))
  }

  const request = existing?.id
    ? supabase
      .from(WORKSPACE_PROFILES_TABLE)
      .update(payload)
      .eq('id', existing.id)
      .select('*')
      .single()
    : supabase
      .from(WORKSPACE_PROFILES_TABLE)
      .insert([payload])
      .select('*')
      .single()

  const { data, error } = await request

  if (error) {
    console.error('[workspaceProfileService] saveWorkspaceProfile error:', error)
    throw new Error(getWorkspaceProfileErrorMessage(error, 'save'))
  }

  return mapWorkspaceProfile(data)
}
