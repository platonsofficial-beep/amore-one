import { inferChecklistCategory } from './operationsChecklistUtils'
import { normalizeOperationsTaskDate } from './operationsUtils'

function taskStatus(task) {
  return `${task?.status ?? ''}`.trim().toLowerCase()
}

export function isChecklistStepOpen(step) {
  const status = taskStatus(step)
  return status !== 'completed' && status !== 'skipped'
}

function checklistTemplateKey(templateId, dueDate) {
  const normalizedTemplateId = `${templateId ?? ''}`.trim()
  if (!normalizedTemplateId) return ''
  return `${normalizedTemplateId}:${normalizeOperationsTaskDate(dueDate) || 'undated'}`
}

export function isChecklistRunStorageUnavailable(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  const code = `${error?.code ?? ''}`
  return code === '42P01'
    || code === '42501'
    || code === 'PGRST200'
    || code === 'PGRST205'
    || code === 'PGRST301'
    || message.includes('does not exist')
    || message.includes('schema cache')
    || message.includes('permission denied')
    || message.includes('row-level security')
    || message.includes('could not find the table')
    || message.includes('could not find a relationship')
}

export function isChecklistRunShapeNotReady(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  const code = `${error?.code ?? ''}`
  return code === '23502'
    || code === '23514'
    || code === '42703'
    || code === 'PGRST204'
    || message.includes('source_task_id')
    || message.includes('operations_task_id')
    || message.includes('template_id')
    || message.includes('not-null')
    || message.includes('not null')
    || message.includes('check constraint')
}

export function checklistRunFallbackError(error) {
  return isChecklistRunStorageUnavailable(error) || isChecklistRunShapeNotReady(error)
}

function completedAtFromSteps(steps = []) {
  return (steps ?? [])
    .map((step) => `${step.completedAt ?? step.completed_at ?? ''}`.trim())
    .filter(Boolean)
    .sort()
    .at(-1) ?? null
}

function presentTemplateRun(run, sourceTasks = [], checklistTemplates = []) {
  const steps = run?.steps ?? []
  const openSteps = steps.filter((step) => isChecklistStepOpen(step))
  const completedSteps = steps.filter((step) => taskStatus(step) === 'completed')
  if (openSteps.length === 0 && completedSteps.length === 0) return null

  const templateId = `${run.templateId ?? ''}`.trim()
  const dueDate = normalizeOperationsTaskDate(run.dueDate)
  const template = (checklistTemplates ?? []).find((entry) => `${entry?.id ?? ''}` === templateId)
  const title = `${template?.name ?? run.title ?? ''}`.trim() || 'Checklist'
  const related = (sourceTasks ?? []).filter((task) => (
    `${task.checklistTemplateId ?? ''}` === templateId
    && normalizeOperationsTaskDate(task.dueDate) === dueDate
  ))
  const dueTimes = related
    .map((task) => `${task.dueTime ?? task.due_time ?? ''}`.trim())
    .filter(Boolean)
    .sort()

  return {
    id: `checklist-run:${templateId}:${dueDate || 'undated'}`,
    runId: run.id,
    title,
    description: '',
    status: openSteps.length > 0 ? 'pending' : 'completed',
    dueDate,
    dueTime: dueTimes[0] ?? null,
    category: related[0]?.category || inferChecklistCategory(title, template?.department),
    priority: related[0]?.priority || 'normal',
    assignedTo: null,
    taskSource: 'operations',
    checklistRun: true,
    checklistTemplateId: templateId,
    checklistSteps: steps,
    checklistStepCount: steps.length,
    checklistCompletedCount: completedSteps.length,
    completedAt: openSteps.length > 0 ? null : completedAtFromSteps(completedSteps),
  }
}

function attachSimpleTaskSteps(task, run) {
  const steps = run?.steps ?? []
  const openSteps = steps.filter((step) => isChecklistStepOpen(step))
  const completedSteps = steps.filter((step) => taskStatus(step) === 'completed')
  const derivedStatus = openSteps.length > 0 || completedSteps.length === 0
    ? 'pending'
    : 'completed'

  return {
    ...task,
    checklistRunId: run.id,
    checklistSteps: steps,
    checklistStepCount: steps.length,
    checklistCompletedCount: completedSteps.length,
    status: steps.length > 0 ? derivedStatus : task.status,
    completedAt: derivedStatus === 'completed'
      ? (completedAtFromSteps(completedSteps) ?? task.completedAt ?? null)
      : null,
  }
}

/**
 * Replace copied checklist rows with one run when the run tables are readable.
 * `runs === null` means the tables are not readable, so the current list stays.
 */
export function mergeChecklistRunsIntoTasks(operationsTasks = [], runs, checklistTemplates = []) {
  if (!Array.isArray(runs)) return operationsTasks ?? []

  const tasks = operationsTasks ?? []
  const templateRuns = []
  const stepsByTaskId = new Map()

  runs.forEach((run) => {
    const steps = run?.steps ?? []
    if (!steps.length) return
    const operationsTaskId = `${run.operationsTaskId ?? ''}`.trim()
    if (operationsTaskId) {
      stepsByTaskId.set(operationsTaskId, run)
      return
    }
    if (`${run.templateId ?? ''}`.trim()) templateRuns.push(run)
  })

  const sourceIds = new Set()
  const templateKeys = new Set()
  templateRuns.forEach((run) => {
    templateKeys.add(checklistTemplateKey(run.templateId, run.dueDate))
    ;(run.steps ?? []).forEach((step) => {
      const sourceTaskId = `${step.sourceTaskId ?? ''}`.trim()
      if (sourceTaskId) sourceIds.add(sourceTaskId)
    })
  })

  const hidden = []
  const visible = []
  tasks.forEach((task) => {
    if (sourceIds.has(`${task?.id ?? ''}`)) {
      hidden.push(task)
      return
    }
    const key = checklistTemplateKey(task?.checklistTemplateId, task?.dueDate)
    if (key && templateKeys.has(key)) {
      hidden.push(task)
      return
    }
    visible.push(task)
  })

  const withSteps = visible.map((task) => {
    const owned = stepsByTaskId.get(`${task?.id ?? ''}`)
    return owned ? attachSimpleTaskSteps(task, owned) : task
  })

  const synthetic = templateRuns
    .map((run) => presentTemplateRun(run, hidden, checklistTemplates))
    .filter(Boolean)

  return [...withSteps, ...synthetic]
}

export function planDailyChecklistStart({
  runs,
  legacyTasks = [],
  templateId,
  dueDate,
} = {}) {
  const normalizedTemplateId = `${templateId ?? ''}`.trim()
  const normalizedDueDate = normalizeOperationsTaskDate(dueDate)
  const legacy = (legacyTasks ?? []).filter((task) => (
    checklistTemplateKey(task?.checklistTemplateId, task?.dueDate)
    === checklistTemplateKey(normalizedTemplateId, normalizedDueDate)
  ))

  if (!Array.isArray(runs)) {
    return legacy.length > 0
      ? { action: 'legacy-exists', tasks: legacy }
      : { action: 'legacy-create' }
  }

  const run = runs.find((entry) => (
    `${entry?.templateId ?? ''}` === normalizedTemplateId
    && normalizeOperationsTaskDate(entry?.dueDate) === normalizedDueDate
  ))
  if ((run?.steps?.length ?? 0) > 0) {
    return { action: 'run-exists', run }
  }
  if (legacy.length > 0) {
    return { action: 'legacy-exists', tasks: legacy }
  }
  return { action: 'create-run', fillRunId: run?.id ?? null }
}

export function taskHasChecklistSteps(task) {
  return Boolean(task?.checklistRun) || (task?.checklistSteps?.length ?? 0) > 0
    || Number(task?.checklistStepCount ?? 0) > 0
}
