import { afterEach, describe, expect, it } from 'vitest'
import { handleHelpAssistant } from './index.js'

const originalFetch = globalThis.fetch

afterEach(() => {
  delete globalThis.Deno
  globalThis.fetch = originalFetch
})

describe('help assistant edge function', () => {
  it('stays unavailable until an AI endpoint and key are set', async () => {
    globalThis.Deno = { env: { get: () => '' } }
    const response = await handleHelpAssistant(new Request('https://example.test/help', {
      method: 'POST',
      body: JSON.stringify({ question: 'How do I clock in?' }),
    }))
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({ error: 'not_configured' })
  })

  it('answers from the articles when the endpoint is configured', async () => {
    globalThis.Deno = {
      env: {
        get: (name) => (name === 'HELP_AI_URL' ? 'https://ai.test/chat' : 'secret'),
      },
    }
    globalThis.fetch = async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'Open Today and tap Clock in.' } }],
    }), { status: 200 })
    const response = await handleHelpAssistant(new Request('https://example.test/help', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        question: 'How do I clock in?',
        articles: [{ title: 'Clock in and out', steps: ['Open Today.', 'Tap Clock in.'] }],
      }),
    }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ answer: 'Open Today and tap Clock in.' })
  })
})
