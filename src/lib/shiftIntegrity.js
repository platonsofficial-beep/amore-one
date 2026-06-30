const SHIFT_TEMPLATE_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function normalizeTimeValue(value) {
  if (!value) return ''
  const raw = `${value}`.trim()
  if (!raw) return ''
  if (raw.length >= 5 && raw.includes(':')) return raw.slice(0, 5)
  return raw
}

export function normalizeShiftTemplateId(value) {
  if (value === null || value === undefined) return null

  let raw = `${value}`.trim()
  if (!raw) return null

  if (raw.toLowerCase().startsWith('supabase-')) {
    raw = raw.slice('supabase-'.length)
  }

  if (!SHIFT_TEMPLATE_UUID_PATTERN.test(raw)) {
    return null
  }

  return raw
}

export function resolveShiftTemplateId(source) {
  if (source === null || source === undefined) return null

  if (typeof source === 'string' || typeof source === 'number') {
    return normalizeShiftTemplateId(source)
  }

  return normalizeShiftTemplateId(
    source.templateId
    ?? source.shiftTemplateId
    ?? source.shift_template_id
    ?? source.id,
  )
}

export function buildKnownShiftTemplateIdSet(shiftTemplates = []) {
  const ids = new Set()
  ;(shiftTemplates ?? []).forEach((template) => {
    const normalized = resolveShiftTemplateId(template)
    if (normalized) ids.add(normalized)
  })
  return ids
}

export function inferShiftTemplateId(shift, shiftTemplates = []) {
  const existing = resolveShiftTemplateId(shift)
  if (existing) return existing

  const startTime = normalizeTimeValue(shift?.startTime ?? shift?.start_time)
  const endTime = normalizeTimeValue(shift?.endTime ?? shift?.end_time)
  const area = `${shift?.area ?? ''}`.trim().toLowerCase()

  if (!startTime || !endTime) return null

  const matches = (shiftTemplates ?? []).filter((template) => {
    const templateId = resolveShiftTemplateId(template)
    if (!templateId) return false

    const templateStart = normalizeTimeValue(template.startTime ?? template.start_time)
    const templateEnd = normalizeTimeValue(template.endTime ?? template.end_time)
    const templateArea = `${template.defaultArea ?? template.default_area ?? ''}`.trim().toLowerCase()

    if (templateStart !== startTime || templateEnd !== endTime) return false
    if (area && templateArea && area !== templateArea) return false
    return true
  })

  if (matches.length !== 1) return null
  return resolveShiftTemplateId(matches[0])
}

export function validateShiftTemplateReference({
  shiftTemplateId,
  knownTemplateIds = null,
  requireTemplateId = false,
}) {
  const raw = shiftTemplateId === null || shiftTemplateId === undefined
    ? ''
    : `${shiftTemplateId}`.trim()

  const normalized = normalizeShiftTemplateId(shiftTemplateId)

  if (requireTemplateId && !normalized) {
    throw new Error('A valid shift template is required for this assignment.')
  }

  if (raw && !normalized) {
    throw new Error('Shift template reference is invalid or corrupted.')
  }

  if (normalized && knownTemplateIds instanceof Set && knownTemplateIds.size > 0 && !knownTemplateIds.has(normalized)) {
    throw new Error('Shift template reference does not match any active template.')
  }

  return normalized
}

export function prepareShiftForSave(shift, options = {}) {
  const {
    template = null,
    knownTemplateIds = null,
    requireTemplateId = false,
    shiftTemplatesForInference = [],
  } = options

  const resolvedTemplateId = resolveShiftTemplateId(template)
    ?? resolveShiftTemplateId(shift)
    ?? inferShiftTemplateId(shift, shiftTemplatesForInference)

  const shiftTemplateId = validateShiftTemplateReference({
    shiftTemplateId: resolvedTemplateId,
    knownTemplateIds,
    requireTemplateId,
  })

  return {
    ...shift,
    shiftTemplateId,
    shift_template_id: shiftTemplateId,
  }
}

export function assertShiftsReadyForPublish(draftShifts = [], options = {}) {
  const { knownTemplateIds = null } = options
  const invalidIndexes = []

  ;(draftShifts ?? []).forEach((shift, index) => {
    try {
      validateShiftTemplateReference({
        shiftTemplateId: shift.shiftTemplateId ?? shift.shift_template_id,
        knownTemplateIds,
        requireTemplateId: true,
      })
    } catch {
      invalidIndexes.push(index)
    }
  })

  if (invalidIndexes.length > 0) {
    throw new Error('Cannot publish: one or more shifts are missing a valid shift template reference.')
  }
}
