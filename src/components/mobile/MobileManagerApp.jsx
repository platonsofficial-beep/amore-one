import { useState } from 'react'
import { StockQuickTakeView } from '../stock/StockQuickTakeView'
import { ManagerMoreSheet } from './ManagerMoreSheet'
import { ManagerPortraitBanner } from './ManagerPortraitBanner'
import { MobileBottomNav } from './MobileBottomNav'
import { MobileManagerHomeView } from './MobileManagerHomeView'
import { MobileManagerLeaveInboxView } from './MobileManagerLeaveInboxView'
import { MobileManagerReservationsView } from './MobileManagerReservationsView'
import { MobileManagerScheduleDayView } from './MobileManagerScheduleDayView'
import { MobileManagerStockView } from './MobileManagerStockView'
import { MobileManagerTasksView } from './MobileManagerTasksView'
import { OperationsUnifiedScreen } from '../operations/OperationsUnifiedScreen'
import { MobileMenuView } from './MobileMenuView'
import { MobileProfileView } from './MobileProfileView'
import { t } from '../../i18n/i18n'

const PORTRAIT_MODULE_TITLES = {
  team: 'Team',
  settings: 'Settings',
  'time-clock': t("Time clock"),
  insights: 'Insights',
}

export function MobileManagerApp({
  activeTab,
  onTabChange,
  noticeMessage = '',
  onDismissNotice,
  homeProps,
  stockProps,
  managerTasksProps,
  menuProps,
  expandedView = null,
  expandedTitle = '',
  onBackFromExpanded,
  expandedModuleContent = null,
  isReservationsHostMode = false,
  bottomTabs,
  notificationBell = null,
  chatContent = null,
  operationsSection = 'dashboard',
  onOperationsSectionChange,
  operationsSections = [],
  operationsBoards = null,
  operationsChecklists = null,
  operationsExecution = null,
  portraitScreen = 'today',
  moreOpen = false,
  moreItems = [],
  onCloseMore,
  onSelectMore,
  reservationsProps = null,
  scheduleProps = null,
  portraitModule = null,
  takeProps = null,
}) {
  const [isTakeOpen, setIsTakeOpen] = useState(false)
  const noticeBanner = noticeMessage ? (
    <div className="mobile-notice-banner auth-banner auth-banner-error" role="alert">
      <p>{noticeMessage}</p>
      {onDismissNotice ? (
        <button type="button" className="mobile-notice-dismiss" onClick={onDismissNotice} aria-label={t("Dismiss")}>
          ✕
        </button>
      ) : null}
    </div>
  ) : null

  const navTabs = (bottomTabs ?? []).map((tab) => (
    tab.id === 'chat' && Number(menuProps?.chatUnread) > 0
      ? { ...tab, badge: menuProps.chatUnread }
      : tab
  ))
  const moreSheet = (
    <ManagerMoreSheet
      isOpen={moreOpen}
      items={moreItems}
      onClose={onCloseMore}
      onSelect={onSelectMore}
    />
  )

  if (expandedView && isReservationsHostMode) {
    return (
      <div className="mobile-app mobile-app-host-mode mobile-manager-app is-reservations-host-mode">
        {notificationBell ? <div className="mobile-shell-bell">{notificationBell}</div> : null}
        {noticeBanner}
        <div className="mobile-host-mode-screen">
          {expandedModuleContent ? (
            <div className="mobile-workspace-module is-host-mode-module">
              {expandedModuleContent}
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  if (expandedView) {
    return (
      <div className="mobile-app mobile-app-expanded mobile-manager-app">
        {notificationBell ? <div className="mobile-shell-bell">{notificationBell}</div> : null}
        {noticeBanner}
        <div className="mobile-expanded-scroll">
          <header className="mobile-expanded-header">
            <button type="button" className="mobile-back-btn" onClick={onBackFromExpanded}>
              {t("‹ Back")}
            </button>
            <h1>{expandedTitle}</h1>
          </header>
          {expandedModuleContent ? (
            <div className="mobile-workspace-module is-mobile-expanded">
              {expandedModuleContent}
            </div>
          ) : null}
        </div>
        <MobileBottomNav
          activeTab={activeTab}
          onTabChange={onTabChange}
          variant="manager"
          tabs={navTabs}
          moreExpanded={moreOpen}
        />
        {moreSheet}
      </div>
    )
  }

  const menuOverride = ['leave-inbox', 'profile', 'notifications'].includes(menuProps?.screen)
    ? menuProps.screen
    : ''
  const screen = menuOverride || portraitScreen
  const moduleTitle = PORTRAIT_MODULE_TITLES[screen] || ''

  return (
    <div className="mobile-app mobile-manager-app">
      {notificationBell ? <div className="mobile-shell-bell">{notificationBell}</div> : null}
      {noticeBanner}
      <div className="mobile-app-content">
        {screen === 'today' ? <MobileManagerHomeView {...homeProps} /> : null}
        {screen === 'reservations' && reservationsProps ? (
          <MobileManagerReservationsView {...reservationsProps} />
        ) : null}
        {screen === 'chat' ? chatContent : null}
        {screen === 'tasks' ? (
          <OperationsUnifiedScreen
            sections={operationsSections}
            section={operationsSection}
            onSectionChange={onOperationsSectionChange}
            today={<MobileManagerTasksView {...managerTasksProps} />}
            boards={operationsBoards}
            checklists={operationsChecklists}
            execution={operationsExecution}
          />
        ) : null}
        {screen === 'stock' ? (
          <div className="manager-portrait-stock">
            {takeProps && isTakeOpen ? (
              <div className="manager-portrait-take">
                <header className="manager-portrait-take-header">
                  <button type="button" className="mobile-back-btn" onClick={() => setIsTakeOpen(false)}>
                    {t("‹ Stock")}
                  </button>
                  <h1>{t("Take from storage")}</h1>
                </header>
                <StockQuickTakeView {...takeProps} />
              </div>
            ) : (
              <>
                {takeProps ? (
                  <button
                    type="button"
                    className="manager-portrait-take-entry"
                    onClick={() => setIsTakeOpen(true)}
                  >
                    <span className="manager-portrait-take-entry-icon" aria-hidden="true">📦</span>
                    <span className="manager-portrait-take-entry-text">
                      <strong>{t("Take from storage")}</strong>
                      <small>{t("Record what you took. Stock updates now.")}</small>
                    </span>
                    <span aria-hidden="true">›</span>
                  </button>
                ) : null}
                <ManagerPortraitBanner area="stock" />
                <MobileManagerStockView {...stockProps} />
              </>
            )}
          </div>
        ) : null}
        {screen === 'schedule' && scheduleProps ? (
          <MobileManagerScheduleDayView {...scheduleProps} />
        ) : null}
        {moduleTitle && portraitModule ? (
          <div className="manager-portrait-module">
            <header className="manager-portrait-module-header">
              <h1>{t(moduleTitle)}</h1>
            </header>
            {portraitModule}
          </div>
        ) : null}
        {screen === 'profile' || screen === 'leave-inbox' || screen === 'notifications' || screen === 'menu' ? (
          menuProps?.screen === 'leave-inbox' ? (
            <MobileManagerLeaveInboxView
              {...(menuProps.leaveInboxProps ?? {})}
              onBack={menuProps.onBackFromLeaveInbox}
            />
          ) : menuProps?.screen === 'profile' ? (
            <MobileProfileView {...(menuProps.profileProps ?? {})} onBack={menuProps.onBackFromProfile} />
          ) : menuProps?.screen === 'notifications' ? (
            <div className="mobile-screen mobile-notification-settings">
              <button type="button" className="mobile-back-btn" onClick={menuProps.onBackFromNotifications}>
                {t("‹ Back")}
              </button>
              {menuProps.notificationSettings}
            </div>
          ) : (
            <MobileMenuView {...menuProps} />
          )
        ) : null}
      </div>
      <MobileBottomNav
        activeTab={activeTab}
        onTabChange={onTabChange}
        variant="manager"
        tabs={navTabs}
        moreExpanded={moreOpen}
      />
      {moreSheet}
    </div>
  )
}
