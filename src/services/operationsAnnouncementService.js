import {
  countEligibleAudienceMembers,
  normalizeAnnouncementAudience,
  normalizeAnnouncementPriority,
} from '../lib/operationsAnnouncementUtils'
import { supabase } from '../lib/supabaseClient'
import { getMemberDisplayNamesByAuthUserIds } from './membershipService'

const ANNOUNCEMENTS_TABLE = 'operations_announcements'
const READS_TABLE = 'operations_announcement_reads'
const WORKSPACE_MEMBERS_TABLE = 'workspace_members'

function isTableUnavailableError(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  const code = `${error?.code ?? ''}`
  return code === '42P01'
    || message.includes('does not exist')
    || message.includes('relation')
    || message.includes('could not find the table')
}

function mapAnnouncement(record) {
  return {
    id: record.id,
    workspaceId: record.workspace_id ?? record.workspaceId ?? '',
    title: record.title ?? '',
    message: record.message ?? '',
    priority: normalizeAnnouncementPriority(record.priority),
    audience: normalizeAnnouncementAudience(record.audience),
    active: record.active !== false,
    startsAt: record.starts_at ?? record.startsAt ?? null,
    endsAt: record.ends_at ?? record.endsAt ?? null,
    createdBy: record.created_by ?? record.createdBy ?? null,
    createdAt: record.created_at ?? record.createdAt ?? null,
    updatedAt: record.updated_at ?? record.updatedAt ?? null,
  }
}

function parseOptionalDateTime(value) {
  const trimmed = `${value ?? ''}`.trim()
  if (!trimmed) return null
  const date = new Date(trimmed)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function serializeAnnouncement(announcement, workspaceId) {
  return {
    workspace_id: workspaceId,
    title: `${announcement.title ?? ''}`.trim(),
    message: `${announcement.message ?? ''}`.trim(),
    priority: normalizeAnnouncementPriority(announcement.priority),
    audience: normalizeAnnouncementAudience(announcement.audience),
    active: announcement.active !== false,
    starts_at: parseOptionalDateTime(announcement.startsAt),
    ends_at: parseOptionalDateTime(announcement.endsAt),
    created_by: announcement.createdBy ?? announcement.created_by ?? null,
  }
}

function mapWorkspaceMemberForAudience(record, employees = []) {
  const employeeId = `${record.employee_id ?? record.employeeId ?? ''}`.trim()
  const employee = employees.find((item) => `${item.id}` === employeeId)
  const position = `${employee?.position ?? employee?.role ?? ''}`.trim()

  return {
    authUserId: record.auth_user_id ?? record.authUserId ?? null,
    role: `${record.role ?? ''}`.trim().toLowerCase(),
    employeeDepartment: position,
  }
}

async function fetchWorkspaceAudienceMembers(workspaceId, employees = []) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  if (!normalizedWorkspaceId) return []

  const { data, error } = await supabase
    .from(WORKSPACE_MEMBERS_TABLE)
    .select('auth_user_id, role, employee_id')
    .eq('workspace_id', normalizedWorkspaceId)

  if (error) {
    console.warn('[operationsAnnouncementService] fetchWorkspaceAudienceMembers error:', error)
    return []
  }

  return (data ?? []).map((record) => mapWorkspaceMemberForAudience(record, employees))
}

async function enrichAnnouncements(
  announcements = [],
  {
    workspaceId = '',
    currentUserId = null,
    employees = [],
  } = {},
) {
  if (announcements.length === 0) return []

  const announcementIds = announcements.map((announcement) => announcement.id).filter(Boolean)
  const createdByIds = announcements.map((announcement) => announcement.createdBy).filter(Boolean)
  const audienceMembers = await fetchWorkspaceAudienceMembers(workspaceId, employees)

  const { data: readsData, error: readsError } = await supabase
    .from(READS_TABLE)
    .select('announcement_id, user_id, read_at')
    .in('announcement_id', announcementIds)

  if (readsError) {
    console.warn('[operationsAnnouncementService] enrichAnnouncements reads error:', readsError)
  }

  const reads = readsData ?? []
  const readsByAnnouncementId = new Map()

  reads.forEach((read) => {
    const announcementId = read.announcement_id ?? read.announcementId
    if (!announcementId) return
    if (!readsByAnnouncementId.has(announcementId)) {
      readsByAnnouncementId.set(announcementId, [])
    }
    readsByAnnouncementId.get(announcementId).push(read)
  })

  const nameByAuthUserId = await getMemberDisplayNamesByAuthUserIds(workspaceId, createdByIds)

  return announcements.map((announcement) => {
    const announcementReads = readsByAnnouncementId.get(announcement.id) ?? []
    const readCount = announcementReads.length
    const isRead = currentUserId
      ? announcementReads.some((read) => `${read.user_id ?? read.userId}` === `${currentUserId}`)
      : false
    const eligibleCount = countEligibleAudienceMembers(audienceMembers, announcement.audience)

    return {
      ...announcement,
      readCount,
      eligibleCount,
      isRead,
      createdByName: announcement.createdBy
        ? (nameByAuthUserId[announcement.createdBy] ?? 'Manager')
        : 'Manager',
    }
  })
}

export async function getOperationsAnnouncements(
  workspaceId,
  {
    currentUserId = null,
    employees = [],
    limit = 100,
  } = {},
) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  if (!normalizedWorkspaceId) return []

  const { data, error } = await supabase
    .from(ANNOUNCEMENTS_TABLE)
    .select('*')
    .eq('workspace_id', normalizedWorkspaceId)
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Number(limit) || 100))

  if (error) {
    console.error('[operationsAnnouncementService] getOperationsAnnouncements error:', error)
    if (isTableUnavailableError(error)) {
      return []
    }
    throw new Error(error.message || 'Unable to load announcements right now.')
  }

  const mapped = (data ?? []).map(mapAnnouncement)
  return enrichAnnouncements(mapped, { workspaceId: normalizedWorkspaceId, currentUserId, employees })
}

export async function createOperationsAnnouncement(workspaceId, announcement, createdBy = null) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  if (!normalizedWorkspaceId) {
    throw new Error('Workspace is required to publish an announcement.')
  }

  const payload = {
    ...serializeAnnouncement(announcement, normalizedWorkspaceId),
    created_by: createdBy ?? announcement.createdBy ?? null,
  }

  const { data, error } = await supabase
    .from(ANNOUNCEMENTS_TABLE)
    .insert([payload])
    .select('*')
    .single()

  if (error) {
    console.error('[operationsAnnouncementService] createOperationsAnnouncement error:', error)
    if (isTableUnavailableError(error)) {
      throw new Error('Unable to publish right now.')
    }
    throw new Error(error.message || 'Unable to publish right now.')
  }

  const [enriched] = await enrichAnnouncements([mapAnnouncement(data)], {
    workspaceId: normalizedWorkspaceId,
    currentUserId: createdBy,
    employees: [],
  })
  return enriched
}

export async function updateOperationsAnnouncement(workspaceId, announcementId, announcement) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  const normalizedAnnouncementId = `${announcementId ?? ''}`.trim()
  if (!normalizedWorkspaceId || !normalizedAnnouncementId) {
    throw new Error('Workspace and announcement are required.')
  }

  const { data, error } = await supabase
    .from(ANNOUNCEMENTS_TABLE)
    .update({
      title: `${announcement.title ?? ''}`.trim(),
      message: `${announcement.message ?? ''}`.trim(),
      priority: normalizeAnnouncementPriority(announcement.priority),
      audience: normalizeAnnouncementAudience(announcement.audience),
      active: announcement.active !== false,
      starts_at: parseOptionalDateTime(announcement.startsAt),
      ends_at: parseOptionalDateTime(announcement.endsAt),
    })
    .eq('workspace_id', normalizedWorkspaceId)
    .eq('id', normalizedAnnouncementId)
    .select('*')
    .single()

  if (error) {
    console.error('[operationsAnnouncementService] updateOperationsAnnouncement error:', error)
    if (isTableUnavailableError(error)) {
      throw new Error('Unable to save changes right now.')
    }
    throw new Error(error.message || 'Unable to save changes right now.')
  }

  const [enriched] = await enrichAnnouncements([mapAnnouncement(data)], {
    workspaceId: normalizedWorkspaceId,
    currentUserId: null,
    employees: [],
  })
  return enriched
}

export async function deactivateOperationsAnnouncement(workspaceId, announcementId) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  const normalizedAnnouncementId = `${announcementId ?? ''}`.trim()
  if (!normalizedWorkspaceId || !normalizedAnnouncementId) {
    throw new Error('Workspace and announcement are required.')
  }

  const { error } = await supabase
    .from(ANNOUNCEMENTS_TABLE)
    .update({ active: false })
    .eq('workspace_id', normalizedWorkspaceId)
    .eq('id', normalizedAnnouncementId)

  if (error) {
    console.error('[operationsAnnouncementService] deactivateOperationsAnnouncement error:', error)
    if (isTableUnavailableError(error)) {
      throw new Error('Unable to deactivate right now.')
    }
    throw new Error(error.message || 'Unable to deactivate right now.')
  }
}

export async function deleteOperationsAnnouncement(workspaceId, announcementId) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  const normalizedAnnouncementId = `${announcementId ?? ''}`.trim()
  if (!normalizedWorkspaceId || !normalizedAnnouncementId) {
    throw new Error('Workspace and announcement are required.')
  }

  const { error } = await supabase
    .from(ANNOUNCEMENTS_TABLE)
    .delete()
    .eq('workspace_id', normalizedWorkspaceId)
    .eq('id', normalizedAnnouncementId)

  if (error) {
    console.error('[operationsAnnouncementService] deleteOperationsAnnouncement error:', error)
    if (isTableUnavailableError(error)) {
      throw new Error('Unable to delete right now.')
    }
    throw new Error(error.message || 'Unable to delete right now.')
  }
}

export async function markOperationsAnnouncementRead(announcementId, userId) {
  const normalizedAnnouncementId = `${announcementId ?? ''}`.trim()
  const normalizedUserId = `${userId ?? ''}`.trim()
  if (!normalizedAnnouncementId || !normalizedUserId) {
    throw new Error('Announcement and user are required.')
  }

  const { error } = await supabase
    .from(READS_TABLE)
    .upsert({
      announcement_id: normalizedAnnouncementId,
      user_id: normalizedUserId,
      read_at: new Date().toISOString(),
    }, { onConflict: 'announcement_id,user_id' })

  if (error) {
    console.error('[operationsAnnouncementService] markOperationsAnnouncementRead error:', error)
    if (isTableUnavailableError(error)) {
      throw new Error('Unable to mark as seen right now.')
    }
    throw new Error(error.message || 'Unable to mark as seen right now.')
  }
}
