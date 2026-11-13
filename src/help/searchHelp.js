import { isManagerRole } from '../lib/permissions'
import { HELP_ARTICLES, helpText } from './helpKnowledge'
import { t } from '../i18n/i18n'

const MIN_SCORE = 0.55

export const HELP_SECTIONS = [
  {
    id: 'reservations',
    label: { en: 'Reservations', el: 'Κρατήσεις' },
    articleIds: ['reservation-new', 'walk-in', 'floor-plan', 'guest-history', 'seatings'],
  },
  {
    id: 'schedule',
    label: { en: 'Schedule', el: 'Πρόγραμμα' },
    articleIds: ['schedule-assign', 'availability', 'clock'],
  },
  {
    id: 'stock',
    label: { en: 'Stock', el: 'Stock' },
    articleIds: ['stock-orders', 'stock-invoice'],
  },
  {
    id: 'tasks',
    label: { en: 'Tasks', el: 'Εργασίες' },
    articleIds: ['tasks'],
  },
  {
    id: 'chat',
    label: { en: 'Chat', el: 'Chat' },
    articleIds: ['chat'],
  },
  {
    id: 'settings',
    label: { en: 'Settings', el: 'Ρυθμίσεις' },
    articleIds: ['settings', 'insights', 'roles'],
  },
  {
    id: 'billing',
    managersOnly: true,
    label: { en: 'Billing', el: 'Χρέωση' },
    articleIds: ['billing-plans', 'billing-grace', 'billing-lock', 'billing-staff'],
  },
]

export function helpSectionsForRole(role, locale = 'en', articles = HELP_ARTICLES) {
  const visible = new Set(helpArticlesForRole(role, articles).map((article) => article.id))
  return HELP_SECTIONS.filter((section) => {
    if (section.managersOnly && !isManagerRole(role)) return false
    return section.articleIds.some((id) => visible.has(id))
  }).map((section) => ({
    id: section.id,
    label: helpText(section.label, locale),
    articles: articles.filter((article) => section.articleIds.includes(article.id) && visible.has(article.id)),
  }))
}

function queryIsBilling(query) {
  const folded = foldHelpText(query)
  if (!folded) return false
  if (/\b(billing|subscription|subscribe|price)\b/.test(folded)) return true
  if (/πλαν|χρεω|συνδρομ/.test(folded)) return true
  return /\bplans?\b/.test(folded) && !/\bfloor\b/.test(folded)
}

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

const STOP_WORDS = new Set(['how', 'do', 'does', 'did', 'i', 'a', 'an', 'the', 'to', 'for', 'of', 'on', 'in', 'at', 'up', 'my', 'me', 'can', 'what', 'where', 'who', 'why', 'is', 'are', 'with', 'and', 'or', 'it', 'be'])

function tokens(value) {
  return foldHelpText(value).split(/\s+/).filter((token) => token.length > 1)
}

function meaningfulTokens(value) {
  const all = tokens(value)
  const kept = all.filter((token) => !STOP_WORDS.has(token))
  return kept.length ? kept : all
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
    const shorter = Math.min(hay.length, queryToken.length)
    const longer = Math.max(hay.length, queryToken.length)
    if (shorter >= 4 && shorter / longer >= 0.6 && (hay.includes(queryToken) || queryToken.includes(hay))) {
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
  const questions = [...(article.questions?.en ?? []), ...(article.questions?.el ?? [])].join(' ')
  if (foldHelpText(questions).includes(folded)) return 1.2
  const blob = foldHelpText(articleBlob(article, locale))
  if (blob.includes(folded)) return 1
  const queryTokens = meaningfulTokens(folded)
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
  const suggestions = suggestedHelpQuestions(role, locale, articles)
  if (queryIsBilling(folded) && !isManagerRole(role)) {
    const staffArticle = visible.find((article) => article.id === 'billing-staff')
    return {
      matches: staffArticle ? [{ article: staffArticle, score: 1 }] : [],
      suggestions,
    }
  }
  const ranked = visible
    .map((article) => ({ article, score: scoreHelpArticle(article, query, locale) }))
    .filter((item) => item.score >= MIN_SCORE)
    .sort((left, right) => right.score - left.score || left.article.id.localeCompare(right.article.id))
  const best = ranked[0]?.score ?? 0
  let matches = ranked.filter((item) => item.score >= best - 0.12)
  if (queryIsBilling(folded)) {
    const billing = matches.filter((item) => item.article.id.startsWith('billing'))
    if (billing.length) {
      matches = billing.sort((left, right) => {
        if (left.article.id === 'billing-plans') return -1
        if (right.article.id === 'billing-plans') return 1
        return right.score - left.score || left.article.id.localeCompare(right.article.id)
      })
    }
  }
  return { matches, suggestions }
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
    subject: t("Help with ONE"),
    body,
  })
  return `mailto:info@onehospitality.app?${params.toString()}`
}
