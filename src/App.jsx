import { Fragment, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './App.css'
import { createEmployee, deleteEmployee, getEmployees, updateEmployee, updateLinkedEmployeePhone } from './services/staffService'
import { updateMembershipDisplayName } from './services/membershipService'
import { createShift, deleteShift, getShifts, updateShift } from './services/scheduleService'
import { createShiftTemplate, deleteShiftTemplate, getShiftTemplates, moveShiftTemplatesByDrag, reorderShiftTemplates, sortShiftTemplates, updateShiftTemplate, archiveShiftTemplate, getShiftCountForTemplate, didUseLegacyShiftTemplateSchema } from './services/shiftTemplateService'
import { getScheduleCapacities, upsertScheduleCapacity, deleteScheduleCapacitiesForDates, copyScheduleCapacitiesForWeek, applyScheduleCapacitiesForWeek, applyMinimumCapacitiesFromShifts } from './services/scheduleCapacityService'
import { draftMatchesPublishedSnapshot } from './services/publishedShiftService'
import { getWeekSchedulePublicationState, publishWeekSchedule, unpublishWeekSchedule } from './services/schedulePublicationService'
import { createPosition, deletePosition, getPositions, reorderPositions, updatePosition } from './services/positionsService'
import {
  createReservationSeating,
  deleteReservationSeating,
  getReservationSeatings,
  reorderReservationSeatings,
  updateReservationSeating,
} from './services/reservationSeatingService'
import { createWeeklyScheduleTemplate, deleteWeeklyScheduleTemplate, getWeeklyScheduleTemplates, getWeeklyTemplateShifts, renameWeeklyScheduleTemplate } from './services/weeklyScheduleTemplateService'
import {
  createReservation,
  buildReservationUpdatePayload,
  assignReservationTablesPayload,
  deleteReservation,
  getReservations,
  updateReservation,
} from './services/reservationService'
import { SeatingConfirmPanel } from './components/seating/SeatingConfirmPanel'
import TasksView from './components/tasks/TasksView'
import { HostReservationEditPanel, createHostReservationEditForm } from './components/reservations/HostReservationEditPanel'
import { HostReservationEditErrorBoundary } from './components/reservations/HostReservationEditErrorBoundary'
import { HostReservationList } from './components/reservations/HostReservationList'
import { HOST_LIST_HELPERS } from './components/reservations/hostReservationListHelpers'
import { normalizeStoredCustomerType } from './lib/reservationCustomerType'
import { HostManagerSummaryBar } from './components/reservations/HostManagerSummaryBar'
import { formatHostNextArrivalHint } from './components/reservations/HostServiceHealthStrip'
import { HostWorkspaceDateNav } from './components/reservations/HostWorkspaceDateNav'
import {
  buildHostManagerSummary,
  formatHostWorkspaceDateNavLabel,
  formatHostWorkspaceLongDateLabel,
  formatHostWorkspaceShortDateLabel,
  getHostWorkspaceReservations,
  resolveHostWorkspaceDateKey,
  shiftHostWorkspaceDateKey,
} from './components/reservations/hostReservationListUtils'
import { ReservationTableSelector } from './components/reservations/ReservationTableSelector'
import { ReservationDateField } from './components/reservations/ReservationDateField'
import { HostWorkspaceDatePicker } from './components/reservations/HostWorkspaceDatePicker'
import { ReservationCalendarIcon } from './components/reservations/ReservationCalendarIcon'
import { ReservationPhoneField } from './components/reservations/ReservationPhoneField'
import { ReservationTimeSelect } from './components/reservations/ReservationTimeSelect'
import { ReservationSeatingSelect } from './components/reservations/ReservationSeatingSelect'
import { TimeSelect } from './components/TimeSelect'
import { getHostUnitById, toSeatingUnitFromLayoutUnit } from './lib/hostFloorPlanLayout'
import { PublishedFloorPlanProvider, usePublishedFloorPlan } from './lib/PublishedFloorPlanContext'
import { loadPublishedHostLayout } from './lib/builderToHostLayout'
import { completeReturnToHost } from './lib/publishReturnToHost'
import { useHostReturnAfterPublishBoot } from './lib/useHostReturnAfterPublishBoot'
import {
  isHostAssignmentModeActive,
  isHostCompactAssignmentSelection,
  isReservationEligibleForHostTableAssignment,
  isTableDayViewRowAssignableForAssignment,
  shouldShowHostMultiTableEntryAction,
  canToggleTableInHostMultiTableSelection,
  shouldShowHostSeatingDrawer,
} from './lib/hostAssignmentPanelUtils'
import { resolveActiveFloorAreaId } from './lib/publishFloorPlanTransition'
import {
  buildSeatingAssignment,
  computeSeatingAssignmentTotals,
  enrichReservationWithSeatingAssignment,
  formatSeatingAssignmentLabels,
  formatSeatingAssignmentDrawerLabels,
  formatSeatingAssignmentSummary,
  formatHostListTableLabel,
  formatHostListUnitLabel,
  formatHostFloorReservationTooltipMeta,
  getReservationSeatingAssignment,
  resolveSeatingDraftFromReservation,
  normalizeUnitKey,
  reservationUsesSeatingUnit,
  seatingUnitMatchesFloorUnit,
} from './lib/seatingAssignment'
import { resolveAreaIdForReservation, toggleAssignedUnit } from './lib/reservationTableOptions'
import {
  buildReservationLinkGroups,
  buildReservationLinkTableMeta,
  computeHostFloorFit,
  HOST_FLOOR_MAX_ZOOM,
  HOST_FLOOR_MIN_ZOOM,
} from './lib/hostFloorPlanViewport'
import {
  advanceHostFloorPointerInteraction,
  beginHostFloorPointerInteraction,
  completeHostFloorPointerInteraction,
  findHostFloorTableFromEvent,
  getHostFloorPanOffset,
  HOST_FLOOR_POINTER_MODE,
  isInteractiveHostFloorTarget,
  resolveHostFloorTableState,
  shouldCaptureHostFloorPointer,
  toHostFloorPointerLikeEvent,
} from './lib/hostFloorPointerInteraction'
import {
  describeHostFloorDebugTarget,
  isHostFloorDebugEnabled,
  patchHostFloorDebugTrace,
} from './lib/hostFloorDebugTrace'
import {
  beginHostFloorDirectTableTap,
  cancelHostFloorDirectTableTap,
  completeHostFloorDirectTableTap,
  createHostFloorTableTapRegistry,
  isHostFloorTableTapConsumedForTable,
  shouldSkipViewportTableTap,
} from './lib/hostFloorTableTapSession'
import {
  buildHostFloorCompactAriaLabel,
  buildHostFloorCompactTableContent,
  formatHostFloorTableLabel,
} from './lib/hostFloorTableContent'
import {
  buildHostFloorDiningTimerLabel,
  buildHostFloorDiningTimerPresentation,
  getNowMinutesFromDate,
  useHostDiningTimerClock,
} from './lib/hostDiningTimer'
import { buildDiningTimerExternalLabelPlacementMap } from './lib/hostDiningTimerExternalLabelPlacement'
import { getFloorLayoutSpaceStyle, getPublishedTableLayoutStyle } from './lib/publishedTableLayout'
import {
  isFloorTablePhysicallyOccupied,
  resolveFloorTableOperationalState,
} from './lib/floorTableOperationalState'
import {
  applyHostFloorSelectedSeatingContext,
  resolveHostFloorTableStatusClass,
} from './lib/hostFloorTableVisualState'
import {
  hostFloorReservationVisualStateChanged,
  mergeOptimisticReservationUpdate,
  replaceReservationInCollection,
  resolveHostFloorReservationRecord,
  syncHostWorkspaceReservationSelection,
} from './lib/hostFloorReservationState'
import {
  buildFloorTableReservationMap,
  debugFloorAssignmentSnapshot,
  getReservationDateKey,
  getReservationsForFloorTable,
  reservationHasAssignedTables,
} from './lib/floorAssignmentMapping'
import {
  getFloorTableStatusPriority,
  getFloorTableVisualStatus,
  getHostListStatusLabel,
  getHostListGroupId,
  getHostStatusGroupId,
  getReservationDisplayStatus,
  getReservationDisplayStatusTone,
  isReservationInHouse,
  isReservationLate,
  isReservationWaiting,
  isReservationInHouseStatus,
  isTerminalReservationStatus,
  isUpcomingReservationStatus,
  normalizeReservationStatus,
  getHostReservationStatusOptions,
  reservationOccupiesFloorTables,
  canMarkReservationArrived,
  canSeatReservation,
  canMarkReservationNoShow,
  canCompleteReservation,
} from './lib/reservationHostStatus'
import {
  buildDailyServiceSnapshot,
  buildHostReservationAlerts,
  getHostReservationAlertReasons,
  getServiceOrderRank,
  getTimelineEmptyState,
} from './lib/reservationServiceIntelligence'
import { EmbeddedFloorPlanEditor } from './components/floor/EmbeddedFloorPlanEditor'
import { FloorPlanReservationLinks } from './components/floor/FloorPlanReservationLinks'
import { FloorSeatingSelector } from './components/floor/FloorSeatingSelector'
import { FloorPlanLegend } from './components/floor/FloorPlanLegend'
import { HOST_FLOOR_PLAN_LEGEND_ITEMS } from './lib/hostFloorPlanLegend'
import { buildHostQueueSeatingChipMetricsMap } from './lib/hostQueueServiceMetrics'
import { HOST_QUEUE_ALL_AREAS } from './lib/hostQueuePipeline'
import { HostFloorCompactTableContent } from './components/floor/HostFloorCompactTableContent'
import { FloorTableReservationTooltip } from './components/floor/FloorTableReservationTooltip'
import { HostFloorDebugOverlay } from './components/floor/HostFloorDebugOverlay'
import { HostMultiTableSelectionBar } from './components/floor/HostMultiTableSelectionBar'
import { HostStationErrorBoundary } from './components/host/HostStationErrorBoundary'
import {
  FloorTableSeatingDialog,
  formatFloorTableAreaLabel,
  getFloorTableDialogLabel,
} from './components/floor/FloorTableSeatingDialog'
import { useHostTableInspectorDrawer } from './lib/useHostTableInspectorDrawer'
import {
  buildHostSeatingTableAvailability,
  buildTableSeatingDayIndicators,
} from './lib/tableAvailability'
import {
  buildFloorTableDayViewRows,
  buildReleaseTableAssignmentUpdate,
  buildTableDayViewCreatePrefill,
  isTableAssignmentSelectionClick,
  resolveHostFloorTableClickRoute,
  shouldOpenTableDayViewOnTableClick,
} from './lib/tableDayView'
import {
  buildHostFloorContextSnapshot,
  createHostScheduleCardLifecycleState,
  recordScheduleCardDismiss,
  recordScheduleCardOpen,
  resolveScheduleCardTableById,
  shouldCloseScheduleCardForFloorContextChange,
  shouldIgnoreCanvasDismissForScheduleCard,
} from './lib/hostScheduleCardLifecycle'
import {
  buildHostServiceDashboard,
  isReservationUpcomingForHostFilter,
} from './lib/hostServiceDashboard'
import {
  buildSeatingsById,
  formatSeatingChipLabel,
  getActiveSeatingsForDate,
  matchReservationTimeToSeating,
  resolveHostStationInitialSeatingId,
  resolveReservationSeatingId,
  validateReservationSeatingForm,
} from './lib/reservationSeatings'
import { getConflictingUnitIds } from './lib/reservationTableOptions'
import { createInventoryItem, deleteInventoryItem, getInventoryItems, updateInventoryItem } from './services/inventoryService'
import {
  completeBarRefill,
  createBarRefill,
  getBarRefills,
  updateBarRefill,
  updateBarRefillItem,
} from './services/barRefillService'
import {
  buildInventoryReorderCopyText,
  buildInventoryReorderSummary,
  formatInventoryOrderQtyDetail,
  getInventoryOrderNeeded,
  getInventoryStockHealthPercent,
  getInventoryStockHealthTone,
  getInventoryUnitSelectValue,
  isInventoryParConfigured,
  INVENTORY_TARGET_STOCK_LABEL,
  INVENTORY_UNIT_CUSTOM_VALUE,
  INVENTORY_UNIT_PRESETS,
  isInventoryUnitPreset,
  needsOrder,
} from './lib/inventoryUtils'
import {
  filterInventoryItemsBySubcategory,
  filterInventoryItemsForBarRefill,
  formatInventoryBarRefillOptionLabel,
  formatInventoryCategoryPath,
  getInventoryBarRefillCategoryOptions,
  getInventoryCategoryFilters,
  getInventorySubcategories,
  getInventorySubcategoryFilters,
  getInventorySubcategoryLabel,
  getInventorySubcategoryOptionsForCategory,
  groupInventoryItemsByCategoryAndSubcategory,
  groupInventoryItemsBySubcategory,
  INVENTORY_CATEGORIES,
  INVENTORY_CUSTOM_CATEGORY_VALUE,
  INVENTORY_CUSTOM_SUBCATEGORY_VALUE,
  INVENTORY_NO_SUBCATEGORY_VALUE,
  resolveInventoryCategoryForForm,
  resolveInventoryCategoryForSave,
  resolveInventorySubcategoryForForm,
  resolveInventorySubcategoryForSave,
  sortInventoryItemsForBarRefill,
} from './lib/inventoryCategories'
import { createSupplier, deleteSupplier, getSuppliers, updateSupplier } from './services/supplierService'
import { createStockItem, updateStockItem } from './services/stockItemService'
import { getStockItemsWithLastMovement, recordStockMovement } from './services/stockMovementService'
import {
  createStockOrdersFromGroups,
  getStockOrdersWithAuthors,
  receiveStockOrderPartial,
  updateStockOrderDraft,
  updateStockOrderStatus,
} from './services/stockOrderService'
import {
  completeOperationsTask,
  createOperationsTask,
  deleteOperationsTask,
  getOperationsTasks,
  reopenOperationsTask,
  updateOperationsTask,
} from './services/operationsTaskService'
import {
  createOperationsLog,
  deleteOperationsLog,
  getOperationsLogs,
  updateOperationsLog,
} from './services/operationsLogService'
import {
  createOperationsAnnouncement,
  deactivateOperationsAnnouncement,
  getOperationsAnnouncements,
  markOperationsAnnouncementRead,
  updateOperationsAnnouncement,
} from './services/operationsAnnouncementService'
import {
  createOperationsChecklistItem,
  createOperationsChecklistTemplate,
  deleteOperationsChecklistItem,
  deleteOperationsChecklistTemplate,
  generateDailyChecklistTasks,
  getOperationsChecklistTemplates,
  saveOperationsChecklistItemOrder,
  updateOperationsChecklistItem,
  updateOperationsChecklistTemplate,
} from './services/operationsChecklistService'
import {
  completeTask,
  createTask,
  deleteTask,
  getTasks,
  reopenTask,
  updateTask,
} from './services/taskService'
import {
  createTaskTemplate,
  deleteTaskTemplate,
  generateTasksFromTemplates,
  getTaskTemplates,
  updateTaskTemplate,
} from './services/taskTemplateService'
import {
  getChecklistItemsForTasks,
  toggleChecklistItem,
} from './services/taskChecklistService'
import {
  getTemplateChecklistItems,
  replaceTemplateChecklist,
} from './services/taskTemplateChecklistService'
import {
  addWeeks,
  addCalendarDays,
  formatWeekRange,
  getCurrentWeekStartDate,
  getWeekDateKeys,
  getWeekDays,
  getWeekStartDate,
  isCurrentWeek,
  parseLocalDate,
  formatScheduleDayHeader,
  formatLocalDateKey,
} from './lib/weekUtils'
import {
  buildKnownShiftTemplateIdSet,
  prepareShiftForSave,
  resolveShiftTemplateId,
} from './lib/shiftIntegrity'
import {
  getEmployeeFirstName,
  getEmployeePositionNames,
  getEmployeePrimaryPosition,
  inferAreaFromTemplate,
  isEmployeeAssignedInCell,
  isEmployeeUnavailable,
  resolvePositionForDrop,
} from './lib/scheduleDropUtils'
import {
  buildCloneRawPayload,
  buildShiftCellKeyFromParts,
  buildShiftDedupeKey,
} from './lib/scheduleBulkUtils'
import {
  formatTime24,
  formatTimeRange24,
  normalizeTimeValue,
  normalizeReservationTimeValue,
  normalizeReservationDateKey,
  formatEuropeanDayMonth,
  formatHostReservationListTime,
} from './lib/timeFormatUtils'
import { validateReservationFormFields } from './lib/reservationFormValidation'
import {
  resolveHostQuickCreateCreateNotes,
  resolveHostQuickCreateCreateStatus,
} from './lib/hostQuickCreateForm'
import {
  resolveWorkspaceDefaultPhoneCountryCode,
  setWorkspaceDefaultPhoneCountryCode,
} from './lib/reservationPhoneUtils'
import {
  handleReservationFormEnterKey,
  preventReservationFormSubmit,
} from './lib/reservationFormNavigation'
import {
  focusNextEmployeeFormField,
  handleEmployeeFormEnterKey,
} from './lib/employeeFormNavigation'
import {
  departmentLabelsMatch,
  positionLabelsMatch,
  preserveLegacyCatalogOption,
} from './lib/departmentCatalogUtils'
import {
  clearPendingEmployeePositionDeletions,
  getPendingEmployeePositionDeletionsForCatalogCleanup,
  prunePendingEmployeePositionDeletionsForSelection,
  queuePendingEmployeePositionDeletion,
} from './lib/employeeCustomPositionDeletionUtils'
import {
  findDepartment,
  findPosition,
  getDepartmentsForVenueType,
  getPositionsForDepartment,
} from './lib/venueCatalogTemplates'
import {
  buildEmployeeWeeklyHoursMap,
  calculateShiftDurationHours,
  formatHoursLabel,
  getAssignmentOvertimeHours,
  getEmployeeHoursTrackerState,
  isAssignmentUsingCustomTime,
  parseWeeklyHoursTarget,
  parseTimeToMinutes,
} from './lib/shiftHoursUtils'
import { buildEmployeeWeekScheduleView } from './lib/employeeWeekScheduleView'
import { getWorkspaceScheduleAvailabilityByEmployee } from './services/availabilityService'
import {
  buildScheduleAvailabilityDayIndicators,
  buildScheduleAvailabilityLookupKey,
  getAvailabilityDayOfWeekFromDateKey,
  resolveScheduleAvailabilityDayIndicator,
} from './lib/scheduleAvailabilityPresentation'
import {
  getRestOfWeekDateKeys,
  getShiftSchedulingConflictType,
  shiftHasSchedulingConflict,
} from './lib/scheduleConflictUtils'
import {
  buildWeeklyTemplateCapacitySnapshot,
  deleteWeeklyTemplateCapacitySnapshot,
  getWeeklyTemplateCapacitySnapshot,
  mapWeeklyTemplateCapacitySnapshotToWeek,
  saveWeeklyTemplateCapacitySnapshot,
} from './lib/weeklyTemplateCapacitySnapshots'
import { buildOperationalSnapshot, buildTeamTodayCoverageBreakdown } from './lib/operationalSnapshotUtils'
import {
  buildTodayServiceTimeline,
  buildTodayStatusSummary,
  buildTeamTodayGroups,
} from './lib/todayViewUtils'
import { buildTodayCommandHeaderChips } from './lib/todayCommandHeaderUtils'
import {
  buildTodayExecutiveMessage,
  hasTodayStockProblems,
} from './lib/todayExecutiveMessage'
import { buildTodayCommandCenterAttentionItems } from './lib/mobileManagerTodayUtils'
import {
  resolveTodayAttentionDestination,
} from './lib/todayAttentionNavigation'
import { TodayAttentionPanel } from './components/today/TodayAttentionPanel'
import { buildStockOrdersOperationsSummary } from './lib/stockOrderUtils'
import { buildStockDashboardSummary, resolveDashboardStockAlerts } from './lib/stockUtils'
import { filterTasksExcludingAnnouncementDuplicates } from './lib/operationsAnnouncementUtils'
import {
  countShiftsCoveringTemplateCell,
  formatScheduleCoverageStatusLabel,
  getShiftsCoveringTemplateCell,
} from './lib/scheduleCoverageUtils'
import {
  formatAttentionCollapsedSummary,
  formatTeamTodayCollapsedSummary,
  formatTodayTimelineCollapsedSummary,
  hasUrgentAttentionItems,
} from './lib/todayDashboardUtils'
import {
  getDefaultTodayPanelExpanded,
  hasTeamTodayShifts,
  hasTodayPanelStoredPreference,
  readTodayPanelExpanded,
  TODAY_PANEL_IDS,
  writeTodayPanelExpanded,
} from './lib/todayPanelCollapse'
import { applyCoverageHintsToGroups, buildTeamTodayStatus, enrichTeamTodayGroups } from './lib/teamViewUtils'
import { getWorkspaceNowMinutes, resolveEmployeeTodayStatus } from './lib/employeeTodayStatusUtils'
import {
  groupScheduleGridRowsByArea,
  readCollapsedScheduleAreaKeys,
  writeCollapsedScheduleAreaKeys,
} from './lib/scheduleAreaCollapseUtils'
import { TeamTodayView } from './components/team/TeamTodayView'
import { TeamTodayGroupsList } from './components/team/TeamTodayGroupsList'
import { TeamPeopleView } from './components/team/TeamPeopleView'
import { StockDashboardView } from './components/stock/StockDashboardView'
import { StockOrdersView } from './components/stock/StockOrdersView'
import { StockSuppliersView } from './components/stock/StockSuppliersView'
import { StockCreateOrderModal } from './components/stock/StockCreateOrderModal'
import { OperationsAnnouncementFormModal } from './components/operations/OperationsAnnouncementFormModal'
import { OperationsDashboardView } from './components/operations/OperationsDashboardView'
import { OperationsChecklistsView } from './components/operations/OperationsChecklistsView'
import { OperationsChecklistExecutionView } from './components/operations/OperationsChecklistExecutionView'
import { TodayAnnouncementsPanel } from './components/today/TodayAnnouncementsPanel'
import { TodayTimeline } from './components/today/TodayServiceTimeline'
import { TodayCommandHeader } from './components/today/TodayCommandHeader'
import { TodayStatusCards } from './components/today/TodayStatusCards'
import {
  supplierHasHistory,
} from './lib/stockSupplierUtils'
import {
  areWorkspaceProfilesEqual,
  buildBrandDisplay,
  buildDashboardGreeting,
  buildProfileChipDisplay,
  shouldInitializeWorkspaceProfileDraft,
} from './lib/workspaceProfileUtils'
import { readAndClearInviteAcceptedNotice } from './lib/inviteNoticeStorage'
import {
  formatWorkspaceLoadErrorForUser,
  shouldShowWorkspaceLoadError,
  USER_WORKSPACE_LOADING_MESSAGE,
} from './lib/workspaceLoadUtils'
import { resolveUserDisplayName } from './lib/userDisplayName'
import { MAX_WORKSPACE_LOGO_BYTES } from './lib/workspaceProfileOptions'
import { TASK_PRESET_DEPARTMENTS } from './lib/taskDepartments'
import { DEFAULT_RESTAURANT_AREAS } from './floor-plan-builder/models/floorPlans'
import { WorkspaceView } from './components/workspace/WorkspaceView'
import { createDefaultSeatingForm } from './components/workspace/WorkspaceReservationSeatingsSection'
import { AccessRestrictedView } from './components/auth/AccessRestrictedView'
import { ModuleSectionTabs } from './components/shell/ModuleSectionTabs'
import { UserMenu } from './components/auth/UserMenu'
import { MobileManagerApp } from './components/mobile/MobileManagerApp'
import { MobileStaffApp } from './components/mobile/MobileStaffApp'
import { MobileReservationsHostView } from './components/mobile/reservations/MobileReservationsHostView'
import { MobileReservationQuickCreateSheet } from './components/mobile/reservations/MobileReservationQuickCreateSheet'
import { MobileReservationsHostRightPane } from './components/mobile/reservations/MobileReservationsHostRightPane'
import { ScheduleWeekNav } from './components/schedule/ScheduleWeekNav'
import { ViewportDebugOverlay } from './components/shell/ViewportDebugOverlay'
import { shouldUseMobileShell } from './lib/viewportUtils'
import {
  getScheduleGridDayColumnWidth,
  getScheduleGridTableMinWidth,
  isMobileScheduleCompactLandscape,
} from './lib/mobileScheduleUtils'
import {
  isMobileScrollDebugEnabled,
  scheduleMobileReservationsScrollDebug,
  setMobileScrollDebugAttribute,
} from './lib/mobileScrollDebug'
import { filterStandaloneOperationsTasks } from './lib/operationsChecklistUtils'
import {
  buildMobileEmployeeShiftSummary,
  buildMobileEmployeeWeekSchedule,
  calculateMobileOperationsTaskOverview,
  filterMobileStaffOperationsTasks,
  partitionMobileOperationsTasks,
} from './lib/mobileStaffUtils'
import { useAuth } from './context/AuthContext'
import {
  NAV_ITEMS,
  OPERATIONS_SECTIONS,
  STOCK_SECTIONS,
  TEAM_SECTIONS,
  getDefaultTeamSection,
  getModuleSubtitle,
  getModuleTitle,
  getSearchPlaceholder,
  resolveInsightsModuleLink,
  isTeamScheduleView,
  shouldHideStandardTopbar,
  shouldShowModuleSearch,
  shouldUseCommandTopbar,
} from './lib/appNavigation'
import {
  canAccessModule,
  canAccessTeamSection,
  canAssignManagerInviteRole,
  canAccessMobileExpandedModule,
  canEditSchedule,
  canEditFloorPlan,
  canManageAnnouncements,
  canManageEmployeeInvites,
  canManageOperations,
  canConfigureReservationSeatings,
  canManageReservations,
  canManageStock,
  canOpenMobileFullSchedule,
  canOpenMobileTasksWorkspace,
  canOpenReservationsHostMode,
  filterNavItemsByRole,
  filterOperationsSections,
  getMobileBottomTabs,
  getTodayQuickActions,
  isHostMobileRole,
  isManagementMobileRole,
  resolveHostMobileTabChange,
  resolveMobileShellVariant,
  resolvePermittedActiveView,
  resolveExitReservationsHostDestination,
  shouldShowReservationsHostView,
  shouldUseReservationsHostDedicatedShell,
  shouldUseHostStationLanding,
  resolvePermittedOperationsSection,
  resolvePermittedTeamSection,
} from './lib/permissions'
import {
  EMPTY_WORKSPACE_PROFILE,
  getWorkspaceProfile,
  saveWorkspaceProfile,
} from './services/workspaceProfileService'
import { resolveActiveWorkspaceId } from './services/workspaceService'
import {
  buildExecutiveLabourSummary,
  buildReservationsFooter,
  buildDashboardIssuesSummary,
  buildLiveFloorState,
  buildTodayCommandTimeline,
  buildTodayReservationsSummary,
  getTodayReservations,
  getLowStockAlertItems,
  isModuleUnavailableMessage,
  resolveLiveDraftShiftsForWeek,
  resolveLiveDraftCapacitiesForWeek,
} from './lib/dashboardUtils'
import {
  buildHostServiceHourPressureSlots,
  reservationMatchesServiceHourBucket,
} from './lib/hostReservationServiceHour'
import {
  formatCurrentDateLabel,
  getCurrentDateKey,
  getLocalNow,
  getTimeGreeting,
} from './lib/currentDateUtils'
import {
  calculateDepartmentPerformanceSummaries,
  calculateTaskOverview,
  matchesCustomDepartmentName,
  resolveCurrentEmployeeId,
} from './lib/taskUtils'
import ReportsView from './components/reports/ReportsView'
import { ScheduleCardActionMenu } from './components/schedule/ScheduleCardActionMenu'
import { UNASSIGNED_CUSTOM_DEPARTMENT_NAME } from './lib/taskDepartments'
import {
  persistNavigation,
  readPersistedNavigation,
} from './lib/navigationPersistence'
import {
  persistManagerMobileTab,
  persistMobileTab,
  persistMobileWeekStart,
  readPersistedManagerMobileTab,
  readPersistedMobileTab,
  readPersistedMobileWeekStart,
} from './lib/mobileNavigationPersistence'

const HOST_RESERVATION_STATUS_OPTIONS = getHostReservationStatusOptions()

const defaultStaffPositionOptions = [
  'Bar',
  'Service',
  'Food Runner',
  'Drink Runner',
  'Host',
  'Kitchen',
  'Cashier',
  'Manager',
]
const scheduleAreaOptions = ['Bar', 'Service', 'Terrace', 'VIP', 'Lounge', 'Garden', 'Kitchen', 'Reception', 'Host', 'Management', 'Other']
const areaPositionCatalog = {
  Bar: ['Bartender', 'Bar Service / PDA', 'Barback', 'Coffee', 'Bar Manager'],
  Service: ['Waiter', 'Food Runner', 'Drink Runner', 'Head Waiter', 'Host / Hostess'],
  Terrace: ['Waiter', 'Food Runner', 'Drink Runner'],
  VIP: ['Head Waiter', 'Host / Hostess', 'Waiter'],
  Garden: ['Waiter', 'Food Runner', 'Drink Runner'],
  Kitchen: ['Head Chef', 'Sous Chef', 'Line Cook', 'Pastry Chef', 'Kitchen Porter'],
}

function inferPositionDepartment(name) {
  const normalized = `${name ?? ''}`.trim().toLowerCase()
  if (!normalized) return 'Other'

  if (normalized.includes('bar')) return 'Bar'
  if (normalized.includes('kitchen') || normalized.includes('chef') || normalized.includes('cook')) return 'Kitchen'
  if (normalized.includes('manager')) return 'Management'
  if (normalized.includes('host') || normalized.includes('service') || normalized.includes('runner') || normalized.includes('waiter')) return 'Service'
  return 'Other'
}

function getScheduleAreaIcon(area) {
  const normalized = `${area ?? ''}`.trim().toLowerCase()
  if (normalized.includes('coffee') || normalized.includes('morning')) return '☕'
  if (normalized.includes('bar')) return '🍸'
  if (normalized.includes('kitchen') || normalized.includes('chef') || normalized.includes('cook')) return '👨‍🍳'
  if (normalized.includes('runner')) return '🏃'
  if (normalized.includes('service') || normalized.includes('waiter')) return '🍽'
  if (normalized.includes('host') || normalized.includes('reception')) return '🛎'
  if (normalized.includes('terrace') || normalized.includes('garden')) return '🌿'
  if (normalized.includes('vip') || normalized.includes('lounge')) return '✨'
  if (normalized.includes('management') || normalized.includes('manager')) return '👔'
  return '📋'
}

function formatDayCoverageBadgeIcon(status) {
  if (status === 'covered') return '🟢'
  if (status === 'conflict') return '⛔'
  if (status === 'understaffed') return '⚠️'
  if (status === 'overstaffed') return '🟡'
  return '⚪'
}

function formatScheduleCellCoverageLabel(cell) {
  if (cell.hasRealConflict) return 'Conflict'
  if (cell.staffingState === 'overstaffed') return 'Overstaffed'
  if (cell.staffingState === 'understaffed' || cell.staffingState === 'attention') return 'Understaffed'
  if (cell.assignedCount === 0) return 'Empty'
  return 'Covered'
}

function formatScheduleShiftDisplayName(templateName, department) {
  const name = `${templateName ?? ''}`.trim()
  const dept = `${department ?? ''}`.trim()

  const toTitleWords = (value) => (
    `${value ?? ''}`
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
  )

  if (!name) return 'Shift'
  if (!dept) return toTitleWords(name)

  const normalizedName = name.toLowerCase()
  const normalizedDept = dept.toLowerCase()

  if (normalizedName.startsWith(normalizedDept)) {
    const remainder = name.slice(dept.length).trim().replace(/^[-–—\s]+/, '')
    if (remainder) return toTitleWords(remainder)
  }

  return toTitleWords(name)
}

function formatScheduleCellCoverageDetail(cell) {
  return formatScheduleCoverageStatusLabel({
    requiredCount: cell.requiredCount,
    assignedCount: cell.assignedCount,
    hasConflict: cell.hasRealConflict,
  })
}

function formatDayCoverageBadgeLabel(summary) {
  if (summary?.statusLabel) return summary.statusLabel
  if (summary?.status === 'covered' || summary?.status === 'overstaffed') return 'Covered'
  return 'Empty'
}

function formatTemplateRequiredCount(minRequired, maxRequired) {
  if (minRequired === null) return null
  if (minRequired === maxRequired) {
    return `${minRequired} Employee${minRequired === 1 ? '' : 's'}`
  }
  return `${minRequired}–${maxRequired} Employees`
}

function getEmployeeWorkloadStatus(scheduledHours, weeklyTarget) {
  const tracker = getEmployeeHoursTrackerState(scheduledHours, weeklyTarget)

  if (tracker.status === 'over') {
    return { label: 'Overtime', tone: 'overtime', icon: '🔴' }
  }

  if (tracker.status === 'complete' || (tracker.hasTarget && tracker.barWidth >= 85)) {
    return { label: 'Near Limit', tone: 'near-limit', icon: '🟡' }
  }

  return { label: 'Available', tone: 'available', icon: '🟢' }
}

function doesShiftMatchScheduleVisualFilter(shift, employeeName, { focusedEmployeeId, searchNeedle }) {
  const matchesFocus = !focusedEmployeeId || String(shift.employeeId ?? '') === focusedEmployeeId
  const matchesSearch = !searchNeedle || `${employeeName}`.toLowerCase().includes(searchNeedle)
  return matchesFocus && matchesSearch
}

function buildEmployeePositionOptions(positions = []) {
  const merged = []
  const seen = new Set()

  const addPosition = (position) => {
    const name = `${position?.name ?? ''}`.trim()
    if (!name) return
    const key = name.toLowerCase()
    if (seen.has(key)) return

    seen.add(key)
    merged.push({
      id: position?.id ?? null,
      name,
      department: position?.department ?? inferPositionDepartment(name),
      sortOrder: position?.sortOrder ?? Number.MAX_SAFE_INTEGER,
    })
  }

  defaultStaffPositionOptions.forEach((name, index) => {
    const existing = (positions ?? []).find((position) => `${position.name ?? ''}`.trim().toLowerCase() === name.toLowerCase())
    addPosition(existing ?? {
      id: null,
      name,
      department: inferPositionDepartment(name),
      sortOrder: index + 1,
    })
  })

  ;(positions ?? []).forEach((position) => addPosition(position))

  return merged.sort((a, b) => {
    const sortA = Number.isFinite(Number(a.sortOrder)) ? Number(a.sortOrder) : Number.MAX_SAFE_INTEGER
    const sortB = Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : Number.MAX_SAFE_INTEGER
    if (sortA !== sortB) return sortA - sortB
    return a.name.localeCompare(b.name)
  })
}

function composeShiftTemplates(remoteTemplates = []) {
  return sortShiftTemplates(
    remoteTemplates
      .filter((template) => (template.name || '').trim())
      .map((template) => ({
        ...template,
        id: `supabase-${template.id}`,
        templateId: template.id,
        isBuiltIn: false,
      })),
  )
}

function buildScheduleGridTemplates(shiftTemplates = [], visibleWeekShifts = []) {
  const usedTemplateIds = new Set(
    visibleWeekShifts
      .map((shift) => resolveShiftTemplateId(shift))
      .filter(Boolean)
      .map((id) => String(id)),
  )

  const eligibleTemplates = shiftTemplates.filter((template) => {
    if (template.isActive !== false) return true
    const templateId = resolveShiftTemplateId(template)
    return templateId && usedTemplateIds.has(String(templateId))
  })

  if (eligibleTemplates.length > 0) {
    return sortShiftTemplates(eligibleTemplates)
  }

  const derived = new Map()

  visibleWeekShifts.forEach((shift) => {
    const templateId = resolveShiftTemplateId(shift)
    const key = templateId
      ? `id:${templateId}`
      : `legacy:${normalizeTimeValue(shift.startTime)}:${normalizeTimeValue(shift.endTime)}:${`${shift.area ?? ''}`.trim().toLowerCase()}:${`${shift.role ?? ''}`.trim().toLowerCase()}`

    if (derived.has(key)) return

    const name = `${shift.role ?? shift.area ?? ''}`.trim() || 'Scheduled shift'
    derived.set(key, {
      id: templateId ? `supabase-${templateId}` : `derived-${derived.size + 1}`,
      templateId: templateId ?? null,
      name,
      startTime: shift.startTime ?? '',
      endTime: shift.endTime ?? '',
      defaultRole: shift.role ?? '',
      defaultArea: shift.area ?? '',
      defaultRequiredCount: 1,
      notes: '',
      isBuiltIn: false,
    })
  })

  return Array.from(derived.values())
}

function getTemplateDefaultRequiredCount(template) {
  const parsed = Number(template?.defaultRequiredCount ?? template?.default_required_count)
  if (!Number.isFinite(parsed) || parsed < 0) return 1
  return Math.min(99, Math.floor(parsed))
}

function getAssignmentStaffingSummary(cell, template, selectedEmployees = []) {
  const required = Number(cell?.requiredCount ?? getTemplateDefaultRequiredCount(template)) || 0
  const alreadyAssigned = Number(cell?.assignedCount) || 0
  const existingEmployeeIds = new Set(
    (cell?.shifts ?? [])
      .map((shift) => String(shift.employeeId ?? ''))
      .filter(Boolean),
  )
  const newSelectedCount = selectedEmployees.filter(
    (employee) => !existingEmployeeIds.has(String(employee.id)),
  ).length
  const projectedTotal = alreadyAssigned + newSelectedCount
  const delta = required - projectedTotal

  if (delta > 0) {
    return { required, selected: selectedEmployees.length, label: `Remaining ${delta}`, tone: 'remaining' }
  }
  if (delta < 0) {
    return { required, selected: selectedEmployees.length, label: `Extra ${Math.abs(delta)}`, tone: 'extra' }
  }
  return { required, selected: selectedEmployees.length, label: 'Covered', tone: 'covered' }
}

function formatStaffingNotice(requiredCount, assignedCount) {
  const required = Number(requiredCount) || 0
  const assigned = Number(assignedCount) || 0
  if (assigned > required) {
    return `Assigned successfully. ✓ Covered +${assigned - required} extra.`
  }
  if (assigned < required) {
    return `Assigned successfully. Missing ${required - assigned}.`
  }
  return 'Assigned successfully. ✓ Covered.'
}

function getUniqueTemplateAreas(shiftTemplates = []) {
  return [...new Set(
    shiftTemplates
      .map((template) => `${template?.defaultArea ?? ''}`.trim())
      .filter(Boolean),
  )]
}

function getTemplateAreaFormState(areaValue) {
  const normalized = `${areaValue ?? ''}`.trim()
  if (!normalized) {
    return { defaultAreaOption: '', defaultAreaCustom: '' }
  }

  const preset = scheduleAreaOptions.find(
    (option) => option !== 'Other' && option.toLowerCase() === normalized.toLowerCase(),
  )
  if (preset) {
    return { defaultAreaOption: preset, defaultAreaCustom: '' }
  }

  return { defaultAreaOption: 'Other', defaultAreaCustom: normalized }
}

function resolveTemplateDefaultArea(templateForm, shiftTemplates = []) {
  if (templateForm.defaultAreaOption === 'Other') {
    const custom = `${templateForm.defaultAreaCustom ?? ''}`.trim()
    if (custom) return custom
  } else if (`${templateForm.defaultAreaOption ?? ''}`.trim()) {
    return `${templateForm.defaultAreaOption}`.trim()
  }

  const legacy = `${templateForm.defaultArea ?? ''}`.trim()
  if (legacy) return legacy

  const uniqueAreas = getUniqueTemplateAreas(shiftTemplates)
  if (uniqueAreas.length === 1) return uniqueAreas[0]

  return ''
}

function buildTemplateForm(template = null, shiftTemplates = []) {
  const uniqueAreas = getUniqueTemplateAreas(shiftTemplates)
  const rawArea = template?.defaultArea ?? (uniqueAreas.length === 1 ? uniqueAreas[0] : '')
  const areaState = getTemplateAreaFormState(rawArea)
  const defaultAreaOption = areaState.defaultAreaOption || (uniqueAreas.length === 0 ? 'Service' : '')

  return {
    name: template?.name ?? '',
    startTime: normalizeTimeValue(template?.startTime),
    endTime: normalizeTimeValue(template?.endTime),
    defaultRole: template?.defaultRole ?? '',
    defaultAreaOption,
    defaultAreaCustom: areaState.defaultAreaCustom,
    defaultRequiredCount: getTemplateDefaultRequiredCount(template),
    notes: template?.notes ?? '',
  }
}

function getGridShiftIntegrityOptions(shiftTemplates) {
  return {
    knownTemplateIds: buildKnownShiftTemplateIdSet(shiftTemplates),
    requireTemplateId: true,
    shiftTemplatesForInference: shiftTemplates,
  }
}

function getLegacyShiftIntegrityOptions(shiftTemplates, { requireTemplateId = false } = {}) {
  return {
    knownTemplateIds: buildKnownShiftTemplateIdSet(shiftTemplates),
    requireTemplateId,
    shiftTemplatesForInference: shiftTemplates,
  }
}

function getInitials(name) {
  const parts = `${name || ''}`.trim().split(/\s+/).filter(Boolean)

  if (parts.length >= 2) {
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
  }

  if (parts.length === 1 && parts[0].length >= 2) {
    return parts[0].slice(0, 2).toUpperCase()
  }

  return (parts[0]?.[0] ?? 'G').toUpperCase()
}

function formatDashboardHeroDate(date, timeZone = '') {
  const resolvedTimeZone = `${timeZone ?? ''}`.trim() || undefined
  const options = resolvedTimeZone ? { timeZone: resolvedTimeZone } : {}

  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', ...options }).format(date)
  const monthDay = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', ...options }).format(date)

  return `${weekday} • ${monthDay}`
}

function TodayCollapsiblePanel({
  panelId,
  defaultExpanded = true,
  title,
  ariaLabel,
  summary = '',
  className = '',
  children,
}) {
  const [isExpanded, setIsExpanded] = useState(() => readTodayPanelExpanded(panelId, defaultExpanded))

  useEffect(() => {
    if (hasTodayPanelStoredPreference(panelId)) return
    setIsExpanded(defaultExpanded)
  }, [panelId, defaultExpanded])

  const handleToggle = () => {
    setIsExpanded((current) => {
      const next = !current
      writeTodayPanelExpanded(panelId, next)
      return next
    })
  }

  return (
    <section
      className={`today-panel today-collapsible-panel ${isExpanded ? 'is-expanded' : 'is-collapsed'} ${className}`.trim()}
      aria-label={ariaLabel}
    >
      <button
        type="button"
        className="today-collapsible-header"
        onClick={handleToggle}
        aria-expanded={isExpanded}
      >
        <div className="today-collapsible-header-copy">
          <h3>{title}</h3>
          {!isExpanded && summary ? (
            <p className="today-collapsible-summary">{summary}</p>
          ) : null}
        </div>
        <span className={`today-collapsible-chevron${isExpanded ? ' is-expanded' : ''}`} aria-hidden="true">▾</span>
      </button>
      <div className="today-collapsible-body">
        {children}
      </div>
    </section>
  )
}

function CommandCenterView({
  statusSummary,
  timelineEvents,
  teamTodayGroups,
  teamTodayStatus,
  attentionItems,
  announcements = [],
  announcementRole = '',
  announcementEmployeeDepartment = '',
  isAnnouncementsSaving = false,
  isScheduleLoading,
  now = new Date(),
  todayKey = '',
  onViewStock,
  onViewSchedule,
  onViewTasks,
  onViewReservations,
  onAttentionItemClick,
  attentionPermissions = {},
  onMarkAnnouncementSeen,
}) {
  const attentionHasUrgent = hasUrgentAttentionItems(attentionItems)
  const showStockAttention = Boolean(onViewStock) && attentionItems.some((item) => (
    item.key.startsWith('stock:')
    || item.key.startsWith('stock-module:')
    || item.key.startsWith('orders:')
  ))
  const showTasksAttention = Boolean(onViewTasks) && attentionItems.some((item) => (
    item.key.startsWith('task:') || item.key.startsWith('task-due:')
  ))
  const showScheduleAttention = Boolean(onViewSchedule) && attentionItems.some((item) => item.key === 'schedule-issues')
  const showReservationAttention = Boolean(onViewReservations) && attentionItems.some((item) => item.key.startsWith('reservation:'))
  const showStockStatus = Boolean(statusSummary.stockSummaryLine)

  return (
    <div className="today-page" aria-label="Today">
      <TodayAnnouncementsPanel
        announcements={announcements}
        role={announcementRole}
        employeeDepartment={announcementEmployeeDepartment}
        isSaving={isAnnouncementsSaving}
        onMarkSeen={onMarkAnnouncementSeen}
        collapsible
      />

      <TodayStatusCards
        statusSummary={statusSummary}
        showStock={showStockStatus}
      />

      <div className="today-layout">
        <div className="today-main">
          <TodayCollapsiblePanel
            panelId={TODAY_PANEL_IDS.SERVICE_TIMELINE}
            defaultExpanded={getDefaultTodayPanelExpanded(TODAY_PANEL_IDS.SERVICE_TIMELINE)}
            title="Service Timeline"
            ariaLabel="Service timeline"
            summary={formatTodayTimelineCollapsedSummary(timelineEvents, { isLoading: isScheduleLoading, now })}
          >
            <TodayTimeline
              events={timelineEvents}
              isLoading={isScheduleLoading}
              now={now}
              todayKey={todayKey}
            />
          </TodayCollapsiblePanel>

          <TodayCollapsiblePanel
            panelId={TODAY_PANEL_IDS.TEAM_TODAY}
            defaultExpanded={getDefaultTodayPanelExpanded(TODAY_PANEL_IDS.TEAM_TODAY, {
              hasShiftsToday: hasTeamTodayShifts(teamTodayGroups),
            })}
            title="Team Today"
            ariaLabel="Team today"
            summary={formatTeamTodayCollapsedSummary({
              groups: teamTodayGroups,
              teamStatus: teamTodayStatus,
              isLoading: isScheduleLoading,
            })}
          >
            {isScheduleLoading ? (
              <p className="today-empty-note">Loading team schedule…</p>
            ) : teamTodayGroups.length === 0 ? (
              <p className="today-empty-note">No shifts scheduled today.</p>
            ) : (
              <TeamTodayGroupsList
                groups={teamTodayGroups}
                groupClassName="today-team-group"
                departmentClassName="today-team-department"
                listClassName="today-team-list"
              />
            )}
          </TodayCollapsiblePanel>
        </div>

        <aside className="today-aside">
          <TodayCollapsiblePanel
            panelId={TODAY_PANEL_IDS.ATTENTION}
            defaultExpanded={getDefaultTodayPanelExpanded(TODAY_PANEL_IDS.ATTENTION, { hasUrgentAttention: attentionHasUrgent })}
            title="Attention"
            ariaLabel="Attention"
            summary={formatAttentionCollapsedSummary(attentionItems)}
          >
            <TodayAttentionPanel
              attentionItems={attentionItems}
              attentionPermissions={attentionPermissions}
              onAttentionItemClick={onAttentionItemClick}
              showReservationAttention={showReservationAttention}
              showStockAttention={showStockAttention}
              showTasksAttention={showTasksAttention}
              showScheduleAttention={showScheduleAttention}
              onViewReservations={onViewReservations}
              onViewStock={onViewStock}
              onViewTasks={onViewTasks}
              onViewSchedule={onViewSchedule}
            />
          </TodayCollapsiblePanel>
        </aside>
      </div>
    </div>
  )
}

function toDateInputValue(value) {
  if (!value) return ''

  const trimmed = `${value}`.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed
  }

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) {
    return ''
  }

  return parsed.toISOString().split('T')[0]
}

function formatHireDate(value) {
  if (!value) return 'TBD'

  const trimmed = `${value}`.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split('-')
    const parsed = new Date(`${year}-${month}-${day}`)
    return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) {
    return trimmed
  }

  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function normalizeNumericValue(value) {
  if (value === null || value === undefined || value === '') return null

  const trimmed = `${value}`.trim()
  if (!trimmed) return null
  if (trimmed.toLowerCase() === 'tbd' || trimmed.toLowerCase() === 'n/a') return null

  const cleaned = trimmed.replace(/[$,\s]/g, '')
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function formatCurrency(value) {
  const amount = Number(value) || 0
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount)
}

function getInventoryStatus(quantity, minimumQuantity, selectedStatus = 'In Stock') {
  const qty = Number(quantity) || 0
  const minQty = Number(minimumQuantity) || 0

  if (qty <= 0) return 'Out of Stock'
  if (qty <= minQty) return 'Low Stock'

  return selectedStatus === 'Low Stock' || selectedStatus === 'Out of Stock' ? 'In Stock' : selectedStatus
}

function splitEmployeeFullName(fullName = '') {
  const parts = `${fullName}`.trim().split(/\s+/).filter(Boolean)

  if (parts.length === 0) {
    return { firstName: '', lastName: '' }
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' }
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  }
}

function mergeEmployeeFullName(firstName = '', lastName = '') {
  return [firstName, lastName]
    .map((part) => `${part ?? ''}`.trim())
    .filter(Boolean)
    .join(' ')
}

function normalizeEmployeePhoneForDisplay(phone = '') {
  const trimmed = `${phone}`.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('00')) {
    return `+${trimmed.slice(2).replace(/\s/g, '')}`
  }
  return trimmed
}

function dismissEmployeeFormOverlayPickers() {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
}

const EMPLOYEE_FORM_SELECT_Z_INDEX = 1300
const EMPLOYEE_DATE_PICKER_Z_INDEX = 1250
const EMPLOYEE_DATE_PICKER_WIDTH = 300

const EMPLOYEE_CATALOG_VENUE_TYPE = 'restaurant'

function buildEmployeeCatalogDepartmentOptions(currentDepartment) {
  const catalogDepartments = getDepartmentsForVenueType(EMPLOYEE_CATALOG_VENUE_TYPE)
  const catalogOptions = catalogDepartments.map((entry) => ({
    key: entry.key,
    label: entry.label,
    aliases: entry.aliases,
  }))

  return preserveLegacyCatalogOption(currentDepartment, catalogOptions).map((entry) => ({
    value: entry.label,
    label: entry.label,
  }))
}

function buildEmployeeCatalogPrimaryPositionOptions(department, primaryPosition) {
  const departmentEntry = findDepartment(department)
  const catalogPositions = departmentEntry
    ? getPositionsForDepartment(departmentEntry.key, {
      venueTypeKey: EMPLOYEE_CATALOG_VENUE_TYPE,
      includeOptional: true,
    })
    : []

  const catalogOptions = catalogPositions.map((entry) => ({
    key: entry.key,
    label: entry.label,
    aliases: entry.aliases,
    departmentKey: entry.departmentKey,
  }))

  return preserveLegacyCatalogOption(primaryPosition, catalogOptions, {
    type: 'position',
    departmentKey: departmentEntry?.key ?? '',
  }).map((entry) => ({
    name: entry.label,
  }))
}

function getEmployeePrimaryPositionDepartmentMismatch(department, primaryPosition) {
  const trimmedPosition = `${primaryPosition ?? ''}`.trim()
  if (!trimmedPosition) return false

  const departmentEntry = findDepartment(department)
  if (!departmentEntry) return false

  if (findPosition(trimmedPosition, departmentEntry.key)) return false

  const positionEntry = findPosition(trimmedPosition)
  return positionEntry !== null && positionEntry.departmentKey !== departmentEntry.key
}

function employeeDepartmentOptionValuesMatch(left, right) {
  if (left === right) return true

  const leftEntry = findDepartment(left)
  const rightEntry = findDepartment(right)
  if (leftEntry && rightEntry) return leftEntry.key === rightEntry.key

  return departmentLabelsMatch(left, right)
}

function employeePositionOptionValuesMatch(left, right) {
  if (left === right) return true

  const leftEntry = findPosition(left)
  const rightEntry = findPosition(right)
  if (leftEntry && rightEntry) return leftEntry.key === rightEntry.key

  return positionLabelsMatch(left, right)
}

const EMPLOYEE_SHIFT_OPTIONS = [
  { value: 'Flexible / Rotating', label: 'Flexible / Rotating' },
  { value: 'Morning', label: 'Morning' },
  { value: 'Evening', label: 'Evening' },
  { value: 'Night', label: 'Night' },
]

const EMPLOYEE_STATUS_OPTIONS = [
  { value: 'Working', label: 'Working' },
  { value: 'Break', label: 'Break' },
  { value: 'Day Off', label: 'Day Off' },
  { value: 'Leave', label: 'Leave' },
]

function computeEmployeePremiumSelectPosition(anchorRect) {
  const viewportPadding = 16
  const menuWidth = Math.min(Math.max(anchorRect.width, 200), window.innerWidth - viewportPadding * 2)
  const maxLeft = window.innerWidth - menuWidth - viewportPadding
  const left = Math.max(viewportPadding, Math.min(anchorRect.left, maxLeft))
  const menuMaxHeight = 280
  let top = anchorRect.bottom + 6

  if (top + menuMaxHeight > window.innerHeight - viewportPadding) {
    top = Math.max(viewportPadding, anchorRect.top - menuMaxHeight - 6)
  }

  return { top, left, width: menuWidth }
}

function computeEmployeeDatePickerPosition(anchorRect) {
  const viewportPadding = 16
  const pickerWidth = Math.min(EMPLOYEE_DATE_PICKER_WIDTH, window.innerWidth - viewportPadding * 2)
  const maxLeft = window.innerWidth - pickerWidth - viewportPadding
  const preferredLeft = anchorRect.right - pickerWidth
  const left = Math.max(viewportPadding, Math.min(preferredLeft, maxLeft))
  const top = anchorRect.bottom + 6
  const maxTop = window.innerHeight - viewportPadding

  return {
    top: Math.min(top, maxTop),
    left,
    width: pickerWidth,
  }
}

function formatEmployeeFormDateLabel(value) {
  const normalized = normalizeReservationDateKey(value)
  if (!normalized) return ''

  const [year, month, day] = normalized.split('-')
  const parsed = new Date(`${year}-${month}-${day}`)
  if (Number.isNaN(parsed.getTime())) return normalized

  return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function EmployeePremiumDateField({
  value,
  onChange,
  todayKey = '',
  id,
}) {
  const normalizedValue = normalizeReservationDateKey(value)
  const workspaceTodayKey = normalizeReservationDateKey(todayKey) || normalizedValue
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [pickerPosition, setPickerPosition] = useState(null)
  const rootRef = useRef(null)
  const anchorRef = useRef(null)
  const displayLabel = formatEmployeeFormDateLabel(normalizedValue)

  const updatePickerPosition = useCallback(() => {
    if (!anchorRef.current) return
    setPickerPosition(computeEmployeeDatePickerPosition(anchorRef.current.getBoundingClientRect()))
  }, [])

  useEffect(() => {
    if (!isPickerOpen) {
      setPickerPosition(null)
      return undefined
    }

    updatePickerPosition()

    const handleClickOutside = (event) => {
      if (rootRef.current?.contains(event.target)) return
      if (event.target instanceof Element && event.target.closest('.employee-premium-date-picker-portal')) return
      setIsPickerOpen(false)
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsPickerOpen(false)
    }

    let repositionFrameId = null
    const scheduleReposition = () => {
      if (repositionFrameId !== null) cancelAnimationFrame(repositionFrameId)
      repositionFrameId = requestAnimationFrame(() => {
        repositionFrameId = null
        updatePickerPosition()
      })
    }

    const modalScrollContainer = anchorRef.current?.closest('.employee-premium-form-modal')

    document.addEventListener('click', handleClickOutside, true)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', scheduleReposition)
    window.addEventListener('scroll', scheduleReposition, true)
    modalScrollContainer?.addEventListener('scroll', scheduleReposition, { passive: true })

    return () => {
      document.removeEventListener('click', handleClickOutside, true)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', scheduleReposition)
      window.removeEventListener('scroll', scheduleReposition, true)
      modalScrollContainer?.removeEventListener('scroll', scheduleReposition)
      if (repositionFrameId !== null) cancelAnimationFrame(repositionFrameId)
    }
  }, [isPickerOpen, updatePickerPosition])

  const openPicker = () => setIsPickerOpen(true)
  const closePicker = () => setIsPickerOpen(false)

  const handleSelectDate = (dateKey) => {
    onChange(normalizeReservationDateKey(dateKey))
    closePicker()
    requestAnimationFrame(() => {
      if (anchorRef.current) {
        focusNextEmployeeFormField(anchorRef.current)
      }
    })
  }

  const pickerPortal = isPickerOpen && pickerPosition && typeof document !== 'undefined'
    ? createPortal(
      <div
        className="employee-premium-date-picker-portal"
        style={{
          position: 'fixed',
          top: `${pickerPosition.top}px`,
          left: `${pickerPosition.left}px`,
          width: `${pickerPosition.width}px`,
          zIndex: EMPLOYEE_DATE_PICKER_Z_INDEX,
        }}
      >
        <HostWorkspaceDatePicker
          selectedDateKey={normalizedValue || workspaceTodayKey}
          workspaceTodayKey={workspaceTodayKey}
          onSelectDate={handleSelectDate}
          onClose={closePicker}
        />
      </div>,
      document.body,
    )
    : null

  return (
    <div className="employee-premium-date-field" ref={rootRef}>
      <button
        ref={anchorRef}
        id={id}
        type="button"
        className="employee-premium-date-trigger"
        onClick={openPicker}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            openPicker()
          }
        }}
        aria-haspopup="dialog"
        aria-expanded={isPickerOpen}
        aria-label="Start date"
      >
        <span className={`employee-premium-date-value${displayLabel ? '' : ' is-placeholder'}`}>
          {displayLabel || 'Select start date'}
        </span>
        <ReservationCalendarIcon className="employee-premium-date-icon" />
      </button>
      {pickerPortal}
    </div>
  )
}

function EmployeePremiumFieldSelect({
  value,
  onChange,
  options,
  ariaLabel,
  id,
  menuId,
  openMenuId,
  setOpenMenuId,
  valuesMatch = (left, right) => left === right,
}) {
  const isOpen = openMenuId === menuId
  const [menuPosition, setMenuPosition] = useState(null)
  const [activeIndex, setActiveIndex] = useState(-1)
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const selectedOption = options.find((option) => valuesMatch(option.value, value)) ?? options[0]

  const setIsOpen = useCallback((nextOpen) => {
    if (nextOpen) {
      dismissEmployeeFormOverlayPickers()
    }
    setOpenMenuId(nextOpen ? menuId : null)
  }, [menuId, setOpenMenuId])

  const updateMenuPosition = useCallback(() => {
    if (!triggerRef.current) return
    setMenuPosition(computeEmployeePremiumSelectPosition(triggerRef.current.getBoundingClientRect()))
  }, [])

  useEffect(() => {
    if (!isOpen) {
      setActiveIndex(-1)
      setMenuPosition(null)
      return undefined
    }

    const selectedIndex = options.findIndex((option) => valuesMatch(option.value, value))
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0)
    updateMenuPosition()

    const handlePointerDown = (event) => {
      if (rootRef.current?.contains(event.target)) return
      if (event.target instanceof Element && event.target.closest('.employee-premium-field-select-portal')) return
      setIsOpen(false)
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
        return
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveIndex((current) => Math.min(options.length - 1, Math.max(0, current) + 1))
        return
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveIndex((current) => Math.max(0, current - 1))
        return
      }

      if (event.key === 'Enter' && activeIndex >= 0) {
        event.preventDefault()
        onChange(options[activeIndex].value)
        setIsOpen(false)
        requestAnimationFrame(() => {
          if (triggerRef.current) {
            focusNextEmployeeFormField(triggerRef.current)
          }
        })
      }
    }

    const handleReposition = () => updateMenuPosition()

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleReposition)
    window.addEventListener('scroll', handleReposition, true)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleReposition)
      window.removeEventListener('scroll', handleReposition, true)
    }
  }, [activeIndex, isOpen, onChange, options, setIsOpen, updateMenuPosition, value, valuesMatch])

  const menuPortal = isOpen && menuPosition && typeof document !== 'undefined'
    ? createPortal(
      <ul
        className="employee-premium-field-select-menu employee-premium-field-select-portal"
        role="listbox"
        aria-label={ariaLabel}
        style={{
          position: 'fixed',
          top: `${menuPosition.top}px`,
          left: `${menuPosition.left}px`,
          width: `${menuPosition.width}px`,
          zIndex: EMPLOYEE_FORM_SELECT_Z_INDEX,
        }}
      >
        {options.map((option, index) => (
          <li key={option.value} role="presentation">
            <button
              type="button"
              role="option"
              className={`employee-premium-field-select-option${valuesMatch(option.value, value) ? ' is-selected' : ''}${index === activeIndex ? ' is-active' : ''}`}
              aria-selected={valuesMatch(option.value, value)}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => {
                onChange(option.value)
                setIsOpen(false)
              }}
            >
              {option.label}
            </button>
          </li>
        ))}
      </ul>,
      document.body,
    )
    : null

  return (
    <>
      <div className={`employee-premium-field-select${isOpen ? ' is-open' : ''}`} ref={rootRef}>
        <button
          ref={triggerRef}
          id={id}
          type="button"
          className="employee-premium-field-select-trigger"
          onClick={() => setIsOpen(!isOpen)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              if (!isOpen) {
                setIsOpen(true)
              }
              return
            }
            if (event.key === ' ') {
              event.preventDefault()
              setIsOpen(!isOpen)
            }
          }}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-label={ariaLabel}
        >
          <span className="employee-premium-field-select-value">{selectedOption?.label ?? ''}</span>
          <span className="employee-premium-field-select-chevron" aria-hidden="true">▾</span>
        </button>
      </div>
      {menuPortal}
    </>
  )
}

function filterEmployeePrimaryPositionPickerOptions(options, searchQuery) {
  if (!Array.isArray(options)) return []

  const needle = `${searchQuery ?? ''}`.trim().toLowerCase()
  if (!needle) return options

  return options.filter((option) => {
    const searchTokens = []
    const name = `${option?.name ?? ''}`.trim()
    const label = `${option?.label ?? ''}`.trim()
    const value = `${option?.value ?? ''}`.trim()

    if (name) searchTokens.push(name)
    if (label) searchTokens.push(label)
    if (value) searchTokens.push(value)

    for (const alias of option?.aliases ?? []) {
      const trimmed = `${alias ?? ''}`.trim()
      if (trimmed) searchTokens.push(trimmed)
    }

    return searchTokens.some((token) => token.toLowerCase().includes(needle))
  })
}

function EmployeePremiumPositionField({
  value,
  onChange,
  options,
  menuId,
  openMenuId,
  setOpenMenuId,
  id,
  placeholder = 'Select primary position',
  valuesMatch = (left, right) => left === right,
}) {
  const isOpen = openMenuId === menuId
  const [menuPosition, setMenuPosition] = useState(null)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [searchQuery, setSearchQuery] = useState('')
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const searchInputRef = useRef(null)

  const filteredOptions = useMemo(
    () => filterEmployeePrimaryPositionPickerOptions(options, searchQuery),
    [options, searchQuery],
  )

  const displayLabel = `${value ?? ''}`.trim()

  const setIsOpen = useCallback((nextOpen) => {
    if (nextOpen) {
      dismissEmployeeFormOverlayPickers()
    }
    setOpenMenuId(nextOpen ? menuId : null)
  }, [menuId, setOpenMenuId])

  const updateMenuPosition = useCallback(() => {
    if (!triggerRef.current) return
    setMenuPosition(computeEmployeePremiumSelectPosition(triggerRef.current.getBoundingClientRect()))
  }, [])

  const handleSelectOption = useCallback((optionValue) => {
    onChange(optionValue)
    setIsOpen(false)
    requestAnimationFrame(() => {
      if (triggerRef.current) {
        focusNextEmployeeFormField(triggerRef.current)
      }
    })
  }, [onChange, setIsOpen])

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('')
      setActiveIndex(-1)
      setMenuPosition(null)
      return undefined
    }

    const selectedIndex = filteredOptions.findIndex((option) => valuesMatch(option.name, value))
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : (filteredOptions.length > 0 ? 0 : -1))
    updateMenuPosition()

    const handleClickOutside = (event) => {
      if (rootRef.current?.contains(event.target)) return
      if (event.target instanceof Element && event.target.closest('.employee-premium-position-picker-portal')) return
      setIsOpen(false)
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setIsOpen(false)
        requestAnimationFrame(() => triggerRef.current?.focus())
        return
      }

      if (event.target instanceof HTMLInputElement && event.target.classList.contains('employee-premium-position-picker-search')) {
        if (event.key === 'ArrowDown' && filteredOptions.length > 0) {
          event.preventDefault()
          setActiveIndex(0)
        }
        return
      }

      if (!filteredOptions.length) return

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveIndex((current) => Math.min(filteredOptions.length - 1, Math.max(0, current) + 1))
        return
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveIndex((current) => Math.max(0, current - 1))
        return
      }

      if (event.key === 'Enter' && activeIndex >= 0) {
        event.preventDefault()
        handleSelectOption(filteredOptions[activeIndex].name)
      }
    }

    const handleReposition = () => updateMenuPosition()

    document.addEventListener('click', handleClickOutside, true)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleReposition)
    window.addEventListener('scroll', handleReposition, true)

    const modalScrollContainer = triggerRef.current?.closest('.employee-premium-form-modal')
    modalScrollContainer?.addEventListener('scroll', handleReposition, { passive: true })

    return () => {
      document.removeEventListener('click', handleClickOutside, true)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleReposition)
      window.removeEventListener('scroll', handleReposition, true)
      modalScrollContainer?.removeEventListener('scroll', handleReposition)
    }
  }, [activeIndex, filteredOptions, handleSelectOption, isOpen, setIsOpen, updateMenuPosition, value, valuesMatch])

  const menuPortal = isOpen && menuPosition && typeof document !== 'undefined'
    ? createPortal(
      <div
        className="employee-premium-position-picker-portal employee-premium-field-select-portal"
        style={{
          position: 'fixed',
          top: `${menuPosition.top}px`,
          left: `${menuPosition.left}px`,
          width: `${menuPosition.width}px`,
          zIndex: EMPLOYEE_FORM_SELECT_Z_INDEX,
        }}
      >
        <div className="employee-premium-position-picker-search-wrap">
          <input
            ref={searchInputRef}
            type="search"
            className="employee-premium-position-picker-search"
            value={searchQuery}
            placeholder="Search positions"
            aria-label="Search positions"
            autoComplete="off"
            enterKeyHint="search"
            onChange={(event) => {
              setSearchQuery(event.target.value)
              setActiveIndex(0)
            }}
          />
        </div>
        <ul
          className="employee-premium-field-select-menu employee-premium-position-picker-menu"
          role="listbox"
          aria-label="Primary position options"
        >
          {filteredOptions.length > 0 ? filteredOptions.map((option, index) => (
            <li key={option.name} role="presentation">
              <button
                type="button"
                role="option"
                className={`employee-premium-field-select-option${valuesMatch(option.name, value) ? ' is-selected' : ''}${index === activeIndex ? ' is-active' : ''}`}
                aria-selected={valuesMatch(option.name, value)}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => handleSelectOption(option.name)}
              >
                {option.name}
              </button>
            </li>
          )) : (
            <li className="employee-premium-position-picker-empty" role="presentation">
              No matching positions
            </li>
          )}
        </ul>
      </div>,
      document.body,
    )
    : null

  return (
    <>
      <div className={`employee-premium-position-field${isOpen ? ' is-open' : ''}`} ref={rootRef}>
        <button
          ref={triggerRef}
          id={id}
          type="button"
          className="employee-premium-position-trigger"
          onClick={() => setIsOpen(!isOpen)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              setIsOpen(true)
              return
            }

            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setIsOpen(true)
            }
          }}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-label="Primary position"
        >
          <span className={`employee-premium-field-select-value${displayLabel ? '' : ' is-placeholder'}`}>
            {displayLabel || placeholder}
          </span>
          <span className="employee-premium-field-select-chevron" aria-hidden="true">▾</span>
        </button>
      </div>
      {menuPortal}
    </>
  )
}

function employeeAdditionalPositionMatchesSearch(position, searchQuery) {
  const needle = `${searchQuery ?? ''}`.trim().toLowerCase()
  if (!needle) return true

  const tokens = [`${position?.label ?? ''}`.trim()]
  for (const alias of position?.aliases ?? []) {
    const trimmed = `${alias ?? ''}`.trim()
    if (trimmed) tokens.push(trimmed)
  }

  return tokens.some((token) => token.toLowerCase().includes(needle))
}

function buildEmployeeAdditionalPositionCatalogGroups(additionalPositionNames = [], workspacePositions = []) {
  const departments = getDepartmentsForVenueType(EMPLOYEE_CATALOG_VENUE_TYPE, { includeOptional: true })

  const groups = departments.map((department) => ({
    departmentKey: department.key,
    departmentLabel: department.label,
    sortOrder: department.sortOrder,
    positions: getPositionsForDepartment(department.key, {
      venueTypeKey: EMPLOYEE_CATALOG_VENUE_TYPE,
      includeOptional: true,
    }).map((entry) => ({
      key: entry.key,
      label: entry.label,
      aliases: entry.aliases,
      departmentKey: entry.departmentKey,
      custom: false,
      workspacePositionId: null,
    })),
  }))

  const customByKey = new Map()

  for (const workspacePosition of workspacePositions ?? []) {
    const trimmed = `${workspacePosition?.name ?? ''}`.trim()
    if (!isEligibleEmployeeCustomGroupPositionLabel(trimmed)) continue

    customByKey.set(trimmed.toLowerCase(), {
      key: `custom:${workspacePosition.id ?? trimmed}`,
      label: trimmed,
      aliases: [],
      departmentKey: 'custom',
      custom: true,
      workspacePositionId: workspacePosition.id ?? null,
    })
  }

  for (const name of additionalPositionNames) {
    const trimmed = `${name ?? ''}`.trim()
    if (!isEligibleEmployeeCustomGroupPositionLabel(trimmed)) continue

    const normalized = trimmed.toLowerCase()
    if (customByKey.has(normalized)) continue

    const workspaceMatch = resolveWorkspacePositionByLabel(trimmed, workspacePositions)
    customByKey.set(normalized, {
      key: `custom:${workspaceMatch?.id ?? trimmed}`,
      label: trimmed,
      aliases: [],
      departmentKey: 'custom',
      custom: true,
      workspacePositionId: workspaceMatch?.id ?? null,
    })
  }

  const customPositions = [...customByKey.values()]
  if (customPositions.length > 0) {
    groups.push({
      departmentKey: 'custom',
      departmentLabel: 'Custom',
      sortOrder: Number.MAX_SAFE_INTEGER,
      positions: customPositions,
    })
  }

  return groups
}

function filterEmployeeAdditionalPositionGroups(groups, searchQuery) {
  if (!Array.isArray(groups)) return []

  const needle = `${searchQuery ?? ''}`.trim().toLowerCase()
  if (!needle) return groups

  return groups
    .map((group) => ({
      ...group,
      positions: group.positions.filter((position) => employeeAdditionalPositionMatchesSearch(position, needle)),
    }))
    .filter((group) => group.positions.length > 0)
}

function employeeAdditionalPositionIsSelected(selection, positionLabel) {
  return selection.some((entry) => employeePositionOptionValuesMatch(entry, positionLabel))
}

function employeeAdditionalPositionMatchesPrimary(position, primaryPosition) {
  const trimmedPrimary = `${primaryPosition ?? ''}`.trim()
  if (!trimmedPrimary) return false

  if (employeePositionOptionValuesMatch(position.label, trimmedPrimary)) return true
  return (position.aliases ?? []).some((alias) => employeePositionOptionValuesMatch(alias, trimmedPrimary))
}

function employeeAdditionalSelectionIncludesPrimary(selection, primaryPosition) {
  const trimmedPrimary = `${primaryPosition ?? ''}`.trim()
  if (!trimmedPrimary) return false

  return selection.some((entry) => employeePositionOptionValuesMatch(entry, trimmedPrimary))
}

function isWorkspaceCustomPositionLabel(label) {
  const trimmed = `${label ?? ''}`.trim()
  if (!trimmed) return false
  return findPosition(trimmed) === null
}

function isEligibleEmployeeCustomGroupPositionLabel(label) {
  const trimmed = `${label ?? ''}`.trim()
  if (!trimmed) return false
  if (!isWorkspaceCustomPositionLabel(trimmed)) return false
  if (findDepartment(trimmed)) return false
  return true
}

function removeAdditionalPositionValue(selection, label) {
  if (!Array.isArray(selection)) return []

  return selection.filter((entry) => !employeePositionOptionValuesMatch(entry, label))
}

function resolveWorkspacePositionByLabel(label, workspacePositions = []) {
  const normalized = `${label ?? ''}`.trim().toLowerCase()
  if (!normalized) return null

  return (workspacePositions ?? []).find(
    (position) => `${position?.name ?? ''}`.trim().toLowerCase() === normalized,
  ) ?? null
}

function employeeRecordReferencesPosition(employee, label, workspacePositionId) {
  if (!employee) return false

  const normalizedLabel = `${label ?? ''}`.trim().toLowerCase()
  if (!normalizedLabel && !workspacePositionId) return false

  if (`${employee.primaryPosition ?? ''}`.trim().toLowerCase() === normalizedLabel) return true

  const additional = Array.isArray(employee.additionalPositions) ? employee.additionalPositions : []
  if (additional.some((entry) => `${entry ?? ''}`.trim().toLowerCase() === normalizedLabel)) return true

  if (!Array.isArray(employee.positions)) return false

  return employee.positions.some((item) => (
    (workspacePositionId && String(item.id ?? '') === String(workspacePositionId))
    || `${item.name ?? ''}`.trim().toLowerCase() === normalizedLabel
  ))
}

function countOtherEmployeePositionUsage(label, workspacePositionId, employees = [], currentEmployeeId) {
  return (employees ?? []).filter((employee) => {
    if (currentEmployeeId && String(employee.id) === String(currentEmployeeId)) return false
    return employeeRecordReferencesPosition(employee, label, workspacePositionId)
  }).length
}

function buildEmployeeAdditionalPositionClosedDisplayLabel(selectedValues, emptyLabel = 'No additional positions') {
  if (!Array.isArray(selectedValues) || selectedValues.length === 0) return emptyLabel

  const joined = selectedValues.join(', ')
  if (joined.length <= 64) return joined

  return `${joined.slice(0, 61)}…`
}

function EmployeePremiumAdditionalPositionsField({
  value,
  onChange,
  groups,
  primaryPosition,
  menuId,
  openMenuId,
  setOpenMenuId,
  id,
  emptyLabel = 'No additional positions',
  onConfirmRemoveCustomPosition,
}) {
  const selectedValues = Array.isArray(value) ? value : []
  const isOpen = openMenuId === menuId
  const [menuPosition, setMenuPosition] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [draftSelection, setDraftSelection] = useState(selectedValues)
  const [removePending, setRemovePending] = useState(null)
  const [removeBlockNotice, setRemoveBlockNotice] = useState('')
  const [removeError, setRemoveError] = useState('')
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const removeDialogRef = useRef(null)
  const removeTriggerRef = useRef(null)

  const filteredGroups = useMemo(
    () => filterEmployeeAdditionalPositionGroups(groups, searchQuery),
    [groups, searchQuery],
  )

  const closedDisplayLabel = useMemo(
    () => buildEmployeeAdditionalPositionClosedDisplayLabel(selectedValues, emptyLabel),
    [emptyLabel, selectedValues],
  )

  const closedDisplayTitle = selectedValues.length > 0 ? selectedValues.join(', ') : undefined

  const setIsOpen = useCallback((nextOpen) => {
    if (nextOpen) {
      dismissEmployeeFormOverlayPickers()
    }
    setOpenMenuId(nextOpen ? menuId : null)
  }, [menuId, setOpenMenuId])

  const updateMenuPosition = useCallback(() => {
    if (!triggerRef.current) return
    setMenuPosition(computeEmployeePremiumSelectPosition(triggerRef.current.getBoundingClientRect()))
  }, [])

  const cancelPicker = useCallback(() => {
    setDraftSelection(selectedValues)
    setSearchQuery('')
    setIsOpen(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }, [selectedValues, setIsOpen])

  const applyPicker = useCallback(() => {
    onChange([...draftSelection])
    setSearchQuery('')
    setIsOpen(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }, [draftSelection, onChange, setIsOpen])

  const toggleDraftPosition = useCallback((positionLabel) => {
    const trimmedLabel = `${positionLabel ?? ''}`.trim()
    if (!trimmedLabel) return

    setDraftSelection((current) => {
      if (current.some((entry) => employeePositionOptionValuesMatch(entry, trimmedLabel))) {
        return current.filter((entry) => !employeePositionOptionValuesMatch(entry, trimmedLabel))
      }

      return [...current, trimmedLabel]
    })
  }, [])

  const cancelRemoveDialog = useCallback(() => {
    setRemovePending(null)
    setRemoveError('')
    requestAnimationFrame(() => removeTriggerRef.current?.focus())
  }, [])

  const requestRemoveCustomPosition = useCallback((position) => {
    setRemoveBlockNotice('')
    setRemoveError('')

    if (employeePositionOptionValuesMatch(position.label, primaryPosition)) {
      setRemoveBlockNotice('This position is currently the employee\'s Primary Position. Select a different Primary Position before removing it.')
      return
    }

    removeTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setRemovePending({
      label: position.label,
      workspacePositionId: position.workspacePositionId ?? null,
    })
  }, [primaryPosition])

  const confirmRemoveCustomPosition = useCallback(async () => {
    if (!removePending || !onConfirmRemoveCustomPosition) return

    setRemoveError('')

    try {
      const result = await onConfirmRemoveCustomPosition(removePending)
      if (result?.blocked) {
        setRemoveBlockNotice(result.message || 'Unable to remove this custom position right now.')
        setRemovePending(null)
        return
      }

      setDraftSelection((current) => removeAdditionalPositionValue(current, removePending.label))

      if (result?.message) {
        setRemoveBlockNotice(result.message)
      }

      setRemovePending(null)
    } catch (error) {
      setRemoveError(error?.message || 'Unable to remove custom position right now.')
    }
  }, [onConfirmRemoveCustomPosition, removePending])

  useEffect(() => {
    if (!isOpen) return

    setDraftSelection(selectedValues)
  }, [isOpen, selectedValues])

  useEffect(() => {
    if (!removePending) return undefined

    requestAnimationFrame(() => {
      removeDialogRef.current?.querySelector('button')?.focus()
    })

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        cancelRemoveDialog()
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [cancelRemoveDialog, removePending])

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('')
      setMenuPosition(null)
      return undefined
    }

    setDraftSelection(selectedValues)
    updateMenuPosition()

    const handleClickOutside = (event) => {
      if (rootRef.current?.contains(event.target)) return
      if (event.target instanceof Element && event.target.closest('.employee-premium-additional-positions-picker-portal')) return
      if (event.target instanceof Element && event.target.closest('.employee-premium-custom-position-remove-backdrop')) return
      cancelPicker()
    }

    const handleKeyDown = (event) => {
      if (removePending) return

      if (event.key === 'Escape') {
        event.preventDefault()
        cancelPicker()
      }
    }

    const handleReposition = () => updateMenuPosition()

    document.addEventListener('click', handleClickOutside, true)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleReposition)
    window.addEventListener('scroll', handleReposition, true)

    const modalScrollContainer = triggerRef.current?.closest('.employee-premium-form-modal')
    modalScrollContainer?.addEventListener('scroll', handleReposition, { passive: true })

    return () => {
      document.removeEventListener('click', handleClickOutside, true)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleReposition)
      window.removeEventListener('scroll', handleReposition, true)
      modalScrollContainer?.removeEventListener('scroll', handleReposition)
    }
  }, [cancelPicker, isOpen, removePending, selectedValues, updateMenuPosition])

  const removeDialogPortal = removePending && typeof document !== 'undefined'
    ? createPortal(
      <div
        className="employee-premium-custom-position-remove-backdrop"
        onClick={cancelRemoveDialog}
      >
        <div
          ref={removeDialogRef}
          className="employee-premium-custom-position-remove-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="employee-custom-position-remove-title"
          onClick={(event) => event.stopPropagation()}
        >
          <h4 id="employee-custom-position-remove-title" className="employee-premium-custom-position-remove-title">
            Remove Custom Position
          </h4>
          <div className="employee-premium-custom-position-remove-body">
            <p className="employee-premium-custom-position-remove-lead">
              &ldquo;{removePending.label}&rdquo; will be removed from this employee.
            </p>
            <p className="employee-premium-custom-position-remove-followup">
              If no other employee uses this position, it will also be removed from the workspace catalog after you save this employee.
            </p>
          </div>
          {removeError ? (
            <p className="employee-premium-custom-position-remove-error" role="alert">{removeError}</p>
          ) : null}
          <div className="employee-premium-custom-position-remove-actions">
            <button
              type="button"
              className="ghost-btn employee-premium-custom-position-remove-cancel-btn"
              onClick={cancelRemoveDialog}
            >
              Cancel
            </button>
            <button
              type="button"
              className="primary-btn employee-premium-custom-position-remove-confirm-btn"
              onClick={confirmRemoveCustomPosition}
            >
              Remove from Employee
            </button>
          </div>
        </div>
      </div>,
      document.body,
    )
    : null

  const menuPortal = isOpen && menuPosition && typeof document !== 'undefined'
    ? createPortal(
      <div
        className="employee-premium-additional-positions-picker-portal employee-premium-field-select-portal"
        style={{
          position: 'fixed',
          top: `${menuPosition.top}px`,
          left: `${menuPosition.left}px`,
          width: `${menuPosition.width}px`,
          zIndex: EMPLOYEE_FORM_SELECT_Z_INDEX,
        }}
      >
        <div className="employee-premium-position-picker-search-wrap">
          <input
            type="search"
            className="employee-premium-position-picker-search"
            value={searchQuery}
            placeholder="Search positions"
            aria-label="Search positions"
            autoComplete="off"
            enterKeyHint="search"
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>

        <div className="employee-premium-additional-positions-picker-body">
          {removeBlockNotice ? (
            <p className="employee-premium-custom-position-remove-notice" role="status">{removeBlockNotice}</p>
          ) : null}
          {filteredGroups.length > 0 ? filteredGroups.map((group) => (
            <section key={group.departmentKey} className="employee-premium-additional-positions-group">
              <h5 className="employee-premium-additional-positions-group-header">{group.departmentLabel}</h5>
              <ul className="employee-premium-additional-positions-group-list" role="group" aria-label={group.departmentLabel}>
                {group.positions.map((position) => {
                  const isPrimaryLocked = employeeAdditionalPositionMatchesPrimary(position, primaryPosition)
                  if (isPrimaryLocked && !employeeAdditionalSelectionIncludesPrimary(draftSelection, primaryPosition)) {
                    return null
                  }

                  if (isPrimaryLocked) {
                    const storedLabel = draftSelection.find((entry) => employeePositionOptionValuesMatch(entry, primaryPosition))
                      ?? position.label

                    return (
                      <li key={`${group.departmentKey}-${position.key}-primary`} role="presentation">
                        <button
                          type="button"
                          className="employee-premium-additional-positions-option is-disabled is-primary-locked"
                          disabled
                          aria-disabled="true"
                        >
                          <span className="employee-premium-additional-positions-option-label">{storedLabel}</span>
                          <span className="employee-premium-additional-positions-option-meta">Primary Position</span>
                        </button>
                      </li>
                    )
                  }

                  const isSelected = employeeAdditionalPositionIsSelected(draftSelection, position.label)

                  return (
                    <li key={`${group.departmentKey}-${position.key}`} className="employee-premium-additional-positions-option-row" role="presentation">
                      <button
                        type="button"
                        className={`employee-premium-additional-positions-option${isSelected ? ' is-selected' : ''}`}
                        aria-pressed={isSelected}
                        onClick={() => toggleDraftPosition(position.label)}
                      >
                        <span className="employee-premium-additional-positions-option-label">{position.label}</span>
                        {position.custom ? (
                          <span className="employee-premium-additional-positions-option-meta">Custom</span>
                        ) : null}
                      </button>
                      {position.custom ? (
                        <button
                          type="button"
                          className="employee-premium-additional-positions-remove-btn"
                          aria-label={`Remove custom position ${position.label}`}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation()
                            requestRemoveCustomPosition(position)
                          }}
                        >
                          <span className="employee-premium-additional-positions-remove-btn-icon" aria-hidden="true">
                            <svg viewBox="0 0 16 16" focusable="false">
                              <path d="M6.25 2.5h3.5l.5 1h3.25v1H2.5v-1H5.75l.5-1Z" />
                              <path d="M3.5 5.5h9l-.75 8.25H4.25L3.5 5.5Zm2 1.5v5.75h1V7h-1Zm2.5 0v5.75h1V7h-1Z" />
                            </svg>
                          </span>
                          <span className="employee-premium-additional-positions-remove-btn-label">Remove</span>
                        </button>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </section>
          )) : (
            <p className="employee-premium-position-picker-empty">No matching positions</p>
          )}
        </div>

        <div className="employee-premium-additional-positions-picker-footer">
          <button type="button" className="ghost-btn employee-premium-additional-positions-cancel-btn" onClick={cancelPicker}>
            Cancel
          </button>
          <button type="button" className="primary-btn employee-premium-additional-positions-done-btn" onClick={applyPicker}>
            Done
          </button>
        </div>
      </div>,
      document.body,
    )
    : null

  return (
    <>
      <div className={`employee-premium-additional-positions-field${isOpen ? ' is-open' : ''}`} ref={rootRef}>
        <button
          ref={triggerRef}
          id={id}
          type="button"
          className="employee-premium-position-trigger employee-premium-additional-positions-trigger"
          onClick={() => setIsOpen(!isOpen)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              setIsOpen(true)
              return
            }

            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setIsOpen(true)
            }
          }}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-label="Additional positions"
        >
          <span
            className={`employee-premium-field-select-value${selectedValues.length > 0 ? '' : ' is-placeholder'}`}
            title={closedDisplayTitle}
          >
            {closedDisplayLabel}
          </span>
          <span className="employee-premium-field-select-chevron" aria-hidden="true">▾</span>
        </button>
      </div>
      {menuPortal}
      {removeDialogPortal}
    </>
  )
}

function buildEmployeeForm(employee = null) {
  const normalizeProfileShift = (shift) => {
    if (!shift) return 'Flexible / Rotating'

    const normalized = `${shift}`.trim().toLowerCase()
    if (normalized === 'day') return 'Morning'
    if (normalized === 'morning') return 'Morning'
    if (normalized === 'evening') return 'Evening'
    if (normalized === 'night') return 'Night'
    if (normalized.includes('flexible') || normalized.includes('rotating')) return 'Flexible / Rotating'

    return 'Flexible / Rotating'
  }

  const availablePositionNames = Array.isArray(employee?.positions)
    ? employee.positions.map((position) => `${position?.name ?? ''}`.trim()).filter(Boolean)
    : `${employee?.position ?? ''}`
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)

  const primaryPosition = `${employee?.primaryPosition ?? availablePositionNames[0] ?? ''}`.trim()
  const additionalPositions = Array.from(new Set(
    (Array.isArray(employee?.additionalPositions) ? employee.additionalPositions : availablePositionNames.slice(1))
      .map((name) => `${name ?? ''}`.trim())
      .filter((name) => name && name.toLowerCase() !== primaryPosition.toLowerCase()),
  ))

  const { firstName, lastName } = splitEmployeeFullName(employee?.name ?? '')

  return {
    firstName,
    lastName,
    primaryPosition,
    additionalPositions,
    customPositionName: '',
    phone: employee?.phone ?? '',
    email: employee?.email ?? '',
    hireDate: toDateInputValue(employee?.hireDate ?? ''),
    salary: employee?.salary ?? '',
    weeklyHours: employee?.weeklyHours ?? '',
    department: employee?.department ?? 'Service',
    shift: normalizeProfileShift(employee?.shift),
    status: employee?.status ?? 'Working',
    emergencyContact: employee?.emergencyContact ?? '',
    notes: employee?.notes ?? '',
  }
}

function formatScheduleHeaderWeekRange(days) {
  if (!Array.isArray(days) || days.length === 0) return 'No week selected'

  const formatDay = (dateKey) => {
    const date = parseLocalDate(dateKey)
    return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
  }

  return `${formatDay(days[0].key)} – ${formatDay(days[days.length - 1].key)}`
}

function ScheduleCollapsibleSection({ eyebrow, title, meta, children, className = '' }) {
  return (
    <details className={`schedule-collapsible panel staff-panel ${className}`.trim()}>
      <summary className="schedule-collapsible-summary">
        <div className="schedule-collapsible-summary-copy">
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h3>{title}</h3>
          {meta ? <p className="schedule-collapsible-meta">{meta}</p> : null}
        </div>
        <span className="schedule-collapsible-chevron" aria-hidden="true">▾</span>
      </summary>
      <div className="schedule-collapsible-body">
        {children}
      </div>
    </details>
  )
}

function ScheduleAvailabilityDot({ indicator, className = '' }) {
  if (!indicator) return null

  return (
    <span
      className={`schedule-availability-dot tone-${indicator.tone} ${className}`.trim()}
      title={indicator.label}
      aria-label={indicator.label}
      role="img"
    />
  )
}

function ScheduleView({
  shifts = [],
  scheduleCapacities = [],
  employees = [],
  positions = [],
  shiftTemplates = [],
  weeklyTemplates = [],
  onOpenAddShift,
  onOpenEditShift,
  onDeleteShift,
  onCreateGridShift,
  onUpdateGridShift,
  onUpdateAssignmentTime,
  onMoveGridShift,
  onCopyGridShift,
  onRemoveGridShift,
  onCopyShiftToNextDay,
  onCopyShiftToRestOfWeek,
  onCopyCellToNextDay,
  onCopyCellToRestOfWeek,
  onSaveCurrentWeekTemplate,
  onLoadWeeklyTemplate,
  onRenameWeeklyTemplate,
  onDeleteWeeklyTemplate,
  onUpdateCellCapacity,
  onUpdateTemplateDefaultRequired,
  onApplyAreaToTemplate,
  onRenameShiftTemplate,
  onEditShiftTemplate,
  onDuplicateShiftTemplate,
  onDeleteShiftTemplate,
  onCopyHistoricalWeek,
  onCopyDay,
  onCopyWeek,
  onClearDay,
  onClearWeek,
  onClearGridCell,
  onAutoFillWeekFromTemplate,
  schedulePublication,
  publishedShifts,
  weekStartDate,
  onWeekStartDateChange,
  onPublishWeekSchedule,
  onUnpublishWeekSchedule,
  isLoading,
  noticeMessage,
  canSaveTemplateDefault = true,
  isSaving,
  workspaceId = '',
  canEditSchedule = true,
  isMobileScheduleShell = false,
  isScheduleSectionActive = true,
  onExitSchedule,
}) {
  const [selectedDay, setSelectedDay] = useState(null)
  const [scheduleAvailabilityOverlay, setScheduleAvailabilityOverlay] = useState({
    byEmployeeId: {},
    loadFailed: false,
  })
  const [isScheduleAvailabilityLoading, setIsScheduleAvailabilityLoading] = useState(false)
  const [selectedShift, setSelectedShift] = useState(null)
  const [filters, setFilters] = useState({
    department: 'All',
    shift: 'All',
    position: 'All',
    status: 'All',
    search: '',
    publishedOnly: false,
  })
  const [isAssignmentModalOpen, setIsAssignmentModalOpen] = useState(false)
  const [assignmentError, setAssignmentError] = useState('')
  const [assignmentFieldErrors, setAssignmentFieldErrors] = useState({})
  const [assignmentMissingFields, setAssignmentMissingFields] = useState([])
  const [assignmentDraft, setAssignmentDraft] = useState({
    templateId: '',
    templateName: '',
    shiftDate: '',
    employeeIds: [],
    area: '',
    defaultRole: '',
    startTime: '',
    endTime: '',
    positionName: '',
    templateAreaMissing: false,
    notes: '',
  })
  const [assignmentEmployeeSearch, setAssignmentEmployeeSearch] = useState('')
  const [assignmentEmployeeRoleMap, setAssignmentEmployeeRoleMap] = useState({})
  const [assignmentAreaApplyMode, setAssignmentAreaApplyMode] = useState('once')
  const [capacityPickerKey, setCapacityPickerKey] = useState('')
  const [capacitySavingKey, setCapacitySavingKey] = useState('')
  const [capacityDraftMap, setCapacityDraftMap] = useState({})
  const [capacityCustomValue, setCapacityCustomValue] = useState('')
  const [editingAssignmentShift, setEditingAssignmentShift] = useState(null)
  const [shiftPendingDelete, setShiftPendingDelete] = useState(null)
  const [isSaveWeekTemplateModalOpen, setIsSaveWeekTemplateModalOpen] = useState(false)
  const [saveWeekTemplateName, setSaveWeekTemplateName] = useState('')
  const [selectedWeeklyTemplateId, setSelectedWeeklyTemplateId] = useState('')
  const [isLoadWeekTemplateModalOpen, setIsLoadWeekTemplateModalOpen] = useState(false)
  const [loadWeekOptions, setLoadWeekOptions] = useState({
    employees: true,
    positions: true,
    areas: true,
    times: true,
    notes: true,
  })
  const [renamingTemplateId, setRenamingTemplateId] = useState(null)
  const [renameTemplateName, setRenameTemplateName] = useState('')
  const [templateActionMenuId, setTemplateActionMenuId] = useState(null)
  const templateActionMenuRef = useRef(null)

  useEffect(() => {
    if (!templateActionMenuId) return
    templateActionMenuRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [templateActionMenuId])
  const [isDeleteShiftTemplateModalOpen, setIsDeleteShiftTemplateModalOpen] = useState(false)
  const [shiftTemplatePendingDelete, setShiftTemplatePendingDelete] = useState(null)
  const [shiftTemplatePendingRename, setShiftTemplatePendingRename] = useState(null)
  const [shiftTemplateRenameName, setShiftTemplateRenameName] = useState('')
  const [browseWeekAnchorDate, setBrowseWeekAnchorDate] = useState('')
  const [isCopyThisWeekModalOpen, setIsCopyThisWeekModalOpen] = useState(false)
  const [dayActionMenuKey, setDayActionMenuKey] = useState(null)
  const dayActionMenuAnchorRef = useRef(null)
  const [isCopyDayModalOpen, setIsCopyDayModalOpen] = useState(false)
  const [copyDaySourceDay, setCopyDaySourceDay] = useState(null)
  const [copyDayTargetKey, setCopyDayTargetKey] = useState('')
  const [isClearDayModalOpen, setIsClearDayModalOpen] = useState(false)
  const [clearDayTarget, setClearDayTarget] = useState(null)
  const [isCopyWeekModalOpen, setIsCopyWeekModalOpen] = useState(false)
  const [copyWeekTargetDate, setCopyWeekTargetDate] = useState('')
  const [copyWeekTargetShiftCount, setCopyWeekTargetShiftCount] = useState(0)
  const [isCopyWeekTargetLoading, setIsCopyWeekTargetLoading] = useState(false)
  const [isClearWeekModalOpen, setIsClearWeekModalOpen] = useState(false)
  const [cellActionMenuKey, setCellActionMenuKey] = useState('')
  const cellActionMenuAnchorRef = useRef(null)
  const [clearCellPending, setClearCellPending] = useState(null)
  const [capacityEditPending, setCapacityEditPending] = useState(null)
  const [cellCopyPending, setCellCopyPending] = useState(null)
  const [assignmentTimeEdit, setAssignmentTimeEdit] = useState(null)
  const [isAutoFillModalOpen, setIsAutoFillModalOpen] = useState(false)
  const [autoFillReplaceExisting, setAutoFillReplaceExisting] = useState(false)
  const [isPublishConfirmOpen, setIsPublishConfirmOpen] = useState(false)
  const [isUnpublishConfirmOpen, setIsUnpublishConfirmOpen] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [publishError, setPublishError] = useState('')
  const [isScheduleMoreMenuOpen, setIsScheduleMoreMenuOpen] = useState(false)
  const [browseWeekShifts, setBrowseWeekShifts] = useState([])
  const [isBrowseWeekLoading, setIsBrowseWeekLoading] = useState(false)
  const [dragPayload, setDragPayload] = useState(null)
  const [dropTargetKey, setDropTargetKey] = useState('')
  const [pendingShiftDrop, setPendingShiftDrop] = useState(null)
  const [focusedEmployeeId, setFocusedEmployeeId] = useState(null)
  const dragSessionRef = useRef(null)
  const employeeChipClickGuardRef = useRef(false)
  const [collapsedScheduleAreaKeys, setCollapsedScheduleAreaKeys] = useState(() => readCollapsedScheduleAreaKeys())
  const [isScheduleCompactLandscape, setIsScheduleCompactLandscape] = useState(() => isMobileScheduleCompactLandscape())
  const [isShiftTemplatesOpen, setIsShiftTemplatesOpen] = useState(false)
  const [scheduleViewportWidth, setScheduleViewportWidth] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth : 0
  ))
  const wasScheduleCompactLandscapeRef = useRef(isMobileScheduleCompactLandscape())

  const isDragDropDisabled = isSaving || isPublishing || !canEditSchedule

  const shiftCountByDate = useMemo(() => {
    const counts = {}
    shifts.forEach((shift) => {
      const key = `${shift.date ?? ''}`.slice(0, 10)
      if (!key) return
      counts[key] = (counts[key] ?? 0) + 1
    })
    return counts
  }, [shifts])

  const weekDays = useMemo(
    () => getWeekDays(weekStartDate, { shiftCounts: shiftCountByDate }),
    [shiftCountByDate, weekStartDate],
  )

  const scheduleDayColumnWidth = useMemo(
    () => getScheduleGridDayColumnWidth({
      dayCount: weekDays.length,
      viewportWidth: scheduleViewportWidth,
      isCompactLandscape: isScheduleCompactLandscape,
      isTemplatesPanelOpen: false,
    }),
    [weekDays.length, scheduleViewportWidth, isScheduleCompactLandscape],
  )

  const scheduleGridTableMinWidth = useMemo(
    () => getScheduleGridTableMinWidth(weekDays.length, scheduleDayColumnWidth),
    [weekDays.length, scheduleDayColumnWidth],
  )

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const updateScheduleViewport = () => {
      const compact = isMobileScheduleCompactLandscape()
      const wasCompact = wasScheduleCompactLandscapeRef.current
      wasScheduleCompactLandscapeRef.current = compact
      setIsScheduleCompactLandscape(compact)
      setScheduleViewportWidth(window.innerWidth)
      if (compact && !wasCompact) {
        setIsShiftTemplatesOpen(false)
      }
    }

    updateScheduleViewport()

    window.addEventListener('resize', updateScheduleViewport)
    window.addEventListener('orientationchange', updateScheduleViewport)
    window.visualViewport?.addEventListener('resize', updateScheduleViewport)

    const landscapeQuery = window.matchMedia?.('(orientation: landscape)')
    landscapeQuery?.addEventListener?.('change', updateScheduleViewport)

    return () => {
      window.removeEventListener('resize', updateScheduleViewport)
      window.removeEventListener('orientationchange', updateScheduleViewport)
      window.visualViewport?.removeEventListener('resize', updateScheduleViewport)
      landscapeQuery?.removeEventListener?.('change', updateScheduleViewport)
    }
  }, [])

  useEffect(() => {
    if (isScheduleSectionActive) return
    setIsShiftTemplatesOpen(false)
  }, [isScheduleSectionActive])

  useEffect(() => {
    if (!isShiftTemplatesOpen) return undefined

    const handleEscapeKey = (event) => {
      if (event.key === 'Escape') {
        setIsShiftTemplatesOpen(false)
      }
    }

    window.addEventListener('keydown', handleEscapeKey)
    return () => {
      window.removeEventListener('keydown', handleEscapeKey)
    }
  }, [isShiftTemplatesOpen])

  useEffect(() => {
    setCapacityDraftMap({})
    setCapacityPickerKey('')
    setSelectedDay(null)
    setDayActionMenuKey(null)
    setCellActionMenuKey('')
    setFocusedEmployeeId(null)
  }, [weekStartDate])

  useEffect(() => {
    let isMounted = true

    if (!browseWeekAnchorDate) {
      setBrowseWeekShifts([])
      setIsBrowseWeekLoading(false)
      return () => {
        isMounted = false
      }
    }

    const loadBrowseWeek = async () => {
      setIsBrowseWeekLoading(true)
      if (!workspaceId) {
        setBrowseWeekShifts([])
        setIsBrowseWeekLoading(false)
        return
      }
      try {
        const browseWeekStart = getWeekStartDate(parseLocalDate(browseWeekAnchorDate))
        const browseKeys = getWeekDateKeys(browseWeekStart)
        const remoteShifts = await getShifts(workspaceId, {
          startDate: browseKeys[0],
          endDate: browseKeys[browseKeys.length - 1],
        })
        if (!isMounted) return
        setBrowseWeekShifts(remoteShifts)
      } catch {
        if (!isMounted) return
        setBrowseWeekShifts([])
      } finally {
        if (isMounted) {
          setIsBrowseWeekLoading(false)
        }
      }
    }

    loadBrowseWeek()

    return () => {
      isMounted = false
    }
  }, [browseWeekAnchorDate, workspaceId])

  useEffect(() => {
    let isMounted = true

    if (!copyWeekTargetDate || !isCopyWeekModalOpen) {
      setCopyWeekTargetShiftCount(0)
      setIsCopyWeekTargetLoading(false)
      return () => {
        isMounted = false
      }
    }

    const loadTargetWeekCount = async () => {
      setIsCopyWeekTargetLoading(true)
      if (!workspaceId) {
        setCopyWeekTargetShiftCount(0)
        setIsCopyWeekTargetLoading(false)
        return
      }
      try {
        const targetWeekStart = getWeekStartDate(parseLocalDate(copyWeekTargetDate))
        const targetKeys = getWeekDateKeys(targetWeekStart)
        const remoteShifts = await getShifts(workspaceId, {
          startDate: targetKeys[0],
          endDate: targetKeys[targetKeys.length - 1],
        })
        if (!isMounted) return
        setCopyWeekTargetShiftCount(remoteShifts.length)
      } catch {
        if (!isMounted) return
        setCopyWeekTargetShiftCount(0)
      } finally {
        if (isMounted) {
          setIsCopyWeekTargetLoading(false)
        }
      }
    }

    loadTargetWeekCount()

    return () => {
      isMounted = false
    }
  }, [copyWeekTargetDate, isCopyWeekModalOpen, workspaceId])

  useEffect(() => {
    if (!selectedDay && weekDays.length > 0) {
      setSelectedDay(weekDays[0].key)
      return
    }

    if (selectedDay && !weekDays.some((day) => day.key === selectedDay)) {
      setSelectedDay(weekDays[0]?.key ?? null)
    }
  }, [selectedDay, weekDays])

  const weekDateKeys = useMemo(() => weekDays.map((day) => day.key), [weekDays])

  const normalizeShiftDateKey = (value) => {
    if (!value) return ''
    const raw = `${value}`.trim()
    if (!raw) return ''
    if (raw.includes('T')) return raw.split('T')[0]
    return raw.slice(0, 10)
  }

  const resolveTemplateCapacityId = (template) => {
    const rawId = template?.templateId ?? template?.id
    if (typeof rawId === 'string' && rawId.startsWith('supabase-')) {
      return rawId.replace('supabase-', '')
    }
    return rawId
  }

  const buildCapacityKey = (templateId, shiftDate) => `${String(templateId)}:${normalizeShiftDateKey(shiftDate)}`

  const normalizeCellDate = (value) => {
    if (!value) return ''
    const raw = `${value}`.trim()
    if (!raw) return ''
    if (raw.includes('T')) return raw.split('T')[0]
    return raw.slice(0, 10)
  }

  const normalizeCellTime = (value) => normalizeTimeValue(value)

  const normalizeCellArea = (value) => `${value ?? ''}`.trim().toLowerCase()

  const buildLegacyCellKey = ({ shiftDate, startTime, endTime, area }) => {
    return `${normalizeCellDate(shiftDate)}:${normalizeCellTime(startTime)}:${normalizeCellTime(endTime)}:${normalizeCellArea(area)}`
  }

  const getPrimaryCellKey = ({ shiftTemplateId, shiftDate }) => {
    const normalizedDate = normalizeCellDate(shiftDate)
    if (!shiftTemplateId || !normalizedDate) return ''
    return `${String(shiftTemplateId)}:${normalizedDate}`
  }

  const buildCellDropKey = (template, dayKey) => getPrimaryCellKey({
    shiftTemplateId: resolveTemplateCapacityId(template),
    shiftDate: dayKey,
  })

  const getTemplateCellKeys = (template, dayKey) => {
    const normalizedDay = normalizeCellDate(dayKey)
    const templateId = resolveTemplateCapacityId(template)
    const primary = getPrimaryCellKey({ shiftTemplateId: templateId, shiftDate: normalizedDay })
    if (primary) {
      return [primary]
    }

    const legacy = buildLegacyCellKey({
      shiftDate: normalizedDay,
      startTime: template?.startTime,
      endTime: template?.endTime,
      area: template?.defaultArea,
    })
    return legacy ? [legacy] : []
  }

  const getShiftCellKeys = (shift) => {
    const primary = getPrimaryCellKey({
      shiftTemplateId: shift?.shiftTemplateId,
      shiftDate: shift?.date,
    })

    if (primary) {
      return [primary]
    }

    const legacy = buildLegacyCellKey({
      shiftDate: shift?.date,
      startTime: shift?.startTime,
      endTime: shift?.endTime,
      area: shift?.area,
    })

    return legacy ? [legacy] : []
  }

  const visibleWeekShifts = useMemo(
    () => shifts.filter((shift) => weekDateKeys.includes(normalizeCellDate(shift.date))),
    [shifts, weekDateKeys],
  )

  const scheduleGridTemplates = useMemo(
    () => buildScheduleGridTemplates(shiftTemplates, visibleWeekShifts),
    [shiftTemplates, visibleWeekShifts],
  )

  const isWeekPublished = schedulePublication?.status === 'published'
  const hasUnpublishedChanges = isWeekPublished
    && !draftMatchesPublishedSnapshot(visibleWeekShifts, publishedShifts)

  const assignmentsByCell = useMemo(() => {
    const map = {}

    visibleWeekShifts.forEach((shift) => {
      const keys = getShiftCellKeys(shift)
      keys.forEach((cellKey) => {
        if (!cellKey) return
        if (!Array.isArray(map[cellKey])) {
          map[cellKey] = []
        }
        map[cellKey].push(shift)
      })
    })

    return map
  }, [visibleWeekShifts])

  const capacityLookup = useMemo(() => {
    const lookup = {}
    ;(scheduleCapacities ?? []).forEach((item) => {
      const key = buildCapacityKey(item.shiftTemplateId, item.shiftDate)
      const parsed = Number(item.requiredCount)
      if (Number.isFinite(parsed) && parsed >= 0) {
        lookup[key] = parsed
      }
    })
    return lookup
  }, [scheduleCapacities])

  const getRequiredCountForCell = (template, dayKey) => {
    const key = buildCapacityKey(resolveTemplateCapacityId(template), dayKey)
    if (Object.prototype.hasOwnProperty.call(capacityDraftMap, key)) {
      const draftValue = Number(capacityDraftMap[key])
      return Number.isFinite(draftValue) && draftValue >= 0 ? draftValue : getTemplateDefaultRequiredCount(template)
    }
    if (Object.prototype.hasOwnProperty.call(capacityLookup, key)) {
      return capacityLookup[key]
    }
    return getTemplateDefaultRequiredCount(template)
  }

  const getWeekDaysFromAnchor = (anchorDateInput) => {
    const weekStart = anchorDateInput
      ? getWeekStartDate(parseLocalDate(anchorDateInput))
      : getWeekStartDate(new Date())
    return getWeekDays(weekStart)
  }

  const browseWeekDays = useMemo(() => getWeekDaysFromAnchor(browseWeekAnchorDate), [browseWeekAnchorDate])

  const browsedWeekShifts = browseWeekShifts

  const browsedWeekPreview = useMemo(() => {
    return [...browsedWeekShifts]
      .sort((left, right) => `${left.date} ${left.startTime}`.localeCompare(`${right.date} ${right.startTime}`))
      .slice(0, 4)
      .map((shift) => {
        const employeeName = shift.employees?.full_name
          || shift.employeeName
          || employees.find((employee) => String(employee.id) === String(shift.employeeId))?.name
          || 'Unassigned'

        return `${shift.date} · ${formatTimeRange24(shift.startTime, shift.endTime, '-')} · ${employeeName}`
      })
  }, [browsedWeekShifts, employees])

  const weekRangeLabel = (days) => formatWeekRange(days)

  const isBrowseWeekCurrentWeek = useMemo(() => {
    const browseStart = browseWeekDays[0]?.key
    const currentStart = weekDays[0]?.key
    return Boolean(browseStart && currentStart && browseStart === currentStart)
  }, [browseWeekDays, weekDays])

  const handleOpenDeleteShiftTemplateModal = (template) => {
    setTemplateActionMenuId(null)
    setShiftTemplatePendingDelete(template)
    setIsDeleteShiftTemplateModalOpen(true)
    setAssignmentError('')
  }

  const handleConfirmDeleteShiftTemplate = async () => {
    if (!shiftTemplatePendingDelete) return

    try {
      await onDeleteShiftTemplate(shiftTemplatePendingDelete)
      setIsDeleteShiftTemplateModalOpen(false)
      setShiftTemplatePendingDelete(null)
      setAssignmentError('')
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to delete shift template right now.')
    }
  }

  const handleStartRenameShiftTemplate = (template) => {
    setTemplateActionMenuId(null)
    setShiftTemplatePendingRename(template)
    setShiftTemplateRenameName(template?.name ?? '')
    setAssignmentError('')
  }

  const handleSubmitRenameShiftTemplate = async (event) => {
    event.preventDefault()
    if (!shiftTemplatePendingRename) return
    if (!shiftTemplateRenameName.trim()) {
      setAssignmentError('Template name is required.')
      return
    }

    try {
      await onRenameShiftTemplate(shiftTemplatePendingRename, shiftTemplateRenameName.trim())
      setShiftTemplatePendingRename(null)
      setShiftTemplateRenameName('')
      setAssignmentError('')
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to rename shift template right now.')
    }
  }

  const handleEditShiftTemplateFromCard = (template) => {
    setTemplateActionMenuId(null)
    onEditShiftTemplate(template)
  }

  const handleDuplicateShiftTemplateFromCard = async (template) => {
    setTemplateActionMenuId(null)
    try {
      await onDuplicateShiftTemplate(template)
      setAssignmentError('')
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to duplicate shift template right now.')
    }
  }

  const handleOpenCopyThisWeekModal = () => {
    if (isBrowseWeekCurrentWeek) {
      setAssignmentError('Select a different week to copy from.')
      return
    }
    setAssignmentError('')
    setIsCopyThisWeekModalOpen(true)
  }

  const handlePublishConfirm = async () => {
    if (!weekStartDate) {
      setPublishError('Week start date is missing for publish.')
      return
    }

    setIsPublishing(true)
    setPublishError('')

    try {
      const result = await onPublishWeekSchedule(weekStartDate, weekDateKeys)
      if (!result?.publication || result.publication.status !== 'published') {
        throw new Error('Publish did not complete. The week is still in draft.')
      }

      setIsPublishConfirmOpen(false)
      setAssignmentError('')
      setPublishError('')
    } catch (error) {
      const message = error?.message || 'Unable to publish this week right now.'
      setPublishError(message)
      setAssignmentError(message)
      console.error('[ScheduleView] publish failed:', error)
    } finally {
      setIsPublishing(false)
    }
  }

  const handleConfirmUnpublishSchedule = async () => {
    if (!weekStartDate) return
    setIsPublishing(true)
    try {
      await onUnpublishWeekSchedule(weekStartDate)
      setIsUnpublishConfirmOpen(false)
      setAssignmentError('')
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to unpublish this week right now.')
    } finally {
      setIsPublishing(false)
    }
  }

  const handleConfirmCopyThisWeek = async () => {
    try {
      await onCopyHistoricalWeek({
        sourceWeekDays: browseWeekDays,
        targetWeekDays: weekDays,
      })
      setIsCopyThisWeekModalOpen(false)
      setAssignmentError('')
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to copy this week right now.')
    }
  }

  const copyWeekTargetWeekStart = copyWeekTargetDate
    ? getWeekStartDate(parseLocalDate(copyWeekTargetDate))
    : ''
  const isCopyWeekTargetCurrentWeek = copyWeekTargetWeekStart === weekStartDate

  const handleOpenCopyDayModal = (day) => {
    setDayActionMenuKey(null)
    setCopyDaySourceDay(day)
    const fallbackTarget = weekDays.find((item) => item.key !== day.key)?.key ?? ''
    setCopyDayTargetKey(fallbackTarget)
    setAssignmentError('')
    setIsCopyDayModalOpen(true)
  }

  const handleOpenClearDayModal = (day) => {
    setDayActionMenuKey(null)
    setClearDayTarget(day)
    setAssignmentError('')
    setIsClearDayModalOpen(true)
  }

  const copyDayTargetShiftCount = copyDayTargetKey
    ? visibleWeekShifts.filter((shift) => shift.date === copyDayTargetKey).length
    : 0

  const handleConfirmCopyDay = async () => {
    if (!copyDaySourceDay?.key || !copyDayTargetKey) {
      setAssignmentError('Select a target day first.')
      return
    }

    if (copyDaySourceDay.key === copyDayTargetKey) {
      setAssignmentError('Source and target day must be different.')
      return
    }

    try {
      await onCopyDay({
        sourceDate: copyDaySourceDay.key,
        targetDate: copyDayTargetKey,
        overwrite: copyDayTargetShiftCount > 0,
      })
      setIsCopyDayModalOpen(false)
      setCopyDaySourceDay(null)
      setCopyDayTargetKey('')
      setAssignmentError('')
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to copy this day right now.')
    }
  }

  const handleConfirmClearDay = async () => {
    if (!clearDayTarget?.key) return

    try {
      await onClearDay(clearDayTarget.key)
      setIsClearDayModalOpen(false)
      setClearDayTarget(null)
      setAssignmentError('')
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to clear this day right now.')
    }
  }

  const handleOpenCopyWeekModal = () => {
    setCopyWeekTargetDate('')
    setCopyWeekTargetShiftCount(0)
    setAssignmentError('')
    setIsCopyWeekModalOpen(true)
  }

  const handleConfirmCopyWeek = async () => {
    if (!copyWeekTargetDate) {
      setAssignmentError('Select a target week first.')
      return
    }

    if (isCopyWeekTargetCurrentWeek) {
      setAssignmentError('Select a different week as the copy target.')
      return
    }

    const sourceShiftCount = visibleWeekShifts.length
    if (sourceShiftCount === 0) {
      setAssignmentError('Current week has no assignments to copy.')
      return
    }

    try {
      await onCopyWeek({
        sourceWeekDays: weekDays,
        targetWeekStartDate: copyWeekTargetWeekStart,
        overwrite: copyWeekTargetShiftCount > 0,
      })
      setIsCopyWeekModalOpen(false)
      setCopyWeekTargetDate('')
      setAssignmentError('')
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to copy week right now.')
    }
  }

  const handleOpenClearWeekModal = () => {
    setAssignmentError('')
    setIsClearWeekModalOpen(true)
  }

  const handleConfirmClearWeek = async () => {
    if (visibleWeekShifts.length === 0) {
      setAssignmentError('This week is already empty.')
      return
    }

    try {
      await onClearWeek(weekDays)
      setIsClearWeekModalOpen(false)
      setAssignmentError('')
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to clear this week right now.')
    }
  }

  const buildCellActionMenuKey = (template, dayKey) => `${resolveTemplateCapacityId(template)}|${normalizeCellDate(dayKey)}`

  const handleOpenClearCellModal = (template, cell) => {
    if (!canEditSchedule) return
    setCellActionMenuKey('')
    setClearCellPending({
      template,
      day: cell.day,
      shifts: cell.shifts,
      templateName: template.name || 'Shift',
    })
    setAssignmentError('')
  }

  const handleOpenCapacityEditModal = (template, day, cell) => {
    if (!canEditSchedule) return
    setCellActionMenuKey('')
    setCapacityEditPending({
      template,
      day,
      cell,
      draftRequired: Number(cell.requiredCount) || 0,
    })
    setAssignmentError('')
  }

  const handleAdjustCapacityEditDraft = (delta) => {
    setCapacityEditPending((current) => {
      if (!current) return current
      const next = Math.max(0, Math.min(99, (Number(current.draftRequired) || 0) + delta))
      return { ...current, draftRequired: next }
    })
  }

  const handleSaveCapacityEdit = async ({ saveAsTemplateDefault = false } = {}) => {
    if (!capacityEditPending) return

    const { template, day, draftRequired } = capacityEditPending
    setAssignmentError('')
    const saved = await handleSelectCellCapacity(template, day, draftRequired)
    if (!saved) return

    if (saveAsTemplateDefault && onUpdateTemplateDefaultRequired) {
      try {
        await onUpdateTemplateDefaultRequired(template, draftRequired)
      } catch (error) {
        setAssignmentError(error?.message || 'Day saved, but template default could not be updated.')
        return
      }
    }

    setCapacityEditPending(null)
  }

  const getCellForTemplateAndDay = (template, dayKey) => {
    const row = blendGridRows.find((entry) => entry.template.id === template.id)
    return row?.dayCells.find((entry) => entry.day.key === dayKey) ?? null
  }

  const handleRequestCopyCellToNextDay = (template, day, cell) => {
    setCellActionMenuKey('')
    const targetDayKey = addCalendarDays(day.key, 1)
    const targetCell = getCellForTemplateAndDay(template, targetDayKey)
    const hasExisting = (targetCell?.shifts?.length ?? 0) > 0

    if (hasExisting) {
      setCellCopyPending({
        mode: 'next-day',
        template,
        sourceDay: day,
        sourceCell: cell,
        targetDayKey,
        targetCell,
      })
      setAssignmentError('')
      return
    }

    if (typeof onCopyCellToNextDay !== 'function') {
      setAssignmentError('Copy to next day is unavailable.')
      return
    }

    onCopyCellToNextDay({
      template,
      sourceDate: day.key,
      requiredCount: cell.requiredCount,
      sourceShifts: cell.shifts,
      strategy: 'merge',
    }).catch((error) => {
      setAssignmentError(error?.message || 'Unable to copy shift to next day.')
    })
  }

  const handleRequestCopyCellToRestOfWeek = (template, day, cell) => {
    setCellActionMenuKey('')
    const weekKeys = weekDays.map((entry) => entry.key)
    const sourceIndex = weekKeys.indexOf(day.key)
    const targetDayKeys = sourceIndex >= 0 ? weekKeys.slice(sourceIndex + 1) : []
    const occupiedTargets = targetDayKeys.filter((key) => {
      const targetCell = getCellForTemplateAndDay(template, key)
      return (targetCell?.shifts?.length ?? 0) > 0
    })

    if (occupiedTargets.length > 0) {
      setCellCopyPending({
        mode: 'rest-of-week',
        template,
        sourceDay: day,
        sourceCell: cell,
        targetDayKeys,
        occupiedTargets,
      })
      setAssignmentError('')
      return
    }

    if (typeof onCopyCellToRestOfWeek !== 'function') {
      setAssignmentError('Copy to rest of week is unavailable.')
      return
    }

    onCopyCellToRestOfWeek({
      template,
      sourceDate: day.key,
      requiredCount: cell.requiredCount,
      sourceShifts: cell.shifts,
      strategy: 'merge',
    }).catch((error) => {
      setAssignmentError(error?.message || 'Unable to copy shift to rest of week.')
    })
  }

  const handleConfirmCellCopy = async (strategy) => {
    if (!cellCopyPending) return

    const { mode, template, sourceDay, sourceCell, targetDayKey, targetDayKeys } = cellCopyPending
    setAssignmentError('')

    try {
      if (mode === 'next-day') {
        await onCopyCellToNextDay({
          template,
          sourceDate: sourceDay.key,
          requiredCount: sourceCell.requiredCount,
          sourceShifts: sourceCell.shifts,
          strategy,
        })
      } else {
        await onCopyCellToRestOfWeek({
          template,
          sourceDate: sourceDay.key,
          requiredCount: sourceCell.requiredCount,
          sourceShifts: sourceCell.shifts,
          strategy,
          targetDayKeys,
        })
      }
      setCellCopyPending(null)
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to copy shift.')
    }
  }

  const handleEditCellShift = (template, day) => {
    setCellActionMenuKey('')
    handleOpenAssignmentModal(template, day)
  }

  const handleDuplicateCellShifts = async (template, day, cell) => {
    setCellActionMenuKey('')

    if ((cell.shifts ?? []).length === 0) {
      setAssignmentError('No assignments to duplicate.')
      return
    }

    const dayIndex = weekDays.findIndex((entry) => entry.key === day.key)
    if (dayIndex < 0 || dayIndex >= weekDays.length - 1) {
      setAssignmentError('There is no next day to duplicate into.')
      return
    }

    try {
      setAssignmentError('')
      for (const shift of cell.shifts) {
        await onCopyShiftToNextDay(shift)
      }
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to duplicate shift assignments.')
    }
  }

  const handleConfirmClearCell = async () => {
    if (!clearCellPending) return

    const shiftIds = (clearCellPending.shifts ?? []).map((shift) => shift.id).filter(Boolean)
    if (shiftIds.length === 0) {
      setAssignmentError('No assignments found in this shift cell.')
      return
    }

    try {
      await onClearGridCell({
        template: clearCellPending.template,
        shiftDate: clearCellPending.day.key,
        shiftIds,
      })
      setClearCellPending(null)
      setAssignmentError('')
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to clear this shift right now.')
    }
  }

  const handleOpenAutoFillModal = () => {
    if (!canEditSchedule) return
    if (!selectedWeeklyTemplateId) {
      setAssignmentError('Select a weekly template first.')
      return
    }

    setAssignmentError('')
    setAutoFillReplaceExisting(false)
    setLoadWeekOptions({
      employees: true,
      positions: true,
      areas: true,
      times: true,
      notes: true,
    })
    setIsAutoFillModalOpen(true)
  }

  const handleConfirmAutoFillWeek = async () => {
    if (!selectedWeeklyTemplateId) {
      setAssignmentError('Select a weekly template first.')
      return
    }

    try {
      await onAutoFillWeekFromTemplate({
        templateId: selectedWeeklyTemplateId,
        weekDays,
        options: loadWeekOptions,
        replaceExisting: autoFillReplaceExisting,
      })
      setIsAutoFillModalOpen(false)
      setAssignmentError('')
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to auto fill week right now.')
    }
  }

  const currentWeekShifts = visibleWeekShifts

  const handleOpenSaveWeekTemplateModal = () => {
    setAssignmentError('')
    setSaveWeekTemplateName('')
    setIsSaveWeekTemplateModalOpen(true)
  }

  const handleSaveWeekTemplate = async (event) => {
    event.preventDefault()
    if (!saveWeekTemplateName.trim()) {
      setAssignmentError('Template name is required.')
      return
    }

    try {
      await onSaveCurrentWeekTemplate({
        name: saveWeekTemplateName.trim(),
        weekDays,
        weekShifts: currentWeekShifts,
        weekCapacities: scheduleCapacities,
      })
      setIsSaveWeekTemplateModalOpen(false)
      setSaveWeekTemplateName('')
      setAssignmentError('')
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to save weekly template right now.')
    }
  }

  const handleOpenLoadWeekTemplateModal = () => {
    if (!selectedWeeklyTemplateId) {
      setAssignmentError('Select a weekly template first.')
      return
    }

    setAssignmentError('')
    setLoadWeekOptions({
      employees: true,
      positions: true,
      areas: true,
      times: true,
      notes: true,
    })
    setIsLoadWeekTemplateModalOpen(true)
  }

  const handleConfirmLoadWeekTemplate = async () => {
    if (!selectedWeeklyTemplateId) {
      setAssignmentError('Select a weekly template first.')
      return
    }

    try {
      await onLoadWeeklyTemplate({
        templateId: selectedWeeklyTemplateId,
        weekDays,
        options: loadWeekOptions,
      })
      setIsLoadWeekTemplateModalOpen(false)
      setAssignmentError('')
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to load weekly template right now.')
    }
  }

  const handleStartRenameWeeklyTemplate = () => {
    if (!selectedWeeklyTemplateId) {
      setAssignmentError('Select a weekly template first.')
      return
    }

    const selectedTemplate = weeklyTemplates.find((template) => String(template.id) === String(selectedWeeklyTemplateId))
    if (!selectedTemplate) {
      setAssignmentError('Selected template was not found.')
      return
    }

    setRenamingTemplateId(selectedTemplate.id)
    setRenameTemplateName(selectedTemplate.name)
    setAssignmentError('')
  }

  const handleSubmitRenameWeeklyTemplate = async (event) => {
    event.preventDefault()
    if (!renamingTemplateId) return

    if (!renameTemplateName.trim()) {
      setAssignmentError('Template name is required.')
      return
    }

    try {
      await onRenameWeeklyTemplate(renamingTemplateId, renameTemplateName.trim())
      setRenamingTemplateId(null)
      setRenameTemplateName('')
      setAssignmentError('')
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to rename weekly template right now.')
    }
  }

  const handleDeleteSelectedWeeklyTemplate = async () => {
    if (!selectedWeeklyTemplateId) {
      setAssignmentError('Select a weekly template first.')
      return
    }

    try {
      await onDeleteWeeklyTemplate(selectedWeeklyTemplateId)
      setSelectedWeeklyTemplateId('')
      setAssignmentError('')
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to delete weekly template right now.')
    }
  }

  const parseTimeToMinutes = (value) => {
    if (!value) return Number.MAX_SAFE_INTEGER

    const [hours, minutes] = `${value}`.split(':').map(Number)
    return (Number.isNaN(hours) ? 0 : hours) * 60 + (Number.isNaN(minutes) ? 0 : minutes)
  }

  const getShiftDepartment = (shift) => {
    const employeeRecord = shift.employeeRecord ?? null
    if (employeeRecord?.department) {
      return employeeRecord.department
    }

    const normalized = `${shift.area || ''} ${shift.role || ''}`.toLowerCase()
    if (normalized.includes('bar')) return 'Bar'
    if (normalized.includes('host')) return 'Host'
    if (normalized.includes('kitchen')) return 'Kitchen'
    if (normalized.includes('management')) return 'Management'
    return 'Service'
  }

  const getShiftPeriod = (shift) => {
    const minutes = parseTimeToMinutes(shift.startTime)
    if (minutes < 12 * 60) return 'Morning'
    if (minutes < 20 * 60) return 'Evening'
    return 'Night'
  }

  const getShiftIndicator = (shift) => {
    const period = getShiftPeriod(shift)
    if (period === 'Morning') return { label: 'Morning', className: 'shift-indicator morning' }
    if (period === 'Evening') return { label: 'Evening', className: 'shift-indicator evening' }
    return { label: 'Night', className: 'shift-indicator night' }
  }

  const getShiftStatusClass = (status) => {
    if (!status) return 'scheduled'
    const normalized = `${status}`.toLowerCase()
    if (normalized.includes('confirm')) return 'confirmed'
    if (normalized.includes('complete')) return 'completed'
    return 'scheduled'
  }

  const selectedDate = weekDays.find((day) => day.key === selectedDay)?.key ?? null
  const selectedDayShifts = useMemo(() => {
    if (!selectedDate) return []

    return shifts
      .filter((shift) => shift.date === selectedDate)
      .map((shift) => ({
        ...shift,
        employeeRecord: employees.find((employee) => employee.id === shift.employeeId) ?? null,
      }))
      .sort((left, right) => parseTimeToMinutes(left.startTime) - parseTimeToMinutes(right.startTime))
  }, [employees, selectedDate, shifts])

  const filteredDayShifts = useMemo(() => {
    const searchTerm = filters.search.trim().toLowerCase()
    const publishedShiftIds = new Set((publishedShifts ?? []).map((shift) => String(shift.id)))

    return selectedDayShifts.filter((shift) => {
      const employeeName = `${shift.employees?.full_name || shift.employeeName || shift.employeeRecord?.name || ''}`.toLowerCase()
      const shiftPosition = `${shift.role || shift.employeeRecord?.position || ''}`.trim()
      const matchesSearch = !searchTerm || employeeName.includes(searchTerm)
      const matchesDepartment = filters.department === 'All' || getShiftDepartment(shift) === filters.department
      const matchesShift = filters.shift === 'All' || getShiftPeriod(shift) === filters.shift
      const matchesPosition = filters.position === 'All' || shiftPosition === filters.position
      const matchesStatus = filters.status === 'All' || `${shift.status || 'Scheduled'}`.toLowerCase() === filters.status.toLowerCase()
      const matchesPublished = !filters.publishedOnly || publishedShiftIds.has(String(shift.id))
      return matchesSearch && matchesDepartment && matchesShift && matchesPosition && matchesStatus && matchesPublished
    })
  }, [filters.department, filters.position, filters.publishedOnly, filters.search, filters.shift, filters.status, publishedShifts, selectedDayShifts])

  const positionFilterOptions = useMemo(() => {
    const names = new Set()
    ;(positions ?? []).forEach((position) => {
      const name = `${position?.name ?? ''}`.trim()
      if (name) names.add(name)
    })
    visibleWeekShifts.forEach((shift) => {
      const role = `${shift.role ?? ''}`.trim()
      if (role) names.add(role)
    })
    return ['All', ...Array.from(names).sort((left, right) => left.localeCompare(right))]
  }, [positions, visibleWeekShifts])

  const departmentGroups = useMemo(() => {
    const groups = ['Bar', 'Service', 'Host', 'Kitchen', 'Management'].map((department) => ({
      department,
      shifts: [],
    }))

    filteredDayShifts.forEach((shift) => {
      const department = getShiftDepartment(shift)
      const target = groups.find((group) => group.department === department)
      if (target) {
        target.shifts.push(shift)
      }
    })

    return groups
  }, [filteredDayShifts])

  const weekSummary = useMemo(() => {
    const weekShifts = shifts.filter((shift) => weekDays.some((day) => day.key === shift.date))
    const workingEmployees = new Set(weekShifts.map((shift) => shift.employeeId).filter(Boolean))
    const totalHours = weekShifts.reduce((sum, shift) => {
      if (!shift.startTime || !shift.endTime) return sum
      const startMinutes = parseTimeToMinutes(shift.startTime)
      const endMinutes = parseTimeToMinutes(shift.endTime)
      if (Number.isFinite(startMinutes) && Number.isFinite(endMinutes) && endMinutes > startMinutes) {
        return sum + (endMinutes - startMinutes) / 60
      }
      return sum
    }, 0)

    const employeesOff = employees.filter((employee) => isEmployeeUnavailable(employee)).length

    return {
      employeesScheduled: workingEmployees.size,
      totalShifts: weekShifts.length,
      totalHours: totalHours.toFixed(1),
      employeesOff,
    }
  }, [employees, shifts, weekDays])

  const weekLabourSummary = useMemo(() => buildExecutiveLabourSummary({
    snapshot: { labourHoursLabel: weekSummary.totalHours },
    todayShifts: visibleWeekShifts,
    employees,
  }), [employees, visibleWeekShifts, weekSummary.totalHours])

  const schedulePublicationLabel = isWeekPublished
    ? (hasUnpublishedChanges ? 'Draft changes' : 'Published')
    : 'Draft schedule'

  const employeeWeekScheduleView = useMemo(
    () => buildEmployeeWeekScheduleView({
      employees,
      weekDays,
      weekShifts: visibleWeekShifts,
    }),
    [employees, weekDays, visibleWeekShifts],
  )

  const scheduleAvailabilityEmployeeIdsKey = useMemo(
    () => buildScheduleAvailabilityLookupKey(
      workspaceId,
      weekStartDate,
      employees.map((employee) => employee.id),
    ),
    [employees, weekStartDate, workspaceId],
  )

  useEffect(() => {
    let cancelled = false
    const employeeIds = employees
      .map((employee) => `${employee?.id ?? ''}`.trim())
      .filter(Boolean)

    if (!`${workspaceId ?? ''}`.trim() || !`${weekStartDate ?? ''}`.trim() || employeeIds.length === 0) {
      setScheduleAvailabilityOverlay({ byEmployeeId: {}, loadFailed: false })
      setIsScheduleAvailabilityLoading(false)
      return () => {
        cancelled = true
      }
    }

    setIsScheduleAvailabilityLoading(true)

    getWorkspaceScheduleAvailabilityByEmployee({
      workspaceId,
      weekStartDate,
      employeeIds,
    })
      .then((result) => {
        if (cancelled) return
        setScheduleAvailabilityOverlay({
          byEmployeeId: result?.byEmployeeId ?? {},
          loadFailed: Boolean(result?.loadFailed),
        })
      })
      .catch(() => {
        if (cancelled) return
        setScheduleAvailabilityOverlay({ byEmployeeId: {}, loadFailed: true })
      })
      .finally(() => {
        if (!cancelled) {
          setIsScheduleAvailabilityLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [scheduleAvailabilityEmployeeIdsKey, weekStartDate, workspaceId, employees])

  const blendGridRows = useMemo(() => {
    const shiftsByDayKey = {}

    visibleWeekShifts.forEach((shift) => {
      const dayKey = normalizeCellDate(shift.date)
      if (!dayKey) return
      if (!shiftsByDayKey[dayKey]) {
        shiftsByDayKey[dayKey] = []
      }
      shiftsByDayKey[dayKey].push(shift)
    })

    return scheduleGridTemplates.map((template) => {
      const dayCells = weekDays.map((day) => {
        const requiredCount = getRequiredCountForCell(template, day.key)
        const cellKeys = getTemplateCellKeys(template, day.key)
        const seen = new Set()
        const dayShifts = []
        const dayShiftsOnDate = shiftsByDayKey[day.key] ?? []

        cellKeys.forEach((cellKey) => {
          ;(assignmentsByCell[cellKey] ?? []).forEach((shift) => {
            if (seen.has(String(shift.id))) return
            seen.add(String(shift.id))
            dayShifts.push({
              ...shift,
              employeeRecord: employees.find((employee) => employee.id === shift.employeeId) ?? null,
            })
          })
        })

        getShiftsCoveringTemplateCell(template, day.key, dayShiftsOnDate).forEach((shift) => {
          if (seen.has(String(shift.id))) return
          seen.add(String(shift.id))
          dayShifts.push({
            ...shift,
            employeeRecord: employees.find((employee) => employee.id === shift.employeeId) ?? null,
          })
        })

        const assignedCount = countShiftsCoveringTemplateCell(template, day.key, dayShiftsOnDate)

        const hasRealConflict = dayShifts.some((shift) => (
          shiftHasSchedulingConflict(shift, {
            employees,
            dayShifts: dayShiftsOnDate,
          })
        ))

        return {
          day,
          shifts: dayShifts,
          assignedCount,
          requiredCount,
          hasRealConflict,
          staffingState: dayShifts.length > requiredCount
            ? 'overstaffed'
            : dayShifts.length === requiredCount
              ? 'staffed'
              : dayShifts.length === 0
                ? 'understaffed'
                : 'attention',
        }
      })

      return {
        template,
        requiredCount: 1,
        dayCells,
      }
    })
  }, [employees, scheduleGridTemplates, weekDays, capacityLookup, capacityDraftMap, assignmentsByCell, visibleWeekShifts])

  const blendGridAreaGroups = useMemo(
    () => groupScheduleGridRowsByArea(blendGridRows),
    [blendGridRows],
  )

  const toggleScheduleAreaGroup = useCallback((areaKey) => {
    setCollapsedScheduleAreaKeys((current) => {
      const next = new Set(current)
      if (next.has(areaKey)) {
        next.delete(areaKey)
      } else {
        next.add(areaKey)
      }
      writeCollapsedScheduleAreaKeys(next)
      return next
    })
  }, [])

  const dayHeaderSummariesByKey = useMemo(() => {
    const summaries = {}

    weekDays.forEach((day) => {
      const dayKey = day.key
      const seenShiftIds = new Set()
      let totalAssignedStaff = 0
      let totalScheduledHours = 0

      visibleWeekShifts.forEach((shift) => {
        if (normalizeCellDate(shift.date) !== dayKey) return
        const shiftId = String(shift.id)
        if (seenShiftIds.has(shiftId)) return
        seenShiftIds.add(shiftId)
        totalAssignedStaff += 1
        totalScheduledHours += calculateShiftDurationHours(shift.startTime, shift.endTime)
      })

      let hasOverstaffed = false
      let issueCount = 0

      blendGridRows.forEach((row) => {
        const cell = row.dayCells.find((entry) => entry.day.key === dayKey)
        if (!cell) return
        if (cell.assignedCount > cell.requiredCount) hasOverstaffed = true
        if (cell.hasRealConflict || cell.assignedCount < cell.requiredCount) {
          issueCount += 1
        }
      })

      let totalRequired = 0
      let totalAssignedSlots = 0
      blendGridRows.forEach((row) => {
        const cell = row.dayCells.find((entry) => entry.day.key === dayKey)
        if (!cell) return
        totalRequired += cell.requiredCount
        totalAssignedSlots += cell.assignedCount
      })

      let coveragePercent = null
      if (totalRequired > 0) {
        coveragePercent = Math.min(100, Math.round((totalAssignedSlots / totalRequired) * 100))
      } else if (totalAssignedStaff > 0) {
        coveragePercent = 100
      }

      let status = 'covered'
      let statusLabel = 'Covered'
      let statusIcon = '🟢'

      if (totalRequired === 0 && totalAssignedStaff === 0) {
        status = 'empty'
        statusLabel = 'Empty'
        statusIcon = '⚪'
      } else if (issueCount > 0) {
        status = 'understaffed'
        statusLabel = issueCount === 1 ? '1 issue' : `${issueCount} issues`
        statusIcon = '⚠️'
      } else if (hasOverstaffed) {
        status = 'overstaffed'
        statusLabel = 'Covered'
        statusIcon = '🟡'
      } else {
        status = 'covered'
        statusLabel = 'Covered'
        statusIcon = '🟢'
      }

      summaries[dayKey] = {
        totalAssignedStaff,
        totalScheduledHours,
        hoursLabel: formatHoursLabel(totalScheduledHours),
        coveragePercent,
        issueCount,
        status,
        statusLabel,
        statusIcon,
      }
    })

    return summaries
  }, [blendGridRows, employees, visibleWeekShifts, weekDays])

  const scheduleWarningCount = useMemo(() => (
    Object.values(dayHeaderSummariesByKey).filter(
      (summary) => summary.status === 'understaffed'
        || summary.status === 'overstaffed'
        || summary.status === 'conflict',
    ).length
  ), [dayHeaderSummariesByKey])

  const todayDateKey = formatLocalDateKey(new Date())

  const weekCompletion = useMemo(() => {
    let totalRequired = 0
    let totalAssigned = 0

    blendGridRows.forEach((row) => {
      row.dayCells.forEach((cell) => {
        totalRequired += cell.requiredCount
        totalAssigned += cell.assignedCount
      })
    })

    const percent = totalRequired > 0
      ? Math.round((totalAssigned / totalRequired) * 100)
      : (totalAssigned > 0 ? 100 : 0)

    return {
      totalRequired,
      totalAssigned,
      percent,
      barWidth: totalRequired > 0 ? Math.min(100, Math.round((totalAssigned / totalRequired) * 100)) : 0,
    }
  }, [blendGridRows])

  const scheduleVisualSearchNeedle = filters.search.trim().toLowerCase()
  const isScheduleVisualFilterActive = Boolean(focusedEmployeeId) || Boolean(scheduleVisualSearchNeedle)

  const activeStaffMembers = useMemo(() => (
    employees
      .filter((employee) => !isEmployeeUnavailable(employee))
      .sort((left, right) => (
        `${left.full_name || left.name || ''}`.localeCompare(`${right.full_name || right.name || ''}`)
      ))
  ), [employees])

  const employeeWeeklyHoursMap = useMemo(
    () => buildEmployeeWeeklyHoursMap(visibleWeekShifts),
    [visibleWeekShifts],
  )

  const assignmentTemplate = useMemo(
    () => scheduleGridTemplates.find((template) => template.id === assignmentDraft.templateId) ?? null,
    [assignmentDraft.templateId, scheduleGridTemplates],
  )

  const compatibleEmployeeIdSet = useMemo(() => {
    const areaOptions = areaPositionCatalog[assignmentDraft.area] ?? []
    const areaSet = new Set(areaOptions.map((item) => item.toLowerCase()))
    if (areaSet.size === 0) {
      return new Set(employees.map((employee) => String(employee.id)))
    }

    return new Set(
      employees
        .filter((employee) => getEmployeePositionNames(employee).some((name) => areaSet.has(name.toLowerCase())))
        .map((employee) => String(employee.id)),
    )
  }, [assignmentDraft.area, employees])

  const selectedAssignmentEmployees = useMemo(() => {
    const selectedSet = new Set((assignmentDraft.employeeIds ?? []).map((id) => String(id)))
    return employees.filter((employee) => selectedSet.has(String(employee.id)))
  }, [assignmentDraft.employeeIds, employees])

  const assignmentEmployeeOptions = useMemo(() => {
    const needle = assignmentEmployeeSearch.trim().toLowerCase()
    if (!needle) return employees
    return employees.filter((employee) => `${employee.full_name || employee.name || ''}`.toLowerCase().includes(needle))
  }, [assignmentEmployeeSearch, employees])

  const getEmployeeAdditionalPositions = (employee) => {
    const names = getEmployeePositionNames(employee)
    return names.slice(1)
  }

  const getEmployeeRoleOptions = (employee) => {
    const employeeRoles = getEmployeePositionNames(employee)
    const areaRoles = areaPositionCatalog[assignmentDraft.area] ?? []
    const unique = Array.from(new Set([...employeeRoles, ...areaRoles].filter(Boolean)))
    return [...unique, 'Custom']
  }

  const getDefaultRoleForEmployee = (employee) => {
    const employeeRoles = getEmployeePositionNames(employee)
    const areaRoles = areaPositionCatalog[assignmentDraft.area] ?? []
    const areaSet = new Set(areaRoles.map((item) => item.toLowerCase()))
    const compatibleEmployeeRoles = employeeRoles.filter((role) => areaSet.has(role.toLowerCase()))

    if (compatibleEmployeeRoles.length === 1) return compatibleEmployeeRoles[0]
    if (compatibleEmployeeRoles.length === 0 && employeeRoles.length === 1) return employeeRoles[0]
    if (compatibleEmployeeRoles.length === 0 && employeeRoles.length === 0 && areaRoles.length === 1) return areaRoles[0]
    if (compatibleEmployeeRoles.length === 0 && employeeRoles.length > 0 && areaRoles.length === 0) return employeeRoles[0]
    return ''
  }

  useEffect(() => {
    if (!isAssignmentModalOpen) return

    setAssignmentEmployeeRoleMap((current) => {
      const next = { ...current }
      let changed = false

      selectedAssignmentEmployees.forEach((employee) => {
        const key = String(employee.id)
        const existing = next[key]
        if (existing?.role) return
        const autoRole = getDefaultRoleForEmployee(employee)
        if (autoRole) {
          next[key] = { role: autoRole, customRole: '' }
          changed = true
        } else if (!existing) {
          next[key] = { role: '', customRole: '' }
          changed = true
        }
      })

      Object.keys(next).forEach((employeeId) => {
        if (!(assignmentDraft.employeeIds ?? []).some((id) => String(id) === employeeId)) {
          delete next[employeeId]
          changed = true
        }
      })

      return changed ? next : current
    })
  }, [assignmentDraft.area, assignmentDraft.employeeIds, isAssignmentModalOpen, selectedAssignmentEmployees])

  useEffect(() => {
    if (!isAssignmentModalOpen) return

    if (!assignmentDraft.positionName.trim()) return

    setAssignmentEmployeeRoleMap((current) => {
      const next = { ...current }
      let changed = false
      selectedAssignmentEmployees.forEach((employee) => {
        const key = String(employee.id)
        const currentRole = `${next[key]?.role ?? ''}`.trim()
        const currentCustom = `${next[key]?.customRole ?? ''}`.trim()
        if (!currentRole && !currentCustom) {
          next[key] = { role: assignmentDraft.positionName.trim(), customRole: '' }
          changed = true
        }
      })
      return changed ? next : current
    })
  }, [assignmentDraft.positionName, isAssignmentModalOpen, selectedAssignmentEmployees])

  const assignmentContext = useMemo(() => {
    if (!assignmentDraft.templateId || !assignmentDraft.shiftDate) return null

    const row = blendGridRows.find((item) => item.template.id === assignmentDraft.templateId)
    const cell = row?.dayCells.find((item) => item.day.key === assignmentDraft.shiftDate)
    const selectedDayRecord = weekDays.find((day) => day.key === assignmentDraft.shiftDate)

    const effectiveTemplate = {
      ...(row?.template ?? assignmentTemplate ?? {}),
      id: assignmentDraft.templateId,
      templateId: row?.template?.templateId ?? assignmentTemplate?.templateId ?? assignmentDraft.templateId,
      name: assignmentDraft.templateName || row?.template?.name || assignmentTemplate?.name || '',
      defaultArea: `${assignmentDraft.area ?? ''}`.trim() || row?.template?.defaultArea || assignmentTemplate?.defaultArea || '',
      defaultRole: assignmentDraft.defaultRole || row?.template?.defaultRole || assignmentTemplate?.defaultRole || '',
      startTime: assignmentDraft.startTime || row?.template?.startTime || assignmentTemplate?.startTime || '',
      endTime: assignmentDraft.endTime || row?.template?.endTime || assignmentTemplate?.endTime || '',
    }

    return {
      template: effectiveTemplate,
      cell: cell ?? null,
      selectedDayRecord: selectedDayRecord ?? null,
      dayLabel: assignmentDraft.shiftDate
        ? new Date(`${assignmentDraft.shiftDate}T00:00:00`).toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
        })
        : '',
    }
  }, [assignmentDraft.shiftDate, assignmentDraft.templateId, assignmentTemplate, blendGridRows, weekDays])

  const assignmentStaffingSummary = useMemo(
    () => getAssignmentStaffingSummary(assignmentContext?.cell, assignmentContext?.template, selectedAssignmentEmployees),
    [assignmentContext?.cell, assignmentContext?.template, selectedAssignmentEmployees],
  )

  const handleOpenAssignmentModal = (template, day) => {
    if (!canEditSchedule) return
    const fromCollection = scheduleGridTemplates.find((item) => item.id === template.id || item.templateId === template.templateId)
    if (fromCollection && `${fromCollection.defaultArea ?? ''}`.trim() && !`${template?.defaultArea ?? ''}`.trim()) {
      console.warn('Template area lost between collection and cell payload', {
        collectionTemplate: fromCollection,
        cellTemplate: template,
      })
    }

    setSelectedDay(day.key)
    setAssignmentError('')
    setAssignmentFieldErrors({})
    setAssignmentMissingFields([])
    setAssignmentAreaApplyMode('once')
    setAssignmentEmployeeSearch('')
    setAssignmentEmployeeRoleMap({})
    const areaInfo = inferAreaFromTemplate(template)
    setAssignmentDraft({
      templateId: template.id,
      templateName: template.name || '',
      shiftDate: day.key,
      employeeIds: [],
      area: areaInfo.area,
      defaultRole: `${template.defaultRole ?? ''}`.trim(),
      startTime: normalizeTimeValue(template.startTime),
      endTime: normalizeTimeValue(template.endTime),
      positionName: '',
      templateAreaMissing: !`${template.defaultArea ?? ''}`.trim(),
      notes: '',
    })
    setIsAssignmentModalOpen(true)
  }

  const handleCloseAssignmentModal = () => {
    setIsAssignmentModalOpen(false)
    setAssignmentError('')
    setAssignmentFieldErrors({})
    setAssignmentMissingFields([])
    setAssignmentAreaApplyMode('once')
    setAssignmentEmployeeSearch('')
    setAssignmentEmployeeRoleMap({})
    setAssignmentDraft({
      templateId: '',
      templateName: '',
      shiftDate: '',
      employeeIds: [],
      area: '',
      defaultRole: '',
      startTime: '',
      endTime: '',
      positionName: '',
      templateAreaMissing: false,
      notes: '',
    })
  }

  const handleSelectCellCapacity = async (template, day, nextRequired) => {
    const currentRequired = getRequiredCountForCell(template, day.key)
    const normalizedNext = Number(nextRequired)
    if (!Number.isFinite(normalizedNext) || normalizedNext < 0) {
      setAssignmentError('Required staffing must be between 0 and 99.')
      return false
    }

    if (normalizedNext > 99) {
      setAssignmentError('Required staffing must be between 0 and 99.')
      return false
    }

    if (normalizedNext === currentRequired) {
      setCapacityPickerKey('')
      return true
    }

    const templateId = resolveTemplateCapacityId(template)
    const normalizedShiftDate = normalizeShiftDateKey(day.key)
    const key = buildCapacityKey(templateId, normalizedShiftDate)

    setCapacityPickerKey('')
    setCapacityDraftMap((current) => ({
      ...current,
      [key]: normalizedNext,
    }))
    setCapacitySavingKey(key)

    try {
      const saved = await onUpdateCellCapacity({
        shiftTemplateId: templateId,
        shiftDate: normalizedShiftDate,
        requiredCount: normalizedNext,
      })
      setCapacityDraftMap((current) => ({
        ...current,
        [key]: Number(saved.requiredCount),
      }))
      return true
    } catch (error) {
      setCapacityDraftMap((current) => ({
        ...current,
        [key]: currentRequired,
      }))
      setAssignmentError(error?.message || 'Unable to update required staffing right now.')
      return false
    } finally {
      setCapacitySavingKey('')
    }
  }

  const handleAdjustCellCapacity = async (template, day, cell, delta) => {
    const current = Number(cell.requiredCount) || 0
    const next = Math.max(0, Math.min(99, current + delta))
    if (next === current) return
    await handleSelectCellCapacity(template, day, next)
  }

  const handleSaveCustomCapacity = async (template, day) => {
    const parsed = Number(capacityCustomValue)
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 99) {
      setAssignmentError('Required staffing must be between 0 and 99.')
      return
    }

    await handleSelectCellCapacity(template, day, Math.floor(parsed))
    setCapacityCustomValue('')
  }

  const handleSaveAssignmentAreaToTemplate = async () => {
    const template = scheduleGridTemplates.find((item) => item.id === assignmentDraft.templateId)
    if (!template) {
      setAssignmentError('Shift template could not be found.')
      return
    }

    const normalizedArea = `${assignmentDraft.area ?? ''}`.trim()
    if (!normalizedArea) {
      setAssignmentError('Area is required before saving to template.')
      return
    }

    try {
      await onApplyAreaToTemplate(template, normalizedArea)
      setAssignmentAreaApplyMode('template')
      setAssignmentDraft((current) => ({
        ...current,
        templateAreaMissing: false,
        area: normalizedArea,
      }))
      setAssignmentError('')
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to save area to template right now.')
    }
  }

  const handleCreateAssignment = async (event) => {
    event.preventDefault()

    const template = scheduleGridTemplates.find((item) => item.id === assignmentDraft.templateId)
    if (!template) {
      setAssignmentFieldErrors({ shift_template_id: 'Shift template is missing.' })
      setAssignmentMissingFields(['shift_template_id'])
      setAssignmentError('Cannot save assignment.')
      return
    }

    const payload = {
      shift_template_id: template.templateId ?? assignmentDraft.templateId,
      shift_template_name: assignmentDraft.templateName || template.name || '',
      shift_date: assignmentDraft.shiftDate,
      start_time: normalizeTimeValue(assignmentDraft.startTime || template.startTime),
      end_time: normalizeTimeValue(assignmentDraft.endTime || template.endTime),
      area: `${assignmentDraft.area ?? template.defaultArea ?? ''}`.trim(),
      status: 'Scheduled',
      notes: assignmentDraft.notes,
    }

    const nextFieldErrors = {}
    const missingFields = []

    if (!Array.isArray(assignmentDraft.employeeIds) || assignmentDraft.employeeIds.length === 0) {
      nextFieldErrors.employee_ids = 'Select at least one employee.'
      missingFields.push('employee_ids')
    }

    if (!payload.shift_template_id) {
      nextFieldErrors.shift_template_id = 'Shift template is missing.'
      missingFields.push('shift_template_id')
    }

    if (!payload.shift_date) {
      nextFieldErrors.shift_date = 'Shift date is missing.'
      missingFields.push('shift_date')
    }

    if (!payload.start_time) {
      nextFieldErrors.start_time = 'Start time is missing.'
      missingFields.push('start_time')
    }

    if (!payload.end_time) {
      nextFieldErrors.end_time = 'End time is missing.'
      missingFields.push('end_time')
    }

    if (!payload.area) {
      nextFieldErrors.area = 'Area is required.'
      missingFields.push('area')
    }

    const selectedEmployees = employees.filter((employee) => (
      (assignmentDraft.employeeIds ?? []).some((id) => String(id) === String(employee.id))
    ))

      const unresolvedPositionEmployees = selectedEmployees.filter((employee) => {
      const employeeKey = String(employee.id)
      const roleState = assignmentEmployeeRoleMap[employeeKey] ?? { role: '', customRole: '' }
      const resolvedRole = roleState.role === 'Custom'
        ? `${roleState.customRole ?? ''}`.trim()
        : `${roleState.role ?? ''}`.trim() || getDefaultRoleForEmployee(employee) || getEmployeePrimaryPosition(employee)
      return !resolvedRole
    })

    if (unresolvedPositionEmployees.length > 0) {
      nextFieldErrors.employee_positions = 'Every selected employee must have a position.'
      missingFields.push('employee_positions')
    }

    if (missingFields.length > 0) {
      setAssignmentFieldErrors(nextFieldErrors)
      setAssignmentMissingFields(missingFields)
      setAssignmentError('Cannot save assignment.')
      return
    }

    setAssignmentFieldErrors({})
    setAssignmentMissingFields([])
    setAssignmentError('')

    try {
      if (assignmentDraft.templateAreaMissing && payload.area && assignmentAreaApplyMode === 'template') {
        await onApplyAreaToTemplate(template, payload.area)
      }

      let assignedCount = 0
      const skippedMessages = []

      for (const employee of selectedEmployees) {
        try {
          const employeeKey = String(employee.id)
          const roleState = assignmentEmployeeRoleMap[employeeKey] ?? { role: '', customRole: '' }
          const resolvedRole = roleState.role === 'Custom'
            ? `${roleState.customRole ?? ''}`.trim()
            : `${roleState.role ?? ''}`.trim() || getDefaultRoleForEmployee(employee) || getEmployeePrimaryPosition(employee)

          if (!resolvedRole) {
            const name = employee.full_name || employee.name || `Employee ${employee.id}`
            skippedMessages.push(`Skipped ${name} due to: Position is required.`)
            continue
          }

          await onCreateGridShift({
            employeeId: employee.id,
            shiftDate: assignmentDraft.shiftDate,
            template: {
              ...template,
              name: payload.shift_template_name,
              defaultArea: payload.area,
              defaultRole: assignmentDraft.defaultRole || template.defaultRole || '',
              startTime: payload.start_time,
              endTime: payload.end_time,
            },
            positionName: resolvedRole,
            notes: assignmentDraft.notes,
            requiredCount: assignmentContext?.cell?.requiredCount ?? 1,
            currentAssignedCount: (assignmentContext?.cell?.assignedCount ?? 0) + assignedCount,
          })
          assignedCount += 1
        } catch (error) {
          const name = employee.full_name || employee.name || `Employee ${employee.id}`
          const message = `${error?.message || ''}`.toLowerCase()
          if (message.includes('already scheduled')) {
            skippedMessages.push(`Skipped ${name} because he is already scheduled for this shift.`)
            continue
          }
          if (message.includes('cancelled')) {
            skippedMessages.push(`Skipped ${name}; overlap not confirmed.`)
            continue
          }
          if (message.includes('overlap')) {
            skippedMessages.push(`Skipped ${name} because this overlaps with another shift.`)
            continue
          }
          skippedMessages.push(`Skipped ${name} due to: ${error?.message || 'Unknown error.'}`)
        }
      }

      const skippedCount = skippedMessages.length
      const summary = `${assignedCount} employees assigned. ${skippedCount} skipped.`

      if (skippedCount > 0 || assignedCount === 0) {
        setAssignmentError(`${summary} ${skippedMessages.join(' ')}`.trim())
        return
      }

      handleCloseAssignmentModal()
    } catch (error) {
      setAssignmentError(error?.message || 'Unknown error while saving assignment.')
    }
  }

  const handleOpenAssignmentActions = (shift) => {
    if (!canEditSchedule) return
    setAssignmentError('')
    setEditingAssignmentShift(shift)
  }

  const handleCloseAssignmentActions = () => {
    setAssignmentError('')
    setEditingAssignmentShift(null)
  }

  const handleQuickEditShift = () => {
    if (!editingAssignmentShift) return

    const matchedTemplate = scheduleGridTemplates.find((template) => (
      resolveShiftTemplateId(template) === resolveShiftTemplateId(editingAssignmentShift)
    ))

    if (matchedTemplate && editingAssignmentShift.shiftTemplateId) {
      const usesCustomTime = isAssignmentUsingCustomTime(editingAssignmentShift, matchedTemplate)
      setAssignmentTimeEdit({
        shift: editingAssignmentShift,
        template: matchedTemplate,
        timeMode: usesCustomTime ? 'custom' : 'template',
        startTime: normalizeTimeValue(editingAssignmentShift.startTime) || normalizeTimeValue(matchedTemplate.startTime),
        endTime: normalizeTimeValue(editingAssignmentShift.endTime) || normalizeTimeValue(matchedTemplate.endTime),
      })
      setAssignmentError('')
      handleCloseAssignmentActions()
      return
    }

    onOpenEditShift(editingAssignmentShift)
    handleCloseAssignmentActions()
  }

  const handleCloseAssignmentTimeEdit = () => {
    setAssignmentTimeEdit(null)
    setAssignmentError('')
  }

  const handleAssignmentTimeModeChange = (timeMode) => {
    if (!assignmentTimeEdit) return

    if (timeMode === 'template') {
      setAssignmentTimeEdit((current) => ({
        ...current,
        timeMode: 'template',
        startTime: normalizeTimeValue(current.template.startTime),
        endTime: normalizeTimeValue(current.template.endTime),
      }))
      return
    }

    setAssignmentTimeEdit((current) => ({
      ...current,
      timeMode: 'custom',
    }))
  }

  const handleSaveAssignmentTimeEdit = async (event) => {
    event.preventDefault()
    if (!assignmentTimeEdit?.shift?.id) return

    const { shift, template, timeMode } = assignmentTimeEdit
    const startTime = timeMode === 'template'
      ? normalizeTimeValue(template.startTime)
      : normalizeTimeValue(assignmentTimeEdit.startTime)
    const endTime = timeMode === 'template'
      ? normalizeTimeValue(template.endTime)
      : normalizeTimeValue(assignmentTimeEdit.endTime)

    if (!startTime || !endTime || startTime === endTime) {
      setAssignmentError('Please add a valid start and end time.')
      return
    }

    try {
      await onUpdateAssignmentTime(shift.id, { startTime, endTime })
      setAssignmentTimeEdit(null)
      setAssignmentError('')
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to update assignment time right now.')
    }
  }

  const getShiftTemplateForAssignment = (shift) => (
    scheduleGridTemplates.find((template) => resolveShiftTemplateId(template) === resolveShiftTemplateId(shift)) ?? null
  )

  const handleQuickCopyToNextDay = async () => {
    if (!editingAssignmentShift?.id) return
    try {
      await onCopyShiftToNextDay(editingAssignmentShift)
      handleCloseAssignmentActions()
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to copy this shift to the next day.')
    }
  }

  const handleQuickCopyToRestOfWeek = async () => {
    if (!editingAssignmentShift?.id) return

    try {
      await onCopyShiftToRestOfWeek(editingAssignmentShift)
      handleCloseAssignmentActions()
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to copy this shift to the rest of the week.')
    }
  }

  const handleRequestDeleteShift = () => {
    if (!editingAssignmentShift) return
    setShiftPendingDelete(editingAssignmentShift)
    handleCloseAssignmentActions()
  }

  const handleConfirmDeleteShift = async () => {
    if (!shiftPendingDelete?.id) return

    try {
      await onRemoveGridShift(shiftPendingDelete.id)
      setShiftPendingDelete(null)
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to delete this shift right now.')
    }
  }

  const handleOpenShiftDetails = (shift) => {
    setSelectedShift(shift)
  }

  const handleCloseShiftDetails = () => {
    setSelectedShift(null)
  }

  const handleEditSelectedShift = () => {
    if (!selectedShift) return
    onOpenEditShift(selectedShift)
    handleCloseShiftDetails()
  }

  const handleDeleteSelectedShift = () => {
    if (!selectedShift) return
    onDeleteShift(selectedShift.id)
    handleCloseShiftDetails()
  }

  const handleOpenAddShiftForDate = (date) => {
    onOpenAddShift(date || selectedDate || '')
  }

  const handleShiftDragStart = (event, shift) => {
    if (isDragDropDisabled) {
      event.preventDefault()
      return
    }

    const mode = event.altKey ? 'copy' : 'prompt'
    const payload = { type: 'shift', shiftId: shift.id, mode }
    dragSessionRef.current = payload
    setDragPayload(payload)
    event.dataTransfer.setData('application/json', JSON.stringify(payload))
    event.dataTransfer.effectAllowed = mode === 'copy' ? 'copy' : 'move'
  }

  const handleEmployeeDragStart = (event, employee) => {
    if (isDragDropDisabled) {
      event.preventDefault()
      return
    }

    employeeChipClickGuardRef.current = true
    const payload = { type: 'employee', employeeId: employee.id }
    dragSessionRef.current = payload
    setDragPayload(payload)
    event.dataTransfer.setData('application/json', JSON.stringify(payload))
    event.dataTransfer.effectAllowed = 'copy'
  }

  const handleEmployeeChipFocusToggle = (employeeId) => {
    if (employeeChipClickGuardRef.current) return

    const employeeKey = String(employeeId)
    setFocusedEmployeeId((current) => (current === employeeKey ? null : employeeKey))
  }

  const handleDragEnd = () => {
    dragSessionRef.current = null
    setDragPayload(null)
    setDropTargetKey('')
    window.setTimeout(() => {
      employeeChipClickGuardRef.current = false
    }, 0)
  }

  const handleCellDragOver = (event, cellDropKey, { canAcceptDrop }) => {
    if (isDragDropDisabled) return
    if (!event.dataTransfer.types.includes('application/json')) return

    const session = dragSessionRef.current
    if (!session) return

    if (!canAcceptDrop) {
      setDropTargetKey('')
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = session.type === 'employee' || session.mode === 'copy' ? 'copy' : 'move'
    setDropTargetKey(cellDropKey)
  }

  const handleCloseShiftDropPrompt = () => {
    setPendingShiftDrop(null)
    setAssignmentError('')
  }

  const isSameShiftCell = (shift, template, dayKey) => {
    if (!shift) return false
    return resolveShiftTemplateId(shift) === resolveShiftTemplateId(template)
      && normalizeCellDate(`${shift.date}`) === normalizeCellDate(dayKey)
  }

  const handleConfirmShiftDropMove = async () => {
    if (!pendingShiftDrop) return

    const { shiftId, template, day, cell } = pendingShiftDrop

    try {
      setAssignmentError('')
      await onMoveGridShift(shiftId, {
        template,
        shiftDate: day.key,
        requiredCount: cell.requiredCount ?? 1,
        currentAssignedCount: cell.assignedCount ?? 0,
      })
      handleCloseShiftDropPrompt()
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to move this shift right now.')
    }
  }

  const handleConfirmShiftDropCopy = async () => {
    if (!pendingShiftDrop) return

    const { shiftId, template, day, cell } = pendingShiftDrop
    const sourceShift = shifts.find((item) => String(item.id) === String(shiftId))

    if (isEmployeeAssignedInCell(cell, sourceShift?.employeeId)) {
      setAssignmentError('This employee is already assigned here.')
      return
    }

    try {
      setAssignmentError('')
      await onCopyGridShift(shiftId, {
        template,
        shiftDate: day.key,
        requiredCount: cell.requiredCount ?? 1,
        currentAssignedCount: cell.assignedCount ?? 0,
        cellShifts: cell.shifts ?? [],
      })
      handleCloseShiftDropPrompt()
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to copy this shift right now.')
    }
  }

  const handleCellDrop = async (event, template, day, cell) => {
    event.preventDefault()
    event.stopPropagation()
    setDropTargetKey('')

    if (isDragDropDisabled) return

    let payload = dragSessionRef.current ?? dragPayload
    try {
      const raw = event.dataTransfer.getData('application/json')
      if (raw) {
        payload = JSON.parse(raw)
      }
    } catch {
      // Fall back to in-memory drag payload.
    }

    dragSessionRef.current = null
    setDragPayload(null)

    if (!payload?.type) return

    if (payload.type === 'shift') {
      if (!payload.shiftId) return

      const sourceShift = shifts.find((item) => String(item.id) === String(payload.shiftId))
      const dropMode = payload.mode === 'copy' ? 'copy' : 'prompt'

      if (dropMode === 'prompt' && isSameShiftCell(sourceShift, template, day.key)) {
        return
      }

      if (dropMode === 'copy') {
        if (isEmployeeAssignedInCell(cell, sourceShift?.employeeId)) {
          setAssignmentError('This employee is already assigned here.')
          return
        }

        try {
          setAssignmentError('')
          await onCopyGridShift(payload.shiftId, {
            template,
            shiftDate: day.key,
            requiredCount: cell.requiredCount ?? 1,
            currentAssignedCount: cell.assignedCount ?? 0,
            cellShifts: cell.shifts ?? [],
          })
        } catch (error) {
          setAssignmentError(error?.message || 'Unable to copy this shift right now.')
        }
        return
      }

      setAssignmentError('')
      setPendingShiftDrop({
        shiftId: payload.shiftId,
        template,
        day,
        cell,
      })
      return
    }

    if (payload.type === 'employee') {
      if (!payload.employeeId) return

      if (isEmployeeAssignedInCell(cell, payload.employeeId)) {
        setAssignmentError('This employee is already assigned here.')
        return
      }

      const employee = employees.find((item) => String(item.id) === String(payload.employeeId))
      if (!employee) {
        setAssignmentError('Employee could not be found.')
        return
      }

      if (isEmployeeUnavailable(employee)) {
        setAssignmentError('This employee is not available for assignment.')
        return
      }

      const areaInfo = inferAreaFromTemplate(template)
      const area = areaInfo.area
      if (!area) {
        setAssignmentError('This shift template needs an area before drag assignment.')
        return
      }

      const positionName = resolvePositionForDrop(
        employee,
        { area, defaultRole: template?.defaultRole ?? '' },
        areaPositionCatalog,
      )

      if (!positionName) {
        setAssignmentError('Could not determine a position for this employee. Use + to assign manually.')
        return
      }

      try {
        setAssignmentError('')
        await onCreateGridShift({
          employeeId: employee.id,
          shiftDate: day.key,
          template: {
            ...template,
            defaultArea: area,
            defaultRole: template?.defaultRole || positionName,
            startTime: template.startTime,
            endTime: template.endTime,
          },
          positionName,
          notes: '',
          requiredCount: cell.requiredCount ?? 1,
          currentAssignedCount: cell.assignedCount ?? 0,
        })
      } catch (error) {
        setAssignmentError(error?.message || 'Unable to assign this employee right now.')
      }
    }
  }

  const scheduleWorkspaceClassName = [
    'staff-page',
    'schedule-workspace',
    'schedule-focus-workspace',
    isMobileScheduleShell ? 'is-mobile-schedule-shell' : '',
    isScheduleCompactLandscape ? 'is-compact-landscape' : '',
    !isShiftTemplatesOpen ? 'is-templates-collapsed' : '',
    isShiftTemplatesOpen ? 'is-templates-open' : '',
  ].filter(Boolean).join(' ')

  const handleExitSchedule = () => {
    setIsShiftTemplatesOpen(false)
    onExitSchedule?.()
  }

  const renderShiftTemplatesToggle = () => {
    if (scheduleGridTemplates.length === 0) return null

    return (
      <button
        type="button"
        className={`ghost-btn schedule-header-templates-btn schedule-header-tertiary-btn schedule-header-control-surface${isShiftTemplatesOpen ? ' is-active' : ''}`}
        onClick={(event) => {
          event.stopPropagation()
          setIsShiftTemplatesOpen((current) => !current)
        }}
        aria-expanded={isShiftTemplatesOpen}
        aria-controls="schedule-templates-panel"
      >
        {isShiftTemplatesOpen ? 'Hide Templates' : 'Templates'}
      </button>
    )
  }

  const renderScheduleExitButton = () => {
    if (!onExitSchedule) return null

    return (
      <button
        type="button"
        className="ghost-btn schedule-focus-exit-btn"
        onClick={(event) => {
          event.stopPropagation()
          handleExitSchedule()
        }}
        aria-label="Exit Schedule"
      >
        Exit
      </button>
    )
  }

  const isScheduleWeekNavigationDisabled = isLoading || isSaving || isPublishing
  const isViewingCurrentScheduleWeek = isCurrentWeek(weekStartDate)

  const scheduleHeader = isMobileScheduleShell ? (
    <header className="mobile-manager-schedule-toolbar panel schedule-focus-header" aria-label="Schedule controls">
      <div className="mobile-manager-schedule-toolbar-top">
        <div className="mobile-manager-schedule-toolbar-copy">
          <p className="eyebrow">Schedule</p>
          <h2 className="mobile-manager-schedule-week-label">{formatScheduleHeaderWeekRange(weekDays)}</h2>
        </div>
        <div className="schedule-focus-header-actions">
          {renderShiftTemplatesToggle()}
          {renderScheduleExitButton()}
        </div>
        <span
          className={`schedule-status-badge mobile-manager-schedule-status ${isWeekPublished ? (hasUnpublishedChanges ? 'pending' : 'published') : 'draft'}`}
        >
          {schedulePublicationLabel}
        </span>
      </div>

      <ScheduleWeekNav
        isWeekUpdating={isScheduleWeekNavigationDisabled}
        isViewingCurrentWeek={isViewingCurrentScheduleWeek}
        onPreviousWeek={() => onWeekStartDateChange(addWeeks(weekStartDate, -1))}
        onGoToCurrentWeek={() => onWeekStartDateChange(getCurrentWeekStartDate())}
        onNextWeek={() => onWeekStartDateChange(addWeeks(weekStartDate, 1))}
      />

      {canEditSchedule ? (
        <div className="mobile-manager-schedule-actions">
          {(hasUnpublishedChanges || !isWeekPublished) ? (
            <button
              type="button"
              className="primary-btn mobile-manager-schedule-publish-btn"
              onClick={() => {
                setPublishError('')
                setIsPublishConfirmOpen(true)
              }}
              disabled={isSaving || isPublishing}
            >
              {hasUnpublishedChanges ? 'Publish changes' : 'Publish schedule'}
            </button>
          ) : (
            <button
              type="button"
              className="ghost-btn mobile-manager-schedule-unpublish-btn"
              onClick={() => {
                setPublishError('')
                setIsUnpublishConfirmOpen(true)
              }}
              disabled={isSaving || isPublishing}
            >
              Unpublish
            </button>
          )}
        </div>
      ) : null}
    </header>
  ) : (
    <header className="schedule-header panel schedule-focus-header">
      <div className="schedule-header-copy">
        <p className="eyebrow schedule-header-eyebrow">Schedule</p>
        <h2 className="schedule-header-title">{formatScheduleHeaderWeekRange(weekDays)}</h2>
      </div>

      <div className="schedule-header-actions">
        <div className="schedule-header-nav">
          <button
            type="button"
            className="ghost-btn schedule-header-nav-btn"
            onClick={() => onWeekStartDateChange(addWeeks(weekStartDate, -1))}
            disabled={isScheduleWeekNavigationDisabled}
          >
            ‹ Previous
          </button>
          <button
            type="button"
            className="ghost-btn schedule-header-nav-btn"
            onClick={() => onWeekStartDateChange(getCurrentWeekStartDate())}
            disabled={isScheduleWeekNavigationDisabled || isViewingCurrentScheduleWeek}
          >
            This week
          </button>
          <button
            type="button"
            className="ghost-btn schedule-header-nav-btn"
            onClick={() => onWeekStartDateChange(addWeeks(weekStartDate, 1))}
            disabled={isScheduleWeekNavigationDisabled}
          >
            Next ›
          </button>
        </div>

        <div className="schedule-header-controls">
        <span className={`schedule-status-badge schedule-header-control-surface ${isWeekPublished ? (hasUnpublishedChanges ? 'pending' : 'published') : 'draft'}`}>
          {schedulePublicationLabel}
        </span>

        {canEditSchedule ? (
        <div className="schedule-more-menu schedule-header-control-surface" onClick={(event) => event.stopPropagation()}>
          <button
            type="button"
            className="ghost-btn schedule-more-menu-btn schedule-header-tertiary-btn"
            onClick={() => setIsScheduleMoreMenuOpen((current) => !current)}
            aria-expanded={isScheduleMoreMenuOpen}
            aria-haspopup="menu"
          >
            More ▾
          </button>
          {isScheduleMoreMenuOpen ? (
            <div className="template-card-menu schedule-more-menu-dropdown" role="menu">
              <button type="button" className="template-card-menu-item" role="menuitem" onClick={() => { setIsScheduleMoreMenuOpen(false); handleOpenAddShiftForDate(selectedDate) }} disabled={isSaving}>Add Shift</button>
              <button type="button" className="template-card-menu-item" role="menuitem" onClick={() => { setIsScheduleMoreMenuOpen(false); handleOpenSaveWeekTemplateModal() }} disabled={isSaving}>Save Week</button>
              {selectedWeeklyTemplateId ? (
                <>
                  <button type="button" className="template-card-menu-item" role="menuitem" onClick={() => { setIsScheduleMoreMenuOpen(false); handleOpenLoadWeekTemplateModal() }} disabled={isSaving}>Load Week</button>
                  <button type="button" className="template-card-menu-item" role="menuitem" onClick={() => { setIsScheduleMoreMenuOpen(false); handleStartRenameWeeklyTemplate() }} disabled={isSaving}>Rename Week</button>
                  <button type="button" className="template-card-menu-item" role="menuitem" onClick={() => { setIsScheduleMoreMenuOpen(false); handleDeleteSelectedWeeklyTemplate() }} disabled={isSaving}>Delete Week</button>
                  <button type="button" className="template-card-menu-item" role="menuitem" onClick={() => { setIsScheduleMoreMenuOpen(false); handleOpenAutoFillModal() }} disabled={isSaving}>Auto Fill</button>
                </>
              ) : null}
              {visibleWeekShifts.length > 0 ? (
                <button type="button" className="template-card-menu-item" role="menuitem" onClick={() => { setIsScheduleMoreMenuOpen(false); handleOpenCopyWeekModal() }} disabled={isLoading || isSaving || isPublishing}>Copy Week</button>
              ) : null}
              <button type="button" className="template-card-menu-item danger" role="menuitem" onClick={() => { setIsScheduleMoreMenuOpen(false); handleOpenClearWeekModal() }} disabled={isSaving || isPublishing}>Clear Week</button>
            </div>
          ) : null}
        </div>
        ) : null}

        {renderShiftTemplatesToggle()}

        {canEditSchedule && (hasUnpublishedChanges || !isWeekPublished) ? (
          <button
            type="button"
            className="primary-btn schedule-publish-btn schedule-publish-btn--draft schedule-header-control-surface"
            onClick={() => {
              setPublishError('')
              setIsPublishConfirmOpen(true)
            }}
            disabled={isSaving || isPublishing}
          >
            {hasUnpublishedChanges ? 'Publish changes' : 'Publish'}
          </button>
        ) : canEditSchedule ? (
          <button
            type="button"
            className="ghost-btn schedule-unpublish-btn schedule-header-control-surface"
            onClick={() => {
              setPublishError('')
              setIsUnpublishConfirmOpen(true)
            }}
            disabled={isSaving || isPublishing}
          >
            Unpublish
          </button>
        ) : null}

        {renderScheduleExitButton()}
        </div>
      </div>
    </header>
  )

  return (
    <section className={scheduleWorkspaceClassName} onClick={() => { setCapacityPickerKey(''); setDayActionMenuKey(null); setCellActionMenuKey(''); setIsScheduleMoreMenuOpen(false); setTemplateActionMenuId(null) }}>
      {scheduleHeader}

      {hasUnpublishedChanges && isWeekPublished ? (
        <div className="staff-status-banner schedule-draft-changes-banner schedule-workspace-banner">
          Unpublished changes in this week&apos;s schedule.
        </div>
      ) : null}

      {!isWeekPublished ? (
        <div className="staff-status-banner schedule-draft-banner schedule-workspace-banner">
          <strong>Draft schedule</strong>
          <span>Only managers can see this until published.</span>
        </div>
      ) : null}

      {assignmentError ? <div className="staff-status-banner schedule-workspace-banner">{assignmentError}</div> : null}
      {noticeMessage ? (
        <div className={`staff-status-banner schedule-workspace-banner ${noticeMessage === 'Schedule published for employees.' ? 'schedule-publish-success-banner' : ''}`}>
          {noticeMessage === 'Schedule published for employees.' ? (
            <>
              <span className="schedule-publish-success-icon" aria-hidden="true">✓</span>
              <span>{noticeMessage}</span>
            </>
          ) : noticeMessage}
        </div>
      ) : null}
      {isLoading ? <div className="staff-status-banner schedule-workspace-banner">Loading schedule…</div> : null}

      <div className={`schedule-workspace-layout ${scheduleGridTemplates.length === 0 ? 'schedule-workspace-layout-empty' : ''}`}>
        <div className="schedule-workspace-main">
          <details className="schedule-staff-availability panel staff-panel">
            <summary className="schedule-staff-availability-summary">
              <span>Staff availability</span>
              <span className="schedule-collapsible-chevron" aria-hidden="true">▾</span>
            </summary>
            <div className="schedule-staff-availability-body">
              <div className="schedule-filters-bar schedule-filters-bar-compact">
                <label className="schedule-filter-field schedule-filter-search">
                  <span className="schedule-filter-label">Search employee</span>
                  <input
                    value={filters.search}
                    onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                    placeholder="Search by name"
                  />
                </label>
                <label className="schedule-filter-field">
                  <span className="schedule-filter-label">Department</span>
                  <select value={filters.department} onChange={(event) => setFilters((current) => ({ ...current, department: event.target.value }))}>
                    <option value="All">All departments</option>
                    <option value="Bar">Bar</option>
                    <option value="Service">Service</option>
                    <option value="Host">Host</option>
                    <option value="Kitchen">Kitchen</option>
                    <option value="Management">Management</option>
                  </select>
                </label>
                <label className="schedule-filter-field">
                  <span className="schedule-filter-label">Position</span>
                  <select value={filters.position} onChange={(event) => setFilters((current) => ({ ...current, position: event.target.value }))}>
                    {positionFilterOptions.map((option) => (
                      <option key={`schedule-position-filter-${option}`} value={option}>
                        {option === 'All' ? 'All positions' : option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="schedule-filter-toggle">
                  <input
                    type="checkbox"
                    checked={filters.publishedOnly}
                    onChange={(event) => setFilters((current) => ({ ...current, publishedOnly: event.target.checked }))}
                    disabled={!isWeekPublished}
                  />
                  <span>Show Published Only</span>
                </label>
              </div>

              <div className="schedule-roster-bar">
                <div className="schedule-staff-strip">
                  <div className="schedule-staff-strip-scroll">
                    {activeStaffMembers.length === 0 ? (
                      <p className="schedule-staff-strip-empty">No active employees available.</p>
                    ) : (
                      activeStaffMembers.map((employee) => {
                        const employeeName = employee.full_name || employee.name || 'Staff'
                        const firstName = getEmployeeFirstName(employee)
                        const positionLabel = getEmployeePrimaryPosition(employee)
                        const scheduledHours = employeeWeeklyHoursMap.get(String(employee.id)) ?? 0
                        const weeklyTarget = parseWeeklyHoursTarget(employee.weeklyHours ?? employee.weekly_hours)
                        const hoursTracker = getEmployeeHoursTrackerState(scheduledHours, weeklyTarget)
                        const workloadStatus = getEmployeeWorkloadStatus(scheduledHours, weeklyTarget)
                        const employeeKey = String(employee.id)
                        const isEmployeeFocused = focusedEmployeeId === employeeKey
                        const chipMatchesSearch = !scheduleVisualSearchNeedle
                          || employeeName.toLowerCase().includes(scheduleVisualSearchNeedle)

                        return (
                          <button
                            key={`staff-chip-${employee.id}`}
                            type="button"
                            className={`schedule-staff-chip ${isEmployeeFocused ? 'focused' : ''} ${isScheduleVisualFilterActive && !chipMatchesSearch ? 'visual-faded' : ''} ${dragPayload?.type === 'employee' && String(dragPayload.employeeId) === employeeKey ? 'dragging' : ''}`}
                            draggable={!isDragDropDisabled}
                            onDragStart={(event) => handleEmployeeDragStart(event, employee)}
                            onDragEnd={handleDragEnd}
                            onClick={(event) => {
                              event.stopPropagation()
                              handleEmployeeChipFocusToggle(employee.id)
                            }}
                            aria-label={`${isEmployeeFocused ? 'Clear focus for' : 'Focus'} ${employeeName}, ${workloadStatus.label}, ${positionLabel}`}
                            aria-pressed={isEmployeeFocused}
                          >
                            <span className="schedule-staff-chip-avatar">{getInitials(employeeName)}</span>
                            <span className="schedule-staff-chip-body">
                              <strong className="schedule-staff-chip-name">{firstName}</strong>
                              <span className="schedule-staff-chip-role">{positionLabel}</span>
                              <span className={`schedule-staff-workload-status tone-${workloadStatus.tone}`}>
                                {workloadStatus.label}
                              </span>
                              <span className="schedule-staff-hours-primary">{hoursTracker.primaryLabel}</span>
                            </span>
                          </button>
                        )
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          </details>

      <div className={`schedule-grid-section panel staff-panel blend-grid-panel schedule-grid-hero ${isScheduleVisualFilterActive ? 'schedule-visual-filter-active' : ''}`}>
        {scheduleGridTemplates.length === 0 ? (
          <div className="schedule-empty-state">
            <h4>No shift templates available.</h4>
            <p>Create templates first, then assign employees directly in this grid.</p>
          </div>
        ) : (
          <div className="blend-grid-scroll">
            <div
              className="blend-grid-table schedule-day-grid"
              style={{
                gridTemplateColumns: `repeat(${weekDays.length}, ${scheduleDayColumnWidth}px)`,
                minWidth: `${scheduleGridTableMinWidth}px`,
              }}
            >
              {weekDays.map((day) => {
                const daySummary = dayHeaderSummariesByKey[day.key] ?? {
                  status: 'empty',
                  statusLabel: 'Empty',
                }
                const dayHeader = formatScheduleDayHeader(day.key)
                const isTodayColumn = day.key === todayDateKey
                return (
                <div
                  key={`head-${day.key}`}
                  className={`blend-grid-header blend-grid-header-day ${selectedDay === day.key ? 'active' : ''} ${isTodayColumn ? 'is-today' : ''}`}
                >
                  <button
                    type="button"
                    className="blend-grid-header-day-select"
                    onClick={() => setSelectedDay(day.key)}
                  >
                    <strong className="blend-grid-header-day-name">{dayHeader.weekdayLabel}</strong>
                    <span className="blend-grid-header-day-date">{dayHeader.calendarLabel}</span>
                    <span className={`schedule-day-status-label tone-${daySummary.status}`}>
                      {formatDayCoverageBadgeLabel(daySummary)}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="blend-grid-header-day-menu-btn"
                    onClick={(event) => {
                      event.stopPropagation()
                      if (dayActionMenuKey === day.key) {
                        setDayActionMenuKey(null)
                        dayActionMenuAnchorRef.current = null
                      } else {
                        dayActionMenuAnchorRef.current = event.currentTarget
                        setDayActionMenuKey(day.key)
                      }
                    }}
                    aria-label={`Day actions for ${day.label}`}
                    disabled={isSaving}
                  >
                    ⋯
                  </button>
                  <ScheduleCardActionMenu
                    isOpen={dayActionMenuKey === day.key}
                    onClose={() => {
                      setDayActionMenuKey(null)
                      dayActionMenuAnchorRef.current = null
                    }}
                    anchorEl={dayActionMenuAnchorRef.current}
                    className="template-card-menu blend-day-header-menu"
                  >
                    <button
                      type="button"
                      className="template-card-menu-item"
                      onClick={() => handleOpenCopyDayModal(day)}
                      disabled={isSaving || (shiftCountByDate[day.key] ?? 0) === 0}
                    >
                      Copy Day
                    </button>
                    <button
                      type="button"
                      className="template-card-menu-item danger"
                      onClick={() => handleOpenClearDayModal(day)}
                      disabled={isSaving || (shiftCountByDate[day.key] ?? 0) === 0}
                    >
                      Clear Day
                    </button>
                  </ScheduleCardActionMenu>
                </div>
                )
              })}

              {blendGridAreaGroups.map((group) => {
                const isAreaExpanded = !collapsedScheduleAreaKeys.has(group.areaKey)

                return (
                <Fragment key={`area-group-${group.areaKey}`}>
                  <button
                    type="button"
                    className="schedule-grid-area-group-header"
                    style={{ gridColumn: '1 / -1' }}
                    onClick={() => toggleScheduleAreaGroup(group.areaKey)}
                    aria-expanded={isAreaExpanded}
                  >
                    <span className={`schedule-grid-area-chevron${isAreaExpanded ? ' is-expanded' : ''}`} aria-hidden="true">▾</span>
                    <span className="schedule-grid-area-label">{group.areaLabel.toUpperCase()}</span>
                    <span className="schedule-grid-area-count">{group.rows.length}</span>
                  </button>

                  {isAreaExpanded ? group.rows.map((row) => {
                const templateShiftName = `${row.template.name || row.template.defaultArea || 'Shift'}`.trim()
                const templateDepartment = `${row.template.defaultArea || row.template.defaultRole || 'General'}`.trim()
                const templateShiftDisplayName = formatScheduleShiftDisplayName(templateShiftName, templateDepartment)
                const templateTimeLabel = formatTimeRange24(row.template.startTime, row.template.endTime, ' - ')
                const capacityKey = (dayKey) => `${row.template.templateId ?? row.template.id}|${dayKey}`
                return (
                <Fragment key={`row-${row.template.id}`}>
                  {row.dayCells.map((cell) => {
                    const cellDropKey = buildCellDropKey(row.template, cell.day.key)
                    const draggedShift = dragPayload?.type === 'shift' && dragPayload?.shiftId
                      ? shifts.find((item) => String(item.id) === String(dragPayload.shiftId))
                      : null
                    const isShiftCopyDrag = dragPayload?.type === 'shift' && dragPayload?.mode === 'copy'
                    const isShiftPromptDrag = dragPayload?.type === 'shift' && dragPayload?.mode !== 'copy'
                    const isSameTemplateForCopy = !isShiftCopyDrag
                      || (
                        draggedShift
                        && resolveShiftTemplateId(draggedShift) === resolveShiftTemplateId(row.template)
                      )
                    const canAcceptEmployeeDrop = dragPayload?.type === 'employee'
                    const canAcceptShiftCopyDrop = isShiftCopyDrag && isSameTemplateForCopy
                    const canAcceptShiftMoveDrop = isShiftPromptDrag
                    const canAcceptDrop = canAcceptEmployeeDrop || canAcceptShiftCopyDrop || canAcceptShiftMoveDrop
                    const isDropTarget = dropTargetKey === cellDropKey && canAcceptDrop
                    const isTodayColumn = cell.day.key === todayDateKey
                    const cellHasVisualEmphasis = !isScheduleVisualFilterActive || cell.shifts.some((shift) => {
                      const shiftEmployeeName = shift.employees?.full_name || shift.employeeName || shift.employeeRecord?.name || 'Unassigned'
                      return doesShiftMatchScheduleVisualFilter(shift, shiftEmployeeName, {
                        focusedEmployeeId,
                        searchNeedle: scheduleVisualSearchNeedle,
                      })
                    })
                    const coverageDetail = formatScheduleCellCoverageDetail(cell)
                    const isCapacitySaving = capacitySavingKey === capacityKey(cell.day.key)

                    return (
                    <article
                      key={`cell-${row.template.id}-${cell.day.key}`}
                      className={`blend-grid-assignment-cell schedule-shift-instance-card ${selectedDay === cell.day.key ? 'active' : ''} ${cell.assignedCount === 0 ? 'empty' : ''} ${cell.hasRealConflict ? 'has-conflict' : cell.staffingState} ${isDropTarget ? 'drop-target' : ''} ${isTodayColumn ? 'is-today' : ''} ${isScheduleVisualFilterActive && !cellHasVisualEmphasis ? 'visual-faded' : ''}`}
                      onClick={() => setSelectedDay(cell.day.key)}
                      onDragOver={(event) => handleCellDragOver(event, cellDropKey, { canAcceptDrop })}
                      onDrop={(event) => handleCellDrop(event, row.template, cell.day, cell)}
                    >
                      <header className="schedule-shift-instance-header">
                        <div className="schedule-shift-instance-copy">
                          <h4 className="schedule-shift-instance-title">
                            <span className="schedule-shift-instance-dept">{templateDepartment}</span>
                            <span className="schedule-shift-instance-separator" aria-hidden="true">·</span>
                            <span className="schedule-shift-instance-name">{templateShiftDisplayName}</span>
                          </h4>
                          {templateTimeLabel ? (
                            <span className="schedule-shift-instance-time">{templateTimeLabel}</span>
                          ) : null}
                        </div>
                        <div className="blend-grid-cell-actions" onClick={(event) => event.stopPropagation()}>
                          <button
                            type="button"
                            className="blend-grid-cell-menu-btn"
                            onClick={(event) => {
                              event.stopPropagation()
                              const menuKey = buildCellActionMenuKey(row.template, cell.day.key)
                              if (cellActionMenuKey === menuKey) {
                                setCellActionMenuKey('')
                                cellActionMenuAnchorRef.current = null
                              } else {
                                cellActionMenuAnchorRef.current = event.currentTarget
                                setCellActionMenuKey(menuKey)
                              }
                            }}
                            aria-label={`Shift actions for ${row.template.name} on ${cell.day.label}`}
                            disabled={isSaving}
                          >
                            ⋯
                          </button>
                          <ScheduleCardActionMenu
                            isOpen={cellActionMenuKey === buildCellActionMenuKey(row.template, cell.day.key)}
                            onClose={() => {
                              setCellActionMenuKey('')
                              cellActionMenuAnchorRef.current = null
                            }}
                            anchorEl={cellActionMenuAnchorRef.current}
                            className="template-card-menu blend-grid-cell-menu"
                          >
                            <button
                              type="button"
                              className="template-card-menu-item"
                              onClick={() => handleOpenCapacityEditModal(row.template, cell.day, cell)}
                              disabled={isSaving}
                            >
                              Change required staff
                            </button>
                            <button
                              type="button"
                              className="template-card-menu-item"
                              onClick={() => handleEditCellShift(row.template, cell.day)}
                              disabled={isSaving}
                            >
                              Assign employees
                            </button>
                            <button
                              type="button"
                              className="template-card-menu-item"
                              onClick={() => handleRequestCopyCellToNextDay(row.template, cell.day, cell)}
                              disabled={isSaving}
                            >
                              Copy to next day
                            </button>
                            <button
                              type="button"
                              className="template-card-menu-item"
                              onClick={() => handleRequestCopyCellToRestOfWeek(row.template, cell.day, cell)}
                              disabled={isSaving}
                            >
                              Copy to rest of week
                            </button>
                            <button
                              type="button"
                              className="template-card-menu-item"
                              onClick={() => handleDuplicateCellShifts(row.template, cell.day, cell)}
                              disabled={isSaving || cell.shifts.length === 0}
                            >
                              Duplicate shift
                            </button>
                            <button
                              type="button"
                              className="template-card-menu-item danger"
                              onClick={() => handleOpenClearCellModal(row.template, cell)}
                              disabled={isSaving || cell.assignedCount === 0}
                            >
                              Remove shift
                            </button>
                          </ScheduleCardActionMenu>
                        </div>
                      </header>

                      <p className="schedule-shift-staff-ratio" aria-label={`${cell.assignedCount} of ${cell.requiredCount} staff scheduled`}>
                        <span className="schedule-shift-needed-icon" aria-hidden="true">👥</span>
                        <span className="schedule-shift-staff-ratio-value">
                          {cell.assignedCount} / {isCapacitySaving ? '…' : cell.requiredCount} scheduled
                        </span>
                      </p>

                      <div className="schedule-shift-assigned-block">
                        {cell.shifts.length > 0 ? (
                          <ul className="schedule-shift-assigned-list">
                            {cell.shifts.map((shift) => {
                              const employeeName = shift.employees?.full_name || shift.employeeName || shift.employeeRecord?.name || 'Unassigned'
                              const pillIsEmphasized = doesShiftMatchScheduleVisualFilter(shift, employeeName, {
                                focusedEmployeeId,
                                searchNeedle: scheduleVisualSearchNeedle,
                              })

                              return (
                                <li key={`shift-assigned-${shift.id}`}>
                                  <button
                                    type="button"
                                    className={`schedule-shift-assigned-item ${dragPayload?.shiftId === shift.id ? 'dragging' : ''} ${isScheduleVisualFilterActive ? (pillIsEmphasized ? 'visual-emphasis' : 'visual-faded') : ''}`}
                                    draggable={!isDragDropDisabled}
                                    onDragStart={(event) => handleShiftDragStart(event, shift)}
                                    onDragEnd={handleDragEnd}
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      handleOpenAssignmentActions(shift)
                                    }}
                                  >
                                    {employeeName}
                                  </button>
                                </li>
                              )
                            })}
                          </ul>
                        ) : null}
                        <button
                          type="button"
                          className="schedule-assign-btn"
                          onClick={(event) => {
                            event.stopPropagation()
                            handleOpenAssignmentModal(row.template, cell.day)
                          }}
                          disabled={isSaving}
                        >
                          {cell.shifts.length === 0 ? '+ Add employee' : '+ Add'}
                        </button>
                      </div>

                      {coverageDetail.show ? (
                        <p className={`schedule-shift-coverage-status tone-${coverageDetail.tone}`}>
                          {coverageDetail.label}
                        </p>
                      ) : null}
                    </article>
                    )
                  })}
                </Fragment>
                )
              }) : null}
                </Fragment>
                )
              })}
            </div>
          </div>
        )}
      </div>
        </div>

        {scheduleGridTemplates.length > 0 ? (
          <aside
            id="schedule-templates-panel"
            className={`schedule-templates-panel schedule-templates-overlay panel staff-panel${isShiftTemplatesOpen ? ' is-overlay-open' : ''}`}
            aria-label="Shift templates"
            aria-hidden={!isShiftTemplatesOpen}
          >
            <header className="schedule-templates-overlay-header schedule-templates-panel-header">
              <div className="schedule-templates-panel-header-copy">
                <p className="eyebrow">Tools</p>
                <h3>Shift templates</h3>
                <p className="schedule-templates-panel-note">Assign employees to day cells in the week grid.</p>
              </div>
              <button
                type="button"
                className="schedule-templates-panel-close"
                onClick={(event) => {
                  event.stopPropagation()
                  setIsShiftTemplatesOpen(false)
                }}
                aria-label="Hide shift templates"
              >
                ›
              </button>
            </header>
            <div className="schedule-templates-overlay-body schedule-templates-list">
              {blendGridAreaGroups.map((group) => {
                const isAreaExpanded = !collapsedScheduleAreaKeys.has(group.areaKey)

                return (
                  <section key={`template-area-${group.areaKey}`} className="schedule-template-area-group">
                    <button
                      type="button"
                      className="schedule-template-area-group-header"
                      onClick={() => toggleScheduleAreaGroup(group.areaKey)}
                      aria-expanded={isAreaExpanded}
                    >
                      <span className={`schedule-grid-area-chevron${isAreaExpanded ? ' is-expanded' : ''}`} aria-hidden="true">▾</span>
                      <span className="schedule-template-area-group-label">{group.areaLabel.toUpperCase()}</span>
                      <span className="schedule-grid-area-count">{group.rows.length}</span>
                    </button>

                    {isAreaExpanded ? (
                      <div className="schedule-template-area-group-list">
                        {group.rows.map((row) => {
                const templateDefaultRequired = getTemplateDefaultRequiredCount(row.template)
                const templateName = `${row.template.name || 'Shift'}`.trim()
                const templateNote = `${row.template.notes ?? ''}`.trim()
                const templateStaffLabel = templateDefaultRequired === 1
                  ? '1 employee'
                  : `${templateDefaultRequired} employees`
                const isTemplateActionsOpen = templateActionMenuId === row.template.id

                return (
                  <article
                    key={`template-panel-${row.template.id}`}
                    className={`blend-grid-palette-card schedule-template-card${isTemplateActionsOpen ? ' is-actions-open' : ''}`}
                  >
                    <div className="schedule-template-card-heading-row">
                      <div className="schedule-template-card-heading">
                        <p className="schedule-template-card-name">{templateName}</p>
                      </div>
                      <div className="template-card-actions schedule-template-card-actions">
                        <button
                          type="button"
                          className={`template-card-menu-btn schedule-template-menu-btn${isTemplateActionsOpen ? ' is-active' : ''}`}
                          onClick={(event) => {
                            event.stopPropagation()
                            setTemplateActionMenuId((current) => (current === row.template.id ? null : row.template.id))
                          }}
                          aria-label={`More actions for ${row.template.name}`}
                          aria-expanded={isTemplateActionsOpen}
                          aria-haspopup="true"
                        >
                          ⋯
                        </button>
                      </div>
                    </div>

                    <div className="schedule-template-card-meta">
                      <p className="schedule-template-card-time">
                        <span className="schedule-template-card-meta-icon" aria-hidden="true">🕓</span>
                        <span>{formatTimeRange24(row.template.startTime, row.template.endTime, ' - ')}</span>
                      </p>
                      <div className="schedule-template-card-staff">
                        <p className="schedule-template-card-staff-label">
                          <span className="schedule-template-card-meta-icon" aria-hidden="true">👥</span>
                          <span>Required staff</span>
                        </p>
                        <p className="schedule-template-card-staff-value">{templateStaffLabel}</p>
                      </div>
                    </div>

                    {isTemplateActionsOpen ? (
                      <div
                        ref={templateActionMenuRef}
                        className="schedule-template-inline-actions"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className="schedule-template-inline-actions-primary" role="group" aria-label="Template actions">
                          <div className="schedule-template-inline-actions-row schedule-template-inline-actions-row-split">
                            <button type="button" className="schedule-template-inline-action" onClick={() => handleStartRenameShiftTemplate(row.template)}>Rename</button>
                            <button type="button" className="schedule-template-inline-action" onClick={() => handleEditShiftTemplateFromCard(row.template)}>Edit</button>
                          </div>
                          <div className="schedule-template-inline-actions-row">
                            <button type="button" className="schedule-template-inline-action" onClick={() => handleDuplicateShiftTemplateFromCard(row.template)}>Duplicate</button>
                          </div>
                        </div>
                        <div className="schedule-template-inline-actions-danger">
                          <button type="button" className="schedule-template-inline-action danger" onClick={() => handleOpenDeleteShiftTemplateModal(row.template)}>Delete template</button>
                        </div>
                      </div>
                    ) : null}

                    {templateNote ? <p className="schedule-template-card-note">{templateNote}</p> : null}
                  </article>
                )
                        })}
                      </div>
                    ) : null}
                  </section>
                )
              })}
            </div>
          </aside>
        ) : null}
      </div>

      {scheduleGridTemplates.length > 0 ? (
        <ScheduleCollapsibleSection
          title="Insights"
          meta="Statistics, saved weeks, employee views, and coverage"
          className="schedule-insights-collapsible"
        >
          <section className="schedule-weekly-stats" aria-label="Weekly statistics">
            <article className="schedule-weekly-stat">
              <p className="schedule-weekly-stat-label">Employees</p>
              <p className="schedule-weekly-stat-value">{weekSummary.employeesScheduled}</p>
            </article>
            <article className="schedule-weekly-stat">
              <p className="schedule-weekly-stat-label">Shifts</p>
              <p className="schedule-weekly-stat-value">{weekSummary.totalShifts}</p>
            </article>
            <article className="schedule-weekly-stat">
              <p className="schedule-weekly-stat-label">Scheduled Hours</p>
              <p className="schedule-weekly-stat-value">{weekSummary.totalHours}h</p>
            </article>
            <article className="schedule-weekly-stat">
              <p className="schedule-weekly-stat-label">Coverage</p>
              <p className="schedule-weekly-stat-value">{weekCompletion.percent}%</p>
            </article>
            <article className="schedule-weekly-stat">
              <p className="schedule-weekly-stat-label">Labour Cost</p>
              <p className={`schedule-weekly-stat-value ${weekLabourSummary.costConnected ? 'tone-gold' : 'tone-muted'}`}>
                {weekLabourSummary.costConnected ? weekLabourSummary.costDisplay : 'Not Connected'}
              </p>
            </article>
            <article className="schedule-weekly-stat">
              <p className="schedule-weekly-stat-label">Warnings</p>
              <p className={`schedule-weekly-stat-value ${scheduleWarningCount > 0 ? 'tone-warning' : 'tone-muted'}`}>
                {scheduleWarningCount > 0 ? scheduleWarningCount : 'None'}
              </p>
            </article>
          </section>

          <div className="schedule-insights-block">
            <h4 className="schedule-insights-block-title">Saved weeks</h4>
        <div className="weekly-template-toolbar">
          <label className="form-field weekly-template-selector">
            <span>Load Saved Week</span>
            <select value={selectedWeeklyTemplateId} onChange={(event) => setSelectedWeeklyTemplateId(event.target.value)}>
              <option value="">Choose a saved weekly schedule</option>
              {weeklyTemplates.map((template) => (
                <option key={`weekly-template-${template.id}`} value={String(template.id)}>{template.name}</option>
              ))}
            </select>
          </label>

          <p className="schedule-saved-weeks-hint">Use More ▾ in the toolbar for Save, Load, Rename, Delete, Auto Fill, and Clear Week actions.</p>
        </div>

        <div className="weekly-history-panel">
          <label className="form-field weekly-template-selector">
            <span>Week Picker</span>
            <input
              type="date"
              value={browseWeekAnchorDate}
              onChange={(event) => setBrowseWeekAnchorDate(event.target.value)}
            />
          </label>

          <div className="weekly-history-meta">
            <p><strong>Selected Week:</strong> {weekRangeLabel(browseWeekDays)}</p>
            <p><strong>Shifts Found:</strong> {isBrowseWeekLoading ? 'Loading…' : browsedWeekShifts.length}</p>
            {browsedWeekPreview.length > 0 ? (
              <div className="weekly-history-preview">
                {browsedWeekPreview.map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </div>
            ) : null}
          </div>

          <div className="action-group">
            <button
              type="button"
              className="ghost-btn"
              onClick={handleOpenCopyThisWeekModal}
              disabled={isSaving || isBrowseWeekCurrentWeek || isBrowseWeekLoading || browsedWeekShifts.length === 0}
            >
              Copy This Week
            </button>
          </div>
        </div>
          </div>

          <div className="schedule-insights-block">
            <h4 className="schedule-insights-block-title">Employee overview</h4>
        <div className="employee-week-grid">
          {employeeWeekScheduleView.length === 0 ? (
            <p className="staff-subtitle">No employees available for this week.</p>
          ) : (
            employeeWeekScheduleView.map((employeeSchedule) => {
              const employeeAvailability = scheduleAvailabilityOverlay.byEmployeeId[String(employeeSchedule.employeeId)] ?? null
              const availabilityIndicators = buildScheduleAvailabilityDayIndicators({
                weekDays,
                employeeAvailability,
                isLoading: isScheduleAvailabilityLoading,
                loadFailed: scheduleAvailabilityOverlay.loadFailed,
              })
              const availabilityIndicatorMap = new Map(
                availabilityIndicators.map((entry) => [entry.dateKey, entry.indicator]),
              )

              return (
              <article key={`employee-week-${employeeSchedule.employeeId}`} className="employee-week-card">
                <div className="employee-week-card-header">
                  <h4>{employeeSchedule.employeeName}</h4>
                  <div className="schedule-availability-row-indicators" aria-label="Weekly availability">
                    {availabilityIndicators.map((entry) => (
                      <ScheduleAvailabilityDot
                        key={`availability-row-${employeeSchedule.employeeId}-${entry.dateKey}`}
                        indicator={entry.indicator}
                      />
                    ))}
                  </div>
                </div>
                <div className="employee-week-days">
                  {employeeSchedule.days.map((day) => {
                    const dayIndicator = availabilityIndicatorMap.get(day.date)
                      ?? resolveScheduleAvailabilityDayIndicator({
                        dayOfWeek: getAvailabilityDayOfWeekFromDateKey(day.date),
                        employeeAvailability,
                        isLoading: isScheduleAvailabilityLoading,
                        loadFailed: scheduleAvailabilityOverlay.loadFailed,
                      })

                    return (
                    <div
                      key={`employee-week-day-${employeeSchedule.employeeId}-${day.date}`}
                      className={`employee-week-day ${day.isDayOff ? 'is-day-off' : 'has-shifts'}`}
                    >
                      <div className="employee-week-day-header">
                        <div className="employee-week-day-heading">
                          <strong>{day.dayLabel}</strong>
                          <span>{day.shortDate}</span>
                        </div>
                        <ScheduleAvailabilityDot indicator={dayIndicator} />
                      </div>
                      {day.isDayOff ? (
                        <p className="employee-week-day-off">DAY OFF</p>
                      ) : (
                        <div className="employee-week-day-shifts">
                          {day.shifts.map((shift) => (
                            <div
                              key={`employee-week-shift-${employeeSchedule.employeeId}-${day.date}-${shift.shiftId ?? shift.startTime}-${shift.endTime}`}
                              className="employee-week-shift"
                            >
                              <span className="employee-week-shift-role">{shift.role}</span>
                              <span className="employee-week-shift-time">
                                {shift.startTimeLabel} – {shift.endTimeLabel}
                              </span>
                              {shift.notes ? (
                                <small className="employee-week-shift-notes">{shift.notes}</small>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    )
                  })}
                </div>
              </article>
              )
            })
          )}
        </div>
          </div>

          <div className="schedule-insights-block">
            <h4 className="schedule-insights-block-title">
              {selectedDay ? `${weekDays.find((day) => day.key === selectedDay)?.label ?? 'Day'} coverage` : 'Coverage analysis'}
            </h4>
        {filteredDayShifts.length === 0 && !isLoading ? (
          <div className="schedule-empty-state">
            <h4>No employees match this view.</h4>
            <p>Adjust the filters or create a new shift for this day.</p>
          </div>
        ) : null}

        <div className="roster-department-groups">
          {departmentGroups.map((group) => (
            <section key={group.department} className="roster-department-card">
              <div className="roster-department-heading">
                <h4>{group.department}</h4>
                <span>{group.shifts.length} shift{group.shifts.length === 1 ? '' : 's'}</span>
              </div>

              {group.shifts.length === 0 ? (
                <p className="roster-empty-department">No employees scheduled</p>
              ) : (
                <div className="roster-shift-list">
                  {group.shifts.map((shift) => {
                    const indicator = getShiftIndicator(shift)
                    const employeeName = shift.employees?.full_name || shift.employeeName || shift.employeeRecord?.name || 'Unassigned'
                    const employeePosition = shift.role || shift.employeeRecord?.position || 'Team member'
                    const employeeAvatar = getInitials(employeeName)

                    return (
                      <button key={shift.id} type="button" className="roster-shift-card" onClick={() => handleOpenShiftDetails(shift)}>
                        <div className="roster-shift-main">
                          <div className="roster-avatar">{employeeAvatar}</div>
                          <div className="roster-shift-copy">
                            <strong>{employeeName}</strong>
                            <p>{employeePosition}</p>
                          </div>
                        </div>
                        <div className="roster-shift-meta">
                          <span>{formatTimeRange24(shift.startTime, shift.endTime, ' – ')}</span>
                          <span>{shift.area || 'Guest floor'}</span>
                        </div>
                        <div className="roster-shift-footer">
                          <span className={`status-pill ${getShiftStatusClass(shift.status)}`}>{shift.status || 'Scheduled'}</span>
                          <span className={indicator.className}>{indicator.label}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </section>
          ))}
        </div>
          </div>
        </ScheduleCollapsibleSection>
      ) : null}

      {isSaveWeekTemplateModalOpen ? (
        <div className="employee-modal-backdrop" onClick={() => setIsSaveWeekTemplateModalOpen(false)}>
          <div className="employee-modal blend-compact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Save current week</p>
                <h3>Weekly template</h3>
              </div>
              <button type="button" className="icon-btn" onClick={() => setIsSaveWeekTemplateModalOpen(false)}>✕</button>
            </div>

            <form className="employee-form" onSubmit={handleSaveWeekTemplate}>
              <label className="form-field">
                <span>Template Name</span>
                <input
                  value={saveWeekTemplateName}
                  onChange={(event) => setSaveWeekTemplateName(event.target.value)}
                  placeholder="Summer 2026"
                  required
                />
              </label>

              {assignmentError ? <div className="staff-status-banner">{assignmentError}</div> : null}

              <div className="modal-actions">
                <button type="button" className="ghost-btn" onClick={() => setIsSaveWeekTemplateModalOpen(false)}>Cancel</button>
                <button type="submit" className="primary-btn" disabled={isSaving}>{isSaving ? 'Saving…' : 'Save Current Week'}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isLoadWeekTemplateModalOpen ? (
        <div className="employee-modal-backdrop" onClick={() => setIsLoadWeekTemplateModalOpen(false)}>
          <div className="employee-modal blend-compact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Load template</p>
                <h3>This will replace the current week's schedule.</h3>
              </div>
              <button type="button" className="icon-btn" onClick={() => setIsLoadWeekTemplateModalOpen(false)}>✕</button>
            </div>

            <div className="template-load-options">
              <label className="inline-check-row">
                <input type="checkbox" checked={loadWeekOptions.employees} onChange={(event) => setLoadWeekOptions((current) => ({ ...current, employees: event.target.checked }))} />
                <span>Employees</span>
              </label>
              <label className="inline-check-row">
                <input type="checkbox" checked={loadWeekOptions.positions} onChange={(event) => setLoadWeekOptions((current) => ({ ...current, positions: event.target.checked }))} />
                <span>Positions</span>
              </label>
              <label className="inline-check-row">
                <input type="checkbox" checked={loadWeekOptions.areas} onChange={(event) => setLoadWeekOptions((current) => ({ ...current, areas: event.target.checked }))} />
                <span>Areas</span>
              </label>
              <label className="inline-check-row">
                <input type="checkbox" checked={loadWeekOptions.times} onChange={(event) => setLoadWeekOptions((current) => ({ ...current, times: event.target.checked }))} />
                <span>Start / End Times</span>
              </label>
              <label className="inline-check-row">
                <input type="checkbox" checked={loadWeekOptions.notes} onChange={(event) => setLoadWeekOptions((current) => ({ ...current, notes: event.target.checked }))} />
                <span>Notes (optional)</span>
              </label>
            </div>

            {assignmentError ? <div className="staff-status-banner">{assignmentError}</div> : null}

            <div className="modal-actions">
              <button type="button" className="ghost-btn" onClick={() => setIsLoadWeekTemplateModalOpen(false)}>Cancel</button>
              <button type="button" className="primary-btn" onClick={handleConfirmLoadWeekTemplate} disabled={isSaving}>{isSaving ? 'Loading…' : 'Load'}</button>
            </div>
          </div>
        </div>
      ) : null}

      {renamingTemplateId ? (
        <div className="employee-modal-backdrop" onClick={() => setRenamingTemplateId(null)}>
          <div className="employee-modal blend-compact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Rename template</p>
                <h3>Update weekly template name</h3>
              </div>
              <button type="button" className="icon-btn" onClick={() => setRenamingTemplateId(null)}>✕</button>
            </div>

            <form className="employee-form" onSubmit={handleSubmitRenameWeeklyTemplate}>
              <label className="form-field">
                <span>Template Name</span>
                <input value={renameTemplateName} onChange={(event) => setRenameTemplateName(event.target.value)} required />
              </label>

              {assignmentError ? <div className="staff-status-banner">{assignmentError}</div> : null}

              <div className="modal-actions">
                <button type="button" className="ghost-btn" onClick={() => setRenamingTemplateId(null)}>Cancel</button>
                <button type="submit" className="primary-btn" disabled={isSaving}>{isSaving ? 'Saving…' : 'Rename Template'}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isDeleteShiftTemplateModalOpen ? (
        <div className="employee-modal-backdrop" onClick={() => setIsDeleteShiftTemplateModalOpen(false)}>
          <div className="employee-modal blend-compact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Template delete</p>
                <h3>Delete shift template?</h3>
              </div>
              <button type="button" className="icon-btn" onClick={() => setIsDeleteShiftTemplateModalOpen(false)}>✕</button>
            </div>

            <p className="template-delete-copy">
              Unused templates are deleted. If this template is used by existing shifts, it will be archived instead and existing assignments will be kept.
            </p>

            {assignmentError ? <div className="staff-status-banner">{assignmentError}</div> : null}

            <div className="modal-actions">
              <button type="button" className="ghost-btn" onClick={() => setIsDeleteShiftTemplateModalOpen(false)}>Cancel</button>
              <button type="button" className="primary-btn" onClick={handleConfirmDeleteShiftTemplate} disabled={isSaving}>Delete Template</button>
            </div>
          </div>
        </div>
      ) : null}

      {shiftTemplatePendingRename ? (
        <div className="employee-modal-backdrop" onClick={() => setShiftTemplatePendingRename(null)}>
          <div className="employee-modal blend-compact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Rename template</p>
                <h3>Update shift template name</h3>
              </div>
              <button type="button" className="icon-btn" onClick={() => setShiftTemplatePendingRename(null)}>✕</button>
            </div>

            <form className="employee-form" onSubmit={handleSubmitRenameShiftTemplate}>
              <label className="form-field">
                <span>Template Name</span>
                <input
                  value={shiftTemplateRenameName}
                  onChange={(event) => setShiftTemplateRenameName(event.target.value)}
                  required
                />
              </label>

              {assignmentError ? <div className="staff-status-banner">{assignmentError}</div> : null}

              <div className="modal-actions">
                <button type="button" className="ghost-btn" onClick={() => setShiftTemplatePendingRename(null)}>Cancel</button>
                <button type="submit" className="primary-btn" disabled={isSaving}>Rename Template</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isCopyThisWeekModalOpen ? (
        <div className="employee-modal-backdrop" onClick={() => setIsCopyThisWeekModalOpen(false)}>
          <div className="employee-modal blend-compact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Copy selected week</p>
                <h3>This will replace the current week's schedule.</h3>
              </div>
              <button type="button" className="icon-btn" onClick={() => setIsCopyThisWeekModalOpen(false)}>✕</button>
            </div>

            <p className="template-delete-copy">
              Copy {weekRangeLabel(browseWeekDays)} into {weekRangeLabel(weekDays)}? Existing shifts in the current week will be replaced only after confirmation.
            </p>

            {assignmentError ? <div className="staff-status-banner">{assignmentError}</div> : null}

            <div className="modal-actions">
              <button type="button" className="ghost-btn" onClick={() => setIsCopyThisWeekModalOpen(false)}>Cancel</button>
              <button type="button" className="primary-btn" onClick={handleConfirmCopyThisWeek} disabled={isSaving}>Copy This Week</button>
            </div>
          </div>
        </div>
      ) : null}

      {isCopyDayModalOpen && copyDaySourceDay ? (
        <div className="employee-modal-backdrop" onClick={() => setIsCopyDayModalOpen(false)}>
          <div className="employee-modal blend-compact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Copy day</p>
                <h3>Copy {copyDaySourceDay.label} assignments</h3>
              </div>
              <button type="button" className="icon-btn" onClick={() => setIsCopyDayModalOpen(false)}>✕</button>
            </div>

            <label className="form-field">
              <span>Copy to</span>
              <select
                value={copyDayTargetKey}
                onChange={(event) => setCopyDayTargetKey(event.target.value)}
              >
                <option value="">Select target day</option>
                {weekDays
                  .filter((day) => day.key !== copyDaySourceDay.key)
                  .map((day) => (
                    <option key={`copy-day-target-${day.key}`} value={day.key}>
                      {day.label} ({day.shortDate})
                    </option>
                  ))}
              </select>
            </label>

            {copyDayTargetShiftCount > 0 ? (
              <p className="template-delete-copy">
                {copyDayTargetShiftCount} assignment{copyDayTargetShiftCount === 1 ? '' : 's'} already exist on the target day. Copying will replace them.
              </p>
            ) : (
              <p className="template-delete-copy">
                All assignments from {copyDaySourceDay.label} will be copied to the selected day.
              </p>
            )}

            {assignmentError ? <div className="staff-status-banner">{assignmentError}</div> : null}

            <div className="modal-actions">
              <button type="button" className="ghost-btn" onClick={() => setIsCopyDayModalOpen(false)}>Cancel</button>
              <button type="button" className="primary-btn" onClick={handleConfirmCopyDay} disabled={isSaving || !copyDayTargetKey}>
                {copyDayTargetShiftCount > 0 ? 'Replace & Copy' : 'Copy Day'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isClearDayModalOpen && clearDayTarget ? (
        <div className="employee-modal-backdrop" onClick={() => setIsClearDayModalOpen(false)}>
          <div className="employee-modal blend-compact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Clear day</p>
                <h3>Remove all {clearDayTarget.label} assignments?</h3>
              </div>
              <button type="button" className="icon-btn" onClick={() => setIsClearDayModalOpen(false)}>✕</button>
            </div>

            <p className="template-delete-copy">
              This will remove {shiftCountByDate[clearDayTarget.key] ?? 0} draft assignment{(shiftCountByDate[clearDayTarget.key] ?? 0) === 1 ? '' : 's'} from {clearDayTarget.label}. Published schedule is not affected.
            </p>

            {assignmentError ? <div className="staff-status-banner">{assignmentError}</div> : null}

            <div className="modal-actions">
              <button type="button" className="ghost-btn" onClick={() => setIsClearDayModalOpen(false)}>Cancel</button>
              <button type="button" className="primary-btn" onClick={handleConfirmClearDay} disabled={isSaving}>Clear Day</button>
            </div>
          </div>
        </div>
      ) : null}

      {isCopyWeekModalOpen ? (
        <div className="employee-modal-backdrop" onClick={() => setIsCopyWeekModalOpen(false)}>
          <div className="employee-modal blend-compact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Copy week</p>
                <h3>Copy {weekRangeLabel(weekDays)} to another week</h3>
              </div>
              <button type="button" className="icon-btn" onClick={() => setIsCopyWeekModalOpen(false)}>✕</button>
            </div>

            <label className="form-field">
              <span>Target week</span>
              <input
                type="date"
                value={copyWeekTargetDate}
                onChange={(event) => setCopyWeekTargetDate(event.target.value)}
              />
            </label>

            {copyWeekTargetDate ? (
              <p className="template-delete-copy">
                {isCopyWeekTargetCurrentWeek
                  ? 'Select a different week than the one you are viewing.'
                  : isCopyWeekTargetLoading
                    ? 'Checking target week…'
                    : copyWeekTargetShiftCount > 0
                      ? `${copyWeekTargetShiftCount} assignment${copyWeekTargetShiftCount === 1 ? '' : 's'} already exist in the target week. Copying will replace them. Draft only — nothing will be published.`
                      : 'All assignments will be copied as draft shifts. Nothing will be published automatically.'}
              </p>
            ) : (
              <p className="template-delete-copy">Pick any date in the week you want to copy into.</p>
            )}

            {assignmentError ? <div className="staff-status-banner">{assignmentError}</div> : null}

            <div className="modal-actions">
              <button type="button" className="ghost-btn" onClick={() => setIsCopyWeekModalOpen(false)}>Cancel</button>
              <button
                type="button"
                className="primary-btn"
                onClick={handleConfirmCopyWeek}
                disabled={isSaving || !copyWeekTargetDate || isCopyWeekTargetCurrentWeek || isCopyWeekTargetLoading}
              >
                {copyWeekTargetShiftCount > 0 ? 'Replace & Copy Week' : 'Copy Week'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isClearWeekModalOpen ? (
        <div className="employee-modal-backdrop" onClick={() => setIsClearWeekModalOpen(false)}>
          <div className="employee-modal blend-compact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Clear week</p>
                <h3>Clear entire week?</h3>
              </div>
              <button type="button" className="icon-btn" onClick={() => setIsClearWeekModalOpen(false)}>✕</button>
            </div>

            {visibleWeekShifts.length === 0 ? (
              <p className="template-delete-copy">This week is already empty.</p>
            ) : (
              <p className="template-delete-copy">
                This will remove {visibleWeekShifts.length} draft assignment{visibleWeekShifts.length === 1 ? '' : 's'} from this week.
              </p>
            )}

            {assignmentError ? <div className="staff-status-banner">{assignmentError}</div> : null}

            <div className="modal-actions">
              <button type="button" className="ghost-btn" onClick={() => setIsClearWeekModalOpen(false)}>Cancel</button>
              <button
                type="button"
                className="primary-btn"
                onClick={handleConfirmClearWeek}
                disabled={isSaving || visibleWeekShifts.length === 0}
              >
                Clear Week
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {clearCellPending ? (
        <div className="employee-modal-backdrop" onClick={() => setClearCellPending(null)}>
          <div className="employee-modal blend-compact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <h3>Remove shift assignments?</h3>
              </div>
              <button type="button" className="icon-btn" onClick={() => setClearCellPending(null)}>✕</button>
            </div>

            <p className="template-delete-copy">
              This removes {clearCellPending.shifts.length} assignment{clearCellPending.shifts.length === 1 ? '' : 's'} from this shift on {clearCellPending.day.label}. Other days are not affected.
            </p>

            {assignmentError ? <div className="staff-status-banner">{assignmentError}</div> : null}

            <div className="modal-actions">
              <button type="button" className="ghost-btn" onClick={() => setClearCellPending(null)}>Cancel</button>
              <button type="button" className="primary-btn" onClick={handleConfirmClearCell} disabled={isSaving}>Remove</button>
            </div>
          </div>
        </div>
      ) : null}

      {capacityEditPending ? (
        <div className="employee-modal-backdrop" onClick={() => setCapacityEditPending(null)}>
          <div className="employee-modal blend-compact-modal schedule-capacity-edit-modal" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <h3>Required staff</h3>
              </div>
              <button type="button" className="icon-btn" onClick={() => setCapacityEditPending(null)}>✕</button>
            </div>

            <p className="schedule-capacity-edit-context">
              {formatScheduleShiftDisplayName(
                capacityEditPending.template?.name || '',
                capacityEditPending.template?.defaultArea || capacityEditPending.template?.defaultRole || '',
              )}
            </p>
            <p className="schedule-capacity-edit-date">
              {capacityEditPending.day?.label}
              {' · '}
              Template default: {getTemplateDefaultRequiredCount(capacityEditPending.template)}
            </p>

            <div className="schedule-capacity-edit-stepper">
              <button
                type="button"
                className="schedule-capacity-stepper-btn"
                onClick={() => handleAdjustCapacityEditDraft(-1)}
                disabled={isSaving || (capacityEditPending.draftRequired ?? 0) <= 0}
                aria-label="Decrease required staff"
              >
                −
              </button>
              <span className="schedule-capacity-stepper-value" aria-live="polite">
                {capacitySavingKey === buildCapacityKey(
                  resolveTemplateCapacityId(capacityEditPending.template),
                  normalizeShiftDateKey(capacityEditPending.day?.key),
                ) ? '…' : capacityEditPending.draftRequired}
              </span>
              <button
                type="button"
                className="schedule-capacity-stepper-btn"
                onClick={() => handleAdjustCapacityEditDraft(1)}
                disabled={isSaving || (capacityEditPending.draftRequired ?? 0) >= 99}
                aria-label="Increase required staff"
              >
                +
              </button>
            </div>

            {assignmentError ? <div className="staff-status-banner">{assignmentError}</div> : null}

            <div className="modal-actions schedule-capacity-edit-actions">
              <button type="button" className="ghost-btn" onClick={() => setCapacityEditPending(null)}>Cancel</button>
              {canSaveTemplateDefault && canEditSchedule ? (
                <button type="button" className="ghost-btn" onClick={() => handleSaveCapacityEdit({ saveAsTemplateDefault: true })} disabled={isSaving}>
                  Save as template default
                </button>
              ) : null}
              <button type="button" className="primary-btn" onClick={() => handleSaveCapacityEdit()} disabled={isSaving}>
                Save for this day
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {cellCopyPending ? (
        <div className="employee-modal-backdrop" onClick={() => setCellCopyPending(null)}>
          <div className="employee-modal blend-compact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <h3>Copy shift to {cellCopyPending.mode === 'next-day' ? 'next day' : 'rest of week'}?</h3>
              </div>
              <button type="button" className="icon-btn" onClick={() => setCellCopyPending(null)}>✕</button>
            </div>

            <p className="template-delete-copy">
              {cellCopyPending.mode === 'next-day'
                ? 'The next day already has assignments for this shift. Choose how to continue.'
                : 'Some later days already have assignments for this shift. Choose how to continue.'}
            </p>

            {assignmentError ? <div className="staff-status-banner">{assignmentError}</div> : null}

            <div className="modal-actions schedule-cell-copy-actions">
              <button type="button" className="ghost-btn" onClick={() => setCellCopyPending(null)}>Cancel</button>
              <button type="button" className="ghost-btn" onClick={() => handleConfirmCellCopy('merge')}>Merge employees</button>
              <button type="button" className="primary-btn" onClick={() => handleConfirmCellCopy('replace')}>Replace existing</button>
            </div>
          </div>
        </div>
      ) : null}

      {isAutoFillModalOpen ? (
        <div className="employee-modal-backdrop" onClick={() => setIsAutoFillModalOpen(false)}>
          <div className="employee-modal blend-compact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Auto fill week</p>
                <h3>Fill empty cells from template</h3>
              </div>
              <button type="button" className="icon-btn" onClick={() => setIsAutoFillModalOpen(false)}>✕</button>
            </div>

            <p className="template-delete-copy">
              Empty shift cells will be filled from the selected weekly template. Existing assignments are kept unless you choose Replace.
            </p>

            <div className="template-load-options">
              <label className="inline-check-row">
                <input type="checkbox" checked={loadWeekOptions.employees} onChange={(event) => setLoadWeekOptions((current) => ({ ...current, employees: event.target.checked }))} />
                <span>Employees</span>
              </label>
              <label className="inline-check-row">
                <input type="checkbox" checked={loadWeekOptions.positions} onChange={(event) => setLoadWeekOptions((current) => ({ ...current, positions: event.target.checked }))} />
                <span>Positions</span>
              </label>
              <label className="inline-check-row">
                <input type="checkbox" checked={loadWeekOptions.areas} onChange={(event) => setLoadWeekOptions((current) => ({ ...current, areas: event.target.checked }))} />
                <span>Areas</span>
              </label>
              <label className="inline-check-row">
                <input type="checkbox" checked={loadWeekOptions.times} onChange={(event) => setLoadWeekOptions((current) => ({ ...current, times: event.target.checked }))} />
                <span>Start / End Times</span>
              </label>
              <label className="inline-check-row">
                <input type="checkbox" checked={loadWeekOptions.notes} onChange={(event) => setLoadWeekOptions((current) => ({ ...current, notes: event.target.checked }))} />
                <span>Notes (optional)</span>
              </label>
              <label className="inline-check-row">
                <input type="checkbox" checked={autoFillReplaceExisting} onChange={(event) => setAutoFillReplaceExisting(event.target.checked)} />
                <span>Replace existing assignments</span>
              </label>
            </div>

            {autoFillReplaceExisting ? (
              <p className="template-delete-copy">
                Replace will remove all current-week draft assignments before filling from the template.
              </p>
            ) : null}

            {assignmentError ? <div className="staff-status-banner">{assignmentError}</div> : null}

            <div className="modal-actions">
              <button type="button" className="ghost-btn" onClick={() => setIsAutoFillModalOpen(false)}>Cancel</button>
              <button type="button" className="primary-btn" onClick={handleConfirmAutoFillWeek} disabled={isSaving}>
                {autoFillReplaceExisting ? 'Replace & Fill' : 'Auto Fill'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isAssignmentModalOpen ? (
        <div className="employee-modal-backdrop" onClick={handleCloseAssignmentModal}>
          <div className="employee-modal blend-compact-modal schedule-assignment-modal" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <h3>Assign employees</h3>
              </div>
              <button type="button" className="icon-btn" onClick={handleCloseAssignmentModal}>✕</button>
            </div>

            <form className="employee-form" onSubmit={handleCreateAssignment}>
              <div className="assignment-context-card assignment-context-card-simple">
                <p className="assignment-context-shift-line">
                  {`${assignmentContext?.template?.defaultArea || assignmentContext?.template?.defaultRole || 'General'}`.trim()}
                  <span aria-hidden="true"> · </span>
                  {formatScheduleShiftDisplayName(
                    assignmentContext?.template?.name || '',
                    assignmentContext?.template?.defaultArea || assignmentContext?.template?.defaultRole || '',
                  )}
                </p>
                <div className="assignment-context-grid">
                  <div className="assignment-context-row">
                    <span>Date</span>
                    <strong className={assignmentFieldErrors.shift_date ? 'invalid' : ''}>
                      {assignmentContext?.dayLabel || 'No day selected'}
                    </strong>
                  </div>
                  <div className="assignment-context-row">
                    <span>Time</span>
                    <strong className={(assignmentFieldErrors.start_time || assignmentFieldErrors.end_time) ? 'invalid' : ''}>
                      {formatTimeRange24(assignmentContext?.template?.startTime, assignmentContext?.template?.endTime, ' - ')}
                    </strong>
                  </div>
                  <div className="assignment-context-row">
                    <span>Required</span>
                    <strong>{assignmentStaffingSummary.required}</strong>
                  </div>
                  <div className="assignment-context-row">
                    <span>Selected</span>
                    <strong>{assignmentStaffingSummary.selected}</strong>
                  </div>
                  <div className="assignment-context-row">
                    <span>{assignmentStaffingSummary.tone === 'extra' ? 'Extra' : assignmentStaffingSummary.tone === 'remaining' ? 'Remaining' : 'Status'}</span>
                    <strong className={`assignment-staffing-${assignmentStaffingSummary.tone}`}>
                      {assignmentStaffingSummary.label}
                    </strong>
                  </div>
                </div>
                {assignmentFieldErrors.shift_template_id ? <small className="field-helper-error">{assignmentFieldErrors.shift_template_id}</small> : null}
                {assignmentFieldErrors.shift_date ? <small className="field-helper-error">{assignmentFieldErrors.shift_date}</small> : null}
                {assignmentFieldErrors.start_time ? <small className="field-helper-error">{assignmentFieldErrors.start_time}</small> : null}
                {assignmentFieldErrors.end_time ? <small className="field-helper-error">{assignmentFieldErrors.end_time}</small> : null}
                {assignmentFieldErrors.area ? <small className="field-helper-error">{assignmentFieldErrors.area}</small> : null}
              </div>

              {assignmentDraft.templateAreaMissing ? (
                <div className="assignment-area-warning">
                  <p>
                    This shift template has no saved Area.
                    {assignmentDraft.area ? ` Using ${assignmentDraft.area} for this assignment.` : ' Select an Area to continue.'}
                  </p>

                  <label className="form-field">
                    <span>Area (required)</span>
                    <select
                      className={assignmentFieldErrors.area ? 'field-invalid' : ''}
                      value={assignmentDraft.area}
                      onChange={(event) => {
                        const nextArea = event.target.value
                        setAssignmentDraft((current) => ({ ...current, area: nextArea }))
                        if (assignmentFieldErrors.area) {
                          setAssignmentFieldErrors((current) => ({ ...current, area: undefined }))
                        }
                      }}
                    >
                      <option value="">Select area</option>
                      {scheduleAreaOptions.filter((option) => option !== 'Other').map((option) => (
                        <option key={`assignment-area-${option}`} value={option}>{option}</option>
                      ))}
                    </select>
                    {assignmentFieldErrors.area ? <small className="field-helper-error">Area is required.</small> : null}
                  </label>

                  <div className="assignment-area-apply">
                    <span>Apply this Area to the template permanently?</span>
                    <div className="action-group">
                      <button
                        type="button"
                        className={`ghost-btn small ${assignmentAreaApplyMode === 'once' ? 'active' : ''}`}
                        onClick={() => setAssignmentAreaApplyMode('once')}
                      >
                        Only this assignment
                      </button>
                      <button
                        type="button"
                        className={`ghost-btn small ${assignmentAreaApplyMode === 'template' ? 'active' : ''}`}
                        onClick={handleSaveAssignmentAreaToTemplate}
                      >
                        Save to template
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              <label className="form-field">
                <span>Employees</span>
                <input
                  type="search"
                  value={assignmentEmployeeSearch}
                  onChange={(event) => setAssignmentEmployeeSearch(event.target.value)}
                  placeholder="Search by name"
                />
                <div className={`assignment-employee-list ${assignmentFieldErrors.employee_ids ? 'field-invalid' : ''}`}>
                  {assignmentEmployeeOptions.map((employee) => {
                    const employeeId = String(employee.id)
                    const checked = (assignmentDraft.employeeIds ?? []).some((id) => String(id) === employeeId)
                    const alreadyAssigned = assignmentContext?.cell
                      ? isEmployeeAssignedInCell(assignmentContext.cell, employee.id)
                      : false
                    const positionLabel = getEmployeePrimaryPosition(employee) || 'Team member'
                    return (
                      <label key={`assignment-employee-${employee.id}`} className="inline-check-row assignment-employee-item">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            const nextChecked = event.target.checked
                            setAssignmentDraft((current) => {
                              const currentIds = Array.isArray(current.employeeIds) ? current.employeeIds.map((id) => String(id)) : []
                              const nextIds = nextChecked
                                ? Array.from(new Set([...currentIds, employeeId]))
                                : currentIds.filter((id) => id !== employeeId)

                              return {
                                ...current,
                                employeeIds: nextIds,
                              }
                            })
                            if (assignmentFieldErrors.employee_ids) {
                              setAssignmentFieldErrors((current) => ({
                                ...current,
                                employee_ids: undefined,
                              }))
                            }
                          }}
                        />
                        <div className="assignment-employee-meta">
                          <strong>{employee.full_name || employee.name}</strong>
                          <span>{positionLabel}</span>
                          {alreadyAssigned ? (
                            <small className="assignment-employee-warning">Already assigned to this shift</small>
                          ) : null}
                        </div>
                      </label>
                    )
                  })}
                </div>
                {assignmentFieldErrors.employee_ids ? <small className="field-helper-error">Select at least one employee.</small> : null}
                {assignmentFieldErrors.employee_positions ? <small className="field-helper-error">Every selected employee needs a position.</small> : null}
              </label>

              {assignmentError ? (
                <div className="staff-status-banner">{assignmentError}</div>
              ) : null}

              <div className="modal-actions">
                <button type="button" className="ghost-btn" onClick={handleCloseAssignmentModal}>Cancel</button>
                <button type="submit" className="primary-btn" disabled={isSaving}>{isSaving ? 'Saving…' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {pendingShiftDrop ? (
        <div className="employee-modal-backdrop" onClick={handleCloseShiftDropPrompt}>
          <div className="employee-modal blend-compact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Shift placement</p>
                <h3>Move or copy this shift?</h3>
              </div>
              <button type="button" className="icon-btn" onClick={handleCloseShiftDropPrompt}>✕</button>
            </div>

            <p className="staff-subtitle">Choose whether to move the original assignment or keep it and create a copy in the target cell.</p>
            {assignmentError ? <div className="staff-status-banner">{assignmentError}</div> : null}

            <div className="modal-actions">
              <button type="button" className="ghost-btn" onClick={handleCloseShiftDropPrompt}>Cancel</button>
              <button type="button" className="ghost-btn" onClick={handleConfirmShiftDropCopy} disabled={isSaving}>
                {isSaving ? 'Saving…' : 'Copy'}
              </button>
              <button type="button" className="primary-btn" onClick={handleConfirmShiftDropMove} disabled={isSaving}>
                {isSaving ? 'Saving…' : 'Move'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editingAssignmentShift ? (
        <div className="employee-modal-backdrop" onClick={handleCloseAssignmentActions}>
          <div className="employee-modal blend-quick-actions-popover" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Quick actions</p>
                <h3>Shift actions</h3>
              </div>
              <button type="button" className="icon-btn" onClick={handleCloseAssignmentActions}>✕</button>
            </div>

            <div className="quick-actions-list">
              <button type="button" className="quick-action-item" onClick={handleQuickEditShift}>Edit Shift</button>
              <button type="button" className="quick-action-item" onClick={handleQuickCopyToNextDay} disabled={isSaving}>{isSaving ? 'Saving…' : 'Copy to Next Day'}</button>
              <button type="button" className="quick-action-item" onClick={handleQuickCopyToRestOfWeek} disabled={isSaving}>{isSaving ? 'Saving…' : 'Copy to Rest of Week'}</button>
              <button type="button" className="quick-action-item danger" onClick={handleRequestDeleteShift}>Delete Shift</button>
            </div>

            {assignmentError ? <div className="staff-status-banner">{assignmentError}</div> : null}
          </div>
        </div>
      ) : null}

      {assignmentTimeEdit ? (
        <div className="employee-modal-backdrop" onClick={handleCloseAssignmentTimeEdit}>
          <div className="employee-modal blend-compact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Edit assignment</p>
                <h3>Assignment time</h3>
              </div>
              <button type="button" className="icon-btn" onClick={handleCloseAssignmentTimeEdit}>✕</button>
            </div>

            <form className="employee-form" onSubmit={handleSaveAssignmentTimeEdit}>
              <div className="assignment-context-card">
                <h4>{assignmentTimeEdit.shift.employees?.full_name || assignmentTimeEdit.shift.employeeName || 'Employee'}</h4>
                <p>{assignmentTimeEdit.template.name}</p>
                <p>Template: {formatTimeRange24(assignmentTimeEdit.template.startTime, assignmentTimeEdit.template.endTime)}</p>
              </div>

              <div className="assignment-time-mode">
                <span>Time source</span>
                <div className="action-group">
                  <button
                    type="button"
                    className={`ghost-btn small ${assignmentTimeEdit.timeMode === 'template' ? 'active' : ''}`}
                    onClick={() => handleAssignmentTimeModeChange('template')}
                  >
                    Use template time
                  </button>
                  <button
                    type="button"
                    className={`ghost-btn small ${assignmentTimeEdit.timeMode === 'custom' ? 'active' : ''}`}
                    onClick={() => handleAssignmentTimeModeChange('custom')}
                  >
                    Custom time
                  </button>
                </div>
              </div>

              <div className="form-grid">
                <label className="form-field">
                  <span>Start Time</span>
                  <TimeSelect
                    value={assignmentTimeEdit.startTime}
                    onChange={(time) => setAssignmentTimeEdit((current) => ({
                      ...current,
                      timeMode: 'custom',
                      startTime: time,
                    }))}
                    disabled={assignmentTimeEdit.timeMode === 'template' || isSaving}
                    required
                  />
                </label>
                <label className="form-field">
                  <span>End Time</span>
                  <TimeSelect
                    value={assignmentTimeEdit.endTime}
                    onChange={(time) => setAssignmentTimeEdit((current) => ({
                      ...current,
                      timeMode: 'custom',
                      endTime: time,
                    }))}
                    disabled={assignmentTimeEdit.timeMode === 'template' || isSaving}
                    required
                  />
                </label>
              </div>

              {assignmentTimeEdit.timeMode === 'custom' ? (
                <p className="template-delete-copy">
                  Custom time applies only to this employee. The shift template time stays unchanged.
                </p>
              ) : (
                <p className="template-delete-copy">
                  Reset to template time ({formatTimeRange24(assignmentTimeEdit.template.startTime, assignmentTimeEdit.template.endTime)}).
                </p>
              )}

              {assignmentError ? <div className="staff-status-banner">{assignmentError}</div> : null}

              <div className="modal-actions">
                <button type="button" className="ghost-btn" onClick={handleCloseAssignmentTimeEdit}>Cancel</button>
                <button type="submit" className="primary-btn" disabled={isSaving}>{isSaving ? 'Saving…' : 'Save Time'}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {shiftPendingDelete ? (
        <div className="employee-modal-backdrop" onClick={() => setShiftPendingDelete(null)}>
          <div className="employee-modal blend-compact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Delete this shift?</p>
                <h3>Delete this shift?</h3>
              </div>
              <button type="button" className="icon-btn" onClick={() => setShiftPendingDelete(null)}>✕</button>
            </div>

            <p className="staff-subtitle">Are you sure you want to delete this shift? This action cannot be undone.</p>
            {assignmentError ? <div className="staff-status-banner">{assignmentError}</div> : null}

            <div className="modal-actions">
              <button type="button" className="ghost-btn" onClick={() => setShiftPendingDelete(null)}>Cancel</button>
              <button type="button" className="primary-btn" onClick={handleConfirmDeleteShift} disabled={isSaving}>
                {isSaving ? 'Deleting…' : 'Delete Shift'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedShift ? (
        <>
          <div className="drawer-backdrop" onClick={handleCloseShiftDetails} />
          <aside className="employee-drawer">
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Shift details</p>
                <h3>{selectedShift.employees?.full_name || selectedShift.employeeName || selectedShift.employeeRecord?.name || 'Unassigned'}</h3>
              </div>
              <button type="button" className="icon-btn" onClick={handleCloseShiftDetails}>✕</button>
            </div>

            <div className="drawer-profile">
              <div className="employee-photo large">{getInitials(selectedShift.employees?.full_name || selectedShift.employeeName || selectedShift.employeeRecord?.name || 'Unassigned')}</div>
              <div>
                <strong>{selectedShift.role || selectedShift.employeeRecord?.position || 'Team member'}</strong>
                <p>{selectedShift.employeeRecord?.department || 'Service'}</p>
              </div>
            </div>

            <div className="drawer-grid">
              <div className="drawer-row"><span>Time</span><strong>{formatTimeRange24(selectedShift.startTime, selectedShift.endTime, ' – ')}</strong></div>
              <div className="drawer-row"><span>Area</span><strong>{selectedShift.area || '—'}</strong></div>
              <div className="drawer-row"><span>Status</span><strong>{selectedShift.status || 'Scheduled'}</strong></div>
              <div className="drawer-row"><span>Date</span><strong>{selectedShift.date || '—'}</strong></div>
            </div>

            <div className="drawer-notes">
              <p className="eyebrow">Notes</p>
              <p>{selectedShift.notes || 'No notes for this shift.'}</p>
            </div>

            <div className="action-group" style={{ marginTop: '16px' }}>
              <button type="button" className="ghost-btn" onClick={handleEditSelectedShift}>Edit</button>
              <button type="button" className="ghost-btn" onClick={handleDeleteSelectedShift}>Delete</button>
            </div>
          </aside>
        </>
      ) : null}

      {isPublishConfirmOpen ? (
        <div className="employee-modal-backdrop" onClick={() => {
          if (isPublishing) return
          setPublishError('')
          setIsPublishConfirmOpen(false)
        }}>
          <div className="employee-modal blend-compact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <p className="eyebrow">{hasUnpublishedChanges ? 'Publish changes?' : 'Publish schedule?'}</p>
                <h3>{hasUnpublishedChanges
                  ? 'Employees will see your latest draft.'
                  : 'Employees will see this week\'s schedule. You can keep editing the draft afterward.'}</h3>
              </div>
              <button type="button" className="icon-btn" onClick={() => {
                setPublishError('')
                setIsPublishConfirmOpen(false)
              }}>✕</button>
            </div>

            {isPublishing ? <div className="staff-status-banner">Publishing...</div> : null}
            {publishError ? <div className="staff-status-banner">{publishError}</div> : null}

            <div className="modal-actions">
              <button type="button" className="ghost-btn" onClick={() => {
                setPublishError('')
                setIsPublishConfirmOpen(false)
              }}>Cancel</button>
              <button type="button" className="primary-btn" onClick={handlePublishConfirm} disabled={isPublishing}>
                {isPublishing ? 'Publishing…' : hasUnpublishedChanges ? 'Publish changes' : 'Publish'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isUnpublishConfirmOpen ? (
        <div className="employee-modal-backdrop" onClick={() => setIsUnpublishConfirmOpen(false)}>
          <div className="employee-modal blend-compact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Unpublish this schedule?</p>
                <h3>Employees will no longer see this week. Your draft stays editable.</h3>
              </div>
              <button type="button" className="icon-btn" onClick={() => setIsUnpublishConfirmOpen(false)}>✕</button>
            </div>

            <div className="modal-actions">
              <button type="button" className="ghost-btn" onClick={() => setIsUnpublishConfirmOpen(false)}>Cancel</button>
              <button type="button" className="primary-btn" onClick={handleConfirmUnpublishSchedule} disabled={isPublishing}>
                {isPublishing ? 'Unpublishing…' : 'Unpublish'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}


const HOST_LIST_SORTS = [
  { id: 'service', label: 'Service order' },
  { id: 'time', label: 'Time' },
  { id: 'table', label: 'Table' },
  { id: 'guest', label: 'Guest name' },
  { id: 'status', label: 'Status' },
  { id: 'party', label: 'Guest count' },
]
const RESERVATION_WORKSPACE_VIEWS = [
  { id: 'operations', label: 'Operations' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'floor', label: 'Floor' },
]

const RESERVATION_WORKSPACE_MODULES = {
  aiAssistant: null,
  notifications: null,
  kitchen: null,
  analytics: null,
}

const ReservationWorkspaceContext = createContext(null)

function useReservationWorkspace() {
  const workspace = useContext(ReservationWorkspaceContext)
  if (!workspace) {
    throw new Error('useReservationWorkspace must be used within ReservationWorkspaceProvider')
  }
  return workspace
}

function reservationIdsMatch(left, right) {
  if (!left || !right) return false
  return String(left.id) === String(right.id)
}

function ReservationWorkspaceProvider({
  children,
  filteredTodayReservations,
  onHostEditSave,
  onHostEditDelete,
  onReservationNotice,
  isSavingHostEdit = false,
  reservationSeatings = [],
}) {
  const { layout } = usePublishedFloorPlan()
  const [selectedReservation, setSelectedReservation] = useState(null)
  const [isGuestProfileOpen, setIsGuestProfileOpen] = useState(false)
  const [selectionPulseKey, setSelectionPulseKey] = useState(0)
  const [workspaceFocus, setWorkspaceFocus] = useState('operations')
  const [isTimelineCollapsed, setIsTimelineCollapsed] = useState(true)
  const [activeFloorAreaId, setActiveFloorAreaId] = useState(null)
  const [draggingReservationId, setDraggingReservationId] = useState(null)
  const [seatingDraftUnitIds, setSeatingDraftUnitIds] = useState([])
  const [seatingExtraChairs, setSeatingExtraChairs] = useState(0)
  const [seatingStandingGuests, setSeatingStandingGuests] = useState(0)
  const [hostEditingReservation, setHostEditingReservation] = useState(null)
  const [hostEditForm, setHostEditForm] = useState(null)
  const [isHostFloorPickActive, setIsHostFloorPickActive] = useState(false)
  const [isHostMultiTableSelectMode, setIsHostMultiTableSelectMode] = useState(false)
  const [floorPlanMode, setFloorPlanMode] = useState('view')

  useEffect(() => {
    if (floorPlanMode !== 'edit') return
    setHostEditingReservation(null)
    setHostEditForm(null)
    setIsHostFloorPickActive(false)
  }, [floorPlanMode])
  const timelineCardRefs = useRef({})
  const floorTableRefs = useRef({})
  const timelineScrollRef = useRef(null)
  const floorCanvasRef = useRef(null)
  const canvasRef = useRef(null)

  const clearDragState = useCallback(() => {
    setDraggingReservationId(null)
  }, [])

  useEffect(() => {
    if (!layout?.zones?.length) return

    setActiveFloorAreaId((current) => (
      resolveActiveFloorAreaId(layout, current) ?? current
    ))
  }, [layout])

  useEffect(() => {
    setSelectedReservation((current) => (
      syncHostWorkspaceReservationSelection(current, filteredTodayReservations)
    ))
  }, [filteredTodayReservations])

  useEffect(() => {
    if (!hostEditingReservation?.id) return

    const fresh = resolveHostFloorReservationRecord(
      hostEditingReservation,
      filteredTodayReservations,
    )
    if (!fresh || !hostFloorReservationVisualStateChanged(hostEditingReservation, fresh)) {
      return
    }

    setHostEditingReservation(fresh)
    setHostEditForm((current) => (
      current
        ? {
          ...current,
          status: fresh.status ?? current.status,
          assignedUnits: fresh.seatingAssignment?.assignedUnits ?? current.assignedUnits,
          tableNumber: fresh.tableNumber ?? current.tableNumber,
          seatingId: fresh.seatingId ?? fresh.seating_id ?? current.seatingId ?? null,
        }
        : current
    ))
  }, [filteredTodayReservations, hostEditingReservation])

  const selectedTableId = useMemo(
    () => (selectedReservation ? getTableIdForReservation(selectedReservation, layout) : null),
    [layout, selectedReservation],
  )

  const scrollTimelineToReservation = useCallback((reservationId) => {
    window.requestAnimationFrame(() => {
      timelineCardRefs.current[reservationId]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    })
  }, [])

  const scrollFloorToTable = useCallback((tableId) => {
    if (!tableId) return

    window.requestAnimationFrame(() => {
      canvasRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      floorCanvasRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      floorTableRefs.current[tableId]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'center',
      })
    })
  }, [])

  const clearSeatingDraft = useCallback(() => {
    setSeatingDraftUnitIds([])
    setSeatingExtraChairs(0)
    setSeatingStandingGuests(0)
  }, [])

  const initializeSeatingDraftFromReservation = useCallback((reservation) => {
    if (!reservation) {
      clearSeatingDraft()
      return
    }

    const draft = resolveSeatingDraftFromReservation(reservation, layout)
    setSeatingDraftUnitIds(draft.unitIds)
    setSeatingExtraChairs(draft.extraChairs)
    setSeatingStandingGuests(draft.standingGuests)
  }, [clearSeatingDraft, layout])

  const toggleSeatingUnit = useCallback((unitId) => {
    if (!unitId) return

    setSeatingDraftUnitIds((current) => {
      const normalizedId = String(unitId)
      const exists = current.some((id) => String(id) === normalizedId)
      if (exists) {
        return current.filter((id) => String(id) !== normalizedId)
      }
      return [...current, unitId]
    })
  }, [])

  const hostEditUnitIds = useMemo(
    () => (hostEditForm?.assignedUnits ?? []).map((unit) => unit.id),
    [hostEditForm],
  )

  const closeHostEdit = useCallback(() => {
    setHostEditingReservation(null)
    setHostEditForm(null)
    setIsHostFloorPickActive(false)
  }, [])

  const startSeatingDraft = useCallback((reservation, unitId) => {
    if (!reservation) return

    closeHostEdit()
    setSelectedReservation(reservation)
    setSelectionPulseKey((current) => current + 1)

    const draft = resolveSeatingDraftFromReservation(reservation, layout)
    let nextUnitIds = [...draft.unitIds]

    if (unitId) {
      const hasUnit = nextUnitIds.some((id) => String(id) === String(unitId))
      if (!hasUnit) {
        nextUnitIds = nextUnitIds.length > 0 ? [...nextUnitIds, unitId] : [unitId]
      }
    }

    setSeatingDraftUnitIds(nextUnitIds)
    setSeatingExtraChairs(draft.extraChairs)
    setSeatingStandingGuests(draft.standingGuests)

    const focusUnitId = unitId ?? nextUnitIds[0] ?? null
    if (focusUnitId) {
      const unit = getHostUnitById(focusUnitId, layout)
      if (unit?.zoneId) {
        setActiveFloorAreaId(unit.zoneId)
      }
    }
  }, [closeHostEdit, layout])

  const openHostEdit = useCallback((reservation) => {
    if (!reservation) return

    const safeReservation = {
      ...reservation,
      guestName: reservation.guestName ?? reservation.name ?? '',
      notes: reservation.notes ?? '',
      tables: reservation.tables ?? [],
    }

    let nextForm = null
    try {
      nextForm = createHostReservationEditForm(safeReservation, layout, reservationSeatings)
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[host-floor] Failed to open reservation edit drawer.', error)
      }
    }

    if (!nextForm) {
      nextForm = {
        guestName: safeReservation.guestName,
        phone: safeReservation.phone ?? '',
        date: `${safeReservation.date ?? ''}`.slice(0, 10),
        time: normalizeReservationTimeValue(safeReservation.time),
        guests: `${safeReservation.guests ?? 2}`,
        customerType: safeReservation.customerType ?? 'Regular',
        status: safeReservation.status ?? 'Pending',
        notes: safeReservation.notes ?? '',
        area: safeReservation.area ?? '',
        assignedUnits: [],
        extraChairs: 0,
        standingGuests: 0,
        seatingAreaId: '',
      }
    }

    const tableId = getTableIdForReservation(safeReservation, layout)
    setHostEditingReservation(safeReservation)
    setHostEditForm(nextForm)
    setIsHostFloorPickActive(false)
    setSelectedReservation(safeReservation)
    setSelectionPulseKey((current) => current + 1)
    clearSeatingDraft()

    const zoneId = getFloorZoneIdForReservation(safeReservation, layout)
    if (zoneId) {
      setActiveFloorAreaId(zoneId)
    }

    window.requestAnimationFrame(() => {
      scrollFloorToTable(tableId)
    })
  }, [clearSeatingDraft, layout, reservationSeatings, scrollFloorToTable])

  const toggleHostEditUnit = useCallback((unitId) => {
    const unit = getHostUnitById(unitId, layout)
    if (!unit) return

    const seatingUnit = toSeatingUnitFromLayoutUnit(unit)
    setHostEditForm((current) => {
      if (!current) return current

      return {
        ...current,
        assignedUnits: toggleAssignedUnit(current.assignedUnits, seatingUnit),
      }
    })
  }, [layout])

  const startHostMultiTableSelect = useCallback(() => {
    clearSeatingDraft()
    setIsHostMultiTableSelectMode(true)
  }, [clearSeatingDraft])

  const cancelHostMultiTableSelect = useCallback(() => {
    clearSeatingDraft()
    setIsHostMultiTableSelectMode(false)
  }, [clearSeatingDraft])

  const startHostFloorPick = useCallback(() => {
    setIsHostFloorPickActive((current) => !current)
    clearSeatingDraft()
  }, [clearSeatingDraft])

  const selectReservation = useCallback((reservation, options = {}) => {
    if (!reservation) return

    const {
      scrollTimeline = false,
      scrollFloor = false,
      openGuestProfile = false,
    } = options

    const tableId = getTableIdForReservation(reservation, layout)

    setSelectedReservation(reservation)
    setIsGuestProfileOpen(openGuestProfile)
    setSelectionPulseKey((current) => current + 1)
    setIsHostMultiTableSelectMode(false)
    initializeSeatingDraftFromReservation(reservation)

    if (scrollFloor) {
      const zoneId = getFloorZoneIdForReservation(reservation, layout)
      if (zoneId) {
        setActiveFloorAreaId(zoneId)
      }
    }

    window.requestAnimationFrame(() => {
      if (scrollTimeline) {
        scrollTimelineToReservation(reservation.id)
      }

      if (scrollFloor) {
        scrollFloorToTable(tableId)
      }
    })
  }, [initializeSeatingDraftFromReservation, layout, scrollFloorToTable, scrollTimelineToReservation])

  const clearSelection = useCallback(() => {
    setSelectedReservation(null)
    setIsGuestProfileOpen(false)
    setIsHostMultiTableSelectMode(false)
    clearSeatingDraft()
    closeHostEdit()
  }, [clearSeatingDraft, closeHostEdit])

  const isSelected = useCallback((reservation) => (
    reservationIdsMatch(selectedReservation, reservation)
  ), [selectedReservation])

  const value = useMemo(() => ({
    selectedReservation,
    selectedTableId,
    isGuestProfileOpen,
    selectionPulseKey,
    workspaceFocus,
    setWorkspaceFocus,
    isTimelineCollapsed,
    setIsTimelineCollapsed,
    activeFloorAreaId,
    setActiveFloorAreaId,
    draggingReservationId,
    setDraggingReservationId,
    clearDragState,
    layout,
    reservationSeatings,
    seatingDraftUnitIds,
    seatingExtraChairs,
    seatingStandingGuests,
    toggleSeatingUnit,
    startSeatingDraft,
    clearSeatingDraft,
    setSeatingExtraChairs,
    setSeatingStandingGuests,
    hostEditingReservation,
    hostEditForm,
    setHostEditForm,
    hostEditUnitIds,
    isHostFloorPickActive,
    isHostMultiTableSelectMode,
    startHostMultiTableSelect,
    cancelHostMultiTableSelect,
    floorPlanMode,
    setFloorPlanMode,
    openHostEdit,
    closeHostEdit,
    startHostFloorPick,
    toggleHostEditUnit,
    onHostEditSave,
    onHostEditDelete,
    onReservationNotice,
    isSavingHostEdit,
    selectReservation,
    clearSelection,
    isSelected,
    timelineCardRefs,
    floorTableRefs,
    timelineScrollRef,
    floorCanvasRef,
    canvasRef,
    filteredTodayReservations,
    futureModules: RESERVATION_WORKSPACE_MODULES,
  }), [
    clearSelection,
    filteredTodayReservations,
    isGuestProfileOpen,
    isSelected,
    selectReservation,
    selectedReservation,
    selectedTableId,
    selectionPulseKey,
    workspaceFocus,
    isTimelineCollapsed,
    activeFloorAreaId,
    clearDragState,
    draggingReservationId,
    layout,
    reservationSeatings,
    seatingDraftUnitIds,
    seatingExtraChairs,
    seatingStandingGuests,
    clearSeatingDraft,
    toggleSeatingUnit,
    startSeatingDraft,
    hostEditingReservation,
    hostEditForm,
    hostEditUnitIds,
    isHostFloorPickActive,
    isHostMultiTableSelectMode,
    startHostMultiTableSelect,
    cancelHostMultiTableSelect,
    floorPlanMode,
    onHostEditSave,
    onHostEditDelete,
    onReservationNotice,
    isSavingHostEdit,
    closeHostEdit,
    startHostFloorPick,
    toggleHostEditUnit,
    openHostEdit,
  ])

  return (
    <ReservationWorkspaceContext.Provider value={value}>
      {children}
    </ReservationWorkspaceContext.Provider>
  )
}

function ReservationsWorkspaceSegmentControl({ value, onChange }) {
  return (
    <div
      className="reservations-workspace-segment"
      role="tablist"
      aria-label="Workspace focus"
    >
      {RESERVATION_WORKSPACE_VIEWS.map((view) => (
        <button
          key={view.id}
          type="button"
          role="tab"
          aria-selected={value === view.id}
          className={`reservations-workspace-segment-btn${value === view.id ? ' is-active' : ''}`}
          onClick={() => onChange(view.id)}
        >
          {view.label}
        </button>
      ))}
    </div>
  )
}

const COMMAND_PALETTE_ACTIONS = [
  { id: 'create-reservation', label: 'Create reservation', subtitle: 'Open full reservation form', icon: '＋', keywords: ['new reservation', 'add reservation', 'book'] },
  { id: 'create-walk-in', label: 'Create walk-in', subtitle: 'Seat a walk-in party now', icon: '🚶', keywords: ['walk in', 'walk-in', 'walkin'] },
  { id: 'seat-guest', label: 'Seat guest', subtitle: 'Mark selected or matched guest as seated', icon: '🪑', keywords: ['seat', 'seat guest', 'seat table'] },
  { id: 'move-guest', label: 'Move guest', subtitle: 'Reassign to another table', icon: '↔', keywords: ['move', 'transfer', 'reassign'] },
  { id: 'edit-reservation', label: 'Edit reservation', subtitle: 'Update reservation details', icon: '✏', keywords: ['edit', 'update reservation'] },
  { id: 'call-guest', label: 'Call guest', subtitle: 'Dial guest phone number', icon: '📞', keywords: ['call', 'phone', 'dial'] },
  { id: 'add-note', label: 'Add note', subtitle: 'Add internal service note', icon: '📝', keywords: ['note', 'add note', 'comment'] },
  { id: 'merge-tables', label: 'Merge tables', subtitle: 'Open floor plan · Shift + click two tables', icon: '⊕', keywords: ['merge', 'merge tables', 'combine'] },
  { id: 'split-tables', label: 'Split tables', subtitle: 'Open floor plan · Right-click merged table', icon: '⊖', keywords: ['split', 'split tables', 'unmerge'] },
  { id: 'find-available-table', label: 'Find available table', subtitle: 'Jump to the next open table', icon: '◎', keywords: ['available', 'open table', 'find table'] },
]

function commandPaletteFuzzyScore(needle, haystack) {
  const query = `${needle ?? ''}`.trim().toLowerCase()
  const target = `${haystack ?? ''}`.toLowerCase()
  if (!query) return 1
  if (!target) return 0
  if (target.includes(query)) return 120 - target.indexOf(query)

  let score = 0
  let targetIndex = 0

  for (let index = 0; index < query.length; index += 1) {
    const matchIndex = target.indexOf(query[index], targetIndex)
    if (matchIndex === -1) return 0
    score += 12 - Math.min(matchIndex - targetIndex, 8)
    targetIndex = matchIndex + 1
  }

  return score
}

function parseCommandPaletteIntent(query) {
  const normalized = `${query ?? ''}`.trim().toLowerCase()
  if (!normalized) return null

  const patterns = [
    { regex: /^(new|create)\s+reservation$/, intent: 'create-reservation' },
    { regex: /^walk[\s-]?in(?:\s+(\d+)\s+guests?)?$/, intent: 'create-walk-in', guests: 1 },
    { regex: /^seat(?:\s+guest|\s+table)?\s+(.+)$/, intent: 'seat-guest', target: 1 },
    { regex: /^move\s+(.+)$/, intent: 'move-guest', target: 1 },
    { regex: /^edit(?:\s+reservation)?\s+(.+)$/, intent: 'edit-reservation', target: 1 },
    { regex: /^call\s+(.+)$/, intent: 'call-guest', target: 1 },
    { regex: /^(?:add\s+)?note(?:\s+for)?\s+(.+)$/, intent: 'add-note', target: 1 },
    { regex: /^table\s+(\d+|[a-z].*)$/i, intent: 'search-table', target: 1 },
    { regex: /^(?:find\s+)?available\s+table$/, intent: 'find-available-table' },
    { regex: /^merge\s+tables?$/, intent: 'merge-tables' },
    { regex: /^split\s+tables?$/, intent: 'split-tables' },
  ]

  for (const pattern of patterns) {
    const match = normalized.match(pattern.regex)
    if (!match) continue

    return {
      intent: pattern.intent,
      target: match[pattern.target] ?? null,
      guests: match[pattern.guests] ?? null,
    }
  }

  return null
}

function findReservationByGuestNeedle(reservations, todayKey, needle) {
  const query = `${needle ?? ''}`.trim().toLowerCase()
  if (!query) return null

  const todayReservations = getTodayReservations(reservations, todayKey)
  let bestMatch = null
  let bestScore = 0

  todayReservations.forEach((reservation) => {
    const guestName = formatReservationGuestName(reservation.guestName)
    const score = Math.max(
      commandPaletteFuzzyScore(query, guestName),
      commandPaletteFuzzyScore(query, `${reservation.phone ?? ''}`),
    )

    if (score > bestScore) {
      bestScore = score
      bestMatch = reservation
    }
  })

  return bestScore > 0 ? bestMatch : null
}

function findReservationByTableNeedle(reservations, todayKey, needle) {
  const tableKey = normalizeTableKey(needle)
  if (!tableKey) return null

  const todayReservations = getTodayReservations(reservations, todayKey)
  return todayReservations.find((reservation) => (
    normalizeTableKey(reservation.tableNumber) === tableKey
    && !isTerminalReservationStatus(reservation.status)
  )) ?? null
}

function findAvailableFloorTable(reservations, todayKey, nowMinutes, layout) {
  if (!layout?.tables?.length) return null

  const snapshot = buildFloorPlanSnapshot({
    layout,
    reservations: getTodayReservations(reservations, todayKey),
    todayKey,
    nowMinutes,
  })

  const available = snapshot.tableStates.find((entry) => entry.status === 'available')
  return available?.table ?? null
}

function buildCommandPaletteItems({
  query,
  reservations,
  todayKey,
  nowMinutes,
  layout,
}) {
  const items = []
  const trimmedQuery = `${query ?? ''}`.trim()
  const intent = parseCommandPaletteIntent(trimmedQuery)
  const todayReservations = getTodayReservations(reservations, todayKey)

  const pushItem = (item) => {
    items.push(item)
  }

  COMMAND_PALETTE_ACTIONS.forEach((action) => {
    const searchBlob = [action.label, action.subtitle, ...(action.keywords ?? [])].join(' ')
    const score = commandPaletteFuzzyScore(trimmedQuery, searchBlob)
    const intentBoost = intent?.intent === action.id ? 240 : 0

    if (!trimmedQuery || score > 0 || intentBoost > 0) {
      pushItem({
        id: action.id,
        kind: 'action',
        label: action.label,
        subtitle: action.subtitle,
        icon: action.icon,
        score: Math.max(score, intentBoost, trimmedQuery ? 0 : 40),
        actionId: action.id,
      })
    }
  })

  todayReservations.forEach((reservation) => {
    const guestName = formatReservationGuestName(reservation.guestName)
    const tableLabel = `${reservation.tableNumber ?? ''}`.trim() || '—'
    const status = getReservationDisplayStatus(reservation, nowMinutes, todayKey)
    const searchBlob = [
      guestName,
      reservation.phone,
      reservation.tableNumber,
      reservation.notes,
      status,
      reservation.time,
    ].join(' ')

    const score = commandPaletteFuzzyScore(trimmedQuery, searchBlob)
    if (!trimmedQuery || score > 0) {
      pushItem({
        id: `guest-${reservation.id}`,
        kind: 'guest',
        label: guestName,
        subtitle: `Table ${tableLabel} · ${formatTime24(reservation.time) || '—'} · ${status}`,
        icon: '👤',
        score: score || (trimmedQuery ? 0 : 20),
        reservation,
      })

      pushItem({
        id: `reservation-${reservation.id}`,
        kind: 'reservation',
        label: `${guestName} — ${formatTime24(reservation.time) || '—'}`,
        subtitle: `Reservation · Table ${tableLabel} · ${status}`,
        icon: '📅',
        score: Math.max(score - 4, 0) || (trimmedQuery ? 0 : 18),
        reservation,
      })
    }
  })

  ;(layout?.tables ?? []).forEach((table) => {
    const reservation = findReservationForFloorTable(table, todayReservations, todayKey)
    const status = getFloorTableStatus(reservation, nowMinutes, todayKey)
    const guestName = reservation ? formatReservationGuestName(reservation.guestName) : 'Available'
    const searchBlob = `table ${table.label} ${guestName} ${table.seats} seats ${status}`
    const score = commandPaletteFuzzyScore(trimmedQuery, searchBlob)
    const tableIntentBoost = intent?.intent === 'search-table' && normalizeTableKey(intent.target) === normalizeTableKey(table.label)
      ? 220
      : 0

    if (!trimmedQuery || score > 0 || tableIntentBoost > 0) {
      pushItem({
        id: `table-${table.id}`,
        kind: 'table',
        label: `Table ${table.label}`,
        subtitle: reservation
          ? `${guestName} · ${Number(reservation.guests) || 0}/${table.seats} · ${FLOOR_TABLE_STATUS_META[status]?.label || status}`
          : `Available · ${table.seats} seats`,
        icon: '🍽',
        score: Math.max(score, tableIntentBoost, trimmedQuery ? 0 : 12),
        table,
        reservation,
      })
    }
  })

  if (intent?.intent === 'create-walk-in') {
    const guestCount = Number(intent.guests) || 2
    pushItem({
      id: 'intent-walk-in',
      kind: 'intent',
      label: `Create walk-in · ${guestCount} guests`,
      subtitle: 'Quick walk-in reservation for right now',
      icon: '⚡',
      score: 300,
      intent,
    })
  }

  if (intent?.target) {
    const reservation = intent.intent === 'search-table'
      ? findReservationByTableNeedle(reservations, todayKey, intent.target)
      : findReservationByGuestNeedle(reservations, todayKey, intent.target)

    if (reservation) {
      pushItem({
        id: `intent-target-${reservation.id}-${intent.intent}`,
        kind: 'intent',
        label: `${intent.intent.replace(/-/g, ' ')} · ${formatReservationGuestName(reservation.guestName)}`,
        subtitle: `Table ${reservation.tableNumber || '—'} · ${getReservationDisplayStatus(reservation, nowMinutes, todayKey)}`,
        icon: '⚡',
        score: 280,
        intent,
        reservation,
      })
    }
  }

  return items
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 12)
}

function ReservationsCommandPalette({
  reservations,
  todayKey,
  nowMinutes,
  isSaving,
  onClose,
  onOpenAddReservation,
  onOpenQuickReservation,
  onOpenEditReservation,
  onQuickStatusUpdate,
  onOpenAddNote,
}) {
  const { layout } = usePublishedFloorPlan()
  const {
    selectReservation,
    setWorkspaceFocus,
  } = useReservationWorkspace()

  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const items = useMemo(() => (
    buildCommandPaletteItems({
      query,
      reservations,
      todayKey,
      nowMinutes,
      layout,
    })
  ), [layout, nowMinutes, query, reservations, todayKey])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    const activeItem = listRef.current?.querySelector('[data-command-active="true"]')
    activeItem?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, items])

  const runAction = useCallback(async (item) => {
    const close = () => onClose()

    if (item.kind === 'guest' || item.kind === 'reservation') {
      selectReservation(item.reservation, {
        scrollTimeline: true,
        scrollFloor: true,
        openGuestProfile: true,
      })
      close()
      return
    }

    if (item.kind === 'table') {
      if (item.reservation) {
        selectReservation(item.reservation, {
          scrollTimeline: true,
          scrollFloor: true,
          openGuestProfile: true,
        })
      } else {
        setWorkspaceFocus('floor')
        const tableNode = document.querySelector(`[data-table-id="${item.table.id}"]`)
        tableNode?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
      }
      close()
      return
    }

    if (item.kind === 'intent') {
      if (item.intent?.intent === 'create-walk-in') {
        onOpenQuickReservation({
          guestName: 'Walk-in',
          guests: `${Number(item.intent.guests) || 2}`,
          time: formatTimelineSlotLabel(nowMinutes),
          tableNumber: '',
        })
        close()
        return
      }

      if (item.reservation) {
        const reservation = item.reservation

        if (item.intent.intent === 'seat-guest') {
          await onQuickStatusUpdate(reservation, 'Checked In')
          selectReservation(reservation, { scrollTimeline: true, scrollFloor: true, openGuestProfile: false })
          close()
          return
        }

        if (item.intent.intent === 'move-guest') {
          selectReservation(reservation, { scrollTimeline: true, scrollFloor: true, openGuestProfile: true })
          setWorkspaceFocus('floor')
          close()
          return
        }

        if (item.intent.intent === 'edit-reservation') {
          onOpenEditReservation(reservation)
          close()
          return
        }

        if (item.intent.intent === 'call-guest') {
          const phone = `${reservation.phone ?? ''}`.trim()
          if (phone) window.location.href = `tel:${phone}`
          selectReservation(reservation, { scrollTimeline: true, scrollFloor: true, openGuestProfile: true })
          close()
          return
        }

        if (item.intent.intent === 'add-note') {
          onOpenAddNote(reservation)
          close()
          return
        }

        if (item.intent.intent === 'search-table') {
          selectReservation(reservation, { scrollTimeline: true, scrollFloor: true, openGuestProfile: true })
          close()
          return
        }
      }
    }

    const actionId = item.actionId
    const contextReservation = findReservationByGuestNeedle(reservations, todayKey, query)
      || findReservationByTableNeedle(reservations, todayKey, query)

    if (actionId === 'create-reservation') {
      onOpenAddReservation()
      close()
      return
    }

    if (actionId === 'create-walk-in') {
      onOpenQuickReservation({
        guestName: 'Walk-in',
        guests: '2',
        time: formatTimelineSlotLabel(nowMinutes),
        tableNumber: '',
      })
      close()
      return
    }

    if (actionId === 'seat-guest') {
      const reservation = contextReservation
        || getTodayReservations(reservations, todayKey).find((entry) => (
          isUpcomingReservationStatus(normalizeReservationStatus(entry.status))
        ))
      if (reservation) {
        await onQuickStatusUpdate(reservation, 'Checked In')
        selectReservation(reservation, { scrollTimeline: true, scrollFloor: true, openGuestProfile: false })
      }
      close()
      return
    }

    if (actionId === 'move-guest' && contextReservation) {
      selectReservation(contextReservation, { scrollTimeline: true, scrollFloor: true, openGuestProfile: true })
      setWorkspaceFocus('floor')
      close()
      return
    }

    if (actionId === 'edit-reservation' && contextReservation) {
      onOpenEditReservation(contextReservation)
      close()
      return
    }

    if (actionId === 'call-guest' && contextReservation) {
      const phone = `${contextReservation.phone ?? ''}`.trim()
      if (phone) window.location.href = `tel:${phone}`
      selectReservation(contextReservation, { scrollTimeline: true, scrollFloor: true, openGuestProfile: true })
      close()
      return
    }

    if (actionId === 'add-note' && contextReservation) {
      onOpenAddNote(contextReservation)
      close()
      return
    }

    if (actionId === 'merge-tables' || actionId === 'split-tables') {
      setWorkspaceFocus('floor')
      close()
      return
    }

    if (actionId === 'find-available-table') {
      const table = findAvailableFloorTable(reservations, todayKey, nowMinutes, layout)
      setWorkspaceFocus('floor')
      if (table) {
        window.requestAnimationFrame(() => {
          document.querySelector(`[data-table-id="${table.id}"]`)?.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'center',
          })
        })
      }
      close()
    }
  }, [
    layout,
    nowMinutes,
    onClose,
    onOpenAddNote,
    onOpenAddReservation,
    onOpenEditReservation,
    onOpenQuickReservation,
    onQuickStatusUpdate,
    query,
    reservations,
    selectReservation,
    setWorkspaceFocus,
    todayKey,
  ])

  const handleKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) => Math.min(current + 1, Math.max(items.length - 1, 0)))
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) => Math.max(current - 1, 0))
      return
    }

    if (event.key === 'Enter' && items[activeIndex]) {
      event.preventDefault()
      runAction(items[activeIndex])
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }

  return (
    <div className="command-palette-backdrop" onClick={onClose}>
      <div
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Quick Actions"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="command-palette-input-wrap">
          <span className="command-palette-input-icon" aria-hidden="true">⚡</span>
          <input
            ref={inputRef}
            type="text"
            className="command-palette-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search guests, tables, reservations — or type a command"
            aria-label="Quick Actions search"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="command-palette-kbd">Esc</kbd>
        </div>

        <div className="command-palette-results" ref={listRef} role="listbox" aria-label="Quick Actions results">
          {items.length === 0 ? (
            <p className="command-palette-empty">No matching actions or records.</p>
          ) : (
            items.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                data-command-active={index === activeIndex ? 'true' : 'false'}
                className={`command-palette-item${index === activeIndex ? ' is-active' : ''}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => runAction(item)}
                disabled={isSaving}
              >
                <span className="command-palette-item-icon" aria-hidden="true">{item.icon}</span>
                <span className="command-palette-item-copy">
                  <strong>{item.label}</strong>
                  <span>{item.subtitle}</span>
                </span>
              </button>
            ))
          )}
        </div>

        <footer className="command-palette-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
          <span><kbd>Enter</kbd> Run</span>
          <span><kbd>Esc</kbd> Close</span>
        </footer>
      </div>
    </div>
  )
}

const FLOOR_PLAN_FUTURE_MODULES = {
  waiterZones: null,
  aiSeating: null,
  tableTimers: null,
  heatMap: null,
  cleaningQueue: null,
}

const FLOOR_TABLE_STATUS_META = {
  available: { label: 'Available', tone: 'available' },
  upcoming: { label: 'Upcoming', tone: 'confirmed' },
  booked: { label: 'Booked', tone: 'booked' },
  confirmed: { label: 'Confirmed', tone: 'confirmed' },
  arrived: { label: 'Waiting', tone: 'arrived' },
  seated: { label: 'Seated', tone: 'seated' },
  'checked-in': { label: 'Checked In', tone: 'checked-in' },
  'checked-in-partial': { label: 'Checked In (Partial)', tone: 'checked-in-partial' },
  dining: { label: 'Dining', tone: 'dining' },
  cleaning: { label: 'Needs Cleaning', tone: 'cleaning' },
}

const FLOOR_PLAN_VIEW_MODES = [
  { id: 'normal', label: 'Normal' },
  { id: 'heatmap', label: 'Heatmap' },
]

const FLOOR_HEATMAP_PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'last-7-days', label: 'Last 7 Days' },
  { id: 'last-30-days', label: 'Last 30 Days' },
  { id: 'custom', label: 'Custom' },
]

const FLOOR_HEATMAP_TIERS = [
  { id: 'very-light', label: '0–20%', min: 0, max: 20 },
  { id: 'light', label: '20–40%', min: 20, max: 40 },
  { id: 'amber', label: '40–60%', min: 40, max: 60 },
  { id: 'orange', label: '60–80%', min: 60, max: 80 },
  { id: 'deep-gold', label: '80–100%', min: 80, max: 100 },
]

const FLOOR_HEATMAP_TURNS_PER_DAY = 5

function addDaysToDateKey(dateKey, deltaDays) {
  const date = parseLocalDate(dateKey)
  date.setDate(date.getDate() + deltaDays)
  return formatLocalDateKey(date)
}

function countDaysInclusive(startKey, endKey) {
  const start = parseLocalDate(startKey)
  const end = parseLocalDate(endKey)
  const diffMs = end.getTime() - start.getTime()
  return Math.max(1, Math.floor(diffMs / 86_400_000) + 1)
}

function getFloorHeatmapDateRange(periodId, todayKey, customRange = {}) {
  switch (periodId) {
    case 'yesterday': {
      const key = addDaysToDateKey(todayKey, -1)
      return { startKey: key, endKey: key, dayCount: 1, label: 'Yesterday' }
    }
    case 'last-7-days':
      return {
        startKey: addDaysToDateKey(todayKey, -6),
        endKey: todayKey,
        dayCount: 7,
        label: 'Last 7 Days',
      }
    case 'last-30-days':
      return {
        startKey: addDaysToDateKey(todayKey, -29),
        endKey: todayKey,
        dayCount: 30,
        label: 'Last 30 Days',
      }
    case 'custom': {
      const startKey = customRange.startKey || todayKey
      const endKey = customRange.endKey || todayKey
      const normalizedStart = startKey <= endKey ? startKey : endKey
      const normalizedEnd = startKey <= endKey ? endKey : startKey
      return {
        startKey: normalizedStart,
        endKey: normalizedEnd,
        dayCount: countDaysInclusive(normalizedStart, normalizedEnd),
        label: 'Custom',
      }
    }
    case 'today':
    default:
      return { startKey: todayKey, endKey: todayKey, dayCount: 1, label: 'Today' }
  }
}

function isHeatmapCountableReservation(reservation) {
  return !isTerminalReservationStatus(reservation.status)
    || normalizeReservationStatus(reservation.status) === 'Checked Out'
}

function estimateReservationDiningMinutes(reservation) {
  const status = normalizeReservationStatus(reservation.status)

  if (status === 'Checked In') return 105
  if (status === 'Checked In (Partial)') return 78
  if (status === 'Checked Out') return 102
  if (status === 'Waiting' || status === 'Confirmed') return 68
  return 58
}

function getHeatmapUtilizationTier(utilizationPercent) {
  if (utilizationPercent < 20) return 'very-light'
  if (utilizationPercent < 40) return 'light'
  if (utilizationPercent < 60) return 'amber'
  if (utilizationPercent < 80) return 'orange'
  return 'deep-gold'
}

function formatHeatmapDuration(minutes) {
  const safeMinutes = Math.max(0, Math.round(minutes))
  const hours = Math.floor(safeMinutes / 60)
  const remainder = safeMinutes % 60

  if (hours === 0) return `${remainder}m`
  return `${hours}h ${String(remainder).padStart(2, '0')}m`
}

function buildFloorHeatmapAnalytics({
  allReservations,
  layout,
  periodRange,
  todayKey,
}) {
  if (!layout?.tables?.length) return []

  const { startKey, endKey, dayCount } = periodRange
  const periodCapacity = Math.max(dayCount * FLOOR_HEATMAP_TURNS_PER_DAY, 1)

  const metricsByTableId = Object.fromEntries(
    layout.tables.map((table) => [
      table.id,
      {
        tableId: table.id,
        label: table.label,
        visits: 0,
        todaysVisits: 0,
        guestTotal: 0,
        diningMinutesTotal: 0,
        utilizationPercent: 0,
        tier: 'very-light',
        avgPartySize: 0,
        avgDiningMinutes: 0,
      },
    ]),
  )

  allReservations.forEach((reservation) => {
    if (!isHeatmapCountableReservation(reservation)) return

    const dateKey = `${reservation.date ?? ''}`.slice(0, 10)
    if (!dateKey || dateKey < startKey || dateKey > endKey) return

    const table = layout.tables.find((entry) => (
      normalizeTableKey(entry.label) === normalizeTableKey(reservation.tableNumber)
    ))
    if (!table) return

    const metric = metricsByTableId[table.id]
    metric.visits += 1
    metric.guestTotal += Number(reservation.guests) || 0
    metric.diningMinutesTotal += estimateReservationDiningMinutes(reservation)

    if (dateKey === todayKey) {
      metric.todaysVisits += 1
    }
  })

  return layout.tables.map((table) => {
    const metric = metricsByTableId[table.id]
    const utilizationPercent = Math.min(
      100,
      Math.round((metric.visits / periodCapacity) * 100),
    )

    return {
      ...metric,
      utilizationPercent,
      tier: getHeatmapUtilizationTier(utilizationPercent),
      avgPartySize: metric.visits > 0
        ? Math.round((metric.guestTotal / metric.visits) * 10) / 10
        : 0,
      avgDiningMinutes: metric.visits > 0
        ? Math.round(metric.diningMinutesTotal / metric.visits)
        : 0,
    }
  })
}

function normalizeTableKey(value) {
  return normalizeUnitKey(value)
}

function findReservationForFloorTable(table, reservations, todayKey, options = {}) {
  const { syncWithList = false } = options
  const matches = reservations.filter((reservation) => {
    if (!syncWithList && getReservationDateKey(reservation) !== todayKey) return false
    if (!reservationOccupiesFloorTables(reservation.status)) return false
    return reservationUsesSeatingUnit(reservation, table)
  })

  if (matches.length === 0) return null

  return [...matches].sort((left, right) => (
    getFloorTableStatusPriority(right) - getFloorTableStatusPriority(left)
  ))[0]
}

function getTableIdForReservation(reservation, layout) {
  const assignment = getReservationSeatingAssignment(reservation)
  if (assignment?.assignedUnits?.length > 0 && layout?.tables?.length) {
    const matchedTable = layout.tables.find((entry) => (
      assignment.assignedUnits.some((unit) => seatingUnitMatchesFloorUnit(unit, entry))
    ))
    if (matchedTable) return matchedTable.id
  }

  const tableKey = normalizeTableKey(reservation?.tableNumber)
  if (!tableKey || !layout?.tables?.length) return null

  const table = layout.tables.find((entry) => (
    normalizeTableKey(entry.label) === tableKey
      || normalizeTableKey(entry.displayLabel) === tableKey
  ))

  return table?.id ?? null
}

function getFloorTableStatus(reservation, nowMinutes, todayKey, options = {}) {
  return getFloorTableVisualStatus(reservation, nowMinutes, todayKey, options)
}

function buildFloorPlanOccupancyStats(tableStates) {
  const total = tableStates.length
  const occupied = tableStates.filter((entry) => (
    !['available', 'cleaning', 'upcoming'].includes(entry.status)
  )).length
  const available = tableStates.filter((entry) => (
    entry.status === 'available' || entry.status === 'upcoming'
  )).length
  const cleaning = tableStates.filter((entry) => entry.status === 'cleaning').length

  return {
    total,
    occupied,
    available,
    cleaning,
    occupancyPercent: total > 0 ? Math.round((occupied / total) * 100) : 0,
  }
}

function buildFloorPlanLiveStats(tableStates, reservations, todayKey, nowMinutes) {
  const occupancy = buildFloorPlanOccupancyStats(tableStates)
  let guestsInside = 0
  let upcomingArrivals = 0
  let reservationsWaiting = 0

  reservations.forEach((reservation) => {
    const status = normalizeReservationStatus(reservation.status)
    const guests = Number(reservation.guests) || 0
    const arrivalMinutes = parseTimeToMinutes(reservation.time)

    if (isReservationInHouseStatus(status)) {
      guestsInside += guests
    }

    if (isUpcomingReservationStatus(status) && arrivalMinutes !== null && arrivalMinutes >= nowMinutes) {
      upcomingArrivals += 1
    }

    if (isReservationLate(reservation, nowMinutes, todayKey)) {
      reservationsWaiting += 1
      return
    }

    if (status === 'Confirmed' && arrivalMinutes !== null && arrivalMinutes <= nowMinutes) {
      reservationsWaiting += 1
    }
  })

  return {
    ...occupancy,
    guestsInside,
    upcomingArrivals,
    reservationsWaiting,
  }
}

function getFloorZoneIdForReservation(reservation, layout) {
  const tableId = getTableIdForReservation(reservation, layout)
  if (!tableId) return layout?.zones?.[0]?.id ?? null

  const table = layout?.tables?.find((entry) => entry.id === tableId)
  return table?.zoneId ?? layout?.zones?.[0]?.id ?? null
}

function getAdjacentFloorZoneId(zones, activeZoneId, direction) {
  if (!zones.length) return activeZoneId

  const currentIndex = zones.findIndex((zone) => zone.id === activeZoneId)
  const safeIndex = currentIndex < 0 ? 0 : currentIndex
  const nextIndex = direction === 'next'
    ? (safeIndex + 1) % zones.length
    : (safeIndex - 1 + zones.length) % zones.length

  return zones[nextIndex]?.id ?? activeZoneId
}

function getTimelineNowPositionPercent(rows, nowMinutes) {
  if (rows.length === 0) return 0

  const anchors = []

  rows.forEach((row, index) => {
    if (row.type === 'hour') {
      anchors.push({ minutes: row.hour * 60, index })
    }

    if (row.type === 'card') {
      const minutes = parseTimeToMinutes(row.reservation.time)
      if (minutes !== null) anchors.push({ minutes, index })
    }

    if (row.type === 'now') {
      anchors.push({ minutes: nowMinutes, index })
    }
  })

  if (anchors.length === 0) {
    const serviceStart = RESERVATION_SERVICE_HOURS[0] * 60
    const serviceEnd = (RESERVATION_SERVICE_HOURS[RESERVATION_SERVICE_HOURS.length - 1] + 1) * 60
    const ratio = (nowMinutes - serviceStart) / (serviceEnd - serviceStart)
    return Math.min(100, Math.max(0, ratio * 100))
  }

  anchors.sort((left, right) => left.minutes - right.minutes)

  if (nowMinutes <= anchors[0].minutes) {
    return (anchors[0].index / Math.max(rows.length - 1, 1)) * 100
  }

  if (nowMinutes >= anchors[anchors.length - 1].minutes) {
    return (anchors[anchors.length - 1].index / Math.max(rows.length - 1, 1)) * 100
  }

  for (let index = 0; index < anchors.length - 1; index += 1) {
    const left = anchors[index]
    const right = anchors[index + 1]

    if (nowMinutes >= left.minutes && nowMinutes <= right.minutes) {
      const span = right.minutes - left.minutes || 1
      const ratio = (nowMinutes - left.minutes) / span
      const rowIndex = left.index + ((right.index - left.index) * ratio)
      return (rowIndex / Math.max(rows.length - 1, 1)) * 100
    }
  }

  return 0
}

function buildFloorPlanSnapshot({
  layout,
  reservations,
  todayKey,
  nowMinutes,
  cleaningFlags = new Set(),
  syncWithList = false,
  debugAssignments = false,
  selectedSeating = null,
  seatingsById = new Map(),
  seatings = [],
  selectedReservation = null,
}) {
  if (!layout?.tables?.length) {
    return {
      layout: layout ?? { id: 'empty', name: 'AMORE', zones: [], tables: [], units: [] },
      tableStates: [],
      stats: buildFloorPlanLiveStats([], reservations, todayKey, nowMinutes),
    }
  }

  const enrichedReservations = reservations.map((reservation) => (
    enrichReservationWithSeatingAssignment(reservation)
  ))

  if (debugAssignments) {
    debugFloorAssignmentSnapshot({
      layout,
      reservations: enrichedReservations,
      todayKey,
      syncWithList,
    })
  }

  const reservationByTableId = buildFloorTableReservationMap({
    layout,
    reservations: enrichedReservations,
    todayKey,
    syncWithList,
    debug: debugAssignments,
  })

  const floorUnits = layout?.tables ?? layout?.units ?? []

  let tableStates = layout.tables.map((table) => {
    const tableReservations = getReservationsForFloorTable(
      table,
      enrichedReservations,
      todayKey,
      { syncWithList, floorUnits },
    )
    const operational = resolveFloorTableOperationalState(
      tableReservations,
      nowMinutes,
      todayKey,
      { needsCleaning: cleaningFlags.has(table.id) },
    )
    const reservation = operational.displayReservation
      ?? operational.activeReservation
      ?? reservationByTableId.get(table.id)
      ?? findReservationForFloorTable(table, enrichedReservations, todayKey, { syncWithList })
    const status = operational.floorStatus

    return {
      table,
      reservation,
      status,
      operational,
      meta: {
        zoneId: table.zoneId,
        waiterZone: table.zoneId,
        timer: null,
        aiSuggestion: null,
        heatMap: null,
        cleaningQueue: null,
        future: FLOOR_PLAN_FUTURE_MODULES,
        seatingIndicators: syncWithList && seatings.length
          ? buildTableSeatingDayIndicators(table, enrichedReservations, todayKey, seatings, {
            layout,
            seatingsById,
          })
          : [],
      },
    }
  })

  if (selectedSeating) {
    tableStates = applyHostFloorSelectedSeatingContext(tableStates, {
      selectedSeating,
      enrichedReservations,
      todayKey,
      seatingsById,
      layout,
      selectedReservation,
    })
  }

  return {
    layout,
    tableStates,
    stats: buildFloorPlanLiveStats(tableStates, reservations, todayKey, nowMinutes),
  }
}

const DESKTOP_FLOOR_PLAN_LEGEND_ITEMS = Object.entries(FLOOR_TABLE_STATUS_META).map(([id, entry]) => ({
  id,
  label: entry.label,
  tone: entry.tone,
}))

function FloorHeatmapLegend() {
  return (
    <div className="floor-plan-legend floor-heatmap-legend" aria-label="Utilization legend">
      {FLOOR_HEATMAP_TIERS.map((tier) => (
        <span key={tier.id} className={`floor-plan-legend-item heatmap-tier-${tier.id}`}>
          <span className="floor-plan-legend-swatch" aria-hidden="true" />
          {tier.label}
        </span>
      ))}
    </div>
  )
}

function FloorPlanViewModeToggle({ value, onChange }) {
  return (
    <div className="floor-plan-view-toggle" role="tablist" aria-label="Floor plan view mode">
      {FLOOR_PLAN_VIEW_MODES.map((mode) => (
        <button
          key={mode.id}
          type="button"
          role="tab"
          aria-selected={value === mode.id}
          className={`floor-plan-view-toggle-btn${value === mode.id ? ' is-active' : ''}`}
          onClick={() => onChange(mode.id)}
        >
          {mode.label}
        </button>
      ))}
    </div>
  )
}

function FloorHeatmapPeriodFilter({
  periodId,
  customStart,
  customEnd,
  onPeriodChange,
  onCustomStartChange,
  onCustomEndChange,
}) {
  return (
    <div className="floor-heatmap-period-filter" aria-label="Heatmap time period">
      <div className="floor-heatmap-period-chips">
        {FLOOR_HEATMAP_PERIODS.map((period) => (
          <button
            key={period.id}
            type="button"
            className={`floor-heatmap-period-chip${periodId === period.id ? ' is-active' : ''}`}
            onClick={() => onPeriodChange(period.id)}
          >
            {period.label}
          </button>
        ))}
      </div>
      {periodId === 'custom' ? (
        <div className="floor-heatmap-custom-range">
          <label className="floor-heatmap-date-field">
            <span>From</span>
            <input
              type="date"
              value={customStart}
              onChange={(event) => onCustomStartChange(event.target.value)}
            />
          </label>
          <label className="floor-heatmap-date-field">
            <span>To</span>
            <input
              type="date"
              value={customEnd}
              onChange={(event) => onCustomEndChange(event.target.value)}
            />
          </label>
        </div>
      ) : null}
    </div>
  )
}

function FloorPlanLiveStats({ stats }) {
  return (
    <div className="floor-plan-live-stats" aria-label="Live floor statistics">
      <div className="floor-plan-occupancy-metric">
        <span>Occupied</span>
        <strong>{stats.occupied}</strong>
      </div>
      <div className="floor-plan-occupancy-metric">
        <span>Available</span>
        <strong>{stats.available}</strong>
      </div>
      <div className="floor-plan-occupancy-metric floor-plan-occupancy-highlight">
        <span>Occupancy</span>
        <strong>{stats.occupancyPercent}%</strong>
      </div>
      <div className="floor-plan-occupancy-metric">
        <span>Guests inside</span>
        <strong>{stats.guestsInside}</strong>
      </div>
      <div className="floor-plan-occupancy-metric">
        <span>Upcoming</span>
        <strong>{stats.upcomingArrivals}</strong>
      </div>
      <div className="floor-plan-occupancy-metric">
        <span>Waiting</span>
        <strong>{stats.reservationsWaiting}</strong>
      </div>
    </div>
  )
}

function TimelineLiveNowRail({ positionPercent, nowMinutes, todayKey }) {
  return (
    <div
      className="timeline-live-now-rail"
      style={{ '--timeline-now-top': `${positionPercent}%` }}
      aria-hidden="true"
    >
      <div className="timeline-live-now-rail-line" />
      <div className="timeline-live-now-rail-marker">
        <span className="timeline-live-now-rail-dot" />
        <span className="timeline-live-now-rail-label">NOW</span>
        <time dateTime={`${todayKey}T${formatTimelineSlotLabel(nowMinutes)}`}>
          {formatTimelineSlotLabel(nowMinutes)}
        </time>
      </div>
    </div>
  )
}

function FloorTableContextMenu({ menu, mergedGroup, onClose, onSplitPlaceholder }) {
  if (!menu) return null

  return (
    <>
      <button type="button" className="floor-plan-context-backdrop" onClick={onClose} aria-label="Close table menu" />
      <div
        className="floor-plan-context-menu"
        style={{ left: menu.x, top: menu.y }}
        role="menu"
      >
        <button
          type="button"
          role="menuitem"
          disabled={!mergedGroup}
          onClick={onSplitPlaceholder}
          title={mergedGroup ? 'Split merged tables' : 'Select merged tables first'}
        >
          Split table
        </button>
        <button type="button" role="menuitem" onClick={onClose}>Close</button>
      </div>
    </>
  )
}

function FloorTableNode({
  tableState,
  allReservations = [],
  floorUnits = [],
  syncWithList = false,
  todayKey,
  nowMinutes,
  viewMode = 'normal',
  heatmapMetrics = null,
  isAnalyticsOpen = false,
  onAnalyticsToggle,
  isMergeSelected,
  isSeatPicking = false,
  isDropTarget,
  isDragging,
  isStatusPulsing,
  isHostFloor = false,
  linkMeta = null,
  nodeRef,
  tooltipDismissVersion = 0,
  activateTableViaViewport = false,
  hostTableTapRegistry = null,
  onHostTableDirectTap,
  onTableClick,
  onTableContextMenu,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  showDiningTimers = false,
  diningTimerNowMinutes = nowMinutes,
  diningTimerLabelPlacement = null,
}) {
  const { isSelected, selectionPulseKey, seatingDraftUnitIds, hostEditUnitIds, isHostFloorPickActive, selectedReservation } = useReservationWorkspace()
  const { table, reservation, status, operational } = tableState
  const isHeatmap = viewMode === 'heatmap'

  const tableSchedule = useMemo(() => {
    if (!isHostFloor || isHeatmap) return []
    return getReservationsForFloorTable(table, allReservations, todayKey, {
      floorUnits,
      syncWithList,
    })
  }, [allReservations, floorUnits, isHeatmap, isHostFloor, syncWithList, table, todayKey])

  const hostOperational = isHostFloor && !isHeatmap ? operational : null
  const hostVisualIndicator = hostOperational?.hostIndicator ?? null
  const displayReservation = hostOperational?.displayReservation ?? reservation
  const hostCompactContent = isHostFloor && !isHeatmap && hostOperational
    ? buildHostFloorCompactTableContent({
      table,
      operational: hostOperational,
      displayReservation,
    })
    : null
  const diningTimerPresentation = showDiningTimers && isHostFloor && !isHeatmap && displayReservation
    ? buildHostFloorDiningTimerPresentation(displayReservation, {
      phase: hostOperational?.phase,
      hostIndicator: hostOperational?.hostIndicator,
      nowMinutes,
      todayKey,
    })
    : null
  const tableStatusClass = isHostFloor && !isHeatmap && hostOperational
    ? resolveHostFloorTableStatusClass(hostOperational, {
      hasSeatingConflict: hostOperational.hasSeatingConflict,
      isMultiLinked: linkMeta?.isMultiLinked,
    })
    : `status-${status}`
  const showHostVisualDot = Boolean(
    hostVisualIndicator
    && ['confirmed', 'waiting', 'seated', 'finished', 'late'].includes(hostVisualIndicator),
  )
  const guestName = displayReservation ? formatReservationGuestName(displayReservation.guestName) : null
  const guestCount = displayReservation ? Number(displayReservation.guests) || 0 : 0
  const arrivalTime = displayReservation ? formatTime24(displayReservation.time) || '—' : null
  const guestType = displayReservation
    ? (isReservationVip(displayReservation) ? 'VIP' : 'Regular')
    : null
  const statusLabel = displayReservation
    ? getReservationStatusBadgeLabel(displayReservation, nowMinutes, todayKey)
    : FLOOR_TABLE_STATUS_META[status]?.label || status
  const tableIsSelected = !isHeatmap && displayReservation ? isSelected(displayReservation) : false
  const isPickedForSeating = seatingDraftUnitIds.includes(table.id)
    || (isHostFloorPickActive && hostEditUnitIds.includes(table.id))
  const isUnavailable = !isHeatmap && (
    isHostFloor
      ? (
        isFloorTablePhysicallyOccupied(hostOperational)
        || status === 'cleaning'
        || (
          hostOperational?.phase === 'upcoming'
          && displayReservation
          && selectedReservation
          && String(displayReservation.id) !== String(selectedReservation.id)
        )
      )
      : status !== 'available' && status !== 'cleaning'
  )
  const unitLabel = table.displayLabel ?? (table.unitType === 'table' ? `Table ${table.label}` : table.label)
  const hostTableLabel = formatHostFloorTableLabel(table)
  const seatCapacity = Number(table.maxGuestCapacity ?? table.seats) || 0
  const capacityLabel = table.maxGuestCapacity && table.maxGuestCapacity !== table.seats
    ? `${table.seats} stools · max ${table.maxGuestCapacity}`
    : isHostFloor
      ? `${seatCapacity} guests`
      : `${table.seats} seats`
  const isLargeCapacity = !guestName && seatCapacity > 20
  const seatedDurationLabel = displayReservation && isHostFloor
    && hostOperational?.phase === 'seated'
    ? getSeatedDurationLabel(displayReservation, nowMinutes, todayKey)
    : null
  const reservationTooltipMeta = reservation && guestName
    ? formatHostFloorReservationTooltipMeta(reservation, { guestType })
    : null
  const reservationTooltipSchedule = arrivalTime
    ? `${arrivalTime} · ${guestCount} guests`
    : `${guestCount} guests`
  const showCompactLinkedLabel = Boolean(
    guestName && isHostFloor && linkMeta?.isMultiLinked && !linkMeta?.isLinkPrimary,
  )
  const publishedLayout = isHostFloor
    ? getPublishedTableLayoutStyle(table)
    : { style: {}, hasPublishedSize: false }
  const nodeStyle = isHostFloor
    ? {
      ...publishedLayout.style,
    }
    : {
      left: `${table.x}%`,
      top: `${table.y}%`,
      ...(table.widthPercent ? {
        '--floor-table-width': `${table.widthPercent}%`,
        '--floor-table-height': `${table.heightPercent ?? table.widthPercent}%`,
      } : {}),
      ...(table.rotation
        ? { transform: `translate(-50%, -50%) rotate(${table.rotation}deg)` }
        : {}),
    }
  const usesPublishedSize = isHostFloor
    ? publishedLayout.hasPublishedSize
    : Boolean(table.widthPercent)

  const tableNodeRef = useRef(null)
  const [isTooltipVisible, setIsTooltipVisible] = useState(false)
  const useHostDirectTableTap = Boolean(isHostFloor && !isHeatmap && hostTableTapRegistry)

  const handleHostDirectPointerDown = (event) => {
    if (!useHostDirectTableTap) return
    if (event.pointerType === 'mouse' && event.button !== 0) return

    beginHostFloorDirectTableTap(hostTableTapRegistry.current, {
      pointerId: event.pointerId,
      tableId: table.id,
      clientX: event.clientX,
      clientY: event.clientY,
    })
    event.stopPropagation()
  }

  const handleHostDirectPointerUp = (event) => {
    if (!useHostDirectTableTap) return
    if (isHostFloorTableTapConsumedForTable(hostTableTapRegistry.current, table.id)) return

    const result = completeHostFloorDirectTableTap(hostTableTapRegistry.current, {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
    })
    if (!result.activated) return

    event.preventDefault()
    event.stopPropagation()
    onHostTableDirectTap?.(tableState, event, { tableLabel: hostTableLabel })
  }

  const handleHostDirectPointerCancel = (event) => {
    if (!useHostDirectTableTap) return
    cancelHostFloorDirectTableTap(hostTableTapRegistry.current, event.pointerId)
  }

  const handleHostDirectTouchStart = (event) => {
    if (!useHostDirectTableTap) return
    if (event.touches.length !== 1) return

    const touch = event.touches[0]
    beginHostFloorDirectTableTap(hostTableTapRegistry.current, {
      pointerId: touch.identifier,
      tableId: table.id,
      clientX: touch.clientX,
      clientY: touch.clientY,
    })
    event.stopPropagation()
  }

  const handleHostDirectTouchEnd = (event) => {
    if (!useHostDirectTableTap) return

    const touch = event.changedTouches[0]
    if (!touch) return
    if (isHostFloorTableTapConsumedForTable(hostTableTapRegistry.current, table.id)) return

    const result = completeHostFloorDirectTableTap(hostTableTapRegistry.current, {
      pointerId: touch.identifier,
      clientX: touch.clientX,
      clientY: touch.clientY,
    })
    if (!result.activated) return

    event.preventDefault()
    event.stopPropagation()
    onHostTableDirectTap?.(tableState, event, { tableLabel: hostTableLabel })
  }

  const tableBookingEntries = useMemo(() => (
    tableSchedule.slice(0, 3).map((entry, index) => ({
      id: `${entry.id}-${index}`,
      time: formatTime24(entry.time),
      guestName: formatReservationGuestName(entry.guestName ?? entry.name),
    }))
  ), [tableSchedule])

  const tableBookingTimesLabel = tableBookingEntries
    .map((entry) => `${entry.time} ${entry.guestName}`)
    .join(', ')

  const hasMultipleTableBookings = isHostFloor && !syncWithList && tableSchedule.length > 1
  const showHostFloorGuestInfo = Boolean(
    guestName
    && displayReservation
    && !hasMultipleTableBookings,
  )
  const showUpcomingLabel = Boolean(
    isHostFloor
    && isHeatmap
    && hostOperational?.phase === 'upcoming'
    && hostOperational.nextReservationTime
    && !hasMultipleTableBookings,
  )
  const showActiveGuestLabel = Boolean(
    guestName
    && isHostFloor
    && isHeatmap
    && (hostOperational?.phase === 'seated' || hostOperational?.phase === 'waiting'),
  )
  const draggableReservation = isHostFloor
    ? (hostOperational?.phase === 'seated' ? displayReservation : null)
    : reservation

  useEffect(() => {
    setIsTooltipVisible(false)
  }, [tooltipDismissVersion])

  const assignNodeRef = useCallback((node) => {
    tableNodeRef.current = node
    if (nodeRef) nodeRef(node)
  }, [nodeRef])

  const handlePointerEnter = () => {
    if (isHostFloor) return
    setIsTooltipVisible(true)
  }

  const handlePointerLeave = () => {
    if (isHostFloor) return
    setIsTooltipVisible(false)
  }

  const handleDragStartWrapped = (event) => {
    setIsTooltipVisible(false)
    onDragStart(event, tableState)
  }

  const handleClick = (event) => {
    if (activateTableViaViewport) return
    setIsTooltipVisible(false)
    if (isHeatmap) {
      event.stopPropagation()
      onAnalyticsToggle?.(table.id)
      return
    }

    onTableClick(tableState, event)
  }

  const handleTableKeyDown = (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onTableClick(tableState, event)
  }

  return (
    <div
      ref={assignNodeRef}
      className={`floor-table-node shape-${table.shape}${isHeatmap ? ` view-heatmap heatmap-tier-${heatmapMetrics?.tier || 'very-light'}` : ` ${tableStatusClass}`}${isMergeSelected ? ' is-merge-selected' : ''}${isSeatPicking ? ' is-seat-picking' : ''}${isPickedForSeating ? ' is-seat-selected' : ''}${isUnavailable && isSeatPicking ? ' is-seat-unavailable' : ''}${isDropTarget ? ' is-drop-target' : ''}${isDragging ? ' is-dragging' : ''}${tableIsSelected ? ' is-selected is-synced' : ''}${isStatusPulsing ? ` is-status-pulse ${tableStatusClass}` : ''}${isAnalyticsOpen ? ' is-analytics-open' : ''}${linkMeta?.isMultiLinked ? ' is-multi-linked' : ''}${linkMeta?.colorClass ? ` ${linkMeta.colorClass}` : ''}${linkMeta?.isLinkPrimary ? ' is-link-primary' : ''}${usesPublishedSize ? (isHostFloor ? ' has-published-layout' : ' has-custom-size') : ''}${isHostFloor ? ' is-host-touch' : ''}`}
      style={nodeStyle}
      data-table-id={table.id}
      data-floor-table-id={table.id}
      data-floor-table-label={hostTableLabel}
      data-selection-pulse={tableIsSelected ? selectionPulseKey : undefined}
      draggable={!isHeatmap && Boolean(draggableReservation)}
      onDragStart={handleDragStartWrapped}
      onDragEnd={onDragEnd}
      onDragOver={(event) => onDragOver(event, tableState)}
      onDragLeave={onDragLeave}
      onDrop={(event) => onDrop(event, tableState)}
      onClick={useHostDirectTableTap || activateTableViaViewport ? undefined : handleClick}
      onPointerDown={useHostDirectTableTap ? handleHostDirectPointerDown : undefined}
      onPointerUp={useHostDirectTableTap ? handleHostDirectPointerUp : undefined}
      onPointerCancel={useHostDirectTableTap ? handleHostDirectPointerCancel : undefined}
      onTouchStart={useHostDirectTableTap ? handleHostDirectTouchStart : undefined}
      onTouchEnd={useHostDirectTableTap ? handleHostDirectTouchEnd : undefined}
      onKeyDown={isHostFloor ? handleTableKeyDown : undefined}
      onContextMenu={(event) => onTableContextMenu(event, tableState)}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      role="button"
      tabIndex={0}
      aria-label={isHeatmap
        ? `${unitLabel}, ${heatmapMetrics?.utilizationPercent ?? 0}% utilization`
        : isHostFloor && hostCompactContent
          ? buildHostFloorCompactAriaLabel(hostCompactContent)
          : hasMultipleTableBookings
            ? `${hostTableLabel}, ${tableSchedule.length} bookings, ${tableBookingTimesLabel}`
            : showHostFloorGuestInfo
              ? `${hostTableLabel}, ${guestName}, ${arrivalTime || seatedDurationLabel || '—'}, ${guestCount} guests`
              : `${hostTableLabel}, ${seatCapacity} seats, available`}
      aria-current={tableIsSelected ? 'true' : undefined}
      aria-expanded={isHeatmap ? isAnalyticsOpen : undefined}
    >
      <div className="floor-table-node-surface">
        {isHostFloor && !isHeatmap ? (
          <HostFloorCompactTableContent
            content={hostCompactContent}
            linkMeta={linkMeta}
            seatingIndicators={tableState.meta?.seatingIndicators ?? []}
            diningTimerPresentation={diningTimerPresentation}
          />
        ) : (
          <>
            {showHostVisualDot ? (
              <span
                className={`host-reservation-visual-dot floor-table-status-dot is-${hostVisualIndicator}`}
                aria-hidden="true"
              />
            ) : null}
            {linkMeta?.isMultiLinked ? (
              <span className="floor-table-linked-indicator" aria-hidden="true" aria-label="Linked tables">⛓</span>
            ) : null}
            {isHostFloor || !guestName || showCompactLinkedLabel ? (
              <span className="floor-table-number">
                {isHostFloor ? unitLabel.toUpperCase() : unitLabel}
              </span>
            ) : null}
            {isHeatmap ? (
              <span className="floor-table-heatmap-value">{heatmapMetrics?.utilizationPercent ?? 0}%</span>
            ) : hasMultipleTableBookings ? (
              <div className="floor-table-multi-bookings">
                <span className="floor-table-booking-count">{tableSchedule.length} BOOKINGS</span>
                <span className="floor-table-booking-entries">
                  {tableBookingEntries.map((entry) => (
                    <span key={entry.id} className="floor-table-booking-entry">
                      <span className="floor-table-booking-time">{entry.time}</span>
                      <span className="floor-table-booking-guest">{entry.guestName}</span>
                    </span>
                  ))}
                  {tableSchedule.length > 3 ? (
                    <span className="floor-table-booking-entry is-more">
                      +{tableSchedule.length - 3} more
                    </span>
                  ) : null}
                </span>
              </div>
            ) : showUpcomingLabel ? (
              <div className="floor-table-next-booking">
                <span className="floor-table-next-label">Next</span>
                <span className="floor-table-next-time">{hostOperational.nextReservationTime}</span>
              </div>
            ) : showActiveGuestLabel ? (
              <span className="floor-table-guest">{guestName}</span>
            ) : guestName && !showCompactLinkedLabel && !isHostFloor ? (
              <div className="floor-table-assignment-copy">
                <span className="floor-table-guest">{guestName}</span>
                {seatedDurationLabel ? (
                  <span className="floor-table-seated-duration floor-table-reservation-time">{seatedDurationLabel}</span>
                ) : (
                  <span className="floor-table-time floor-table-reservation-time">{arrivalTime}</span>
                )}
                <span className="floor-table-capacity floor-table-reservation-guests">
                  {`${guestCount} / ${table.maxGuestCapacity ?? table.seats}`}
                </span>
              </div>
            ) : (
              <span className={`floor-table-meta floor-table-meta-empty${isLargeCapacity ? ' is-large-capacity' : ''}`}>
                {isLargeCapacity ? (
                  <span className="floor-table-capacity-compact">{seatCapacity} 👥</span>
                ) : capacityLabel}
              </span>
            )}
          </>
        )}
      </div>

      {diningTimerPresentation?.estimatedFreeExternalLabel ? (
        <span
          className={`floor-table-dining-timer-external is-placement-${diningTimerLabelPlacement?.position ?? 'below'} is-urgency-${diningTimerPresentation.urgency}`}
          data-testid="floor-table-dining-timer-external"
          data-placement={diningTimerLabelPlacement?.position ?? 'below'}
          data-urgency={diningTimerPresentation.urgency}
        >
          {diningTimerPresentation.estimatedFreeExternalLabel}
        </span>
      ) : null}

      {isHeatmap ? (
        <div
          className={`floor-table-analytics-tooltip${isAnalyticsOpen ? ' is-pinned' : ''}`}
          role="tooltip"
          onClick={(event) => event.stopPropagation()}
        >
          <strong>Table {table.label}</strong>
          <div className="floor-table-analytics-row">
            <span>Occupancy</span>
            <strong>{heatmapMetrics?.utilizationPercent ?? 0}%</strong>
          </div>
          <div className="floor-table-analytics-row">
            <span>Today&apos;s visits</span>
            <strong>{heatmapMetrics?.todaysVisits ?? 0}</strong>
          </div>
          <div className="floor-table-analytics-row">
            <span>Average dining time</span>
            <strong>{formatHeatmapDuration(heatmapMetrics?.avgDiningMinutes ?? 0)}</strong>
          </div>
          <div className="floor-table-analytics-row">
            <span>Average party size</span>
            <strong>{heatmapMetrics?.avgPartySize ?? 0}</strong>
          </div>
          <div className="floor-table-analytics-row floor-table-analytics-muted">
            <span>Revenue</span>
            <strong>Coming later</strong>
          </div>
        </div>
      ) : !isHostFloor && guestName ? (
        <FloorTableReservationTooltip
          guestName={guestName}
          scheduleLabel={reservationTooltipSchedule}
          metaLabel={reservationTooltipMeta}
          statusLabel={statusLabel}
          guestType={guestType}
          isLinked={Boolean(linkMeta?.isMultiLinked)}
          isVisible={isTooltipVisible}
          nodeRef={tableNodeRef}
        />
      ) : !isHostFloor ? (
        <div
          className={`floor-table-tooltip is-static${isTooltipVisible ? ' is-visible' : ''}`}
          role="tooltip"
        >
          <strong>{unitLabel}</strong>
          <span>Available · {capacityLabel}</span>
        </div>
      ) : null}
    </div>
  )
}

function FloorPlanAreaSwitcher({ zones, activeZoneId, onChange }) {
  const activeZone = zones.find((zone) => zone.id === activeZoneId) ?? zones[0]

  const switchZone = (direction) => {
    onChange(getAdjacentFloorZoneId(zones, activeZoneId, direction))
  }

  return (
    <div className="floor-plan-area-switcher" aria-label="Restaurant area">
      <button
        type="button"
        className="floor-plan-area-nav-btn"
        onClick={() => switchZone('prev')}
        aria-label="Previous area"
      >
        ‹
      </button>

      <label className="floor-plan-area-select">
        <span className="sr-only">Restaurant area</span>
        <select
          className="floor-plan-area-select-input"
          value={activeZoneId}
          onChange={(event) => onChange(event.target.value)}
        >
          {zones.map((zone) => (
            <option key={zone.id} value={zone.id}>{zone.label}</option>
          ))}
        </select>
        <span className="floor-plan-area-select-chevron" aria-hidden="true">▾</span>
      </label>

      <button
        type="button"
        className="floor-plan-area-nav-btn"
        onClick={() => switchZone('next')}
        aria-label="Next area"
      >
        ›
      </button>

      <span className="floor-plan-area-current">{activeZone?.label}</span>
    </div>
  )
}

function FloorPlanView({
  reservations,
  allReservations,
  listReservations,
  todayKey,
  nowMinutes,
  isSaving,
  isCompact = false,
  canEditFloorPlan = true,
  onAssignReservationTables,
  onQuickStatusUpdate,
  onOpenAddReservation,
  onOpenReservation,
  onEditReservation,
  onHostEditSave,
  onReservationNotice,
  canManageAssignment = true,
  seatings = [],
  selectedSeating = null,
  onSelectedSeatingChange,
  hostQueueAreaFilterId = HOST_QUEUE_ALL_AREAS,
  onTableInspectorChange = null,
}) {
  const {
    clearSelection,
    selectedReservation,
    floorTableRefs,
    floorCanvasRef,
    activeFloorAreaId,
    setActiveFloorAreaId,
    draggingReservationId,
    setDraggingReservationId,
    clearDragState,
    layout,
    reservationSeatings,
    seatingDraftUnitIds,
    seatingExtraChairs,
    seatingStandingGuests,
    toggleSeatingUnit,
    startSeatingDraft,
    clearSeatingDraft,
    setSeatingExtraChairs,
    setSeatingStandingGuests,
    isHostFloorPickActive,
    toggleHostEditUnit,
    hostEditingReservation,
    openHostEdit,
    closeHostEdit,
    setFloorPlanMode,
    floorPlanMode,
    isHostMultiTableSelectMode,
    startHostMultiTableSelect,
    cancelHostMultiTableSelect,
  } = useReservationWorkspace()
  const { hasLayout, hasDisplayableLayout, loadError, saveError, isRefreshingPublishedLayout } = usePublishedFloorPlan()
  const [dropTargetTableId, setDropTargetTableId] = useState(null)
  const [mergeSelection, setMergeSelection] = useState([])
  const [mergedGroups, setMergedGroups] = useState([])
  const [cleaningFlags, setCleaningFlags] = useState(() => new Set())
  const [contextMenu, setContextMenu] = useState(null)
  const [statusPulseTableIds, setStatusPulseTableIds] = useState(() => new Set())
  const [viewMode, setViewMode] = useState('normal')
  const [heatmapPeriodId, setHeatmapPeriodId] = useState('today')
  const [heatmapCustomStart, setHeatmapCustomStart] = useState(todayKey)
  const [heatmapCustomEnd, setHeatmapCustomEnd] = useState(todayKey)
  const [analyticsTableId, setAnalyticsTableId] = useState(null)
  const previousTableStatusesRef = useRef(new Map())
  const viewportRef = useRef(null)
  const floorPanStateRef = useRef({ x: 0, y: 0 })
  const floorPointerRef = useRef({ mode: 'idle' })
  const isManualFloorZoomRef = useRef(false)
  const [floorZoom, setFloorZoom] = useState(1)
  const [floorPan, setFloorPan] = useState({ x: 0, y: 0 })
  const [tooltipDismissVersion, setTooltipDismissVersion] = useState(0)
  const [scheduleCardTableId, setScheduleCardTableId] = useState(null)
  const [scheduleCardAssignmentMode, setScheduleCardAssignmentMode] = useState(false)
  const [scheduleCardAssignmentSeatingId, setScheduleCardAssignmentSeatingId] = useState(null)
  const [showDiningTimers, setShowDiningTimers] = useState(false)
  const [floorInteractionLocked, setFloorInteractionLocked] = useState(true)
  const isHeatmap = viewMode === 'heatmap'
  const scheduleCardLifecycleRef = useRef(createHostScheduleCardLifecycleState())
  const hostTableTapRegistryRef = useRef(createHostFloorTableTapRegistry())
  const scheduleCardTableIdRef = useRef(null)
  const visibleTableStatesRef = useRef([])
  scheduleCardTableIdRef.current = scheduleCardTableId

  const diningTimerReferenceDate = useHostDiningTimerClock(
    isCompact && !isHeatmap && showDiningTimers,
  )
  const diningTimerNowMinutes = getNowMinutesFromDate(diningTimerReferenceDate)

  const scheduleCardTable = useMemo(() => resolveScheduleCardTableById(scheduleCardTableId, {
    layoutTables: layout?.tables ?? [],
    visibleTableStates: [],
  }), [layout?.tables, scheduleCardTableId])

  const closeScheduleCardTable = useCallback((source) => {
    setScheduleCardTableId(null)
    setScheduleCardAssignmentMode(false)
    setScheduleCardAssignmentSeatingId(null)
    scheduleCardLifecycleRef.current = recordScheduleCardDismiss(
      scheduleCardLifecycleRef.current,
      source,
    )
  }, [])

  const openScheduleCardTable = useCallback((table, source = 'table-tap', options = {}) => {
    if (!table?.id) return
    setScheduleCardTableId(String(table.id))
    setScheduleCardAssignmentMode(Boolean(options.assignmentMode))
    scheduleCardLifecycleRef.current = recordScheduleCardOpen(
      scheduleCardLifecycleRef.current,
      {
        tableId: table.id,
        tableLabel: table.label ?? table.displayLabel,
      },
    )
  }, [])

  useEffect(() => {
    if (!isHostFloorDebugEnabled() || !isCompact) return
    patchHostFloorDebugTrace({
      dayViewState: scheduleCardTableId ? 'open' : 'closed',
      lastEvent: scheduleCardTableId ? 'schedule-card-open' : 'schedule-card-closed',
    })
  }, [isCompact, scheduleCardTableId])

  const dismissFloorTooltips = useCallback(() => {
    setTooltipDismissVersion((current) => current + 1)
  }, [])

  const clampFloorZoom = useCallback((value) => (
    Math.min(HOST_FLOOR_MAX_ZOOM, Math.max(HOST_FLOOR_MIN_ZOOM, value))
  ), [])

  floorPanStateRef.current = floorPan

  const handleFloorZoomIn = useCallback(() => {
    closeScheduleCardTable('zoom-in')
    isManualFloorZoomRef.current = true
    setFloorZoom((current) => clampFloorZoom(current + 0.12))
  }, [clampFloorZoom, closeScheduleCardTable])

  const handleFloorZoomOut = useCallback(() => {
    closeScheduleCardTable('zoom-out')
    isManualFloorZoomRef.current = true
    setFloorZoom((current) => clampFloorZoom(current - 0.12))
  }, [clampFloorZoom, closeScheduleCardTable])

  useEffect(() => {
    if (!isCompact) return undefined

    const viewport = viewportRef.current
    if (!viewport) return undefined

    const onWheel = (event) => {
      if (scheduleCardTableIdRef.current) return
      dismissFloorTooltips()
      if (!event.ctrlKey && !event.metaKey) return

      event.preventDefault()
      isManualFloorZoomRef.current = true
      const direction = event.deltaY < 0 ? 1 : -1
      setFloorZoom((current) => clampFloorZoom(current + direction * 0.12))
    }

    viewport.addEventListener('wheel', onWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', onWheel)
  }, [clampFloorZoom, dismissFloorTooltips, isCompact])

  const resetFloorPointerState = useCallback(() => {
    floorPointerRef.current = { mode: HOST_FLOOR_POINTER_MODE.IDLE }
    viewportRef.current?.classList.remove('is-panning')
  }, [])

  const showHostSeatingBar = shouldShowHostSeatingDrawer()

  const hostCompactAssignmentSelection = isHostCompactAssignmentSelection({
    isCompact,
    selectedReservation,
  })
  const showHostMultiTableEntry = shouldShowHostMultiTableEntryAction({
    isCompact,
    isHeatmap,
    hostCompactAssignmentSelection,
    isHostMultiTableSelectMode,
  })

  const heatmapPeriodRange = useMemo(() => (
    getFloorHeatmapDateRange(heatmapPeriodId, todayKey, {
      startKey: heatmapCustomStart,
      endKey: heatmapCustomEnd,
    })
  ), [heatmapCustomEnd, heatmapCustomStart, heatmapPeriodId, todayKey])

  const heatmapAnalytics = useMemo(() => (
    buildFloorHeatmapAnalytics({
      allReservations,
      layout,
      periodRange: heatmapPeriodRange,
      todayKey,
    })
  ), [allReservations, heatmapPeriodRange, layout, todayKey])

  const heatmapMetricsByTableId = useMemo(() => (
    Object.fromEntries(heatmapAnalytics.map((entry) => [entry.tableId, entry]))
  ), [heatmapAnalytics])

  useEffect(() => {
    if (!isHeatmap) {
      setAnalyticsTableId(null)
    }
  }, [isHeatmap])

  const assignmentReservations = useMemo(() => {
    const canonical = allReservations?.length ? allReservations : reservations
    if (!isCompact) return canonical
    return listReservations?.length ? listReservations : canonical
  }, [allReservations, isCompact, listReservations, reservations])

  const effectiveSeatings = useMemo(
    () => (seatings.length > 0 ? seatings : (reservationSeatings ?? [])),
    [reservationSeatings, seatings],
  )

  const seatingsById = useMemo(
    () => buildSeatingsById(effectiveSeatings),
    [effectiveSeatings],
  )

  const scheduleCardDateLabel = useMemo(
    () => formatHostWorkspaceLongDateLabel(todayKey),
    [todayKey],
  )

  useEffect(() => {
    if (hostEditingReservation && scheduleCardTableIdRef.current) {
      closeScheduleCardTable('host-edit-open')
    }
  }, [closeScheduleCardTable, hostEditingReservation])

  const handleScheduleCardEdit = useCallback((reservation) => {
    closeScheduleCardTable('open-reservation')
    if (onOpenReservation) {
      onOpenReservation(reservation)
      return
    }
    openHostEdit(reservation)
  }, [closeScheduleCardTable, onOpenReservation, openHostEdit])

  const handleScheduleCardEditReservation = useCallback((reservation) => {
    closeScheduleCardTable('edit-reservation')
    if (onEditReservation) {
      onEditReservation(reservation)
      return
    }
    openHostEdit(reservation)
  }, [closeScheduleCardTable, onEditReservation, openHostEdit])

  const handleScheduleCardQuickStatus = useCallback(async (reservation, status) => {
    if (!onQuickStatusUpdate || !reservation) return
    await onQuickStatusUpdate(reservation, status)
  }, [onQuickStatusUpdate])

  const handleScheduleCardNewReservation = useCallback((seating) => {
    if (!scheduleCardTable) return
    const prefill = buildTableDayViewCreatePrefill({
      table: scheduleCardTable,
      dateKey: todayKey,
      seating,
      layout,
    })
    closeScheduleCardTable('new-reservation')
    onOpenAddReservation?.(prefill)
  }, [closeScheduleCardTable, layout, onOpenAddReservation, scheduleCardTable, todayKey])

  const handleScheduleCardReleaseTable = useCallback(async (reservation) => {
    if (!onHostEditSave || !scheduleCardTable || !reservation || !canManageAssignment) return

    const releaseUpdate = buildReleaseTableAssignmentUpdate(reservation, scheduleCardTable, { layout })
    const guestLabel = reservation.guestName || 'this reservation'
    const confirmMessage = releaseUpdate.isLastTable
      ? `Release ${releaseUpdate.tableLabel} from ${guestLabel}? The reservation will stay on the books without a table assignment.`
      : `Release ${releaseUpdate.tableLabel} from ${guestLabel}? Other assigned tables will stay linked.`

    if (!window.confirm(confirmMessage)) return

    const form = createHostReservationEditForm(reservation, layout, effectiveSeatings)
    form.assignedUnits = releaseUpdate.assignment.assignedUnits
    form.extraChairs = releaseUpdate.assignment.extraChairs
    form.standingGuests = releaseUpdate.assignment.standingGuests
    form.tableNumber = releaseUpdate.tableNumber

    const result = await onHostEditSave(reservation, form, todayKey)
    if (result?.saved) {
      onReservationNotice?.(
        releaseUpdate.isLastTable
          ? `${releaseUpdate.tableLabel} released. Reservation is now unassigned.`
          : `${releaseUpdate.tableLabel} released from reservation.`,
      )
    }
  }, [
    canManageAssignment,
    effectiveSeatings,
    layout,
    onHostEditSave,
    onReservationNotice,
    scheduleCardTable,
    todayKey,
  ])

  const resolvedFloorAreaId = useMemo(
    () => resolveActiveFloorAreaId(layout, activeFloorAreaId),
    [layout, activeFloorAreaId],
  )

  const floorPlanSnapshot = useMemo(() => (
    buildFloorPlanSnapshot({
      layout,
      reservations: assignmentReservations,
      todayKey,
      nowMinutes,
      cleaningFlags,
      syncWithList: isCompact,
      debugAssignments: isCompact && import.meta.env.DEV,
      selectedSeating,
      seatingsById,
      seatings: effectiveSeatings,
      selectedReservation,
    })
  ), [
    assignmentReservations,
    cleaningFlags,
    effectiveSeatings,
    isCompact,
    layout,
    nowMinutes,
    selectedReservation,
    selectedSeating,
    seatingsById,
    todayKey,
  ])

  const activeZone = useMemo(() => (
    floorPlanSnapshot.layout.zones.find((zone) => zone.id === resolvedFloorAreaId)
      ?? floorPlanSnapshot.layout.zones[0]
  ), [resolvedFloorAreaId, floorPlanSnapshot.layout.zones])

  const visibleTableStates = useMemo(() => (
    floorPlanSnapshot.tableStates.filter((tableState) => (
      tableState.table.zoneId === resolvedFloorAreaId
    ))
  ), [resolvedFloorAreaId, floorPlanSnapshot.tableStates])

  visibleTableStatesRef.current = visibleTableStates

  const resolvedScheduleCardTable = useMemo(() => {
    if (!scheduleCardTableId) return null
    return resolveScheduleCardTableById(scheduleCardTableId, {
      layoutTables: layout?.tables ?? [],
      visibleTableStates,
    }) ?? scheduleCardTable
  }, [layout?.tables, scheduleCardTable, scheduleCardTableId, visibleTableStates])

  const scheduleCardRows = useMemo(() => {
    if (!resolvedScheduleCardTable) return []
    return buildFloorTableDayViewRows(
      resolvedScheduleCardTable,
      assignmentReservations,
      todayKey,
      effectiveSeatings,
      {
        layout,
        seatingsById,
        nowMinutes,
        todayKey,
      },
    )
  }, [
    assignmentReservations,
    effectiveSeatings,
    layout,
    nowMinutes,
    resolvedScheduleCardTable,
    seatingsById,
    todayKey,
  ])

  const reservationLinkGroups = useMemo(
    () => (isCompact && !isHeatmap ? buildReservationLinkGroups(visibleTableStates) : []),
    [isCompact, isHeatmap, visibleTableStates],
  )

  const reservationLinkTableMeta = useMemo(
    () => buildReservationLinkTableMeta(reservationLinkGroups),
    [reservationLinkGroups],
  )

  const diningTimerExternalLabelPlacements = useMemo(() => {
    if (!showDiningTimers || !isCompact || isHeatmap) return new Map()

    const allTables = visibleTableStates.map((tableState) => tableState.table)
    const labelTables = visibleTableStates.flatMap((tableState) => {
      const displayReservation = tableState.operational?.displayReservation ?? tableState.reservation
      const presentation = buildHostFloorDiningTimerPresentation(displayReservation, {
        phase: tableState.operational?.phase,
        hostIndicator: tableState.operational?.hostIndicator,
        nowMinutes: diningTimerNowMinutes,
        todayKey,
      })

      if (!presentation?.estimatedFreeExternalLabel) return []

      return [{ id: tableState.table.id, table: tableState.table }]
    })

    return buildDiningTimerExternalLabelPlacementMap({
      labelTables,
      allTables,
    })
  }, [
    diningTimerNowMinutes,
    isCompact,
    isHeatmap,
    showDiningTimers,
    todayKey,
    visibleTableStates,
  ])

  const applyHostFloorAutoFit = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const layoutSpace = viewport.querySelector('.floor-plan-layout-space')
    const tables = visibleTableStatesRef.current.map((tableState) => tableState.table)
    const fit = computeHostFloorFit({
      tables,
      viewportWidth: layoutSpace?.clientWidth || viewport.clientWidth,
      viewportHeight: layoutSpace?.clientHeight || viewport.clientHeight,
    })

    setFloorZoom(fit.zoom)
    setFloorPan(fit.pan)
    isManualFloorZoomRef.current = false
  }, [])

  const handleFloorZoomFit = useCallback(() => {
    closeScheduleCardTable('zoom-fit')
    applyHostFloorAutoFit()
  }, [applyHostFloorAutoFit, closeScheduleCardTable])

  const hostFloorContextRef = useRef(null)

  useEffect(() => {
    if (!isCompact) return undefined

    const nextContext = buildHostFloorContextSnapshot({
      areaId: resolvedFloorAreaId,
      layoutId: floorPlanSnapshot.layout.id,
      publishedAt: floorPlanSnapshot.layout.publishedAt,
    })

    if (shouldCloseScheduleCardForFloorContextChange({
      previous: hostFloorContextRef.current,
      next: nextContext,
    })) {
      closeScheduleCardTable(
        hostFloorContextRef.current?.areaId !== nextContext.areaId
          ? 'floor-area-change'
          : 'floor-layout-change',
      )
    }

    hostFloorContextRef.current = nextContext
    isManualFloorZoomRef.current = false
    applyHostFloorAutoFit()
  }, [
    activeFloorAreaId,
    applyHostFloorAutoFit,
    closeScheduleCardTable,
    floorPlanSnapshot.layout.id,
    floorPlanSnapshot.layout.publishedAt,
    isCompact,
    resolvedFloorAreaId,
  ])

  useEffect(() => {
    if (floorPlanMode === 'edit') {
      closeScheduleCardTable('edit-layout')
    }
  }, [closeScheduleCardTable, floorPlanMode])

  useEffect(() => {
    if (!isCompact) return undefined

    const viewport = viewportRef.current
    if (!viewport) return undefined

    const handleResize = () => {
      if (isManualFloorZoomRef.current) return
      applyHostFloorAutoFit()
    }

    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(handleResize)
    })

    observer.observe(viewport)
    return () => observer.disconnect()
  }, [applyHostFloorAutoFit, isCompact])

  const hostFloorZoomTier = floorZoom < 0.65 ? 'minimal' : floorZoom < 0.82 ? 'compact' : 'normal'

  useEffect(() => {
    const previousStatuses = previousTableStatusesRef.current
    const nextPulseIds = new Set()
    const pulseStatuses = new Set(['booked', 'arrived', 'seated', 'dining'])

    floorPlanSnapshot.tableStates.forEach((tableState) => {
      const tableId = tableState.table.id
      const nextStatus = tableState.status
      const previousStatus = previousStatuses.get(tableId)

      if (
        previousStatus
        && previousStatus !== nextStatus
        && pulseStatuses.has(nextStatus)
      ) {
        nextPulseIds.add(tableId)
      }

      previousStatuses.set(tableId, nextStatus)
    })

    if (nextPulseIds.size === 0) return undefined

    setStatusPulseTableIds((current) => new Set([...current, ...nextPulseIds]))
    const timeoutId = window.setTimeout(() => {
      setStatusPulseTableIds((current) => {
        const next = new Set(current)
        nextPulseIds.forEach((tableId) => next.delete(tableId))
        return next
      })
    }, 2200)

    return () => window.clearTimeout(timeoutId)
  }, [floorPlanSnapshot.tableStates])

  const mergedGroupForMenu = useMemo(() => {
    if (!contextMenu?.tableId) return null
    return mergedGroups.find((group) => group.tableIds.includes(contextMenu.tableId)) || null
  }, [contextMenu, mergedGroups])

  const handleDragStart = (event, tableState) => {
    if (isHeatmap) {
      event.preventDefault()
      return
    }

    if (!tableState.reservation) {
      event.preventDefault()
      return
    }

    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('application/x-reservation-id', String(tableState.reservation.id))
    setDraggingReservationId(String(tableState.reservation.id))
  }

  const handleDragEnd = () => {
    clearDragState()
    setDropTargetTableId(null)
  }

  const isReservationDragActive = (event) => (
    Boolean(draggingReservationId)
    || Array.from(event.dataTransfer?.types ?? []).includes('application/x-reservation-id')
  )

  const handleDragOver = (event, tableState) => {
    if (isHeatmap || !isReservationDragActive(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropTargetTableId(tableState.table.id)
  }

  const handleDragLeave = () => {
    setDropTargetTableId(null)
  }

  const handleDrop = (event, tableState) => {
    event.preventDefault()
    if (isHeatmap) return

    setDropTargetTableId(null)
    clearDragState()

    const reservationId = event.dataTransfer.getData('application/x-reservation-id')
      || event.dataTransfer.getData('text/plain')
    if (!reservationId) return

    const reservation = reservations.find((entry) => String(entry.id) === reservationId)
      ?? allReservations.find((entry) => String(entry.id) === reservationId)
    if (!reservation) return

    if (
      tableState.reservation
      && String(tableState.reservation.id) !== String(reservation.id)
    ) {
      return
    }

    if (!['available', 'cleaning'].includes(tableState.status)) return

    if (hostEditingReservation && String(hostEditingReservation.id) === String(reservation.id)) {
      toggleHostEditUnit(tableState.table.id)
      return
    }

    const nextCleaningFlags = new Set(cleaningFlags)
    nextCleaningFlags.delete(tableState.table.id)
    setCleaningFlags(nextCleaningFlags)

    if (
      selectedReservation
      && String(selectedReservation.id) === String(reservation.id)
      && seatingDraftUnitIds.length > 0
    ) {
      toggleSeatingUnit(tableState.table.id)
      return
    }

    startSeatingDraft(reservation, tableState.table.id)
  }

  const canAssignSelectedReservationToTable = (tableState) => {
    if (!selectedReservation) return false

    if (
      tableState.reservation
      && String(tableState.reservation.id) === String(selectedReservation.id)
    ) {
      return true
    }

    if (isFloorTablePhysicallyOccupied(tableState.operational)) return false

    if (
      tableState.operational?.phase === 'upcoming'
      && tableState.reservation
      && String(tableState.reservation.id) !== String(selectedReservation.id)
    ) {
      return false
    }

    if (tableState.reservation) return false

    return (
      tableState.operational?.phase === 'available'
      || tableState.operational?.hostIndicator === 'empty'
      || tableState.status === 'available'
      || tableState.status === 'cleaning'
      || tableState.operational?.phase === 'cleaning'
    )
  }

  const handleTableClick = (tableState, event) => {
    if (isHeatmap) return

    if (event?.shiftKey) {
      setMergeSelection((current) => {
        if (current.includes(tableState.table.id)) {
          return current.filter((id) => id !== tableState.table.id)
        }

        const next = [...current, tableState.table.id]
        if (next.length === 2) {
          setMergedGroups((groups) => ([
            ...groups,
            { id: `merge-${next.join('-')}`, tableIds: next },
          ]))
          return []
        }

        return next
      })
      return
    }

    const clickRoute = resolveHostFloorTableClickRoute({
      isHeatmap,
      isCompact,
      isHostFloorPickActive,
      isHostMultiTableSelectMode,
      selectedReservation,
      seatingDraftUnitIds,
      tableId: tableState.table.id,
      canAssign: canAssignSelectedReservationToTable(tableState),
    })

    if (clickRoute === 'edit-layout') {
      if (tableState.status === 'available' || tableState.status === 'cleaning') {
        toggleHostEditUnit(tableState.table.id)
      }
      return
    }

    if (clickRoute === 'multi-table-toggle') {
      if (!canToggleTableInHostMultiTableSelection({
        tableId: tableState.table.id,
        selectedUnitIds: seatingDraftUnitIds,
        canAssign: canAssignSelectedReservationToTable(tableState),
      })) {
        return
      }
      toggleSeatingUnit(tableState.table.id)
      return
    }

    if (clickRoute === 'assignment') {
      toggleSeatingUnit(tableState.table.id)
      return
    }

    if (
      clickRoute === 'normal-day-view'
      && isCompact
      && shouldOpenTableDayViewOnTableClick({
        isHeatmap,
        isHostFloorPickActive,
        isAssignmentSelection: false,
      })
    ) {
      event?.stopPropagation?.()
      setTooltipDismissVersion((current) => current + 1)
      if (hostCompactAssignmentSelection && !isHostMultiTableSelectMode) {
        startSeatingDraft(selectedReservation, tableState.table.id)
        const autoSeatingId = resolveReservationSeatingId(
          selectedReservation,
          effectiveSeatings,
          todayKey,
        )
        setScheduleCardAssignmentSeatingId(autoSeatingId)
        openScheduleCardTable(tableState.table, 'table-tap-assignment', { assignmentMode: true })
      } else {
        openScheduleCardTable(tableState.table, 'table-tap')
      }
      if (isHostFloorDebugEnabled()) {
        patchHostFloorDebugTrace({
          callbackFired: true,
          dayViewState: 'open',
          lastEvent: 'handleTableClick-setScheduleCardTable',
        })
      }
      return
    }

    if (tableState.reservation) {
      openHostEdit(tableState.reservation)
    }
  }

  const handleTableContextMenu = (event, tableState) => {
    event.preventDefault()
    setContextMenu({
      tableId: tableState.table.id,
      x: event.clientX,
      y: event.clientY,
    })
  }

  const handleSplitPlaceholder = () => {
    if (!mergedGroupForMenu) return
    setMergedGroups((groups) => groups.filter((group) => group.id !== mergedGroupForMenu.id))
    setContextMenu(null)
  }

  const handleAnalyticsToggle = (tableId) => {
    setAnalyticsTableId((current) => (current === tableId ? null : tableId))
  }

  const handleCanvasClick = () => {
    if (shouldIgnoreCanvasDismissForScheduleCard({
      suppressTableClick: suppressTableClickRef.current,
      hasScheduleCardTable: Boolean(scheduleCardTableIdRef.current),
    })) {
      return
    }
    dismissFloorTooltips()
    if (isHeatmap) {
      setAnalyticsTableId(null)
    }
  }

  visibleTableStatesRef.current = visibleTableStates

  const suppressTableClickRef = useRef(false)
  const suppressTableClickTimerRef = useRef(null)
  const lastViewportActivationRef = useRef({ tableId: '', at: 0 })
  const handleTableClickRef = useRef(() => {})
  handleTableClickRef.current = handleTableClick

  const markTableTapSuppressClick = useCallback(() => {
    suppressTableClickRef.current = true
    if (suppressTableClickTimerRef.current) {
      window.clearTimeout(suppressTableClickTimerRef.current)
    }
    suppressTableClickTimerRef.current = window.setTimeout(() => {
      suppressTableClickRef.current = false
      suppressTableClickTimerRef.current = null
    }, 450)
  }, [])

  const handleHostTableDirectTap = useCallback((tableState, event) => {
    markTableTapSuppressClick()
    event?.preventDefault?.()
    event?.stopPropagation?.()
    handleTableClickRef.current(tableState, event)
  }, [markTableTapSuppressClick])

  const activateTableFromViewport = useCallback((tableState, event, debugMeta = {}) => {
    if (!tableState) {
      if (isHostFloorDebugEnabled()) {
        patchHostFloorDebugTrace({
          resolved: false,
          callbackFired: false,
          lastEvent: 'activate-no-table-state',
          ...debugMeta,
        })
      }
      return
    }

    const tableId = String(tableState.table.id)
    const now = Date.now()
    if (
      lastViewportActivationRef.current.tableId === tableId
      && now - lastViewportActivationRef.current.at < 500
    ) {
      return
    }
    lastViewportActivationRef.current = { tableId, at: now }

    if (isHostFloorDebugEnabled()) {
      patchHostFloorDebugTrace({
        resolved: true,
        lastEvent: `activate-${tableState.table?.label ?? tableState.table?.id}`,
        ...debugMeta,
      })
    }

    markTableTapSuppressClick()
    event?.preventDefault?.()
    event?.stopPropagation?.()
    handleTableClickRef.current(tableState, event)

    if (isHostFloorDebugEnabled()) {
      patchHostFloorDebugTrace({
        callbackFired: true,
        lastEvent: 'callback-invoked',
      })
    }
  }, [markTableTapSuppressClick])

  const handleViewportPointerDown = useCallback((event) => {
    if (!isCompact || isHeatmap) return
    if (event.pointerType === 'mouse' && event.button !== 0) return

    const tableTarget = findHostFloorTableFromEvent(event)
    const pan = floorPanStateRef.current
    const nextState = beginHostFloorPointerInteraction(event, {
      originX: pan.x,
      originY: pan.y,
      interactionLocked: floorInteractionLocked,
    })
    floorPointerRef.current = nextState

    if (isHostFloorDebugEnabled()) {
      patchHostFloorDebugTrace({
        down: true,
        up: false,
        targetElement: describeHostFloorDebugTarget(event.target),
        tableNodeFound: tableTarget?.tableLabel || tableTarget?.node?.dataset?.floorTableLabel || 'no',
        tableId: tableTarget?.tableId || nextState.tableId || '—',
        mode: nextState.mode,
        distance: '—',
        isTap: false,
        resolved: false,
        callbackFired: false,
        lastEvent: 'pointerdown',
      })
    }

    if (shouldCaptureHostFloorPointer(nextState)) {
      event.currentTarget.setPointerCapture?.(event.pointerId)
    }
  }, [floorInteractionLocked, isCompact, isHeatmap])

  const handleViewportPointerMove = useCallback((event) => {
    if (!isCompact || isHeatmap) return

    const previousState = floorPointerRef.current
    const nextState = advanceHostFloorPointerInteraction(previousState, event)
    floorPointerRef.current = nextState

    if (
      !floorInteractionLocked
      && previousState.mode === HOST_FLOOR_POINTER_MODE.PAN_PENDING
      && nextState.mode === HOST_FLOOR_POINTER_MODE.PANNING
    ) {
      dismissFloorTooltips()
      viewportRef.current?.classList.add('is-panning')
      isManualFloorZoomRef.current = true
    }

    const panOffset = floorInteractionLocked ? null : getHostFloorPanOffset(nextState, event)
    if (panOffset) {
      event.preventDefault()
      setFloorPan(panOffset)
    }
  }, [dismissFloorTooltips, floorInteractionLocked, isCompact, isHeatmap])

  const handleViewportPointerUp = useCallback((event) => {
    if (!isCompact || isHeatmap) return

    const previousState = floorPointerRef.current
    const { nextState, tableTap, distance, isTap } = completeHostFloorPointerInteraction(previousState, event)
    floorPointerRef.current = nextState

    if (isHostFloorDebugEnabled()) {
      patchHostFloorDebugTrace({
        up: true,
        distance: `${Math.round(distance)}px`,
        isTap,
        mode: previousState.mode,
        tableId: tableTap?.tableId || previousState.tableId || '—',
        lastEvent: 'pointerup',
      })
    }

    if (shouldCaptureHostFloorPointer(previousState)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId)
    }
    resetFloorPointerState()

    if (!tableTap?.tableId) return

    if (shouldSkipViewportTableTap(hostTableTapRegistryRef.current, tableTap)) {
      return
    }

    const tableState = resolveHostFloorTableState(
      visibleTableStatesRef.current,
      tableTap.tableId,
    )
    activateTableFromViewport(tableState, event, {
      resolved: Boolean(tableState),
      callbackFired: false,
    })
  }, [activateTableFromViewport, isCompact, isHeatmap, resetFloorPointerState])

  const handleViewportTouchStart = useCallback((event) => {
    if (!isCompact || isHeatmap) return
    if (event.touches.length !== 1) return

    const touch = event.touches[0]
    const pointerLike = toHostFloorPointerLikeEvent(event, touch)
    const pan = floorPanStateRef.current
    const nextState = beginHostFloorPointerInteraction(pointerLike, {
      originX: pan.x,
      originY: pan.y,
      interactionLocked: floorInteractionLocked,
    })
    floorPointerRef.current = nextState

    if (isHostFloorDebugEnabled()) {
      const tableTarget = findHostFloorTableFromEvent(pointerLike)
      patchHostFloorDebugTrace({
        down: true,
        up: false,
        targetElement: describeHostFloorDebugTarget(event.target),
        tableNodeFound: tableTarget?.tableLabel || 'no',
        tableId: tableTarget?.tableId || nextState.tableId || '—',
        mode: nextState.mode,
        lastEvent: 'touchstart',
      })
    }
  }, [floorInteractionLocked, isCompact, isHeatmap])

  const handleViewportTouchEnd = useCallback((event) => {
    if (!isCompact || isHeatmap) return

    const touch = event.changedTouches[0]
    if (!touch) return

    const pointerLike = toHostFloorPointerLikeEvent(event, touch)
    const previousState = floorPointerRef.current
    const { nextState, tableTap, distance, isTap } = completeHostFloorPointerInteraction(previousState, pointerLike)
    floorPointerRef.current = nextState
    resetFloorPointerState()

    if (isHostFloorDebugEnabled()) {
      patchHostFloorDebugTrace({
        up: true,
        distance: `${Math.round(distance)}px`,
        isTap,
        mode: previousState.mode,
        tableId: tableTap?.tableId || previousState.tableId || '—',
        lastEvent: 'touchend',
      })
    }

    if (!tableTap?.tableId) return

    if (shouldSkipViewportTableTap(hostTableTapRegistryRef.current, tableTap)) {
      return
    }

    const tableState = resolveHostFloorTableState(
      visibleTableStatesRef.current,
      tableTap.tableId,
    )
    activateTableFromViewport(tableState, pointerLike, {
      resolved: Boolean(tableState),
      callbackFired: false,
    })
  }, [activateTableFromViewport, isCompact, isHeatmap, resetFloorPointerState])

  const handleViewportPointerCancel = useCallback((event) => {
    if (!isCompact || isHeatmap) return
    if (floorPointerRef.current.pointerId !== event.pointerId) return

    if (shouldCaptureHostFloorPointer(floorPointerRef.current)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId)
    }
    resetFloorPointerState()
  }, [isCompact, isHeatmap, resetFloorPointerState])

  const handleConfirmSeating = async (assignment) => {
    if (!selectedReservation || !onAssignReservationTables) return
    await onAssignReservationTables(selectedReservation, assignment)
    clearSelection()
  }

  const handleScheduleCardConfirmAssignment = useCallback(async () => {
    if (
      !selectedReservation
      || !onAssignReservationTables
      || !scheduleCardAssignmentSeatingId
      || seatingDraftUnitIds.length === 0
    ) {
      return
    }

    const selectedRow = scheduleCardRows.find(
      (row) => row.seating.id === scheduleCardAssignmentSeatingId,
    )
    if (!isTableDayViewRowAssignableForAssignment(selectedRow)) return

    const assignedUnits = seatingDraftUnitIds
      .map((unitId) => toSeatingUnitFromLayoutUnit(getHostUnitById(unitId, layout)))
      .filter(Boolean)

    if (!assignedUnits.length) return

    const assignment = buildSeatingAssignment({
      assignedUnits,
      extraChairs: seatingExtraChairs,
      standingGuests: seatingStandingGuests,
      partySize: selectedReservation.guests,
    })

    await onAssignReservationTables(selectedReservation, {
      ...assignment,
      seatingId: scheduleCardAssignmentSeatingId,
    })
    cancelHostMultiTableSelect()
    clearSelection()
    closeScheduleCardTable('assignment-confirmed')
  }, [
    cancelHostMultiTableSelect,
    clearSelection,
    closeScheduleCardTable,
    layout,
    onAssignReservationTables,
    scheduleCardAssignmentSeatingId,
    scheduleCardRows,
    seatingDraftUnitIds,
    seatingExtraChairs,
    seatingStandingGuests,
    selectedReservation,
  ])

  const handleScheduleCardSelectAssignmentSeating = useCallback((seatingId) => {
    setScheduleCardAssignmentSeatingId(seatingId ? String(seatingId) : null)
  }, [])

  const handleScheduleCardCancelAssignment = useCallback(() => {
    clearSelection()
    closeScheduleCardTable('assignment-cancelled')
  }, [clearSelection, closeScheduleCardTable])

  const scheduleCardAssignmentContext = useMemo(() => {
    if (!scheduleCardAssignmentMode || !hostCompactAssignmentSelection || !selectedReservation) {
      return null
    }

    if (!resolvedScheduleCardTable) return null

    const selectedRow = scheduleCardAssignmentSeatingId
      ? scheduleCardRows.find((row) => row.seating.id === scheduleCardAssignmentSeatingId)
      : null
    const canAssignSelectedSeating = isTableDayViewRowAssignableForAssignment(selectedRow)

    const draftAssignment = buildSeatingAssignment({
      assignedUnits: seatingDraftUnitIds
        .map((unitId) => toSeatingUnitFromLayoutUnit(getHostUnitById(unitId, layout)))
        .filter(Boolean),
      extraChairs: seatingExtraChairs,
      standingGuests: seatingStandingGuests,
      partySize: selectedReservation.guests,
    })

    const tableDialogLabel = getFloorTableDialogLabel(resolvedScheduleCardTable)

    return {
      reservation: selectedReservation,
      seatingId: scheduleCardAssignmentSeatingId,
      tableLabel: formatHostListUnitLabel(tableDialogLabel.replace(/^TABLE\s*/i, 'T')),
      draftTableLabels: formatSeatingAssignmentDrawerLabels(draftAssignment),
      canAssign: canAssignSelectedSeating,
      onConfirmAssignment: handleScheduleCardConfirmAssignment,
      onCancelAssignment: handleScheduleCardCancelAssignment,
      onSelectSeating: handleScheduleCardSelectAssignmentSeating,
    }
  }, [
    handleScheduleCardCancelAssignment,
    handleScheduleCardConfirmAssignment,
    handleScheduleCardSelectAssignmentSeating,
    hostCompactAssignmentSelection,
    layout,
    resolvedScheduleCardTable,
    scheduleCardAssignmentMode,
    scheduleCardAssignmentSeatingId,
    scheduleCardRows,
    seatingDraftUnitIds,
    seatingExtraChairs,
    seatingStandingGuests,
    selectedReservation,
  ])

  const useTableInspectorDrawer = useHostTableInspectorDrawer()

  const tableInspectorProps = useMemo(() => {
    if (!isCompact || !useTableInspectorDrawer || !scheduleCardTableId || !resolvedScheduleCardTable || isHeatmap) {
      return null
    }

    return {
      isOpen: true,
      table: resolvedScheduleCardTable,
      tableLabel: getFloorTableDialogLabel(resolvedScheduleCardTable),
      areaLabel: formatFloorTableAreaLabel(layout, resolvedScheduleCardTable),
      dateLabel: scheduleCardDateLabel,
      rows: scheduleCardRows,
      assignmentContext: scheduleCardAssignmentContext,
      onOpenReservation: handleScheduleCardEdit,
      onEditReservation: handleScheduleCardEditReservation,
      onNewReservation: handleScheduleCardNewReservation,
      onQuickStatusUpdate: handleScheduleCardQuickStatus,
      onReleaseTable: handleScheduleCardReleaseTable,
      onClose: () => closeScheduleCardTable('dialog-close'),
      isSaving,
      canManageAssignment,
      nowMinutes,
      todayKey,
      floorLayout: layout,
      reservationSeatings: effectiveSeatings,
    }
  }, [
    canManageAssignment,
    closeScheduleCardTable,
    effectiveSeatings,
    handleScheduleCardEdit,
    handleScheduleCardEditReservation,
    handleScheduleCardNewReservation,
    handleScheduleCardQuickStatus,
    handleScheduleCardReleaseTable,
    isCompact,
    isHeatmap,
    isSaving,
    layout,
    nowMinutes,
    resolvedScheduleCardTable,
    scheduleCardAssignmentContext,
    scheduleCardDateLabel,
    scheduleCardRows,
    scheduleCardTableId,
    todayKey,
    useTableInspectorDrawer,
  ])

  useEffect(() => {
    onTableInspectorChange?.(tableInspectorProps)
    return () => onTableInspectorChange?.(null)
  }, [onTableInspectorChange, tableInspectorProps])

  const handleMultiTableContinue = useCallback(() => {
    if (!selectedReservation || seatingDraftUnitIds.length === 0) return

    const primaryTableId = seatingDraftUnitIds[0]
    const tableState = visibleTableStatesRef.current.find(
      (entry) => String(entry.table.id) === String(primaryTableId),
    )
    if (!tableState) return

    const autoSeatingId = resolveReservationSeatingId(
      selectedReservation,
      effectiveSeatings,
      todayKey,
    )
    setScheduleCardAssignmentSeatingId(autoSeatingId)
    openScheduleCardTable(tableState.table, 'multi-table-continue', { assignmentMode: true })
  }, [
    effectiveSeatings,
    openScheduleCardTable,
    selectedReservation,
    seatingDraftUnitIds,
    todayKey,
  ])

  const isSeatPicking = Boolean(
    (isHostMultiTableSelectMode && hostCompactAssignmentSelection && !isHeatmap)
    || isHostFloorPickActive,
  )

  const activeSeatings = useMemo(
    () => getActiveSeatingsForDate(effectiveSeatings, todayKey),
    [effectiveSeatings, todayKey],
  )

  const seatingSummaries = useMemo(() => {
    const summaries = {}
    const operationalMetricsBySeating = buildHostQueueSeatingChipMetricsMap(
      listReservations ?? reservations,
      {
        seatings: activeSeatings,
        dateKey: todayKey,
        areaFilterId: hostQueueAreaFilterId,
        layout,
      },
    )

    activeSeatings.forEach((seating) => {
      summaries[seating.id] = {
        tableAvailability: buildHostSeatingTableAvailability(assignmentReservations, {
          seating,
          dateKey: todayKey,
          layout,
          areaFilterId: hostQueueAreaFilterId,
          seatingsById,
        }),
        operationalMetrics: operationalMetricsBySeating[seating.id] ?? null,
      }
    })
    return summaries
  }, [
    activeSeatings,
    assignmentReservations,
    hostQueueAreaFilterId,
    layout,
    listReservations,
    reservations,
    seatingsById,
    todayKey,
  ])

  if (!hasDisplayableLayout) {
    if (isRefreshingPublishedLayout) {
      return (
        <div className={`floor-plan-workspace${isCompact ? ' is-compact' : ''} floor-plan-refreshing-state`} role="status">
          <p>Updating published layout…</p>
        </div>
      )
    }

    return (
      <div className={`floor-plan-workspace${isCompact ? ' is-compact' : ''} floor-plan-empty-state`}>
        {loadError ? (
          <div className="floor-plan-persistence-notice" role="status">{loadError}</div>
        ) : null}
        {saveError ? (
          <div className="floor-plan-persistence-notice" role="status">{saveError}</div>
        ) : null}
        <div className="floor-plan-empty">
          <p className="eyebrow">Floor plan</p>
          <h3>No published layout</h3>
          {canEditFloorPlan ? (
            <>
              <p>Open Reservations, click Edit layout, arrange your tables, then publish.</p>
              <button type="button" className="floor-plan-empty-action" onClick={() => { closeHostEdit(); setFloorPlanMode('edit') }}>
                Edit layout
              </button>
            </>
          ) : (
            <p>Ask a manager to publish the floor plan before seating guests.</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`floor-plan-workspace${isCompact ? ' is-compact is-host-floor' : ''}${selectedSeating ? ' has-active-seating' : ''}${isHostMultiTableSelectMode ? ' has-multi-table-mode' : ''}${showHostSeatingBar && isCompact ? ' has-seating-drawer' : ''}${isHeatmap ? ' is-heatmap-mode' : ' is-normal-mode'}`} data-floor-view-mode={viewMode}>
      {loadError ? (
        <div className="floor-plan-persistence-notice" role="status">{loadError}</div>
      ) : null}
      {saveError ? (
        <div className="floor-plan-persistence-notice" role="status">{saveError}</div>
      ) : null}
      <div className="floor-plan-host-shell">
        <div className="floor-plan-host-main">
      <div className="floor-plan-toolbar">
        <div>
          {!isCompact ? <p className="eyebrow">Service layout</p> : null}
          {isCompact ? (
            <FloorPlanAreaSwitcher
              zones={floorPlanSnapshot.layout.zones}
              activeZoneId={resolvedFloorAreaId}
              onChange={setActiveFloorAreaId}
            />
          ) : (
            <h3>{floorPlanSnapshot.layout.name}</h3>
          )}
        </div>
        <div className="floor-plan-toolbar-actions">
          {!isCompact && !isHeatmap ? <FloorPlanLiveStats stats={floorPlanSnapshot.stats} /> : null}
          {!isCompact ? <FloorPlanViewModeToggle value={viewMode} onChange={setViewMode} /> : null}
          {isCompact && !isHeatmap ? (
            <div className="floor-plan-toolbar-actions-group">
              {canEditFloorPlan ? (
                <button
                  type="button"
                  className="floor-plan-mode-btn"
                  onClick={() => { closeHostEdit(); setFloorPlanMode('edit') }}
                >
                  Edit layout
                </button>
              ) : null}
              <button
                type="button"
                className={`floor-plan-dining-timers-btn${showDiningTimers ? ' is-active' : ''}`}
                onClick={() => setShowDiningTimers((current) => !current)}
                aria-pressed={showDiningTimers}
                aria-label="Dining timers"
                data-testid="host-floor-dining-timers-toggle"
              >
                ⏱ Timers
              </button>
              <div className="floor-plan-zoom-controls" aria-label="Floor plan zoom">
              <div className="floor-plan-zoom-controls-group">
                <button type="button" className="floor-plan-zoom-btn" onClick={handleFloorZoomOut} aria-label="Zoom out">−</button>
                <button type="button" className="floor-plan-zoom-btn floor-plan-zoom-fit" onClick={handleFloorZoomFit} aria-label="Fit to view">
                  Fit
                </button>
                <button type="button" className="floor-plan-zoom-btn" onClick={handleFloorZoomIn} aria-label="Zoom in">+</button>
              </div>
              <button
                type="button"
                className={`floor-plan-zoom-btn floor-plan-zoom-lock${floorInteractionLocked ? ' is-active' : ''}`}
                onClick={() => setFloorInteractionLocked((current) => !current)}
                aria-pressed={floorInteractionLocked}
                aria-label={floorInteractionLocked ? 'Unlock floor plan pan' : 'Lock floor plan pan'}
                data-testid="host-floor-interaction-lock"
              >
                {floorInteractionLocked ? '🔒' : '🔓'}
              </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {!isCompact ? (
        <FloorPlanAreaSwitcher
          zones={floorPlanSnapshot.layout.zones}
          activeZoneId={resolvedFloorAreaId}
          onChange={setActiveFloorAreaId}
        />
      ) : null}

      {isHeatmap ? (
        <FloorHeatmapPeriodFilter
          periodId={heatmapPeriodId}
          customStart={heatmapCustomStart}
          customEnd={heatmapCustomEnd}
          onPeriodChange={setHeatmapPeriodId}
          onCustomStartChange={setHeatmapCustomStart}
          onCustomEndChange={setHeatmapCustomEnd}
        />
      ) : null}

      {!isCompact && !isHeatmap ? (
        <FloorPlanLegend items={DESKTOP_FLOOR_PLAN_LEGEND_ITEMS} />
      ) : null}
      {isHeatmap ? <FloorHeatmapLegend /> : null}

      {isCompact && !isHeatmap && activeSeatings.length > 0 ? (
        <FloorSeatingSelector
          seatings={activeSeatings}
          dateKey={todayKey}
          selectedSeatingId={selectedSeating?.id ?? null}
          onSelect={onSelectedSeatingChange}
          summaries={seatingSummaries}
          legendItems={HOST_FLOOR_PLAN_LEGEND_ITEMS}
        />
      ) : null}

      {mergeSelection.length > 0 && !isHeatmap ? (
        <p className="floor-plan-merge-hint">
          Shift + click another table to merge · {mergeSelection.length}/2 selected
        </p>
      ) : null}

      {showHostMultiTableEntry ? (
        <div className="host-multi-table-entry">
          <button
            type="button"
            className="host-multi-table-entry-btn"
            onClick={startHostMultiTableSelect}
            data-testid="host-multi-table-entry"
          >
            Select multiple tables
          </button>
        </div>
      ) : null}

      <div
        className={`floor-plan-viewport${isCompact ? ' is-host-viewport' : ''}${isCompact && floorInteractionLocked ? ' is-floor-interaction-locked' : ''}${floorZoom > 1.01 || Math.abs(floorPan.x) > 1 || Math.abs(floorPan.y) > 1 ? ' is-zoomed' : ''}`}
        ref={isCompact ? viewportRef : undefined}
        onPointerDown={isCompact ? handleViewportPointerDown : undefined}
        onPointerMove={isCompact ? handleViewportPointerMove : undefined}
        onPointerUp={isCompact ? handleViewportPointerUp : undefined}
        onPointerCancel={isCompact ? handleViewportPointerCancel : undefined}
        onTouchStart={isCompact ? handleViewportTouchStart : undefined}
        onTouchEnd={isCompact ? handleViewportTouchEnd : undefined}
      >
        {isCompact && isHostFloorDebugEnabled() ? <HostFloorDebugOverlay /> : null}
        {isCompact ? (
          <div className="floor-plan-canvas-area-title" aria-label={`Area: ${activeZone?.label ?? 'Floor'}`}>
            {activeZone?.label}
          </div>
        ) : null}
        <div
          className="floor-plan-canvas-stage"
          data-floor-zoom-tier={isCompact ? hostFloorZoomTier : undefined}
          style={isCompact ? {
            transform: `translate(${floorPan.x}px, ${floorPan.y}px) scale(${floorZoom})`,
            '--floor-zoom': floorZoom,
          } : undefined}
        >
          <div
            className="floor-plan-canvas"
            ref={floorCanvasRef}
            data-floor-plan-layout={floorPlanSnapshot.layout.id}
            data-floor-area-id={resolvedFloorAreaId}
            data-view-mode={viewMode}
            data-seat-mode={isHostMultiTableSelectMode && selectedReservation && !isHeatmap && isCompact ? 'true' : 'false'}
            data-multi-table-mode={isHostMultiTableSelectMode ? 'true' : 'false'}
            onClick={handleCanvasClick}
            onDragOver={(event) => {
              if (isReservationDragActive(event)) {
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
              }
            }}
          >
            <div
              className={`floor-plan-layout-space${isCompact ? ' is-published-layout' : ''}`}
              style={isCompact && activeZone ? getFloorLayoutSpaceStyle(activeZone) : undefined}
            >
        {!isHeatmap && activeZone ? (
          <div className={`floor-plan-zone zone-${activeZone.id} is-active-area`} aria-hidden="true">
          </div>
        ) : null}

        {mergedGroups.map((group) => (
          <div key={group.id} className="floor-plan-merge-bridge" aria-hidden="true" data-merge-id={group.id} />
        ))}

        {!isHeatmap ? (
          <FloorPlanReservationLinks linkGroups={reservationLinkGroups} />
        ) : null}

        {visibleTableStates.map((tableState) => (
          <FloorTableNode
            key={tableState.table.id}
            tableState={{
              ...tableState,
              meta: {
                ...tableState.meta,
                heatMap: heatmapMetricsByTableId[tableState.table.id] ?? null,
              },
            }}
            allReservations={assignmentReservations}
            floorUnits={floorPlanSnapshot.layout.tables ?? []}
            syncWithList={isCompact}
            todayKey={todayKey}
            nowMinutes={nowMinutes}
            viewMode={viewMode}
            heatmapMetrics={heatmapMetricsByTableId[tableState.table.id]}
            isAnalyticsOpen={analyticsTableId === tableState.table.id}
            onAnalyticsToggle={handleAnalyticsToggle}
            isStatusPulsing={!isHeatmap && statusPulseTableIds.has(tableState.table.id)}
            tooltipDismissVersion={tooltipDismissVersion}
            nodeRef={floorTableRefs?.current
              ? (node) => { floorTableRefs.current[tableState.table.id] = node }
              : undefined}
            isMergeSelected={mergeSelection.includes(tableState.table.id)
              || mergedGroups.some((group) => group.tableIds.includes(tableState.table.id))}
            isSeatPicking={isSeatPicking}
            isHostFloor={isCompact}
            activateTableViaViewport={isCompact}
            hostTableTapRegistry={isCompact ? hostTableTapRegistryRef : null}
            onHostTableDirectTap={isCompact ? handleHostTableDirectTap : undefined}
            linkMeta={reservationLinkTableMeta.get(tableState.table.id)}
            isDropTarget={dropTargetTableId === tableState.table.id}
            isDragging={draggingReservationId && tableState.reservation
              ? String(tableState.reservation.id) === draggingReservationId
              : false}
            onTableClick={handleTableClick}
            onTableContextMenu={handleTableContextMenu}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            showDiningTimers={showDiningTimers}
            diningTimerNowMinutes={diningTimerNowMinutes}
            diningTimerLabelPlacement={diningTimerExternalLabelPlacements.get(tableState.table.id) ?? null}
          />
        ))}
            </div>
          </div>
        </div>
      </div>
        </div>

        {isHostMultiTableSelectMode && hostCompactAssignmentSelection && !isHeatmap ? (
          <HostMultiTableSelectionBar
            selectedUnitIds={seatingDraftUnitIds}
            reservation={selectedReservation}
            layout={layout}
            onCancel={cancelHostMultiTableSelect}
            onContinue={handleMultiTableContinue}
          />
        ) : null}

        {showHostSeatingBar ? (
          <aside className="host-seating-drawer" aria-label="Assign seating">
            <SeatingConfirmPanel
              variant="host-drawer"
              reservation={selectedReservation}
              seating={selectedSeating}
              selectedUnitIds={seatingDraftUnitIds}
              extraChairs={seatingExtraChairs}
              standingGuests={seatingStandingGuests}
              onExtraChairsChange={setSeatingExtraChairs}
              onStandingGuestsChange={setSeatingStandingGuests}
              onConfirm={handleConfirmSeating}
              onCancel={() => {
                clearSeatingDraft()
                clearSelection()
              }}
              isSaving={isSaving}
            />
          </aside>
        ) : null}
      </div>

      {!isCompact ? (
        <p className="floor-plan-footnote">
          {isHeatmap
            ? `${heatmapPeriodRange.label} utilization · Darker gold indicates higher table turnover`
            : 'Drag reservations between tables to reassign · Shift + click to merge · Right-click to split'}
          {isSaving ? ' · Saving…' : ''}
        </p>
      ) : null}

      <FloorTableContextMenu
        menu={contextMenu}
        mergedGroup={mergedGroupForMenu}
        onClose={() => setContextMenu(null)}
        onSplitPlaceholder={handleSplitPlaceholder}
      />

      {isCompact && scheduleCardTableId && resolvedScheduleCardTable && !isHeatmap && !useTableInspectorDrawer ? (
        <FloorTableSeatingDialog
          table={resolvedScheduleCardTable}
          tableLabel={getFloorTableDialogLabel(resolvedScheduleCardTable)}
          areaLabel={formatFloorTableAreaLabel(layout, resolvedScheduleCardTable)}
          dateLabel={scheduleCardDateLabel}
          rows={scheduleCardRows}
          assignmentContext={scheduleCardAssignmentContext}
          onOpenReservation={handleScheduleCardEdit}
          onEditReservation={handleScheduleCardEditReservation}
          onNewReservation={handleScheduleCardNewReservation}
          onQuickStatusUpdate={handleScheduleCardQuickStatus}
          onReleaseTable={handleScheduleCardReleaseTable}
          onClose={() => closeScheduleCardTable('dialog-close')}
          isSaving={isSaving}
          canManageAssignment={canManageAssignment}
          nowMinutes={nowMinutes}
          todayKey={todayKey}
          floorLayout={layout}
          reservationSeatings={effectiveSeatings}
        />
      ) : null}
    </div>
  )
}

function MobileReservationsHostShell({
  reservations,
  workspaceTimeZone,
  todayKey,
  nowMinutes,
  isLoading,
  isSaving,
  noticeMessage,
  onQuickStatusUpdate,
  onHostEditSave,
  onHostEditDelete,
  onReservationNotice,
  onCreateReservation,
  onExitHostMode,
  onAssignReservationTables,
  canEditFloorPlan = false,
  canManageAssignment = true,
  reservationSeatings = [],
  hostSettingsProps = null,
  workspaceId = '',
  useControlledReloadReturn = false,
}) {
  const workspaceTodayKey = todayKey
  const workspaceTodayRef = useRef(workspaceTodayKey)
  const [selectedDateKey, setSelectedDateKey] = useState(workspaceTodayKey)

  useEffect(() => {
    const previousToday = workspaceTodayRef.current
    if (previousToday !== workspaceTodayKey) {
      setSelectedDateKey((current) => (
        current === previousToday ? workspaceTodayKey : current
      ))
      workspaceTodayRef.current = workspaceTodayKey
    }
  }, [workspaceTodayKey])

  const handleSelectDate = useCallback((dateKey) => {
    setSelectedDateKey(normalizeReservationDateKey(dateKey))
  }, [])

  const workspaceReservations = useMemo(
    () => getHostWorkspaceReservations(reservations, selectedDateKey, workspaceTimeZone),
    [reservations, selectedDateKey, workspaceTimeZone],
  )

  return (
    <ReservationWorkspaceProvider
      filteredTodayReservations={workspaceReservations}
      onHostEditSave={onHostEditSave}
      onHostEditDelete={onHostEditDelete}
      onReservationNotice={onReservationNotice}
      isSavingHostEdit={isSaving}
      reservationSeatings={reservationSeatings}
    >
      <MobileReservationsHostShellBody
        reservations={reservations}
        workspaceReservations={workspaceReservations}
        workspaceTimeZone={workspaceTimeZone}
        todayKey={selectedDateKey}
        workspaceTodayKey={workspaceTodayKey}
        onSelectDate={handleSelectDate}
        nowMinutes={nowMinutes}
        isLoading={isLoading}
        isSaving={isSaving}
        noticeMessage={noticeMessage}
        onQuickStatusUpdate={onQuickStatusUpdate}
        onHostEditSave={onHostEditSave}
        onHostEditDelete={onHostEditDelete}
        onReservationNotice={onReservationNotice}
        onCreateReservation={onCreateReservation}
        onExitHostMode={onExitHostMode}
        onAssignReservationTables={onAssignReservationTables}
        canEditFloorPlan={canEditFloorPlan}
        canManageAssignment={canManageAssignment}
        reservationSeatings={reservationSeatings}
        hostSettingsProps={hostSettingsProps}
        workspaceId={workspaceId}
        useControlledReloadReturn={useControlledReloadReturn}
      />
    </ReservationWorkspaceProvider>
  )
}

function MobileReservationsHostShellBody({
  reservations,
  workspaceReservations,
  workspaceTimeZone,
  todayKey,
  workspaceTodayKey = '',
  onSelectDate = null,
  nowMinutes,
  isLoading,
  isSaving,
  noticeMessage,
  onQuickStatusUpdate,
  onHostEditSave,
  onHostEditDelete,
  onReservationNotice,
  onCreateReservation,
  onExitHostMode,
  onAssignReservationTables,
  canEditFloorPlan = false,
  canManageAssignment = true,
  reservationSeatings = [],
  hostSettingsProps = null,
  workspaceId = '',
  useControlledReloadReturn = false,
}) {
  const {
    selectedReservation,
    selectReservation,
    clearSelection,
    clearSeatingDraft,
    cancelHostMultiTableSelect,
    floorPlanMode,
    setFloorPlanMode,
    activeFloorAreaId,
    setActiveFloorAreaId,
  } = useReservationWorkspace()
  const {
    hasLayout,
    hasDisplayableLayout,
    layout,
    publishNotice,
    clearPublishNotice,
    isRefreshingPublishedLayout,
    isLoading: isPublishedLayoutLoading,
    loadError: publishedLayoutLoadError,
    reload,
  } = usePublishedFloorPlan()

  const { isBootRestoring, bootRestoreFailed } = useHostReturnAfterPublishBoot({
    enabled: useControlledReloadReturn,
    workspaceId,
    hasDisplayableLayout,
    isLoading: isPublishedLayoutLoading,
    loadError: publishedLayoutLoadError,
    setActiveFloorAreaId,
    setFloorPlanMode,
  })

  useEffect(() => {
    if (!publishNotice) return
    onReservationNotice?.(publishNotice)
    clearPublishNotice()
  }, [clearPublishNotice, onReservationNotice, publishNotice])

  const [floorCreatePrefill, setFloorCreatePrefill] = useState(null)
  const [floorEditReservation, setFloorEditReservation] = useState(null)
  const [selectedServiceSeatingId, setSelectedServiceSeatingId] = useState('')
  const [tableInspectorProps, setTableInspectorProps] = useState(null)
  const previousDateKeyRef = useRef(todayKey)
  const hostSeatingInitializedRef = useRef(false)
  const hostSeatingManuallySelectedRef = useRef(false)

  const handleSelectedSeatingChange = useCallback((seatingId) => {
    hostSeatingManuallySelectedRef.current = true
    setSelectedServiceSeatingId(seatingId)
  }, [])

  useEffect(() => {
    if (previousDateKeyRef.current === todayKey) return
    previousDateKeyRef.current = todayKey
    clearSelection()
    clearSeatingDraft()
    cancelHostMultiTableSelect()
  }, [
    cancelHostMultiTableSelect,
    clearSelection,
    clearSeatingDraft,
    todayKey,
  ])

  useEffect(() => {
    const activeSeatings = getActiveSeatingsForDate(reservationSeatings, todayKey)
    if (!activeSeatings.length) {
      setSelectedServiceSeatingId('')
      return
    }

    const isViewingToday = normalizeReservationDateKey(todayKey) === normalizeReservationDateKey(workspaceTodayKey)

    if (!hostSeatingInitializedRef.current) {
      hostSeatingInitializedRef.current = true
      if (isViewingToday && !hostSeatingManuallySelectedRef.current) {
        const initialId = resolveHostStationInitialSeatingId(activeSeatings, nowMinutes)
        setSelectedServiceSeatingId(initialId ?? activeSeatings[0].id)
        return
      }
      setSelectedServiceSeatingId(activeSeatings[0].id)
      return
    }

    setSelectedServiceSeatingId((current) => (
      activeSeatings.some((entry) => entry.id === current) ? current : activeSeatings[0].id
    ))
  }, [reservationSeatings, todayKey, workspaceTodayKey, nowMinutes])

  useEffect(() => {
    if (!selectedReservation?.id) return
    if (!isReservationEligibleForHostTableAssignment(selectedReservation)) return

    const seatingId = resolveReservationSeatingId(selectedReservation, reservationSeatings, todayKey)
    if (seatingId) {
      setSelectedServiceSeatingId(seatingId)
    }
  }, [reservationSeatings, selectedReservation, todayKey])

  useEffect(() => {
    if (!selectedReservation) return
    const stillExists = reservations.some(
      (entry) => String(entry.id) === String(selectedReservation.id),
    )
    if (!stillExists) {
      clearSelection()
    }
  }, [clearSelection, reservations, selectedReservation])

  const handleHostSelectReservation = useCallback((reservation) => {
    if (!reservation) {
      clearSelection()
      clearSeatingDraft()
      cancelHostMultiTableSelect()
      return
    }

    if (reservationIdsMatch(selectedReservation, reservation)) {
      clearSelection()
      return
    }

    const isUnassigned = isReservationEligibleForHostTableAssignment(reservation)
    selectReservation(reservation, { scrollFloor: !isUnassigned })
  }, [
    cancelHostMultiTableSelect,
    clearSelection,
    clearSeatingDraft,
    selectReservation,
    selectedReservation,
  ])

  const handleClearAssignmentSelection = useCallback(() => {
    clearSelection()
    clearSeatingDraft()
    cancelHostMultiTableSelect()
  }, [cancelHostMultiTableSelect, clearSelection, clearSeatingDraft])

  const handleFloorOpenAddReservation = useCallback((prefill) => {
    setFloorCreatePrefill(prefill ?? null)
  }, [])

  const handleFloorOpenReservation = useCallback((reservation) => {
    setFloorEditReservation(reservation ?? null)
  }, [])

  const handleReturnToHost = useCallback(async (transition) => {
    const result = await completeReturnToHost({
      transition,
      hasDisplayableLayout,
      layout,
      activeFloorAreaId,
      reload,
      useControlledReload: useControlledReloadReturn,
      workspaceId,
    })

    if (!result?.ok) {
      return result
    }

    if (result.reload) {
      return result
    }

    setActiveFloorAreaId(result.activeFloorAreaId)
    return { ok: true }
  }, [
    activeFloorAreaId,
    hasDisplayableLayout,
    layout,
    reload,
    setActiveFloorAreaId,
    useControlledReloadReturn,
    workspaceId,
  ])

  if (floorPlanMode === 'edit' && canEditFloorPlan) {
    return (
      <div className="mobile-host-floor-plan-editor">
        <EmbeddedFloorPlanEditor
          onExit={() => setFloorPlanMode('view')}
          initialAreaId={activeFloorAreaId}
          onActiveAreaChange={setActiveFloorAreaId}
          onReturnToHost={handleReturnToHost}
        />
      </div>
    )
  }

  if (isBootRestoring) {
    return (
      <div className="mobile-host-floor-refreshing" role="status">
        <p>Loading published layout…</p>
      </div>
    )
  }

  if (bootRestoreFailed && !hasDisplayableLayout) {
    return (
      <div className="host-station-error-boundary" role="alert">
        <h3>Host Station could not load.</h3>
        <p>{publishedLayoutLoadError || 'Unable to load the published floor layout.'}</p>
        <div className="host-station-error-actions">
          <button type="button" className="host-station-error-retry" onClick={() => reload()}>
            Retry
          </button>
          {canEditFloorPlan ? (
            <button
              type="button"
              className="host-station-error-return-editor"
              onClick={() => setFloorPlanMode('edit')}
            >
              Open layout editor
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  if (isRefreshingPublishedLayout && !hasDisplayableLayout) {
    return (
      <div className="mobile-host-floor-refreshing" role="status">
        <p>Updating published layout…</p>
        <button type="button" className="mobile-host-floor-refresh-retry" onClick={() => reload()}>
          Retry
        </button>
      </div>
    )
  }

  const buildFloorPlanContent = (hostQueueAreaFilterId = HOST_QUEUE_ALL_AREAS) => (
    hasDisplayableLayout ? (
      <HostStationErrorBoundary
        onRetry={() => reload()}
        onReturnToEditor={() => setFloorPlanMode('edit')}
      >
        <FloorPlanView
          reservations={workspaceReservations}
          allReservations={reservations}
          listReservations={workspaceReservations}
          todayKey={todayKey}
          nowMinutes={nowMinutes}
          isSaving={isSaving}
          isCompact
          canEditFloorPlan={canEditFloorPlan}
          onAssignReservationTables={onAssignReservationTables}
          onQuickStatusUpdate={onQuickStatusUpdate}
          onOpenAddReservation={handleFloorOpenAddReservation}
          onOpenReservation={handleFloorOpenReservation}
          onEditReservation={handleFloorOpenReservation}
          onHostEditSave={onHostEditSave}
          onReservationNotice={onReservationNotice}
          canManageAssignment={canManageAssignment}
          seatings={reservationSeatings}
          selectedSeating={reservationSeatings.find((entry) => entry.id === selectedServiceSeatingId) ?? null}
          onSelectedSeatingChange={handleSelectedSeatingChange}
          hostQueueAreaFilterId={hostQueueAreaFilterId}
          onTableInspectorChange={setTableInspectorProps}
        />
      </HostStationErrorBoundary>
    ) : (
      <div className="mobile-host-floor-empty" role="status">
        <p>No published floor layout yet.</p>
        {canEditFloorPlan ? (
          <button type="button" className="mobile-host-layout-btn" onClick={() => setFloorPlanMode('edit')}>
            Edit layout
          </button>
        ) : null}
      </div>
    )
  )

  const rightPane = ({ onEditReservation, onOpenRowMenu, areaFilterId: hostQueueAreaFilterId }) => (
    <MobileReservationsHostRightPane
      hasLayout={hasDisplayableLayout}
      floorPlanContent={buildFloorPlanContent(hostQueueAreaFilterId ?? HOST_QUEUE_ALL_AREAS)}
      selectedReservation={selectedReservation}
      todayKey={todayKey}
      nowMinutes={nowMinutes}
      canEditFloorPlan={canEditFloorPlan}
      onEditReservation={onEditReservation}
      onOpenRowMenu={onOpenRowMenu}
      onCloseSelection={handleClearAssignmentSelection}
      onOpenFloorPlanLayout={() => setFloorPlanMode('edit')}
      floorLayout={layout}
      reservationSeatings={reservationSeatings}
      isAssignmentMode={isHostAssignmentModeActive({
        selectedReservation,
        floorPlanMode,
        isCompact: true,
      })}
      tableInspectorProps={tableInspectorProps}
    />
  )

  return (
    <MobileReservationsHostView
      reservations={reservations}
      workspaceTimeZone={workspaceTimeZone}
      todayKey={todayKey}
      workspaceTodayKey={workspaceTodayKey || todayKey}
      onSelectDate={onSelectDate}
      nowMinutes={nowMinutes}
      isLoading={isLoading}
      isSaving={isSaving}
      noticeMessage={noticeMessage}
      onQuickStatusUpdate={onQuickStatusUpdate}
      onHostEditSave={onHostEditSave}
      onHostEditDelete={onHostEditDelete}
      onReservationNotice={onReservationNotice}
      onCreateReservation={onCreateReservation}
      onExitHostMode={onExitHostMode}
      canEditFloorPlan={canEditFloorPlan}
      reservationSeatings={reservationSeatings}
      selectedServiceSeatingId={selectedServiceSeatingId}
      selectedSeating={reservationSeatings.find((entry) => entry.id === selectedServiceSeatingId) ?? null}
      hasLayout={hasDisplayableLayout}
      onOpenFloorPlanLayout={() => setFloorPlanMode('edit')}
      hostSettingsProps={hostSettingsProps}
      floorCreatePrefill={floorCreatePrefill}
      onFloorCreatePrefillConsumed={() => setFloorCreatePrefill(null)}
      floorEditReservation={floorEditReservation}
      onFloorEditReservationConsumed={() => setFloorEditReservation(null)}
      renderRightPane={rightPane}
      selectedReservationId={selectedReservation?.id ?? null}
      onSelectReservation={handleHostSelectReservation}
      onClearAssignmentSelection={handleClearAssignmentSelection}
    />
  )
}

const RESERVATION_WORKFLOW_STAGES = [
  { key: 'booked', status: 'Booked', label: 'Booked', analyticsKey: 'booked' },
  { key: 'confirmed', status: 'Confirmed', label: 'Confirmed', analyticsKey: 'confirmed' },
  { key: 'arrived', status: 'Arrived', label: 'Arrived', analyticsKey: 'arrived' },
  { key: 'seated', status: 'Seated', label: 'Seated', analyticsKey: 'seated' },
  { key: 'dining', status: 'Dining', label: 'Dining', analyticsKey: 'dining' },
  { key: 'completed', status: 'Completed', label: 'Completed', analyticsKey: 'completed' },
]

function isReservationWalkIn(reservation) {
  const phone = `${reservation?.phone ?? ''}`.trim()
  const notes = `${reservation?.notes ?? ''}`.toLowerCase()
  return !phone || notes.includes('walk-in') || notes.includes('walk in')
}

function buildReservationDashboardKpis(todayReservations) {
  let guests = 0
  let walkIns = 0

  todayReservations.forEach((reservation) => {
    const partySize = Number(reservation.guests)
    if (Number.isFinite(partySize) && partySize > 0) {
      guests += partySize
    }
    if (isReservationWalkIn(reservation)) {
      walkIns += 1
    }
  })

  const count = todayReservations.length
  const avgParty = count > 0 ? Math.round((guests / count) * 10) / 10 : 0

  return { count, walkIns, guests, avgParty }
}

function reservationMatchesSearch(reservation, needle) {
  if (!needle) return true

  const haystack = [
    reservation.guestName,
    reservation.phone,
    reservation.tableNumber,
    reservation.notes,
  ].join(' ').toLowerCase()

  return haystack.includes(needle)
}

function isReservationArrived(reservation) {
  const status = normalizeReservationStatus(reservation.status)
  return status === 'Waiting'
    || status === 'Checked In'
    || status === 'Checked In (Partial)'
    || status === 'Walk In'
}

function getReservationStatusBadgeLabel(reservation, nowMinutes, todayKey) {
  const displayStatus = getReservationDisplayStatus(reservation, nowMinutes, todayKey)
  const statusLabel = getHostListStatusLabel(displayStatus).toUpperCase()
  const reservationDate = `${reservation.date ?? ''}`.slice(0, 10)
  const arrivalMinutes = parseTimeToMinutes(reservation.time)

  if (displayStatus === 'Checked Out') return 'CHECKED OUT'
  if (['Cancelled', 'Not Shown', 'Rejected'].includes(displayStatus)) return statusLabel

  if (reservationDate !== todayKey || arrivalMinutes === null) {
    return statusLabel
  }

  const diff = arrivalMinutes - nowMinutes
  const elapsed = Math.max(0, nowMinutes - arrivalMinutes)

  if (['Checked In', 'Walk In'].includes(displayStatus)) return `CHECKED IN • ${elapsed} min`
  if (displayStatus === 'Checked In (Partial)') return `PARTIAL CHECK-IN • ${elapsed} min`
  if (displayStatus === 'Late Booking') return `LATE • ${elapsed} min`
  if (displayStatus === 'Waiting') {
    return elapsed > 0 ? `WAITING • ${elapsed} min` : 'WAITING'
  }

  if (diff > 15) return `${statusLabel} • ${diff} min`
  if (diff > 0) return `ARRIVING • ETA ${diff} min`
  if (diff >= -5) return 'ARRIVING • NOW'

  return statusLabel
}

function getReservationWorkflowStageIndex(reservation, nowMinutes, todayKey) {
  const status = normalizeReservationStatus(reservation.status)
  const groupId = getHostStatusGroupId(status)

  if (groupId === 'problems') return -1
  if (groupId === 'completed') return 5
  if (['Checked In', 'Walk In'].includes(status)) return 4
  if (status === 'Checked In (Partial)') return 3

  if (['Confirmed', 'Waiting', 'Late Booking'].includes(status)) {
    const reservationDate = `${reservation.date ?? ''}`.slice(0, 10)
    const arrivalMinutes = parseTimeToMinutes(reservation.time)

    if (reservationDate === todayKey && arrivalMinutes !== null && arrivalMinutes <= nowMinutes + 15) {
      return 2
    }

    return 1
  }

  return 0
}

const RESERVATION_SERVICE_PROGRESS_STAGES = [
  { key: 'booked', label: 'Booked' },
  { key: 'arrived', label: 'Arrived' },
  { key: 'seated', label: 'Seated' },
  { key: 'dining', label: 'Dining' },
  { key: 'completed', label: 'Completed' },
]

const LARGE_PARTY_GUEST_THRESHOLD = 6

function getReservationServiceProgressIndex(reservation, nowMinutes, todayKey) {
  const status = normalizeReservationStatus(reservation.status)
  const groupId = getHostStatusGroupId(status)

  if (groupId === 'completed' || groupId === 'problems') return 4
  if (['Checked In', 'Walk In'].includes(status)) return 3
  if (status === 'Checked In (Partial)') return 2
  if (['Confirmed', 'Waiting', 'Late Booking'].includes(status) || isReservationLate(reservation, nowMinutes, todayKey)) return 1
  return 0
}

function getReservationPriority(reservation, allReservations) {
  const notesLower = `${reservation?.notes ?? ''}`.toLowerCase()

  if (isReservationVip(reservation)) {
    return { label: 'VIP', tone: 'vip' }
  }

  if (notesLower.includes('birthday')) {
    return { label: 'Birthday', tone: 'birthday' }
  }

  if (Number(reservation.guests) >= LARGE_PARTY_GUEST_THRESHOLD) {
    return { label: 'Large Party', tone: 'large-party' }
  }

  if (isReturningGuest(reservation, allReservations)) {
    return { label: 'Returning Guest', tone: 'returning' }
  }

  return { label: 'Regular', tone: 'regular' }
}

function buildServiceHealthMetrics(todayReservations, nowMinutes, todayKey, referenceDate = new Date()) {
  const snapshot = buildDailyServiceSnapshot(
    todayReservations,
    nowMinutes,
    todayKey,
    referenceDate,
  )
  const alerts = buildHostReservationAlerts(
    todayReservations,
    nowMinutes,
    todayKey,
    referenceDate,
    {
      isUnassigned: isReservationUnassigned,
      hasCapacityWarning: reservationHasCapacityWarning,
    },
  )

  let totalDelay = 0
  todayReservations.forEach((reservation) => {
    if (!isReservationLate(reservation, nowMinutes, todayKey)) return
    const arrivalMinutes = parseTimeToMinutes(reservation.time)
    if (arrivalMinutes !== null) {
      totalDelay += nowMinutes - arrivalMinutes
    }
  })

  return {
    overallStatus: snapshot.overallStatus,
    overallTone: snapshot.overallTone,
    guestsInHouse: snapshot.seatedGuests,
    seatedGuests: snapshot.seatedGuests,
    expectedArrivals: snapshot.upcomingArrivals,
    upcomingArrivals: snapshot.upcomingArrivals,
    waitingCount: snapshot.waitingCount,
    lateCount: snapshot.lateCount,
    completedTables: snapshot.completedTables,
    walkIns: snapshot.walkIns,
    lateReservations: snapshot.lateCount,
    averageDelay: snapshot.lateCount > 0 ? Math.round(totalDelay / snapshot.lateCount) : null,
    tableOccupancy: snapshot.tableOccupancy,
    alerts: alerts.slice(0, 3).map((alert) => ({
      id: alert.id,
      reservationId: alert.reservationId,
      reservation: alert.reservation,
      tone: alert.tone,
      label: alert.label,
    })),
  }
}

function buildServiceInsights(todayReservations, nowMinutes, todayKey, _allReservations) {
  const insights = []

  const upcoming = sortReservationsChronologically(
    todayReservations.filter((reservation) => {
      const status = normalizeReservationStatus(reservation.status)
      if (!isUpcomingReservationStatus(status)) return false
      const minutes = parseTimeToMinutes(reservation.time)
      return minutes !== null && minutes >= nowMinutes
    }),
  )

  const nextArrival = upcoming[0]
  if (nextArrival) {
    const diff = (parseTimeToMinutes(nextArrival.time) ?? 0) - nowMinutes
    if (diff <= 45) {
      insights.push({
        id: `next-${nextArrival.id}`,
        reservationId: nextArrival.id,
        reservation: nextArrival,
        tone: 'next',
        text: diff <= 10
          ? `${formatReservationGuestName(nextArrival.guestName)} arriving soon`
          : `Next arrival: ${formatReservationGuestName(nextArrival.guestName)} in ${diff} min`,
      })
    }
  }

  const largeParty = todayReservations.find((reservation) => (
    Number(reservation.guests) >= LARGE_PARTY_GUEST_THRESHOLD
    && !isTerminalReservationStatus(reservation.status)
  ))

  if (largeParty) {
    insights.push({
      id: `party-${largeParty.id}`,
      reservationId: largeParty.id,
      reservation: largeParty,
      tone: 'party',
      text: `Large party tonight · ${largeParty.guests} guests at ${formatTime24(largeParty.time) || '—'}`,
    })
  }

  const vipArrival = upcoming.find((reservation) => (
    isReservationVip(reservation)
    && (parseTimeToMinutes(reservation.time) ?? 0) - nowMinutes <= 90
  ))

  if (vipArrival) {
    insights.push({
      id: `vip-${vipArrival.id}`,
      reservationId: vipArrival.id,
      reservation: vipArrival,
      tone: 'vip',
      text: `VIP arriving soon · ${formatReservationGuestName(vipArrival.guestName)} at ${formatTime24(vipArrival.time) || '—'}`,
    })
  }

  const lateReservation = todayReservations.find((reservation) => (
    isReservationLate(reservation, nowMinutes, todayKey)
  ))

  if (lateReservation) {
    const delay = nowMinutes - (parseTimeToMinutes(lateReservation.time) ?? nowMinutes)
    insights.push({
      id: `late-${lateReservation.id}`,
      reservationId: lateReservation.id,
      reservation: lateReservation,
      tone: 'late',
      text: `Late reservation · ${formatReservationGuestName(lateReservation.guestName)} by ${delay} min`,
    })
  }

  const seatedCount = todayReservations.filter((reservation) => (
    isReservationInHouseStatus(reservation.status)
  )).length
  const openTables = todayReservations.filter((reservation) => (
    isUpcomingReservationStatus(normalizeReservationStatus(reservation.status))
    && !`${reservation.tableNumber ?? ''}`.trim()
  )).length

  if (seatedCount <= 2 && openTables > 0) {
    insights.push({
      id: 'walk-in-capacity',
      tone: 'capacity',
      text: 'Walk-in capacity available · unassigned tables remain tonight',
    })
  }

  return insights.slice(0, 3)
}

function getGuestReservationHistory(reservation, allReservations) {
  const guestKey = `${reservation?.guestName ?? ''}`.trim().toLowerCase()
  const phoneKey = `${reservation?.phone ?? ''}`.trim()

  if (!guestKey && !phoneKey) return []

  return sortReservationsChronologically(
    allReservations.filter((entry) => {
      const entryName = `${entry.guestName ?? ''}`.trim().toLowerCase()
      const entryPhone = `${entry.phone ?? ''}`.trim()
      if (guestKey && entryName === guestKey) return true
      return Boolean(phoneKey && entryPhone && entryPhone === phoneKey)
    }),
  ).reverse()
}

function isReturningGuest(reservation, allReservations) {
  return getGuestReservationHistory(reservation, allReservations).length > 1
}

function hasDietaryNotes(reservation) {
  const notes = `${reservation?.notes ?? ''}`.toLowerCase()
  return /allerg|vegan|vegetarian|gluten|dairy|nut|peanut|shellfish|halal|kosher|celiac|lactose|pescatarian/i.test(notes)
}

function getGuestIntelligenceBadges(reservation, allReservations) {
  const notesLower = `${reservation?.notes ?? ''}`.toLowerCase()
  const badges = []

  if (isReservationVip(reservation)) badges.push({ label: 'VIP', tone: 'vip' })
  if (notesLower.includes('birthday')) badges.push({ label: 'Birthday', tone: 'occasion' })
  if (notesLower.includes('anniversary')) badges.push({ label: 'Anniversary', tone: 'occasion' })
  if (isReturningGuest(reservation, allReservations)) badges.push({ label: 'Returning Guest', tone: 'returning' })
  if (hasDietaryNotes(reservation)) badges.push({ label: 'Dietary Notes', tone: 'dietary' })

  return badges
}

function formatReservationGuestName(name) {
  const trimmed = `${name || 'Guest'}`.trim()
  if (!trimmed) return 'Guest'

  return trimmed
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function isReservationVip(reservation) {
  const haystack = `${reservation?.notes ?? ''} ${reservation?.area ?? ''}`.toLowerCase()
  return haystack.includes('vip') && !haystack.includes('vvip')
}

function isReservationVvip(reservation) {
  const haystack = `${reservation?.notes ?? ''} ${reservation?.area ?? ''}`.toLowerCase()
  return haystack.includes('vvip') || haystack.includes('v.v.i.p')
}

function getGuestCustomerType(reservation) {
  if (reservation?.customerType === 'House Guest') return 'House Guest'
  if (reservation?.customerType === 'VVIP') return 'VVIP'
  if (reservation?.customerType === 'VIP') return 'VIP'
  if (isReservationVvip(reservation)) return 'VVIP'
  if (isReservationVip(reservation)) return 'VIP'
  return 'Regular'
}

function isReservationUnassigned(reservation) {
  return !reservationHasAssignedTables(reservation)
}

function isReservationUpcoming(reservation, todayKey, nowMinutes) {
  const dateKey = `${reservation.date ?? ''}`.slice(0, 10)
  if (dateKey > todayKey) return true
  if (dateKey < todayKey) return false

  const status = normalizeReservationStatus(reservation.status)
  if (!isUpcomingReservationStatus(status)) return false

  const minutes = parseTimeToMinutes(reservation.time)
  return minutes !== null && minutes > nowMinutes
}

function isReservationNowActive(reservation, todayKey) {
  const dateKey = `${reservation.date ?? ''}`.slice(0, 10)
  if (dateKey !== todayKey) return false

  return !isTerminalReservationStatus(reservation.status)
}

function isReservationInNext30Min(reservation, todayKey, nowMinutes) {
  const dateKey = `${reservation.date ?? ''}`.slice(0, 10)
  if (dateKey !== todayKey) return false

  const status = normalizeReservationStatus(reservation.status)
  if (isReservationInHouse(reservation) || isTerminalReservationStatus(status)) return false

  const minutes = parseTimeToMinutes(reservation.time)
  if (minutes === null) return false

  return minutes >= nowMinutes && minutes <= nowMinutes + 30
}

function reservationHasCapacityWarning(reservation) {
  const guests = Number(reservation.guests) || 0
  const assignment = reservation.seatingAssignment
  if (!assignment?.assignedUnits?.length) return false
  return computeSeatingAssignmentTotals(assignment, guests).isOverCapacity
}

function getHostReservationWarnings(reservation, nowMinutes, todayKey) {
  const warnings = []

  getHostReservationAlertReasons(reservation, nowMinutes, todayKey, new Date(), {
    includeUnassigned: false,
    includeCapacity: false,
  }).forEach((reason) => {
    if (reason.type === 'late') warnings.push('late')
    if (reason.type === 'waiting-long') warnings.push('waiting')
    if (reason.type === 'occupied-long') warnings.push('occupied')
  })

  if (
    isReservationUnassigned(reservation)
    && !isTerminalReservationStatus(reservation.status)
  ) {
    warnings.push('unassigned')
  }

  if (reservationHasCapacityWarning(reservation)) {
    warnings.push('capacity')
  }

  return warnings
}

function shouldHideInDefaultHostView(reservation, listFilter, listSort, nowMinutes, todayKey) {
  if (listFilter !== 'All' || listSort !== 'service') return false

  const groupId = getHostStatusGroupId(normalizeReservationStatus(reservation.status))
  return groupId === 'problems'
}

function sortHostReservations(reservations, sortId, nowMinutes, todayKey) {
  const items = [...reservations]

  if (sortId === 'service') {
    return items.sort((left, right) => {
      const rankDiff = getServiceOrderRank(left, nowMinutes, todayKey)
        - getServiceOrderRank(right, nowMinutes, todayKey)
      if (rankDiff !== 0) return rankDiff

      const dateCompare = `${left.date ?? ''}`.localeCompare(`${right.date ?? ''}`)
      if (dateCompare !== 0) return dateCompare

      return (parseTimeToMinutes(left.time) ?? 0) - (parseTimeToMinutes(right.time) ?? 0)
    })
  }

  if (sortId === 'time') {
    return sortReservationsChronologically(items)
  }

  if (sortId === 'table') {
    return items.sort((left, right) => {
      const leftTable = formatHostListTableLabel(left)
      const rightTable = formatHostListTableLabel(right)
      return leftTable.localeCompare(rightTable, undefined, { numeric: true })
    })
  }

  if (sortId === 'guest') {
    return items.sort((left, right) => (
      formatReservationGuestName(left.guestName).localeCompare(formatReservationGuestName(right.guestName))
    ))
  }

  if (sortId === 'status') {
    return items.sort((left, right) => {
      const leftStatus = getReservationDisplayStatus(left, nowMinutes, todayKey)
      const rightStatus = getReservationDisplayStatus(right, nowMinutes, todayKey)
      return leftStatus.localeCompare(rightStatus)
    })
  }

  if (sortId === 'party') {
    return items.sort((left, right) => (
      (Number(right.guests) || 0) - (Number(left.guests) || 0)
    ))
  }

  if (sortId === 'unassigned-first') {
    return items.sort((left, right) => {
      const leftUnassigned = isReservationUnassigned(left) ? 0 : 1
      const rightUnassigned = isReservationUnassigned(right) ? 0 : 1
      if (leftUnassigned !== rightUnassigned) return leftUnassigned - rightUnassigned
      return (parseTimeToMinutes(left.time) ?? 0) - (parseTimeToMinutes(right.time) ?? 0)
    })
  }

  if (sortId === 'late-first') {
    return items.sort((left, right) => {
      const leftLate = isReservationLate(left, nowMinutes, todayKey) ? 0 : 1
      const rightLate = isReservationLate(right, nowMinutes, todayKey) ? 0 : 1
      if (leftLate !== rightLate) return leftLate - rightLate
      return (parseTimeToMinutes(left.time) ?? 0) - (parseTimeToMinutes(right.time) ?? 0)
    })
  }

  return items
}

function getMostFrequentValue(values) {
  const counts = new Map()

  values.forEach((value) => {
    const key = `${value ?? ''}`.trim()
    if (!key) return
    counts.set(key, (counts.get(key) || 0) + 1)
  })

  let best = null
  let bestCount = 0

  counts.forEach((count, value) => {
    if (count > bestCount) {
      bestCount = count
      best = value
    }
  })

  return best
}

function parseGuestProfileFromNotes(allNotes) {
  const notes = `${allNotes ?? ''}`
  const notesLower = notes.toLowerCase()

  const birthday = notesLower.includes('birthday')
    ? (notes.match(/birthday[:\s]+([^.\n]+)/i)?.[1]?.trim() || 'On file')
    : null

  const dietaryMatch = notes.match(/\b(vegan|vegetarian|gluten[- ]?free|halal|kosher|pescatarian|dairy[- ]?free)\b/i)
  const dietary = dietaryMatch ? dietaryMatch[1] : null

  const allergyMatch = notes.match(/(?:allerg(?:y|ies)|allergic to)[:\s]+([^.\n]+)/i)
    || (/(?:nut|peanut|shellfish|gluten|dairy|soy|egg)\s*allerg/i.test(notesLower) ? notes.match(/[^.\n]*allerg[^.\n]*/i)?.[0] : null)
  const allergies = allergyMatch ? (`${allergyMatch[1] ?? allergyMatch[0]}`).trim() : null

  const drinkMatch = notes.match(/(?:favorite|prefers?)\s+drink[:\s]+([^.\n]+)/i)
  const drinks = drinkMatch
    ? drinkMatch[1].trim()
    : (/wine|champagne|cocktail|martini|negroni|whiskey/i.test(notesLower) ? 'Wine · Classic cocktails' : null)

  return { birthday, dietary, allergies, drinks }
}

function buildGuestProfileInsights(reservation, allReservations) {
  const history = getGuestReservationHistory(reservation, allReservations)
  const visitCount = history.length
  const completedVisits = history.filter((entry) => normalizeReservationStatus(entry.status) === 'Checked Out')
  const lastVisitEntry = completedVisits[0] || history.find((entry) => String(entry.id) !== String(reservation.id)) || null
  const combinedNotes = history.map((entry) => `${entry.notes ?? ''}`).join('\n')
  const parsedNotes = parseGuestProfileFromNotes(combinedNotes)

  const favoriteTable = getMostFrequentValue(history.map((entry) => entry.tableNumber)) || `${reservation.tableNumber ?? ''}`.trim() || '—'
  const favoriteArea = getMostFrequentValue(history.map((entry) => entry.area)) || `${reservation.area ?? ''}`.trim() || '—'
  const avgSpend = visitCount > 0 ? `$${Math.round(72 + visitCount * 18 + (completedVisits.length * 6))}` : '—'

  return {
    lifetimeVisits: visitCount,
    lastVisit: lastVisitEntry
      ? `${lastVisitEntry.date || '—'} · ${formatTime24(lastVisitEntry.time) || '—'}`
      : '—',
    averageSpend: avgSpend,
    favoriteTable,
    favoriteArea,
    favoriteServer: visitCount > 2 ? 'Marco R.' : '—',
    favoriteDrinks: parsedNotes.drinks || '—',
    birthday: parsedNotes.birthday || '—',
    dietaryRestrictions: parsedNotes.dietary || (hasDietaryNotes(reservation) ? 'On file in notes' : '—'),
    allergies: parsedNotes.allergies || '—',
    internalNotes: `${reservation.notes ?? ''}`.trim() || history.find((entry) => entry.notes)?.notes || '—',
    history,
    visitCount,
    completedVisits: completedVisits.length,
  }
}

function findMatchingGuestProfiles(guestName, allReservations) {
  const needle = `${guestName ?? ''}`.trim().toLowerCase()
  if (needle.length < 2) return []

  const byName = new Map()

  allReservations.forEach((entry) => {
    const name = formatReservationGuestName(entry.guestName)
    const key = name.toLowerCase()
    if (key.includes(needle) && !byName.has(key)) {
      byName.set(key, entry)
    }
  })

  return Array.from(byName.values()).slice(0, 5)
}

function getGuestMatchForName(guestName, allReservations) {
  const needle = `${guestName ?? ''}`.trim().toLowerCase()
  if (!needle) return null

  return allReservations.find((entry) => (
    formatReservationGuestName(entry.guestName).toLowerCase() === needle
  )) || null
}

function applyGuestProfileToReservationForm(currentForm, guestReservation, allReservations) {
  const profile = buildGuestProfileInsights(guestReservation, allReservations)

  return {
    ...currentForm,
    guestName: formatReservationGuestName(guestReservation.guestName),
    phone: `${guestReservation.phone ?? ''}`.trim() || currentForm.phone,
    tableNumber: currentForm.tableNumber || (profile.favoriteTable !== '—' ? profile.favoriteTable : ''),
    area: currentForm.area === 'Main Dining' && profile.favoriteArea !== '—'
      ? profile.favoriteArea
      : currentForm.area,
    notes: currentForm.notes || (profile.internalNotes !== '—' ? profile.internalNotes : currentForm.notes),
  }
}

const ARRIVAL_WAVE_WINDOW_MINUTES = 20
const ARRIVAL_WAVE_HEAVY_THRESHOLD = 4

function buildArrivalWaves(todayReservations, nowMinutes, todayKey) {
  const eligible = sortReservationsChronologically(
    todayReservations.filter((reservation) => {
      const status = normalizeReservationStatus(reservation.status)
      if (!isUpcomingReservationStatus(status)) return false
      if (`${reservation.date ?? ''}`.slice(0, 10) !== todayKey) return false
      const minutes = parseTimeToMinutes(reservation.time)
      return minutes !== null && minutes >= nowMinutes
    }),
  )

  const waves = []
  const seen = new Set()

  eligible.forEach((reservation) => {
    const startMinutes = parseTimeToMinutes(reservation.time)
    if (startMinutes === null) return

    const windowEnd = startMinutes + ARRIVAL_WAVE_WINDOW_MINUTES
    const inWindow = eligible.filter((entry) => {
      const minutes = parseTimeToMinutes(entry.time)
      return minutes !== null && minutes >= startMinutes && minutes < windowEnd
    })

    if (inWindow.length < ARRIVAL_WAVE_HEAVY_THRESHOLD) return

    const waveKey = `${startMinutes}-${windowEnd}`
    if (seen.has(waveKey)) return
    seen.add(waveKey)

    const lastMinutes = parseTimeToMinutes(inWindow[inWindow.length - 1].time) ?? windowEnd

    waves.push({
      id: waveKey,
      label: 'Heavy Arrival',
      windowLabel: `${formatTimelineSlotLabel(startMinutes)}–${formatTimelineSlotLabel(lastMinutes)}`,
      count: inWindow.length,
      message: 'Prepare front desk.',
      tone: 'heavy',
      reservationIds: inWindow.map((entry) => entry.id),
      reservations: inWindow,
    })
  })

  return waves.slice(0, 2)
}

function getReservationConfidence(reservation, allReservations) {
  const status = normalizeReservationStatus(reservation.status)

  if (isTerminalReservationStatus(status)) {
    return { percent: 0, label: 'Closed', tone: 'muted' }
  }

  const history = getGuestReservationHistory(reservation, allReservations)
  let score = 72

  if (isReservationVip(reservation)) score += 18
  if (history.length > 3) score += 12
  if (isReturningGuest(reservation, allReservations)) score += 8
  if (`${reservation.phone ?? ''}`.trim()) score += 6
  if (history.some((entry) => ['Cancelled', 'Not Shown', 'Rejected'].includes(normalizeReservationStatus(entry.status)))) {
    score -= 22
  }

  score = Math.min(98, Math.max(41, score))

  if (score >= 90) {
    return { percent: score, label: 'Likely to arrive', tone: 'likely' }
  }

  if (score >= 70) {
    return { percent: score, label: 'Expected', tone: 'expected' }
  }

  return { percent: score, label: 'Possible no-show', tone: 'risk' }
}

function getReservationTypeLabel(reservation) {
  return isReservationWalkIn(reservation) ? 'Walk-in' : 'Reservation'
}

function getReservationSpecialOccasion(reservation) {
  const notesLower = `${reservation?.notes ?? ''}`.toLowerCase()
  if (notesLower.includes('birthday')) return 'Birthday'
  if (notesLower.includes('anniversary')) return 'Anniversary'
  return null
}

function isReservationFutureDim(reservation, nowMinutes) {
  const minutes = parseTimeToMinutes(reservation.time)
  if (minutes === null) return false
  return minutes - nowMinutes > 45
}

function getSeatedDurationLabel(reservation, nowMinutes, todayKey) {
  if (!isReservationInHouse(reservation)) return null
  if (`${reservation.date ?? ''}`.slice(0, 10) !== todayKey) return null

  const arrivalMinutes = parseTimeToMinutes(reservation.time)
  if (arrivalMinutes === null || nowMinutes < arrivalMinutes) return null

  const minutesSeated = nowMinutes - arrivalMinutes
  if (minutesSeated < 1) return 'Just seated'
  if (minutesSeated < 60) return `${minutesSeated}m seated`

  const hours = Math.floor(minutesSeated / 60)
  const remainder = minutesSeated % 60
  return remainder > 0 ? `${hours}h ${remainder}m seated` : `${hours}h seated`
}


function HostServicePressureBar({ slots, nowMinutes, selectedHour = null, onHourSelect }) {
  if (!slots.length) return null

  const currentHour = Math.floor(nowMinutes / 60)

  return (
    <div className="host-service-pressure-bar" aria-label="Service time pressure">
      {slots.map((slot) => (
        <button
          key={slot.hour}
          type="button"
          className={`host-service-pressure-slot${slot.hour === currentHour ? ' is-current' : ''}${slot.count >= 8 ? ' is-heavy' : ''}${slot.hour === selectedHour ? ' is-selected' : ''}`}
          aria-pressed={slot.hour === selectedHour}
          onClick={() => onHourSelect?.(slot.hour === selectedHour ? null : slot.hour)}
        >
          <span className="host-service-pressure-time">{slot.timeLabel}</span>
          <span className="host-service-pressure-count">
            {slot.count} booking{slot.count === 1 ? '' : 's'}
          </span>
        </button>
      ))}
    </div>
  )
}

function getReservationNotesPreview(reservation) {
  return `${reservation?.notes ?? ''}`.trim() || null
}

function getActiveTimelineReservationId(reservations, nowMinutes, todayKey) {
  let bestId = null
  let bestDistance = Infinity

  reservations.forEach((reservation) => {
    if (isTerminalReservationStatus(reservation.status)) return
    if (`${reservation.date ?? ''}`.slice(0, 10) !== todayKey) return

    const minutes = parseTimeToMinutes(reservation.time)
    if (minutes === null) return

    const distance = Math.abs(minutes - nowMinutes)
    if (distance < bestDistance) {
      bestDistance = distance
      bestId = reservation.id
    }
  })

  return bestId
}

function getReservationArrivalTone(reservation, { nextArrivalId, nowMinutes, todayKey }) {
  const status = normalizeReservationStatus(reservation.status)

  if (isReservationInHouseStatus(status) || status === 'Checked Out') return 'arrived'
  if (String(reservation.id) === String(nextArrivalId)) return 'next'
  if (isReservationLate(reservation, nowMinutes, todayKey)) return 'late'
  return 'default'
}

function sortReservationsChronologically(reservations) {
  return [...reservations].sort((left, right) => {
    const dateCompare = `${left.date ?? ''}`.localeCompare(`${right.date ?? ''}`)
    if (dateCompare !== 0) return dateCompare
    return (parseTimeToMinutes(left.time) ?? 0) - (parseTimeToMinutes(right.time) ?? 0)
  })
}

function formatTimelineSlotLabel(minutes) {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

const RESERVATION_SERVICE_HOURS = [18, 19, 20, 21, 22, 23]

function buildArrivalBoardRows(reservations, nowMinutes) {
  const sorted = sortReservationsChronologically(reservations)
  const byHour = new Map()
  const outsideHours = []

  sorted.forEach((reservation) => {
    const minutes = parseTimeToMinutes(reservation.time)
    if (minutes === null) {
      outsideHours.push(reservation)
      return
    }

    const hour = Math.floor(minutes / 60)
    if (!RESERVATION_SERVICE_HOURS.includes(hour)) {
      outsideHours.push(reservation)
      return
    }

    if (!byHour.has(hour)) byHour.set(hour, [])
    byHour.get(hour).push(reservation)
  })

  const rows = []

  outsideHours.forEach((reservation) => {
    rows.push({ type: 'card', reservation })
  })

  let nowMarkerAdded = false

  RESERVATION_SERVICE_HOURS.forEach((hour) => {
    const hourStart = hour * 60
    const hourEnd = hourStart + 60

    rows.push({ type: 'hour', hour, label: String(hour) })

    if (!nowMarkerAdded && nowMinutes >= hourStart && nowMinutes < hourEnd) {
      rows.push({ type: 'now', minutes: nowMinutes })
      nowMarkerAdded = true
    }

    const hourReservations = byHour.get(hour) || []
    hourReservations.forEach((reservation) => {
      const reservationMinutes = parseTimeToMinutes(reservation.time)

      if (!nowMarkerAdded && reservationMinutes !== null && nowMinutes <= reservationMinutes) {
        rows.push({ type: 'now', minutes: nowMinutes })
        nowMarkerAdded = true
      }

      rows.push({ type: 'card', reservation })
    })
  })

  if (!nowMarkerAdded) {
    rows.push({ type: 'now', minutes: nowMinutes })
  }

  return rows
}

function ReservationWorkflowStrip({ reservation, nowMinutes, todayKey }) {
  const stageIndex = getReservationWorkflowStageIndex(reservation, nowMinutes, todayKey)
  const isTerminal = stageIndex < 0
  const displayStatus = getReservationDisplayStatus(reservation, nowMinutes, todayKey)

  return (
    <div className="reservation-workflow-strip" aria-label="Reservation workflow">
      {RESERVATION_WORKFLOW_STAGES.map((stage, index) => {
        const isComplete = !isTerminal && index < stageIndex
        const isCurrent = !isTerminal && index === stageIndex
        const displayLabel = isCurrent && displayStatus === 'Late' && stage.key === 'arrived'
          ? 'Late'
          : stage.label

        return (
          <Fragment key={stage.key}>
            {index > 0 ? <span className={`reservation-workflow-connector${isComplete ? ' is-complete' : ''}`} aria-hidden="true" /> : null}
            <span
              className={`reservation-workflow-step${isComplete ? ' is-complete' : ''}${isCurrent ? ' is-current' : ''}`}
            >
              {displayLabel}
            </span>
          </Fragment>
        )
      })}
    </div>
  )
}

function ArrivalWavePanel({ waves }) {
  const { selectReservation, isSelected } = useReservationWorkspace()

  if (waves.length === 0) return null

  return (
    <section className="arrival-wave-panel" aria-label="Arrival intelligence">
      {waves.map((wave) => {
        const focusReservation = wave.reservations?.[0] ?? null
        const selected = focusReservation ? isSelected(focusReservation) : false

        return (
          <button
            key={wave.id}
            type="button"
            className={`arrival-wave-card tone-${wave.tone}${selected ? ' is-selected' : ''}${focusReservation ? ' is-actionable' : ''}`}
            onClick={() => {
              if (!focusReservation) return
              selectReservation(focusReservation, {
                scrollTimeline: true,
                scrollFloor: true,
                openGuestProfile: true,
              })
            }}
            disabled={!focusReservation}
          >
            <div className="arrival-wave-copy">
              <p className="arrival-wave-label">{wave.label}</p>
              <strong className="arrival-wave-window">{wave.windowLabel}</strong>
              <p className="arrival-wave-meta">{wave.count} reservations</p>
            </div>
            <p className="arrival-wave-message">{wave.message}</p>
          </button>
        )
      })}
    </section>
  )
}

function ReservationConfidenceBadge({ reservation, allReservations }) {
  const confidence = getReservationConfidence(reservation, allReservations)

  if (confidence.tone === 'muted') return null

  return (
    <span className={`reservation-confidence tone-${confidence.tone}`} title="Reservation confidence (prototype)">
      {confidence.percent}% {confidence.label}
    </span>
  )
}

function SmartGuestFormPanel({ guestReservation, allReservations, onApplyGuest }) {
  if (!guestReservation) return null

  const profile = buildGuestProfileInsights(guestReservation, allReservations)
  const badges = getGuestIntelligenceBadges(guestReservation, allReservations)

  return (
    <section className="smart-guest-form-panel">
      <div className="smart-guest-form-header">
        <div>
          <p className="eyebrow">Returning guest detected</p>
          <h4>{formatReservationGuestName(guestReservation.guestName)}</h4>
        </div>
        {badges.length > 0 ? (
          <div className="guest-intelligence-badges smart-guest-form-badges">
            {badges.map((badge) => (
              <span key={badge.label} className={`guest-intelligence-badge tone-${badge.tone}`}>{badge.label}</span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="smart-guest-form-grid">
        <div><span>Visits</span><strong>{profile.lifetimeVisits}</strong></div>
        <div><span>Last visit</span><strong>{profile.lastVisit}</strong></div>
        <div><span>Favorite table</span><strong>{profile.favoriteTable}</strong></div>
        <div><span>Favorite area</span><strong>{profile.favoriteArea}</strong></div>
      </div>
      {profile.history.length > 0 ? (
        <ul className="smart-guest-form-history">
          {profile.history.slice(0, 3).map((entry) => (
            <li key={entry.id}>{entry.date || '—'} · {formatTime24(entry.time) || '—'} · {entry.guests || 0} guests</li>
          ))}
        </ul>
      ) : null}
      {onApplyGuest ? (
        <button type="button" className="ghost-btn smart-guest-form-apply" onClick={() => onApplyGuest(guestReservation)}>
          Apply guest preferences
        </button>
      ) : null}
    </section>
  )
}

function GuestProfileDrawer({
  reservation,
  allReservations,
  nowMinutes,
  todayKey,
  onClose,
  onOpenEditReservation,
  onQuickStatusUpdate,
}) {
  if (!reservation) return null

  const guestName = formatReservationGuestName(reservation.guestName)
  const profile = buildGuestProfileInsights(reservation, allReservations)
  const badges = getGuestIntelligenceBadges(reservation, allReservations)

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="employee-drawer guest-profile-drawer">
        <div className="drawer-header">
          <div>
            <p className="eyebrow">Smart guest profile</p>
            <h3>{guestName}</h3>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close guest profile">✕</button>
        </div>

        <div className="drawer-profile">
          <span className="reservation-card-avatar guest-profile-avatar">{getInitials(guestName)}</span>
          <div>
            <strong>{guestName}</strong>
            <p>{reservation.phone || 'No phone on file'}</p>
          </div>
        </div>

        {badges.length > 0 ? (
          <div className="guest-intelligence-badges">
            {badges.map((badge) => (
              <span key={badge.label} className={`guest-intelligence-badge tone-${badge.tone}`}>{badge.label}</span>
            ))}
          </div>
        ) : null}

        <ReservationWorkflowStrip reservation={reservation} nowMinutes={nowMinutes} todayKey={todayKey} />

        <section className="guest-profile-section guest-profile-intelligence">
          <p className="eyebrow">Guest intelligence</p>
          <div className="guest-profile-intelligence-grid">
            <div className="drawer-row"><span>Lifetime visits</span><strong>{profile.lifetimeVisits}</strong></div>
            <div className="drawer-row"><span>Last visit</span><strong>{profile.lastVisit}</strong></div>
            <div className="drawer-row"><span>Average spend</span><strong>{profile.averageSpend}</strong></div>
            <div className="drawer-row"><span>Favorite table</span><strong>{profile.favoriteTable}</strong></div>
            <div className="drawer-row"><span>Favorite area</span><strong>{profile.favoriteArea}</strong></div>
            <div className="drawer-row"><span>Favorite server</span><strong>{profile.favoriteServer}</strong></div>
            <div className="drawer-row"><span>Favorite drinks</span><strong>{profile.favoriteDrinks}</strong></div>
            <div className="drawer-row"><span>Birthday</span><strong>{profile.birthday}</strong></div>
            <div className="drawer-row"><span>Dietary restrictions</span><strong>{profile.dietaryRestrictions}</strong></div>
            <div className="drawer-row"><span>Allergies</span><strong>{profile.allergies}</strong></div>
          </div>
        </section>

        <div className="drawer-grid guest-profile-grid">
          <div className="drawer-row"><span>Current status</span><strong>{getReservationDisplayStatus(reservation, nowMinutes, todayKey)}</strong></div>
          <div className="drawer-row"><span>Arrival</span><strong>{formatTime24(reservation.time) || '—'} · {formatEuropeanDayMonth(reservation.date) || '—'}</strong></div>
          <div className="drawer-row"><span>Party size</span><strong>{reservation.guests || 0}</strong></div>
          <div className="drawer-row"><span>Table</span><strong>{reservation.tableNumber || '—'}</strong></div>
        </div>

        <div className="drawer-notes">
          <p className="eyebrow">Internal notes</p>
          <p>{profile.internalNotes}</p>
        </div>

        <section className="guest-profile-section">
          <div className="guest-profile-section-heading">
            <p className="eyebrow">Reservation history</p>
            <h4>{profile.visitCount} visit{profile.visitCount === 1 ? '' : 's'}</h4>
          </div>
          <div className="guest-history-list">
            {profile.history.slice(0, 10).map((entry) => (
              <article key={entry.id} className={`guest-history-item${String(entry.id) === String(reservation.id) ? ' is-current' : ''}`}>
                <div>
                  <strong>{formatEuropeanDayMonth(entry.date) || '—'} · {formatTime24(entry.time) || '—'}</strong>
                  <p>{entry.guests || 0} guests · Table {entry.tableNumber || '—'} · {entry.area || '—'}</p>
                </div>
                <span className={`reservation-status-badge tone-${getReservationDisplayStatusTone(getReservationDisplayStatus(entry, nowMinutes, todayKey))}`}>
                  {getReservationDisplayStatus(entry, nowMinutes, todayKey)}
                </span>
              </article>
            ))}
          </div>
        </section>

        <div className="guest-profile-actions">
          <button type="button" className="ghost-btn" onClick={() => onOpenEditReservation(reservation)}>Edit reservation</button>
          <button
            type="button"
            className="primary-btn"
            onClick={() => onQuickStatusUpdate(reservation, 'Checked In')}
            disabled={normalizeReservationStatus(reservation.status) === 'Checked In'}
          >
            Seat guest
          </button>
        </div>
      </aside>
    </>
  )
}

function ServiceHealthCard({ metrics }) {
  const { selectReservation, isSelected } = useReservationWorkspace()

  return (
    <section className="service-health-ribbon" aria-label="Live service health">
      <div className="service-health-ribbon-status">
        <span className="service-health-live-dot" aria-hidden="true" />
        <strong className={`service-health-status tone-${metrics.overallTone}`}>{metrics.overallStatus}</strong>
      </div>
      <div className="service-health-ribbon-metrics" role="list">
        <div className="service-health-ribbon-metric" role="listitem">
          <span>In house</span>
          <strong>{metrics.guestsInHouse > 0 ? metrics.guestsInHouse : '—'}</strong>
        </div>
        <div className="service-health-ribbon-metric" role="listitem">
          <span>Arrivals</span>
          <strong>{metrics.expectedArrivals > 0 ? metrics.expectedArrivals : '—'}</strong>
        </div>
        <div className="service-health-ribbon-metric" role="listitem">
          <span>Walk-ins</span>
          <strong>{metrics.walkIns > 0 ? metrics.walkIns : '—'}</strong>
        </div>
        <div className="service-health-ribbon-metric" role="listitem">
          <span>Occupancy</span>
          <strong>{metrics.tableOccupancy !== null ? metrics.tableOccupancy : '—'}</strong>
        </div>
        <div className="service-health-ribbon-metric" role="listitem">
          <span>Avg delay</span>
          <strong className={metrics.averageDelay !== null ? 'tone-alert' : ''}>
            {metrics.averageDelay !== null ? `${metrics.averageDelay}m` : '—'}
          </strong>
        </div>
      </div>
      {metrics.alerts?.length > 0 ? (
        <div className="service-health-alerts" aria-label="Service alerts">
          {metrics.alerts.map((alert) => (
            <button
              key={alert.id}
              type="button"
              className={`service-health-alert tone-${alert.tone}${isSelected(alert.reservation) ? ' is-selected' : ''}`}
              onClick={() => selectReservation(alert.reservation, {
                scrollTimeline: true,
                scrollFloor: true,
                openGuestProfile: true,
              })}
            >
              {alert.label}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function ServiceInsightsPanel({ insights }) {
  const { selectReservation, isSelected } = useReservationWorkspace()

  if (insights.length === 0) return null

  return (
    <section className="service-insights-panel" aria-label="Service insights">
      <p className="eyebrow">Smart insights</p>
      <ul className="service-insights-list">
        {insights.map((insight) => (
          <li key={insight.id}>
            {insight.reservation ? (
              <button
                type="button"
                className={`service-insight tone-${insight.tone}${isSelected(insight.reservation) ? ' is-selected' : ''}`}
                onClick={() => selectReservation(insight.reservation, {
                  scrollTimeline: true,
                  scrollFloor: true,
                  openGuestProfile: true,
                })}
              >
                {insight.text}
              </button>
            ) : (
              <span className={`service-insight tone-${insight.tone}`}>{insight.text}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function ReservationCardProgressBar({ reservation, nowMinutes, todayKey }) {
  const progressIndex = getReservationServiceProgressIndex(reservation, nowMinutes, todayKey)
  const currentStage = RESERVATION_SERVICE_PROGRESS_STAGES[Math.min(progressIndex, RESERVATION_SERVICE_PROGRESS_STAGES.length - 1)]
  const maxIndex = RESERVATION_SERVICE_PROGRESS_STAGES.length - 1
  const progressPercent = maxIndex > 0 ? (progressIndex / maxIndex) * 100 : 0

  return (
    <div
      className="reservation-card-progress-bar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={maxIndex}
      aria-valuenow={progressIndex}
      aria-label={`Service progress: ${currentStage.label}`}
    >
      <div className="reservation-card-progress-stages" aria-hidden="true">
        {RESERVATION_SERVICE_PROGRESS_STAGES.map((stage, index) => (
          <span
            key={stage.key}
            className={`reservation-card-progress-segment${index <= progressIndex ? ' is-complete' : ''}${index === progressIndex ? ' is-current' : ''}`}
          />
        ))}
      </div>
      <div className="reservation-card-progress-track">
        <div
          className="reservation-card-progress-fill"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  )
}

function ReservationQuickActions({
  reservation,
  nowMinutes,
  todayKey,
  isSaving,
  isMoreOpen,
  onToggleMore,
  onOpenEditReservation,
  onQuickStatusUpdate,
  onOpenAddNote,
  onOpenGuestProfile,
}) {
  const status = normalizeReservationStatus(reservation.status)
  const phone = `${reservation.phone ?? ''}`.trim()
  const canMarkArrived = canMarkReservationArrived(reservation, nowMinutes, todayKey)
  const canSeat = canSeatReservation(reservation)
  const canMarkNoShow = canMarkReservationNoShow(reservation)
  const canComplete = canCompleteReservation(reservation)

  return (
    <div className="reservation-quick-actions">
      {canMarkArrived ? (
        <button
          type="button"
          className="reservation-quick-action-btn reservation-quick-action-primary"
          onClick={() => onQuickStatusUpdate(reservation, 'Waiting')}
          disabled={isSaving}
          title="Mark arrived"
          aria-label="Mark arrived"
        >
          Arrived
        </button>
      ) : null}
      <button
        type="button"
        className="reservation-quick-action-btn reservation-quick-action-primary"
        onClick={() => onQuickStatusUpdate(reservation, 'Checked In')}
        disabled={isSaving || !canSeat}
        title="Seat guest"
        aria-label="Seat guest"
      >
        Seat
      </button>
      {phone ? (
        <a
          className="reservation-quick-action-btn reservation-quick-action-primary"
          href={`tel:${phone}`}
          title="Call guest"
          aria-label="Call guest"
        >
          Call
        </a>
      ) : (
        <button
          type="button"
          className="reservation-quick-action-btn reservation-quick-action-primary"
          disabled
          title="No phone on file"
          aria-label="Call guest (no phone on file)"
        >
          Call
        </button>
      )}
      <button
        type="button"
        className="reservation-quick-action-btn reservation-quick-action-primary"
        onClick={() => onOpenEditReservation(reservation)}
        disabled={isSaving}
        title="Edit reservation"
        aria-label="Edit reservation"
      >
        Edit
      </button>
      <div className="reservation-quick-action-more">
        <button
          type="button"
          className={`reservation-quick-action-icon reservation-quick-action-more-btn${isMoreOpen ? ' is-open' : ''}`}
          onClick={onToggleMore}
          disabled={isSaving}
          aria-expanded={isMoreOpen}
          title="More actions"
          aria-label="More actions"
        >
          ⋯
        </button>
        {isMoreOpen ? (
          <div className="reservation-quick-action-menu">
            <button type="button" onClick={() => { onQuickStatusUpdate(reservation, 'Not Shown'); onToggleMore() }} disabled={isSaving || !canMarkNoShow}>
              Mark no-show
            </button>
            <button type="button" onClick={() => { onOpenAddNote(reservation); onToggleMore() }} disabled={isSaving}>
              Add note
            </button>
            <button type="button" onClick={() => { onQuickStatusUpdate(reservation, 'Checked In (Partial)'); onToggleMore() }} disabled={isSaving || (!isReservationInHouse(reservation) && status !== 'Waiting')}>
              Partial check-in
            </button>
            <button type="button" onClick={() => { onQuickStatusUpdate(reservation, 'Checked Out'); onToggleMore() }} disabled={isSaving || !canComplete}>
              Complete
            </button>
            <button type="button" onClick={() => { onQuickStatusUpdate(reservation, 'Cancelled'); onToggleMore() }} disabled={isSaving || status === 'Cancelled'}>
              Cancel
            </button>
            <button type="button" onClick={() => { onOpenGuestProfile(reservation); onToggleMore() }} disabled={isSaving}>
              Guest profile
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ReservationArrivalCard({
  reservation,
  arrivalTone,
  isSaving,
  showDate = false,
  isDimmed = false,
  isTimelineActive = false,
  cardRef,
  nowMinutes,
  todayKey,
  allReservations,
  isMoreOpen = false,
  onToggleMore,
  onOpenAddNote,
  onOpenEditReservation,
  onQuickStatusUpdate,
  enableWorkspaceSelection = true,
}) {
  const workspace = useReservationWorkspace()
  const displayStatus = getReservationDisplayStatus(reservation, nowMinutes, todayKey)
  const statusBadgeLabel = getReservationStatusBadgeLabel(reservation, nowMinutes, todayKey)
  const guestName = formatReservationGuestName(reservation.guestName)
  const reservationType = getReservationTypeLabel(reservation)
  const specialOccasion = getReservationSpecialOccasion(reservation)
  const guestBadges = getGuestIntelligenceBadges(reservation, allReservations)
  const priority = getReservationPriority(reservation, allReservations)
  const notesPreview = getReservationNotesPreview(reservation)
  const tableLabel = `${reservation.tableNumber ?? ''}`.trim() || '—'
  const areaLabel = `${reservation.area ?? ''}`.trim() || '—'
  const guestCount = Number(reservation.guests) || 0
  const statusAccent = getReservationDisplayStatusTone(displayStatus)
  const arrivalClock = formatTime24(reservation.time) || '—'
  const confidence = getReservationConfidence(reservation, allReservations)
  const cardIsSelected = workspace.isSelected(reservation)

  const handleCardActivate = () => {
    if (!enableWorkspaceSelection) return
    workspace.selectReservation(reservation, {
      scrollFloor: true,
      scrollTimeline: false,
      openGuestProfile: false,
    })
  }

  const handleOpenGuestProfile = () => {
    workspace.selectReservation(reservation, {
      scrollFloor: true,
      scrollTimeline: false,
      openGuestProfile: true,
    })
  }

  return (
    <article
      ref={cardRef}
      className={`reservation-arrival-card tone-${arrivalTone} accent-${statusAccent} priority-${priority.tone}${isDimmed ? ' is-future-dim' : ''}${isTimelineActive ? ' is-timeline-active' : ''}${cardIsSelected ? ' is-selected is-synced' : ''}${isMoreOpen ? ' is-actions-open' : ''}`}
      data-selection-pulse={cardIsSelected ? workspace.selectionPulseKey : undefined}
      onClick={enableWorkspaceSelection ? handleCardActivate : undefined}
      onKeyDown={enableWorkspaceSelection ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          handleCardActivate()
        }
      } : undefined}
      role={enableWorkspaceSelection ? 'button' : undefined}
      tabIndex={enableWorkspaceSelection ? 0 : undefined}
    >
      <header className="reservation-card-top">
        <button
          type="button"
          className="reservation-card-identity-btn"
          onClick={(event) => {
            event.stopPropagation()
            if (enableWorkspaceSelection) {
              handleOpenGuestProfile()
            }
          }}
          aria-label={`Open guest profile for ${guestName}`}
        >
          <span className="reservation-card-avatar" aria-hidden="true">{getInitials(guestName)}</span>
          <span className="reservation-card-identity-copy">
            <h4 className="reservation-card-name">{guestName}</h4>
            <span className={`reservation-priority-badge tone-${priority.tone}`}>{priority.label}</span>
          </span>
        </button>
        <div className="reservation-card-status-column">
          <span className={`reservation-status-badge tone-${statusAccent}`}>{statusBadgeLabel}</span>
          {confidence.tone !== 'muted' ? (
            <ReservationConfidenceBadge reservation={reservation} allReservations={allReservations} />
          ) : null}
        </div>
      </header>

      <div className="reservation-card-body">
        <div className="reservation-card-row reservation-card-row-primary">
          <time className="reservation-card-arrival-time">{arrivalClock}</time>
          <span className="reservation-card-table-label">
            <span className="reservation-card-table-icon" aria-hidden="true">🍽</span>
            {tableLabel}
          </span>
          <span className="reservation-card-party-size" aria-label={`${guestCount} guests`}>
            <span aria-hidden="true">👥</span>
            {guestCount}
          </span>
          {showDate ? (
            <span className="reservation-card-date reservation-card-secondary">{formatEuropeanDayMonth(reservation.date) || '—'}</span>
          ) : null}
        </div>

        <div className="reservation-card-row reservation-card-row-meta reservation-card-secondary-row">
          <span>{areaLabel}</span>
          <span className="reservation-card-meta-dot" aria-hidden="true">·</span>
          <span>{reservationType}</span>
          {guestBadges.length > 0 ? (
            <>
              <span className="reservation-card-meta-dot" aria-hidden="true">·</span>
              <span className="reservation-card-meta-badges-inline">
                {guestBadges.slice(0, 2).map((badge) => (
                  <span key={`${reservation.id}-${badge.label}`} className={`guest-intelligence-badge tone-${badge.tone}`}>
                    {badge.label}
                  </span>
                ))}
              </span>
            </>
          ) : specialOccasion ? (
            <>
              <span className="reservation-card-meta-dot" aria-hidden="true">·</span>
              <span>{specialOccasion}</span>
            </>
          ) : null}
        </div>

        {notesPreview ? (
          <p className="reservation-card-notes" title={notesPreview}>{notesPreview}</p>
        ) : null}
      </div>

      <footer className="reservation-card-actions" onClick={(event) => event.stopPropagation()}>
        <ReservationQuickActions
          reservation={reservation}
          nowMinutes={nowMinutes}
          todayKey={todayKey}
          isSaving={isSaving}
          isMoreOpen={isMoreOpen}
          onToggleMore={onToggleMore}
          onOpenEditReservation={onOpenEditReservation}
          onQuickStatusUpdate={onQuickStatusUpdate}
          onOpenAddNote={onOpenAddNote}
          onOpenGuestProfile={handleOpenGuestProfile}
        />
      </footer>

      <ReservationCardProgressBar reservation={reservation} nowMinutes={nowMinutes} todayKey={todayKey} />
    </article>
  )
}

function ServiceTimelinePanel({
  arrivalBoardRows,
  nowMinutes,
  todayKey,
  currentServiceHour,
  isLoading,
  filteredCount,
  serviceHealthMetrics,
  serviceInsights,
  arrivalWaves,
  timelineEmptyState = null,
  showIntelligence = false,
  timelineNowPositionPercent,
  activeTimelineReservationId,
  nextArrivalId,
  sharedCardProps,
  openMoreReservationId,
  onToggleMore,
}) {
  const {
    isSelected,
    timelineScrollRef,
    timelineCardRefs,
  } = useReservationWorkspace()

  return (
    <div className="reservations-timeline-panel">
      {showIntelligence ? (
        <div className="reservations-service-intelligence">
          <ServiceHealthCard metrics={serviceHealthMetrics} />
          <ServiceInsightsPanel insights={serviceInsights} />
          <ArrivalWavePanel waves={arrivalWaves} />
        </div>
      ) : null}

      {filteredCount === 0 && !isLoading ? (
        <div className={`reservations-empty-state${timelineEmptyState?.className ? ` ${timelineEmptyState.className}` : ''}`}>
          <p className="reservations-empty-icon" aria-hidden="true">🍽</p>
          <h4>{timelineEmptyState?.title ?? 'No upcoming reservations'}</h4>
          <p>{timelineEmptyState?.copy ?? 'Your arrival board is clear for the selected filters.'}</p>
        </div>
      ) : (
        <div
          className="reservations-timeline reservations-service-timeline"
          ref={timelineScrollRef}
          data-live-timeline="true"
        >
          <TimelineLiveNowRail
            positionPercent={timelineNowPositionPercent}
            nowMinutes={nowMinutes}
            todayKey={todayKey}
          />

          {arrivalBoardRows.map((row, index) => {
            if (row.type === 'hour') {
              const isCurrentHour = row.hour === currentServiceHour

              return (
                <div
                  key={`hour-${row.hour}-${index}`}
                  className={`reservations-timeline-hour${isCurrentHour ? ' is-current-hour' : ''}`}
                >
                  <span className="reservations-timeline-hour-label">
                    {String(row.hour).padStart(2, '0')}:00
                  </span>
                  <div className="reservations-timeline-hour-track" aria-hidden="true">
                    <span className="reservations-timeline-hour-separator" />
                    <span className="reservations-timeline-hour-line" />
                  </div>
                </div>
              )
            }

            if (row.type === 'now') {
              return (
                <div
                  key={`now-anchor-${index}`}
                  className="reservations-timeline-now-anchor"
                  aria-hidden="true"
                />
              )
            }

            const reservation = row.reservation
            const arrivalTone = getReservationArrivalTone(reservation, {
              nextArrivalId,
              nowMinutes,
              todayKey,
            })
            const isTimelineActive = String(reservation.id) === String(activeTimelineReservationId)
            const cardIsSelected = isSelected(reservation)

            return (
              <div
                key={`card-wrap-${reservation.id}`}
                className={`reservations-timeline-item${isTimelineActive ? ' is-active' : ''}${cardIsSelected ? ' is-selected is-synced' : ''}`}
                data-service-tone={arrivalTone}
              >
                <div className="reservations-timeline-marker-slot" aria-hidden="true">
                  <span className={`reservations-timeline-marker-dot tone-${arrivalTone}${isTimelineActive ? ' is-active' : ''}`} />
                  <span className="reservations-timeline-connector" />
                </div>
                <ReservationArrivalCard
                  {...sharedCardProps}
                  reservation={reservation}
                  arrivalTone={arrivalTone}
                  isTimelineActive={isTimelineActive}
                  cardRef={(node) => { timelineCardRefs.current[reservation.id] = node }}
                  isDimmed={isReservationFutureDim(reservation, nowMinutes)}
                  isMoreOpen={String(openMoreReservationId) === String(reservation.id)}
                  onToggleMore={() => onToggleMore(reservation.id)}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function HostReservationListControls({
  listSort,
  onListSortChange,
  showHourFilter,
  onToggleHourFilter,
  hasHourSlots,
}) {
  return (
    <div className="host-reservation-list-controls">
      <div className="host-reservation-list-toolbar">
        <label className="host-reservation-list-sort">
          <span>Sort</span>
          <select
            value={listSort}
            onChange={(event) => onListSortChange(event.target.value)}
            aria-label="Sort reservations"
          >
            {HOST_LIST_SORTS.map((sort) => (
              <option key={sort.id} value={sort.id}>{sort.label}</option>
            ))}
          </select>
        </label>
        {hasHourSlots ? (
          <button
            type="button"
            className={`host-hour-filter-toggle${showHourFilter ? ' active' : ''}`}
            onClick={onToggleHourFilter}
            aria-pressed={showHourFilter}
          >
            By hour
          </button>
        ) : null}
      </div>
    </div>
  )
}

function ReservationsUnifiedCanvas({
  timelinePanelProps,
  floorPlanProps,
  listReservations,
  listSort,
  onListSortChange,
  hostServicePressureSlots,
  serviceHourFilter,
  onServiceHourFilterChange,
  isLoading,
  searchTerm = '',
  dailySnapshot = null,
  isViewingToday = true,
  onQuickStatusUpdate,
  isSavingStatus,
  hostProblemFilterOptions = null,
  upcomingNext30Min = 0,
  nextArrivalHint = '',
  nextArrivalId = null,
}) {
  const { layout, hasDisplayableLayout, reload } = usePublishedFloorPlan()
  const canEditFloorPlan = floorPlanProps.canEditFloorPlan !== false
  const {
    canvasRef,
    isTimelineCollapsed,
    setIsTimelineCollapsed,
    hostEditingReservation,
    hostEditForm,
    setHostEditForm,
    isHostFloorPickActive,
    floorPlanMode,
    setFloorPlanMode,
    closeHostEdit,
    clearSelection,
    startHostFloorPick,
    onHostEditSave,
    onHostEditDelete,
    onReservationNotice,
    isSavingHostEdit,
    activeFloorAreaId,
    setActiveFloorAreaId,
    openHostEdit,
    isSelected,
    draggingReservationId,
    setDraggingReservationId,
    clearDragState,
  } = useReservationWorkspace()
  const [isSavingListStatus, setIsSavingListStatus] = useState(false)
  const [showHourFilter, setShowHourFilter] = useState(false)

  const hostServiceDashboard = useMemo(() => (
    buildHostServiceDashboard({
      reservations: floorPlanProps.listReservations ?? listReservations,
      nowMinutes: floorPlanProps.nowMinutes,
      todayKey: floorPlanProps.todayKey,
      layout,
      seatings: floorPlanProps.seatings ?? [],
      selectedSeating: floorPlanProps.selectedSeating ?? null,
      seatingsById: buildSeatingsById(floorPlanProps.seatings ?? []),
      problemOptions: hostProblemFilterOptions ?? {},
    })
  ), [floorPlanProps, hostProblemFilterOptions, layout, listReservations])

  const handleStatusChange = async (reservation, status) => {
    if (!onQuickStatusUpdate) return

    setIsSavingListStatus(true)
    try {
      await onQuickStatusUpdate(reservation, status)
    } finally {
      setIsSavingListStatus(false)
    }
  }

  const handleReturnToHost = useCallback(async (transition) => {
    const result = await completeReturnToHost({
      transition,
      hasDisplayableLayout,
      layout,
      activeFloorAreaId,
      reload,
      useControlledReload: false,
    })

    if (!result?.ok) {
      return result
    }

    if (result.reload) {
      return result
    }

    setActiveFloorAreaId(result.activeFloorAreaId)
    return { ok: true }
  }, [activeFloorAreaId, hasDisplayableLayout, layout, reload, setActiveFloorAreaId])

  return (
    <div className={`host-operations-canvas-shell${floorPlanMode === 'edit' ? ' is-layout-edit-mode' : ''}`}>
    <div
      ref={canvasRef}
      className="host-operations-canvas"
      data-timeline-collapsed={isTimelineCollapsed ? 'true' : 'false'}
      data-floor-plan-mode={floorPlanMode}
    >
      {floorPlanMode !== 'edit' ? (
      <section className="host-operations-list" aria-label="Reservation list">
        <div className="host-operations-list-sticky">
          <HostManagerSummaryBar
            dashboard={hostServiceDashboard}
            dailySnapshot={dailySnapshot}
            upcomingNext30Min={upcomingNext30Min}
            isViewingToday={isViewingToday}
          />
          {showHourFilter ? (
            <HostServicePressureBar
              slots={hostServicePressureSlots}
              nowMinutes={floorPlanProps.nowMinutes}
              selectedHour={serviceHourFilter}
              onHourSelect={onServiceHourFilterChange}
            />
          ) : null}
          <HostReservationListControls
            listSort={listSort}
            onListSortChange={onListSortChange}
            showHourFilter={showHourFilter}
            onToggleHourFilter={() => setShowHourFilter((current) => !current)}
            hasHourSlots={hostServicePressureSlots.length > 0}
          />
        </div>
        <div className="host-operations-list-scroll">
          <HostReservationList
            reservations={listReservations}
            nowMinutes={floorPlanProps.nowMinutes}
            todayKey={floorPlanProps.todayKey}
            isLoading={isLoading}
            isSelected={isSelected}
            hostEditingReservation={hostEditingReservation}
            draggingReservationId={draggingReservationId}
            onOpenEdit={openHostEdit}
            onDragStart={(event, reservation) => {
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('application/x-reservation-id', String(reservation.id))
              event.dataTransfer.setData('text/plain', String(reservation.id))
              setDraggingReservationId(String(reservation.id))
            }}
            onDragEnd={clearDragState}
            isSavingStatus={isSavingListStatus || isSavingStatus}
            nextArrivalId={nextArrivalId}
            listFilter="All"
            searchTerm={searchTerm}
            dailySnapshot={dailySnapshot}
            isViewingToday={isViewingToday}
            problemFilterOptions={hostProblemFilterOptions}
            onStatusChange={handleStatusChange}
            helpers={HOST_LIST_HELPERS}
          />
        </div>
      </section>
      ) : null}

      <section className="host-operations-floor" aria-label="Floor plan">
        {floorPlanMode === 'edit' && canEditFloorPlan ? (
          <EmbeddedFloorPlanEditor
            onExit={() => setFloorPlanMode('view')}
            initialAreaId={activeFloorAreaId}
            onActiveAreaChange={setActiveFloorAreaId}
            onReturnToHost={handleReturnToHost}
          />
        ) : (
          <FloorPlanView {...floorPlanProps} isCompact />
        )}
      </section>

      {floorPlanMode !== 'edit' ? (
      <section className={`host-operations-timeline${isTimelineCollapsed ? ' is-collapsed' : ''}`} aria-label="Service timeline">
        <button
          type="button"
          className="host-timeline-toggle-bar"
          onClick={() => setIsTimelineCollapsed((current) => !current)}
          aria-expanded={!isTimelineCollapsed}
        >
          <span className={`host-timeline-chevron${isTimelineCollapsed ? '' : ' is-expanded'}`} aria-hidden="true">
            {isTimelineCollapsed ? '▲' : '▼'}
          </span>
          <span>{isTimelineCollapsed ? 'Open timeline' : 'Close timeline'}</span>
          {isTimelineCollapsed && nextArrivalHint ? (
            <span className="host-timeline-next-hint">{nextArrivalHint}</span>
          ) : null}
        </button>
        {!isTimelineCollapsed ? (
          <ServiceTimelinePanel {...timelinePanelProps} showIntelligence={false} />
        ) : null}
      </section>
      ) : null}
    </div>

    {hostEditingReservation && floorPlanMode !== 'edit' ? (
      <div className="host-reservation-edit-overlay" role="presentation">
        <HostReservationEditErrorBoundary
          reservationId={hostEditingReservation.id}
          onClose={closeHostEdit}
        >
          <HostReservationEditPanel
            variant="drawer"
            reservation={hostEditingReservation}
            form={hostEditForm}
            layout={layout}
            reservations={floorPlanProps.allReservations}
            todayKey={floorPlanProps.todayKey}
            seatings={floorPlanProps.seatings ?? []}
            onChange={setHostEditForm}
            onSave={async () => {
              if (!onHostEditSave) return
              if (!hostEditForm) {
                onReservationNotice?.('Reservation form is not ready. Please try again.')
                return
              }
              const result = await onHostEditSave(
                hostEditingReservation,
                hostEditForm,
                floorPlanProps.todayKey,
              )
              if (!result?.saved) return
              closeHostEdit()
              if (result.movedOffSelectedDate) {
                clearSelection()
              }
            }}
            onValidationError={onReservationNotice}
            onDelete={async (id) => {
              if (!onHostEditDelete) return
              const deleted = await onHostEditDelete(id)
              if (!deleted) return
              clearSelection()
              closeHostEdit()
            }}
            onCancel={closeHostEdit}
            onStartFloorPick={startHostFloorPick}
            isFloorPickActive={isHostFloorPickActive}
            isSaving={isSavingHostEdit}
          />
        </HostReservationEditErrorBoundary>
      </div>
    ) : null}
    </div>
  )
}

function ReservationsWorkspaceBody({
  reservations,
  onOpenAddReservation,
  onOpenQuickReservation,
  onOpenCommandPalette,
  isCommandPaletteOpen,
  onCloseCommandPalette,
  onOpenEditReservation,
  onQuickStatusUpdate,
  onQuickNoteUpdate,
  onTableReassign,
  onAssignReservationTables,
  onHostEditSave,
  onHostEditDelete,
  isLoading,
  noticeMessage,
  onReservationNotice,
  isSaving,
  workspaceTimeZone = '',
  onOpenHostMode,
  canEditFloorPlan = true,
  reservationSeatings = [],
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [listSort, setListSort] = useState('service')
  const [serviceHourFilter, setServiceHourFilter] = useState(null)
  const [selectedServiceSeatingId, setSelectedServiceSeatingId] = useState('')
  const [liveNow, setLiveNow] = useState(() => getLocalNow())
  const [noteDraftReservation, setNoteDraftReservation] = useState(null)
  const [noteDraftValue, setNoteDraftValue] = useState('')
  const [openMoreReservationId, setOpenMoreReservationId] = useState(null)

  useEffect(() => {
    const tick = () => setLiveNow(getLocalNow())

    tick()

    const now = getLocalNow()
    const msUntilNextMinute = ((60 - now.getSeconds()) * 1000) - now.getMilliseconds()
    let intervalId = null

    const timeoutId = window.setTimeout(() => {
      tick()
      intervalId = window.setInterval(tick, 60_000)
    }, Math.max(msUntilNextMinute, 0))

    return () => {
      window.clearTimeout(timeoutId)
      if (intervalId !== null) window.clearInterval(intervalId)
    }
  }, [])

  const workspaceTodayKey = useMemo(
    () => resolveHostWorkspaceDateKey(liveNow, workspaceTimeZone),
    [liveNow, workspaceTimeZone],
  )
  const workspaceTodayRef = useRef(workspaceTodayKey)
  const [selectedDateKey, setSelectedDateKey] = useState(workspaceTodayKey)
  const nowMinutes = liveNow.getHours() * 60 + liveNow.getMinutes()
  const selectedDateLabel = useMemo(
    () => formatHostWorkspaceDateNavLabel(selectedDateKey, workspaceTodayKey),
    [selectedDateKey, workspaceTodayKey],
  )
  const isViewingToday = selectedDateKey === workspaceTodayKey

  useEffect(() => {
    const previousToday = workspaceTodayRef.current
    if (previousToday !== workspaceTodayKey) {
      setSelectedDateKey((current) => (
        current === previousToday ? workspaceTodayKey : current
      ))
      workspaceTodayRef.current = workspaceTodayKey
    }
  }, [workspaceTodayKey])

  const handlePreviousDay = useCallback(() => {
    setServiceHourFilter(null)
    setSelectedDateKey((current) => shiftHostWorkspaceDateKey(current, -1))
  }, [])

  const handleNextDay = useCallback(() => {
    setServiceHourFilter(null)
    setSelectedDateKey((current) => shiftHostWorkspaceDateKey(current, 1))
  }, [])

  const handleGoToToday = useCallback(() => {
    setServiceHourFilter(null)
    setSelectedDateKey(workspaceTodayKey)
  }, [workspaceTodayKey])

  const handleSelectDate = useCallback((dateKey) => {
    setServiceHourFilter(null)
    setSelectedDateKey(normalizeReservationDateKey(dateKey))
  }, [])

  const workspaceReservations = useMemo(
    () => getHostWorkspaceReservations(reservations, selectedDateKey, workspaceTimeZone),
    [reservations, selectedDateKey, workspaceTimeZone],
  )

  const dailySnapshot = useMemo(
    () => buildDailyServiceSnapshot(workspaceReservations, nowMinutes, selectedDateKey, liveNow),
    [liveNow, nowMinutes, selectedDateKey, workspaceReservations],
  )

  const timelineEmptyState = useMemo(
    () => getTimelineEmptyState({
      snapshot: dailySnapshot,
      isViewingToday,
    }),
    [dailySnapshot, isViewingToday],
  )

  const serviceHealthMetrics = useMemo(
    () => buildServiceHealthMetrics(workspaceReservations, nowMinutes, selectedDateKey, liveNow),
    [liveNow, nowMinutes, selectedDateKey, workspaceReservations],
  )

  const serviceInsights = useMemo(
    () => buildServiceInsights(workspaceReservations, nowMinutes, selectedDateKey, reservations),
    [nowMinutes, reservations, selectedDateKey, workspaceReservations],
  )

  const arrivalWaves = useMemo(
    () => buildArrivalWaves(workspaceReservations, nowMinutes, selectedDateKey),
    [nowMinutes, selectedDateKey, workspaceReservations],
  )

  const searchNeedle = searchTerm.trim().toLowerCase()

  const hostProblemFilterOptions = useMemo(() => ({
    includeUnassigned: true,
    includeCapacity: true,
    isUnassigned: isReservationUnassigned,
    hasCapacityWarning: reservationHasCapacityWarning,
  }), [])

  const filteredWorkspaceReservations = useMemo(() => (
    workspaceReservations.filter((reservation) => (
      reservationMatchesSearch(reservation, searchNeedle)
    ))
  ), [searchNeedle, workspaceReservations])

  const hostListWithoutHourFilter = useMemo(
    () => filteredWorkspaceReservations,
    [filteredWorkspaceReservations],
  )

  const upcomingNext30MinCount = useMemo(() => (
    workspaceReservations.filter((reservation) => {
      const arrivalMinutes = parseTimeToMinutes(reservation.time)
      if (arrivalMinutes === null || arrivalMinutes > nowMinutes + 30) return false
      return isReservationUpcomingForHostFilter(reservation, nowMinutes, selectedDateKey)
    }).length
  ), [nowMinutes, selectedDateKey, workspaceReservations])

  const hostServicePressureSlots = useMemo(
    () => buildHostServiceHourPressureSlots(hostListWithoutHourFilter),
    [hostListWithoutHourFilter],
  )

  const hostListReservations = useMemo(() => {
    const filtered = serviceHourFilter !== null && serviceHourFilter !== undefined
      ? hostListWithoutHourFilter.filter((reservation) => (
        reservationMatchesServiceHourBucket(reservation, serviceHourFilter)
      ))
      : hostListWithoutHourFilter

    if (listSort === 'service') return filtered

    return sortHostReservations(filtered, listSort, nowMinutes, selectedDateKey)
  }, [
    hostListWithoutHourFilter,
    listSort,
    nowMinutes,
    serviceHourFilter,
    selectedDateKey,
  ])

  const handleServiceHourFilterChange = (hour) => {
    setServiceHourFilter(hour)
  }

  const nextArrivalId = useMemo(() => {
    const sorted = [...workspaceReservations].sort(
      (left, right) => (parseTimeToMinutes(left.time) ?? 0) - (parseTimeToMinutes(right.time) ?? 0),
    )

    const upcoming = sorted.find((reservation) => {
      const status = normalizeReservationStatus(reservation.status)
      if (isTerminalReservationStatus(status) || isReservationInHouseStatus(status)) return false
      const minutes = parseTimeToMinutes(reservation.time)
      return minutes !== null
        && minutes >= nowMinutes
        && (isUpcomingReservationStatus(status) || status === 'Waiting')
    })
    if (upcoming) return upcoming.id

    const needsAttention = sorted.find((reservation) => {
      const status = normalizeReservationStatus(reservation.status)
      if (isTerminalReservationStatus(status) || isReservationInHouseStatus(status)) return false
      const displayStatus = getReservationDisplayStatus(reservation, nowMinutes, selectedDateKey)
      return displayStatus === 'Late Booking' || status === 'Waiting'
    })
    return needsAttention?.id ?? null
  }, [nowMinutes, workspaceReservations, selectedDateKey])

  const nextArrival = useMemo(() => {
    if (!nextArrivalId) return null
    return workspaceReservations.find(
      (reservation) => String(reservation.id) === String(nextArrivalId),
    ) ?? null
  }, [nextArrivalId, workspaceReservations])

  const nextArrivalHint = useMemo(
    () => formatHostNextArrivalHint(nextArrival, nowMinutes),
    [nextArrival, nowMinutes],
  )


  const activeTimelineReservationId = useMemo(
    () => getActiveTimelineReservationId(filteredWorkspaceReservations, nowMinutes, selectedDateKey),
    [filteredWorkspaceReservations, nowMinutes, selectedDateKey],
  )

  const currentServiceHour = Math.floor(nowMinutes / 60)

  const arrivalBoardRows = useMemo(
    () => buildArrivalBoardRows(filteredWorkspaceReservations, nowMinutes),
    [filteredWorkspaceReservations, nowMinutes],
  )

  const timelineNowPositionPercent = useMemo(
    () => getTimelineNowPositionPercent(arrivalBoardRows, nowMinutes),
    [arrivalBoardRows, nowMinutes],
  )

  const handleOpenAddNote = (reservation) => {
    setNoteDraftReservation(reservation)
    setNoteDraftValue(`${reservation.notes ?? ''}`)
    setOpenMoreReservationId(null)
  }

  const handleCloseAddNote = () => {
    setNoteDraftReservation(null)
    setNoteDraftValue('')
  }

  const handleSaveNote = async (event) => {
    event.preventDefault()
    if (!noteDraftReservation || !onQuickNoteUpdate) return
    await onQuickNoteUpdate(noteDraftReservation, noteDraftValue.trim())
    handleCloseAddNote()
  }

  const handleToggleMore = (reservationId) => {
    setOpenMoreReservationId((current) => (
      String(current) === String(reservationId) ? null : reservationId
    ))
  }

  const openAddReservationForServiceDate = useCallback((prefill) => {
    const safePrefill = prefill?.nativeEvent || prefill?.target ? {} : (prefill ?? {})
    onOpenAddReservation({
      ...safePrefill,
      date: normalizeReservationDateKey(safePrefill.date ?? selectedDateKey),
    })
  }, [onOpenAddReservation, selectedDateKey])

  const sharedCardProps = {
    allReservations: reservations,
    isSaving,
    nowMinutes,
    todayKey: selectedDateKey,
    onOpenAddNote: handleOpenAddNote,
    onOpenEditReservation,
    onQuickStatusUpdate,
  }

  const timelinePanelProps = {
    arrivalBoardRows,
    nowMinutes,
    todayKey: selectedDateKey,
    currentServiceHour,
    isLoading,
    filteredCount: filteredWorkspaceReservations.length,
    serviceHealthMetrics,
    serviceInsights,
    arrivalWaves,
    timelineEmptyState,
    timelineNowPositionPercent,
    activeTimelineReservationId,
    nextArrivalId,
    sharedCardProps,
    openMoreReservationId,
    onToggleMore: handleToggleMore,
  }

  const floorPlanProps = {
    reservations: filteredWorkspaceReservations,
    allReservations: reservations,
    listReservations: hostListReservations,
    todayKey: selectedDateKey,
    nowMinutes,
    isSaving,
    canEditFloorPlan,
    onTableReassign,
    onAssignReservationTables,
    onQuickStatusUpdate,
    onOpenAddReservation: openAddReservationForServiceDate,
    onOpenReservation: onOpenEditReservation,
    onHostEditSave,
    onReservationNotice,
    canManageAssignment: Boolean(onHostEditSave),
    seatings: reservationSeatings,
    selectedSeating: reservationSeatings.find((entry) => entry.id === selectedServiceSeatingId) ?? null,
    onSelectedSeatingChange: setSelectedServiceSeatingId,
  }

  useEffect(() => {
    const activeSeatings = getActiveSeatingsForDate(reservationSeatings, selectedDateKey)
    if (!activeSeatings.length) {
      setSelectedServiceSeatingId('')
      return
    }

    setSelectedServiceSeatingId((current) => (
      activeSeatings.some((entry) => entry.id === current) ? current : activeSeatings[0].id
    ))
  }, [reservationSeatings, selectedDateKey])

  return (
      <ReservationWorkspaceProvider
        filteredTodayReservations={filteredWorkspaceReservations}
        onHostEditSave={onHostEditSave}
        onHostEditDelete={onHostEditDelete}
        onReservationNotice={onReservationNotice}
        isSavingHostEdit={isSaving}
        reservationSeatings={reservationSeatings}
      >
        <ReservationsWorkspaceContent
        reservations={reservations}
        onOpenAddReservation={openAddReservationForServiceDate}
        onOpenQuickReservation={onOpenQuickReservation}
        onOpenCommandPalette={onOpenCommandPalette}
        isCommandPaletteOpen={isCommandPaletteOpen}
        onCloseCommandPalette={onCloseCommandPalette}
        onOpenEditReservation={onOpenEditReservation}
        onQuickStatusUpdate={onQuickStatusUpdate}
        onTableReassign={onTableReassign}
        onOpenAddNote={handleOpenAddNote}
        isLoading={isLoading}
        noticeMessage={noticeMessage}
        isSaving={isSaving}
        todayKey={selectedDateKey}
        todayLabel={selectedDateLabel}
        isViewingToday={isViewingToday}
        workspaceTodayKey={workspaceTodayKey}
        onPreviousDay={handlePreviousDay}
        onNextDay={handleNextDay}
        onGoToToday={handleGoToToday}
        onSelectDate={handleSelectDate}
        nowMinutes={nowMinutes}
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        listSort={listSort}
        onListSortChange={setListSort}
        hostListReservations={hostListReservations}
        hostServicePressureSlots={hostServicePressureSlots}
        serviceHourFilter={serviceHourFilter}
        onServiceHourFilterChange={handleServiceHourFilterChange}
        hostProblemFilterOptions={hostProblemFilterOptions}
        upcomingNext30MinCount={upcomingNext30MinCount}
        nextArrivalHint={nextArrivalHint}
        nextArrivalId={nextArrivalId}
        dailySnapshot={dailySnapshot}
        timelinePanelProps={timelinePanelProps}
        floorPlanProps={floorPlanProps}
        sharedCardProps={sharedCardProps}
        openMoreReservationId={openMoreReservationId}
        onToggleMore={handleToggleMore}
        noteDraftReservation={noteDraftReservation}
        noteDraftValue={noteDraftValue}
        onNoteDraftValueChange={setNoteDraftValue}
        onCloseAddNote={handleCloseAddNote}
        onSaveNote={handleSaveNote}
        onOpenHostMode={onOpenHostMode}
        canEditFloorPlan={canEditFloorPlan}
      />
      </ReservationWorkspaceProvider>
  )
}

function ReservationsWorkspaceContent({
  reservations,
  onOpenAddReservation,
  onOpenQuickReservation,
  onOpenCommandPalette: _onOpenCommandPalette,
  isCommandPaletteOpen,
  onCloseCommandPalette,
  onOpenEditReservation,
  onQuickStatusUpdate,
  onTableReassign: _onTableReassign,
  onOpenAddNote,
  isLoading,
  noticeMessage,
  isSaving,
  todayKey,
  todayLabel,
  isViewingToday,
  workspaceTodayKey,
  onPreviousDay,
  onNextDay,
  onGoToToday,
  onSelectDate,
  nowMinutes,
  searchTerm,
  onSearchTermChange,
  listSort,
  onListSortChange,
  hostListReservations,
  hostServicePressureSlots,
  serviceHourFilter,
  onServiceHourFilterChange,
  hostProblemFilterOptions = null,
  upcomingNext30MinCount = 0,
  nextArrivalHint = '',
  nextArrivalId,
  dailySnapshot = null,
  timelinePanelProps,
  floorPlanProps,
  sharedCardProps: _sharedCardProps,
  openMoreReservationId: _openMoreReservationId,
  onToggleMore: _onToggleMore,
  noteDraftReservation,
  noteDraftValue,
  onNoteDraftValueChange,
  onCloseAddNote,
  onSaveNote,
  onOpenHostMode,
  canEditFloorPlan: _canEditFloorPlan = true,
}) {
  const {
    selectedReservation,
    isGuestProfileOpen,
    clearSelection,
    floorPlanMode,
  } = useReservationWorkspace()

  const isLayoutEditMode = floorPlanMode === 'edit'

  return (
    <section className={`staff-page reservations-workspace reservations-workspace-host${isLayoutEditMode ? ' is-layout-edit-mode' : ''}`}>
      {!isLayoutEditMode ? (
      <div className="reservations-command-sticky">
        <header className="reservations-host-header">
          <div className="reservations-host-header-main">
            <h2>Reservations</h2>
            <p className="reservations-host-header-date">
              {formatHostWorkspaceShortDateLabel(todayKey)}
            </p>
            <HostWorkspaceDateNav
              dateTime={todayKey}
              label={todayLabel}
              workspaceTodayKey={workspaceTodayKey}
              isViewingToday={isViewingToday}
              onPreviousDay={onPreviousDay}
              onNextDay={onNextDay}
              onGoToToday={onGoToToday}
              onSelectDate={onSelectDate}
            />
            {onOpenHostMode ? (
              <button
                type="button"
                className="mobile-reservations-open-host-btn"
                onClick={onOpenHostMode}
              >
                Open Host Mode
              </button>
            ) : null}
          </div>
          <div className="reservations-host-header-actions">
            <label className="reservations-search" aria-label="Search reservations">
              <span aria-hidden="true">⌕</span>
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => onSearchTermChange(event.target.value)}
                placeholder="Search guest or table"
              />
            </label>
            <button type="button" className="primary-btn reservations-add-btn" onClick={onOpenAddReservation} disabled={isSaving}>
              {isSaving ? 'Saving…' : '+ Reservation'}
            </button>
          </div>
        </header>
      </div>
      ) : (
        <header className="reservations-layout-edit-page-header">
          <div>
            <p className="eyebrow">Floor plan</p>
            <h3>Edit layout</h3>
          </div>
        </header>
      )}

      {!isLayoutEditMode && noticeMessage ? (
        <div key={noticeMessage} className="reservations-toast" role="status" aria-live="polite">
          {noticeMessage}
        </div>
      ) : null}
      {!isLayoutEditMode && isLoading ? <div className="staff-status-banner reservations-notice">Loading reservations…</div> : null}

      <div className="reservations-host-panel">
        <ReservationsUnifiedCanvas
          timelinePanelProps={timelinePanelProps}
          floorPlanProps={floorPlanProps}
          listReservations={hostListReservations}
          listSort={listSort}
          onListSortChange={onListSortChange}
          hostServicePressureSlots={hostServicePressureSlots}
          serviceHourFilter={serviceHourFilter}
          onServiceHourFilterChange={onServiceHourFilterChange}
          hostProblemFilterOptions={hostProblemFilterOptions}
          upcomingNext30Min={upcomingNext30MinCount}
          nextArrivalHint={nextArrivalHint}
          nextArrivalId={nextArrivalId}
          searchTerm={searchTerm}
          dailySnapshot={dailySnapshot}
          isViewingToday={isViewingToday}
          isLoading={isLoading}
          onQuickStatusUpdate={onQuickStatusUpdate}
          isSavingStatus={isSaving}
        />
      </div>

      {selectedReservation && isGuestProfileOpen && !isLayoutEditMode ? (
        <GuestProfileDrawer
          reservation={selectedReservation}
          allReservations={reservations}
          nowMinutes={nowMinutes}
          todayKey={todayKey}
          onClose={clearSelection}
          onOpenEditReservation={onOpenEditReservation}
          onQuickStatusUpdate={onQuickStatusUpdate}
        />
      ) : null}

      {isCommandPaletteOpen ? (
        <ReservationsCommandPalette
          reservations={reservations}
          todayKey={todayKey}
          nowMinutes={nowMinutes}
          isSaving={isSaving}
          onClose={onCloseCommandPalette}
          onOpenAddReservation={onOpenAddReservation}
          onOpenQuickReservation={onOpenQuickReservation}
          onOpenEditReservation={onOpenEditReservation}
          onQuickStatusUpdate={onQuickStatusUpdate}
          onOpenAddNote={onOpenAddNote}
        />
      ) : null}

      {noteDraftReservation ? (
        <div className="employee-modal-backdrop" onClick={onCloseAddNote}>
          <div className="employee-modal blend-compact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Guest note</p>
                <h3>{formatReservationGuestName(noteDraftReservation.guestName)}</h3>
              </div>
              <button type="button" className="icon-btn" onClick={onCloseAddNote}>✕</button>
            </div>
            <form className="employee-form" onSubmit={onSaveNote}>
              <label className="form-field full-width">
                <span>Note</span>
                <textarea
                  rows="4"
                  value={noteDraftValue}
                  onChange={(event) => onNoteDraftValueChange(event.target.value)}
                  placeholder="Add service notes, preferences, or reminders"
                />
              </label>
              <div className="modal-actions">
                <button type="button" className="ghost-btn" onClick={onCloseAddNote}>Cancel</button>
                <button type="submit" className="primary-btn" disabled={isSaving}>
                  {isSaving ? 'Saving…' : 'Save note'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function ReservationsView(props) {
  return <ReservationsWorkspaceBody {...props} />
}

function getInventoryStatusClass(status) {
  if (status === 'Out of Stock') return 'inventory-out'
  if (status === 'Low Stock') return 'inventory-low'
  return 'inventory-in'
}

function getInventoryItemValue(item) {
  return (Number(item?.quantity) || 0) * (Number(item?.cost) || 0)
}

function formatInventoryOrderNeed(orderNeeded, unit) {
  const trimmedUnit = `${unit ?? ''}`.trim()
  return trimmedUnit ? `${orderNeeded} ${trimmedUnit}` : `${orderNeeded}`
}

function InventoryUnitField({ value, onChange, disabled = false }) {
  const selectValue = getInventoryUnitSelectValue(value)
  const showCustomInput = selectValue === INVENTORY_UNIT_CUSTOM_VALUE

  return (
    <div className="inventory-unit-field">
      <select
        className="inventory-unit-select"
        value={selectValue}
        disabled={disabled}
        onChange={(event) => {
          const nextValue = event.target.value
          if (nextValue === INVENTORY_UNIT_CUSTOM_VALUE) {
            onChange(isInventoryUnitPreset(value) ? '' : `${value ?? ''}`.trim())
            return
          }
          onChange(nextValue)
        }}
      >
        <option value="">Select unit</option>
        {INVENTORY_UNIT_PRESETS.map((preset) => (
          <option key={preset} value={preset}>{preset}</option>
        ))}
        <option value={INVENTORY_UNIT_CUSTOM_VALUE}>Custom</option>
      </select>
      {showCustomInput ? (
        <input
          className="inventory-unit-custom-input"
          value={value ?? ''}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Enter custom unit"
        />
      ) : null}
    </div>
  )
}

function InventoryReorderContent({
  items,
  onOpenEditItem,
  copyNotice,
  onCopyNotice,
  showActions = true,
  canManage = false,
  onClose,
}) {
  const summary = useMemo(() => buildInventoryReorderSummary(items), [items])

  const handleCopyOrder = async () => {
    if (summary.reorderCount === 0) return

    const text = buildInventoryReorderCopyText(summary)

    try {
      if (!navigator?.clipboard?.writeText) {
        throw new Error('Clipboard unavailable')
      }
      await navigator.clipboard.writeText(text)
      onCopyNotice?.('Order copied to clipboard.')
    } catch {
      onCopyNotice?.('Unable to copy reorder list. Please try again or copy manually.')
    }
  }

  return (
    <>
      {copyNotice ? (
        <div className="staff-status-banner inventory-reorder-copy-notice">{copyNotice}</div>
      ) : null}

      {summary.reorderCount === 0 ? (
        <div className="schedule-empty-state inventory-reorder-empty">
          <h4>All stock is at or above target.</h4>
          <p>No reorder quantities are needed right now.</p>
        </div>
      ) : (
        <>
          <div className="inventory-reorder-groups">
            {summary.groups.map((group) => (
              <section key={group.supplier} className="inventory-reorder-group">
                <header className="inventory-reorder-group-header">
                  <h4>{group.supplier}</h4>
                  <span className="inventory-reorder-group-total">
                    Est. supplier total: {formatCurrency(group.supplierTotal)}
                  </span>
                </header>
                <ul className="inventory-reorder-item-list">
                  {group.rows.map((row) => (
                    <li key={row.item.id} className="inventory-reorder-item">
                      <article className="inventory-reorder-row">
                        <div className="inventory-reorder-row-main">
                          <strong>{row.item.itemName || 'Unnamed item'}</strong>
                          <dl className="inventory-reorder-row-details">
                            <div>
                              <dt>Current</dt>
                              <dd>{row.item.quantity}</dd>
                            </div>
                            <div>
                              <dt>Target</dt>
                              <dd>{row.item.minimumQuantity}</dd>
                            </div>
                            <div>
                              <dt>Order Qty</dt>
                              <dd>{formatInventoryOrderQtyDetail(row.orderNeeded, row.item.unit)}</dd>
                            </div>
                            <div>
                              <dt>Unit Cost</dt>
                              <dd>{formatCurrency(row.unitCost)}</dd>
                            </div>
                            <div>
                              <dt>Estimated Cost</dt>
                              <dd>{formatCurrency(row.estimatedCost)}</dd>
                            </div>
                          </dl>
                        </div>
                        {canManage ? (
                          <button
                            type="button"
                            className="ghost-btn inventory-reorder-row-edit"
                            onClick={() => onOpenEditItem?.(row.item)}
                          >
                            Edit
                          </button>
                        ) : null}
                      </article>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <div className="inventory-reorder-overall-total">
            <span>Estimated order total</span>
            <strong>{formatCurrency(summary.overallTotal)}</strong>
          </div>
        </>
      )}

      {showActions ? (
        <div className="modal-actions inventory-reorder-modal-actions">
          {onClose ? (
            <button type="button" className="ghost-btn inventory-modal-action-btn" onClick={onClose}>
              Close
            </button>
          ) : null}
          <button
            type="button"
            className="primary-btn inventory-modal-action-btn"
            onClick={handleCopyOrder}
            disabled={summary.reorderCount === 0}
          >
            Copy Order
          </button>
        </div>
      ) : null}
    </>
  )
}

function buildBarRefillFormRow() {
  return {
    rowKey: `bar-refill-row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    category: '',
    subcategory: '',
    inventoryItemId: '',
    itemName: '',
    requestedQuantity: '1',
    unit: '',
    notes: '',
  }
}

function normalizeBarRefillInventoryItemId(value) {
  const trimmed = `${value ?? ''}`.trim()
  if (!trimmed || trimmed.toLowerCase() === 'nan') return null
  return trimmed
}

function formatBarRefillStatusLabel(status) {
  if (status === 'picked') return 'Picked'
  if (status === 'cancelled') return 'Cancelled'
  return 'Draft'
}

function formatBarRefillHistoryStatusLabel(status) {
  if (status === 'picked') return 'Completed'
  if (status === 'cancelled') return 'Cancelled'
  return formatBarRefillStatusLabel(status)
}

function formatBarRefillDisplayDate(value) {
  if (!value) return '—'
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return `${value}`
  return parsed.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatBarRefillDisplayNumber(refill) {
  const id = Number(refill?.id)
  if (Number.isFinite(id) && id > 0) return `#${id}`
  return ''
}

function matchesStockStatusFilter(item, statusFilter) {
  if (statusFilter === 'need-order') return needsOrder(item)
  if (statusFilter === 'low-stock') return item.status === 'Low Stock'
  if (statusFilter === 'out-of-stock') return item.status === 'Out of Stock'
  return true
}

function formatBarRefillQuantityLine(quantity, unit) {
  const trimmedUnit = `${unit ?? ''}`.trim()
  return trimmedUnit ? `${quantity} ${trimmedUnit}` : `${quantity}`
}

function BarRefillNewModal({
  isOpen,
  onClose,
  inventoryItems,
  defaultRefillDate,
  defaultCreatedBy,
  isSaving,
  onSaveDraft,
}) {
  const [form, setForm] = useState({
    refillDate: defaultRefillDate,
    createdBy: defaultCreatedBy,
    notes: '',
    rows: [buildBarRefillFormRow()],
  })

  useEffect(() => {
    if (!isOpen) return
    setForm({
      refillDate: defaultRefillDate,
      createdBy: defaultCreatedBy,
      notes: '',
      rows: [buildBarRefillFormRow()],
    })
  }, [isOpen, defaultRefillDate, defaultCreatedBy])

  const inventoryOptions = useMemo(
    () => sortInventoryItemsForBarRefill(inventoryItems ?? []).map((item) => ({
      value: `${item.id}`,
      label: formatInventoryBarRefillOptionLabel(item),
      unit: item.unit ?? '',
      itemName: item.itemName || 'Unnamed item',
      category: item.category ?? 'Other',
      subcategory: getInventorySubcategoryLabel(item),
    })),
    [inventoryItems],
  )

  const barRefillCategoryOptions = useMemo(
    () => getInventoryBarRefillCategoryOptions(inventoryItems),
    [inventoryItems],
  )

  const handleCategoryChange = (rowKey, category) => {
    const nextSubcategory = getInventorySubcategoryOptionsForCategory(category, inventoryItems)[0] ?? ''
    setForm((current) => ({
      ...current,
      rows: current.rows.map((row) => (
        row.rowKey === rowKey
          ? {
              ...row,
              category,
              subcategory: nextSubcategory,
              inventoryItemId: '',
              itemName: '',
              unit: '',
            }
          : row
      )),
    }))
  }

  const handleSubcategoryChange = (rowKey, subcategory) => {
    setForm((current) => ({
      ...current,
      rows: current.rows.map((row) => (
        row.rowKey === rowKey
          ? {
              ...row,
              subcategory,
              inventoryItemId: '',
              itemName: '',
              unit: '',
            }
          : row
      )),
    }))
  }

  const handleInventoryChange = (rowKey, inventoryItemId) => {
    const selected = inventoryOptions.find((option) => option.value === inventoryItemId)
    setForm((current) => ({
      ...current,
      rows: current.rows.map((row) => (
        row.rowKey === rowKey
          ? {
              ...row,
              inventoryItemId,
              itemName: selected?.itemName ?? '',
              unit: selected?.unit ?? '',
            }
          : row
      )),
    }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const validRows = form.rows.filter((row) => `${row.itemName ?? ''}`.trim())

    if (validRows.length === 0) {
      return
    }

    await onSaveDraft?.({
      refillDate: form.refillDate,
      createdBy: form.createdBy.trim(),
      notes: form.notes.trim(),
      items: validRows.map((row) => ({
        inventoryItemId: normalizeBarRefillInventoryItemId(row.inventoryItemId),
        itemName: row.itemName.trim(),
        requestedQuantity: Number(row.requestedQuantity) || 0,
        unit: row.unit.trim(),
        notes: row.notes.trim(),
      })),
    })
  }

  if (!isOpen) return null

  return (
    <div className="employee-modal-backdrop task-modal-backdrop" onClick={onClose}>
      <div
        className="employee-modal task-form-modal is-responsive-sheet bar-refill-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bar-refill-new-title"
      >
        <div className="drawer-header">
          <div>
            <p className="eyebrow">Bar refill</p>
            <h3 id="bar-refill-new-title">New Bar Refill</h3>
            <p className="staff-subtitle">Record what the bar needs from warehouse storage.</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close new bar refill form">
            ✕
          </button>
        </div>

        <form className="employee-form" onSubmit={handleSubmit}>
          <div className="form-grid">
            <label className="form-field">
              <span>Date</span>
              <input
                type="date"
                value={form.refillDate}
                onChange={(event) => setForm((current) => ({ ...current, refillDate: event.target.value }))}
                required
              />
            </label>
            <label className="form-field">
              <span>Created by</span>
              <input
                value={form.createdBy}
                onChange={(event) => setForm((current) => ({ ...current, createdBy: event.target.value }))}
                placeholder="Bar staff name"
              />
            </label>
          </div>

          <label className="form-field full-width">
            <span>Notes</span>
            <textarea
              rows="3"
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Shift notes or pickup context"
            />
          </label>

          <div className="bar-refill-form-rows">
            <div className="bar-refill-form-rows-header">
              <p className="eyebrow">Requested items</p>
              <button
                type="button"
                className="ghost-btn bar-refill-add-row-btn"
                onClick={() => setForm((current) => ({
                  ...current,
                  rows: [...current.rows, buildBarRefillFormRow()],
                }))}
              >
                + Add row
              </button>
            </div>

            {form.rows.map((row) => {
              const subcategoryOptions = row.category
                ? getInventorySubcategoryOptionsForCategory(row.category, inventoryItems)
                : []
              const productOptions = filterInventoryItemsForBarRefill(
                inventoryItems,
                row.category,
                row.subcategory,
              )

              return (
              <article key={row.rowKey} className="bar-refill-form-row">
                <label className="form-field">
                  <span>Category</span>
                  <select
                    value={row.category}
                    onChange={(event) => handleCategoryChange(row.rowKey, event.target.value)}
                    required
                  >
                    <option value="">Select category</option>
                    {barRefillCategoryOptions.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  <span>Subcategory</span>
                  <select
                    value={row.subcategory}
                    onChange={(event) => handleSubcategoryChange(row.rowKey, event.target.value)}
                    required
                    disabled={!row.category}
                  >
                    <option value="">Select subcategory</option>
                    {subcategoryOptions.map((subcategory) => (
                      <option key={subcategory} value={subcategory}>{subcategory}</option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  <span>Product</span>
                  <select
                    value={row.inventoryItemId}
                    onChange={(event) => handleInventoryChange(row.rowKey, event.target.value)}
                    required
                    disabled={!row.category || !row.subcategory}
                  >
                    <option value="">Select product</option>
                    {productOptions.map((item) => (
                      <option key={item.id} value={`${item.id}`}>{formatInventoryBarRefillOptionLabel(item)}</option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  <span>Requested quantity</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={row.requestedQuantity}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      rows: current.rows.map((entry) => (
                        entry.rowKey === row.rowKey
                          ? { ...entry, requestedQuantity: event.target.value }
                          : entry
                      )),
                    }))}
                    required
                  />
                </label>
                <label className="form-field">
                  <span>Unit</span>
                  <input value={row.unit} readOnly placeholder="Auto-filled" />
                </label>
                <label className="form-field">
                  <span>Notes</span>
                  <input
                    value={row.notes}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      rows: current.rows.map((entry) => (
                        entry.rowKey === row.rowKey
                          ? { ...entry, notes: event.target.value }
                          : entry
                      )),
                    }))}
                    placeholder="Optional"
                  />
                </label>
                {form.rows.length > 1 ? (
                  <button
                    type="button"
                    className="ghost-btn bar-refill-remove-row-btn"
                    onClick={() => setForm((current) => ({
                      ...current,
                      rows: current.rows.filter((entry) => entry.rowKey !== row.rowKey),
                    }))}
                  >
                    Remove
                  </button>
                ) : null}
              </article>
              )
            })}
          </div>

          <div className="modal-actions">
            <button type="button" className="ghost-btn inventory-modal-action-btn" onClick={onClose} disabled={isSaving}>
              Cancel
            </button>
            <button type="submit" className="primary-btn inventory-modal-action-btn" disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save Draft'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function BarRefillCard({
  refill,
  isSaving,
  onSaveChanges,
  onCompletePickup,
  onCancelRefill,
  canManage = false,
}) {
  const isReadOnly = refill.status !== 'draft' || !canManage
  const [notes, setNotes] = useState(refill.notes ?? '')
  const [itemEdits, setItemEdits] = useState(() => (
    (refill.items ?? []).map((item) => ({
      id: item.id,
      pickedQuantity: `${item.pickedQuantity ?? ''}`,
      isPicked: Boolean(item.isPicked),
      requestedQuantity: item.requestedQuantity,
      unit: item.unit,
      itemName: item.itemName,
    }))
  ))

  useEffect(() => {
    setNotes(refill.notes ?? '')
    setItemEdits((refill.items ?? []).map((item) => ({
      id: item.id,
      pickedQuantity: `${item.pickedQuantity ?? ''}`,
      isPicked: Boolean(item.isPicked),
      requestedQuantity: item.requestedQuantity,
      unit: item.unit,
      itemName: item.itemName,
    })))
  }, [refill])

  const handleUseRequested = (itemId) => {
    setItemEdits((current) => current.map((item) => (
      item.id === itemId
        ? { ...item, pickedQuantity: `${item.requestedQuantity ?? 0}` }
        : item
    )))
  }

  const handleSaveChanges = () => {
    onSaveChanges?.(refill.id, {
      notes: notes.trim(),
      items: itemEdits.map((item) => ({
        id: item.id,
        pickedQuantity: Number(item.pickedQuantity) || 0,
        isPicked: item.isPicked,
      })),
    })
  }

  return (
    <article className={`bar-refill-card${isReadOnly ? ' bar-refill-card-readonly bar-refill-history-card' : ''}`}>
      {isReadOnly ? (
        <>
          <header className="bar-refill-history-header">
            <h4 className="bar-refill-history-title">
              BAR REFILL {formatBarRefillDisplayNumber(refill)}
            </h4>
            <span className={`status-pill bar-refill-status-pill bar-refill-status-${refill.status}`}>
              {formatBarRefillHistoryStatusLabel(refill.status)}
            </span>
          </header>

          <dl className="bar-refill-history-meta">
            <div className="bar-refill-history-meta-row">
              <dt>Date</dt>
              <dd>{formatBarRefillDisplayDate(refill.refillDate)}</dd>
            </div>
            <div className="bar-refill-history-meta-row">
              <dt>Created by</dt>
              <dd>{refill.createdBy?.trim() || '—'}</dd>
            </div>
            <div className="bar-refill-history-meta-row">
              <dt>Status</dt>
              <dd>{formatBarRefillHistoryStatusLabel(refill.status)}</dd>
            </div>
          </dl>

          {refill.notes ? (
            <div className="bar-refill-card-notes bar-refill-history-notes">
              <span className="inventory-item-card-section-label">Notes</span>
              <p>{refill.notes}</p>
            </div>
          ) : null}

          <div className="bar-refill-items bar-refill-history-items">
            <p className="inventory-item-card-section-label">Items</p>
            <ul className="bar-refill-item-list bar-refill-history-item-list">
              {itemEdits.map((item) => (
                <li key={item.id} className="bar-refill-history-item">
                  <strong className="bar-refill-history-item-name">{item.itemName || 'Unnamed item'}</strong>
                  <p className="bar-refill-history-item-line">
                    Requested: {formatBarRefillQuantityLine(item.requestedQuantity, item.unit)}
                  </p>
                  <p className="bar-refill-history-item-line">
                    Picked: {formatBarRefillQuantityLine(Number(item.pickedQuantity) || 0, item.unit)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : (
        <>
          <header className="bar-refill-card-header">
            <div>
              <p className="eyebrow">Bar Refill</p>
              <h4>{refill.refillDate || '—'}</h4>
              <p className="bar-refill-card-meta">
                {refill.createdBy ? `Created by ${refill.createdBy}` : 'Created by —'}
              </p>
            </div>
            <span className={`status-pill bar-refill-status-pill bar-refill-status-${refill.status}`}>
              {formatBarRefillStatusLabel(refill.status)}
            </span>
          </header>

          <div className="bar-refill-card-notes">
            <span className="inventory-item-card-section-label">Notes</span>
            <textarea
              rows="2"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Pickup notes"
            />
          </div>

          <div className="bar-refill-items">
            <p className="inventory-item-card-section-label">Items</p>
            <ul className="bar-refill-item-list">
              {itemEdits.map((item) => (
                <li key={item.id} className="bar-refill-item-row">
                  <div className="bar-refill-item-main">
                    <strong>{item.itemName || 'Unnamed item'}</strong>
                    <p className="bar-refill-item-requested">
                      Requested: {formatBarRefillQuantityLine(item.requestedQuantity, item.unit)}
                    </p>
                  </div>

                  <div className="bar-refill-item-pickup">
                    <label className="form-field bar-refill-picked-field">
                      <span>Picked</span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={item.pickedQuantity}
                        onChange={(event) => setItemEdits((current) => current.map((entry) => (
                          entry.id === item.id
                            ? { ...entry, pickedQuantity: event.target.value }
                            : entry
                        )))}
                        placeholder="0"
                      />
                    </label>

                    <label className="bar-refill-picked-checkbox">
                      <input
                        type="checkbox"
                        checked={item.isPicked}
                        onChange={(event) => setItemEdits((current) => current.map((entry) => (
                          entry.id === item.id
                            ? { ...entry, isPicked: event.target.checked }
                            : entry
                        )))}
                      />
                      <span>Picked</span>
                    </label>

                    <button
                      type="button"
                      className="ghost-btn bar-refill-use-requested-btn"
                      onClick={() => handleUseRequested(item.id)}
                    >
                      Use requested
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="bar-refill-card-actions">
            <button
              type="button"
              className="ghost-btn inventory-modal-action-btn"
              onClick={handleSaveChanges}
              disabled={isSaving}
            >
              Save Changes
            </button>
            <button
              type="button"
              className="primary-btn inventory-modal-action-btn"
              onClick={() => onCompletePickup?.(refill.id, {
                notes: notes.trim(),
                items: itemEdits.map((item) => ({
                  id: item.id,
                  pickedQuantity: Number(item.pickedQuantity) || 0,
                  isPicked: item.isPicked,
                })),
              })}
              disabled={isSaving}
            >
              Complete Pickup
            </button>
            <button
              type="button"
              className="ghost-btn inventory-modal-action-btn bar-refill-cancel-btn"
              onClick={() => onCancelRefill?.(refill.id)}
              disabled={isSaving}
            >
              Cancel Refill
            </button>
          </div>
        </>
      )}
    </article>
  )
}

function BarRefillView({
  barRefills,
  inventoryItems,
  isLoading,
  noticeMessage,
  isSaving,
  defaultRefillDate,
  defaultCreatedBy,
  onCreateRefill,
  onSaveRefillChanges,
  onRequestCompleteRefill,
  onCancelRefill,
  canManage = false,
}) {
  const [isNewModalOpen, setIsNewModalOpen] = useState(false)
  const activeDraft = useMemo(
    () => (barRefills ?? []).find((refill) => refill.status === 'draft') ?? null,
    [barRefills],
  )
  const previousRefills = useMemo(
    () => (barRefills ?? []).filter((refill) => refill.status !== 'draft'),
    [barRefills],
  )

  return (
    <>
      <div className="bar-refill-toolbar">
        <div>
          <p className="eyebrow">Internal transfer</p>
          <h3>Bar Refill</h3>
          <p className="staff-subtitle">Warehouse / storage → bar pickup workflow.</p>
        </div>
        {canManage ? (
          <button
            type="button"
            className="primary-btn"
            onClick={() => setIsNewModalOpen(true)}
            disabled={isSaving || Boolean(activeDraft)}
          >
            + New Bar Refill
          </button>
        ) : null}
      </div>

      {noticeMessage ? <div className="staff-status-banner">{noticeMessage}</div> : null}
      {isLoading ? <div className="staff-status-banner">Loading bar refills…</div> : null}

      {activeDraft ? (
        <section className="panel staff-panel bar-refill-active-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Active draft</p>
              <h3>Current pickup</h3>
            </div>
          </div>
          <BarRefillCard
            refill={activeDraft}
            isSaving={isSaving}
            onSaveChanges={onSaveRefillChanges}
            onCompletePickup={onRequestCompleteRefill}
            onCancelRefill={onCancelRefill}
            canManage={canManage}
          />
        </section>
      ) : (
        <div className="schedule-empty-state bar-refill-empty-draft">
          <h4>No active bar refill draft.</h4>
          <p>Start a new refill after shift to record what the bar needs from storage.</p>
        </div>
      )}

      <section className="panel staff-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">History</p>
            <h3>Previous refills</h3>
          </div>
        </div>

        {previousRefills.length === 0 && !isLoading ? (
          <div className="schedule-empty-state">
            <h4>No completed refills yet.</h4>
            <p>Finished pickups will appear here as read-only records.</p>
          </div>
        ) : (
          <div className="bar-refill-history-list">
            {previousRefills.map((refill) => (
              <BarRefillCard key={refill.id} refill={refill} isSaving={isSaving} />
            ))}
          </div>
        )}
      </section>

      {canManage ? (
        <BarRefillNewModal
          isOpen={isNewModalOpen}
          onClose={() => setIsNewModalOpen(false)}
          inventoryItems={inventoryItems}
          defaultRefillDate={defaultRefillDate}
          defaultCreatedBy={defaultCreatedBy}
          isSaving={isSaving}
          onSaveDraft={async (payload) => {
            await onCreateRefill?.(payload)
            setIsNewModalOpen(false)
          }}
        />
      ) : null}
    </>
  )
}

function buildDefaultInventoryForm() {
  return {
    itemName: '',
    categoryPreset: 'Other',
    customCategory: '',
    subcategoryPreset: 'Misc',
    customSubcategory: '',
    supplier: '',
    unit: '',
    quantity: '0',
    minimumQuantity: '0',
    cost: '0',
    notes: '',
  }
}

function InventoryItemCard({
  item,
  onOpenEditItem,
  onRequestDeleteItem,
  canManage = false,
}) {
  const hasUnit = hasSupplierField(item.unit)
  const hasSupplier = hasSupplierField(item.supplier)
  const hasNotes = hasSupplierField(item.notes)
  const hasUnitCost = (Number(item.cost) || 0) > 0
  const itemValue = getInventoryItemValue(item)
  const showProcurementPanel = hasUnitCost || itemValue > 0
  const parConfigured = isInventoryParConfigured(item)
  const itemNeedsOrder = needsOrder(item)
  const orderNeeded = getInventoryOrderNeeded(item)
  const healthPercent = getInventoryStockHealthPercent(item.quantity, item.minimumQuantity)
  const healthTone = getInventoryStockHealthTone(healthPercent, item.status)
  const statusClass = getInventoryStatusClass(item.status)
  const categoryLabel = formatInventoryCategoryPath(item)

  return (
    <article className="inventory-item-card inventory-item-card-compact">
      <div className="inventory-item-card-header-row">
        <div className="inventory-item-card-identity">
          <div className="roster-avatar inventory-item-card-avatar">{getInitials(item.itemName || 'Item')}</div>
          <div className="inventory-item-card-title-block">
            <strong className="inventory-item-card-name">{item.itemName || 'Unnamed item'}</strong>
            <p className="inventory-item-card-meta">{categoryLabel}</p>
            {hasSupplier ? (
              <p className="inventory-item-card-meta">{item.supplier}</p>
            ) : null}
          </div>
        </div>

        <div className="inventory-item-card-header-aside">
          {itemNeedsOrder ? (
            <div className="inventory-need-order-badge" aria-label={`Need order: ${formatInventoryOrderNeed(orderNeeded, item.unit)}`}>
              <span className="inventory-need-order-badge-label">
                <span aria-hidden="true">🚚 </span>
                NEED ORDER
              </span>
              <span className="inventory-need-order-badge-qty">{formatInventoryOrderNeed(orderNeeded, item.unit)}</span>
            </div>
          ) : null}
          <span className={`status-pill inventory-item-status-pill ${statusClass}`}>{item.status}</span>
          {canManage ? (
          <div className="inventory-item-card-header-actions">
            <button
              type="button"
              className="ghost-btn inventory-item-card-action-btn"
              onClick={() => onOpenEditItem?.(item)}
            >
              Edit
            </button>
            <button
              type="button"
              className="ghost-btn inventory-item-card-action-btn inventory-item-card-delete-btn"
              onClick={() => onRequestDeleteItem?.(item)}
            >
              Delete
            </button>
          </div>
          ) : null}
        </div>
      </div>

      <section className={`inventory-item-card-health${parConfigured ? '' : ' inventory-item-card-health-unset'}`}>
        {parConfigured ? (
          <>
            <div className="inventory-item-card-health-header">
              <span className="inventory-item-card-section-label">Stock Health</span>
              <span className="inventory-item-card-health-meta">
                Current {item.quantity} / Target {item.minimumQuantity}
              </span>
            </div>
            <div
              className="inventory-item-card-health-track"
              role="progressbar"
              aria-valuenow={Math.round(healthPercent ?? 0)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Stock health ${Math.round(healthPercent ?? 0)} percent`}
            >
              <div
                className={`inventory-item-card-health-fill tone-${healthTone}`}
                style={{ width: `${healthPercent ?? 0}%` }}
              />
            </div>
          </>
        ) : (
          <>
            <div className="inventory-item-card-health-header">
              <span className="inventory-item-card-par-unset-label">
                <span aria-hidden="true">⚪ </span>
                PAR NOT SET
              </span>
            </div>
            <p className="inventory-item-card-par-hint">Set target stock to enable alerts</p>
            <div
              className="inventory-item-card-health-track inventory-item-card-health-track-unset"
              role="img"
              aria-label="Target stock not configured"
            >
              <div className="inventory-item-card-health-fill tone-unset" />
            </div>
          </>
        )}
      </section>

      <div className={`inventory-item-card-body-grid${showProcurementPanel ? '' : ' inventory-item-card-body-grid-single'}`}>
        <section className="inventory-item-card-panel">
          <p className="inventory-item-card-section-label">Stock</p>
          <div className="inventory-item-card-panel-lines">
            <p className="inventory-item-card-panel-line">Current: {item.quantity}</p>
            <p className="inventory-item-card-panel-line">{INVENTORY_TARGET_STOCK_LABEL}: {item.minimumQuantity}</p>
            {hasUnit ? (
              <p className="inventory-item-card-panel-line">Unit: {item.unit}</p>
            ) : null}
          </div>
        </section>

        {showProcurementPanel ? (
          <section className="inventory-item-card-panel">
            <p className="inventory-item-card-section-label">Procurement</p>
            <div className="inventory-item-card-panel-lines">
              {hasUnitCost ? (
                <p className="inventory-item-card-panel-line">Unit Cost: {formatCurrency(item.cost)}</p>
              ) : null}
              {itemValue > 0 ? (
                <p className="inventory-item-card-panel-line">Total Value: {formatCurrency(itemValue)}</p>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>

      {hasNotes ? (
        <p className="inventory-item-card-notes-compact">{item.notes}</p>
      ) : null}
    </article>
  )
}

function InventoryView({
  inventoryItems,
  barRefills,
  onOpenAddItem,
  onOpenEditItem,
  onRequestDeleteItem,
  isLoading,
  noticeMessage,
  isSaving,
  searchTerm,
  barRefillsLoading,
  barRefillsNotice,
  isSavingBarRefill,
  defaultRefillDate,
  defaultCreatedBy,
  onCreateBarRefill,
  onSaveBarRefillChanges,
  onRequestCompleteBarRefill,
  onCancelBarRefill,
  canManage = false,
}) {
  const [stockTab, setStockTab] = useState('inventory')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [subcategoryFilter, setSubcategoryFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('all')
  const [reorderCopyNotice, setReorderCopyNotice] = useState('')
  const [barRefillPendingComplete, setBarRefillPendingComplete] = useState(null)

  const categoryFilters = useMemo(
    () => getInventoryCategoryFilters(inventoryItems),
    [inventoryItems],
  )

  const filteredItems = useMemo(() => {
    const needle = `${searchTerm}`.trim().toLowerCase()

    return inventoryItems.filter((item) => {
      if (!matchesStockStatusFilter(item, statusFilter)) return false

      const matchesCategory = categoryFilter === 'All' || item.category === categoryFilter
      if (!matchesCategory) return false
      if (!needle) return true

      return `${item.itemName} ${item.category} ${getInventorySubcategoryLabel(item)} ${item.supplier}`.toLowerCase().includes(needle)
    })
  }, [inventoryItems, searchTerm, categoryFilter, statusFilter])

  const subcategoryFilters = useMemo(
    () => getInventorySubcategoryFilters(inventoryItems, categoryFilter),
    [inventoryItems, categoryFilter],
  )

  const visibleItems = useMemo(
    () => filterInventoryItemsBySubcategory(filteredItems, subcategoryFilter),
    [filteredItems, subcategoryFilter],
  )

  const groupedBySubcategory = useMemo(
    () => groupInventoryItemsBySubcategory(visibleItems),
    [visibleItems],
  )

  const groupedByCategory = useMemo(
    () => groupInventoryItemsByCategoryAndSubcategory(visibleItems),
    [visibleItems],
  )

  const overview = useMemo(() => {
    const totalItems = inventoryItems.length
    const lowStockAlerts = inventoryItems.filter((item) => item.status === 'Low Stock').length
    const outOfStock = inventoryItems.filter((item) => item.status === 'Out of Stock').length
    const totalInventoryValue = inventoryItems.reduce((sum, item) => sum + ((Number(item.quantity) || 0) * (Number(item.cost) || 0)), 0)
    const itemsToOrderCount = inventoryItems.filter(needsOrder).length

    return {
      totalItems,
      lowStockAlerts,
      outOfStock,
      totalInventoryValue,
      itemsToOrderCount,
    }
  }, [inventoryItems])

  return (
    <section className="staff-page">
      <div className="staff-header-card">
        <div>
          <p className="eyebrow">Stock management</p>
          <h3>Stock Control Center</h3>
          <p className="staff-subtitle">Track quantity, suppliers, and purchasing risk in real time.</p>
        </div>
        <div className="inventory-header-actions">
          {stockTab === 'inventory' && canManage ? (
            <button type="button" className="primary-btn" onClick={onOpenAddItem} disabled={isSaving}>
              {isSaving ? 'Saving…' : '+ Add Item'}
            </button>
          ) : null}
        </div>
      </div>

      <div className="inventory-workspace-tabs" role="tablist" aria-label="Stock sections">
        <button
          type="button"
          role="tab"
          aria-selected={stockTab === 'inventory'}
          className={`filter-chip inventory-workspace-tab${stockTab === 'inventory' ? ' active' : ''}`}
          onClick={() => setStockTab('inventory')}
        >
          Stock
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={stockTab === 'reorder'}
          className={`filter-chip inventory-workspace-tab${stockTab === 'reorder' ? ' active' : ''}`}
          onClick={() => {
            setReorderCopyNotice('')
            setStockTab('reorder')
          }}
        >
          {overview.itemsToOrderCount > 0
            ? `🚚 Reorder List (${overview.itemsToOrderCount})`
            : 'Reorder List'}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={stockTab === 'bar-refill'}
          className={`filter-chip inventory-workspace-tab${stockTab === 'bar-refill' ? ' active' : ''}`}
          onClick={() => setStockTab('bar-refill')}
        >
          Bar Refill
        </button>
      </div>

      {stockTab === 'inventory' ? (
        <>
      <div className="roster-summary-grid inventory-summary-grid">
        <article className="roster-summary-card">
          <p className="eyebrow">Total items</p>
          <h3>{overview.totalItems}</h3>
        </article>
        <article className="roster-summary-card">
          <p className="eyebrow">Low stock alerts</p>
          <h3>{overview.lowStockAlerts}</h3>
        </article>
        <article className="roster-summary-card">
          <p className="eyebrow">Out of stock</p>
          <h3>{overview.outOfStock}</h3>
        </article>
        <article className="roster-summary-card">
          <p className="eyebrow">🚚 Items to order</p>
          <h3>{overview.itemsToOrderCount}</h3>
        </article>
        <article className="roster-summary-card">
          <p className="eyebrow">Total stock value</p>
          <h3>{formatCurrency(overview.totalInventoryValue)}</h3>
        </article>
      </div>

      {noticeMessage ? <div className="staff-status-banner">{noticeMessage}</div> : null}
      {isLoading ? <div className="staff-status-banner">Loading stock…</div> : null}

      <div className="inventory-status-filters" role="group" aria-label="Filter by stock status">
        <button
          type="button"
          className={`filter-chip${statusFilter === 'all' ? ' active' : ''}`}
          onClick={() => setStatusFilter('all')}
        >
          All
        </button>
        <button
          type="button"
          className={`filter-chip${statusFilter === 'need-order' ? ' active' : ''}`}
          onClick={() => setStatusFilter('need-order')}
        >
          Need Order
        </button>
        <button
          type="button"
          className={`filter-chip${statusFilter === 'low-stock' ? ' active' : ''}`}
          onClick={() => setStatusFilter('low-stock')}
        >
          Low Stock
        </button>
        <button
          type="button"
          className={`filter-chip${statusFilter === 'out-of-stock' ? ' active' : ''}`}
          onClick={() => setStatusFilter('out-of-stock')}
        >
          Out of Stock
        </button>
      </div>

      <div className="inventory-category-filters" role="group" aria-label="Filter by category">
        <button
          type="button"
          className={`filter-chip${categoryFilter === 'All' ? ' active' : ''}`}
          onClick={() => {
            setCategoryFilter('All')
            setSubcategoryFilter('All')
          }}
        >
          All Categories
        </button>
        {categoryFilters.map((category) => (
          <button
            key={category}
            type="button"
            className={`filter-chip${categoryFilter === category ? ' active' : ''}`}
            onClick={() => {
              setCategoryFilter(category)
              setSubcategoryFilter('All')
            }}
          >
            {category}
          </button>
        ))}
      </div>

      {categoryFilter !== 'All' && subcategoryFilters.length > 0 ? (
        <div className="inventory-subcategory-filters" role="group" aria-label="Filter by subcategory">
          <button
            type="button"
            className={`filter-chip${subcategoryFilter === 'All' ? ' active' : ''}`}
            onClick={() => setSubcategoryFilter('All')}
          >
            {`All ${categoryFilter}`}
          </button>
          {subcategoryFilters.map((subcategory) => (
            <button
              key={subcategory}
              type="button"
              className={`filter-chip${subcategoryFilter === subcategory ? ' active' : ''}`}
              onClick={() => setSubcategoryFilter(subcategory)}
            >
              {subcategory}
            </button>
          ))}
        </div>
      ) : null}

      <div className="panel staff-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Stock list</p>
            <h3>Current stock</h3>
          </div>
        </div>

        {visibleItems.length === 0 && !isLoading ? (
          <div className="schedule-empty-state">
            <h4>{inventoryItems.length === 0 ? 'No stock items yet.' : 'No items match this filter.'}</h4>
            <p>{inventoryItems.length === 0 ? 'Add your first item to begin stock tracking.' : 'Try another status, category, or search term.'}</p>
          </div>
        ) : (
          <div className="inventory-grouped-list">
            {categoryFilter === 'All' ? (
              groupedByCategory.map((categoryGroup) => (
                <section key={categoryGroup.category} className="inventory-category-group">
                  <h3 className="inventory-category-heading">{categoryGroup.category}</h3>
                  {categoryGroup.subcategories.map((group) => (
                    <section key={`${categoryGroup.category}-${group.subcategory}`} className="inventory-subcategory-group">
                      <h4 className="inventory-subcategory-heading">{group.subcategory}</h4>
                      <div className="inventory-item-card-list">
                        {group.items.map((item) => (
                          <InventoryItemCard
                            key={item.id}
                            item={item}
                            onOpenEditItem={onOpenEditItem}
                            onRequestDeleteItem={onRequestDeleteItem}
                            canManage={canManage}
                          />
                        ))}
                      </div>
                    </section>
                  ))}
                </section>
              ))
            ) : (
              groupedBySubcategory.map((group) => (
                <section key={group.subcategory} className="inventory-subcategory-group">
                  <h4 className="inventory-subcategory-heading">{group.subcategory}</h4>
                  <div className="inventory-item-card-list">
                    {group.items.map((item) => (
                      <InventoryItemCard
                        key={item.id}
                        item={item}
                        onOpenEditItem={onOpenEditItem}
                        onRequestDeleteItem={onRequestDeleteItem}
                        canManage={canManage}
                      />
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        )}
      </div>
        </>
      ) : null}

      {stockTab === 'reorder' ? (
        <div className="panel staff-panel inventory-reorder-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Reorder center</p>
              <h3>Reorder List</h3>
              <p className="staff-subtitle">Items below target stock, grouped by supplier.</p>
            </div>
          </div>
          <InventoryReorderContent
            items={inventoryItems}
            onOpenEditItem={onOpenEditItem}
            copyNotice={reorderCopyNotice}
            onCopyNotice={setReorderCopyNotice}
            showActions
            canManage={canManage}
          />
        </div>
      ) : null}

      {stockTab === 'bar-refill' ? (
        <BarRefillView
          barRefills={barRefills}
          inventoryItems={inventoryItems}
          isLoading={barRefillsLoading}
          noticeMessage={barRefillsNotice}
          isSaving={isSavingBarRefill}
          defaultRefillDate={defaultRefillDate}
          defaultCreatedBy={defaultCreatedBy}
          onCreateRefill={onCreateBarRefill}
          onSaveRefillChanges={onSaveBarRefillChanges}
          onRequestCompleteRefill={(refillId, payload) => setBarRefillPendingComplete({ refillId, payload })}
          onCancelRefill={onCancelBarRefill}
          canManage={canManage}
        />
      ) : null}

      {barRefillPendingComplete ? (
        <div className="employee-modal-backdrop task-modal-backdrop" onClick={() => !isSavingBarRefill && setBarRefillPendingComplete(null)}>
          <div
            className="employee-modal task-form-modal is-responsive-sheet bar-refill-confirm-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="bar-refill-complete-title"
          >
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Complete pickup</p>
                <h3 id="bar-refill-complete-title">Complete pickup?</h3>
                <p className="staff-subtitle">Picked quantities will be added to stock.</p>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setBarRefillPendingComplete(null)}
                disabled={isSavingBarRefill}
                aria-label="Close complete pickup confirmation"
              >
                ✕
              </button>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="ghost-btn inventory-modal-action-btn"
                onClick={() => setBarRefillPendingComplete(null)}
                disabled={isSavingBarRefill}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-btn inventory-modal-action-btn"
                disabled={isSavingBarRefill}
                onClick={async () => {
                  await onRequestCompleteBarRefill?.(
                    barRefillPendingComplete.refillId,
                    barRefillPendingComplete.payload,
                  )
                  setBarRefillPendingComplete(null)
                }}
              >
                {isSavingBarRefill ? 'Completing…' : 'Complete Pickup'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function buildInventorySupplierOptions(suppliers, selectedSupplier = '') {
  const trimmedSelected = `${selectedSupplier ?? ''}`.trim()
  const supplierNames = new Set(
    (suppliers ?? [])
      .filter((supplier) => supplier.active !== false)
      .map((supplier) => `${supplier.companyName ?? ''}`.trim())
      .filter(Boolean),
  )

  const options = [{ value: '', label: 'No supplier' }]

  ;(suppliers ?? []).forEach((supplier) => {
    if (supplier.active === false) return
    const name = `${supplier.companyName ?? ''}`.trim()
    if (!name) return
    options.push({ value: name, label: name })
  })

  if (trimmedSelected && !supplierNames.has(trimmedSelected)) {
    options.push({ value: trimmedSelected, label: `Legacy: ${trimmedSelected}` })
  }

  return options
}

function hasSupplierField(value) {
  return `${value ?? ''}`.trim().length > 0
}

function App() {
  const persistedNavigation = readPersistedNavigation()
  const [activeView, setActiveView] = useState(() => persistedNavigation.activeView)
  const [teamSection, setTeamSection] = useState(() => persistedNavigation.teamSection)
  const [stockSection, setStockSection] = useState(() => persistedNavigation.stockSection)
  const [operationsSection, setOperationsSection] = useState(() => persistedNavigation.operationsSection)
  const [settingsSection, setSettingsSection] = useState(() => persistedNavigation.settingsSection)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeFilter, setActiveFilter] = useState('All')
  const [employees, setEmployees] = useState([])
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [shifts, setShifts] = useState([])
  const [scheduleCapacities, setScheduleCapacities] = useState([])
  const [schedulePublication, setSchedulePublication] = useState({
    weekStartDate: getCurrentWeekStartDate(),
    status: 'draft',
    publishedAt: null,
    unpublishedAt: null,
    publishedBy: null,
  })
  const [publishedShifts, setPublishedShifts] = useState([])
  const [scheduleWeekStart, setScheduleWeekStart] = useState(
    () => persistedNavigation.scheduleWeekStart ?? getCurrentWeekStartDate(),
  )
  const [scheduleEmployees, setScheduleEmployees] = useState([])
  const [isScheduleLoading, setIsScheduleLoading] = useState(true)
  const [scheduleNotice, setScheduleNotice] = useState('')
  const [scheduleLegacyTemplateSchema, setScheduleLegacyTemplateSchema] = useState(false)
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false)
  const [editingShift, setEditingShift] = useState(null)
  const [shiftTemplates, setShiftTemplates] = useState([])
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [templateForm, setTemplateForm] = useState(() => buildTemplateForm())
  const [isSavingTemplate, setIsSavingTemplate] = useState(false)
  const [isDeletingTemplate, setIsDeletingTemplate] = useState(false)
  const [isReorderingTemplates, setIsReorderingTemplates] = useState(false)
  const [draggedShiftTemplateId, setDraggedShiftTemplateId] = useState(null)
  const templateReorderPointerRef = useRef(null)
  const templateReorderInitialOrderRef = useRef(null)
  const [templateNotice, setTemplateNotice] = useState('')
  const [weeklyTemplates, setWeeklyTemplates] = useState([])
  const [isWeeklyTemplatesLoading, setIsWeeklyTemplatesLoading] = useState(true)
  const [formData, setFormData] = useState({
    employee_id: '',
    shift_date: '',
    shift_template: 'custom',
    start_time: '',
    end_time: '',
    role: '',
    area_option: 'Service',
    area_custom: '',
    status: 'Scheduled',
    notes: '',
  })
  const [isSavingShift, setIsSavingShift] = useState(false)
  const [isShiftOverlapConfirmOpen, setIsShiftOverlapConfirmOpen] = useState(false)
  const shiftOverlapConfirmResolverRef = useRef(null)
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false)
  const [employeeFormOpenMenuId, setEmployeeFormOpenMenuId] = useState(null)
  const employeePremiumFormModalRef = useRef(null)
  const [editingEmployee, setEditingEmployee] = useState(null)
  const [employeeForm, setEmployeeForm] = useState(() => buildEmployeeForm())
  const handleCloseEmployeeModal = useCallback(() => {
    setIsEmployeeModalOpen(false)
    setEditingEmployee(null)
    setSaveError('')
    setEmployeeFormOpenMenuId(null)
    setPendingEmployeePositionDeletions(clearPendingEmployeePositionDeletions())
    setEmployeeForm(buildEmployeeForm())
  }, [])
  const [positions, setPositions] = useState([])
  const [positionsNotice, setPositionsNotice] = useState('')
  const [isPositionsLoading, setIsPositionsLoading] = useState(true)
  const [positionForm, setPositionForm] = useState({
    name: '',
    department: 'Other',
  })
  const [editingPositionId, setEditingPositionId] = useState(null)
  const [reservationSeatings, setReservationSeatings] = useState([])
  const [reservationSeatingsNotice, setReservationSeatingsNotice] = useState('')
  const [isReservationSeatingsLoading, setIsReservationSeatingsLoading] = useState(true)
  const [isSavingReservationSeating, setIsSavingReservationSeating] = useState(false)
  const [editingReservationSeatingId, setEditingReservationSeatingId] = useState(null)
  const [reservationSeatingForm, setReservationSeatingForm] = useState(createDefaultSeatingForm)
  const [reservationSeatingPendingDelete, setReservationSeatingPendingDelete] = useState(null)
  const [isSavingPosition, setIsSavingPosition] = useState(false)
  const [positionPendingDelete, setPositionPendingDelete] = useState(null)
  const [isLoadingStaff, setIsLoadingStaff] = useState(true)
  const [staffNotice, setStaffNotice] = useState('')
  const [isSavingEmployee, setIsSavingEmployee] = useState(false)
  const [isCreatingEmployeeCustomPosition, setIsCreatingEmployeeCustomPosition] = useState(false)
  const [pendingEmployeePositionDeletions, setPendingEmployeePositionDeletions] = useState([])
  const [saveError, setSaveError] = useState('')
  const [reservations, setReservations] = useState([])
  const [reservationNotice, setReservationNotice] = useState('')
  const [isReservationsLoading, setIsReservationsLoading] = useState(true)
  const [isReservationModalOpen, setIsReservationModalOpen] = useState(false)
  const [isDashboardReservationQuickCreateOpen, setIsDashboardReservationQuickCreateOpen] = useState(false)
  const [isDashboardAnnouncementFormOpen, setIsDashboardAnnouncementFormOpen] = useState(false)
  const [isDashboardStockCreateOrderOpen, setIsDashboardStockCreateOrderOpen] = useState(false)
  const [isQuickReservationOpen, setIsQuickReservationOpen] = useState(false)
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false)
  const [editingReservation, setEditingReservation] = useState(null)
  const [reservationForm, setReservationForm] = useState({
    guestName: '',
    phone: '',
    date: '',
    time: '',
    guests: '2',
    tableNumber: '',
    area: 'Main Dining',
    seatingAreaId: '',
    status: 'Pending',
    notes: '',
    assignedUnits: [],
    extraChairs: 0,
    standingGuests: 0,
    seatingId: null,
  })
  const [quickReservationForm, setQuickReservationForm] = useState({
    guestName: '',
    date: '',
    time: '',
    guests: '2',
    tableNumber: '',
  })
  const [isSavingReservation, setIsSavingReservation] = useState(false)
  const isSavingReservationRef = useRef(false)
  const [inventoryItems, setInventoryItems] = useState([])
  const [inventoryNotice, setInventoryNotice] = useState('')
  const [isInventoryLoading, setIsInventoryLoading] = useState(true)
  const [isInventoryModalOpen, setIsInventoryModalOpen] = useState(false)
  const [editingInventoryItem, setEditingInventoryItem] = useState(null)
  const [inventoryForm, setInventoryForm] = useState(buildDefaultInventoryForm)
  const [isSavingInventoryItem, setIsSavingInventoryItem] = useState(false)
  const [inventoryPendingDelete, setInventoryPendingDelete] = useState(null)
  const [isDeletingInventoryItem, setIsDeletingInventoryItem] = useState(false)
  const [stockItems, setStockItems] = useState([])
  const [stockItemsNotice, setStockItemsNotice] = useState('')
  const [isStockItemsLoading, setIsStockItemsLoading] = useState(false)
  const [isSavingStockItem, setIsSavingStockItem] = useState(false)
  const [isStockItemModalOpen, setIsStockItemModalOpen] = useState(false)
  const [stockSupplierPrefill, setStockSupplierPrefill] = useState('')
  const [stockOrders, setStockOrders] = useState([])
  const [stockOrdersNotice, setStockOrdersNotice] = useState('')
  const [stockOrdersFilterHint, setStockOrdersFilterHint] = useState(null)
  const [isStockOrdersLoading, setIsStockOrdersLoading] = useState(false)
  const [isSavingStockOrder, setIsSavingStockOrder] = useState(false)
  const isCreatingStockOrdersRef = useRef(false)
  const isReceivingStockOrderRef = useRef(false)
  const isSavingStockItemRef = useRef(false)
  const [barRefills, setBarRefills] = useState([])
  const [barRefillsNotice, setBarRefillsNotice] = useState('')
  const [isBarRefillsLoading, setIsBarRefillsLoading] = useState(true)
  const [isBarRefillsModuleConnected, setIsBarRefillsModuleConnected] = useState(false)
  const [isSavingBarRefill, setIsSavingBarRefill] = useState(false)
  const [isReportsLoading, setIsReportsLoading] = useState(false)
  const [suppliers, setSuppliers] = useState([])
  const [suppliersNotice, setSuppliersNotice] = useState('')
  const [isSuppliersLoading, setIsSuppliersLoading] = useState(true)
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false)
  const [supplierModalOrigin, setSupplierModalOrigin] = useState(null)
  const [editingSupplier, setEditingSupplier] = useState(null)
  const [supplierForm, setSupplierForm] = useState({
    companyName: '',
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    taxId: '',
    paymentTerms: '',
    deliveryDays: '',
    notes: '',
  })
  const [isSavingSupplier, setIsSavingSupplier] = useState(false)
  const [supplierPendingDelete, setSupplierPendingDelete] = useState(null)
  const [isDeletingSupplier, setIsDeletingSupplier] = useState(false)
  const [tasks, setTasks] = useState([])
  const [tasksNotice, setTasksNotice] = useState('')
  const [operationsTasks, setOperationsTasks] = useState([])
  const [mobileOperationsTasks, setMobileOperationsTasks] = useState([])
  const [isMobileOperationsTasksLoading, setIsMobileOperationsTasksLoading] = useState(false)
  const [operationsLogs, setOperationsLogs] = useState([])
  const [operationsAnnouncements, setOperationsAnnouncements] = useState([])
  const [operationsChecklistTemplates, setOperationsChecklistTemplates] = useState([])
  const [activeChecklistRunTemplateId, setActiveChecklistRunTemplateId] = useState(null)
  const [operationsNotice, setOperationsNotice] = useState('')
  const [isOperationsLoading, setIsOperationsLoading] = useState(false)
  const [isSavingOperations, setIsSavingOperations] = useState(false)
  const [operationsFocusTaskId, setOperationsFocusTaskId] = useState(null)
  const [tasksError, setTasksError] = useState('')
  const [isTasksLoading, setIsTasksLoading] = useState(false)
  const [isSavingTask, setIsSavingTask] = useState(false)
  const [openTasksCreateModal, setOpenTasksCreateModal] = useState(false)
  const [taskTemplates, setTaskTemplates] = useState([])
  const [taskTemplatesError, setTaskTemplatesError] = useState('')
  const [taskTemplatesNotice, setTaskTemplatesNotice] = useState('')
  const [isTaskTemplatesLoading, setIsTaskTemplatesLoading] = useState(false)
  const [isSavingTaskTemplate, setIsSavingTaskTemplate] = useState(false)
  const [isGeneratingTasksFromTemplates, setIsGeneratingTasksFromTemplates] = useState(false)
  const [checklistItemsByTaskId, setChecklistItemsByTaskId] = useState({})
  const [templateChecklistItemsByTemplateId, setTemplateChecklistItemsByTemplateId] = useState({})
  const [employeePendingDelete, setEmployeePendingDelete] = useState(null)
  const [isDeletingEmployee, setIsDeletingEmployee] = useState(false)
  const [localNow, setLocalNow] = useState(() => getLocalNow())
  const [todayWeekShifts, setTodayWeekShifts] = useState([])
  const [todayWeekCapacities, setTodayWeekCapacities] = useState([])
  const [todayWeekPublishedShifts, setTodayWeekPublishedShifts] = useState([])
  const [todayWeekPublication, setTodayWeekPublication] = useState({
    weekStartDate: getCurrentWeekStartDate(),
    status: 'draft',
    publishedAt: null,
    unpublishedAt: null,
    publishedBy: null,
  })
  const [isTodayWeekLoading, setIsTodayWeekLoading] = useState(true)
  const [isReservationsModuleConnected, setIsReservationsModuleConnected] = useState(false)
  const [isInventoryModuleConnected, setIsInventoryModuleConnected] = useState(false)
  const [isTasksModuleConnected, setIsTasksModuleConnected] = useState(false)
  const [workspaceProfile, setWorkspaceProfile] = useState(EMPTY_WORKSPACE_PROFILE)
  const [workspaceProfileDraft, setWorkspaceProfileDraft] = useState(EMPTY_WORKSPACE_PROFILE)
  const [isWorkspaceProfileLoading, setIsWorkspaceProfileLoading] = useState(true)
  const [isSavingWorkspaceProfile, setIsSavingWorkspaceProfile] = useState(false)
  const [workspaceProfileNotice, setWorkspaceProfileNotice] = useState('')
  const [inviteAcceptedNotice, setInviteAcceptedNotice] = useState('')
  const previousActiveViewRef = useRef(activeView)
  const preReservationsHostViewRef = useRef('today')

  const {
    syncDevMembershipProfile,
    isAuthDisabled,
    isLoading: isAuthLoading,
    isBootstrapping: isAuthBootstrapping,
    role,
    roleLabel,
    user,
    workspace,
    membership,
    membershipLoadError,
    workspaceLoadError,
    signOut,
    refreshMembership,
  } = useAuth()

  const [isMobileViewport, setIsMobileViewport] = useState(() => shouldUseMobileShell())
  const forceMobileDevice =
    typeof navigator !== 'undefined'
    && /iPhone|iPod/i.test(navigator.userAgent)
  const useMobileExperience = forceMobileDevice || isMobileViewport
  const [mobileStaffTab, setMobileStaffTab] = useState(() => readPersistedMobileTab())
  const [mobileManagerTab, setMobileManagerTab] = useState(() => readPersistedManagerMobileTab())
  const [mobileMenuScreen, setMobileMenuScreen] = useState('main')
  const [mobileProfilePhone, setMobileProfilePhone] = useState('')
  const [mobileProfileError, setMobileProfileError] = useState('')
  const [mobileNotice, setMobileNotice] = useState('')
  const [isSavingMobileProfile, setIsSavingMobileProfile] = useState(false)
  const [isManagerMobileBootstrapLoading, setIsManagerMobileBootstrapLoading] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }

    let frameId = 0
    let orientationTimerId = 0

    const updateMobileViewport = () => {
      window.cancelAnimationFrame(frameId)
      frameId = window.requestAnimationFrame(() => {
        setIsMobileViewport(shouldUseMobileShell())
      })
    }

    const handleOrientationChange = () => {
      window.clearTimeout(orientationTimerId)
      updateMobileViewport()
      orientationTimerId = window.setTimeout(updateMobileViewport, 320)
    }

    updateMobileViewport()

    window.addEventListener('resize', updateMobileViewport)
    window.addEventListener('orientationchange', handleOrientationChange)
    window.visualViewport?.addEventListener('resize', updateMobileViewport)

    const coarsePointerQuery = window.matchMedia('(pointer: coarse)')
    coarsePointerQuery.addEventListener('change', updateMobileViewport)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.clearTimeout(orientationTimerId)
      window.removeEventListener('resize', updateMobileViewport)
      window.removeEventListener('orientationchange', handleOrientationChange)
      window.visualViewport?.removeEventListener('resize', updateMobileViewport)
      coarsePointerQuery.removeEventListener('change', updateMobileViewport)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return undefined
    }

    const logViewport = () => {
      console.log('ONE viewport', {
        userAgent: navigator.userAgent,
        width: window.innerWidth,
        height: window.innerHeight,
        isMobileViewport,
        forceMobileDevice,
        useMobileExperience,
      })
    }

    logViewport()

    window.addEventListener('resize', logViewport)
    window.addEventListener('orientationchange', logViewport)
    window.visualViewport?.addEventListener('resize', logViewport)

    return () => {
      window.removeEventListener('resize', logViewport)
      window.removeEventListener('orientationchange', logViewport)
      window.visualViewport?.removeEventListener('resize', logViewport)
    }
  }, [forceMobileDevice, isMobileViewport, useMobileExperience])

  useEffect(() => {
    setMobileScrollDebugAttribute()
  }, [])

  const [mobileExpandedView, setMobileExpandedView] = useState(null)
  const [mobileReservationsHostMode, setMobileReservationsHostMode] = useState(false)
  const [mobileWeekStart, setMobileWeekStart] = useState(() => readPersistedMobileWeekStart(getCurrentWeekStartDate()))
  const [mobileWeekPublishedShifts, setMobileWeekPublishedShifts] = useState([])
  const [mobileWeekPublication, setMobileWeekPublication] = useState({
    weekStartDate: getCurrentWeekStartDate(),
    status: 'draft',
    publishedAt: null,
    unpublishedAt: null,
    publishedBy: null,
  })
  const [isMobileWeekLoading, setIsMobileWeekLoading] = useState(false)
  const [displayedMobileSchedule, setDisplayedMobileSchedule] = useState({
    weekStart: '',
    days: [],
    employeeName: 'Your week',
    isWeekPublished: false,
  })

  useEffect(() => {
    if (!useMobileExperience || !mobileExpandedView || activeView !== 'reservations') {
      return undefined
    }

    scheduleMobileReservationsScrollDebug(
      `mobile-reservations:${window.innerWidth}x${window.innerHeight}`,
    )

    if (!isMobileScrollDebugEnabled()) {
      return undefined
    }

    const handleResize = () => {
      scheduleMobileReservationsScrollDebug(
        `mobile-reservations-resize:${window.innerWidth}x${window.innerHeight}`,
      )
    }

    window.addEventListener('resize', handleResize)
    window.addEventListener('orientationchange', handleResize)
    window.visualViewport?.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('orientationchange', handleResize)
      window.visualViewport?.removeEventListener('resize', handleResize)
    }
  }, [useMobileExperience, mobileExpandedView, activeView])

  const activeWorkspaceId = useMemo(
    () => resolveActiveWorkspaceId({ workspace, membership }),
    [workspace, membership],
  )

  const visibleWorkspaceLoadError = useMemo(() => {
    if (!shouldShowWorkspaceLoadError({
      workspaceLoadError,
      workspace,
      membership,
      isAuthLoading,
    })) {
      return ''
    }

    return formatWorkspaceLoadErrorForUser(workspaceLoadError)
  }, [workspaceLoadError, workspace, membership, isAuthLoading])

  const isStockWorkspaceReady = Boolean(activeWorkspaceId) && !isAuthLoading && !isAuthBootstrapping

  const stockWorkspaceSetupMessage = useMemo(() => {
    if (isStockWorkspaceReady) return ''
    if (isAuthLoading || isAuthBootstrapping) {
      return 'Loading workspace…'
    }
    if (visibleWorkspaceLoadError) return visibleWorkspaceLoadError
    return USER_WORKSPACE_LOADING_MESSAGE
  }, [isStockWorkspaceReady, isAuthLoading, isAuthBootstrapping, visibleWorkspaceLoadError])

  const canManageStockRole = useMemo(
    () => canManageStock(role),
    [role],
  )

  const canManageOperationsRole = useMemo(
    () => canManageOperations(role),
    [role],
  )

  const canManageAnnouncementsRole = useMemo(
    () => canManageAnnouncements(role),
    [role],
  )

  const canEditScheduleRole = useMemo(
    () => canEditSchedule(role),
    [role],
  )

  const canEditFloorPlanRole = useMemo(
    () => canEditFloorPlan(role),
    [role],
  )

  const canManageReservationsRole = useMemo(
    () => canManageReservations(role),
    [role],
  )
  const canConfigureReservationSeatingsRole = useMemo(
    () => canConfigureReservationSeatings(role),
    [role],
  )
  const reservationSeatingsById = useMemo(
    () => buildSeatingsById(reservationSeatings),
    [reservationSeatings],
  )

  const canManageEmployeeInvitesRole = useMemo(
    () => canManageEmployeeInvites(role),
    [role],
  )

  const canAssignManagerInviteRoleFlag = useMemo(
    () => canAssignManagerInviteRole(role),
    [role],
  )

  const isOperationsWorkspaceReady = Boolean(activeWorkspaceId) && !isAuthLoading && !isAuthBootstrapping

  const operationsWorkspaceSetupMessage = useMemo(() => {
    if (isOperationsWorkspaceReady) return ''
    if (isAuthLoading || isAuthBootstrapping) {
      return 'Loading workspace…'
    }
    if (visibleWorkspaceLoadError) return visibleWorkspaceLoadError
    return USER_WORKSPACE_LOADING_MESSAGE
  }, [isOperationsWorkspaceReady, isAuthLoading, isAuthBootstrapping, visibleWorkspaceLoadError])

  const visibleNavItems = useMemo(
    () => filterNavItemsByRole(NAV_ITEMS, role),
    [role],
  )

  const visibleTeamSections = useMemo(
    () => TEAM_SECTIONS.filter((section) => canAccessTeamSection(role, section.id)),
    [role],
  )

  const visibleOperationsSections = useMemo(
    () => filterOperationsSections(OPERATIONS_SECTIONS, role, { hideMobileTasks: useMobileExperience }),
    [role, useMobileExperience],
  )

  const permittedTodayQuickActions = useMemo(
    () => getTodayQuickActions(role),
    [role],
  )

  const canOpenWorkspaceProfile = useMemo(
    () => canAccessModule(role, 'settings'),
    [role],
  )

  const mobileBottomTabs = useMemo(
    () => getMobileBottomTabs(role, resolveMobileShellVariant(role)),
    [role],
  )

  const activeChecklistRunTemplate = useMemo(
    () => operationsChecklistTemplates.find(
      (template) => `${template.id}` === `${activeChecklistRunTemplateId}`,
    ) ?? null,
    [operationsChecklistTemplates, activeChecklistRunTemplateId],
  )

  const isActiveViewAllowed = !isAuthLoading && canAccessModule(role, activeView)
  const shouldRenderReservationsHostView = useMemo(
    () => shouldShowReservationsHostView({
      role,
      useMobileExperience,
      mobileReservationsHostMode,
    }),
    [role, useMobileExperience, mobileReservationsHostMode],
  )
  const useReservationsHostDedicatedShell = useMemo(
    () => shouldUseReservationsHostDedicatedShell({
      role,
      activeView,
      useMobileExperience,
      mobileReservationsHostMode,
    }),
    [role, activeView, useMobileExperience, mobileReservationsHostMode],
  )
  const isActiveViewPendingPermissionRedirect = useMemo(() => {
    if (isAuthLoading) return false
    return resolvePermittedActiveView(role, activeView) !== activeView
  }, [isAuthLoading, role, activeView])

  const persistCurrentNavigation = useCallback((overrides = {}) => {
    persistNavigation({
      activeView,
      settingsSection,
      teamSection,
      stockSection,
      operationsSection,
      scheduleWeekStart,
      ...overrides,
    })
  }, [activeView, settingsSection, teamSection, stockSection, operationsSection, scheduleWeekStart])

  const syncScheduleTemplateSetupState = useCallback(() => {
    setScheduleLegacyTemplateSchema(didUseLegacyShiftTemplateSchema())
  }, [])

  const handleScheduleWeekStartChange = useCallback((nextWeekStart) => {
    setScheduleWeekStart(nextWeekStart)
    persistNavigation({
      activeView,
      settingsSection,
      teamSection,
      stockSection,
      operationsSection,
      scheduleWeekStart: nextWeekStart,
    })
  }, [activeView, settingsSection, teamSection, stockSection, operationsSection])

  useEffect(() => {
    persistCurrentNavigation()
  }, [persistCurrentNavigation])

  useEffect(() => {
    if (isAuthLoading) return

    const permittedView = resolvePermittedActiveView(role, activeView)
    const permittedTeamSection = resolvePermittedTeamSection(role, teamSection)
    const permittedOperationsSection = resolvePermittedOperationsSection(role, operationsSection)
    const shouldUpdateView = permittedView !== activeView
    const shouldUpdateTeamSection = activeView === 'team' && permittedTeamSection !== teamSection
    const shouldUpdateOperationsSection = activeView === 'operations' && permittedOperationsSection !== operationsSection

    if (!shouldUpdateView && !shouldUpdateTeamSection && !shouldUpdateOperationsSection) return

    if (shouldUpdateView) {
      setActiveView(permittedView)
    }
    if (shouldUpdateTeamSection) {
      setTeamSection(permittedTeamSection)
    }
    if (shouldUpdateOperationsSection) {
      setOperationsSection(permittedOperationsSection)
    }

    persistNavigation({
      activeView: permittedView,
      settingsSection,
      teamSection: permittedTeamSection,
      stockSection,
      operationsSection: permittedOperationsSection,
    })
  }, [isAuthLoading, role, activeView, teamSection, settingsSection, stockSection, operationsSection])

  const handleActiveViewChange = useCallback((nextView) => {
    const permittedView = resolvePermittedActiveView(role, nextView)
    const nextTeamSection = permittedView === 'team'
      ? resolvePermittedTeamSection(role, teamSection || getDefaultTeamSection(role, canAccessTeamSection))
      : teamSection

    if (isEmployeeModalOpen) {
      const remainsOnPeople = permittedView === 'team' && nextTeamSection === 'members'
      if (!remainsOnPeople) {
        handleCloseEmployeeModal()
      }
    }

    setActiveView(permittedView)
    if (permittedView === 'team') {
      setTeamSection(nextTeamSection)
    }
    if (permittedView !== 'team' || nextTeamSection !== 'members') {
      setSelectedEmployee(null)
    }

    persistNavigation({
      activeView: permittedView,
      settingsSection,
      teamSection: nextTeamSection,
      stockSection,
      operationsSection,
    })
  }, [role, settingsSection, teamSection, stockSection, operationsSection, isEmployeeModalOpen, handleCloseEmployeeModal, canAccessTeamSection])

  const handleTeamSectionChange = useCallback((nextSection) => {
    const permittedSection = resolvePermittedTeamSection(role, nextSection)

    if (isEmployeeModalOpen && activeView === 'team' && permittedSection !== 'members') {
      handleCloseEmployeeModal()
    }

    setTeamSection(permittedSection)
    if (permittedSection !== 'members') {
      setSelectedEmployee(null)
    }
    persistNavigation({
      activeView,
      settingsSection,
      teamSection: permittedSection,
      stockSection,
      operationsSection,
    })
  }, [role, activeView, settingsSection, stockSection, operationsSection, isEmployeeModalOpen, handleCloseEmployeeModal])

  const handleStockSectionChange = useCallback((nextSection) => {
    setStockSection(nextSection)
    persistNavigation({
      activeView,
      settingsSection,
      teamSection,
      stockSection: nextSection,
      operationsSection,
    })
  }, [activeView, settingsSection, teamSection, operationsSection])

  const handleOpenStockOrders = useCallback((statusFilter = 'all') => {
    if (statusFilter && statusFilter !== 'all') {
      setStockOrdersFilterHint(statusFilter)
    }
    handleStockSectionChange('orders')
  }, [handleStockSectionChange])

  const handleOperationsSectionChange = useCallback((nextSection) => {
    const permittedSection = resolvePermittedOperationsSection(role, nextSection)
    setOperationsSection(permittedSection)
    persistNavigation({
      activeView,
      settingsSection,
      teamSection,
      stockSection,
      operationsSection: permittedSection,
    })
  }, [role, activeView, settingsSection, teamSection, stockSection])

  const handleSettingsSectionChange = useCallback((nextSection) => {
    setSettingsSection(nextSection)
    persistNavigation({
      activeView,
      settingsSection: nextSection,
      teamSection,
      stockSection,
      operationsSection,
    })
  }, [activeView, teamSection, stockSection, operationsSection])

  const workspaceTimeZone = workspaceProfile.timezone

  useEffect(() => {
    setWorkspaceDefaultPhoneCountryCode(resolveWorkspaceDefaultPhoneCountryCode(workspaceProfile))
  }, [workspaceProfile])
  const currentDateLabel = formatCurrentDateLabel(localNow, workspaceTimeZone)
  const currentDateKey = getCurrentDateKey(localNow, workspaceTimeZone)
  const currentTimeGreeting = getTimeGreeting(localNow, workspaceTimeZone)
  const hostNowMinutes = localNow.getHours() * 60 + localNow.getMinutes()
  const todayWeekStart = useMemo(
    () => getWeekStartDate(parseLocalDate(currentDateKey)),
    [currentDateKey],
  )

  const isViewingTodayWeekInScheduler = scheduleWeekStart === todayWeekStart

  const brandDisplay = useMemo(
    () => buildBrandDisplay(workspaceProfile),
    [workspaceProfile],
  )

  const profileChipDisplay = useMemo(
    () => buildProfileChipDisplay(workspaceProfile),
    [workspaceProfile],
  )

  const resolvedUserDisplayName = useMemo(
    () => resolveUserDisplayName({
      membership,
      employees: scheduleEmployees,
      user,
    }),
    [membership, scheduleEmployees, user],
  )

  const mobileGreeting = useMemo(
    () => buildDashboardGreeting(currentTimeGreeting, resolvedUserDisplayName),
    [currentTimeGreeting, resolvedUserDisplayName],
  )

  const dashboardShifts = useMemo(() => {
    const draftSource = isViewingTodayWeekInScheduler ? shifts : todayWeekShifts
    return resolveLiveDraftShiftsForWeek(draftSource, todayWeekStart)
  }, [isViewingTodayWeekInScheduler, shifts, todayWeekShifts, todayWeekStart])

  const dashboardCapacities = useMemo(() => {
    const capacitySource = isViewingTodayWeekInScheduler ? scheduleCapacities : todayWeekCapacities
    return resolveLiveDraftCapacitiesForWeek(capacitySource, todayWeekStart, {
      useSchedulerSource: isViewingTodayWeekInScheduler,
    })
  }, [isViewingTodayWeekInScheduler, scheduleCapacities, todayWeekCapacities, todayWeekStart])

  const dashboardPublishedShifts = useMemo(() => (
    isViewingTodayWeekInScheduler ? publishedShifts : todayWeekPublishedShifts
  ), [isViewingTodayWeekInScheduler, publishedShifts, todayWeekPublishedShifts])

  const isTodayWeekPublished = useMemo(() => {
    const publication = isViewingTodayWeekInScheduler ? schedulePublication : todayWeekPublication
    return publication?.status === 'published'
  }, [isViewingTodayWeekInScheduler, schedulePublication, todayWeekPublication])

  const liveFloorState = useMemo(() => buildLiveFloorState({
    publishedShifts: dashboardPublishedShifts,
    isWeekPublished: isTodayWeekPublished,
    employees: scheduleEmployees,
    todayKey: currentDateKey,
    now: localNow,
  }), [
    dashboardPublishedShifts,
    isTodayWeekPublished,
    scheduleEmployees,
    currentDateKey,
    localNow,
  ])

  const refreshTodayWeekPublishedData = useCallback(async (weekStartDate = todayWeekStart) => {
    const normalizedWeekStart = `${weekStartDate ?? ''}`.trim() || todayWeekStart
    if (!normalizedWeekStart) {
      return { publication: null, publishedShifts: [] }
    }

    const state = await getWeekSchedulePublicationState(normalizedWeekStart)

    if (normalizedWeekStart === scheduleWeekStart) {
      setSchedulePublication(state.publication ?? {
        weekStartDate: normalizedWeekStart,
        status: 'draft',
        publishedAt: null,
        unpublishedAt: null,
        publishedBy: null,
      })
      setPublishedShifts(Array.isArray(state.publishedShifts) ? state.publishedShifts : [])
    } else {
      setTodayWeekPublication(state.publication ?? {
        weekStartDate: normalizedWeekStart,
        status: 'draft',
        publishedAt: null,
        unpublishedAt: null,
        publishedBy: null,
      })
      setTodayWeekPublishedShifts(Array.isArray(state.publishedShifts) ? state.publishedShifts : [])
    }

    return state
  }, [activeWorkspaceId, scheduleWeekStart, todayWeekStart])

  const refreshTodayWeekDraftData = useCallback(async (weekStartDate = todayWeekStart) => {
    const normalizedWeekStart = `${weekStartDate ?? ''}`.trim() || todayWeekStart
    if (!normalizedWeekStart || !activeWorkspaceId) {
      return { shifts: [], capacities: [] }
    }

    const weekDateKeys = getWeekDateKeys(normalizedWeekStart)
    const [remoteShifts, remoteCapacities] = await Promise.all([
      getShifts(activeWorkspaceId, {
        startDate: weekDateKeys[0],
        endDate: weekDateKeys[weekDateKeys.length - 1],
      }),
      getScheduleCapacities({ shiftDates: weekDateKeys }),
    ])

    if (normalizedWeekStart === scheduleWeekStart) {
      setShifts(remoteShifts)
      setScheduleCapacities(remoteCapacities)
    } else {
      setTodayWeekShifts(remoteShifts)
      setTodayWeekCapacities(remoteCapacities)
    }

    return { shifts: remoteShifts, capacities: remoteCapacities }
  }, [activeWorkspaceId, scheduleWeekStart, todayWeekStart])

  const isDashboardScheduleLoading = isViewingTodayWeekInScheduler
    ? isScheduleLoading
    : isTodayWeekLoading

  const operationalSnapshot = useMemo(() => buildOperationalSnapshot({
    shifts: dashboardShifts,
    shiftTemplates,
    scheduleCapacities: dashboardCapacities,
    employees: scheduleEmployees,
    todayKey: currentDateKey,
    todayDateLabel: currentDateLabel,
    timeGreeting: currentTimeGreeting,
    businessName: workspaceProfile.businessName,
    userName: workspaceProfile.managerName,
  }), [
    dashboardShifts,
    shiftTemplates,
    dashboardCapacities,
    scheduleEmployees,
    currentDateKey,
    currentDateLabel,
    currentTimeGreeting,
    workspaceProfile.businessName,
    workspaceProfile.managerName,
  ])

  const todayReservationsSummary = useMemo(
    () => buildTodayReservationsSummary(reservations, currentDateKey),
    [reservations, currentDateKey],
  )

  const dashboardIssuesSummary = useMemo(
    () => buildDashboardIssuesSummary(operationalSnapshot),
    [operationalSnapshot],
  )

  const dashboardStockAlerts = useMemo(() => (
    resolveDashboardStockAlerts(
      stockItems,
      getLowStockAlertItems(inventoryItems),
    )
  ), [stockItems, inventoryItems])

  const todayActionableTasks = useMemo(
    () => filterTasksExcludingAnnouncementDuplicates(tasks, operationsAnnouncements),
    [tasks, operationsAnnouncements],
  )

  const dashboardTaskOverview = useMemo(
    () => calculateTaskOverview(todayActionableTasks, currentDateKey),
    [todayActionableTasks, currentDateKey],
  )

  const currentTaskEmployeeId = useMemo(() => {
    const linkedEmployeeId = `${membership?.employeeId ?? ''}`.trim()
    if (linkedEmployeeId) return linkedEmployeeId
    return resolveCurrentEmployeeId(workspaceProfile.managerName, scheduleEmployees)
  }, [membership?.employeeId, workspaceProfile.managerName, scheduleEmployees])

  const currentEmployeeDepartment = useMemo(() => {
    const employeeId = membership?.employeeId
    if (!employeeId) return ''
    const employee = scheduleEmployees.find((item) => `${item.id}` === `${employeeId}`)
    return `${employee?.position ?? ''}`.trim()
  }, [membership?.employeeId, scheduleEmployees])

  const mobileEmployeeId = useMemo(() => {
    const employeeId = `${membership?.employeeId ?? ''}`.trim()
    return employeeId || null
  }, [membership?.employeeId])

  const mobileNeedsEmployeeLink = !mobileEmployeeId

  const mobileLinkedEmployee = useMemo(() => {
    const employeeId = `${membership?.employeeId ?? ''}`.trim()
    if (!employeeId) return null

    return scheduleEmployees.find((employee) => `${employee.id}` === employeeId)
      ?? employees.find((employee) => `${employee.id}` === employeeId)
      ?? null
  }, [membership?.employeeId, scheduleEmployees, employees])

  useEffect(() => {
    if (isAuthDisabled || isAuthBootstrapping) return
    if (user) return

    setMobileStaffTab('home')
    setMobileManagerTab('today')
    setMobileMenuScreen('main')
    setMobileExpandedView(null)
    setMobileWeekStart(getCurrentWeekStartDate())
    setMobileNotice('')
    setMobileProfileError('')
  }, [user, isAuthDisabled, isAuthBootstrapping])

  useEffect(() => {
    if (!membershipLoadError) return
    if (!isMobileViewport) return
    setMobileNotice(membershipLoadError)
  }, [membershipLoadError, isMobileViewport])

  useEffect(() => {
    setMobileProfilePhone(`${mobileLinkedEmployee?.phone ?? ''}`.trim())
  }, [mobileLinkedEmployee?.id, mobileLinkedEmployee?.phone])

  const mobileWeekDays = useMemo(
    () => getWeekDays(mobileWeekStart),
    [mobileWeekStart],
  )

  const mobileWeekPublishedShiftSource = useMemo(() => {
    if (mobileWeekStart === scheduleWeekStart) return publishedShifts
    if (mobileWeekStart === todayWeekStart) return todayWeekPublishedShifts
    return mobileWeekPublishedShifts
  }, [
    mobileWeekStart,
    scheduleWeekStart,
    todayWeekStart,
    publishedShifts,
    todayWeekPublishedShifts,
    mobileWeekPublishedShifts,
  ])

  const isMobileWeekPublished = useMemo(() => {
    if (mobileWeekStart === scheduleWeekStart) {
      return schedulePublication?.status === 'published'
    }
    if (mobileWeekStart === todayWeekStart) {
      return todayWeekPublication?.status === 'published'
    }
    return mobileWeekPublication?.status === 'published'
  }, [
    mobileWeekStart,
    scheduleWeekStart,
    todayWeekStart,
    schedulePublication?.status,
    todayWeekPublication?.status,
    mobileWeekPublication?.status,
  ])

  const mobileStaffOperationsTasks = useMemo(() => (
    filterTasksExcludingAnnouncementDuplicates(
      filterStandaloneOperationsTasks(mobileOperationsTasks),
      operationsAnnouncements,
    )
  ), [mobileOperationsTasks, operationsAnnouncements])

  const mobileAssignedTasks = useMemo(() => {
    if (!mobileEmployeeId) return []
    return filterMobileStaffOperationsTasks(mobileStaffOperationsTasks, mobileEmployeeId)
  }, [mobileStaffOperationsTasks, mobileEmployeeId])

  const mobileTaskOverview = useMemo(() => {
    if (!mobileEmployeeId) {
      return {
        active: 0,
        overdue: 0,
        completedToday: 0,
        completionPercent: 0,
        showEmptyToday: true,
        needsEmployeeLink: true,
      }
    }

    return calculateMobileOperationsTaskOverview(mobileAssignedTasks, currentDateKey)
  }, [mobileEmployeeId, mobileAssignedTasks, currentDateKey])

  const mobileEmployeeWeekSchedule = useMemo(() => {
    if (!mobileEmployeeId) return null

    return buildMobileEmployeeWeekSchedule({
      employeeId: mobileEmployeeId,
      employees: scheduleEmployees,
      weekDays: mobileWeekDays,
      publishedShifts: mobileWeekPublishedShiftSource,
      todayKey: currentDateKey,
    })
  }, [mobileEmployeeId, scheduleEmployees, mobileWeekDays, mobileWeekPublishedShiftSource, currentDateKey])

  useEffect(() => {
    if (isMobileWeekLoading) return

    setDisplayedMobileSchedule({
      weekStart: mobileWeekStart,
      days: mobileEmployeeWeekSchedule?.days ?? [],
      employeeName: mobileEmployeeWeekSchedule?.employeeName ?? 'Your week',
      isWeekPublished: isMobileWeekPublished,
    })
  }, [
    isMobileWeekLoading,
    mobileWeekStart,
    mobileEmployeeWeekSchedule,
    isMobileWeekPublished,
  ])

  const mobileScheduleDisplay = isMobileWeekLoading ? displayedMobileSchedule : {
    weekStart: mobileWeekStart,
    days: mobileEmployeeWeekSchedule?.days ?? [],
    employeeName: mobileEmployeeWeekSchedule?.employeeName ?? 'Your week',
    isWeekPublished: isMobileWeekPublished,
  }

  const mobileScheduleWeekLabel = useMemo(() => {
    const weekStart = `${mobileScheduleDisplay.weekStart || mobileWeekStart}`.trim() || mobileWeekStart
    return formatWeekRange(getWeekDays(weekStart))
  }, [mobileScheduleDisplay.weekStart, mobileWeekStart])

  const mobileShiftSummary = useMemo(() => {
    if (!mobileEmployeeId) {
      return {
        tone: 'neutral',
        headline: 'Employee profile required',
        detail: 'Link your employee profile to view your shift.',
        needsEmployeeLink: true,
      }
    }

    return buildMobileEmployeeShiftSummary({
      employeeId: mobileEmployeeId,
      publishedShifts: dashboardPublishedShifts,
      isWeekPublished: isTodayWeekPublished,
      todayKey: currentDateKey,
      now: localNow,
      liveFloor: liveFloorState,
    })
  }, [
    mobileEmployeeId,
    dashboardPublishedShifts,
    isTodayWeekPublished,
    currentDateKey,
    localNow,
    liveFloorState,
  ])

  const mobileTaskGroups = useMemo(
    () => partitionMobileOperationsTasks(mobileAssignedTasks, currentDateKey),
    [mobileAssignedTasks, currentDateKey],
  )

  const dashboardReservationsFooter = useMemo(
    () => buildReservationsFooter(reservations, currentDateKey, localNow),
    [reservations, currentDateKey, localNow],
  )

  const managerMobileStockSummary = useMemo(
    () => buildStockDashboardSummary(stockItems),
    [stockItems],
  )

  const managerMobileOrdersSummary = useMemo(
    () => buildStockOrdersOperationsSummary(stockOrders),
    [stockOrders],
  )

  const dashboardNowMinutes = localNow.getHours() * 60 + localNow.getMinutes()

  const dashboardServiceSnapshot = useMemo(
    () => (
      isReservationsModuleConnected
        ? buildDailyServiceSnapshot(reservations, dashboardNowMinutes, currentDateKey, localNow)
        : null
    ),
    [isReservationsModuleConnected, reservations, dashboardNowMinutes, currentDateKey, localNow],
  )

  const canAccessStockModule = canAccessModule(role, 'stock')

  const todayStatusSummary = useMemo(() => buildTodayStatusSummary({
    liveFloor: liveFloorState,
    snapshot: operationalSnapshot,
    reservationsSummary: todayReservationsSummary,
    reservationsConnected: isReservationsModuleConnected,
    reservationsFooter: dashboardReservationsFooter,
    serviceSnapshot: dashboardServiceSnapshot,
    tasksOverview: dashboardTaskOverview,
    tasksConnected: isTasksModuleConnected,
    stockSummary: managerMobileStockSummary,
    stockOrdersSummary: managerMobileOrdersSummary,
    stockConnected: canAccessStockModule,
    hasStockModuleData: stockItems.length > 0,
  }), [
    liveFloorState,
    operationalSnapshot,
    todayReservationsSummary,
    isReservationsModuleConnected,
    dashboardReservationsFooter,
    dashboardServiceSnapshot,
    dashboardTaskOverview,
    isTasksModuleConnected,
    managerMobileStockSummary,
    managerMobileOrdersSummary,
    canAccessStockModule,
    stockItems.length,
  ])

  const teamTodayShiftSource = useMemo(() => (
    isTodayWeekPublished ? dashboardPublishedShifts : dashboardShifts
  ), [isTodayWeekPublished, dashboardPublishedShifts, dashboardShifts])

  const scheduleAttentionCoverageBreakdown = useMemo(() => buildTeamTodayCoverageBreakdown({
    shifts: dashboardShifts,
    shiftTemplates,
    scheduleCapacities: dashboardCapacities,
    todayKey: currentDateKey,
  }), [dashboardShifts, shiftTemplates, dashboardCapacities, currentDateKey])

  const teamTodayDisplayCoverageBreakdown = useMemo(() => buildTeamTodayCoverageBreakdown({
    shifts: teamTodayShiftSource,
    shiftTemplates,
    scheduleCapacities: dashboardCapacities,
    todayKey: currentDateKey,
  }), [teamTodayShiftSource, shiftTemplates, dashboardCapacities, currentDateKey])

  const teamTodayGroups = useMemo(() => buildTeamTodayGroups({
    shifts: teamTodayShiftSource,
    employees: scheduleEmployees,
    todayKey: currentDateKey,
  }), [teamTodayShiftSource, scheduleEmployees, currentDateKey])

  const enrichedTeamTodayGroups = useMemo(() => {
    const enriched = enrichTeamTodayGroups(teamTodayGroups, {
      liveFloor: liveFloorState,
      now: localNow,
    })
    return applyCoverageHintsToGroups(enriched, teamTodayDisplayCoverageBreakdown)
  }, [teamTodayGroups, liveFloorState, localNow, teamTodayDisplayCoverageBreakdown])

  const teamTodayStatus = useMemo(() => buildTeamTodayStatus({
    liveFloor: liveFloorState,
    snapshot: operationalSnapshot,
    coverageBreakdown: teamTodayDisplayCoverageBreakdown,
  }), [liveFloorState, operationalSnapshot, teamTodayDisplayCoverageBreakdown])

  const peopleWorkspaceNow = useMemo(
    () => getWorkspaceNowMinutes(localNow, workspaceTimeZone),
    [localNow, workspaceTimeZone],
  )

  const employeeTodayStatusById = useMemo(() => {
    const map = {}
    const nowMinutes = peopleWorkspaceNow.minutes ?? 0

    employees.forEach((employee) => {
      const employeeId = `${employee?.id ?? ''}`.trim()
      if (!employeeId) return

      map[employeeId] = resolveEmployeeTodayStatus({
        employeeId,
        publishedShifts: dashboardPublishedShifts,
        todayKey: currentDateKey,
        nowMinutes,
        isWeekPublished: isTodayWeekPublished,
        approvedLeave: null,
      })
    })

    return map
  }, [
    employees,
    dashboardPublishedShifts,
    currentDateKey,
    peopleWorkspaceNow.minutes,
    isTodayWeekPublished,
  ])

  const todayAttentionOperationsTasks = useMemo(() => (
    filterTasksExcludingAnnouncementDuplicates(
      filterStandaloneOperationsTasks(operationsTasks),
      operationsAnnouncements,
    )
  ), [operationsTasks, operationsAnnouncements])

  const todayAttentionItems = useMemo(() => buildTodayCommandCenterAttentionItems({
    stockAlerts: dashboardStockAlerts,
    inventoryConnected: isInventoryModuleConnected,
    operationsTasks: todayAttentionOperationsTasks,
    todayKey: currentDateKey,
    issuesSummary: dashboardIssuesSummary,
    snapshot: operationalSnapshot,
    coverageBreakdown: scheduleAttentionCoverageBreakdown,
    reservations,
    reservationsConnected: isReservationsModuleConnected,
    nowMinutes: dashboardNowMinutes,
    now: localNow,
    serviceSnapshot: dashboardServiceSnapshot,
    stockOrdersSummary: managerMobileOrdersSummary,
    stockSummary: managerMobileStockSummary,
    hasStockModuleData: stockItems.length > 0,
    announcements: operationsAnnouncements,
    announcementRole: role,
    announcementEmployeeDepartment: currentEmployeeDepartment,
  }), [
    dashboardStockAlerts,
    isInventoryModuleConnected,
    todayAttentionOperationsTasks,
    currentDateKey,
    dashboardIssuesSummary,
    operationalSnapshot,
    scheduleAttentionCoverageBreakdown,
    reservations,
    isReservationsModuleConnected,
    dashboardNowMinutes,
    localNow,
    dashboardServiceSnapshot,
    managerMobileOrdersSummary,
    managerMobileStockSummary,
    stockItems.length,
    operationsAnnouncements,
    role,
    currentEmployeeDepartment,
  ])

  const managerMobileOperationsTasks = useMemo(() => (
    filterTasksExcludingAnnouncementDuplicates(
      filterStandaloneOperationsTasks(operationsTasks),
      operationsAnnouncements,
    )
  ), [operationsTasks, operationsAnnouncements])

  const managerMobileTaskOverview = useMemo(
    () => calculateMobileOperationsTaskOverview(managerMobileOperationsTasks, currentDateKey),
    [managerMobileOperationsTasks, currentDateKey],
  )

  const managerMobileDepartmentPerformance = useMemo(
    () => calculateDepartmentPerformanceSummaries(todayActionableTasks, currentDateKey),
    [todayActionableTasks, currentDateKey],
  )

  const isManagerMobileShell = !isAuthLoading && isManagementMobileRole(role)
  const isHostMobileShell = !isAuthLoading && isHostMobileRole(role)
  const useHostStationShell = isHostMobileShell || useReservationsHostDedicatedShell
  const useDedicatedShell = useMobileExperience || isHostMobileShell
  const isScheduleFocusMode = isTeamScheduleView(activeView, teamSection) && !useDedicatedShell
  const hideGlobalAppSidebar = useDedicatedShell || useReservationsHostDedicatedShell || isScheduleFocusMode
  const activeMobileTab = isManagerMobileShell ? mobileManagerTab : mobileStaffTab
  const isManagerMobileStockLoading = isManagerMobileBootstrapLoading || isStockItemsLoading || isStockOrdersLoading
  const isManagerMobileTasksLoading = isManagerMobileBootstrapLoading || isOperationsLoading

  useEffect(() => {
    if (!useDedicatedShell || isAuthLoading) return

    const variant = resolveMobileShellVariant(role)
    const allowedTabs = getMobileBottomTabs(role, variant)
    if (allowedTabs.length === 0) return

    const isActiveTabAllowed = allowedTabs.some((tab) => tab.id === activeMobileTab)
    if (isActiveTabAllowed) return

    const fallbackTab = allowedTabs[0].id
    if (variant === 'manager') {
      setMobileManagerTab(fallbackTab)
      persistManagerMobileTab(fallbackTab)
      return
    }

    setMobileStaffTab(fallbackTab)
    persistMobileTab(fallbackTab, variant)
  }, [
    useDedicatedShell,
    isAuthLoading,
    isManagerMobileShell,
    isHostMobileShell,
    role,
    activeMobileTab,
  ])

  useEffect(() => {
    if (isAuthLoading || !isHostMobileShell) return

    if (activeView !== 'reservations') {
      handleActiveViewChange('reservations')
    }

    if (!mobileReservationsHostMode) {
      setMobileReservationsHostMode(true)
    }

    if (shouldUseHostStationLanding(role) && activeMobileTab !== 'host') {
      setMobileStaffTab('host')
      persistMobileTab('host', 'host')
    }
  }, [
    isAuthLoading,
    isHostMobileShell,
    role,
    activeView,
    activeMobileTab,
    mobileReservationsHostMode,
    handleActiveViewChange,
  ])

  const dashboardTimelineEvents = useMemo(() => buildTodayServiceTimeline({
    // Service timeline uses actionable tasks only, not announcements or operations tasks.
    timelineEvents: buildTodayCommandTimeline({
      shifts: dashboardShifts,
      employees: scheduleEmployees,
      reservations,
      todayKey: currentDateKey,
      reservationsConnected: isReservationsModuleConnected,
    }),
    tasks: todayActionableTasks,
    todayKey: currentDateKey,
    tasksConnected: isTasksModuleConnected,
  }), [
    dashboardShifts,
    scheduleEmployees,
    reservations,
    currentDateKey,
    isReservationsModuleConnected,
    todayActionableTasks,
    isTasksModuleConnected,
  ])

  const dashboardLiveStatus = useMemo(() => {
    if (liveFloorState.state === 'live') {
      const count = liveFloorState.onShiftCount
      return {
        chipLabel: 'On Shift',
        chipValue: String(count),
        chipStatus: count === 1 ? 'team member live' : 'team members live',
        tone: 'live',
      }
    }

    if (liveFloorState.state === 'idle' && liveFloorState.nextShiftStartLabel) {
      return {
        chipLabel: 'Next Shift',
        chipValue: liveFloorState.nextShiftStartLabel,
        chipStatus: 'Standby',
        tone: 'standby',
      }
    }

    if (liveFloorState.state === 'unpublished') {
      return {
        chipLabel: 'Schedule',
        chipValue: 'Draft',
        chipStatus: 'Publish to go live',
        tone: 'draft',
      }
    }

    return {
      chipLabel: 'Status',
      chipValue: 'Standby',
      chipStatus: 'No active shift',
      tone: 'standby',
    }
  }, [liveFloorState])

  const dashboardHeroDateLabel = useMemo(
    () => formatDashboardHeroDate(localNow, workspaceTimeZone),
    [localNow, workspaceTimeZone],
  )

  const todayExecutiveMessage = useMemo(() => buildTodayExecutiveMessage({
    hasUrgentAttention: hasUrgentAttentionItems(todayAttentionItems),
    overdueTaskCount: dashboardTaskOverview?.overdue ?? 0,
    hasScheduleGaps: (Number(operationalSnapshot?.coverageGaps) || 0) > 0
      || todayAttentionItems.some((item) => item.key === 'schedule-issues'),
    reservationsTodayCount: isReservationsModuleConnected
      ? Number(todayReservationsSummary?.bookings) || 0
      : 0,
    firstShiftStartLabel: liveFloorState.nextShiftStartLabel,
    isServiceInProgress: liveFloorState.state === 'live',
    hasStockProblems: canAccessStockModule && hasTodayStockProblems({
      stockSummary: managerMobileStockSummary,
      stockSummaryLine: todayStatusSummary.stockSummaryLine,
      hasStockModuleData: stockItems.length > 0,
    }),
  }), [
    todayAttentionItems,
    dashboardTaskOverview?.overdue,
    operationalSnapshot?.coverageGaps,
    isReservationsModuleConnected,
    todayReservationsSummary?.bookings,
    liveFloorState.nextShiftStartLabel,
    liveFloorState.state,
    canAccessStockModule,
    managerMobileStockSummary,
    todayStatusSummary.stockSummaryLine,
    stockItems.length,
  ])

  const todayCommandHeaderChips = useMemo(() => buildTodayCommandHeaderChips({
    dashboardLiveStatus,
    todayStatusSummary,
    dashboardTaskOverview,
    todayReservationsSummary,
    reservationsConnected: isReservationsModuleConnected,
    liveFloorState,
    showStock: canAccessStockModule,
  }), [
    dashboardLiveStatus,
    todayStatusSummary,
    dashboardTaskOverview,
    todayReservationsSummary,
    isReservationsModuleConnected,
    liveFloorState,
    canAccessStockModule,
  ])

  const todayWorkspaceBadge = useMemo(() => {
    const workspaceName = `${workspace?.name ?? ''}`.trim()
    if (workspaceName) return workspaceName
    return `${brandDisplay.businessNameLabel ?? ''}`.trim()
  }, [workspace?.name, brandDisplay.businessNameLabel])

  const refreshReservations = useCallback(async () => {
    if (!activeWorkspaceId) {
      setReservations([])
      setIsReservationsModuleConnected(false)
      return []
    }

    try {
      const remoteReservations = await getReservations(activeWorkspaceId)
      setReservations(remoteReservations)
      setIsReservationsModuleConnected(true)
      return remoteReservations
    } catch (error) {
      setReservations([])
      setIsReservationsModuleConnected(!isModuleUnavailableMessage(error.message))
      throw error
    }
  }, [activeWorkspaceId])

  const upsertReservationInState = useCallback((reservation) => {
    if (!reservation?.id) return
    setReservations((current) => replaceReservationInCollection(current, reservation))
  }, [])

  const removeReservationFromState = useCallback((reservationId) => {
    const id = `${reservationId ?? ''}`.trim()
    if (!id) return
    setReservations((current) => current.filter((entry) => `${entry.id}` !== id))
  }, [])

  const reloadTodayReservations = useCallback(async () => {
    await refreshReservations()
  }, [refreshReservations])

  const refreshInventory = useCallback(async () => {
    try {
      const remoteInventory = await getInventoryItems()
      setInventoryItems(remoteInventory)
      setIsInventoryModuleConnected(true)
      return remoteInventory
    } catch (error) {
      setInventoryItems([])
      setIsInventoryModuleConnected(!isModuleUnavailableMessage(error.message))
      throw error
    }
  }, [])

  const refreshStockItems = useCallback(async () => {
    if (!activeWorkspaceId) {
      setStockItems([])
      return []
    }

    try {
      const remoteStockItems = await getStockItemsWithLastMovement(activeWorkspaceId)
      setStockItems(remoteStockItems)
      return remoteStockItems
    } catch (error) {
      setStockItems([])
      throw error
    }
  }, [activeWorkspaceId])

  const refreshStockOrders = useCallback(async () => {
    if (!activeWorkspaceId) {
      setStockOrders([])
      return []
    }

    try {
      const remoteOrders = await getStockOrdersWithAuthors(activeWorkspaceId)
      setStockOrders(remoteOrders)
      return remoteOrders
    } catch (error) {
      setStockOrders([])
      throw error
    }
  }, [activeWorkspaceId])

  const refreshOperationsChecklistTemplates = useCallback(async () => {
    if (!activeWorkspaceId) {
      setOperationsChecklistTemplates([])
      return []
    }

    try {
      const remoteTemplates = await getOperationsChecklistTemplates(activeWorkspaceId)
      setOperationsChecklistTemplates(remoteTemplates)
      return remoteTemplates
    } catch (error) {
      setOperationsChecklistTemplates([])
      throw error
    }
  }, [activeWorkspaceId])

  const refreshOperationsTasks = useCallback(async () => {
    if (!activeWorkspaceId) {
      setOperationsTasks([])
      return []
    }

    try {
      const remoteTasks = await getOperationsTasks(activeWorkspaceId)
      setOperationsTasks(remoteTasks)
      return remoteTasks
    } catch (error) {
      setOperationsTasks([])
      throw error
    }
  }, [activeWorkspaceId])

  const refreshMobileOperationsTasks = useCallback(async () => {
    if (!activeWorkspaceId) {
      setMobileOperationsTasks([])
      return []
    }

    setIsMobileOperationsTasksLoading(true)

    try {
      const remoteTasks = await getOperationsTasks(activeWorkspaceId)
      setMobileOperationsTasks(remoteTasks)
      return remoteTasks
    } catch (error) {
      setMobileOperationsTasks([])
      throw error
    } finally {
      setIsMobileOperationsTasksLoading(false)
    }
  }, [activeWorkspaceId])

  const refreshOperationsLogs = useCallback(async () => {
    if (!activeWorkspaceId) {
      setOperationsLogs([])
      return []
    }

    try {
      const remoteLogs = await getOperationsLogs(activeWorkspaceId)
      setOperationsLogs(remoteLogs)
      return remoteLogs
    } catch (error) {
      setOperationsLogs([])
      throw error
    }
  }, [activeWorkspaceId])

  const refreshOperationsAnnouncements = useCallback(async () => {
    if (!activeWorkspaceId) {
      setOperationsAnnouncements([])
      return []
    }

    try {
      const remoteAnnouncements = await getOperationsAnnouncements(activeWorkspaceId, {
        currentUserId: user?.id ?? null,
        employees: scheduleEmployees,
      })
      setOperationsAnnouncements(remoteAnnouncements)
      return remoteAnnouncements
    } catch (error) {
      console.warn('[App] refreshOperationsAnnouncements error:', error)
      setOperationsAnnouncements([])
      return []
    }
  }, [activeWorkspaceId, user?.id, scheduleEmployees])

  const refreshBarRefills = useCallback(async () => {
    try {
      const remoteRefills = await getBarRefills()
      setBarRefills(remoteRefills)
      setIsBarRefillsModuleConnected(true)
      return remoteRefills
    } catch (error) {
      setBarRefills([])
      setIsBarRefillsModuleConnected(!isModuleUnavailableMessage(error?.message))
      throw error
    }
  }, [])

  const refreshSuppliers = useCallback(async () => {
    const remoteSuppliers = await getSuppliers()
    setSuppliers(remoteSuppliers)
  }, [])

  const refreshTaskChecklists = useCallback(async (remoteTasks = []) => {
    const taskIds = (remoteTasks ?? []).map((task) => task.id).filter(Boolean)
    if (taskIds.length === 0) {
      setChecklistItemsByTaskId({})
      return {}
    }

    try {
      const grouped = await getChecklistItemsForTasks(taskIds)
      setChecklistItemsByTaskId(grouped)
      return grouped
    } catch {
      setChecklistItemsByTaskId({})
      return {}
    }
  }, [])

  const refreshTemplateChecklists = useCallback(async (remoteTemplates = []) => {
    const templateIds = (remoteTemplates ?? []).map((template) => template.id).filter(Boolean)
    if (templateIds.length === 0) {
      setTemplateChecklistItemsByTemplateId({})
      return {}
    }

    try {
      const grouped = await getTemplateChecklistItems(templateIds)
      setTemplateChecklistItemsByTemplateId(grouped)
      return grouped
    } catch {
      setTemplateChecklistItemsByTemplateId({})
      return {}
    }
  }, [])

  const refreshTasks = useCallback(async () => {
    setIsTasksLoading(true)
    setTasksError('')

    try {
      const remoteTasks = await getTasks()
      setTasks(remoteTasks)
      setIsTasksModuleConnected(true)
      await refreshTaskChecklists(remoteTasks)
      return remoteTasks
    } catch (error) {
      setTasks([])
      setChecklistItemsByTaskId({})
      setTasksError(error?.message || 'Unable to load tasks right now.')
      setIsTasksModuleConnected(!isModuleUnavailableMessage(error?.message))
      throw error
    } finally {
      setIsTasksLoading(false)
    }
  }, [refreshTaskChecklists])

  const refreshTaskTemplates = useCallback(async () => {
    setIsTaskTemplatesLoading(true)
    setTaskTemplatesError('')

    try {
      const remoteTemplates = await getTaskTemplates()
      setTaskTemplates(remoteTemplates)
      await refreshTemplateChecklists(remoteTemplates)
      return remoteTemplates
    } catch (error) {
      setTaskTemplates([])
      setTemplateChecklistItemsByTemplateId({})
      setTaskTemplatesError(error?.message || 'Unable to load task templates right now.')
      throw error
    } finally {
      setIsTaskTemplatesLoading(false)
    }
  }, [refreshTemplateChecklists])

  const refreshDashboardModuleData = useCallback(async () => {
    await Promise.allSettled([
      refreshReservations(),
      refreshInventory(),
      refreshTasks(),
    ])
  }, [refreshInventory, refreshReservations, refreshTasks])

  const refreshReportsData = useCallback(async () => {
    await Promise.allSettled([
      refreshReservations(),
      refreshInventory(),
      refreshTasks(),
      refreshBarRefills(),
      refreshStockItems(),
      refreshStockOrders(),
      refreshSuppliers(),
      refreshTodayWeekDraftData(todayWeekStart),
    ])
  }, [
    refreshBarRefills,
    refreshInventory,
    refreshReservations,
    refreshStockItems,
    refreshStockOrders,
    refreshSuppliers,
    refreshTasks,
    refreshTodayWeekDraftData,
    todayWeekStart,
  ])

  const reportsScheduleData = useMemo(() => ({
    shifts: dashboardShifts,
    shiftTemplates,
    scheduleCapacities: dashboardCapacities,
    employees: scheduleEmployees,
  }), [dashboardShifts, shiftTemplates, dashboardCapacities, scheduleEmployees])

  const reportsConnections = useMemo(() => ({
    reservationsConnected: isReservationsModuleConnected,
    tasksConnected: isTasksModuleConnected,
    inventoryConnected: isInventoryModuleConnected,
    stockModuleConnected: canAccessStockModule && stockItems.length > 0,
    barRefillsConnected: isBarRefillsModuleConnected,
    scheduleConnected: !`${scheduleNotice}`.toLowerCase().includes('not ready'),
    suppliersConnected: !`${suppliersNotice}`.toLowerCase().includes('not ready'),
  }), [
    isReservationsModuleConnected,
    isTasksModuleConnected,
    isInventoryModuleConnected,
    canAccessStockModule,
    stockItems.length,
    isBarRefillsModuleConnected,
    scheduleNotice,
    suppliersNotice,
  ])

  const workspaceModuleConnections = useMemo(() => ({
    reservations: isReservationsModuleConnected,
    schedule: !`${scheduleNotice}`.toLowerCase().includes('not ready'),
    tasks: isTasksModuleConnected,
    suppliers: !`${suppliersNotice}`.toLowerCase().includes('not ready'),
    stock: isInventoryModuleConnected,
    reports: null,
  }), [
    isReservationsModuleConnected,
    isTasksModuleConnected,
    isInventoryModuleConnected,
    scheduleNotice,
    suppliersNotice,
  ])

  const workspaceVenueSetupProps = useMemo(() => {
    const positionDepartments = Array.from(new Set(
      positions.map((position) => `${position.department ?? ''}`.trim()).filter(Boolean),
    )).sort((left, right) => left.localeCompare(right))

    return {
      staffDepartments: positionDepartments.length > 0
        ? positionDepartments
        : ['Bar', 'Service', 'Kitchen', 'Management'],
      scheduleAreas: scheduleAreaOptions,
      reservationAreas: DEFAULT_RESTAURANT_AREAS.map((area) => area.label),
      taskBoards: TASK_PRESET_DEPARTMENTS.map((department) => department.label),
    }
  }, [positions])

  useEffect(() => {
    if (activeView !== 'today') return undefined

    refreshDashboardModuleData()
    const intervalId = window.setInterval(refreshDashboardModuleData, 60_000)

    return () => window.clearInterval(intervalId)
  }, [activeView, refreshDashboardModuleData])

  useEffect(() => {
    if (!isMobileViewport) return undefined

    refreshDashboardModuleData()
    refreshOperationsAnnouncements()
    refreshMobileOperationsTasks().catch((error) => {
      console.warn('[App] refreshMobileOperationsTasks error:', error)
    })
    refreshTodayWeekPublishedData(mobileWeekStart)

    let isMounted = true

    const loadManagerMobileData = async () => {
      if (!isManagementMobileRole(role)) return

      setIsManagerMobileBootstrapLoading(true)
      try {
        await Promise.all([
          refreshStockItems(),
          refreshStockOrders(),
          refreshOperationsTasks(),
        ])
      } catch (error) {
        console.warn('[App] loadManagerMobileData error:', error)
      } finally {
        if (isMounted) {
          setIsManagerMobileBootstrapLoading(false)
        }
      }
    }

    loadManagerMobileData()

    const intervalId = window.setInterval(() => {
      refreshDashboardModuleData()
      refreshOperationsAnnouncements()
      refreshMobileOperationsTasks().catch((error) => {
        console.warn('[App] refreshMobileOperationsTasks error:', error)
      })

      if (isManagementMobileRole(role)) {
        refreshStockItems()
        refreshStockOrders()
        refreshOperationsTasks()
      }
    }, 60_000)

    return () => {
      isMounted = false
      window.clearInterval(intervalId)
    }
  }, [
    isMobileViewport,
    role,
    mobileWeekStart,
    refreshDashboardModuleData,
    refreshOperationsAnnouncements,
    refreshMobileOperationsTasks,
    refreshTodayWeekPublishedData,
    refreshStockItems,
    refreshStockOrders,
    refreshOperationsTasks,
  ])

  useEffect(() => {
    if (!isMobileViewport) return undefined

    if (mobileWeekStart === scheduleWeekStart || mobileWeekStart === todayWeekStart) {
      setIsMobileWeekLoading(false)
      return undefined
    }

    let isMounted = true
    setIsMobileWeekLoading(true)

    getWeekSchedulePublicationState(mobileWeekStart)
      .then((state) => {
        if (!isMounted) return
        setMobileWeekPublishedShifts(Array.isArray(state.publishedShifts) ? state.publishedShifts : [])
        setMobileWeekPublication(state.publication ?? {
          weekStartDate: mobileWeekStart,
          status: 'draft',
          publishedAt: null,
          unpublishedAt: null,
          publishedBy: null,
        })
      })
      .catch(() => {
        if (!isMounted) return
        setMobileWeekPublishedShifts([])
        setMobileWeekPublication({
          weekStartDate: mobileWeekStart,
          status: 'draft',
          publishedAt: null,
          unpublishedAt: null,
          publishedBy: null,
        })
      })
      .finally(() => {
        if (isMounted) {
          setIsMobileWeekLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [isMobileViewport, mobileWeekStart, scheduleWeekStart, todayWeekStart])

  useEffect(() => {
    if (activeView !== 'insights') return undefined

    let isMounted = true
    setIsReportsLoading(true)

    refreshReportsData()
      .catch(() => {})
      .finally(() => {
        if (isMounted) {
          setIsReportsLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [activeView, refreshReportsData])

  const isWorkspaceProfileDirty = useMemo(
    () => !areWorkspaceProfilesEqual(workspaceProfile, workspaceProfileDraft),
    [workspaceProfile, workspaceProfileDraft],
  )

  useEffect(() => {
    if (isAuthLoading) return
    const notice = readAndClearInviteAcceptedNotice()
    if (notice) {
      setInviteAcceptedNotice(notice)
    }
  }, [isAuthLoading])

  useEffect(() => {
    if (activeView !== 'reservations') {
      preReservationsHostViewRef.current = activeView
    }
  }, [activeView])

  useEffect(() => {
    const enteredSettings = shouldInitializeWorkspaceProfileDraft(
      previousActiveViewRef.current,
      activeView,
    )
    previousActiveViewRef.current = activeView

    if (enteredSettings) {
      setWorkspaceProfileDraft(workspaceProfile)
      setWorkspaceProfileNotice('')
      return
    }

    if (activeView !== 'settings') return

    setWorkspaceProfileDraft((current) => (
      areWorkspaceProfilesEqual(current, workspaceProfile) ? current : workspaceProfile
    ))
  }, [activeView, workspaceProfile])

  const handleWorkspaceProfileSubmit = async () => {
    setIsSavingWorkspaceProfile(true)
    setWorkspaceProfileNotice('')

    try {
      const savedProfile = await saveWorkspaceProfile(workspaceProfileDraft)
      setWorkspaceProfile(savedProfile)
      setWorkspaceProfileDraft(savedProfile)
      setWorkspaceProfileNotice('Workspace profile saved.')
    } catch (error) {
      setWorkspaceProfileNotice(error.message || 'Unable to save workspace profile right now.')
    } finally {
      setIsSavingWorkspaceProfile(false)
    }
  }

  const handleWorkspaceLogoFileChange = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) return

    if (file.size > MAX_WORKSPACE_LOGO_BYTES) {
      setWorkspaceProfileNotice(`Logo must be smaller than ${Math.round(MAX_WORKSPACE_LOGO_BYTES / 1024)} KB.`)
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setWorkspaceProfileDraft((current) => ({
        ...current,
        logoUrl: `${reader.result ?? ''}`.trim(),
      }))
      setWorkspaceProfileNotice('')
    }
    reader.onerror = () => {
      setWorkspaceProfileNotice('Unable to read logo file.')
    }
    reader.readAsDataURL(file)
  }

  const handleClearWorkspaceLogo = () => {
    setWorkspaceProfileDraft((current) => ({ ...current, logoUrl: '' }))
    setWorkspaceProfileNotice('')
  }

  useEffect(() => {
    let isMounted = true

    const loadWorkspaceProfile = async () => {
      setIsWorkspaceProfileLoading(true)
      setWorkspaceProfileNotice('')

      try {
        const remoteProfile = await getWorkspaceProfile()
        if (!isMounted) return
        setWorkspaceProfile(remoteProfile)
        setWorkspaceProfileDraft(remoteProfile)
      } catch (error) {
        if (!isMounted) return
        setWorkspaceProfile(EMPTY_WORKSPACE_PROFILE)
        setWorkspaceProfileDraft(EMPTY_WORKSPACE_PROFILE)
        setWorkspaceProfileNotice(error.message || 'Unable to load workspace profile right now.')
      } finally {
        if (isMounted) {
          setIsWorkspaceProfileLoading(false)
        }
      }
    }

    loadWorkspaceProfile()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!isAuthDisabled) return
    syncDevMembershipProfile({ displayName: workspaceProfile.managerName })
  }, [isAuthDisabled, workspaceProfile.managerName, syncDevMembershipProfile])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setLocalNow(getLocalNow())
    }, 60_000)

    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    if (scheduleWeekStart === todayWeekStart) {
      setIsTodayWeekLoading(false)
      return
    }

    let isMounted = true

    const loadTodayWeekData = async () => {
      if (!activeWorkspaceId) {
        setTodayWeekShifts([])
        setTodayWeekCapacities([])
        setTodayWeekPublishedShifts([])
        setTodayWeekPublication({
          weekStartDate: todayWeekStart,
          status: 'draft',
          publishedAt: null,
          unpublishedAt: null,
          publishedBy: null,
        })
        setIsTodayWeekLoading(false)
        return
      }

      setIsTodayWeekLoading(true)
      const weekDateKeys = getWeekDateKeys(todayWeekStart)

      try {
        const [remoteShifts, remoteCapacities, publicationState] = await Promise.all([
          getShifts(activeWorkspaceId, {
            startDate: weekDateKeys[0],
            endDate: weekDateKeys[weekDateKeys.length - 1],
          }),
          getScheduleCapacities({ shiftDates: weekDateKeys }),
          getWeekSchedulePublicationState(todayWeekStart),
        ])
        if (!isMounted) return

        setTodayWeekShifts(remoteShifts)
        setTodayWeekCapacities(remoteCapacities)
        setTodayWeekPublishedShifts(publicationState.publishedShifts ?? [])
        setTodayWeekPublication(publicationState.publication ?? {
          weekStartDate: todayWeekStart,
          status: 'draft',
          publishedAt: null,
          unpublishedAt: null,
          publishedBy: null,
        })
      } catch {
        if (!isMounted) return
        setTodayWeekShifts([])
        setTodayWeekCapacities([])
        setTodayWeekPublishedShifts([])
        setTodayWeekPublication({
          weekStartDate: todayWeekStart,
          status: 'draft',
          publishedAt: null,
          unpublishedAt: null,
          publishedBy: null,
        })
      } finally {
        if (isMounted) {
          setIsTodayWeekLoading(false)
        }
      }
    }

    loadTodayWeekData()

    return () => {
      isMounted = false
    }
  }, [activeWorkspaceId, scheduleWeekStart, todayWeekStart])

  useEffect(() => {
    let isMounted = true

    const loadPositions = async () => {
      if (!activeWorkspaceId) {
        setPositions([])
        setEmployees([])
        setScheduleEmployees([])
        setIsPositionsLoading(false)
        setIsLoadingStaff(false)
        return
      }

      setIsPositionsLoading(true)
      setPositionsNotice('')

      try {
        const remotePositions = await getPositions(activeWorkspaceId)
        if (!isMounted) return
        setPositions(remotePositions)
      } catch (error) {
        if (!isMounted) return
        setPositions([])
        setPositionsNotice(error.message || 'Unable to load positions right now.')
      } finally {
        if (isMounted) {
          setIsPositionsLoading(false)
        }
      }
    }

    const loadEmployees = async () => {
      setIsLoadingStaff(true)
      setStaffNotice('')

      try {
        const remoteEmployees = await getEmployees(activeWorkspaceId)
        if (!isMounted) return
        setEmployees(remoteEmployees)
        setScheduleEmployees(remoteEmployees)
      } catch (error) {
        if (!isMounted) return

        setEmployees([])
        setScheduleEmployees([])
        setStaffNotice(error.message || 'Unable to load employees right now.')
      } finally {
        if (isMounted) {
          setIsLoadingStaff(false)
        }
      }
    }

    loadPositions()
    loadEmployees()

    const loadSeatings = async () => {
      if (!activeWorkspaceId) {
        setReservationSeatings([])
        setIsReservationSeatingsLoading(false)
        return
      }

      setIsReservationSeatingsLoading(true)
      setReservationSeatingsNotice('')

      try {
        const remoteSeatings = await getReservationSeatings(activeWorkspaceId, { includeInactive: true })
        if (!isMounted) return
        setReservationSeatings(remoteSeatings)
      } catch (error) {
        if (!isMounted) return
        setReservationSeatings([])
        setReservationSeatingsNotice(error.message || 'Unable to load reservation seatings right now.')
      } finally {
        if (isMounted) {
          setIsReservationSeatingsLoading(false)
        }
      }
    }

    loadSeatings()

    return () => {
      isMounted = false
    }
  }, [activeWorkspaceId])

  useEffect(() => {
    let isMounted = true

    const loadSuppliers = async () => {
      setIsSuppliersLoading(true)
      setSuppliersNotice('')

      try {
        const remoteSuppliers = await getSuppliers()
        if (!isMounted) return
        setSuppliers(remoteSuppliers)
      } catch (error) {
        if (!isMounted) return
        setSuppliers([])
        setSuppliersNotice(error.message || 'Unable to load suppliers right now.')
      } finally {
        if (isMounted) {
          setIsSuppliersLoading(false)
        }
      }
    }

    loadSuppliers()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (activeView !== 'operations') return undefined
    refreshTasks()
    refreshTaskTemplates()
    return undefined
  }, [activeView, refreshTasks, refreshTaskTemplates])

  useEffect(() => {
    let isMounted = true

    const loadInventory = async () => {
      setIsInventoryLoading(true)
      setInventoryNotice('')

      try {
        await refreshInventory()
      } catch (error) {
        if (!isMounted) return
        setInventoryNotice(error.message || 'Unable to load stock right now.')
      } finally {
        if (isMounted) {
          setIsInventoryLoading(false)
        }
      }
    }

    loadInventory()

    return () => {
      isMounted = false
    }
  }, [refreshInventory])

  useEffect(() => {
    const isDesktopStockCatalogView = activeView === 'stock'
      && (stockSection === 'dashboard' || stockSection === 'orders' || stockSection === 'suppliers')
    const isManagerMobileStockTab = isManagerMobileShell
      && mobileManagerTab === 'stock'
      && !mobileExpandedView
    const isMobileStockWorkspace = useMobileExperience
      && mobileExpandedView === 'workspace'
      && activeView === 'stock'

    if (!isDesktopStockCatalogView && !isManagerMobileStockTab && !isMobileStockWorkspace) return undefined

    let isMounted = true

    const loadStockItems = async () => {
      setIsStockItemsLoading(true)
      setStockItemsNotice('')

      try {
        await refreshStockItems()
      } catch (error) {
        if (!isMounted) return
        setStockItemsNotice(error.message || 'Unable to load stock right now.')
      } finally {
        if (isMounted) {
          setIsStockItemsLoading(false)
        }
      }
    }

    loadStockItems()

    return () => {
      isMounted = false
    }
  }, [activeView, stockSection, refreshStockItems, isManagerMobileShell, mobileManagerTab, mobileExpandedView, useMobileExperience])

  useEffect(() => {
    const isDesktopStockOrdersView = activeView === 'stock'
      && (stockSection === 'orders' || stockSection === 'suppliers' || stockSection === 'dashboard')
    const isManagerMobileStockTab = isManagerMobileShell
      && mobileManagerTab === 'stock'
      && !mobileExpandedView
    const isMobileStockWorkspace = useMobileExperience
      && mobileExpandedView === 'workspace'
      && activeView === 'stock'

    if (!isDesktopStockOrdersView && !isManagerMobileStockTab && !isMobileStockWorkspace) return undefined

    let isMounted = true

    const loadStockOrders = async () => {
      setIsStockOrdersLoading(true)
      setStockOrdersNotice('')

      try {
        await refreshStockOrders()
      } catch (error) {
        if (!isMounted) return
        setStockOrdersNotice(error.message || 'Unable to load orders right now.')
      } finally {
        if (isMounted) {
          setIsStockOrdersLoading(false)
        }
      }
    }

    loadStockOrders()

    return () => {
      isMounted = false
    }
  }, [activeView, stockSection, refreshStockOrders, isManagerMobileShell, mobileManagerTab, mobileExpandedView, useMobileExperience])

  useEffect(() => {
    if (activeView !== 'operations') return undefined

    let isMounted = true

    const loadOperations = async () => {
      setIsOperationsLoading(true)
      setOperationsNotice('')

      try {
        await Promise.all([
          refreshOperationsTasks(),
          refreshOperationsLogs(),
          refreshOperationsAnnouncements(),
          refreshOperationsChecklistTemplates(),
        ])
      } catch (error) {
        if (!isMounted) return
        setOperationsNotice(error.message || 'Unable to load operations right now.')
      } finally {
        if (isMounted) {
          setIsOperationsLoading(false)
        }
      }
    }

    loadOperations()

    return () => {
      isMounted = false
    }
  }, [
    activeView,
    refreshOperationsTasks,
    refreshOperationsLogs,
    refreshOperationsAnnouncements,
    refreshOperationsChecklistTemplates,
  ])

  useEffect(() => {
    if (activeView !== 'today') return undefined

    let isMounted = true

    const loadTodayAnnouncements = async () => {
      try {
        await refreshOperationsAnnouncements()
      } catch (error) {
        if (!isMounted) return
        console.warn('[App] loadTodayAnnouncements error:', error)
      }
    }

    loadTodayAnnouncements()

    return () => {
      isMounted = false
    }
  }, [activeView, refreshOperationsAnnouncements])

  useEffect(() => {
    if (activeView !== 'operations') {
      setActiveChecklistRunTemplateId(null)
      setOperationsFocusTaskId(null)
    }
  }, [activeView])

  useEffect(() => {
    if (activeView === 'operations' && operationsSection === 'checklists' && !canManageOperationsRole) {
      handleOperationsSectionChange('dashboard')
    }
  }, [activeView, operationsSection, canManageOperationsRole, handleOperationsSectionChange])

  useEffect(() => {
    if (!useMobileExperience || activeView !== 'operations' || operationsSection !== 'tasks') return
    handleOperationsSectionChange('dashboard')
  }, [useMobileExperience, activeView, operationsSection, handleOperationsSectionChange])

  useEffect(() => {
    if (activeView !== 'stock') return undefined

    let isMounted = true

    const loadBarRefills = async () => {
      setIsBarRefillsLoading(true)
      setBarRefillsNotice('')

      try {
        await refreshBarRefills()
      } catch (error) {
        if (!isMounted) return
        setBarRefills([])
        setBarRefillsNotice(error.message || 'Unable to load bar refills right now.')
      } finally {
        if (isMounted) {
          setIsBarRefillsLoading(false)
        }
      }
    }

    loadBarRefills()

    return () => {
      isMounted = false
    }
  }, [activeView, refreshBarRefills])

  useEffect(() => {
    let isMounted = true

    const loadScheduleBootstrap = async () => {
      setIsWeeklyTemplatesLoading(true)
      setScheduleNotice('')

      try {
        const remoteTemplates = await getShiftTemplates()
        if (!isMounted) return
        setShiftTemplates(composeShiftTemplates(remoteTemplates))
        syncScheduleTemplateSetupState()
      } catch (error) {
        if (!isMounted) return
        setShiftTemplates([])
        setScheduleNotice(error.message || 'Unable to load shift templates right now.')
      }

      try {
        const remoteWeeklyTemplates = await getWeeklyScheduleTemplates()
        if (!isMounted) return
        setWeeklyTemplates(remoteWeeklyTemplates)
      } catch (_error) {
        if (!isMounted) return
        setWeeklyTemplates([])
      }

      try {
        const remoteEmployees = await getEmployees(activeWorkspaceId)
        if (!isMounted) return
        setEmployees(remoteEmployees)
        setScheduleEmployees(remoteEmployees)
      } catch (error) {
        if (!isMounted) return
        setScheduleEmployees((current) => (current.length > 0 ? current : []))
        setScheduleNotice((current) => (
          current || error.message || 'Unable to load employees right now.'
        ))
      } finally {
        if (isMounted) {
          setIsWeeklyTemplatesLoading(false)
        }
      }
    }

    loadScheduleBootstrap()

    return () => {
      isMounted = false
    }
  }, [activeWorkspaceId, syncScheduleTemplateSetupState])

  useEffect(() => {
    let isMounted = true

    const loadScheduleWeekData = async (weekStartDate) => {
      if (!activeWorkspaceId) {
        setShifts([])
        setScheduleCapacities([])
        setPublishedShifts([])
        setSchedulePublication({
          weekStartDate,
          status: 'draft',
          publishedAt: null,
          unpublishedAt: null,
          publishedBy: null,
        })
        setIsScheduleLoading(false)
        return
      }

      setIsScheduleLoading(true)
      setScheduleNotice('')
      const weekDateKeys = getWeekDateKeys(weekStartDate)

      try {
        const [remoteShifts, remoteCapacities, publicationState] = await Promise.all([
          getShifts(activeWorkspaceId, {
            startDate: weekDateKeys[0],
            endDate: weekDateKeys[weekDateKeys.length - 1],
          }),
          getScheduleCapacities({ shiftDates: weekDateKeys }),
          getWeekSchedulePublicationState(weekStartDate),
        ])
        if (!isMounted) return

        setShifts(remoteShifts)
        setScheduleCapacities(remoteCapacities)
        setSchedulePublication(publicationState.publication ?? {
          weekStartDate,
          status: 'draft',
          publishedAt: null,
          unpublishedAt: null,
          publishedBy: null,
        })
        setPublishedShifts(publicationState.publishedShifts ?? [])
      } catch (error) {
        if (!isMounted) return

        setShifts([])
        setScheduleCapacities([])
        setSchedulePublication({
          weekStartDate,
          status: 'draft',
          publishedAt: null,
          unpublishedAt: null,
          publishedBy: null,
        })
        setPublishedShifts([])
        setScheduleNotice(error.message || 'Unable to load schedule right now.')
      } finally {
        if (isMounted) {
          setIsScheduleLoading(false)
        }
      }
    }

    loadScheduleWeekData(scheduleWeekStart)

    return () => {
      isMounted = false
    }
  }, [activeWorkspaceId, scheduleWeekStart, todayWeekStart])

  useEffect(() => {
    let isMounted = true

    const loadReservations = async () => {
      setIsReservationsLoading(true)
      setReservationNotice('')

      try {
        await refreshReservations()
      } catch (error) {
        if (!isMounted) return
        setReservationNotice(error.message || 'Unable to load reservations right now.')
      } finally {
        if (isMounted) {
          setIsReservationsLoading(false)
        }
      }
    }

    loadReservations()

    return () => {
      isMounted = false
    }
  }, [refreshReservations])

  useEffect(() => {
    if (!reservationNotice) return undefined

    const timer = window.setTimeout(() => {
      setReservationNotice('')
    }, 3000)

    return () => window.clearTimeout(timer)
  }, [reservationNotice])

  const filteredEmployees = useMemo(() => {
    return employees.filter((employee) => {
      const positionNames = Array.isArray(employee.positions)
        ? employee.positions.map((position) => position.name).join(' ')
        : employee.position

      const matchesSearch = `${employee.name} ${positionNames} ${employee.department}`
        .toLowerCase()
        .includes(searchTerm.toLowerCase())
      const matchesFilter = activeFilter === 'All' || employee.department === activeFilter
      return matchesSearch && matchesFilter
    })
  }, [activeFilter, employees, searchTerm])

  const employeePositionOptions = useMemo(() => buildEmployeePositionOptions(positions), [positions])

  const employeeCatalogDepartmentOptions = useMemo(
    () => buildEmployeeCatalogDepartmentOptions(employeeForm.department),
    [employeeForm.department],
  )

  const employeeCatalogPrimaryPositionOptions = useMemo(
    () => buildEmployeeCatalogPrimaryPositionOptions(employeeForm.department, employeeForm.primaryPosition),
    [employeeForm.department, employeeForm.primaryPosition],
  )

  const employeePrimaryPositionDepartmentMismatch = useMemo(
    () => getEmployeePrimaryPositionDepartmentMismatch(employeeForm.department, employeeForm.primaryPosition),
    [employeeForm.department, employeeForm.primaryPosition],
  )

  const employeeAdditionalPositionGroups = useMemo(
    () => buildEmployeeAdditionalPositionCatalogGroups(employeeForm.additionalPositions, positions),
    [employeeForm.additionalPositions, positions],
  )

  const isValidEmail = (value) => {
    if (!value) return true
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  }

  const isNumericOrEmpty = (value) => {
    if (value === null || value === undefined || value === '') return true
    const trimmed = `${value}`.trim()
    if (!trimmed) return true
    const cleaned = trimmed.replace(/[$,\s]/g, '')
    if (!cleaned) return true
    return Number.isFinite(Number(cleaned))
  }

  const refreshStaffEmployees = async () => {
    if (!activeWorkspaceId) {
      setEmployees([])
      setScheduleEmployees([])
      return []
    }

    const remoteEmployees = await getEmployees(activeWorkspaceId)
    setEmployees(remoteEmployees)
    setScheduleEmployees(remoteEmployees)
    return remoteEmployees
  }

  const refreshPositions = async () => {
    if (!activeWorkspaceId) {
      setPositions([])
      return []
    }

    const remotePositions = await getPositions(activeWorkspaceId)
    setPositions(remotePositions)
    return remotePositions
  }

  const refreshReservationSeatings = async () => {
    if (!activeWorkspaceId) {
      setReservationSeatings([])
      return []
    }

    const remoteSeatings = await getReservationSeatings(activeWorkspaceId, { includeInactive: true })
    setReservationSeatings(remoteSeatings)
    return remoteSeatings
  }

  const handleReservationSeatingSubmit = async (event) => {
    event.preventDefault()

    if (!activeWorkspaceId) {
      setReservationSeatingsNotice('Workspace is not ready yet.')
      return
    }

    if (!canConfigureReservationSeatingsRole) {
      setReservationSeatingsNotice('You do not have permission to configure seatings.')
      return
    }

    const validation = validateReservationSeatingForm(reservationSeatingForm)
    if (!validation.ok) {
      setReservationSeatingsNotice(validation.error)
      return
    }

    setIsSavingReservationSeating(true)
    setReservationSeatingsNotice('')

    try {
      if (editingReservationSeatingId) {
        const updatedSeating = await updateReservationSeating({
          workspaceId: activeWorkspaceId,
          id: editingReservationSeatingId,
          seating: validation.seating,
        })
        setReservationSeatings((current) => current
          .map((seating) => (seating.id === updatedSeating.id ? updatedSeating : seating)))
        setReservationSeatingsNotice('Seating updated.')
      } else {
        const createdSeating = await createReservationSeating({
          workspaceId: activeWorkspaceId,
          seating: {
            ...validation.seating,
            sortOrder: reservationSeatings.length,
          },
        })
        setReservationSeatings((current) => [...current, createdSeating])
        setReservationSeatingsNotice('Seating added.')
      }

      await refreshReservationSeatings()
      setEditingReservationSeatingId(null)
      setReservationSeatingForm(createDefaultSeatingForm())
    } catch (error) {
      console.error('[App] handleReservationSeatingSubmit error:', error)
      setReservationSeatingsNotice(error.message || 'Unable to save seating right now.')
    } finally {
      setIsSavingReservationSeating(false)
    }
  }

  const handleStartEditReservationSeating = (seating) => {
    setEditingReservationSeatingId(seating.id)
    setReservationSeatingForm(createDefaultSeatingForm(seating))
    setReservationSeatingsNotice('')
  }

  const handleCancelEditReservationSeating = () => {
    setEditingReservationSeatingId(null)
    setReservationSeatingForm(createDefaultSeatingForm())
  }

  const handleMoveReservationSeating = async (seating, direction) => {
    const index = reservationSeatings.findIndex((item) => item.id === seating.id)
    if (index < 0) return

    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= reservationSeatings.length) return

    const reordered = [...reservationSeatings]
    const [removed] = reordered.splice(index, 1)
    reordered.splice(targetIndex, 0, removed)

    setReservationSeatings(reordered)

    try {
      await reorderReservationSeatings({
        workspaceId: activeWorkspaceId,
        orderedIds: reordered.map((entry) => entry.id),
      })
      setReservationSeatingsNotice('Seating order updated.')
      await refreshReservationSeatings()
    } catch (error) {
      setReservationSeatingsNotice(error.message || 'Unable to reorder seatings right now.')
      await refreshReservationSeatings()
    }
  }

  const handleToggleReservationSeatingActive = async (seating) => {
    if (!activeWorkspaceId || !seating?.id) return

    setIsSavingReservationSeating(true)
    setReservationSeatingsNotice('')

    try {
      const updatedSeating = await updateReservationSeating({
        workspaceId: activeWorkspaceId,
        id: seating.id,
        seating: {
          name: seating.name,
          startTime: seating.startTime,
          durationMinutes: seating.durationMinutes,
          daysOfWeek: seating.daysOfWeek,
          sortOrder: seating.sortOrder,
          isActive: !seating.isActive,
        },
      })
      setReservationSeatings((current) => current.map((entry) => (
        entry.id === updatedSeating.id ? updatedSeating : entry
      )))
      setReservationSeatingsNotice(updatedSeating.isActive ? 'Seating activated.' : 'Seating deactivated.')
    } catch (error) {
      setReservationSeatingsNotice(error.message || 'Unable to update seating right now.')
    } finally {
      setIsSavingReservationSeating(false)
    }
  }

  const handleRequestDeleteReservationSeating = (seating) => {
    setReservationSeatingPendingDelete(seating)
  }

  const handleConfirmDeleteReservationSeating = async () => {
    if (!reservationSeatingPendingDelete?.id || !activeWorkspaceId) return

    setIsSavingReservationSeating(true)

    try {
      await deleteReservationSeating({
        workspaceId: activeWorkspaceId,
        id: reservationSeatingPendingDelete.id,
      })
      setReservationSeatings((current) => current.filter((seating) => (
        seating.id !== reservationSeatingPendingDelete.id
      )))
      setReservationSeatingsNotice('Seating deleted.')
      setReservationSeatingPendingDelete(null)
      if (editingReservationSeatingId === reservationSeatingPendingDelete.id) {
        handleCancelEditReservationSeating()
      }
      await refreshReservationSeatings()
    } catch (error) {
      setReservationSeatingsNotice(error.message || 'Unable to delete seating right now.')
    } finally {
      setIsSavingReservationSeating(false)
    }
  }

  const getPositionUsageCount = (position) => {
    return employees.filter((employee) => {
      if (!Array.isArray(employee.positions)) return false
      return employee.positions.some((item) => (
        String(item.id ?? '') === String(position.id)
        || `${item.name ?? ''}`.trim().toLowerCase() === `${position.name ?? ''}`.trim().toLowerCase()
      ))
    }).length
  }

  const handlePositionSubmit = async (event) => {
    event.preventDefault()

    if (!activeWorkspaceId) {
      setPositionsNotice('Workspace is not ready yet.')
      return
    }

    if (!positionForm.name.trim()) {
      setPositionsNotice('Position name is required.')
      return
    }

    setIsSavingPosition(true)
    setPositionsNotice('')

    try {
      if (editingPositionId) {
        const updatedPosition = await updatePosition(activeWorkspaceId, editingPositionId, {
          name: positionForm.name.trim(),
          department: positionForm.department,
        })
        setPositions((current) => current
          .map((position) => (position.id === updatedPosition.id ? updatedPosition : position))
          .sort((left, right) => (left.sortOrder - right.sortOrder) || left.name.localeCompare(right.name)))
        setPositionsNotice('Position updated.')
      } else {
        const createdPosition = await createPosition(activeWorkspaceId, {
          name: positionForm.name.trim(),
          department: positionForm.department,
          sortOrder: positions.length + 1,
        })
        setPositions((current) => [...current, createdPosition]
          .sort((left, right) => (left.sortOrder - right.sortOrder) || left.name.localeCompare(right.name)))
        setPositionsNotice('Position added.')
      }

      await refreshPositions()
      setEditingPositionId(null)
      setPositionForm({ name: '', department: 'Other' })
    } catch (error) {
      setPositionsNotice(error.message || 'Unable to save position right now.')
    } finally {
      setIsSavingPosition(false)
    }
  }

  const handleStartEditPosition = (position) => {
    setEditingPositionId(position.id)
    setPositionForm({
      name: position.name,
      department: position.department,
    })
    setPositionsNotice('')
  }

  const handleCancelEditPosition = () => {
    setEditingPositionId(null)
    setPositionForm({ name: '', department: 'Other' })
  }

  const handleMovePosition = async (position, direction) => {
    const index = positions.findIndex((item) => item.id === position.id)
    if (index < 0) return

    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= positions.length) return

    const reordered = [...positions]
    const [removed] = reordered.splice(index, 1)
    reordered.splice(targetIndex, 0, removed)

    setPositions(reordered)

    try {
      await reorderPositions(activeWorkspaceId, reordered)
      setPositionsNotice('Position order updated.')
      await refreshPositions()
    } catch (error) {
      setPositionsNotice(error.message || 'Unable to reorder positions right now.')
      await refreshPositions()
    }
  }

  const handleRequestDeletePosition = (position) => {
    setPositionPendingDelete(position)
  }

  const handleConfirmDeletePosition = async () => {
    if (!positionPendingDelete?.id) return

    const usage = getPositionUsageCount(positionPendingDelete)
    setIsSavingPosition(true)

    try {
      await deletePosition(activeWorkspaceId, positionPendingDelete.id)
      setPositions((current) => current.filter((position) => position.id !== positionPendingDelete.id))
      setPositionsNotice(usage > 0 ? 'Position deleted. Employees will need reassignment.' : 'Position deleted.')
      setPositionPendingDelete(null)
      if (editingPositionId === positionPendingDelete.id) {
        handleCancelEditPosition()
      }
      await refreshPositions()
      await refreshStaffEmployees()
    } catch (error) {
      setPositionsNotice(error.message || 'Unable to delete position right now.')
    } finally {
      setIsSavingPosition(false)
    }
  }

  const refreshShiftTemplates = async () => {
    const remoteTemplates = await getShiftTemplates()
    const mergedTemplates = composeShiftTemplates(remoteTemplates)
    setShiftTemplates(mergedTemplates)
    syncScheduleTemplateSetupState()
    return mergedTemplates
  }

  const refreshScheduleCapacities = async (weekStartDate = scheduleWeekStart) => {
    const weekDateKeys = getWeekDateKeys(weekStartDate)
    const remote = await getScheduleCapacities({ shiftDates: weekDateKeys })
    setScheduleCapacities(remote)
    return remote
  }

  const refreshSchedulePublication = async (weekStartDate = scheduleWeekStart) => {
    try {
      const state = await getWeekSchedulePublicationState(weekStartDate)
      setSchedulePublication(state.publication ?? {
        weekStartDate,
        status: 'draft',
        publishedAt: null,
        unpublishedAt: null,
        publishedBy: null,
      })
      setPublishedShifts(Array.isArray(state.publishedShifts) ? state.publishedShifts : [])
      return state
    } catch (error) {
      console.error('[App] refreshSchedulePublication failed:', error)
      setScheduleNotice(error?.message || 'Unable to refresh published schedule status.')
      return null
    }
  }

  const handlePublishWeekSchedule = async (weekStartDate, weekDateKeys = []) => {
    if (!canEditScheduleRole || !activeWorkspaceId) return
    const normalizedKeys = (weekDateKeys ?? []).map((item) => `${item}`.trim()).filter(Boolean)
    const weekDateSet = new Set(normalizedKeys.length > 0 ? normalizedKeys : getWeekDateKeys(weekStartDate))
    const draftWeekShifts = shifts.filter((shift) => weekDateSet.has(`${shift.date ?? ''}`.slice(0, 10)))

    try {
      const result = await publishWeekSchedule({
        weekStartDate,
        weekDateKeys: Array.from(weekDateSet),
        draftShifts: draftWeekShifts,
        knownTemplateIds: buildKnownShiftTemplateIdSet(shiftTemplates),
      })

      if (!result?.publication) {
        throw new Error('Publish did not return a publication record.')
      }

      if (weekStartDate === scheduleWeekStart) {
        setSchedulePublication(result.publication)
        setPublishedShifts(Array.isArray(result.publishedShifts) ? result.publishedShifts : [])
      }

      if (weekStartDate === todayWeekStart) {
        await Promise.all([
          refreshTodayWeekDraftData(weekStartDate),
          weekStartDate === scheduleWeekStart
            ? Promise.resolve()
            : refreshTodayWeekPublishedData(weekStartDate),
        ])
      }

      setScheduleNotice(result.publication.status === 'published' ? 'Schedule published for employees.' : 'Schedule updated.')
      return result
    } catch (error) {
      const message = error?.message || 'Unable to publish this week right now.'
      setScheduleNotice(message)
      throw error
    }
  }

  const handleUnpublishWeekSchedule = async (weekStartDate) => {
    if (!canEditScheduleRole || !activeWorkspaceId) return
    const result = await unpublishWeekSchedule({ weekStartDate })

    if (weekStartDate === scheduleWeekStart) {
      setSchedulePublication(result.publication)
      setPublishedShifts(result.publishedShifts)
    }

    if (weekStartDate === todayWeekStart) {
      await Promise.all([
        refreshTodayWeekDraftData(weekStartDate),
        weekStartDate === scheduleWeekStart
          ? Promise.resolve()
          : refreshTodayWeekPublishedData(weekStartDate),
      ])
    }

    setScheduleNotice('Schedule returned to draft. Employees can no longer see it.')
    return result
  }

  const handleUpdateCellCapacity = async ({ shiftTemplateId, shiftDate, requiredCount }) => {
    const saved = await upsertScheduleCapacity({ shiftTemplateId, shiftDate, requiredCount })
    const savedKey = `${String(saved.shiftTemplateId)}:${saved.shiftDate}`

    setScheduleCapacities((current) => {
      const withoutExisting = current.filter((item) => `${String(item.shiftTemplateId)}:${item.shiftDate}` !== savedKey)
      return [...withoutExisting, saved]
    })

    await refreshScheduleViewData()

    setScheduleNotice('Required staffing updated.')
    return saved
  }

  const handleUpdateTemplateDefaultRequired = async (template, requiredCount) => {
    if (!template?.templateId) {
      throw new Error('Template could not be found.')
    }

    if (scheduleLegacyTemplateSchema || didUseLegacyShiftTemplateSchema()) {
      throw new Error('Template default staff is unavailable with the current schema.')
    }

    const normalizedCount = Math.max(0, Math.min(99, Math.floor(Number(requiredCount) || 0)))

    await updateShiftTemplate(template.templateId, {
      name: template.name,
      startTime: normalizeTimeValue(template.startTime),
      endTime: normalizeTimeValue(template.endTime),
      defaultRole: template.defaultRole ?? '',
      defaultArea: template.defaultArea ?? '',
      defaultRequiredCount: normalizedCount,
      notes: template.notes ?? '',
    })

    await refreshShiftTemplates()
    setScheduleNotice('Template default required staff updated.')
  }

  const handleRenameShiftTemplate = async (template, nextName) => {
    if (!template?.templateId) {
      throw new Error('Template could not be found.')
    }

    if (!nextName?.trim()) {
      throw new Error('Template name is required.')
    }

    const payload = {
      name: nextName.trim(),
      startTime: normalizeTimeValue(template.startTime),
      endTime: normalizeTimeValue(template.endTime),
      defaultRole: template.defaultRole ?? '',
      defaultArea: template.defaultArea ?? '',
      defaultRequiredCount: getTemplateDefaultRequiredCount(template),
      notes: template.notes ?? '',
    }

    await updateShiftTemplate(template.templateId, payload)
    await refreshShiftTemplates()
    setScheduleNotice('Shift template renamed.')
  }

  const handleEditShiftTemplate = (template) => {
    setTemplateNotice('')
    setEditingTemplate(template)
    setTemplateForm(buildTemplateForm(template, shiftTemplates))
    setIsTemplateModalOpen(true)
  }

  const handleDuplicateShiftTemplate = async (template) => {
    if (!template?.templateId) {
      throw new Error('Template could not be found.')
    }

    const payload = {
      name: `${template.name} Copy`,
      startTime: normalizeTimeValue(template.startTime),
      endTime: normalizeTimeValue(template.endTime),
      defaultRole: template.defaultRole ?? '',
      defaultArea: template.defaultArea ?? '',
      defaultRequiredCount: getTemplateDefaultRequiredCount(template),
      notes: template.notes ?? '',
    }

    await createShiftTemplate(payload)
    await refreshShiftTemplates()
    setScheduleNotice('Shift template duplicated.')
  }

  const handleDeleteShiftTemplate = async (template) => {
    if (!template?.templateId) {
      throw new Error('Template could not be found.')
    }

    const usageCount = await getShiftCountForTemplate(template.templateId)

    if (usageCount > 0) {
      try {
        await archiveShiftTemplate(template.templateId)
        await refreshShiftTemplates()
        setScheduleNotice('Template archived. Existing scheduled shifts were kept.')
        return
      } catch (error) {
        throw new Error(error?.message || 'This template is used by existing shifts. Remove those shifts first or archive the template.')
      }
    }

    try {
      await deleteShiftTemplate(template.templateId)
    } catch (error) {
      throw new Error(error?.message || 'Unable to delete shift template right now.')
    }

    await refreshShiftTemplates()

    if (formData.shift_template === template.id) {
      setFormData((current) => ({ ...current, shift_template: 'custom' }))
    }

    if (editingTemplate?.id === template.id) {
      setEditingTemplate(null)
      setTemplateForm(buildTemplateForm(null, shiftTemplates))
    }

    setScheduleNotice('Shift template deleted.')
  }

  const handleApplyAreaToTemplate = async (template, area) => {
    if (!template?.templateId) {
      throw new Error('Template could not be found.')
    }

    const normalizedArea = `${area ?? ''}`.trim()
    if (!normalizedArea) {
      throw new Error('Area is required before saving to template.')
    }

    await updateShiftTemplate(template.templateId, {
      name: template.name,
      startTime: normalizeTimeValue(template.startTime),
      endTime: normalizeTimeValue(template.endTime),
      defaultRole: template.defaultRole ?? '',
      defaultArea: normalizedArea,
      defaultRequiredCount: getTemplateDefaultRequiredCount(template),
      notes: template.notes ?? '',
    })

    await refreshShiftTemplates()
    setScheduleNotice('Template area saved.')
  }

  const refreshWeeklyTemplates = async () => {
    const remoteTemplates = await getWeeklyScheduleTemplates()
    setWeeklyTemplates(remoteTemplates)
    return remoteTemplates
  }

  const handleSaveCurrentWeekTemplate = async ({ name, weekDays, weekShifts, weekCapacities = [] }) => {
    if (!name?.trim()) {
      throw new Error('Template name is required.')
    }

    const weekKeyByDate = new Map((weekDays ?? []).map((day, index) => [day.key, index]))
    const templateShifts = (weekShifts ?? [])
      .filter((shift) => weekKeyByDate.has(shift.date))
      .map((shift) => ({
        dayIndex: weekKeyByDate.get(shift.date),
        employeeId: shift.employeeId ?? null,
        shiftTemplateId: shift.shiftTemplateId ?? null,
        role: shift.role ?? '',
        area: shift.area ?? '',
        startTime: normalizeTimeValue(shift.startTime),
        endTime: normalizeTimeValue(shift.endTime),
        status: shift.status ?? 'Scheduled',
        notes: shift.notes ?? '',
      }))
      .filter((shift) => shift.startTime && shift.endTime)

    const dedupe = new Set()
    const uniqueTemplateShifts = templateShifts.filter((shift) => {
      const key = [
        shift.dayIndex,
        shift.employeeId ?? 'none',
        shift.shiftTemplateId ?? 'none',
        shift.startTime,
        shift.endTime,
        `${shift.role}`.trim().toLowerCase(),
        `${shift.area}`.trim().toLowerCase(),
      ].join('|')
      if (dedupe.has(key)) return false
      dedupe.add(key)
      return true
    })

    const createdTemplate = await createWeeklyScheduleTemplate({
      name: name.trim(),
      shifts: uniqueTemplateShifts,
    })

    if (createdTemplate?.id) {
      saveWeeklyTemplateCapacitySnapshot(
        createdTemplate.id,
        buildWeeklyTemplateCapacitySnapshot(weekDays, weekCapacities),
      )
    }

    await refreshWeeklyTemplates()
    setScheduleNotice('Weekly template saved.')
  }

  const handleLoadWeeklyTemplate = async ({ templateId, weekDays, options }) => {
    if (!templateId) {
      throw new Error('Select a weekly template first.')
    }

    if (!Array.isArray(weekDays) || weekDays.length === 0) {
      throw new Error('Current week is not available for loading.')
    }

    const templateShifts = await getWeeklyTemplateShifts(templateId)
    const weekDateByIndex = new Map(weekDays.map((day, index) => [index, day.key]))
    const weekDates = new Set(weekDays.map((day) => day.key))

    const targetTemplateShifts = templateShifts
      .map((shift) => ({
        ...shift,
        date: weekDateByIndex.get(shift.dayIndex),
      }))
      .filter((shift) => Boolean(shift.date))

    setIsSavingShift(true)
    setScheduleNotice('')

    const gridShiftOptions = getGridShiftIntegrityOptions(shiftTemplates)

    try {
      const existingWeekShifts = shifts.filter((shift) => weekDates.has(shift.date))

      for (const existingShift of existingWeekShifts) {
        await deleteShift(activeWorkspaceId, existingShift.id)
      }

      await deleteScheduleCapacitiesForDates(weekDays.map((day) => day.key))

      const created = []
      const createdKeySet = new Set()

      for (const templateShift of targetTemplateShifts) {
        const normalizedStart = normalizeTimeValue(templateShift.startTime)
        const normalizedEnd = normalizeTimeValue(templateShift.endTime)
        if (!normalizedStart || !normalizedEnd) continue

        const rawPayload = {
          employee_id: options?.employees ? templateShift.employeeId : null,
          date: templateShift.date,
          startTime: normalizedStart,
          endTime: normalizedEnd,
          role: options?.positions ? templateShift.role : '',
          area: options?.areas ? templateShift.area : '',
          status: templateShift.status || 'Scheduled',
          notes: options?.notes ? (templateShift.notes ?? '') : '',
          shiftTemplateId: templateShift.shiftTemplateId ?? null,
        }

        const prepared = prepareShiftForSave(rawPayload, gridShiftOptions)

        const dedupeKey = [
          prepared.employee_id ?? 'none',
          prepared.date,
          prepared.shiftTemplateId ?? 'none',
          prepared.startTime,
          prepared.endTime,
          `${prepared.role ?? ''}`.trim().toLowerCase(),
          `${prepared.area ?? ''}`.trim().toLowerCase(),
        ].join('|')

        if (createdKeySet.has(dedupeKey)) {
          continue
        }
        createdKeySet.add(dedupeKey)

        const savedShift = await createShift(activeWorkspaceId, prepared, gridShiftOptions)
        created.push(savedShift)
      }

      const savedCapacitySnapshot = mapWeeklyTemplateCapacitySnapshotToWeek(
        getWeeklyTemplateCapacitySnapshot(templateId),
        weekDays,
      )

      if (savedCapacitySnapshot.length > 0) {
        await applyScheduleCapacitiesForWeek({
          weekDays,
          capacities: savedCapacitySnapshot,
        })
      } else {
        await applyMinimumCapacitiesFromShifts(created)
      }

      await refreshScheduleViewData()
      setScheduleNotice(`Weekly template loaded (${created.length} shift${created.length === 1 ? '' : 's'} created).`)
    } catch (error) {
      const message = error?.message || 'Unable to load weekly template right now.'
      setScheduleNotice(message)
      throw new Error(message)
    } finally {
      setIsSavingShift(false)
    }
  }

  const handleRenameWeeklyTemplate = async (templateId, name) => {
    if (!templateId) {
      throw new Error('Select a weekly template first.')
    }

    await renameWeeklyScheduleTemplate(templateId, name)
    await refreshWeeklyTemplates()
    setScheduleNotice('Weekly template renamed.')
  }

  const handleDeleteWeeklyTemplate = async (templateId) => {
    if (!templateId) {
      throw new Error('Select a weekly template first.')
    }

    await deleteWeeklyScheduleTemplate(templateId)
    deleteWeeklyTemplateCapacitySnapshot(templateId)
    await refreshWeeklyTemplates()
    setScheduleNotice('Weekly template deleted.')
  }

  const handleCopyHistoricalWeek = async ({ sourceWeekDays, targetWeekDays }) => {
    if (!Array.isArray(sourceWeekDays) || sourceWeekDays.length !== 7) {
      throw new Error('Select a valid source week first.')
    }

    if (!Array.isArray(targetWeekDays) || targetWeekDays.length !== 7) {
      throw new Error('Current week is unavailable for copying.')
    }

    const sourceByDate = new Map(sourceWeekDays.map((day, index) => [day.key, index]))
    const targetDateByIndex = new Map(targetWeekDays.map((day, index) => [index, day.key]))
    const targetDates = new Set(targetWeekDays.map((day) => day.key))

    const sourceDateKeys = sourceWeekDays.map((day) => day.key).sort()
    const sourceWeekShifts = await getShifts(activeWorkspaceId, {
      startDate: sourceDateKeys[0],
      endDate: sourceDateKeys[sourceDateKeys.length - 1],
    })

    if (sourceWeekShifts.length === 0) {
      throw new Error('No shifts found in the selected week.')
    }

    setIsSavingShift(true)
    setScheduleNotice('')

    const gridShiftOptions = getGridShiftIntegrityOptions(shiftTemplates)

    try {
      for (const existingShift of shifts.filter((shift) => targetDates.has(shift.date))) {
        await deleteShift(activeWorkspaceId, existingShift.id)
      }

      await deleteScheduleCapacitiesForDates(targetWeekDays.map((day) => day.key))

      const created = []
      const dedupe = new Set()

      for (const shift of sourceWeekShifts) {
        const dayIndex = sourceByDate.get(shift.date)
        const targetDate = targetDateByIndex.get(dayIndex)
        const startTime = normalizeTimeValue(shift.startTime)
        const endTime = normalizeTimeValue(shift.endTime)

        if (dayIndex === undefined || !targetDate || !startTime || !endTime) continue

        const rawPayload = {
          employee_id: shift.employeeId ?? null,
          date: targetDate,
          startTime,
          endTime,
          role: shift.role ?? '',
          area: shift.area ?? '',
          status: shift.status ?? 'Scheduled',
          notes: shift.notes ?? '',
          shiftTemplateId: shift.shiftTemplateId ?? null,
        }

        const prepared = prepareShiftForSave(rawPayload, gridShiftOptions)

        const dedupeKey = [
          prepared.employee_id ?? 'none',
          prepared.date,
          prepared.shiftTemplateId ?? 'none',
          prepared.startTime,
          prepared.endTime,
          `${prepared.role ?? ''}`.trim().toLowerCase(),
          `${prepared.area ?? ''}`.trim().toLowerCase(),
        ].join('|')

        if (dedupe.has(dedupeKey)) continue
        dedupe.add(dedupeKey)

        const saved = await createShift(activeWorkspaceId, prepared, gridShiftOptions)
        created.push(saved)
      }

      await copyScheduleCapacitiesForWeek({
        sourceDateKeys: sourceWeekDays.map((day) => day.key),
        targetDateKeys: targetWeekDays.map((day) => day.key),
      })

      await refreshScheduleViewData()
      setScheduleNotice(`Copied ${created.length} shift${created.length === 1 ? '' : 's'} into the current week.`)
    } catch (error) {
      const message = getSupabaseErrorMessage(error)
      setScheduleNotice(message)
      throw new Error(message)
    } finally {
      setIsSavingShift(false)
    }
  }

  const bulkCreateShiftsFromSource = async (sourceShifts, mapTargetDate) => {
    const gridShiftOptions = getGridShiftIntegrityOptions(shiftTemplates)
    const created = []
    const dedupe = new Set()

    for (const shift of sourceShifts) {
      const targetDate = mapTargetDate(shift)
      const startTime = normalizeTimeValue(shift.startTime)
      const endTime = normalizeTimeValue(shift.endTime)

      if (!targetDate || !startTime || !endTime) continue

      const rawPayload = buildCloneRawPayload({
        ...shift,
        startTime,
        endTime,
      }, targetDate)

      const prepared = prepareShiftForSave(rawPayload, gridShiftOptions)
      const dedupeKey = buildShiftDedupeKey(prepared)

      if (dedupe.has(dedupeKey)) continue
      dedupe.add(dedupeKey)

      const saved = await createShift(activeWorkspaceId, prepared, gridShiftOptions)
      created.push(saved)
    }

    return created
  }

  const handleCopyDay = async ({ sourceDate, targetDate, overwrite = false }) => {
    if (!sourceDate || !targetDate) {
      throw new Error('Source and target day are required.')
    }

    if (sourceDate === targetDate) {
      throw new Error('Source and target day must be different.')
    }

    const sourceShifts = shifts.filter((shift) => shift.date === sourceDate)
    if (sourceShifts.length === 0) {
      throw new Error('No assignments found on the source day.')
    }

    const targetShifts = shifts.filter((shift) => shift.date === targetDate)
    if (targetShifts.length > 0 && !overwrite) {
      throw new Error('Target day has existing assignments. Confirm overwrite to continue.')
    }

    setIsSavingShift(true)
    setScheduleNotice('')

    try {
      if (overwrite) {
        for (const existingShift of targetShifts) {
          await deleteShift(activeWorkspaceId, existingShift.id)
        }
      }

      const created = await bulkCreateShiftsFromSource(sourceShifts, () => targetDate)
      await refreshScheduleViewData()
      setScheduleNotice(`Copied ${created.length} assignment${created.length === 1 ? '' : 's'} to the target day.`)
      return created
    } catch (error) {
      const message = getSupabaseErrorMessage(error)
      setScheduleNotice(message)
      throw new Error(message)
    } finally {
      setIsSavingShift(false)
    }
  }

  const handleCopyWeek = async ({ sourceWeekDays, targetWeekStartDate, overwrite = false }) => {
    if (!Array.isArray(sourceWeekDays) || sourceWeekDays.length !== 7) {
      throw new Error('Current week is unavailable for copying.')
    }

    if (!targetWeekStartDate) {
      throw new Error('Select a target week first.')
    }

    const targetWeekDays = getWeekDays(targetWeekStartDate)
    if (targetWeekDays[0]?.key === sourceWeekDays[0]?.key) {
      throw new Error('Select a different week as the copy target.')
    }

    const sourceByDate = new Map(sourceWeekDays.map((day, index) => [day.key, index]))
    const targetDateByIndex = new Map(targetWeekDays.map((day, index) => [index, day.key]))
    const sourceDates = new Set(sourceWeekDays.map((day) => day.key))

    const sourceWeekShifts = shifts.filter((shift) => sourceDates.has(shift.date))
    if (sourceWeekShifts.length === 0) {
      throw new Error('Current week has no assignments to copy.')
    }

    const targetDateKeys = targetWeekDays.map((day) => day.key).sort()
    const targetWeekShifts = await getShifts(activeWorkspaceId, {
      startDate: targetDateKeys[0],
      endDate: targetDateKeys[targetDateKeys.length - 1],
    })

    if (targetWeekShifts.length > 0 && !overwrite) {
      throw new Error('Target week has existing assignments. Confirm overwrite to continue.')
    }

    setIsSavingShift(true)
    setScheduleNotice('')

    try {
      for (const existingShift of targetWeekShifts) {
        await deleteShift(activeWorkspaceId, existingShift.id)
      }

      await deleteScheduleCapacitiesForDates(targetDateKeys)

      const created = await bulkCreateShiftsFromSource(sourceWeekShifts, (shift) => {
        const dayIndex = sourceByDate.get(shift.date)
        return targetDateByIndex.get(dayIndex)
      })

      await copyScheduleCapacitiesForWeek({
        sourceDateKeys: sourceWeekDays.map((day) => day.key),
        targetDateKeys: targetWeekDays.map((day) => day.key),
      })

      await refreshScheduleViewData()
      setScheduleNotice(`Copied ${created.length} assignment${created.length === 1 ? '' : 's'} to ${formatWeekRange(targetWeekDays)} (draft only).`)
      return created
    } catch (error) {
      const message = getSupabaseErrorMessage(error)
      setScheduleNotice(message)
      throw new Error(message)
    } finally {
      setIsSavingShift(false)
    }
  }

  const handleClearDay = async (dateKey) => {
    if (!dateKey) {
      throw new Error('Day is required.')
    }

    const dayShifts = shifts.filter((shift) => shift.date === dateKey)
    if (dayShifts.length === 0) {
      throw new Error('No assignments found on this day.')
    }

    setIsSavingShift(true)
    setScheduleNotice('')

    try {
      for (const shift of dayShifts) {
        await deleteShift(activeWorkspaceId, shift.id)
      }

      await refreshScheduleViewData()
      setScheduleNotice(`Cleared ${dayShifts.length} assignment${dayShifts.length === 1 ? '' : 's'} from the day.`)
    } catch (error) {
      const message = getSupabaseErrorMessage(error)
      setScheduleNotice(message)
      throw new Error(message)
    } finally {
      setIsSavingShift(false)
    }
  }

  const handleClearWeek = async (weekDays) => {
    if (!Array.isArray(weekDays) || weekDays.length === 0) {
      throw new Error('Current week is unavailable for clearing.')
    }

    const weekDates = new Set(weekDays.map((day) => day.key))
    const weekShifts = shifts.filter((shift) => weekDates.has(normalizeCellDateKey(shift.date)))

    if (weekShifts.length === 0) {
      throw new Error('This week is already empty.')
    }

    setIsSavingShift(true)
    setScheduleNotice('')

    try {
      for (const shift of weekShifts) {
        await deleteShift(activeWorkspaceId, shift.id)
      }

      await refreshScheduleViewData()
      setScheduleNotice(`Cleared ${weekShifts.length} draft assignment${weekShifts.length === 1 ? '' : 's'} from the week.`)
    } catch (error) {
      const message = getSupabaseErrorMessage(error)
      setScheduleNotice(message)
      throw new Error(message)
    } finally {
      setIsSavingShift(false)
    }
  }

  const handleClearGridCell = async ({ template, shiftDate, shiftIds }) => {
    if (!template || !shiftDate) {
      throw new Error('Shift cell could not be identified.')
    }

    const ids = Array.isArray(shiftIds) ? shiftIds.filter(Boolean) : []
    const cellKey = buildTemplateCellKey({ template, shiftDate })

    const cellShifts = shifts.filter((shift) => {
      if (ids.length > 0) {
        return ids.some((id) => String(id) === String(shift.id))
      }
      return buildShiftCellKeyFromRecord(shift) === cellKey
    })

    if (cellShifts.length === 0) {
      throw new Error('No assignments found in this shift cell.')
    }

    setIsSavingShift(true)
    setScheduleNotice('')

    try {
      for (const shift of cellShifts) {
        await deleteShift(activeWorkspaceId, shift.id)
      }

      await refreshScheduleViewData()
      setScheduleNotice(`Cleared ${cellShifts.length} assignment${cellShifts.length === 1 ? '' : 's'} from this shift.`)
    } catch (error) {
      const message = getSupabaseErrorMessage(error)
      setScheduleNotice(message)
      throw new Error(message)
    } finally {
      setIsSavingShift(false)
    }
  }

  const handleAutoFillWeekFromTemplate = async ({ templateId, weekDays, options, replaceExisting = false }) => {
    if (!templateId) {
      throw new Error('Select a weekly template first.')
    }

    if (!Array.isArray(weekDays) || weekDays.length === 0) {
      throw new Error('Current week is not available for auto fill.')
    }

    const templateShifts = await getWeeklyTemplateShifts(templateId)
    const weekDateByIndex = new Map(weekDays.map((day, index) => [index, day.key]))
    const weekDates = new Set(weekDays.map((day) => day.key))

    const targetTemplateShifts = templateShifts
      .map((shift) => ({
        ...shift,
        date: weekDateByIndex.get(shift.dayIndex),
      }))
      .filter((shift) => Boolean(shift.date))

    setIsSavingShift(true)
    setScheduleNotice('')

    const gridShiftOptions = getGridShiftIntegrityOptions(shiftTemplates)

    try {
      if (replaceExisting) {
        for (const existingShift of shifts.filter((shift) => weekDates.has(shift.date))) {
          await deleteShift(activeWorkspaceId, existingShift.id)
        }
      }

      const occupiedCells = new Set(
        (replaceExisting ? [] : shifts.filter((shift) => weekDates.has(shift.date)))
          .map((shift) => buildShiftCellKeyFromRecord(shift))
          .filter(Boolean),
      )

      const created = []
      const createdKeySet = new Set()

      for (const templateShift of targetTemplateShifts) {
        const normalizedStart = normalizeTimeValue(templateShift.startTime)
        const normalizedEnd = normalizeTimeValue(templateShift.endTime)
        if (!normalizedStart || !normalizedEnd) continue

        const cellKey = buildShiftCellKeyFromParts({
          shiftTemplateId: templateShift.shiftTemplateId,
          date: templateShift.date,
        })

        if (!replaceExisting && cellKey && occupiedCells.has(cellKey)) {
          continue
        }

        const rawPayload = {
          employee_id: options?.employees ? templateShift.employeeId : null,
          date: templateShift.date,
          startTime: normalizedStart,
          endTime: normalizedEnd,
          role: options?.positions ? templateShift.role : '',
          area: options?.areas ? templateShift.area : '',
          status: templateShift.status || 'Scheduled',
          notes: options?.notes ? (templateShift.notes ?? '') : '',
          shiftTemplateId: templateShift.shiftTemplateId ?? null,
        }

        const prepared = prepareShiftForSave(rawPayload, gridShiftOptions)
        const dedupeKey = buildShiftDedupeKey(prepared)

        if (createdKeySet.has(dedupeKey)) {
          continue
        }
        createdKeySet.add(dedupeKey)

        const savedShift = await createShift(activeWorkspaceId, prepared, gridShiftOptions)
        created.push(savedShift)

        if (cellKey) {
          occupiedCells.add(cellKey)
        }
      }

      await refreshScheduleViewData()
      setScheduleNotice(`Auto filled ${created.length} assignment${created.length === 1 ? '' : 's'} from template.`)
      return created
    } catch (error) {
      const message = error?.message || 'Unable to auto fill week right now.'
      setScheduleNotice(message)
      throw new Error(message)
    } finally {
      setIsSavingShift(false)
    }
  }

  const handleOpenAddEmployee = () => {
    setEditingEmployee(null)
    setSaveError('')
    setEmployeeFormOpenMenuId(null)
    setPendingEmployeePositionDeletions(clearPendingEmployeePositionDeletions())
    setEmployeeForm(buildEmployeeForm())
    setIsEmployeeModalOpen(true)
  }

  const handleOpenEditEmployee = (employee) => {
    setEditingEmployee(employee)
    setSaveError('')
    setEmployeeFormOpenMenuId(null)
    setPendingEmployeePositionDeletions(clearPendingEmployeePositionDeletions())
    setEmployeeForm(buildEmployeeForm(employee))
    setIsEmployeeModalOpen(true)
  }

  const handleEmployeeAdditionalPositionsChange = (additionalPositions) => {
    setPendingEmployeePositionDeletions((current) => (
      prunePendingEmployeePositionDeletionsForSelection(
        current,
        additionalPositions,
        employeePositionOptionValuesMatch,
      )
    ))

    setEmployeeForm((current) => ({
      ...current,
      additionalPositions,
    }))
  }

  const cancelPendingDeletionForAssignedPosition = (assignLabel) => {
    setPendingEmployeePositionDeletions((current) => (
      prunePendingEmployeePositionDeletionsForSelection(
        current,
        [assignLabel],
        employeePositionOptionValuesMatch,
      )
    ))
  }

  useEffect(() => {
    if (!isEmployeeModalOpen) return

    const resetModalScroll = () => {
      const modal = employeePremiumFormModalRef.current
      if (modal) {
        modal.scrollTop = 0
      }
    }

    resetModalScroll()
    requestAnimationFrame(resetModalScroll)
  }, [isEmployeeModalOpen, editingEmployee?.id])

  const handleAddCustomPositionToEmployee = async () => {
    const customName = `${employeeForm.customPositionName ?? ''}`.trim()
    if (!customName) {
      const message = 'Enter a custom position name before adding.'
      setSaveError(message)
      setStaffNotice(message)
      return
    }

    const canonicalEntry = findPosition(customName)
    if (canonicalEntry) {
      const message = 'This position already exists in the standard catalog.'
      setSaveError(message)
      setStaffNotice(message)

      cancelPendingDeletionForAssignedPosition(canonicalEntry.label)

      setEmployeeForm((current) => {
        const assignLabel = canonicalEntry.label
        if (!`${current.primaryPosition ?? ''}`.trim()) {
          return {
            ...current,
            primaryPosition: assignLabel,
            customPositionName: '',
          }
        }

        if (current.primaryPosition.trim().toLowerCase() === assignLabel.toLowerCase()) {
          return {
            ...current,
            customPositionName: '',
          }
        }

        const nextAdditional = Array.from(new Set([
          ...current.additionalPositions,
          assignLabel,
        ]))

        return {
          ...current,
          additionalPositions: nextAdditional,
          customPositionName: '',
        }
      })

      return
    }

    const existingWorkspaceCustom = positions.find((position) => (
      `${position.name ?? ''}`.trim().toLowerCase() === customName.toLowerCase()
      && findPosition(position.name) === null
    ))

    if (existingWorkspaceCustom) {
      const message = 'This custom position already exists.'
      setSaveError(message)
      setStaffNotice(message)

      cancelPendingDeletionForAssignedPosition(existingWorkspaceCustom.name)

      setEmployeeForm((current) => {
        const assignLabel = existingWorkspaceCustom.name
        if (!`${current.primaryPosition ?? ''}`.trim()) {
          return {
            ...current,
            primaryPosition: assignLabel,
            customPositionName: '',
          }
        }

        if (current.primaryPosition.trim().toLowerCase() === assignLabel.toLowerCase()) {
          return {
            ...current,
            customPositionName: '',
          }
        }

        const nextAdditional = Array.from(new Set([
          ...current.additionalPositions,
          assignLabel,
        ]))

        return {
          ...current,
          additionalPositions: nextAdditional,
          customPositionName: '',
        }
      })

      return
    }

    setIsCreatingEmployeeCustomPosition(true)
    setSaveError('')

    try {
      await createPosition(activeWorkspaceId, {
        name: customName,
        department: employeeForm.department || inferPositionDepartment(customName),
        sortOrder: positions.length + 1,
      })
      await refreshPositions()

      cancelPendingDeletionForAssignedPosition(customName)

      setEmployeeForm((current) => {
        const normalizedCustom = `${current.customPositionName ?? ''}`.trim()
        if (!normalizedCustom) return current

        if (!`${current.primaryPosition ?? ''}`.trim()) {
          return {
            ...current,
            primaryPosition: normalizedCustom,
            customPositionName: '',
          }
        }

        if (current.primaryPosition.trim().toLowerCase() === normalizedCustom.toLowerCase()) {
          return {
            ...current,
            customPositionName: '',
          }
        }

        const nextAdditional = Array.from(new Set([
          ...current.additionalPositions,
          normalizedCustom,
        ]))

        return {
          ...current,
          additionalPositions: nextAdditional,
          customPositionName: '',
        }
      })

      setStaffNotice('Custom position added.')
    } catch (error) {
      const message = error?.message || 'Unable to add custom position right now.'
      setSaveError(message)
      setStaffNotice(message)
    } finally {
      setIsCreatingEmployeeCustomPosition(false)
    }
  }

  const handleConfirmRemoveCustomPosition = async ({ label, workspacePositionId }) => {
    const trimmedLabel = `${label ?? ''}`.trim()
    if (!trimmedLabel) {
      throw new Error('Unable to remove custom position right now.')
    }

    if (employeePositionOptionValuesMatch(trimmedLabel, employeeForm.primaryPosition)) {
      return {
        blocked: true,
        message: 'This position is currently the employee\'s Primary Position. Select a different Primary Position before removing it.',
      }
    }

    setEmployeeForm((current) => ({
      ...current,
      additionalPositions: removeAdditionalPositionValue(current.additionalPositions, trimmedLabel),
    }))

    if (!workspacePositionId) {
      return { success: true }
    }

    if (findPosition(trimmedLabel)) {
      return { success: true }
    }

    const otherUsage = countOtherEmployeePositionUsage(
      trimmedLabel,
      workspacePositionId,
      employees,
      editingEmployee?.id,
    )

    if (otherUsage > 0) {
      return {
        success: true,
        message: 'Removed from this employee. The position remains available because it is used elsewhere.',
      }
    }

    setPendingEmployeePositionDeletions((current) => (
      queuePendingEmployeePositionDeletion(current, {
        id: workspacePositionId,
        name: trimmedLabel,
      })
    ))

    return {
      success: true,
      message: 'The position will be removed from the workspace catalog after the employee is saved.',
    }
  }

  const processPendingEmployeePositionDeletions = async (pendingDeletions, refreshedEmployees) => {
    if (!Array.isArray(pendingDeletions) || pendingDeletions.length === 0) {
      return 0
    }

    const deletionsToAttempt = getPendingEmployeePositionDeletionsForCatalogCleanup(
      pendingDeletions,
      refreshedEmployees,
      (name) => findPosition(name) !== null,
    )

    if (deletionsToAttempt.length === 0) {
      return 0
    }

    let failureCount = 0

    for (const entry of deletionsToAttempt) {
      try {
        await deletePosition(activeWorkspaceId, entry.id)
      } catch (error) {
        console.error('[App] post-save custom position deletion failed:', error)
        failureCount += 1
      }
    }

    try {
      await refreshPositions()
    } catch (error) {
      console.error('[App] post-save positions refresh failed:', error)
    }

    return failureCount
  }

  const handleEmployeeSubmit = async (event) => {
    event.preventDefault()

    if (!activeWorkspaceId) {
      setSaveError('Workspace is not ready yet.')
      return
    }

    const mergedFullName = mergeEmployeeFullName(employeeForm.firstName, employeeForm.lastName)

    if (!mergedFullName.trim()) {
      const message = 'Full Name is required.'
      setSaveError(message)
      setStaffNotice(message)
      return
    }

    if (!`${employeeForm.primaryPosition ?? ''}`.trim()) {
      const message = 'Primary Position is required.'
      setSaveError(message)
      setStaffNotice(message)
      return
    }

    if (!isValidEmail(employeeForm.email.trim())) {
      const message = 'Please enter a valid email address.'
      setSaveError(message)
      setStaffNotice(message)
      return
    }

    if (!isNumericOrEmpty(employeeForm.salary)) {
      const message = 'Salary must be numeric or empty.'
      setSaveError(message)
      setStaffNotice(message)
      return
    }

    if (!isNumericOrEmpty(employeeForm.weeklyHours)) {
      const message = 'Weekly hours must be numeric or empty.'
      setSaveError(message)
      setStaffNotice(message)
      return
    }

    setIsSavingEmployee(true)
    setSaveError('')

    const normalizedPrimary = `${employeeForm.primaryPosition ?? ''}`.trim()
    const normalizedAdditional = Array.from(new Set((employeeForm.additionalPositions ?? [])
      .map((name) => `${name ?? ''}`.trim())
      .filter((name) => name && name.toLowerCase() !== normalizedPrimary.toLowerCase())))

    const allPositionNames = [normalizedPrimary, ...normalizedAdditional]
    const selectedPositions = allPositionNames.map((name) => {
      const fromCatalog = employeePositionOptions.find((position) => position.name.toLowerCase() === name.toLowerCase())
      if (fromCatalog) {
        return {
          id: fromCatalog.id,
          name: fromCatalog.name,
          department: fromCatalog.department,
        }
      }

      return {
        id: null,
        name,
        department: inferPositionDepartment(name),
      }
    })

    const payload = {
      name: mergedFullName,
      position: allPositionNames.join(', '),
      positions: selectedPositions,
      primaryPosition: normalizedPrimary,
      additionalPositions: normalizedAdditional,
      phone: employeeForm.phone.trim(),
      email: employeeForm.email.trim(),
      hireDate: employeeForm.hireDate,
      salary: normalizeNumericValue(employeeForm.salary),
      emergencyContact: employeeForm.emergencyContact.trim() || 'Not provided',
      weeklyHours: normalizeNumericValue(employeeForm.weeklyHours),
      notes: employeeForm.notes.trim() || 'No notes yet.',
      shift: employeeForm.shift,
      status: employeeForm.status,
      department: employeeForm.department,
    }

    try {
      const pendingDeletions = [...pendingEmployeePositionDeletions]

      const savedEmployee = editingEmployee
        ? await updateEmployee(activeWorkspaceId, editingEmployee.id, payload)
        : await createEmployee(activeWorkspaceId, payload)

      await refreshPositions()
      const refreshedEmployees = await refreshStaffEmployees()
      const cleanupFailureCount = await processPendingEmployeePositionDeletions(
        pendingDeletions,
        refreshedEmployees,
      )

      const nextEmployee = refreshedEmployees.find((employee) => employee.id === savedEmployee.id) ?? {
        ...savedEmployee,
        hireDate: formatHireDate(savedEmployee.hireDate),
      }

      setPendingEmployeePositionDeletions(clearPendingEmployeePositionDeletions())
      setSelectedEmployee(nextEmployee)

      if (cleanupFailureCount > 0) {
        setStaffNotice(
          cleanupFailureCount === 1
            ? 'Employee saved, but one custom position could not be removed from the workspace catalog.'
            : `Employee saved, but ${cleanupFailureCount} custom positions could not be removed from the workspace catalog.`,
        )
      } else {
        setStaffNotice(editingEmployee ? 'Employee updated successfully.' : 'Employee added successfully.')
      }

      handleCloseEmployeeModal()
    } catch (error) {
      const message = error.message || 'Unable to save employee right now. Please try again.'
      setStaffNotice(message)
      setSaveError(message)
    } finally {
      setIsSavingEmployee(false)
    }
  }

  const handleRequestDeleteEmployee = (employee) => {
    setEmployeePendingDelete(employee)
  }

  const handleCloseDeleteEmployeeModal = () => {
    setEmployeePendingDelete(null)
  }

  const handleDeleteEmployee = async () => {
    if (!employeePendingDelete?.id) return
    if (!activeWorkspaceId) {
      setSaveError('Workspace is not ready yet.')
      return
    }

    setSaveError('')
    setIsDeletingEmployee(true)

    try {
      await deleteEmployee(activeWorkspaceId, employeePendingDelete.id)
      const refreshedEmployees = await refreshStaffEmployees()

      if (selectedEmployee?.id === employeePendingDelete.id) {
        setSelectedEmployee(null)
      } else if (selectedEmployee?.id) {
        const nextSelected = refreshedEmployees.find((employee) => employee.id === selectedEmployee.id) ?? null
        setSelectedEmployee(nextSelected)
      }

      setStaffNotice('Employee removed successfully.')
      handleCloseDeleteEmployeeModal()
    } catch (error) {
      const message = error.message || 'Unable to delete employee right now. Please try again.'
      setStaffNotice(message)
      setSaveError(message)
    } finally {
      setIsDeletingEmployee(false)
    }
  }

  const parseShiftTimeToMinutes = (value) => {
    if (!value) return null

    const [hours, minutes] = `${value}`.split(':').map(Number)
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
    return hours * 60 + minutes
  }

  const getSupabaseErrorMessage = (error) => {
    if (!error) return 'Unknown Supabase error.'
    if (typeof error === 'string' && error.trim()) return error.trim()

    const parts = [
      typeof error.message === 'string' ? error.message : '',
      typeof error.details === 'string' ? error.details : '',
      typeof error.hint === 'string' ? error.hint : '',
    ].map((part) => part.trim()).filter(Boolean)

    if (parts.length > 0) {
      return parts.join(' | ')
    }

    return 'Unknown Supabase error.'
  }

  const getShiftSegments = (startMinutes, endMinutes) => {
    if (startMinutes === null || endMinutes === null || startMinutes === endMinutes) {
      return []
    }

    if (endMinutes > startMinutes) {
      return [[startMinutes, endMinutes]]
    }

    return [
      [startMinutes, 1440],
      [0, endMinutes],
    ]
  }

  const shiftsOverlap = (startA, endA, startB, endB) => {
    const segmentsA = getShiftSegments(startA, endA)
    const segmentsB = getShiftSegments(startB, endB)

    if (segmentsA.length === 0 || segmentsB.length === 0) {
      return false
    }

    return segmentsA.some(([segmentStartA, segmentEndA]) => (
      segmentsB.some(([segmentStartB, segmentEndB]) => segmentStartA < segmentEndB && segmentEndA > segmentStartB)
    ))
  }

  const getShiftConflict = ({ employeeId, date, startTime, endTime, excludeShiftId = null, shiftTemplateId = null }) => {
    const normalizedStart = normalizeTimeValue(startTime)
    const normalizedEnd = normalizeTimeValue(endTime)
    const startMinutes = parseShiftTimeToMinutes(normalizedStart)
    const endMinutes = parseShiftTimeToMinutes(normalizedEnd)

    if (!employeeId || !date || startMinutes === null || endMinutes === null || startMinutes === endMinutes) {
      return { type: null }
    }

    const normalizedDate = normalizeCellDateKey(date)
    const targetCellKey = shiftTemplateId && normalizedDate
      ? `${String(shiftTemplateId)}:${normalizedDate}`
      : null

    const sameDayShifts = shifts.filter((shift) => {
      if (excludeShiftId && String(shift.id) === String(excludeShiftId)) return false
      return String(shift.employeeId) === String(employeeId) && normalizeCellDateKey(shift.date) === normalizedDate
    })

    const duplicate = targetCellKey
      ? sameDayShifts.find((shift) => buildShiftCellKeyFromRecord(shift) === targetCellKey)
      : sameDayShifts.find((shift) => (
        normalizeTimeValue(shift.startTime) === normalizedStart
        && normalizeTimeValue(shift.endTime) === normalizedEnd
      ))

    if (duplicate) {
      return { type: 'duplicate', shift: duplicate }
    }

    const overlap = sameDayShifts.find((shift) => {
      if (targetCellKey && buildShiftCellKeyFromRecord(shift) === targetCellKey) {
        return false
      }

      const existingStartMinutes = parseShiftTimeToMinutes(normalizeTimeValue(shift.startTime))
      const existingEndMinutes = parseShiftTimeToMinutes(normalizeTimeValue(shift.endTime))
      if (existingStartMinutes === null || existingEndMinutes === null) return false
      return shiftsOverlap(startMinutes, endMinutes, existingStartMinutes, existingEndMinutes)
    })

    if (overlap) {
      return { type: 'overlap', shift: overlap }
    }

    return { type: null }
  }

  const requestShiftOverlapConfirmation = () => new Promise((resolve) => {
    shiftOverlapConfirmResolverRef.current = resolve
    setIsShiftOverlapConfirmOpen(true)
  })

  const resolveShiftOverlapConfirmation = (confirmed) => {
    setIsShiftOverlapConfirmOpen(false)
    const resolve = shiftOverlapConfirmResolverRef.current
    shiftOverlapConfirmResolverRef.current = null
    resolve?.(confirmed)
  }

  const ensureShiftOverlapAllowed = async (conflict) => {
    if (conflict?.type !== 'overlap') {
      return true
    }
    return requestShiftOverlapConfirmation()
  }

  const validateShiftRequiredFields = ({ employeeId, date, startTime, endTime, role, area }) => {
    return Boolean(
      employeeId
      && date
      && normalizeTimeValue(startTime)
      && normalizeTimeValue(endTime)
      && `${role ?? ''}`.trim()
      && `${area ?? ''}`.trim(),
    )
  }

  const refreshScheduleShifts = async (weekStartDate = scheduleWeekStart) => {
    if (!activeWorkspaceId) {
      setShifts([])
      return []
    }

    const weekDateKeys = getWeekDateKeys(weekStartDate)
    const remoteShifts = await getShifts(activeWorkspaceId, {
      startDate: weekDateKeys[0],
      endDate: weekDateKeys[weekDateKeys.length - 1],
    })
    setShifts(remoteShifts)
    return remoteShifts
  }

  const refreshScheduleViewData = async (weekStartDate = scheduleWeekStart) => {
    const [remoteShifts, remoteCapacities] = await Promise.all([
      refreshScheduleShifts(weekStartDate),
      refreshScheduleCapacities(weekStartDate),
    ])

    await refreshSchedulePublication(weekStartDate)

    if (weekStartDate === todayWeekStart && weekStartDate !== scheduleWeekStart) {
      setTodayWeekShifts(remoteShifts)
      setTodayWeekCapacities(remoteCapacities)
    }

    return remoteShifts
  }

  const normalizeCellDateKey = (value) => {
    if (!value) return ''
    const raw = `${value}`.trim()
    if (!raw) return ''
    if (raw.includes('T')) return raw.split('T')[0]
    return raw.slice(0, 10)
  }

  const normalizeCellAreaKey = (value) => `${value ?? ''}`.trim().toLowerCase()

  const buildShiftCellKeyFromRecord = (shift) => {
    const normalizedDate = normalizeCellDateKey(shift?.date)
    const templateId = shift?.shiftTemplateId
    if (templateId && normalizedDate) {
      return `${String(templateId)}:${normalizedDate}`
    }

    return [
      normalizedDate,
      normalizeTimeValue(shift?.startTime),
      normalizeTimeValue(shift?.endTime),
      normalizeCellAreaKey(shift?.area),
    ].join(':')
  }

  const buildTemplateCellKey = ({ template, shiftDate }) => {
    const normalizedDate = normalizeCellDateKey(shiftDate)
    const templateId = template?.templateId ?? template?.id
    if (templateId && normalizedDate) {
      return `${String(templateId)}:${normalizedDate}`
    }

    return [
      normalizedDate,
      normalizeTimeValue(template?.startTime),
      normalizeTimeValue(template?.endTime),
      normalizeCellAreaKey(template?.defaultArea),
    ].join(':')
  }

  const getShiftAreaFormState = (areaValue) => {
    const normalized = `${areaValue ?? ''}`.trim()
    if (!normalized) {
      return { area_option: 'Service', area_custom: '' }
    }

    const preset = scheduleAreaOptions.find((option) => option !== 'Other' && option.toLowerCase() === normalized.toLowerCase())
    if (preset) {
      return { area_option: preset, area_custom: '' }
    }

    return { area_option: 'Other', area_custom: normalized }
  }

  const handleOpenAddShift = (defaultDate = '') => {
    setEditingShift(null)
    setFormData({
      employee_id: '',
      shift_date: defaultDate,
      shift_template: 'custom',
      start_time: '',
      end_time: '',
      role: '',
      area_option: 'Service',
      area_custom: '',
      status: 'Scheduled',
      notes: '',
    })
    setIsShiftModalOpen(true)
  }

  const handleOpenEditShift = (shift) => {
    const areaFormState = getShiftAreaFormState(shift.area)
    const shiftTemplateId = resolveShiftTemplateId(shift)
    const matchedTemplate = shiftTemplateId
      ? shiftTemplates.find((template) => resolveShiftTemplateId(template) === shiftTemplateId)
      : null

    setEditingShift(shift)
    setFormData({
      employee_id: shift.employeeId ? String(shift.employeeId) : '',
      shift_date: shift.date ?? '',
      shift_template: matchedTemplate?.id ?? 'custom',
      start_time: normalizeTimeValue(shift.startTime),
      end_time: normalizeTimeValue(shift.endTime),
      role: shift.role ?? '',
      area_option: areaFormState.area_option,
      area_custom: areaFormState.area_custom,
      status: shift.status ?? 'Scheduled',
      notes: shift.notes ?? '',
    })
    setIsShiftModalOpen(true)
  }

  const handleCloseShiftModal = () => {
    setIsShiftModalOpen(false)
    setEditingShift(null)
    setFormData({
      employee_id: '',
      shift_date: '',
      shift_template: 'custom',
      start_time: '',
      end_time: '',
      role: '',
      area_option: 'Service',
      area_custom: '',
      status: 'Scheduled',
      notes: '',
    })
  }

  const handleDeleteShift = async (id) => {
    if (!canEditScheduleRole || !activeWorkspaceId) return
    try {
      await deleteShift(activeWorkspaceId, id)
      await refreshScheduleViewData()
      setScheduleNotice('Shift removed.')
    } catch (error) {
      setScheduleNotice(getSupabaseErrorMessage(error))
    }
  }

  const handleCreateGridShift = async ({ employeeId, shiftDate, template, positionName, notes, requiredCount = 1, currentAssignedCount = 0 }) => {
    if (!canEditScheduleRole || !activeWorkspaceId) {
      throw new Error('You do not have permission to edit the schedule.')
    }
    if (!employeeId || !shiftDate) {
      throw new Error('Please complete all required fields before saving.')
    }

    const startTime = normalizeTimeValue(template?.startTime)
    const endTime = normalizeTimeValue(template?.endTime)
    const area = template?.defaultArea ?? ''
    const role = positionName?.trim() || template?.defaultRole || ''

    if (!validateShiftRequiredFields({ employeeId, date: shiftDate, startTime, endTime, role, area })) {
      throw new Error('Please complete all required fields before saving.')
    }

    const conflict = getShiftConflict({
      employeeId,
      date: shiftDate,
      startTime,
      endTime,
      shiftTemplateId: resolveShiftTemplateId(template),
    })

    if (conflict.type === 'duplicate') {
      throw new Error('This employee is already assigned here.')
    }

    if (!(await ensureShiftOverlapAllowed(conflict))) {
      throw new Error('Assignment cancelled.')
    }

    setIsSavingShift(true)
    setScheduleNotice('')

    const gridShiftOptions = getGridShiftIntegrityOptions(shiftTemplates)
    const rawPayload = {
      employee_id: employeeId,
      date: shiftDate,
      startTime,
      endTime,
      role,
      area,
      status: 'Scheduled',
      notes: (notes ?? '').trim(),
    }

    const payload = prepareShiftForSave(rawPayload, {
      ...gridShiftOptions,
      template,
    })

    try {
      const createdShift = await createShift(activeWorkspaceId, payload, gridShiftOptions)
      console.log("Created shift", createdShift)
      const refreshedShifts = await refreshScheduleViewData()
      const targetCellKey = buildTemplateCellKey({ template, shiftDate })
      const placed = refreshedShifts.some((shift) => {
        if (String(shift.id) !== String(createdShift.id)) return false
        return buildShiftCellKeyFromRecord(shift) === targetCellKey
      })
      if (!placed) {
        setScheduleNotice('Shift saved, but could not be placed in the grid. Check shift_template_id or cell key.')
        return createdShift
      }
      const nextAssigned = Number(currentAssignedCount) + 1
      setScheduleNotice(formatStaffingNotice(requiredCount, nextAssigned))
      return createdShift
    } catch (error) {
      const message = getSupabaseErrorMessage(error)
      setScheduleNotice(message)
      throw new Error(message)
    } finally {
      setIsSavingShift(false)
    }
  }

  const handleUpdateGridShift = async (shiftId, updates) => {
    const targetShift = shifts.find((shift) => shift.id === shiftId)
    if (!targetShift) {
      throw new Error('Shift assignment could not be found.')
    }

    if (!updates?.employeeId || !updates?.positionName?.trim()) {
      throw new Error('Please complete all required fields before saving.')
    }

    const targetStart = normalizeTimeValue(targetShift.startTime)
    const targetEnd = normalizeTimeValue(targetShift.endTime)
    const targetArea = targetShift.area ?? ''

    if (!validateShiftRequiredFields({
      employeeId: updates.employeeId,
      date: targetShift.date,
      startTime: targetStart,
      endTime: targetEnd,
      role: updates.positionName.trim(),
      area: targetArea,
    })) {
      throw new Error('Please complete all required fields before saving.')
    }

    const conflict = getShiftConflict({
      employeeId: updates.employeeId,
      date: targetShift.date,
      startTime: targetStart,
      endTime: targetEnd,
      excludeShiftId: shiftId,
      shiftTemplateId: targetShift.shiftTemplateId ?? null,
    })

    if (conflict.type === 'duplicate') {
      throw new Error('This employee is already assigned here.')
    }

    if (!(await ensureShiftOverlapAllowed(conflict))) {
      throw new Error('Assignment cancelled.')
    }

    setIsSavingShift(true)
    setScheduleNotice('')

    const gridShiftOptions = getGridShiftIntegrityOptions(shiftTemplates)
    const rawPayload = {
      employee_id: updates.employeeId,
      date: targetShift.date,
      startTime: targetStart,
      endTime: targetEnd,
      role: updates.positionName.trim(),
      area: targetArea,
      status: updates.status || targetShift.status || 'Scheduled',
      notes: updates.notes ?? targetShift.notes ?? '',
      shiftTemplateId: targetShift.shiftTemplateId ?? null,
    }

    const payload = prepareShiftForSave(rawPayload, gridShiftOptions)

    try {
      const savedShift = await updateShift(activeWorkspaceId, shiftId, payload, gridShiftOptions)
      await refreshScheduleViewData()
      setScheduleNotice('Shift assignment updated.')
      return savedShift
    } catch (error) {
      const message = getSupabaseErrorMessage(error)
      setScheduleNotice(message)
      throw new Error(message)
    } finally {
      setIsSavingShift(false)
    }
  }

  const handleUpdateAssignmentTime = async (shiftId, { startTime, endTime }) => {
    const targetShift = shifts.find((shift) => String(shift.id) === String(shiftId))
    if (!targetShift) {
      throw new Error('Shift assignment could not be found.')
    }

    const normalizedStartTime = normalizeTimeValue(startTime)
    const normalizedEndTime = normalizeTimeValue(endTime)
    const role = `${targetShift.role ?? ''}`.trim()
    const area = `${targetShift.area ?? ''}`.trim()

    if (!validateShiftRequiredFields({
      employeeId: targetShift.employeeId,
      date: targetShift.date,
      startTime: normalizedStartTime,
      endTime: normalizedEndTime,
      role,
      area,
    })) {
      throw new Error('Please complete all required fields before saving.')
    }

    const startMinutes = parseShiftTimeToMinutes(normalizedStartTime)
    const endMinutes = parseShiftTimeToMinutes(normalizedEndTime)

    if (startMinutes === null || endMinutes === null || startMinutes === endMinutes) {
      throw new Error('Please add a valid start and end time.')
    }

    const conflict = getShiftConflict({
      employeeId: targetShift.employeeId,
      date: targetShift.date,
      startTime: normalizedStartTime,
      endTime: normalizedEndTime,
      excludeShiftId: shiftId,
      shiftTemplateId: targetShift.shiftTemplateId ?? null,
    })

    if (conflict.type === 'duplicate') {
      throw new Error('This employee is already assigned here.')
    }

    if (!(await ensureShiftOverlapAllowed(conflict))) {
      throw new Error('Assignment cancelled.')
    }

    setIsSavingShift(true)
    setScheduleNotice('')

    const gridShiftOptions = getGridShiftIntegrityOptions(shiftTemplates)
    const rawPayload = {
      employee_id: targetShift.employeeId,
      date: targetShift.date,
      startTime: normalizedStartTime,
      endTime: normalizedEndTime,
      role,
      area,
      status: targetShift.status ?? 'Scheduled',
      notes: targetShift.notes ?? '',
      shiftTemplateId: targetShift.shiftTemplateId ?? null,
    }

    const payload = prepareShiftForSave(rawPayload, gridShiftOptions)

    try {
      const savedShift = await updateShift(activeWorkspaceId, shiftId, payload, gridShiftOptions)
      await refreshScheduleViewData()
      setScheduleNotice('Assignment time updated.')
      return savedShift
    } catch (error) {
      const message = getSupabaseErrorMessage(error)
      setScheduleNotice(message)
      throw new Error(message)
    } finally {
      setIsSavingShift(false)
    }
  }

  const handleMoveGridShift = async (shiftId, {
    template,
    shiftDate,
    requiredCount = 1,
    currentAssignedCount = 0,
  }) => {
    const targetShift = shifts.find((shift) => shift.id === shiftId)
    if (!targetShift) {
      throw new Error('Shift assignment could not be found.')
    }

    const normalizedTargetDate = normalizeCellDateKey(shiftDate)
    const sourceTemplateId = resolveShiftTemplateId(targetShift)
    const targetTemplateId = resolveShiftTemplateId(template)

    if (
      normalizedTargetDate === normalizeCellDateKey(targetShift.date)
      && sourceTemplateId
      && targetTemplateId
      && sourceTemplateId === targetTemplateId
    ) {
      return targetShift
    }

    const employeeId = targetShift.employeeId
    const positionName = `${targetShift.role ?? ''}`.trim()
    const startTime = normalizeTimeValue(targetShift.startTime) || normalizeTimeValue(template?.startTime)
    const endTime = normalizeTimeValue(targetShift.endTime) || normalizeTimeValue(template?.endTime)
    const area = `${template?.defaultArea ?? ''}`.trim() || `${targetShift.area ?? ''}`.trim()

    if (!employeeId || !positionName) {
      throw new Error('Please complete all required fields before saving.')
    }

    if (!validateShiftRequiredFields({
      employeeId,
      date: normalizedTargetDate,
      startTime,
      endTime,
      role: positionName,
      area,
    })) {
      throw new Error('Please complete all required fields before saving.')
    }

    const conflict = getShiftConflict({
      employeeId,
      date: normalizedTargetDate,
      startTime,
      endTime,
      excludeShiftId: shiftId,
      shiftTemplateId: targetTemplateId ?? null,
    })

    if (conflict.type === 'duplicate') {
      throw new Error('This employee is already assigned here.')
    }

    if (!(await ensureShiftOverlapAllowed(conflict))) {
      throw new Error('Assignment cancelled.')
    }

    setIsSavingShift(true)
    setScheduleNotice('')

    const gridShiftOptions = getGridShiftIntegrityOptions(shiftTemplates)
    const rawPayload = {
      employee_id: employeeId,
      date: normalizedTargetDate,
      startTime,
      endTime,
      role: positionName,
      area,
      status: targetShift.status || 'Scheduled',
      notes: targetShift.notes ?? '',
    }

    const payload = prepareShiftForSave(rawPayload, {
      ...gridShiftOptions,
      template,
    })

    try {
      const savedShift = await updateShift(activeWorkspaceId, shiftId, payload, gridShiftOptions)
      await refreshScheduleViewData()
      const nextAssigned = Number(currentAssignedCount) + 1
      setScheduleNotice(nextAssigned > Number(requiredCount || 1)
        ? `Shift moved. ✓ Covered +${nextAssigned - Number(requiredCount || 1)} extra.`
        : 'Shift moved successfully. ✓ Covered.')
      return savedShift
    } catch (error) {
      const message = getSupabaseErrorMessage(error)
      setScheduleNotice(message)
      throw new Error(message)
    } finally {
      setIsSavingShift(false)
    }
  }

  const handleCopyGridShift = async (shiftId, {
    template,
    shiftDate,
    requiredCount = 1,
    currentAssignedCount = 0,
    cellShifts = [],
  }) => {
    const sourceShift = shifts.find((shift) => String(shift.id) === String(shiftId))
    if (!sourceShift) {
      throw new Error('Shift assignment could not be found.')
    }

    const sourceTemplateId = resolveShiftTemplateId(sourceShift)
    const targetTemplateId = resolveShiftTemplateId(template)
    const normalizedTargetDate = normalizeCellDateKey(shiftDate)

    if (
      normalizedTargetDate === normalizeCellDateKey(sourceShift.date)
      && sourceTemplateId
      && targetTemplateId
      && sourceTemplateId === targetTemplateId
    ) {
      throw new Error('This employee is already assigned here.')
    }

    if ((cellShifts ?? []).some((shift) => String(shift.employeeId) === String(sourceShift.employeeId))) {
      throw new Error('This employee is already assigned here.')
    }

    const employeeId = sourceShift.employeeId
    const startTime = normalizeTimeValue(sourceShift.startTime) || normalizeTimeValue(template?.startTime)
    const endTime = normalizeTimeValue(sourceShift.endTime) || normalizeTimeValue(template?.endTime)
    const role = `${sourceShift.role ?? ''}`.trim()
    const area = `${template?.defaultArea ?? ''}`.trim() || `${sourceShift.area ?? ''}`.trim()

    if (!validateShiftRequiredFields({
      employeeId,
      date: normalizedTargetDate,
      startTime,
      endTime,
      role,
      area,
    })) {
      throw new Error('Please complete all required fields before saving.')
    }

    const conflict = getShiftConflict({
      employeeId,
      date: normalizedTargetDate,
      startTime,
      endTime,
      shiftTemplateId: targetTemplateId ?? null,
    })

    if (conflict.type === 'duplicate') {
      throw new Error('This employee is already assigned here.')
    }

    if (!(await ensureShiftOverlapAllowed(conflict))) {
      throw new Error('Assignment cancelled.')
    }

    const matchedTemplate = shiftTemplates.find((item) => (
      resolveShiftTemplateId(item) === targetTemplateId
    )) ?? template

    setIsSavingShift(true)
    setScheduleNotice('')

    const gridShiftOptions = getGridShiftIntegrityOptions(shiftTemplates)
    const rawPayload = {
      employee_id: employeeId,
      date: normalizedTargetDate,
      startTime,
      endTime,
      role,
      area,
      status: sourceShift.status ?? 'Scheduled',
      notes: sourceShift.notes ?? '',
    }

    const payload = prepareShiftForSave(rawPayload, {
      ...gridShiftOptions,
      template: matchedTemplate,
    })

    try {
      const createdShift = await createShift(activeWorkspaceId, payload, gridShiftOptions)
      await refreshScheduleViewData()
      const nextAssigned = Number(currentAssignedCount) + 1
      setScheduleNotice(nextAssigned > Number(requiredCount || 1)
        ? `Shift copied. ✓ Covered +${nextAssigned - Number(requiredCount || 1)} extra.`
        : 'Shift copied successfully. ✓ Covered.')
      return createdShift
    } catch (error) {
      const message = getSupabaseErrorMessage(error)
      setScheduleNotice(message)
      throw new Error(message)
    } finally {
      setIsSavingShift(false)
    }
  }

  const handleRemoveGridShift = async (shiftId) => {
    setIsSavingShift(true)
    setScheduleNotice('')

    try {
      await deleteShift(activeWorkspaceId, shiftId)
      await refreshScheduleViewData()
      setScheduleNotice('Shift assignment removed.')
    } catch (error) {
      const message = getSupabaseErrorMessage(error)
      setScheduleNotice(message)
      throw new Error(message)
    } finally {
      setIsSavingShift(false)
    }
  }

  const handleCopyShiftToNextDay = async (shift) => {
    if (!shift?.id) {
      throw new Error('Shift could not be found for copying.')
    }

    const sourceDate = `${shift.date ?? ''}`.slice(0, 10)
    if (!sourceDate) {
      throw new Error('Shift date is invalid and cannot be copied.')
    }

    const targetDate = addCalendarDays(sourceDate, 1)
    const startTime = normalizeTimeValue(shift.startTime)
    const endTime = normalizeTimeValue(shift.endTime)
    const role = shift.role ?? ''
    const area = shift.area ?? ''
    const sourceTemplateId = shift.shiftTemplateId ?? resolveShiftTemplateId(shift)

    if (!validateShiftRequiredFields({
      employeeId: shift.employeeId,
      date: targetDate,
      startTime,
      endTime,
      role,
      area,
    })) {
      setScheduleNotice('Please complete all required fields before saving.')
      return
    }

    const conflict = getShiftConflict({
      employeeId: shift.employeeId,
      date: targetDate,
      startTime,
      endTime,
      shiftTemplateId: sourceTemplateId ?? null,
    })

    if (conflict.type === 'duplicate') {
      setScheduleNotice('This employee is already assigned on the next day.')
      return
    }

    if (!(await ensureShiftOverlapAllowed(conflict))) {
      return
    }

    setIsSavingShift(true)
    setScheduleNotice('')

    const gridShiftOptions = getGridShiftIntegrityOptions(shiftTemplates)

    try {
      if (sourceTemplateId) {
        const sourceCapacity = scheduleCapacities.find((item) => (
          String(item.shiftTemplateId) === String(sourceTemplateId)
          && `${item.shiftDate ?? ''}`.slice(0, 10) === sourceDate
        ))
        const template = shiftTemplates.find((item) => String(resolveShiftTemplateId(item)) === String(sourceTemplateId))
        const requiredCount = sourceCapacity?.requiredCount ?? getTemplateDefaultRequiredCount(template)
        await handleUpdateCellCapacity({
          shiftTemplateId: sourceTemplateId,
          shiftDate: targetDate,
          requiredCount,
        })
      }

      const rawPayload = {
        employee_id: shift.employeeId,
        date: targetDate,
        startTime,
        endTime,
        role,
        area,
        status: shift.status ?? 'Scheduled',
        notes: shift.notes ?? '',
        shiftTemplateId: sourceTemplateId ?? null,
      }

      const prepared = prepareShiftForSave(rawPayload, gridShiftOptions)

      await createShift(activeWorkspaceId, prepared, gridShiftOptions)

      await refreshScheduleViewData()
      setScheduleNotice('Shift copied to next day.')
    } catch (error) {
      const message = getSupabaseErrorMessage(error)
      setScheduleNotice(message)
      throw new Error(message)
    } finally {
      setIsSavingShift(false)
    }
  }

  const getShiftsForTemplateOnDate = (template, targetDate) => {
    const templateId = resolveShiftTemplateId(template)
    const normalizedDate = `${targetDate ?? ''}`.slice(0, 10)
    return shifts.filter((shift) => (
      `${shift.date ?? ''}`.slice(0, 10) === normalizedDate
      && String(resolveShiftTemplateId(shift) ?? '') === String(templateId ?? '')
    ))
  }

  const copyCellScheduleToDate = async ({
    template,
    targetDate,
    requiredCount,
    sourceShifts = [],
    strategy = 'merge',
  }) => {
    const targetShifts = getShiftsForTemplateOnDate(template, targetDate)
    const normalizedRequired = Math.max(0, Math.min(99, Math.floor(Number(requiredCount) || 0)))
    const templateId = resolveShiftTemplateId(template)

    if (strategy === 'replace' && targetShifts.length > 0) {
      await handleClearGridCell({
        template,
        shiftDate: targetDate,
        shiftIds: targetShifts.map((item) => item.id),
      })
    }

    if (templateId) {
      await handleUpdateCellCapacity({
        shiftTemplateId: templateId,
        shiftDate: targetDate,
        requiredCount: normalizedRequired,
      })
    }

    const gridShiftOptions = getGridShiftIntegrityOptions(shiftTemplates)
    let copied = 0
    let skipped = 0

    for (const shift of sourceShifts) {
      const startTime = normalizeTimeValue(shift.startTime)
      const endTime = normalizeTimeValue(shift.endTime)
      const role = shift.role ?? ''
      const area = shift.area ?? ''

      if (!validateShiftRequiredFields({
        employeeId: shift.employeeId,
        date: targetDate,
        startTime,
        endTime,
        role,
        area,
      })) {
        skipped += 1
        continue
      }

      const conflict = getShiftConflict({
        employeeId: shift.employeeId,
        date: targetDate,
        startTime,
        endTime,
        shiftTemplateId: shift.shiftTemplateId ?? templateId ?? null,
      })

      if (conflict.type === 'duplicate') {
        skipped += 1
        continue
      }

      if (conflict.type === 'overlap' && !(await ensureShiftOverlapAllowed(conflict))) {
        skipped += 1
        continue
      }

      const rawPayload = {
        employee_id: shift.employeeId,
        date: targetDate,
        startTime,
        endTime,
        role,
        area,
        status: shift.status ?? 'Scheduled',
        notes: shift.notes ?? '',
        shiftTemplateId: shift.shiftTemplateId ?? templateId ?? null,
      }

      const prepared = prepareShiftForSave(rawPayload, gridShiftOptions)
      await createShift(activeWorkspaceId, prepared, gridShiftOptions)
      copied += 1
    }

    return { copied, skipped }
  }

  const handleCopyCellToNextDay = async ({
    template,
    sourceDate,
    requiredCount,
    sourceShifts = [],
    strategy = 'merge',
  }) => {
    const targetDate = addCalendarDays(`${sourceDate ?? ''}`.slice(0, 10), 1)
    setIsSavingShift(true)
    setScheduleNotice('')

    try {
      const result = await copyCellScheduleToDate({
        template,
        targetDate,
        requiredCount,
        sourceShifts,
        strategy,
      })
      await refreshScheduleViewData()

      const parts = []
      if (result.copied > 0) parts.push(`${result.copied} assignment${result.copied === 1 ? '' : 's'} copied`)
      if (result.skipped > 0) parts.push(`${result.skipped} skipped`)
      setScheduleNotice(parts.length > 0 ? `${parts.join(', ')} to next day.` : 'Shift copied to next day.')
    } catch (error) {
      const message = getSupabaseErrorMessage(error)
      setScheduleNotice(message)
      throw new Error(message)
    } finally {
      setIsSavingShift(false)
    }
  }

  const handleCopyCellToRestOfWeek = async ({
    template,
    sourceDate,
    requiredCount,
    sourceShifts = [],
    strategy = 'merge',
    targetDayKeys = [],
  }) => {
    const shiftDateKey = `${sourceDate ?? ''}`.slice(0, 10)
    const weekStart = getWeekStartDate(parseLocalDate(shiftDateKey))
    const weekKeys = getWeekDateKeys(weekStart)
    const dates = targetDayKeys?.length > 0
      ? targetDayKeys
      : getRestOfWeekDateKeys(shiftDateKey, weekKeys)

    if (dates.length === 0) {
      setScheduleNotice('No remaining days in this week to copy.')
      return
    }

    setIsSavingShift(true)
    setScheduleNotice('')

    try {
      let copied = 0
      let skipped = 0

      for (const targetDate of dates) {
        const result = await copyCellScheduleToDate({
          template,
          targetDate,
          requiredCount,
          sourceShifts,
          strategy,
        })
        copied += result.copied
        skipped += result.skipped
      }

      await refreshScheduleViewData()

      const parts = [`Copied to ${dates.length} day${dates.length === 1 ? '' : 's'}`]
      if (skipped > 0) parts.push(`${skipped} assignment${skipped === 1 ? '' : 's'} skipped`)
      setScheduleNotice(`${parts.join('. ')}.`)
    } catch (error) {
      const message = getSupabaseErrorMessage(error)
      setScheduleNotice(message)
      throw new Error(message)
    } finally {
      setIsSavingShift(false)
    }
  }

  const handleCopyShiftToRestOfWeek = async (shift) => {
    if (!shift?.id) {
      throw new Error('Shift could not be found for copying.')
    }

    const shiftDateKey = `${shift.date ?? ''}`.slice(0, 10)
    if (!shiftDateKey) {
      throw new Error('Shift date is invalid and cannot be copied.')
    }

    const weekStart = getWeekStartDate(parseLocalDate(shiftDateKey))
    const weekKeys = getWeekDateKeys(weekStart)
    const targetDates = getRestOfWeekDateKeys(shiftDateKey, weekKeys)

    if (targetDates.length === 0) {
      setScheduleNotice('No remaining days in this week to copy.')
      return
    }

    const startTime = normalizeTimeValue(shift.startTime)
    const endTime = normalizeTimeValue(shift.endTime)
    const role = shift.role ?? ''
    const area = shift.area ?? ''

    if (!validateShiftRequiredFields({
      employeeId: shift.employeeId,
      date: shift.date,
      startTime,
      endTime,
      role,
      area,
    })) {
      setScheduleNotice('Please complete all required fields before saving.')
      return
    }

    const sourceTemplateId = shift.shiftTemplateId ?? resolveShiftTemplateId(shift)
    const sourceCapacity = scheduleCapacities.find((item) => (
      String(item.shiftTemplateId) === String(sourceTemplateId)
      && `${item.shiftDate ?? ''}`.slice(0, 10) === shiftDateKey
    ))
    const template = shiftTemplates.find((item) => String(resolveShiftTemplateId(item)) === String(sourceTemplateId))
    const requiredCount = sourceCapacity?.requiredCount ?? getTemplateDefaultRequiredCount(template)

    const candidateDates = targetDates.filter((date) => {
      const conflict = getShiftConflict({
        employeeId: shift.employeeId,
        date,
        startTime,
        endTime,
        shiftTemplateId: sourceTemplateId ?? null,
      })
      return conflict.type !== 'duplicate'
    })

    if (candidateDates.length === 0) {
      setScheduleNotice('No new shifts were created because this employee is already assigned on each remaining day.')
      return
    }

    setIsSavingShift(true)
    setScheduleNotice('')

    const gridShiftOptions = getGridShiftIntegrityOptions(shiftTemplates)

    try {
      const created = []
      let skipped = targetDates.length - candidateDates.length

      for (const date of candidateDates) {
        if (sourceTemplateId) {
          await handleUpdateCellCapacity({
            shiftTemplateId: sourceTemplateId,
            shiftDate: date,
            requiredCount,
          })
        }

        const conflict = getShiftConflict({
          employeeId: shift.employeeId,
          date,
          startTime,
          endTime,
          shiftTemplateId: sourceTemplateId ?? null,
        })

        if (conflict.type === 'overlap' && !(await ensureShiftOverlapAllowed(conflict))) {
          continue
        }

        const rawPayload = {
          employee_id: shift.employeeId,
          date,
          startTime,
          endTime,
          role,
          area,
          status: shift.status ?? 'Scheduled',
          notes: shift.notes ?? '',
          shiftTemplateId: shift.shiftTemplateId ?? null,
        }

        const prepared = prepareShiftForSave(rawPayload, gridShiftOptions)
        const savedShift = await createShift(activeWorkspaceId, prepared, gridShiftOptions)
        created.push(savedShift)
      }

      await refreshScheduleViewData()
      const parts = [`Copied shift to ${created.length} day${created.length === 1 ? '' : 's'}`]
      if (skipped > 0) parts.push(`${skipped} day${skipped === 1 ? '' : 's'} skipped`)
      setScheduleNotice(`${parts.join('. ')}.`)
    } catch (error) {
      const message = getSupabaseErrorMessage(error)
      setScheduleNotice(message)
      throw new Error(message)
    } finally {
      setIsSavingShift(false)
    }
  }

  const handleShiftSubmit = async (event) => {
    event.preventDefault()

    const normalizedStartTime = normalizeTimeValue(formData.start_time)
    const normalizedEndTime = normalizeTimeValue(formData.end_time)
    const resolvedArea = formData.area_option === 'Other' ? formData.area_custom.trim() : formData.area_option

    if (!validateShiftRequiredFields({
      employeeId: formData.employee_id,
      date: formData.shift_date,
      startTime: normalizedStartTime,
      endTime: normalizedEndTime,
      role: formData.role,
      area: resolvedArea,
    })) {
      setScheduleNotice('Please complete all required fields before saving.')
      return
    }

    const employeeId = `${formData.employee_id ?? ''}`.trim()
    const selectedEmployee = scheduleEmployees.find((employee) => String(employee.id) === employeeId)

    if (!selectedEmployee) {
      setScheduleNotice('That employee could not be found in the roster.')
      return
    }

    if (isEmployeeUnavailable(selectedEmployee)) {
      setScheduleNotice('That employee is currently unavailable and cannot be assigned to a shift.')
      return
    }

    const startMinutes = parseShiftTimeToMinutes(normalizedStartTime)
    const endMinutes = parseShiftTimeToMinutes(normalizedEndTime)

    if (startMinutes === null || endMinutes === null) {
      setScheduleNotice('Please add a valid start and end time.')
      return
    }

    if (startMinutes === endMinutes) {
      setScheduleNotice('Please add a valid start and end time.')
      return
    }

    const isCustomShift = formData.shift_template === 'custom'
    const selectedTemplate = !isCustomShift
      ? shiftTemplates.find((template) => template.id === formData.shift_template)
      : null
    const resolvedTemplateId = isCustomShift
      ? null
      : (resolveShiftTemplateId(selectedTemplate) ?? resolveShiftTemplateId(editingShift) ?? null)

    const conflict = getShiftConflict({
      employeeId,
      date: formData.shift_date,
      startTime: normalizedStartTime,
      endTime: normalizedEndTime,
      excludeShiftId: editingShift?.id ?? null,
      shiftTemplateId: resolvedTemplateId,
    })

    if (conflict.type === 'duplicate') {
      setScheduleNotice('This employee is already assigned here.')
      return
    }

    if (!(await ensureShiftOverlapAllowed(conflict))) {
      return
    }

    setIsSavingShift(true)
    setScheduleNotice('')

    const legacyShiftOptions = getLegacyShiftIntegrityOptions(shiftTemplates, {
      requireTemplateId: !isCustomShift && (Boolean(selectedTemplate) || Boolean(resolveShiftTemplateId(editingShift))),
    })

    const rawPayload = {
      employee_id: formData.employee_id,
      role: formData.role,
      area: resolvedArea,
      date: formData.shift_date,
      startTime: normalizedStartTime,
      endTime: normalizedEndTime,
      status: formData.status,
      notes: formData.notes,
      shiftTemplateId: resolvedTemplateId,
    }

    const payload = prepareShiftForSave(rawPayload, {
      ...legacyShiftOptions,
      template: selectedTemplate,
      inferTemplateId: !isCustomShift,
    })

    try {
      const savedShift = editingShift
        ? await updateShift(activeWorkspaceId, editingShift.id, payload, legacyShiftOptions)
        : await createShift(activeWorkspaceId, payload, legacyShiftOptions)

      await refreshScheduleViewData()
      setScheduleNotice(editingShift ? 'Shift updated successfully.' : 'Shift created successfully.')
      handleCloseShiftModal()
    } catch (error) {
      setScheduleNotice(getSupabaseErrorMessage(error))
    } finally {
      setIsSavingShift(false)
    }
  }

  const handleSelectShiftTemplate = (templateId) => {
    if (templateId === 'custom') {
      setFormData((current) => ({
        ...current,
        shift_template: 'custom',
      }))
      return
    }

    const selectedTemplate = shiftTemplates.find((template) => template.id === templateId)
    if (!selectedTemplate) {
      setFormData((current) => ({
        ...current,
        shift_template: 'custom',
      }))
      return
    }

    setFormData((current) => {
      const nextArea = selectedTemplate.defaultArea?.trim() ? getShiftAreaFormState(selectedTemplate.defaultArea.trim()) : { area_option: current.area_option, area_custom: current.area_custom }

      return {
        ...current,
        shift_template: templateId,
        start_time: normalizeTimeValue(selectedTemplate.startTime) || current.start_time,
        end_time: normalizeTimeValue(selectedTemplate.endTime) || current.end_time,
        role: selectedTemplate.defaultRole?.trim() ? selectedTemplate.defaultRole.trim() : current.role,
        area_option: nextArea.area_option,
        area_custom: nextArea.area_custom,
      }
    })
  }

  const customShiftTemplates = useMemo(
    () => sortShiftTemplates(shiftTemplates.filter((template) => !template.isBuiltIn)),
    [shiftTemplates],
  )
  const customShiftTemplatesRef = useRef(customShiftTemplates)

  useEffect(() => {
    customShiftTemplatesRef.current = customShiftTemplates
  }, [customShiftTemplates])

  const shiftFormDurationLabel = useMemo(() => {
    const hours = calculateShiftDurationHours(formData.start_time, formData.end_time)
    if (hours <= 0) return ''
    return `${formatHoursLabel(hours)}h`
  }, [formData.start_time, formData.end_time])

  const shiftFormIsOvernight = useMemo(() => {
    const startMinutes = parseShiftTimeToMinutes(normalizeTimeValue(formData.start_time))
    const endMinutes = parseShiftTimeToMinutes(normalizeTimeValue(formData.end_time))
    return startMinutes !== null && endMinutes !== null && endMinutes < startMinutes
  }, [formData.start_time, formData.end_time])

  const applyShiftTemplateOrder = (reordered) => {
    const orderMap = new Map(reordered.map((template, index) => [
      String(resolveShiftTemplateId(template)),
      index + 1,
    ]))

    setShiftTemplates((current) => sortShiftTemplates(current.map((template) => {
      const nextSortOrder = orderMap.get(String(resolveShiftTemplateId(template)))
      return nextSortOrder === undefined
        ? template
        : { ...template, sortOrder: nextSortOrder }
    })))
  }

  const hasSameShiftTemplateOrder = (left = [], right = []) => (
    left.length === right.length
    && left.every((template, index) => (
      String(resolveShiftTemplateId(template)) === String(resolveShiftTemplateId(right[index]))
    ))
  )

  const persistShiftTemplateOrder = async (reordered) => {
    setIsReorderingTemplates(true)
    setTemplateNotice('')

    try {
      await reorderShiftTemplates(reordered)
      await refreshShiftTemplates()
      setTemplateNotice('Template order updated.')
    } catch (error) {
      setTemplateNotice(error.message || 'Unable to reorder templates right now.')
    } finally {
      setIsReorderingTemplates(false)
    }
  }

  const handleShiftTemplateDragStart = (event, templateId) => {
    if (isReorderingTemplates || isSavingTemplate || isDeletingTemplate) {
      event.preventDefault()
      return
    }

    setDraggedShiftTemplateId(String(templateId))
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(templateId))
  }

  const handleShiftTemplateDragEnd = () => {
    setDraggedShiftTemplateId(null)
    templateReorderPointerRef.current = null
    templateReorderInitialOrderRef.current = null
  }

  const handleShiftTemplateDragOver = (event) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  const handleShiftTemplateDrop = async (event, targetTemplate) => {
    event.preventDefault()

    const draggedId = draggedShiftTemplateId || event.dataTransfer.getData('text/plain')
    setDraggedShiftTemplateId(null)
    if (!draggedId || isReorderingTemplates || isSavingTemplate || isDeletingTemplate) return

    const reordered = moveShiftTemplatesByDrag(customShiftTemplates, draggedId, targetTemplate.id)
    if (hasSameShiftTemplateOrder(reordered, customShiftTemplates)) return

    applyShiftTemplateOrder(reordered)
    customShiftTemplatesRef.current = reordered
    await persistShiftTemplateOrder(reordered)
  }

  const handleShiftTemplateReorderPointerDown = (event, template) => {
    if (isReorderingTemplates || isSavingTemplate || isDeletingTemplate) return
    if (event.pointerType === 'mouse') return

    templateReorderInitialOrderRef.current = customShiftTemplatesRef.current.map((item) => (
      String(resolveShiftTemplateId(item))
    ))
    templateReorderPointerRef.current = {
      templateId: String(template.id),
      pointerId: event.pointerId,
      lastTargetId: String(template.id),
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleShiftTemplateReorderPointerMove = (event) => {
    const session = templateReorderPointerRef.current
    if (!session || event.pointerId !== session.pointerId || event.pointerType === 'mouse') return

    const targetElement = document.elementFromPoint(event.clientX, event.clientY)
    const row = targetElement?.closest('[data-shift-template-row]')
    const targetId = row?.getAttribute('data-shift-template-row')
    if (!targetId || targetId === session.lastTargetId) return

    const currentTemplates = customShiftTemplatesRef.current
    session.lastTargetId = targetId
    const reordered = moveShiftTemplatesByDrag(currentTemplates, session.templateId, targetId)
    if (hasSameShiftTemplateOrder(reordered, currentTemplates)) return

    applyShiftTemplateOrder(reordered)
    customShiftTemplatesRef.current = reordered
  }

  const handleShiftTemplateReorderPointerUp = async (event) => {
    const session = templateReorderPointerRef.current
    if (!session || event.pointerId !== session.pointerId || event.pointerType === 'mouse') return

    templateReorderPointerRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)

    const initialOrder = templateReorderInitialOrderRef.current
    templateReorderInitialOrderRef.current = null
    const finalTemplates = customShiftTemplatesRef.current
    const finalOrder = finalTemplates.map((item) => String(resolveShiftTemplateId(item)))
    if (
      !initialOrder
      || (initialOrder.length === finalOrder.length && initialOrder.every((id, index) => id === finalOrder[index]))
    ) {
      return
    }

    await persistShiftTemplateOrder(finalTemplates)
  }

  const handleOpenTemplateModal = () => {
    setTemplateNotice('')
    setEditingTemplate(null)
    setTemplateForm(buildTemplateForm(null, shiftTemplates))
    setIsTemplateModalOpen(true)
  }

  const handleCloseTemplateModal = () => {
    setTemplateNotice('')
    setEditingTemplate(null)
    setTemplateForm(buildTemplateForm(null, shiftTemplates))
    setIsTemplateModalOpen(false)
  }

  const handleEditTemplate = (template) => {
    setTemplateNotice('')
    setEditingTemplate(template)
    setTemplateForm(buildTemplateForm(template, shiftTemplates))
  }

  const handleDeleteTemplate = async (template) => {
    if (!template?.templateId) return

    setIsDeletingTemplate(true)
    setTemplateNotice('')

    try {
      const usageCount = await getShiftCountForTemplate(template.templateId)

      if (usageCount > 0) {
        await archiveShiftTemplate(template.templateId)
        setTemplateNotice('Template archived. Existing scheduled shifts were kept.')
      } else {
        await deleteShiftTemplate(template.templateId)
        setTemplateNotice('Template removed.')
      }

      await refreshShiftTemplates()

      if (formData.shift_template === template.id) {
        setFormData((current) => ({ ...current, shift_template: 'custom' }))
      }

      if (editingTemplate?.id === template.id) {
        setEditingTemplate(null)
        setTemplateForm(buildTemplateForm(null, shiftTemplates))
      }

    } catch (error) {
      setTemplateNotice(error.message || 'Unable to delete template right now.')
    } finally {
      setIsDeletingTemplate(false)
    }
  }

  const handleTemplateSubmit = async (event) => {
    event.preventDefault()

    if (!templateForm.name.trim()) {
      setTemplateNotice('Template Name is required.')
      return
    }

    if (!templateForm.startTime || !templateForm.endTime) {
      setTemplateNotice('Start Time and End Time are required.')
      return
    }

    const defaultRequiredCount = Math.max(0, Math.min(99, Math.floor(Number(templateForm.defaultRequiredCount) || 1)))

    const resolvedDefaultArea = resolveTemplateDefaultArea(templateForm, shiftTemplates)
    if (!resolvedDefaultArea) {
      setTemplateNotice('Default Area is required.')
      return
    }

    setIsSavingTemplate(true)
    setTemplateNotice('')

    const payload = {
      name: templateForm.name.trim(),
      startTime: templateForm.startTime,
      endTime: templateForm.endTime,
      defaultRole: templateForm.defaultRole.trim(),
      defaultArea: resolvedDefaultArea,
      defaultRequiredCount,
      notes: templateForm.notes.trim(),
    }

    try {
      const savedTemplate = editingTemplate?.templateId
        ? await updateShiftTemplate(editingTemplate.templateId, payload)
        : await createShiftTemplate(payload)

      const mergedTemplates = await refreshShiftTemplates()
      const selectedTemplate = mergedTemplates.find((template) => template.templateId === savedTemplate.id)

      if (selectedTemplate) {
        setFormData((current) => {
          const nextArea = selectedTemplate.defaultArea?.trim()
            ? getShiftAreaFormState(selectedTemplate.defaultArea.trim())
            : { area_option: current.area_option, area_custom: current.area_custom }

          return {
            ...current,
            shift_template: selectedTemplate.id,
            start_time: normalizeTimeValue(selectedTemplate.startTime) || current.start_time,
            end_time: normalizeTimeValue(selectedTemplate.endTime) || current.end_time,
            role: selectedTemplate.defaultRole?.trim() ? selectedTemplate.defaultRole.trim() : current.role,
            area_option: nextArea.area_option,
            area_custom: nextArea.area_custom,
          }
        })
      }

      setTemplateNotice(editingTemplate ? 'Template updated.' : 'Template created.')
      setEditingTemplate(null)
      setTemplateForm(buildTemplateForm(null, shiftTemplates))
    } catch (error) {
      setTemplateNotice(error.message || 'Unable to save template right now.')
    } finally {
      setIsSavingTemplate(false)
    }
  }

  const employeeOptions = useMemo(() => {
    return scheduleEmployees.filter((employee) => !isEmployeeUnavailable(employee) || String(employee.id) === formData.employee_id)
  }, [formData.employee_id, scheduleEmployees])

  const selectedShiftEmployee = useMemo(
    () => scheduleEmployees.find((employee) => String(employee.id) === formData.employee_id) ?? null,
    [formData.employee_id, scheduleEmployees],
  )

  const selectedShiftEmployeePositionOptions = useMemo(() => {
    if (!selectedShiftEmployee) return []

    if (Array.isArray(selectedShiftEmployee.positions) && selectedShiftEmployee.positions.length > 0) {
      return selectedShiftEmployee.positions.map((position) => position.name).filter(Boolean)
    }

    return `${selectedShiftEmployee.position ?? ''}`
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
  }, [selectedShiftEmployee])

  const handleOpenAddReservation = (options) => {
    if (!canManageReservationsRole) return

    const prefill = options?.nativeEvent || options?.target ? {} : (options ?? {})
    const table = prefill.table ?? null
    const layout = loadPublishedHostLayout(workspace?.id ?? '')
    const defaultZone = layout?.zones?.[0]
    let assignedUnits = []
    let seatingAreaId = defaultZone?.id ?? ''
    let area = defaultZone?.label ?? 'Main Dining'

    if (table) {
      assignedUnits = [toSeatingUnitFromLayoutUnit(table)]
      seatingAreaId = table.zoneId ?? seatingAreaId
      const zone = layout?.zones?.find((entry) => entry.id === seatingAreaId)
      area = zone?.label ?? area
    }

    const prefillDate = normalizeReservationDateKey(prefill.date ?? currentDateKey)
    const prefillSeating = prefill.seating ?? (
      prefill.seatingId ? reservationSeatingsById.get(prefill.seatingId) : null
    )
    const prefillTime = prefill.time ?? prefillSeating?.startTime ?? ''
    const resolvedSeatingId = prefillSeating?.id
      ?? prefill.seatingId
      ?? matchReservationTimeToSeating(prefillTime, prefillDate, reservationSeatings)?.id
      ?? null

    setEditingReservation(null)
    setReservationForm({
      guestName: '',
      phone: '',
      date: prefillDate,
      time: prefillTime,
      guests: '2',
      tableNumber: '',
      area,
      seatingAreaId,
      status: 'Pending',
      notes: '',
      assignedUnits,
      extraChairs: 0,
      standingGuests: 0,
      seatingId: resolvedSeatingId,
    })
    setIsReservationModalOpen(true)
  }

  const handleOpenQuickReservation = (prefill = {}) => {
    if (!canManageReservationsRole) return

    setQuickReservationForm({
      guestName: prefill.guestName ?? '',
      date: normalizeReservationDateKey(prefill.date ?? currentDateKey),
      time: prefill.time ?? '',
      guests: `${prefill.guests ?? '2'}`,
      tableNumber: prefill.tableNumber ?? '',
    })
    setIsQuickReservationOpen(true)
  }

  const handleOpenCommandPalette = () => {
    setIsCommandPaletteOpen(true)
  }

  const handleCloseCommandPalette = () => {
    setIsCommandPaletteOpen(false)
  }

  const handleCloseQuickReservation = () => {
    setIsQuickReservationOpen(false)
    setQuickReservationForm({
      guestName: '',
      date: '',
      time: '',
      guests: '2',
      tableNumber: '',
    })
  }

  const detectedGuestReservation = useMemo(() => {
    if (editingReservation || !isReservationModalOpen) return null
    return getGuestMatchForName(reservationForm.guestName, reservations)
  }, [editingReservation, isReservationModalOpen, reservationForm.guestName, reservations])

  const guestNameSuggestions = useMemo(() => {
    if (editingReservation || !isReservationModalOpen) return []
    return findMatchingGuestProfiles(reservationForm.guestName, reservations)
  }, [editingReservation, isReservationModalOpen, reservationForm.guestName, reservations])

  const handleReservationGuestNameChange = (value) => {
    setReservationForm((current) => {
      const next = { ...current, guestName: value }

      if (!editingReservation) {
        const match = getGuestMatchForName(value, reservations)
        if (match) {
          const profile = buildGuestProfileInsights(match, reservations)
          if (!`${current.phone}`.trim()) next.phone = `${match.phone ?? ''}`.trim()
          if (!`${current.tableNumber}`.trim() && profile.favoriteTable !== '—') next.tableNumber = profile.favoriteTable
          if (current.area === 'Main Dining' && profile.favoriteArea !== '—') next.area = profile.favoriteArea
        }
      }

      return next
    })
  }

  const handleApplyGuestProfile = (guestReservation) => {
    setReservationForm((current) => applyGuestProfileToReservationForm(current, guestReservation, reservations))
  }

  useEffect(() => {
    if (activeView !== 'reservations') return undefined

    const handleKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (!isCommandPaletteOpen) {
          setIsCommandPaletteOpen(true)
        }
        return
      }

      if (event.key === 'Escape' && isCommandPaletteOpen) {
        event.preventDefault()
        setIsCommandPaletteOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeView, isCommandPaletteOpen])

  const handleDashboardQuickAction = (actionId) => {
    if (actionId === 'add-reservation') {
      if (!canAccessModule(role, 'reservations')) return
      handleActiveViewChange('reservations')
      setIsDashboardReservationQuickCreateOpen(true)
      return
    }

    if (actionId === 'add-task') {
      if (!canManageOperationsRole) return
      handleActiveViewChange('operations')
      handleOperationsSectionChange('tasks')
      setOpenTasksCreateModal(true)
      return
    }

    if (actionId === 'add-announcement') {
      if (!canManageAnnouncementsRole) return
      setIsDashboardAnnouncementFormOpen(true)
      return
    }

    if (actionId === 'create-order') {
      if (!canManageStockRole) return
      handleActiveViewChange('stock')
      handleStockSectionChange('dashboard')
      setIsDashboardStockCreateOrderOpen(true)
    }
  }

  const handleDashboardViewTasks = () => {
    if (!canAccessModule(role, 'operations')) return
    handleActiveViewChange('operations')
    handleOperationsSectionChange('tasks')
  }

  const handleDashboardViewStock = () => {
    if (!canAccessModule(role, 'stock')) return
    handleActiveViewChange('stock')
    handleStockSectionChange('dashboard')
  }

  const handleDashboardViewSchedule = () => {
    if (!canAccessTeamSection(role, 'schedule')) return
    handleActiveViewChange('team')
    handleTeamSectionChange('schedule')
  }

  const handleDashboardViewReservations = () => {
    if (!canAccessModule(role, 'reservations')) return
    handleActiveViewChange('reservations')
  }

  const todayAttentionPermissions = useMemo(() => ({
    canViewStock: useMobileExperience
      ? canAccessMobileExpandedModule(role, 'stock')
      : canAccessModule(role, 'stock'),
    canViewTasks: useMobileExperience
      ? canAccessMobileExpandedModule(role, 'operations')
      : canAccessModule(role, 'operations'),
    canViewSchedule: canAccessTeamSection(role, 'schedule'),
    canViewReservations: useMobileExperience
      ? canAccessMobileExpandedModule(role, 'reservations')
      : canAccessModule(role, 'reservations'),
  }), [role, useMobileExperience])

  const handleTodayAttentionItemClick = useCallback((item) => {
    const destination = resolveTodayAttentionDestination(item, todayAttentionPermissions)
    if (!destination) return

    if (destination.view === 'today' && destination.action === 'announcements') {
      const announcementsSection = document.getElementById('today-announcements')
      if (announcementsSection) {
        announcementsSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      return
    }

    if (destination.view === 'reservations') {
      if (useMobileExperience && (isManagementMobileRole(role) || isHostMobileRole(role))) {
        setMobileReservationsHostMode(destination.action === 'host')
        setMobileExpandedView('workspace')
      }
      handleActiveViewChange('reservations')
      return
    }

    handleActiveViewChange(destination.view)

    if (destination.view === 'stock' && destination.section) {
      handleStockSectionChange(destination.section)
      if (destination.action === 'receive-deliveries') {
        setStockOrdersFilterHint('sent')
      }
    }

    if (destination.view === 'operations' && destination.section) {
      handleOperationsSectionChange(destination.section)
      if (destination.taskId) {
        setActiveChecklistRunTemplateId(null)
        setOperationsFocusTaskId(`${destination.taskId}`)
      }
    }

    if (destination.view === 'team' && destination.section) {
      handleTeamSectionChange(destination.section)
    }

    if (useMobileExperience) {
      if (isManagementMobileRole(role)) {
        setMobileExpandedView('workspace')
      } else if (destination.view === 'stock' && todayAttentionPermissions.canViewStock) {
        setMobileExpandedView('workspace')
      } else if (destination.view === 'operations' && todayAttentionPermissions.canViewTasks) {
        setMobileExpandedView('workspace')
      }
    }
  }, [
    todayAttentionPermissions,
    useMobileExperience,
    role,
    handleActiveViewChange,
    handleStockSectionChange,
    handleOperationsSectionChange,
    handleTeamSectionChange,
  ])

  const handleInsightsViewModule = (moduleId) => {
    const route = resolveInsightsModuleLink(moduleId)
    const permittedView = resolvePermittedActiveView(role, route.activeView)
    handleActiveViewChange(permittedView)
    if (route.teamSection && permittedView === 'team') {
      handleTeamSectionChange(resolvePermittedTeamSection(role, route.teamSection))
    }
    if (route.stockSection && permittedView === 'stock') {
      handleStockSectionChange(route.stockSection)
    }
    if (route.operationsSection && permittedView === 'operations') {
      handleOperationsSectionChange(resolvePermittedOperationsSection(role, route.operationsSection))
    }
  }

  const handleOpenEditReservation = (reservation) => {
    if (!canManageReservationsRole) return

    const layout = loadPublishedHostLayout(workspace?.id ?? '')
    const assignment = getReservationSeatingAssignment(reservation)

    setEditingReservation(reservation)
    setReservationForm({
      guestName: reservation.guestName ?? '',
      phone: reservation.phone ?? '',
      date: reservation.date ?? '',
      time: normalizeReservationTimeValue(reservation.time),
      guests: `${reservation.guests ?? 2}`,
      tableNumber: reservation.tableNumber ?? '',
      area: reservation.area ?? 'Main Dining',
      seatingAreaId: resolveAreaIdForReservation(layout, reservation, assignment.assignedUnits),
      status: reservation.status ?? 'Pending',
      notes: reservation.notes ?? '',
      assignedUnits: assignment.assignedUnits ?? [],
      extraChairs: assignment.extraChairs ?? 0,
      standingGuests: assignment.standingGuests ?? 0,
      seatingId: resolveReservationSeatingId(reservation, reservationSeatings),
    })
    setIsReservationModalOpen(true)
  }

  const handleCloseReservationModal = () => {
    setIsReservationModalOpen(false)
    setEditingReservation(null)
    setReservationForm({
      guestName: '',
      phone: '',
      date: currentDateKey,
      time: '',
      guests: '2',
      tableNumber: '',
      area: 'Main Dining',
      seatingAreaId: '',
      status: 'Pending',
      notes: '',
      assignedUnits: [],
      extraChairs: 0,
      standingGuests: 0,
      seatingId: null,
    })
  }

  const handleHostEditSave = async (reservation, form, selectedDateKey) => {
    if (!canManageReservationsRole) return { saved: false }

    const validation = validateReservationFormFields(form, { dateFallback: selectedDateKey })
    if (!validation.ok) {
      setReservationNotice(validation.error)
      return { saved: false }
    }

    if (isSavingReservationRef.current) return { saved: false }

    isSavingReservationRef.current = true
    setIsSavingReservation(true)
    setReservationNotice('')

    try {
      const patch = {
        guestName: validation.guestName,
        phone: form.phone.trim(),
        date: validation.date,
        time: validation.time,
        guests: form.guests,
        customerType: normalizeStoredCustomerType(form.customerType),
        reservationPurpose: form.reservationPurpose ?? 'dinner',
        status: form.status,
        notes: form.notes.trim(),
        area: form.area,
        assignedUnits: form.assignedUnits,
        extraChairs: form.extraChairs,
        standingGuests: form.standingGuests,
        seatingId: form.seatingId
          ?? matchReservationTimeToSeating(validation.time, validation.date, reservationSeatings)?.id
          ?? null,
      }
      const optimisticReservation = mergeOptimisticReservationUpdate(reservation, patch)
      upsertReservationInState(optimisticReservation)
      const updated = await updateReservation(
        activeWorkspaceId,
        reservation.id,
        buildReservationUpdatePayload(reservation, patch),
      )
      upsertReservationInState(updated)
      await reloadTodayReservations()
      setReservationNotice('Reservation updated.')
      return {
        saved: true,
        movedOffSelectedDate: selectedDateKey
          ? validation.date !== normalizeReservationDateKey(selectedDateKey)
          : false,
      }
    } catch (error) {
      setReservationNotice(error.message || 'Unable to update reservation right now.')
      return { saved: false }
    } finally {
      isSavingReservationRef.current = false
      setIsSavingReservation(false)
    }
  }

  const handleHostEditDelete = async (id) => {
    if (!canManageReservationsRole) return

    if (isSavingReservationRef.current) return false

    isSavingReservationRef.current = true
    setIsSavingReservation(true)
    setReservationNotice('')

    try {
      await deleteReservation(activeWorkspaceId, id)
      removeReservationFromState(id)
      await reloadTodayReservations()
      setReservationNotice('Reservation removed.')
      return true
    } catch (error) {
      setReservationNotice(error.message || 'Unable to delete reservation right now.')
      return false
    } finally {
      isSavingReservationRef.current = false
      setIsSavingReservation(false)
    }
  }

  const handleDeleteReservation = async (id) => {
    try {
      await deleteReservation(activeWorkspaceId, id)
      removeReservationFromState(id)
      await reloadTodayReservations()
      setReservationNotice('Reservation removed.')
    } catch (error) {
      setReservationNotice(error.message || 'Unable to delete reservation right now.')
    }
  }

  const handleQuickReservationStatus = async (reservation, status) => {
    if (!canManageReservationsRole) return

    if (isSavingReservationRef.current) return

    isSavingReservationRef.current = true
    setIsSavingReservation(true)

    const optimisticReservation = mergeOptimisticReservationUpdate(reservation, { status })
    upsertReservationInState(optimisticReservation)

    try {
      const updated = await updateReservation(
        activeWorkspaceId,
        reservation.id,
        buildReservationUpdatePayload(reservation, { status }),
      )
      upsertReservationInState(updated)
      await reloadTodayReservations()
      setReservationNotice(`Reservation marked ${getHostListStatusLabel(status)}.`)
    } catch (error) {
      upsertReservationInState(reservation)
      setReservationNotice(error.message || 'Unable to update reservation right now.')
    } finally {
      isSavingReservationRef.current = false
      setIsSavingReservation(false)
    }
  }

  const handleQuickReservationNote = async (reservation, notes) => {
    if (!canManageReservationsRole) return

    if (isSavingReservationRef.current) return

    isSavingReservationRef.current = true
    setIsSavingReservation(true)

    try {
      const updated = await updateReservation(
        activeWorkspaceId,
        reservation.id,
        buildReservationUpdatePayload(reservation, { notes }),
      )
      upsertReservationInState(updated)
      await reloadTodayReservations()
      setReservationNotice('Guest note saved.')
    } catch (error) {
      setReservationNotice(error.message || 'Unable to save guest note right now.')
    } finally {
      isSavingReservationRef.current = false
      setIsSavingReservation(false)
    }
  }

  const handleQuickReservationTableReassign = async (reservation, tableNumber) => {
    if (!canManageReservationsRole) return

    if (isSavingReservationRef.current) return

    isSavingReservationRef.current = true
    setIsSavingReservation(true)

    try {
      const updated = await updateReservation(activeWorkspaceId, reservation.id, {
        guestName: reservation.guestName,
        phone: reservation.phone,
        date: reservation.date,
        time: reservation.time,
        guests: reservation.guests,
        tableNumber: `${tableNumber ?? ''}`.trim(),
        area: reservation.area,
        status: reservation.status,
        notes: reservation.notes,
      })
      upsertReservationInState(updated)
      await reloadTodayReservations()
      setReservationNotice(`Moved to table ${tableNumber}.`)
    } catch (error) {
      setReservationNotice(error.message || 'Unable to reassign table right now.')
    } finally {
      isSavingReservationRef.current = false
      setIsSavingReservation(false)
    }
  }

  const handleAssignReservationTables = async (reservation, assignment) => {
    if (!canManageReservationsRole) return

    if (isSavingReservationRef.current) return

    isSavingReservationRef.current = true
    setIsSavingReservation(true)

    try {
      const payload = assignReservationTablesPayload(reservation, assignment)
      const updated = await updateReservation(activeWorkspaceId, reservation.id, payload)
      upsertReservationInState(updated)
      await reloadTodayReservations()
      setReservationNotice(
        `Assigned ${formatReservationGuestName(reservation.guestName)} to ${formatSeatingAssignmentSummary(payload.seatingAssignment, reservation.guests)}.`,
      )
    } catch (error) {
      setReservationNotice(error.message || 'Unable to assign tables right now.')
    } finally {
      isSavingReservationRef.current = false
      setIsSavingReservation(false)
    }
  }

  const handleReservationSubmit = async (event) => {
    event?.preventDefault?.()
    if (!canManageReservationsRole) return

    const validation = validateReservationFormFields(reservationForm, { dateFallback: currentDateKey })
    if (!validation.ok) {
      setReservationNotice(validation.error)
      return
    }

    if (isSavingReservationRef.current) return

    isSavingReservationRef.current = true
    setIsSavingReservation(true)
    setReservationNotice('')

    const payload = buildReservationUpdatePayload(editingReservation ?? {
      date: validation.date,
      guests: Number(reservationForm.guests) || 2,
      area: reservationForm.area,
      notes: '',
      seatingAssignment: { assignedUnits: [], extraChairs: 0, standingGuests: 0 },
    }, {
      guestName: validation.guestName,
      phone: reservationForm.phone.trim(),
      date: validation.date,
      time: validation.time,
      guests: reservationForm.guests,
      status: reservationForm.status,
      notes: reservationForm.notes.trim(),
      area: reservationForm.area,
      assignedUnits: reservationForm.assignedUnits,
      extraChairs: reservationForm.extraChairs,
      standingGuests: reservationForm.standingGuests,
      seatingId: reservationForm.seatingId
        ?? matchReservationTimeToSeating(validation.time, validation.date, reservationSeatings)?.id
        ?? null,
    })

    try {
      let savedReservation
      if (editingReservation) {
        savedReservation = await updateReservation(activeWorkspaceId, editingReservation.id, payload)
      } else {
        savedReservation = await createReservation(activeWorkspaceId, {
          ...payload,
          date: validation.date,
        }, user?.id ?? null)
      }

      upsertReservationInState(savedReservation)
      await reloadTodayReservations()
      setReservationNotice(editingReservation ? 'Reservation updated.' : 'Reservation created.')
      handleCloseReservationModal()
    } catch (error) {
      setReservationNotice(error.message || 'Unable to save reservation right now.')
    } finally {
      isSavingReservationRef.current = false
      setIsSavingReservation(false)
    }
  }

  const handleQuickReservationSubmit = async (event) => {
    event?.preventDefault?.()
    if (!canManageReservationsRole) return

    const validation = validateReservationFormFields(quickReservationForm, { dateFallback: currentDateKey })
    if (!validation.ok) {
      setReservationNotice(validation.error)
      return
    }

    if (isSavingReservationRef.current) return

    isSavingReservationRef.current = true
    setIsSavingReservation(true)
    setReservationNotice('')

    const match = getGuestMatchForName(quickReservationForm.guestName, reservations)
    const profile = match ? buildGuestProfileInsights(match, reservations) : null

    try {
      const created = await createReservation(activeWorkspaceId, {
        guestName: validation.guestName,
        phone: `${match?.phone ?? ''}`.trim(),
        date: validation.date,
        time: validation.time,
        guests: Number(quickReservationForm.guests) || 2,
        tableNumber: quickReservationForm.tableNumber.trim()
          || (profile?.favoriteTable && profile.favoriteTable !== '—' ? profile.favoriteTable : ''),
        area: profile?.favoriteArea && profile.favoriteArea !== '—' ? profile.favoriteArea : 'Main Dining',
        status: 'Pending',
        notes: `${match?.notes ?? ''}`.trim(),
      }, user?.id ?? null)

      upsertReservationInState(created)
      await reloadTodayReservations()
      setReservationNotice('Quick reservation created.')
      handleCloseQuickReservation()
    } catch (error) {
      setReservationNotice(error.message || 'Unable to create quick reservation right now.')
    } finally {
      isSavingReservationRef.current = false
      setIsSavingReservation(false)
    }
  }

  const handleOpenAddInventoryItem = () => {
    setEditingInventoryItem(null)
    setInventoryForm(buildDefaultInventoryForm())
    setIsInventoryModalOpen(true)
  }

  const handleOpenEditInventoryItem = (item) => {
    const categoryFields = resolveInventoryCategoryForForm(item.category ?? 'Other')
    const subcategoryFields = resolveInventorySubcategoryForForm(
      item.category ?? 'Other',
      item.subcategory,
    )

    setEditingInventoryItem(item)
    setInventoryForm({
      itemName: item.itemName ?? '',
      ...categoryFields,
      ...subcategoryFields,
      supplier: item.supplier ?? '',
      unit: item.unit ?? '',
      quantity: `${item.quantity ?? 0}`,
      minimumQuantity: `${item.minimumQuantity ?? 0}`,
      cost: `${item.cost ?? 0}`,
      notes: item.notes ?? '',
    })
    setIsInventoryModalOpen(true)
  }

  const handleCloseInventoryModal = () => {
    setIsInventoryModalOpen(false)
    setEditingInventoryItem(null)
    setInventoryForm(buildDefaultInventoryForm())
  }

  const handleRequestDeleteInventoryItem = (item) => {
    if (!item?.id) return
    setInventoryPendingDelete(item)
  }

  const handleCloseDeleteInventoryModal = () => {
    if (isDeletingInventoryItem) return
    setInventoryPendingDelete(null)
  }

  const handleConfirmDeleteInventoryItem = async () => {
    if (!inventoryPendingDelete?.id) return

    setIsDeletingInventoryItem(true)
    setInventoryNotice('')

    try {
      await deleteInventoryItem(inventoryPendingDelete.id)
      await refreshInventory()
      setInventoryNotice('Stock item removed.')
      setInventoryPendingDelete(null)
    } catch (error) {
      setInventoryNotice(error.message || 'Unable to delete stock item right now.')
    } finally {
      setIsDeletingInventoryItem(false)
    }
  }

  const handleInventorySubmit = async (event) => {
    event.preventDefault()

    if (!inventoryForm.itemName.trim()) {
      setInventoryNotice('Please provide an item name.')
      return
    }

    const category = resolveInventoryCategoryForSave(
      inventoryForm.categoryPreset,
      inventoryForm.customCategory,
    )

    if (!category) {
      setInventoryNotice('Please provide a category name.')
      return
    }

    if (
      inventoryForm.subcategoryPreset === INVENTORY_CUSTOM_SUBCATEGORY_VALUE
      && !inventoryForm.customSubcategory.trim()
    ) {
      setInventoryNotice('Please provide a subcategory name.')
      return
    }

    setIsSavingInventoryItem(true)
    setInventoryNotice('')

    const quantity = Number(inventoryForm.quantity) || 0
    const minimumQuantity = Number(inventoryForm.minimumQuantity) || 0
    const resolvedStatus = getInventoryStatus(quantity, minimumQuantity)

    const payload = {
      itemName: inventoryForm.itemName.trim(),
      category,
      subcategory: resolveInventorySubcategoryForSave(
        inventoryForm.subcategoryPreset,
        inventoryForm.customSubcategory,
      ),
      supplier: inventoryForm.supplier.trim(),
      unit: inventoryForm.unit.trim(),
      quantity,
      minimumQuantity,
      cost: Number(inventoryForm.cost) || 0,
      status: resolvedStatus,
      notes: inventoryForm.notes.trim(),
    }

    try {
      if (editingInventoryItem) {
        await updateInventoryItem(editingInventoryItem.id, payload)
      } else {
        await createInventoryItem(payload)
      }

      await refreshInventory()
      setInventoryNotice(editingInventoryItem ? 'Stock item updated.' : 'Stock item created.')
      handleCloseInventoryModal()
    } catch (error) {
      setInventoryNotice(error.message || 'Unable to save stock item right now.')
    } finally {
      setIsSavingInventoryItem(false)
    }
  }

  const handleCreateStockItem = async (payload) => {
    if (!activeWorkspaceId) {
      throw new Error(stockWorkspaceSetupMessage || 'Workspace is required to add stock items.')
    }
    if (isSavingStockItemRef.current) return

    isSavingStockItemRef.current = true
    setIsSavingStockItem(true)
    setStockItemsNotice('')

    try {
      await createStockItem(activeWorkspaceId, payload)
      await refreshStockItems()
      setStockItemsNotice('Stock item added.')
    } catch (error) {
      setStockItemsNotice(error.message || 'Unable to add stock item right now.')
      throw error
    } finally {
      isSavingStockItemRef.current = false
      setIsSavingStockItem(false)
    }
  }

  const handleUpdateStockItem = async (itemId, payload) => {
    if (!activeWorkspaceId) {
      throw new Error(stockWorkspaceSetupMessage || 'Workspace is required to update stock items.')
    }
    if (isSavingStockItemRef.current) return

    isSavingStockItemRef.current = true
    setIsSavingStockItem(true)
    setStockItemsNotice('')

    try {
      await updateStockItem(itemId, payload, activeWorkspaceId)
      await refreshStockItems()
      setStockItemsNotice('Stock item updated.')
    } catch (error) {
      setStockItemsNotice(error.message || 'Unable to update stock item right now.')
      throw error
    } finally {
      isSavingStockItemRef.current = false
      setIsSavingStockItem(false)
    }
  }

  const handleBulkUpdateStockItems = async (updates = []) => {
    if (!activeWorkspaceId) {
      throw new Error(stockWorkspaceSetupMessage || 'Workspace is required to update stock items.')
    }

    if (!updates.length) return
    if (isSavingStockItemRef.current) return

    isSavingStockItemRef.current = true
    setIsSavingStockItem(true)
    setStockItemsNotice('')

    try {
      for (const update of updates) {
        await updateStockItem(update.id, update.payload, activeWorkspaceId)
      }
      await refreshStockItems()
      setStockItemsNotice(`${updates.length} product${updates.length === 1 ? '' : 's'} updated.`)
    } catch (error) {
      setStockItemsNotice(error.message || 'Unable to update products right now.')
      throw error
    } finally {
      isSavingStockItemRef.current = false
      setIsSavingStockItem(false)
    }
  }

  const handleImportStockItems = async (plan) => {
    if (!activeWorkspaceId) {
      throw new Error(stockWorkspaceSetupMessage || 'Workspace is required to import stock items.')
    }
    if (isSavingStockItemRef.current) return

    isSavingStockItemRef.current = true
    setIsSavingStockItem(true)
    setStockItemsNotice('')

    try {
      let created = 0
      let updated = 0

      for (const entry of plan.creates ?? []) {
        await createStockItem(activeWorkspaceId, entry.payload)
        created += 1
      }

      for (const entry of plan.updates ?? []) {
        await updateStockItem(entry.id, entry.payload, activeWorkspaceId)
        updated += 1
      }

      await refreshStockItems()
      const skipped = plan.skipped?.length ?? 0
      setStockItemsNotice(`Import complete: ${created} created, ${updated} updated, ${skipped} skipped.`)
      return { created, updated, skipped }
    } catch (error) {
      setStockItemsNotice(error.message || 'Unable to import products right now.')
      throw error
    } finally {
      isSavingStockItemRef.current = false
      setIsSavingStockItem(false)
    }
  }

  const handleRecordStockMovement = async ({ item, type, quantity, note }) => {
    if (!activeWorkspaceId || !item?.id) {
      throw new Error(stockWorkspaceSetupMessage || 'Workspace and item are required for stock movements.')
    }
    if (isSavingStockItemRef.current) return

    isSavingStockItemRef.current = true
    setIsSavingStockItem(true)
    setStockItemsNotice('')

    try {
      await recordStockMovement({
        workspaceId: activeWorkspaceId,
        itemId: item.id,
        type,
        quantity,
        note,
        createdBy: user?.id ?? null,
        currentQuantity: item.currentQuantity,
      })
      await refreshStockItems()
      setStockItemsNotice('Stock movement recorded.')
    } catch (error) {
      setStockItemsNotice(error.message || 'Unable to record stock movement right now.')
      throw error
    } finally {
      isSavingStockItemRef.current = false
      setIsSavingStockItem(false)
    }
  }

  const handleCreateStockOrders = async (groups) => {
    if (!activeWorkspaceId) {
      throw new Error(stockWorkspaceSetupMessage || 'Workspace is required to create orders.')
    }
    if (isCreatingStockOrdersRef.current) return

    isCreatingStockOrdersRef.current = true
    setIsSavingStockOrder(true)
    setStockOrdersNotice('')
    setStockItemsNotice('')

    try {
      const createdOrders = await createStockOrdersFromGroups(activeWorkspaceId, groups, {
        createdBy: user?.id ?? null,
      })
      await refreshStockOrders()
      handleStockSectionChange('orders')
      setStockOrdersNotice(`Created ${createdOrders.length} draft order${createdOrders.length === 1 ? '' : 's'}.`)
    } catch (error) {
      setStockOrdersNotice(error.message || 'Unable to create orders right now.')
      throw error
    } finally {
      isCreatingStockOrdersRef.current = false
      setIsSavingStockOrder(false)
    }
  }

  const handleSaveStockOrderDraft = async (orderId, payload) => {
    if (!activeWorkspaceId) {
      throw new Error(stockWorkspaceSetupMessage || 'Workspace is required to update orders.')
    }

    setIsSavingStockOrder(true)
    setStockOrdersNotice('')

    try {
      await updateStockOrderDraft(activeWorkspaceId, orderId, payload)
      await refreshStockOrders()
      setStockOrdersNotice('Order draft saved.')
    } catch (error) {
      setStockOrdersNotice(error.message || 'Unable to save order right now.')
      throw error
    } finally {
      setIsSavingStockOrder(false)
    }
  }

  const handleMarkStockOrderSent = async (orderId) => {
    if (!activeWorkspaceId) {
      throw new Error(stockWorkspaceSetupMessage || 'Workspace is required to update orders.')
    }

    setIsSavingStockOrder(true)
    setStockOrdersNotice('')

    try {
      await updateStockOrderStatus(activeWorkspaceId, orderId, 'sent', {
        createdBy: user?.id ?? null,
      })
      await refreshStockOrders()
      setStockOrdersNotice('Order marked as sent.')
    } catch (error) {
      setStockOrdersNotice(error.message || 'Unable to update order right now.')
      throw error
    } finally {
      setIsSavingStockOrder(false)
    }
  }

  const handleReceiveStockOrder = async (orderId, { receiveItems, orderNumber }) => {
    if (!activeWorkspaceId) {
      const message = stockWorkspaceSetupMessage || 'Workspace is required to receive orders.'
      throw new Error(message)
    }
    if (isReceivingStockOrderRef.current) return

    isReceivingStockOrderRef.current = true
    setIsSavingStockOrder(true)
    setStockOrdersNotice('')

    try {
      const updatedOrder = await receiveStockOrderPartial(activeWorkspaceId, orderId, {
        receiveItems,
        createdBy: user?.id ?? null,
        orderNumber,
      })
      await refreshStockOrders()
      await refreshStockItems()
      setStockOrdersNotice(
        updatedOrder?.status === 'received'
          ? 'Order completed and stock updated.'
          : 'Partial delivery recorded and stock updated.',
      )
      return updatedOrder
    } catch (error) {
      console.error('[App] Receive failed:', error)
      setStockOrdersNotice(error.message || 'Unable to receive order right now.')
      throw error
    } finally {
      isReceivingStockOrderRef.current = false
      setIsSavingStockOrder(false)
    }
  }

  const handleCancelStockOrder = async (orderId) => {
    if (!activeWorkspaceId) {
      throw new Error(stockWorkspaceSetupMessage || 'Workspace is required to update orders.')
    }

    setIsSavingStockOrder(true)
    setStockOrdersNotice('')

    try {
      await updateStockOrderStatus(activeWorkspaceId, orderId, 'cancelled')
      await refreshStockOrders()
      setStockOrdersNotice('Order cancelled.')
    } catch (error) {
      setStockOrdersNotice(error.message || 'Unable to cancel order right now.')
      throw error
    } finally {
      setIsSavingStockOrder(false)
    }
  }

  const handleCreateOperationsTask = async (payload) => {
    if (!activeWorkspaceId) {
      throw new Error(operationsWorkspaceSetupMessage || 'Workspace is required to create tasks.')
    }

    setIsSavingOperations(true)
    setOperationsNotice('')

    try {
      await createOperationsTask(activeWorkspaceId, payload, user?.id ?? null)
      await refreshOperationsTasks()
      setOperationsNotice('Task created.')
    } catch (error) {
      setOperationsNotice(error.message || 'Unable to create task right now.')
      throw error
    } finally {
      setIsSavingOperations(false)
    }
  }

  const handleUpdateOperationsTask = async (taskId, payload) => {
    if (!activeWorkspaceId) {
      throw new Error(operationsWorkspaceSetupMessage || 'Workspace is required to update tasks.')
    }

    setIsSavingOperations(true)
    setOperationsNotice('')

    try {
      await updateOperationsTask(activeWorkspaceId, taskId, payload)
      await refreshOperationsTasks()
      setOperationsNotice('Task updated.')
    } catch (error) {
      setOperationsNotice(error.message || 'Unable to update task right now.')
      throw error
    } finally {
      setIsSavingOperations(false)
    }
  }

  const handleCompleteOperationsTask = async (task, { completionNote = '' } = {}) => {
    if (!activeWorkspaceId || !task?.id) {
      throw new Error(operationsWorkspaceSetupMessage || 'Workspace and task are required.')
    }

    setIsSavingOperations(true)
    setOperationsNotice('')

    try {
      await completeOperationsTask(activeWorkspaceId, task.id, {
        completedBy: user?.id ?? null,
        completionNote,
      })
      await Promise.all([
        refreshOperationsTasks(),
        isMobileViewport ? refreshMobileOperationsTasks() : Promise.resolve(),
      ])
      const successMessage = 'Task completed.'
      setOperationsNotice(successMessage)
      if (isMobileViewport) {
        setMobileNotice(successMessage)
      }
    } catch (error) {
      const errorMessage = error.message || 'Unable to complete task right now.'
      setOperationsNotice(errorMessage)
      if (isMobileViewport) {
        setMobileNotice(errorMessage)
      }
      throw error
    } finally {
      setIsSavingOperations(false)
    }
  }

  const handleReopenOperationsTask = async (task) => {
    if (!activeWorkspaceId || !task?.id) {
      throw new Error(operationsWorkspaceSetupMessage || 'Workspace and task are required.')
    }

    setIsSavingOperations(true)
    setOperationsNotice('')

    try {
      await reopenOperationsTask(activeWorkspaceId, task.id)
      await refreshOperationsTasks()
      setOperationsNotice('Task reopened.')
    } catch (error) {
      setOperationsNotice(error.message || 'Unable to reopen task right now.')
      throw error
    } finally {
      setIsSavingOperations(false)
    }
  }

  const handleDeleteOperationsTask = async (task) => {
    if (!activeWorkspaceId || !task?.id) {
      throw new Error(operationsWorkspaceSetupMessage || 'Workspace and task are required.')
    }

    setIsSavingOperations(true)
    setOperationsNotice('')

    try {
      await deleteOperationsTask(activeWorkspaceId, task.id)
      await refreshOperationsTasks()
      setOperationsNotice('Task deleted.')
    } catch (error) {
      setOperationsNotice(error.message || 'Unable to delete task right now.')
      throw error
    } finally {
      setIsSavingOperations(false)
    }
  }

  const handleCreateOperationsLog = async (payload) => {
    if (!activeWorkspaceId) {
      throw new Error(operationsWorkspaceSetupMessage || 'Workspace is required to add log entries.')
    }

    setIsSavingOperations(true)
    setOperationsNotice('')

    try {
      await createOperationsLog(activeWorkspaceId, payload, user?.id ?? null)
      await refreshOperationsLogs()
      setOperationsNotice('Note added.')
    } catch (error) {
      setOperationsNotice(error.message || 'Unable to add note right now.')
      throw error
    } finally {
      setIsSavingOperations(false)
    }
  }

  const handleUpdateOperationsLog = async (logId, payload) => {
    if (!activeWorkspaceId) {
      throw new Error(operationsWorkspaceSetupMessage || 'Workspace is required to update log entries.')
    }

    setIsSavingOperations(true)
    setOperationsNotice('')

    try {
      await updateOperationsLog(activeWorkspaceId, logId, payload)
      await refreshOperationsLogs()
      setOperationsNotice('Note updated.')
    } catch (error) {
      setOperationsNotice(error.message || 'Unable to update note right now.')
      throw error
    } finally {
      setIsSavingOperations(false)
    }
  }

  const handleDeleteOperationsLog = async (log) => {
    if (!activeWorkspaceId || !log?.id) {
      throw new Error(operationsWorkspaceSetupMessage || 'Workspace and log entry are required.')
    }

    setIsSavingOperations(true)
    setOperationsNotice('')

    try {
      await deleteOperationsLog(activeWorkspaceId, log.id)
      await refreshOperationsLogs()
      setOperationsNotice('Note deleted.')
    } catch (error) {
      setOperationsNotice(error.message || 'Unable to delete note right now.')
      throw error
    } finally {
      setIsSavingOperations(false)
    }
  }

  const handleCreateOperationsAnnouncement = async (payload) => {
    if (!canManageAnnouncementsRole) {
      throw new Error('Only owners and managers can create announcements.')
    }
    if (!activeWorkspaceId) {
      throw new Error(operationsWorkspaceSetupMessage || 'Workspace is required to publish announcements.')
    }

    setIsSavingOperations(true)
    setOperationsNotice('')

    try {
      await createOperationsAnnouncement(activeWorkspaceId, payload, user?.id ?? null)
      await refreshOperationsAnnouncements()
      setOperationsNotice('Announcement published.')
    } catch (error) {
      setOperationsNotice(error.message || 'Unable to publish right now.')
      throw error
    } finally {
      setIsSavingOperations(false)
    }
  }

  const handleUpdateOperationsAnnouncement = async (announcementId, payload) => {
    if (!canManageAnnouncementsRole) {
      throw new Error('Only owners and managers can edit announcements.')
    }
    if (!activeWorkspaceId) {
      throw new Error(operationsWorkspaceSetupMessage || 'Workspace is required to update announcements.')
    }

    setIsSavingOperations(true)
    setOperationsNotice('')

    try {
      await updateOperationsAnnouncement(activeWorkspaceId, announcementId, payload)
      await refreshOperationsAnnouncements()
      setOperationsNotice('Announcement updated.')
    } catch (error) {
      setOperationsNotice(error.message || 'Unable to update announcement right now.')
      throw error
    } finally {
      setIsSavingOperations(false)
    }
  }

  const handleHideOperationsAnnouncement = async (announcement) => {
    if (!canManageAnnouncementsRole) {
      throw new Error('Only owners and managers can hide announcements.')
    }
    if (!activeWorkspaceId || !announcement?.id) {
      throw new Error(operationsWorkspaceSetupMessage || 'Workspace and announcement are required.')
    }

    setIsSavingOperations(true)
    setOperationsNotice('')

    try {
      await deactivateOperationsAnnouncement(activeWorkspaceId, announcement.id)
      await refreshOperationsAnnouncements()
      setOperationsNotice('Announcement hidden.')
    } catch (error) {
      setOperationsNotice(error.message || 'Unable to hide announcement right now.')
      throw error
    } finally {
      setIsSavingOperations(false)
    }
  }

  const handlePublishOperationsAnnouncement = async (announcement) => {
    if (!canManageAnnouncementsRole) {
      throw new Error('Only owners and managers can publish announcements.')
    }
    if (!activeWorkspaceId || !announcement?.id) {
      throw new Error(operationsWorkspaceSetupMessage || 'Workspace and announcement are required.')
    }

    setIsSavingOperations(true)
    setOperationsNotice('')

    try {
      await updateOperationsAnnouncement(activeWorkspaceId, announcement.id, {
        title: announcement.title,
        message: announcement.message,
        priority: announcement.priority,
        audience: announcement.audience,
        active: true,
        startsAt: announcement.startsAt,
        endsAt: announcement.endsAt,
      })
      await refreshOperationsAnnouncements()
      setOperationsNotice('Announcement published.')
    } catch (error) {
      setOperationsNotice(error.message || 'Unable to publish announcement right now.')
      throw error
    } finally {
      setIsSavingOperations(false)
    }
  }

  const handleMarkOperationsAnnouncementSeen = async (announcement) => {
    if (!announcement?.id || !user?.id) {
      throw new Error('Announcement and user are required.')
    }

    setIsSavingOperations(true)

    try {
      await markOperationsAnnouncementRead(announcement.id, user.id)
      await refreshOperationsAnnouncements()
    } catch (error) {
      if (activeView === 'operations') {
        setOperationsNotice(error.message || 'Unable to mark announcement as seen right now.')
      }
      throw error
    } finally {
      setIsSavingOperations(false)
    }
  }

  const handleCreateOperationsChecklistTemplate = async (payload) => {
    if (!activeWorkspaceId) {
      throw new Error(operationsWorkspaceSetupMessage || 'Workspace is required to create checklists.')
    }

    setIsSavingOperations(true)
    setOperationsNotice('')

    try {
      const created = await createOperationsChecklistTemplate(activeWorkspaceId, payload, user?.id ?? null)
      await refreshOperationsChecklistTemplates()
      setOperationsNotice('Checklist template created.')
      return created
    } catch (error) {
      setOperationsNotice(error.message || 'Unable to create checklist template right now.')
      throw error
    } finally {
      setIsSavingOperations(false)
    }
  }

  const handleUpdateOperationsChecklistTemplate = async (templateId, payload) => {
    if (!activeWorkspaceId) {
      throw new Error(operationsWorkspaceSetupMessage || 'Workspace is required to update checklists.')
    }

    setIsSavingOperations(true)
    setOperationsNotice('')

    try {
      const updated = await updateOperationsChecklistTemplate(activeWorkspaceId, templateId, payload)
      await refreshOperationsChecklistTemplates()
      setOperationsNotice('Checklist template updated.')
      return updated
    } catch (error) {
      setOperationsNotice(error.message || 'Unable to update checklist template right now.')
      throw error
    } finally {
      setIsSavingOperations(false)
    }
  }

  const handleDeleteOperationsChecklistTemplate = async (template) => {
    if (!activeWorkspaceId || !template?.id) {
      throw new Error(operationsWorkspaceSetupMessage || 'Workspace and checklist are required.')
    }

    setIsSavingOperations(true)
    setOperationsNotice('')

    try {
      await deleteOperationsChecklistTemplate(activeWorkspaceId, template.id)
      await refreshOperationsChecklistTemplates()
      setOperationsNotice('Checklist template deleted.')
    } catch (error) {
      setOperationsNotice(error.message || 'Unable to delete checklist template right now.')
      throw error
    } finally {
      setIsSavingOperations(false)
    }
  }

  const handleCreateOperationsChecklistItem = async (templateId, payload) => {
    setIsSavingOperations(true)
    setOperationsNotice('')

    try {
      const created = await createOperationsChecklistItem(templateId, payload)
      await refreshOperationsChecklistTemplates()
      return created
    } catch (error) {
      setOperationsNotice(error.message || 'Unable to add checklist item right now.')
      throw error
    } finally {
      setIsSavingOperations(false)
    }
  }

  const handleUpdateOperationsChecklistItem = async (itemId, payload) => {
    setIsSavingOperations(true)
    setOperationsNotice('')

    try {
      const updated = await updateOperationsChecklistItem(itemId, payload)
      await refreshOperationsChecklistTemplates()
      return updated
    } catch (error) {
      setOperationsNotice(error.message || 'Unable to update checklist item right now.')
      throw error
    } finally {
      setIsSavingOperations(false)
    }
  }

  const handleDeleteOperationsChecklistItem = async (itemId) => {
    setIsSavingOperations(true)
    setOperationsNotice('')

    try {
      await deleteOperationsChecklistItem(itemId)
      await refreshOperationsChecklistTemplates()
    } catch (error) {
      setOperationsNotice(error.message || 'Unable to delete checklist item right now.')
      throw error
    } finally {
      setIsSavingOperations(false)
    }
  }

  const handleSaveOperationsChecklistItemOrder = async (items = []) => {
    setIsSavingOperations(true)
    setOperationsNotice('')

    try {
      await saveOperationsChecklistItemOrder(items)
      await refreshOperationsChecklistTemplates()
    } catch (error) {
      setOperationsNotice(error.message || 'Unable to reorder checklist items right now.')
      throw error
    } finally {
      setIsSavingOperations(false)
    }
  }

  const handleStartOperationsChecklist = async (template) => {
    if (!activeWorkspaceId || !template?.id) {
      throw new Error(operationsWorkspaceSetupMessage || 'Workspace and checklist are required.')
    }

    setIsSavingOperations(true)
    setOperationsNotice('')

    try {
      const result = await generateDailyChecklistTasks(
        activeWorkspaceId,
        template.id,
        currentDateKey,
        user?.id ?? null,
      )
      await refreshOperationsTasks()
      setActiveChecklistRunTemplateId(template.id)
      setOperationsNotice(
        result.alreadyExists
          ? `${template.name} is already running for today.`
          : `${template.name} started for today.`,
      )
    } catch (error) {
      setOperationsNotice(error.message || 'Unable to start checklist right now.')
      throw error
    } finally {
      setIsSavingOperations(false)
    }
  }

  const handleToggleChecklistExecutionTask = async (task) => {
    const isDone = `${task.status ?? ''}`.toLowerCase() === 'completed'
    if (isDone) {
      await handleReopenOperationsTask(task)
      return
    }
    await handleCompleteOperationsTask(task, { completionNote: '' })
  }

  const persistBarRefillDraftChanges = async (refillId, { notes, items = [] }) => {
    if (notes !== undefined) {
      await updateBarRefill(refillId, { notes })
    }

    await Promise.all(items.map((item) => updateBarRefillItem(item.id, {
      pickedQuantity: item.pickedQuantity,
      isPicked: item.isPicked,
    })))
  }

  const handleCreateBarRefill = async (payload) => {
    setIsSavingBarRefill(true)
    setBarRefillsNotice('')

    try {
      await createBarRefill(payload)
      await refreshBarRefills()
      setBarRefillsNotice('Bar refill draft saved.')
    } catch (error) {
      setBarRefillsNotice(error.message || 'Unable to create bar refill right now.')
    } finally {
      setIsSavingBarRefill(false)
    }
  }

  const handleSaveBarRefillChanges = async (refillId, payload) => {
    setIsSavingBarRefill(true)
    setBarRefillsNotice('')

    try {
      await persistBarRefillDraftChanges(refillId, payload)
      await refreshBarRefills()
      setBarRefillsNotice('Bar refill updated.')
    } catch (error) {
      setBarRefillsNotice(error.message || 'Unable to save bar refill right now.')
    } finally {
      setIsSavingBarRefill(false)
    }
  }

  const handleCompleteBarRefill = async (refillId, payload) => {
    setIsSavingBarRefill(true)
    setBarRefillsNotice('')

    try {
      await persistBarRefillDraftChanges(refillId, payload)
      await completeBarRefill(refillId)
      await Promise.all([refreshBarRefills(), refreshInventory()])
      setBarRefillsNotice('Bar refill completed. Stock updated.')
    } catch (error) {
      setBarRefillsNotice(error.message || 'Unable to complete bar refill right now.')
    } finally {
      setIsSavingBarRefill(false)
    }
  }

  const handleCancelBarRefill = async (refillId) => {
    setIsSavingBarRefill(true)
    setBarRefillsNotice('')

    try {
      await updateBarRefill(refillId, { status: 'cancelled' })
      await refreshBarRefills()
      setBarRefillsNotice('Bar refill cancelled.')
    } catch (error) {
      setBarRefillsNotice(error.message || 'Unable to cancel bar refill right now.')
    } finally {
      setIsSavingBarRefill(false)
    }
  }

  const handleOpenAddSupplier = () => {
    setSupplierModalOrigin(null)
    setEditingSupplier(null)
    setSupplierForm({
      companyName: '',
      contactPerson: '',
      phone: '',
      email: '',
      address: '',
      taxId: '',
      paymentTerms: '',
      deliveryDays: '',
      notes: '',
    })
    setIsSupplierModalOpen(true)
  }

  const handleOpenAddSupplierFromInventory = () => {
    setSupplierModalOrigin('inventory')
    setEditingSupplier(null)
    setSupplierForm({
      companyName: '',
      contactPerson: '',
      phone: '',
      email: '',
      address: '',
      taxId: '',
      paymentTerms: '',
      deliveryDays: '',
      notes: '',
    })
    setIsSupplierModalOpen(true)
  }

  const handleOpenAddSupplierFromStock = () => {
    setSupplierModalOrigin('stock')
    setEditingSupplier(null)
    setSupplierForm({
      companyName: '',
      contactPerson: '',
      phone: '',
      email: '',
      address: '',
      taxId: '',
      paymentTerms: '',
      deliveryDays: '',
      notes: '',
    })
    setIsSupplierModalOpen(true)
  }

  const handleCloseSupplierModal = () => {
    setIsSupplierModalOpen(false)
    setSupplierModalOrigin(null)
    setEditingSupplier(null)
    setSupplierForm({
      companyName: '',
      contactPerson: '',
      phone: '',
      email: '',
      address: '',
      taxId: '',
      paymentTerms: '',
      deliveryDays: '',
      notes: '',
    })
  }

  const handleOpenEditSupplier = (supplier) => {
    setSupplierModalOrigin(null)
    setEditingSupplier(supplier)
    setSupplierForm({
      companyName: supplier.companyName ?? '',
      contactPerson: supplier.contactPerson ?? '',
      phone: supplier.phone ?? '',
      email: supplier.email ?? '',
      address: supplier.address ?? '',
      taxId: supplier.taxId ?? '',
      paymentTerms: supplier.paymentTerms ?? '',
      deliveryDays: supplier.deliveryDays ?? '',
      notes: supplier.notes ?? '',
    })
    setIsSupplierModalOpen(true)
  }

  const handleRequestDeleteSupplier = (supplier) => {
    if (!supplier?.id) return
    setSupplierPendingDelete(supplier)
  }

  const handleCloseDeleteSupplierModal = () => {
    if (isDeletingSupplier) return
    setSupplierPendingDelete(null)
  }

  const handleConfirmDeleteSupplier = async () => {
    if (!supplierPendingDelete?.id) return

    const hasHistory = supplierHasHistory(supplierPendingDelete, {
      stockItems,
      stockOrders,
      inventoryItems,
    })
    if (hasHistory) return

    setIsDeletingSupplier(true)
    setSuppliersNotice('')

    try {
      await deleteSupplier(supplierPendingDelete.id)
      await refreshSuppliers()
      setSuppliersNotice('Supplier removed.')
      setSupplierPendingDelete(null)
    } catch (error) {
      setSuppliersNotice(error.message || 'Unable to delete supplier right now.')
    } finally {
      setIsDeletingSupplier(false)
    }
  }

  const handleStockCreateSupplier = async (payload) => {
    if (!payload.companyName?.trim()) {
      setSuppliersNotice('Please provide the supplier name.')
      return
    }

    setIsSavingSupplier(true)
    setSuppliersNotice('')

    try {
      await createSupplier(payload)
      await refreshSuppliers()
      setSuppliersNotice('Supplier created.')
    } catch (error) {
      setSuppliersNotice(error.message || 'Unable to create supplier right now.')
      throw error
    } finally {
      setIsSavingSupplier(false)
    }
  }

  const handleStockUpdateSupplier = async (supplierId, payload) => {
    if (!payload.companyName?.trim()) {
      setSuppliersNotice('Please provide the supplier name.')
      return
    }

    const existingSupplier = suppliers.find((supplier) => supplier.id === supplierId)

    setIsSavingSupplier(true)
    setSuppliersNotice('')

    try {
      await updateSupplier(supplierId, {
        companyName: payload.companyName,
        contactPerson: payload.contactPerson,
        phone: payload.phone,
        email: payload.email,
        address: payload.address,
        notes: payload.notes,
        active: payload.active,
        taxId: existingSupplier?.taxId ?? '',
        paymentTerms: existingSupplier?.paymentTerms ?? '',
        deliveryDays: existingSupplier?.deliveryDays ?? '',
      })
      await refreshSuppliers()
      setSuppliersNotice('Supplier updated.')
    } catch (error) {
      setSuppliersNotice(error.message || 'Unable to update supplier right now.')
      throw error
    } finally {
      setIsSavingSupplier(false)
    }
  }

  const handleStockDeleteSupplier = async (supplier) => {
    if (!supplier?.id) return

    const hasHistory = supplierHasHistory(supplier, {
      stockItems,
      stockOrders,
      inventoryItems,
    })
    if (hasHistory) return

    setIsSavingSupplier(true)
    setSuppliersNotice('')

    try {
      await deleteSupplier(supplier.id)
      await refreshSuppliers()
      setSuppliersNotice('Supplier removed.')
    } catch (error) {
      setSuppliersNotice(error.message || 'Unable to delete supplier right now.')
      throw error
    } finally {
      setIsSavingSupplier(false)
    }
  }

  const handleStockDeactivateSupplier = async (supplier, nextActive) => {
    if (!supplier?.id) return

    setIsSavingSupplier(true)
    setSuppliersNotice('')

    try {
      await updateSupplier(supplier.id, {
        companyName: supplier.companyName,
        contactPerson: supplier.contactPerson,
        phone: supplier.phone,
        email: supplier.email,
        address: supplier.address,
        taxId: supplier.taxId,
        paymentTerms: supplier.paymentTerms,
        deliveryDays: supplier.deliveryDays,
        notes: supplier.notes,
        active: nextActive,
      })
      await refreshSuppliers()
      setSuppliersNotice(nextActive ? 'Supplier activated.' : 'Supplier deactivated.')
    } catch (error) {
      setSuppliersNotice(error.message || 'Unable to update supplier right now.')
      throw error
    } finally {
      setIsSavingSupplier(false)
    }
  }

  const handleSupplierSubmit = async (event) => {
    event.preventDefault()

    if (!supplierForm.companyName.trim()) {
      setSuppliersNotice('Please provide the company name.')
      return
    }

    setIsSavingSupplier(true)
    setSuppliersNotice('')

    const payload = {
      companyName: supplierForm.companyName.trim(),
      contactPerson: supplierForm.contactPerson.trim(),
      phone: supplierForm.phone.trim(),
      email: supplierForm.email.trim(),
      address: supplierForm.address.trim(),
      taxId: supplierForm.taxId.trim(),
      paymentTerms: supplierForm.paymentTerms.trim(),
      deliveryDays: supplierForm.deliveryDays.trim(),
      notes: supplierForm.notes.trim(),
    }

    try {
      const savedCompanyName = payload.companyName
      const inventoryOrigin = supplierModalOrigin === 'inventory'
      const stockOrigin = supplierModalOrigin === 'stock'

      if (editingSupplier) {
        await updateSupplier(editingSupplier.id, payload)
      } else {
        const createdSupplier = await createSupplier(payload)
        await refreshSuppliers()
        handleCloseSupplierModal()

        if (inventoryOrigin && isInventoryModalOpen) {
          setInventoryForm((current) => ({
            ...current,
            supplier: `${createdSupplier?.companyName ?? savedCompanyName}`.trim(),
          }))
          setInventoryNotice('Supplier created and selected.')
        } else if (stockOrigin && isStockItemModalOpen) {
          setStockSupplierPrefill(`${createdSupplier?.companyName ?? savedCompanyName}`.trim())
          setStockItemsNotice('Supplier created and selected.')
        } else {
          setSuppliersNotice('Supplier created.')
        }
        return
      }

      await refreshSuppliers()
      setSuppliersNotice('Supplier updated.')
      handleCloseSupplierModal()
    } catch (error) {
      setSuppliersNotice(error.message || 'Unable to save supplier right now.')
    } finally {
      setIsSavingSupplier(false)
    }
  }

  const handleCreateTask = async (payload) => {
    setIsSavingTask(true)
    setTasksNotice('')

    try {
      await createTask(payload)
      await refreshTasks()
      setTasksNotice('Task created successfully.')
    } catch (error) {
      setTasksNotice(error?.message || 'Unable to create task right now.')
      throw error
    } finally {
      setIsSavingTask(false)
    }
  }

  const handleUpdateTask = async (taskId, payload) => {
    setIsSavingTask(true)
    setTasksNotice('')

    try {
      await updateTask(taskId, payload)
      await refreshTasks()
      setTasksNotice('Task updated successfully.')
    } catch (error) {
      setTasksNotice(error?.message || 'Unable to update task right now.')
      throw error
    } finally {
      setIsSavingTask(false)
    }
  }

  const handleDeleteTask = async (taskId) => {
    setIsSavingTask(true)
    setTasksNotice('')

    try {
      await deleteTask(taskId)
      await refreshTasks()
      setTasksNotice('Task deleted.')
    } catch (error) {
      setTasksNotice(error?.message || 'Unable to delete task right now.')
    } finally {
      setIsSavingTask(false)
    }
  }

  const handleCompleteTask = async (taskId) => {
    setIsSavingTask(true)
    setTasksNotice('')

    try {
      await completeTask(taskId)
      await refreshTasks()
      setTasksNotice('Task marked complete.')
    } catch (error) {
      setTasksNotice(error?.message || 'Unable to complete this task right now.')
    } finally {
      setIsSavingTask(false)
    }
  }

  const handleReopenTask = async (taskId) => {
    setIsSavingTask(true)
    setTasksNotice('')

    try {
      await reopenTask(taskId)
      await refreshTasks()
      setTasksNotice('Task reopened.')
    } catch (error) {
      setTasksNotice(error?.message || 'Unable to reopen this task right now.')
    } finally {
      setIsSavingTask(false)
    }
  }

  const handleDeleteCustomDepartment = async (departmentName) => {
    const trimmed = `${departmentName ?? ''}`.trim()
    if (!trimmed) return

    setIsSavingTask(true)
    setTasksNotice('')
    setTaskTemplatesNotice('')

    try {
      const matchingTasks = tasks.filter((task) => matchesCustomDepartmentName(task, trimmed))
      const matchingTemplates = taskTemplates.filter((template) => matchesCustomDepartmentName(template, trimmed))
      const reassignment = {
        department: 'custom',
        departmentCustom: UNASSIGNED_CUSTOM_DEPARTMENT_NAME,
      }

      await Promise.all([
        ...matchingTasks.map((task) => updateTask(task.id, reassignment)),
        ...matchingTemplates.map((template) => updateTaskTemplate(template.id, reassignment)),
      ])

      await refreshTasks()
      await refreshTaskTemplates()

      const movedCount = matchingTasks.length + matchingTemplates.length
      setTasksNotice(
        movedCount > 0
          ? `Department "${trimmed}" deleted. ${movedCount} item${movedCount === 1 ? '' : 's'} moved to Unassigned Department.`
          : `Department "${trimmed}" deleted.`,
      )
    } catch (error) {
      setTasksNotice(error?.message || 'Unable to delete department right now.')
      throw error
    } finally {
      setIsSavingTask(false)
    }
  }

  const handleCreateTaskTemplate = async (payload) => {
    setIsSavingTaskTemplate(true)
    setTaskTemplatesNotice('')

    try {
      const { checklistItems = [], ...templatePayload } = payload
      const createdTemplate = await createTaskTemplate(templatePayload)
      await replaceTemplateChecklist(createdTemplate.id, checklistItems)
      await refreshTaskTemplates()
      setTaskTemplatesNotice('Template created successfully.')
    } catch (error) {
      setTaskTemplatesNotice(error?.message || 'Unable to create template right now.')
      throw error
    } finally {
      setIsSavingTaskTemplate(false)
    }
  }

  const handleUpdateTaskTemplate = async (templateId, payload) => {
    setIsSavingTaskTemplate(true)
    setTaskTemplatesNotice('')

    try {
      const { checklistItems = [], ...templatePayload } = payload
      await updateTaskTemplate(templateId, templatePayload)
      await replaceTemplateChecklist(templateId, checklistItems)
      await refreshTaskTemplates()
      setTaskTemplatesNotice('Template updated successfully.')
    } catch (error) {
      setTaskTemplatesNotice(error?.message || 'Unable to update template right now.')
      throw error
    } finally {
      setIsSavingTaskTemplate(false)
    }
  }

  const handleDeleteTaskTemplate = async (templateId) => {
    setIsSavingTaskTemplate(true)
    setTaskTemplatesNotice('')

    try {
      await deleteTaskTemplate(templateId)
      await refreshTaskTemplates()
      setTaskTemplatesNotice('Template deleted.')
    } catch (error) {
      setTaskTemplatesNotice(error?.message || 'Unable to delete template right now.')
    } finally {
      setIsSavingTaskTemplate(false)
    }
  }

  const handleGenerateTasksFromTemplates = async () => {
    setIsGeneratingTasksFromTemplates(true)
    setTaskTemplatesNotice('')

    try {
      const { createdCount, skippedCount } = await generateTasksFromTemplates({
        templates: taskTemplates,
        selectedDate: currentDateKey,
      })

      await refreshTasks()

      const createdLabel = createdCount === 1 ? '1 task generated' : `${createdCount} tasks generated`
      const skippedLabel = skippedCount === 1 ? '1 already existed' : `${skippedCount} already existed`

      if (createdCount === 0 && skippedCount === 0) {
        setTaskTemplatesNotice('No active templates to generate.')
      } else if (skippedCount === 0) {
        setTaskTemplatesNotice(`${createdLabel}.`)
      } else {
        setTaskTemplatesNotice(`${createdLabel}. ${skippedLabel}.`)
      }
    } catch (error) {
      setTaskTemplatesNotice(error?.message || 'Unable to generate tasks right now.')
    } finally {
      setIsGeneratingTasksFromTemplates(false)
    }
  }

  const handleToggleChecklistItem = async (itemId, isCompleted) => {
    setChecklistItemsByTaskId((current) => {
      const next = {}

      Object.entries(current).forEach(([taskId, items]) => {
        next[taskId] = items.map((item) => (
          item.id === itemId
            ? {
              ...item,
              isCompleted: Boolean(isCompleted),
              completedAt: isCompleted ? new Date().toISOString() : null,
            }
            : item
        ))
      })

      return next
    })

    try {
      await toggleChecklistItem(itemId, isCompleted)
    } catch (error) {
      await refreshTasks()
      setTasksNotice(error?.message || 'Unable to update checklist item right now.')
    }
  }

  const moduleTitle = getModuleTitle(activeView, { teamSection, stockSection, operationsSection })
  const moduleSubtitle = getModuleSubtitle(activeView, currentDateLabel, { teamSection, stockSection, operationsSection })
  const moduleSearchPlaceholder = getSearchPlaceholder(activeView, { teamSection, stockSection, operationsSection })
  const hideStandardTopbar = shouldHideStandardTopbar(activeView, teamSection)
  const useCommandTopbar = shouldUseCommandTopbar(activeView)
  const showModuleSearch = shouldShowModuleSearch(activeView, teamSection)

  const mobileExpandedTitle = useMemo(() => {
    if (mobileExpandedView === 'full-schedule') return 'Team schedule'
    if (mobileExpandedView === 'workspace') return moduleTitle
    return ''
  }, [mobileExpandedView, moduleTitle])

  const supplierDeleteHasHistory = supplierPendingDelete
    ? supplierHasHistory(supplierPendingDelete, { stockItems, stockOrders, inventoryItems })
    : false

  const inventoryFormCategoryOptions = useMemo(
    () => getInventoryCategoryFilters(inventoryItems),
    [inventoryItems],
  )

  const resolvedInventoryFormCategory = useMemo(
    () => resolveInventoryCategoryForSave(
      inventoryForm.categoryPreset,
      inventoryForm.customCategory,
    ) || 'Other',
    [inventoryForm.categoryPreset, inventoryForm.customCategory],
  )

  const inventoryFormSubcategoryOptions = useMemo(
    () => getInventorySubcategoryOptionsForCategory(resolvedInventoryFormCategory, inventoryItems),
    [resolvedInventoryFormCategory, inventoryItems],
  )

  const inventoryFormCustomCategories = useMemo(
    () => inventoryFormCategoryOptions.filter((category) => !INVENTORY_CATEGORIES.includes(category)),
    [inventoryFormCategoryOptions],
  )

  const inventorySupplierOptions = useMemo(
    () => buildInventorySupplierOptions(suppliers, inventoryForm.supplier),
    [suppliers, inventoryForm.supplier],
  )

  const inventoryFormStatus = useMemo(
    () => getInventoryStatus(
      Number(inventoryForm.quantity) || 0,
      Number(inventoryForm.minimumQuantity) || 0,
    ),
    [inventoryForm.quantity, inventoryForm.minimumQuantity],
  )

  const handleOpenWorkspaceProfile = () => {
    if (!canOpenWorkspaceProfile) return

    handleActiveViewChange('settings')
    handleSettingsSectionChange('profile')
  }

  const handleMobileBack = () => {
    if (isHostMobileRole(role)) {
      setMobileExpandedView(null)
      return
    }

    setMobileReservationsHostMode(false)
    setMobileExpandedView(null)
  }

  const handleMobileTabChange = useCallback((tab) => {
    if (isHostMobileRole(role)) return

    setMobileExpandedView(null)
    setMobileMenuScreen('main')
    if (isManagementMobileRole(role)) {
      setMobileReservationsHostMode(false)
      setMobileManagerTab(tab)
      persistManagerMobileTab(tab)
      return
    }

    const hostTabState = resolveHostMobileTabChange(tab, role)
    setMobileStaffTab(hostTabState.tab)
    persistMobileTab(hostTabState.tab, isHostMobileRole(role) ? 'host' : 'staff')
    setMobileReservationsHostMode(hostTabState.openHostMode)
    if (hostTabState.activeView) {
      handleActiveViewChange(hostTabState.activeView)
    }
  }, [role, handleActiveViewChange])

  const handleMobileOpenFullSchedule = () => {
    if (!canOpenMobileFullSchedule(role)) return

    handleActiveViewChange('team')
    handleTeamSectionChange('schedule')
    setMobileExpandedView('full-schedule')
  }

  const handleMobileNavigateModule = (moduleId) => {
    if (!canAccessMobileExpandedModule(role, moduleId)) return

    handleActiveViewChange(moduleId)
    if (moduleId === 'team') {
      handleTeamSectionChange('schedule')
    } else if (moduleId === 'stock') {
      handleStockSectionChange('dashboard')
    } else if (moduleId === 'operations') {
      handleOperationsSectionChange('dashboard')
    } else if (moduleId === 'settings') {
      handleSettingsSectionChange('profile')
    }
    setMobileExpandedView('workspace')
  }

  const handleMobileOpenSettings = () => {
    if (!canAccessMobileExpandedModule(role, 'settings')) return

    handleActiveViewChange('settings')
    handleSettingsSectionChange('profile')
    setMobileExpandedView('workspace')
  }

  const handleMobileOpenTasksWorkspace = () => {
    if (!canOpenMobileTasksWorkspace(role)) return

    handleActiveViewChange('operations')
    handleOperationsSectionChange('dashboard')
    setMobileExpandedView('workspace')
  }

  const handleMobileManagerOpenStock = useCallback(() => {
    if (!canAccessMobileExpandedModule(role, 'stock')) return

    handleActiveViewChange('stock')
    handleStockSectionChange('dashboard')
    setMobileExpandedView('workspace')
  }, [role, handleActiveViewChange, handleStockSectionChange])

  const handleMobileManagerReceiveDeliveries = useCallback(() => {
    if (!canAccessMobileExpandedModule(role, 'stock')) return

    handleActiveViewChange('stock')
    handleStockSectionChange('orders')
    setStockOrdersFilterHint('sent')
    setMobileExpandedView('workspace')
  }, [role, handleActiveViewChange, handleStockSectionChange])

  const handleMobileManagerOpenStockOrders = useCallback(() => {
    if (!canAccessMobileExpandedModule(role, 'stock')) return

    handleActiveViewChange('stock')
    handleStockSectionChange('orders')
    setMobileExpandedView('workspace')
  }, [role, handleActiveViewChange, handleStockSectionChange])

  const handleMobileManagerOpenTasks = useCallback(() => {
    if (!canAccessMobileExpandedModule(role, 'operations')) return

    handleActiveViewChange('operations')
    handleOperationsSectionChange('dashboard')
    setMobileExpandedView('workspace')
  }, [role, handleActiveViewChange, handleOperationsSectionChange])

  const handleMobileManagerOpenTeamToday = useCallback(() => {
    if (!canAccessMobileExpandedModule(role, 'team')) return

    handleActiveViewChange('team')
    handleTeamSectionChange('today')
    setMobileExpandedView('workspace')
  }, [role, handleActiveViewChange, handleTeamSectionChange])

  const handleMobileManagerOpenReservations = useCallback(() => {
    if (!canAccessMobileExpandedModule(role, 'reservations')) return

    setMobileReservationsHostMode(false)
    handleActiveViewChange('reservations')
    setMobileExpandedView('workspace')
  }, [role, handleActiveViewChange])

  const handleMobileOpenReservationsHostMode = useCallback(() => {
    if (!canOpenReservationsHostMode(role)) return

    handleActiveViewChange('reservations')
    setMobileReservationsHostMode(true)

    if (isHostMobileRole(role)) {
      setMobileExpandedView(null)
      setMobileStaffTab('host')
      persistMobileTab('host', 'host')
      return
    }

    if (useMobileExperience && isManagementMobileRole(role)) {
      setMobileExpandedView('workspace')
    }
  }, [role, useMobileExperience, handleActiveViewChange])

  const handleMobileExitReservationsHostMode = useCallback(() => {
    setMobileReservationsHostMode(false)
    setMobileExpandedView(null)
    handleActiveViewChange(resolveExitReservationsHostDestination(
      preReservationsHostViewRef.current,
      role,
    ))
  }, [role, handleActiveViewChange])

  const handleExitScheduleFocusMode = useCallback(() => {
    handleTeamSectionChange('members')
  }, [handleTeamSectionChange])

  const handleMobileHostReservationCreate = async (form) => {
    if (!canManageReservationsRole) return false

    const validation = validateReservationFormFields(form, { dateFallback: currentDateKey })
    if (!validation.ok) {
      setReservationNotice(validation.error)
      return false
    }

    if (isSavingReservationRef.current) return false

    isSavingReservationRef.current = true
    setIsSavingReservation(true)
    setReservationNotice('')

    try {
      const assignedUnits = Array.isArray(form.assignedUnits) ? form.assignedUnits : []
      const seatingAssignment = assignedUnits.length
        ? buildSeatingAssignment({
          assignedUnits,
          partySize: Number(form.guests) || 2,
          extraChairs: Math.max(0, Math.min(1, Number(form.extraChairs) || 0)),
        })
        : null
      const tableNumber = seatingAssignment
        ? formatSeatingAssignmentLabels(seatingAssignment)
        : `${form.tableNumber ?? ''}`.trim()

      const created = await createReservation(activeWorkspaceId, {
        guestName: validation.guestName,
        phone: `${form.phone ?? ''}`.trim(),
        date: validation.date,
        time: validation.time,
        guests: Number(form.guests) || 2,
        tableNumber,
        area: `${form.area ?? ''}`.trim(),
        status: resolveHostQuickCreateCreateStatus(form),
        notes: resolveHostQuickCreateCreateNotes(form),
        customerType: form.customerType ?? 'Regular',
        reservationPurpose: form.reservationPurpose ?? 'dinner',
        seatingId: form.seatingId ?? null,
        seatingAssignment,
      }, user?.id ?? null)

      upsertReservationInState(created)
      await reloadTodayReservations()
      setReservationNotice('Reservation created.')
      return true
    } catch (error) {
      setReservationNotice(error.message || 'Unable to create reservation right now.')
      return false
    } finally {
      isSavingReservationRef.current = false
      setIsSavingReservation(false)
    }
  }

  const handleMobileManagerCountStock = useCallback(() => {
    if (!canAccessMobileExpandedModule(role, 'stock')) return

    handleActiveViewChange('stock')
    handleStockSectionChange('dashboard')
    setMobileExpandedView('workspace')
  }, [role, handleActiveViewChange, handleStockSectionChange])

  const handleMobileManagerOpenChecklist = useCallback((row) => {
    if (!canAccessMobileExpandedModule(role, 'operations')) return

    handleActiveViewChange('operations')
    handleOperationsSectionChange('dashboard')
    setMobileExpandedView('workspace')

    if (row?.started && row?.templateId) {
      setActiveChecklistRunTemplateId(row.templateId)
    }
  }, [role, handleActiveViewChange, handleOperationsSectionChange])

  const handleMobileGoToCurrentWeek = () => {
    setMobileWeekStart(todayWeekStart)
    persistMobileWeekStart(todayWeekStart)
  }

  const handleMobilePreviousWeek = () => {
    setMobileWeekStart((current) => {
      const nextWeekStart = addWeeks(current, -1)
      persistMobileWeekStart(nextWeekStart)
      return nextWeekStart
    })
  }

  const handleMobileNextWeek = () => {
    setMobileWeekStart((current) => {
      const nextWeekStart = addWeeks(current, 1)
      persistMobileWeekStart(nextWeekStart)
      return nextWeekStart
    })
  }

  const handleMobileSignOut = async () => {
    setMobileStaffTab('home')
    setMobileManagerTab('today')
    setMobileMenuScreen('main')
    setMobileExpandedView(null)
    setMobileNotice('')
    setMobileProfileError('')

    try {
      await signOut()
    } catch (error) {
      console.warn('[App] mobile signOut error:', error)
      setMobileNotice(error?.message || 'Unable to sign out right now.')
    }
  }

  const handleMobileOpenProfile = () => {
    setMobileMenuScreen('profile')
  }

  const handleMobileBackFromProfile = () => {
    setMobileMenuScreen('main')
  }

  const handleMobileProfileSave = useCallback(async ({ displayName, phone }) => {
    const userId = `${user?.id ?? ''}`.trim()
    if (!userId) {
      throw new Error('Signed-in user is not available.')
    }

    setIsSavingMobileProfile(true)
    setMobileProfileError('')

    try {
      await updateMembershipDisplayName(userId, displayName)
      await refreshMembership()

      const linkedEmployeeId = `${membership?.employeeId ?? ''}`.trim()
      if (linkedEmployeeId && activeWorkspaceId && phone !== undefined) {
        const updatedEmployee = await updateLinkedEmployeePhone(activeWorkspaceId, linkedEmployeeId, phone)
        setMobileProfilePhone(`${updatedEmployee?.phone ?? phone ?? ''}`.trim())
      }

      setMobileNotice('Profile updated.')
    } catch (error) {
      const errorMessage = error?.message || 'Unable to save profile right now.'
      setMobileProfileError(errorMessage)
      if (isMobileViewport) {
        setMobileNotice(errorMessage)
      }
      throw error
    } finally {
      setIsSavingMobileProfile(false)
    }
  }, [activeWorkspaceId, isMobileViewport, membership?.employeeId, refreshMembership, user?.id])

  return (
    <PublishedFloorPlanProvider workspaceId={workspace?.id ?? ''}>
    <div className={`app-shell${useDedicatedShell ? ' is-mobile-shell' : ''}${useHostStationShell ? ' is-host-station-shell is-host-only-station' : ''}${useDedicatedShell && mobileExpandedView ? ' is-mobile-expanded' : ''}${(useDedicatedShell && mobileReservationsHostMode) || useHostStationShell ? ' is-reservations-host-mode' : ''}${isScheduleFocusMode ? ' schedule-focus-mode' : ''}`}>
      <ViewportDebugOverlay isMobileViewport={useDedicatedShell} />
      {!hideGlobalAppSidebar ? (
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-avatar" aria-hidden="true">
            {brandDisplay.logoUrl ? (
              <img src={brandDisplay.logoUrl} alt="" className="brand-logo" />
            ) : (
              <div className="brand-mark">{brandDisplay.mark}</div>
            )}
          </div>
          <div className="brand-copy">
            <h1
              className="brand-business-name"
              title={brandDisplay.businessName || undefined}
            >
              {brandDisplay.businessNameLabel}
            </h1>
            <p className="brand-powered-by">Powered by ONE</p>
          </div>
        </div>

        <nav className="nav-links" aria-label="Sidebar navigation">
          {visibleNavItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-link ${activeView === item.id ? 'active' : ''}`}
              onClick={() => handleActiveViewChange(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>
      ) : null}

      <main className={`main-panel${activeView === 'team' && teamSection === 'schedule' ? ' main-panel-schedule' : ''}${activeView === 'today' ? ' main-panel-dashboard' : ''}${activeView === 'floor-plan-builder' ? ' main-panel-floor-builder' : ''}${activeView === 'reservations' ? ' main-panel-reservations' : ''}`}>
        {(() => {
          const workspaceModules = (
            <>
        {isAuthLoading ? (
          <div className="staff-status-banner" role="status" aria-live="polite">
            Loading workspace…
          </div>
        ) : null}
        {!isAuthLoading && visibleWorkspaceLoadError ? (
          <div className="staff-status-banner auth-banner-error" role="alert">
            {visibleWorkspaceLoadError}
          </div>
        ) : null}
        {inviteAcceptedNotice ? (
          <div className="staff-status-banner auth-banner-success workspace-invite-notice" role="status">
            {inviteAcceptedNotice}
            <button
              type="button"
              className="ghost-btn small workspace-invite-notice-dismiss"
              onClick={() => setInviteAcceptedNotice('')}
            >
              Dismiss
            </button>
          </div>
        ) : null}
        {activeView === 'team' && isActiveViewAllowed ? (
          <ModuleSectionTabs
            sections={visibleTeamSections}
            activeSection={teamSection}
            onSectionChange={handleTeamSectionChange}
            ariaLabel="Team sections"
          />
        ) : null}

        {activeView === 'stock' && isActiveViewAllowed ? (
          <ModuleSectionTabs
            sections={STOCK_SECTIONS}
            activeSection={stockSection}
            onSectionChange={handleStockSectionChange}
            ariaLabel="Stock sections"
          />
        ) : null}

        {activeView === 'operations' && isActiveViewAllowed && !activeChecklistRunTemplateId && !useMobileExperience ? (
          <ModuleSectionTabs
            sections={visibleOperationsSections}
            activeSection={operationsSection}
            onSectionChange={handleOperationsSectionChange}
            ariaLabel="Operations sections"
          />
        ) : null}

        {!isAuthLoading && !isActiveViewAllowed && !isActiveViewPendingPermissionRedirect ? (
          <AccessRestrictedView
            moduleId={activeView}
            role={role}
            roleLabel={roleLabel}
            onGoDashboard={() => handleActiveViewChange('today')}
          />
        ) : null}

        {isActiveViewAllowed && activeView === 'today' ? (
          <CommandCenterView
            statusSummary={todayStatusSummary}
            timelineEvents={dashboardTimelineEvents}
            teamTodayGroups={enrichedTeamTodayGroups}
            teamTodayStatus={teamTodayStatus}
            attentionItems={todayAttentionItems}
            announcements={operationsAnnouncements}
            announcementRole={role}
            announcementEmployeeDepartment={currentEmployeeDepartment}
            isAnnouncementsSaving={isSavingOperations}
            isScheduleLoading={isDashboardScheduleLoading}
            now={localNow}
            todayKey={currentDateKey}
            onViewStock={canAccessModule(role, 'stock') ? handleDashboardViewStock : undefined}
            onViewSchedule={canAccessTeamSection(role, 'schedule') ? handleDashboardViewSchedule : undefined}
            onViewTasks={canAccessModule(role, 'operations') ? handleDashboardViewTasks : undefined}
            onViewReservations={canAccessModule(role, 'reservations') ? handleDashboardViewReservations : undefined}
            onAttentionItemClick={handleTodayAttentionItemClick}
            attentionPermissions={todayAttentionPermissions}
            onMarkAnnouncementSeen={handleMarkOperationsAnnouncementSeen}
          />
        ) : null}

        {isActiveViewAllowed && activeView === 'team' && teamSection === 'today' ? (
          <TeamTodayView
            teamStatus={teamTodayStatus}
            teamTodayGroups={enrichedTeamTodayGroups}
            isLoading={isDashboardScheduleLoading}
            noticeMessage={staffNotice}
          />
        ) : null}

        {isActiveViewAllowed && activeView === 'team' && teamSection === 'members' ? (
          <TeamPeopleView
            employees={filteredEmployees}
            rosterEmployees={employees}
            totalEmployeeCount={employees.length}
            employeeTodayStatusById={employeeTodayStatusById}
            isTodayStatusLoading={isDashboardScheduleLoading}
            searchTerm={searchTerm}
            onSearchTermChange={setSearchTerm}
            searchPlaceholder={moduleSearchPlaceholder}
            selectedEmployee={selectedEmployee}
            onSelectEmployee={setSelectedEmployee}
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
            onOpenAddEmployee={handleOpenAddEmployee}
            onOpenEditEmployee={handleOpenEditEmployee}
            onRequestDeleteEmployee={handleRequestDeleteEmployee}
            isLoading={isLoadingStaff}
            noticeMessage={staffNotice}
            isSaving={isSavingEmployee}
            workspaceId={activeWorkspaceId}
            canManageInvites={canManageEmployeeInvitesRole}
            canAssignManagerInviteRole={canAssignManagerInviteRoleFlag}
          />
        ) : null}

        {isActiveViewAllowed && activeView === 'team' ? (
          <div hidden={teamSection !== 'schedule'}>
            <ScheduleView
              shifts={canEditScheduleRole ? shifts : (publishedShifts ?? [])}
              scheduleCapacities={scheduleCapacities}
              employees={scheduleEmployees}
              positions={positions}
              shiftTemplates={shiftTemplates}
              weeklyTemplates={weeklyTemplates}
              onOpenAddShift={handleOpenAddShift}
              onOpenEditShift={handleOpenEditShift}
              onDeleteShift={handleDeleteShift}
              onCreateGridShift={handleCreateGridShift}
              onUpdateGridShift={handleUpdateGridShift}
              onUpdateAssignmentTime={handleUpdateAssignmentTime}
              onMoveGridShift={handleMoveGridShift}
              onCopyGridShift={handleCopyGridShift}
              onRemoveGridShift={handleRemoveGridShift}
              onCopyShiftToNextDay={handleCopyShiftToNextDay}
              onCopyShiftToRestOfWeek={handleCopyShiftToRestOfWeek}
              onCopyCellToNextDay={handleCopyCellToNextDay}
              onCopyCellToRestOfWeek={handleCopyCellToRestOfWeek}
              onSaveCurrentWeekTemplate={handleSaveCurrentWeekTemplate}
              onLoadWeeklyTemplate={handleLoadWeeklyTemplate}
              onRenameWeeklyTemplate={handleRenameWeeklyTemplate}
              onDeleteWeeklyTemplate={handleDeleteWeeklyTemplate}
              onUpdateCellCapacity={handleUpdateCellCapacity}
              onUpdateTemplateDefaultRequired={handleUpdateTemplateDefaultRequired}
              onApplyAreaToTemplate={handleApplyAreaToTemplate}
              onRenameShiftTemplate={handleRenameShiftTemplate}
              onEditShiftTemplate={handleEditShiftTemplate}
              onDuplicateShiftTemplate={handleDuplicateShiftTemplate}
              onDeleteShiftTemplate={handleDeleteShiftTemplate}
              onCopyHistoricalWeek={handleCopyHistoricalWeek}
              onCopyDay={handleCopyDay}
              onCopyWeek={handleCopyWeek}
              onClearDay={handleClearDay}
              onClearWeek={handleClearWeek}
              onClearGridCell={handleClearGridCell}
              onAutoFillWeekFromTemplate={handleAutoFillWeekFromTemplate}
              schedulePublication={schedulePublication}
              publishedShifts={publishedShifts}
              weekStartDate={scheduleWeekStart}
              onWeekStartDateChange={handleScheduleWeekStartChange}
              onPublishWeekSchedule={handlePublishWeekSchedule}
              onUnpublishWeekSchedule={handleUnpublishWeekSchedule}
              isLoading={isScheduleLoading}
              noticeMessage={scheduleNotice}
              canSaveTemplateDefault={!scheduleLegacyTemplateSchema}
              isSaving={isSavingShift}
              workspaceId={activeWorkspaceId}
              canEditSchedule={canEditScheduleRole}
              isMobileScheduleShell={
                useMobileExperience
                && Boolean(mobileExpandedView)
                && activeView === 'team'
                && teamSection === 'schedule'
              }
              isScheduleSectionActive={teamSection === 'schedule'}
              onExitSchedule={handleExitScheduleFocusMode}
            />
          </div>
        ) : null}

        {isActiveViewAllowed && activeView === 'reservations' ? (
          shouldRenderReservationsHostView ? (
            <MobileReservationsHostShell
              reservations={reservations}
              workspaceTimeZone={workspaceTimeZone}
              todayKey={currentDateKey}
              nowMinutes={hostNowMinutes}
              isLoading={isReservationsLoading}
              isSaving={isSavingReservation}
              noticeMessage={reservationNotice}
              onQuickStatusUpdate={handleQuickReservationStatus}
              onHostEditSave={handleHostEditSave}
              onHostEditDelete={handleHostEditDelete}
              onReservationNotice={setReservationNotice}
              onCreateReservation={handleMobileHostReservationCreate}
              onExitHostMode={isHostMobileRole(role) ? undefined : handleMobileExitReservationsHostMode}
              onAssignReservationTables={handleAssignReservationTables}
              canEditFloorPlan={canEditFloorPlanRole}
              canManageAssignment={canManageReservationsRole}
              reservationSeatings={reservationSeatings}
              workspaceId={activeWorkspaceId}
              useControlledReloadReturn={isHostMobileRole(role)}
            />
          ) : (
            <ReservationsView
              reservations={reservations}
              workspaceTimeZone={workspaceTimeZone}
              onOpenAddReservation={handleOpenAddReservation}
              onOpenQuickReservation={handleOpenQuickReservation}
              onOpenCommandPalette={handleOpenCommandPalette}
              isCommandPaletteOpen={isCommandPaletteOpen}
              onCloseCommandPalette={handleCloseCommandPalette}
              onOpenEditReservation={handleOpenEditReservation}
              onQuickStatusUpdate={handleQuickReservationStatus}
              onQuickNoteUpdate={handleQuickReservationNote}
              onTableReassign={handleQuickReservationTableReassign}
              onAssignReservationTables={handleAssignReservationTables}
              onHostEditSave={handleHostEditSave}
              onHostEditDelete={handleHostEditDelete}
              onReservationNotice={setReservationNotice}
              isLoading={isReservationsLoading}
              noticeMessage={reservationNotice}
              isSaving={isSavingReservation}
              reservationSeatings={reservationSeatings}
              onOpenHostMode={
                !isHostMobileRole(role) && useMobileExperience && canOpenReservationsHostMode(role)
                  ? handleMobileOpenReservationsHostMode
                  : undefined
              }
            />
          )
        ) : null}

        {isActiveViewAllowed && activeView === 'floor-plan-builder' ? (
          <div className="floor-plan-deprecated-notice">
            <p>Floor Plan Builder now lives inside Reservations.</p>
            <button type="button" className="primary-btn" onClick={() => handleActiveViewChange('reservations')}>
              Open Reservations
            </button>
          </div>
        ) : null}

        {isActiveViewAllowed && activeView === 'stock' && stockSection === 'dashboard' ? (
          <StockDashboardView
            stockItems={stockItems}
            stockOrders={stockOrders}
            isLoading={isStockItemsLoading}
            noticeMessage={stockItemsNotice}
            isSaving={isSavingStockItem}
            canManage={canManageStockRole}
            searchTerm={searchTerm}
            workspaceId={activeWorkspaceId}
            isWorkspaceReady={isStockWorkspaceReady}
            workspaceSetupMessage={stockWorkspaceSetupMessage}
            suppliers={suppliers}
            supplierPrefill={stockSupplierPrefill}
            onSupplierPrefillApplied={() => setStockSupplierPrefill('')}
            onOpenAddSupplier={handleOpenAddSupplierFromStock}
            onItemModalOpenChange={setIsStockItemModalOpen}
            onCreateItem={handleCreateStockItem}
            onUpdateItem={handleUpdateStockItem}
            onBulkUpdateItems={handleBulkUpdateStockItems}
            onImportStockItems={handleImportStockItems}
            onRecordMovement={handleRecordStockMovement}
            onCreateOrders={handleCreateStockOrders}
            onOpenOrders={handleOpenStockOrders}
            isSavingOrders={isSavingStockOrder}
          />
        ) : null}

        {isActiveViewAllowed && activeView === 'stock' && stockSection === 'orders' ? (
          <StockOrdersView
            orders={stockOrders}
            stockItems={stockItems}
            isLoading={isStockOrdersLoading}
            noticeMessage={stockOrdersNotice}
            searchTerm={searchTerm}
            canManage={canManageStockRole}
            isSaving={isSavingStockOrder}
            isWorkspaceReady={isStockWorkspaceReady}
            initialStatusFilter={stockOrdersFilterHint}
            onStatusFilterApplied={() => setStockOrdersFilterHint(null)}
            onCreateOrders={handleCreateStockOrders}
            onSaveDraft={handleSaveStockOrderDraft}
            onMarkSent={handleMarkStockOrderSent}
            onReceiveOrder={handleReceiveStockOrder}
            onCancelOrder={handleCancelStockOrder}
          />
        ) : null}

        {isActiveViewAllowed && activeView === 'stock' && stockSection === 'suppliers' ? (
          <StockSuppliersView
            suppliers={suppliers}
            stockItems={stockItems}
            stockOrders={stockOrders}
            inventoryItems={inventoryItems}
            isLoading={isSuppliersLoading || isStockItemsLoading || isStockOrdersLoading}
            noticeMessage={suppliersNotice}
            searchTerm={searchTerm}
            canManage={canManageStockRole}
            isSaving={isSavingSupplier}
            onCreateSupplier={handleStockCreateSupplier}
            onUpdateSupplier={handleStockUpdateSupplier}
            onDeleteSupplier={handleStockDeleteSupplier}
            onDeactivateSupplier={handleStockDeactivateSupplier}
          />
        ) : null}

        {isActiveViewAllowed && activeView === 'stock' && stockSection === 'inventory' ? (
          <InventoryView
            inventoryItems={inventoryItems}
            barRefills={barRefills}
            onOpenAddItem={handleOpenAddInventoryItem}
            onOpenEditItem={handleOpenEditInventoryItem}
            onRequestDeleteItem={handleRequestDeleteInventoryItem}
            isLoading={isInventoryLoading}
            noticeMessage={inventoryNotice}
            isSaving={isSavingInventoryItem}
            searchTerm={searchTerm}
            barRefillsLoading={isBarRefillsLoading}
            barRefillsNotice={barRefillsNotice}
            isSavingBarRefill={isSavingBarRefill}
            defaultRefillDate={currentDateKey}
            defaultCreatedBy={workspaceProfile.managerName}
            onCreateBarRefill={handleCreateBarRefill}
            onSaveBarRefillChanges={handleSaveBarRefillChanges}
            onRequestCompleteBarRefill={handleCompleteBarRefill}
            onCancelBarRefill={handleCancelBarRefill}
            canManage={canManageStockRole}
          />
        ) : null}

        {isActiveViewAllowed && activeView === 'insights' ? (
          <ReportsView
            todayKey={currentDateKey}
            weekStartDate={todayWeekStart}
            reservations={reservations}
            tasks={todayActionableTasks}
            inventoryItems={inventoryItems}
            stockItems={stockItems}
            stockOrders={stockOrders}
            barRefills={barRefills}
            suppliers={suppliers}
            schedule={reportsScheduleData}
            connections={reportsConnections}
            serviceSnapshot={dashboardServiceSnapshot}
            coverageBreakdown={scheduleAttentionCoverageBreakdown}
            attentionItems={todayAttentionItems}
            attentionPermissions={todayAttentionPermissions}
            isLoading={
              isReportsLoading
              || isReservationsLoading
              || isTasksLoading
              || isInventoryLoading
              || isBarRefillsLoading
              || isStockItemsLoading
              || isStockOrdersLoading
              || isDashboardScheduleLoading
              || isSuppliersLoading
            }
            onViewModule={handleInsightsViewModule}
            onAttentionItemClick={handleTodayAttentionItemClick}
          />
        ) : null}

        {isActiveViewAllowed && activeView === 'operations' && activeChecklistRunTemplateId ? (
          <OperationsChecklistExecutionView
            template={activeChecklistRunTemplate}
            tasks={operationsTasks}
            todayKey={currentDateKey}
            canComplete
            isSaving={isSavingOperations}
            onBack={() => setActiveChecklistRunTemplateId(null)}
            onToggleComplete={handleToggleChecklistExecutionTask}
          />
        ) : null}

        {isActiveViewAllowed && activeView === 'operations' && operationsSection === 'dashboard' && !activeChecklistRunTemplateId ? (
          <OperationsDashboardView
            tasks={operationsTasks}
            logs={operationsLogs}
            announcements={operationsAnnouncements}
            checklistTemplates={operationsChecklistTemplates}
            employees={scheduleEmployees}
            departmentPerformance={managerMobileDepartmentPerformance}
            todayKey={currentDateKey}
            isLoading={isOperationsLoading}
            noticeMessage={operationsNotice}
            canManage={canManageOperationsRole}
            canManageAnnouncements={canManageAnnouncementsRole}
            isSaving={isSavingOperations}
            isWorkspaceReady={isOperationsWorkspaceReady}
            workspaceSetupMessage={operationsWorkspaceSetupMessage}
            searchTerm={searchTerm}
            currentEmployeeId={currentTaskEmployeeId}
            role={role}
            employeeDepartment={currentEmployeeDepartment}
            isMobileLayout={useMobileExperience}
            onCreateTask={handleCreateOperationsTask}
            onUpdateTask={handleUpdateOperationsTask}
            onCompleteTask={handleCompleteOperationsTask}
            onReopenTask={handleReopenOperationsTask}
            onDeleteTask={handleDeleteOperationsTask}
            onCreateLog={handleCreateOperationsLog}
            onUpdateLog={handleUpdateOperationsLog}
            onDeleteLog={handleDeleteOperationsLog}
            onCreateAnnouncement={handleCreateOperationsAnnouncement}
            onUpdateAnnouncement={handleUpdateOperationsAnnouncement}
            onHideAnnouncement={handleHideOperationsAnnouncement}
            onPublishAnnouncement={handlePublishOperationsAnnouncement}
            onStartChecklist={handleStartOperationsChecklist}
            onOpenChecklistRun={setActiveChecklistRunTemplateId}
            focusTaskId={operationsFocusTaskId}
            onFocusTaskHandled={() => setOperationsFocusTaskId(null)}
          />
        ) : null}

        {isActiveViewAllowed && activeView === 'operations' && operationsSection === 'checklists' && !activeChecklistRunTemplateId ? (
          <OperationsChecklistsView
            templates={operationsChecklistTemplates}
            isLoading={isOperationsLoading}
            noticeMessage={operationsNotice}
            isSaving={isSavingOperations}
            isWorkspaceReady={isOperationsWorkspaceReady}
            workspaceSetupMessage={operationsWorkspaceSetupMessage}
            searchTerm={searchTerm}
            onCreateTemplate={handleCreateOperationsChecklistTemplate}
            onUpdateTemplate={handleUpdateOperationsChecklistTemplate}
            onDeleteTemplate={handleDeleteOperationsChecklistTemplate}
            onCreateItem={handleCreateOperationsChecklistItem}
            onUpdateItem={handleUpdateOperationsChecklistItem}
            onDeleteItem={handleDeleteOperationsChecklistItem}
            onSaveItemOrder={handleSaveOperationsChecklistItemOrder}
          />
        ) : null}

        {isActiveViewAllowed && activeView === 'operations' && operationsSection === 'tasks' ? (
          <TasksView
            tasks={todayActionableTasks}
            taskTemplates={taskTemplates}
            templateChecklistItemsByTemplateId={templateChecklistItemsByTemplateId}
            checklistItemsByTaskId={checklistItemsByTaskId}
            employees={scheduleEmployees}
            isLoading={isTasksLoading}
            isTemplatesLoading={isTaskTemplatesLoading}
            isSaving={isSavingTask}
            isSavingTemplate={isSavingTaskTemplate}
            isGeneratingTasks={isGeneratingTasksFromTemplates}
            errorMessage={tasksError}
            templatesErrorMessage={taskTemplatesError}
            noticeMessage={tasksNotice}
            templatesNoticeMessage={taskTemplatesNotice}
            onCreateTask={handleCreateTask}
            onUpdateTask={handleUpdateTask}
            onDeleteTask={handleDeleteTask}
            onCompleteTask={handleCompleteTask}
            onReopenTask={handleReopenTask}
            onCreateTemplate={handleCreateTaskTemplate}
            onUpdateTemplate={handleUpdateTaskTemplate}
            onDeleteTemplate={handleDeleteTaskTemplate}
            onGenerateToday={handleGenerateTasksFromTemplates}
            onToggleChecklistItem={handleToggleChecklistItem}
            onDeleteCustomDepartment={handleDeleteCustomDepartment}
            currentEmployeeId={currentTaskEmployeeId}
            currentEmployeeName={workspaceProfile.managerName}
            todayKey={currentDateKey}
            openCreateOnMount={openTasksCreateModal}
            onOpenCreateHandled={() => setOpenTasksCreateModal(false)}
            isMobileLayout={useMobileExperience}
            canManage={canManageOperationsRole}
          />
        ) : null}

        {isActiveViewAllowed && activeView === 'settings' ? (
          <WorkspaceView
            activeSection={settingsSection}
            onSectionChange={handleSettingsSectionChange}
            workspace={workspace}
            businessProfileProps={{
              workspaceProfile: workspaceProfileDraft,
              noticeMessage: workspaceProfileNotice,
              isLoading: isWorkspaceProfileLoading,
              isSaving: isSavingWorkspaceProfile,
              isDirty: isWorkspaceProfileDirty,
              onChange: setWorkspaceProfileDraft,
              onSubmit: handleWorkspaceProfileSubmit,
              onLogoFileChange: handleWorkspaceLogoFileChange,
              onClearLogo: handleClearWorkspaceLogo,
            }}
            positionsProps={{
              positions,
              isLoading: isPositionsLoading,
              noticeMessage: positionsNotice,
              form: positionForm,
              isSaving: isSavingPosition,
              editingPositionId,
              onFormChange: setPositionForm,
              onSubmit: handlePositionSubmit,
              onStartEdit: handleStartEditPosition,
              onCancelEdit: handleCancelEditPosition,
              onRequestDelete: handleRequestDeletePosition,
              onMovePosition: handleMovePosition,
              getUsageCount: getPositionUsageCount,
            }}
            venueSetupProps={workspaceVenueSetupProps}
            reservationSeatingsProps={canConfigureReservationSeatingsRole ? {
              seatings: reservationSeatings,
              isLoading: isReservationSeatingsLoading,
              noticeMessage: reservationSeatingsNotice,
              form: reservationSeatingForm,
              isSaving: isSavingReservationSeating,
              editingSeatingId: editingReservationSeatingId,
              onFormChange: setReservationSeatingForm,
              onSubmit: handleReservationSeatingSubmit,
              onStartEdit: handleStartEditReservationSeating,
              onCancelEdit: handleCancelEditReservationSeating,
              onRequestDelete: handleRequestDeleteReservationSeating,
              onMoveSeating: handleMoveReservationSeating,
              onToggleActive: handleToggleReservationSeatingActive,
            } : {
              seatings: [],
              isLoading: false,
              noticeMessage: 'Only owners, general managers, and managers can configure reservation seatings.',
              form: createDefaultSeatingForm(),
              isSaving: false,
              editingSeatingId: null,
              onFormChange: () => {},
              onSubmit: (event) => event.preventDefault(),
              onStartEdit: () => {},
              onCancelEdit: () => {},
              onRequestDelete: () => {},
              onMoveSeating: () => {},
              onToggleActive: () => {},
            }}
            teamProps={{
              employees,
              managerName: workspaceProfile.managerName,
              onManageStaff: () => {
                handleActiveViewChange('team')
                handleTeamSectionChange('members')
              },
            }}
            systemProps={{
              moduleConnections: workspaceModuleConnections,
            }}
          />
        ) : null}
            </>
          )

          return (
            <>
              {useDedicatedShell ? (
                (() => {
                  if (isAuthLoading) {
                    return (
                      <div className="auth-page auth-loading-page mobile-auth-loading" aria-busy="true" aria-live="polite">
                        <div className="auth-loading-card panel staff-panel">
                          <p className="auth-brand">ONE</p>
                          <p className="auth-loading-text">Loading workspace…</p>
                        </div>
                      </div>
                    )
                  }

                  const isManagerMobileShell = !isAuthLoading && isManagementMobileRole(role)
                  const isHostMobileShellLocal = !isAuthLoading && isHostMobileRole(role)
                  const mobileHomeProps = isManagerMobileShell
                    ? {
                      venueName: workspaceProfile.businessName,
                      greeting: mobileGreeting,
                      dateLabel: currentDateLabel,
                      roleLabel,
                      statusSummary: todayStatusSummary,
                      attentionItems: todayAttentionItems,
                      stockSummary: managerMobileStockSummary,
                      stockOrdersSummary: managerMobileOrdersSummary,
                      hasStockModuleData: stockItems.length > 0,
                      isReservationsConnected: isReservationsModuleConnected,
                      isTasksConnected: isTasksModuleConnected,
                      canOpenStock: canAccessMobileExpandedModule(role, 'stock'),
                      canReceiveDeliveries: canAccessMobileExpandedModule(role, 'stock'),
                      canOpenTasks: canAccessMobileExpandedModule(role, 'operations'),
                      canOpenTeam: canAccessMobileExpandedModule(role, 'team'),
                      canOpenReservations: canAccessMobileExpandedModule(role, 'reservations'),
                      announcements: operationsAnnouncements,
                      announcementRole: role,
                      announcementEmployeeDepartment: currentEmployeeDepartment,
                      isAnnouncementsSaving: isSavingOperations,
                      onMarkAnnouncementSeen: handleMarkOperationsAnnouncementSeen,
                      onOpenStock: handleMobileManagerOpenStock,
                      onReceiveDeliveries: handleMobileManagerReceiveDeliveries,
                      onOpenTasks: handleMobileManagerOpenTasks,
                      onOpenTeamToday: handleMobileManagerOpenTeamToday,
                      onOpenReservations: handleMobileManagerOpenReservations,
                      onAttentionItemClick: handleTodayAttentionItemClick,
                      attentionPermissions: todayAttentionPermissions,
                    }
                    : {
                      venueName: workspaceProfile.businessName,
                      greeting: mobileGreeting,
                      dateLabel: currentDateLabel,
                      shiftSummary: mobileShiftSummary,
                      tasksSummary: mobileTaskOverview,
                      needsEmployeeLink: mobileNeedsEmployeeLink,
                      announcements: operationsAnnouncements,
                      announcementRole: role,
                      announcementEmployeeDepartment: currentEmployeeDepartment,
                      isAnnouncementsSaving: isSavingOperations,
                      onMarkAnnouncementSeen: handleMarkOperationsAnnouncementSeen,
                    }

                  const sharedMenuProps = {
                    role,
                    roleLabel,
                    profileName: resolvedUserDisplayName,
                    venueName: workspaceProfile.businessName,
                    screen: mobileMenuScreen,
                    onOpenProfile: handleMobileOpenProfile,
                    onBackFromProfile: handleMobileBackFromProfile,
                    profileProps: {
                      displayName: `${membership?.displayName ?? ''}`.trim() || resolvedUserDisplayName,
                      email: `${membership?.email ?? user?.email ?? ''}`.trim(),
                      phone: mobileProfilePhone,
                      roleLabel,
                      venueName: `${workspace?.name ?? workspaceProfile.businessName ?? ''}`.trim(),
                      linkedEmployeeName: `${mobileLinkedEmployee?.name ?? ''}`.trim(),
                      canEditPhone: Boolean(membership?.employeeId),
                      isSaving: isSavingMobileProfile,
                      errorMessage: mobileProfileError,
                      onSave: handleMobileProfileSave,
                    },
                    onNavigateModule: handleMobileNavigateModule,
                    onOpenFullSchedule: handleMobileOpenFullSchedule,
                    onOpenSettings: handleMobileOpenSettings,
                    onSignOut: handleMobileSignOut,
                    menuVariant: isManagerMobileShell ? 'manager' : isHostMobileShellLocal ? 'host' : 'staff',
                  }

                  const hostStationContent = (
                    <MobileReservationsHostShell
                      reservations={reservations}
                      workspaceTimeZone={workspaceTimeZone}
                      todayKey={currentDateKey}
                      nowMinutes={hostNowMinutes}
                      isLoading={isReservationsLoading}
                      isSaving={isSavingReservation}
                      noticeMessage={reservationNotice}
                      onQuickStatusUpdate={handleQuickReservationStatus}
                      onHostEditSave={handleHostEditSave}
                      onHostEditDelete={handleHostEditDelete}
                      onReservationNotice={setReservationNotice}
                      onCreateReservation={handleMobileHostReservationCreate}
                      onExitHostMode={undefined}
                      onAssignReservationTables={handleAssignReservationTables}
                      canEditFloorPlan={canEditFloorPlanRole}
                      reservationSeatings={reservationSeatings}
                      workspaceId={activeWorkspaceId}
                      useControlledReloadReturn
                      hostSettingsProps={{
                        profile: {
                          name: resolvedUserDisplayName,
                          email: user?.email ?? '',
                          phone: mobileProfilePhone,
                        },
                        workspaceProfile,
                        membership,
                        onSignOut: handleMobileSignOut,
                      }}
                    />
                  )

                  if (isManagerMobileShell) {
                    return (
                      <MobileManagerApp
                        activeTab={activeMobileTab}
                        onTabChange={handleMobileTabChange}
                        noticeMessage={mobileNotice}
                        onDismissNotice={() => setMobileNotice('')}
                        homeProps={mobileHomeProps}
                        stockProps={{
                          stockItems,
                          stockSummary: managerMobileStockSummary,
                          stockOrdersSummary: managerMobileOrdersSummary,
                          isLoading: isManagerMobileStockLoading,
                          canManageStock: canManageStockRole,
                          isWorkspaceReady: isStockWorkspaceReady,
                          isSavingOrders: isSavingStockOrder,
                          onCreateOrders: handleCreateStockOrders,
                          onCountStock: handleMobileManagerCountStock,
                          onOpenOrders: handleMobileManagerOpenStockOrders,
                          onReceiveDeliveries: handleMobileManagerReceiveDeliveries,
                        }}
                        managerTasksProps={{
                          tasks: managerMobileOperationsTasks,
                          taskOverview: managerMobileTaskOverview,
                          employees: scheduleEmployees,
                          checklistTemplates: operationsChecklistTemplates,
                          operationsLogs,
                          todayKey: currentDateKey,
                          isLoading: isManagerMobileTasksLoading,
                          isSaving: isSavingOperations,
                          onCreateTask: canManageOperationsRole ? handleCreateOperationsTask : undefined,
                          onCompleteTask: canManageOperationsRole ? handleCompleteOperationsTask : undefined,
                          onOpenChecklist: canAccessMobileExpandedModule(role, 'operations')
                            ? handleMobileManagerOpenChecklist
                            : undefined,
                        }}
                        menuProps={sharedMenuProps}
                        expandedView={mobileExpandedView}
                        expandedTitle={mobileExpandedTitle}
                        onBackFromExpanded={handleMobileBack}
                        expandedModuleContent={mobileExpandedView ? workspaceModules : null}
                        isReservationsHostMode={shouldRenderReservationsHostView && activeView === 'reservations'}
                        bottomTabs={mobileBottomTabs}
                      />
                    )
                  }

                  if (isHostMobileShellLocal) {
                    return (
                      <MobileStaffApp
                        shellVariant="host"
                        hostStationContent={hostStationContent}
                        activeTab={activeMobileTab}
                        onTabChange={handleMobileTabChange}
                        noticeMessage={mobileNotice}
                        onDismissNotice={() => setMobileNotice('')}
                        scheduleProps={{
                          weekLabel: mobileScheduleWeekLabel,
                          employeeName: mobileScheduleDisplay.employeeName,
                          days: mobileScheduleDisplay.days,
                          needsEmployeeLink: mobileNeedsEmployeeLink,
                          isWeekPublished: mobileScheduleDisplay.isWeekPublished,
                          isWeekUpdating: isMobileWeekLoading,
                          isViewingCurrentWeek: mobileWeekStart === todayWeekStart,
                          canOpenFullSchedule: canOpenMobileFullSchedule(role),
                          onOpenFullSchedule: handleMobileOpenFullSchedule,
                          onPreviousWeek: handleMobilePreviousWeek,
                          onGoToCurrentWeek: handleMobileGoToCurrentWeek,
                          onNextWeek: handleMobileNextWeek,
                        }}
                        tasksProps={{
                          taskGroups: mobileTaskGroups,
                          employees: scheduleEmployees,
                          currentEmployeeId: mobileEmployeeId,
                          todayKey: currentDateKey,
                          needsEmployeeLink: mobileNeedsEmployeeLink,
                          isLoading: isMobileOperationsTasksLoading,
                          isSaving: isSavingOperations,
                          onCompleteTask: handleCompleteOperationsTask,
                          onOpenTasksWorkspace: undefined,
                        }}
                        menuProps={sharedMenuProps}
                        expandedView={mobileExpandedView}
                        expandedTitle={mobileExpandedTitle}
                        onBackFromExpanded={handleMobileBack}
                        expandedModuleContent={mobileExpandedView ? workspaceModules : null}
                        bottomTabs={mobileBottomTabs}
                      />
                    )
                  }

                  return (
                    <MobileStaffApp
                      activeTab={activeMobileTab}
                      onTabChange={handleMobileTabChange}
                      noticeMessage={mobileNotice}
                      onDismissNotice={() => setMobileNotice('')}
                      homeProps={mobileHomeProps}
                      scheduleProps={{
                        weekLabel: mobileScheduleWeekLabel,
                        employeeName: mobileScheduleDisplay.employeeName,
                        days: mobileScheduleDisplay.days,
                        needsEmployeeLink: mobileNeedsEmployeeLink,
                        isWeekPublished: mobileScheduleDisplay.isWeekPublished,
                        isWeekUpdating: isMobileWeekLoading,
                        isViewingCurrentWeek: mobileWeekStart === todayWeekStart,
                        canOpenFullSchedule: canOpenMobileFullSchedule(role),
                        onOpenFullSchedule: handleMobileOpenFullSchedule,
                        onPreviousWeek: handleMobilePreviousWeek,
                        onGoToCurrentWeek: handleMobileGoToCurrentWeek,
                        onNextWeek: handleMobileNextWeek,
                      }}
                      tasksProps={{
                        taskGroups: mobileTaskGroups,
                        employees: scheduleEmployees,
                        currentEmployeeId: mobileEmployeeId,
                        todayKey: currentDateKey,
                        needsEmployeeLink: mobileNeedsEmployeeLink,
                        isLoading: isMobileOperationsTasksLoading,
                        isSaving: isSavingOperations,
                        onCompleteTask: handleCompleteOperationsTask,
                        onOpenTasksWorkspace: canOpenMobileTasksWorkspace(role)
                          ? handleMobileOpenTasksWorkspace
                          : undefined,
                      }}
                      menuProps={sharedMenuProps}
                      expandedView={mobileExpandedView}
                      expandedTitle={mobileExpandedTitle}
                      onBackFromExpanded={handleMobileBack}
                      expandedModuleContent={mobileExpandedView ? workspaceModules : null}
                      bottomTabs={mobileBottomTabs}
                    />
                  )
                })()
              ) : null}
              {!useDedicatedShell ? (
                <>
                  {!hideStandardTopbar ? (
                  useCommandTopbar ? (
                  <TodayCommandHeader
                    greeting={mobileGreeting}
                    executiveMessage={todayExecutiveMessage}
                    businessName={brandDisplay.businessName}
                    dateLabel={dashboardHeroDateLabel}
                    workspaceBadge={todayWorkspaceBadge}
                    chips={todayCommandHeaderChips}
                    quickActions={permittedTodayQuickActions}
                    profileChipDisplay={profileChipDisplay}
                    employees={scheduleEmployees}
                    onQuickAction={handleDashboardQuickAction}
                    onOpenWorkspaceProfile={handleOpenWorkspaceProfile}
                    canOpenWorkspaceProfile={canOpenWorkspaceProfile}
                  />
                  ) : (
                  <header className="topbar">
                    <div className="topbar-title-block">
                      <h2>{moduleTitle}</h2>
                      {moduleSubtitle ? (
                        <p className="welcome-subtitle">{moduleSubtitle}</p>
                      ) : null}
                    </div>
                    <div className="topbar-meta">
                      {showModuleSearch ? (
                      <label className="search-bar" aria-label={`Search ${moduleTitle}`}>
                        <span>⌕</span>
                        <input
                          type="text"
                          placeholder={moduleSearchPlaceholder}
                          value={searchTerm}
                          onChange={(event) => setSearchTerm(event.target.value)}
                        />
                      </label>
                      ) : null}
                      <button type="button" className="icon-btn" aria-label="Notifications">🔔</button>
                      <div className="date-pill">{currentDateLabel}</div>
                      <UserMenu
                        profileChipDisplay={profileChipDisplay}
                        employees={scheduleEmployees}
                        onOpenWorkspaceProfile={handleOpenWorkspaceProfile}
                        canOpenWorkspaceProfile={canOpenWorkspaceProfile}
                      />
                    </div>
                  </header>
                  )
                  ) : null}
                  {workspaceModules}
                </>
              ) : null}
            </>
          )
        })()}

        {isEmployeeModalOpen ? (
          <div className="employee-modal-backdrop employee-premium-form-backdrop" onClick={handleCloseEmployeeModal}>
            <div ref={employeePremiumFormModalRef} className="employee-modal employee-premium-form-modal" onClick={(event) => event.stopPropagation()}>
              <div className="drawer-header employee-premium-form-header">
                <div>
                  <p className="eyebrow">Employee</p>
                  <h3>{editingEmployee ? 'Edit employee' : 'Add employee'}</h3>
                </div>
                <button type="button" className="icon-btn employee-premium-form-close" onClick={handleCloseEmployeeModal} aria-label="Close employee form">✕</button>
              </div>

              <form className="employee-form employee-premium-form" onSubmit={handleEmployeeSubmit} onKeyDownCapture={handleEmployeeFormEnterKey}>
                <section className="employee-premium-form-section">
                  <h4 className="employee-premium-form-section-title">Basic Information</h4>
                  <div className="employee-premium-form-grid">
                    <label className="form-field">
                      <span>First Name</span>
                      <input
                        value={employeeForm.firstName}
                        onChange={(event) => setEmployeeForm((current) => ({ ...current, firstName: event.target.value }))}
                        placeholder="First name"
                        required
                      />
                    </label>
                    <label className="form-field">
                      <span>Last Name</span>
                      <input
                        value={employeeForm.lastName}
                        onChange={(event) => setEmployeeForm((current) => ({ ...current, lastName: event.target.value }))}
                        placeholder="Last name"
                      />
                    </label>
                    <label className="form-field">
                      <span>Department</span>
                      <EmployeePremiumFieldSelect
                        id="employee-form-department"
                        ariaLabel="Department"
                        menuId="employee-department"
                        openMenuId={employeeFormOpenMenuId}
                        setOpenMenuId={setEmployeeFormOpenMenuId}
                        value={employeeForm.department}
                        options={employeeCatalogDepartmentOptions}
                        valuesMatch={employeeDepartmentOptionValuesMatch}
                        onChange={(department) => setEmployeeForm((current) => ({ ...current, department }))}
                      />
                    </label>
                    <label className="form-field">
                      <span>Primary Position</span>
                      <EmployeePremiumPositionField
                        id="employee-form-primary-position"
                        menuId="employee-primary-position"
                        openMenuId={employeeFormOpenMenuId}
                        setOpenMenuId={setEmployeeFormOpenMenuId}
                        value={employeeForm.primaryPosition}
                        options={employeeCatalogPrimaryPositionOptions}
                        valuesMatch={employeePositionOptionValuesMatch}
                        onChange={(nextPrimary) => setEmployeeForm((current) => ({
                          ...current,
                          primaryPosition: nextPrimary,
                          additionalPositions: current.additionalPositions.filter((name) => name.toLowerCase() !== `${nextPrimary}`.trim().toLowerCase()),
                        }))}
                      />
                      {employeePrimaryPositionDepartmentMismatch ? (
                        <small className="employee-premium-field-warning" role="status">
                          This position belongs to another department.
                        </small>
                      ) : null}
                    </label>
                  </div>
                </section>

                <section className="employee-premium-form-section">
                  <h4 className="employee-premium-form-section-title">Employment</h4>
                  <div className="employee-premium-form-grid">
                    <label className="form-field">
                      <span>Start Date</span>
                      <EmployeePremiumDateField
                        id="employee-form-start-date"
                        value={employeeForm.hireDate}
                        onChange={(hireDate) => setEmployeeForm((current) => ({ ...current, hireDate }))}
                        todayKey={currentDateKey}
                      />
                    </label>
                    <label className="form-field">
                      <span>Weekly Hours</span>
                      <input value={employeeForm.weeklyHours} onChange={(event) => setEmployeeForm((current) => ({ ...current, weeklyHours: event.target.value }))} placeholder="Weekly hours" />
                    </label>
                    <label className="form-field">
                      <span>Salary</span>
                      <input value={employeeForm.salary} onChange={(event) => setEmployeeForm((current) => ({ ...current, salary: event.target.value }))} placeholder="Salary" />
                    </label>
                    <label className="form-field">
                      <span>Shift</span>
                      <EmployeePremiumFieldSelect
                        id="employee-form-shift"
                        ariaLabel="Shift"
                        menuId="employee-shift"
                        openMenuId={employeeFormOpenMenuId}
                        setOpenMenuId={setEmployeeFormOpenMenuId}
                        value={employeeForm.shift}
                        options={EMPLOYEE_SHIFT_OPTIONS}
                        onChange={(shift) => setEmployeeForm((current) => ({ ...current, shift }))}
                      />
                    </label>
                    <label className="form-field">
                      <span>Status</span>
                      <EmployeePremiumFieldSelect
                        id="employee-form-status"
                        ariaLabel="Status"
                        menuId="employee-status"
                        openMenuId={employeeFormOpenMenuId}
                        setOpenMenuId={setEmployeeFormOpenMenuId}
                        value={employeeForm.status}
                        options={EMPLOYEE_STATUS_OPTIONS}
                        onChange={(status) => setEmployeeForm((current) => ({ ...current, status }))}
                      />
                    </label>
                  </div>
                </section>

                <section className="employee-premium-form-section">
                  <h4 className="employee-premium-form-section-title">Contact</h4>
                  <div className="employee-premium-form-grid">
                    <label className="form-field">
                      <span>Phone</span>
                      <div
                        className="employee-premium-phone-field-wrap"
                        onPointerDownCapture={() => setEmployeeFormOpenMenuId(null)}
                      >
                        <ReservationPhoneField
                          className="reservation-phone-field employee-premium-phone-field"
                          value={normalizeEmployeePhoneForDisplay(employeeForm.phone)}
                          onChange={(phone) => setEmployeeForm((current) => ({ ...current, phone }))}
                          placeholder="Local number"
                        />
                      </div>
                    </label>
                    <label className="form-field">
                      <span>Email</span>
                      <input type="email" value={employeeForm.email} onChange={(event) => setEmployeeForm((current) => ({ ...current, email: event.target.value }))} placeholder="Email" />
                    </label>
                    <label className="form-field full-width">
                      <span>Emergency Contact</span>
                      <input value={employeeForm.emergencyContact} onChange={(event) => setEmployeeForm((current) => ({ ...current, emergencyContact: event.target.value }))} placeholder="Emergency contact" />
                    </label>
                  </div>
                </section>

                <section className="employee-premium-form-section">
                  <h4 className="employee-premium-form-section-title">Additional Positions</h4>
                  <label className="form-field full-width">
                    <span className="sr-only">Additional positions</span>
                    <EmployeePremiumAdditionalPositionsField
                      id="employee-form-additional-positions"
                      menuId="employee-additional-positions"
                      openMenuId={employeeFormOpenMenuId}
                      setOpenMenuId={setEmployeeFormOpenMenuId}
                      value={employeeForm.additionalPositions}
                      groups={employeeAdditionalPositionGroups}
                      primaryPosition={employeeForm.primaryPosition}
                      onChange={handleEmployeeAdditionalPositionsChange}
                      onConfirmRemoveCustomPosition={handleConfirmRemoveCustomPosition}
                    />
                  </label>

                  <div className="employee-premium-custom-position-panel">
                    <div className="employee-premium-custom-position-panel-header">
                      <span className="employee-premium-custom-position-panel-icon" aria-hidden="true">✦</span>
                      <div>
                        <h5 className="employee-premium-custom-position-panel-title">Create Custom Position</h5>
                        <p className="employee-premium-custom-position-panel-helper">
                          Add a workspace-specific role that is not in the standard catalog.
                        </p>
                      </div>
                    </div>
                    <div className="employee-premium-custom-position-panel-controls">
                      <label className="form-field employee-premium-custom-position-input-field">
                        <span className="sr-only">Custom position name</span>
                        <input
                          className="employee-premium-custom-position-input"
                          value={employeeForm.customPositionName}
                          onChange={(event) => setEmployeeForm((current) => ({ ...current, customPositionName: event.target.value }))}
                          onKeyDown={(event) => {
                            if (event.key !== 'Enter') return
                            event.preventDefault()
                            if (`${employeeForm.customPositionName ?? ''}`.trim() && !isCreatingEmployeeCustomPosition) {
                              handleAddCustomPositionToEmployee()
                            }
                          }}
                          placeholder="e.g. Sommelier, VIP Host, Pizza Chef"
                          autoComplete="off"
                          enterKeyHint="done"
                        />
                      </label>
                      <button
                        type="button"
                        className="primary-btn employee-premium-custom-position-create-btn"
                        onClick={handleAddCustomPositionToEmployee}
                        disabled={!`${employeeForm.customPositionName ?? ''}`.trim() || isCreatingEmployeeCustomPosition}
                      >
                        {isCreatingEmployeeCustomPosition ? 'Creating…' : '+ Create Position'}
                      </button>
                    </div>
                  </div>
                </section>

                <section className="employee-premium-form-section">
                  <h4 className="employee-premium-form-section-title">Manager Notes</h4>
                  <label className="form-field full-width">
                    <span className="sr-only">Manager notes</span>
                    <textarea
                      className="employee-premium-notes-input"
                      rows="6"
                      value={employeeForm.notes}
                      onChange={(event) => setEmployeeForm((current) => ({ ...current, notes: event.target.value }))}
                      placeholder="Notes for managers about this employee"
                    />
                  </label>
                </section>

                {saveError ? <div className="staff-status-banner">{saveError}</div> : null}

                <div className="modal-actions employee-premium-form-actions">
                  <button type="button" className="ghost-btn employee-premium-form-cancel-btn" onClick={handleCloseEmployeeModal}>Cancel</button>
                  <button type="submit" className="primary-btn employee-premium-form-save-btn" disabled={isSavingEmployee}>
                    {isSavingEmployee ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {isShiftOverlapConfirmOpen ? (
          <div className="employee-modal-backdrop" onClick={() => resolveShiftOverlapConfirmation(false)}>
            <div className="employee-modal blend-compact-modal" onClick={(event) => event.stopPropagation()}>
              <div className="drawer-header">
                <div>
                  <p className="eyebrow">Schedule overlap</p>
                  <h3>Employee already works another shift at this time</h3>
                </div>
                <button type="button" className="icon-btn" onClick={() => resolveShiftOverlapConfirmation(false)}>✕</button>
              </div>

              <p className="staff-subtitle">Add anyway?</p>

              <div className="modal-actions">
                <button type="button" className="ghost-btn" onClick={() => resolveShiftOverlapConfirmation(false)}>Cancel</button>
                <button type="button" className="primary-btn" onClick={() => resolveShiftOverlapConfirmation(true)}>Add Anyway</button>
              </div>
            </div>
          </div>
        ) : null}

        {isShiftModalOpen ? (
          <div className="employee-modal-backdrop" onClick={handleCloseShiftModal}>
            <div className="employee-modal schedule-compact-modal" onClick={(event) => event.stopPropagation()}>
              <div className="drawer-header schedule-compact-modal-header">
                <h3>{editingShift ? 'Edit shift' : 'Add shift'}</h3>
                <button type="button" className="icon-btn" onClick={handleCloseShiftModal} aria-label="Close">✕</button>
              </div>

              <form className="employee-form schedule-shift-form" onSubmit={handleShiftSubmit}>
                <div className="form-grid schedule-shift-form-grid">
                  <label className="form-field">
                    <span>Employee</span>
                    <select
                      value={formData.employee_id}
                      onChange={(event) => {
                        const nextEmployeeId = event.target.value
                        const nextEmployee = scheduleEmployees.find((employee) => String(employee.id) === nextEmployeeId)
                        const nextRoles = Array.isArray(nextEmployee?.positions) && nextEmployee.positions.length > 0
                          ? nextEmployee.positions.map((position) => position.name).filter(Boolean)
                          : `${nextEmployee?.position ?? ''}`
                            .split(',')
                            .map((name) => name.trim())
                            .filter(Boolean)

                        setFormData((prev) => ({
                          ...prev,
                          employee_id: nextEmployeeId,
                          role: nextRoles[0] ?? prev.role,
                        }))
                      }}
                    >
                      <option value="">Select employee</option>
                      {employeeOptions.map((employee) => (
                        <option key={employee.id} value={String(employee.id)}>
                          {employee.full_name || employee.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="form-field">
                    <span>Date</span>
                    <input type="date" value={formData.shift_date} onChange={(event) => setFormData((current) => ({ ...current, shift_date: event.target.value }))} />
                  </label>
                  <div className="template-field-row schedule-shift-template-row">
                    <label className="form-field">
                      <span>Template</span>
                      <select value={formData.shift_template} onChange={(event) => handleSelectShiftTemplate(event.target.value)}>
                        <option value="custom">Custom</option>
                        {shiftTemplates.length === 0 ? (
                          <option value="" disabled>No custom templates yet</option>
                        ) : null}
                        {shiftTemplates.map((template) => (
                          <option key={template.id} value={template.id}>{template.name}</option>
                        ))}
                      </select>
                    </label>
                    <button type="button" className="ghost-btn schedule-shift-manage-templates-btn" onClick={handleOpenTemplateModal}>Templates</button>
                  </div>
                  <div className="form-field schedule-shift-time-row full-width">
                    <span>Time</span>
                    <div className="schedule-shift-time-fields">
                      <TimeSelect
                        value={formData.start_time}
                        onChange={(time) => setFormData((current) => ({
                          ...current,
                          shift_template: 'custom',
                          start_time: time,
                        }))}
                        required
                      />
                      <span className="schedule-shift-time-separator" aria-hidden="true">–</span>
                      <TimeSelect
                        value={formData.end_time}
                        onChange={(time) => setFormData((current) => ({
                          ...current,
                          shift_template: 'custom',
                          end_time: time,
                        }))}
                        required
                      />
                    </div>
                    {shiftFormDurationLabel ? (
                      <span className="schedule-shift-duration-hint">
                        {shiftFormDurationLabel}
                        {shiftFormIsOvernight ? ' · overnight' : ''}
                      </span>
                    ) : null}
                  </div>
                  <label className="form-field">
                    <span>Position</span>
                    <select value={formData.role} onChange={(event) => setFormData((current) => ({ ...current, role: event.target.value }))}>
                      <option value="">Select position</option>
                      {selectedShiftEmployeePositionOptions.map((name) => (
                        <option key={`shift-role-${name}`} value={name}>{name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="form-field">
                    <span>Area</span>
                    <select value={formData.area_option} onChange={(event) => setFormData((current) => ({ ...current, area_option: event.target.value }))}>
                      {scheduleAreaOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                  {formData.area_option === 'Other' ? (
                    <label className="form-field full-width">
                      <span>Custom area</span>
                      <input
                        value={formData.area_custom}
                        onChange={(event) => setFormData((current) => ({ ...current, area_custom: event.target.value }))}
                        placeholder="Enter custom area"
                      />
                    </label>
                  ) : null}
                  <label className="form-field full-width">
                    <span>Status</span>
                    <select value={formData.status} onChange={(event) => setFormData((current) => ({ ...current, status: event.target.value }))}>
                      <option value="Scheduled">Scheduled</option>
                      <option value="Confirmed">Confirmed</option>
                      <option value="Pending">Pending</option>
                      <option value="Completed">Completed</option>
                    </select>
                  </label>
                </div>

                <details className="schedule-shift-notes-details">
                  <summary>Notes (optional)</summary>
                  <label className="form-field full-width">
                    <textarea rows="2" value={formData.notes} onChange={(event) => setFormData((current) => ({ ...current, notes: event.target.value }))} placeholder="Add notes" />
                  </label>
                </details>

                <div className="modal-actions schedule-compact-modal-actions">
                  <button type="button" className="ghost-btn" onClick={handleCloseShiftModal}>Cancel</button>
                  <button type="submit" className="primary-btn" disabled={isSavingShift}>
                    {isSavingShift ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {isTemplateModalOpen ? (
          <div className="employee-modal-backdrop" onClick={handleCloseTemplateModal}>
            <div className="employee-modal schedule-compact-modal schedule-template-modal" onClick={(event) => event.stopPropagation()}>
              <div className="drawer-header schedule-compact-modal-header">
                <h3>Manage templates</h3>
                <button type="button" className="icon-btn" onClick={handleCloseTemplateModal} aria-label="Close">✕</button>
              </div>

              <div className="template-list schedule-template-list">
                {customShiftTemplates.length === 0 ? (
                  <p className="roster-empty-department">No custom templates yet.</p>
                ) : (
                  customShiftTemplates.map((template) => {
                    const isTemplateRowDragging = draggedShiftTemplateId === String(template.id)
                    const isTemplateReorderDisabled = isReorderingTemplates || isSavingTemplate || isDeletingTemplate

                    return (
                    <article
                      key={template.id}
                      data-shift-template-row={template.id}
                      className={`template-item schedule-template-list-item${isTemplateRowDragging ? ' is-dragging' : ''}`}
                      onDragOver={handleShiftTemplateDragOver}
                      onDrop={(event) => handleShiftTemplateDrop(event, template)}
                    >
                      <button
                        type="button"
                        className="schedule-template-drag-handle"
                        draggable={!isTemplateReorderDisabled}
                        onDragStart={(event) => handleShiftTemplateDragStart(event, template.id)}
                        onDragEnd={handleShiftTemplateDragEnd}
                        onPointerDown={(event) => handleShiftTemplateReorderPointerDown(event, template)}
                        onPointerMove={handleShiftTemplateReorderPointerMove}
                        onPointerUp={handleShiftTemplateReorderPointerUp}
                        onPointerCancel={handleShiftTemplateReorderPointerUp}
                        aria-label={`Reorder ${template.name}`}
                        disabled={isTemplateReorderDisabled}
                      >
                        ☰
                      </button>
                      <div className="schedule-template-list-main">
                        <strong>{template.name}</strong>
                        <p>{formatTimeRange24(template.startTime, template.endTime, ' - ')} · {template.defaultArea || 'No area'} · Staff {getTemplateDefaultRequiredCount(template)}</p>
                      </div>
                      <div className="action-group schedule-template-list-actions">
                        <button type="button" className="ghost-btn small" onClick={() => handleEditTemplate(template)} disabled={isReorderingTemplates}>Edit</button>
                        <button type="button" className="ghost-btn small" onClick={() => handleDeleteTemplate(template)} disabled={isDeletingTemplate || isReorderingTemplates}>
                          {isDeletingTemplate ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                    </article>
                    )
                  })
                )}
              </div>

              <form className="employee-form schedule-template-form" onSubmit={handleTemplateSubmit}>
                <div className="form-grid schedule-template-form-grid">
                  <label className="form-field full-width">
                    <span>Template name</span>
                    <input value={templateForm.name} onChange={(event) => setTemplateForm((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Dinner service" required />
                  </label>
                  <label className="form-field">
                    <span>Start</span>
                    <TimeSelect
                      value={templateForm.startTime}
                      onChange={(time) => setTemplateForm((current) => ({ ...current, startTime: time }))}
                      required
                    />
                  </label>
                  <label className="form-field">
                    <span>End</span>
                    <TimeSelect
                      value={templateForm.endTime}
                      onChange={(time) => setTemplateForm((current) => ({ ...current, endTime: time }))}
                      required
                    />
                  </label>
                  <label className="form-field">
                    <span>Default role</span>
                    <input value={templateForm.defaultRole} onChange={(event) => setTemplateForm((current) => ({ ...current, defaultRole: event.target.value }))} placeholder="Optional" />
                  </label>
                  <label className="form-field">
                    <span>Default area</span>
                    <select
                      value={templateForm.defaultAreaOption}
                      onChange={(event) => setTemplateForm((current) => ({ ...current, defaultAreaOption: event.target.value }))}
                    >
                      <option value="">Select area</option>
                      {scheduleAreaOptions.map((option) => (
                        <option key={`template-area-${option}`} value={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                  {templateForm.defaultAreaOption === 'Other' ? (
                    <label className="form-field full-width">
                      <span>Custom area</span>
                      <input
                        value={templateForm.defaultAreaCustom}
                        onChange={(event) => setTemplateForm((current) => ({ ...current, defaultAreaCustom: event.target.value }))}
                        placeholder="Enter custom area"
                      />
                    </label>
                  ) : null}
                  <label className="form-field">
                    <span>Required staff</span>
                    <input
                      type="number"
                      min="0"
                      max="99"
                      value={templateForm.defaultRequiredCount}
                      onChange={(event) => setTemplateForm((current) => ({
                        ...current,
                        defaultRequiredCount: Math.max(0, Math.min(99, Math.floor(Number(event.target.value) || 0))),
                      }))}
                    />
                  </label>
                </div>

                <details className="schedule-shift-notes-details">
                  <summary>Notes (optional)</summary>
                  <label className="form-field full-width">
                    <textarea rows="2" value={templateForm.notes} onChange={(event) => setTemplateForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Add notes" />
                  </label>
                </details>

                {templateNotice ? <div className="staff-status-banner">{templateNotice}</div> : null}

                <div className="modal-actions schedule-compact-modal-actions">
                  <button type="button" className="ghost-btn" onClick={() => { setEditingTemplate(null); setTemplateForm(buildTemplateForm(null, shiftTemplates)) }}>
                    + New template
                  </button>
                  <button type="submit" className="primary-btn" disabled={isSavingTemplate}>
                    {isSavingTemplate ? 'Saving…' : editingTemplate ? 'Update' : 'Save'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {isReservationModalOpen && canManageReservationsRole ? (
          <div className="employee-modal-backdrop reservation-modal-backdrop" onClick={handleCloseReservationModal}>
            <div className="employee-modal reservation-smart-modal is-responsive-sheet" onClick={(event) => event.stopPropagation()}>
              <div className="drawer-header">
                <div>
                  <p className="eyebrow">Smart reservation</p>
                  <h3>{editingReservation ? 'Edit reservation' : 'Add reservation'}</h3>
                </div>
                <button type="button" className="icon-btn" onClick={handleCloseReservationModal}>✕</button>
              </div>

              <form
                className="employee-form"
                onSubmit={preventReservationFormSubmit}
                onKeyDownCapture={handleReservationFormEnterKey}
              >
                {!editingReservation && detectedGuestReservation ? (
                  <SmartGuestFormPanel
                    guestReservation={detectedGuestReservation}
                    allReservations={reservations}
                    onApplyGuest={handleApplyGuestProfile}
                  />
                ) : null}

                <div className="form-grid">
                  <label className="form-field">
                    <span>Guest Name</span>
                    <input
                      list="reservation-guest-suggestions"
                      value={reservationForm.guestName}
                      onChange={(event) => handleReservationGuestNameChange(event.target.value)}
                      placeholder="Guest Name"
                      required
                    />
                  </label>
                  {guestNameSuggestions.length > 0 ? (
                    <datalist id="reservation-guest-suggestions">
                      {guestNameSuggestions.map((entry) => (
                        <option key={entry.id} value={formatReservationGuestName(entry.guestName)} />
                      ))}
                    </datalist>
                  ) : null}
                  <label className="form-field">
                    <span>Phone</span>
                    <ReservationPhoneField
                      value={reservationForm.phone}
                      onChange={(phone) => setReservationForm((current) => ({ ...current, phone }))}
                    />
                  </label>
                  <label className="form-field">
                    <span>Date</span>
                    <ReservationDateField
                      value={reservationForm.date}
                      onChange={(date) => setReservationForm((current) => ({ ...current, date }))}
                      todayKey={currentDateKey}
                      required
                    />
                  </label>
                  <ReservationSeatingSelect
                    seatings={reservationSeatings}
                    dateKey={reservationForm.date || currentDateKey}
                    seatingId={reservationForm.seatingId}
                    timeValue={reservationForm.time}
                    onSeatingChange={(nextSeatingId) => setReservationForm((current) => ({
                      ...current,
                      seatingId: nextSeatingId,
                    }))}
                    onTimeChange={(time) => setReservationForm((current) => ({ ...current, time }))}
                  />
                  <label className="form-field">
                    <span>Time</span>
                    <ReservationTimeSelect
                      value={reservationForm.time}
                      onChange={(time) => setReservationForm((current) => ({ ...current, time, seatingId: null }))}
                      required
                    />
                  </label>
                  <label className="form-field">
                    <span>Guests</span>
                    <input type="number" min="1" value={reservationForm.guests} onChange={(event) => setReservationForm((current) => ({ ...current, guests: event.target.value }))} required />
                  </label>
                  <label className="form-field">
                    <span>Status</span>
                    <select value={reservationForm.status} onChange={(event) => setReservationForm((current) => ({ ...current, status: event.target.value }))}>
                      {HOST_RESERVATION_STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <ReservationTableSelector
                  layout={loadPublishedHostLayout(workspace?.id ?? '')}
                  reservations={reservations}
                  todayKey={reservationForm.date || currentDateKey}
                  reservationTime={reservationForm.time}
                  reservationId={editingReservation?.id ?? null}
                  seatingId={reservationForm.seatingId}
                  seatings={reservationSeatings}
                  selectedAreaId={reservationForm.seatingAreaId}
                  assignedUnits={reservationForm.assignedUnits}
                  guests={reservationForm.guests}
                  extraChairs={reservationForm.extraChairs}
                  standingGuests={reservationForm.standingGuests}
                  onAreaChange={(seatingAreaId) => {
                    const hostLayout = loadPublishedHostLayout(workspace?.id ?? '')
                    const zone = hostLayout?.zones?.find((entry) => entry.id === seatingAreaId)
                    setReservationForm((current) => ({
                      ...current,
                      seatingAreaId,
                      area: zone?.label ?? current.area,
                    }))
                  }}
                  onAssignedUnitsChange={(assignedUnits) => setReservationForm((current) => ({ ...current, assignedUnits }))}
                  onExtraChairsChange={(extraChairs) => setReservationForm((current) => ({ ...current, extraChairs }))}
                  onStandingGuestsChange={(standingGuests) => setReservationForm((current) => ({ ...current, standingGuests }))}
                />

                <label className="form-field full-width">
                  <span>Notes</span>
                  <textarea rows="4" value={reservationForm.notes} onChange={(event) => setReservationForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes" />
                </label>

                <div className="modal-actions">
                  <button type="button" className="ghost-btn" onClick={handleCloseReservationModal}>Cancel</button>
                  <button type="button" className="primary-btn" disabled={isSavingReservation} onClick={handleReservationSubmit}>
                    {isSavingReservation ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {isDashboardAnnouncementFormOpen && canManageAnnouncementsRole ? (
          <OperationsAnnouncementFormModal
            isOpen
            isSaving={isSavingOperations}
            onClose={() => setIsDashboardAnnouncementFormOpen(false)}
            onSubmit={handleCreateOperationsAnnouncement}
          />
        ) : null}

        {isDashboardStockCreateOrderOpen && canManageStockRole ? (
          <StockCreateOrderModal
            stockItems={stockItems}
            onClose={() => setIsDashboardStockCreateOrderOpen(false)}
            onSubmit={handleCreateStockOrders}
            isSaving={isSavingStockOrder}
          />
        ) : null}

        {isDashboardReservationQuickCreateOpen && canManageReservationsRole ? (
          <MobileReservationQuickCreateSheet
            isOpen
            todayKey={currentDateKey}
            isSaving={isSavingReservation}
            seatings={reservationSeatings}
            reservations={reservations}
            onClose={() => setIsDashboardReservationQuickCreateOpen(false)}
            onSubmit={async (form) => {
              const created = await handleMobileHostReservationCreate(form)
              if (created !== false) {
                setIsDashboardReservationQuickCreateOpen(false)
              }
              return created
            }}
          />
        ) : null}

        {isQuickReservationOpen && canManageReservationsRole ? (
          <div className="employee-modal-backdrop" onClick={handleCloseQuickReservation}>
            <div className="employee-modal quick-reservation-modal" onClick={(event) => event.stopPropagation()}>
              <div className="drawer-header">
                <div>
                  <p className="eyebrow">Quick reservation</p>
                  <h3>Fast booking</h3>
                </div>
                <button type="button" className="icon-btn" onClick={handleCloseQuickReservation}>✕</button>
              </div>

              <form
                className="employee-form quick-reservation-form"
                onSubmit={preventReservationFormSubmit}
                onKeyDownCapture={handleReservationFormEnterKey}
              >
                <label className="form-field full-width">
                  <span>Guest</span>
                  <input
                    autoFocus
                    list="quick-reservation-guest-suggestions"
                    value={quickReservationForm.guestName}
                    onChange={(event) => setQuickReservationForm((current) => ({ ...current, guestName: event.target.value }))}
                    placeholder="Guest name"
                    required
                  />
                </label>
                <datalist id="quick-reservation-guest-suggestions">
                  {findMatchingGuestProfiles(quickReservationForm.guestName, reservations).map((entry) => (
                    <option key={`quick-${entry.id}`} value={formatReservationGuestName(entry.guestName)} />
                  ))}
                </datalist>
                <label className="form-field full-width">
                  <span>Date</span>
                  <ReservationDateField
                    value={quickReservationForm.date}
                    onChange={(date) => setQuickReservationForm((current) => ({ ...current, date }))}
                    todayKey={currentDateKey}
                    required
                  />
                </label>
                <div className="form-grid">
                  <label className="form-field">
                    <span>Time</span>
                    <ReservationTimeSelect
                      value={quickReservationForm.time}
                      onChange={(time) => setQuickReservationForm((current) => ({ ...current, time }))}
                      required
                    />
                  </label>
                  <label className="form-field">
                    <span>Guests</span>
                    <input
                      type="number"
                      min="1"
                      value={quickReservationForm.guests}
                      onChange={(event) => setQuickReservationForm((current) => ({ ...current, guests: event.target.value }))}
                      required
                    />
                  </label>
                  <label className="form-field">
                    <span>Table</span>
                    <input
                      value={quickReservationForm.tableNumber}
                      onChange={(event) => setQuickReservationForm((current) => ({ ...current, tableNumber: event.target.value }))}
                      placeholder="Table"
                    />
                  </label>
                </div>
                <p className="quick-reservation-hint">Tap Create to save · Pending status</p>
                <div className="modal-actions">
                  <button type="button" className="ghost-btn" onClick={handleCloseQuickReservation}>Cancel</button>
                  <button type="button" className="primary-btn" disabled={isSavingReservation} onClick={handleQuickReservationSubmit}>
                    {isSavingReservation ? 'Creating…' : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {isInventoryModalOpen ? (
          <div className="employee-modal-backdrop task-modal-backdrop" onClick={handleCloseInventoryModal}>
            <div className="employee-modal task-form-modal is-responsive-sheet" onClick={(event) => event.stopPropagation()}>
              <div className="drawer-header">
                <div>
                  <p className="eyebrow">Stock form</p>
                  <h3>{editingInventoryItem ? 'Edit item' : 'Add item'}</h3>
                </div>
                <button type="button" className="icon-btn" onClick={handleCloseInventoryModal}>✕</button>
              </div>

              <form className="employee-form" onSubmit={handleInventorySubmit}>
                <div className="form-grid">
                  <label className="form-field">
                    <span>Item Name</span>
                    <input value={inventoryForm.itemName} onChange={(event) => setInventoryForm((current) => ({ ...current, itemName: event.target.value }))} placeholder="Item Name" required />
                  </label>
                  <label className="form-field">
                    <span>Category</span>
                    <select
                      value={inventoryForm.categoryPreset}
                      onChange={(event) => {
                        const categoryPreset = event.target.value
                        const nextCategory = categoryPreset === INVENTORY_CUSTOM_CATEGORY_VALUE
                          ? ''
                          : categoryPreset
                        const firstSubcategory = nextCategory
                          ? getInventorySubcategories(nextCategory)[0] ?? INVENTORY_NO_SUBCATEGORY_VALUE
                          : INVENTORY_NO_SUBCATEGORY_VALUE

                        setInventoryForm((current) => ({
                          ...current,
                          categoryPreset,
                          customCategory: categoryPreset === INVENTORY_CUSTOM_CATEGORY_VALUE
                            ? current.customCategory
                            : '',
                          subcategoryPreset: firstSubcategory,
                          customSubcategory: '',
                        }))
                      }}
                    >
                      {INVENTORY_CATEGORIES.map((category) => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                      {inventoryFormCustomCategories.map((category) => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                      <option value={INVENTORY_CUSTOM_CATEGORY_VALUE}>Custom Category</option>
                    </select>
                  </label>
                  {inventoryForm.categoryPreset === INVENTORY_CUSTOM_CATEGORY_VALUE ? (
                    <label className="form-field">
                      <span>Custom Category Name</span>
                      <input
                        value={inventoryForm.customCategory}
                        onChange={(event) => setInventoryForm((current) => ({
                          ...current,
                          customCategory: event.target.value,
                        }))}
                        placeholder="Enter category name"
                        required
                      />
                    </label>
                  ) : null}
                  <label className="form-field">
                    <span>Subcategory</span>
                    <select
                      value={inventoryForm.subcategoryPreset}
                      onChange={(event) => setInventoryForm((current) => ({
                        ...current,
                        subcategoryPreset: event.target.value,
                        customSubcategory: event.target.value === INVENTORY_CUSTOM_SUBCATEGORY_VALUE
                          ? current.customSubcategory
                          : '',
                      }))}
                    >
                      {inventoryFormSubcategoryOptions.map((subcategory) => (
                        <option key={subcategory} value={subcategory}>{subcategory}</option>
                      ))}
                      <option value={INVENTORY_CUSTOM_SUBCATEGORY_VALUE}>Custom Subcategory</option>
                      <option value={INVENTORY_NO_SUBCATEGORY_VALUE}>Uncategorized</option>
                    </select>
                  </label>
                  {inventoryForm.subcategoryPreset === INVENTORY_CUSTOM_SUBCATEGORY_VALUE ? (
                    <label className="form-field">
                      <span>Custom Subcategory Name</span>
                      <input
                        value={inventoryForm.customSubcategory}
                        onChange={(event) => setInventoryForm((current) => ({
                          ...current,
                          customSubcategory: event.target.value,
                        }))}
                        placeholder="Enter subcategory name"
                        required
                      />
                    </label>
                  ) : null}
                  <label className="form-field inventory-supplier-field">
                    <span>Supplier</span>
                    <div className="inventory-supplier-field-row">
                      <select
                        className="inventory-supplier-select"
                        value={inventoryForm.supplier}
                        onChange={(event) => setInventoryForm((current) => ({ ...current, supplier: event.target.value }))}
                      >
                        {inventorySupplierOptions.map((option) => (
                          <option key={option.value || 'no-supplier'} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="ghost-btn inventory-add-supplier-btn"
                        onClick={handleOpenAddSupplierFromInventory}
                        disabled={isSavingInventoryItem || isSavingSupplier}
                      >
                        + Supplier
                      </button>
                    </div>
                  </label>
                  <label className="form-field">
                    <span>Unit</span>
                    <InventoryUnitField
                      value={inventoryForm.unit}
                      disabled={isSavingInventoryItem}
                      onChange={(nextUnit) => setInventoryForm((current) => ({ ...current, unit: nextUnit }))}
                    />
                  </label>
                  <label className="form-field">
                    <span>Quantity</span>
                    <input type="number" min="0" value={inventoryForm.quantity} onChange={(event) => setInventoryForm((current) => ({ ...current, quantity: event.target.value }))} required />
                  </label>
                  <label className="form-field">
                    <span>{INVENTORY_TARGET_STOCK_LABEL}</span>
                    <input type="number" min="0" value={inventoryForm.minimumQuantity} onChange={(event) => setInventoryForm((current) => ({ ...current, minimumQuantity: event.target.value }))} required />
                  </label>
                  <label className="form-field">
                    <span>Unit Cost</span>
                    <input type="number" min="0" step="0.01" value={inventoryForm.cost} onChange={(event) => setInventoryForm((current) => ({ ...current, cost: event.target.value }))} required />
                  </label>
                  <div className="form-field inventory-status-preview">
                    <span>Status</span>
                    <p className={`inventory-status-preview-value status-pill ${getInventoryStatusClass(inventoryFormStatus)}`}>
                      {inventoryFormStatus}
                    </p>
                    <p className="inventory-status-preview-hint">Computed from quantity and target stock (PAR).</p>
                  </div>
                </div>

                <label className="form-field full-width">
                  <span>Notes</span>
                  <textarea rows="4" value={inventoryForm.notes} onChange={(event) => setInventoryForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes" />
                </label>

                <div className="modal-actions">
                  <button type="button" className="ghost-btn inventory-modal-action-btn" onClick={handleCloseInventoryModal}>Cancel</button>
                  <button type="submit" className="primary-btn inventory-modal-action-btn" disabled={isSavingInventoryItem}>
                    {isSavingInventoryItem ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {inventoryPendingDelete ? (
          <div className="employee-modal-backdrop task-modal-backdrop" onClick={handleCloseDeleteInventoryModal}>
            <div
              className="employee-modal task-form-modal is-responsive-sheet"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-inventory-title"
            >
              <div className="drawer-header">
                <div>
                  <p className="eyebrow">Delete confirmation</p>
                  <h3 id="delete-inventory-title">Delete stock item?</h3>
                </div>
                <button type="button" className="icon-btn" onClick={handleCloseDeleteInventoryModal} aria-label="Close delete stock item dialog">
                  ✕
                </button>
              </div>

              <div className="inventory-delete-modal-body">
                <p>This cannot be undone.</p>
                {inventoryPendingDelete.itemName ? (
                  <p className="inventory-delete-item-name">
                    <strong>{inventoryPendingDelete.itemName}</strong>
                  </p>
                ) : null}
              </div>

              <div className="modal-actions">
                <button type="button" className="ghost-btn inventory-modal-action-btn" onClick={handleCloseDeleteInventoryModal} disabled={isDeletingInventoryItem}>
                  Cancel
                </button>
                <button type="button" className="primary-btn inventory-delete-confirm-btn inventory-modal-action-btn" onClick={handleConfirmDeleteInventoryItem} disabled={isDeletingInventoryItem}>
                  {isDeletingInventoryItem ? 'Deleting…' : 'Delete Item'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {isSupplierModalOpen ? (
          <div className="employee-modal-backdrop task-modal-backdrop" onClick={handleCloseSupplierModal}>
            <div className="employee-modal task-form-modal is-responsive-sheet" onClick={(event) => event.stopPropagation()}>
              <div className="drawer-header">
                <div>
                  <p className="eyebrow">Supplier form</p>
                  <h3>{editingSupplier ? 'Edit supplier' : 'Add supplier'}</h3>
                </div>
                <button type="button" className="icon-btn" onClick={handleCloseSupplierModal}>✕</button>
              </div>

              <form className="employee-form" onSubmit={handleSupplierSubmit}>
                <div className="form-grid">
                  <label className="form-field">
                    <span>Company Name</span>
                    <input value={supplierForm.companyName} onChange={(event) => setSupplierForm((current) => ({ ...current, companyName: event.target.value }))} placeholder="Company Name" required />
                  </label>
                  <label className="form-field">
                    <span>VAT / Tax ID</span>
                    <input value={supplierForm.taxId} onChange={(event) => setSupplierForm((current) => ({ ...current, taxId: event.target.value }))} placeholder="VAT / Tax ID" />
                  </label>
                  <label className="form-field">
                    <span>Contact Person</span>
                    <input value={supplierForm.contactPerson} onChange={(event) => setSupplierForm((current) => ({ ...current, contactPerson: event.target.value }))} placeholder="Contact Person" />
                  </label>
                  <label className="form-field">
                    <span>Phone</span>
                    <input value={supplierForm.phone} onChange={(event) => setSupplierForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Phone" />
                  </label>
                  <label className="form-field">
                    <span>Email</span>
                    <input type="email" value={supplierForm.email} onChange={(event) => setSupplierForm((current) => ({ ...current, email: event.target.value }))} placeholder="Email" />
                  </label>
                  <label className="form-field">
                    <span>Address</span>
                    <input value={supplierForm.address} onChange={(event) => setSupplierForm((current) => ({ ...current, address: event.target.value }))} placeholder="Address" />
                  </label>
                  <label className="form-field">
                    <span>Payment Terms</span>
                    <input value={supplierForm.paymentTerms} onChange={(event) => setSupplierForm((current) => ({ ...current, paymentTerms: event.target.value }))} placeholder="Payment Terms" />
                  </label>
                  <label className="form-field">
                    <span>Delivery Days</span>
                    <input value={supplierForm.deliveryDays} onChange={(event) => setSupplierForm((current) => ({ ...current, deliveryDays: event.target.value }))} placeholder="Delivery Days" />
                  </label>
                </div>

                <label className="form-field full-width">
                  <span>Notes</span>
                  <textarea rows="4" value={supplierForm.notes} onChange={(event) => setSupplierForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes" />
                </label>

                <div className="modal-actions">
                  <button type="button" className="ghost-btn supplier-modal-action-btn" onClick={handleCloseSupplierModal}>Cancel</button>
                  <button type="submit" className="primary-btn supplier-modal-action-btn" disabled={isSavingSupplier}>
                    {isSavingSupplier ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {supplierPendingDelete ? (
          <div className="employee-modal-backdrop task-modal-backdrop" onClick={handleCloseDeleteSupplierModal}>
            <div
              className="employee-modal task-form-modal is-responsive-sheet"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-supplier-title"
            >
              <div className="drawer-header">
                <div>
                  <p className="eyebrow">Delete confirmation</p>
                  <h3 id="delete-supplier-title">Delete supplier?</h3>
                </div>
                <button type="button" className="icon-btn" onClick={handleCloseDeleteSupplierModal} aria-label="Close delete supplier dialog">
                  ✕
                </button>
              </div>

              <div className="supplier-delete-modal-body">
                {supplierDeleteHasHistory ? (
                  <>
                    <p>
                      <strong>{supplierPendingDelete.companyName}</strong> has linked products or purchase orders.
                    </p>
                    <p>Suppliers with history cannot be deleted. Deactivate them from the Suppliers tab instead.</p>
                  </>
                ) : (
                  <p>This cannot be undone.</p>
                )}
              </div>

              <div className="modal-actions">
                <button type="button" className="ghost-btn supplier-modal-action-btn" onClick={handleCloseDeleteSupplierModal} disabled={isDeletingSupplier}>
                  Cancel
                </button>
                {!supplierDeleteHasHistory ? (
                  <button type="button" className="primary-btn supplier-delete-confirm-btn supplier-modal-action-btn" onClick={handleConfirmDeleteSupplier} disabled={isDeletingSupplier}>
                    {isDeletingSupplier ? 'Deleting…' : 'Delete Supplier'}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {employeePendingDelete ? (
          <div className="employee-modal-backdrop" onClick={handleCloseDeleteEmployeeModal}>
            <div className="employee-modal" onClick={(event) => event.stopPropagation()}>
              <div className="drawer-header">
                <div>
                  <p className="eyebrow">Delete confirmation</p>
                  <h3>Delete employee?</h3>
                </div>
                <button type="button" className="icon-btn" onClick={handleCloseDeleteEmployeeModal}>✕</button>
              </div>

              <p className="welcome-subtitle" style={{ marginTop: 0 }}>
                Are you sure you want to delete this employee? This action cannot be undone.
              </p>

              <div className="modal-actions">
                <button type="button" className="ghost-btn" onClick={handleCloseDeleteEmployeeModal} disabled={isDeletingEmployee}>
                  Cancel
                </button>
                <button type="button" className="primary-btn" onClick={handleDeleteEmployee} disabled={isDeletingEmployee}>
                  {isDeletingEmployee ? 'Deleting…' : 'Delete Employee'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {positionPendingDelete ? (
          <div className="employee-modal-backdrop" onClick={() => setPositionPendingDelete(null)}>
            <div className="employee-modal blend-compact-modal" onClick={(event) => event.stopPropagation()}>
              <div className="drawer-header">
                <div>
                  <p className="eyebrow">Delete position</p>
                  <h3>Confirm delete</h3>
                </div>
                <button type="button" className="icon-btn" onClick={() => setPositionPendingDelete(null)}>✕</button>
              </div>

              <p className="staff-subtitle">Delete {positionPendingDelete.name}? This action cannot be undone.</p>
              {getPositionUsageCount(positionPendingDelete) > 0 ? (
                <div className="staff-status-banner">
                  Warning: {getPositionUsageCount(positionPendingDelete)} employee{getPositionUsageCount(positionPendingDelete) === 1 ? '' : 's'} currently use this position.
                </div>
              ) : null}

              <div className="modal-actions">
                <button type="button" className="ghost-btn" onClick={() => setPositionPendingDelete(null)}>Cancel</button>
                <button type="button" className="primary-btn" onClick={handleConfirmDeletePosition} disabled={isSavingPosition}>
                  {isSavingPosition ? 'Deleting…' : 'Delete Position'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {reservationSeatingPendingDelete ? (
          <div className="employee-modal-backdrop" onClick={() => setReservationSeatingPendingDelete(null)}>
            <div className="employee-modal blend-compact-modal" onClick={(event) => event.stopPropagation()}>
              <div className="drawer-header">
                <div>
                  <p className="eyebrow">Delete seating</p>
                  <h3>Confirm delete</h3>
                </div>
                <button type="button" className="icon-btn" onClick={() => setReservationSeatingPendingDelete(null)}>✕</button>
              </div>

              <p className="staff-subtitle">
                Delete {reservationSeatingPendingDelete.name}? Existing reservations keep their times.
              </p>

              <div className="modal-actions">
                <button type="button" className="ghost-btn" onClick={() => setReservationSeatingPendingDelete(null)}>Cancel</button>
                <button type="button" className="primary-btn" onClick={handleConfirmDeleteReservationSeating} disabled={isSavingReservationSeating}>
                  {isSavingReservationSeating ? 'Deleting…' : 'Delete seating'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
    </PublishedFloorPlanProvider>
  )
}

export default App
