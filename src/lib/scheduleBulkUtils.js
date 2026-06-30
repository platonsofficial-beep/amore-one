export function buildShiftDedupeKey(prepared) {
  return [
    prepared.employee_id ?? 'none',
    prepared.date,
    prepared.shiftTemplateId ?? 'none',
    prepared.startTime,
    prepared.endTime,
    `${prepared.role ?? ''}`.trim().toLowerCase(),
    `${prepared.area ?? ''}`.trim().toLowerCase(),
  ].join('|')
}

export function buildCloneRawPayload(shift, targetDate) {
  return {
    employee_id: shift.employeeId ?? null,
    date: targetDate,
    startTime: shift.startTime,
    endTime: shift.endTime,
    role: shift.role ?? '',
    area: shift.area ?? '',
    status: shift.status ?? 'Scheduled',
    notes: shift.notes ?? '',
    shiftTemplateId: shift.shiftTemplateId ?? null,
  }
}

export function buildShiftCellKeyFromParts({ shiftTemplateId, date }) {
  const normalizedDate = `${date ?? ''}`.slice(0, 10)
  if (shiftTemplateId && normalizedDate) {
    return `${String(shiftTemplateId)}:${normalizedDate}`
  }
  return ''
}
