import {
  checklistRunFallbackError,
  isChecklistStepOpen,
  mergeChecklistRunsIntoTasks,
} from '../lib/checklistRunModel'
import { normalizeOperationsTaskDate } from '../lib/operationsUtils'
import { supabase } from '../lib/supabaseClient'
import {
  completeOperationsTask,
  getOperationsTasks,
  reopenOperationsTask,
} from './operationsTaskService'

const RUNS_TABLE = 'operations_checklist_runs'
const STEPS_TABLE = 'operations_checklist_run_steps'

function mapChecklistRunStep(record, run = {}) {
  const orderIndex = Number(record.order_index ?? record.orderIndex ?? 0)
  return {
    id: record.id,
    runStepId: record.id,
    runId: record.run_id ?? record.runId ?? run.id ?? null,
    sourceTaskId: record.source_task_id ?? record.sourceTaskId ?? null,
    checklistItemId: record.checklist_item_id ?? record.checklistItemId ?? null,
    title: record.title ?? '',
    description: record.description ?? '',
    orderIndex,
    checklistOrderIndex: orderIndex,
    status: record.status ?? 'pending',
    assignedTo: record.assigned_to ?? record.assignedTo ?? null,
    completionNote: record.completion_note ?? record.completionNote ?? '',
    completedAt: record.completed_at ?? record.completedAt ?? null,
    completedBy: record.completed_by ?? record.completedBy ?? null,
    checklistTemplateId: run.templateId ?? null,
    dueDate: run.dueDate ?? '',
  }
}

function mapChecklistRun(record) {
  const run = {
    id: record.id,
    workspaceId: record.workspace_id ?? record.workspaceId ?? '',
    templateId: record.template_id ?? record.templateId ?? null,
    operationsTaskId: record.operations_task_id ?? record.operationsTaskId ?? null,
    dueDate: normalizeOperationsTaskDate(record.due_date ?? record.dueDate),
    title: record.title ?? '',
    status: record.status ?? 'pending',
    steps: [],
  }
  run.steps = (record.steps ?? [])
    .map((step) => mapChecklistRunStep(step, run))
    .sort((left, right) => {
      if (left.orderIndex !== right.orderIndex) return left.orderIndex - right.orderIndex
      return `${left.title}`.localeCompare(`${right.title}`)
    })
  return run
}

export async function loadMergedOperationsTasks(workspaceId, checklistTemplates = []) {
  const tasks = await getOperationsTasks(workspaceId)
  try {
    const runs = await getChecklistRuns(workspaceId)
    return mergeChecklistRunsIntoTasks(tasks, runs, checklistTemplates)
  } catch (error) {
    console.error('[operationsChecklistRunService] loadMergedOperationsTasks error:', error)
    return tasks
  }
}

export async function getChecklistRuns(workspaceId) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  if (!normalizedWorkspaceId || !supabase) return null

  const { data, error } = await supabase
    .from(RUNS_TABLE)
    .select(`
      *,
      steps:operations_checklist_run_steps(*)
    `)
    .eq('workspace_id', normalizedWorkspaceId)
    .order('due_date', { ascending: true })

  if (error) {
    console.error('[operationsChecklistRunService] getChecklistRuns error:', error)
    if (checklistRunFallbackError(error)) return null
    throw error
  }

  return (data ?? []).map(mapChecklistRun)
}

async function setChecklistRunStatus(runId, status) {
  const normalizedRunId = `${runId ?? ''}`.trim()
  if (!normalizedRunId || !supabase) return
  const nextStatus = status === 'completed' ? 'completed' : 'pending'
  const { error } = await supabase
    .from(RUNS_TABLE)
    .update({
      status: nextStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', normalizedRunId)

  if (error) {
    console.error('[operationsChecklistRunService] setChecklistRunStatus error:', error)
  }
}

function stepWritePayload(step, { status, completedBy = null, completionNote = '' } = {}) {
  if (status === 'completed') {
    return {
      status: 'completed',
      completion_note: `${completionNote ?? step?.completionNote ?? ''}`.trim(),
      completed_at: new Date().toISOString(),
      completed_by: completedBy,
    }
  }
  return {
    status: 'pending',
    completion_note: '',
    completed_at: null,
    completed_by: null,
  }
}

async function writeSourceTask(workspaceId, sourceTaskId, payload) {
  const normalizedSourceTaskId = `${sourceTaskId ?? ''}`.trim()
  if (!normalizedSourceTaskId) return
  try {
    if (payload.status === 'completed') {
      await completeOperationsTask(workspaceId, normalizedSourceTaskId, {
        completedBy: payload.completedBy,
        completionNote: payload.completionNote,
      })
      return
    }
    await reopenOperationsTask(workspaceId, normalizedSourceTaskId)
  } catch (error) {
    console.error('[operationsChecklistRunService] source task sync error:', error)
  }
}

export async function setChecklistRunStepStatus(workspaceId, step, {
  status = 'completed',
  completedBy = null,
  completionNote = '',
} = {}) {
  const stepId = `${step?.runStepId ?? ''}`.trim()
  if (!stepId || !supabase) {
    throw new Error('Checklist step is required.')
  }

  const writingCompleted = status === 'completed'
  const { error } = await supabase
    .from(STEPS_TABLE)
    .update(stepWritePayload(step, { status: writingCompleted ? 'completed' : 'pending', completedBy, completionNote }))
    .eq('id', stepId)

  if (error) {
    console.error('[operationsChecklistRunService] setChecklistRunStepStatus error:', error)
    if (checklistRunFallbackError(error)) {
      throw new Error('Checklist steps are not ready yet.')
    }
    throw new Error(error.message || 'Unable to update checklist step right now.')
  }

  await writeSourceTask(workspaceId, step.sourceTaskId, {
    status: writingCompleted ? 'completed' : 'pending',
    completedBy,
    completionNote,
  })
}

async function syncRunOwner(workspaceId, runId, {
  completedBy = null,
  completionNote = '',
  reopenParent = false,
} = {}) {
  const runs = await getChecklistRuns(workspaceId)
  if (!runs) return
  const run = runs.find((entry) => `${entry.id}` === `${runId}`)
  if (!run) return
  const openSteps = (run.steps ?? []).filter((step) => isChecklistStepOpen(step))
  const completedSteps = (run.steps ?? []).filter((step) => `${step.status}`.toLowerCase() === 'completed')
  const nextStatus = openSteps.length === 0 && completedSteps.length > 0 ? 'completed' : 'pending'
  await setChecklistRunStatus(run.id, nextStatus)
  const operationsTaskId = `${run.operationsTaskId ?? ''}`.trim()
  if (!operationsTaskId) return
  try {
    if (nextStatus === 'completed') {
      await completeOperationsTask(workspaceId, operationsTaskId, { completedBy, completionNote })
      return
    }
    if (reopenParent) await reopenOperationsTask(workspaceId, operationsTaskId)
  } catch (error) {
    console.error('[operationsChecklistRunService] syncRunOwner error:', error)
  }
}

function stepInsertRow(runId, step, index, assignedTo = null) {
  return {
    run_id: runId,
    checklist_item_id: step.checklistItemId || step.id || null,
    title: `${step.title ?? ''}`.trim(),
    description: `${step.description ?? ''}`.trim(),
    order_index: step.orderIndex ?? index,
    status: 'pending',
    assigned_to: assignedTo || null,
  }
}

async function insertRunSteps(runId, steps, assignedTo) {
  const payload = (steps ?? [])
    .map((step, index) => stepInsertRow(runId, step, index, assignedTo))
    .filter((step) => step.title)
  if (!payload.length || !supabase) return
  const { error } = await supabase.from(STEPS_TABLE).insert(payload)
  if (error) throw error
}

async function deleteRun(runId) {
  const normalizedRunId = `${runId ?? ''}`.trim()
  if (!normalizedRunId || !supabase) return
  const { error } = await supabase.from(RUNS_TABLE).delete().eq('id', normalizedRunId)
  if (error) {
    console.error('[operationsChecklistRunService] deleteRun error:', error)
  }
}

export async function createTemplateChecklistRun({
  workspaceId,
  template,
  dueDate,
  fillRunId = null,
}) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  const normalizedDueDate = normalizeOperationsTaskDate(dueDate)
  if (!normalizedWorkspaceId || !template?.id || !normalizedDueDate || !supabase) {
    throw new Error('Workspace, template, and date are required.')
  }

  let runId = `${fillRunId ?? ''}`.trim() || null
  let createdRunId = null

  if (!runId) {
    const { data, error } = await supabase
      .from(RUNS_TABLE)
      .insert([{
        workspace_id: normalizedWorkspaceId,
        template_id: template.id,
        due_date: normalizedDueDate,
        title: `${template.name ?? ''}`.trim() || 'Checklist',
        status: 'pending',
      }])
      .select('*')
      .single()

    if (error) {
      if (`${error.code ?? ''}` === '23505') {
        const runs = await getChecklistRuns(normalizedWorkspaceId)
        const existing = (runs ?? []).find((run) => (
          `${run.templateId ?? ''}` === `${template.id}`
          && run.dueDate === normalizedDueDate
        ))
        if ((existing?.steps?.length ?? 0) > 0 || !existing?.id) {
          return { alreadyExists: true, run: existing ?? null }
        }
        runId = existing.id
      } else {
        throw error
      }
    } else {
      runId = data.id
      createdRunId = data.id
    }
  }

  if (!runId) {
    throw new Error('Unable to start checklist right now.')
  }

  try {
    await insertRunSteps(runId, template.items ?? [], null)
  } catch (error) {
    if (createdRunId || fillRunId) await deleteRun(runId)
    throw error
  }

  return { alreadyExists: false, runId }
}

async function replaceTaskRunSteps(run, task, steps) {
  const assignedTo = task.assignedTo || null
  const dueDate = normalizeOperationsTaskDate(task.dueDate)
  const { error: runError } = await supabase
    .from(RUNS_TABLE)
    .update({
      title: `${task.title ?? ''}`.trim() || 'Task',
      due_date: dueDate,
      updated_at: new Date().toISOString(),
    })
    .eq('id', run.id)

  if (runError) throw runError

  const keptIds = new Set(
    steps.map((step) => `${step.id ?? ''}`.trim()).filter(Boolean),
  )
  const removedIds = (run.steps ?? [])
    .map((step) => `${step.runStepId ?? ''}`)
    .filter((stepId) => stepId && !keptIds.has(stepId))

  if (removedIds.length) {
    const { error } = await supabase.from(STEPS_TABLE).delete().in('id', removedIds)
    if (error) throw error
  }

  for (const [index, step] of steps.entries()) {
    const stepId = `${step.id ?? ''}`.trim()
    if (!stepId) continue
    const { error } = await supabase
      .from(STEPS_TABLE)
      .update({
        title: step.title,
        order_index: index,
        assigned_to: assignedTo,
      })
      .eq('id', stepId)
    if (error) throw error
  }

  const created = steps
    .map((step, index) => ({ step, index }))
    .filter(({ step }) => !`${step.id ?? ''}`.trim())
    .map(({ step, index }) => stepInsertRow(run.id, step, index, assignedTo))

  if (created.length) {
    const { error } = await supabase.from(STEPS_TABLE).insert(created)
    if (error) throw error
  }
}

export async function saveOperationsTaskChecklistSteps(workspaceId, task, steps = []) {
  if (task?.checklistRun) return { saved: true }
  const normalizedSteps = (steps ?? [])
    .map((step) => ({
      id: `${step?.id ?? ''}`.trim() || null,
      title: `${step?.title ?? ''}`.trim(),
      description: `${step?.description ?? ''}`.trim(),
    }))
    .filter((step) => step.title)

  const runs = await getChecklistRuns(workspaceId)
  if (!Array.isArray(runs)) return { saved: normalizedSteps.length === 0 }

  const existing = runs.find((run) => `${run.operationsTaskId ?? ''}` === `${task?.id ?? ''}`)
  if (!normalizedSteps.length) {
    if (!existing) return { saved: true }
    await deleteRun(existing.id)
    const after = await getChecklistRuns(workspaceId)
    if (!Array.isArray(after)) return { saved: false }
    const stillThere = after.some((run) => `${run.id}` === `${existing.id}`)
    return { saved: !stillThere }
  }

  const dueDate = normalizeOperationsTaskDate(task?.dueDate)
  if (!dueDate) return { saved: false }

  try {
    if (!existing) {
      const { data, error } = await supabase
        .from(RUNS_TABLE)
        .insert([{
          workspace_id: workspaceId,
          template_id: null,
          operations_task_id: task.id,
          due_date: dueDate,
          title: `${task.title ?? ''}`.trim() || 'Task',
          status: 'pending',
        }])
        .select('*')
        .single()
      if (error) throw error
      try {
        await insertRunSteps(data.id, normalizedSteps, task.assignedTo || null)
      } catch (stepError) {
        await deleteRun(data.id)
        throw stepError
      }
      return { saved: true }
    }

    await replaceTaskRunSteps(existing, task, normalizedSteps)
    return { saved: true }
  } catch (error) {
    console.error('[operationsChecklistRunService] saveOperationsTaskChecklistSteps error:', error)
    if (checklistRunFallbackError(error)) return { saved: false }
    throw error
  }
}

export async function completeOperationalWorkItem(workspaceId, task, {
  completedBy = null,
  completionNote = '',
} = {}) {
  if (task?.runStepId) {
    await setChecklistRunStepStatus(workspaceId, task, {
      status: 'completed',
      completedBy,
      completionNote,
    })
    if (task.runId) {
      await syncRunOwner(workspaceId, task.runId, { completedBy, completionNote })
    }
    return
  }

  const steps = task?.checklistSteps ?? []
  const storedSteps = steps.filter((step) => step?.runStepId)
  if (task?.checklistRun || storedSteps.length > 0) {
    const targets = (task?.checklistRun ? steps : storedSteps).filter((step) => isChecklistStepOpen(step))
    for (const step of targets) {
      if (step.runStepId) {
        await setChecklistRunStepStatus(workspaceId, step, {
          status: 'completed',
          completedBy,
          completionNote,
        })
      } else {
        await completeOperationsTask(workspaceId, step.id, { completedBy, completionNote })
      }
    }
    const runId = task?.runId || task?.checklistRunId || targets.find((step) => step.runId)?.runId
    if (runId) {
      await syncRunOwner(workspaceId, runId, { completedBy, completionNote })
    } else if (!task?.checklistRun) {
      await completeOperationsTask(workspaceId, task.id, { completedBy, completionNote })
    }
    return
  }

  await completeOperationsTask(workspaceId, task.id, { completedBy, completionNote })
}

export async function reopenOperationalWorkItem(workspaceId, task) {
  if (task?.runStepId) {
    await setChecklistRunStepStatus(workspaceId, task, { status: 'pending' })
    if (task.runId) await syncRunOwner(workspaceId, task.runId, { reopenParent: true })
    return
  }

  const steps = task?.checklistSteps ?? []
  if (task?.checklistRun || steps.some((step) => step?.runStepId)) {
    for (const step of steps) {
      if (isChecklistStepOpen(step)) continue
      if (step.runStepId) {
        await setChecklistRunStepStatus(workspaceId, step, { status: 'pending' })
      } else if (step.id) {
        await reopenOperationsTask(workspaceId, step.id)
      }
    }
    const runId = task?.runId || task?.checklistRunId || steps.find((step) => step.runId)?.runId
    if (runId) await syncRunOwner(workspaceId, runId, { reopenParent: true })
    else if (!task?.checklistRun && task?.id) await reopenOperationsTask(workspaceId, task.id)
    return
  }

  await reopenOperationsTask(workspaceId, task.id)
}
