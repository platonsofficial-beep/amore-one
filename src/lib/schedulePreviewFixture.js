/** Preview-only week grid. Never used when auth is on, and only when the URL asks for it. */

export function shouldUseSchedulePreviewFixture(search = '') {
  if (import.meta.env.VITE_AUTH_DISABLED !== 'true') return false
  const query = typeof search === 'string' ? search : ''
  return new URLSearchParams(query).get('scheduleFixture') === '1'
}

function previewEmployee({ id, name, position, department }) {
  return {
    id,
    full_name: name,
    name,
    position,
    positions: [{ name: position }],
    primaryPosition: position,
    department,
    status: 'Active',
  }
}

export function buildSchedulePreviewEmployees() {
  return [
    previewEmployee({ id: 'preview-ana', name: 'Ana Ribeiro', position: 'Line Cook', department: 'Kitchen' }),
    previewEmployee({ id: 'preview-andreas', name: 'Andreas Georgiou', position: 'Head Bartender', department: 'Bar' }),
    previewEmployee({ id: 'preview-elena', name: 'Elena Christodoulou', position: 'Bartender', department: 'Bar' }),
    previewEmployee({ id: 'preview-evie', name: 'Evie S.', position: 'Waiter / Server', department: 'Service' }),
  ]
}

export function buildSchedulePreviewPositions() {
  return [
    { id: 'preview-pos-line-cook', name: 'Line Cook' },
    { id: 'preview-pos-head-bartender', name: 'Head Bartender' },
    { id: 'preview-pos-bartender', name: 'Bartender' },
    { id: 'preview-pos-waiter', name: 'Waiter / Server' },
    { id: 'preview-pos-gm', name: 'General Manager' },
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
