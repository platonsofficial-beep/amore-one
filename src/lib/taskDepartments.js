export const TASK_DEPARTMENTS = [
  {
    key: 'service',
    label: 'Service',
    icon: '🍽️',
    description: 'Front-of-house service, hosts, and guest-facing operations.',
  },
  {
    key: 'bar',
    label: 'Bar',
    icon: '🍸',
    description: 'Bar prep, service, and beverage execution.',
  },
  {
    key: 'bar_manager',
    label: 'Bar Manager',
    icon: '🥃',
    description: 'Bar leadership, standards, and shift oversight.',
  },
  {
    key: 'fb',
    label: 'F&B',
    icon: '👨‍🍳',
    description: 'Food and beverage coordination across service and kitchen.',
  },
  {
    key: 'logistics',
    label: 'Logistics',
    icon: '📦',
    description: 'Deliveries, storage, prep flow, and back-of-house supply.',
  },
  {
    key: 'customers',
    label: 'Customers',
    icon: '🛎️',
    description: 'Guest follow-ups, VIP care, and customer-facing actions.',
  },
  {
    key: 'custom',
    label: 'Custom',
    icon: '✨',
    description: 'Create a department-specific board with a custom name.',
  },
]

const departmentByKey = new Map(TASK_DEPARTMENTS.map((department) => [department.key, department]))

export function isTaskDepartmentKey(value) {
  const key = `${value ?? ''}`.trim().toLowerCase()
  return departmentByKey.has(key)
}

export function getTaskDepartmentByKey(value) {
  const key = `${value ?? ''}`.trim().toLowerCase()
  return departmentByKey.get(key) ?? null
}

export function normalizeTaskDepartmentKey(value) {
  const key = `${value ?? ''}`.trim().toLowerCase()
  return isTaskDepartmentKey(key) ? key : null
}
