import { supabase } from '../lib/supabaseClient'
import {
  getDefaultWorkspaceCurrency,
  getDefaultWorkspaceTimezone,
} from '../lib/workspaceProfileOptions'
import { normalizeLocationDisplayValue } from '../lib/workspaceProfileUtils'
import {
  DEFAULT_RESERVATION_AUTO_CLOSE_TIME,
  normalizeReservationAutoCloseTime,
} from '../lib/reservationAutoClose'

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
  reservationAutoCloseTime: DEFAULT_RESERVATION_AUTO_CLOSE_TIME,
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

export function isMissingReservationAutoCloseColumnError(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  return message.includes('reservation_auto_close_time')
    && (
      message.includes('schema cache')
      || message.includes('column')
      || message.includes('does not exist')
    )
}

export function withoutReservationAutoCloseColumn(payload = {}) {
  const next = { ...payload }
  delete next.reservation_auto_close_time
  return next
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
    reservationAutoCloseTime: normalizeReservationAutoCloseTime(
      profile.reservationAutoCloseTime ?? profile.reservation_auto_close_time,
    ),
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
    reservationAutoCloseTime: record.reservation_auto_close_time ?? record.reservationAutoCloseTime,
  })
}

function serializeWorkspaceProfile(profile, workspaceId = '') {
  const normalized = normalizeProfile(profile)

  return {
    workspace_key: WORKSPACE_KEY,
    ...(workspaceId ? { workspace_id: workspaceId } : {}),
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
    reservation_auto_close_time: normalized.reservationAutoCloseTime,
  }
}

export function buildWorkspaceProfileDraft() {
  return normalizeProfile({
    ...EMPTY_WORKSPACE_PROFILE,
    timezone: getDefaultWorkspaceTimezone(),
    currency: getDefaultWorkspaceCurrency(),
  })
}

function normalizeWorkspaceId(workspaceId) {
  return `${workspaceId ?? ''}`.trim()
}

/**
 * The venue's profile row: by workspace_id first, then the legacy 'default'
 * singleton (only when it belongs to this venue or has no workspace_id yet).
 */
export function pickWorkspaceProfileRecord(rows = [], workspaceId = '') {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : []
  const id = normalizeWorkspaceId(workspaceId)
  if (!id) return list.find((row) => row.workspace_key === WORKSPACE_KEY) ?? null
  return list.find((row) => `${row.workspace_id ?? ''}` === id)
    ?? list.find((row) => row.workspace_key === WORKSPACE_KEY && !row.workspace_id)
    ?? null
}

async function fetchWorkspaceProfileRecord(workspaceId, columns = '*') {
  const id = normalizeWorkspaceId(workspaceId)
  const query = supabase.from(WORKSPACE_PROFILES_TABLE).select(columns)
  const { data, error } = id
    ? await query.or(`workspace_id.eq.${id},workspace_key.eq.${WORKSPACE_KEY}`)
    : await query.eq('workspace_key', WORKSPACE_KEY)
  if (error) return { data: null, error }
  const rows = Array.isArray(data) ? data : (data ? [data] : [])
  return { data: pickWorkspaceProfileRecord(rows, id), error: null }
}

export async function getWorkspaceProfile(workspaceId = '') {
  const { data, error } = await fetchWorkspaceProfileRecord(workspaceId)

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

export async function saveWorkspaceProfile(profile, workspaceId = '') {
  const normalized = normalizeProfile(profile)
  const id = normalizeWorkspaceId(workspaceId)
  const { data: existing, error: existingError } = await fetchWorkspaceProfileRecord(id, 'id, workspace_key, workspace_id')
  const payload = serializeWorkspaceProfile(normalized, id)
  if (existing?.workspace_key) {
    payload.workspace_key = existing.workspace_key
  } else if (id) {
    payload.workspace_key = id
  }

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

  if (error && isMissingReservationAutoCloseColumnError(error)) {
    const retryPayload = withoutReservationAutoCloseColumn(payload)
    const retry = existing?.id
      ? supabase
        .from(WORKSPACE_PROFILES_TABLE)
        .update(retryPayload)
        .eq('id', existing.id)
        .select('*')
        .single()
      : supabase
        .from(WORKSPACE_PROFILES_TABLE)
        .insert([retryPayload])
        .select('*')
        .single()
    const retried = await retry

    if (retried.error) {
      console.error('[workspaceProfileService] saveWorkspaceProfile error:', retried.error)
      throw new Error(getWorkspaceProfileErrorMessage(retried.error, 'save'))
    }

    return {
      ...mapWorkspaceProfile(retried.data),
      reservationAutoCloseTime: normalized.reservationAutoCloseTime,
      reservationAutoClosePending: true,
    }
  }

  if (error) {
    console.error('[workspaceProfileService] saveWorkspaceProfile error:', error)
    throw new Error(getWorkspaceProfileErrorMessage(error, 'save'))
  }

  return mapWorkspaceProfile(data)
}
