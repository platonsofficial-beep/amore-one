import {
  loadLocalDraftFloorPlanLayout,
  loadLocalFloorPlanLayout,
  normalizeBuilderLayoutPayload,
  saveLocalDraftFloorPlanLayout,
  saveLocalFloorPlanLayout,
} from '../floor-plan-builder/lib/floorPlanStorage'
import { supabase } from '../lib/supabaseClient'

let activeBuilderLayoutCache = null
let activePublishedLayoutCache = null

export function setActiveBuilderLayoutCache(layout) {
  activeBuilderLayoutCache = layout ? normalizeBuilderLayoutPayload(layout) : null
}

export function getActiveBuilderLayoutCache() {
  return activeBuilderLayoutCache
}

export function setActivePublishedLayoutCache(layout) {
  activePublishedLayoutCache = layout ? normalizeBuilderLayoutPayload(layout) : null
}

export function getActivePublishedLayoutCache() {
  return activePublishedLayoutCache
}

function isTableUnavailableError(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  const code = `${error?.code ?? ''}`.trim()

  if (code === '42P01') return true
  if (message.includes('could not find the table') && message.includes('floor_plans')) return true
  if (message.includes('schema cache') && message.includes('floor_plans')) return true
  return false
}

function isFloorPlanPermissionError(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  const code = `${error?.code ?? ''}`.trim()

  return code === '42501'
    || message.includes('row-level security')
    || message.includes('permission denied')
    || message.includes('not authorized')
}

function mapLayoutFromRecord(record, field = 'layout_json') {
  const raw = record?.[field]
  if (!raw) return null
  return normalizeBuilderLayoutPayload(raw)
}

function buildLayoutPayload(layoutPayload = {}, { published = false } = {}) {
  const normalized = normalizeBuilderLayoutPayload(layoutPayload)
  if (normalized) {
    return {
      ...normalized,
      publishedAt: published
        ? new Date().toISOString()
        : normalized.publishedAt ?? null,
    }
  }

  return {
    version: 1,
    floors: JSON.parse(JSON.stringify(layoutPayload.floors ?? [])),
    activeFloorId: layoutPayload.activeFloorId ?? layoutPayload.floors?.[0]?.id ?? null,
    objects: JSON.parse(JSON.stringify(layoutPayload.objects ?? [])),
    publishedAt: published ? new Date().toISOString() : null,
  }
}

async function fetchActiveFloorPlanRecord(workspaceId) {
  return supabase
    .from('floor_plans')
    .select('id, workspace_id, name, layout_json, draft_layout_json, published_at, is_active, updated_at')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .maybeSingle()
}

export async function loadFloorPlanWorkspace(workspaceId = '') {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()

  if (!normalizedWorkspaceId) {
    const publishedLayout = loadLocalFloorPlanLayout('')
    const draftLayout = loadLocalDraftFloorPlanLayout('') ?? publishedLayout
    return {
      publishedLayout,
      draftLayout,
      publishedAt: publishedLayout?.publishedAt ?? null,
      source: publishedLayout ? 'local' : null,
      error: null,
    }
  }

  const localPublishedFallback = () => loadLocalFloorPlanLayout(normalizedWorkspaceId)
  const localDraftFallback = () => loadLocalDraftFloorPlanLayout(normalizedWorkspaceId)

  try {
    const { data, error } = await fetchActiveFloorPlanRecord(normalizedWorkspaceId)

    if (error) {
      if (isTableUnavailableError(error)) {
        const publishedLayout = localPublishedFallback()
        const draftLayout = localDraftFallback() ?? publishedLayout
        return {
          publishedLayout,
          draftLayout,
          publishedAt: publishedLayout?.publishedAt ?? null,
          source: publishedLayout ? 'local' : null,
          error: null,
        }
      }

      const publishedLayout = localPublishedFallback()
      const draftLayout = localDraftFallback() ?? publishedLayout
      return {
        publishedLayout,
        draftLayout,
        publishedAt: publishedLayout?.publishedAt ?? null,
        source: publishedLayout ? 'local' : null,
        error: error.message || 'Unable to load floor plan from Supabase.',
      }
    }

    const publishedLayout = mapLayoutFromRecord(data, 'layout_json')
    const draftLayout = mapLayoutFromRecord(data, 'draft_layout_json') ?? publishedLayout

    if (publishedLayout) {
      setActivePublishedLayoutCache(publishedLayout)
      saveLocalFloorPlanLayout(publishedLayout, normalizedWorkspaceId)
    }

    if (draftLayout) {
      setActiveBuilderLayoutCache(draftLayout)
      saveLocalDraftFloorPlanLayout(draftLayout, normalizedWorkspaceId)
    }

    return {
      publishedLayout,
      draftLayout,
      publishedAt: data?.published_at ?? publishedLayout?.publishedAt ?? null,
      source: publishedLayout || draftLayout ? 'supabase' : null,
      error: null,
      recordId: data?.id ?? null,
    }
  } catch (error) {
    const publishedLayout = localPublishedFallback()
    const draftLayout = localDraftFallback() ?? publishedLayout
    return {
      publishedLayout,
      draftLayout,
      publishedAt: publishedLayout?.publishedAt ?? null,
      source: publishedLayout ? 'local' : null,
      error: error?.message || 'Unable to load floor plan right now.',
    }
  }
}

export async function loadPublishedFloorPlan(workspaceId = '') {
  const result = await loadFloorPlanWorkspace(workspaceId)
  return {
    layout: result.publishedLayout,
    draftLayout: result.draftLayout,
    publishedAt: result.publishedAt,
    source: result.source,
    error: result.error,
    recordId: result.recordId,
  }
}

async function upsertFloorPlanRecord(workspaceId, fields, authUserId) {
  const { data: existing, error: existingError } = await supabase
    .from('floor_plans')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .maybeSingle()

  if (existingError && isTableUnavailableError(existingError)) {
    throw new Error('Floor plans table is not ready yet.')
  }

  if (existingError) {
    if (isFloorPlanPermissionError(existingError)) {
      throw new Error('You do not have permission to save floor plans for this workspace.')
    }
    throw new Error(existingError.message || 'Unable to save floor plan right now.')
  }

  const record = {
    workspace_id: workspaceId,
    name: 'Main Floor Plan',
    is_active: true,
    updated_by: authUserId,
    ...fields,
  }

  if (!existing?.id && !record.layout_json) {
    record.layout_json = {
      version: 1,
      floors: [],
      objects: [],
      activeFloorId: null,
      publishedAt: null,
    }
  }

  const mutation = existing?.id
    ? supabase
      .from('floor_plans')
      .update(record)
      .eq('id', existing.id)
      .select('id, layout_json, draft_layout_json, published_at, updated_at')
      .single()
    : supabase
      .from('floor_plans')
      .insert({
        ...record,
        created_by: authUserId,
      })
      .select('id, layout_json, draft_layout_json, published_at, updated_at')
      .single()

  const { data, error } = await mutation
  if (error) {
    if (isFloorPlanPermissionError(error)) {
      throw new Error('You do not have permission to save floor plans for this workspace.')
    }
    if (isTableUnavailableError(error)) {
      throw new Error('Floor plans table is not ready yet.')
    }
    throw new Error(error.message || 'Unable to save floor plan right now.')
  }

  return data
}

export async function saveDraftFloorPlan(workspaceId = '', layoutPayload = {}) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  if (!normalizedWorkspaceId) {
    throw new Error('Workspace is required to save the floor plan draft.')
  }

  const draftJson = buildLayoutPayload(layoutPayload, { published: false })
  const { data: authData } = await supabase.auth.getUser()
  const authUserId = authData?.user?.id ?? null

  try {
    const data = await upsertFloorPlanRecord(
      normalizedWorkspaceId,
      { draft_layout_json: draftJson },
      authUserId,
    )

    const savedDraft = mapLayoutFromRecord(data, 'draft_layout_json') ?? draftJson
    saveLocalDraftFloorPlanLayout(savedDraft, normalizedWorkspaceId)
    setActiveBuilderLayoutCache(savedDraft)
    return savedDraft
  } catch (error) {
    if (isTableUnavailableError(error)) {
      const localLayout = saveLocalDraftFloorPlanLayout(draftJson, normalizedWorkspaceId)
      setActiveBuilderLayoutCache(localLayout)
      throw new Error('Floor plans table is not ready yet. Draft saved locally only.')
    }
    throw error
  }
}

export async function savePublishedFloorPlan(workspaceId = '', layoutPayload = {}) {
  return publishFloorPlan(workspaceId, layoutPayload)
}

export async function publishFloorPlan(workspaceId = '', layoutPayload = {}) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  if (!normalizedWorkspaceId) {
    throw new Error('Workspace is required to publish the floor plan.')
  }

  const layoutJson = buildLayoutPayload(layoutPayload, { published: true })
  const { data: authData } = await supabase.auth.getUser()
  const authUserId = authData?.user?.id ?? null
  const publishedAt = new Date().toISOString()

  try {
    const data = await upsertFloorPlanRecord(
      normalizedWorkspaceId,
      {
        layout_json: layoutJson,
        draft_layout_json: layoutJson,
        published_at: publishedAt,
      },
      authUserId,
    )

    const savedLayout = mapLayoutFromRecord(data, 'layout_json') ?? layoutJson
    saveLocalFloorPlanLayout(savedLayout, normalizedWorkspaceId)
    saveLocalDraftFloorPlanLayout(savedLayout, normalizedWorkspaceId)
    setActivePublishedLayoutCache(savedLayout)
    setActiveBuilderLayoutCache(savedLayout)
    return savedLayout
  } catch (error) {
    if (isTableUnavailableError(error)) {
      const localLayout = saveLocalFloorPlanLayout(layoutJson, normalizedWorkspaceId)
      saveLocalDraftFloorPlanLayout(layoutJson, normalizedWorkspaceId)
      setActivePublishedLayoutCache(localLayout)
      setActiveBuilderLayoutCache(localLayout)
      throw new Error('Floor plans table is not ready yet. Layout saved locally only.')
    }
    throw error
  }
}

export async function migrateLocalFloorPlanToSupabase(workspaceId = '') {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  if (!normalizedWorkspaceId) return null

  const localLayout = loadLocalFloorPlanLayout(normalizedWorkspaceId)
  if (!localLayout) return null

  return publishFloorPlan(normalizedWorkspaceId, localLayout)
}
