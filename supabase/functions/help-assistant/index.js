/**
 * Optional AI answers for the in-app help sheet.
 * Not deployed from this change. It stays unused while VITE_HELP_AI_ENABLED is off.
 *
 * To turn it on later:
 * - Set VITE_HELP_AI_ENABLED=true on the web app.
 * - Deploy this function.
 * - Set HELP_AI_URL to a chat-completions endpoint and HELP_AI_API_KEY in the function secrets.
 * The browser never sees the key. The client sends only the question and the
 * role-filtered articles. Answers must stay inside those articles.
 */

function env(name) {
  return globalThis.Deno?.env?.get?.(name) ?? ''
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export async function handleHelpAssistant(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }
  const url = env('HELP_AI_URL').trim()
  const key = env('HELP_AI_API_KEY').trim()
  if (!url || !key) {
    return json({ error: 'not_configured' }, 503)
  }
  let input
  try {
    input = await req.json()
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  const question = `${input?.question ?? ''}`.trim()
  const articles = Array.isArray(input?.articles) ? input.articles : []
  if (!question) return json({ error: 'bad_request' }, 400)
  const guide = articles.map((article) => {
    const steps = Array.isArray(article?.steps) ? article.steps.join('\n') : ''
    return `${article?.title ?? ''}\n${steps}`
  }).join('\n\n')
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      messages: [
        {
          role: 'system',
          content: 'Answer only from the ONE help articles below. If they do not contain the answer, say you do not know. Do not invent screens, prices, or steps.\n\n' + guide,
        },
        { role: 'user', content: question },
      ],
    }),
  })
  if (!response.ok) return json({ error: 'upstream' }, 502)
  const payload = await response.json()
  const answer = payload?.choices?.[0]?.message?.content
    || payload?.answer
    || ''
  if (!`${answer}`.trim()) return json({ error: 'empty' }, 502)
  return json({ answer: `${answer}`.trim() }, 200)
}

if (globalThis.Deno?.serve) {
  globalThis.Deno.serve(handleHelpAssistant)
}
