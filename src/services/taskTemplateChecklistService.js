import { supabase } from '../lib/supabaseClient'

const TEMPLATE_CHECKLIST_TABLE = 'task_template_checklist_items'

function isTableUnavailableError(error) {
  const message = error?.message?.toLowerCase() ?? ''
  return message.includes('does not exist') || message.includes('relation') || message.includes('could not find the table')
}

function mapTemplateChecklistItem(record) {
  return {
    id: record.id,
    templateId: record.template_id ?? record.templateId,
    title: record.title ?? '',
    sortOrder: record.sort_order ?? record.sortOrder ?? 0,
    createdAt: record.created_at ?? record.createdAt ?? null,
  }
}

function groupTemplateChecklistItemsByTemplateId(items = []) {
  const grouped = {}

  items.forEach((item) => {
    const key = String(item.templateId)
    if (!grouped[key]) {
      grouped[key] = []
    }
    grouped[key].push(item)
  })

  Object.values(grouped).forEach((templateItems) => {
    templateItems.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
      return a.id - b.id
    })
  })

  return grouped
}

function handleServiceError(error, actionLabel) {
  console.error(`[taskTemplateChecklistService] ${actionLabel} error:`, error)

  if (isTableUnavailableError(error)) {
    throw new Error('Task template checklists table is not ready yet.')
  }

  throw new Error(error.message || `Unable to ${actionLabel} right now.`)
}

export async function getTemplateChecklistItems(templateIds = []) {
  const normalizedIds = [...new Set((templateIds ?? []).filter(Boolean))]
  if (normalizedIds.length === 0) {
    return {}
  }

  const { data, error } = await supabase
    .from(TEMPLATE_CHECKLIST_TABLE)
    .select('*')
    .in('template_id', normalizedIds)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true })

  if (error) {
    handleServiceError(error, 'load template checklists')
  }

  return groupTemplateChecklistItemsByTemplateId((data ?? []).map(mapTemplateChecklistItem))
}

export async function replaceTemplateChecklist(templateId, items = []) {
  const { error: deleteError } = await supabase
    .from(TEMPLATE_CHECKLIST_TABLE)
    .delete()
    .eq('template_id', templateId)

  if (deleteError) {
    handleServiceError(deleteError, 'replace template checklist')
  }

  const payload = (items ?? [])
    .map((item, index) => {
      const title = `${item?.title ?? ''}`.trim()
      if (!title) return null

      return {
        template_id: templateId,
        title,
        sort_order: item?.sortOrder ?? index,
      }
    })
    .filter(Boolean)

  if (payload.length === 0) {
    return []
  }

  const { data, error } = await supabase
    .from(TEMPLATE_CHECKLIST_TABLE)
    .insert(payload)
    .select('*')

  if (error) {
    handleServiceError(error, 'replace template checklist')
  }

  return (data ?? []).map(mapTemplateChecklistItem)
}
