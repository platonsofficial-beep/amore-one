/**
 * Probe pattern shared with suppliers: tolerate a missing workspace_id column
 * until the owner runs the SQL, then filter and write that column.
 */

export const NIL_WORKSPACE_ID = '00000000-0000-0000-0000-000000000000'

export function isMissingWorkspaceIdColumnError(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  const code = `${error?.code ?? ''}`
  if (!message.includes('workspace_id')) return false
  return code === '42703'
    || message.includes('schema cache')
    || message.includes('column')
    || message.includes('does not exist')
    || message.includes('could not find')
}

/**
 * A missing workspace_id column also says "does not exist". That is not a missing table.
 *
 * @param {unknown} error
 */
export function isTableMissingError(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  if (message.includes('workspace_id')) return false
  return message.includes('does not exist')
    || message.includes('relation')
    || message.includes('could not find the table')
}

export function payloadWithoutWorkspaceId(payload) {
  if (!payload || !Object.prototype.hasOwnProperty.call(payload, 'workspace_id')) return payload
  const { workspace_id: _workspaceId, ...rest } = payload
  return rest
}

export function readWorkspaceId(record) {
  return `${record?.workspaceId ?? record?.workspace_id ?? ''}`.trim()
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} table
 */
export function createWorkspaceColumnProbe(supabase, table) {
  /** @type {'unknown' | 'present' | 'missing'} */
  let status = 'unknown'
  /** @type {Promise<'present' | 'missing'> | null} */
  let inflight = null

  async function detect() {
    const { error } = await supabase
      .from(table)
      .select('id')
      .eq('workspace_id', NIL_WORKSPACE_ID)
      .limit(1)

    if (!error) {
      status = 'present'
      return 'present'
    }

    if (isMissingWorkspaceIdColumnError(error)) {
      status = 'missing'
      return 'missing'
    }

    throw error
  }

  return {
    reset() {
      status = 'unknown'
      inflight = null
    },
    rememberMissing() {
      status = 'missing'
    },
    async ensure() {
      if (status !== 'unknown') return status
      if (!inflight) {
        inflight = detect().finally(() => {
          inflight = null
        })
      }
      return inflight
    },
  }
}
