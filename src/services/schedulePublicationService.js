import { supabase } from '../lib/supabaseClient'
import { assertShiftsReadyForPublish } from '../lib/shiftIntegrity'
import {
  deletePublishedShiftsForWeek,
  getPublishedShifts,
  replacePublishedShifts,
} from './publishedShiftService'

const SCHEDULE_PUBLICATIONS_TABLE = 'schedule_publications'
const SCHEDULE_PUBLICATION_COLUMNS = 'id, week_start_date, status, published_at, unpublished_at, created_at'

function normalizeWeekStartDate(value) {
  if (!value) return ''
  const raw = `${value}`.trim()
  if (!raw) return ''
  if (raw.includes('T')) return raw.split('T')[0]
  return raw.slice(0, 10)
}

function normalizeShiftDate(value) {
  if (!value) return ''
  const raw = `${value}`.trim()
  if (!raw) return ''
  if (raw.includes('T')) return raw.split('T')[0]
  return raw.slice(0, 10)
}

function isTableUnavailableError(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  return message.includes('does not exist') || message.includes('relation') || message.includes('could not find the table')
}

function mapPublication(record) {
  if (!record) return null
  return {
    id: record.id,
    weekStartDate: normalizeWeekStartDate(record.week_start_date),
    status: `${record.status ?? 'draft'}`.toLowerCase() === 'published' ? 'published' : 'draft',
    publishedAt: record.published_at ?? null,
    unpublishedAt: record.unpublished_at ?? null,
    publishedBy: record.published_by ?? null,
    createdAt: record.created_at ?? null,
  }
}

export async function getSchedulePublication(weekStartDate) {
  const normalizedWeekStartDate = normalizeWeekStartDate(weekStartDate)
  if (!normalizedWeekStartDate) return null

  const { data, error } = await supabase
    .from(SCHEDULE_PUBLICATIONS_TABLE)
    .select(SCHEDULE_PUBLICATION_COLUMNS)
    .eq('week_start_date', normalizedWeekStartDate)
    .maybeSingle()

  if (error) {
    if (isTableUnavailableError(error)) {
      return null
    }
    throw new Error(error.message || 'Unable to load schedule publication status right now.')
  }

  return mapPublication(data)
}

export async function getWeekSchedulePublicationState(weekStartDate) {
  const publication = await getSchedulePublication(weekStartDate)
  let publishedShifts = []

  if (publication?.status === 'published') {
    try {
      publishedShifts = await getPublishedShifts(weekStartDate)
    } catch (error) {
      console.error('[schedulePublicationService] getPublishedShifts failed:', error)
      publishedShifts = []
    }
  }

  return {
    publication: publication ?? {
      weekStartDate: normalizeWeekStartDate(weekStartDate),
      status: 'draft',
      publishedAt: null,
      unpublishedAt: null,
      publishedBy: null,
    },
    publishedShifts,
  }
}

async function upsertSchedulePublicationRecord({ weekStartDate, status }) {
  const normalizedWeekStartDate = normalizeWeekStartDate(weekStartDate)
  if (!normalizedWeekStartDate) {
    throw new Error('Week start date is required.')
  }

  const normalizedStatus = `${status ?? 'draft'}`.toLowerCase() === 'published' ? 'published' : 'draft'
  const nowIso = new Date().toISOString()

  const payload = {
    week_start_date: normalizedWeekStartDate,
    status: normalizedStatus,
    published_at: normalizedStatus === 'published' ? nowIso : null,
    unpublished_at: normalizedStatus === 'draft' ? nowIso : null,
  }

  const { data, error } = await supabase
    .from(SCHEDULE_PUBLICATIONS_TABLE)
    .upsert(payload, { onConflict: 'week_start_date' })
    .select(SCHEDULE_PUBLICATION_COLUMNS)
    .single()

  if (error) {
    if (isTableUnavailableError(error)) {
      throw new Error('schedule_publications table is not ready yet.')
    }
    throw new Error(error.message || 'Unable to update schedule publication status right now.')
  }

  return mapPublication(data)
}

export async function publishWeekSchedule({ weekStartDate, weekDateKeys = [], draftShifts = [], knownTemplateIds = null }) {
  const normalizedWeekStartDate = normalizeWeekStartDate(weekStartDate)
  if (!normalizedWeekStartDate) {
    throw new Error('Week start date is required.')
  }

  const weekDateSet = new Set(
    (weekDateKeys ?? []).map((item) => normalizeShiftDate(item)).filter(Boolean),
  )

  const draftWeekShifts = (draftShifts ?? []).filter((shift) => {
    const shiftDate = normalizeShiftDate(shift.date ?? shift.shift_date)
    return weekDateSet.size === 0 ? shiftDate >= normalizedWeekStartDate : weekDateSet.has(shiftDate)
  })

  if (draftWeekShifts.length > 0) {
    assertShiftsReadyForPublish(draftWeekShifts, { knownTemplateIds })
  }

  const publication = await upsertSchedulePublicationRecord({
    weekStartDate: normalizedWeekStartDate,
    status: 'published',
  })

  if (!publication?.id) {
    throw new Error('Publication record could not be created.')
  }

  try {
    const publishedShifts = await replacePublishedShifts({
      publicationId: publication.id,
      weekStartDate: normalizedWeekStartDate,
      draftShifts: draftWeekShifts,
      knownTemplateIds,
    })

    return {
      publication,
      publishedShifts,
    }
  } catch (error) {
    try {
      await upsertSchedulePublicationRecord({
        weekStartDate: normalizedWeekStartDate,
        status: 'draft',
      })
    } catch (rollbackError) {
      console.error('[schedulePublicationService] publish rollback failed:', rollbackError)
    }
    throw error
  }
}

export async function unpublishWeekSchedule({ weekStartDate }) {
  const normalizedWeekStartDate = normalizeWeekStartDate(weekStartDate)
  if (!normalizedWeekStartDate) {
    throw new Error('Week start date is required.')
  }

  await deletePublishedShiftsForWeek(normalizedWeekStartDate)

  const publication = await upsertSchedulePublicationRecord({
    weekStartDate: normalizedWeekStartDate,
    status: 'draft',
  })

  return {
    publication,
    publishedShifts: [],
  }
}

/** @deprecated Use publishWeekSchedule or unpublishWeekSchedule */
export async function upsertSchedulePublication({ weekStartDate, status }) {
  if (`${status ?? ''}`.toLowerCase() === 'published') {
    const result = await publishWeekSchedule({ weekStartDate, draftShifts: [] })
    return result.publication
  }

  const result = await unpublishWeekSchedule({ weekStartDate })
  return result.publication
}
