import {
  buildSeatingFormDefaults,
  copyDayHours,
  DAY_OF_WEEK_OPTIONS,
  formatSeatingDaysLabel,
  normalizeDayHours,
  normalizeReservationSeating,
} from '../../lib/reservationSeatings'
import { normalizeReservationAutoCloseTime } from '../../lib/reservationAutoClose'
import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  readHostDiningTimerDurationPolicy,
  writeHostDiningTimerDurationPolicy,
} from '../../lib/hostDiningTimer'
import { ReservationTimeSelect } from '../reservations/ReservationTimeSelect'
import { useEscapeToClose } from '../../lib/useEscapeToClose'
import { formatUserFacingLoadError, isLoadFailureMessage, isTechnicalErrorText } from '../../lib/userFacingLoadError'
import { LoadFailureBanner } from '../shell/LoadFailureBanner'
import { WorkspaceSaveNotice } from './WorkspaceSaveNotice'
import { sumVenueCovers } from '../../lib/onlineBooking'
import { useSettingsEditorScroll } from '../../lib/settingsEditorScroll'
import { usePublishedFloorPlan } from '../../lib/PublishedFloorPlanContext'
import { t } from '../../i18n/i18n'

function HostDiningTimerSettings() {
  const [policy, setPolicy] = useState(() => readHostDiningTimerDurationPolicy())

  const update = (key, value) => {
    setPolicy(writeHostDiningTimerDurationPolicy({ ...policy, [key]: value }))
  }

  return (
    <div className="panel staff-panel workspace-panel" data-testid="host-dining-timer-settings">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{t("Service pace")}</p>
          <h3>{t("Table timers")}</h3>
        </div>
      </div>
      <p className="workspace-section-subtitle">
        {t("Minutes before a seated dinner or drinks party is expected to free the table. Saved on this device. A venue-wide save needs a database change and owner approval.")}
      </p>
      <div className="employee-form">
        <label className="form-field">
          <span>{t("Dinner minutes")}</span>
          <input
            type="number"
            min="15"
            max="1440"
            value={policy.dinner}
            data-testid="host-timer-dinner-minutes"
            onChange={(event) => update('dinner', event.target.value)}
          />
        </label>
        <label className="form-field">
          <span>{t("Drinks minutes")}</span>
          <input
            type="number"
            min="15"
            max="1440"
            value={policy.drinks}
            data-testid="host-timer-drinks-minutes"
            onChange={(event) => update('drinks', event.target.value)}
          />
        </label>
      </div>
    </div>
  )
}

const WEEK_FROM_MONDAY = [1, 2, 3, 4, 5, 6, 0]

function SeatingDayHours({ form, onFormChange }) {
  const hours = normalizeDayHours(form.dayHours, form)
  const [selectedDay, setSelectedDay] = useState(() => hours[1]?.open ? 1 : DAY_OF_WEEK_OPTIONS.find((day) => hours[day.value]?.open)?.value ?? 1)
  const [copyDays, setCopyDays] = useState([])
  const day = hours[selectedDay] || hours[1]
  const applyHours = (nextHours) => {
    onFormChange({
      ...form,
      dayHours: nextHours,
      daysOfWeek: DAY_OF_WEEK_OPTIONS.map((entry) => entry.value).filter((value) => nextHours[value]?.open),
    })
  }
  const patchDay = (patch) => {
    applyHours({
      ...hours,
      [selectedDay]: { ...day, ...patch },
    })
  }

  return (
    <div className="seating-day-hours">
      <span>{t("Hours by day")}</span>
      <div className="workspace-seating-days" role="group" aria-label={t("Hours by day")} data-help="hours.day">
        {WEEK_FROM_MONDAY.map((value) => DAY_OF_WEEK_OPTIONS.find((option) => option.value === value)).map((option) => {
          const row = hours[option.value]
          const selected = option.value === selectedDay
          return (
            <button
              key={option.value}
              type="button"
              className={`workspace-seating-day-chip${row?.open ? ' is-active' : ''}${selected ? ' is-selected' : ''}`}
              aria-pressed={Boolean(row?.open)}
              onClick={() => setSelectedDay(option.value)}
            >
              {t(option.label)}
            </button>
          )
        })}
      </div>
      <label className="seating-day-open" data-help="hours.open">
        <input
          type="checkbox"
          checked={Boolean(day?.open)}
          onChange={(event) => patchDay({ open: event.target.checked })}
        />
        <span className="seating-day-check" aria-hidden="true" />
        <span>{day?.open ? t("Open this day") : t("Closed this day")}</span>
      </label>
      <div className="seating-day-times" data-help="hours.times">
        <label className="form-field">
          <span>{t("Start time")}</span>
          <ReservationTimeSelect
            value={day?.start || form.startTime}
            onChange={(start) => patchDay({ start })}
          />
        </label>
        <label className="form-field">
          <span>{t("End time")}</span>
          <ReservationTimeSelect
            value={day?.end || ''}
            onChange={(end) => patchDay({ end })}
          />
        </label>
        <label className="form-field" data-help="hours.last">
          <span>{t("Last arrival")}</span>
          <ReservationTimeSelect
            value={day?.lastArrival || ''}
            onChange={(lastArrival) => patchDay({ lastArrival })}
          />
          <small>{t("Blank means 30 minutes before the end.")}</small>
          {day?.lastArrival ? (
            <button type="button" className="ghost-btn workspace-action-btn" onClick={() => patchDay({ lastArrival: '' })}>
              {t("Use the usual last arrival")}
            </button>
          ) : null}
        </label>
      </div>
      <div className="seating-day-copy" data-help="hours.copy">
        <span>{t("Copy to other days")}</span>
        <div className="workspace-seating-days" role="group" aria-label={t("Copy to other days")}>
          {WEEK_FROM_MONDAY.filter((value) => value !== selectedDay).map((value) => DAY_OF_WEEK_OPTIONS.find((option) => option.value === value)).map((option) => {
            const picked = copyDays.includes(option.value)
            return (
              <button
                key={option.value}
                type="button"
                className={`workspace-seating-day-chip${picked ? ' is-active' : ''}`}
                aria-pressed={picked}
                onClick={() => setCopyDays((current) => (
                  picked ? current.filter((value) => value !== option.value) : [...current, option.value]
                ))}
              >
                {t(option.label)}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          className="ghost-btn workspace-action-btn"
          disabled={copyDays.length === 0}
          onClick={() => {
            applyHours(copyDayHours(hours, selectedDay, copyDays))
            setCopyDays([])
          }}
        >
          {t("Copy hours")}
        </button>
      </div>
    </div>
  )
}

function OnlineCapacityFields({ form, onFormChange }) {
  const { publishedBuilderLayout, builderLayout } = usePublishedFloorPlan()
  const layout = publishedBuilderLayout || builderLayout
  const covers = sumVenueCovers(layout?.objects)
  const areas = Array.isArray(layout?.floors) ? layout.floors : []
  const caps = form.onlineAreaCaps || {}

  return (
    <div className="form-field full-width">
      <span>{t("Online capacity (max covers)")}</span>
      <input
        type="number"
        min="1"
        inputMode="numeric"
        value={form.onlineCapacity ?? ''}
        placeholder={covers > 0 ? String(covers) : ''}
        aria-label={t("Online capacity (max covers)")}
        onChange={(event) => onFormChange({
          ...form,
          onlineCapacity: event.target.value,
        })}
      />
      <small>
        {covers > 0
          ? t("Venue covers: {{count}}", { count: covers })
          : t("Venue covers appear here once the floor plan has tables.")}
      </small>
      {areas.length > 0 ? (
        <div className="online-booking-grid">
          {areas.map((area) => (
            <label key={area.id} className="form-field">
              <span>{t("Area cap")}: {area.label}</span>
              <input
                type="number"
                min="1"
                inputMode="numeric"
                value={caps[area.id] ?? ''}
                placeholder={t("No cap")}
                aria-label={t("Area cap for {{name}}", { name: area.label })}
                onChange={(event) => onFormChange({
                  ...form,
                  onlineAreaCaps: {
                    ...caps,
                    [area.id]: event.target.value,
                  },
                })}
              />
            </label>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function readableSeatingNotice(message) {
  const text = `${message ?? ''}`.trim()
  if (!text) return ''
  if (isTechnicalErrorText(text)) {
    return formatUserFacingLoadError('seating hours')
  }
  return text
}

export function WorkspaceReservationSeatingsSection({
  seatings = [],
  isLoading = false,
  noticeMessage = '',
  form,
  isSaving = false,
  editingSeatingId = null,
  onFormChange,
  onSubmit,
  onStartEdit,
  onCancelEdit,
  onRequestDelete,
  onMoveSeating,
  onToggleActive,
  autoCloseTime = '',
  onAutoCloseTimeChange,
  onSaveAutoClose,
  isSavingAutoClose = false,
  autoCloseNotice = '',
  hoursOnly = false,
  canEdit = true,
  onRetry,
}) {
  const sectionRef = useRef(null)
  const editorRef = useRef(null)
  const nameRef = useRef(null)
  const beginEdit = useSettingsEditorScroll({
    editingId: editingSeatingId,
    sectionRef,
    fieldRef: nameRef,
  })
  const showAutoClose = !hoursOnly && typeof onAutoCloseTimeChange === 'function'
  const showEditActions = canEdit && typeof onStartEdit === 'function'
  const visibleNotice = hoursOnly ? readableSeatingNotice(noticeMessage) : `${noticeMessage ?? ''}`.trim()
  useEscapeToClose(() => onCancelEdit?.(), {
    enabled: Boolean(hoursOnly && editingSeatingId),
  })

  const editForm = showEditActions && (!hoursOnly || editingSeatingId) ? (
    <div className="panel staff-panel workspace-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{t("Manage seatings")}</p>
          <h3 id={hoursOnly ? 'seating-hours-editor-title' : undefined}>{editingSeatingId ? t("Edit seating") : t("Add seating")}</h3>
        </div>
      </div>

      <form className="employee-form" onSubmit={onSubmit}>
        <div className="seating-hours-editor-fields">
        <div className="form-grid">
          <label className="form-field">
            <span>{t("Name")}</span>
            <input
              value={form.name}
              onChange={(event) => onFormChange({ ...form, name: event.target.value })}
              placeholder={t("e.g. Dinner 1")}
              required
            />
          </label>
          <label className="form-field">
            <span>{t("Start time")}</span>
            <ReservationTimeSelect
              value={form.startTime}
              onChange={(startTime) => onFormChange({ ...form, startTime })}
              required
            />
          </label>
          <label className="form-field">
            <span>{t("Duration (minutes)")}</span>
            <input
              type="number"
              min="15"
              max="480"
              step="15"
              value={form.durationMinutes}
              onChange={(event) => onFormChange({
                ...form,
                durationMinutes: Math.max(15, Number(event.target.value) || 120),
              })}
              required
            />
          </label>
          <label className="form-field">
            <span>{t("Status")}</span>
            <select
              value={form.isActive ? 'active' : 'inactive'}
              onChange={(event) => onFormChange({
                ...form,
                isActive: event.target.value === 'active',
              })}
            >
              <option value="active">{t("Active")}</option>
              <option value="inactive">{t("Inactive")}</option>
            </select>
          </label>
        </div>
        </div>

        <div className="form-field full-width seating-hours-editor-days">
          <SeatingDayHours form={form} onFormChange={onFormChange} />
        </div>

        <OnlineCapacityFields form={form} onFormChange={onFormChange} />

        <WorkspaceSaveNotice message={isLoadFailureMessage(visibleNotice) ? '' : visibleNotice} />
        <div className="modal-actions">
          {editingSeatingId ? (
            <button type="button" className="ghost-btn workspace-action-btn" onClick={onCancelEdit}>
              {t("Cancel edit")}
            </button>
          ) : null}
          <button type="submit" className="primary-btn workspace-action-btn" data-help="hours.save" disabled={isSaving}>
            {isSaving ? t("Saving…") : editingSeatingId ? t("Update seating") : t("Add seating")}
          </button>
        </div>
      </form>
    </div>
  ) : null

  const hoursList = (
    <div className="panel staff-panel workspace-panel" data-testid="seating-hours-list">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{hoursOnly ? t("Seating hours") : t("Seating list")}</p>
          <h3>{t('{{count}} seating', { count: seatings.length })}</h3>
        </div>
      </div>

      {seatings.length === 0 && !isLoading ? (
        <div className="schedule-empty-state">
          <h4>{t("No seatings configured.")}</h4>
          <p>{t("Add your first service seating to power table availability.")}</p>
        </div>
      ) : (
        <div className="positions-list workspace-seatings-list">
          {seatings.map((seating, index) => {
            const normalized = normalizeReservationSeating(seating)
            if (!normalized) return null

            return (
              <article
                key={normalized.id}
                className={`position-row workspace-seating-row${normalized.isActive ? '' : ' is-inactive'}`}
                data-settings-row={normalized.id}
              >
                <div>
                  <strong>{normalized.name}</strong>
                  <p>
                    {normalized.startTime}
                    {' · '}
                    {t("{{minutes}} min", { minutes: normalized.durationMinutes })}
                    {' · '}
                    {formatSeatingDaysLabel(normalized.daysOfWeek)}
                    {normalized.onlineCapacity
                      ? ` · ${t("{{count}} online covers", { count: normalized.onlineCapacity })}`
                      : ''}
                  </p>
                  {!normalized.isActive ? <small>{t("Inactive")}</small> : null}
                </div>
                {showEditActions ? (
                  <div className="action-group">
                    <button
                      type="button"
                      className="ghost-btn small workspace-action-btn"
                      onClick={() => onMoveSeating(normalized, 'up')}
                      disabled={index === 0}
                      aria-label={t("Move {{name}} up", { name: normalized.name })}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="ghost-btn small workspace-action-btn"
                      onClick={() => onMoveSeating(normalized, 'down')}
                      disabled={index === seatings.length - 1}
                      aria-label={t("Move {{name}} down", { name: normalized.name })}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="ghost-btn small workspace-action-btn"
                      onClick={() => beginEdit(hoursOnly ? null : editorRef.current, () => onStartEdit(normalized))}
                    >
                      {t("Edit")}
                    </button>
                    <button
                      type="button"
                      className="ghost-btn small workspace-action-btn"
                      onClick={() => onToggleActive(normalized)}
                    >
                      {normalized.isActive ? t("Deactivate") : t("Activate")}
                    </button>
                    <button
                      type="button"
                      className="ghost-btn small workspace-action-btn"
                      onClick={() => onRequestDelete(normalized)}
                    >
                      {t("Delete")}
                    </button>
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )

  return (
    <div ref={sectionRef}>
      {hoursOnly ? hoursList : null}
      {hoursOnly ? null : (
      <div className="workspace-section-header">
        <div>
          <p className="eyebrow">{t("Venue")}</p>
          <h3 className="workspace-section-heading">
            <span className="workspace-section-icon" aria-hidden="true">🍽️</span>
            {t("Reservation Seatings")}
          </h3>
          <p className="workspace-section-subtitle">
            {t("Configure service slots used for reservations, table availability, and host station.")}
          </p>
        </div>
      </div>
      )}

      {showAutoClose ? (
        <div className="panel staff-panel workspace-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">{t("End of day")}</p>
              <h3>{t("Auto-close seated tables")}</h3>
            </div>
          </div>
          <form
            className="employee-form"
            onSubmit={(event) => {
              event.preventDefault()
              onSaveAutoClose?.()
            }}
          >
            <p className="workspace-section-subtitle">
              {t("At this Europe/Nicosia time, reservations still seated from a previous business day are checked out and marked auto-closed. Default 05:00.")}
            </p>
            <label className="form-field">
              <span>{t("Cutoff time")}</span>
              <input
                type="time"
                className="reservation-auto-close-time"
                value={normalizeReservationAutoCloseTime(autoCloseTime)}
                onChange={(event) => onAutoCloseTimeChange(
                  normalizeReservationAutoCloseTime(event.target.value),
                )}
                disabled={isSavingAutoClose}
                required
              />
            </label>
            <WorkspaceSaveNotice message={autoCloseNotice} />
            <div className="modal-actions">
              <button
                type="submit"
                className="primary-btn workspace-action-btn reservation-auto-close-save"
                disabled={isSavingAutoClose}
              >
                {isSavingAutoClose ? t("Saving…") : t("Save cutoff")}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {hoursOnly ? null : <HostDiningTimerSettings />}

      {isLoadFailureMessage(visibleNotice) ? (
        <LoadFailureBanner message={visibleNotice} subject="seating hours" onRetry={onRetry} />
      ) : null}
      {isLoading && !isLoadFailureMessage(visibleNotice) ? <div className="staff-status-banner">{t("Loading seatings…")}</div> : null}

      {hoursOnly && editingSeatingId && typeof document !== 'undefined'
        ? createPortal(
          <div
            className="employee-modal-backdrop seating-hours-followup"
            onClick={onCancelEdit}
          >
            <div
              className="employee-modal seating-hours-editor"
              role="dialog"
              aria-modal="true"
              aria-labelledby="seating-hours-editor-title"
              onClick={(event) => event.stopPropagation()}
            >
              {editForm}
            </div>
          </div>,
          document.body,
        )
        : null}
      {hoursOnly ? null : (
      <div className="panel staff-panel workspace-panel" ref={editorRef}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">{t("Manage seatings")}</p>
            <h3>{editingSeatingId ? t("Edit seating") : t("Add seating")}</h3>
          </div>
        </div>

        <form className="employee-form" onSubmit={onSubmit}>
          <div className="form-grid">
            <label className="form-field">
              <span>{t("Name")}</span>
              <input
                ref={nameRef}
                value={form.name}
                onChange={(event) => onFormChange({ ...form, name: event.target.value })}
                placeholder={t("e.g. Dinner 1")}
                required
              />
            </label>
            <label className="form-field">
              <span>{t("Start time")}</span>
              <ReservationTimeSelect
                value={form.startTime}
                onChange={(startTime) => onFormChange({ ...form, startTime })}
                required
              />
            </label>
            <label className="form-field">
              <span>{t("Duration (minutes)")}</span>
              <input
                type="number"
                min="15"
                max="480"
                step="15"
                value={form.durationMinutes}
                onChange={(event) => onFormChange({
                  ...form,
                  durationMinutes: Math.max(15, Number(event.target.value) || 120),
                })}
                required
              />
            </label>
            <label className="form-field">
              <span>{t("Status")}</span>
              <select
                value={form.isActive ? 'active' : 'inactive'}
                onChange={(event) => onFormChange({
                  ...form,
                  isActive: event.target.value === 'active',
                })}
              >
                <option value="active">{t("Active")}</option>
                <option value="inactive">{t("Inactive")}</option>
              </select>
            </label>
          </div>

          <div className="form-field full-width seating-hours-editor-days">
            <SeatingDayHours form={form} onFormChange={onFormChange} />
          </div>

          <OnlineCapacityFields form={form} onFormChange={onFormChange} />

          <WorkspaceSaveNotice message={isLoadFailureMessage(visibleNotice) ? '' : visibleNotice} />
          <div className="modal-actions">
            {editingSeatingId ? (
              <button type="button" className="ghost-btn workspace-action-btn" onClick={onCancelEdit}>
                {t("Cancel edit")}
              </button>
            ) : null}
            <button type="submit" className="primary-btn workspace-action-btn" data-help="setup.add-seating" disabled={isSaving}>
              {isSaving ? t("Saving…") : editingSeatingId ? t("Update seating") : t("Add seating")}
            </button>
          </div>
        </form>
      </div>
      )}

      {hoursOnly ? null : hoursList}
    </div>
  )
}

export function createDefaultSeatingForm(seating = null) {
  return buildSeatingFormDefaults(seating)
}
