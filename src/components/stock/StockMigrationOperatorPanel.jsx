/**
 * Migration Operator panel — explicit one-action → one-RPC command wiring.
 * No orchestration, no automatic stage progression, no auto-acknowledge.
 */
import { useState } from 'react'
import {
  acknowledgeInventoryMigrationStageAttention,
  cancelInventoryMigrationSession,
  completeInventoryMigrationFoundationStep,
  completeInventoryMigrationSession,
  runInventoryMigrationAutoCreate,
  runInventoryMigrationAutoLink,
  runInventoryMigrationIntegrityAudit,
  runInventoryMigrationPersist,
  runInventoryMigrationPhase1,
  runInventoryMigrationPhase2,
  runInventoryMigrationPostApplyAudit,
  runInventoryMigrationPreflight,
  runInventoryMigrationPreview,
  startInventoryMigrationSession,
} from '../../services/inventoryMigrationExecutionService'

const STAGE_BUTTON_COMMANDS = Object.freeze({
  Persist: 'persist',
  'Auto Link': 'auto-link',
  'Auto Create': 'auto-create',
  'Integrity Audit': 'integrity-audit',
  Preflight: 'preflight',
  Preview: 'preview',
  'Phase 1': 'phase-1',
  'Phase 2': 'phase-2',
  'Post Audit': 'post-audit',
})

const SESSION_COMMANDS = Object.freeze([
  Object.freeze({ id: 'start-session', label: 'Start Session' }),
  Object.freeze({ id: 'cancel-session', label: 'Cancel Session' }),
  Object.freeze({ id: 'complete-foundation', label: 'Complete Foundation' }),
  Object.freeze({ id: 'finish-session', label: 'Finish Session' }),
  Object.freeze({ id: 'acknowledge-attention', label: 'Acknowledge Attention' }),
])

const ACK_NEXT_STEP_OPTIONS = Object.freeze(['preflight', 'phase1', 'phase2'])

function statusClass(status) {
  return `is-${`${status ?? 'unknown'}`.toLowerCase().replace(/\s+/g, '-')}`
}

function formatCommandError(error) {
  if (!error) return 'Unable to run migration command.'
  if (typeof error === 'string') return error
  return error.message || 'Unable to run migration command.'
}

function resolveSessionId(sessionId) {
  const normalized = `${sessionId ?? ''}`.trim()
  if (!normalized || normalized === '—') return ''
  return normalized
}

export function StockMigrationOperatorPanel({
  operator = null,
  workspaceId = '',
  sessionId = '',
  isWorkspaceReady = false,
  onRefresh = null,
}) {
  const currentStep = operator?.currentStep ?? 'Unknown'
  const checklist = Array.isArray(operator?.checklist) ? operator.checklist : []
  const requiredAction = operator?.requiredAction ?? 'Migration cannot yet continue.'
  const notes = Array.isArray(operator?.notes) ? operator.notes : []
  const buttons = Array.isArray(operator?.buttons) ? operator.buttons : []

  const [pendingCommandId, setPendingCommandId] = useState(null)
  const [commandError, setCommandError] = useState('')
  const [confirmMaintenanceWindow, setConfirmMaintenanceWindow] = useState(false)
  const [ackPriorResultId, setAckPriorResultId] = useState('')
  const [ackNextStepName, setAckNextStepName] = useState('preflight')
  const [ackNote, setAckNote] = useState('')

  const resolvedWorkspaceId = `${workspaceId ?? ''}`.trim()
  const resolvedSessionId = resolveSessionId(sessionId)
  const commandsEnabled = Boolean(isWorkspaceReady && resolvedWorkspaceId)

  async function runCommand(commandId, execute) {
    if (pendingCommandId) return
    setCommandError('')
    setPendingCommandId(commandId)
    try {
      await execute()
      if (typeof onRefresh === 'function') {
        await onRefresh()
      }
    } catch (error) {
      setCommandError(formatCommandError(error))
    } finally {
      setPendingCommandId(null)
    }
  }

  function handleStageCommand(label) {
    const commandId = STAGE_BUTTON_COMMANDS[label]
    if (!commandId) return

    runCommand(commandId, async () => {
      if (!resolvedWorkspaceId) {
        throw new Error('Workspace ID is required.')
      }
      if (!resolvedSessionId) {
        throw new Error('Session ID is required.')
      }

      switch (commandId) {
        case 'persist':
          return runInventoryMigrationPersist(resolvedWorkspaceId, resolvedSessionId)
        case 'auto-link':
          return runInventoryMigrationAutoLink(resolvedWorkspaceId, resolvedSessionId)
        case 'auto-create':
          return runInventoryMigrationAutoCreate(resolvedWorkspaceId, resolvedSessionId)
        case 'integrity-audit':
          return runInventoryMigrationIntegrityAudit(resolvedWorkspaceId, resolvedSessionId)
        case 'preflight':
          return runInventoryMigrationPreflight(resolvedWorkspaceId, resolvedSessionId)
        case 'preview':
          return runInventoryMigrationPreview(resolvedWorkspaceId, resolvedSessionId)
        case 'phase-1':
          return runInventoryMigrationPhase1(resolvedWorkspaceId, resolvedSessionId)
        case 'phase-2':
          return runInventoryMigrationPhase2(
            resolvedWorkspaceId,
            resolvedSessionId,
            confirmMaintenanceWindow,
          )
        case 'post-audit':
          return runInventoryMigrationPostApplyAudit(resolvedWorkspaceId, resolvedSessionId)
        default:
          throw new Error('Unknown migration command.')
      }
    })
  }

  function handleSessionCommand(commandId) {
    runCommand(commandId, async () => {
      if (!resolvedWorkspaceId) {
        throw new Error('Workspace ID is required.')
      }

      switch (commandId) {
        case 'start-session':
          return startInventoryMigrationSession(resolvedWorkspaceId)
        case 'cancel-session':
          if (!resolvedSessionId) throw new Error('Session ID is required.')
          return cancelInventoryMigrationSession(resolvedWorkspaceId, resolvedSessionId)
        case 'complete-foundation':
          if (!resolvedSessionId) throw new Error('Session ID is required.')
          return completeInventoryMigrationFoundationStep(resolvedWorkspaceId, resolvedSessionId)
        case 'finish-session':
          if (!resolvedSessionId) throw new Error('Session ID is required.')
          return completeInventoryMigrationSession(resolvedWorkspaceId, resolvedSessionId)
        case 'acknowledge-attention': {
          if (!resolvedSessionId) throw new Error('Session ID is required.')
          const priorResultId = `${ackPriorResultId ?? ''}`.trim()
          const nextStepName = `${ackNextStepName ?? ''}`.trim()
          const note = `${ackNote ?? ''}`.trim() || null
          if (!priorResultId) throw new Error('Prior result ID is required.')
          if (!nextStepName) throw new Error('Next step name is required.')
          return acknowledgeInventoryMigrationStageAttention(
            resolvedWorkspaceId,
            resolvedSessionId,
            priorResultId,
            nextStepName,
            note,
          )
        }
        default:
          throw new Error('Unknown migration command.')
      }
    })
  }

  return (
    <section className="panel staff-panel stock-migration-panel stock-migration-operator-panel" aria-label="Migration operator">
      <div className="stock-migration-panel-header">
        <h3 className="stock-migration-panel-title">Migration Operator</h3>
        <p className="stock-migration-panel-copy">
          Explicit operator commands for the current workspace. One action runs one RPC.
        </p>
      </div>

      <div className="stock-migration-operator-grid">
        <div className="stock-migration-operator-current">
          <p className="stock-migration-operator-label">Current Step</p>
          <p className="stock-migration-operator-current-value">{currentStep}</p>
        </div>

        <div className="stock-migration-operator-action-card">
          <p className="stock-migration-operator-label">Required Action</p>
          <p className="stock-migration-operator-action-value">{requiredAction}</p>
        </div>
      </div>

      <div className="stock-migration-operator-section">
        <h4 className="stock-migration-operator-section-title">Operator Checklist</h4>
        <ul className="stock-migration-operator-checklist">
          {checklist.map((step) => (
            <li key={step.id} className="stock-migration-operator-check-row">
              <div className="stock-migration-operator-check-copy">
                <p className="stock-migration-operator-check-title">{step.title}</p>
                <p className="stock-migration-operator-check-description">{step.description}</p>
              </div>
              <span className={`stock-migration-operator-status ${statusClass(step.status)}`}>
                {step.status}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="stock-migration-operator-section">
        <h4 className="stock-migration-operator-section-title">Operator Notes</h4>
        <ul className="stock-migration-operator-notes">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </div>

      <div className="stock-migration-operator-section">
        <h4 className="stock-migration-operator-section-title">Execution</h4>
        <p className="stock-migration-panel-copy">
          Each button calls exactly one migration RPC. Stages do not auto-advance.
        </p>

        {commandError ? (
          <div className="staff-status-banner" role="alert">
            {commandError}
          </div>
        ) : null}

        <div className="stock-migration-actions stock-migration-operator-actions">
          {SESSION_COMMANDS.map((command) => (
            <button
              key={command.id}
              type="button"
              className="ghost-btn stock-migration-action-btn"
              data-command-id={command.id}
              disabled={!commandsEnabled || pendingCommandId === command.id}
              aria-busy={pendingCommandId === command.id ? 'true' : undefined}
              onClick={() => handleSessionCommand(command.id)}
            >
              {pendingCommandId === command.id ? 'Running…' : command.label}
            </button>
          ))}

          {buttons.map((label) => {
            const commandId = STAGE_BUTTON_COMMANDS[label]
            if (!commandId) return null
            return (
              <button
                key={label}
                type="button"
                className="ghost-btn stock-migration-action-btn"
                data-command-id={commandId}
                disabled={!commandsEnabled || pendingCommandId === commandId}
                aria-busy={pendingCommandId === commandId ? 'true' : undefined}
                onClick={() => handleStageCommand(label)}
              >
                {pendingCommandId === commandId ? 'Running…' : label}
              </button>
            )
          })}
        </div>

        <label className="stock-migration-panel-copy" htmlFor="migration-phase2-maintenance-confirm">
          <input
            id="migration-phase2-maintenance-confirm"
            type="checkbox"
            checked={confirmMaintenanceWindow}
            onChange={(event) => setConfirmMaintenanceWindow(event.target.checked)}
            disabled={Boolean(pendingCommandId)}
          />
          {' '}
          Confirm maintenance window for Phase 2
        </label>

        <div className="stock-migration-operator-ack-fields" aria-label="Acknowledge attention inputs">
          <label className="stock-migration-panel-copy" htmlFor="migration-ack-prior-result-id">
            Prior result ID
            <input
              id="migration-ack-prior-result-id"
              type="text"
              value={ackPriorResultId}
              onChange={(event) => setAckPriorResultId(event.target.value)}
              disabled={Boolean(pendingCommandId)}
              autoComplete="off"
            />
          </label>
          <label className="stock-migration-panel-copy" htmlFor="migration-ack-next-step">
            Next step name
            <select
              id="migration-ack-next-step"
              value={ackNextStepName}
              onChange={(event) => setAckNextStepName(event.target.value)}
              disabled={Boolean(pendingCommandId)}
            >
              {ACK_NEXT_STEP_OPTIONS.map((stepName) => (
                <option key={stepName} value={stepName}>{stepName}</option>
              ))}
            </select>
          </label>
          <label className="stock-migration-panel-copy" htmlFor="migration-ack-note">
            Acknowledgement note (optional)
            <input
              id="migration-ack-note"
              type="text"
              value={ackNote}
              onChange={(event) => setAckNote(event.target.value)}
              disabled={Boolean(pendingCommandId)}
              autoComplete="off"
            />
          </label>
        </div>
      </div>
    </section>
  )
}
