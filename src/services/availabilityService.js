import { supabase } from '../lib/supabaseClient'
import {
  EMPLOYEE_AVAILABILITY_DAYS,
  EMPLOYEE_AVAILABILITY_STATUS,
  createEmptyAvailabilityWeek,
  getAvailabilityForDay,
  normalizeAvailabilityWeek,
  setAvailabilityForDay,
} from '../lib/employeeAvailabilityUtils'

const EMPLOYEE_AVAILABILITY_TABLE = 'employee_availability'

const VALID_STATUS_KEYS = new Set(Object.keys(EMPLOYEE_AVAILABILITY_STATUS))

const AVAILABILITY_SELECT = `
  id,
  workspace_id,
  employee_id,
  week_start_date,
  day_of_week,
  status,
  start_time,
  end_time,
  note,
  created_at,
  updated_at
`

const AVAILABILITY_SETUP_HINT = 'Run supabase/employee_availability_schema.sql in the Supabase SQL editor, then try again.'

function normalizeWeekStartDate(value) {
  const raw = `${value ?? ''}`.trim()
  if (!raw) return ''
  if (raw.includes('T')) return raw.split('T')[0]
  return raw.slice(0, 10)
}

function normalizeIdentifier(value, label) {
  const raw = `${value ?? ''}`.trim()
  if (!raw) {
    throw new Error(`${label} is required.`)
  }
  return raw
}

function isTableUnavailableError(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  const code = `${error?.code ?? ''}`.toUpperCase()
  return (
    code === 'PGRST205'
    || code === '42P01'
    || message.includes('does not exist')
    || message.includes('relation')
    || message.includes('could not find the table')
  )
}

function buildAvailabilityUnavailableError() {
  return new Error(`employee_availability table is not ready yet. ${AVAILABILITY_SETUP_HINT}`)
}

function sortRowsByDay(rows = []) {
  const order = new Map(EMPLOYEE_AVAILABILITY_DAYS.map((day, index) => [day, index]))

  return [...rows].sort((left, right) => (
    (order.get(left.day_of_week) ?? 99) - (order.get(right.day_of_week) ?? 99)
  ))
}

function mapAvailabilityRecord(record) {
  if (!record) return null

  return {
    id: record.id,
    workspaceId: record.workspace_id ?? record.workspaceId ?? null,
    employeeId: record.employee_id ?? record.employeeId ?? null,
    weekStartDate: normalizeWeekStartDate(record.week_start_date ?? record.weekStartDate),
    dayOfWeek: `${record.day_of_week ?? record.dayOfWeek ?? ''}`.trim().toLowerCase(),
    status: `${record.status ?? EMPLOYEE_AVAILABILITY_STATUS.AVAILABLE.key}`.trim().toUpperCase(),
    startTime: record.start_time ?? record.startTime ?? null,
    endTime: record.end_time ?? record.endTime ?? null,
    note: record.note ?? null,
    createdAt: record.created_at ?? record.createdAt ?? null,
    updatedAt: record.updated_at ?? record.updatedAt ?? null,
  }
}

function mapAvailabilityRecordsToWeek(records = []) {
  const week = createEmptyAvailabilityWeek()
  const dayMap = new Map(
    (records ?? [])
      .map((record) => mapAvailabilityRecord(record))
      .filter(Boolean)
      .map((record) => [record.dayOfWeek, record]),
  )

  return {
    days: week.days.map((entry) => {
      const record = dayMap.get(entry.dayOfWeek)
      if (!record) return { ...entry }

      return {
        dayOfWeek: entry.dayOfWeek,
        status: VALID_STATUS_KEYS.has(record.status)
          ? record.status
          : EMPLOYEE_AVAILABILITY_STATUS.AVAILABLE.key,
        startTime: record.startTime || null,
        endTime: record.endTime || null,
        note: record.note || null,
      }
    }),
  }
}

function buildAvailabilitySaveRows({
  workspaceId,
  employeeId,
  weekStartDate,
  week,
}) {
  const normalizedWeek = normalizeAvailabilityWeek(week)

  return normalizedWeek.days.map((entry) => ({
    workspace_id: workspaceId,
    employee_id: employeeId,
    week_start_date: weekStartDate,
    day_of_week: entry.dayOfWeek,
    status: entry.status,
    start_time: entry.startTime,
    end_time: entry.endTime,
    note: entry.note,
  }))
}

export function normalizeBeforeSave({
  workspaceId,
  employeeId,
  weekStartDate,
  week,
}) {
  const normalizedWorkspaceId = normalizeIdentifier(workspaceId, 'Workspace')
  const normalizedEmployeeId = normalizeIdentifier(employeeId, 'Employee')
  const normalizedWeekStartDate = normalizeWeekStartDate(weekStartDate)

  if (!normalizedWeekStartDate) {
    throw new Error('Week start date is required.')
  }

  const normalizedWeek = normalizeAvailabilityWeek(week)

  if (normalizedWeek.days.length !== EMPLOYEE_AVAILABILITY_DAYS.length) {
    throw new Error('Availability week must contain exactly 7 days.')
  }

  const rows = buildAvailabilitySaveRows({
    workspaceId: normalizedWorkspaceId,
    employeeId: normalizedEmployeeId,
    weekStartDate: normalizedWeekStartDate,
    week: normalizedWeek,
  })

  if (rows.length !== EMPLOYEE_AVAILABILITY_DAYS.length) {
    throw new Error('Availability week must persist exactly 7 rows.')
  }

  rows.forEach((row) => {
    if (!VALID_STATUS_KEYS.has(row.status)) {
      throw new Error(`Invalid availability status "${row.status}".`)
    }
  })

  return {
    workspaceId: normalizedWorkspaceId,
    employeeId: normalizedEmployeeId,
    weekStartDate: normalizedWeekStartDate,
    week: normalizedWeek,
    rows,
  }
}

export async function getEmployeeAvailabilityWeek({
  workspaceId,
  employeeId,
  weekStartDate,
}) {
  const normalizedWorkspaceId = normalizeIdentifier(workspaceId, 'Workspace')
  const normalizedEmployeeId = normalizeIdentifier(employeeId, 'Employee')
  const normalizedWeekStartDate = normalizeWeekStartDate(weekStartDate)

  if (!normalizedWeekStartDate) {
    throw new Error('Week start date is required.')
  }

  const { data, error } = await supabase
    .from(EMPLOYEE_AVAILABILITY_TABLE)
    .select(AVAILABILITY_SELECT)
    .eq('workspace_id', normalizedWorkspaceId)
    .eq('employee_id', normalizedEmployeeId)
    .eq('week_start_date', normalizedWeekStartDate)

  if (error) {
    if (isTableUnavailableError(error)) {
      return createEmptyAvailabilityWeek()
    }
    throw new Error(error.message || 'Unable to load employee availability right now.')
  }

  return mapAvailabilityRecordsToWeek(sortRowsByDay(data ?? []))
}

export async function getWorkspaceScheduleAvailabilityByEmployee({
  workspaceId,
  weekStartDate,
  employeeIds = [],
}) {
  const normalizedWorkspaceId = normalizeIdentifier(workspaceId, 'Workspace')
  const normalizedWeekStartDate = normalizeWeekStartDate(weekStartDate)
  const normalizedEmployeeIds = [...new Set(
    (employeeIds ?? []).map((employeeId) => `${employeeId ?? ''}`.trim()).filter(Boolean),
  )]

  if (!normalizedWeekStartDate || normalizedEmployeeIds.length === 0) {
    return { byEmployeeId: {}, loadFailed: false }
  }

  const { data, error } = await supabase
    .from(EMPLOYEE_AVAILABILITY_TABLE)
    .select(AVAILABILITY_SELECT)
    .eq('workspace_id', normalizedWorkspaceId)
    .eq('week_start_date', normalizedWeekStartDate)
    .in('employee_id', normalizedEmployeeIds)

  if (error) {
    if (isTableUnavailableError(error)) {
      return { byEmployeeId: {}, loadFailed: true }
    }
    throw new Error('Unable to load employee availability right now.')
  }

  const rowsByEmployeeId = new Map()

  ;(data ?? []).forEach((record) => {
    const employeeId = `${record?.employee_id ?? record?.employeeId ?? ''}`.trim()
    if (!employeeId) return

    if (!rowsByEmployeeId.has(employeeId)) {
      rowsByEmployeeId.set(employeeId, [])
    }

    rowsByEmployeeId.get(employeeId).push(record)
  })

  const byEmployeeId = {}

  normalizedEmployeeIds.forEach((employeeId) => {
    const rows = rowsByEmployeeId.get(employeeId) ?? []
    const hasSubmitted = rows.length > 0

    byEmployeeId[employeeId] = {
      hasSubmitted,
      week: hasSubmitted ? mapAvailabilityRecordsToWeek(sortRowsByDay(rows)) : null,
    }
  })

  return { byEmployeeId, loadFailed: false }
}

export async function saveEmployeeAvailabilityWeek({
  workspaceId,
  employeeId,
  weekStartDate,
  week,
}) {
  const prepared = normalizeBeforeSave({
    workspaceId,
    employeeId,
    weekStartDate,
    week,
  })

  const { data, error } = await supabase
    .from(EMPLOYEE_AVAILABILITY_TABLE)
    .upsert(prepared.rows, {
      onConflict: 'workspace_id,employee_id,week_start_date,day_of_week',
    })
    .select(AVAILABILITY_SELECT)
    .eq('workspace_id', prepared.workspaceId)
    .eq('employee_id', prepared.employeeId)
    .eq('week_start_date', prepared.weekStartDate)

  if (error) {
    if (isTableUnavailableError(error)) {
      throw buildAvailabilityUnavailableError()
    }
    throw new Error(error.message || 'Unable to save employee availability right now.')
  }

  return mapAvailabilityRecordsToWeek(sortRowsByDay(data ?? []))
}

export async function upsertAvailabilityDay({
  workspaceId,
  employeeId,
  weekStartDate,
  day,
}) {
  const normalizedWorkspaceId = normalizeIdentifier(workspaceId, 'Workspace')
  const normalizedEmployeeId = normalizeIdentifier(employeeId, 'Employee')
  const normalizedWeekStartDate = normalizeWeekStartDate(weekStartDate)

  if (!normalizedWeekStartDate) {
    throw new Error('Week start date is required.')
  }

  const weekWithDay = setAvailabilityForDay(createEmptyAvailabilityWeek(), day?.dayOfWeek ?? day?.day, day)
  const entry = getAvailabilityForDay(weekWithDay, day?.dayOfWeek ?? day?.day)

  if (!entry) {
    throw new Error('Availability day is required.')
  }

  if (!VALID_STATUS_KEYS.has(entry.status)) {
    throw new Error(`Invalid availability status "${entry.status}".`)
  }

  const row = {
    workspace_id: normalizedWorkspaceId,
    employee_id: normalizedEmployeeId,
    week_start_date: normalizedWeekStartDate,
    day_of_week: entry.dayOfWeek,
    status: entry.status,
    start_time: entry.startTime,
    end_time: entry.endTime,
    note: entry.note,
  }

  const { data, error } = await supabase
    .from(EMPLOYEE_AVAILABILITY_TABLE)
    .upsert(row, {
      onConflict: 'workspace_id,employee_id,week_start_date,day_of_week',
    })
    .select(AVAILABILITY_SELECT)
    .single()

  if (error) {
    if (isTableUnavailableError(error)) {
      throw buildAvailabilityUnavailableError()
    }
    throw new Error(error.message || 'Unable to save availability day right now.')
  }

  return mapAvailabilityRecord(data)
}

export async function resolveEmployeeWorkspaceId(employeeId) {
  const normalizedEmployeeId = normalizeIdentifier(employeeId, 'Employee')

  const { data, error } = await supabase
    .from('employees')
    .select('workspace_id')
    .eq('id', normalizedEmployeeId)
    .maybeSingle()

  if (error) {
    if (isTableUnavailableError(error)) {
      throw buildAvailabilityUnavailableError()
    }
    throw new Error('Unable to load your workspace right now.')
  }

  const workspaceId = `${data?.workspace_id ?? ''}`.trim()
  if (!workspaceId) {
    throw new Error('Unable to find your workspace.')
  }

  return workspaceId
}

export async function deleteAvailabilityWeek({
  workspaceId,
  employeeId,
  weekStartDate,
}) {
  const normalizedWorkspaceId = normalizeIdentifier(workspaceId, 'Workspace')
  const normalizedEmployeeId = normalizeIdentifier(employeeId, 'Employee')
  const normalizedWeekStartDate = normalizeWeekStartDate(weekStartDate)

  if (!normalizedWeekStartDate) {
    throw new Error('Week start date is required.')
  }

  const { error } = await supabase
    .from(EMPLOYEE_AVAILABILITY_TABLE)
    .delete()
    .eq('workspace_id', normalizedWorkspaceId)
    .eq('employee_id', normalizedEmployeeId)
    .eq('week_start_date', normalizedWeekStartDate)

  if (error) {
    if (isTableUnavailableError(error)) {
      throw buildAvailabilityUnavailableError()
    }
    throw new Error(error.message || 'Unable to delete employee availability right now.')
  }
}
