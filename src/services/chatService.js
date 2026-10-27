import { supabase } from '../lib/supabaseClient'
import {
  CHAT_ATTACHMENT_BUCKET,
  CHAT_SIGNED_URL_SECONDS,
  buildChatAttachmentPath,
  chatErrorMessage,
} from '../lib/chat'
import { prepareChatImage } from '../lib/chatImage'

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

function fail(error) {
  const wrapped = new Error(chatErrorMessage(error))
  wrapped.cause = error
  throw wrapped
}

export async function fetchChatInbox(workspaceId) {
  const client = requireClient()
  const { data, error } = await client.rpc('chat_inbox', { p_workspace_id: workspaceId })
  if (error) fail(error)
  return data ?? []
}

export async function fetchChatMessages(conversationId, { before = '' } = {}) {
  const client = requireClient()
  let query = client
    .from('chat_messages')
    .select('id, conversation_id, workspace_id, author_member_id, body, attachment_path, attachment_meta, reply_to_id, created_at, edited_at, deleted_at, pinned_at, pinned_by')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (before) query = query.lt('created_at', before)
  const { data, error } = await query
  if (error) fail(error)
  return data ?? []
}

export async function fetchPinnedChatMessages(conversationId) {
  const client = requireClient()
  const { data, error } = await client
    .from('chat_messages')
    .select('id, conversation_id, body, attachment_path, created_at, pinned_at, author_member_id, deleted_at')
    .eq('conversation_id', conversationId)
    .not('pinned_at', 'is', null)
    .is('deleted_at', null)
    .order('pinned_at', { ascending: false })
  if (error) fail(error)
  return data ?? []
}

export async function fetchChatParticipants(conversationId) {
  const client = requireClient()
  const { data, error } = await client
    .from('chat_participants')
    .select('conversation_id, member_id, workspace_id, joined_at, left_at, last_read_at, muted_until')
    .eq('conversation_id', conversationId)
  if (error) fail(error)
  return data ?? []
}

export async function fetchChatReactions(messageIds) {
  const ids = (messageIds ?? []).filter(Boolean)
  if (ids.length === 0) return []
  const client = requireClient()
  const { data, error } = await client
    .from('chat_reactions')
    .select('message_id, member_id, workspace_id, emoji, created_at')
    .in('message_id', ids)
  if (error) fail(error)
  return data ?? []
}

export async function fetchChatMembers(workspaceId) {
  const client = requireClient()
  const { data, error } = await client
    .from('workspace_members')
    .select('id, display_name, email, role, employee_id')
    .eq('workspace_id', workspaceId)
  if (error) fail(error)
  const members = data ?? []
  const employeeIds = members.map((member) => member.employee_id).filter(Boolean)
  let colors = []
  if (employeeIds.length > 0) {
    const colorResult = await client
      .from('employees')
      .select('id, identity_color, full_name')
      .in('id', employeeIds)
    colors = colorResult.error ? [] : (colorResult.data ?? [])
  }
  const colorById = new Map(colors.map((employee) => [employee.id, employee]))
  return members.map((member) => {
    const employee = colorById.get(member.employee_id)
    return {
      id: member.id,
      name: `${member.display_name ?? ''}`.trim() || `${employee?.full_name ?? ''}`.trim() || member.email || 'Team member',
      email: member.email || '',
      role: member.role || '',
      employeeId: member.employee_id || '',
      identityColor: employee?.identity_color || '',
    }
  })
}

export async function sendChatMessage({
  conversationId,
  body = null,
  attachmentPath = null,
  attachmentMeta = null,
  replyToId = null,
}) {
  const client = requireClient()
  const { data, error } = await client.rpc('chat_send_message', {
    p_conversation_id: conversationId,
    p_body: body,
    p_attachment_path: attachmentPath,
    p_attachment_meta: attachmentMeta,
    p_reply_to_id: replyToId,
  })
  if (error) fail(error)
  return data
}

export async function editChatMessage(messageId, body) {
  const client = requireClient()
  const { error } = await client.rpc('chat_edit_message', {
    p_message_id: messageId,
    p_body: body,
  })
  if (error) fail(error)
}

export async function deleteChatMessage(messageId) {
  const client = requireClient()
  const { error } = await client.rpc('chat_delete_message', { p_message_id: messageId })
  if (error) fail(error)
}

export async function setChatPinned(messageId, pinned) {
  const client = requireClient()
  const { error } = await client.rpc('chat_set_pinned', {
    p_message_id: messageId,
    p_pinned: Boolean(pinned),
  })
  if (error) fail(error)
}

export async function createChatChannel({
  workspaceId,
  name,
  memberIds,
  icon = null,
  postPolicy = 'all',
}) {
  const client = requireClient()
  const { data, error } = await client.rpc('chat_create_channel', {
    p_workspace_id: workspaceId,
    p_name: name,
    p_member_ids: memberIds,
    p_icon: icon,
    p_post_policy: postPolicy,
  })
  if (error) fail(error)
  return data
}

export async function setChatChannelMembers(conversationId, memberIds) {
  const client = requireClient()
  const { error } = await client.rpc('chat_set_channel_members', {
    p_conversation_id: conversationId,
    p_member_ids: memberIds,
  })
  if (error) fail(error)
}

export async function getOrCreateDirectChat(workspaceId, otherMemberId) {
  const client = requireClient()
  const { data, error } = await client.rpc('chat_get_or_create_direct', {
    p_workspace_id: workspaceId,
    p_other_member_id: otherMemberId,
  })
  if (error) fail(error)
  return data
}

export async function markChatRead(conversationId) {
  const client = requireClient()
  const { error } = await client.rpc('chat_mark_read', { p_conversation_id: conversationId })
  if (error) fail(error)
}

export async function setChatMute(conversationId, mutedUntil) {
  const client = requireClient()
  const { error } = await client.rpc('chat_set_mute', {
    p_conversation_id: conversationId,
    p_muted_until: mutedUntil,
  })
  if (error) fail(error)
}

export async function addChatReaction({ messageId, memberId, workspaceId, emoji }) {
  const client = requireClient()
  const { error } = await client.from('chat_reactions').insert({
    message_id: messageId,
    member_id: memberId,
    workspace_id: workspaceId,
    emoji,
  })
  if (error) fail(error)
}

export async function removeChatReaction({ messageId, memberId, emoji }) {
  const client = requireClient()
  const { error } = await client
    .from('chat_reactions')
    .delete()
    .eq('message_id', messageId)
    .eq('member_id', memberId)
    .eq('emoji', emoji)
  if (error) fail(error)
}

const signedUrlCache = new Map()

export async function chatAttachmentUrl(path) {
  const key = `${path ?? ''}`.trim()
  if (!key) return ''
  const cached = signedUrlCache.get(key)
  if (cached && cached.expiresAt > Date.now() + 60000) return cached.url
  const client = requireClient()
  const { data, error } = await client.storage.from(CHAT_ATTACHMENT_BUCKET).createSignedUrl(key, CHAT_SIGNED_URL_SECONDS)
  if (error) fail(error)
  const url = data?.signedUrl || ''
  signedUrlCache.set(key, { url, expiresAt: Date.now() + (CHAT_SIGNED_URL_SECONDS * 1000) })
  return url
}

export async function uploadChatPhoto({ workspaceId, conversationId, file }) {
  const prepared = await prepareChatImage(file)
  const path = buildChatAttachmentPath(workspaceId, conversationId)
  const client = requireClient()
  const { error } = await client.storage.from(CHAT_ATTACHMENT_BUCKET).upload(path, prepared.blob, {
    contentType: 'image/jpeg',
  })
  if (error) fail(error)
  return {
    path,
    meta: {
      width: prepared.width,
      height: prepared.height,
      mime: 'image/jpeg',
      size: prepared.size,
    },
  }
}

export function subscribeToChatConversation(conversationId, { onMessage, onReaction, onParticipant } = {}) {
  if (!supabase || !conversationId) return () => {}
  const channel = supabase.channel(`chat:${conversationId}`)
  channel.on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'chat_messages',
    filter: `conversation_id=eq.${conversationId}`,
  }, (payload) => onMessage?.(payload.new, 'INSERT'))
  channel.on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'chat_messages',
    filter: `conversation_id=eq.${conversationId}`,
  }, (payload) => onMessage?.(payload.new, 'UPDATE'))
  channel.on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'chat_reactions',
  }, (payload) => onReaction?.(payload))
  channel.on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'chat_participants',
    filter: `conversation_id=eq.${conversationId}`,
  }, (payload) => onParticipant?.(payload.new))
  channel.subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}

export function subscribeToChatInbox(memberId, workspaceId, onChange) {
  if (!supabase || !memberId || !workspaceId) return () => {}
  const channel = supabase
    .channel(`chat-inbox:${memberId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'chat_messages',
      filter: `workspace_id=eq.${workspaceId}`,
    }, () => onChange?.())
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}
