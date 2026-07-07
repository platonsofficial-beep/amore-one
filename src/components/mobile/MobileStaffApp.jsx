import { MobileBottomNav } from './MobileBottomNav'
import { MobileHomeView } from './MobileHomeView'
import { MobileMenuView } from './MobileMenuView'
import { MobileScheduleView } from './MobileScheduleView'
import { MobileTasksView } from './MobileTasksView'

export function MobileStaffApp({
  activeTab,
  onTabChange,
  homeProps,
  scheduleProps,
  tasksProps,
  menuProps,
  expandedView = null,
  expandedTitle = '',
  onBackFromExpanded,
  expandedModuleContent = null,
}) {
  if (expandedView) {
    return (
      <div className="mobile-app mobile-app-expanded">
        <div className="mobile-expanded-scroll">
          <header className="mobile-expanded-header">
            <button type="button" className="mobile-back-btn" onClick={onBackFromExpanded}>
              ‹ Back
            </button>
            <h1>{expandedTitle}</h1>
          </header>
          {expandedModuleContent ? (
            <div className="mobile-workspace-module">
              {expandedModuleContent}
            </div>
          ) : null}
        </div>
        <MobileBottomNav activeTab={activeTab} onTabChange={onTabChange} />
      </div>
    )
  }

  return (
    <div className="mobile-app">
      <div className="mobile-app-content">
        {activeTab === 'home' ? <MobileHomeView {...homeProps} /> : null}
        {activeTab === 'schedule' ? <MobileScheduleView {...scheduleProps} /> : null}
        {activeTab === 'tasks' ? <MobileTasksView {...tasksProps} /> : null}
        {activeTab === 'menu' ? <MobileMenuView {...menuProps} /> : null}
      </div>
      <MobileBottomNav activeTab={activeTab} onTabChange={onTabChange} />
    </div>
  )
}
