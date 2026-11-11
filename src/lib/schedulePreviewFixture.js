/** Preview-only week grid. Never used when auth is on, and only when the URL asks for it. */

export function shouldUseSchedulePreviewFixture(search = '') {
  if (import.meta.env.VITE_AUTH_DISABLED !== 'true') return false
  const query = typeof search === 'string' ? search : ''
  return new URLSearchParams(query).get('scheduleFixture') === '1'
}

export function buildSchedulePreviewEmployees() {
  return [
    {
      id: 'preview-ana',
      full_name: 'Ana Ribeiro',
      name: 'Ana Ribeiro',
      position: 'Service',
      positions: ['Service'],
      status: 'Active',
    },
  ]
}

export function buildSchedulePreviewTemplates() {
  return [
    {
      id: 'preview-morning',
      templateId: 'preview-morning',
      name: 'Morning',
      startTime: '08:30',
      endTime: '16:30',
      defaultRole: 'Service',
      defaultArea: 'Service',
      defaultRequiredCount: 1,
      notes: '',
      isBuiltIn: false,
      isActive: true,
      sortOrder: 0,
    },
    {
      id: 'preview-evening',
      templateId: 'preview-evening',
      name: 'Evening',
      startTime: '16:30',
      endTime: '00:30',
      defaultRole: 'Service',
      defaultArea: 'Service',
      defaultRequiredCount: 1,
      notes: '',
      isBuiltIn: false,
      isActive: true,
      sortOrder: 1,
    },
  ]
}
