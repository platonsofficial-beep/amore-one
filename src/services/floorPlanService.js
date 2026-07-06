import {
  loadLocalFloorPlanLayout,
  normalizeBuilderLayoutPayload,
  saveLocalFloorPlanLayout,
} from '../floor-plan-builder/lib/floorPlanStorage'
import { supabase } from '../lib/supabaseClient'

let activeBuilderLayoutCache = null

export function setActiveBuilderLayoutCache(layout) {
  activeBuilderLayoutCache = layout ? normalizeBuilderLayoutPayload(layout) : null
}

export function getActiveBuilderLayoutCache() {
  return activeBuilderLayoutCache
}

function isTableUnavailableError(error) {
  const message = error?.message?.toLowerCase() ?? ''
  const code = `${error?.code ?? ''}`.trim()
  return code === '42P01'
    || message.includes('does not exist')
    || message.includes('relation')
    || message.includes('could not find the table')
}

function mapLayoutFromRecord(record) {
  if (!record?.layout_json) return null
  return normalizeBuilderLayoutPayload(record.layout_json)
}

function buildLayoutPayload(layoutPayload = {}) {
  const normalized = normalizeBuilderLayoutPayload(layoutPayload)
  if (normalized) return normalized

  return {
    version: 1,
    floors: JSON.parse(JSON.stringify(layoutPayload.floors ?? [])),
    activeFloorId: layoutPayload.activeFloorId ?? layoutPayload.floors?.[0]?.id ?? null,
    objects: JSON.parse(JSON.stringify(layoutPayload.objects ?? [])),
    publishedAt: layoutPayload.publishedAt ?? new Date().toISOString(),
  }
}

export async function loadPublishedFloorPlan(workspaceId = '') {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()

  if (!normalizedWorkspaceId) {
    const localLayout = loadLocalFloorPlanLayout('')
    return {
      layout: localLayout,
      source: localLayout ? 'local' : null,
      error: null,
    }
  }

  const localFallback = () => loadLocalFloorPlanLayout(normalizedWorkspaceId)

  try {
    const { data, error } = await supabase
      .from('floor_plans')
      .select('id, workspace_id, name, layout_json, is_active, updated_at')
      .eq('workspace_id', normalizedWorkspaceId)
      .eq('is_active', true)
      .maybeSingle()

    if (error) {
      if (isTableUnavailableError(error)) {
        const localLayout = localFallback()
        return {
          layout: localLayout,
          source: localLayout ? 'local' : null,
          error: null,
        }
      }

      const localLayout = localFallback()
      return {
        layout: localLayout,
        source: localLayout ? 'local' : null,
        error: error.message || 'Unable to load floor plan from Supabase.',
      }
    }

    const remoteLayout = mapLayoutFromRecord(data)
    if (remoteLayout) {
      setActiveBuilderLayoutCache(remoteLayout)
      return {
        layout: remoteLayout,
        source: 'supabase',
        error: null,
        recordId: data.id,
      }
    }

    const localLayout = localFallback()
    return {
      layout: localLayout,
      source: localLayout ? 'local' : null,
      error: null,
    }
  } catch (error) {
    const localLayout = localFallback()
    return {
      layout: localLayout,
      source: localLayout ? 'local' : null,
      error: error?.message || 'Unable to load floor plan right now.',
    }
  }
}

export async function savePublishedFloorPlan(workspaceId = '', layoutPayload = {}) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  if (!normalizedWorkspaceId) {
    throw new Error('Workspace is required to save the floor plan.')
  }

  const layoutJson = buildLayoutPayload(layoutPayload)
  const { data: authData } = await supabase.auth.getUser()
  const authUserId = authData?.user?.id ?? null

  const { data: existing, error: existingError } = await supabase
    .from('floor_plans')
    .select('id')
    .eq('workspace_id', normalizedWorkspaceId)
    .eq('is_active', true)
    .maybeSingle()

  if (existingError && !isTableUnavailableError(existingError)) {
    throw new Error(existingError.message || 'Unable to save floor plan right now.')
  }

  if (existingError && isTableUnavailableError(existingError)) {
    const localLayout = saveLocalFloorPlanLayout(layoutJson, normalizedWorkspaceId)
    setActiveBuilderLayoutCache(localLayout)
    throw new Error('Floor plans table is not ready yet. Layout saved locally only.')
  }

  const record = {
    workspace_id: normalizedWorkspaceId,
    name: 'Main Floor Plan',
    layout_json: layoutJson,
    is_active: true,
    updated_by: authUserId,
  }

  const mutation = existing?.id
    ? supabase
      .from('floor_plans')
      .update(record)
      .eq('id', existing.id)
      .select('id, layout_json, updated_at')
      .single()
    : supabase
      .from('floor_plans')
      .insert({
        ...record,
        created_by: authUserId,
      })
      .select('id, layout_json, updated_at')
      .single()

  const { data, error } = await mutation

  if (error) {
    if (isTableUnavailableError(error)) {
      const localLayout = saveLocalFloorPlanLayout(layoutJson, normalizedWorkspaceId)
      setActiveBuilderLayoutCache(localLayout)
      throw new Error('Floor plans table is not ready yet. Layout saved locally only.')
    }

    throw new Error(error.message || 'Unable to save floor plan right now.')
  }

  const savedLayout = mapLayoutFromRecord(data) ?? layoutJson
  saveLocalFloorPlanLayout(savedLayout, normalizedWorkspaceId)
  setActiveBuilderLayoutCache(savedLayout)
  return savedLayout
}

export async function migrateLocalFloorPlanToSupabase(workspaceId = '') {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  if (!normalizedWorkspaceId) return null

  const localLayout = loadLocalFloorPlanLayout(normalizedWorkspaceId)
  if (!localLayout) return null

  return savePublishedFloorPlan(normalizedWorkspaceId, localLayout)
}
