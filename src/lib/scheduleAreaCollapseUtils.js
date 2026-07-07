function normalizeAreaKey(area) {
  return `${area ?? ''}`.trim().toLowerCase() || 'general'
}

export function getScheduleTemplateAreaLabel(template) {
  return `${template?.defaultArea || template?.defaultRole || 'General'}`.trim() || 'General'
}

export function getScheduleTemplateAreaKey(template) {
  return normalizeAreaKey(getScheduleTemplateAreaLabel(template))
}

export function readCollapsedScheduleAreaKeys() {
  if (typeof window === 'undefined') return new Set()

  try {
    const raw = window.localStorage.getItem('one.schedule.areaCollapse.v1')
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.map((item) => normalizeAreaKey(item)).filter(Boolean))
  } catch {
    return new Set()
  }
}

export function writeCollapsedScheduleAreaKeys(collapsedKeys) {
  if (typeof window === 'undefined') return

  const values = [...(collapsedKeys instanceof Set ? collapsedKeys : [])]
  window.localStorage.setItem('one.schedule.areaCollapse.v1', JSON.stringify(values))
}

export function groupScheduleGridRowsByArea(rows = []) {
  const groups = []
  const groupIndexByArea = new Map()

  rows.forEach((row) => {
    const areaLabel = getScheduleTemplateAreaLabel(row.template)
    const areaKey = normalizeAreaKey(areaLabel)

    if (!groupIndexByArea.has(areaKey)) {
      groupIndexByArea.set(areaKey, groups.length)
      groups.push({
        areaKey,
        areaLabel,
        rows: [],
      })
    }

    groups[groupIndexByArea.get(areaKey)].rows.push(row)
  })

  return groups
}
