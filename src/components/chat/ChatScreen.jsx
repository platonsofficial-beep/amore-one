import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { presentUserError } from '../../lib/userFacingLoadError'
import { createPortal } from 'react-dom'
import { useKeyboardInset } from '../../lib/keyboardInset'
import { PersonAvatar } from '../identity/PersonAvatar'
import { useAvatarDirectory } from '../../context/AvatarDirectoryContext'
import { getIdentityColorById } from '../../lib/identity/identityColorPalette'
import { getProfileInitials } from '../../lib/workspaceProfileUtils'
import {
  CHAT_COMPOSER_EMOJIS,
  CHAT_EMOJIS,
  canDeleteChatMessage,
  canEditChatMessage,
  chatIdentityHints,
  clipChatBody,
  conversationTitle,
  dayLabel,
  filterInboxByName,
  groupReactions,
  lastMessagePreview,
  lastMessageTimeLabel,
  messageGroupPosition,
  muteUntilValue,
  orderInbox,
  readTickState,
  seenReceiptText,
  shouldUseWideChatLayout,
} from '../../lib/chat'
import {
  firstUnreadMessageId,
  planChatScrollPosition,
  planChatScrollUpdate,
  preservedScrollTop,
  readChatScrollMetrics,
  scrollChatToBottom,
  scrollChatToMessage,
} from '../../lib/chatScroll'
import {
  addChatReaction,
  chatAttachmentUrl,
  createChatChannel,
  deleteChatMessage,
  editChatMessage,
  fetchChatMembers,
  fetchChatMessages,
  fetchChatNameHints,
  fetchChatParticipants,
  fetchChatReactions,
  fetchPinnedChatMessages,
  getOrCreateDirectChat,
  markChatRead,
  removeChatReaction,
  sendChatMessage,
  setChatChannelMembers,
  setChatMute,
  setChatPinned,
  subscribeToChatConversation,
  subscribeToChatTyping,
  uploadChatPhoto,
} from '../../services/chatService'
import { t } from '../../i18n/i18n'
import './chat.css'

const CHAT_SESSION_KEY = 'one.chat.session'
const CHANNEL_ICON_CHOICES = ['📣', '🍳', '🍷', '🍸', '🧾', '📦', '⭐', '🎉']

function readChatSession() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(CHAT_SESSION_KEY) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeChatSession(patch) {
  try {
    sessionStorage.setItem(CHAT_SESSION_KEY, JSON.stringify({ ...readChatSession(), ...patch }))
  } catch {
    // Ignore private-mode storage failures.
  }
}

function useWideChatLayout(layout) {
  const [wide, setWide] = useState(() => {
    if (layout === 'split') return true
    if (layout === 'stack') return false
    if (typeof window === 'undefined') return false
    return shouldUseWideChatLayout(window.innerWidth, window.innerHeight)
  })

  useEffect(() => {
    if (layout === 'stack' || layout === 'split') return undefined
    const update = () => setWide(shouldUseWideChatLayout(window.innerWidth, window.innerHeight))
    update()
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [layout])

  if (layout === 'split') return true
  if (layout === 'stack') return false
  return wide
}

function initials(name) {
  return getProfileInitials(name)
}

function ChatPhoto({ path, onOpen }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    let cancelled = false
    chatAttachmentUrl(path).then((next) => {
      if (!cancelled) setUrl(next)
    }).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [path])
  if (!url) return null
  return (
    <button type="button" className="chat-photo" aria-label={t("View photo")} onClick={() => onOpen?.(url)}>
      <img src={url} alt="" />
    </button>
  )
}

export function ChatScreen({
  workspaceId = '',
  memberId = '',
  canManage = false,
  inboxRows = [],
  onRefreshInbox,
  onThreadChange,
  initialConversationId = '',
  layout = '',
}) {
  const ordered = useMemo(() => orderInbox(inboxRows), [inboxRows])
  const restoredSession = useRef(readChatSession())
  const [members, setMembers] = useState([])
  const [nameHints, setNameHints] = useState({ byConversation: {}, byMessage: {} })
  const refreshAvatars = useAvatarDirectory().refresh
  const [openId, setOpenId] = useState(initialConversationId || restoredSession.current.openId || '')
  const [messages, setMessages] = useState([])
  const [pinned, setPinned] = useState([])
  const [participants, setParticipants] = useState([])
  const [reactions, setReactions] = useState([])
  const [draft, setDraft] = useState(restoredSession.current.draft || '')
  const [replyTo, setReplyTo] = useState(null)
  const [editing, setEditing] = useState(null)
  const [sheet, setSheet] = useState(null)
  const [activeMessage, setActiveMessage] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [channelName, setChannelName] = useState('')
  const [channelPolicy, setChannelPolicy] = useState('all')
  const [channelIcon, setChannelIcon] = useState('')
  const [pickedMembers, setPickedMembers] = useState([])
  const [query, setQuery] = useState('')
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [viewerUrl, setViewerUrl] = useState('')
  const [someoneTyping, setSomeoneTyping] = useState(false)
  const [swipeX, setSwipeX] = useState(0)
  const [showJump, setShowJump] = useState(false)
  const [jumpCount, setJumpCount] = useState(0)
  const [scrollReadyId, setScrollReadyId] = useState('')
  const [outgoingPhoto, setOutgoingPhoto] = useState(null)
  const [directQuery, setDirectQuery] = useState('')
  const [memberQuery, setMemberQuery] = useState('')
  const fileRef = useRef(null)
  const scrollerRef = useRef(null)
  const logRef = useRef(null)
  const draftRef = useRef(null)
  const pressTimer = useRef(0)
  const swipeRef = useRef(null)
  const typingRef = useRef(null)
  const stickToBottomRef = useRef(true)
  const knownIdsRef = useRef([])
  const pendingRef = useRef(0)
  const forceBottomRef = useRef(false)
  const landedForRef = useRef('')
  const preserveRef = useRef(null)
  const inboxUnreadRef = useRef(0)

  const membersById = useMemo(
    () => Object.fromEntries(members.map((member) => [member.id, member])),
    [members],
  )
  const openRow = ordered.find((row) => row.conversation_id === openId) || null
  inboxUnreadRef.current = Number(openRow?.unread) || 0
  const wideLayout = useWideChatLayout(layout)
  const resolvedLayout = wideLayout ? 'split' : 'stack'
  const showList = resolvedLayout === 'split' || !openId
  const showThread = resolvedLayout === 'split' || Boolean(openId)
  const cannotPost = openRow?.post_policy === 'managers' && !canManage
  const aliases = useMemo(() => {
    const map = { ...(nameHints.byConversation || {}) }
    for (const [conversationId, name] of Object.entries(nameHints.byConversation || {})) {
      const row = ordered.find((item) => item.conversation_id === conversationId)
      if (row?.other_member_id && name) map[row.other_member_id] = name
    }
    for (const message of messages) {
      const name = nameHints.byMessage?.[message.id]
      if (name && message.author_member_id) map[message.author_member_id] = name
    }
    return map
  }, [messages, nameHints, ordered])
  const listed = useMemo(() => {
    const withHistory = ordered.filter((row) => (
      row.conversation_id === openId
      || row.kind !== 'direct'
      || Boolean(`${row.last_body ?? ''}`.trim() || row.last_message_at)
    ))
    return filterInboxByName(withHistory, query, membersById, aliases)
  }, [aliases, membersById, openId, ordered, query])

  useEffect(() => {
    if (!workspaceId) return undefined
    let cancelled = false
    refreshAvatars?.()
    Promise.all([
      fetchChatMembers(workspaceId).catch((error) => {
        console.warn('[chat] members', error)
        return []
      }),
      fetchChatNameHints(workspaceId).catch(() => []),
    ]).then(([nextMembers, notifications]) => {
      if (cancelled) return
      setMembers(nextMembers)
      setNameHints(chatIdentityHints(notifications))
    })
    return () => {
      cancelled = true
    }
  }, [refreshAvatars, workspaceId])

  useEffect(() => {
    if (initialConversationId) setOpenId(initialConversationId)
  }, [initialConversationId])

  useEffect(() => {
    onThreadChange?.(Boolean(openId))
    return () => onThreadChange?.(false)
  }, [onThreadChange, openId])

  const openIdRef = useRef(openId)
  openIdRef.current = openId
  const refreshRef = useRef(onRefreshInbox)
  refreshRef.current = onRefreshInbox

  const loadConversation = useCallback(async (conversationId, { before = '' } = {}) => {
    if (!conversationId) return
    const [page, pins, people] = await Promise.all([
      fetchChatMessages(conversationId, { before }),
      before ? Promise.resolve(null) : fetchPinnedChatMessages(conversationId),
      before ? Promise.resolve(null) : fetchChatParticipants(conversationId),
    ])
    if (openIdRef.current !== conversationId) return
    const older = [...page].reverse()
    if (before && scrollerRef.current) {
      preserveRef.current = {
        height: scrollerRef.current.scrollHeight,
        top: scrollerRef.current.scrollTop,
      }
    }
    setHasMore(page.length === 50)
    setMessages((current) => (before ? [...older, ...current] : older))
    if (pins) setPinned(pins)
    if (people) setParticipants(people)
    const reactionRows = await fetchChatReactions(older.map((message) => message.id))
    if (openIdRef.current !== conversationId) return
    setReactions((current) => {
      if (!before) return reactionRows
      const ids = new Set(older.map((message) => message.id))
      return [...current.filter((row) => !ids.has(row.message_id)), ...reactionRows]
    })
    if (!before) {
      setScrollReadyId(conversationId)
      await markChatRead(conversationId)
      refreshRef.current?.()
    }
  }, [])

  const loadRef = useRef(loadConversation)
  loadRef.current = loadConversation

  useEffect(() => {
    landedForRef.current = ''
    knownIdsRef.current = []
    pendingRef.current = 0
    forceBottomRef.current = false
    setScrollReadyId('')
    setShowJump(false)
    setJumpCount(0)
    if (!openId) return undefined
    let cancelled = false
    setError('')
    loadRef.current(openId).catch((err) => {
      if (!cancelled) setError(err?.message || t("Unable to open this chat."))
    })
    return () => {
      cancelled = true
    }
  }, [openId])

  useEffect(() => {
    if (!openId) return undefined
    return subscribeToChatConversation(openId, {
      onMessage: () => {
        loadRef.current(openId).catch(() => {})
      },
      onReaction: () => {
        loadRef.current(openId).catch(() => {})
      },
      onParticipant: (row) => {
        if (!row) return
        setParticipants((current) => {
          const rest = current.filter((participant) => participant.member_id !== row.member_id)
          return [...rest, row]
        })
      },
    })
  }, [openId])

  useEffect(() => {
    if (!openId || !memberId) return undefined
    setSomeoneTyping(false)
    const typing = subscribeToChatTyping(openId, memberId, setSomeoneTyping)
    typingRef.current = typing
    return () => {
      typingRef.current = null
      typing?.stop?.()
      setSomeoneTyping(false)
    }
  }, [memberId, openId])

  useEffect(() => {
    const node = draftRef.current
    if (!node) return
    node.style.height = 'auto'
    node.style.height = `${Math.min(node.scrollHeight, 120)}px`
  }, [draft, openId])

  useKeyboardInset(true)

  useEffect(() => {
    const node = scrollerRef.current
    if (!node) return
    node.dataset.chatStick = stickToBottomRef.current ? '1' : '0'
  })

  useEffect(() => {
    writeChatSession({ openId, draft })
  }, [draft, openId])

  const pinToLatest = ({ force = false } = {}) => {
    forceBottomRef.current = force
    stickToBottomRef.current = true
    pendingRef.current = 0
    setJumpCount(0)
    setShowJump(false)
    scrollChatToBottom(scrollerRef.current, 'auto')
  }

  useEffect(() => {
    if (!openId || scrollReadyId !== openId) return undefined
    const node = scrollerRef.current
    if (!node) return undefined
    const nextIds = messages.map((message) => message.id)
    const opening = landedForRef.current !== openId
    const me = participants.find((person) => `${person.member_id}` === `${memberId}`)
    const unreadId = firstUnreadMessageId(messages, {
      memberId,
      lastReadAt: me?.last_read_at,
      inboxUnread: inboxUnreadRef.current,
    })
    const metrics = readChatScrollMetrics(node)
    const plan = planChatScrollUpdate({
      opening,
      forceBottom: forceBottomRef.current,
      stick: stickToBottomRef.current,
      pendingCount: pendingRef.current,
      previousIds: knownIdsRef.current,
      nextIds,
      distance: metrics.distance,
      clientHeight: metrics.clientHeight,
      unreadId,
    })
    knownIdsRef.current = nextIds
    forceBottomRef.current = false
    if (opening) landedForRef.current = openId

    if (plan.action === 'unread') scrollChatToMessage(node, plan.unreadId)
    else if (plan.action === 'bottom-smooth') scrollChatToBottom(node, 'smooth')
    else if (plan.action === 'bottom-instant') scrollChatToBottom(node, 'auto')
    else if (plan.action === 'preserve' && preserveRef.current) {
      node.scrollTop = preservedScrollTop(
        preserveRef.current.height,
        preserveRef.current.top,
        node.scrollHeight,
      )
      preserveRef.current = null
    }

    if (plan.action === 'unread') {
      const applyUnread = () => {
        const measured = readChatScrollMetrics(node)
        const position = planChatScrollPosition({
          distance: measured.distance,
          clientHeight: measured.clientHeight,
          pendingCount: 0,
        })
        stickToBottomRef.current = position.stick
        pendingRef.current = 0
        setJumpCount(0)
        setShowJump(position.showButton)
      }
      applyUnread()
      const frame = window.requestAnimationFrame(applyUnread)
      return () => window.cancelAnimationFrame(frame)
    } else if (plan.action === 'hold' || plan.action === 'preserve') {
      stickToBottomRef.current = false
      pendingRef.current = plan.pendingCount
      setJumpCount(plan.pendingCount)
      setShowJump(plan.showButton)
    } else {
      stickToBottomRef.current = true
      pendingRef.current = 0
      setJumpCount(0)
      setShowJump(false)
    }

    return undefined
  }, [memberId, messages, openId, participants, scrollReadyId])

  useEffect(() => {
    const log = logRef.current
    if (!log || scrollReadyId !== openId || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => {
      const node = scrollerRef.current
      if (!node || !stickToBottomRef.current) return
      node.scrollTop = node.scrollHeight
    })
    observer.observe(log)
    return () => observer.disconnect()
  }, [openId, scrollReadyId])

  const openActions = (message) => {
    setActiveMessage(message)
    setSheet('actions')
  }

  const send = async () => {
    const body = clipChatBody(draft).trim()
    if (!openId || busy || cannotPost) return
    if (!body && !editing) return
    setBusy(true)
    setError('')
    try {
      if (editing) {
        await editChatMessage(editing.id, body)
        setEditing(null)
      } else {
        pinToLatest({ force: true })
        await sendChatMessage({
          conversationId: openId,
          body: body || null,
          replyToId: replyTo?.id || null,
        })
        setReplyTo(null)
      }
      setDraft('')
      await loadConversation(openId)
    } catch (err) {
      forceBottomRef.current = false
      setError(err?.message || t("Unable to send that message."))
    } finally {
      setBusy(false)
    }
  }

  const onPhoto = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !openId || cannotPost) return
    const localUrl = URL.createObjectURL(file)
    setOutgoingPhoto({ url: localUrl, status: 'sending' })
    setBusy(true)
    setError('')
    pinToLatest({ force: true })
    try {
      const uploaded = await uploadChatPhoto({ workspaceId, conversationId: openId, file })
      const caption = clipChatBody(draft).trim()
      await sendChatMessage({
        conversationId: openId,
        body: caption || null,
        attachmentPath: uploaded.path,
        attachmentMeta: uploaded.meta,
        replyToId: replyTo?.id || null,
      })
      setDraft('')
      setReplyTo(null)
      setOutgoingPhoto(null)
      URL.revokeObjectURL(localUrl)
      await loadConversation(openId)
    } catch (err) {
      forceBottomRef.current = false
      setOutgoingPhoto({ url: localUrl, status: 'failed' })
      setError(err?.message || t("That photo could not be sent."))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    typingRef.current?.setTyping(Boolean(draft.trim()) && !editing)
  }, [draft, editing])

  const copyMessage = async (message) => {
    const text = `${message?.body ?? ''}`.trim()
    try {
      await navigator.clipboard?.writeText(text)
    } catch {
      // Copy stays in the menu even when the clipboard is blocked.
    }
    setSheet(null)
  }

  const toggleReaction = async (message, emoji) => {
    const mine = reactions.some((row) => row.message_id === message.id && row.member_id === memberId && row.emoji === emoji)
    try {
      if (mine) await removeChatReaction({ messageId: message.id, memberId, emoji })
      else await addChatReaction({ messageId: message.id, memberId, workspaceId, emoji })
      const next = await fetchChatReactions(messages.map((item) => item.id))
      setReactions(next)
    } catch (err) {
      setError(err?.message || t("Unable to react."))
    }
    setSheet(null)
  }

  const startDirect = async (otherId) => {
    setBusy(true)
    setError('')
    try {
      const conversationId = await getOrCreateDirectChat(workspaceId, otherId)
      await onRefreshInbox?.()
      setOpenId(conversationId)
      setSheet(null)
    } catch (err) {
      setError(err?.message || t("Unable to start that chat."))
    } finally {
      setBusy(false)
    }
  }

  const createChannel = async () => {
    const name = channelName.trim()
    if (!name) return
    setBusy(true)
    try {
      const conversationId = await createChatChannel({
        workspaceId,
        name,
        memberIds: pickedMembers,
        icon: channelIcon.trim() || null,
        postPolicy: channelPolicy,
      })
      setChannelName('')
      setChannelIcon('')
      setChannelPolicy('all')
      setPickedMembers([])
      await onRefreshInbox?.()
      setOpenId(conversationId)
      setSheet(null)
    } catch (err) {
      setError(err?.message || t("Unable to create that channel."))
    } finally {
      setBusy(false)
    }
  }

  const saveMembers = async () => {
    setBusy(true)
    try {
      await setChatChannelMembers(openId, pickedMembers)
      setSheet(null)
      await loadConversation(openId)
    } catch (err) {
      setError(err?.message || t("Unable to update members."))
    } finally {
      setBusy(false)
    }
  }

  const applyMute = async (choice) => {
    try {
      await setChatMute(openId, muteUntilValue(choice))
      setSheet(null)
      await onRefreshInbox?.()
    } catch (err) {
      setError(err?.message || t("Unable to change mute."))
    }
  }

  const messagesById = useMemo(
    () => Object.fromEntries(messages.map((message) => [message.id, message])),
    [messages],
  )

  const isPanelSheet = sheet === 'direct' || sheet === 'channel'
  const panelTitle = sheet === 'channel' ? t("New channel") : t("New chat")
  const directPeople = members.filter((member) => member.id !== memberId && member.name?.toLowerCase().includes(directQuery.trim().toLowerCase()))
  const channelPeople = members.filter((member) => member.id !== memberId && `${member.name ?? ''} ${member.email ?? ''}`.toLowerCase().includes(memberQuery.trim().toLowerCase()))

  return (
    <div
      className={`chat-screen${resolvedLayout === 'split' ? ' is-split' : ''}`}
    >
      {showList ? (
        <section className="chat-list" aria-label={t("Chats")}>
          <header className="chat-list-header">
            <h2>{t("Chat")}</h2>
            <div className="chat-header-actions">
              {canManage ? (
                <button type="button" className="chat-header-action" aria-label={t("New channel")} title={t("New channel")} data-help="chat.channel" onClick={() => setSheet('channel')}>
                  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                    <path fill="currentColor" d="M18 3v2.3L6.6 8H4a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1l1.2 4.6a1 1 0 0 0 1 .7H9a1 1 0 0 0 1-1.2L9 15.6l9 2.1V20h2V3h-2Zm0 12.6-8-1.9V9.4l8-1.9v8.1Z" />
                  </svg>
                  <span className="chat-header-action-label">{t("Channel")}</span>
                </button>
              ) : null}
              <button type="button" className="chat-header-action is-primary" aria-label={t("New chat")} title={t("New chat")} data-help="chat.new" onClick={() => setSheet('direct')}>
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                  <path fill="currentColor" d="M12 3C6.5 3 2 6.9 2 11.7c0 2.4 1.1 4.6 3 6.2L4 21.6l4.4-1.9c1.1.4 2.3.6 3.6.6 5.5 0 10-3.9 10-8.6S17.5 3 12 3Zm4 9.7h-3v3h-2v-3H8v-2h3v-3h2v3h3v2Z" />
                </svg>
                <span className="chat-header-action-label">{t("New")}</span>
              </button>
            </div>
          </header>
          <label className="chat-search" data-help="chat.search">
            <span className="sr-only">{t("Search chats")}</span>
            <input
              type="search"
              value={query}
              placeholder={t("Search by name")}
              data-testid="chat-search"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          {error && !openId ? <p className="chat-banner" role="alert">{presentUserError(error, "Couldn't load chat. Check your connection and try again.")}</p> : null}
          <div className="chat-list-scroll">
            {listed.length === 0 ? (
              <p className="chat-empty">{query.trim() ? `No chats named “${query.trim()}”.` : t("No chats yet. Start one with New.")}</p>
            ) : null}
            {listed.map((row) => {
              const title = conversationTitle(row, membersById, aliases)
              const person = membersById[row.other_member_id]
              const color = getIdentityColorById(person?.identityColor)
              const when = lastMessageTimeLabel(row.last_message_at)
              return (
                <button
                  key={row.conversation_id}
                  type="button"
                  className={`chat-row${row.kind === 'team' ? ' is-pinned' : ''}${row.conversation_id === openId ? ' is-active' : ''}`}
                  onClick={() => {
                    stickToBottomRef.current = true
                    writeChatSession({ openId: row.conversation_id, scrollTop: 0 })
                    setOpenId(row.conversation_id)
                  }}
                >
                  <span
                    className="chat-avatar"
                    style={color ? { '--chat-ring': color.ring, '--chat-ink': color.text } : undefined}
                    aria-hidden="true"
                  >
                    {row.kind === 'direct' ? (
                      <PersonAvatar
                        memberId={row.other_member_id}
                        employeeId={person?.employeeId}
                        authUserId={person?.authUserId}
                        name={title}
                        fallback={row.icon || initials(title)}
                      />
                    ) : (row.icon || initials(title))}
                  </span>
                  <span className="chat-row-copy">
                    <span className="chat-row-line">
                      <strong>{title}</strong>
                      {when ? <time className={`chat-row-time${!row.muted && Number(row.unread) > 0 ? ' is-unread' : ''}`} dateTime={row.last_message_at}>{when}</time> : null}
                    </span>
                    <span className="chat-row-line">
                      <span className="chat-row-preview">{lastMessagePreview(row)}</span>
                      {row.muted ? (
                        <span className="chat-muted" title={t("Muted")}>
                          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                            <path fill="currentColor" d="M12 22a2.2 2.2 0 0 0 2.2-2h-4.4A2.2 2.2 0 0 0 12 22Zm6-6V11a6 6 0 0 0-5-5.9V4a1 1 0 1 0-2 0v1.1A6 6 0 0 0 6 11v5l-1.7 1.7A1 1 0 0 0 5 19.4h14a1 1 0 0 0 .7-1.7L18 16Z" />
                            <path fill="currentColor" d="M4.3 3.3 3 4.6 19.4 21l1.3-1.3L4.3 3.3Z" />
                          </svg>
                          <span className="sr-only">{t("Muted")}</span>
                        </span>
                      ) : null}
                      {!row.muted && Number(row.unread) > 0 ? (
                        <span className="chat-badge">{Number(row.unread) > 9 ? '9+' : row.unread}</span>
                      ) : null}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      ) : null}

      {showThread ? (
        <section className="chat-thread-pane" aria-label={t("Conversation")}>
          <header className="chat-thread-header">
            {resolvedLayout !== 'split' ? (
              <button type="button" className="chat-icon-btn chat-back-btn" aria-label={t("Back")} data-help="chat.back" onClick={() => setOpenId('')}>
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                  <path fill="currentColor" d="M15.4 19.4 8 12l7.4-7.4 1.4 1.4L10.8 12l6 6z" />
                </svg>
              </button>
            ) : null}
            <h2 className="chat-thread-title">
              <button
                type="button"
                className="chat-thread-title-btn"
                data-help="chat.info"
                disabled={!openId}
                onClick={() => openId && setSheet('info')}
              >
              {openRow?.kind === 'direct' ? (
                <span className="chat-avatar chat-avatar-inline" aria-hidden="true">
                  <PersonAvatar
                    memberId={openRow.other_member_id}
                    employeeId={membersById[openRow.other_member_id]?.employeeId}
                    authUserId={membersById[openRow.other_member_id]?.authUserId}
                    name={conversationTitle(openRow, membersById, aliases)}
                    fallback={initials(conversationTitle(openRow, membersById, aliases))}
                  />
                </span>
              ) : openRow ? (
                <span className="chat-avatar chat-avatar-inline" aria-hidden="true">{openRow.icon || initials(conversationTitle(openRow, membersById, aliases))}</span>
              ) : null}
              <span>{openRow ? conversationTitle(openRow, membersById, aliases) : t("Choose a chat")}</span>
              </button>
            </h2>
            {openId ? (
              <button
                type="button"
                className="chat-icon-btn chat-mute-btn"
                aria-label={t("Mute")}
                aria-pressed={Boolean(openRow?.muted)}
                data-help="chat.mute"
                onClick={() => setSheet('mute')}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                  <path fill="currentColor" d="M12 22a2.2 2.2 0 0 0 2.2-2h-4.4A2.2 2.2 0 0 0 12 22Zm6-6V11a6 6 0 0 0-5-5.9V4a1 1 0 1 0-2 0v1.1A6 6 0 0 0 6 11v5l-1.7 1.7A1 1 0 0 0 5 19.4h14a1 1 0 0 0 .7-1.7L18 16Z" />
                  {openRow?.muted ? <path fill="currentColor" d="M4.3 3.3 3 4.6 19.4 21l1.3-1.3L4.3 3.3Z" /> : null}
                </svg>
              </button>
            ) : null}
            {openId && canManage && openRow?.kind === 'group' ? (
              <button
                type="button"
                className="chat-icon-btn"
                onClick={() => {
                  setPickedMembers(participants.filter((person) => !person.left_at).map((person) => person.member_id))
                  setSheet('members')
                }}
              >
                {t("Members")}
              </button>
            ) : null}
          </header>
          {error && openId ? <p className="chat-banner" role="alert">{presentUserError(error, "Couldn't load chat. Check your connection and try again.")}</p> : null}
          {pinned.length > 0 ? (
            <div className="chat-pinned" aria-label={t("Pinned messages")}>
              {pinned.map((message) => (
                <button key={message.id} type="button" onClick={() => document.getElementById(`chat-message-${message.id}`)?.scrollIntoView({ block: 'center' })}>
                  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                    <path fill="currentColor" d="M16 3v2h-1v6l2 3v2h-4v5l-1 1-1-1v-5H7v-2l2-3V5H8V3h8Z" />
                  </svg>
                  <span>{message.body || 'Photo'}</span>
                </button>
              ))}
            </div>
          ) : null}
          <div className="chat-messages-wrap">
          <div
            className="chat-messages"
            ref={scrollerRef}
            onScroll={(event) => {
              const node = event.currentTarget
              if (node.dataset.chatHold === '1') {
                stickToBottomRef.current = true
                node.dataset.chatStick = '1'
                return
              }
              const metrics = readChatScrollMetrics(node)
              const position = planChatScrollPosition({
                distance: metrics.distance,
                clientHeight: metrics.clientHeight,
                pendingCount: pendingRef.current,
              })
              stickToBottomRef.current = position.stick
              node.dataset.chatStick = position.stick ? '1' : '0'
              pendingRef.current = position.pendingCount
              setJumpCount(position.pendingCount)
              setShowJump(position.showButton)
              writeChatSession({ scrollTop: node.scrollTop, openId })
            }}
          >
            <div className="chat-log" ref={logRef}>
            {hasMore ? (
              <button
                type="button"
                className="chat-icon-btn"
                onClick={() => loadConversation(openId, { before: messages[0]?.created_at }).catch((err) => setError(err.message))}
              >
                {t("Earlier messages")}
              </button>
            ) : null}
            {messages.map((message, index) => {
              const previous = messages[index - 1]
              const showDay = !previous || dayLabel(previous.created_at) !== dayLabel(message.created_at)
              const mine = message.author_member_id === memberId
              const deleted = Boolean(message.deleted_at)
              const author = membersById[message.author_member_id]
              const authorName = author?.name || aliases[message.author_member_id] || ''
              const reply = message.reply_to_id ? messagesById[message.reply_to_id] : null
              const grouped = groupReactions(reactions.filter((row) => row.message_id === message.id), memberId)
              const seen = seenReceiptText(messages, index, memberId, participants, membersById, aliases)
              const group = messageGroupPosition(messages, index)
              const tick = readTickState(message, memberId, participants)
              const showAvatar = !mine && (group === 'single' || group === 'last')
              return (
                <div key={message.id} id={`chat-message-${message.id}`} className="chat-message-wrap">
                  {showDay ? <p className="chat-day">{dayLabel(message.created_at)}</p> : null}
                  <div className={`chat-message is-group-${group}${mine ? ' is-mine' : ''}`}>
                  {!mine ? (
                    <span className={`chat-avatar chat-avatar-inline${showAvatar ? '' : ' is-spacer'}`} aria-hidden="true">
                      {showAvatar ? (
                        <PersonAvatar
                          memberId={message.author_member_id}
                          employeeId={author?.employeeId}
                          authUserId={author?.authUserId}
                          name={authorName}
                          fallback={initials(authorName)}
                        />
                      ) : null}
                    </span>
                  ) : null}
                  <div className="chat-message-stack">
                  <article
                    className={`chat-bubble is-group-${group}${mine ? ' is-mine' : ''}${deleted ? ' is-deleted' : ''}`}
                    style={swipeRef.current?.id === message.id ? { transform: `translateX(${swipeX}px)` } : undefined}
                    onContextMenu={(event) => {
                      event.preventDefault()
                      if (!deleted) openActions(message)
                    }}
                    onPointerDown={(event) => {
                      window.clearTimeout(pressTimer.current)
                      swipeRef.current = { id: message.id, x: event.clientX, y: event.clientY }
                      pressTimer.current = window.setTimeout(() => {
                        if (!deleted) openActions(message)
                      }, 450)
                    }}
                    onPointerMove={(event) => {
                      const start = swipeRef.current
                      if (!start || start.id !== message.id || deleted) return
                      const dx = event.clientX - start.x
                      const dy = event.clientY - start.y
                      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
                        window.clearTimeout(pressTimer.current)
                        setSwipeX(Math.max(0, Math.min(72, dx)))
                      }
                    }}
                    onPointerUp={() => {
                      window.clearTimeout(pressTimer.current)
                      if (swipeX > 48 && !deleted) setReplyTo(message)
                      swipeRef.current = null
                      setSwipeX(0)
                    }}
                    onPointerCancel={() => {
                      window.clearTimeout(pressTimer.current)
                      swipeRef.current = null
                      setSwipeX(0)
                    }}
                  >
                    {!mine && authorName && (group === 'single' || group === 'first') ? <p className="chat-meta">{authorName}</p> : null}
                    {reply ? (
                      <p className="chat-reply-quote">
                        <strong>{membersById[reply.author_member_id]?.name || aliases[reply.author_member_id] || 'Message'}</strong>
                        <span>{reply.deleted_at ? t("Message deleted") : (reply.body || 'Photo')}</span>
                      </p>
                    ) : null}
                    {!deleted && message.attachment_path ? <ChatPhoto path={message.attachment_path} onOpen={setViewerUrl} /> : null}
                    <p>{deleted ? t("Message deleted") : (message.body || (message.attachment_path ? '' : ''))}</p>
                    <span className="chat-bubble-meta">
                      {message.edited_at && !deleted ? <span>{t("Edited")}</span> : null}
                      <time dateTime={message.created_at}>{lastMessageTimeLabel(message.created_at)}</time>
                      {tick ? <span className={`chat-ticks is-${tick}`} aria-label={tick === 'read' ? 'Read' : 'Sent'}>{tick === 'read' ? '✓✓' : '✓'}</span> : null}
                    </span>
                    {!deleted && grouped.length > 0 ? (
                      <div className="chat-reactions">
                        {grouped.map((reaction) => (
                          <button
                            key={reaction.emoji}
                            type="button"
                            className={reaction.mine ? 'is-mine' : ''}
                            onClick={() => toggleReaction(message, reaction.emoji)}
                          >
                            {reaction.emoji} {reaction.count}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </article>
                  {seen ? <p className="chat-seen">{seen}</p> : null}
                  </div>
                  </div>
                </div>
              )
            })}
            {someoneTyping ? <p className="chat-typing" role="status">{t("Typing…")}</p> : null}
            </div>
          </div>
          {showJump ? (
            <button
              type="button"
              className="chat-scroll-bottom"
              data-testid="chat-scroll-bottom"
              aria-label={jumpCount > 0 ? `Scroll to latest, ${jumpCount} new` : t("Scroll to latest")}
              onClick={() => pinToLatest()}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                <path fill="currentColor" d="M6.7 8.6 5.3 10l6.7 6.7L18.7 10l-1.4-1.4L12 14.6z" />
              </svg>
              {jumpCount > 0 ? (
                <span className="chat-scroll-badge" data-testid="chat-scroll-badge">
                  {jumpCount > 99 ? '99+' : jumpCount}
                </span>
              ) : null}
            </button>
          ) : null}
          </div>
          {openId ? (
            <form
              className="chat-composer"
              onSubmit={(event) => {
                event.preventDefault()
                send()
              }}
            >
              {replyTo ? (
                <p className="chat-compose-quote">
                  <span>
                    <strong>{membersById[replyTo.author_member_id]?.name || aliases[replyTo.author_member_id] || 'Message'}</strong>
                    {replyTo.body || 'Photo'}
                  </span>
                  <button type="button" aria-label={t("Cancel reply")} onClick={() => setReplyTo(null)}>✕</button>
                </p>
              ) : null}
              {outgoingPhoto ? (
                <p className="chat-photo-preview">
                  <img src={outgoingPhoto.url} alt="" />
                  <span>{outgoingPhoto.status === 'failed' ? t("Photo failed") : t("Sending photo…")}</span>
                </p>
              ) : null}
              {editing ? <p className="chat-meta">{t("Editing your message")}</p> : null}
              {cannotPost ? <p className="chat-meta">{t("Only managers can post in this channel.")}</p> : null}
              {emojiOpen ? (
                <div className="chat-emoji-picker" role="listbox" aria-label={t("Emoji")}>
                  {CHAT_COMPOSER_EMOJIS.map((emoji) => (
                    <button key={emoji} type="button" onClick={() => setDraft((current) => clipChatBody(`${current}${emoji}`))}>{emoji}</button>
                  ))}
                </div>
              ) : null}
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
                hidden
                onChange={onPhoto}
              />
              <div className="chat-composer-field">
                <button type="button" className="chat-composer-emoji" aria-label={t("Emoji")} data-help="chat.emoji" aria-pressed={emojiOpen} disabled={cannotPost} onClick={() => setEmojiOpen((current) => !current)}>
                  ☺
                </button>
                <textarea
                  ref={draftRef}
                  aria-label={t("Message")}
                  data-help="chat.message"
                  value={draft}
                  maxLength={4000}
                  rows={1}
                  disabled={cannotPost}
                  placeholder={t("Message")}
                  onChange={(event) => setDraft(clipChatBody(event.target.value))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      send()
                    }
                  }}
                />
                <button type="button" className="chat-composer-photo" aria-label={t("Photo")} data-help="chat.photo" disabled={cannotPost || busy} onClick={() => fileRef.current?.click()}>
                  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                    <path fill="currentColor" d="M9 4 7.2 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3.2L15 4H9Zm3 13a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z" />
                  </svg>
                </button>
              </div>
              <button type="submit" className="chat-send" aria-label={t("Send")} data-help="chat.send" disabled={busy || cannotPost || !draft.trim()}>
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                  <path fill="currentColor" d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              </button>
            </form>
          ) : (
            <p className="chat-empty">{t("Pick a chat to start.")}</p>
          )}
        </section>
      ) : null}

      {sheet ? createPortal((
        <div className={`chat-sheet-backdrop${isPanelSheet ? ' is-panel' : ''}`} role="presentation" onClick={() => setSheet(null)}>
          <div className={`chat-sheet${isPanelSheet ? ' is-panel' : ''}`} role="dialog" aria-label={isPanelSheet ? panelTitle : t("Chat actions")} onClick={(event) => event.stopPropagation()}>
            {isPanelSheet ? (
              <div className="chat-sheet-head">
                <span className="chat-sheet-grab" aria-hidden="true" />
                <h3>{panelTitle}</h3>
                <button type="button" className="chat-sheet-close" aria-label={t("Close")} onClick={() => setSheet(null)}>
                  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                    <path fill="currentColor" d="M18.3 5.7 16.9 4.3 12 9.2 7.1 4.3 5.7 5.7 10.6 10.6 5.7 15.5l1.4 1.4 4.9-4.9 4.9 4.9 1.4-1.4-4.9-4.9z" />
                  </svg>
                </button>
              </div>
            ) : null}
            {sheet === 'actions' && activeMessage ? (
              <>
                <div className="chat-emoji-row">
                  {CHAT_EMOJIS.map((emoji) => (
                    <button key={emoji} type="button" onClick={() => toggleReaction(activeMessage, emoji)}>{emoji}</button>
                  ))}
                </div>
                <button type="button" onClick={() => { setReplyTo(activeMessage); setSheet(null) }}>{t("Reply")}</button>
                <button type="button" onClick={() => copyMessage(activeMessage)}>{t("Copy")}</button>
                {canEditChatMessage(activeMessage, memberId) ? (
                  <button type="button" onClick={() => { setEditing(activeMessage); setDraft(activeMessage.body || ''); setSheet(null) }}>{t("Edit")}</button>
                ) : null}
                {canDeleteChatMessage(activeMessage, memberId, canManage) ? (
                  <button type="button" onClick={async () => {
                    await deleteChatMessage(activeMessage.id)
                    setSheet(null)
                    loadConversation(openId).catch(() => {})
                  }}>{t("Delete")}</button>
                ) : null}
                {canManage ? (
                  <button type="button" onClick={async () => {
                    await setChatPinned(activeMessage.id, !activeMessage.pinned_at)
                    setSheet(null)
                    loadConversation(openId).catch(() => {})
                  }}>{activeMessage.pinned_at ? 'Unpin' : 'Pin'}</button>
                ) : null}
              </>
            ) : null}
            {sheet === 'direct' ? (
              <>
                <label className="chat-sheet-search">
                  <span className="sr-only">{t("Search people")}</span>
                  <input
                    type="search"
                    value={directQuery}
                    onChange={(event) => setDirectQuery(event.target.value)}
                    placeholder={t("Search people")}
                    aria-label={t("Search people")}
                  />
                </label>
                <div className="chat-sheet-body">
                  {directPeople.length === 0 ? <p className="chat-sheet-empty">No one matches “{directQuery.trim()}”.</p> : null}
                  {directPeople.map((member) => {
                    const existing = ordered.find((row) => row.kind === 'direct' && row.other_member_id === member.id)
                    return (
                      <button
                        key={member.id}
                        type="button"
                        className="chat-person-row"
                        disabled={busy}
                        onClick={() => {
                          if (existing) {
                            stickToBottomRef.current = true
                            setOpenId(existing.conversation_id)
                            setSheet(null)
                            return
                          }
                          startDirect(member.id)
                        }}
                      >
                        <span className="chat-avatar" aria-hidden="true">
                          <PersonAvatar memberId={member.id} employeeId={member.employeeId} authUserId={member.authUserId} name={member.name} fallback={initials(member.name)} />
                        </span>
                        <span className="chat-person-copy">
                          <strong>{member.name}</strong>
                          {member.role ? <span>{member.role}</span> : null}
                        </span>
                        {existing ? <span className="chat-person-badge">{t("Open chat")}</span> : null}
                        <svg className="chat-person-chevron" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                          <path fill="currentColor" d="m9.4 18-1.4-1.4 4.6-4.6L8 7.4 9.4 6l6 6z" />
                        </svg>
                      </button>
                    )
                  })}
                </div>
              </>
            ) : null}
            {sheet === 'channel' ? (
              <>
                <div className="chat-sheet-body">
                  <div className="chat-channel-top">
                    <span className="chat-channel-icon-preview" aria-hidden="true">{channelIcon.trim() || '#'}</span>
                    <label className="chat-field chat-channel-name">
                      {t("Channel name")}
                      <input value={channelName} onChange={(event) => setChannelName(event.target.value)} placeholder={t("e.g. Kitchen")} />
                    </label>
                  </div>
                  <div className="chat-field">
                    <span id="chat-channel-icon-label">{t("Icon (optional)")}</span>
                    <div className="chat-icon-picker" role="group" aria-labelledby="chat-channel-icon-label">
                      {CHANNEL_ICON_CHOICES.map((icon) => (
                        <button
                          key={icon}
                          type="button"
                          aria-pressed={channelIcon === icon}
                          className={channelIcon === icon ? 'is-on' : ''}
                          onClick={() => setChannelIcon(channelIcon === icon ? '' : icon)}
                        >
                          {icon}
                        </button>
                      ))}
                      <input
                        aria-label={t("Icon")}
                        value={channelIcon}
                        onChange={(event) => setChannelIcon(event.target.value)}
                        placeholder={t("Other")}
                        maxLength={8}
                      />
                    </div>
                  </div>
                  <div className="chat-field">
                    <span id="chat-channel-policy-label">{t("Who can post")}</span>
                    <div className="chat-segmented" role="radiogroup" aria-labelledby="chat-channel-policy-label">
                      <button type="button" role="radio" aria-checked={channelPolicy === 'all'} className={channelPolicy === 'all' ? 'is-on' : ''} onClick={() => setChannelPolicy('all')}>
                        {t("Everyone can post")}
                      </button>
                      <button type="button" role="radio" aria-checked={channelPolicy === 'managers'} className={channelPolicy === 'managers' ? 'is-on' : ''} onClick={() => setChannelPolicy('managers')}>
                        {t("Announcements only")}
                      </button>
                    </div>
                  </div>
                  <div className="chat-members-head">
                    <span>{t("Members")}</span>
                    <span className="chat-members-count">{pickedMembers.length} selected</span>
                  </div>
                  <label className="chat-sheet-search">
                    <span className="sr-only">{t("Search members")}</span>
                    <input type="search" value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} placeholder={t("Search members")} aria-label={t("Search members")} />
                  </label>
                  {channelPeople.map((member) => {
                    const on = pickedMembers.includes(member.id)
                    return (
                      <label key={member.id} className={`chat-person-row chat-pick-row${on ? ' is-on' : ''}`}>
                        <span className="chat-avatar" aria-hidden="true">
                          <PersonAvatar memberId={member.id} employeeId={member.employeeId} authUserId={member.authUserId} name={member.name} fallback={initials(member.name)} />
                        </span>
                        <span className="chat-person-copy">
                          <strong>{member.name}</strong>
                          {member.role ? <span>{member.role}</span> : null}
                        </span>
                        <input
                          type="checkbox"
                          className="chat-round-check"
                          checked={on}
                          onChange={(event) => {
                            setPickedMembers((current) => (
                              event.target.checked
                                ? [...current, member.id]
                                : current.filter((id) => id !== member.id)
                            ))
                          }}
                        />
                      </label>
                    )
                  })}
                  {channelPeople.length === 0 ? <p className="chat-sheet-empty">No one matches “{memberQuery.trim()}”.</p> : null}
                </div>
                <div className="chat-sheet-footer">
                  <button type="button" className="chat-sheet-primary" disabled={busy || !channelName.trim()} onClick={createChannel}>{t("Create channel")}</button>
                </div>
              </>
            ) : null}
            {sheet === 'members' ? (
              <>
                {members.map((member) => (
                  <label key={member.id}>
                    <input
                      type="checkbox"
                      checked={pickedMembers.includes(member.id)}
                      onChange={(event) => {
                        setPickedMembers((current) => (
                          event.target.checked
                            ? [...current, member.id]
                            : current.filter((id) => id !== member.id)
                        ))
                      }}
                    />
                    {member.name}
                  </label>
                ))}
                <button type="button" onClick={saveMembers}>{t("Save members")}</button>
              </>
            ) : null}
            {sheet === 'info' && openRow ? (
              <>
                <p className="chat-sheet-title">{conversationTitle(openRow, membersById, aliases)}</p>
                <p className="chat-meta">{openRow.kind === 'team' ? 'Team' : openRow.kind === 'group' ? 'Channel' : t("Direct message")}</p>
                {participants.filter((person) => !person.left_at).map((person) => (
                  <p key={person.member_id} className="chat-sheet-person">
                    {membersById[person.member_id]?.name || aliases[person.member_id] || 'Member'}
                  </p>
                ))}
                <button type="button" data-help="chat.mute" onClick={() => setSheet('mute')}>{t("Mute")}</button>
                {canManage && openRow.kind === 'group' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPickedMembers(participants.filter((person) => !person.left_at).map((person) => person.member_id))
                      setSheet('members')
                    }}
                  >
                    {t("Members")}
                  </button>
                ) : null}
              </>
            ) : null}
            {sheet === 'mute' ? (
              <>
                <button type="button" onClick={() => applyMute('1h')}>{t("Mute for 1 hour")}</button>
                <button type="button" onClick={() => applyMute('8h')}>{t("Mute for 8 hours")}</button>
                <button type="button" onClick={() => applyMute('tomorrow')}>{t("Mute until tomorrow")}</button>
                <button type="button" onClick={() => applyMute('always')}>{t("Mute always")}</button>
                <button type="button" onClick={() => applyMute('off')}>{t("Unmute")}</button>
              </>
            ) : null}
            {isPanelSheet ? null : <button type="button" onClick={() => setSheet(null)}>{t("Close")}</button>}
          </div>
        </div>
      ), document.body) : null}
      {viewerUrl ? (
        <div className="chat-viewer" role="dialog" aria-label={t("Photo")} onClick={() => setViewerUrl('')}>
          <img src={viewerUrl} alt="" />
        </div>
      ) : null}
    </div>
  )
}
