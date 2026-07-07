import { MobileBottomNav } from './MobileBottomNav'
import { MobileManagerHomeView } from './MobileManagerHomeView'
import { MobileMenuView } from './MobileMenuView'
import { MobileProfileView } from './MobileProfileView'
import { MobileScheduleView } from './MobileScheduleView'
import { MobileTasksView } from './MobileTasksView'

function MobileManagerPreviewLabel() {
  return (
    <p className="mobile-manager-preview-label" aria-label="Manager mobile preview">
      Manager mobile preview
    </p>
  )
}

export function MobileManagerApp({
  activeTab,
  onTabChange,
  noticeMessage = '',
  onDismissNotice,
  homeProps,
  scheduleProps,
  tasksProps,
  menuProps,
  expandedView = null,
  expandedTitle = '',
  onBackFromExpanded,
  expandedModuleContent = null,
}) {
  const noticeBanner = noticeMessage ? (
    <div className="mobile-notice-banner auth-banner auth-banner-error" role="alert">
      <p>{noticeMessage}</p>
      {onDismissNotice ? (
        <button type="button" className="mobile-notice-dismiss" onClick={onDismissNotice} aria-label="Dismiss">
          ✕
        </button>
      ) : null}
    </div>
  ) : null

  if (expandedView) {
    return (
      <div className="mobile-app mobile-app-expanded mobile-manager-app">
        {noticeBanner}
        <MobileManagerPreviewLabel />
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
    <div className="mobile-app mobile-manager-app">
      {noticeBanner}
      <MobileManagerPreviewLabel />
      <div className="mobile-app-content">
        {activeTab === 'home' ? <MobileManagerHomeView {...homeProps} /> : null}
        {activeTab === 'schedule' ? <MobileScheduleView {...scheduleProps} /> : null}
        {activeTab === 'tasks' ? <MobileTasksView {...tasksProps} /> : null}
        {activeTab === 'menu' ? (
          menuProps?.screen === 'profile' ? (
            <MobileProfileView {...(menuProps.profileProps ?? {})} onBack={menuProps.onBackFromProfile} />
          ) : (
            <MobileMenuView {...menuProps} />
          )
        ) : null}
      </div>
      <MobileBottomNav activeTab={activeTab} onTabChange={onTabChange} />
    </div>
  )
}
