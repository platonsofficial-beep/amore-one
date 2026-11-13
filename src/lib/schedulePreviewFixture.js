import { t } from '../i18n/i18n'
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
    previewEmployee({ id: 'preview-ana', name: t("Ana Ribeiro"), position: t("Line Cook"), department: 'Kitchen' }),
    previewEmployee({ id: 'preview-andreas', name: t("Andreas Georgiou"), position: t("Head Bartender"), department: 'Bar' }),
    previewEmployee({ id: 'preview-elena', name: t("Elena Christodoulou"), position: 'Bartender', department: 'Bar' }),
    previewEmployee({ id: 'preview-evie', name: t("Evie S."), position: t("Waiter / Server"), department: 'Service' }),
  ]
}

export function buildSchedulePreviewPositions() {
  return [
    { id: 'preview-pos-line-cook', name: t("Line Cook") },
    { id: 'preview-pos-head-bartender', name: t("Head Bartender") },
    { id: 'preview-pos-bartender', name: 'Bartender' },
    { id: 'preview-pos-waiter', name: t("Waiter / Server") },
    { id: 'preview-pos-gm', name: t("General Manager") },
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
      defaultArea: '',
      defaultRequiredCount: 1,
      notes: '',
      isBuiltIn: false,
      isActive: true,
      sortOrder: 1,
    },
  ]
}
