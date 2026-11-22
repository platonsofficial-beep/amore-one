import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { t } from '../../i18n/i18n'
import {
  TODAY_QUICK_ACTION_MAX,
  TODAY_QUICK_GROUPS,
  availableTodayShortcuts,
  clearStoredTodayShortcutIds,
  defaultTodayShortcutIds,
  moveTodayShortcut,
  readStoredTodayShortcutIds,
  resolveTodayShortcutIds,
  toggleTodayShortcut,
  writeStoredTodayShortcutIds,
} from '../../lib/todayQuickShortcuts'
import './todayQuickActions.css'

function shortcutLabel(shortcut) {
  return t(shortcut.labelKey)
}

export function TodayQuickActions({
  access,
  userId = '',
  workspaceId = '',
  onRun,
  showReceiveDelivery = false,
  onReceiveDeliveries,
}) {
  const available = useMemo(() => availableTodayShortcuts(access), [access])
  const [selectedIds, setSelectedIds] = useState(() => resolveTodayShortcutIds(
    readStoredTodayShortcutIds(userId, workspaceId),
    access,
  ))
  const [draftIds, setDraftIds] = useState(selectedIds)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState({})

  useEffect(() => {
    setSelectedIds(resolveTodayShortcutIds(readStoredTodayShortcutIds(userId, workspaceId), access))
  }, [access, userId, workspaceId])

  useEffect(() => {
    if (!open) return undefined
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const byId = useMemo(() => new Map(available.map((shortcut) => [shortcut.id, shortcut])), [available])
  const selected = selectedIds.map((id) => byId.get(id)).filter(Boolean)
  const needle = query.trim().toLocaleLowerCase()
  const groups = TODAY_QUICK_GROUPS.map((group) => ({
    ...group,
    shortcuts: available.filter((shortcut) => {
      if (shortcut.group !== group.id) return false
      if (!needle) return true
      return shortcutLabel(shortcut).toLocaleLowerCase().includes(needle)
        || t(group.labelKey).toLocaleLowerCase().includes(needle)
    }),
  })).filter((group) => group.shortcuts.length > 0)

  if (selected.length === 0 && !showReceiveDelivery) return null

  const openEditor = () => {
    setDraftIds(selectedIds)
    setQuery('')
    setCollapsed({})
    setOpen(true)
  }

  const save = (ids) => {
    const next = resolveTodayShortcutIds(ids, access)
    writeStoredTodayShortcutIds(userId, workspaceId, next)
    setSelectedIds(next)
    setDraftIds(next)
  }

  return (
    <div className="today-quick-actions">
      <div className="today-quick-heading">
        <h2 className="mobile-manager-block-title">{t("Quick actions")}</h2>
        {available.length > 0 ? (
          <button type="button" className="today-quick-edit" onClick={openEditor}>
            {t("Edit")}
          </button>
        ) : null}
      </div>
      {showReceiveDelivery ? (
        <button
          type="button"
          className="mobile-manager-action-btn mobile-manager-action-btn-primary mobile-manager-action-btn-featured"
          onClick={onReceiveDeliveries}
        >
          {t("Receive delivery")}
        </button>
      ) : null}
      <div className="mobile-manager-actions-grid">
        {selected.map((shortcut) => (
          <button
            key={shortcut.id}
            type="button"
            className="mobile-manager-action-btn"
            onClick={() => onRun?.(shortcut.id)}
          >
            {shortcutLabel(shortcut)}
          </button>
        ))}
      </div>
      {open ? createPortal(
        <div className="today-quick-sheet-backdrop" onClick={() => setOpen(false)}>
          <div
            className="today-quick-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={t("Edit quick actions")}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="today-quick-sheet-handle" aria-hidden="true" />
            <header className="today-quick-sheet-head">
              <h2>{t("Edit quick actions")}</h2>
              <button type="button" className="today-quick-sheet-close" onClick={() => setOpen(false)} aria-label={t("Close")}>
                ✕
              </button>
            </header>
            <label className="today-quick-search">
              <span className="sr-only">{t("Search shortcuts")}</span>
              <input
                type="search"
                value={query}
                placeholder={t("Search shortcuts")}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <p className="today-quick-count">
              {t("{{count}} of {{max}} selected", { count: draftIds.length, max: TODAY_QUICK_ACTION_MAX })}
            </p>
            <div className="today-quick-sheet-body">
              <ul className="today-quick-selected" aria-label={t("Quick actions")}>
                {draftIds.map((id) => {
                  const shortcut = byId.get(id)
                  if (!shortcut) return null
                  return (
                    <li key={id}>
                      <span>{shortcutLabel(shortcut)}</span>
                      <span className="today-quick-move">
                        <button type="button" aria-label={t("Move up")} onClick={() => setDraftIds((current) => moveTodayShortcut(current, id, -1))}>↑</button>
                        <button type="button" aria-label={t("Move down")} onClick={() => setDraftIds((current) => moveTodayShortcut(current, id, 1))}>↓</button>
                      </span>
                    </li>
                  )
                })}
              </ul>
              {groups.length === 0 ? <p className="today-quick-empty">{t("No shortcuts match.")}</p> : null}
              {groups.map((group) => {
                const isCollapsed = !needle && collapsed[group.id]
                return (
                  <section key={group.id} className="today-quick-group">
                    <button
                      type="button"
                      className="today-quick-group-toggle"
                      aria-expanded={!isCollapsed}
                      onClick={() => setCollapsed((current) => ({ ...current, [group.id]: !current[group.id] }))}
                    >
                      <span>{t(group.labelKey)}</span>
                      <span aria-hidden="true">{isCollapsed ? '▸' : '▾'}</span>
                    </button>
                    {isCollapsed ? null : (
                      <ul>
                        {group.shortcuts.map((shortcut) => {
                          const checked = draftIds.includes(shortcut.id)
                          const blocked = !checked && draftIds.length >= TODAY_QUICK_ACTION_MAX
                          return (
                            <li key={shortcut.id}>
                              <button
                                type="button"
                                className={`today-quick-choice${checked ? ' is-selected' : ''}`}
                                aria-pressed={checked}
                                disabled={blocked}
                                onClick={() => setDraftIds((current) => toggleTodayShortcut(current, shortcut.id, access))}
                              >
                                <span>{shortcutLabel(shortcut)}</span>
                                <span aria-hidden="true">{checked ? '✓' : ''}</span>
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </section>
                )
              })}
            </div>
            <footer className="today-quick-sheet-foot">
              <button
                type="button"
                className="today-quick-reset"
                onClick={() => {
                  clearStoredTodayShortcutIds(userId, workspaceId)
                  const defaults = defaultTodayShortcutIds(access)
                  setSelectedIds(defaults)
                  setDraftIds(defaults)
                }}
              >
                {t("Reset")}
              </button>
              <button
                type="button"
                className="today-quick-done"
                onClick={() => {
                  save(draftIds)
                  setOpen(false)
                }}
              >
                {t("Done")}
              </button>
            </footer>
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  )
}
