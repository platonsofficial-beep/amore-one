import { isManagerRole } from '../lib/permissions'
import { HELP_ARTICLES, helpText } from './helpKnowledge'

const MIN_SCORE = 0.42

export function helpArticlesForRole(role, articles = HELP_ARTICLES) {
  const manager = isManagerRole(role)
  return articles.filter((article) => article.audience !== 'managers' || manager)
}

export function foldHelpText(value) {
  return `${value ?? ''}`
    .toLocaleLowerCase('el')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ς/g, 'σ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function tokens(value) {
  return foldHelpText(value).split(/\s+/).filter((token) => token.length > 1)
}

function dice(left, right) {
  if (!left || !right) return 0
  if (left === right) return 1
  if (left.length < 2 || right.length < 2) return 0
  const pairs = (text) => {
    const counts = new Map()
    for (let index = 0; index < text.length - 1; index += 1) {
      const pair = text.slice(index, index + 2)
      counts.set(pair, (counts.get(pair) || 0) + 1)
    }
    return counts
  }
  const leftPairs = pairs(left)
  const rightPairs = pairs(right)
  let leftSize = 0
  let rightSize = 0
  let overlap = 0
  for (const count of leftPairs.values()) leftSize += count
  for (const [pair, count] of rightPairs) {
    rightSize += count
    overlap += Math.min(count, leftPairs.get(pair) || 0)
  }
  if (!leftSize || !rightSize) return 0
  return (2 * overlap) / (leftSize + rightSize)
}

function tokenScore(queryToken, hayTokens) {
  let best = 0
  for (const hay of hayTokens) {
    if (hay === queryToken) return 1
    if (hay.includes(queryToken) || queryToken.includes(hay)) {
      best = Math.max(best, 0.82)
      continue
    }
    best = Math.max(best, dice(queryToken, hay))
  }
  return best
}

function articleBlob(article, locale) {
  const questions = [...(article.questions?.en ?? []), ...(article.questions?.el ?? [])]
  const steps = [...(article.steps?.en ?? []), ...(article.steps?.el ?? [])]
  return [
    helpText(article.title, 'en'),
    helpText(article.title, 'el'),
    helpText(article.summary, locale),
    ...(article.keywords ?? []),
    ...questions,
    ...steps,
  ].join(' ')
}

export function scoreHelpArticle(article, query, locale = 'en') {
  const folded = foldHelpText(query)
  if (!folded) return 0
  const blob = foldHelpText(articleBlob(article, locale))
  if (blob.includes(folded)) return 1
  const queryTokens = tokens(folded)
  if (!queryTokens.length) return 0
  const hayTokens = tokens(blob)
  const average = queryTokens.reduce((sum, token) => sum + tokenScore(token, hayTokens), 0) / queryTokens.length
  const keywordTokens = tokens((article.keywords ?? []).join(' '))
  const keywordHits = queryTokens.filter((token) => keywordTokens.includes(token)).length
  const keywordScore = keywordHits ? 0.55 + (0.45 * keywordHits) / queryTokens.length : 0
  return Math.max(average, keywordScore)
}

export function suggestedHelpQuestions(role, locale = 'en', articles = HELP_ARTICLES) {
  const questions = []
  for (const article of helpArticlesForRole(role, articles)) {
    const list = article.questions?.[locale] ?? article.questions?.en ?? []
    if (list[0]) questions.push({ articleId: article.id, question: list[0] })
    if (questions.length >= 6) break
  }
  return questions
}

export function searchHelp(query, { role = 'staff', locale = 'en', articles = HELP_ARTICLES } = {}) {
  const visible = helpArticlesForRole(role, articles)
  const folded = foldHelpText(query)
  if (!folded) {
    return { matches: [], suggestions: suggestedHelpQuestions(role, locale, articles) }
  }
  const matches = visible
    .map((article) => ({ article, score: scoreHelpArticle(article, query, locale) }))
    .filter((item) => item.score >= MIN_SCORE)
    .sort((left, right) => right.score - left.score || left.article.id.localeCompare(right.article.id))
  return { matches, suggestions: suggestedHelpQuestions(role, locale, articles) }
}

export function supportMailto({ venueName = '', role = '', screen = '', question = '' } = {}) {
  const body = [
    `Venue: ${venueName || '—'}`,
    `Role: ${role || '—'}`,
    `Screen: ${screen || '—'}`,
    '',
    'Question:',
    question || '',
  ].join('\n')
  const params = new URLSearchParams({
    subject: 'Help with ONE',
    body,
  })
  return `mailto:info@onehospitality.app?${params.toString()}`
}
