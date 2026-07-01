import { useState } from 'react'
import { useFloorPlanBuilder } from '../hooks/useFloorPlanBuilder'
import { BUILDER_COMPONENT_CATEGORIES } from '../models/componentCatalog'

export function BuilderToolbox() {
  const { dispatch, state } = useFloorPlanBuilder()
  const [expandedCategories, setExpandedCategories] = useState(() => (
    Object.fromEntries(BUILDER_COMPONENT_CATEGORIES.map((category) => [category.id, true]))
  ))

  const toggleCategory = (categoryId) => {
    setExpandedCategories((current) => ({
      ...current,
      [categoryId]: !current[categoryId],
    }))
  }

  return (
    <aside className="fpb-toolbox" aria-label="Components">
      <div className="fpb-panel-header">
        <p className="fpb-panel-eyebrow">Library</p>
        <h2 className="fpb-panel-title">Components</h2>
      </div>

      <div className="fpb-toolbox-scroll">
        {BUILDER_COMPONENT_CATEGORIES.map((category) => {
          const isExpanded = expandedCategories[category.id]

          return (
            <section key={category.id} className="fpb-toolbox-category">
              <button
                type="button"
                className="fpb-toolbox-category-toggle"
                aria-expanded={isExpanded}
                onClick={() => toggleCategory(category.id)}
              >
                <span>{category.label}</span>
                <span aria-hidden="true">{isExpanded ? '−' : '+'}</span>
              </button>

              {isExpanded ? (
                <div className="fpb-toolbox-items">
                  {category.items.map((item) => {
                    const isSelected = state.toolboxSelectionId === item.id

                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`fpb-toolbox-item${isSelected ? ' is-selected' : ''}`}
                        onClick={() => dispatch({
                          type: 'SELECT_TOOLBOX_ITEM',
                          payload: { itemId: item.id },
                        })}
                      >
                        <span className="fpb-toolbox-item-icon" aria-hidden="true">{item.icon}</span>
                        <span className="fpb-toolbox-item-label">{item.label}</span>
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </section>
          )
        })}
      </div>
    </aside>
  )
}
