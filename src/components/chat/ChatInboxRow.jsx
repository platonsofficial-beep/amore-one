import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { t } from '../../i18n/i18n'
import '../workspace/venueManager.css'

const SWIPE_OPEN = -88

export function ChatInboxRow({
  title,
  when,
  preview,
  active = false,
  pinned = false,
  unread = false,
  muted = false,
  badge = '',
  avatar,
  onOpen,
  onAskDelete,
}) {
  const [offset, setOffset] = useState(0)
  const [menu, setMenu] = useState(false)
  const start = useRef(null)
  const pressTimer = useRef(0)
  const moved = useRef(false)
  const held = useRef(false)

  const closeSwipe = () => setOffset(0)

  const onPointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    start.current = { x: event.clientX, y: event.clientY, type: event.pointerType }
    moved.current = false
    held.current = false
    window.clearTimeout(pressTimer.current)
    pressTimer.current = window.setTimeout(() => {
      held.current = true
      setMenu(true)
    }, 550)
  }

  const onPointerMove = (event) => {
    if (!start.current) return
    const dx = event.clientX - start.current.x
    const dy = event.clientY - start.current.y
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
    window.clearTimeout(pressTimer.current)
    if (Math.abs(dy) >= Math.abs(dx)) return
    if (start.current.type === 'mouse') return
    if (dx < 0) {
      moved.current = true
      setOffset(Math.max(dx, SWIPE_OPEN))
    }
  }

  const onPointerUp = () => {
    window.clearTimeout(pressTimer.current)
    if (!start.current) return
    if (moved.current) setOffset((current) => (current < SWIPE_OPEN / 2 ? SWIPE_OPEN : 0))
    start.current = null
  }

  const open = (event) => {
    if (held.current || moved.current) {
      held.current = false
      moved.current = false
      return
    }
    if (offset !== 0) {
      closeSwipe()
      return
    }
    onOpen?.(event)
  }

  const menuNode = menu && typeof document !== 'undefined' ? createPortal(
    <div className="venue-sheet-backdrop chat-row-menu-backdrop" onClick={() => { setMenu(false) }}>
      <div className="chat-row-menu" role="menu" onClick={(event) => { event.stopPropagation() }}>
        <button
          type="button"
          role="menuitem"
          className="chat-row-menu-delete"
          onClick={() => {
            setMenu(false)
            closeSwipe()
            onAskDelete?.()
          }}
        >
          {t('Delete chat')}
        </button>
        <button type="button" role="menuitem" onClick={() => { setMenu(false) }}>{t('Cancel')}</button>
      </div>
    </div>,
    document.body,
  ) : null

  return (
    <div className={`chat-row-shell${pinned ? ' is-pinned' : ''}`}>
      <button type="button" className="chat-row-delete" onClick={() => onAskDelete?.()}>
        {t('Delete')}
      </button>
      <div
        className="chat-row-front"
        style={{ transform: `translateX(${offset}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <button
          type="button"
          className={`chat-row${pinned ? ' is-pinned' : ''}${active ? ' is-active' : ''}`}
          onClick={open}
        >
          {avatar}
          <span className="chat-row-copy">
            <span className="chat-row-line">
              <strong>{title}</strong>
              {when}
            </span>
            <span className="chat-row-line">
              <span className="chat-row-preview">{preview}</span>
              {muted}
              {badge && unread ? <span className="chat-badge">{badge}</span> : null}
            </span>
          </span>
        </button>
        <button
          type="button"
          className="chat-row-more"
          aria-label={t('Chat actions')}
          onClick={(event) => {
            event.stopPropagation()
            setMenu(true)
          }}
        >
          ⋯
        </button>
      </div>
      {menuNode}
    </div>
  )
}
