export const TODAY_ATTENTION_GROUP_ORDER = [
  'needs-action',
  'reservation-service',
  'schedule',
  'operations',
]

export const TODAY_ATTENTION_GROUP_META = {
  'needs-action': {
    id: 'needs-action',
    icon: '🔴',
    title: 'Needs Action',
    accent: 'critical',
  },
  'reservation-service': {
    id: 'reservation-service',
    icon: '🟠',
    title: 'Reservation Service',
    accent: 'warning',
  },
  schedule: {
    id: 'schedule',
    icon: '🟡',
    title: 'Schedule',
    accent: 'warning',
  },
  operations: {
    id: 'operations',
    icon: '🔵',
    title: 'Operations',
    accent: 'info',
  },
}

export function resolveTodayAttentionGroupId(item) {
  const category = `${item?.category ?? ''}`.trim().toLowerCase()
  const key = `${item?.key ?? ''}`

  if (category === 'reservation' || key.startsWith('reservation:')) {
    return 'reservation-service'
  }

  if (category === 'schedule' || key === 'schedule-issues') {
    return 'schedule'
  }

  if (
    category === 'stock'
    || category === 'announcement'
    || key.startsWith('stock:')
    || key.startsWith('stock-module:')
    || key.startsWith('orders:')
  ) {
    return 'needs-action'
  }

  if (category === 'task' || key.startsWith('task:') || key.startsWith('task-due:')) {
    if (key.startsWith('task:') && `${item?.priority ?? ''}` === 'urgent') {
      return 'needs-action'
    }
    return 'operations'
  }

  return 'needs-action'
}

export function groupTodayAttentionItems(items = []) {
  const buckets = Object.fromEntries(
    TODAY_ATTENTION_GROUP_ORDER.map((groupId) => [groupId, []]),
  )

  ;(items ?? []).forEach((item) => {
    const groupId = resolveTodayAttentionGroupId(item)
    buckets[groupId].push(item)
  })

  return TODAY_ATTENTION_GROUP_ORDER
    .map((groupId) => ({
      ...TODAY_ATTENTION_GROUP_META[groupId],
      items: buckets[groupId],
    }))
    .filter((group) => group.items.length > 0)
}

export function getTodayAttentionRowBadge(item) {
  if (`${item?.priority ?? ''}` === 'urgent') return 'Urgent'
  if (`${item?.tone ?? ''}` === 'critical') return 'Critical'
  return ''
}
