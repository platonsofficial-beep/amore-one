const STORAGE_KEY = 'amore-one.weekly-template-capacities'

function readSnapshotStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeSnapshotStore(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

function normalizeShiftDate(value) {
  if (!value) return ''
  const raw = `${value}`.trim()
  if (!raw) return ''
  if (raw.includes('T')) return raw.split('T')[0]
  return raw.slice(0, 10)
}

export function buildWeeklyTemplateCapacitySnapshot(weekDays = [], weekCapacities = []) {
  const dayKeyToIndex = new Map(
    (weekDays ?? []).map((day, index) => [normalizeShiftDate(day.key), index]),
  )

  return (weekCapacities ?? [])
    .map((capacity) => ({
      dayIndex: dayKeyToIndex.get(normalizeShiftDate(capacity.shiftDate)),
      shiftTemplateId: capacity.shiftTemplateId ?? null,
      requiredCount: capacity.requiredCount,
    }))
    .filter((item) => (
      Number.isInteger(item.dayIndex)
      && item.dayIndex >= 0
      && item.dayIndex < 7
      && item.shiftTemplateId
      && Number.isFinite(Number(item.requiredCount))
      && Number(item.requiredCount) >= 0
    ))
    .map((item) => ({
      dayIndex: item.dayIndex,
      shiftTemplateId: String(item.shiftTemplateId),
      requiredCount: Math.floor(Number(item.requiredCount)),
    }))
}

export function saveWeeklyTemplateCapacitySnapshot(templateId, snapshot = []) {
  const normalizedTemplateId = `${templateId ?? ''}`.trim()
  if (!normalizedTemplateId) return

  const store = readSnapshotStore()
  store[normalizedTemplateId] = Array.isArray(snapshot) ? snapshot : []
  writeSnapshotStore(store)
}

export function getWeeklyTemplateCapacitySnapshot(templateId) {
  const normalizedTemplateId = `${templateId ?? ''}`.trim()
  if (!normalizedTemplateId) return []

  const store = readSnapshotStore()
  const snapshot = store[normalizedTemplateId]
  return Array.isArray(snapshot) ? snapshot : []
}

export function deleteWeeklyTemplateCapacitySnapshot(templateId) {
  const normalizedTemplateId = `${templateId ?? ''}`.trim()
  if (!normalizedTemplateId) return

  const store = readSnapshotStore()
  if (!Object.prototype.hasOwnProperty.call(store, normalizedTemplateId)) return

  delete store[normalizedTemplateId]
  writeSnapshotStore(store)
}

export function mapWeeklyTemplateCapacitySnapshotToWeek(snapshot = [], weekDays = []) {
  return (snapshot ?? [])
    .map((item) => {
      const targetDate = normalizeShiftDate(weekDays?.[item.dayIndex]?.key)
      if (!targetDate || !item.shiftTemplateId) return null

      return {
        shiftTemplateId: item.shiftTemplateId,
        shiftDate: targetDate,
        requiredCount: Math.floor(Number(item.requiredCount)),
      }
    })
    .filter(Boolean)
}
