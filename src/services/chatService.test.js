import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rpcMock, fromMock, uploadMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  fromMock: vi.fn(),
  uploadMock: vi.fn(),
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: (...args) => rpcMock(...args),
    from: (...args) => fromMock(...args),
    storage: {
      from: () => ({
        upload: (...args) => uploadMock(...args),
        createSignedUrl: vi.fn(async () => ({ data: { signedUrl: 'https://example.test/photo.jpg' }, error: null })),
      }),
    },
    channel: () => ({
      on: () => ({ on: () => ({ on: () => ({ on: () => ({ subscribe: vi.fn() }) }) }) }),
      subscribe: vi.fn(),
    }),
    removeChannel: vi.fn(),
  },
}))

vi.mock('../lib/chatImage', () => ({
  prepareChatImage: vi.fn(async () => ({
    blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
    width: 100,
    height: 80,
    size: 4,
  })),
}))

import {
  addChatReaction,
  createChatChannel,
  fetchChatMessages,
  fetchPinnedChatMessages,
  sendChatMessage,
  uploadChatPhoto,
} from './chatService'

function query(result = { data: [], error: null }) {
  const calls = []
  const builder = {
    select: vi.fn((value) => {
      calls.push(['select', value])
      return builder
    }),
    eq: vi.fn((key, value) => {
      calls.push(['eq', key, value])
      return builder
    }),
    order: vi.fn((key, options) => {
      calls.push(['order', key, options])
      return builder
    }),
    limit: vi.fn((value) => {
      calls.push(['limit', value])
      return builder
    }),
    lt: vi.fn((key, value) => {
      calls.push(['lt', key, value])
      return builder
    }),
    not: vi.fn((column, operator, value) => {
      calls.push(['not', column, operator, value])
      return builder
    }),
    is: vi.fn((key, value) => {
      calls.push(['is', key, value])
      return builder
    }),
    insert: vi.fn((row) => {
      calls.push(['insert', row])
      return Promise.resolve({ error: null })
    }),
    then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
    calls,
  }
  return builder
}

describe('chat service contract', () => {
  beforeEach(() => {
    rpcMock.mockReset()
    fromMock.mockReset()
    uploadMock.mockReset()
    rpcMock.mockResolvedValue({ data: 'message-1', error: null })
    uploadMock.mockResolvedValue({ error: null })
  })

  it('sends, creates channels and stores reactions with the live argument names', async () => {
    await sendChatMessage({
      conversationId: 'conv-1',
      body: 'Hello',
      attachmentPath: null,
      attachmentMeta: null,
      replyToId: 'msg-0',
    })
    await createChatChannel({
      workspaceId: 'ws-1',
      name: 'Bar',
      memberIds: ['m2'],
      icon: '🍸',
      postPolicy: 'managers',
    })

    expect(rpcMock).toHaveBeenNthCalledWith(1, 'chat_send_message', {
      p_conversation_id: 'conv-1',
      p_body: 'Hello',
      p_attachment_path: null,
      p_attachment_meta: null,
      p_reply_to_id: 'msg-0',
    })
    expect(rpcMock).toHaveBeenNthCalledWith(2, 'chat_create_channel', {
      p_workspace_id: 'ws-1',
      p_name: 'Bar',
      p_member_ids: ['m2'],
      p_icon: '🍸',
      p_post_policy: 'managers',
    })

    const reactions = query()
    fromMock.mockReturnValueOnce(reactions)
    await addChatReaction({ messageId: 'msg-1', memberId: 'me', workspaceId: 'ws-1', emoji: '👍' })
    expect(reactions.calls[0]).toEqual(['insert', {
      message_id: 'msg-1',
      member_id: 'me',
      workspace_id: 'ws-1',
      emoji: '👍',
    }])
  })

  it('pages messages newest-first and loads pins that are not deleted', async () => {
    const messages = query({ data: [{ id: 'm1', created_at: '2026-10-27T10:00:00Z' }], error: null })
    fromMock.mockReturnValueOnce(messages)
    await fetchChatMessages('conv-1', { before: '2026-10-27T12:00:00Z' })
    expect(messages.calls).toContainEqual(['eq', 'conversation_id', 'conv-1'])
    expect(messages.calls).toContainEqual(['order', 'created_at', { ascending: false }])
    expect(messages.calls).toContainEqual(['limit', 50])
    expect(messages.calls).toContainEqual(['lt', 'created_at', '2026-10-27T12:00:00Z'])

    const pins = query()
    fromMock.mockReturnValueOnce(pins)
    await fetchPinnedChatMessages('conv-1')
    expect(pins.calls).toContainEqual(['not', 'pinned_at', 'is', null])
    expect(pins.calls).toContainEqual(['is', 'deleted_at', null])
  })

  it('uploads a jpeg under the workspace conversation path', async () => {
    const uploaded = await uploadChatPhoto({
      workspaceId: 'ws-1',
      conversationId: 'conv-1',
      file: new Blob(['heic'], { type: 'image/heic' }),
    })
    expect(uploaded.path).toMatch(/^ws-1\/conv-1\/.+\.jpg$/)
    expect(uploaded.meta).toMatchObject({ mime: 'image/jpeg', width: 100, height: 80 })
    expect(uploadMock).toHaveBeenCalledWith(
      uploaded.path,
      expect.any(Blob),
      { contentType: 'image/jpeg' },
    )
  })
})
