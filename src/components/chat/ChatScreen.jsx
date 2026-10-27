import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PersonAvatar } from '../identity/PersonAvatar'
import { getIdentityColorById } from '../../lib/identity/identityColorPalette'
import {
  CHAT_EMOJIS,
  canDeleteChatMessage,
  canEditChatMessage,
  clipChatBody,
  conversationTitle,
  dayLabel,
  groupReactions,
  lastMessagePreview,
  muteUntilValue,
  orderInbox,
  seenByLabels,
} from '../../lib/chat'
import {
  addChatReaction,
  chatAttachmentUrl,
  createChatChannel,
  deleteChatMessage,
  editChatMessage,
  fetchChatMembers,
  fetchChatMessages,
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
  uploadChatPhoto,
} from '../../services/chatService'
import './chat.css'

function useWideChatLayout(layout) {
  const [wide, setWide] = useState(() => {
    if (layout === 'split') return true
    if (layout === 'stack') return false
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia('(min-width: 980px)').matches
  })

  useEffect(() => {
    if (layout === 'stack' || layout === 'split') return undefined
    if (typeof window.matchMedia !== 'function') return undefined
    const query = window.matchMedia('(min-width: 980px)')
    const update = () => setWide(query.matches)
    update()
    query.addEventListener?.('change', update)
    return () => query.removeEventListener?.('change', update)
  }, [layout])

  if (layout === 'split') return true
  if (layout === 'stack') return false
  return wide
}

function initials(name) {
  const parts = `${name ?? ''}`.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '•'
}

function ChatPhoto({ path }) {
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
  return <img src={url} alt="" />
}

export function ChatScreen({
  workspaceId = '',
  memberId = '',
  canManage = false,
  inboxRows = [],
  onRefreshInbox,
  initialConversationId = '',
  layout = '',
}) {
  const ordered = useMemo(() => orderInbox(inboxRows), [inboxRows])
  const [members, setMembers] = useState([])
  const [openId, setOpenId] = useState(initialConversationId || '')
  const [messages, setMessages] = useState([])
  const [pinned, setPinned] = useState([])
  const [participants, setParticipants] = useState([])
  const [reactions, setReactions] = useState([])
  const [draft, setDraft] = useState('')
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
  const [keyboardOffset, setKeyboardOffset] = useState(0)
  const fileRef = useRef(null)
  const scrollerRef = useRef(null)
  const pressTimer = useRef(0)

  const membersById = useMemo(
    () => Object.fromEntries(members.map((member) => [member.id, member])),
    [members],
  )
  const openRow = ordered.find((row) => row.conversation_id === openId) || null
  const wideLayout = useWideChatLayout(layout)
  const resolvedLayout = wideLayout ? 'split' : 'stack'
  const showList = resolvedLayout === 'split' || !openId
  const showThread = resolvedLayout === 'split' || Boolean(openId)
  const cannotPost = openRow?.post_policy === 'managers' && !canManage

  useEffect(() => {
    if (!workspaceId) return undefined
    let cancelled = false
    fetchChatMembers(workspaceId).then((next) => {
      if (!cancelled) setMembers(next)
    }).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [workspaceId])

  useEffect(() => {
    if (initialConversationId) setOpenId(initialConversationId)
  }, [initialConversationId])

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
      await markChatRead(conversationId)
      refreshRef.current?.()
    }
  }, [])

  const loadRef = useRef(loadConversation)
  loadRef.current = loadConversation

  useEffect(() => {
    if (!openId) return undefined
    let cancelled = false
    setError('')
    loadRef.current(openId).catch((err) => {
      if (!cancelled) setError(err?.message || 'Unable to open this chat.')
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
    const viewport = window.visualViewport
    if (!viewport) return undefined
    const update = () => {
      const overlap = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      setKeyboardOffset(overlap)
    }
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    update()
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
    }
  }, [])

  useEffect(() => {
    const node = scrollerRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [messages.length, openId])

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
      setError(err?.message || 'Unable to send that message.')
    } finally {
      setBusy(false)
    }
  }

  const onPhoto = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !openId || cannotPost) return
    setBusy(true)
    setError('')
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
      await loadConversation(openId)
    } catch (err) {
      setError(err?.message || 'That photo could not be sent.')
    } finally {
      setBusy(false)
    }
  }

  const toggleReaction = async (message, emoji) => {
    const mine = reactions.some((row) => row.message_id === message.id && row.member_id === memberId && row.emoji === emoji)
    try {
      if (mine) await removeChatReaction({ messageId: message.id, memberId, emoji })
      else await addChatReaction({ messageId: message.id, memberId, workspaceId, emoji })
      const next = await fetchChatReactions(messages.map((item) => item.id))
      setReactions(next)
    } catch (err) {
      setError(err?.message || 'Unable to react.')
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
      setError(err?.message || 'Unable to start that chat.')
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
      setError(err?.message || 'Unable to create that channel.')
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
      setError(err?.message || 'Unable to update members.')
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
      setError(err?.message || 'Unable to change mute.')
    }
  }

  const messagesById = useMemo(
    () => Object.fromEntries(messages.map((message) => [message.id, message])),
    [messages],
  )

  return (
    <div
      className={`chat-screen${resolvedLayout === 'split' ? ' is-split' : ''}`}
      style={{ '--chat-keyboard': `${keyboardOffset}px` }}
    >
      {showList ? (
        <section className="chat-list" aria-label="Chats">
          <header className="chat-list-header">
            <h2>Chat</h2>
            <button type="button" className="chat-icon-btn" onClick={() => setSheet('direct')}>New</button>
            {canManage ? (
              <button type="button" className="chat-icon-btn" onClick={() => setSheet('channel')}>Channel</button>
            ) : null}
          </header>
          {error && !openId ? <p className="chat-banner" role="alert">{error}</p> : null}
          <div className="chat-list-scroll">
            {ordered.length === 0 ? <p className="chat-empty">No chats yet.</p> : null}
            {ordered.map((row) => {
              const title = conversationTitle(row, membersById)
              const color = getIdentityColorById(membersById[row.other_member_id]?.identityColor)
              return (
                <button
                  key={row.conversation_id}
                  type="button"
                  className={`chat-row${row.conversation_id === openId ? ' is-active' : ''}`}
                  onClick={() => setOpenId(row.conversation_id)}
                >
                  <span
                    className="chat-avatar"
                    style={color ? { '--chat-ring': color.ring, '--chat-ink': color.text } : undefined}
                    aria-hidden="true"
                  >
                    {row.kind === 'direct' ? (
                      <PersonAvatar
                        memberId={row.other_member_id}
                        employeeId={membersById[row.other_member_id]?.employeeId}
                        name={title}
                        fallback={row.icon || initials(title)}
                      />
                    ) : (row.icon || initials(title))}
                  </span>
                  <span className="chat-row-copy">
                    <strong>{title}</strong>
                    <span>{lastMessagePreview(row)}</span>
                  </span>
                  {row.muted ? <span className="chat-muted">Muted</span> : null}
                  {!row.muted && Number(row.unread) > 0 ? (
                    <span className="chat-badge">{Number(row.unread) > 9 ? '9+' : row.unread}</span>
                  ) : null}
                </button>
              )
            })}
          </div>
        </section>
      ) : null}

      {showThread ? (
        <section className="chat-thread-pane" aria-label="Conversation">
          <header className="chat-thread-header">
            {resolvedLayout !== 'split' ? (
              <button type="button" className="chat-icon-btn" onClick={() => setOpenId('')}>Back</button>
            ) : null}
            <h2>{openRow ? conversationTitle(openRow, membersById) : 'Choose a chat'}</h2>
            {openId ? (
              <button type="button" className="chat-icon-btn" onClick={() => setSheet('mute')}>Mute</button>
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
                Members
              </button>
            ) : null}
          </header>
          {error && openId ? <p className="chat-banner" role="alert">{error}</p> : null}
          {pinned.length > 0 ? (
            <div className="chat-pinned" aria-label="Pinned messages">
              {pinned.map((message) => (
                <button key={message.id} type="button" onClick={() => document.getElementById(`chat-message-${message.id}`)?.scrollIntoView({ block: 'center' })}>
                  {message.body || 'Photo'}
                </button>
              ))}
            </div>
          ) : null}
          <div className="chat-messages" ref={scrollerRef}>
            {hasMore ? (
              <button
                type="button"
                className="chat-icon-btn"
                onClick={() => loadConversation(openId, { before: messages[0]?.created_at }).catch((err) => setError(err.message))}
              >
                Earlier messages
              </button>
            ) : null}
            {messages.map((message, index) => {
              const previous = messages[index - 1]
              const showDay = !previous || dayLabel(previous.created_at) !== dayLabel(message.created_at)
              const mine = message.author_member_id === memberId
              const deleted = Boolean(message.deleted_at)
              const author = membersById[message.author_member_id]
              const reply = message.reply_to_id ? messagesById[message.reply_to_id] : null
              const grouped = groupReactions(reactions.filter((row) => row.message_id === message.id), memberId)
              const seen = mine && index === messages.length - 1
                ? seenByLabels(participants, message, membersById)
                : []
              return (
                <div key={message.id} id={`chat-message-${message.id}`} className="chat-message-wrap">
                  {showDay ? <p className="chat-day">{dayLabel(message.created_at)}</p> : null}
                  <div className={`chat-message${mine ? ' is-mine' : ''}`}>
                  {!mine ? (
                    <span className="chat-avatar chat-avatar-inline" aria-hidden="true">
                      <PersonAvatar
                        memberId={author?.id}
                        employeeId={author?.employeeId}
                        name={author?.name}
                        fallback={initials(author?.name)}
                      />
                    </span>
                  ) : null}
                  <article
                    className={`chat-bubble${mine ? ' is-mine' : ''}${deleted ? ' is-deleted' : ''}`}
                    onContextMenu={(event) => {
                      event.preventDefault()
                      if (!deleted) openActions(message)
                    }}
                    onPointerDown={() => {
                      window.clearTimeout(pressTimer.current)
                      pressTimer.current = window.setTimeout(() => {
                        if (!deleted) openActions(message)
                      }, 450)
                    }}
                    onPointerUp={() => window.clearTimeout(pressTimer.current)}
                    onPointerLeave={() => window.clearTimeout(pressTimer.current)}
                  >
                    {!mine && author ? <p className="chat-meta">{author.name}</p> : null}
                    {reply ? <p className="chat-reply-quote">{reply.deleted_at ? 'Message deleted' : (reply.body || 'Photo')}</p> : null}
                    {!deleted && message.attachment_path ? <ChatPhoto path={message.attachment_path} /> : null}
                    <p>{deleted ? 'Message deleted' : (message.body || (message.attachment_path ? '' : ''))}</p>
                    {message.edited_at && !deleted ? <p className="chat-meta">Edited</p> : null}
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
                    {seen.length > 0 ? <p className="chat-meta">Seen by {seen.join(', ')}</p> : null}
                  </article>
                  </div>
                </div>
              )
            })}
          </div>
          {openId ? (
            <form
              className="chat-composer"
              onSubmit={(event) => {
                event.preventDefault()
                send()
              }}
            >
              {replyTo ? <p className="chat-meta">Replying to {replyTo.body || 'a photo'}</p> : null}
              {editing ? <p className="chat-meta">Editing your message</p> : null}
              {cannotPost ? <p className="chat-meta">Only managers can post in this channel.</p> : null}
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
                hidden
                onChange={onPhoto}
              />
              <button type="button" className="chat-composer-photo" aria-label="Photo" disabled={cannotPost || busy} onClick={() => fileRef.current?.click()}>
                Photo
              </button>
              <textarea
                aria-label="Message"
                value={draft}
                maxLength={4000}
                rows={1}
                disabled={cannotPost}
                placeholder="Message"
                onChange={(event) => setDraft(clipChatBody(event.target.value))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    send()
                  }
                }}
              />
              <button type="submit" className="chat-send" disabled={busy || cannotPost || !draft.trim()}>
                Send
              </button>
            </form>
          ) : (
            <p className="chat-empty">Pick a chat to start.</p>
          )}
        </section>
      ) : null}

      {sheet ? (
        <div className="chat-sheet-backdrop" role="presentation" onClick={() => setSheet(null)}>
          <div className="chat-sheet" role="dialog" aria-label="Chat actions" onClick={(event) => event.stopPropagation()}>
            {sheet === 'actions' && activeMessage ? (
              <>
                <div className="chat-emoji-row">
                  {CHAT_EMOJIS.map((emoji) => (
                    <button key={emoji} type="button" onClick={() => toggleReaction(activeMessage, emoji)}>{emoji}</button>
                  ))}
                </div>
                <button type="button" onClick={() => { setReplyTo(activeMessage); setSheet(null) }}>Reply</button>
                {canEditChatMessage(activeMessage, memberId) ? (
                  <button type="button" onClick={() => { setEditing(activeMessage); setDraft(activeMessage.body || ''); setSheet(null) }}>Edit</button>
                ) : null}
                {canDeleteChatMessage(activeMessage, memberId, canManage) ? (
                  <button type="button" onClick={async () => {
                    await deleteChatMessage(activeMessage.id)
                    setSheet(null)
                    loadConversation(openId).catch(() => {})
                  }}>Delete</button>
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
            {sheet === 'direct' ? members.filter((member) => member.id !== memberId).map((member) => (
              <button key={member.id} type="button" onClick={() => startDirect(member.id)}>{member.name}</button>
            )) : null}
            {sheet === 'channel' ? (
              <>
                <label>
                  Channel name
                  <input value={channelName} onChange={(event) => setChannelName(event.target.value)} />
                </label>
                <label>
                  Icon
                  <input value={channelIcon} onChange={(event) => setChannelIcon(event.target.value)} placeholder="Optional" />
                </label>
                <label>
                  Who can post
                  <select value={channelPolicy} onChange={(event) => setChannelPolicy(event.target.value)}>
                    <option value="all">Everyone can post</option>
                    <option value="managers">Announcements only</option>
                  </select>
                </label>
                {members.filter((member) => member.id !== memberId).map((member) => (
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
                <button type="button" onClick={createChannel}>Create channel</button>
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
                <button type="button" onClick={saveMembers}>Save members</button>
              </>
            ) : null}
            {sheet === 'mute' ? (
              <>
                <button type="button" onClick={() => applyMute('1h')}>Mute for 1 hour</button>
                <button type="button" onClick={() => applyMute('8h')}>Mute for 8 hours</button>
                <button type="button" onClick={() => applyMute('tomorrow')}>Mute until tomorrow</button>
                <button type="button" onClick={() => applyMute('always')}>Mute always</button>
                <button type="button" onClick={() => applyMute('off')}>Unmute</button>
              </>
            ) : null}
            <button type="button" onClick={() => setSheet(null)}>Close</button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
