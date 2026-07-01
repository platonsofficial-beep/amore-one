import { useFloorPlanBuilder } from '../hooks/useFloorPlanBuilder'
import { BUILDER_TOOLS } from '../models/builderTools'

function BuilderToolbarButton({
  children,
  onClick,
  disabled = false,
  className = '',
  title,
  isActive = false,
}) {
  return (
    <button
      type="button"
      className={`fpb-toolbar-btn${isActive ? ' is-active' : ''}${className ? ` ${className}` : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  )
}

export function BuilderToolbar({ onBack }) {
  const { state, dispatch, activeFloor } = useFloorPlanBuilder()

  return (
    <header className="fpb-toolbar" aria-label="Floor plan builder toolbar">
      <div className="fpb-toolbar-group">
        <BuilderToolbarButton onClick={onBack} title="Back to workspace">
          ← Back
        </BuilderToolbarButton>

        <label className="fpb-floor-select">
          <span className="sr-only">Active floor</span>
          <select
            className="fpb-floor-select-input"
            value={state.activeFloorId}
            onChange={(event) => dispatch({
              type: 'SET_ACTIVE_FLOOR',
              payload: { floorId: event.target.value },
            })}
          >
            {state.floors.map((floor) => (
              <option key={floor.id} value={floor.id}>{floor.label}</option>
            ))}
          </select>
          <span className="fpb-floor-select-chevron" aria-hidden="true">▾</span>
        </label>
      </div>

      <div className="fpb-toolbar-divider" aria-hidden="true" />

      <div className="fpb-toolbar-group fpb-toolbar-tools" role="toolbar" aria-label="Drawing tools">
        {BUILDER_TOOLS.map((tool) => (
          <BuilderToolbarButton
            key={tool.id}
            title={tool.enabled ? tool.label : `${tool.label} — coming soon`}
            disabled={!tool.enabled}
            isActive={tool.enabled && state.activeTool === tool.id}
            onClick={() => {
              if (!tool.enabled) return
              dispatch({ type: 'SET_ACTIVE_TOOL', payload: { toolId: tool.id } })
            }}
          >
            <span className="fpb-toolbar-tool-icon" aria-hidden="true">{tool.icon}</span>
            <span className="fpb-toolbar-tool-label">{tool.label}</span>
          </BuilderToolbarButton>
        ))}
      </div>

      <div className="fpb-toolbar-divider" aria-hidden="true" />

      <div className="fpb-toolbar-group">
        <BuilderToolbarButton disabled title="Undo — coming soon">Undo</BuilderToolbarButton>
        <BuilderToolbarButton disabled title="Redo — coming soon">Redo</BuilderToolbarButton>
      </div>

      <div className="fpb-toolbar-divider" aria-hidden="true" />

      <div className="fpb-toolbar-group">
        <span className={`fpb-mode-badge${state.mode === 'editing' ? '' : ' is-preview'}`}>
          {state.mode === 'editing' ? 'Editing Mode' : 'Preview Mode'}
        </span>
        <BuilderToolbarButton
          disabled
          title="Preview — coming soon"
        >
          Preview
        </BuilderToolbarButton>
        <BuilderToolbarButton
          disabled
          className="fpb-toolbar-btn-primary"
          title="Publish — coming soon"
        >
          Publish
        </BuilderToolbarButton>
      </div>

      <span className="sr-only">Current floor: {activeFloor.label}</span>
    </header>
  )
}
