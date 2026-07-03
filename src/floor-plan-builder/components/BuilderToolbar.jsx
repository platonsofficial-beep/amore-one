import { useFloorPlanBuilder } from '../hooks/useFloorPlanBuilder'
import { getAdjacentAreaId } from '../models/floorPlans'

export function BuilderToolbar({ onBack }) {
  const { state, dispatch, activeFloor } = useFloorPlanBuilder()
  const { floors } = state

  const switchArea = (direction) => {
    dispatch({
      type: 'SET_ACTIVE_FLOOR',
      payload: {
        floorId: getAdjacentAreaId(floors, state.activeFloorId, direction),
      },
    })
  }

  return (
    <header className="fpb-toolbar fpb-toolbar-simple" aria-label="Floor plan builder">
      <div className="fpb-toolbar-group">
        <button type="button" className="fpb-toolbar-btn" onClick={onBack}>
          ← Back
        </button>
      </div>

      <div className="fpb-toolbar-group fpb-area-switcher">
        <button
          type="button"
          className="fpb-area-nav-btn"
          onClick={() => switchArea('prev')}
          aria-label="Previous area"
        >
          ‹
        </button>

        <label className="fpb-floor-select">
          <span className="sr-only">Restaurant area</span>
          <select
            className="fpb-floor-select-input"
            value={state.activeFloorId}
            onChange={(event) => dispatch({
              type: 'SET_ACTIVE_FLOOR',
              payload: { floorId: event.target.value },
            })}
          >
            {floors.map((floor) => (
              <option key={floor.id} value={floor.id}>{floor.label}</option>
            ))}
          </select>
          <span className="fpb-floor-select-chevron" aria-hidden="true">▾</span>
        </label>

        <button
          type="button"
          className="fpb-area-nav-btn"
          onClick={() => switchArea('next')}
          aria-label="Next area"
        >
          ›
        </button>
      </div>

      <div className="fpb-toolbar-group fpb-toolbar-area-label">
        <span className="fpb-area-current-label">{activeFloor.label}</span>
      </div>
    </header>
  )
}
