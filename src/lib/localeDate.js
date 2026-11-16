/** ISO yyyy-mm-dd to the Greek field text dd/mm/yyyy. */
export function isoToDayMonthYear(iso) {
  const match = `${iso ?? ''}`.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return ''
  return `${match[3]}/${match[2]}/${match[1]}`
}

/** dd/mm/yyyy to ISO yyyy-mm-dd. Incomplete or impossible dates return ''. */
export function dayMonthYearToIso(text) {
  const match = `${text ?? ''}`.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return ''
  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return ''
  return `${match[3]}-${match[2]}-${match[1]}`
}
